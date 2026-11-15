# AtlasCode lane

## Ownership

AtlasCode owns the kernel, shared/headless contract semantics, AtlasCode CLI/TUI/engine, and the Code product.

## Current cut

- Mainline: `master`
- Foundation candidate: `0.1.106` after S3b production lane PASS
- Contract source: existing `src/kernel` / shared schema domain
- Product config directory: `~/.atlas`

## Git rules

Use short-lived wave/feature branches and isolated worktrees. Do not create a permanent `atlasweb`, `atlasoffice`, or `atlascomic` branch in this repository. GitHub is the primary development source; GitCode is the mirror/publishing surface.

## AtlasWeb boundary

Before 0.1.106 PASS, AtlasWeb work in this repository is read-only preparation only. After the foundation cut, AtlasCode publishes the kernel contract consumed by the independent AtlasWeb repository. AtlasCode does not copy or own the Web shell.

## Evidence

A release must link its gate report, production-lane report, kernel boundary evidence, protocol version, and family manifest entry. Rollback uses the exact release tag/commit, not branch movement.
