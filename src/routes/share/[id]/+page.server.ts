import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { deckVisibility } from '$lib/account';
import { toPublicSlides } from '$lib/decks';
import { canViewDeck, deckViewerFromCookies } from '$lib/server/deck-access';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';

export const load: PageServerLoad = async ({ params, cookies }) => {
	if (!isValidDeckId(params.id)) throw error(404, 'Deck nicht gefunden');
	const deck = await getDeckRepo().get(params.id);
	if (!deck) throw error(404, 'Deck nicht gefunden');
	if (!canViewDeck(deck, deckViewerFromCookies(cookies))) throw error(403, 'Dieses Deck ist privat. Bitte mit einem berechtigten Account anmelden.');
	return {
		deck: {
			id: deck.id,
			title: deck.title,
			slides: toPublicSlides(deck.slides),
			updatedAt: deck.updatedAt,
			visibility: deckVisibility(deck)
		}
	};
};
