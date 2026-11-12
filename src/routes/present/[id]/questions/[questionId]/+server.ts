import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { moderateQuestion, type QuestionStatus } from '$lib/server/rooms';
import { apiError } from '$lib/server/api-error';

export const PATCH: RequestHandler = async (event) => {
	const { params, cookies, request } = event;
	const body = await request.json().catch(() => ({})) as { status?: unknown; hidden?: unknown };
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
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
