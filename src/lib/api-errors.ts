import { t, type Locale, type TranslationKey, type TranslationParams } from './i18n';

export const API_ERROR_CODES = [
	'deck_not_found', 'replay_not_found', 'room_not_found', 'room_ended', 'already_ended',
	'forbidden', 'deck_forbidden', 'presenter_forbidden', 'pin_required', 'pin_invalid',
	'replay_pin_required', 'deck_empty', 'invalid_email', 'mail_failed', 'file_required',
	'image_required', 'pdf_required', 'pptx_required', 'audio_required', 'invalid_visibility',
	'login_required', 'team_login_required', 'source_too_long', 'too_many_requests',
	'invalid_event', 'question_required', 'question_limit', 'busy', 'export_expired', 'internal_error',
	'invalid_deck', 'file_too_large', 'unsupported_file', 'export_format_not_found'
] as const;

export type ApiErrorCode = typeof API_ERROR_CODES[number];

export function apiErrorPayload(locale: Locale, code: ApiErrorCode, params?: TranslationParams, extra: Record<string, unknown> = {}) {
	return { error: true as const, code, message: t(locale, `api.${code}` as TranslationKey, params), ...extra };
}
