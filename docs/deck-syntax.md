# Deck syntax

A deck is one Markdown-like text. eigen.beam parses it into slides on save (`src/lib/deck-parse.ts`). The editor, `POST /api/decks`, the importers and the MCP tools all use the same parser, so what you read here holds everywhere.

The format is deliberately small: one idea per slide, a few block types, no free layout ([ADR 0004](adr/0004-content-first-mobile-design.md)).

## Slides

A line that contains only `---` (surrounding spaces allowed) starts a new slide. Empty slides are dropped.

```markdown
# First slide

---

# Second slide
```

There is no front matter. A `---` at the very top just produces an empty first block, which is dropped.

## Anatomy of a slide

Inside a slide, every line is one of four things, checked in this order:

| Line | Becomes |
|---|---|
| `++ text`, `>> text` or `reveal: text` | a reveal item |
| `key: value` with a known key (see [directives](#directives)) | a directive, removed from the text |
| `# Heading` (`#` to `######`) | the **headline** (first heading only) |
| anything else | eyebrow or body text |

Lines **above** the first heading become the **eyebrow** (a small label). Lines **below** it become the **body**. Without any heading, the first non-empty line is the headline and the rest is body.

```markdown
Q3 Review
# Revenue is up, cost is flat
We grew without adding headcount.
```

```json
{ "eyebrow": "Q3 Review", "headline": "Revenue is up, cost is flat", "body": "We grew without adding headcount." }
```

Rules for text:

- Eyebrow and body lines are joined with single spaces into one paragraph. Line breaks and blank lines inside the body are not kept.
- The body is plain text. `**bold**` or links render literally.
- In the headline, reveal items and timeline entries, a leading list marker (`-`, `*`, `+`), `**bold**`, `__bold__` and `` `code` `` markers are stripped to plain text.
- A slide without a headline is dropped. Exception: an image slide falls back to the image's alt text, then to `Bild`.

## Directives

Directive keys are case-insensitive. A line counts as a directive only for these keys; any other `word: text` line stays normal text (so `Goal: more revenue` is safe in a body).

| Directive | Effect |
|---|---|
| `type: <kind>` (alias `kind:`) | sets the [slide type](#slide-types) |
| `eyebrow: <text>` | eyebrow, used only when there is no text above the heading |
| `notes: <text>` (alias `speaker:`) | private speaker notes; the last one wins |
| `number: <value>` (alias `metric:`) | the big number on a `number` slide |

`left:` and `right:` are read only on `compare` slides (see below).

## Reveal items

```markdown
# Three things we learned
++ Customers want speed
++ Price matters less than expected
++ Support is the moat
```

Reveal items are a list shown under the body. On a viewer's phone they appear one per tap after the presenter moves to the slide. When a viewer goes back to an earlier slide, all items are shown at once. See [live sessions](live-sessions.md#reveals).

## Speaker notes

```markdown
# Our pricing
notes: Mention the pilot discount only if asked.
```

Notes appear in the presenter remote under **NOTES**. They are never sent to viewers, the recap, the replay, the share page, exports or the public deck API. Only the deck owner gets them back from `GET /api/decks/:id`. A deck created via MCP has no owner until its claim link is opened, so until then nobody gets its notes over HTTP ([HTTP API: deck access](http-api.md#deck-access)).

## Images

```markdown
# Our team
![Team photo](https://example.com/team.jpg)
```

- Only the **first** image in a slide is used. Further images stay in the text as literal Markdown.
- The URL must be `https://…` or an uploaded asset path `/assets/…`. Any other URL (including `http://`) is silently dropped.
- A slide with an image and no `type:` becomes an `image` slide.
- Upload images in the editor or via `POST /api/decks/:id/assets` ([HTTP API](http-api.md#upload-an-image)); the response gives you the `/assets/…` URL.

## Slide types

The default type is `text`. Unknown values fall back to `text` (or `image` if the slide has an image).

### `text`

Eyebrow, headline, body, optional image and reveal items. Everything above applies.

### `number`

```markdown
type: number
number: 42 %
# of viewers re-opened the deck later
```

The big value comes from `number:`/`metric:`. Without it, the headline itself is shown as the number.

### `quote`

```markdown
type: quote
# Customer voice
> We stopped sending PDFs after the first session.
— Head of Sales, pilot customer
```

- The quote is the first body line starting with `>`. Without one, the headline is the quote.
- The attribution is the first body line starting with a dash and a space (`- `, `– ` or `— `).
- The rest of the body is not shown.

### `image`

`type: image` (aliases `full-bleed`, `fullbleed`) shows the image large. A slide with an image is an image slide by default anyway.

### `compare`

```markdown
type: compare
# Before / after
left: PDF afterwards | Nobody is on the same slide.
right: Live sync | Everyone follows you.
```

- `left:` and `right:` each take `Title | body`. The body part is optional.
- Missing sides default to `Vorher` and `Nachher`.
- The slide body is not shown.

### `timeline`

```markdown
type: timeline
# Rollout
- Q1: Pilot with two teams
- Q2: Company-wide
- Q3 – External customers
```

- Each entry is a list line `- label: text`.
- The separator is a colon followed by a space (`: `) or a dash with spaces around it (` - `, ` – `, ` — `). The first such separator splits the line, so labels may contain colons and hyphens: `- 09:30: Kick-off` gives label `09:30`, `- Kick-off - Start` gives label `Kick-off`.
- Compact entries without spaces (`- Q1:Pilot`) still work; there the label ends at the first `:` or dash.
- If at least one entry parses, the body is not shown.

## Limits

| Limit | Value | Error |
|---|---|---|
| Source length | 50,000 characters | `413` |
| Slides per deck | 60 | `400` |
| Slides per deck (minimum) | 1 | `400` |
| Title | 120 characters (longer is truncated); empty becomes `Unbenannt` | — |

## A complete example

```markdown
Kick-off
# One screen per person
No projector needed. You lead, everyone follows.
notes: Start with the room count.

---

type: number
number: 8
# phones, zero projectors

---

type: compare
# Before / after
left: Talk, then send the PDF | Nobody sees the same slide.
right: eigen.beam | Everyone is on your slide.

---

# What happens next
++ Open the link
++ Follow along
++ Swipe back any time
```

## Related

- [Tutorial: your first deck](tutorials/first-deck.md)
- [Live sessions](live-sessions.md): how slides behave on phones
- [HTTP API](http-api.md) and [MCP](mcp.md): create decks from code
- [How to import PDF, PowerPoint or voice](how-to/import-content.md)
