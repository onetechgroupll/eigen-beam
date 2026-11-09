# Design system

eigen.beam has its own visual identity, independent of any company design system. The rule above all others: **the content always comes first.** It must read well on any phone, in any light. The product stays memorable through discipline and one signature accent, not through layout tricks. Chrome whispers, content talks.

## Theme

The theme follows the viewer's `prefers-color-scheme`. Both palettes meet WCAG AA.

| Token | Dark | Light |
|---|---|---|
| Background | `#0b0b0c` | `#faf9f5` |
| Text | `#ffffff` | `#111111` |
| Muted | `#a6a6aa` | `#5c5c58` |
| Hairlines | `#2b2b2d` | `#d8d6cf` |
| Accent | `#c8f250` (lime) | `#c8f250`; the LIVE dot may use text black |

The lime accent is used sparingly: filled progress segments and the LIVE dot. It never carries meaning on its own; LIVE always has a text label.

## Type

- Clean grotesk (`system-ui` stack). Fluid sizes via `clamp()`: text scales with the viewport, never clips and wraps gracefully.
- Headlines around weight 780 with tight letter-spacing, vertically centred with generous margins. Supporting text is muted; eyebrow labels are small and letter-spaced.
- One idea per slide. A narrative arc of at most 15 slides.

## Chrome

- Segmented position progress as a 2px hairline at the very top: filled segments in the accent, the rest hairline grey. No auto-advance timer.
- A small `● LIVE` at the top right.
- Footer: `← back` (muted) and `n / N`.

## States

| State | What the viewer sees |
|---|---|
| Join / pre-start | Large `eigen.beam` wordmark and a calm "starting soon" |
| Live slide | The default layout above |
| Behind | After browsing back: `● LIVE — you are behind` plus a "jump to current slide" button (at least 44px) |
| Ended | "Presentation ended", plus a download CTA if enabled |
| Room gone (410) | A friendly screen instead of a blank error |
| Onboarding hint | Shown once per session: swipe back to re-read, you will snap back to the live slide |

## Responsive and accessibility

- `clamp()` typography and `safe-area-inset` padding; design for roughly 85% of the viewport because of mobile browser chrome; phone to tablet without clipping.
- Touch targets at least 44px. Keep text out of the edge tap zones.
- Colour is never the only carrier of meaning.

## README graphics

The animated graphics in the README use a different, neutral palette that matches the maintainer's GitHub profile (Geist and Space Mono, warm neutrals, blue link colour, lime only for LIVE). Source: [`tools/readme/build.py`](../tools/readme/build.py).
