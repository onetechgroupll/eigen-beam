# ADR 0005: One SvelteKit adapter-node service

Status: Accepted

## Context

eigen.beam needs server-rendered pages, JSON APIs, two SSE streams, an MCP endpoint and in-memory state (ADR 0002). Splitting these across services or running on serverless functions would break long-lived streams and shared memory.

## Decision

Everything runs in one long-lived Node process built with SvelteKit and `adapter-node`. Bun is the package manager and script runner; production runs `node build`. Alternatives considered: a pub/sub SaaS for the slide index (simpler, but adds a vendor and a second state source) and edge actors such as Durable Objects (elegant, but tied to one platform).

## Consequences

- One image to deploy anywhere that runs Node or Docker. Railway is used for the reference instance; nothing in the code depends on it.
- Single instance by design (see ADR 0002).
