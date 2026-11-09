import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { env, exit } from 'node:process';
import { Pool } from 'pg';

async function main() {
	if (!env.DATABASE_URL) {
		console.error('DATABASE_URL fehlt. Migration abgebrochen.');
		exit(1);
	}
	const pool = new Pool({ connectionString: env.DATABASE_URL });
	try {
		await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
			filename TEXT PRIMARY KEY,
			applied_at BIGINT NOT NULL
		)`);
		const files = (await readdir('migrations')).filter((f) => f.endsWith('.sql')).sort();
		for (const file of files) {
			const seen = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
			if (seen.rowCount) {
				console.log(`skip ${file}`);
				continue;
			}
			const sql = await readFile(join('migrations', file), 'utf8');
			await pool.query('BEGIN');
			try {
				await pool.query(sql);
				await pool.query('INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, $2)', [file, Date.now()]);
				await pool.query('COMMIT');
				console.log(`applied ${file}`);
			} catch (e) {
				await pool.query('ROLLBACK');
				throw e;
			}
		}
	} finally {
		await pool.end();
	}
}

main().catch((e) => {
	console.error(e);
	exit(1);
});
