import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { toPublicSlides } from '$lib/decks';
import { authSigningSecret, verifyPinUnlockToken } from '$lib/server/auth';
import { getReplayPersistent, getRoom } from '$lib/server/rooms';
import { requestText } from '$lib/server/locale';

export const load: PageServerLoad = async ({ params, cookies, locals }) => {
	const room = getRoom(params.id);
	if (room) {
		const pinOk = !room.pin || verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret());
		return { id: params.id, slides: pinOk ? toPublicSlides(room.slides) : [], current: pinOk ? room.current : 0, needsPin: !pinOk, ended: room.ended };
	}
	const replay = await getReplayPersistent(params.id);
	if (!replay) throw error(410, requestText({ locals }, 'api.room_ended'));
	const pinOk = !replay.protected || verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret());
	const lastSlide = [...replay.events].reverse().find((event) => event.type === 'end' || event.type === 'slide')?.slide ?? 0;
	return { id: params.id, slides: pinOk ? replay.slides : [], current: pinOk ? lastSlide : 0, needsPin: !pinOk, ended: true };
};
