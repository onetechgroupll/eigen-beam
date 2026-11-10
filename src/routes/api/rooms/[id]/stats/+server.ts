import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { timingSafeEqual } from 'node:crypto';
import { getRoomStats } from '$lib/server/rooms';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-error';

export const GET: RequestHandler = async ({ params, request, getClientAddress, locals }) => {
	const limited = rateLimit(clientRateLimitKey('stats', getClientAddress, params.id), RATE_LIMITS.stats, locals.locale);
	if (limited) return limited;
	const secret = process.env.EB_STATS_SECRET;
	const auth = request.headers.get('authorization') ?? '';
	const provided = request.headers.get('x-eigenbeam-stats-secret') ?? (auth.startsWith('Bearer ') ? auth.slice(7) : '');
	const allowed = Boolean(secret) && safeEqual(provided, secret ?? '');
	if (!allowed) return apiError({ locals }, 'forbidden', 403);
	const stats = getRoomStats(params.id);
	if (!stats) return apiError({ locals }, 'room_not_found', 404);
	return json({ stats });
};

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}
