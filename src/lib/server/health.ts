import { env as processEnv } from 'node:process';
import { Pool } from 'pg';
import { isProductionRuntime } from '$lib/server/auth';

export type HealthCheck = { ok: boolean; detail?: string };
export type ReadinessPayload = {
	ok: boolean;
	status: 'ready' | 'not_ready';
	service: 'eigenbeam';
	timestamp: string;
	checks: {
		runtime: HealthCheck & { production: boolean };
		origin: HealthCheck;
		authSecret: HealthCheck;
		deckStore: HealthCheck & { mode: string };
		activityStore: HealthCheck & { mode: string };
		assetStore: HealthCheck & { mode: string };
		mailer: HealthCheck & { mode: string };
		mcpAuth: HealthCheck;
		database: HealthCheck & { required: boolean };
	};
};

type EnvLike = Record<string, string | undefined>;
type ReadinessOptions = {
	env?: EnvLike;
	now?: () => number;
	pingDatabase?: () => Promise<boolean>;
};

let readinessPool: Pool | null = null;

export function livenessPayload(now: () => number = Date.now) {
	return {
		ok: true,
		status: 'ok' as const,
		service: 'eigenbeam' as const,
		timestamp: new Date(now()).toISOString()
	};
}

export async function readinessPayload(options: ReadinessOptions = {}): Promise<ReadinessPayload> {
	const source = options.env ?? processEnv;
	const now = options.now ?? Date.now;
	const production = isProductionRuntime(source);
	const deckMode = normalized(source.EB_DECK_STORE, production ? 'postgres' : 'file');
	const activityMode = normalized(source.EB_ACTIVITY_STORE, production ? 'postgres' : 'off');
	const assetMode = normalized(source.EB_ASSET_STORE, 'local');
	const mailMode = normalized(source.EB_MAIL_PROVIDER, production ? '' : 'outbox');
	const databaseRequired = deckMode === 'postgres' || activityMode === 'postgres';
	const checks: ReadinessPayload['checks'] = {
		runtime: { ok: true, production, detail: production ? 'production' : 'development' },
		origin: checkOrigin(source, production),
		authSecret: checkAuthSecret(source, production),
		deckStore: checkDeckStore(source, production, deckMode),
		activityStore: checkActivityStore(source, production, activityMode),
		assetStore: checkAssetStore(source, production, assetMode),
		mailer: checkMailer(source, production, mailMode),
		mcpAuth: checkMcpAuth(source, production),
		database: { ok: !databaseRequired, required: databaseRequired, detail: databaseRequired ? 'pending' : 'not_required' }
	};

	if (databaseRequired) {
		if (!source.DATABASE_URL) {
			checks.database = { ok: false, required: true, detail: 'missing_database_url' };
		} else {
			const ping = options.pingDatabase ?? (() => pingConfiguredDatabase(source.DATABASE_URL!));
			checks.database = { ok: await ping().catch(() => false), required: true, detail: 'select_1' };
		}
	}

	const ok = Object.values(checks).every((check) => check.ok);
	return {
		ok,
		status: ok ? 'ready' : 'not_ready',
		service: 'eigenbeam',
		timestamp: new Date(now()).toISOString(),
		checks
	};
}

export async function pingConfiguredDatabase(connectionString: string): Promise<boolean> {
	readinessPool ??= new Pool({ connectionString, connectionTimeoutMillis: 2_000, max: 1 });
	await readinessPool.query('SELECT 1');
	return true;
}

function checkOrigin(source: EnvLike, production: boolean): HealthCheck {
	if (!production) return { ok: true, detail: 'dev_request_origin_allowed' };
	const origin = source.ORIGIN ?? '';
	return { ok: origin.startsWith('https://'), detail: origin ? 'configured' : 'missing' };
}

function checkAuthSecret(source: EnvLike, production: boolean): HealthCheck {
	return { ok: !production || Boolean(source.EB_MAGIC_LINK_SECRET), detail: source.EB_MAGIC_LINK_SECRET ? 'configured' : 'missing' };
}

function checkDeckStore(source: EnvLike, production: boolean, mode: string): HealthCheck & { mode: string } {
	const okMode = production ? mode === 'postgres' : ['file', 'memory', 'postgres'].includes(mode);
	const okDatabase = mode !== 'postgres' || Boolean(source.DATABASE_URL);
	return { ok: okMode && okDatabase, mode, detail: !okMode ? 'invalid_mode' : okDatabase ? 'configured' : 'missing_database_url' };
}

function checkActivityStore(source: EnvLike, production: boolean, mode: string): HealthCheck & { mode: string } {
	const okMode = production ? mode === 'postgres' : ['off', 'postgres'].includes(mode);
	const okDatabase = mode !== 'postgres' || Boolean(source.DATABASE_URL);
	return { ok: okMode && okDatabase, mode, detail: !okMode ? 'invalid_mode' : okDatabase ? 'configured' : 'missing_database_url' };
}

function checkAssetStore(source: EnvLike, production: boolean, mode: string): HealthCheck & { mode: string } {
	if (mode === 's3') return { ok: Boolean(source.EB_BUCKET_NAME), mode, detail: source.EB_BUCKET_NAME ? 'configured' : 'missing_bucket' };
	return { ok: !production, mode, detail: production ? 'production_requires_s3' : 'local' };
}

function checkMailer(source: EnvLike, production: boolean, mode: string): HealthCheck & { mode: string } {
	if (mode === 'resend') return { ok: Boolean(source.EB_RESEND_API_KEY), mode, detail: source.EB_RESEND_API_KEY ? 'configured' : 'missing_api_key' };
	if (mode === 'postmark') return { ok: Boolean(source.EB_POSTMARK_TOKEN), mode, detail: source.EB_POSTMARK_TOKEN ? 'configured' : 'missing_token' };
	return { ok: !production, mode, detail: production ? 'production_requires_provider' : 'dev_mailer' };
}

function checkMcpAuth(source: EnvLike, production: boolean): HealthCheck {
	return { ok: !production || Boolean(source.EB_MCP_TOKEN || source.EB_MCP_TOKENS), detail: source.EB_MCP_TOKEN || source.EB_MCP_TOKENS ? 'configured' : 'missing' };
}

function normalized(value: string | undefined, fallback: string): string {
	return (value ?? fallback).toLowerCase();
}
