import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { endRoom, setSlide } from '$lib/server/rooms';
import { apiError } from '$lib/server/api-error';

export const POST: RequestHandler = async (event) => {
	const { params, request, cookies } = event;
	// Token aus dem httpOnly-Cookie (Härtung: nicht mehr im Query-String).
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	const body = await request.json().catch(() => ({}) as Record<string, unknown>);
	const r = setSlide(params.id, token, Number((body as { slide?: number }).slide));
	if (!r.ok) return apiError(event, r.status === 403 ? 'presenter_forbidden' : r.status === 410 ? 'room_ended' : 'room_not_found', r.status ?? 400);
	return json({ current: r.current });
};

export const DELETE: RequestHandler = async (event) => {
	const { params, cookies } = event;
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	const r = endRoom(params.id, token);
	if (!r.ok) {
		const code = r.code === 'already_ended' ? 'already_ended' : r.status === 403 ? 'presenter_forbidden' : r.status === 404 ? 'room_not_found' : 'room_ended';
		return apiError(event, code, r.status ?? 400, undefined, { endedAt: r.endedAt, stats: r.stats, questions: r.questions });
	}
	return json({ ok: true, endedAt: r.endedAt, stats: r.stats, questions: r.questions });
};
