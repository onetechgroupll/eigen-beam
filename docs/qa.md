# QA Evidence and Mobile Screenshots

Mobile QA runs write reports and screenshots to `reports/` locally (git-ignored). The README uses curated screenshots copied into `docs/assets/readme/` so the front door stays stable even as raw QA reports accumulate.

## Curated README assets

| Asset | Source surface |
|---|---|
| `docs/assets/readme/presenter-remote.png` | Presenter remote on iPhone WebKit dark profile |
| `docs/assets/readme/viewer-live.png` | Viewer live surface |
| `docs/assets/readme/authoring-ready-check.png` | Authoring + Import Studio + Ready Check |
| `docs/assets/readme/replay-command-center.png` | Replay command center |
| `docs/assets/readme/library-remote.png` | Account/library launch surface |

## When to refresh screenshots

Refresh curated assets when one of these changes materially:

- presenter remote layout;
- viewer live chrome/options surface;
- authoring/import/Ready Check layout;
- replay command center;
- account/library launch cards;
- color system or typography.

## Manual review checklist

After Mobile QA passes, inspect screenshots for:

- sticky controls covering content;
- tap targets below 44px;
- bottom safe-area clipping;
- unreadable text in dark/light mode;
- long URLs or code blocks escaping their container;
- content-first principle violations where chrome competes with the slide.
