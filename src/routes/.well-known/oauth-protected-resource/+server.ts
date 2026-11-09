import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from 'node:process';
import { mcpProtectedResourceMetadata } from '$lib/server/mcp-oauth';
import { canonicalPublicOrigin } from '$lib/server/origin';

export const GET: RequestHandler = async ({ url }) => {
	return json(mcpProtectedResourceMetadata(canonicalPublicOrigin(url, env), env), {
		headers: { 'cache-control': 'no-store' }
	});
};
