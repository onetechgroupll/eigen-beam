import type { Handle } from '@sveltejs/kit';
import { securityHeaders } from '$lib/server/security-headers';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	for (const [key, value] of Object.entries(securityHeaders())) response.headers.set(key, value);
	return response;
};
