// Stdio-/mcp-remote-Smoke für das repo-lokale Claude-Code-MCP-Setup.
// Default: side-effect-arm, prüft Wrapper + Auth + initialize/tools/list.
// Mit EB_MCP_SMOKE_MUTATE=1 werden zusätzlich echte Tools gecallt (Deck/Room/Asset).
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { env, exit } from 'node:process';

type JsonRpcResponse = {
	jsonrpc?: string;
	id?: number | string | null;
	result?: unknown;
	error?: { code?: number; message?: string };
};

type McpTool = { name?: unknown };
type McpToolWithDescription = McpTool & { description?: unknown };
type McpToolsList = { tools?: McpTool[] };
type McpStructured = { structuredContent?: Record<string, unknown> };

const WRAPPER = env.EB_MCP_WRAPPER ?? './scripts/eigenbeam-mcp.sh';
const HTTP_BASE = (env.EB_MCP_HTTP_BASE ?? env.EB_SMOKE_BASE ?? 'https://eigen-beam-production.up.railway.app').replace(/\/$/, '');
const MUTATE = env.EB_MCP_SMOKE_MUTATE === '1';
const EXPECTED_TOOLS = ['create_deck', 'get_deck', 'update_deck', 'create_room', 'upload_asset'];
const REQUEST_TIMEOUT_MS = Number(env.EB_MCP_SMOKE_TIMEOUT_MS ?? 45_000);
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=';

let nextId = 1;
let passed = 0;

function ok(name: string) {
	passed++;
	console.log(`  ✓ ${name}`);
}

function asRecord(value: unknown): Record<string, unknown> {
	assert.equal(typeof value, 'object');
	assert.notEqual(value, null);
	return value as Record<string, unknown>;
}

function structured(result: unknown): Record<string, unknown> {
	const record = asRecord(result) as McpStructured;
	assert.equal(typeof record.structuredContent, 'object');
	assert.notEqual(record.structuredContent, null);
	return record.structuredContent!;
}

