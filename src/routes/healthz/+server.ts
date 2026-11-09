import { json, type RequestHandler } from '@sveltejs/kit';
import { livenessPayload } from '$lib/server/health';

export const GET: RequestHandler = async () => {
	return json(livenessPayload(), { headers: { 'cache-control': 'no-store' } });
};
