import type { RequestHandler } from './$types';
import { getRoom, subscribePresenter } from '$lib/server/rooms';
import { requestText } from '$lib/server/locale';

export const GET: RequestHandler = ({ params, cookies, locals }) => {
	const room = getRoom(params.id);
	if (!room) return new Response(requestText({ locals }, 'api.room_not_found'), { status: 404 });
	if (room.ended) return new Response(requestText({ locals }, 'api.room_ended'), { status: 410 });
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	if (token !== room.presenterToken) return new Response(requestText({ locals }, 'api.presenter_forbidden'), { status: 403 });
	let unsub: (() => void) | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let cleanup = () => {};

	const stream = new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			let closed = false;
			cleanup = () => {
				if (closed) return;
				closed = true;
				if (unsub) unsub();
				if (heartbeat) clearInterval(heartbeat);
				try { controller.close(); } catch { /* already closed */ }
			};
			const write = (chunk: string) => {
				if (closed) return;
				try { controller.enqueue(enc.encode(chunk)); } catch { cleanup(); }
			};
			unsub = subscribePresenter(params.id, token, (event) => {
				write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
				if (event.type === 'ended') cleanup();
			});
			if (!unsub) { cleanup(); return; }
			heartbeat = setInterval(() => write(': hb\n\n'), 10000);
		},
		cancel() { cleanup(); }
	});
	return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' } });
};
