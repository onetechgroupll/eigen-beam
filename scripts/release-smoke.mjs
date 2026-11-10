#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { MIGRATION_LOCK_KEYS } from './migration-contract.mjs';

const options = parseOptions(process.argv.slice(2));
const suffix = randomBytes(4).toString('hex');
const prefix = `eigenbeam-release-smoke-${suffix}`;
const network = `${prefix}-net`;
const postgres = `${prefix}-postgres`;
const containers = new Set([postgres]);
const currentImage = options.image ?? `${prefix}:current`;
const expectedMigrationCount = 5;

if (options.help) {
	printHelp();
	process.exit(0);
}

try {
	await requireDocker();
	if (!options.image) await command('docker', ['build', '-t', currentImage, '.'], { timeoutMs: 15 * 60_000 });
	await command('docker', ['network', 'create', network]);
	await command('docker', [
		'run', '-d', '--name', postgres, '--network', network,
		'-e', 'POSTGRES_USER=smoke', '-e', 'POSTGRES_PASSWORD=smoke', '-e', 'POSTGRES_DB=first_start',
		'postgres:16-alpine'
	]);
	await waitForPostgres();

	await firstStartSmoke();
	await upgradeSmoke();
	await parallelBootSmoke();
	await heldLockSmoke();
	await unwritableDataSmoke();
	console.log('RELEASE SMOKE PASS');
} catch (error) {
	console.error('RELEASE SMOKE FAIL:', error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	if (options.keep) {
		console.log(`Keeping release-smoke resources with prefix ${prefix}`);
	} else {
		for (const name of [...containers].reverse()) await command('docker', ['rm', '-f', name], { allowFailure: true });
		await command('docker', ['network', 'rm', network], { allowFailure: true });
	}
}

async function firstStartSmoke() {
	const app = await startApp('first', 'first_start');
	await assertEndpoint(app, '/readyz', 200);
	assert.equal(await migrationCount('first_start'), expectedMigrationCount);
	console.log('  ✓ empty database migrates and becomes ready');
}

async function upgradeSmoke() {
	await createDatabase('upgrade_path');
	if (options.baselineTag) {
		const baselineImage = options.baselineTag.includes('/') || options.baselineTag.includes(':')
			? options.baselineTag
			: `ghcr.io/onetechgroupll/eigen-beam:${options.baselineTag}`;
		await migrateContainer('baseline', 'upgrade_path', baselineImage);
	} else {
		const baseline = await readFile('migrations/001_foundation.sql', 'utf8');
		await psql('upgrade_path', `${baseline}\nCREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at BIGINT NOT NULL);\nINSERT INTO schema_migrations (filename, applied_at) VALUES ('001_foundation.sql', 1) ON CONFLICT DO NOTHING;`);
	}
	await psql('upgrade_path', `INSERT INTO decks (id, owner_id, title, source, slides, created_at, updated_at)
		VALUES ('seed01', NULL, 'Seed', '# Seed', '[]'::jsonb, 1, 1) ON CONFLICT DO NOTHING;`);
	const app = await startApp('upgrade', 'upgrade_path');
	await assertEndpoint(app, '/readyz', 200);
	await assertEndpoint(app, '/healthz', 200);
	assert.equal((await psql('upgrade_path', `SELECT title FROM decks WHERE id='seed01';`)).stdout.trim(), 'Seed');
	console.log('  ✓ baseline schema and seed data survive the upgrade');
}

async function parallelBootSmoke() {
	await createDatabase('parallel_boot');
	const [first, second] = await Promise.all([
		startApp('parallel-a', 'parallel_boot'),
		startApp('parallel-b', 'parallel_boot')
	]);
	await Promise.all([assertEndpoint(first, '/readyz', 200), assertEndpoint(second, '/readyz', 200)]);
	assert.equal(await migrationCount('parallel_boot'), expectedMigrationCount);
	console.log('  ✓ parallel boots serialize migrations and both become ready');
}

async function heldLockSmoke() {
	await createDatabase('held_lock');
	const locker = nameFor('locker');
	containers.add(locker);
	await command('docker', [
		'run', '-d', '--name', locker, '--network', network, '-e', 'PGPASSWORD=smoke',
		'postgres:16-alpine', 'psql', '-h', postgres, '-U', 'smoke', '-d', 'held_lock',
		'-c', `SELECT pg_advisory_lock(${MIGRATION_LOCK_KEYS[0]}, ${MIGRATION_LOCK_KEYS[1]}); SELECT pg_sleep(30);`
	]);
	await waitForAdvisoryLock('held_lock');
	const result = await command('docker', [
		'run', '--rm', '--network', network,
		'-e', databaseEnv('held_lock'),
		'-e', 'EB_MIGRATE_LOCK_TIMEOUT_MS=300',
		'-e', 'EB_MIGRATE_RETRY_DELAY_MS=100',
		currentImage, 'migrate'
	], { allowFailure: true, timeoutMs: 10_000 });
	assert.notEqual(result.code, 0);
	assert.match(`${result.stdout}\n${result.stderr}`, /EB_MIGRATE_FAILED migration=lock cause=55P03/);
	console.log('  ✓ held lock fails in bounded time with EB_MIGRATE_FAILED');
}

async function unwritableDataSmoke() {
	const result = await command('docker', [
		'run', '--rm', '--read-only', '--tmpfs', '/tmp',
		'-e', 'ORIGIN=http://localhost:3000',
		'-e', 'EB_DECK_STORE=file', '-e', 'EB_ACTIVITY_STORE=off', '-e', 'EB_MAIL_PROVIDER=console',
		currentImage
	], { allowFailure: true, timeoutMs: 10_000 });
	assert.notEqual(result.code, 0);
	assert.match(`${result.stdout}\n${result.stderr}`, /EB_BOOT_FAILED cause=directory_not_writable/);
	console.log('  ✓ unwritable data storage fails boot');
}

async function startApp(label, database) {
	const name = nameFor(label);
	containers.add(name);
	await command('docker', [
		'run', '-d', '--name', name, '--network', network, '-p', '127.0.0.1::3000',
		'-e', 'ORIGIN=http://localhost:3000',
		'-e', databaseEnv(database),
		'-e', 'EB_DECK_STORE=postgres', '-e', 'EB_ACTIVITY_STORE=postgres',
		'-e', 'EB_ASSET_STORE=local', '-e', 'EB_MAIL_PROVIDER=console',
		currentImage
	]);
	const port = await publishedPort(name);
	const baseUrl = `http://127.0.0.1:${port}`;
	await waitForHttp(`${baseUrl}/healthz`, name);
	return { name, baseUrl };
}

async function migrateContainer(label, database, image) {
	const result = await command('docker', ['run', '--rm', '--network', network, '-e', databaseEnv(database), image, 'migrate'], { timeoutMs: 2 * 60_000 });
	assert.equal(result.code, 0, `${label} migration failed`);
}

async function assertEndpoint(app, path, expectedStatus) {
	const response = await fetch(`${app.baseUrl}${path}`);
	assert.equal(response.status, expectedStatus, `${app.name}${path}`);
	const body = await response.json();
	assert.equal(typeof body, 'object');
}

async function migrationCount(database) {
	const result = await psql(database, 'SELECT COUNT(*) FROM schema_migrations;');
	return Number(result.stdout.trim());
}

async function createDatabase(database) {
	await psql('postgres', `CREATE DATABASE ${database};`);
}

async function psql(database, sql) {
	return command('docker', ['exec', '-i', postgres, 'psql', '-v', 'ON_ERROR_STOP=1', '-At', '-U', 'smoke', '-d', database], { input: sql });
}

async function waitForPostgres() {
	for (let attempt = 0; attempt < 60; attempt++) {
		const result = await command('docker', ['exec', postgres, 'pg_isready', '-U', 'smoke'], { allowFailure: true });
		if (result.code === 0) return;
		await delay(500);
	}
	throw new Error('Postgres did not become ready');
}

async function waitForAdvisoryLock(database) {
	for (let attempt = 0; attempt < 40; attempt++) {
		const result = await psql(database, `SELECT COUNT(*) FROM pg_locks WHERE locktype='advisory' AND granted;`);
		if (Number(result.stdout.trim()) > 0) return;
		await delay(100);
	}
	throw new Error('Advisory lock was not acquired');
}

async function publishedPort(name) {
	const result = await command('docker', ['port', name, '3000/tcp']);
	const match = result.stdout.trim().match(/:(\d+)$/);
	if (!match) throw new Error(`No published port for ${name}`);
	return Number(match[1]);
}

async function waitForHttp(url, container) {
	for (let attempt = 0; attempt < 90; attempt++) {
		try {
			const response = await fetch(url);
			if (response.status < 500) return;
		} catch {
			// Container is still starting.
		}
		const state = await command('docker', ['inspect', '-f', '{{.State.Running}}', container], { allowFailure: true });
		if (state.stdout.trim() === 'false') {
			const logs = await command('docker', ['logs', container], { allowFailure: true });
			throw new Error(`${container} exited during boot: ${logs.stdout}${logs.stderr}`);
		}
		await delay(500);
	}
	throw new Error(`${container} did not become healthy`);
}

async function requireDocker() {
	const result = await command('docker', ['version', '--format', '{{.Server.Version}}'], { allowFailure: true });
	if (result.code !== 0) throw new Error('Docker is required for release smoke');
}

function databaseEnv(database) {
	return `DATABASE_URL=postgres://smoke:smoke@${postgres}:5432/${database}`;
}

function nameFor(label) {
	return `${prefix}-${label}`;
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseOptions(args) {
	const parsed = { image: null, baselineTag: null, keep: false, help: false };
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === '--keep') parsed.keep = true;
		else if (arg === '--help' || arg === '-h') parsed.help = true;
		else if (arg === '--image') parsed.image = requiredValue(args, ++index, arg);
		else if (arg === '--baseline-tag') parsed.baselineTag = requiredValue(args, ++index, arg);
		else throw new Error(`Unknown option: ${arg}`);
	}
	return parsed;
}

