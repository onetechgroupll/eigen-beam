# How to import PDF, PowerPoint or voice

Turn an existing PDF, `.pptx` or audio recording into a draft deck that you then edit and present.

## Prerequisites

- An eigen.beam instance. In production mode you must be signed in with a magic link; imports return `401` otherwise.
- For voice: `OPENAI_API_KEY` (or `EB_OPENAI_API_KEY`) on the server. Without it, voice import returns `501`, but `.txt` transcripts still work.
- Optional: `ANTHROPIC_API_KEY` for an AI re-layout. Without it, a local rule-based layout is used.

## Steps

1. Open `/new`.
2. In **Import Studio**, pick a tile and choose a file:
   - **PDF/PPTX**: a `.pdf` or `.pptx`, up to 20 MB;
   - **Voice**: an audio file up to 25 MB, or a `.txt` transcript.
3. Wait for the status line to read `Import fertig: N mobile Folien erkannt.` The editor now holds the draft in [deck syntax](../deck-syntax.md).
4. Read the **Ready Check** and apply the quick fixes it offers, for example **Kürzen** or **Reveal vorschlagen**.
5. Edit the text. Imports extract text only: images, charts and layout are not carried over. Re-add images by upload.
6. Save, or click **N Folien live starten →** to present right away.

Nothing is stored until you save. Each import is a fresh draft.

### From a script

```bash
curl -b jar -F file=@talk.pdf -F title='Q3 review' \
  https://beam.example.com/api/import/pdf
```

The response holds `source`, which you can send to `POST /api/decks`. See the [HTTP API](../http-api.md#imports).

## How the layout is chosen

| `mode` | When | Result |
|---|---|---|
| `ai` | `ANTHROPIC_API_KEY` set and the call succeeds | Claude rewrites the text into short slides (model from `EB_CLAUDE_MODEL`) |
| `local` | otherwise | text is split into slides; the first line of each chunk becomes the headline (max. 80 characters) |

Extracted text is capped at 40,000 characters before layout.

## Verification

The editor preview shows the slides. Via the API, `slides` in the response must be non-empty.

## Troubleshooting

| Message / status | Cause | Fix |
|---|---|---|
| `Konnte aus der Datei keinen Text extrahieren.` (422) | scanned PDF or image-only slides | run OCR first or paste the text |
| `Import-Datei zu groß (max. 20 MB).` (413) | file too large | compress, or split the deck |
| `Audio-Datei zu groß (max. 25 MB).` (413) | long recording | split or re-encode at a lower bitrate |
| `Voice→Slides braucht OPENAI_API_KEY …` (501) | no transcription key on the server | set `OPENAI_API_KEY`, or upload a `.txt` transcript |
| `Transkription fehlgeschlagen.` (502) | transcription provider error | retry; check the key and quota |
| `Login erforderlich.` (401) | production instance, not signed in | sign in via `/account` |
| `Zu viele Anfragen.` (429) | more than 20 imports in 10 minutes from your IP | wait for the `retry-after` time |

## Related

- [Tutorial: import content and start a live room](../tutorials/import-to-live-room.md)
- [Deck syntax](../deck-syntax.md)
- [Privacy](../privacy.md): what is sent to AI providers
