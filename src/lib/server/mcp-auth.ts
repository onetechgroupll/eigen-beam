import { timingSafeEqual } from 'node:crypto';
import { env } from 'node:process';
import { verifyOAuthAccessToken } from './oauth-server';

export type McpScope = '*' | 'deck:read' | 'deck:write' | 'room:create' | 'asset:upload';
export type McpAuthContext = { token: string; scopes: McpScope[] };

export function isMcpBearerAuthorized(authHeader: string, source: Record<string, string | undefined> = env): boolean {
	return Boolean(mcpAuthContextFromHeader(authHeader, source));
}

export function mcpAuthContextFromHeader(authHeader: string, source: Record<string, string | undefined> = env): McpAuthContext | null {
	const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
	if (!provided) return null;
	const staticContext = mcpAuthContextsFromEnv(source).find((ctx) => safeEqual(provided, ctx.token));
	if (staticContext) return staticContext;
	const oauth = verifyOAuthAccessToken(provided, source.EB_OAUTH_TOKEN_SECRET);
	return oauth ? { token: provided, scopes: oauth.scopes } : null;
}

export function mcpBearerTokensFromEnv(source: Record<string, string | undefined> = env): string[] {
	return mcpAuthContextsFromEnv(source).map((ctx) => ctx.token);
}

export function mcpAuthContextsFromEnv(source: Record<string, string | undefined> = env): McpAuthContext[] {
	const seen = new Set<string>();
	const contexts: McpAuthContext[] = [];
	for (const token of splitTokens(source.EB_MCP_TOKEN)) {
		if (seen.has(token)) continue;
		seen.add(token);
		contexts.push({ token, scopes: ['*'] });
	}
	for (const raw of splitTokens(source.EB_MCP_TOKENS)) {
		const [tokenPart, scopesPart] = raw.split('|', 2);
		const token = tokenPart.trim();
		if (!token || seen.has(token)) continue;
		seen.add(token);
		const scopes = parseScopes(scopesPart);
		contexts.push({ token, scopes: scopes.length ? scopes : ['*'] });
	}
	return contexts;
}

export function mcpHasScopes(ctx: McpAuthContext, required: McpScope[]): boolean {
	if (ctx.scopes.includes('*')) return true;
	return required.every((scope) => ctx.scopes.includes(scope));
}

function splitTokens(raw: string | undefined): string[] {
	return (raw ?? '')
		.split(/[\n\r,]+/)
		.map((token) => token.trim())
		.filter(Boolean);
}

function parseScopes(raw: string | undefined): McpScope[] {
	const allowed = new Set<McpScope>(['*', 'deck:read', 'deck:write', 'room:create', 'asset:upload']);
	return (raw ?? '')
		.split(/[+\s]+/)
		.map((scope) => scope.trim() as McpScope)
		.filter((scope) => allowed.has(scope));
}

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}
