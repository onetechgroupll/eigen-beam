import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publicSlidesToSource, toPublicSlides } from '$lib/decks';
import { canViewDeck, deckViewerFromCookies } from '$lib/server/deck-access';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getOrCreateActorId } from '$lib/server/identity';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-error';
import { detectContentLocale, t } from '$lib/i18n';

export const POST: RequestHandler = async ({ params, cookies, getClientAddress, locals }) => {
	const limited = rateLimit(clientRateLimitKey('deck-clone', getClientAddress, params.id), RATE_LIMITS.deckClone, locals.locale);
	if (limited) return limited;
	if (!isValidDeckId(params.id)) return apiError({ locals }, 'deck_not_found', 404);
	const repo = getDeckRepo();
	const deck = await repo.get(params.id);
	if (!deck) return apiError({ locals }, 'deck_not_found', 404);
	if (!canViewDeck(deck, deckViewerFromCookies(cookies))) return apiError({ locals }, 'deck_forbidden', 403);
	const owner = getOrCreateActorId(cookies);
	const slides = toPublicSlides(deck.slides);
	const clone = await repo.create({ title: t(detectContentLocale(deck.slides), 'common.copy_suffix', { title: deck.title }), source: publicSlidesToSource(slides), slides }, owner);
	return json({ id: clone.id, title: clone.title }, { status: 201 });
};
