import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authSigningSecret, createMagicToken, isProductionRuntime, isValidEmail, normalizeEmail } from '$lib/server/auth';
import { getMailer } from '$lib/server/mailer';
import { canonicalPublicOrigin } from '$lib/server/origin';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { env } from 'node:process';

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	const limited = rateLimit(clientRateLimitKey('magic-link', getClientAddress), RATE_LIMITS.magicLink);
	if (limited) return limited;
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
	if (!isValidEmail(email)) return json({ error: true, message: 'Bitte eine gültige Email eingeben.' }, { status: 400 });
	const returnLink = env.EB_AUTH_RETURN_LINK === 'true' && !isProductionRuntime();
	const token = await createMagicToken(email, authSigningSecret());
	const magicLink = new URL(`/auth/verify?token=${encodeURIComponent(token)}`, canonicalPublicOrigin(url, env)).toString();

	let delivered = false;
	try {
		await getMailer().send({
			to: email,
			subject: 'Dein eigen.beam Login-Link',
			text: `Hier ist dein Login-Link (15 Minuten gültig):\n\n${magicLink}\n\nWenn du das nicht warst, ignorier diese Mail.\n\n— eigen.beam`,
			html: `<p>Hier ist dein Login-Link (15 Minuten gültig):</p><p><a href="${magicLink}">Bei eigen.beam anmelden</a></p><p>Wenn du das nicht warst, ignorier diese Mail.</p>`
		});
		delivered = true;
	} catch (mailErr) {
		console.error('[auth] Magic-Link-Versand fehlgeschlagen:', mailErr);
		if (!returnLink) {
			return json({ error: true, message: 'Mail-Versand fehlgeschlagen.' }, { status: 502 });
		}
	}

	return json({ ok: true, delivered, magicLink: returnLink ? magicLink : undefined });
};
