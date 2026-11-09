import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { webkit, devices } from 'playwright';

const BASE = process.env.EB_DESIGN_BASE ?? 'https://eigen-beam-production.up.railway.app';
const OUT = process.env.EB_DESIGN_OUT ?? `reports/live-design-review-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const SCREEN = path.join(OUT, 'screenshots');
const device = devices['iPhone SE'];
const deckSource = `# Live Review Deck

Ein Satz, der die Idee trägt.
- Reveal-Punkt eins
- Reveal-Punkt zwei

---

# Sehr lange Headline die auf kleinen Phones brechen muss

Diese Folie testet die echte mobile Text-Hierarchie, Abstände und Safe-Area.

---

# Abschluss mit klarer CTA

Nächster Schritt: live testen und Follow-up sichern.`;

const views = [];
const consoleFailures = [];

function ignoreConsole(type, text) {
  return type === 'pageerror' && /EventSource cannot load .*\/present\/[^/]+\/events due to access control checks/i.test(text);
}

function ignoreConsoleForUrl(type, text, url) {
  if (ignoreConsole(type, text)) return true;
  return type === 'error' && /Failed to load resource: the server responded with a status of 404/i.test(text);
}

async function shot(page, name, opts = {}) {
  const file = path.join('screenshots', `${String(views.length + 1).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: path.join(OUT, file), fullPage: opts.fullPage ?? true });
  const info = await page.evaluate(() => ({
    title: document.title,
    h1: Array.from(document.querySelectorAll('h1')).map((el) => el.textContent?.trim()).filter(Boolean),
    bodyText: document.body.innerText.slice(0, 1200),
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    presenterTopbarActions: Array.from(document.querySelectorAll('header.topbar nav :is(a,button)')).map((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        label: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' '),
        tag: el.tagName,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        fontSize: Math.round(parseFloat(style.fontSize)),
        display: style.display,
        lineHeight: Math.round(parseFloat(style.lineHeight)) || style.lineHeight
      };
    }),
    controls: Array.from(document.querySelectorAll('button,a,input,textarea,select')).map((el) => {
      const rect = el.getBoundingClientRect();
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('href') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 80);
      return { label, tag: el.tagName, x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height), visible: rect.width > 0 && rect.height > 0 && rect.y < window.innerHeight && rect.bottom > 0 };
    }).filter((c) => c.visible)
  }));
  const issues = [];
  if (info.overflowX > 2) issues.push(`horizontal overflow ${info.overflowX}px`);
  for (const c of info.controls) if ((c.tag === 'BUTTON' || c.tag === 'A' || c.tag === 'INPUT') && (c.width < 44 || c.height < 44)) issues.push(`small visible control ${c.label}: ${c.width}x${c.height}`);
  if (name === 'presenter-remote') {
    const actions = info.presenterTopbarActions;
    const labels = actions.map((a) => a.label).join(',');
    if (actions.length !== 2 || labels !== 'Stats,Join') issues.push(`presenter topbar actions unexpected: ${labels || 'none'}`);
    for (const action of actions) {
      if (action.width < 58 || action.width > 78 || action.height !== 44) issues.push(`presenter topbar action ${action.label} size ${action.width}x${action.height}`);
      if (action.fontSize > 16) issues.push(`presenter topbar action ${action.label} font ${action.fontSize}px`);
      if (!['flex', 'inline-flex'].includes(action.display)) issues.push(`presenter topbar action ${action.label} display ${action.display}`);
    }
    if (actions.length === 2 && Math.abs(actions[0].width - actions[1].width) > 8) issues.push(`presenter topbar action widths differ ${actions[0].width}px/${actions[1].width}px`);
  }
  views.push({ name, url: page.url(), screenshot: file, ...info, issues });
  console.log(`captured ${name} -> ${file}${issues.length ? ' ISSUES: ' + issues.join(' | ') : ''}`);
}

async function postJson(page, url, data) {
  return page.evaluate(async ({ url, data }) => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  }, { url, data });
}

async function patchJson(page, url, data) {
  return page.evaluate(async ({ url, data }) => {
    const res = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  }, { url, data });
}

