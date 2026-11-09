// Geteilte Validierung + Parsing für POST/PUT /api/decks. Public-URL → harte Limits
// gegen Memory-/Storage-Abuse (kompatibel zur bestehenden Härtung der Live-Surface).
import { parseDeck } from '$lib/deck-parse';
import type { DeckInput } from '$lib/server/decks-repo';

export const MAX_SOURCE_LEN = 50_000;
export const MAX_TITLE_LEN = 120;
export const MAX_SLIDES = 60;

export type ParseResult =
	| { ok: true; input: DeckInput }
	| { ok: false; status: number; message: string };

export function buildDeckInput(body: unknown): ParseResult {
	const b = (body ?? {}) as Record<string, unknown>;
	const source = typeof b.source === 'string' ? b.source : '';
	if (source.length > MAX_SOURCE_LEN) {
		return { ok: false, status: 413, message: `Markdown zu lang (max. ${MAX_SOURCE_LEN} Zeichen).` };
	}

	const rawTitle = typeof b.title === 'string' ? b.title.trim() : '';
	const title = (rawTitle || 'Unbenannt').slice(0, MAX_TITLE_LEN);

	const slides = parseDeck(source);
	if (slides.length === 0) {
		return {
			ok: false,
			status: 400,
			message: 'Deck braucht mindestens eine Folie. Tipp: „# Headline", „---" trennt Folien.'
		};
	}
	if (slides.length > MAX_SLIDES) {
		return { ok: false, status: 400, message: `Zu viele Folien (max. ${MAX_SLIDES}).` };
	}

	return { ok: true, input: { title, source, slides } };
}
