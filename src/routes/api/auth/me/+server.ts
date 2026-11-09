import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActorId, getUserEmail, getUserId } from '$lib/server/identity';

export const GET: RequestHandler = async ({ cookies }) => {
	return json({ userId: getUserId(cookies), email: getUserEmail(cookies), actorId: getActorId(cookies) });
};
