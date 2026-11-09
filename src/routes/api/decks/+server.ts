import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDeckRepo } from '$lib/server/decks-repo';
import { getOrCreateActorId, getActorId } from '$lib/server/identity';
import { buildDeckInput } from '$lib/server/deck-input';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { toDeckLibraryItems } from '$lib/account';

// POST /api/decks — Markdown/Text → slides → persistiertes Deck (Creator-ID-Cookie).
export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const limited = rateLimit(clientRateLimitKey('deck-write', getClientAddress), RATE_LIMITS.deckWrite);
	if (limited) return limited;
	const body = await request.json().catch(() => ({}));
	const parsed = buildDeckInput(body);
	if (!parsed.ok) return json({ error: true, message: parsed.message }, { status: parsed.status });

	const owner = getOrCreateActorId(cookies);
	const deck = await getDeckRepo().create(parsed.input, owner);
	return json({ id: deck.id, title: deck.title, slides: deck.slides }, { status: 201 });
};

// GET /api/decks — Decks der aktuellen Creator-ID (für eine spätere „Meine Decks"-Liste).
export const GET: RequestHandler = async ({ cookies }) => {
	const owner = getActorId(cookies);
	if (!owner) return json({ decks: [] });
	const decks = await getDeckRepo().listByOwner(owner);
	return json({ decks: toDeckLibraryItems(decks) });
};
