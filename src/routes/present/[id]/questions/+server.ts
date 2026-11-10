import type { RequestHandler } from './$types';
import { getRoom } from '$lib/server/rooms';

export const GET: RequestHandler = ({ params, cookies }) => {
	const room = getRoom(params.id);
	if (!room) return new Response('Room nicht gefunden', { status: 404 });
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	if (token !== room.presenterToken) return new Response('Kein Presenter-Zugriff', { status: 403 });
	const questions = room.events.filter((event): event is Extract<typeof event, { type: 'question' }> => event.type === 'question');
	const markdown = ['# Fragen aus der Session', '', ...questions.map((question) => `- F${question.slide + 1}: ${question.text}`), ''].join('\n');
	return new Response(markdown, {
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename="eigen-beam-${params.id}-fragen.md"`,
			'cache-control': 'no-store'
		}
	});
};
