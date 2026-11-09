import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { claimPresenterToken } from '$lib/server/rooms';

export const POST: RequestHandler = async ({ params, request, cookies, url }) => {
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const claimToken = typeof body.claimToken === 'string' ? body.claimToken : '';
	const presenterToken = claimPresenterToken(params.id, claimToken);
	if (!presenterToken) return json({ error: true }, { status: 403 });
	cookies.set(`eb_pt_${params.id}`, presenterToken, {
		path: `/present/${params.id}`,
		httpOnly: true,
		sameSite: 'strict',
		secure: url.protocol === 'https:',
		maxAge: 60 * 60 * 12
	});
	return json({ ok: true });
};
