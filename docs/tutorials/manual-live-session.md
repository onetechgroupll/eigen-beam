# Tutorial: run a manual live session

This tutorial proves the core eigen.beam loop: presenter controls, viewer follows.

## Prerequisites

```bash
bun install
bun run check
bun run build
```

## Local development path

```bash
bun run dev
```

1. Open the local Vite URL.
2. Click **Live-Sync testen**.
3. Copy/open the viewer link from the presenter remote on a phone or second browser window.
4. Tap **Weiter** on the presenter remote.
5. Confirm the viewer advances with the presenter.

## Production-like local path

```bash
rm -rf build .svelte-kit/output .svelte-kit/generated
bun run build
ORIGIN=http://127.0.0.1:4316 \
EB_MAGIC_LINK_SECRET=local-smoke-secret \
EB_DATA_DIR=.data/manual-session \
EB_DECK_STORE=file \
EB_ACTIVITY_STORE=off \
EB_MAIL_PROVIDER=outbox \
PORT=4316 HOST=127.0.0.1 \
node build
```

Then open `http://127.0.0.1:4316` and repeat the same flow.

## Verification

```bash
EB_SMOKE_BASE=http://127.0.0.1:4316 bun run smoke:browser
```

Expected result:

```text
BROWSER SMOKE PASS — 7 checks.
```
