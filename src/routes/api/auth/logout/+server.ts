import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearUserSession } from '$lib/server/identity';

export const POST: RequestHandler = async ({ cookies }) => {
	clearUserSession(cookies);
	return json({ ok: true });
};
