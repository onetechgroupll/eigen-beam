import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { chromium, devices, type ConsoleMessage } from 'playwright';

const BASE = process.env.EB_SMOKE_BASE ?? 'http://127.0.0.1:4176';
const device = devices['iPhone 15 Pro'] ?? devices['iPhone 14 Pro'];
let passed = 0;
function ok(name: string) {
	passed++;
	console.log(`  ✓ ${name}`);
}

function isIgnorableConsole(message: ConsoleMessage): boolean {
	const text = message.text();
	return message.type() === 'warning' && /favicon|manifest/i.test(text);
}

async function main() {
	console.log(`BROWSER SMOKE gegen ${BASE}`);
	const browser = await chromium.launch({ headless: true });
	try {
		const context = await browser.newContext({ ...device, colorScheme: 'dark', locale: 'de-DE' });
		const page = await context.newPage();
		const consoleFailures: Array<{ type: string; text: string }> = [];
		page.on('console', (message) => {
			if (['error', 'warning'].includes(message.type()) && !isIgnorableConsole(message)) consoleFailures.push({ type: message.type(), text: message.text() });
		});
		page.on('pageerror', (error) => consoleFailures.push({ type: 'pageerror', text: String(error) }));

		await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45_000 });
		await page.getByText(/PDF danach schicken war gestern/i).waitFor({ timeout: 5_000 });
		await page.getByRole('button', { name: /Live-Sync testen/ }).click({ timeout: 10_000 });
		await page.waitForURL(/\/present\/[^/]+$/, { timeout: 15_000 });
		assert.match(page.url(), /\/present\/[^/]+$/);
		const roomId = page.url().match(/\/present\/([^/]+)$/)?.[1];
		assert.ok(roomId, 'Presenter URL enthält Room-ID');
		ok('Home CTA hydriert und navigiert zu Presenter-Room');

		await page.getByText(/REMOTE-STEUERUNG/i).waitFor({ timeout: 5_000 });
		await page.getByRole('button', { name: /Beitreten|Join/i }).waitFor({ timeout: 5_000 });
		await page.getByRole('button', { name: /Coach öffnen/i }).waitFor({ timeout: 5_000 });
		ok('Presenter öffnet mobile-first als Remote-Control mit Join-Drawer');

		await page.getByRole('button', { name: /Weiter/ }).click({ timeout: 10_000 });
		await page.waitForTimeout(300);

		const viewerPage = await context.newPage();
		viewerPage.on('console', (message) => {
			if (['error', 'warning'].includes(message.type()) && !isIgnorableConsole(message)) consoleFailures.push({ type: message.type(), text: message.text() });
		});
		viewerPage.on('pageerror', (error) => consoleFailures.push({ type: 'pageerror', text: String(error) }));
		await viewerPage.goto(`${BASE}/v/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
		await viewerPage.getByRole('button', { name: /Optionen/i }).waitFor({ timeout: 5_000 });
		await viewerPage.getByText(/Links nachlesen · LIVE hält dich synchron/i).waitFor({ timeout: 5_000 });
		assert.equal(await viewerPage.getByRole('button', { name: /Weiter oder nächster Reveal/i }).count(), 0, 'Viewer benennt Rechts-Tap nicht mehr als freies Weiter');
		assert.equal(await viewerPage.getByText('Tippe rechts weiter', { exact: true }).count(), 0, 'Viewer zeigt keinen zweiten Tap-Hint-Pill');
		ok('Viewer zeigt Premium-Stage mit intentionalem Options-Sheet');

		await page.evaluate(async () => {
			const response = await fetch(`${location.pathname}/slide`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ slide: 999 })
			});
			if (!response.ok) throw new Error(`Letzte Folie fehlgeschlagen: ${response.status}`);
		});
		await viewerPage.evaluate(async () => {
			const response = await fetch(`${location.pathname}/event`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ type: 'question', text: 'Wie geht es nach der Session weiter?' })
			});
			if (!response.ok) throw new Error(`Testfrage fehlgeschlagen: ${response.status}`);
		});
		const unauthorisedExport = await fetch(`${BASE}/present/${roomId}/questions`);
		assert.equal(unauthorisedExport.status, 403, 'Fragen-Export ohne Presenter-Cookie muss 403 liefern');
		await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
		await page.getByRole('button', { name: /Session beenden →/i }).click({ timeout: 10_000 });
		const endDialog = page.getByRole('dialog', { name: /Session für alle beenden/i });
		await endDialog.getByText(/Alle Viewer wechseln sofort zum End-Screen/i).waitFor({ timeout: 5_000 });
		const questionDownload = page.waitForEvent('download', { timeout: 10_000 });
		await endDialog.getByRole('button', { name: /^Exportieren und beenden$/i }).click({ timeout: 10_000 });
		assert.match((await questionDownload).suggestedFilename(), /-questions\.md$/);
		await page.getByRole('heading', { name: /^Session beendet\.$/i }).waitFor({ timeout: 5_000 });
		await viewerPage.getByRole('link', { name: /Replay ansehen/i }).waitFor({ timeout: 5_000 });
		ok('Session-Ende exportiert Fragen nach dem ACK und schaltet Presenter/Viewer auf den Endzustand');

		await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
		await page.getByRole('heading', { name: /^Session beendet\.$/i }).waitFor({ timeout: 5_000 });
		const beforeDoubleEndFailures = consoleFailures.length;
		const doubleEnd = await page.evaluate(async () => {
			const response = await fetch(`${location.pathname}/slide`, { method: 'DELETE' });
			return { status: response.status, body: await response.json() };
		});
		assert.equal(doubleEnd.status, 410);
			assert.equal((doubleEnd.body as { code?: unknown }).code, 'already_ended');
		assert.equal(typeof (doubleEnd.body as { endedAt?: unknown }).endedAt, 'number');
		assert.equal((doubleEnd.body as { stats?: { questions?: unknown } }).stats?.questions, 1);
		assert.equal((doubleEnd.body as { questions?: unknown[] }).questions?.length, 1);
		const expectedDoubleEndFailures = consoleFailures.slice(beforeDoubleEndFailures);
		if (expectedDoubleEndFailures.every((failure) => /Failed to load resource: the server responded with a status of 410/i.test(failure.text))) {
			consoleFailures.splice(beforeDoubleEndFailures);
		}
		ok('Presenter-Reload bleibt beendet und doppeltes DELETE liefert bereits beendet');
		await viewerPage.close();

		await page.goto(`${BASE}/replay/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
		await page.getByText(/NÄCHSTE BESTE AKTION|NEXT BEST ACTION/i).waitFor({ timeout: 5_000 });
		await page.getByRole('heading', { name: /Follow-up mailen/i }).waitFor({ timeout: 5_000 });
		await page.getByLabel('Replay-Steuerung').getByRole('link', { name: /Follow-up mailen/i }).waitFor({ timeout: 5_000 });
		await page.getByRole('button', { name: /Session ansehen/i }).waitFor({ timeout: 5_000 });
		await page.getByRole('button', { name: /Details öffnen/i }).waitFor({ timeout: 5_000 });
		ok('Replay startet als action-first Command Center');

		await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
		await page.getByText(/SCHNELLSTART/i).waitFor({ timeout: 5_000 });
		await page.getByText(/GEFÜHRTER EDITOR/i).waitFor({ timeout: 5_000 });
		await page.getByText(/1 Material/i).waitFor({ timeout: 5_000 });
		await page.getByText(/IMPORT-STUDIO/i).waitFor({ timeout: 5_000 });
		await page.getByText(/^ready check$/i).waitFor({ timeout: 5_000 });
		await page.getByLabel('Ready Check').getByText(/Live-ready:/i).waitFor({ timeout: 5_000 });
		await page.getByText(/Mobile Format vorbereitet/i).waitFor({ timeout: 5_000 });
		await page.getByRole('button', { name: /6 Folien live starten/i }).waitFor({ timeout: 5_000 });
		await page.getByText(/Import läuft|Import bereit/i).waitFor({ timeout: 5_000 });
		await page.getByLabel(/^import.?studio$/i).getByRole('button', { name: /Advanced/i }).waitFor({ timeout: 5_000 });
		await page.getByRole('button', { name: /CTA ergänzen/i }).waitFor({ timeout: 5_000 });
		const beforeImportFailures = consoleFailures.length;
		await page.setInputFiles('input[type="file"][accept*=".pdf"]', { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%% broken') });
		await page.getByText(/Import-Fehler|Import Fehler|Import fehlgeschlagen/i).waitFor({ timeout: 10_000 });
		const expectedImportFailures = consoleFailures.slice(beforeImportFailures);
		if (expectedImportFailures.every((failure) => /Failed to load resource: the server responded with a status of (401|422)/i.test(failure.text))) {
			consoleFailures.splice(beforeImportFailures);
		}
		await page.getByRole('button', { name: /Live starten/i }).click({ timeout: 10_000 });
		await page.waitForURL(/\/present\/[^/]+$/, { timeout: 20_000 });
		await page.getByText(/REMOTE-STEUERUNG/i).waitFor({ timeout: 5_000 });
		ok('Authoring startet mit Import-Studio, Raw-Markdown hinter Advanced und direktem Live-Start');

		await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
		await page.getByText(/Diese Decks gehören schon dir/i).waitFor({ timeout: 5_000 });
		await page.getByRole('button', { name: /Library öffnen/i }).click({ timeout: 10_000 });
		await page.waitForFunction(() => location.hash === '#library-remote', undefined, { timeout: 5_000 });
		await page.locator('#library-remote:focus').waitFor({ timeout: 5_000 });
		await page.getByText(/BIBLIOTHEKS-REMOTE/i).waitFor({ timeout: 5_000 });
		await page.getByRole('button', { name: /Library sichern/i }).waitFor({ timeout: 5_000 });
		await page.getByRole('link', { name: /Deck importieren/i }).waitFor({ timeout: 5_000 });
		await page.getByRole('button', { name: /^Live starten/i }).first().click({ timeout: 10_000 });
		await page.waitForURL(/\/present\/[^/]+$/, { timeout: 20_000 });
		await page.getByText(/REMOTE-STEUERUNG/i).waitFor({ timeout: 5_000 });
		ok('Library zeigt mobile Remote-Cards und startet gespeichertes Deck direkt live');

		await expectNoConsoleFailures(consoleFailures);
		ok('Presenter-UI ist interaktiv und ohne Console-Errors');

		await context.close();

		const englishContext = await browser.newContext({ ...device, colorScheme: 'light', locale: 'en-US' });
		const englishPage = await englishContext.newPage();
		await englishPage.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45_000 });
		assert.equal(await englishPage.locator('html').getAttribute('lang'), 'en');
		await englishPage.getByRole('heading', { name: /Present live on every phone/i }).waitFor({ timeout: 5_000 });
		await englishPage.goto(`${BASE}/v/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
		await englishPage.getByRole('heading', { name: /^Presentation ended\.$/i }).waitFor({ timeout: 5_000 });
		await englishPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
		await englishPage.getByRole('button', { name: /^Deutsch$/i }).click({ timeout: 10_000 });
		assert.equal(await englishPage.locator('html').getAttribute('lang'), 'de');
		await englishPage.goto(`${BASE}/v/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
		await englishPage.getByRole('heading', { name: /^Präsentation beendet\.$/i }).waitFor({ timeout: 5_000 });
		assert.equal(await englishPage.locator('html').getAttribute('lang'), 'de');
		ok('EN-Browser erhält englische Viewer-UI; Sprachschalter persistiert DE per Cookie');
		await englishContext.close();
	} finally {
		await browser.close();
	}
	console.log(`\nBROWSER SMOKE PASS — ${passed} checks.`);
	console.log('MANUAL QA — echten Offline-Wechsel vor dem Session-Ende und anschließenden Reconnect auf einem Mobilgerät prüfen.');
}

async function expectNoConsoleFailures(failures: Array<{ type: string; text: string }>) {
	assert.deepEqual(failures, []);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
