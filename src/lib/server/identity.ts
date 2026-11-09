// Anonyme Creator-ID + Magic-Link-User-Session.
// AuthZ nutzt eine Actor-ID: eingeloggter User (`eb_uid`) gewinnt, sonst anon Creator (`eb_cid`).
import type { Cookies } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { authSigningSecret, createCreatorToken, createUserSessionToken, isProductionRuntime, verifyCreatorToken, verifyUserSessionToken, type VerifiedCreator } from '$lib/server/auth';

const CREATOR_COOKIE = 'eb_cid';
const USER_COOKIE = 'eb_uid';
const MAX_AGE = 60 * 60 * 24 * 365; // 1 Jahr

const cookieOpts = {
	path: '/',
	httpOnly: true,
	secure: isProductionRuntime(),
	sameSite: 'lax' as const,
	maxAge: MAX_AGE
};

export function getCreatorId(cookies: Cookies): string | null {
	return readCreator(cookies)?.creatorId ?? null;
}

function readCreator(cookies: Cookies): VerifiedCreator | null {
	try {
		return verifyCreatorToken(cookies.get(CREATOR_COOKIE), authSigningSecret());
	} catch {
		return null;
	}
}

export function getUserId(cookies: Cookies): string | null {
	return getUserSession(cookies)?.userId ?? null;
}

export function getUserEmail(cookies: Cookies): string | null {
	return getUserSession(cookies)?.email ?? null;
}

export function getUserSession(cookies: Cookies): { email: string; userId: string } | null {
	try {
		return verifyUserSessionToken(cookies.get(USER_COOKIE), authSigningSecret());
	} catch {
		return null;
	}
}

export function getActorId(cookies: Cookies): string | null {
	return getUserId(cookies) ?? getCreatorId(cookies);
}

export function getOrCreateCreatorId(cookies: Cookies): string {
	const current = readCreator(cookies);
	if (current && !current.legacy) return current.creatorId;
	// New visitor, a rejected value, or a pre-signing cookie: (re-)issue it signed.
	const id = current?.creatorId ?? nanoid(16);
	cookies.set(CREATOR_COOKIE, createCreatorToken(id, authSigningSecret()), cookieOpts);
	return id;
}

export function getOrCreateActorId(cookies: Cookies): string {
	return getUserId(cookies) ?? getOrCreateCreatorId(cookies);
}

export function setUserSession(cookies: Cookies, email: string): string {
	const token = createUserSessionToken(email, authSigningSecret());
	cookies.set(USER_COOKIE, token, cookieOpts);
	return verifyUserSessionToken(token, authSigningSecret())!.userId;
}

export function clearUserSession(cookies: Cookies): void {
	cookies.delete(USER_COOKIE, { path: '/' });
}
