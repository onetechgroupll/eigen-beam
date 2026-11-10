import type { RequestHandler } from './$types';
import { deckViewerFromCookies, canViewDeck } from '$lib/server/deck-access';
import { attachmentHeaders, deckExportFilename, deckExportJsonFor, deckExportMarkdownFor } from '$lib/server/deck-export';
import { getDeckRepo, isValidDeckId } from '$lib/server/decks-repo';
import { getActorId } from '$lib/server/identity';
import { apiError } from '$lib/server/api-error';

type ExportFormat = 'md' | 'json';

export const GET: RequestHandler = async ({ params, cookies, locals }) => {
	if (!isValidDeckId(params.id)) return apiError({ locals }, 'deck_not_found', 404);
	const format = parseFormat(params.format);
	if (!format) return apiError({ locals }, 'export_format_not_found', 404);
	const deck = await getDeckRepo().get(params.id);
	if (!deck) return apiError({ locals }, 'deck_not_found', 404);
	if (!canViewDeck(deck, deckViewerFromCookies(cookies))) return apiError({ locals }, 'deck_forbidden', 403);
	const actorId = getActorId(cookies);

	if (format === 'json') {
		return new Response(JSON.stringify(deckExportJsonFor(deck, actorId), null, 2), {
			headers: attachmentHeaders(deckExportFilename(deck.title, 'json'), 'application/json; charset=utf-8')
		});
	}

	return new Response(deckExportMarkdownFor(deck, actorId), {
		headers: attachmentHeaders(deckExportFilename(deck.title, 'md'), 'text/markdown; charset=utf-8')
	});
};

function parseFormat(format: string | undefined): ExportFormat | null {
	if (format === 'md' || format === 'markdown') return 'md';
	if (format === 'json') return 'json';
	return null;
}
