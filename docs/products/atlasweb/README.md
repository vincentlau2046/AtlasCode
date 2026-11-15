# AtlasWeb lane

## S0 negotiation proposal (2026-11-15)

See [S0 requirements, contract, responsibilities, and acceptance proposal](2026-11-15-s0-agreement.md). Upstream and consumer design feedback and the durable-draft difference review have passed; user approval and formal work-order audit remain pending. It records gaps in the historical assumptions below, including distribution and the repository-creation/controller gate cycle. This link does not amend the existing gate or authorize repository creation.

## Ownership

AtlasWeb is the future independent platform repository. It owns the Web shell, host, HTTP/WS/auth carrier, brand slots, Atlas-X mode mechanism, shared UI packages, and product bundles.

## Foundation gate

AtlasWeb is not a formal source repository before AtlasCode `0.1.106` S3b production PASS. Until then, this lane is limited to read-only compatibility scans, protocol inventory, design, and readiness evidence in the AtlasCode worktree.

After the cut, the repository shape is:

```text
AtlasWeb/
  apps/atlasweb/
  packages/web-shell/
  packages/web-host/
  packages/web-brand/
  packages/web-mode/
  packages/web-code/
  packages/web-office/
  packages/web-comic/
```

## Contract boundary

AtlasWeb consumes the AtlasCode-published kernel/headless contract. It must not copy kernel schemas or import TUI, engine, or private UI paths. The foundation host keeps the product kernel in-process while preserving a transport-neutral protocol v0 envelope for a future cross-process adapter.

## Product mode

Code is the first default mode. Office and Comic replace the `layout.main` slot through their own bundles; Chat is not a platform-level hard-coded main surface.

## Git and release

Use the AtlasWeb repository's own main branch, short-lived feature/wave branches, isolated worktrees, package versions, and platform tags. Record every release in the family manifest with the AtlasCode commit, protocol version, package versions, and product `configDirName` values.
