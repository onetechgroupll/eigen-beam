import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { aiClarify, localClarify } from '$lib/server/clarity';
import { MAX_SOURCE_LEN } from '$lib/server/deck-input';
import { requireAiUserSession } from '$lib/server/ai-auth';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const unauthorized = requireAiUserSession(cookies);
	if (unauthorized) return unauthorized;
	const limited = rateLimit(clientRateLimitKey('clarify', getClientAddress), RATE_LIMITS.clarify);
	if (limited) return limited;
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const source = typeof body.source === 'string' ? body.source : '';
	const title = typeof body.title === 'string' ? body.title : '';
	if (source.length > MAX_SOURCE_LEN) return json({ error: true, message: 'Markdown zu lang.' }, { status: 413 });
	const ai = await aiClarify(title, source);
	const result = ai ?? localClarify(title, source);
	return json(result);
};