await mkdir(SCREEN, { recursive: true });
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ ...device, colorScheme: 'dark', locale: 'de-DE' });
const page = await context.newPage();
page.on('console', (msg) => { if (['error','warning'].includes(msg.type()) && !ignoreConsoleForUrl(msg.type(), msg.text(), page.url())) consoleFailures.push({ type: msg.type(), text: msg.text(), url: page.url() }); });
page.on('pageerror', (err) => { const text = String(err); if (!ignoreConsoleForUrl('pageerror', text, page.url())) consoleFailures.push({ type: 'pageerror', text, url: page.url() }); });

try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 });
  await shot(page, 'home');

  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByText(/GUIDED COMPOSER/i).waitFor({ timeout: 10000 });
  await shot(page, 'new-authoring');

  const deckRes = await postJson(page, `${BASE}/api/decks`, { title: 'Live Review Deck', source: deckSource });
  if (!deckRes.ok) throw new Error(`deck create failed ${deckRes.status} ${JSON.stringify(deckRes.json)}`);
  const deckId = deckRes.json.id;
  await patchJson(page, `${BASE}/api/decks/${deckId}/sharing`, { visibility: 'link' });

  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByText(/Eigene Decks/i).waitFor({ timeout: 10000 });
  await shot(page, 'account-library');

  await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByText(/GUIDED COMPOSER/i).waitFor({ timeout: 10000 });
  await shot(page, 'edit-deck');

  await page.goto(`${BASE}/share/${deckId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByText(/SHARE/i).waitFor({ timeout: 10000 });
  await shot(page, 'share');

  await page.goto(`${BASE}/recap/${deckId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByText(/RECAP/i).first().waitFor({ timeout: 10000 });
  await shot(page, 'recap');

  const roomRes = await postJson(page, `${BASE}/api/rooms`, { deckId });
  if (!roomRes.ok) throw new Error(`room create failed ${roomRes.status} ${JSON.stringify(roomRes.json)}`);
  const roomId = roomRes.json.id;
  const claimRes = await postJson(page, `${BASE}/present/${roomId}/claim`, { claimToken: roomRes.json.claimToken });
  if (!claimRes.ok) throw new Error(`claim failed ${claimRes.status} ${JSON.stringify(claimRes.json)}`);

  await page.goto(`${BASE}/present/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByText(/REMOTE CONTROL/i).waitFor({ timeout: 10000 });
  await shot(page, 'presenter-remote');

  await page.goto(`${BASE}/present/${roomId}/stats`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByText(/FIELD TEST DASHBOARD/i).waitFor({ timeout: 10000 });
  await shot(page, 'presenter-stats');

  await page.goto(`${BASE}/v/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('.live').waitFor({ timeout: 10000 });
  await shot(page, 'viewer-live', { fullPage: false });
  await page.getByRole('button', { name: /Optionen/i }).click({ timeout: 10000 });
  await page.getByRole('dialog', { name: /Optionen/i }).waitFor({ timeout: 10000 });
  await shot(page, 'viewer-options', { fullPage: false });

  await page.goto(`${BASE}/replay/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByText(/NEXT BEST ACTION/i).waitFor({ timeout: 10000 });
  await shot(page, 'replay');

  await page.goto(`${BASE}/this-route-does-not-exist`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByText(/Nicht gefunden/i).waitFor({ timeout: 10000 });
  await shot(page, 'error-404', { fullPage: false });
} finally {
  await browser.close();
}

const report = ['# Live Design Review Capture', '', `Base: ${BASE}`, `Generated: ${new Date().toISOString()}`, '', '## Views', ''];
for (const v of views) {
  report.push(`### ${v.name}`, `- URL: ${v.url}`, `- Screenshot: ${v.screenshot}`, `- H1: ${v.h1.join(' / ') || '—'}`, `- Scroll: ${v.scrollHeight}x${v.clientHeight}`, `- Issues: ${v.issues.length ? v.issues.join('; ') : 'none'}`, '');
}
if (consoleFailures.length) report.push('## Console failures', '', ...consoleFailures.map((f) => `- ${f.type} @ ${f.url}: ${f.text}`));
await writeFile(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), consoleFailures, views }, null, 2));
await writeFile(path.join(OUT, 'capture.md'), report.join('\n'));
if (consoleFailures.length) {
  console.error(`Console failures: ${JSON.stringify(consoleFailures, null, 2)}`);
  process.exitCode = 1;
}
console.log(`Report: ${path.join(OUT, 'capture.md')}`);
