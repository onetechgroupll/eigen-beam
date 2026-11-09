# eigen.beam — Produkt-Build-Plan

Reiner Bau-Plan: keine Business-Dev, keine Gates, keine Trigger, keine Phasen-Entscheidungen.
Eine Liste, der Reihe nach gebaut — **Lucas bestimmt Tempo und was wann getestet/weitergebaut wird.**
Wird weitergebaut, wann immer Zeit ist.

Live: https://eigen-beam-production.up.railway.app · Repo: onetechgroupll/eigen-beam
Stand: **Production live/deployed (2026-07-05)**. Der ursprüngliche lokale Build-Plan ist
inzwischen umgesetzt und deutlich erweitert: Deck-Authoring, Postgres-Persistenz,
Railway Bucket-Assets, Importe, Import Preview, Ready Check / Deck Quality Coach,
Live-Rückkanal, mobile Library-Remote, Replay/Follow, Magic-Link/PIN-Härtung,
remote MCP-Endpoint (`create_deck`, `get_deck`, `update_deck`, `create_room`,
`upload_asset`), GitHub CI, Mobile QA Lab und Production Watchdog laufen. Live-Rooms
bleiben bewusst In-Memory und sterben bei Deploy/Restart. Echter Mailversand läuft
produktiv über Resend (`EB_MAIL_PROVIDER=resend`, From-Domain `offices.onetech.group`).

## Aktueller Implementierungsstand (Production/Repo, 2026-07-05)

**Wichtig:** Diese Matrix ist der aktuelle Plan-vs-Ist-Stand nach Deploy auf Railway.
Das Claude-Code-MCP-Komfortsetup ist repo-lokal committed; nur der Token bleibt ignored lokal.

