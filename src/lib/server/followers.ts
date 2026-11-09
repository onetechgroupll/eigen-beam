import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { env } from 'node:process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getActivityStore } from '$lib/server/activity-store';

export type FollowRecord = { email: string; deckId?: string; roomId?: string; createdAt: number };
export type FollowResult = { record: FollowRecord; isNew: boolean };
const MAX_FOLLOWS = 5000;
const TARGET = /^[a-zA-Z0-9_-]{1,64}$/;

export function normalizeFollowEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function isValidFollowEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeFollowEmail(email));
}

export function sanitizeFollowTarget(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed && TARGET.test(trimmed) ? trimmed : undefined;
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function createUnsubToken(email: string, secret: string): string {
	const body = Buffer.from(normalizeFollowEmail(email), 'utf8').toString('base64url');
	return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function verifyUnsubToken(token: string, secret: string): string | null {
	const [body, sig, extra] = token.split('.');
	if (!body || !sig || extra) return null;
	const expected = createHmac('sha256', secret).update(body).digest('base64url');
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	const email = normalizeFollowEmail(Buffer.from(body, 'base64url').toString('utf8'));
	return isValidFollowEmail(email) ? email : null;
}

export async function recordFollow(input: { email: string; deckId?: string; roomId?: string }, path = env.EB_FOLLOWS_FILE ?? '.data/follows.json'): Promise<FollowRecord> {
	return (await recordFollowDetailed(input, path)).record;
}

export async function recordFollowDetailed(input: { email: string; deckId?: string; roomId?: string }, path = env.EB_FOLLOWS_FILE ?? '.data/follows.json'): Promise<FollowResult> {
	const email = normalizeFollowEmail(input.email);
	if (!isValidFollowEmail(email)) throw Object.assign(new Error('Bitte eine gültige Email eingeben.'), { status: 400 });
	const deckId = sanitizeFollowTarget(input.deckId);
	const roomId = sanitizeFollowTarget(input.roomId);
	const record: FollowRecord = { email, deckId, roomId, createdAt: Date.now() };
	const store = getActivityStore();
	if (store) await store.recordFollow(record);
	const all = await readAll(path);
	const isNew = !all.some((r) => sameTarget(r, record));
	const deduped = all.filter((r) => !sameTarget(r, record));
	deduped.push(record);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(deduped.slice(-MAX_FOLLOWS), null, 2), 'utf8');
	return { record, isNew };
}

export async function removeFollowEmail(email: string, path = env.EB_FOLLOWS_FILE ?? '.data/follows.json'): Promise<number> {
	const target = normalizeFollowEmail(email);
	if (!isValidFollowEmail(target)) return 0;
	const store = getActivityStore();
	if (store) await store.removeFollowsByEmail(target);
	const all = await readAll(path);
	const kept = all.filter((r) => r.email !== target);
	if (kept.length === all.length) return 0;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(kept.slice(-MAX_FOLLOWS), null, 2), 'utf8');
	return all.length - kept.length;
}

async function readAll(path: string): Promise<FollowRecord[]> {
	try {
		const raw = await readFile(path, 'utf8');
		const parsed = JSON.parse(raw) as FollowRecord[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function sameTarget(a: FollowRecord, b: FollowRecord): boolean {
	return a.email === b.email && a.deckId === b.deckId && a.roomId === b.roomId;
}
