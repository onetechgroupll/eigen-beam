import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from 'node:process';
import { authSigningSecret } from '$lib/server/auth';
import { createUnsubToken, escapeHtml, recordFollowDetailed } from '$lib/server/followers';
import { getMailer } from '$lib/server/mailer';
import { canonicalPublicOrigin } from '$lib/server/origin';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	const limited = rateLimit(clientRateLimitKey('follow', getClientAddress), RATE_LIMITS.follow);
	if (limited) return limited;
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	try {
		const { record, isNew } = await recordFollowDetailed({
			email: typeof body.email === 'string' ? body.email : '',
			deckId: typeof body.deckId === 'string' ? body.deckId : undefined,
			roomId: typeof body.roomId === 'string' ? body.roomId : undefined
		});

		if (isNew) {
			try {
				const unsubUrl = new URL(`/api/follow/unsubscribe?token=${encodeURIComponent(createUnsubToken(record.email, authSigningSecret()))}`, canonicalPublicOrigin(url, env)).toString();
				const deckSuffix = record.deckId ? ` zu diesem Deck (${record.deckId})` : '';
				const deckSuffixHtml = record.deckId ? ` zu diesem Deck (${escapeHtml(record.deckId)})` : '';
				await getMailer().send({
					to: record.email,
					subject: 'Du bist dabei — eigen.beam meldet sich',
					text: `Danke fürs Folgen.\n\nWir pingen dich, sobald es ein neues eigen.beam${deckSuffix} gibt.\n\nKein Interesse mehr? Abmelden: ${unsubUrl}\n\n— eigen.beam`,
					html: `<p>Danke fürs Folgen.</p><p>Wir pingen dich, sobald es ein neues eigen.beam${deckSuffixHtml} gibt.</p><p style="color:#888;font-size:12px">Kein Interesse mehr? <a href="${escapeHtml(unsubUrl)}">Abmelden</a></p>`
				});
			} catch (mailErr) {
				console.error('[follow] Confirmation-Mail fehlgeschlagen:', mailErr);
			}
		}

		return json({ ok: true, email: record.email, isNew });
	} catch (error) {
		const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 400;
		return json({ error: true, message: (error as Error).message }, { status });
	}
};
