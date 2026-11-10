// Lightweight production monitoring smoke for eigen.beam.
// Checks public liveness/readiness endpoints without creating rooms or decks.
import assert from 'node:assert/strict';
import { env, exit } from 'node:process';

const BASE = (env.EB_SMOKE_BASE ?? 'http://127.0.0.1:4176').replace(/\/$/, '');
const EXPECT_READY = env.EB_OPS_EXPECT_READY !== 'false';
let passed = 0;

function ok(name: string) {
	passed++;
	console.log(`  ✓ ${name}`);
}

async function fetchJson(path: string): Promise<{ response: Response; body: Record<string, unknown>; raw: string }> {
	const response = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
	const raw = await response.text();
	let body: Record<string, unknown>;
	try {
		body = JSON.parse(raw) as Record<string, unknown>;
	} catch (error) {
		throw new Error(`${path} did not return JSON (${response.status}): ${raw.slice(0, 200)}`, { cause: error });
	}
	return { response, body, raw };
}

function assertSecretSafe(raw: string, allowEnvironmentNames = false) {
	assert.equal(/postgres:\/\//i.test(raw), false, 'must not leak DATABASE_URL');
	assert.equal(/resend_[A-Za-z0-9_-]+/i.test(raw), false, 'must not leak Resend key');
	assert.equal(/postmark_[A-Za-z0-9_-]+|token_[A-Za-z0-9_-]{8,}/i.test(raw), false, 'must not leak token material');
	if (!allowEnvironmentNames) assert.equal(/EB_[A-Z0-9_]+/.test(raw), false, 'must not expose env var names');
}

async function main() {
	console.log(`OPS SMOKE gegen ${BASE}`);

	const live = await fetchJson('/healthz');
	assert.equal(live.response.status, 200, '/healthz → 200');
	assert.equal(live.body.ok, true, '/healthz ok=true');
	assert.equal(live.body.service, 'eigenbeam');
	assert.equal(live.response.headers.get('cache-control'), 'no-store');
	assertSecretSafe(live.raw);
	ok('/healthz liefert secret-safe Liveness');

	const ready = await fetchJson('/readyz');
	assert.equal(ready.response.headers.get('cache-control'), 'no-store');
	assert.equal(ready.body.service, 'eigenbeam');
	assert.equal(typeof ready.body.checks, 'object');
	assertSecretSafe(ready.raw, true);
	if (EXPECT_READY) {
		assert.equal(ready.response.status, 200, '/readyz → 200');
		assert.equal(ready.body.ok, true, '/readyz ok=true');
		assert.equal(ready.body.status, 'ready');
	} else {
		assert.equal([200, 503].includes(ready.response.status), true, '/readyz returns readiness status');
	}
	ok('/readyz liefert readiness ohne Secrets');

	const mcpMetadata = await fetchJson('/.well-known/oauth-protected-resource/mcp');
	assert.equal(mcpMetadata.response.status, 200, '/.well-known/oauth-protected-resource/mcp → 200');
	assert.equal(mcpMetadata.body.resource, `${BASE}/mcp`);
	assert.equal(Array.isArray(mcpMetadata.body.scopes_supported), true);
	assertSecretSafe(mcpMetadata.raw);
	ok('MCP Protected-Resource-Metadata ist erreichbar und secret-safe');

	console.log(`\nOPS SMOKE PASS — ${passed} checks.`);
}

main().catch((error) => {
	console.error('OPS SMOKE FAIL:', error);
	exit(1);
});
