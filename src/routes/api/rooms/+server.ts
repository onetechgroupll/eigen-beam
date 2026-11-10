import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRoom } from '$lib/server/rooms';
import { DEMO_DECK } from '$lib/decks';
import { canEditDeck } from '$lib/server/deck-access';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getActorId } from '$lib/server/identity';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-error';

// POST /api/rooms — startet eine Live-Session.
//   { deckId } gesetzt → Slides aus dem Deck-Repo (1× geladen, als Snapshot in den Room).
//   ohne deckId       → DEMO_DECK (Seed/Default bleibt erhalten).
// Härtung: Presenter-Token nie im Body/URL zurückgeben. Safari/WebKit akzeptiert
// kein Cookie mit zukünftigem /present/:id-Pfad aus /api/rooms; deshalb liefert
// dieser Endpoint nur einen kurzlebigen, single-use Claim-Token. Der echte
// httpOnly Presenter-Cookie wird danach von /present/:id/claim gesetzt.
export const POST: RequestHandler = async (event) => {
	const { cookies, request, getClientAddress } = event;
	const limited = rateLimit(clientRateLimitKey('room-create', getClientAddress), RATE_LIMITS.roomCreate, event.locals.locale);
	if (limited) return limited;
	const body = await request.json().catch(() => ({}) as Record<string, unknown>);
	const deckId = typeof (body as { deckId?: unknown }).deckId === 'string'
		? (body as { deckId: string }).deckId
		: null;

	let slides = DEMO_DECK;
	const pin = typeof (body as { pin?: unknown }).pin === 'string' ? (body as { pin: string }).pin.trim().slice(0, 24) : undefined;
	if (deckId) {
		if (!isValidDeckId(deckId)) return apiError(event, 'deck_not_found', 404);
		const deck = await getDeckRepo().get(deckId);
		if (!deck) return apiError(event, 'deck_not_found', 404);
		if (deck.slides.length === 0) return apiError(event, 'deck_empty', 400);
		if (!canEditDeck(deck, getActorId(cookies))) {
			return apiError(event, 'deck_forbidden', 403);
		}
		slides = deck.slides; // Snapshot — kein DB-Hit pro Viewer (createRoom kopiert intern)
	}

	const { id, claimToken } = createRoom(slides, { pin, deckId: deckId ?? undefined });
	return json({ id, claimToken });
};
