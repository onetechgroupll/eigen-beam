import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from 'node:process';
import { authSigningSecret } from '$lib/server/auth';
import { createUnsubToken, escapeHtml, recordFollowDetailed } from '$lib/server/followers';
import { getMailer } from '$lib/server/mailer';
import { canonicalPublicOrigin } from '$lib/server/origin';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-error';
import { requestText } from '$lib/server/locale';

export const POST: RequestHandler = async (event) => {
	const { request, url, getClientAddress } = event;
	const limited = rateLimit(clientRateLimitKey('follow', getClientAddress), RATE_LIMITS.follow, event.locals.locale);
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
				const deckSuffix = record.deckId ? requestText(event, 'mail.follow_deck_suffix', { deckId: record.deckId }) : '';
				const deckSuffixHtml = record.deckId ? requestText(event, 'mail.follow_deck_suffix', { deckId: escapeHtml(record.deckId) }) : '';
				await getMailer().send({
					to: record.email,
					subject: requestText(event, 'mail.follow_subject'),
					text: requestText(event, 'mail.follow_text', { deckSuffix, url: unsubUrl }),
					html: requestText(event, 'mail.follow_html', { deckSuffix: deckSuffixHtml, url: escapeHtml(unsubUrl) })
				});
			} catch (mailErr) {
				console.error('[follow] Confirmation-Mail fehlgeschlagen:', mailErr);
			}
		}

		return json({ ok: true, email: record.email, isNew });
	} catch (error) {
		const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 400;
		return apiError(event, status === 400 ? 'invalid_email' : 'internal_error', status);
	}
};
