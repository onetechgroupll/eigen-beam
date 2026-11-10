import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getRoom } from '$lib/server/rooms';
import { requestText } from '$lib/server/locale';

export const load: PageServerLoad = ({ params, cookies, locals }) => {
	const room = getRoom(params.id);
	if (!room) throw error(404, requestText({ locals }, 'api.room_not_found'));
	if (room.ended) throw error(410, requestText({ locals }, 'api.room_ended'));
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	if (token !== room.presenterToken) throw error(403, requestText({ locals }, 'api.presenter_forbidden'));
	return {
		id: params.id,
		stats: room.stats,
		current: room.current,
		slideCount: room.slides.length,
		startedAt: room.stats.startedAt
	};
};
