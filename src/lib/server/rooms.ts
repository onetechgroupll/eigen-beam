import { nanoid } from 'nanoid';
import type { Slide } from '$lib/decks';
import { toPublicSlides } from '$lib/decks';
import { getActivityStore, persistBestEffort } from '$lib/server/activity-store';

type ViewerSubscriber = (current: number, ended: boolean) => void;
export type PresenterEvent =
	| { type: 'stats'; stats: RoomStats }
	| { type: 'reaction'; reaction: string; slide: number; ts: number }
	| { type: 'question'; text: string; slide: number; ts: number }
	| { type: 'bookmark'; slide: number; ts: number }
	| { type: 'ended'; slide: number; ts: number };
type PresenterSubscriber = (event: PresenterEvent) => void;

export type RoomStats = {
	joins: number;
	currentViewers: number;
	peakConcurrent: number;
	reopens: number;
	reactions: number;
	questions: number;
	bookmarks: number;
	startedAt: number;
};

export type ReplayEvent =
	| { type: 'start'; slide: number; ts: number }
	| { type: 'slide'; slide: number; ts: number }
	| { type: 'reaction'; reaction: string; slide: number; ts: number }
	| { type: 'question'; text: string; slide: number; ts: number }
	| { type: 'bookmark'; slide: number; ts: number }
	| { type: 'reopen'; slide: number; ts: number }
	| { type: 'end'; slide: number; ts: number };

export type ReplaySnapshot = { id: string; slides: Slide[]; events: ReplayEvent[]; stats: RoomStats; ended: boolean; protected?: boolean };

export type Room = {
	id: string;
	deckId?: string;
	slides: Slide[];
	current: number;
	presenterToken: string;
	ended: boolean;
	pin?: string;
	subscribers: Set<ViewerSubscriber>;
	presenterSubscribers: Set<PresenterSubscriber>;
	stats: RoomStats;
	events: ReplayEvent[];
	createdAt: number;
	lastActivity: number;
};

type PresenterClaim = { roomId: string; presenterToken: string; expiresAt: number };

const rooms = new Map<string, Room>();
const presenterClaims = new Map<string, PresenterClaim>();
const MAX_ROOMS = 500;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const PRESENTER_CLAIM_TTL_MS = 2 * 60 * 1000;
export const MAX_SUBSCRIBERS_PER_ROOM = 300;
export const MAX_PRESENTER_SUBSCRIBERS_PER_ROOM = 10;
const ALLOWED_REACTIONS = new Set(['👍', '🔥', '💡', '❤️', '👏', '❓']);

function evictOldestIfFull(): void {
	if (rooms.size < MAX_ROOMS) return;
	let oldestId: string | null = null;
	let oldest = Infinity;
	for (const [id, r] of rooms) {
		if (r.lastActivity < oldest) { oldest = r.lastActivity; oldestId = id; }
	}
	if (oldestId) closeRoom(rooms.get(oldestId)!, true);
}

function sweep(): void {
	const now = Date.now();
	for (const [, r] of [...rooms]) if (now - r.lastActivity > ROOM_TTL_MS) closeRoom(r, true);
	for (const [token, claim] of [...presenterClaims]) if (claim.expiresAt <= now || !rooms.has(claim.roomId)) presenterClaims.delete(token);
}

const g = globalThis as unknown as { __ebSweep?: ReturnType<typeof setInterval> };
if (!g.__ebSweep) {
	g.__ebSweep = setInterval(sweep, 5 * 60 * 1000);
	g.__ebSweep.unref?.();
}

