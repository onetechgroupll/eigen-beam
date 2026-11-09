import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	chromium,
	webkit,
	devices,
	type Browser,
	type BrowserType,
	type ConsoleMessage,
	type Page
} from 'playwright';

const BASE = process.env.EB_MOBILE_QA_BASE ?? process.env.EB_SMOKE_BASE ?? 'https://eigen-beam-production.up.railway.app';
const OUT_DIR = process.env.EB_MOBILE_QA_OUT ?? `reports/mobile-qa-lab-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const ENGINE_FILTER = process.env.EB_MOBILE_QA_ENGINES?.split(',').map((engine) => engine.trim()).filter(Boolean);
const PROFILE_FILTER = process.env.EB_MOBILE_QA_PROFILES?.split(',').map((profile) => profile.trim()).filter(Boolean);

type EngineName = 'chromium' | 'webkit';
type SurfaceName = 'home' | 'presenter' | 'viewer' | 'replay' | 'authoring' | 'account-library';

type DeviceProfile = {
	name: string;
	deviceName: string;
	colorScheme: 'dark' | 'light';
};

type SurfaceMetric = {
	surface: SurfaceName;
	url: string;
	screenshot: string;
	visibleAnchors: string[];
	tapTargets: Array<{ label: string; width: number; height: number; x: number; y: number }>;
	issues: string[];
};

type RunResult = {
	engine: EngineName;
	profile: string;
	deviceName: string;
	colorScheme: string;
	viewport: { width: number; height: number } | null;
	roomId?: string;
	consoleFailures: Array<{ type: string; text: string }>;
	surfaces: SurfaceMetric[];
	status: 'passed' | 'failed';
	failure?: string;
};

const engines: Array<{ name: EngineName; type: BrowserType }> = [
	{ name: 'chromium', type: chromium },
	{ name: 'webkit', type: webkit }
].filter((engine): engine is { name: EngineName; type: BrowserType } => !ENGINE_FILTER || ENGINE_FILTER.includes(engine.name));

const profiles: DeviceProfile[] = [
	{ name: 'iphone-15-pro-dark', deviceName: 'iPhone 15 Pro', colorScheme: 'dark' },
	{ name: 'iphone-se-dark', deviceName: 'iPhone SE', colorScheme: 'dark' },
	{ name: 'pixel-7-dark', deviceName: 'Pixel 7', colorScheme: 'dark' },
	{ name: 'iphone-15-pro-light', deviceName: 'iPhone 15 Pro', colorScheme: 'light' }
].filter((profile) => !PROFILE_FILTER || PROFILE_FILTER.includes(profile.name));

function isIgnorableConsoleFailure(type: string, text: string): boolean {
	if (type === 'warning' && /favicon|manifest/i.test(text)) return true;
	return type === 'pageerror' && /EventSource cannot load .*\/present\/[^/]+\/events due to access control checks/i.test(text);
}

function isIgnorableConsole(message: ConsoleMessage): boolean {
	return isIgnorableConsoleFailure(message.type(), message.text());
}

function slug(input: string): string {
	return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function relScreenshot(engine: EngineName, profile: string, surface: SurfaceName): string {
	return path.join('screenshots', `${engine}-${profile}-${surface}.png`);
}

async function screenshot(page: Page, engine: EngineName, profile: string, surface: SurfaceName): Promise<string> {
	const rel = relScreenshot(engine, profile, surface);
	await page.screenshot({ path: path.join(OUT_DIR, rel), fullPage: surface === 'replay' || surface === 'authoring' });
	return rel;
}

async function collectTapTargets(page: Page, labels: RegExp[]): Promise<SurfaceMetric['tapTargets']> {
	const targets: SurfaceMetric['tapTargets'] = [];
	for (const label of labels) {
		const locator = page.getByRole('button', { name: label }).first();
		if (!(await locator.count())) continue;
		await locator.scrollIntoViewIfNeeded({ timeout: 5_000 });
		const box = await locator.boundingBox();
		if (!box) continue;
		targets.push({ label: String(label), width: Math.round(box.width), height: Math.round(box.height), x: Math.round(box.x), y: Math.round(box.y) });
	}
	return targets;
}

function checkTapTargets(targets: SurfaceMetric['tapTargets'], viewport: { width: number; height: number } | null): string[] {
	const issues: string[] = [];
	for (const target of targets) {
		if (target.width < 44 || target.height < 44) issues.push(`Tap target ${target.label} is ${target.width}x${target.height}, below 44px.`);
		if (viewport && target.y < viewport.height && target.y + target.height > viewport.height + 2) issues.push(`Visible tap target ${target.label} extends below viewport (${target.y + target.height}px > ${viewport.height}px).`);
	}
	return issues;
}

async function expectVisible(page: Page, pattern: RegExp | string, timeout = 8_000): Promise<string> {
	await page.getByText(pattern).first().waitFor({ timeout });
	return String(pattern);
}

async function surfaceMetric(page: Page, engine: EngineName, profile: string, surface: SurfaceName, anchors: Array<RegExp | string>, tapLabels: RegExp[]): Promise<SurfaceMetric> {
	const visibleAnchors: string[] = [];
	for (const anchor of anchors) visibleAnchors.push(await expectVisible(page, anchor));
	const screenshotPath = await screenshot(page, engine, profile, surface);
	const tapTargets = await collectTapTargets(page, tapLabels);
	const issues = checkTapTargets(tapTargets, page.viewportSize());
	return {
		surface,
		url: page.url(),
		screenshot: screenshotPath,
		visibleAnchors,
		tapTargets,
		issues
	};
}

async function runProfile(engine: EngineName, browserType: BrowserType, profile: DeviceProfile): Promise<RunResult> {
	const consoleFailures: RunResult['consoleFailures'] = [];
	let browser: Browser | null = null;
	let context: Awaited<ReturnType<Browser['newContext']>> | null = null;
	let viewport: { width: number; height: number } | null = null;
	const surfaces: SurfaceMetric[] = [];
	try {
		const device = devices[profile.deviceName];
		assert.ok(device, `Unknown Playwright device profile: ${profile.deviceName}`);
		browser = await browserType.launch({ headless: true });
		context = await browser.newContext({ ...device, colorScheme: profile.colorScheme, locale: 'de-DE' });
		const page = await context.newPage();
		viewport = page.viewportSize();
		page.on('console', (message) => {
			if (['error', 'warning'].includes(message.type()) && !isIgnorableConsole(message)) consoleFailures.push({ type: message.type(), text: message.text() });
		});
		page.on('pageerror', (error) => {
			const text = String(error);
			if (!isIgnorableConsoleFailure('pageerror', text)) consoleFailures.push({ type: 'pageerror', text });
		});

		await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45_000 });
		surfaces.push(await surfaceMetric(page, engine, profile.name, 'home', [/Live-Sync testen/i, /PDF danach schicken war gestern/i, /eigen\.beam/i], [/Live-Sync testen/i]));

		await page.getByRole('button', { name: /Live-Sync testen/i }).click({ timeout: 10_000 });
		await page.waitForURL(/\/present\/[^/]+$/, { timeout: 15_000 });
		const roomId = page.url().match(/\/present\/([^/]+)$/)?.[1];
		assert.ok(roomId, 'Presenter URL enthält Room-ID');
		surfaces.push(await surfaceMetric(page, engine, profile.name, 'presenter', [/REMOTE CONTROL/i, /ON AIR/i], [/Weiter/i, /Zurück/i, /Join/i]));

		await page.getByRole('button', { name: /Weiter/i }).click({ timeout: 10_000 });
		await page.waitForTimeout(250);

		await page.goto(`${BASE}/v/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
		surfaces.push(await surfaceMetric(page, engine, profile.name, 'viewer', [/LIVE/i, /Links nachlesen · LIVE hält dich synchron/i], [/Optionen/i]));

		await page.goto(`${BASE}/replay/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
		surfaces.push(await surfaceMetric(page, engine, profile.name, 'replay', [/NEXT BEST ACTION/i, /Follow-up mailen/i, /Session ansehen/i], [/Details öffnen/i, /Replay sichern/i, /Coach/i, /Deck V2/i]));

		await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
		surfaces.push(await surfaceMetric(page, engine, profile.name, 'authoring', [/GUIDED COMPOSER/i, /1 Material/i, /IMPORT STUDIO/i, /READY CHECK/i, /Live-ready:/i, /Mobile Format vorbereitet/i], [/Advanced/i, /6 Folien live starten/i, /PDF\/PPTX/i, /Voice/i, /CTA ergänzen/i]));

		await page.getByRole('button', { name: /Live starten/i }).click({ timeout: 10_000 });
		await page.waitForURL(/\/present\/[^/]+$/, { timeout: 20_000 });
		await page.getByText(/REMOTE CONTROL/i).waitFor({ timeout: 8_000 });
		await page.evaluate(() => window.stop()).catch(() => undefined);
		await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
		surfaces.push(await surfaceMetric(page, engine, profile.name, 'account-library', [/LIBRARY REMOTE/i, /Eigene Decks/i, /Diese Decks gehören schon dir/i, /Library sichern/i], [/Import Deck/i, /Live starten/i, /Bearbeiten/i, /Library sichern/i]));

		const issues = surfaces.flatMap((surface) => surface.issues.map((issue) => `${surface.surface}: ${issue}`));
		if (consoleFailures.length) throw new Error(`Console failures: ${JSON.stringify(consoleFailures, null, 2)}`);
		if (issues.length) throw new Error(`Mobile QA issues: ${issues.join(' | ')}`);

		await context.close();
		context = null;
		return { engine, profile: profile.name, deviceName: profile.deviceName, colorScheme: profile.colorScheme, viewport, roomId, consoleFailures, surfaces, status: 'passed' };
	} catch (error) {
		return { engine, profile: profile.name, deviceName: profile.deviceName, colorScheme: profile.colorScheme, viewport, consoleFailures, surfaces, status: 'failed', failure: error instanceof Error ? error.stack ?? error.message : String(error) };
	} finally {
		await context?.close().catch(() => undefined);
		await browser?.close();
	}
}

async function writeReport(results: RunResult[]) {
	const passed = results.filter((result) => result.status === 'passed').length;
	const failed = results.length - passed;
	const lines: string[] = [];
	lines.push('# eigen.beam Mobile QA Lab');
	lines.push('');
	lines.push(`Base: ${BASE}`);
	lines.push(`Generated: ${new Date().toISOString()}`);
	lines.push(`Result: ${passed}/${results.length} profiles passed${failed ? `, ${failed} failed` : ''}.`);
	lines.push('');
	lines.push('## Scope');
	lines.push('');
	lines.push('- Emulated mobile browsers via Playwright device profiles.');
	lines.push('- Checks: hydration/navigation, core mobile anchors, console/page errors, 44px tap-target floor, bottom safe-area clipping, screenshots.');
	lines.push('- Limitation: this is not a substitute for physical iOS/Android hardware, but it gives a reproducible pre-device QA gate.');
	lines.push('');
	for (const result of results) {
		lines.push(`## ${result.engine} · ${result.profile}`);
		lines.push('');
		lines.push(`Status: **${result.status}**`);
		if (result.roomId) lines.push(`Room: \`${result.roomId}\``);
		if (result.failure) lines.push(`\nFailure:\n\n\`\`\`text\n${result.failure.slice(0, 2000)}\n\`\`\``);
		if (result.consoleFailures.length) {
			lines.push('\nConsole failures:');
			for (const failure of result.consoleFailures) lines.push(`- ${failure.type}: ${failure.text}`);
		}
		for (const surface of result.surfaces) {
			lines.push(`\n### ${surface.surface}`);
			lines.push(`- URL: ${surface.url}`);
			lines.push(`- Screenshot: ${surface.screenshot}`);
			lines.push(`- Anchors: ${surface.visibleAnchors.join(', ')}`);
			if (surface.tapTargets.length) lines.push(`- Tap targets: ${surface.tapTargets.map((target) => `${target.label} ${target.width}x${target.height}`).join('; ')}`);
			if (surface.issues.length) lines.push(`- Issues: ${surface.issues.join('; ')}`);
		}
		lines.push('');
	}
	await writeFile(path.join(OUT_DIR, 'report.md'), lines.join('\n'));
}

async function main() {
	console.log(`MOBILE QA LAB gegen ${BASE}`);
	console.log(`Output: ${OUT_DIR}`);
	await mkdir(path.join(OUT_DIR, 'screenshots'), { recursive: true });
	const results: RunResult[] = [];
	for (const engine of engines) {
		for (const profile of profiles) {
			const result = await runProfile(engine.name, engine.type, profile);
			results.push(result);
			const icon = result.status === 'passed' ? '✓' : '✗';
			console.log(`  ${icon} ${engine.name} · ${profile.name}`);
			if (result.failure) console.log(`    ${result.failure.split('\n')[0]}`);
		}
	}
	await writeFile(path.join(OUT_DIR, 'results.json'), JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), results }, null, 2));
	await writeReport(results);
	const failed = results.filter((result) => result.status === 'failed');
	if (failed.length) {
		console.error(`\nMOBILE QA LAB FAIL — ${failed.length}/${results.length} profiles failed. Report: ${path.join(OUT_DIR, 'report.md')}`);
		process.exit(1);
	}
	console.log(`\nMOBILE QA LAB PASS — ${results.length} profiles. Report: ${path.join(OUT_DIR, 'report.md')}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
