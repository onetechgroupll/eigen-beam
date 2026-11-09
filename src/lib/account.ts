import type { Deck, DeckVisibility } from './decks';

export type AccountSession = { email: string; userId: string };

export type AccountProfile = {
	email: string;
	userId: string;
	teamId: string;
	teamLabel: string;
};

export type DeckLibraryItem = {
	id: string;
	title: string;
	slideCount: number;
	updatedAt: number;
	createdAt: number;
	visibility: DeckVisibility;
	teamId: string | null;
	editable: boolean;
	editUrl: string | null;
	presentUrl: string | null;
	shareUrl: string;
	recapUrl: string;
};

export function teamIdForEmail(email: string): string {
	const domain = emailDomain(email);
	return `team_${domain.replace(/[^a-z0-9.-]/g, '_')}`;
}

export function accountProfileFromSession(session: AccountSession | null): AccountProfile | null {
	if (!session) return null;
	const email = normalizeEmail(session.email);
	const domain = emailDomain(email);
	return {
		email,
		userId: session.userId,
		teamId: `team_${domain.replace(/[^a-z0-9.-]/g, '_')}`,
		teamLabel: domain
	};
}

export function deckVisibility(deck: Deck): DeckVisibility {
	return deck.visibility ?? 'private';
}

export function toDeckLibraryItems(decks: Deck[], options: { editable?: boolean } = {}): DeckLibraryItem[] {
	const editable = options.editable ?? true;
	return [...decks]
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.map((deck) => ({
			id: deck.id,
			title: deck.title || 'Unbenanntes Deck',
			slideCount: deck.slides.length,
			updatedAt: deck.updatedAt,
			createdAt: deck.createdAt,
			visibility: deckVisibility(deck),
			teamId: deck.teamId ?? null,
			editable,
			editUrl: editable ? `/edit/${deck.id}` : null,
			presentUrl: editable ? `/edit/${deck.id}` : null,
			shareUrl: `/share/${deck.id}`,
			recapUrl: `/recap/${deck.id}`
		}));
}

function emailDomain(email: string): string {
	return normalizeEmail(email).split('@')[1] || 'unknown.local';
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}