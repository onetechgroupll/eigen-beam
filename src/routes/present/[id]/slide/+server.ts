import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { endRoom, setSlide } from '$lib/server/rooms';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	// Token aus dem httpOnly-Cookie (Härtung: nicht mehr im Query-String).
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	const body = await request.json().catch(() => ({}) as Record<string, unknown>);
	const r = setSlide(params.id, token, Number((body as { slide?: number }).slide));
	if (!r.ok) return json({ error: true }, { status: r.status ?? 400 });
	return json({ current: r.current });
};

export const DELETE: RequestHandler = async ({ params, cookies }) => {
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	const r = endRoom(params.id, token);
	if (!r.ok) {
		return json(
			{ error: true, code: r.code, message: r.code === 'already_ended' ? 'Session bereits beendet.' : undefined, endedAt: r.endedAt, stats: r.stats, questions: r.questions },
			{ status: r.status ?? 400 }
		);
	}
	return json({ ok: true, endedAt: r.endedAt, stats: r.stats, questions: r.questions });
};
