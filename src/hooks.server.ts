import type { Handle } from '@sveltejs/kit';
import { securityHeaders } from '$lib/server/security-headers';
import { localeFromRequest } from '$lib/server/locale';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.locale = localeFromRequest(event);
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});
	for (const [key, value] of Object.entries(securityHeaders())) response.headers.set(key, value);
	return response;
};
