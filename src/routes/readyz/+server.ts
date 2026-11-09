import { json, type RequestHandler } from '@sveltejs/kit';
import { readinessPayload } from '$lib/server/health';

export const GET: RequestHandler = async () => {
	const body = await readinessPayload();
	return json(body, {
		status: body.ok ? 200 : 503,
		headers: { 'cache-control': 'no-store' }
	});
};
