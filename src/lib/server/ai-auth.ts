import { json, type Cookies } from '@sveltejs/kit';
import { isProductionRuntime } from '$lib/server/auth';
import { getUserSession } from '$lib/server/identity';
import { t, type Locale } from '$lib/i18n';

export function requireAiUserSession(cookies: Cookies, locale: Locale = 'en'): Response | null {
	if (!isProductionRuntime()) return null;
	return getUserSession(cookies) ? null : json({ error: true, code: 'login_required', message: t(locale, 'api.login_required') }, { status: 401 });
}
