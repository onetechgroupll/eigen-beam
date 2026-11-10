import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authSigningSecret, verifyPinUnlockToken } from '$lib/server/auth';
import { getReplay, getReplayPersistent } from '$lib/server/rooms';
import { apiError } from '$lib/server/api-error';

export const GET: RequestHandler = async ({ params, cookies, locals }) => {
	const replay = await getReplayPersistent(params.id);
	if (!replay) return apiError({ locals }, 'replay_not_found', 404);
	if (replay.protected && !verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret())) return apiError({ locals }, 'replay_pin_required', 403);
	return json({ replay });
};
