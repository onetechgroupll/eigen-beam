// Ausführbare Verifikation der C1a-Kernlogik (Parser + Deck-Repository).
// KEIN vitest, KEIN `bun test` (Buns nativer Runner ist laut AGENTS.md kein Gate) —
// ein eigenständiges Assert-Skript: `bun scripts/verify-c1a.ts`.
// Importiert relativ; die $lib-Imports der Module sind type-only → zur Laufzeit elidiert.
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { parseDeck, sanitizeImageUrl } from '../src/lib/deck-parse.ts';
import { toPublicSlides } from '../src/lib/decks.ts';
import { slideFitProfile } from '../src/lib/slide-quality.ts';
import { applyQualityFix, deckReadyCheck } from '../src/lib/deck-quality.ts';
import { MemoryDeckRepository, FileDeckRepository, PostgresDeckRepository } from '../src/lib/server/decks-repo.ts';
import { createMagicToken, createUserSessionToken, userIdForEmail, verifyMagicToken, verifyUserSessionToken } from '../src/lib/server/auth.ts';
import { importTextToDeckSource, extractPptxText, extractPdfText } from '../src/lib/server/imports.ts';
import { transcribeAudio, voiceFileToDeckSource } from '../src/lib/server/voice.ts';
import { localClarify } from '../src/lib/server/clarity.ts';
import { sniffImage, S3AssetStore } from '../src/lib/server/assets.ts';
import { claimPresenterToken, createRoom, endRoom, getReplay, recordViewerEvent, setSlide } from '../src/lib/server/rooms.ts';
import { createUnsubToken, escapeHtml, recordFollow, recordFollowDetailed, sanitizeFollowTarget, verifyUnsubToken } from '../src/lib/server/followers.ts';
import { OutboxEmailProvider, getMailerForEnv, readOutbox } from '../src/lib/server/mailer.ts';
import { PostgresActivityStore } from '../src/lib/server/activity-store.ts';
import { canonicalPublicOrigin } from '../src/lib/server/origin.ts';
import { RATE_LIMITS } from '../src/lib/server/rate-limit.ts';
import { securityHeaders } from '../src/lib/server/security-headers.ts';
import { requireAiUserSession } from '../src/lib/server/ai-auth.ts';
import { livenessPayload, readinessPayload } from '../src/lib/server/health.ts';
import { applySentimentSignal, conversionCta, liveSentimentLabel, pacingHint, reopenInsight, replaySentiment, sentimentEventWeight } from '../src/lib/polish.ts';
import { fieldTestChecklist, liveStatsDashboard } from '../src/lib/stats-dashboard.ts';
import { presenterFeedItem } from '../src/lib/presenter-feed.ts';
import { accountProfileFromSession, teamIdForEmail, toDeckLibraryItems } from '../src/lib/account.ts';
import { deckExportFilename, deckToPublicExportJson, deckToPublicExportMarkdown } from '../src/lib/server/deck-export.ts';
import { buildTakeaway } from '../src/lib/server/takeaway.ts';
import { buildFollowUpPack } from '../src/lib/follow-up-pack.ts';
import { buildSessionSummary } from '../src/lib/session-summary.ts';
import { buildSlideHeatmap } from '../src/lib/slide-heatmap.ts';
import { buildDeckV2Draft } from '../src/lib/deck-v2-draft.ts';
import { buildSessionCoach } from '../src/lib/session-coach.ts';
import { MCP_DECK_AUTHORING_GUIDANCE, mcpImageFileFromBase64, toMcpAssetResult, toMcpDeckReadResult, toMcpRoomResult } from '../src/lib/server/mcp-server.ts';
import { isMcpBearerAuthorized, mcpAuthContextFromHeader, mcpBearerTokensFromEnv, mcpHasScopes } from '../src/lib/server/mcp-auth.ts';
import { mcpProtectedResourceMetadata, mcpUnauthorizedHeaders } from '../src/lib/server/mcp-oauth.ts';
import { createOAuthAccessToken, oauthAuthorizationServerMetadata, parseOAuthClients, requestedOAuthScopes, verifyOAuthAccessToken } from '../src/lib/server/oauth-server.ts';

let passed = 0;
function ok(name: string) {
	passed++;
	console.log(`  ✓ ${name}`);
}

