import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canEditDeck } from '$lib/server/deck-access';
import { storeAsset } from '$lib/server/assets';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getActorId } from '$lib/server/identity';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-error';

export const POST: RequestHandler = async ({ params, request, cookies, getClientAddress, locals }) => {
	const limited = rateLimit(clientRateLimitKey('asset-upload', getClientAddress, params.id), RATE_LIMITS.assetUpload, locals.locale);
	if (limited) return limited;
	if (!isValidDeckId(params.id)) return apiError({ locals }, 'deck_not_found', 404);
	const deck = await getDeckRepo().get(params.id);
	if (!deck) return apiError({ locals }, 'deck_not_found', 404);
	const cid = getActorId(cookies);
	if (!canEditDeck(deck, cid)) return apiError({ locals }, 'deck_forbidden', 403);

	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File)) return apiError({ locals }, 'image_required', 400);
	try {
		const asset = await storeAsset(file);
		return json({ url: asset.url, key: asset.key, mime: asset.mime, alt: file.name.replace(/\.[^.]+$/, '') });
	} catch (error) {
		const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 400;
		return apiError({ locals }, status === 413 ? 'file_too_large' : 'unsupported_file', status);
	}
};
