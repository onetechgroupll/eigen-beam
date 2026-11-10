import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clarifyDeck } from '$lib/server/clarity';
import { MAX_SOURCE_LEN } from '$lib/server/deck-input';
import { requireAiUserSession } from '$lib/server/ai-auth';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-error';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress, locals }) => {
	const unauthorized = requireAiUserSession(cookies, locals.locale);
	if (unauthorized) return unauthorized;
	const limited = rateLimit(clientRateLimitKey('clarify', getClientAddress), RATE_LIMITS.clarify, locals.locale);
	if (limited) return limited;
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const source = typeof body.source === 'string' ? body.source : '';
	const title = typeof body.title === 'string' ? body.title : '';
	if (source.length > MAX_SOURCE_LEN) return apiError({ locals }, 'source_too_long', 413);
	const result = await clarifyDeck(title, source);
	return json(result);
};
