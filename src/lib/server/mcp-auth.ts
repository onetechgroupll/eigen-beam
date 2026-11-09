import { timingSafeEqual } from 'node:crypto';
import { env } from 'node:process';
import { verifyOAuthAccessToken } from './oauth-server';
import { warnInvalidEntry } from './config-warnings';

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
	splitTokens(source.EB_MCP_TOKENS).forEach((raw, index) => {
		const [tokenPart, scopesPart] = raw.split('|', 2);
		const token = tokenPart.trim();
		if (!token || seen.has(token)) return;
		// No `|` means full access (documented). With `|`, every scope must be
		// valid: a typo must fail closed, never widen to full access.
		const scopes = scopesPart === undefined ? (['*'] as McpScope[]) : parseScopes(scopesPart);
		if (!scopes) {
			warnInvalidEntry('EB_MCP_TOKENS', index);
			return;
		}
		seen.add(token);
		contexts.push({ token, scopes });
	});
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

/** Strict scope list: null when it is empty or contains anything unknown. */
function parseScopes(raw: string): McpScope[] | null {
	const allowed = new Set<McpScope>(['*', 'deck:read', 'deck:write', 'room:create', 'asset:upload']);
	const scopes = raw.split(/[+\s]+/).map((scope) => scope.trim()).filter(Boolean);
	if (!scopes.length || !scopes.every((scope) => allowed.has(scope as McpScope))) return null;
	return scopes as McpScope[];
}


function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}
