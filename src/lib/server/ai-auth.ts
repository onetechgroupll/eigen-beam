import { json, type Cookies } from '@sveltejs/kit';
import { isProductionRuntime } from '$lib/server/auth';
import { getUserSession } from '$lib/server/identity';

export function requireAiUserSession(cookies: Cookies): Response | null {
	if (!isProductionRuntime()) return null;
	return getUserSession(cookies) ? null : json({ error: true, message: 'Login erforderlich.' }, { status: 401 });
}
