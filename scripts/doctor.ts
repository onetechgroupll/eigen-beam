import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { env, exit } from 'node:process';

const CHECK_PORT = Number(env.EB_DOCTOR_PORT ?? env.PORT ?? 4316);
const EXPECTED_BUN_MAJOR = 1;
let failures = 0;
let warnings = 0;

function pass(message: string) {
	console.log(`  ✓ ${message}`);
}

function warn(message: string) {
	warnings++;
	console.warn(`  ⚠ ${message}`);
}

function fail(message: string) {
	failures++;
	console.error(`  ✗ ${message}`);
}

function run(command: string, args: string[] = []) {
	return spawnSync(command, args, { encoding: 'utf8' });
}

function checkCommand(command: string, args: string[], label: string, validate?: (stdout: string) => void) {
	const result = run(command, args);
	if (result.error || result.status !== 0) {
		const detail = result.error?.message ?? (result.stderr.trim() || `exit ${result.status}`);
		fail(`${label} not available (${detail})`);
		return;
	}
	const stdout = result.stdout.trim();
	pass(`${label}: ${stdout.split('\n')[0]}`);
	validate?.(stdout);
}

function checkBun() {
	checkCommand('bun', ['--version'], 'Bun', (version) => {
		const major = Number(version.split('.')[0]);
		if (major !== EXPECTED_BUN_MAJOR) warn(`Bun ${version} detected; repo/CI currently uses Bun 1.3.x`);
	});
}

function checkNode() {
	checkCommand('node', ['--version'], 'Node');
}

function checkPackageInstall() {
	if (!existsSync('node_modules')) warn('node_modules missing; run `bun install` before check/build/smokes');
	else pass('node_modules present');
	if (!existsSync('bun.lock')) warn('bun.lock missing; dependency installs may not be reproducible');
	else pass('bun.lock present');
}

function checkPlaywright() {
	const chromium = run('bunx', ['playwright', '--version']);
	if (chromium.status !== 0) {
		warn('Playwright CLI not ready; run `bun install` and `bunx playwright install --with-deps chromium webkit` for smokes/mobile QA');
		return;
	}
	pass(`Playwright CLI: ${chromium.stdout.trim()}`);
	const browsersDir = `${env.HOME ?? ''}/Library/Caches/ms-playwright`;
	if (process.platform === 'darwin' && !existsSync(browsersDir)) warn('Playwright browser cache not found; install browsers before smokes/mobile QA');
}

async function checkPort() {
	await new Promise<void>((resolve) => {
		const server = createServer();
		server.once('error', () => {
			warn(`port ${CHECK_PORT} is already in use; choose another PORT or stop the existing server before local production smokes`);
			resolve();
		});
		server.once('listening', () => {
			server.close(() => {
				pass(`port ${CHECK_PORT} is available`);
				resolve();
			});
		});
		server.listen(CHECK_PORT, '127.0.0.1');
	});
}

function checkEnv() {
	if (existsSync('.env')) warn('.env exists locally; ensure secrets never get committed');
	else pass('.env not present (safe default)');
	if (existsSync('.env.example')) pass('.env.example present');
	else fail('.env.example missing');

	const deckStore = env.EB_DECK_STORE ?? 'file';
	const activityStore = env.EB_ACTIVITY_STORE ?? 'off/local';
	console.log(`  • EB_DECK_STORE=${deckStore} · EB_ACTIVITY_STORE=${activityStore}`);
	if (deckStore === 'postgres' || activityStore === 'postgres') {
		if (!env.DATABASE_URL) fail('Postgres mode selected but DATABASE_URL is missing');
		else pass('DATABASE_URL present for Postgres mode');
	}
	if ((env.EB_MAIL_PROVIDER ?? 'outbox') !== 'outbox' && !env.EB_RESEND_API_KEY && !env.EB_POSTMARK_TOKEN) {
		warn('real mail provider selected without visible provider token in environment');
	}
}

function checkMcp() {
	if (!existsSync('.mcp.json')) {
		warn('.mcp.json missing; Claude/Hermes repo-local MCP setup will not auto-discover eigenbeam');
		return;
	}
	const mcp = JSON.parse(readFileSync('.mcp.json', 'utf8')) as { mcpServers?: Record<string, { command?: string }> };
	const command = mcp.mcpServers?.eigenbeam?.command;
	if (!command) {
		warn('.mcp.json has no eigenbeam server command');
		return;
	}
	if (!existsSync(command)) warn(`MCP wrapper ${command} missing`);
	else pass(`MCP wrapper configured: ${command}`);
}

function checkBuildArtifacts() {
	if (existsSync('build') || existsSync('.svelte-kit/output') || existsSync('.svelte-kit/generated')) {
		warn('build artifacts exist; use `rm -rf build .svelte-kit/output .svelte-kit/generated` before production-smoke rebuilds');
	} else {
		pass('no stale production build artifacts detected');
	}
}

async function main() {
	console.log('eigen.beam doctor');
	checkBun();
	checkNode();
	checkPackageInstall();
	checkPlaywright();
	checkEnv();
	checkMcp();
	checkBuildArtifacts();
	await checkPort();

	if (failures > 0) {
		console.error(`\nDOCTOR FAIL — ${failures} failure(s), ${warnings} warning(s).`);
		exit(1);
	}
	console.log(`\nDOCTOR PASS — ${warnings} warning(s).`);
}

main().catch((error) => {
	console.error('DOCTOR FAIL:', error);
	exit(1);
});
