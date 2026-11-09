import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from 'node:process';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { mcpAuthContextFromHeader, mcpHasScopes, type McpScope } from '$lib/server/mcp-auth';
import { mcpUnauthorizedHeaders } from '$lib/server/mcp-oauth';
import { createEigenbeamMcpServer } from '$lib/server/mcp-server';
import { canonicalPublicOrigin } from '$lib/server/origin';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';

const CORS_HEADERS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
	'access-control-allow-headers': 'authorization,content-type,mcp-session-id,mcp-protocol-version,last-event-id',
	'access-control-expose-headers': 'mcp-session-id,mcp-protocol-version,www-authenticate'
};

export const OPTIONS: RequestHandler = async () => new Response(null, { status: 204, headers: CORS_HEADERS });

export const GET: RequestHandler = async () => mcpMethodNotAllowed();
export const DELETE: RequestHandler = async () => mcpMethodNotAllowed();

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	const limited = rateLimit(clientRateLimitKey('mcp', getClientAddress), RATE_LIMITS.mcp);
	if (limited) return withCors(limited);
	const auth = mcpAuthContextFromHeader(request.headers.get('authorization') ?? '', env);
	if (!auth) return json({ error: 'unauthorized' }, { status: 401, headers: { ...CORS_HEADERS, ...mcpUnauthorizedHeaders(canonicalPublicOrigin(url, env)) } });
	const scopeDenied = await denyIfToolScopeMissing(request, auth);
	if (scopeDenied) return scopeDenied;

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});
	const server = createEigenbeamMcpServer(canonicalPublicOrigin(url, env));
	try {
		await server.connect(transport);
		const response = await transport.handleRequest(request);
		return withCors(response);
	} catch (error) {
		console.error('[mcp] Request fehlgeschlagen:', error);
		return json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }, { status: 500, headers: CORS_HEADERS });
	} finally {
		await server.close().catch(() => undefined);
	}
};

function mcpMethodNotAllowed(): Response {
	return json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }, { status: 405, headers: CORS_HEADERS });
}

async function denyIfToolScopeMissing(request: Request, auth: NonNullable<ReturnType<typeof mcpAuthContextFromHeader>>): Promise<Response | null> {
	const body = await request.clone().json().catch(() => null) as { method?: unknown; params?: { name?: unknown } } | null;
	if (body?.method !== 'tools/call') return null;
	const name = typeof body.params?.name === 'string' ? body.params.name : '';
	const required = MCP_TOOL_SCOPES[name] ?? [];
	if (!required.length || mcpHasScopes(auth, required)) return null;
	return json({ jsonrpc: '2.0', error: { code: -32001, message: 'MCP token lacks required scope.' }, id: null }, { status: 403, headers: CORS_HEADERS });
}

const MCP_TOOL_SCOPES: Record<string, McpScope[]> = {
	create_deck: ['deck:write'],
	get_deck: ['deck:read'],
	update_deck: ['deck:write'],
	create_room: ['deck:read', 'room:create'],
	upload_asset: ['asset:upload']
};

function withCors(response: Response): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
