# Privacy and Data Use

This project is a private productivity/product prototype. The goal is to keep live sessions useful without collecting unnecessary personal data.

## What is stored

Depending on environment mode:

- decks and public-safe slide data;
- replay sessions and event counts/types;
- follows/unsubscribe records;
- uploaded assets;
- account identity derived from Magic-Link email sessions;
- operational health/readiness status labels.

## What should not be stored or exposed publicly

- presenter tokens;
- MCP bearer tokens;
- raw provider API keys;
- database URLs;
- signed Magic-Link URLs;
- public replay copies of private speaker notes;
- owner IDs in public payloads;
- raw deck source in public exports.

## Viewer events

Viewer reactions, bookmarks, joins/reopens and question signals power the live presenter feed and replay summaries. Public replay/follow-up surfaces should remain public-safe and avoid unnecessary PII.

Free-text questions are treated as presenter-side content and should not be exposed on public viewer screens by default.

## Imports and AI/provider use

PDF/PPTX/voice/import and AI clarify paths may process user content. In production, import/AI endpoints require a signed user session before accepting content.

If external providers are configured, content may be sent to those providers according to the configured feature path. Keep provider credentials in environment variables only.

## MCP access

MCP tools can create/read/update decks, upload assets and start viewer rooms when authenticated. `create_room` returns viewer/replay links only and intentionally does not return presenter tokens.

## Operational telemetry

The app exposes secret-safe health/readiness endpoints. Readiness may reveal mode/status labels but must never return raw env values, credentials or bearer-token material.
