# ADR 0004: Content-first, phone-native 9:16 design

Status: Accepted

## Context

The "screen" is a phone held at arm's length, in rooms with unknown light. Anything that is not the slide competes with it for attention. Interactive presentation tools tend to drift into dashboards, polls and quizzes.

## Decision

- Slides are 9:16, one idea per slide, ideally 5 to 12 and at most 15 per deck.
- Type is fluid (`clamp()`), never clips, respects safe areas. Touch targets are at least 44px.
- Chrome is minimal: a hairline progress bar, a small `● LIVE` label, a footer with "back" and `n / N`.
- The theme follows `prefers-color-scheme`. Both themes meet WCAG AA. A single lime accent (`#c8f250`) marks progress and the LIVE state; colour is never the only signal.
- Live features are overlays or asynchronous; they never become a panel next to the slide.
- Not building: a free-form WYSIWYG editor, heavy polls or quizzes, enterprise branding.

Details: [`../design-system.md`](../design-system.md).

## Consequences

- Imports from landscape decks need re-layout, which is lossy. That work happens before the session (ADR 0006).
- Feature requests that add on-screen chrome for viewers are declined by default.