export function createRoom(slides: Slide[], opts: { pin?: string; deckId?: string } = {}): { id: string; presenterToken: string; claimToken: string } {
	if (slides.length === 0) throw new Error('Deck braucht mindestens eine Slide');
	evictOldestIfFull();
	const id = nanoid(8);
	const presenterToken = nanoid(16);
	const claimToken = nanoid(24);
	const now = Date.now();
	const room: Room = {
		id,
		deckId: opts.deckId,
		slides: [...slides],
		current: 0,
		presenterToken,
		ended: false,
		pin: opts.pin?.trim() || undefined,
		subscribers: new Set(),
		presenterSubscribers: new Set(),
		stats: { joins: 0, currentViewers: 0, peakConcurrent: 0, reopens: 0, reactions: 0, questions: 0, bookmarks: 0, startedAt: now },
		events: [],
		createdAt: now,
		lastActivity: now
	};
	rooms.set(id, room);
	presenterClaims.set(claimToken, { roomId: id, presenterToken, expiresAt: now + PRESENTER_CLAIM_TTL_MS });
	pushRoomEvent(room, { type: 'start', slide: 0, ts: now });
	return { id, presenterToken, claimToken };
}

export function claimPresenterToken(id: string, claimToken: string): string | null {
	const claim = presenterClaims.get(claimToken);
	const room = rooms.get(id);
	if (!claim || !room || claim.roomId !== id || claim.presenterToken !== room.presenterToken || claim.expiresAt <= Date.now()) {
		presenterClaims.delete(claimToken);
		return null;
	}
	presenterClaims.delete(claimToken);
	room.lastActivity = Date.now();
	return room.presenterToken;
}

export function getRoom(id: string): Room | undefined { return rooms.get(id); }
export function roomRequiresPin(id: string): boolean { return Boolean(rooms.get(id)?.pin); }
export function verifyRoomPin(id: string, pin: string): boolean {
	const room = rooms.get(id);
	return Boolean(room?.pin && pin === room.pin);
}

export function setSlide(id: string, token: string, n: number): { ok: boolean; status?: number; current?: number } {
	const room = rooms.get(id);
	if (!room || room.ended) return { ok: false, status: 410 };
	if (token !== room.presenterToken) return { ok: false, status: 403 };
	room.lastActivity = Date.now();
	const clamped = Math.max(0, Math.min(Math.max(0, room.slides.length - 1), Math.floor(n || 0)));
	room.current = clamped;
	pushRoomEvent(room, { type: 'slide', slide: clamped, ts: room.lastActivity });
	for (const fn of [...room.subscribers]) fn(clamped, false);
	broadcastPresenter(room, { type: 'stats', stats: { ...room.stats } });
	return { ok: true, current: clamped };
}

export function endRoom(id: string, token: string): { ok: boolean; status?: number } {
	const room = rooms.get(id);
	if (!room) return { ok: false, status: 404 };
	if (token !== room.presenterToken) return { ok: false, status: 403 };
	closeRoom(room);
	return { ok: true };
}

export function subscribe(id: string, fn: ViewerSubscriber): (() => void) | null {
	const room = rooms.get(id);
	if (!room || room.ended) return null;
	if (room.subscribers.size >= MAX_SUBSCRIBERS_PER_ROOM) return null;
	room.subscribers.add(fn);
	room.lastActivity = Date.now();
	room.stats.joins += 1;
	room.stats.currentViewers += 1;
	room.stats.peakConcurrent = Math.max(room.stats.peakConcurrent, room.stats.currentViewers);
	persistRoom(room);
	broadcastPresenter(room, { type: 'stats', stats: { ...room.stats } });
	return () => {
		if (room.subscribers.delete(fn)) {
			room.stats.currentViewers = Math.max(0, room.stats.currentViewers - 1);
			persistRoom(room);
			broadcastPresenter(room, { type: 'stats', stats: { ...room.stats } });
		}
	};
}

export function subscribePresenter(id: string, token: string, fn: PresenterSubscriber): (() => void) | null {
	const room = rooms.get(id);
	if (!room || room.ended) return null;
	if (token !== room.presenterToken) return null;
	if (room.presenterSubscribers.size >= MAX_PRESENTER_SUBSCRIBERS_PER_ROOM) return null;
	room.presenterSubscribers.add(fn);
	fn({ type: 'stats', stats: { ...room.stats } });
	return () => { room.presenterSubscribers.delete(fn); };
}

