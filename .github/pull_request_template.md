## Summary

<!-- What changed and why? -->

## Verification

<!-- Paste real commands and results. Do not write "not run" unless there is a concrete reason. -->

- [ ] `bun run check`
- [ ] `bun run verify:c1a`
- [ ] `bun run build`
- [ ] Browser/replay/ops smoke if app behavior changed
- [ ] Mobile QA Lab/screenshots if mobile UI changed

## Screenshots / artifacts

<!-- Add links or attach screenshots for UI/mobile changes. -->

## Security / public surface review

Check if this PR touches any public/security-sensitive surface:

- [ ] presenter/viewer/replay/share routes
- [ ] auth/session/cookies/PIN/Magic-Link
- [ ] imports/uploads/AI/MCP
- [ ] deck export/public serializers
- [ ] health/readiness/ops
- [ ] no secrets, bearer tokens, database URLs or magic links are included

Notes:

<!-- Explain any relevant security considerations. -->

## Deploy notes

<!-- Mention migrations/env changes, Railway deploy caveats, and whether live rooms would be interrupted. -->
