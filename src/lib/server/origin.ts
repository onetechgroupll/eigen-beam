import { isProductionRuntime } from '$lib/server/auth';

export function canonicalPublicOrigin(url: URL, source: Record<string, string | undefined> = process.env): string {
	const configured = (source.EB_PUBLIC_ORIGIN || source.ORIGIN || '').trim();
	if (configured) return normalizeConfiguredOrigin(configured);
	if (isProductionRuntime(source)) throw new Error('ORIGIN/EB_PUBLIC_ORIGIN fehlt in Production.');
	return url.origin;
}

function normalizeConfiguredOrigin(value: string): string {
	const parsed = new URL(value);
	if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
		throw new Error('ORIGIN/EB_PUBLIC_ORIGIN muss HTTPS sein.');
	}
	return parsed.origin;
}
