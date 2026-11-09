import type { PageServerLoad } from './$types';
import { accountProfileFromSession, toDeckLibraryItems } from '$lib/account';
import { getDeckRepo } from '$lib/server/decks-repo';
import { getActorId, getUserSession } from '$lib/server/identity';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const session = getUserSession(cookies);
	const profile = accountProfileFromSession(session);
	const actorId = getActorId(cookies);
	const repo = getDeckRepo();
	const decks = actorId ? toDeckLibraryItems(await repo.listByOwner(actorId)) : [];
	const teamDecks = profile ? toDeckLibraryItems(await repo.listByTeam(profile.teamId, profile.userId), { editable: false }) : [];
	return {
		session,
		profile,
		decks,
		teamDecks,
		auth: url.searchParams.get('auth'),
		claimed: Number(url.searchParams.get('claimed') ?? 0)
	};
};
