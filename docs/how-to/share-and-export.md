# How to share and export a deck

Give others read access to a deck, let them copy it, or download it as Markdown or JSON.

## Prerequisites

- A saved deck you own. Team sharing also needs a magic-link sign-in.

## Choose who can see the deck

1. Open `/account`. Sign in with a magic link if you want to keep decks across devices or share with your team; decks you created anonymously in this browser move into the account on sign-in.
2. Next to the deck, pick a visibility in the dropdown (**Team sichtbar** only appears when you are signed in):

| Visibility | UI label | Who can view, export and clone |
|---|---|---|
| `private` (default) | **Privat** | only you |
| `link` | **Link sichtbar** | anyone with the URL |
| `team` | **Team sichtbar** | everyone signed in with an email address on your domain (`@example.com`) |

Only the owner can edit, start a room or delete, whatever the visibility.

From a script:

```bash
curl -b jar -X PATCH https://beam.example.com/api/decks/<deckId>/sharing \
  -H 'content-type: application/json' -d '{"visibility":"link"}'
```

## Share a link

| Link | Use it for |
|---|---|
| `/share/<deckId>` | the deck with export buttons |
| `/recap/<deckId>` | a read-through after a talk, with **Deck klonen** and a follow opt-in |
| `/replay/<roomId>` | what happened in one session ([live sessions](../live-sessions.md#after-the-session)) |

Share and recap links follow the deck's visibility. A replay link works for anyone who has it (PIN rooms excepted).

## Export

On `/share/<deckId>` click **Markdown exportieren** / **JSON exportieren** (on `/account`: **Export .md** / **Export .json**), or call:

```bash
curl -b jar -OJ https://beam.example.com/api/decks/<deckId>/export/md
curl -b jar -OJ https://beam.example.com/api/decks/<deckId>/export/json
```

Exports contain public slides only: no speaker notes and no owner. The Markdown export is valid [deck syntax](../deck-syntax.md), so you can paste it into a new deck on any instance.

## Let others copy it

Anyone who can view a deck can clone it with **Deck klonen** on the recap page or `POST /api/decks/<deckId>/clone`. The copy belongs to them, is titled `<title> Kopie` and has no speaker notes.

## Verification

Open the share link in a private window. `link` decks render; `private` decks show `Dieses Deck ist privat.`

## Troubleshooting

| Message / status | Cause | Fix |
|---|---|---|
| `Team-Sharing braucht einen Magic-Link-Login.` (401) | not signed in | sign in on `/account` first |
| `Kein Zugriff auf dieses Deck.` (403) | you are not the owner, or the viewer lacks access | change visibility as the owner |
| A colleague cannot see a `team` deck | different email domain, or not signed in | they sign in with their work address |
| Speaker notes missing in the export | by design | keep notes in your own copy |

## Related

- [HTTP API: decks](../http-api.md#decks)
- [Privacy](../privacy.md)
