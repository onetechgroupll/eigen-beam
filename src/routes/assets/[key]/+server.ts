import type { RequestHandler } from './$types';
import { readAsset } from '$lib/server/assets';

export const GET: RequestHandler = async ({ params }) => {
	const asset = await readAsset(params.key);
	if (!asset) return new Response('not found', { status: 404 });
	const copy = new Uint8Array(asset.bytes.byteLength);
	copy.set(asset.bytes);
	return new Response(copy.buffer as ArrayBuffer, {
		headers: {
			'content-type': asset.mime,
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
};
