import { env as processEnv } from 'node:process';
import { Pool } from 'pg';
import { isProductionRuntime } from '$lib/server/auth';
import { parseOAuthClients } from '$lib/server/oauth-server';

export const EXPECTED_SCHEMA_MIGRATION = '005_replay_pin_verifier.sql';
const ENVIRONMENT_DOC = 'docs/deployment.md#environment';

export type ReadinessCheck = {
	status: 'ready' | 'not_ready';
	expected: string;
	actual: string;
	fix: string;
};

export type ReadinessPayload = {
	ok: boolean;
	status: 'ready' | 'not_ready';
	service: 'eigenbeam';
	timestamp: string;
	checks: {
		runtime: ReadinessCheck;
		origin: ReadinessCheck;
		authSecret: ReadinessCheck;
		deckStore: ReadinessCheck;
		activityStore: ReadinessCheck;
		assetStore: ReadinessCheck;
		mailer: ReadinessCheck;
		mcpAuth: ReadinessCheck;
		databaseSchema: ReadinessCheck;
	};
};

type EnvLike = Record<string, string | undefined>;
type ReadinessOptions = {
	env?: EnvLike;
	now?: () => number;
	readDatabaseSchema?: () => Promise<string | null>;
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
	const deckMode = normalized(source.EB_DECK_STORE, production ? '' : 'file');
	const activityMode = normalized(source.EB_ACTIVITY_STORE, production ? '' : 'off');
	const assetMode = normalized(source.EB_ASSET_STORE, production ? '' : 'local');
	const mailMode = normalized(source.EB_MAIL_PROVIDER, production ? '' : 'outbox');
	const databaseRequired = deckMode === 'postgres' || activityMode === 'postgres';

	const checks: ReadinessPayload['checks'] = {
		runtime: readyCheck('production or development runtime', production ? 'production' : 'development'),
		origin: checkOrigin(source, production),
		authSecret: checkAuthSecret(source, production),
		deckStore: checkDeckStore(source, production, deckMode),
		activityStore: checkActivityStore(source, production, activityMode),
		assetStore: checkAssetStore(source, production, assetMode),
		mailer: checkMailer(source, production, mailMode),
		mcpAuth: checkMcpAuth(source, production),
		databaseSchema: databaseRequired
			? notReadyCheck(EXPECTED_SCHEMA_MIGRATION, 'pending', ['DATABASE_URL'])
			: readyCheck('not required', 'not required')
	};

	if (databaseRequired) {
		if (!source.DATABASE_URL) {
			checks.databaseSchema = notReadyCheck(EXPECTED_SCHEMA_MIGRATION, 'DATABASE_URL missing', ['DATABASE_URL']);
		} else {
			try {
				const readSchema = options.readDatabaseSchema ?? (() => readConfiguredDatabaseSchema(source.DATABASE_URL!));
				const actual = await readSchema();
				// A schema AHEAD of this image is acceptable: it is the documented
				// additive rollback window (docs/upgrading.md). Only a schema behind
				// the image's expectation makes the instance not ready.
				const actualVersion = Number.parseInt(actual ?? '', 10);
				const expectedVersion = Number.parseInt(EXPECTED_SCHEMA_MIGRATION, 10);
				const schemaOk = Number.isInteger(actualVersion) && actualVersion >= expectedVersion;
				checks.databaseSchema = schemaOk
					? readyCheck(EXPECTED_SCHEMA_MIGRATION, actual ?? '')
					: notReadyCheck(EXPECTED_SCHEMA_MIGRATION, actual ?? 'schema_migrations missing', ['DATABASE_URL', 'EB_MIGRATE_ON_BOOT']);
			} catch {
				checks.databaseSchema = notReadyCheck(EXPECTED_SCHEMA_MIGRATION, 'database unavailable', ['DATABASE_URL']);
			}
		}
	}

	const ok = Object.values(checks).every((check) => check.status === 'ready');
	return {
		ok,
		status: ok ? 'ready' : 'not_ready',
		service: 'eigenbeam',
		timestamp: new Date(now()).toISOString(),
		checks
	};
}

export async function readConfiguredDatabaseSchema(connectionString: string): Promise<string | null> {
	readinessPool ??= new Pool({ connectionString, connectionTimeoutMillis: 2_000, max: 1 });
	try {
		const result = await readinessPool.query<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1');
		return result.rows[0]?.filename ?? null;
	} catch (error) {
		if (pgCode(error) === '42P01') return null;
		throw error;
	}
}

function checkOrigin(source: EnvLike, production: boolean): ReadinessCheck {
	if (!production) return readyCheck('request origin allowed in development', 'development');
	const origin = source.ORIGIN ?? '';
	return origin.startsWith('https://')
		? readyCheck('HTTPS origin configured', 'configured')
		: notReadyCheck('HTTPS origin configured', origin ? 'invalid' : 'missing', ['ORIGIN']);
}

