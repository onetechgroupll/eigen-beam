import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deckViewerFromCookies, canViewDeck } from '$lib/server/deck-access';
import { attachmentHeaders, deckExportFilename, deckToPublicExportJson, deckToPublicExportMarkdown } from '$lib/server/deck-export';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';

type ExportFormat = 'md' | 'json';

export const GET: RequestHandler = async ({ params, cookies }) => {
	if (!isValidDeckId(params.id)) throw error(404, 'Deck nicht gefunden');
	const format = parseFormat(params.format);
	if (!format) throw error(404, 'Export-Format nicht gefunden');
	const deck = await getDeckRepo().get(params.id);
	if (!deck) throw error(404, 'Deck nicht gefunden');
	if (!canViewDeck(deck, deckViewerFromCookies(cookies))) throw error(403, 'Kein Zugriff auf dieses Deck.');

	if (format === 'json') {
		return new Response(JSON.stringify(deckToPublicExportJson(deck), null, 2), {
			headers: attachmentHeaders(deckExportFilename(deck.title, 'json'), 'application/json; charset=utf-8')
		});
	}

	return new Response(deckToPublicExportMarkdown(deck), {
		headers: attachmentHeaders(deckExportFilename(deck.title, 'md'), 'text/markdown; charset=utf-8')
	});
};

function parseFormat(format: string | undefined): ExportFormat | null {
	if (format === 'md' || format === 'markdown') return 'md';
	if (format === 'json') return 'json';
	return null;
}
