import type { Handle, ServerInit } from '@sveltejs/kit';
import { securityHeaders } from '$lib/server/security-headers';
import { assertBootEnvironment } from '../scripts/env-validation.mjs';

export const init: ServerInit = () => {
	assertBootEnvironment(process.env);
};

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	for (const [key, value] of Object.entries(securityHeaders())) response.headers.set(key, value);
	return response;
};
