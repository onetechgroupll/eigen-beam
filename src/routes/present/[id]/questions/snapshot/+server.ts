import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listPresenterQuestions } from '$lib/server/rooms';
import { apiError } from '$lib/server/api-error';

export const GET: RequestHandler = (event) => {
	const { params, cookies } = event;
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	const result = listPresenterQuestions(params.id, token);
	if (!result.ok) return apiError(event, result.status === 403 ? 'presenter_forbidden' : 'room_not_found', result.status ?? 404);
	return json({ questions: result.questions }, { headers: { 'cache-control': 'no-store' } });
};
