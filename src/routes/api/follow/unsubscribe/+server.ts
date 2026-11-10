import type { RequestHandler } from './$types';
import { authSigningSecret } from '$lib/server/auth';
import { removeFollowEmail, verifyUnsubToken } from '$lib/server/followers';
import { requestText } from '$lib/server/locale';
import type { Locale } from '$lib/i18n';

function page(locale: Locale, title: string, body: string, status = 200): Response {
	const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · eigen.beam</title><style>body{font-family:system-ui,sans-serif;background:#0b0b0b;color:#f4f4f4;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:420px;padding:32px;text-align:center}a{color:#b6ff3a}</style></head><body><main><h1>${title}</h1><p>${body}</p><p><a href="/">← eigen.beam</a></p></main></body></html>`;
	return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// GET /api/follow/unsubscribe?token=… — Opt-out aus dem Retention-Loop.
// Token ist signiert (ohne Ablauf, Opt-out muss dauerhaft gehen). Entfernt ALLE
// Follow-Opt-ins der Email. Bewusst GET, damit der Mail-Link direkt klickbar ist.
export const GET: RequestHandler = async ({ url, locals }) => {
	const token = url.searchParams.get('token') ?? '';
	const email = verifyUnsubToken(token, authSigningSecret());
	if (!email) return page(locals.locale, requestText({ locals }, 'unsubscribe.invalid_title'), requestText({ locals }, 'unsubscribe.invalid_body'), 400);
	try {
		const removed = await removeFollowEmail(email);
		return page(
			locals.locale,
			requestText({ locals }, 'unsubscribe.done_title'),
			requestText({ locals }, removed > 0 ? 'unsubscribe.done_body' : 'unsubscribe.none_body')
		);
	} catch (e) {
		console.error('[follow] Unsubscribe fehlgeschlagen:', e);
		return page(locals.locale, requestText({ locals }, 'unsubscribe.failed_title'), requestText({ locals }, 'unsubscribe.failed_body'), 500);
	}
};
