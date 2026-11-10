import type { Slide } from '$lib/decks';
import type { ReplayEvent, RoomStats } from '$lib/server/rooms';
import { env } from 'node:process';
import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import { isProductionRuntime } from '$lib/server/auth';

export type ReplaySnapshot = { id: string; slides: Slide[]; events: ReplayEvent[]; stats: RoomStats; ended: boolean; protected?: boolean };

export type ActivityStore = {
	upsertReplaySession(input: { roomId: string; deckId?: string; slides: Slide[]; stats: RoomStats; ended: boolean; protected?: boolean; pinVerifier?: string; ts: number }): Promise<void>;
	recordReplayEvent(input: { roomId: string; deckId?: string; event: ReplayEvent }): Promise<void>;
	getReplay(roomId: string): Promise<ReplaySnapshot | null>;
	verifyReplayPin(roomId: string, pinVerifier: string): Promise<boolean>;
	recordFollow(input: { email: string; deckId?: string; roomId?: string; createdAt: number }): Promise<void>;
	removeFollowsByEmail(email: string): Promise<number>;
};

export type SqlClient = { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };

const EMPTY_STATS: RoomStats = { joins: 0, currentViewers: 0, peakConcurrent: 0, reopens: 0, reactions: 0, questions: 0, bookmarks: 0, startedAt: 0 };

export class PostgresActivityStore implements ActivityStore {
	constructor(private db: SqlClient, private makeId: () => string = () => nanoid(12)) {}

	async upsertReplaySession(input: { roomId: string; deckId?: string; slides: Slide[]; stats: RoomStats; ended: boolean; protected?: boolean; pinVerifier?: string; ts: number }): Promise<void> {
		await this.db.query(
			`INSERT INTO replay_sessions (room_id, deck_id, slides, stats, ended, protected, pin_verifier, created_at, updated_at)
			 VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $8)
			 ON CONFLICT (room_id) DO UPDATE
			 SET deck_id = COALESCE(EXCLUDED.deck_id, replay_sessions.deck_id),
			     slides = EXCLUDED.slides,
			     stats = EXCLUDED.stats,
			     ended = EXCLUDED.ended,
			     protected = EXCLUDED.protected,
			     pin_verifier = COALESCE(EXCLUDED.pin_verifier, replay_sessions.pin_verifier),
				     updated_at = EXCLUDED.updated_at
				 WHERE EXCLUDED.updated_at >= replay_sessions.updated_at
				   AND (NOT replay_sessions.ended OR EXCLUDED.ended)`,
			[input.roomId, input.deckId ?? null, JSON.stringify(input.slides), JSON.stringify(input.stats), input.ended, Boolean(input.protected), input.pinVerifier ?? null, input.ts]
		);
	}

	async recordReplayEvent(input: { roomId: string; deckId?: string; event: ReplayEvent }): Promise<void> {
		await this.db.query(
			`INSERT INTO events (id, room_id, deck_id, type, slide, payload, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
			[this.makeId(), input.roomId, input.deckId ?? null, input.event.type, input.event.slide, JSON.stringify(eventPayload(input.event)), input.event.ts]
		);
	}

	async getReplay(roomId: string): Promise<ReplaySnapshot | null> {
		const session = await this.db.query(
			`SELECT room_id, slides, stats, ended, protected, pin_verifier FROM replay_sessions WHERE room_id = $1`,
			[roomId]
		);
		const row = session.rows[0] as { room_id?: unknown; slides?: unknown; stats?: unknown; ended?: unknown; protected?: unknown; pin_verifier?: unknown } | undefined;
		if (!row) return null;
		if (Boolean(row.protected) && (typeof row.pin_verifier !== 'string' || row.pin_verifier.length === 0)) return null;
		const events = await this.db.query(
			`SELECT type, slide, payload, created_at FROM events WHERE room_id = $1 ORDER BY created_at ASC`,
			[roomId]
		);
		return {
			id: String(row.room_id),
			slides: parseJson(row.slides, []),
			stats: parseJson(row.stats, EMPTY_STATS),
			ended: Boolean(row.ended),
			protected: Boolean(row.protected),
			events: events.rows.map(rowToReplayEvent).filter((e): e is ReplayEvent => Boolean(e))
		};
	}

	async verifyReplayPin(roomId: string, pinVerifier: string): Promise<boolean> {
		const result = await this.db.query(
			`SELECT 1 FROM replay_sessions WHERE room_id = $1 AND protected = TRUE AND pin_verifier = $2`,
			[roomId, pinVerifier]
		);
		return result.rows.length > 0;
	}

	async recordFollow(input: { email: string; deckId?: string; roomId?: string; createdAt: number }): Promise<void> {
		await this.db.query(
			`INSERT INTO follows (email, deck_id, room_id, created_at)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (email, deck_id, room_id) DO UPDATE SET created_at = EXCLUDED.created_at`,
			[input.email, input.deckId ?? '', input.roomId ?? '', input.createdAt]
		);
	}

	async removeFollowsByEmail(email: string): Promise<number> {
		const result = await this.db.query(`DELETE FROM follows WHERE email = $1 RETURNING email`, [email]);
		return result.rows.length;
	}
}

let _store: ActivityStore | null | false = null;
export function getActivityStore(): ActivityStore | null {
	if (_store !== null) return _store || null;
	const mode = (env.EB_ACTIVITY_STORE ?? 'off').toLowerCase();
	if (mode !== 'postgres') {
		if (isProductionRuntime()) throw new Error('Production benötigt EB_ACTIVITY_STORE=postgres.');
		_store = false;
		return null;
	}
	if (!env.DATABASE_URL) throw new Error('EB_ACTIVITY_STORE=postgres benötigt DATABASE_URL.');
	_store = new PostgresActivityStore(new Pool({ connectionString: env.DATABASE_URL }));
	return _store;
}

export function persistBestEffort(task: Promise<unknown>): void {
	task.catch((error) => console.warn('[activity-store] best-effort persist failed', error));
}

function eventPayload(event: ReplayEvent): Record<string, unknown> {
	if (event.type === 'question') return {};
	return { ...event, type: undefined, slide: undefined, ts: undefined };
}

function rowToReplayEvent(row: unknown): ReplayEvent | null {
	const r = row as { type?: unknown; slide?: unknown; payload?: unknown; created_at?: unknown };
	const base = { type: String(r.type), slide: Number(r.slide ?? 0), ts: Number(r.created_at) };
	const payload = parseJson(r.payload, {}) as Record<string, unknown>;
	if (base.type === 'reaction') return { ...base, type: 'reaction', reaction: String(payload.reaction ?? '👍') };
	if (base.type === 'question') return { ...base, type: 'question', text: String(payload.text ?? '') };
	if (base.type === 'bookmark') return { ...base, type: 'bookmark' };
	if (base.type === 'reopen') return { ...base, type: 'reopen' };
	if (base.type === 'slide') return { ...base, type: 'slide' };
	if (base.type === 'start') return { ...base, type: 'start' };
	if (base.type === 'end') return { ...base, type: 'end' };
	return null;
}

function parseJson<T>(value: unknown, fallback: T): T {
	if (typeof value === 'string') {
		try { return JSON.parse(value) as T; } catch { return fallback; }
	}
	return (value ?? fallback) as T;
}
