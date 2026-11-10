import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { claimPresenterToken } from '$lib/server/rooms';
import { apiError } from '$lib/server/api-error';

export const POST: RequestHandler = async ({ params, request, cookies, url, locals }) => {
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const claimToken = typeof body.claimToken === 'string' ? body.claimToken : '';
	const presenterToken = claimPresenterToken(params.id, claimToken);
	if (!presenterToken) return apiError({ locals }, 'presenter_forbidden', 403);
	cookies.set(`eb_pt_${params.id}`, presenterToken, {
		path: `/present/${params.id}`,
		httpOnly: true,
		sameSite: 'strict',
		secure: url.protocol === 'https:',
		maxAge: 60 * 60 * 12
	});
	return json({ ok: true });
};
