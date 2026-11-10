import { env, exit } from 'node:process';
import { runMigrations } from './migrate-core.mjs';

if (!env.DATABASE_URL) {
	console.error('EB_MIGRATE_FAILED migration=bootstrap cause=MISSING_DATABASE_URL');
	exit(1);
}

runMigrations({ connectionString: env.DATABASE_URL }).catch(() => exit(1));
