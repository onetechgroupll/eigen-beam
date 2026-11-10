import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { MIGRATION_LOCK_KEYS } from './migration-contract.mjs';

export { MIGRATION_LOCK_KEYS };
export const MIGRATION_DEFAULTS = Object.freeze({
	lockTimeoutMs: 10_000,
	statementTimeoutMs: 60_000,
	retryDelayMs: 1_000,
	lockAttempts: 3
});

/** @typedef {{ lockTimeoutMs: number, statementTimeoutMs: number, retryDelayMs: number, lockAttempts: number }} MigrationTiming */

/**
 * Parse bounded millisecond values. Invalid input returns the documented default.
 * @param {Record<string, string | undefined>} source
 * @returns {MigrationTiming}
 */
export function resolveMigrationTiming(source = process.env) {
	return {
		lockTimeoutMs: parseMilliseconds(source.EB_MIGRATE_LOCK_TIMEOUT_MS, MIGRATION_DEFAULTS.lockTimeoutMs, 100, 60_000),
		statementTimeoutMs: parseMilliseconds(source.EB_MIGRATE_STATEMENT_TIMEOUT_MS, MIGRATION_DEFAULTS.statementTimeoutMs, 1_000, 15 * 60_000),
		retryDelayMs: parseMilliseconds(source.EB_MIGRATE_RETRY_DELAY_MS, MIGRATION_DEFAULTS.retryDelayMs, 0, 30_000),
		lockAttempts: MIGRATION_DEFAULTS.lockAttempts
	};
}

/** @param {string | undefined} raw @param {number} fallback @param {number} minimum @param {number} maximum */
export function parseMilliseconds(raw, fallback, minimum, maximum) {
	if (raw === undefined || raw.trim() === '') return fallback;
	const value = Number(raw);
	return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

/**
 * @param {{ connectionString: string, migrationsDir?: string, timing?: MigrationTiming, pool?: Pool }} options
 */
export async function runMigrations(options) {
	const migrationsDir = options.migrationsDir ?? 'migrations';
	const timing = options.timing ?? resolveMigrationTiming();
	const pool = options.pool ?? new Pool({ connectionString: options.connectionString });
	const ownsPool = !options.pool;
	/** @type {import('pg').PoolClient | null} */
	let client = null;
	let locked = false;
	let currentMigration = 'lock';
	try {
		client = await pool.connect();
		await client.query(`SELECT set_config('lock_timeout', $1, false)`, [`${timing.lockTimeoutMs}ms`]);
		await client.query(`SELECT set_config('statement_timeout', $1, false)`, [`${timing.statementTimeoutMs}ms`]);
		locked = await acquireMigrationLock(client, timing);
		if (!locked) throw pgFailure('55P03');

		await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
			filename TEXT PRIMARY KEY,
			applied_at BIGINT NOT NULL
		)`);
		const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
		for (const file of files) {
			currentMigration = file;
			const seen = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
			if (seen.rowCount) {
				console.log(`skip ${file}`);
				continue;
			}
			const sql = await readFile(join(migrationsDir, file), 'utf8');
			await client.query('BEGIN');
			try {
				await client.query(sql);
				await client.query('INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, $2)', [file, Date.now()]);
				await client.query('COMMIT');
				console.log(`applied ${file}`);
			} catch (error) {
				await client.query('ROLLBACK').catch(() => undefined);
				throw error;
			}
		}
	} catch (error) {
		const code = pgCode(error);
		console.error(`EB_MIGRATE_FAILED migration=${currentMigration} cause=${code}`);
		throw error;
	} finally {
		if (locked && client) await client.query('SELECT pg_advisory_unlock($1, $2)', MIGRATION_LOCK_KEYS).catch(() => undefined);
		client?.release();
		if (ownsPool) await pool.end();
	}
}

/** @param {import('pg').PoolClient} client @param {MigrationTiming} timing */
async function acquireMigrationLock(client, timing) {
	for (let attempt = 1; attempt <= timing.lockAttempts; attempt++) {
		try {
			await client.query('SELECT pg_advisory_lock($1, $2)', MIGRATION_LOCK_KEYS);
			return true;
		} catch (error) {
			if (pgCode(error) !== '55P03') throw error;
			if (attempt === timing.lockAttempts) return false;
			await delay(timing.retryDelayMs);
		}
	}
	return false;
}

/** @param {unknown} error */
function pgCode(error) {
	return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
}

/** @param {string} code */
function pgFailure(code) {
	return Object.assign(new Error('Migration lock unavailable'), { code });
}

/** @param {number} milliseconds */
function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
