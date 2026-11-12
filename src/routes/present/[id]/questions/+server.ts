import type { RequestHandler } from './$types';
import { getReplayPersistent, getRoom, listPresenterQuestions } from '$lib/server/rooms';
import { questionExportMarkdown } from '$lib/server/question-export';
import { requestText } from '$lib/server/locale';
import { detectContentLocale, t } from '$lib/i18n';

export const GET: RequestHandler = async ({ params, cookies, locals, url }) => {
	const room = getRoom(params.id);
	if (!room) {
		// Nach der Ended-TTL ist der Room samt Presenter-Token weg; der Replay
		// existiert weiter. Ehrliches 410 statt rohem 404.
		if (await getReplayPersistent(params.id)) {
			return new Response(requestText({ locals }, 'api.export_expired'), { status: 410 });
		}
		return new Response(requestText({ locals }, 'api.room_not_found'), { status: 404 });
	}
	const token = cookies.get(`eb_pt_${params.id}`) ?? '';
	if (token !== room.presenterToken) return new Response(requestText({ locals }, 'api.presenter_forbidden'), { status: 403 });
	const questions = listPresenterQuestions(params.id, token).questions ?? [];
	const contentLocale = detectContentLocale(room.slides);
	const markdown = questionExportMarkdown(questions, {
		heading: t(contentLocale, 'export.questions_heading'),
		slide: t(contentLocale, 'common.slide')
	}, url.searchParams.get('include') === 'hidden');
	return new Response(markdown, {
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename="eigen-beam-${params.id}-questions.md"`,
			'cache-control': 'no-store'
		}
	});
};