| Planpunkt | Status | Was gebaut ist | Noch offen / Einschränkung |
|---|---:|---|---|
| T1-T3 Demo/SSE-Basis | ✅ done + production-verified | Content-First-Viewer, Presenter-Steuerung, Viewer-SSE, Presenter-Token als httpOnly-Cookie, Room-Caps/TTL, SSE-Reaping | Live-Rooms bleiben In-Memory; Deploy/Restart beendet aktive Sessions |
| C1a Markdown → Deck + Bild | ✅ done + production-verified | `/new`, `/edit/[id]`, Markdown-Parser, `---`-Slides, `POST/GET/PUT/DELETE /api/decks`, PostgresDeckRepository, Railway Bucket/S3AssetStore | Asset-CDN/URL-Polish optional; keine Team-/Account-Verwaltung |
| C2 Clarity-Engine | ✅ done + verified | `POST /api/decks/clarify` mit lokalem Fallback und optional Anthropic-Key; lokale Heuristik cappt auf ≤15 Slides, kürzt Textwände, erhält `notes:` separat; `slideFitProfile` steuert Density/Scrim für mobile Lesbarkeit | Weitere AI-Re-Layout-Qualität später optional |
| C3 Block-Typen | ✅ done + verified | `type: number`, `quote`, `image`, `compare`, `timeline`; Shared `SlideView` | Visuelle Feinschliffe/Device-Regressions optional |
| C1b PPT/PDF-Import | ✅ done + verified | `/api/import/ppt`, `/api/import/pdf`, Parser-/Extraktionspfade in Verifikation, Import Preview/Progress/Error States, negative Browser-Smoke für kaputte PDFs | AI-Re-Layout weiter optional |
| C1c Voice → Slides | ✅ done + verified | `/api/import/voice`, Transkript/Transkription → Deck-Markdown | Echter Speech-Provider/UX-Polish optional |
| Templates | ✅ done + verified | Narrative Arc, Pitch, Update im Editor | Weitere Templates optional |
| C4 Progressive Reveal + Pacing | ✅ done + verified | `++` Reveal-Punkte, Presenter tappt weiter, Viewer sieht Reveal-Schritte; Pacing-Hinweise im Presenter/Replay | Weiterer Pacing-Feinschliff optional |
| SSE-Rückkanal / Presenter-SSE | ✅ done + production-verified | Viewer→POST Events, Server→Presenter SSE `/present/:id/events`, Snapshot-Broadcast + Cleanup | Live-Feed bleibt während Session In-Memory; Replay persistiert nachgelagert |
| B2 Reaktionen / Notes / Merken | ✅ done + verified | Reactions, Questions, Bookmarks, typisierter Presenter-Feed, Speaker Notes; öffentliche Payloads strippen Notes; Replay-Takeaway/Clip-Export als Markdown/JSON | Moderation/Advanced Export optional |
| L1 Presence/Sentiment | ✅ done + verified | Joins/current/peak/reopens/reactions/questions/bookmarks Stats; Sentiment-Kurve aus Reactions/Questions/Bookmarks im Presenter/Replay; presenter-geschütztes Live-Stats-Dashboard `/present/:id/stats` | Semantik/Gewichtung später kalibrierbar |
| L2 Ask-the-Presenter | ✅ done + verified | Frage bleibt im Presenter-Feed, Viewer-Screens bleiben clean | Moderation/Export offen |
| #1 Mach dein eigenes CTA | ✅ done + verified | Home/Recap/Clone-Pfade, Powered-Footer im Viewer, End-Screen-CTA mit Replay + eigenes Deck, Ready-Check-CTA-Quick-Fix (`CTA ergänzen`) | Conversion-Text später optimierbar |
| #2 Anonyme Stats | ✅ done + hardened | `/api/rooms/:id/stats`, keine PII, Secret per Auth-Header statt Query | Stats-Dashboard/Visualisierung optional |
| #3 Powered Footer | ✅ done | Viewer-Footer | — |
| Mobile Field-Test / PWA Polish | ✅ done + verified | Manifest, iOS-Standalone-Head-Tags, SVG + maskable 192/512 PNG-Icons; Presenter-Field-Test-Checkliste für Join-Pfad, 8-Phones-Ziel, Live-Sync-Beobachtung und Re-Open-Signal | Kein Service Worker/Offline-Cache; Live-Sync bleibt bewusst online-only |
| #4 Re-Open-Zähler | ✅ done + verified | Reopen zählt echte Wiederöffnungen/Rückkehr aus Viewer-Session/Visibility, nicht Erstkontakt; Presenter/Replay zeigen Re-Open-Rate und Label | Weitere Analytics optional |
| B3 Recap + Clone + Export | ✅ production-verified | `/recap/[id]`, `POST /api/decks/:id/clone`, public-safe `.md`/`.json` Export unter `/api/decks/:id/export/:format`; keine `ownerId`/`source`/`speakerNotes` in öffentlichen Payloads; Recap-Hero, Timing, Clone-CTA | — |
| B4a Accounts + Magic-Link | ✅ production-verified | Signierte User-Session, `/account` als mobile Library-Remote mit gespeicherten Deck-Cards + großem `Live starten`, Deck-Löschung, Magic-Link-Claim, Profil aus Session, Team-light per Email-Domain, Deck-Sichtbarkeit `private`/`link`/`team`, `/share/:id`, owner-only Sharing-API; echter Mailversand via Resend | Weitere Team-/Admin-Rechte bewusst nicht gebaut |
| B4b PIN-Rooms | ✅ done + hardened | PIN beim Room-Start, Viewer-Gate, Stream/Event/Replay-Gate; signierte room-scoped PIN-Cookies; PIN-Rate-Limit | Kein Rollen-/Login-Modell; PIN ist Room-spezifisch |
| L3 Follow | ✅ done + production-verified | Follow-API, Deduping, Unsubscribe-Token, Resend-Mail, PostgresActivityStore | Follow-UX weiter ausbaubar |
| L4 Replay/VOD + CTA/Sentiment | ✅ production-verified | Replay-Session + Events persistieren, `/replay/[id]`, Public-Payload ohne Notes; Replay-Hero, Slide-Rail, Stats-Cards, kalibrierte Sentiment-Kurve, zentrale Conversion-CTA-Copy | — |
| Presenter Session Summary | ✅ done + verified | Deterministische Summary aus Replay/Stats: Top-Folien, Engagements, Fragen pro Folie, „was gelandet ist“, „nächstes Mal klären“, Markdown/JSON unter `/api/replay/:id/summary`, Panel auf `/replay/:id` | Optional später: Mail an bekannte Presenter-Email und AI-polished Follow-up-Pack |
| One-Tap Follow-up Pack | ✅ done + verified | Deterministischer Mail-/Gruppenchat-Entwurf aus Summary + Replay, absolute Replay/Summary/Takeaway-Links, Markdown/JSON unter `/api/replay/:id/followup`, Panel auf `/replay/:id`; public-safe ohne Frage-/Notes-Leaks | Optional später: direktes Senden an bekannte Presenter-Email |
| Slide Heatmap / What-landed | ✅ done + verified | Deterministische Resonanz-Heatmap pro Folie mit Intensität, `hot`/`warm`/`quiet`/`confusing`, Markdown/JSON unter `/api/replay/:id/heatmap`, Visualisierung auf `/replay/:id`; public-safe ohne Frage-/Notes-Leaks | Optional später: AI-Coach nutzt Heatmap für Deck-V2-Vorschläge |
| Deck V2 Draft aus Session | ✅ done + verified | Guardrailed Folge-Deck aus Replay/Heatmap: starke Folien bleiben markiert, Frage-Häufungen erzeugen Klarstellungsfolie, Markdown/JSON unter `/api/replay/:id/deck-v2`, Panel auf `/replay/:id`; public-safe ohne Frage-/Notes-Leaks | Optional später: echte AI-Polish-Stufe auf Basis dieses Drafts |
| Session Coach / Next Talk Checklist | ✅ done + verified | Deterministische Presenter-Coach-Actions aus Summary/Heatmap/Deck-V2/Follow-up: clarify, reuse, followup, rehearse; Markdown/JSON unter `/api/replay/:id/coach`, Panel auf `/replay/:id`; public-safe ohne Frage-/Notes-Leaks | Optional später: AI-Polish der Coach-Sprache |
| MCP für AI-Clients | ✅ production-verified | Remote `/mcp` mit `create_deck`, `get_deck`, `update_deck`, `create_room`, `upload_asset`, Bearer-Auth, `EB_MCP_TOKEN` + `EB_MCP_TOKENS`, OAuth Protected-Resource-Discovery, optionaler OAuth `client_credentials` Token-Issuer (`EB_OAUTH_TOKEN_SECRET` + `EB_OAUTH_CLIENTS`), Claude-Code-Wrapper lokal vorbereitet; `create_deck`/`update_deck` liefern vertikale content-first Deck-Guidance; `bun run smoke:mcp` prüft Wrapper/`mcp-remote` dauerhaft | Komfortables OAuth-Client-Provisioning optional |
| Ops/Monitoring | ✅ production-verified | `/healthz`, `/readyz`, secret-safe readiness payload, Postgres `SELECT 1`, `bun run smoke:ops`, Runbook `docs/eigenbeam-ops.md`, GitHub-Actions-Watchdog alle 15 Minuten, Push/PR-CI mit Browser/Replay/Ops-Smokes, manueller Mobile QA Lab Workflow mit Screenshot-Artefakten | — |

