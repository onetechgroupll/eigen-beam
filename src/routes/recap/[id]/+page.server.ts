import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { toPublicSlides } from '$lib/decks';
import { canViewDeck, deckViewerFromCookies } from '$lib/server/deck-access';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';

export const load: PageServerLoad = async ({ params, cookies }) => {
	if (!isValidDeckId(params.id)) throw error(404, 'Deck nicht gefunden');
	const deck = await getDeckRepo().get(params.id);
	if (!deck) throw error(404, 'Deck nicht gefunden');
	if (!canViewDeck(deck, deckViewerFromCookies(cookies))) throw error(403, 'Kein Zugriff auf dieses Deck.');
	// SECURITY: Recap ist sharebar. Nie ownerId/source als Page-Data serialisieren.
	return { deck: { id: deck.id, title: deck.title, slides: toPublicSlides(deck.slides), updatedAt: deck.updatedAt } };
};
