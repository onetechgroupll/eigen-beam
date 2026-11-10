import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authSigningSecret, createMagicToken, isProductionRuntime, isValidEmail, normalizeEmail } from '$lib/server/auth';
import { getMailer } from '$lib/server/mailer';
import { canonicalPublicOrigin } from '$lib/server/origin';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { env } from 'node:process';
import { apiError } from '$lib/server/api-error';
import { requestText } from '$lib/server/locale';

export const POST: RequestHandler = async (event) => {
	const { request, url, getClientAddress } = event;
	const limited = rateLimit(clientRateLimitKey('magic-link', getClientAddress), RATE_LIMITS.magicLink, event.locals.locale);
	if (limited) return limited;
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
	if (!isValidEmail(email)) return apiError(event, 'invalid_email', 400);
	const returnLink = env.EB_AUTH_RETURN_LINK === 'true' && !isProductionRuntime();
	const token = await createMagicToken(email, authSigningSecret());
	const magicLink = new URL(`/auth/verify?token=${encodeURIComponent(token)}`, canonicalPublicOrigin(url, env)).toString();

	let delivered = false;
	try {
		await getMailer().send({
			to: email,
			subject: requestText(event, 'mail.login_subject'),
			text: requestText(event, 'mail.login_text', { url: magicLink }),
			html: requestText(event, 'mail.login_html', { url: magicLink })
		});
		delivered = true;
	} catch (mailErr) {
		console.error('[auth] Magic-Link-Versand fehlgeschlagen:', mailErr);
		if (!returnLink) {
			return apiError(event, 'mail_failed', 502);
		}
	}

	return json({ ok: true, delivered, magicLink: returnLink ? magicLink : undefined });
};
