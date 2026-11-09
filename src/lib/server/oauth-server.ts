import { createHmac, timingSafeEqual } from 'node:crypto';
import { MCP_SUPPORTED_SCOPES } from './mcp-oauth';
import type { McpScope } from './mcp-auth';

type EnvLike = Record<string, string | undefined>;

export type OAuthClient = {
	clientId: string;
	clientSecret: string;
	scopes: McpScope[];
};

export type OAuthAccessTokenClaims = {
	clientId: string;
	scopes: McpScope[];
	expiresAt: number;
	issuedAt: number;
};

export type OAuthAuthorizationServerMetadata = {
	issuer: string;
	token_endpoint: string;
	grant_types_supported: ['client_credentials'];
	token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'];
	response_types_supported: [];
	scopes_supported: string[];
};

const DEFAULT_TTL_SECONDS = 3600;
const ALLOWED_SCOPES = new Set<McpScope>(MCP_SUPPORTED_SCOPES as readonly McpScope[]);

type JwtPayload = {
	iss: 'eigenbeam';
	sub: string;
	aud: 'mcp';
	scope: string;
	iat: number;
	exp: number;
};

export function parseOAuthClients(raw: string | undefined): OAuthClient[] {
	return (raw ?? '')
		.split(/[\n\r,]+/)
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [credentialPart, scopesPart] = entry.split('|', 2);
			const separator = credentialPart.indexOf(':');
			if (separator <= 0) return null;
			const clientId = credentialPart.slice(0, separator).trim();
			const clientSecret = credentialPart.slice(separator + 1).trim();
			if (!clientId || !clientSecret) return null;
			const scopes = parseOAuthScopes(scopesPart);
			return { clientId, clientSecret, scopes: scopes.length ? scopes : [...MCP_SUPPORTED_SCOPES] as McpScope[] };
		})
		.filter((client): client is OAuthClient => Boolean(client));
}

export function oauthAuthorizationServerMetadata(baseUrl: string): OAuthAuthorizationServerMetadata {
	const origin = baseUrl.replace(/\/$/, '');
	return {
		issuer: origin,
		token_endpoint: `${origin}/oauth/token`,
		grant_types_supported: ['client_credentials'],
		token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
		response_types_supported: [],
		scopes_supported: [...MCP_SUPPORTED_SCOPES]
	};
}

export function createOAuthAccessToken(input: { clientId: string; scopes: McpScope[]; secret: string; now?: number; ttlSeconds?: number }): string {
	const now = Math.floor(input.now ?? Date.now() / 1000);
	const ttlSeconds = Math.max(60, Math.min(input.ttlSeconds ?? DEFAULT_TTL_SECONDS, 86_400));
	const scopes = input.scopes.filter((scope) => ALLOWED_SCOPES.has(scope));
	const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const payload = base64UrlEncode(JSON.stringify({
		iss: 'eigenbeam',
		sub: input.clientId,
		aud: 'mcp',
		scope: scopes.join(' '),
		iat: now,
		exp: now + ttlSeconds
	} satisfies JwtPayload));
	const signed = `${header}.${payload}`;
	return `${signed}.${sign(signed, input.secret)}`;
}

export function verifyOAuthAccessToken(token: string, secret: string | undefined, now: number = Math.floor(Date.now() / 1000)): OAuthAccessTokenClaims | null {
	if (!secret) return null;
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const signed = `${parts[0]}.${parts[1]}`;
	if (!safeEqual(parts[2], sign(signed, secret))) return null;
	const payload = decodePayload(parts[1]);
	if (!payload || payload.iss !== 'eigenbeam' || payload.aud !== 'mcp') return null;
	if (!Number.isFinite(payload.exp) || payload.exp <= now) return null;
	const scopes = parseOAuthScopes(payload.scope);
	if (!scopes.length) return null;
	return { clientId: payload.sub, scopes, expiresAt: payload.exp, issuedAt: payload.iat };
}

export function findOAuthClient(clientId: string, clientSecret: string, source: EnvLike): OAuthClient | null {
	return parseOAuthClients(source.EB_OAUTH_CLIENTS).find((client) => client.clientId === clientId && safeEqual(client.clientSecret, clientSecret)) ?? null;
}

export function oauthServerConfigured(source: EnvLike): boolean {
	return Boolean(source.EB_OAUTH_TOKEN_SECRET && parseOAuthClients(source.EB_OAUTH_CLIENTS).length);
}

export function requestedOAuthScopes(raw: string | undefined, client: OAuthClient): McpScope[] | null {
	const requested = parseRequestedOAuthScopes(raw);
	if (requested === null) return null;
	if (!requested.length) return client.scopes;
	return requested.every((scope) => client.scopes.includes(scope)) ? requested : null;
}

function parseRequestedOAuthScopes(raw: string | undefined): McpScope[] | null {
	const tokens = (raw ?? '').split(/[+\s]+/).map((scope) => scope.trim()).filter(Boolean);
	if (!tokens.length) return [];
	if (!tokens.every((scope) => ALLOWED_SCOPES.has(scope as McpScope))) return null;
	return tokens as McpScope[];
}

function parseOAuthScopes(raw: string | undefined): McpScope[] {
	return (raw ?? '')
		.split(/[+\s]+/)
		.map((scope) => scope.trim() as McpScope)
		.filter((scope) => ALLOWED_SCOPES.has(scope));
}

function sign(value: string, secret: string): string {
	return createHmac('sha256', secret).update(value).digest('base64url');
}

function base64UrlEncode(value: string): string {
	return Buffer.from(value).toString('base64url');
}

function decodePayload(encoded: string): JwtPayload | null {
	try {
		const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<JwtPayload>;
		if (typeof parsed.sub !== 'string' || typeof parsed.scope !== 'string' || typeof parsed.iat !== 'number' || typeof parsed.exp !== 'number') return null;
		return parsed as JwtPayload;
	} catch {
		return null;
	}
}

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}
