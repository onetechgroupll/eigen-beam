import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authSigningSecret, verifyPinUnlockToken } from '$lib/server/auth';
import { getReplayPersistent } from '$lib/server/rooms';
import { buildSessionCoach } from '$lib/session-coach';

export const GET: RequestHandler = async ({ params, cookies, url }) => {
	const replay = await getReplayPersistent(params.id);
	if (!replay) return json({ error: 'not_found' }, { status: 404 });
	if (replay.protected && !verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret())) return json({ error: 'forbidden' }, { status: 403 });
	const coach = buildSessionCoach(replay);
	if (url.searchParams.get('format') === 'md') {
		return new Response(coach.markdown, {
			headers: {
				'content-type': 'text/markdown; charset=utf-8',
				'content-disposition': `attachment; filename="eigenbeam-session-coach-${params.id}.md"`,
				'cache-control': 'no-store'
			}
		});
	}
	return json({ coach }, { headers: { 'cache-control': 'no-store' } });
};
