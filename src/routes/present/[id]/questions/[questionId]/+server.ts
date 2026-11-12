import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoom, moderateQuestion, type QuestionStatus } from '$lib/server/rooms';
import { apiError } from '$lib/server/api-error';

export const PATCH: RequestHandler = async (event) => {
	const { params, cookies, request } = event;
	const room = getRoom(params.id);
	if (!room) return apiError(event, 'room_not_found', 404);
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	if (token !== room.presenterToken) return apiError(event, 'presenter_forbidden', 403);
	const body = await request.json().catch(() => null);
	if (!isPlainObject(body)) return apiError(event, 'invalid_event', 400);
	if (body.status !== undefined && body.status !== 'open' && body.status !== 'starred' && body.status !== 'done') {
		return apiError(event, 'invalid_event', 400);
	}
	if (body.hidden !== undefined && typeof body.hidden !== 'boolean') return apiError(event, 'invalid_event', 400);
	if (body.status === undefined && body.hidden === undefined) return apiError(event, 'invalid_event', 400);
	const result = moderateQuestion(params.id, token, params.questionId, {
		status: body.status as QuestionStatus | undefined,
		hidden: body.hidden as boolean | undefined
	});
	if (!result.ok) {
		const code = result.status === 403 ? 'presenter_forbidden' : result.status === 400 ? 'invalid_event' : 'room_not_found';
		return apiError(event, code, result.status ?? 400);
	}
	return json({ question: result.question }, { headers: { 'cache-control': 'no-store' } });
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
