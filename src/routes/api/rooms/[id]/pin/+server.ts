import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authSigningSecret, createPinUnlockToken } from '$lib/server/auth';
import { clientRateLimitKey, rateLimit, RATE_LIMITS } from '$lib/server/rate-limit';
import { verifyRoomPin } from '$lib/server/rooms';

export const POST: RequestHandler = async ({ params, request, cookies, getClientAddress }) => {
	const limited = rateLimit(clientRateLimitKey('room-pin', getClientAddress, params.id), RATE_LIMITS.roomPin);
	if (limited) return limited;
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
	if (!verifyRoomPin(params.id, pin)) return json({ error: true, message: 'Falsche PIN.' }, { status: 403 });
	cookies.set(`eb_pin_${params.id}`, createPinUnlockToken(params.id, authSigningSecret()), { path: '/', httpOnly: true, sameSite: 'strict', maxAge: 60 * 60 * 12 });
	return json({ ok: true });
};
