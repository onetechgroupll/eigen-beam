# eigen.beam MCP

AI-Clients können über den remote MCP-Endpoint Decks direkt in eigen.beam anlegen,
lesen, aktualisieren, Bilder hochladen und aus einem Deck eine Live-Viewer-Session starten.

## Endpoint

```text
https://eigen-beam-production.up.railway.app/mcp
```

Auth läuft über Bearer Token:

```http
Authorization: Bearer ***
```

Tokens liegen in Railway als `EB_MCP_TOKEN` (Legacy/Einzeltoken) und optional
`EB_MCP_TOKENS` (kommagetrennte oder mehrzeilige Liste für Rotation/mehrere
Clients). Beide Variablen werden zusammen akzeptiert, Duplikate ignoriert; ohne
konfigurierten Token schlägt `/mcp` fail-closed mit `401` fehl. Lokal wurde der
aktuellen Token bei der Production-Einrichtung zusätzlich unter
`.data/secrets/eigenbeam-mcp-token.txt` abgelegt; diese Datei ist über
`.gitignore` ausgeschlossen.

Für OAuth-kompatible Clients veröffentlicht der Server zusätzlich secret-safe
Discovery-Metadata:

```text
GET /.well-known/oauth-protected-resource/mcp
GET /.well-known/oauth-protected-resource
```

Unauthentifizierte `/mcp`-Requests antworten weiterhin `401`, enthalten aber nun
einen `WWW-Authenticate: Bearer ... resource_metadata="..."` Header. Neben den
statischen/gescopten Bearer Tokens kann eigen.beam optional auch eigene OAuth
`client_credentials` Access-Tokens ausstellen.

OAuth-Discovery:

```text
GET /.well-known/oauth-authorization-server
GET /.well-known/openid-configuration
POST /oauth/token
```

Der Token-Issuer ist fail-closed und nur aktiv, wenn beide Env-Werte gesetzt sind:

```text
EB_OAUTH_TOKEN_SECRET=...
EB_OAUTH_CLIENTS=client-id:client-secret|deck:read+room:create
```

`EB_OAUTH_CLIENTS` akzeptiert komma- oder zeilengetrennte Einträge. Scopes sind auf
die MCP-Scopes beschränkt: `deck:read`, `deck:write`, `room:create`, `asset:upload`.
Ohne diese Env-Werte bleiben die OAuth-Discovery-Endpunkte secret-safe erreichbar,
aber `/oauth/token` gibt keine Tokens aus.

`/oauth/token` akzeptiert `client_credentials` sowohl als OAuth-typisches
`application/x-www-form-urlencoded` als auch als `application/json`; JSON ist für
non-browser Automationsclients praktisch, weil SvelteKit/Browser-CSRF-Regeln keine
`Origin`-Header voraussetzen.

## Tool: `create_deck`

Input:

```json
{
  "title": "Interner Deck-Titel",
  "source": "# Slide 1\n\nText\n---\n# Slide 2\n\nText"
}
```

Markdown-Konventionen:

- `---` trennt Slides.
- `# Headline` setzt die Headline.
- `![Alt](https://...)` setzt ein Bild.
- `notes: ...` kann Presenter Notes enthalten; öffentliche Viewer-/Replay-Payloads strippen diese.
- `type: number`, `quote`, `compare`, `timeline` werden vom bestehenden Parser unterstützt.

Deck-Qualitätsguidance für AI-Clients ist direkt in den MCP-Toolbeschreibungen
von `create_deck` und `update_deck` enthalten, damit Claude/andere Clients schon
vor dem Tool-Call richtig planen:

- vertikal/mobile-first im 9:16-Format denken
- eine Idee pro Slide
- kurze Headlines, knappe Bodies, keine Textwände
- ideal 5–12, maximal ≤15 Slides
- Speaker Notes strikt als `notes: ...` getrennt halten
- Bilder über `![Alt](https://...)` oder `upload_asset.markdown` einfügen

Output:

```json
{
  "id": "...",
  "title": "...",
  "slideCount": 2,
  "editUrl": "https://eigen-beam-production.up.railway.app/edit/...",
  "deckApiUrl": "https://eigen-beam-production.up.railway.app/api/decks/...",
  "newRoomApiUrl": "https://eigen-beam-production.up.railway.app/api/rooms"
}
```

MCP-Decks werden bewusst zunächst **unowned** erstellt. Dadurch kann der erste Browser-Editor das Deck über den bestehenden Edit-/Save-Flow claimen, statt dass ein AI-Service-Account die spätere Bearbeitung blockiert.

