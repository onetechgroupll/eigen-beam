import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { accountProfileFromSession, toDeckLibraryItems } from '$lib/account';
import type { DeckVisibility } from '$lib/decks';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getActorId, getUserSession } from '$lib/server/identity';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';

const VISIBILITIES = new Set<DeckVisibility>(['private', 'link', 'team']);

export const PATCH: RequestHandler = async ({ params, request, cookies, getClientAddress }) => {
	const limited = rateLimit(clientRateLimitKey('deck-sharing', getClientAddress, params.id), RATE_LIMITS.deckWrite);
	if (limited) return limited;
	if (!isValidDeckId(params.id)) return json({ error: 'not_found' }, { status: 404 });

	const actorId = getActorId(cookies);
	if (!actorId) return json({ error: true, message: 'Bitte anmelden, um Sharing zu ändern.' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const visibility = body.visibility as DeckVisibility;
	if (!VISIBILITIES.has(visibility)) return json({ error: true, message: 'Ungültige Sichtbarkeit.' }, { status: 400 });

	const profile = accountProfileFromSession(getUserSession(cookies));
	if (visibility === 'team' && !profile) return json({ error: true, message: 'Team-Sharing braucht einen Magic-Link-Login.' }, { status: 401 });

	const updated = await getDeckRepo().setSharing(
		params.id,
		{ visibility, teamId: visibility === 'team' ? profile!.teamId : null },
		actorId
	);
	if (!updated) return json({ error: true, message: 'Kein Zugriff auf dieses Deck.' }, { status: 403 });
	return json({ deck: toDeckLibraryItems([updated])[0] });
};