class StdioMcpClient {
	private child: ChildProcessWithoutNullStreams;
	private buffer = '';
	private stderr = '';
	private pending = new Map<number, { resolve: (value: JsonRpcResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

	constructor(command: string) {
		this.child = spawn('bash', [command], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
		this.child.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk));
		this.child.stderr.on('data', (chunk: Buffer) => {
			this.stderr += chunk.toString('utf8');
		});
		this.child.on('exit', (code, signal) => {
			const message = `MCP wrapper exited (${signal ?? code ?? 'unknown'}).${this.stderr ? ` stderr:\n${this.stderr}` : ''}`;
			for (const { reject, timer } of this.pending.values()) {
				clearTimeout(timer);
				reject(new Error(message));
			}
			this.pending.clear();
		});
	}

	async request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
		const id = nextId++;
		const response = await new Promise<JsonRpcResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Timeout waiting for ${method}.${this.stderr ? ` stderr:\n${this.stderr}` : ''}`));
			}, REQUEST_TIMEOUT_MS);
			this.pending.set(id, { resolve, reject, timer });
			this.write({ jsonrpc: '2.0', id, method, params });
		});
		if (response.error) throw new Error(`${method} failed: ${response.error.message ?? JSON.stringify(response.error)}`);
		return response;
	}

	notify(method: string, params?: Record<string, unknown>) {
		this.write({ jsonrpc: '2.0', method, params });
	}

	close() {
		this.child.stdin.end();
		this.child.kill();
	}

	private write(message: Record<string, unknown>) {
		// The MCP SDK stdio transport used by mcp-remote v0.1.x is newline-delimited
		// JSON-RPC, not LSP-style Content-Length framing.
		this.child.stdin.write(`${JSON.stringify(message)}\n`);
	}

	private onStdout(chunk: Buffer) {
		this.buffer += chunk.toString('utf8');
		while (true) {
			const lineEnd = this.buffer.indexOf('\n');
			if (lineEnd === -1) return;
			const line = this.buffer.slice(0, lineEnd).replace(/\r$/, '');
			this.buffer = this.buffer.slice(lineEnd + 1);
			if (!line.trim()) continue;
			const message = JSON.parse(line) as JsonRpcResponse;
			this.resolve(message);
		}
	}

	private resolve(message: JsonRpcResponse) {
		if (typeof message.id !== 'number') return;
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);
		clearTimeout(pending.timer);
		pending.resolve(message);
	}
}

async function main() {
	console.log(`MCP stdio smoke via ${WRAPPER}`);
	await verifyProtectedResourceDiscovery();
	const client = new StdioMcpClient(WRAPPER);
	try {
		const initialized = await client.request('initialize', {
			protocolVersion: '2025-06-18',
			capabilities: {},
			clientInfo: { name: 'eigenbeam-mcp-smoke', version: '0.1.0' }
		});
		assert.equal(typeof initialized.result, 'object');
		ok('initialize über Wrapper/mcp-remote erfolgreich');

		client.notify('notifications/initialized');

		const listed = await client.request('tools/list');
		const tools = (asRecord(listed.result) as McpToolsList).tools ?? [];
		const names = tools.map((tool) => String(tool.name)).sort();
		assert.deepEqual(names, [...EXPECTED_TOOLS].sort());
		ok(`tools/list liefert erwartete Tools: ${names.join(', ')}`);
		const createDeckDescription = String((tools as McpToolWithDescription[]).find((tool) => tool.name === 'create_deck')?.description ?? '');
		const updateDeckDescription = String((tools as McpToolWithDescription[]).find((tool) => tool.name === 'update_deck')?.description ?? '');
		assert.match(createDeckDescription, /Eine Idee pro Slide/);
		assert.match(createDeckDescription, /notes:/);
		assert.match(updateDeckDescription, /Eine Idee pro Slide/);
		ok('tools/list liefert MCP Deck-Qualitätsguidance an AI-Clients aus');

		if (MUTATE) await runMutatingSmoke(client);
		else ok('Mutating Tool-Calls übersprungen (setze EB_MCP_SMOKE_MUTATE=1 für Deck/Room/Asset-E2E)');
	} finally {
		client.close();
	}
	console.log(`MCP STDIO SMOKE PASS — ${passed} checks.`);
}

async function verifyProtectedResourceDiscovery() {
	const metaRes = await fetch(`${HTTP_BASE}/.well-known/oauth-protected-resource/mcp`, { headers: { accept: 'application/json' } });
	assert.equal(metaRes.status, 200, 'protected resource metadata endpoint returns 200');
	assert.equal(metaRes.headers.get('cache-control'), 'no-store');
	const raw = await metaRes.text();
	const metadata = JSON.parse(raw) as { resource?: unknown; bearer_methods_supported?: unknown; scopes_supported?: unknown };
	assert.equal(metadata.resource, `${HTTP_BASE}/mcp`);
	assert.deepEqual(metadata.bearer_methods_supported, ['header']);
	assert.ok(Array.isArray(metadata.scopes_supported) && metadata.scopes_supported.includes('deck:read'));
	assert.equal(raw.includes('postgres://'), false);
	assert.equal(raw.includes('Bearer '), false);
	ok('OAuth protected-resource metadata ist erreichbar und secret-safe');

	const unauthorized = await fetch(`${HTTP_BASE}/mcp`, {
		method: 'POST',
		headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'unauth-smoke', version: '0' } } })
	});
	assert.equal(unauthorized.status, 401, 'unauthenticated MCP initialize returns 401');
	assert.match(unauthorized.headers.get('www-authenticate') ?? '', /resource_metadata=/);
	ok('Unauthenticated /mcp liefert WWW-Authenticate Discovery-Challenge');
}

async function runMutatingSmoke(client: StdioMcpClient) {
	const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
	const created = await client.request('tools/call', {
		name: 'create_deck',
		arguments: {
			title: `MCP Smoke ${suffix}`,
			source: '# MCP Smoke\n\nWrapper-smoke.\n---\n# Zweite Folie\n\nUpdate folgt.'
		}
	});
	const createdData = structured(created.result);
	const deckId = String(createdData.id);
	assert.ok(deckId.length > 0);
	assert.equal(createdData.slideCount, 2);
	ok(`create_deck legt Test-Deck an (${deckId})`);

	const read = await client.request('tools/call', { name: 'get_deck', arguments: { id: deckId } });
	assert.equal(structured(read.result).id, deckId);
	ok('get_deck liest das angelegte Deck zurück');

	await client.request('tools/call', {
		name: 'update_deck',
		arguments: {
			id: deckId,
			title: `MCP Smoke Updated ${suffix}`,
			source: '# MCP Smoke Updated\n\nAktualisiert über stdio-Smoke.\n---\n# Abschluss\n\nFertig.'
		}
	});
	const reread = await client.request('tools/call', { name: 'get_deck', arguments: { id: deckId } });
	assert.equal(structured(reread.result).title, `MCP Smoke Updated ${suffix}`);
	ok('update_deck schreibt eine neue Deck-Version, get_deck bestätigt sie');

	const room = await client.request('tools/call', { name: 'create_room', arguments: { deckId } });
	const roomData = structured(room.result);
	assert.equal(roomData.deckId, deckId);
	assert.equal(typeof roomData.viewerUrl, 'string');
	assert.equal(roomData.protected, false);
	ok('create_room startet eine Viewer-Session ohne Presenter-Token-Leak');

	const asset = await client.request('tools/call', {
		name: 'upload_asset',
		arguments: { filename: `mcp-smoke-${suffix}.png`, imageBase64: PNG_1X1_BASE64, alt: 'MCP Smoke Pixel' }
	});
	const assetData = structured(asset.result);
	assert.equal(assetData.mime, 'image/png');
	assert.match(String(assetData.markdown), /^!\[MCP Smoke Pixel\]\((https?:\/\/|\/)/);
	ok('upload_asset lädt ein kleines PNG hoch und liefert Markdown');
}

main().catch((error) => {
	console.error(error);
	exit(1);
});
