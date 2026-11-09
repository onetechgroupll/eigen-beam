import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Buffer } from 'node:buffer';
import * as z from 'zod/v4';
import type { Deck } from '$lib/decks';
import { buildDeckInput } from '$lib/server/deck-input';
import { sniffImage, storeAsset } from '$lib/server/assets';
import { DECK_CLAIM_PARAM, deckClaimToken } from '$lib/server/deck-access';
import { getDeckRepo } from '$lib/server/decks-repo';
import { createRoom } from '$lib/server/rooms';

export type McpDeckResult = {
	id: string;
	title: string;
	slideCount: number;
	editUrl: string;
	deckApiUrl: string;
	newRoomApiUrl: string;
};

export type McpDeckReadResult = McpDeckResult & {
	source: string;
	updatedAt: number;
};

export type McpRoomResult = {
	roomId: string;
	deckId: string;
	deckTitle: string;
	slideCount: number;
	viewerUrl: string;
	replayUrl: string;
	protected: boolean;
};

export type McpAssetResult = {
	key: string;
	url: string;
	mime: string;
	alt: string;
	markdown: string;
};

export const MCP_DECK_AUTHORING_GUIDANCE = 'Deck-Qualität: vertikal/mobile-first im 9:16-Format denken; Eine Idee pro Slide; kurze Headlines, knappe Bodies, keine Textwände; ideal 5–12, maximal ≤15 Slides; Speaker Notes strikt als notes: ... getrennt halten; --- trennt Slides; Bilder als ![Alt](https://...) oder Asset-Markdown einfügen; unterstützte Blöcke: type: number/quote/compare/timeline.';

