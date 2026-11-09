import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authSigningSecret, verifyPinUnlockToken } from '$lib/server/auth';
import { getReplay, getReplayPersistent } from '$lib/server/rooms';
import { canonicalPublicOrigin } from '$lib/server/origin';

export const load: PageServerLoad = async ({ params, cookies, url }) => {
	const replay = await getReplayPersistent(params.id);
	if (!replay) throw error(404, 'Replay nicht gefunden');
	if (replay.protected && !verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret())) throw error(403, 'Replay ist PIN-geschützt');
	return { replay, origin: canonicalPublicOrigin(url) };
};
