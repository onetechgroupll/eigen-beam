import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from 'node:process';
import { createOAuthAccessToken, findOAuthClient, oauthServerConfigured, requestedOAuthScopes } from '$lib/server/oauth-server';

export const POST: RequestHandler = async ({ request }) => {
	if (!oauthServerConfigured(env)) return oauthError('server_disabled', 404);

	const body = await tokenRequestBody(request);
	if (!body) return oauthError('invalid_request', 400);
	if (body.grantType !== 'client_credentials') return oauthError('unsupported_grant_type', 400);

	const credentials = clientCredentials(request, body);
	if (!credentials) return oauthError('invalid_client', 401);
	const client = findOAuthClient(credentials.clientId, credentials.clientSecret, env);
	if (!client) return oauthError('invalid_client', 401);
	const scopes = requestedOAuthScopes(body.scope, client);
	if (!scopes) return oauthError('invalid_scope', 400);

	const expiresIn = 3600;
	const accessToken = createOAuthAccessToken({ clientId: client.clientId, scopes, secret: env.EB_OAUTH_TOKEN_SECRET!, ttlSeconds: expiresIn });
	return json({
		access_token: accessToken,
		token_type: 'Bearer',
		expires_in: expiresIn,
		scope: scopes.join(' ')
	}, { headers: { 'cache-control': 'no-store' } });
};

type TokenRequestBody = { grantType: string; clientId: string; clientSecret: string; scope: string };

async function tokenRequestBody(request: Request): Promise<TokenRequestBody | null> {
	const contentType = request.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		const body = await request.json().catch(() => null) as { grant_type?: unknown; client_id?: unknown; client_secret?: unknown; scope?: unknown } | null;
		if (!body) return null;
		return { grantType: String(body.grant_type ?? ''), clientId: String(body.client_id ?? ''), clientSecret: String(body.client_secret ?? ''), scope: String(body.scope ?? '') };
	}
	const form = await request.formData().catch(() => null);
	if (!form) return null;
	return { grantType: String(form.get('grant_type') ?? ''), clientId: String(form.get('client_id') ?? ''), clientSecret: String(form.get('client_secret') ?? ''), scope: String(form.get('scope') ?? '') };
}

function clientCredentials(request: Request, body: TokenRequestBody): { clientId: string; clientSecret: string } | null {
	const basic = request.headers.get('authorization');
	if (basic?.startsWith('Basic ')) {
		const decoded = Buffer.from(basic.slice(6), 'base64').toString('utf8');
		const separator = decoded.indexOf(':');
		if (separator > 0) return { clientId: decoded.slice(0, separator), clientSecret: decoded.slice(separator + 1) };
	}
	const clientId = body.clientId;
	const clientSecret = body.clientSecret;
	return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function oauthError(error: string, status: number) {
	return json({ error }, { status, headers: { 'cache-control': 'no-store' } });
}
