import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { toPublicSlides } from '$lib/decks';
import { authSigningSecret, verifyPinUnlockToken } from '$lib/server/auth';
import { getRoom } from '$lib/server/rooms';

export const load: PageServerLoad = ({ params, cookies }) => {
	const room = getRoom(params.id);
	if (!room || room.ended) throw error(410, 'Diese Präsentation ist beendet.');
	const pinOk = !room.pin || verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret());
	return { id: params.id, slides: pinOk ? toPublicSlides(room.slides) : [], current: pinOk ? room.current : 0, needsPin: !pinOk };
};
