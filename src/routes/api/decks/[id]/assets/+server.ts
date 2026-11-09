import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canEditDeck } from '$lib/server/deck-access';
import { storeAsset } from '$lib/server/assets';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getActorId } from '$lib/server/identity';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';

export const POST: RequestHandler = async ({ params, request, cookies, getClientAddress }) => {
	const limited = rateLimit(clientRateLimitKey('asset-upload', getClientAddress, params.id), RATE_LIMITS.assetUpload);
	if (limited) return limited;
	if (!isValidDeckId(params.id)) return json({ error: 'not_found' }, { status: 404 });
	const deck = await getDeckRepo().get(params.id);
	if (!deck) return json({ error: 'not_found' }, { status: 404 });
	const cid = getActorId(cookies);
	if (!canEditDeck(deck, cid)) return json({ error: true, message: 'Kein Zugriff auf dieses Deck.' }, { status: 403 });

	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File)) return json({ error: true, message: 'Keine Bilddatei.' }, { status: 400 });
	try {
		const asset = await storeAsset(file);
		return json({ url: asset.url, key: asset.key, mime: asset.mime, alt: file.name.replace(/\.[^.]+$/, '') });
	} catch (error) {
		const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 400;
		return json({ error: true, message: (error as Error).message }, { status });
	}
};
