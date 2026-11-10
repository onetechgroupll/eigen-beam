import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { accountProfileFromSession, toDeckLibraryItems } from '$lib/account';
import type { DeckVisibility } from '$lib/decks';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getActorId, getUserSession } from '$lib/server/identity';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-error';

const VISIBILITIES = new Set<DeckVisibility>(['private', 'link', 'team']);

export const PATCH: RequestHandler = async ({ params, request, cookies, getClientAddress, locals }) => {
	const limited = rateLimit(clientRateLimitKey('deck-sharing', getClientAddress, params.id), RATE_LIMITS.deckWrite, locals.locale);
	if (limited) return limited;
	if (!isValidDeckId(params.id)) return apiError({ locals }, 'deck_not_found', 404);

	const actorId = getActorId(cookies);
	if (!actorId) return apiError({ locals }, 'login_required', 401);

	const body = await request.json().catch(() => ({}));
	const visibility = body.visibility as DeckVisibility;
	if (!VISIBILITIES.has(visibility)) return apiError({ locals }, 'invalid_visibility', 400);

	const profile = accountProfileFromSession(getUserSession(cookies));
	if (visibility === 'team' && !profile) return apiError({ locals }, 'team_login_required', 401);

	const updated = await getDeckRepo().setSharing(
		params.id,
		{ visibility, teamId: visibility === 'team' ? profile!.teamId : null },
		actorId
	);
	if (!updated) return apiError({ locals }, 'deck_forbidden', 403);
	return json({ deck: toDeckLibraryItems([updated])[0] });
};
