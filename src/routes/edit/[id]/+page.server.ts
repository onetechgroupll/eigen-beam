import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { canEditDeck } from '$lib/server/deck-access';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getActorId } from '$lib/server/identity';

export const load: PageServerLoad = async ({ params, cookies }) => {
	if (!isValidDeckId(params.id)) throw error(404, 'Deck nicht gefunden');
	const deck = await getDeckRepo().get(params.id);
	if (!deck) throw error(404, 'Deck nicht gefunden');

	// Nur der Creator darf bearbeiten (ungeclaimte Decks bleiben offen).
	const cid = getActorId(cookies);
	if (!canEditDeck(deck, cid)) throw error(403, 'Kein Zugriff auf dieses Deck.');

	return { id: deck.id, title: deck.title, source: deck.source };
};
