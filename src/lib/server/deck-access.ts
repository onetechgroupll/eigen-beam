import type { Cookies } from '@sveltejs/kit';
import { accountProfileFromSession, deckVisibility } from '$lib/account';
import type { Deck } from '$lib/decks';
import { getActorId, getUserSession } from '$lib/server/identity';

export type DeckViewer = {
	actorId: string | null;
	teamId: string | null;
};

export function deckViewerFromCookies(cookies: Cookies): DeckViewer {
	const session = getUserSession(cookies);
	const profile = accountProfileFromSession(session);
	return { actorId: getActorId(cookies), teamId: profile?.teamId ?? null };
}

export function canEditDeck(deck: Deck, actorId: string | null): boolean {
	return !deck.ownerId || Boolean(actorId && deck.ownerId === actorId);
}

export function canViewDeck(deck: Deck, viewer: DeckViewer): boolean {
	if (!deck.ownerId) return true;
	if (canEditDeck(deck, viewer.actorId)) return true;
	const visibility = deckVisibility(deck);
	if (visibility === 'link') return true;
	if (visibility === 'team') return Boolean(viewer.teamId && deck.teamId === viewer.teamId);
	return false;
}
