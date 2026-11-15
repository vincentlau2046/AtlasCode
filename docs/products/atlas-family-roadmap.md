# Atlas Family Roadmap

Status: P0 preparation; no AtlasWeb source repository before the AtlasCode 0.1.106 S3b production cut.

This is the family-level index for AtlasCode, AtlasWeb, AtlasOffice, and AtlasComic. It records version cuts and compatible repository/package combinations; it is not a cross-repository Git branch.

## S0 negotiation proposal (2026-11-15)

- [AtlasWeb S0 agreement proposal](atlasweb/2026-11-15-s0-agreement.md) — durable upstream/consumer findings, proposed staged gates, separate read-only/full-Code milestones, and pending amendments. The historical phase and assumptions below are not fresh implementation-readiness evidence; the proposal itself is not authorization.

> **Revision (2026-11-15, S0 agreement §8)**: the historical phases/anchors and the package-form/blocker statements below are the historical base and are accounted separately from the future bridge. Effective rule: cuts are recorded as actual commit/artifact pairings (see `atlas-family-pairing.schema.yaml` + manifest v2 `pairingRef`), and the staged G1 (implementation admission) / G2 (release readiness) gates of the S0 agreement §6 govern — the historical phase table alone authorizes nothing.

## Current phase

- **Current phase:** AtlasCode 0.1.106 S3b kernel-boundary closeout and read-only AtlasWeb preparation.
- **Current source repository:** `AtlasCode` (`origin` = GitHub development source; `gitcode` = GitCode mirror/publishing surface).
- **Current mainline:** `master`.
- **Current foundation candidate:** AtlasCode `0.1.106` after S3b production lane PASS.
- **Preparation rule:** before that PASS, only docs, compatibility scans, protocol inventory, and readiness evidence may be added; no AtlasWeb runtime source or Web-specific kernel behavior.

## Foundation cut

AtlasWeb foundation is releasable only after all of the following are true:

1. AtlasCode `0.1.106` S3b production lane is PASS;
2. S3b seam-name negative assertions pass;
3. TUI escape scan is zero;
4. the AtlasWeb compatibility scan proves that Web code consumes only UI-neutral `src/kernel`/shared exports;
5. protocol v0 is single-sourced from the existing kernel/shared schema domain;
6. protocol v0 passes Code-neutral review (terminal/bash and other Code-only concepts stay in the Code bundle);
7. read-only `session list/search/replay/follow` controller evidence is stable;
8. designated-only, zero-write-real-environment, and release-governance checks pass.

When both AtlasWeb compatibility and Office dogfood preparation are ready after this cut, AtlasWeb is the default first formal foundation. Office and Comic then enter through AtlasWeb bundles.

## Repository map

| Repository | Owns | First formal cut |
|---|---|---|
| `AtlasCode` | kernel, shared/headless contract, AtlasCode CLI/TUI/engine, Code product | `v0.1.106` kernel foundation |
| `AtlasWeb` | Web shell, host, mode, brand, Code/Office/Comic bundles | platform `0.1.0` after foundation |
| `AtlasOffice` | future optional split of Office domain package/bundle | only when independent release/owner/CI criteria pass |
| `AtlasComic` | future optional split of Comic domain package/bundle | only when independent release/owner/CI criteria pass |

AtlasOffice and AtlasComic start as independent packages/lanes inside AtlasWeb. They are not required to be independent repositories on day one.

## Product lanes

```text
AtlasCode lane   → AtlasCode repo: kernel + Code product
AtlasWeb lane    → AtlasWeb repo: shell + host + mode + shared UI
AtlasOffice lane → AtlasWeb/packages/web-office: document-first controller/renderer/bundle
AtlasComic lane  → AtlasWeb/packages/web-comic: canvas/storyboard controller/renderer/bundle
```

Products use short-lived feature/wave branches and isolated worktrees. There are no permanent `atlasweb`, `atlasoffice`, or `atlascomic` Git branches.

<!-- Revision (2026-11-15, S0 agreement §8): the package/version statements below are historical base; effective cuts are recorded as actual commit/artifact pairings (pairing evidence + manifest v2 pairingRef). -->

## Protocol version and package versions

The kernel semantic source remains in AtlasCode's existing kernel/shared domain. AtlasCode publishes the stable contract package consumed by AtlasWeb; AtlasWeb does not copy kernel schemas.

| Component | Initial version/cut | Compatibility fact |
|---|---|---|
| AtlasCode kernel | `0.1.106` foundation candidate | UI-neutral export boundary is the source of truth |
| Atlas headless protocol | `v0` | transport-neutral; Code-neutral shared schema |
| AtlasWeb platform | `0.1.0` after foundation | pins an AtlasCode commit and protocol v0 |
| AtlasCode Web bundle | `0.1.0` after platform | Chat/agent-first main work surface |
| AtlasOffice bundle | later | document-first main work surface |
| AtlasComic bundle | later | canvas/storyboard-first main work surface |

## Family manifest fields

Every verified family cut records these fields in a machine-readable manifest:

```yaml
schemaVersion: 1
kernel: { repo: AtlasCode, commit: <sha>, package: <version> }
web: { repo: AtlasWeb, commit: <sha>, platform: <version> }
products:
  code: { package: <version>, configDirName: ~/.atlas }
  office: { package: <version>, configDirName: ~/.atlas-office }
  comic: { package: <version>, configDirName: ~/.atlas-comic }
protocol: { name: atlas-headless, version: v0 }
```

`configDirName` is part of the product compatibility cut because host reuse/isolation depends on it.

## Blockers and dependencies

<!-- Revision (2026-11-15, S0 agreement §8): blocker states below are the historical base; the effective gate set is the staged G1/G2 pair (S0 agreement §6) plus real artifact/runtime evidence, not this table alone. -->

| Item | State | Dependency / next evidence |
|---|---|---|
| S3b production PASS | blocking | AtlasCode mainline release evidence |
| Kernel boundary scanner | P0 preparation | must be zero-escape and fail closed |
| Headless contract inventory | P0 preparation | must separate kernel facts from renderer interaction |
| AtlasWeb foundation | waiting | all foundation predicates above |
| Office dogfood | parallel preparation | third-consumer headless evidence |
| Comic dogfood | later preparation | canvas/storyboard consumer evidence |

## Evidence and Rollback

Each cut links to its gate report, production-lane report, compatibility scan, protocol review, and family manifest. The rollback point is the exact repository commit and package set recorded in that manifest; no family rollback relies on moving a shared cross-repository branch.

Detailed lane notes:

- [AtlasCode lane](atlascode/README.md)
- [AtlasWeb lane](atlasweb/README.md)
- [AtlasOffice lane](atlasoffice/README.md)
- [AtlasComic lane](atlascomic/README.md)
