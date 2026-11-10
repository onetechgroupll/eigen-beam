import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authSigningSecret, createPinUnlockToken } from '$lib/server/auth';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { verifyRoomPinPersistent } from '$lib/server/rooms';
import { apiError } from '$lib/server/api-error';

export const POST: RequestHandler = async (event) => {
	const { params, request, cookies, getClientAddress } = event;
	const limited = rateLimit(clientRateLimitKey('room-pin', getClientAddress, params.id), RATE_LIMITS.roomPin, event.locals.locale);
	if (limited) return limited;
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
	if (!await verifyRoomPinPersistent(params.id, pin)) return apiError(event, 'pin_invalid', 403);
	cookies.set(`eb_pin_${params.id}`, createPinUnlockToken(params.id, authSigningSecret()), { path: '/', httpOnly: true, sameSite: 'strict', maxAge: 60 * 60 * 12 });
	return json({ ok: true });
};
