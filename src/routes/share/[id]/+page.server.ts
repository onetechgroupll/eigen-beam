import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { deckVisibility } from '$lib/account';
import { toPublicSlides } from '$lib/decks';
import { canViewDeck, deckViewerFromCookies } from '$lib/server/deck-access';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { requestText } from '$lib/server/locale';

export const load: PageServerLoad = async ({ params, cookies, locals }) => {
	if (!isValidDeckId(params.id)) throw error(404, requestText({ locals }, 'api.deck_not_found'));
	const deck = await getDeckRepo().get(params.id);
	if (!deck) throw error(404, requestText({ locals }, 'api.deck_not_found'));
	if (!canViewDeck(deck, deckViewerFromCookies(cookies))) throw error(403, requestText({ locals }, 'api.deck_forbidden'));
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
