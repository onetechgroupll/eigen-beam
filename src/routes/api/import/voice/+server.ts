import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseDeck } from '$lib/deck-parse';
import { requireAiUserSession } from '$lib/server/ai-auth';
import { voiceFileToDeckSource } from '$lib/server/voice';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-error';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress, locals }) => {
	const unauthorized = requireAiUserSession(cookies, locals.locale);
	if (unauthorized) return unauthorized;
	const limited = rateLimit(clientRateLimitKey('import-voice', getClientAddress), RATE_LIMITS.import, locals.locale);
	if (limited) return limited;
	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File)) return apiError({ locals }, 'audio_required', 400);
	try {
		const title = typeof form?.get('title') === 'string' ? String(form.get('title')) : '';
		const imported = await voiceFileToDeckSource(file, title);
		return json({ title: imported.title, source: imported.source, slides: parseDeck(imported.source), transcript: imported.transcript, mode: imported.mode, fallbackReason: imported.fallbackReason });
	} catch (error) {
		const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 400;
		return apiError({ locals }, status === 413 ? 'file_too_large' : 'unsupported_file', status);
	}
};
