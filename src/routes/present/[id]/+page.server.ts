import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getRoom } from '$lib/server/rooms';
import { requestText } from '$lib/server/locale';

export const load: PageServerLoad = ({ params, cookies, locals }) => {
	const room = getRoom(params.id);
	if (!room) throw error(404, requestText({ locals }, 'api.room_not_found'));
	// Token aus dem httpOnly-Cookie (Härtung: nicht mehr im Query-String).
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	if (token !== room.presenterToken) throw error(403, requestText({ locals }, 'api.presenter_forbidden'));
	return {
		id: params.id,
		slides: room.slides,
		current: room.current,
		stats: { ...room.stats },
		ended: room.ended,
		endedAt: room.endedAt ?? null,
		questions: room.events
			.filter((event): event is Extract<typeof event, { type: 'question' }> => event.type === 'question')
			.map(({ text, slide, ts }) => ({ text, slide, ts }))
	};
};