| GitHub/Dokumentation | ✅ done + verified | Root-README, Docs-Index, Testing/Deployment/Security-Doku, SECURITY/CONTRIBUTING/CODE_OF_CONDUCT/CHANGELOG, PR-Template, Issue-Templates, proprietärer Lizenzhinweis und GitHub-Metadaten/Topics | Bei Feature-Änderungen laufend aktuell halten |

**Letzte verifizierte Gates (2026-07-05):**
- `bun run verify:c1a` → `ALL PASS — 68 assertions.`
- `bun run check` → 0 Errors, 0 Warnings.
- `rm -rf build .svelte-kit/output .svelte-kit/generated && bun run build` → `✓ built`, `adapter-node ✔ done`.
- Browser-Smoke lokal/Production → `BROWSER SMOKE PASS — 7 checks` inkl. Authoring, Library, Ready Check und Import-Fehlerpfad.
- Replay-Smoke lokal/Production → `SMOKE PASS — 15 checks`.
- Ops-Smoke lokal/Production → `OPS SMOKE PASS — 3 checks`.
- GitHub Actions CI (`.github/workflows/ci.yml`) → Push/PR-Gate für check, verify, build, Browser/Replay/Ops-Smokes grün.
- GitHub Actions Mobile QA Lab (`.github/workflows/mobile-qa.yml`) → manuell mit `webkit` + `iphone-15-pro-dark` grün, Report/Screenshots als Artifact.
- Production-Resend-Smoke → `/api/auth/magic-link` sendet an `delivered@resend.dev` mit `{ ok: true, delivered: true }`, ohne Magic-Link im JSON.
- Production MCP-Smoke → `initialize`, `tools/list`, `tools/call create_deck/get_deck/update_deck/create_room/upload_asset` erfolgreich; Multi-Token-MCP-Auth mit `EB_MCP_TOKENS` + Legacy-Token production-verifiziert.
- MCP Deck-Quality-Smoke → `tools/list` enthält Guidance für vertikale 9:16-Decks, eine Idee pro Slide, kurze Bodies und getrennte `notes:`.
- MCP OAuth-Discovery-Smoke → `/.well-known/oauth-protected-resource/mcp` und unauthenticated `/mcp` `WWW-Authenticate` secret-safe.
- Repo-lokaler MCP-Wrapper-Smoke → `bun run smoke:mcp` prüft `scripts/eigenbeam-mcp.sh` + `mcp-remote` ohne Seiteneffekte; `EB_MCP_SMOKE_MUTATE=1` aktiviert echte Tool-Calls. Production-verifiziert: mutating MCP-Smoke über den Claude-Code-Wrapper → `MCP STDIO SMOKE PASS — 7 checks`.
- Ops-Smoke `bun run smoke:ops` → `/healthz` + `/readyz` secret-safe; `/readyz` prüft Production-Konfig + Postgres-Ping.
- Production-DB-Migrationen angewendet: `001_foundation.sql`, `002_replay_follow.sql`, `003_relax_activity_deck_fks.sql`, `004_deck_sharing.sql`.
- Account-UX production-verifiziert: Profil aus Magic-Link-Session, Team-light per Email-Domain, Deck-Sichtbarkeit `private`/`link`/`team`, `/share/:id`, owner-only Sharing-API, Clone-Rechte und mobile Library-Remote als Launch-Surface.
- Export/Sharing production-verifiziert: public-safe Markdown/JSON Downloads, private 403 für fremde Viewer, Link-Export ohne Notes/Source-Leaks.
- CTA/Sentiment production-verifiziert: zentrale Conversion-CTA-Copy, Questions nur noch leicht negativ gewichtet (`-1`), Label `offene Fragen` bei dominierenden Fragen; lokaler Replay-Browsercheck ohne Console-Errors und Production-Smoke grün.
- Import/Authoring quality-verifiziert: Import Preview/Progress/Error States, Deck Quality Coach mit deterministischem Ready Check, Quick-Fixes (`Kürzen`, `Reveal vorschlagen`, `CTA ergänzen`) und negative kaputte-PDF-Smoke ohne 500.
- GitHub-Dokumentation aktualisiert: README, Docs-Index, Testing/Deployment/Security, Community-Dateien, PR-/Issue-Templates, GitHub-Metadaten/Topics.

