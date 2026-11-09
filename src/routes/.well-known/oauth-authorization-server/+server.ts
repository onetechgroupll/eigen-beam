import { json, type RequestHandler } from '@sveltejs/kit';
import { oauthAuthorizationServerMetadata } from '$lib/server/oauth-server';
import { canonicalPublicOrigin } from '$lib/server/origin';
import { env } from 'node:process';

export const GET: RequestHandler = async ({ url }) => {
	return json(oauthAuthorizationServerMetadata(canonicalPublicOrigin(url, env)), {
		headers: { 'cache-control': 'no-store' }
	});
};
