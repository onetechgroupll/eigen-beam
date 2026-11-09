import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getRoom } from '$lib/server/rooms';

export const load: PageServerLoad = ({ params, cookies }) => {
	const room = getRoom(params.id);
	if (!room) throw error(404, 'Room nicht gefunden');
	if (room.ended) throw error(410, 'Session beendet');
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	if (token !== room.presenterToken) throw error(403, 'Kein Presenter-Zugriff');
	return {
		id: params.id,
		stats: room.stats,
		current: room.current,
		slideCount: room.slides.length,
		startedAt: room.stats.startedAt
	};
};
