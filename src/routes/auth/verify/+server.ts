import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authSigningSecret, verifyMagicToken } from '$lib/server/auth';
import { getCreatorId, setUserSession } from '$lib/server/identity';
import { getDeckRepo } from '$lib/server/decks-repo';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const token = url.searchParams.get('token') ?? '';
	const verified = await verifyMagicToken(token, authSigningSecret());
	if (!verified) throw redirect(303, '/account?auth=invalid');
	const anonOwner = getCreatorId(cookies);
	setUserSession(cookies, verified.email);
	let claimed = 0;
	if (anonOwner && anonOwner !== verified.userId) claimed = await getDeckRepo().claimOwner(anonOwner, verified.userId);
	throw redirect(303, `/account?auth=ok&claimed=${claimed}`);
};
