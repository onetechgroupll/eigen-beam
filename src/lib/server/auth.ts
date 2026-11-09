import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from 'node:process';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const PIN_UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;
const USER_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const DEV_SECRET = 'dev-insecure-magic-link-secret';

export function isProductionRuntime(source: Record<string, string | undefined> = env): boolean {
	return source.NODE_ENV === 'production' || source.RAILWAY_ENVIRONMENT === 'production' || source.RAILWAY_ENVIRONMENT_NAME === 'production';
}

export function authSigningSecret(): string {
	if (env.EB_MAGIC_LINK_SECRET) return env.EB_MAGIC_LINK_SECRET;
	if (isProductionRuntime()) throw new Error('EB_MAGIC_LINK_SECRET fehlt in Production.');
	return DEV_SECRET;
}

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function userIdForEmail(email: string): string {
	const digest = createHash('sha256').update(normalizeEmail(email)).digest('base64url').slice(0, 22);
	return `user_${digest}`;
}

export async function createMagicToken(email: string, secret: string, now = Date.now(), nonce = randomBytes(12).toString('base64url')): Promise<string> {
	const normalized = normalizeEmail(email);
	if (!isValidEmail(normalized)) throw new Error('Ungültige Email-Adresse.');
	const payload = { email: normalized, exp: now + TOKEN_TTL_MS, nonce };
	const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	return `${body}.${sign(body, secret)}`;
}

export async function verifyMagicToken(token: string, secret: string, now = Date.now()): Promise<{ email: string; userId: string } | null> {
	const [body, sig, extra] = token.split('.');
	if (!body || !sig || extra) return null;
	const expected = sign(body, secret);
	if (!safeEqual(sig, expected)) return null;
	try {
		const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { email?: unknown; exp?: unknown };
		if (typeof payload.email !== 'string' || typeof payload.exp !== 'number') return null;
		if (payload.exp < now) return null;
		const email = normalizeEmail(payload.email);
		if (!isValidEmail(email)) return null;
		return { email, userId: userIdForEmail(email) };
	} catch {
		return null;
	}
}

export function createUserSessionToken(email: string, secret: string, nonce = randomBytes(12).toString('base64url'), now = Date.now()): string {
	const normalized = normalizeEmail(email);
	if (!isValidEmail(normalized)) throw new Error('Ungültige Email-Adresse.');
	const payload = { email: normalized, userId: userIdForEmail(normalized), iat: now, exp: now + USER_SESSION_TTL_MS, nonce };
	const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	return `${body}.${sign(body, secret)}`;
}

export function verifyUserSessionToken(token: string | undefined, secret: string, now = Date.now()): { email: string; userId: string } | null {
	if (!token) return null;
	const [body, sig, extra] = token.split('.');
	if (!body || !sig || extra) return null;
	const expected = sign(body, secret);
	if (!safeEqual(sig, expected)) return null;
	try {
		const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { email?: unknown; userId?: unknown; exp?: unknown };
		if (typeof payload.email !== 'string' || typeof payload.userId !== 'string') return null;
		if (typeof payload.exp !== 'number' || payload.exp < now) return null;
		const email = normalizeEmail(payload.email);
		if (!isValidEmail(email)) return null;
		if (payload.userId !== userIdForEmail(email)) return null;
		return { email, userId: payload.userId };
	} catch {
		return null;
	}
}

export function createPinUnlockToken(roomId: string, secret: string, now = Date.now(), nonce = randomBytes(12).toString('base64url')): string {
	const payload = { roomId, exp: now + PIN_UNLOCK_TTL_MS, nonce };
	const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	return `${body}.${sign(body, secret)}`;
}

export function verifyPinUnlockToken(token: string | undefined, roomId: string, secret: string, now = Date.now()): boolean {
	if (!token) return false;
	const [body, sig, extra] = token.split('.');
	if (!body || !sig || extra) return false;
	const expected = sign(body, secret);
	if (!safeEqual(sig, expected)) return false;
	try {
		const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { roomId?: unknown; exp?: unknown };
		return payload.roomId === roomId && typeof payload.exp === 'number' && payload.exp >= now;
	} catch {
		return false;
	}
}

// Anonymous creator ID cookie (`eb_cid`). The value is `<id>.<hmac>`, so a
// client cannot claim an arbitrary actor ID (for example a `user_…` ID, which
// is derived from an email address and therefore guessable).
const LEGACY_CREATOR_ID = /^[A-Za-z0-9_-]{16}$/;

export function createCreatorToken(creatorId: string, secret: string): string {
	return `${creatorId}.${sign(`creator:${creatorId}`, secret)}`;
}

export type VerifiedCreator = { creatorId: string; legacy: boolean };

/**
 * Accepts a signed creator token, or a pre-signing value that has the exact
 * shape of an ID this app generated (`nanoid(16)`). Legacy values are random
 * and unguessable; they keep existing anonymous decks reachable until the
 * cookie is re-issued signed. Anything else, including user IDs, is rejected.
 */
export function verifyCreatorToken(token: string | undefined, secret: string): VerifiedCreator | null {
	if (!token) return null;
	const dot = token.lastIndexOf('.');
	if (dot === -1) return LEGACY_CREATOR_ID.test(token) ? { creatorId: token, legacy: true } : null;
	const creatorId = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	if (!LEGACY_CREATOR_ID.test(creatorId) || !sig) return null;
	return safeEqual(sig, sign(`creator:${creatorId}`, secret)) ? { creatorId, legacy: false } : null;
}

function sign(body: string, secret: string): string {
	return createHmac('sha256', secret).update(body).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}
