import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { canEditDeck, DECK_CLAIM_PARAM, isValidDeckClaimToken } from '$lib/server/deck-access';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getActorId, getOrCreateActorId } from '$lib/server/identity';

const UNCLAIMED_MESSAGE = 'Dieses Deck wurde per MCP angelegt und ist noch nicht übernommen. Öffne den Edit-Link aus der MCP-Antwort.';

export const load: PageServerLoad = async ({ params, cookies, url }) => {
	if (!isValidDeckId(params.id)) throw error(404, 'Deck nicht gefunden');
	const deck = await getDeckRepo().get(params.id);
	if (!deck) throw error(404, 'Deck nicht gefunden');

	// Unowned Deck (per MCP angelegt): der signierte Claim-Link zeigt nur eine
	// Bestätigung. Übernommen wird erst per POST (Action `claim`), damit Link-
	// Previews (Slack, Teams, Mail-Scanner), die den Link per GET abrufen, das
	// Deck nicht für sich claimen und den eigentlichen Empfänger aussperren.
	if (!deck.ownerId) {
		const token = url.searchParams.get(DECK_CLAIM_PARAM);
		if (!isValidDeckClaimToken(deck.id, token)) throw error(403, UNCLAIMED_MESSAGE);
		return { claim: true as const, id: deck.id, title: deck.title, slideCount: deck.slides.length, token: token! };
	}

	// Nur der Owner darf bearbeiten.
	const cid = getActorId(cookies);
	if (!canEditDeck(deck, cid)) throw error(403, 'Kein Zugriff auf dieses Deck.');

	return { claim: false as const, id: deck.id, title: deck.title, source: deck.source };
};

export const actions: Actions = {
	claim: async ({ params, cookies, request }) => {
		if (!isValidDeckId(params.id)) throw error(404, 'Deck nicht gefunden');
		const form = await request.formData();
		const token = form.get(DECK_CLAIM_PARAM);
		if (typeof token !== 'string' || !isValidDeckClaimToken(params.id, token)) throw error(403, UNCLAIMED_MESSAGE);
		const repo = getDeckRepo();
		const actor = getOrCreateActorId(cookies);
		const claimed = await repo.claimUnowned(params.id, actor);
		if (!claimed) {
			// Schon übernommen (parallel oder Doppel-Submit): normale Owner-Prüfung entscheidet.
			const current = await repo.get(params.id);
			if (!current) throw error(404, 'Deck nicht gefunden');
			if (!canEditDeck(current, actor)) throw error(403, 'Dieses Deck wurde bereits von jemand anderem übernommen.');
		}
		// Redirect ohne Token, damit er weder in der History noch im Referer landet.
		throw redirect(303, `/edit/${params.id}`);
	}
};