**Claude-Code-MCP-Komfortsetup:**
- `.mcp.json`, `scripts/eigenbeam-mcp.sh`, `docs/eigenbeam-mcp-claude-setup.md` — repo-lokal committed; Token bleibt in `.data/secrets/eigenbeam-mcp-token.txt` ignored.
- `docs/eigenbeam-mcp.md` — MCP-Tool-Doku inkl. `create_room` und `upload_asset`.

**Nächster sinnvoller Fokus:**
1. Kein harter Roadmap-Block offen. Nächste sinnvolle Arbeit ist echte Nutzung/QA, Geräte-/Browser-Smokes und punktuelle UX-Feinschliffe; zuletzt ergänzt: PWA/Install-Polish, Presenter-Field-Test-Checkliste, Live-Stats-Dashboard, Presenter Session Summary, One-Tap Follow-up Pack, Slide Heatmap, Deck V2 Draft und Session Coach.

## Produkt-Prinzipien (Bau-Leitplanken)
1. **Content immer im Vordergrund** — so einfach erstellt wie klar konsumiert.
2. **Live = Overlay/asynchron**, nie ein Panel, das mit der Folie konkurriert.
3. **Kein Mentimeter-Land** — keine schweren Umfragen/Quizze.

## Bau-Reihenfolge (dependency-getrieben, nicht gegated — spring wie du willst)

### 1. Content-Kern (ersetzt das hardcoded Deck)
- **C1a** Text/Markdown → vertikales Deck (`---` trennt Slides) + Bild-Upload
- **C2** Clarity-Engine: AI „auf eine Idee eindampfen", Voll-Karte-Nudge, Auto-Fit-Typo, Auto-Lesbarkeit (Scrim auf Bildern)
- **C3** Block-Typen: Riesen-Zahl, Zitat, Full-Bleed-Bild, Vergleich, Timeline
- Abhängigkeit: keine. Macht aus der Demo ein echtes Tool.

