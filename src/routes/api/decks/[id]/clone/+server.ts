import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publicSlidesToSource, toPublicSlides } from '$lib/decks';
import { canViewDeck, deckViewerFromCookies } from '$lib/server/deck-access';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getOrCreateActorId } from '$lib/server/identity';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';

export const POST: RequestHandler = async ({ params, cookies, getClientAddress }) => {
	const limited = rateLimit(clientRateLimitKey('deck-clone', getClientAddress, params.id), RATE_LIMITS.deckClone);
	if (limited) return limited;
	if (!isValidDeckId(params.id)) return json({ error: 'not_found' }, { status: 404 });
	const repo = getDeckRepo();
	const deck = await repo.get(params.id);
	if (!deck) return json({ error: 'not_found' }, { status: 404 });
	if (!canViewDeck(deck, deckViewerFromCookies(cookies))) return json({ error: true, message: 'Kein Zugriff auf dieses Deck.' }, { status: 403 });
	const owner = getOrCreateActorId(cookies);
	const slides = toPublicSlides(deck.slides);
	const clone = await repo.create({ title: `${deck.title} Kopie`, source: publicSlidesToSource(slides), slides }, owner);
	return json({ id: clone.id, title: clone.title }, { status: 201 });
};
