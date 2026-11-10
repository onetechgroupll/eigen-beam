import { accessSync, constants, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const ENVIRONMENT_DOC = 'docs/deployment.md#environment';

/** @typedef {Record<string, string | undefined>} EnvLike */
/** @typedef {{ name: string, reason: string }} EnvironmentIssue */

/**
 * Collect every invalid or missing environment variable in one pass.
 * Values are deliberately excluded so callers can log the result safely.
 * @param {EnvLike} source
 * @returns {EnvironmentIssue[]}
 */
export function collectEnvironmentIssues(source = process.env) {
	/** @type {EnvironmentIssue[]} */
	const issues = [];
	const production = isProductionRuntime(source);
	const deckStore = normalized(source.EB_DECK_STORE, production ? '' : 'file');
	const activityStore = normalized(source.EB_ACTIVITY_STORE, production ? '' : 'off');
	const assetStore = normalized(source.EB_ASSET_STORE, production ? '' : 'local');
	const mailProvider = normalized(source.EB_MAIL_PROVIDER, production ? '' : 'outbox');
	// Requirement view: when production forces a store that the operator has not
	// set yet, its dependencies must be collected in the SAME pass (not on the
	// next boot after fixing the store name).
	/** @param {string | undefined} raw */
	const unset = (raw) => !raw?.trim();
	const requiredDeckStore = unset(source.EB_DECK_STORE) && production ? 'postgres' : deckStore;
	const requiredAssetStore = unset(source.EB_ASSET_STORE) && production ? 's3' : assetStore;
	const requiredMailProvider = unset(source.EB_MAIL_PROVIDER) && production ? 'resend' : mailProvider;

	validateChoice(issues, 'EB_DECK_STORE', deckStore, ['file', 'memory', 'postgres']);
	validateChoice(issues, 'EB_ACTIVITY_STORE', activityStore, ['off', 'postgres']);
	validateChoice(issues, 'EB_ASSET_STORE', assetStore, ['local', 's3']);
	validateChoice(issues, 'EB_MAIL_PROVIDER', mailProvider, ['outbox', 'console', 'resend', 'postmark']);
	validateBoolean(issues, 'EB_MIGRATE_ON_BOOT', source.EB_MIGRATE_ON_BOOT);
	validateBoolean(issues, 'EB_OAUTH_AUTH_CODE', source.EB_OAUTH_AUTH_CODE);
	if (source.EB_OAUTH_AUTH_CODE?.trim().toLowerCase() === 'true') addIssue(issues, 'EB_OAUTH_AUTH_CODE', 'disabled');
	validateOptionalPositiveInteger(issues, 'EB_QUOTA_DECKS_PER_USER', source.EB_QUOTA_DECKS_PER_USER);
	validateOptionalPositiveInteger(issues, 'EB_DEMO_DECK_TTL_DAYS', source.EB_DEMO_DECK_TTL_DAYS);
	validateLocale(issues, source.EB_DEFAULT_LOCALE ?? 'en');

	if (requiredDeckStore === 'postgres' || activityStore === 'postgres') {
		requireValue(issues, 'DATABASE_URL', source.DATABASE_URL);
		if (source.DATABASE_URL && !/^postgres(?:ql)?:\/\//i.test(source.DATABASE_URL)) addIssue(issues, 'DATABASE_URL', 'invalid');
	}
	if (requiredAssetStore === 's3') requireValue(issues, 'EB_BUCKET_NAME', source.EB_BUCKET_NAME);
	if (requiredMailProvider === 'resend') requireValue(issues, 'EB_RESEND_API_KEY', source.EB_RESEND_API_KEY);
	if (requiredMailProvider === 'postmark') requireValue(issues, 'EB_POSTMARK_TOKEN', source.EB_POSTMARK_TOKEN);

	const hasStaticMcpToken = Boolean(source.EB_MCP_TOKEN?.trim() || source.EB_MCP_TOKENS?.trim());
	const oauthClients = inspectOAuthClients(source.EB_OAUTH_CLIENTS);
	const hasOAuthClients = oauthClients.valid > 0;
	if (oauthClients.invalid > 0) addIssue(issues, 'EB_OAUTH_CLIENTS', 'invalid');
	if (inspectScopedTokens(source.EB_MCP_TOKENS).invalid > 0) addIssue(issues, 'EB_MCP_TOKENS', 'invalid');
	if (hasOAuthClients && !source.EB_OAUTH_TOKEN_SECRET?.trim()) addIssue(issues, 'EB_OAUTH_TOKEN_SECRET', 'missing');
	if (source.EB_OAUTH_TOKEN_SECRET?.trim() && !hasOAuthClients) addIssue(issues, 'EB_OAUTH_CLIENTS', 'missing');

	if (production) {
		requireValue(issues, 'DATABASE_URL', source.DATABASE_URL);
		if (!isHttpsUrl(source.ORIGIN)) addIssue(issues, 'ORIGIN', source.ORIGIN ? 'invalid' : 'missing');
		if (!source.EB_MAGIC_LINK_SECRET?.trim() || Buffer.byteLength(source.EB_MAGIC_LINK_SECRET) < 32) {
			addIssue(issues, 'EB_MAGIC_LINK_SECRET', source.EB_MAGIC_LINK_SECRET ? 'invalid' : 'missing');
		}
		if (deckStore !== 'postgres') addIssue(issues, 'EB_DECK_STORE', 'invalid');
		if (activityStore !== 'postgres') addIssue(issues, 'EB_ACTIVITY_STORE', 'invalid');
		if (assetStore !== 's3') addIssue(issues, 'EB_ASSET_STORE', 'invalid');
		if (!['resend', 'postmark'].includes(mailProvider)) addIssue(issues, 'EB_MAIL_PROVIDER', 'invalid');
		if (!hasStaticMcpToken && !hasOAuthClients) addIssue(issues, 'EB_MCP_TOKEN', 'missing');
	} else if (normalized(source.NODE_ENV, '') !== 'development') {
		// Minimal/self-host mode documents ORIGIN as required (deployment.md);
		// `vite dev` (NODE_ENV=development) stays exempt for local DX.
		if (!isHttpUrl(source.ORIGIN)) addIssue(issues, 'ORIGIN', source.ORIGIN ? 'invalid' : 'missing');
	}

	return dedupeIssues(issues);
}

/** @param {EnvLike} source */
export function migrationOnBootEnabled(source = process.env) {
	return source.EB_MIGRATE_ON_BOOT?.trim().toLowerCase() !== 'false';
}

/**
 * Validate configuration and all local directories used during this boot.
 * Throws only after logging a secret-safe summary containing names, not values.
 * @param {EnvLike} source
 */
export function assertBootEnvironment(source = process.env) {
	const issues = collectEnvironmentIssues(source);
	if (issues.length) failBoot(issues.map((issue) => issue.name), 'invalid_environment');

	const production = isProductionRuntime(source);
	const deckStore = normalized(source.EB_DECK_STORE, production ? '' : 'file');
	const assetStore = normalized(source.EB_ASSET_STORE, production ? '' : 'local');
	const mailProvider = normalized(source.EB_MAIL_PROVIDER, production ? '' : 'outbox');
	/** @type {Array<{ name: string, path: string }>} */
	const directories = [];
	if (deckStore === 'file') directories.push({ name: 'EB_DATA_DIR', path: source.EB_DATA_DIR ?? '.data/decks' });
	if (assetStore === 'local') directories.push({ name: 'EB_ASSET_DIR', path: source.EB_ASSET_DIR ?? '.data/assets' });
	if (mailProvider === 'outbox') directories.push({ name: 'EB_DATA_DIR', path: join(source.EB_DATA_DIR ?? '.data', 'outbox') });
	// Follows persist to a local file even with the Postgres activity store,
	// so its parent directory must be writable too.
	directories.push({ name: 'EB_FOLLOWS_FILE', path: dirname(source.EB_FOLLOWS_FILE ?? join(source.EB_DATA_DIR ?? '.data', 'follows.json')) });

	for (const directory of uniqueDirectories(directories)) {
		try {
			mkdirSync(directory.path, { recursive: true });
			accessSync(directory.path, constants.W_OK);
		} catch {
			failBoot([directory.name], 'directory_not_writable');
		}
	}
}

/** @param {EnvLike} source */
export function isProductionRuntime(source = process.env) {
	// Case-normalised like src/lib/server/auth.ts: NODE_ENV=Production must not
	// silently enable dev paths.
	/** @param {...string} names */
	const marker = (...names) => names.some((name) => (source[name] ?? '').toLowerCase() === 'production');
	return marker('NODE_ENV', 'RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME');
}

/** @param {string | undefined} raw */
export function hasValidOAuthClientEntry(raw) {
	return inspectOAuthClients(raw).valid > 0;
}

const MCP_SCOPES = new Set(['deck:read', 'deck:write', 'room:create', 'asset:upload']);

/** @param {string | undefined} raw */
function inspectOAuthClients(raw) {
	let valid = 0;
	let invalid = 0;
	for (const entry of splitEntries(raw)) {
		const [credential, scopes] = entry.split('|', 2);
		const separator = credential.indexOf(':');
		const credentialValid = separator > 0 && Boolean(credential.slice(0, separator).trim()) && Boolean(credential.slice(separator + 1).trim());
		const scopesValid = scopes === undefined || validScopes(scopes, MCP_SCOPES);
		if (credentialValid && scopesValid) valid++;
		else invalid++;
	}
	return { valid, invalid };
}

/** @param {string | undefined} raw */
function inspectScopedTokens(raw) {
	let valid = 0;
	let invalid = 0;
	const scopes = new Set(['*', ...MCP_SCOPES]);
	for (const entry of splitEntries(raw)) {
		const [token, scopeList] = entry.split('|', 2);
		if (token.trim() && (scopeList === undefined || validScopes(scopeList, scopes))) valid++;
		else invalid++;
	}
	return { valid, invalid };
}

/** @param {string} raw @param {Set<string>} allowed */
function validScopes(raw, allowed) {
	const scopes = raw.split(/[+\s]+/).map((scope) => scope.trim()).filter(Boolean);
	return scopes.length > 0 && scopes.every((scope) => allowed.has(scope));
}

/** @param {string | undefined} raw */
function splitEntries(raw) {
	return (raw ?? '').split(/[\n\r,]+/).map((entry) => entry.trim()).filter(Boolean);
}

/** @param {EnvironmentIssue[]} issues @param {string} name @param {string | undefined} value */
function validateBoolean(issues, name, value) {
	if (value === undefined || value === '') return;
	if (!['true', 'false'].includes(value.trim().toLowerCase())) addIssue(issues, name, 'invalid');
}

/** @param {EnvironmentIssue[]} issues @param {string} name @param {string | undefined} value */
function validateOptionalPositiveInteger(issues, name, value) {
	if (value === undefined || value === '') return;
	if (!/^[1-9]\d*$/.test(value.trim())) addIssue(issues, name, 'invalid');
}

/** @param {EnvironmentIssue[]} issues @param {string} value */
function validateLocale(issues, value) {
	if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(value.trim())) addIssue(issues, 'EB_DEFAULT_LOCALE', 'invalid');
}

/** @param {EnvironmentIssue[]} issues @param {string} name @param {string} value @param {string[]} allowed */
function validateChoice(issues, name, value, allowed) {
	if (!allowed.includes(value)) addIssue(issues, name, 'invalid');
}

/** @param {EnvironmentIssue[]} issues @param {string} name @param {string | undefined} value */
function requireValue(issues, name, value) {
	if (!value?.trim()) addIssue(issues, name, 'missing');
}

/** @param {EnvironmentIssue[]} issues @param {string} name @param {string} reason */
function addIssue(issues, name, reason) {
	issues.push({ name, reason });
}

/** @param {EnvironmentIssue[]} issues */
function dedupeIssues(issues) {
	return [...new Map(issues.map((issue) => [issue.name, issue])).values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {string | undefined} value @param {string} fallback */
function normalized(value, fallback) {
	return (value ?? fallback).trim().toLowerCase();
}

/** @param {string | undefined} value */
function isHttpsUrl(value) {
	try {
		return typeof value === 'string' && new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
}

/** @param {string | undefined} value */
function isHttpUrl(value) {
	if (typeof value !== 'string') return false;
	try {
		const protocol = new URL(value).protocol;
		return protocol === 'https:' || protocol === 'http:';
	} catch {
		return false;
	}
}

/** @param {Array<{ name: string, path: string }>} directories */
function uniqueDirectories(directories) {
	return [...new Map(directories.map((directory) => [directory.path, directory])).values()];
}

/** @param {string[]} names @param {string} cause */
function failBoot(names, cause) {
	const uniqueNames = [...new Set(names)].sort();
	console.error(`EB_BOOT_FAILED cause=${cause} env=${uniqueNames.join(',')} docs=${ENVIRONMENT_DOC}`);
	throw new Error('Boot environment validation failed');
}
