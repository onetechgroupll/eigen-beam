import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseDeck } from '$lib/deck-parse';
import { requireAiUserSession } from '$lib/server/ai-auth';
import { voiceFileToDeckSource } from '$lib/server/voice';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const unauthorized = requireAiUserSession(cookies);
	if (unauthorized) return unauthorized;
	const limited = rateLimit(clientRateLimitKey('import-voice', getClientAddress), RATE_LIMITS.import);
	if (limited) return limited;
	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File)) return json({ error: true, message: 'Keine Audio-Datei.' }, { status: 400 });
	try {
		const title = typeof form?.get('title') === 'string' ? String(form.get('title')) : '';
		const imported = await voiceFileToDeckSource(file, title);
		return json({ title: imported.title, source: imported.source, slides: parseDeck(imported.source), transcript: imported.transcript, mode: imported.mode, fallbackReason: imported.fallbackReason });
	} catch (error) {
		const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 400;
		return json({ error: true, message: (error as Error).message }, { status });
	}
};
