// Warnings for invalid auth configuration entries. Separate module so that
// mcp-auth and oauth-server can share it without a circular value import.
const warnedEntries = new Set<string>();

/** Logs once per entry position; never logs the token, secret or scopes. */
export function warnInvalidEntry(variable: string, index: number): void {
	const key = `${variable}#${index}`;
	if (warnedEntries.has(key)) return;
	warnedEntries.add(key);
	console.warn(`[mcp-auth] ${variable} entry ${index + 1} ignored: scope list is empty or contains an unknown scope.`);
}