function pngDimensions(bytes: Buffer): { width: number; height: number } {
	assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
	assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function main() {
	console.log('parseDeck:');

	// 1) --- trennt Folien; Eyebrow/Headline/Body-Mapping
	{
		const slides = parseDeck('Label\n# Titel\nText hier\n---\n# Zweite');
		assert.equal(slides.length, 2);
		assert.deepEqual(slides[0], { eyebrow: 'Label', headline: 'Titel', body: 'Text hier' });
		assert.deepEqual(slides[1], { headline: 'Zweite' });
		ok('--- trennt Folien, eyebrow/headline/body korrekt gemappt');
	}

	// 2) Führende/abschließende/doppelte --- erzeugen KEINE leeren Folien
	{
		const slides = parseDeck('---\n# A\n---\n\n---\n# B\n---');
		assert.equal(slides.length, 2);
		assert.deepEqual(slides.map((s) => s.headline), ['A', 'B']);
		ok('leere Blöcke (führend/doppelt/abschließend) werden übersprungen');
	}

	// 3) Kein Heading → erste Zeile = Headline, Rest = Body
	{
		const slides = parseDeck('Nur Text\nund mehr Text');
		assert.deepEqual(slides[0], { headline: 'Nur Text', body: 'und mehr Text' });
		ok('ohne Heading: erste Zeile Headline, Rest Body');
	}

	// 4) Bild-Referenz wird extrahiert + aus dem Text entfernt
	{
		const slides = parseDeck('# Mit Bild\nText\n\n![ein alt](https://x.test/a.png)');
		assert.equal(slides[0].headline, 'Mit Bild');
		assert.equal(slides[0].image, 'https://x.test/a.png');
		assert.equal(slides[0].body, 'Text');
		ok('Bild ![alt](url) → slide.image, aus Body entfernt');
	}

	// 4b) Unsichere Bild-URLs werden nicht an Viewer ausgeliefert
	{
		assert.equal(sanitizeImageUrl('javascript:alert(1)'), undefined);
		assert.equal(sanitizeImageUrl('http://tracking.example/x.png'), undefined);
		assert.equal(sanitizeImageUrl('/assets/safe.png'), '/assets/safe.png');
		assert.equal(sanitizeImageUrl('https://cdn.example.test/safe.png'), 'https://cdn.example.test/safe.png');
		const unsafe = parseDeck('# Unsafe\n![x](javascript:alert(1))');
		assert.equal(unsafe[0].image, undefined);
		ok('unsichere Bild-URLs werden gefiltert, https und /assets bleiben erlaubt');
	}

	// 5) Nur-Bild-Block → Alt-Text als Headline (keine leere Content-Folie)
	{
		const slides = parseDeck('![das Cover](https://x.test/c.png)');
		assert.deepEqual(slides[0], { headline: 'das Cover', image: 'https://x.test/c.png', kind: 'image' });
		ok('Nur-Bild-Block nutzt Alt-Text als Headline');
	}

	// 6) Leeres/whitespace-Source → []
	{
		assert.deepEqual(parseDeck(''), []);
		assert.deepEqual(parseDeck('   \n\n  '), []);
		ok('leeres Source ergibt []');
	}

	// 7) CRLF wird normalisiert
	{
		const slides = parseDeck('# A\r\n---\r\n# B');
		assert.equal(slides.length, 2);
		ok('CRLF-Zeilenenden werden normalisiert');
	}

	// 8) Blocktypen + Reveal
	{
		const slides = parseDeck('type: number\n# 42%\nSignal\n++ Erst sichtbar\n---\ntype: compare\n# A/B\nleft: Alt | langsam\nright: Neu | live\n---\ntype: timeline\n# Plan\n- T1: Sync\n- T2: Authoring');
		assert.equal(slides[0].kind, 'number');
		assert.deepEqual(slides[0].reveal, ['Erst sichtbar']);
		assert.equal(slides[1].compare?.rightTitle, 'Neu');
		assert.equal(slides[2].timeline?.length, 2);
		ok('Blocktypen number/compare/timeline + Reveal werden geparst');
	}

	// 9) Presenter notes werden für öffentliche Payloads entfernt
	{
		const slides = parseDeck('# Public\nnotes: nicht an Viewer senden');
		assert.equal(slides[0].speakerNotes, 'nicht an Viewer senden');
		assert.equal('speakerNotes' in toPublicSlides(slides)[0], false);
		ok('toPublicSlides() entfernt speakerNotes aus öffentlichen Payloads');
	}

	// 10) Clarity-Fallback und MIME-Sniffing
	{
		const longDeck = Array.from({ length: 20 }, (_, i) => `# Folie ${i + 1} ${'mit sehr langer Headline '.repeat(5)}\n${'Zu viel Fließtext für ein Phone. '.repeat(12)}\nnotes: Presenter-Kontext ${i + 1}`).join('\n---\n');
		const clarified = localClarify('Sehr langer Titel '.repeat(10), longDeck);
		assert.ok(clarified.source.includes('#'));
		assert.equal(clarified.mode, 'local');
		const clarifiedSlides = parseDeck(clarified.source);
		assert.equal(clarifiedSlides.length, 15);
		assert.ok(clarifiedSlides.every((slide) => slide.headline.length <= 68));
		assert.ok(clarifiedSlides.every((slide) => !slide.body || slide.body.length <= 110));
		assert.equal(clarifiedSlides[0].speakerNotes, 'Presenter-Kontext 1');
		assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), 'image/png');
		const imageSlide = parseDeck('type: image\n# Lesbarer Overlay\n![Cover](https://cdn.example.test/cover.png)')[0];
		const denseSlide = parseDeck(`# ${'Sehr lange Headline '.repeat(8)}\n${'Sehr langer Body für kleine Telefone. '.repeat(16)}`)[0];
		assert.equal(slideFitProfile(imageSlide).needsScrim, true);
		assert.equal(slideFitProfile(denseSlide).density, 'dense');
		assert.ok(slideFitProfile(denseSlide).cssClass.includes('fit-dense'));
		ok('lokale Clarity, Auto-Fit-Profil und Bild-Lesbarkeit funktionieren');
	}

	// 11) Deck Quality Coach erkennt Live-Readiness und kann lokale Quick-Fixes anwenden
	{
		const roughSource = `# ${'Viel zu lange Headline '.repeat(6)}
${'Zu viel Body für eine mobile Live-Folie. '.repeat(18)}

---

# Zweite Folie
Kurz.`;
		const check = deckReadyCheck(parseDeck(roughSource));
		assert.equal(check.status, 'needs_work');
		assert.ok(check.summary.includes('2 Folien'));
		assert.ok(check.issues.some((issue) => issue.kind === 'headline_long'));
		assert.ok(check.issues.some((issue) => issue.kind === 'body_dense'));
		assert.ok(check.issues.some((issue) => issue.kind === 'missing_cta'));
		const withCta = applyQualityFix(roughSource, 'add_cta');
		assert.match(withCta, /# Nächster Schritt/);
		const withReveal = applyQualityFix(roughSource, 'suggest_reveal');
		assert.match(withReveal, /\+\+ /);
		ok('Deck Quality Coach erkennt mobile Risiken und liefert deterministische Quick-Fixes');
	}

	console.log('MemoryDeckRepository:');
	{
		const repo = new MemoryDeckRepository();
		const input = { title: 'T', source: '# A', slides: parseDeck('# A') };
		const d = await repo.create(input, 'owner-1');
		assert.ok(d.id && d.ownerId === 'owner-1' && d.slides.length === 1);
		ok('create() vergibt id + ownerId');

		const got = await repo.get(d.id);
		assert.deepEqual(got?.slides, d.slides);
		ok('get() liefert das Deck');

		const upd = await repo.update(d.id, { title: 'T2', source: '# A\n---\n# B', slides: parseDeck('# A\n---\n# B') }, 'owner-1');
		assert.equal(upd?.slides.length, 2);
		assert.equal(upd?.title, 'T2');
		ok('update() ersetzt slides/title');

		const list = await repo.listByOwner('owner-1');
		assert.equal(list.length, 1);
		assert.equal((await repo.listByOwner('owner-2')).length, 0);
		ok('listByOwner() filtert nach ownerId');

		const claimed = await repo.claimOwner('owner-1', 'user-1');
		assert.equal(claimed, 1);
		assert.equal((await repo.listByOwner('owner-1')).length, 0);
		assert.equal((await repo.listByOwner('user-1')).length, 1);
		ok('claimOwner() übernimmt anonyme Decks für Magic-Link-User');

		assert.equal(await repo.get('does-not-exist'), null);
		ok('get() unbekannt → null');

		// Snapshot-Isolation: mutiertes get()-Resultat darf den Store nicht ändern
		const a = await repo.get(d.id);
		a!.slides[0].headline = 'MUTATED';
		const b = await repo.get(d.id);
		assert.notEqual(b!.slides[0].headline, 'MUTATED');
		ok('get() gibt Kopie zurück (keine geteilte Referenz)');

		assert.equal(await repo.delete(d.id), true);
		assert.equal(await repo.get(d.id), null);
		assert.equal(await repo.delete(d.id), false);
		ok('delete() entfernt Decks idempotent');
	}

	console.log('FileDeckRepository:');
	{
		const dir = '.data/verify-tmp';
		await rm(dir, { recursive: true, force: true });
		const repo = new FileDeckRepository(dir);
		const d = await repo.create({ title: 'F', source: '# X', slides: parseDeck('# X') }, 'o1');
		const got = await repo.get(d.id);
		assert.equal(got?.title, 'F');
		ok('create()+get() persistiert auf Disk');

		await repo.update(d.id, { title: 'F2', source: '# X\n---\n# Y', slides: parseDeck('# X\n---\n# Y') }, 'o1');
		const got2 = await repo.get(d.id);
		assert.equal(got2?.slides.length, 2);
		ok('update() schreibt atomar zurück');

		const list = await repo.listByOwner('o1');
		assert.equal(list.length, 1);
		ok('listByOwner() liest aus dem Verzeichnis');

		// Path-Traversal-Schutz über die :id
		assert.equal(await repo.get('../secret'), null);
		ok('get() weist ungültige id (Path-Traversal) ab');

		assert.equal(await repo.delete('../secret'), false);
		assert.equal(await repo.delete(d.id), true);
		assert.equal(await repo.get(d.id), null);
		ok('delete() entfernt JSON-Datei und schützt ungültige IDs');

		await rm(dir, { recursive: true, force: true });
	}

	console.log('Import Pipeline:');
	{
		const source = importTextToDeckSource('Intro\nDas ist die erste Idee.\n\nZweite Folie\nMehr Kontext.');
		assert.ok(source.includes('---'));
		assert.equal(parseDeck(source).length, 2);
		ok('Import-Pipeline kann Text in vertikale Deck-Quelle transformieren');

		const AdmZip = await loadAdmZipForVerify();
		const zip = new AdmZip();
		zip.addFile('ppt/slides/slide1.xml', Buffer.from('<a:t>Erste PPT Folie</a:t><a:t>Bullet A</a:t>'));
		zip.addFile('ppt/slides/slide2.xml', Buffer.from('<a:t>Zweite PPT Folie</a:t>'));
		const pptText = await extractPptxText(new Uint8Array(zip.toBuffer()));
		assert.match(pptText, /Erste PPT Folie/);
		assert.match(pptText, /Zweite PPT Folie/);
		ok('PPTX-Import extrahiert Slide-Texte in Folienreihenfolge');

		const pdfText = extractPdfText(new TextEncoder().encode('(PDF Headline) Tj [(PDF Body)] TJ'));
		assert.match(pdfText, /PDF Headline/);
		assert.match(pdfText, /PDF Body/);
		ok('PDF-Import extrahiert einfache Text-Operatoren');
	}

	console.log('Magic-Link Auth:');
	{
		const secret = 'test-secret';
		const token = await createMagicToken(' Lucas@Example.COM ', secret, 1000, 'nonce-1');
		const verified = await verifyMagicToken(token, secret, 1000);
		assert.equal(verified?.email, 'lucas@example.com');
		assert.equal(verified?.userId, userIdForEmail('lucas@example.com'));
		assert.equal(await verifyMagicToken(token, secret, 1000 + 16 * 60 * 1000), null);
		assert.equal(await verifyMagicToken(token + 'x', secret, 1000), null);
		ok('Magic-Link Token ist signiert, normalisiert Email und läuft ab');

		const sessionToken = createUserSessionToken('Test@Example.com', 'secret', 'sessionnonce');
		const sessionPayload = JSON.parse(Buffer.from(sessionToken.split('.')[0], 'base64url').toString('utf8')) as { exp?: unknown; iat?: unknown };
		assert.equal(typeof sessionPayload.iat, 'number');
		assert.equal(typeof sessionPayload.exp, 'number');
		assert.deepEqual(verifyUserSessionToken(sessionToken, 'secret'), { email: 'test@example.com', userId: userIdForEmail('test@example.com') });
		assert.equal(verifyUserSessionToken(sessionToken.replace(/.$/, 'x'), 'secret'), null);
		assert.equal(verifyUserSessionToken(createUserSessionToken('old@example.com', 'secret', 'oldnonce', 1), 'secret', 60 * 60 * 24 * 366 * 1000), null);
		ok('User-Session-Cookie ist signiert und enthält Email/UserId');

		assert.equal(canonicalPublicOrigin(new URL('https://attacker.example/path'), { NODE_ENV: 'production', ORIGIN: 'https://eigen.beam' }), 'https://eigen.beam');
		assert.throws(() => canonicalPublicOrigin(new URL('https://attacker.example/path'), { NODE_ENV: 'production' }), /ORIGIN/);
		assert.equal(canonicalPublicOrigin(new URL('http://localhost:5173/path'), {}), 'http://localhost:5173');
		assert.equal(getMailerForEnv({ NODE_ENV: 'production', EB_MAIL_PROVIDER: 'outbox' }), null);
		assert.equal(getMailerForEnv({ NODE_ENV: 'production', EB_MAIL_PROVIDER: 'console' }), null);
		assert.equal(getMailerForEnv({ NODE_ENV: 'production', EB_MAIL_PROVIDER: 'resend', EB_RESEND_API_KEY: 'key' })?.constructor.name, 'ResendEmailProvider');
		ok('Production-Origin und Mailer-Konfiguration fail-closed');

		const headers = securityHeaders();
		assert.equal(headers['x-content-type-options'], 'nosniff');
		assert.match(headers['content-security-policy'], /script-src[^;]*'unsafe-inline'/);
		assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
		assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
		assert.ok(RATE_LIMITS.mcp.max > 0);
		assert.ok(RATE_LIMITS.stats.max > 0);
		ok('Security-Header und MCP/Stats-Rate-Limits sind zentral definiert');

		const live = livenessPayload(() => 12345);
		assert.equal(live.ok, true);
		assert.equal(live.service, 'eigenbeam');
		assert.equal(live.timestamp, '1970-01-01T00:00:12.345Z');

		const ready = await readinessPayload({
			now: () => 12345,
			env: {
				NODE_ENV: 'production',
				ORIGIN: 'https://eigen.example',
				EB_MAGIC_LINK_SECRET: 'secret',
				EB_DECK_STORE: 'postgres',
				EB_ACTIVITY_STORE: 'postgres',
				DATABASE_URL: 'postgres://redacted',
				EB_ASSET_STORE: 's3',
				EB_BUCKET_NAME: 'bucket',
				EB_MAIL_PROVIDER: 'resend',
				EB_RESEND_API_KEY: 'resend-secret',
				EB_MCP_TOKENS: 'token|deck:read'
			},
			pingDatabase: async () => true
		});
		assert.equal(ready.ok, true);
		assert.equal(ready.status, 'ready');
		assert.equal(ready.checks.database.ok, true);
		assert.equal(JSON.stringify(ready).includes('postgres://redacted'), false);
		assert.equal(JSON.stringify(ready).includes('resend-secret'), false);

		const notReady = await readinessPayload({
			env: { NODE_ENV: 'production', EB_DECK_STORE: 'file', EB_ACTIVITY_STORE: 'off' },
			pingDatabase: async () => true
		});
		assert.equal(notReady.ok, false);
		assert.equal(notReady.status, 'not_ready');
		assert.equal(notReady.checks.deckStore.ok, false);
		assert.equal(notReady.checks.activityStore.ok, false);
		ok('Health/Readiness-Payloads sind secret-safe und fail-closed für Production-Konfig');

		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		try {
			const fakeCookies = { get: () => undefined } as never;
			assert.equal(requireAiUserSession(fakeCookies)?.status, 401);
		} finally {
			if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = previousNodeEnv;
		}
		ok('AI-/Import-Endpunkte verlangen in Production eine User-Session');

		const repo = new MemoryDeckRepository();
		const older = await repo.create({ title: 'Alt', source: '# Alt\nnotes: privat', slides: parseDeck('# Alt\nnotes: privat') }, 'user-accounts');
		await new Promise((resolve) => setTimeout(resolve, 2));
		const newer = await repo.create({ title: 'Neu', source: '# Neu\n---\n# Zwei', slides: parseDeck('# Neu\n---\n# Zwei') }, 'user-accounts');
		const items = toDeckLibraryItems([older, newer]);
		assert.deepEqual(items.map((d) => d.id), [newer.id, older.id]);
		assert.equal(items[0].slideCount, 2);
		assert.equal(items[0].visibility, 'private');
		assert.equal(items[0].shareUrl, `/share/${newer.id}`);
		assert.equal('source' in items[0], false);
		assert.equal('ownerId' in items[0], false);
		assert.equal(JSON.stringify(items).includes('notes: privat'), false);
		ok('Account-Library zeigt eigene Decks newest-first ohne private Felder');

		const exportedMarkdown = deckToPublicExportMarkdown(older);
		assert.match(exportedMarkdown, /^# Alt/m);
		assert.equal(exportedMarkdown.includes('notes: privat'), false);
		assert.equal(exportedMarkdown.includes('speakerNotes'), false);
		const exportedJson = deckToPublicExportJson(older);
		assert.equal(exportedJson.title, 'Alt');
		assert.equal(exportedJson.slideCount, 1);
		assert.equal('source' in exportedJson, false);
		assert.equal(JSON.stringify(exportedJson).includes('notes: privat'), false);
		assert.equal(deckExportFilename('Pitch: Q3 / Retail Media!', 'md'), 'pitch-q3-retail-media.md');
		ok('Deck-Export liefert public-safe Markdown/JSON ohne Source oder Speaker Notes');

		assert.equal(teamIdForEmail('Lucas@Example.COM'), 'team_example.com');
		assert.deepEqual(accountProfileFromSession({ email: 'Lucas@Example.COM', userId: 'user-lucas' }), {
			email: 'lucas@example.com',
			userId: 'user-lucas',
			teamId: 'team_example.com',
			teamLabel: 'example.com'
		});
		ok('Account-Profil leitet Team-light stabil aus der Email-Domain ab');

		assert.equal(newer.visibility, 'private');
		const linkShared = await repo.setSharing(newer.id, { visibility: 'link' }, 'user-accounts');
		assert.equal(linkShared?.visibility, 'link');
		assert.equal(linkShared?.teamId, null);
		const forbiddenShare = await repo.setSharing(newer.id, { visibility: 'team', teamId: 'team_example.com' }, 'other-user');
		assert.equal(forbiddenShare, null);
		const teamShared = await repo.setSharing(newer.id, { visibility: 'team', teamId: 'team_example.com' }, 'user-accounts');
		assert.equal(teamShared?.visibility, 'team');
		assert.equal(teamShared?.teamId, 'team_example.com');
		ok('Deck-Sharing kann owner-only auf Link oder Team gestellt werden');

		const mcpRead = toMcpDeckReadResult(newer, 'https://example.test');
		assert.equal(mcpRead.source, newer.source);
		assert.equal(mcpRead.slideCount, 2);
		assert.equal(mcpRead.editUrl, `https://example.test/edit/${newer.id}`);
		ok('MCP get_deck Ergebnis enthält autorisierte Source + stabile Links');

		assert.match(MCP_DECK_AUTHORING_GUIDANCE, /9:16|vertikal/i);
		assert.match(MCP_DECK_AUTHORING_GUIDANCE, /Eine Idee pro Slide/);
		assert.match(MCP_DECK_AUTHORING_GUIDANCE, /≤15 Slides/);
		assert.match(MCP_DECK_AUTHORING_GUIDANCE, /notes:/);
		assert.match(MCP_DECK_AUTHORING_GUIDANCE, /keine Textwände/i);
		ok('MCP Deck-Guidance erzwingt vertikale, content-first AI-Decks');

		const mcpRoom = toMcpRoomResult({ roomId: 'room123', deck: newer, baseUrl: 'https://example.test', protected: true });
		assert.equal(mcpRoom.roomId, 'room123');
		assert.equal(mcpRoom.deckId, newer.id);
		assert.equal(mcpRoom.viewerUrl, 'https://example.test/v/room123');
		assert.equal(mcpRoom.replayUrl, 'https://example.test/replay/room123');
		assert.equal(mcpRoom.protected, true);
		assert.equal('presenterToken' in mcpRoom, false);
		ok('MCP create_room Ergebnis liefert Viewer/Replay-Links ohne Presenter-Token');

		const mcpTokens = mcpBearerTokensFromEnv({ EB_MCP_TOKEN: 'legacy-token', EB_MCP_TOKENS: ' client-a,\nclient-b\r\nlegacy-token ,, ' });
		assert.deepEqual(mcpTokens, ['legacy-token', 'client-a', 'client-b']);
		assert.equal(isMcpBearerAuthorized('Bearer client-b', { EB_MCP_TOKEN: 'legacy-token', EB_MCP_TOKENS: 'client-a\nclient-b' }), true);
		assert.equal(isMcpBearerAuthorized('Bearer legacy-token', { EB_MCP_TOKEN: 'legacy-token' }), true);
		assert.equal(isMcpBearerAuthorized('Bearer unknown', { EB_MCP_TOKENS: 'client-a,client-b' }), false);
		assert.equal(isMcpBearerAuthorized('Bearer client-a', {}), false);
		assert.equal(isMcpBearerAuthorized('Basic client-a', { EB_MCP_TOKENS: 'client-a' }), false);
		const scoped = mcpAuthContextFromHeader('Bearer reader', { EB_MCP_TOKENS: 'reader|deck:read+room:create' });
		assert.equal(mcpHasScopes(scoped!, ['deck:read']), true);
		assert.equal(mcpHasScopes(scoped!, ['deck:write']), false);
		assert.equal(mcpHasScopes(scoped!, ['deck:read', 'room:create']), true);
		ok('MCP Bearer-Auth unterstützt mehrere Rotationstokens und bleibt fail-closed');

		const metadata = mcpProtectedResourceMetadata('https://eigen.example');
		assert.equal(metadata.resource, 'https://eigen.example/mcp');
		assert.deepEqual(metadata.bearer_methods_supported, ['header']);
		assert.equal(metadata.scopes_supported.includes('deck:read'), true);
		assert.equal(metadata.scopes_supported.includes('asset:upload'), true);
		assert.equal(JSON.stringify(metadata).includes('secret'), false);
		const challenge = mcpUnauthorizedHeaders('https://eigen.example');
		assert.match(challenge['www-authenticate'], /^Bearer /);
		assert.match(challenge['www-authenticate'], /resource_metadata="https:\/\/eigen\.example\/\.well-known\/oauth-protected-resource\/mcp"/);
		ok('MCP OAuth Protected-Resource-Discovery ist standardsnah und secret-safe');

		const oauthClients = parseOAuthClients('claude:secret|deck:read+room:create,writer:s2|deck:write');
		assert.deepEqual(oauthClients.map((client: { clientId: string }) => client.clientId), ['claude', 'writer']);
		assert.deepEqual(oauthClients[0].scopes, ['deck:read', 'room:create']);
		assert.deepEqual(requestedOAuthScopes('', oauthClients[0]), ['deck:read', 'room:create']);
		assert.deepEqual(requestedOAuthScopes('deck:read', oauthClients[0]), ['deck:read']);
		assert.equal(requestedOAuthScopes('deck:write', oauthClients[0]), null);
		assert.equal(requestedOAuthScopes('not-a-scope', oauthClients[0]), null);
		assert.equal(requestedOAuthScopes('deck:read not-a-scope', oauthClients[0]), null);
		const oauthToken = createOAuthAccessToken({ clientId: 'claude', scopes: ['deck:read'], secret: 'oauth-secret', now: 1_000, ttlSeconds: 60 });
		assert.deepEqual(verifyOAuthAccessToken(oauthToken, 'oauth-secret', 1_020)?.scopes, ['deck:read']);
		assert.equal(verifyOAuthAccessToken(oauthToken, 'wrong-secret', 1_020), null);
		assert.equal(verifyOAuthAccessToken(oauthToken, 'oauth-secret', 2_000), null);
		const freshOAuthToken = createOAuthAccessToken({ clientId: 'claude', scopes: ['deck:read'], secret: 'oauth-secret' });
		const oauthCtx = mcpAuthContextFromHeader(`Bearer ${freshOAuthToken}`, { EB_OAUTH_TOKEN_SECRET: 'oauth-secret' });
		assert.equal(mcpHasScopes(oauthCtx!, ['deck:read']), true);
		assert.equal(mcpHasScopes(oauthCtx!, ['deck:write']), false);
		const asMeta = oauthAuthorizationServerMetadata('https://eigen.example');
		assert.equal(asMeta.issuer, 'https://eigen.example');
		assert.equal(asMeta.token_endpoint, 'https://eigen.example/oauth/token');
		assert.equal(asMeta.grant_types_supported.includes('client_credentials'), true);
		ok('OAuth Authorization Server gibt signierte scoped Access-Tokens fail-closed aus');
	}

	console.log('PWA Install Polish:');
	{
		const manifest = JSON.parse(await readFile('static/manifest.webmanifest', 'utf8'));
		assert.equal(manifest.name, 'eigen.beam');
		assert.equal(manifest.display, 'standalone');
		assert.equal(manifest.orientation, 'portrait');
		assert.equal(manifest.start_url, '/?source=pwa');
		assert.equal(manifest.icons.some((icon: { src: string; purpose?: string }) => icon.src === '/icons/eigenbeam-192.png' && icon.purpose?.includes('maskable')), true);
		assert.equal(manifest.icons.some((icon: { src: string; purpose?: string }) => icon.src === '/icons/eigenbeam-512.png' && icon.purpose?.includes('maskable')), true);

		const appShell = await readFile('src/app.html', 'utf8');
		assert.match(appShell, /<link rel="manifest" href="\/manifest\.webmanifest"/);
		assert.match(appShell, /apple-mobile-web-app-capable/);
		assert.match(appShell, /<link rel="apple-touch-icon" href="\/icons\/eigenbeam-192\.png"/);

		assert.deepEqual(pngDimensions(await readFile('static/icons/eigenbeam-192.png')), { width: 192, height: 192 });
		assert.deepEqual(pngDimensions(await readFile('static/icons/eigenbeam-512.png')), { width: 512, height: 512 });
		ok('Manifest, iOS-Head-Tags und maskable Icons sind install-ready');
	}

	console.log('Voice Import:');
	{
		const transcriptFile = new File(['Voice Headline\nVoice body.\n\nZweiter Gedanke'], 'voice.txt', { type: 'text/plain' });
		assert.match(await transcribeAudio(transcriptFile), /Voice Headline/);
		const voiceDeck = await voiceFileToDeckSource(transcriptFile, 'Voice Deck');
		assert.equal(voiceDeck.title, 'Voice Deck');
		assert.equal(parseDeck(voiceDeck.source).length, 2);
		ok('Voice→Slides nutzt Transkript/Transkription und erzeugt Deck-Markdown');
	}

	console.log('S3AssetStore:');
	{
		const sends: string[] = [];
		const client = { async send(command: { constructor: { name: string } }) { sends.push(command.constructor.name); return {}; } };
		const store = new S3AssetStore(client, { bucket: 'eb-assets', publicBaseUrl: 'https://cdn.example.test' }, () => 'asset123456789');
		const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], 'deck.png', { type: 'image/png' });
		const stored = await store.store(file);
		assert.equal(stored.key, 'asset123456789.png');
		assert.equal(stored.url, 'https://cdn.example.test/asset123456789.png');
		assert.deepEqual(sends, ['PutObjectCommand']);
		ok('S3AssetStore schreibt per PutObjectCommand und liefert CDN-URL');

		const tinyPngBase64 = Buffer.from(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])).toString('base64');
		const mcpFile = mcpImageFileFromBase64({ filename: 'chart.png', imageBase64: tinyPngBase64 });
		assert.equal(mcpFile.name, 'chart.png');
		assert.equal(mcpFile.type, 'image/png');
		assert.equal(mcpFile.size, 8);
		const mcpAsset = toMcpAssetResult({ key: 'asset123456789.png', url: 'https://cdn.example.test/asset123456789.png', mime: 'image/png' }, 'Retail Media Chart');
		assert.equal(mcpAsset.markdown, '![Retail Media Chart](https://cdn.example.test/asset123456789.png)');
		assert.equal(mcpAsset.mime, 'image/png');
		assert.equal('bytes' in mcpAsset, false);
		assert.throws(() => mcpImageFileFromBase64({ filename: 'bad.txt', imageBase64: 'not-base64!!' }), /Invalid base64 image data/);
		ok('MCP upload_asset validiert Base64-Bilder und liefert Markdown ohne Byte-Leak');
	}

	console.log('PostgresDeckRepository:');
	{
		const calls: Array<{ sql: string; params: unknown[] }> = [];
		const pgRow = { id: 'pg1234', title: 'PG', source: '# PG', slides: [{ headline: 'PG' }], owner_id: 'owner-pg', created_at: '10', updated_at: '10' };
		const rowsBySql = new Map<string, unknown[]>([
			['insert', [pgRow]],
			['select-one', [pgRow]],
			['update', [{ id: 'pg1234', title: 'PG2', source: '# PG2', slides: [{ headline: 'PG2' }], owner_id: 'owner-pg', created_at: '10', updated_at: '20' }]],
			['list', [{ id: 'pg1234', title: 'PG2', source: '# PG2', slides: [{ headline: 'PG2' }], owner_id: 'owner-pg', created_at: '10', updated_at: '20' }]],
			['share', [{ ...pgRow, visibility: 'team', team_id: 'team_example.com' }]],
			['team-list', [{ ...pgRow, visibility: 'team', team_id: 'team_example.com' }]],
			['delete', [{ id: 'pg1234' }]]
		]);
		const client = {
			async query(sql: string, params: unknown[] = []) {
				calls.push({ sql, params });
				const key = sql.includes('DELETE FROM decks') ? 'delete'
					: sql.includes('UPDATE decks') && sql.includes('SET visibility') ? 'share'
					: sql.includes("WHERE visibility = 'team'") ? 'team-list'
					: sql.includes('INSERT INTO decks') ? 'insert'
					: sql.includes('WHERE id = $1') ? 'select-one'
					: sql.includes('UPDATE decks') ? 'update'
					: 'list';
				return { rows: rowsBySql.get(key) ?? [] };
			}
		};
		const repo = new PostgresDeckRepository(client, () => 'pg1234', () => 10);
		const created = await repo.create({ title: 'PG', source: '# PG', slides: parseDeck('# PG') }, 'owner-pg');
		assert.equal(created.ownerId, 'owner-pg');
		assert.ok(calls[0].sql.includes('INSERT INTO decks'));
		ok('create() schreibt Decks in Postgres');

		const got = await repo.get('pg1234');
		assert.equal(got?.slides[0].headline, 'PG');
		assert.equal(await repo.get('../bad'), null);
		ok('get() mappt DB-Zeilen und schützt ungültige IDs');

		const updated = await repo.update('pg1234', { title: 'PG2', source: '# PG2', slides: parseDeck('# PG2') }, 'owner-pg');
		assert.equal(updated?.title, 'PG2');
		const updateCall = calls.find((c) => c.sql.includes('UPDATE decks') && c.sql.includes('owner_id = COALESCE'));
		assert.match(updateCall?.sql ?? '', /\$4::text IS NULL AND owner_id IS NULL/);
		assert.match(updateCall?.sql ?? '', /\$4::text IS NOT NULL AND \(owner_id IS NULL OR owner_id = \$4\)/);
		ok('update() aktualisiert title/source/slides atomar per RETURNING');

		await repo.update('pg1234', { title: 'PG MCP', source: '# PG MCP', slides: parseDeck('# PG MCP') }, null);
		const mcpUpdateCall = calls.find((c) => c.sql.includes('UPDATE decks') && c.params[3] === null);
		assert.ok(mcpUpdateCall, 'MCP/service update with null claimer should be allowed for unowned decks by SQL');
		ok('Postgres update() erlaubt null-Claimer nur für unowned Decks ohne Owner-Claim');

		const listed = await repo.listByOwner('user-a');
		assert.equal(listed[0]?.id, 'pg1234');
		assert.ok(calls.some((c) => c.sql.includes('ORDER BY updated_at DESC')));
		ok('listByOwner() sortiert newest-first in Postgres');

		const shared = await repo.setSharing('pg1234', { visibility: 'team', teamId: 'team_example.com' }, 'user-a');
		assert.equal(shared?.visibility, 'team');
		assert.equal(shared?.teamId, 'team_example.com');
		const teamDecks = await repo.listByTeam('team_example.com', 'user-a');
		assert.equal(teamDecks[0]?.teamId, 'team_example.com');
		assert.ok(calls.some((c) => c.sql.includes("WHERE visibility = 'team'")));
		ok('PostgresDeckRepository setzt Sharing owner-only und listet Team-Decks');

		assert.equal(await repo.delete('pg1234'), true);
		assert.equal(await repo.delete('../bad'), false);
		assert.ok(calls.some((c) => c.sql.includes('DELETE FROM decks')));
		ok('delete() löscht Postgres-Decks per RETURNING und schützt ungültige IDs');
	}

	console.log('Replay + Follow:');
	{
		const { id, presenterToken, claimToken } = createRoom(parseDeck('# R1\n---\n# R2'));
		assert.equal(claimPresenterToken(id, 'wrong-token'), null);
		assert.equal(claimPresenterToken(id, claimToken), presenterToken);
		assert.equal(claimPresenterToken(id, claimToken), null);
		ok('Presenter-Claim-Token ist kurzlebig, single-use und setzt keinen Body-Presenter-Token voraus');
		assert.equal(setSlide(id, presenterToken, 1).current, 1);
		recordViewerEvent(id, { type: 'reaction', reaction: '🔥', slide: 1 });
		recordViewerEvent(id, { type: 'question', text: 'Geheime Frage', slide: 1 });
		recordViewerEvent(id, { type: 'bookmark', slide: 1 });
		endRoom(id, presenterToken);
		const replay = getReplay(id)!;
		assert.equal(replay.ended, true);
		assert.ok(replay.events.some((e) => e.type === 'slide' && e.slide === 1));
		assert.ok(replay.events.some((e) => e.type === 'end'));
		ok('Replay/VOD hält Slide- und Event-Timeline nach Session-Ende vor');

		const takeaway = buildTakeaway(replay);
		assert.equal(takeaway.bookmarkCount, 1);
		assert.deepEqual(takeaway.slides.map((slide: { index: number }) => slide.index), [1]);
		assert.match(takeaway.markdown, /# Takeaway/);
		assert.match(takeaway.markdown, /## 2\. R2/);
		assert.equal(takeaway.markdown.includes('speakerNotes'), false);
		assert.equal(takeaway.markdown.includes('Geheime Frage'), false);
		assert.deepEqual(presenterFeedItem({ type: 'question', slide: 1, text: 'Was kostet das?', ts: 1 }), { kind: 'question', label: 'Frage', text: 'F2 · Was kostet das?', slide: 1, ts: 1 });
		assert.deepEqual(presenterFeedItem({ type: 'bookmark', slide: 0, ts: 2 }), { kind: 'bookmark', label: 'Merker', text: 'F1 wurde gemerkt', slide: 0, ts: 2 });
		ok('Takeaway/Clip-Export und Presenter-Feed-Items sind public-safe');

		const summary = buildSessionSummary(replay);
		assert.equal(summary.id, replay.id);
		assert.equal(summary.totals.engagements, 3);
		assert.equal(summary.topSlides[0]?.index, 1);
		assert.equal(summary.topSlides[0]?.headline, 'R2');
		assert.deepEqual(summary.questionsBySlide, [{ slide: 1, label: 'F2', headline: 'R2', count: 1 }]);
		assert.match(summary.whatLanded[0] ?? '', /R2/);
		assert.match(summary.clarifyNext[0] ?? '', /F2/);
		assert.match(summary.markdown, /# Session Summary/);
		assert.match(summary.markdown, /Top-Folien/);
		assert.equal(summary.markdown.includes('Geheime Frage'), false);
		assert.equal(summary.markdown.includes('speakerNotes'), false);
		ok('Presenter Session Summary verdichtet Replay public-safe');

		const followUpPack = buildFollowUpPack(replay, { baseUrl: 'https://eigen.beam' });
		assert.equal(followUpPack.id, replay.id);
		assert.match(followUpPack.subject, /Follow-up/);
		assert.match(followUpPack.emailBody, /Replay ansehen/);
		assert.match(followUpPack.emailBody, /https:\/\/eigen\.beam\/replay\//);
		assert.match(followUpPack.chatText, /Kurzfassung/);
		assert.equal(followUpPack.markdown.includes('Geheime Frage'), false);
		assert.equal(followUpPack.markdown.includes('speakerNotes'), false);
		assert.deepEqual(followUpPack.links.map((link) => link.label), ['Replay ansehen', 'Summary laden', 'Takeaway laden']);
		ok('One-Tap Follow-up Pack erzeugt public-safe Mail/Chat/Links');

		const heatmap = buildSlideHeatmap(replay);
		assert.equal(heatmap.id, replay.id);
		assert.equal(heatmap.slides.length, 2);
		assert.equal(heatmap.slides[0].intensity, 0);
		assert.equal(heatmap.slides[1].intensity, 100);
		assert.equal(heatmap.slides[1].classification, 'hot');
		assert.equal(heatmap.slides[1].why.includes('Frage'), true);
		assert.equal(heatmap.slides[1].why.includes('Geheime Frage'), false);
		assert.match(heatmap.markdown, /# Slide Heatmap/);
		assert.equal(heatmap.markdown.includes('speakerNotes'), false);
		ok('Slide Heatmap macht Resonanz public-safe sichtbar');

		const deckV2 = buildDeckV2Draft(replay);
		assert.equal(deckV2.id, replay.id);
		assert.match(deckV2.title, /V2/);
		assert.ok(deckV2.source.includes('# R2'), 'Deck V2 behält starke Folie');
		assert.match(deckV2.source, /Was wir früher klären sollten/);
		assert.match(deckV2.source, /F2/);
		assert.equal(deckV2.source.includes('Geheime Frage'), false);
		assert.equal(deckV2.source.includes('speakerNotes'), false);
		assert.ok(deckV2.slides.length >= replay.slides.length, 'Deck V2 bleibt vollwertiges Deck');
		assert.equal(deckV2.changes.some((change) => change.kind === 'clarify'), true);
		ok('Deck V2 Draft macht aus Session-Signalen ein public-safe Folge-Deck');

		const coach = buildSessionCoach(replay);
		assert.equal(coach.id, replay.id);
		assert.ok(coach.actions.length >= 3);
		assert.equal(coach.actions[0].priority, 'high');
		assert.equal(coach.actions.some((action) => action.kind === 'clarify'), true);
		assert.equal(coach.actions.some((action) => action.kind === 'reuse'), true);
		assert.equal(coach.actions.some((action) => action.kind === 'followup'), true);
		assert.match(coach.markdown, /# Session Coach/);
		assert.equal(coach.markdown.includes('Geheime Frage'), false);
		assert.equal(coach.markdown.includes('speakerNotes'), false);
		ok('Session Coach erzeugt public-safe Next-Talk-Checklist');

		const dashboard = liveStatsDashboard({ joins: 6, currentViewers: 4, peakConcurrent: 5, reopens: 2, reactions: 3, questions: 1, bookmarks: 2, startedAt: 1_000 }, 61_000);
		assert.equal(dashboard.durationMinutes, 1);
		assert.equal(dashboard.engagements, 6);
		assert.equal(dashboard.reopenRate, 33);
		assert.equal(dashboard.joinLabel, '5 Peak / 6 Joins');
		const checklist = fieldTestChecklist({ joins: 8, currentViewers: 7, peakConcurrent: 8, reopens: 1, reactions: 2, questions: 1, bookmarks: 1, startedAt: 1_000 }, 'https://eigen.beam/v/ROOM');
		assert.deepEqual(checklist.map((item) => item.status), ['ready', 'good', 'good', 'watch']);
		assert.equal(checklist[0].detail.includes('/v/ROOM'), true);
		ok('Field-Test-Checklist und Stats-Dashboard verdichten mobile QA-Signale');

		const hints = pacingHint(parseDeck('# Kurz\nEin Satz.')[0]);
		assert.ok(hints.seconds >= 18);
		const sentiment = replaySentiment(replay.events, replay.slides.length);
		assert.equal(sentiment[1].reactions, 1);
		assert.equal(sentiment[1].bookmarks, 1);
		assert.equal(liveSentimentLabel([{ label: '1', score: 3, reactions: 1, questions: 0, bookmarks: 1 }]), 'gute Resonanz');
		assert.equal(conversionCta('home').primary, 'Live-Sync testen');
		assert.match(conversionCta('viewer-ended').body, /kein PDF/i);
		assert.equal(conversionCta('share').primary, 'Eigene Kopie starten');
		assert.equal(sentimentEventWeight('reaction'), 1);
		assert.equal(sentimentEventWeight('bookmark'), 2);
		assert.equal(sentimentEventWeight('question'), -1);
		const calibrated = replaySentiment([
			{ type: 'question', slide: 0, ts: 1, text: 'Warum?' },
			{ type: 'question', slide: 0, ts: 2, text: 'Wie?' },
			{ type: 'bookmark', slide: 0, ts: 3 }
		], 1);
		assert.equal(calibrated[0].score, 0);
		assert.equal(liveSentimentLabel(calibrated), 'offene Fragen');
		assert.deepEqual(applySentimentSignal(replaySentiment([], 2), 9, 'bookmark').map((p) => p.bookmarks), [0, 1]);
		assert.deepEqual(reopenInsight({ ...replay.stats, joins: 10, reopens: 0 }), { rate: 0, label: 'Erstkontakte', detail: 'Noch keine Wiederöffnungen.', tone: 'quiet' });
		assert.deepEqual(reopenInsight({ ...replay.stats, joins: 10, reopens: 4 }).tone, 'returning');
		ok('CTA-Copy und Sentiment-Gewichtung sind kalibriert und zentralisiert');
		ok('Pacing-Hinweise und Sentiment-Kurve werden aus Slides/Replay-Events berechnet');

		const followPath = '.data/verify-follows.json';
		await rm(followPath, { force: true });
		const firstFollow = await recordFollowDetailed({ email: ' Test@Example.COM ', deckId: 'deck1' }, followPath);
		const secondFollow = await recordFollowDetailed({ email: 'test@example.com', deckId: 'deck1' }, followPath);
		assert.equal(firstFollow.record.email, 'test@example.com');
		assert.equal(firstFollow.record.deckId, 'deck1');
		assert.equal(firstFollow.isNew, true);
		assert.equal(secondFollow.isNew, false);
		const sanitizedFollow = await recordFollowDetailed({ email: 'safe@example.com', deckId: '<img src=x onerror=1>', roomId: 'room_ok-123' }, followPath);
		assert.equal(sanitizedFollow.record.deckId, undefined);
		assert.equal(sanitizedFollow.record.roomId, 'room_ok-123');
		assert.equal(sanitizeFollowTarget('<script>'), undefined);
		assert.equal(escapeHtml('<b>&"'), '&lt;b&gt;&amp;&quot;');
		const follow = await recordFollow({ email: 'other@example.com', deckId: 'deck1' }, followPath);
		assert.equal(follow.email, 'other@example.com');
		const unsubToken = createUnsubToken('Test@Example.com', 'secret');
		assert.equal(verifyUnsubToken(unsubToken, 'secret'), 'test@example.com');
		assert.equal(verifyUnsubToken(unsubToken.replace(/.$/, 'x'), 'secret'), null);
		const outboxDir = '.data/verify-outbox';
		await rm(outboxDir, { recursive: true, force: true });
		await new OutboxEmailProvider(outboxDir, () => 'mail1').send({ to: 'test@example.com', subject: 'Verify', text: 'hello' });
		assert.equal((await readOutbox(outboxDir))[0]?.subject, 'Verify');
		await rm(followPath, { force: true });
		await rm(outboxDir, { recursive: true, force: true });
		ok('Follow speichert/dedupt, Unsubscribe-Token und Mail-Outbox funktionieren');

		const calls: Array<{ sql: string; params: unknown[] }> = [];
		const store = new PostgresActivityStore({ async query(sql: string, params: unknown[] = []) { calls.push({ sql, params }); return { rows: [] }; } }, () => 'event1');
		await store.upsertReplaySession({ roomId: 'room1', deckId: 'deck1', slides: parseDeck('# Persisted'), stats: replay.stats, ended: true, protected: true, ts: 123 });
		await store.recordReplayEvent({ roomId: 'room1', deckId: 'deck1', event: { type: 'end', slide: 0, ts: 124 } });
		await store.recordFollow({ email: 'test@example.com', deckId: 'deck1', roomId: 'room1', createdAt: 125 });
		assert.ok(calls.some((c) => c.sql.includes('replay_sessions')));
		assert.ok(calls.some((c) => c.sql.includes('protected')));
		assert.ok(calls.some((c) => c.sql.includes('INSERT INTO events')));
		assert.ok(calls.some((c) => c.sql.includes('INSERT INTO follows')));
		ok('PostgresActivityStore persistiert Replay-Session, Events und Follows');
	}

	console.log(`\nALL PASS — ${passed} assertions.`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

async function loadAdmZipForVerify(): Promise<new () => { addFile(name: string, data: Buffer): void; toBuffer(): Buffer }> {
	const mod = await import('adm-zip');
	return ((mod as { default?: unknown }).default ?? mod) as new () => { addFile(name: string, data: Buffer): void; toBuffer(): Buffer };
}
