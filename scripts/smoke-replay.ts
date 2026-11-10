// API-Smoke für L3/L4: durable Replay/VOD + Follow-Retention + Mailer-Outbox.
// Läuft gegen einen laufenden Production-Build (`node build`).
//
//   1) Terminal A:  bun run build && ORIGIN=http://127.0.0.1:4176 PORT=4176 node build
//   2) Terminal B:  EB_SMOKE_BASE=http://127.0.0.1:4176 bun scripts/smoke-replay.ts
//
// Prüft den vollen Pfad ohne Browser: Room anlegen, Presenter-Cookie claimen, Slide-Sync,
// Viewer-Event, durable Replay über GET /api/replay/:id, Follow-Dedup, Magic-Link.
// Die Outbox-/Session-Dateien landen im .data/-Verzeichnis des Server-Prozesses.
import assert from 'node:assert/strict';
import { env, exit } from 'node:process';

const BASE = env.EB_SMOKE_BASE ?? 'http://127.0.0.1:4176';
let passed = 0;
function ok(name: string) {
	passed++;
	console.log(`  ✓ ${name}`);
}

function cookieFromSetCookie(res: Response, name: string): string | null {
	// Node/undici: getSetCookie() liefert alle Set-Cookie-Header einzeln.
	const headers = res.headers as Headers & { getSetCookie?: () => string[] };
	const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [res.headers.get('set-cookie') ?? ''];
	for (const raw of list) {
		const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
		if (m) return m[1];
	}
	return null;
}