## Tool: `get_deck`

Liest ein bestehendes Deck inklusive Markdown-`source`, damit AI-Clients gezielt weiterarbeiten können.

Input:

```json
{ "id": "..." }
```

Output enthält zusätzlich zu den stabilen Links:

```json
{
  "id": "...",
  "title": "...",
  "source": "# Slide 1\n---\n# Slide 2",
  "slideCount": 2,
  "updatedAt": 1780000000000,
  "editUrl": "https://eigen-beam-production.up.railway.app/edit/...",
  "deckApiUrl": "https://eigen-beam-production.up.railway.app/api/decks/...",
  "newRoomApiUrl": "https://eigen-beam-production.up.railway.app/api/rooms"
}
```

## Tool: `update_deck`

Ersetzt ein bestehendes Deck vollständig aus Markdown. Vor manuellen Edits sollte der Client
`get_deck` nutzen und danach die komplette neue `source` zurückschreiben.

Input:

```json
{
  "id": "...",
  "title": "Aktualisierter Titel",
  "source": "# Neue Version\n---\n# Zweite Folie"
}
```

## Tool: `create_room`

Startet eine Live-Viewer-Session aus einem bestehenden Deck-Snapshot.

Input:

```json
{
  "deckId": "...",
  "pin": "optional"
}
```

Output:

```json
{
  "roomId": "...",
  "deckId": "...",
  "deckTitle": "...",
  "slideCount": 2,
  "viewerUrl": "https://eigen-beam-production.up.railway.app/v/...",
  "replayUrl": "https://eigen-beam-production.up.railway.app/replay/...",
  "protected": true
}
```

Wichtig: Presenter-Tokens bleiben weiterhin ausschließlich httpOnly-Cookies auf
`/present/:id`. Das MCP-Tool gibt bewusst nur Viewer-/Replay-Links aus und leakt
keinen Presenter-Token.

## Tool: `upload_asset`

Lädt ein Bild über den bestehenden Asset-Store hoch (lokal File-Store, Production Railway
Buckets/S3) und gibt eine direkt in Deck-Markdown nutzbare Bildzeile zurück.

Input:

```json
{
  "filename": "chart.png",
  "imageBase64": "iVBORw0KGgo...",
  "alt": "Retail Media Chart"
}
```

`imageBase64` darf auch als Data-URI kommen (`data:image/png;base64,...`). Unterstützt
werden dieselben Formate und Limits wie beim Editor-Upload: PNG, JPEG, WebP, GIF;
maximal 5 MB nach Decode.

Output:

```json
{
  "key": "...png",
  "url": "https://.../...png",
  "mime": "image/png",
  "alt": "Retail Media Chart",
  "markdown": "![Retail Media Chart](https://.../...png)"
}
```

Der Output enthält bewusst keine Bildbytes; Clients sollen `markdown` in `create_deck`
oder `update_deck` einfügen.

## Claude Code Setup

Für Claude Code / Claude Code Mac App liegt das bevorzugte Setup repo-lokal vor:

```text
.mcp.json
scripts/eigenbeam-mcp.sh
docs/eigenbeam-mcp-claude-setup.md
```

Claude Code im Projektordner öffnen, den project-scoped MCP-Server `eigenbeam`
erlauben und den Token lokal/ignored unter `.data/secrets/eigenbeam-mcp-token.txt`
ablegen. Details stehen in `docs/eigenbeam-mcp-claude-setup.md`.

## TODO: MCP weiter ausbauen

Das aktuelle Setup ist weiterhin bewusst schlank: `create_deck`, `get_deck`, `update_deck`,
`create_room` und `upload_asset` plus `mcp-remote`/Wrapper für Claude Code.

Der repo-lokale Wrapper ist dauerhaft per Smoke verifizierbar:

```bash
bun run smoke:mcp
```

Default prüft side-effect-arm `initialize` + `tools/list` über `scripts/eigenbeam-mcp.sh`
und `mcp-remote`. Für einen echten Tool-E2E mit Test-Deck, Test-Room und Mini-Asset:

```bash
EB_MCP_SMOKE_MUTATE=1 bun run smoke:mcp
```

Später ausbauen:

- Setup für Claude Code Mac App glätten, idealerweise ohne manuelle Token-Datei pro Device.
- OAuth-Client-Provisioning/Rotation komfortabler machen, falls statische `EB_OAUTH_CLIENTS` unhandlich werden.
- Tool-Beschreibungen/Prompts weiter ausbauen, sobald echte Claude-Code-Decks neue Qualitätsprobleme zeigen.
