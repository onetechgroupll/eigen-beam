# Architecture Decision Records

Short records of the decisions that shape eigen.beam. Each one states the context, the decision and what it costs. They were distilled from the original product and engineering review (June 2026).

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-sse-not-websockets.md) | Server-Sent Events, not WebSockets, for live sync | Accepted |
| [0002](0002-in-memory-live-rooms.md) | Live rooms live in process memory | Accepted |
| [0003](0003-presenter-auth-httponly-cookie.md) | Presenter control via httpOnly cookie, never in URLs | Accepted |
| [0004](0004-content-first-mobile-design.md) | Content-first, phone-native 9:16 design | Accepted |
| [0005](0005-single-sveltekit-node-service.md) | One SvelteKit `adapter-node` service | Accepted |
| [0006](0006-heavy-work-off-the-live-path.md) | Import and AI work stays off the live path | Accepted |

## Writing a new ADR

Copy the structure of an existing record, take the next number and open it in the same PR as the change it justifies. Superseding a decision means a new ADR that links the old one; the old one gets `Status: Superseded by NNNN`.
