import { publicSlidesToSource, toPublicSlides, type Deck, type PublicSlide } from '$lib/decks';
import { canEditDeck } from '$lib/server/deck-access';

export type PublicDeckExportJson = {
	id: string;
	title: string;
	slideCount: number;
	updatedAt: number;
	slides: PublicSlide[];
};

export type OwnerDeckExportJson = PublicDeckExportJson & {
	source: string;
};

export function deckToPublicExportMarkdown(deck: Deck): string {
	return publicSlidesToSource(toPublicSlides(deck.slides));
}

export function deckToPublicExportJson(deck: Deck): PublicDeckExportJson {
	const slides = toPublicSlides(deck.slides);
	return {
		id: deck.id,
		title: deck.title,
		slideCount: slides.length,
		updatedAt: deck.updatedAt,
		slides
	};
}

export function deckToOwnerExportMarkdown(deck: Deck): string {
	return deck.source;
}

export function deckToOwnerExportJson(deck: Deck): OwnerDeckExportJson {
	return {
		...deckToPublicExportJson(deck),
		source: deck.source
	};
}

/** Owner-Entscheidung testbar gehalten: Die Route reicht nur den Actor herein. */
export function deckExportMarkdownFor(deck: Deck, actorId: string | null): string {
	return canEditDeck(deck, actorId) ? deckToOwnerExportMarkdown(deck) : deckToPublicExportMarkdown(deck);
}

export function deckExportJsonFor(deck: Deck, actorId: string | null): PublicDeckExportJson | OwnerDeckExportJson {
	return canEditDeck(deck, actorId) ? deckToOwnerExportJson(deck) : deckToPublicExportJson(deck);
}

export function deckExportFilename(title: string, ext: 'md' | 'json'): string {
	const slug = title
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
	return `${slug || 'deck'}.${ext}`;
}

export function attachmentHeaders(filename: string, contentType: string): Headers {
	return new Headers({
		'content-type': contentType,
		'content-disposition': `attachment; filename="${filename}"`,
		'cache-control': 'private, max-age=0, must-revalidate'
	});
}
