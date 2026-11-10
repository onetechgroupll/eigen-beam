import { spawn } from 'node:child_process';
import { env, exit } from 'node:process';
import { assertBootEnvironment, migrationOnBootEnabled } from './env-validation.mjs';

const args = process.argv.slice(2);

if (args[0] === 'migrate') {
	const code = await run(process.execPath, ['/app/scripts/migrate.mjs']);
	exit(code);
}

try {
	assertBootEnvironment(env);
} catch {
	exit(1);
}

if (migrationOnBootEnabled(env) && env.DATABASE_URL) {
	const code = await run(process.execPath, ['/app/scripts/migrate.mjs']);
	if (code !== 0) exit(1);
} else if (!migrationOnBootEnabled(env)) {
	console.log('skip migrations (EB_MIGRATE_ON_BOOT=false)');
}

const command = args.length ? args : [process.execPath, 'build'];
const code = await run(command[0], command.slice(1), true);
exit(code);

/** @param {string} command @param {string[]} commandArgs @param {boolean} [forwardSignals] */
function run(command, commandArgs, forwardSignals = false) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, commandArgs, { stdio: 'inherit', env });
		if (forwardSignals) {
			for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
		}
		child.once('error', reject);
		child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
	});
}
