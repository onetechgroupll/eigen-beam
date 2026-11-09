import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { canEditDeck, DECK_CLAIM_PARAM, isValidDeckClaimToken } from '$lib/server/deck-access';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getActorId, getOrCreateActorId } from '$lib/server/identity';

export const load: PageServerLoad = async ({ params, cookies, url }) => {
	if (!isValidDeckId(params.id)) throw error(404, 'Deck nicht gefunden');
	const repo = getDeckRepo();
	const deck = await repo.get(params.id);
	if (!deck) throw error(404, 'Deck nicht gefunden');

	// Unowned Deck (per MCP angelegt): nur der signierte Claim-Link aus der
	// MCP-Antwort übernimmt es. Danach Redirect ohne Token, damit er weder in
	// der History noch im Referer landet.
	if (!deck.ownerId) {
		if (!isValidDeckClaimToken(deck.id, url.searchParams.get(DECK_CLAIM_PARAM))) {
			throw error(403, 'Dieses Deck wurde per MCP angelegt und ist noch nicht übernommen. Öffne den Edit-Link aus der MCP-Antwort.');
		}
		const actor = getOrCreateActorId(cookies);
		const claimed = await repo.claimUnowned(deck.id, actor);
		if (!claimed) {
			// Parallel von jemand anderem übernommen: normale Owner-Prüfung entscheidet.
			const current = await repo.get(deck.id);
			if (!current || !canEditDeck(current, actor)) throw error(403, 'Kein Zugriff auf dieses Deck.');
		}
		throw redirect(303, `/edit/${deck.id}`);
	}

	// Nur der Owner darf bearbeiten.
	const cid = getActorId(cookies);
	if (!canEditDeck(deck, cid)) throw error(403, 'Kein Zugriff auf dieses Deck.');

	return { id: deck.id, title: deck.title, source: deck.source };
};
