import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authSigningSecret, verifyPinUnlockToken } from '$lib/server/auth';
import { getReplayPersistent } from '$lib/server/rooms';
import { buildDeckV2Draft } from '$lib/deck-v2-draft';
import { apiError } from '$lib/server/api-error';

export const GET: RequestHandler = async ({ params, cookies, url, locals }) => {
	const replay = await getReplayPersistent(params.id);
	if (!replay) return apiError({ locals }, 'replay_not_found', 404);
	if (replay.protected && !verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret())) return apiError({ locals }, 'replay_pin_required', 403);
	const draft = buildDeckV2Draft(replay);
	if (url.searchParams.get('format') === 'md') {
		return new Response(draft.source, {
			headers: {
				'content-type': 'text/markdown; charset=utf-8',
				'content-disposition': `attachment; filename="eigenbeam-deck-v2-${params.id}.md"`,
				'cache-control': 'no-store'
			}
		});
	}
	return json({ draft }, { headers: { 'cache-control': 'no-store' } });
};
