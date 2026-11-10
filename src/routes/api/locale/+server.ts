import { redirect, type RequestHandler } from '@sveltejs/kit';
import { isLocale } from '$lib/i18n';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '$lib/server/locale';
import { safeLocalRedirectPath } from '$lib/server/safe-redirect';

export const POST: RequestHandler = async ({ cookies, request, url }) => {
	const form = await request.formData();
	const locale = form.get('locale');
	const requestedRedirect = String(form.get('redirectTo') ?? '/');
	if (isLocale(locale)) {
		cookies.set(LOCALE_COOKIE, locale, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: LOCALE_COOKIE_MAX_AGE
		});
	}
	const redirectTo = safeLocalRedirectPath(requestedRedirect);
	throw redirect(303, redirectTo);
};
