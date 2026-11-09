import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toPublicSlides } from '$lib/decks';
import { canEditDeck, canViewDeck, deckViewerFromCookies } from '$lib/server/deck-access';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getActorId } from '$lib/server/identity';
import { buildDeckInput } from '$lib/server/deck-input';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';

// GET /api/decks/:id — public-safe Deck. Raw source + speaker notes nur für den
// Owner; ein unowned Deck hat keinen, also bekommt dort niemand Notes/Source.
export const GET: RequestHandler = async ({ params, cookies }) => {
	if (!isValidDeckId(params.id)) return json({ error: 'not_found' }, { status: 404 });
	const deck = await getDeckRepo().get(params.id);
	if (!deck) return json({ error: 'not_found' }, { status: 404 });
	const actor = getActorId(cookies);
	if (!canViewDeck(deck, deckViewerFromCookies(cookies))) return json({ error: true, message: 'Kein Zugriff auf dieses Deck.' }, { status: 403 });
	const isOwner = canEditDeck(deck, actor);
	return json({
		id: deck.id,
		title: deck.title,
		...(isOwner ? { source: deck.source } : {}),
		slides: isOwner ? deck.slides : toPublicSlides(deck.slides),
		updatedAt: deck.updatedAt
	});
};

// PUT /api/decks/:id — Update. Nur der Owner darf ändern. Ein unowned Deck muss
// erst über den signierten Claim-Link (/edit/:id?claim=…) übernommen werden.
export const PUT: RequestHandler = async ({ params, request, cookies, getClientAddress }) => {
	const limited = rateLimit(clientRateLimitKey('deck-write', getClientAddress, params.id), RATE_LIMITS.deckWrite);
	if (limited) return limited;
	if (!isValidDeckId(params.id)) return json({ error: 'not_found' }, { status: 404 });
	const repo = getDeckRepo();
	const existing = await repo.get(params.id);
	if (!existing) return json({ error: 'not_found' }, { status: 404 });

	const cid = getActorId(cookies);
	if (!canEditDeck(existing, cid)) {
		return json({ error: true, message: 'Kein Zugriff auf dieses Deck.' }, { status: 403 });
	}

	const body = await request.json().catch(() => ({}));
	const parsed = buildDeckInput(body);
	if (!parsed.ok) return json({ error: true, message: parsed.message }, { status: parsed.status });

	const deck = await repo.update(params.id, parsed.input, cid);
	if (!deck) return json({ error: 'not_found' }, { status: 404 });
	return json({ id: deck.id, title: deck.title, slides: deck.slides, updatedAt: deck.updatedAt });
};

// DELETE /api/decks/:id — nur Owner darf löschen. Unowned MCP-Decks müssen erst
// über den Claim-Link übernommen werden, damit nicht jeder Browser löschen kann.
export const DELETE: RequestHandler = async ({ params, cookies, getClientAddress }) => {
	const limited = rateLimit(clientRateLimitKey('deck-write', getClientAddress, params.id), RATE_LIMITS.deckWrite);
	if (limited) return limited;
	if (!isValidDeckId(params.id)) return json({ error: 'not_found' }, { status: 404 });
	const repo = getDeckRepo();
	const existing = await repo.get(params.id);
	if (!existing) return json({ error: 'not_found' }, { status: 404 });

	const cid = getActorId(cookies);
	if (!cid || !existing.ownerId || existing.ownerId !== cid) {
		return json({ error: true, message: 'Kein Zugriff auf dieses Deck.' }, { status: 403 });
	}

	await repo.delete(params.id);
	return new Response(null, { status: 204 });
};
