import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { accountProfileFromSession, deckVisibility } from '$lib/account';
import type { Deck } from '$lib/decks';
import { authSigningSecret } from '$lib/server/auth';
import { getActorId, getUserSession } from '$lib/server/identity';

export type DeckViewer = {
	actorId: string | null;
	teamId: string | null;
};

export const DECK_CLAIM_PARAM = 'claim';

export function deckViewerFromCookies(cookies: Cookies): DeckViewer {
	const session = getUserSession(cookies);
	const profile = accountProfileFromSession(session);
	return { actorId: getActorId(cookies), teamId: profile?.teamId ?? null };
}

/**
 * Nur der Owner darf bearbeiten. Ein Deck ohne Owner (per MCP angelegt) hat
 * KEINEN Editor, bis es über den signierten Claim-Link übernommen wurde
 * (siehe `isValidDeckClaimToken` und `/edit/[id]`).
 */
export function canEditDeck(deck: Deck, actorId: string | null): boolean {
	return Boolean(deck.ownerId && actorId && deck.ownerId === actorId);
}

/** Öffentliche Slides (ohne Notes/Source). Unowned Decks verhalten sich wie visibility=link. */
export function canViewDeck(deck: Deck, viewer: DeckViewer): boolean {
	if (!deck.ownerId) return true;
	if (canEditDeck(deck, viewer.actorId)) return true;
	const visibility = deckVisibility(deck);
	if (visibility === 'link') return true;
	if (visibility === 'team') return Boolean(viewer.teamId && deck.teamId === viewer.teamId);
	return false;
}

/**
 * Claim-Token für ein unowned Deck: HMAC über die Deck-ID mit dem Auth-Secret.
 * Nur die MCP-Antwort (`editUrl`) trägt ihn. Nach dem Claim ist er wertlos, weil
 * das Deck dann einen Owner hat.
 */
export function deckClaimToken(deckId: string, secret: string = authSigningSecret()): string {
	return createHmac('sha256', secret).update(`deck-claim:${deckId}`).digest('base64url');
}

export function isValidDeckClaimToken(deckId: string, token: string | null | undefined, secret: string = authSigningSecret()): boolean {
	if (!token) return false;
	const expected = Buffer.from(deckClaimToken(deckId, secret));
	const actual = Buffer.from(token);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}
