import type { RequestHandler } from './$types';
import { authSigningSecret, verifyPinUnlockToken } from '$lib/server/auth';
import { getReplayPersistent, getRoom, subscribe, MAX_SUBSCRIBERS_PER_ROOM } from '$lib/server/rooms';

// SSE-Stream Server→Viewer (Eng-Review: kein WebSocket, asymmetrischer Flow).
// Schickt initial `sync`, danach `slide` bei jedem Wechsel, `ended` beim Schließen.
//
// Lag-Fix 2026-06-28: Schreibfehler REAPEN die Verbindung (statt sie zu schlucken).
// Auf wackligem Mobilfunk brechen Verbindungen halb-offen ab → `cancel()` feuert nie.
// Ohne Reaping blieben Subscriber + 10s-Heartbeats für immer im Room und akkumulierten
// über die Session → Broadcasts wurden langsam. Jetzt: erste fehlgeschlagene Schreib-
// operation (Heartbeat oder Push) räumt die tote Verbindung auf.
export const GET: RequestHandler = async ({ params, cookies }) => {
	const room = getRoom(params.id);
	if (!room || room.ended) {
		const replay = await getReplayPersistent(params.id);
		if (!replay) return new Response('ended', { status: 410 });
		if (replay.protected && !verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret())) return new Response('pin required', { status: 403 });
		const current = room?.current ?? [...replay.events].reverse().find((event) => event.type === 'end' || event.type === 'slide')?.slide ?? 0;
		return endedEventResponse(current);
	}
	if (room.pin && !verifyPinUnlockToken(cookies.get(`eb_pin_${params.id}`), params.id, authSigningSecret())) return new Response('pin required', { status: 403 });
	if (room.subscribers.size >= MAX_SUBSCRIBERS_PER_ROOM) return new Response('busy', { status: 503 });

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
				try {
					controller.close();
				} catch {
					/* already closed/errored */
				}
			};

			// Jede fehlgeschlagene Schreiboperation = tote Verbindung → reapen.
			const write = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(enc.encode(chunk));
				} catch {
					cleanup();
				}
			};

			unsub = subscribe(params.id, (current, ended) => {
				if (ended) {
					write(`event: ended\ndata: ${current}\n\n`);
					cleanup();
				} else {
					write(`event: slide\ndata: ${current}\n\n`);
				}
			});

			// Cap zwischen Pre-Check und start() erreicht (Race) → sauber schließen.
			if (!unsub) {
				cleanup();
				return;
			}

			write(`event: sync\ndata: ${room.current}\n\n`);

			// Heartbeat ist zugleich der Liveness-Reaper: scheitert der Write, ist die
			// Verbindung tot und wird aufgeräumt (statt das Interval ewig weiterlaufen zu lassen).
			heartbeat = setInterval(() => write(`: hb\n\n`), 10000);
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};

function endedEventResponse(current: number): Response {
	return new Response(`event: ended\ndata: ${current}\n\n`, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'close',
			'x-accel-buffering': 'no'
		}
	});
}