function requiredValue(args, index, option) {
	if (!args[index]) throw new Error(`${option} requires a value`);
	return args[index];
}

function printHelp() {
	console.log(`Usage: node scripts/release-smoke.mjs [options]

Builds the current Dockerfile unless --image is provided, starts disposable
Postgres and app containers, and verifies first boot, upgrade, lock and storage
failure paths.

Options:
  --image <name>         Test an already-built current image.
  --baseline-tag <tag>  Prepare the upgrade database with this historical GHCR
                        image (or pass a full image reference). Without it, the
                        deterministic 001_foundation.sql baseline is used.
  --keep                 Keep containers and the Docker network for inspection.
  --help                 Show this help.`);
}

function command(program, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(program, args, { stdio: ['pipe', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => { stdout += chunk; });
		child.stderr.on('data', (chunk) => { stderr += chunk; });
		if (options.input !== undefined) child.stdin.end(options.input);
		else child.stdin.end();
		const timeout = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 5 * 60_000);
		child.once('error', (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.once('close', (code) => {
			clearTimeout(timeout);
			const result = { code: code ?? 1, stdout, stderr };
			if (result.code !== 0 && !options.allowFailure) reject(new Error(`${program} ${args.join(' ')} failed (${result.code}): ${stderr || stdout}`));
			else resolve(result);
		});
	});
}