export function recordViewerEvent(id: string, input: { type: string; reaction?: string; text?: string; slide?: number }): { ok: boolean; status?: number } {
	const room = rooms.get(id);
	if (!room || room.ended) return { ok: false, status: 410 };
	room.lastActivity = Date.now();
	const slide = Math.max(0, Math.min(room.slides.length - 1, Math.floor(input.slide ?? room.current)));
	const ts = Date.now();
	if (input.type === 'reaction') {
		const reaction = ALLOWED_REACTIONS.has(input.reaction ?? '') ? input.reaction! : '👍';
		room.stats.reactions += 1;
		pushRoomEvent(room, { type: 'reaction', reaction, slide, ts });
		broadcastPresenter(room, { type: 'reaction', reaction, slide, ts });
	} else if (input.type === 'question') {
		const text = (input.text ?? '').trim().slice(0, 280);
		if (!text) return { ok: false, status: 400 };
		room.stats.questions += 1;
		pushRoomEvent(room, { type: 'question', text, slide, ts });
		broadcastPresenter(room, { type: 'question', text, slide, ts });
	} else if (input.type === 'bookmark') {
		room.stats.bookmarks += 1;
		pushRoomEvent(room, { type: 'bookmark', slide, ts });
		broadcastPresenter(room, { type: 'bookmark', slide, ts });
	} else if (input.type === 'reopen') {
		room.stats.reopens += 1;
		pushRoomEvent(room, { type: 'reopen', slide, ts });
		broadcastPresenter(room, { type: 'stats', stats: { ...room.stats } });
		return { ok: true };
	} else {
		return { ok: false, status: 400 };
	}
	broadcastPresenter(room, { type: 'stats', stats: { ...room.stats } });
	return { ok: true };
}

export function getRoomStats(id: string, token?: string): RoomStats | null {
	const room = rooms.get(id);
	if (!room || (token && token !== room.presenterToken)) return null;
	return { ...room.stats };
}

export function getReplay(id: string): ReplaySnapshot | null {
	const room = rooms.get(id);
	if (!room) return null;
	return { id: room.id, slides: toPublicSlides(room.slides), events: publicReplayEvents(room.events), stats: { ...room.stats }, ended: room.ended, protected: Boolean(room.pin) };
}

export async function getReplayPersistent(id: string): Promise<ReplaySnapshot | null> {
	const inMemory = getReplay(id);
	if (inMemory) return inMemory;
	return await getActivityStore()?.getReplay(id) ?? null;
}

function pushRoomEvent(room: Room, event: ReplayEvent): void {
	room.events.push(event);
	persistRoom(room);
	const store = getActivityStore();
	if (store) persistBestEffort(store.recordReplayEvent({ roomId: room.id, deckId: room.deckId, event }));
}

function persistRoom(room: Room): void {
	const store = getActivityStore();
	if (!store) return;
	persistBestEffort(store.upsertReplaySession({ roomId: room.id, deckId: room.deckId, slides: toPublicSlides(room.slides), stats: room.stats, ended: room.ended, protected: Boolean(room.pin), ts: room.lastActivity }));
}

function closeRoom(room: Room, remove = false): void {
	if (room.ended) return;
	room.ended = true;
	room.lastActivity = Date.now();
	pushRoomEvent(room, { type: 'end', slide: room.current, ts: room.lastActivity });
	for (const fn of [...room.subscribers]) fn(room.current, true);
	broadcastPresenter(room, { type: 'ended', slide: room.current, ts: room.lastActivity });
	room.subscribers.clear();
	room.presenterSubscribers.clear();
	if (remove) rooms.delete(room.id);
}

function publicReplayEvents(events: ReplayEvent[]): ReplayEvent[] {
	return events.map((event) => event.type === 'question' ? { ...event, text: '' } : event);
}

function broadcastPresenter(room: Room, event: PresenterEvent): void {
	for (const fn of [...room.presenterSubscribers]) fn(event);
}
