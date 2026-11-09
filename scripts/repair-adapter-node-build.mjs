import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const manifestDir = 'build/server/chunks';
const misplacedChunkDir = 'build/server/chunks 2';
const sourceClientVersion = '.svelte-kit/output/client/_app/version.json';
const targetClientVersion = 'build/client/_app/version.json';

function copyTreeContents(source, target) {
	if (!existsSync(source)) return 0;
	let copied = 0;
	const stack = [source];
	while (stack.length > 0) {
		const current = stack.pop();
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const sourcePath = join(current, entry.name);
			const targetPath = join(target, relative(source, sourcePath));
			if (entry.isDirectory()) {
				mkdirSync(targetPath, { recursive: true });
				stack.push(sourcePath);
				continue;
			}
			if (!entry.isFile()) continue;
			mkdirSync(dirname(targetPath), { recursive: true });
			copyFileSync(sourcePath, targetPath);
			copied += 1;
		}
	}
	return copied;
}

function existingImportTarget(fromFile, specifier) {
	const exact = resolve(dirname(fromFile), specifier);
	return existsSync(exact) || existsSync(`${exact}.js`) || existsSync(`${exact}.mjs`);
}

function relativeImports(file) {
	const source = readFileSync(file, 'utf8');
	const imports = new Set();
	for (const match of source.matchAll(/(?:import\s*(?:\(\s*)?|from\s*)['\"](\.[^'\"]+)['\"]/g)) imports.add(match[1]);
	return [...imports];
}

function isAdapterRuntimeChunk(specifier) {
	return /\.js-[A-Za-z0-9_-]+\.js$/.test(specifier)
		|| specifier.startsWith('./nodes/')
		|| specifier.startsWith('../nodes/')
		|| specifier.includes('/nodes/');
}

const manifestFiles = existsSync(manifestDir)
	? readdirSync(manifestDir).filter((name) => /^manifest.*\.js$/.test(name))
	: [];

if (manifestFiles.length !== 1) {
	console.error(`[postbuild] expected exactly one adapter-node manifest in ${manifestDir}, found ${manifestFiles.length}`);
	process.exit(1);
}

// SvelteKit/Vite can emit a second server chunk tree as "chunks 2" while the
// generated adapter-node imports expect those files below "chunks". Materialise
// that tree before local/production `node build` can fail lazily at runtime.
const copiedFiles = copyTreeContents(misplacedChunkDir, manifestDir);

if (!existsSync(targetClientVersion) && existsSync(sourceClientVersion)) {
	mkdirSync(dirname(targetClientVersion), { recursive: true });
	copyFileSync(sourceClientVersion, targetClientVersion);
}

const unresolved = [];
const stack = [manifestDir];
while (stack.length > 0) {
	const current = stack.pop();
	for (const entry of readdirSync(current, { withFileTypes: true })) {
		const path = join(current, entry.name);
		if (entry.isDirectory()) {
			stack.push(path);
			continue;
		}
		if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
		for (const specifier of relativeImports(path).filter(isAdapterRuntimeChunk)) {
			if (!existingImportTarget(path, specifier)) unresolved.push(`${path} -> ${specifier}`);
		}
	}
}

if (unresolved.length > 0) {
	console.error('[postbuild] adapter-node build has unresolved relative imports:');
	for (const missing of unresolved.slice(0, 80)) console.error(`  - ${missing}`);
	if (unresolved.length > 80) console.error(`  … ${unresolved.length - 80} more`);
	process.exit(1);
}

if (!existsSync(targetClientVersion)) {
	console.error(`[postbuild] missing client version file: ${targetClientVersion}`);
	process.exit(1);
}

if (copiedFiles) console.log(`[postbuild] materialised ${copiedFiles} adapter-node misplaced chunk files.`);
console.log('[postbuild] adapter-node relative imports verified.');