export function createEigenbeamMcpServer(baseUrl: string): McpServer {
	const server = new McpServer({ name: 'eigenbeam', version: '0.1.0' });

	server.registerTool('create_deck', {
		title: 'Create eigen.beam deck',
		description: `Create a persisted eigen.beam slide deck from Markdown. ${MCP_DECK_AUTHORING_GUIDANCE}`,
		inputSchema: {
			title: z.string().max(120).describe('Internal deck title.'),
			source: z.string().max(50_000).describe(`Deck Markdown. ${MCP_DECK_AUTHORING_GUIDANCE}`),
			claimable: z.boolean().default(true).describe('Keep the deck unowned; opening the returned editUrl (it carries a signed claim token) makes that browser the owner. Defaults to true.')
		},
		outputSchema: {
			id: z.string(),
			title: z.string(),
			slideCount: z.number(),
			editUrl: z.string(),
			deckApiUrl: z.string(),
			newRoomApiUrl: z.string()
		},
		annotations: {
			title: 'Create deck',
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true
		}
	}, async ({ title, source }): Promise<{ content: Array<{ type: 'text'; text: string }>; structuredContent: McpDeckResult }> => {
		const parsed = buildDeckInput({ title, source });
		if (!parsed.ok) throw new Error(parsed.message);
		// MCP-created decks are intentionally unowned. Only the browser that opens
		// the signed editUrl (?claim=…) becomes the owner; nobody else can edit it.
		const deck = await getDeckRepo().create(parsed.input, null);
		const result = toMcpDeckResult(deck, baseUrl);
		return {
			content: [{ type: 'text', text: `Created eigen.beam deck "${result.title}" (${result.slideCount} slides): ${result.editUrl}` }],
			structuredContent: result
		};
	});

	server.registerTool('get_deck', {
		title: 'Get eigen.beam deck',
		description: 'Read a persisted eigen.beam deck including its Markdown source for authorized AI editing.',
		inputSchema: {
			id: z.string().describe('Deck id.')
		},
		outputSchema: {
			id: z.string(),
			title: z.string(),
			source: z.string(),
			slideCount: z.number(),
			updatedAt: z.number(),
			editUrl: z.string(),
			deckApiUrl: z.string(),
			newRoomApiUrl: z.string()
		},
		annotations: {
			title: 'Get deck',
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true
		}
	}, async ({ id }): Promise<{ content: Array<{ type: 'text'; text: string }>; structuredContent: McpDeckReadResult }> => {
		const deck = await getDeckRepo().get(id);
		if (!deck) throw new Error('Deck not found.');
		const result = toMcpDeckReadResult(deck, baseUrl);
		return {
			content: [{ type: 'text', text: `Loaded eigen.beam deck "${result.title}" (${result.slideCount} slides).` }],
			structuredContent: result
		};
	});

	server.registerTool('update_deck', {
		title: 'Update eigen.beam deck',
		description: `Replace a persisted eigen.beam deck from Markdown. Use get_deck first when editing existing content. ${MCP_DECK_AUTHORING_GUIDANCE}`,
		inputSchema: {
			id: z.string().describe('Deck id.'),
			title: z.string().max(120).describe('Updated deck title.'),
			source: z.string().max(50_000).describe(`Full replacement deck Markdown. ${MCP_DECK_AUTHORING_GUIDANCE}`)
		},
		outputSchema: {
			id: z.string(),
			title: z.string(),
			source: z.string(),
			slideCount: z.number(),
			updatedAt: z.number(),
			editUrl: z.string(),
			deckApiUrl: z.string(),
			newRoomApiUrl: z.string()
		},
		annotations: {
			title: 'Update deck',
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true
		}
	}, async ({ id, title, source }): Promise<{ content: Array<{ type: 'text'; text: string }>; structuredContent: McpDeckReadResult }> => {
		const parsed = buildDeckInput({ title, source });
		if (!parsed.ok) throw new Error(parsed.message);
		const existing = await getDeckRepo().get(id);
		if (!existing) throw new Error('Deck not found.');
		const deck = await getDeckRepo().update(id, parsed.input, null);
		if (!deck) throw new Error('Deck not found.');
		const result = toMcpDeckReadResult(deck, baseUrl);
		return {
			content: [{ type: 'text', text: `Updated eigen.beam deck "${result.title}" (${result.slideCount} slides): ${result.editUrl}` }],
			structuredContent: result
		};
	});

	server.registerTool('create_room', {
		title: 'Create eigen.beam room',
		description: 'Start a live viewer room from an existing deck. Returns viewer/replay URLs only; presenter tokens stay cookie-only and are never exposed through MCP.',
		inputSchema: {
			deckId: z.string().describe('Existing deck id to present.'),
			pin: z.string().max(24).optional().describe('Optional viewer PIN for the live room.')
		},
		outputSchema: {
			roomId: z.string(),
			deckId: z.string(),
			deckTitle: z.string(),
			slideCount: z.number(),
			viewerUrl: z.string(),
			replayUrl: z.string(),
			protected: z.boolean()
		},
		annotations: {
			title: 'Create room',
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true
		}
	}, async ({ deckId, pin }): Promise<{ content: Array<{ type: 'text'; text: string }>; structuredContent: McpRoomResult }> => {
		const deck = await getDeckRepo().get(deckId);
		if (!deck) throw new Error('Deck not found.');
		if (deck.slides.length === 0) throw new Error('Deck is empty.');
		const normalizedPin = pin?.trim() || undefined;
		const { id } = createRoom(deck.slides, { deckId: deck.id, pin: normalizedPin });
		const result = toMcpRoomResult({ roomId: id, deck, baseUrl, protected: Boolean(normalizedPin) });
		return {
			content: [{ type: 'text', text: `Created eigen.beam room for "${result.deckTitle}" (${result.slideCount} slides): ${result.viewerUrl}` }],
			structuredContent: result
		};
	});

	server.registerTool('upload_asset', {
		title: 'Upload eigen.beam asset',
		description: 'Upload a PNG/JPEG/WebP/GIF image from base64 data and return a URL plus ready-to-paste Markdown for deck slides.',
		inputSchema: {
			filename: z.string().max(160).describe('Original image filename, used for extension/alt fallback.'),
			imageBase64: z.string().max(7_100_000).describe('Base64-encoded image bytes. data:image/...;base64,... is also accepted.'),
			alt: z.string().max(120).optional().describe('Optional Markdown alt text. Defaults to filename without extension.')
		},
		outputSchema: {
			key: z.string(),
			url: z.string(),
			mime: z.string(),
			alt: z.string(),
			markdown: z.string()
		},
		annotations: {
			title: 'Upload asset',
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true
		}
	}, async ({ filename, imageBase64, alt }): Promise<{ content: Array<{ type: 'text'; text: string }>; structuredContent: McpAssetResult }> => {
		const file = mcpImageFileFromBase64({ filename, imageBase64 });
		const asset = await storeAsset(file);
		const result = toMcpAssetResult(asset, alt || filenameToAlt(filename));
		return {
			content: [{ type: 'text', text: `Uploaded eigen.beam asset (${result.mime}): ${result.markdown}` }],
			structuredContent: result
		};
	});

	return server;
}