function checkAuthSecret(source: EnvLike, production: boolean): ReadinessCheck {
	if (!production) return readyCheck('optional in development', source.EB_MAGIC_LINK_SECRET ? 'configured' : 'development fallback');
	return source.EB_MAGIC_LINK_SECRET
		? readyCheck('configured', 'configured')
		: notReadyCheck('configured', 'missing', ['EB_MAGIC_LINK_SECRET']);
}

function checkDeckStore(source: EnvLike, production: boolean, mode: string): ReadinessCheck {
	const okMode = production ? mode === 'postgres' : ['file', 'memory', 'postgres'].includes(mode);
	const okDatabase = mode !== 'postgres' || Boolean(source.DATABASE_URL);
	return okMode && okDatabase
		? readyCheck(production ? 'postgres' : 'file, memory, or postgres', mode)
		: notReadyCheck(production ? 'postgres' : 'file, memory, or postgres', !okMode ? (mode ? 'invalid' : 'missing') : 'DATABASE_URL missing', ['EB_DECK_STORE', 'DATABASE_URL']);
}

function checkActivityStore(source: EnvLike, production: boolean, mode: string): ReadinessCheck {
	const okMode = production ? mode === 'postgres' : ['off', 'postgres'].includes(mode);
	const okDatabase = mode !== 'postgres' || Boolean(source.DATABASE_URL);
	return okMode && okDatabase
		? readyCheck(production ? 'postgres' : 'off or postgres', mode)
		: notReadyCheck(production ? 'postgres' : 'off or postgres', !okMode ? (mode ? 'invalid' : 'missing') : 'DATABASE_URL missing', ['EB_ACTIVITY_STORE', 'DATABASE_URL']);
}

function checkAssetStore(source: EnvLike, production: boolean, mode: string): ReadinessCheck {
	if (mode === 's3') {
		return source.EB_BUCKET_NAME
			? readyCheck('s3 with bucket configured', 's3 configured')
			: notReadyCheck('s3 with bucket configured', 'bucket missing', ['EB_ASSET_STORE', 'EB_BUCKET_NAME']);
	}
	return !production
		? readyCheck('local or s3', mode)
		: notReadyCheck('s3 with bucket configured', mode ? 'invalid' : 'missing', ['EB_ASSET_STORE', 'EB_BUCKET_NAME']);
}

function checkMailer(source: EnvLike, production: boolean, mode: string): ReadinessCheck {
	if (mode === 'resend') {
		return source.EB_RESEND_API_KEY
			? readyCheck('configured provider', 'resend configured')
			: notReadyCheck('configured provider', 'resend credential missing', ['EB_MAIL_PROVIDER', 'EB_RESEND_API_KEY']);
	}
	if (mode === 'postmark') {
		return source.EB_POSTMARK_TOKEN
			? readyCheck('configured provider', 'postmark configured')
			: notReadyCheck('configured provider', 'postmark credential missing', ['EB_MAIL_PROVIDER', 'EB_POSTMARK_TOKEN']);
	}
	return !production
		? readyCheck('development mailer', mode || 'outbox')
		: notReadyCheck('resend or postmark configured', mode ? 'invalid' : 'missing', ['EB_MAIL_PROVIDER']);
}

function checkMcpAuth(source: EnvLike, production: boolean): ReadinessCheck {
	const hasStaticToken = Boolean(source.EB_MCP_TOKEN?.trim() || source.EB_MCP_TOKENS?.trim());
	const hasOAuthClients = parseOAuthClients(source.EB_OAUTH_CLIENTS).length > 0;
	if (hasStaticToken) return readyCheck('static token or OAuth clients configured', 'static token configured');
	if (hasOAuthClients && source.EB_OAUTH_TOKEN_SECRET) return readyCheck('static token or OAuth clients configured', 'OAuth clients configured');
	return !production
		? readyCheck('optional in development', 'not configured')
		: notReadyCheck('static token or OAuth clients configured', 'missing', ['EB_MCP_TOKEN', 'EB_MCP_TOKENS', 'EB_OAUTH_CLIENTS', 'EB_OAUTH_TOKEN_SECRET']);
}

function readyCheck(expected: string, actual: string): ReadinessCheck {
	return { status: 'ready', expected, actual, fix: ENVIRONMENT_DOC };
}

function notReadyCheck(expected: string, actual: string, envNames: string[]): ReadinessCheck {
	return { status: 'not_ready', expected, actual, fix: `${envNames.join(', ')}; ${ENVIRONMENT_DOC}` };
}

function normalized(value: string | undefined, fallback: string): string {
	return (value ?? fallback).trim().toLowerCase();
}

function pgCode(error: unknown): string | null {
	return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : null;
}
