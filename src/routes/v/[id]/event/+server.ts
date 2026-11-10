import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authSigningSecret, verifyPinUnlockToken } from '$lib/server/auth';
import { getRoom, recordViewerEvent } from '$lib/server/rooms';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-error';

export const POST: RequestHandler = async (event) => {
	const { params, request, cookies, getClientAddress } = event;
	const limited = rateLimit(clientRateLimitKey('viewer-event', getClientAddress, params.id), RATE_LIMITS.viewerEvent, event.locals.locale);
	if (limited) return limited;
	const room = getRoom(params.id);
	if (!room || room.ended) return apiError(event, 'room_ended', 410);
	if (room.pin && !verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret())) return apiError(event, 'pin_required', 403);
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const r = recordViewerEvent(params.id, {
		type: typeof body.type === 'string' ? body.type : '',
		reaction: typeof body.reaction === 'string' ? body.reaction : undefined,
		text: typeof body.text === 'string' ? body.text : undefined,
		slide: typeof body.slide === 'number' ? body.slide : undefined
	});
	if (!r.ok) return apiError(event, r.status === 410 ? 'room_ended' : r.status === 403 ? 'pin_required' : body.type === 'question' ? 'question_required' : 'invalid_event', r.status ?? 400);
	return json({ ok: true });
};