### 2. Content-Input erweitern
- **C1b** PPT/PDF-Import → AI re-layoutet auf vertikal
- **C1c** Voice → transkribiert + strukturiert zu Slides
- **Templates**: Narrative-Arc (Hook→Problem→Proof→CTA), Pitch, Update
- Abhängigkeit: C1a.

### 3. Content-Konsum-Polish
- **C4** Progressive Reveal (Tap → Elemente einzeln einblenden) + Pacing-Hinweise
- Abhängigkeit: C3.

### 4. Live-Layer  ⚠️ braucht SSE-Rückkanal
- **Technische Basis zuerst:** bidirektionaler Kanal — Viewer→Server POST, Server→Presenter SSE (heute Einbahn).
  Die einzige echte Architektur-Erweiterung im Plan → eigener /plan-eng-review, bevor der Live-Layer startet.
- **B2** Reaktionen (Tap → floatet beim Presenter) + Speaker-Notes (nur Presenter) + Slide-merken (Viewer-Takeaway / „Clip")
- **L1** Presence-Pulse („● 8 dabei") + Sentiment-Kurve für den Presenter
- **L2** Ask-the-Presenter (Frage landet nur bei dir, Viewer-Screens bleiben clean)
- Abhängigkeit: SSE-Rückkanal zuerst.

### 5. Verbreiten + Signal
- **#1** „Mach dein eigenes"-CTA am Viewer-End-Screen
- **#2** anonyme `/stats` (Joins, Peak-Concurrent, Wiederkehr) — secret-geschützt
- **#3** „Powered by eigen.beam"-Footer am Viewer
- **#4** Link-Weitergabe + Re-Open-Zähler (neue Geräte)
- **B3** Recap-Link (schöne vertikale Web-Version nach dem Talk) + Deck klonen
- Abhängigkeit: keine harte; Recap profitiert vom Content-Kern.

### 6. Identität + Schutz
- **B4a** Magic-Link-Login (Decks + Stats gehören dir)
- **B4b** PIN-geschützte Rooms (vertrauliche Pitches)
- Abhängigkeit: Login vor „Decks gehören dir"-Features.

### 7. Optional / später (von dir deprioritisiert — drin, falls Lust)
- **L3** Follow / „ping mich nächstes Mal" (Retention-Loop)
- **L4** Replay / VOD (selbst-gepacte Session danach)

## NICHT bauen (Produkt-Leitplanke)
- Voller WYSIWYG-Freiform-Editor (= Canva, lädt zum Überladen ein, gegen Prinzip 1)
- Schwere Umfragen/Quizze (Prinzip 3)
- Teams / Admin / Enterprise-Branding

## Foundation-Architektur (Eng-Review 2026-06-28)
Querschnitt-Entscheidungen, die ALLE Features tragen — einmal gelegt, Features reiten drauf.

**Persistenz (dauerhaft vs. ephemer):**
- Dauerhaft → **Railway-Postgres**: `users(id,email?,created_at)`, `decks(id, owner_id nullable, title, slides JSONB, ts)`, `deck_assets(id, deck_id, bucket_key)`, `events(id, room_id, type, ts)` (Stats, kein PII).
- Ephemer → In-Memory `rooms` Map (Live-Session, stirbt bei Restart = ok). `createRoom(deckId)` lädt slides aus DB → Snapshot in den Room (kein DB-Hit pro Viewer).

**Bild-Storage:** **Railway Buckets** (S3-kompatibel, Standard-S3-SDK); `deck_assets.bucket_key`, Railway-CDN per-Service später davor. (Korrektur im Review: Railway hat natives S3+CDN.)

**AI (C1/C2):** Claude server-side (Railway-Env-Key), **immer async/pre-session, NIE im Live-Pfad**, harter Fallback auf manuelles Markdown bei Fehler/Latenz.

**Identität:** **anonyme Creator-ID (Cookie) jetzt** — `decks.owner_id` nullable, wird bei späterem Magic-Link-Login (B4a) zu `user.id` ge-claimed. Keine Email-Infra jetzt. Per-Room-Presenter-Cookie bleibt für die Live-Steuerung.

**Realtime bleibt SSE (kein WebSocket), auch für den Live-Layer:**
```
Viewer  --POST-->  Server  --SSE-->        Viewer     (Slide-Sync, heute)
Viewer  --POST reaction/question-->  Server  --SSE(NEU)-->  Presenter  (Live-Layer, Phase 4)
```
Der Live-Layer fügt nur einen Presenter-seitigen SSE-Stream + Viewer→Server-POSTs hinzu. Das asymmetrische Modell trägt den ganzen Plan — die einzige echte Architektur-Erweiterung, eigener Mini-Eng-Review wenn der Live-Layer dran ist.

**Erstes Build-Paket C1a — konkret:**
- DB-Setup + Migration (`decks`, `deck_assets`; `users`/`events` als Tabellen vorbereitet).
- `POST /api/decks` (Markdown/Text → slides JSON, Creator-ID-Cookie), `GET/PUT /api/decks/:id`, Bild-Upload → Bucket.
- Authoring-Page `/new` + `/edit/[id]` (Markdown-Textarea, `---` trennt Slides, Live-Vorschau im 9:16-Frame).
- `createRoom(deckId)` lädt slides aus DB statt `DEMO_DECK` (bleibt als Seed/Beispiel).
- Files: `src/lib/server/db.ts`, `src/lib/server/decks-repo.ts`, `migrations/`, `src/routes/api/decks/…`, `src/routes/new/…`, `src/routes/edit/[id]/…`.

**Test-Strategie C1a:** Unit (Markdown→slides-Parser: `---`-Split/leere Slide/Bild-Syntax, deck-CRUD, Clamp bleibt grün) · E2E (Deck erstellen → Room → Viewer sieht Slide → advance → sync) · **Regression:** bestehende SSE-Sync-Tests müssen nach `createRoom(deckId)`-Umbau grün bleiben.

**Performance:** keine N+1 (deck-load 1× pro Room-Create, nicht pro Viewer); AI off-live-path; Bilder via Bucket/CDN. Keine Issues.

**NOT in scope (dieser Foundation-Runde):** Magic-Link/Email (bis B4a), Live-Layer-Presenter-SSE (eigener Review bei Phase 4), L3/L4.

## Bau-Hinweise
- Pro Arbeitspaket /plan-eng-review für die Architektur. Der **SSE-Rückkanal** (Live-Layer) ist die einzige
  echte Architektur-Erweiterung — die zuerst sauber designen, nicht nebenbei.
- Jedes Feature gegen die 3 Produkt-Prinzipien prüfen.
- C1a ist das kleinste echte Inkrement, das die Demo in ein nutzbares Tool verwandelt → guter erster Griff.

_Provenienz: /office-hours → /plan-eng-review → /plan-design-review → /plan-ceo-review → /plan-eng-review (Foundation, 2026-06-28).
BD/Strategie/Gates auf User-Wunsch entfernt — reiner Produkt-Plan._

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review (Foundation) | `/plan-eng-review` | Querschnitt-Architektur ganzer Plan | 1 | CLEAR | 4 Fundament-Entscheidungen gelockt: Postgres+In-Memory-Split, Railway Buckets, Claude-async, anon-Creator-ID; SSE bleibt; C1a konkretisiert |
| Eng Review (T1-3) | `/plan-eng-review` | Architektur gebauter Stand | 1 | CLEAR | SSE/In-Memory/Härtung — gilt; pro neuem Paket neu |
| CEO Review | `/plan-ceo-review` | Strategie | 1 | CLEAR | privates Side-Project, reiner Produkt-Plan |
| Design Review | `/plan-design-review` | UI/UX | 1 | CLEAR | Content-First-System gesetzt |

- **CORRECTION:** Stale-Claim „Railway hat kein S3/CDN" im Review korrigiert (User-Hinweis) → Railway Buckets + CDN sind nativ.
- **VERDICT:** ENG CLEARED (Foundation) — Architektur für den ganzen Plan gelockt; nächstes Build-Paket C1a ist konkret spezifiziert. Live-Layer-Presenter-SSE braucht bei Phase 4 einen eigenen Mini-Review.

**UNRESOLVED DECISIONS:**
- Magic-Link-Auth-Approach (Resend/Postmark vs. OAuth) — vertagt bis B4a tatsächlich gebaut wird; Creator-ID-Cookie trägt bis dahin.
