import { json } from '@sveltejs/kit';

export type RateLimitPolicy = {
	windowMs: number;
	max: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

export const RATE_LIMITS = {
	magicLink: { windowMs: 10 * 60 * 1000, max: 5 },
	follow: { windowMs: 10 * 60 * 1000, max: 20 },
	viewerEvent: { windowMs: 60 * 1000, max: 60 },
	roomPin: { windowMs: 10 * 60 * 1000, max: 10 },
	roomCreate: { windowMs: 10 * 60 * 1000, max: 30 },
	deckClone: { windowMs: 10 * 60 * 1000, max: 30 },
	import: { windowMs: 10 * 60 * 1000, max: 20 },
	assetUpload: { windowMs: 10 * 60 * 1000, max: 40 },
	deckWrite: { windowMs: 10 * 60 * 1000, max: 40 },
	clarify: { windowMs: 10 * 60 * 1000, max: 20 },
	mcp: { windowMs: 60 * 1000, max: 120 },
	stats: { windowMs: 60 * 1000, max: 60 }
} satisfies Record<string, RateLimitPolicy>;

export function rateLimit(key: string, policy: RateLimitPolicy): Response | null {
	const now = Date.now();
	if (buckets.size > MAX_BUCKETS) sweep(now);
	const current = buckets.get(key);
	if (!current || current.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
		return null;
	}
	current.count += 1;
	if (current.count <= policy.max) return null;
	const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
	return json(
		{ error: true, message: 'Zu viele Anfragen. Bitte kurz warten.' },
		{ status: 429, headers: { 'retry-after': String(retryAfter) } }
	);
}

export function clientRateLimitKey(scope: string, getClientAddress: () => string, extra = ''): string {
	let ip = 'unknown';
	try {
		ip = getClientAddress();
	} catch {
		/* adapter/test environments may not provide a client address */
	}
	return `${scope}:${ip}:${extra}`;
}

export function _resetRateLimits(): void {
	buckets.clear();
}

function sweep(now: number): void {
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
	if (buckets.size <= MAX_BUCKETS) return;
	for (const key of buckets.keys()) {
		buckets.delete(key);
		if (buckets.size <= MAX_BUCKETS) return;
	}
}
