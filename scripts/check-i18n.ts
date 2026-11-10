import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogs } from '../src/lib/i18n/catalogs.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CATALOG_FILE = 'src/lib/i18n/catalogs.ts';

// Deliberate exceptions. These files contain deck content, bilingual generated
// output, protocol guidance, or operator-only diagnostics — never UI copy.
const ALLOWLIST = new Map<string, string>([
	['src/lib/decks.ts', 'German starter deck is user-authored deck content.'],
	['src/lib/deck-quality.ts', 'Language detection regexes include German terms.'],
	['src/lib/deck-v2-draft.ts', 'Generated output follows the deck language.'],
	['src/lib/follow-up-pack.ts', 'Generated output follows the deck language.'],
	['src/lib/polish.ts', 'Generated replay copy follows the deck language.'],
	['src/lib/presenter-feed.ts', 'Generated live feed follows the deck language.'],
	['src/lib/session-coach.ts', 'Generated output follows the deck language.'],
	['src/lib/session-summary.ts', 'Generated output follows the deck language.'],
	['src/lib/slide-heatmap.ts', 'Generated output follows the deck language.'],
	['src/lib/stats-dashboard.ts', 'Generated presenter analysis follows the selected UI language.'],
	['src/lib/server/takeaway.ts', 'Generated output follows the deck language.'],
	['src/lib/server/assets.ts', 'Operator diagnostics and storage validation.'],
	['src/lib/server/auth.ts', 'Internal validation error retained for non-HTTP callers.'],
	['src/lib/server/clarity.ts', 'German model prompt for German deck transformation.'],
	['src/lib/server/deck-input.ts', 'Internal parser validation; HTTP routes map it to stable codes.'],
	['src/lib/server/decks-repo.ts', 'Operator diagnostics and repository comments.'],
	['src/lib/server/imports.ts', 'Import prompts and internal validation.'],
	['src/lib/server/mcp-server.ts', 'MCP authoring guidance is protocol content.'],
	['src/lib/server/mailer.ts', 'Operator diagnostics; mail bodies live in the catalog.'],
	['src/lib/server/rooms.ts', 'Operator diagnostics only.'],
	['src/lib/server/origin.ts', 'Operator configuration diagnostics.'],
	['src/lib/server/activity-store.ts', 'Operator configuration diagnostics.'],
	['src/lib/server/voice.ts', 'Operator/import diagnostics mapped by HTTP routes.']
]);

const GERMAN = /[äöüÄÖÜß]|\b(?:abbrechen|anmelden|antwort|beendet|bitte|deck\s+nicht\s+gefunden|erledigt|fehler|folie|folien|frage|freigegeben|gesendet|gestern|heute|jetzt|keine|konnte|löschen|merken|nicht\s+gefunden|öffnen|präsentation|schließen|sichtbarkeit|speichern|teilen|ungültig|weiter|zurück)\b/i;

export type I18nCheckResult = { errors: string[]; filesChecked: number };

export async function runI18nCheck(): Promise<I18nCheckResult> {
	const errors: string[] = [];
	const keys = new Set(Object.keys(catalogs.de));
	errors.push(...germanCatalogValueErrors(catalogs.en));
	for (const locale of ['de', 'en'] as const) {
		for (const key of keys) {
			if (!(key in catalogs[locale])) errors.push(`${CATALOG_FILE}: missing key "${key}" for locale "${locale}"`);
		}
		for (const key of Object.keys(catalogs[locale])) {
			if (!keys.has(key)) errors.push(`${CATALOG_FILE}: extra key "${key}" for locale "${locale}"`);
		}
	}

	const files = [
		...(await sourceFiles(join(ROOT, 'src/routes'))),
		...(await sourceFiles(join(ROOT, 'src/lib')))
	];
	for (const file of files) {
		const path = relative(ROOT, file);
		if (path === CATALOG_FILE || ALLOWLIST.has(path)) continue;
		const source = await readFile(file, 'utf8');
		const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
		// Known limitation: this regex guard does not reconstruct concatenated strings or
		// nested template expressions. Those forms still require review at their call sites.
		for (const match of withoutComments.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
			if (!GERMAN.test(match[2])) continue;
			const line = withoutComments.slice(0, match.index).split('\n').length;
			errors.push(`${path}:${line}: German literal outside catalog: ${JSON.stringify(match[2].slice(0, 100))}`);
		}
	}
	return { errors, filesChecked: files.length };
}

export function germanCatalogValueErrors(catalog: Record<string, string>): string[] {
	return Object.entries(catalog)
		.filter(([, value]) => GERMAN.test(value))
		.map(([key, value]) => `${CATALOG_FILE}: English catalog value for "${key}" looks German: ${JSON.stringify(value.slice(0, 100))}`);
}

async function sourceFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...await sourceFiles(path));
		else if (/\.(?:ts|svelte)$/.test(entry.name)) files.push(path);
	}
	return files;
}

if (import.meta.main) {
	const result = await runI18nCheck();
	if (result.errors.length) {
		console.error(`i18n check failed (${result.errors.length}):`);
		for (const error of result.errors) console.error(`  - ${error}`);
		process.exit(1);
	}
	console.log(`i18n check passed: ${Object.keys(catalogs.de).length} keys × 2 locales, ${result.filesChecked} source files scanned.`);
}