export function toMcpDeckReadResult(deck: Deck, baseUrl: string): McpDeckReadResult {
	return {
		...toMcpDeckResult(deck, baseUrl),
		source: deck.source,
		updatedAt: deck.updatedAt
	};
}

export function toMcpRoomResult(input: { roomId: string; deck: Deck; baseUrl: string; protected?: boolean }): McpRoomResult {
	return {
		roomId: input.roomId,
		deckId: input.deck.id,
		deckTitle: input.deck.title,
		slideCount: input.deck.slides.length,
		viewerUrl: absoluteUrl(input.baseUrl, `/v/${input.roomId}`),
		replayUrl: absoluteUrl(input.baseUrl, `/replay/${input.roomId}`),
		protected: Boolean(input.protected)
	};
}

export function mcpImageFileFromBase64(input: { filename: string; imageBase64: string }): File {
	const encoded = stripDataUri(input.imageBase64).replace(/\s/g, '');
	if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
		throw new Error('Invalid base64 image data.');
	}
	const bytes = Buffer.from(encoded, 'base64');
	if (bytes.length === 0) throw new Error('Invalid base64 image data.');
	const mime = sniffImage(bytes) ?? 'application/octet-stream';
	return new File([bytes], safeFilename(input.filename), { type: mime });
}

export function toMcpAssetResult(asset: { key: string; url: string; mime: string }, alt: string): McpAssetResult {
	const safeAlt = safeMarkdownAlt(alt || 'Bild');
	return {
		key: asset.key,
		url: asset.url,
		mime: asset.mime,
		alt: safeAlt,
		markdown: `![${safeAlt}](${asset.url})`
	};
}

function toMcpDeckResult(deck: Deck, baseUrl: string): McpDeckResult {
	return {
		id: deck.id,
		title: deck.title,
		slideCount: deck.slides.length,
		editUrl: deckEditUrl(deck, baseUrl),
		deckApiUrl: absoluteUrl(baseUrl, `/api/decks/${deck.id}`),
		newRoomApiUrl: absoluteUrl(baseUrl, '/api/rooms')
	};
}

/** Unowned decks get the signed claim link; owned decks the plain editor URL. */
export function deckEditUrl(deck: Deck, baseUrl: string): string {
	const url = new URL(`/edit/${deck.id}`, baseUrl);
	if (!deck.ownerId) url.searchParams.set(DECK_CLAIM_PARAM, deckClaimToken(deck.id));
	return url.toString();
}

function absoluteUrl(baseUrl: string, path: string): string {
	return new URL(path, baseUrl).toString();
}

function stripDataUri(value: string): string {
	const match = value.match(/^data:[^,]+,([\s\S]*)$/);
	return match ? match[1] : value;
}

function safeFilename(filename: string): string {
	const cleaned = filename.trim().replace(/[/\\]/g, '-');
	return cleaned || 'asset.png';
}

function filenameToAlt(filename: string): string {
	return safeFilename(filename).replace(/\.[^.]+$/, '') || 'Bild';
}

function safeMarkdownAlt(alt: string): string {
	return alt.trim().replace(/[\]\n\r]/g, ' ').replace(/\s+/g, ' ').slice(0, 120) || 'Bild';
}
