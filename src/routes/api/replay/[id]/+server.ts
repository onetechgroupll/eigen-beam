import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authSigningSecret, verifyPinUnlockToken } from '$lib/server/auth';
import { getReplay, getReplayPersistent } from '$lib/server/rooms';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const replay = await getReplayPersistent(params.id);
	if (!replay) return json({ error: 'not_found' }, { status: 404 });
	if (replay.protected && !verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret())) return json({ error: 'forbidden' }, { status: 403 });
	return json({ replay });
};
