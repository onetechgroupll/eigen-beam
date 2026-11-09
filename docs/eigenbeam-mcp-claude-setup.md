# Claude Code Setup für eigen.beam MCP

Dieses Repo enthält ein project-scoped MCP-Setup für Claude Code / Claude Code Mac App.
Du musst keine JSON-Konfiguration kopieren: Claude liest `.mcp.json` aus dem Repo und startet den Wrapper `scripts/eigenbeam-mcp.sh`.

## Für die Claude Code Mac App

1. Öffne diesen Projektordner in Claude Code.
2. Starte Claude Code neu, falls das Projekt schon offen war.
3. Wenn Claude nach project MCP approval fragt: `eigenbeam` erlauben.
4. Frage Claude z. B.: „Nutze eigenbeam und erstelle ein 5-Slide-Deck; gib mir danach die editUrl und starte einen Room."

Der Server heißt in Claude Code:

```text
eigenbeam
```

## Lokaler Token

Der Wrapper liest den Bearer Token aus dieser ignorierten Datei:

```text
.data/secrets/eigenbeam-mcp-token.txt
```

Die Datei ist durch `/.data` in `.gitignore` ausgeschlossen. `.mcp.json` und `scripts/eigenbeam-mcp.sh` enthalten keine Secrets.

Alternative für Spezialfälle: `EB_MCP_TOKEN` oder `EB_MCP_TOKEN_FILE` beim Start setzen.

## Tools

Claude sieht über `eigenbeam` aktuell diese Tools:

```text
create_deck
get_deck
update_deck
create_room
upload_asset
```

Typischer Ablauf:

1. `create_deck` erzeugt ein Deck aus Markdown.
2. `get_deck` liest bestehende Decks inklusive Markdown-Source.
3. `update_deck` schreibt eine neue Version zurück.
4. `create_room` startet aus einem Deck eine Live-Viewer-Session und liefert `viewerUrl` + `replayUrl`.
5. `upload_asset` lädt ein Base64-Bild hoch und liefert eine direkt nutzbare Markdown-Bildzeile (`Alt` + URL).

`create_room` gibt bewusst **keinen Presenter-Token** aus. Presenter-Zugriff bleibt in eigen.beam httpOnly-Cookie-basiert.

## Debug/Verification im Terminal

Normalerweise reicht die Mac-App-Freigabe. Wenn du debuggen willst:

```bash
python3 -m json.tool .mcp.json >/dev/null
bash -n scripts/eigenbeam-mcp.sh
test -x scripts/eigenbeam-mcp.sh
test -s .data/secrets/eigenbeam-mcp-token.txt
bun run smoke:mcp
claude mcp list
```

Vor der ersten Freigabe kann `claude mcp list` ungefähr so aussehen:

```text
eigenbeam: ./scripts/eigenbeam-mcp.sh - Pending approval
```

Das ist ok: Projekt in Claude Code öffnen und den Server erlauben.

Der Wrapper spricht stdio-MCP. Direkt im Terminal gestartet wirkt er daher wie ein Prozess, der auf Eingabe wartet; das ist normal.
`bun run smoke:mcp` startet den Wrapper dagegen kontrolliert als stdio-Client und prüft `initialize` + `tools/list` über `mcp-remote`.
Mit `EB_MCP_SMOKE_MUTATE=1 bun run smoke:mcp` werden zusätzlich echte Tool-Calls gegen den konfigurierten Endpoint ausgeführt.

## Beispiel-Prompts

```text
Erstelle mit eigenbeam ein 5-Slide-Deck zum Thema Retail Media für Intersport. Gib mir die editUrl.
```

```text
Lies das eigenbeam Deck <id>, kürze die Slides auf je eine Idee und aktualisiere es.
```

```text
Starte für Deck <id> einen PIN-geschützten eigenbeam Room und gib mir den Viewer-Link.
```

```text
Nutze eigenbeam upload_asset für dieses Bild und füge das zurückgegebene Markdown danach in Deck <id> ein.
```
