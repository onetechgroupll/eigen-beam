import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authSigningSecret, verifyPinUnlockToken } from '$lib/server/auth';
import { getReplayPersistent } from '$lib/server/rooms';
import { canonicalPublicOrigin } from '$lib/server/origin';
import { requestText } from '$lib/server/locale';

export const load: PageServerLoad = async ({ params, cookies, url, locals }) => {
	const replay = await getReplayPersistent(params.id);
	if (!replay) throw error(404, requestText({ locals }, 'api.replay_not_found'));
	if (replay.protected && !verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret())) throw error(403, requestText({ locals }, 'api.replay_pin_required'));
	return { replay, origin: canonicalPublicOrigin(url) };
};
