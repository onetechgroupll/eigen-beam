# Tutorial: your first deck, live on two screens

In about ten minutes you will write a four-slide deck, present it, follow along in a second window as a viewer, and send a reaction back to yourself. By the end you know the whole loop: write, present, follow, react, replay.

## What you'll need

- Bun 1.3+ and a checkout of this repository ([development](../development.md))
- A desktop browser. A phone on the same Wi-Fi is a bonus.

## Step 1: Start eigen.beam

```bash
bun install
bun run dev
```

Open `http://localhost:5173`. To join from your phone later, start with `bun run dev -- --host` instead and use the network URL Vite prints.

## Step 2: Write the deck

Open `http://localhost:5173/new`. The page starts with a sample deck. Click **Advanced** to show the Markdown editor, then replace its content with this:

```markdown
Kick-off
# One screen per person
No projector needed. You lead, everyone follows.
notes: Ask how many people are in the room.

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

The phone preview on the right now shows "One screen per person" and `1 / 4`. The **Ready Check** below the editor reports `4 Slides erkannt` and flags dense slides. Type `First deck` into the **Titel optional** field.

Each `---` starts a slide. `type:` picks a layout, `notes:` stays private and `++` lines appear one by one. The full format is in [deck syntax](../deck-syntax.md).

## Step 3: Go live

Click **4 Folien live starten →** below the Ready Check. eigen.beam saves the deck, creates a room and opens the presenter remote at `/present/<roomId>`. You see the first slide, your note under **NOTES**, and **Weiter** / **← Zurück**.

## Step 4: Join as a viewer

In the remote, open **Join**. Copy the audience link (`/v/<roomId>`) into a second browser window, or scan the QR code with your phone.

The viewer shows "Kick-off · One screen per person", the same slide as the remote. The remote's header switches to **● 1 live**.

## Step 5: Drive the room

Click **Weiter** in the remote. The viewer jumps to the `8` slide within a moment. Click **Weiter** twice more to reach "What happens next".

On the viewer, tap the right half of the slide: "Open the link" appears. Tap twice more for the other two items. Reveals are per viewer; the presenter moves slides, each viewer reveals points at their own pace.

## Step 6: Talk back

On the viewer, open **Optionen**. Tap **👍 Resoniert**, then **Merken**. Tap **Frage stellen**, type `Can I try this tomorrow?` and **Senden**.

In the remote, click **Coach öffnen**. The coach panel counts **1 dabei**, **1 Fragen**, **1 Merker** and lists the question, the bookmark and the reaction on slide 4. The panel stays closed by default so the remote is calm while you talk.

Now close the sheet and tap the left half of the viewer slide twice to go back. A **LIVE — zur aktuellen Folie** button appears; tap it to return. The presenter never sees where viewers reread.

## Step 7: Look at the replay

Open `http://localhost:5173/replay/<roomId>` (same ID as in the remote's URL). The **Session Summary** names slide 4 as the one that landed, with one reaction, one question and one bookmark. **Details öffnen** adds the slide heatmap, a deck v2 draft, the session coach and a follow-up mail. The question counts, but its text is not shown: replays are shareable, questions are not.

In local dev, replays live in memory and vanish when you stop the server. A production instance stores them in Postgres ([deployment](../deployment.md#environment)).

## What you built

You wrote a deck in the [deck syntax](../deck-syntax.md), presented it from the remote, followed it as a viewer, sent reactions, a bookmark and a question, and read the replay. That is the full eigen.beam loop.

Next:

- [Live sessions](../live-sessions.md): what each screen shows and the limits
- [How to protect a room with a PIN](../how-to/protect-a-room-with-a-pin.md)
- [How to import PDF, PowerPoint or voice](../how-to/import-content.md)
- [How to share and export a deck](../how-to/share-and-export.md)
- [Tutorial: turn a session into follow-up](replay-to-follow-up.md)
