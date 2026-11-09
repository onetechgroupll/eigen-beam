import type { RequestHandler } from './$types';
import { authSigningSecret } from '$lib/server/auth';
import { removeFollowEmail, verifyUnsubToken } from '$lib/server/followers';

function page(title: string, body: string, status = 200): Response {
	const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · eigen.beam</title><style>body{font-family:system-ui,sans-serif;background:#0b0b0b;color:#f4f4f4;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:420px;padding:32px;text-align:center}a{color:#b6ff3a}</style></head><body><main><h1>${title}</h1><p>${body}</p><p><a href="/">← eigen.beam</a></p></main></body></html>`;
	return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// GET /api/follow/unsubscribe?token=… — Opt-out aus dem Retention-Loop.
// Token ist signiert (ohne Ablauf, Opt-out muss dauerhaft gehen). Entfernt ALLE
// Follow-Opt-ins der Email. Bewusst GET, damit der Mail-Link direkt klickbar ist.
export const GET: RequestHandler = async ({ url }) => {
	const token = url.searchParams.get('token') ?? '';
	const email = verifyUnsubToken(token, authSigningSecret());
	if (!email) return page('Link ungültig', 'Dieser Abmelde-Link ist ungültig oder unvollständig.', 400);
	try {
		const removed = await removeFollowEmail(email);
		return page(
			'Abgemeldet',
			removed > 0 ? 'Du bekommst keine eigen.beam-Pings mehr. Schade — aber respektiert.' : 'Es gab keine aktiven Pings für diese Adresse.'
		);
	} catch (e) {
		console.error('[follow] Unsubscribe fehlgeschlagen:', e);
		return page('Hat nicht geklappt', 'Bitte später erneut versuchen.', 500);
	}
};