async function main() {
	console.log(`SMOKE gegen ${BASE}`);

	// 1) Room anlegen — Presenter-Token kommt nicht im Body. Ein kurzlebiger Claim-Token
	// wird gegen einen httpOnly-Cookie auf /present/:id eingetauscht (Safari-kompatibel).
	const createRes = await fetch(`${BASE}/api/rooms`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({})
	});
	assert.equal(createRes.status, 200, 'POST /api/rooms → 200');
	const { id, claimToken } = (await createRes.json()) as { id: string; claimToken: string };
	assert.ok(id, 'Room-ID vorhanden');
	assert.ok(claimToken, 'kurzlebiger Presenter-Claim-Token vorhanden');
	const ptName = `eb_pt_${id}`;
	assert.equal(cookieFromSetCookie(createRes, ptName), null, 'POST /api/rooms setzt keinen fremdpfadigen Presenter-Cookie');
	const claimRes = await fetch(`${BASE}/present/${id}/claim`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ claimToken })
	});
	assert.equal(claimRes.status, 200, 'POST /present/:id/claim → 200');
	const presenterToken = cookieFromSetCookie(claimRes, ptName);
	assert.ok(presenterToken, 'Presenter-Token-Cookie nach Claim gesetzt (httpOnly, scoped)');
	const replayClaim = await fetch(`${BASE}/present/${id}/claim`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ claimToken })
	});
	assert.equal(replayClaim.status, 403, 'Presenter-Claim-Token ist single-use');
	ok(`Room ${id} angelegt, Presenter-Cookie geclaimt`);

	// 2) Presenter advanced auf Slide 1 (Cookie mitsenden).
	const slideRes = await fetch(`${BASE}/present/${id}/slide`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie: `${ptName}=${presenterToken}` },
		body: JSON.stringify({ slide: 1 })
	});
	assert.equal(slideRes.status, 200, 'POST /present/:id/slide → 200');
	const slideBody = (await slideRes.json()) as { current: number };
	assert.equal(slideBody.current, 1, 'current=1 nach setSlide');
	ok('Presenter setSlide(1) synchronisiert');

	// 3) Viewer-Reaktion (Rückkanal).
	const eventRes = await fetch(`${BASE}/v/${id}/event`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ type: 'reaction', reaction: '🔥', slide: 1 })
	});
	assert.equal(eventRes.status, 200, 'POST /v/:id/event → 200');
	const questionRes = await fetch(`${BASE}/v/${id}/event`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ type: 'question', text: 'Smoke secret question', slide: 1 })
	});
	assert.equal(questionRes.status, 200, 'POST question /v/:id/event → 200');
	const bookmarkRes = await fetch(`${BASE}/v/${id}/event`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ type: 'bookmark', slide: 1 })
	});
	assert.equal(bookmarkRes.status, 200, 'POST bookmark /v/:id/event → 200');
	ok('Viewer-Reaktion akzeptiert');

	// 3b) Presenter-geschütztes Live-Stats-Dashboard.
	const statsNoCookie = await fetch(`${BASE}/present/${id}/stats`);
	assert.equal(statsNoCookie.status, 403, 'Stats-Dashboard ohne Presenter-Cookie → 403');
	const statsPage = await fetch(`${BASE}/present/${id}/stats`, { headers: { cookie: `${ptName}=${presenterToken}` } });
	assert.equal(statsPage.status, 200, 'Presenter-Stats-Dashboard → 200');
	const statsHtml = await statsPage.text();
	assert.match(statsHtml, /Field.?Test/i);
	assert.match(statsHtml, /Live-Kennzahlen|Live metrics|LIVE STATS/i);
	ok('Presenter-Stats-Dashboard ist geschützt und rendert Field-Test-Signale');

	// 4) Durable Replay über die API.
	const replayRes = await fetch(`${BASE}/api/replay/${id}`);
	assert.equal(replayRes.status, 200, 'GET /api/replay/:id → 200');
	const { replay } = (await replayRes.json()) as { replay: { events: Array<{ type: string; reaction?: string; slide: number }>; slides: unknown[] } };
	assert.ok(replay.events.some((e) => e.type === 'slide' && e.slide === 1), 'Replay enthält slide→1');
	assert.ok(replay.events.some((e) => e.type === 'reaction' && e.reaction === '🔥'), 'Replay enthält Reaktion');
	ok('Durable Replay liefert Slide- + Event-Timeline');

	// 4b) Presenter Session Summary als public-safe JSON + Markdown.
	const summaryRes = await fetch(`${BASE}/api/replay/${id}/summary`);
	assert.equal(summaryRes.status, 200, 'GET /api/replay/:id/summary → 200');
	const { summary } = (await summaryRes.json()) as { summary: { totals: { engagements: number }; topSlides: Array<{ index: number }>; markdown: string } };
	assert.ok(summary.totals.engagements >= 3, 'Summary zählt Signale');
	assert.equal(summary.topSlides[0]?.index, 1, 'Summary erkennt Top-Slide');
	assert.equal(summary.markdown.includes('Smoke secret question'), false, 'Summary leakt keine Fragetexte');
	const summaryMdRes = await fetch(`${BASE}/api/replay/${id}/summary?format=md`);
	assert.equal(summaryMdRes.status, 200, 'GET /summary?format=md → 200');
	const summaryMarkdown = await summaryMdRes.text();
	assert.match(summaryMarkdown, /# Session Summary/);
	assert.match(summaryMarkdown, /Top slides/);
	assert.equal(summaryMarkdown.includes('Smoke secret question'), false, 'Markdown-Summary leakt keine Fragetexte');
	ok('Presenter Session Summary liefert public-safe JSON + Markdown');

	// 4c) One-Tap Follow-up Pack liefert Mail/Chat/Links public-safe.
	const followupRes = await fetch(`${BASE}/api/replay/${id}/followup`);
	assert.equal(followupRes.status, 200, 'GET /api/replay/:id/followup → 200');
	const { followUpPack } = (await followupRes.json()) as { followUpPack: { subject: string; emailBody: string; chatText: string; links: Array<{ label: string; href: string }>; markdown: string } };
	assert.match(followUpPack.subject, /Follow-up/);
	assert.match(followUpPack.emailBody, /View replay/);
	assert.ok(followUpPack.links.every((link) => link.href.startsWith(BASE)), 'Follow-up Links sind absolut');
	assert.equal(followUpPack.markdown.includes('Smoke secret question'), false, 'Follow-up leakt keine Fragetexte');
	const followupMdRes = await fetch(`${BASE}/api/replay/${id}/followup?format=md`);
	assert.equal(followupMdRes.status, 200, 'GET /followup?format=md → 200');
	const followupMarkdown = await followupMdRes.text();
	assert.match(followupMarkdown, /# Follow-up Pack/);
	assert.match(followupMarkdown, /Email draft/);
	assert.equal(followupMarkdown.includes('Smoke secret question'), false, 'Follow-up Markdown leakt keine Fragetexte');
	ok('One-Tap Follow-up Pack liefert public-safe Mail/Chat/Links');

	// 4d) Slide Heatmap zeigt Resonanz pro Folie public-safe.
	const heatmapRes = await fetch(`${BASE}/api/replay/${id}/heatmap`);
	assert.equal(heatmapRes.status, 200, 'GET /api/replay/:id/heatmap → 200');
	const { heatmap } = (await heatmapRes.json()) as { heatmap: { slides: Array<{ index: number; intensity: number; classification: string; why: string }>; markdown: string } };
	assert.equal(heatmap.slides[1]?.intensity, 100, 'Heatmap markiert aktive Folie als 100%');
	assert.equal(heatmap.slides[1]?.classification, 'hot', 'Heatmap klassifiziert Top-Folie');
	assert.equal(heatmap.slides[1]?.why.includes('Smoke secret question'), false, 'Heatmap leakt keine Fragetexte');
	const heatmapMdRes = await fetch(`${BASE}/api/replay/${id}/heatmap?format=md`);
	assert.equal(heatmapMdRes.status, 200, 'GET /heatmap?format=md → 200');
	const heatmapMarkdown = await heatmapMdRes.text();
	assert.match(heatmapMarkdown, /# Slide Heatmap/);
	assert.equal(heatmapMarkdown.includes('Smoke secret question'), false, 'Heatmap Markdown leakt keine Fragetexte');
	const replayPage = await fetch(`${BASE}/replay/${id}`);
	assert.equal(replayPage.status, 200, 'Replay Page → 200');
	const replayHtml = await replayPage.text();
	assert.match(replayHtml, /SLIDE HEATMAP|Slide Heatmap/i);
	ok('Slide Heatmap liefert API, Markdown und Replay-UI');

	// 4e) Deck-V2-Draft erzeugt ein public-safe Folge-Deck.
	const deckV2Res = await fetch(`${BASE}/api/replay/${id}/deck-v2`);
	assert.equal(deckV2Res.status, 200, 'GET /api/replay/:id/deck-v2 → 200');
	const { draft } = (await deckV2Res.json()) as { draft: { source: string; slides: unknown[]; changes: Array<{ kind: string }> } };
	assert.match(draft.source, /What to clarify earlier/);
	assert.equal(draft.source.includes('Smoke secret question'), false, 'Deck V2 leakt keine Fragetexte');
	assert.equal(draft.source.includes('speakerNotes'), false, 'Deck V2 leakt keine Speaker Notes');
	assert.equal(draft.changes.some((change) => change.kind === 'clarify'), true, 'Deck V2 dokumentiert Klarstellungsänderung');
	const deckV2MdRes = await fetch(`${BASE}/api/replay/${id}/deck-v2?format=md`);
	assert.equal(deckV2MdRes.status, 200, 'GET /deck-v2?format=md → 200');
	const deckV2Markdown = await deckV2MdRes.text();
	assert.match(deckV2Markdown, /What to clarify earlier/);
	assert.equal(deckV2Markdown.includes('Smoke secret question'), false, 'Deck V2 Markdown leakt keine Fragetexte');
	// Details sind im action-first Replay per Default eingeklappt: Teaser + API decken den Deck-V2-Bereich ab.
	assert.match(replayHtml, /V2 deck draft|V2-Deck-Entwurf/i);
	ok('Deck V2 Draft liefert public-safe Markdown und Replay-UI');

	// 4f) Session Coach liefert Next-Talk-Checklist public-safe.
	const coachRes = await fetch(`${BASE}/api/replay/${id}/coach`);
	assert.equal(coachRes.status, 200, 'GET /api/replay/:id/coach → 200');
	const { coach } = (await coachRes.json()) as { coach: { actions: Array<{ kind: string; priority: string }>; markdown: string } };
	assert.equal(coach.actions.some((action) => action.kind === 'clarify'), true, 'Coach empfiehlt Klarstellung');
	assert.equal(coach.actions.some((action) => action.kind === 'followup'), true, 'Coach empfiehlt Follow-up');
	assert.equal(coach.markdown.includes('Smoke secret question'), false, 'Coach leakt keine Fragetexte');
	const coachMdRes = await fetch(`${BASE}/api/replay/${id}/coach?format=md`);
	assert.equal(coachMdRes.status, 200, 'GET /coach?format=md → 200');
	const coachMarkdown = await coachMdRes.text();
	assert.match(coachMarkdown, /# Session Coach/);
	assert.equal(coachMarkdown.includes('Smoke secret question'), false, 'Coach Markdown leakt keine Fragetexte');
	assert.match(replayHtml, /SESSION COACH|Session Coach/i);
	ok('Session Coach liefert public-safe Next-Talk-Checklist');

	// 5) Follow-Retention + Dedup.
	const followBody = JSON.stringify({ email: 'smoke@eigen.beam', roomId: id });
	const f1 = await fetch(`${BASE}/api/follow`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: followBody });
	const f1json = (await f1.json()) as { ok: boolean; isNew: boolean };
	assert.equal(f1.status, 200, 'POST /api/follow → 200');
	assert.equal(f1json.isNew, true, 'erster Follow ist neu');
	const f2 = await fetch(`${BASE}/api/follow`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: followBody });
	const f2json = (await f2.json()) as { isNew: boolean };
	assert.equal(f2json.isNew, false, 'zweiter identischer Follow ist dedupt');
	ok('Follow speichert + dedupt (isNew true → false)');

	// 6) Magic-Link versendet (Outbox) — Link wird nur bei EB_AUTH_RETURN_LINK=true im JSON zurückgegeben.
	const magicRes = await fetch(`${BASE}/api/auth/magic-link`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: 'smoke@eigen.beam' })
	});
	assert.equal(magicRes.status, 200, 'POST /api/auth/magic-link → 200');
	const magicJson = (await magicRes.json()) as { ok: boolean; delivered?: boolean };
	assert.equal(magicJson.ok, true, 'Magic-Link ok');
	ok('Magic-Link über Mailer versendet (Outbox/Provider)');

	// 7) Ungültige Email wird abgewiesen.
	const badFollow = await fetch(`${BASE}/api/follow`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'kaputt' }) });
	assert.equal(badFollow.status, 400, 'ungültige Follow-Email → 400');
	ok('Validierung weist kaputte Email ab');

	// 8) Private Decks dürfen nicht durch Room-Erstellung in eine Live-Session geleakt werden.
	const privateDeckRes = await fetch(`${BASE}/api/decks`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ title: 'Smoke Private Deck', source: '# Smoke private visible\nnotes: smoke-private-notes' })
	});
	assert.equal(privateDeckRes.status, 201, 'privates Smoke-Deck anlegen → 201');
	const { id: privateDeckId } = (await privateDeckRes.json()) as { id: string };
	const creatorToken = cookieFromSetCookie(privateDeckRes, 'eb_cid');
	assert.ok(creatorToken, 'Creator-Cookie für privates Deck gesetzt');
	try {
		const strangerRead = await fetch(`${BASE}/api/decks/${privateDeckId}`);
		assert.equal(strangerRead.status, 403, 'fremder Client liest privates Deck nicht direkt');

		const strangerRoom = await fetch(`${BASE}/api/rooms`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ deckId: privateDeckId })
		});
		assert.equal(strangerRoom.status, 403, 'fremder Client startet keinen Room aus privatem Deck');

		const ownerRoom = await fetch(`${BASE}/api/rooms`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `eb_cid=${creatorToken}` },
			body: JSON.stringify({ deckId: privateDeckId })
		});
		assert.equal(ownerRoom.status, 200, 'Owner startet Room aus eigenem privatem Deck');
		ok('Room-Erstellung respektiert private Deck-Owner-Rechte');
	} finally {
		await fetch(`${BASE}/api/decks/${privateDeckId}`, {
			method: 'DELETE',
			headers: { cookie: `eb_cid=${creatorToken}` }
		}).catch(() => undefined);
	}

	// 9) Unsubscribe-Route ist verdrahtet; ungültiger Token → 400.
	const badUnsub = await fetch(`${BASE}/api/follow/unsubscribe?token=garbage`);
	assert.equal(badUnsub.status, 400, 'ungültiger Unsubscribe-Token → 400');
	ok('Unsubscribe-Route weist ungültigen Token ab');

	console.log(`\nSMOKE PASS — ${passed} checks.`);
}

main().catch((e) => {
	console.error('SMOKE FAIL:', e);
	exit(1);
});
