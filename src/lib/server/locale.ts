import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';
import { resolveLocale, t, type Locale, type TranslationKey, type TranslationParams } from '$lib/i18n';

export const LOCALE_COOKIE = 'eb_locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export { resolveLocale } from '$lib/i18n';

export function localeFromRequest(event: Pick<RequestEvent, 'cookies' | 'request'>): Locale {
	return resolveLocale({
		cookie: event.cookies.get(LOCALE_COOKIE),
		acceptLanguage: event.request.headers.get('accept-language'),
		defaultLocale: env.EB_DEFAULT_LOCALE
	});
}

export function requestText(event: Pick<RequestEvent, 'locals'>, key: TranslationKey, params?: TranslationParams): string {
	return t(event.locals.locale, key, params);
}
