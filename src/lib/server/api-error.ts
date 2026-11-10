import { json, type RequestEvent } from '@sveltejs/kit';
import type { TranslationParams } from '$lib/i18n';
import { apiErrorPayload, type ApiErrorCode } from '$lib/api-errors';

export { API_ERROR_CODES, type ApiErrorCode } from '$lib/api-errors';

export function apiError(event: Pick<RequestEvent, 'locals'>, code: ApiErrorCode, status: number, params?: TranslationParams, extra: Record<string, unknown> = {}) {
	return json(apiErrorPayload(event.locals.locale, code, params, extra), { status });
}
