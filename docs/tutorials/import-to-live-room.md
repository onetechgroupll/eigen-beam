# Tutorial: import content and start a live room

This tutorial covers the authoring/import path.

## Steps

1. Open `/new`.
2. Use **Import Studio** for PDF/PPTX, voice or Markdown.
3. Check **READY CHECK** before launching.
4. Use quick fixes such as **Kürzen**, **Reveal vorschlagen** or **CTA ergänzen** when suggested.
5. Tap **Live starten**.
6. Verify that the presenter remote opens.

## Local verification

```bash
EB_SMOKE_BASE=http://127.0.0.1:4316 bun run smoke:browser
```

The browser smoke includes:

- authoring anchors;
- Ready Check visibility;
- broken-PDF negative path;
- `/new -> Live starten -> /present/:id`.

## Mobile QA

```bash
EB_MOBILE_QA_ENGINES=webkit \
EB_MOBILE_QA_PROFILES=iphone-15-pro-dark \
EB_MOBILE_QA_BASE=http://127.0.0.1:4316 \
EB_MOBILE_QA_OUT=reports/mobile-qa-lab-import-local \
bun run qa:mobile
```

Inspect the authoring screenshot for sticky-footer overlap, clipped controls and poor thumb ergonomics.
