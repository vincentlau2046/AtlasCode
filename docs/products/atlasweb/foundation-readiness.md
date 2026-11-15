# AtlasWeb Foundation Readiness

Status: preparation template; **not releasable** until AtlasCode `0.1.106` S3b production lane PASS.

This document is the evidence checklist for the formal AtlasWeb repository cut. It is intentionally separate from the runtime implementation and contains references only, not product data or secrets.

## Required evidence

| Predicate | Required evidence | State |
|---|---|---|
| Exact foundation commit | AtlasCode `0.1.106` production tag/commit | pending |
| S3b production PASS | gate and production-lane report | pending |
| S3b seam boundary | seam-name negative assertions | pending |
| TUI escape zero | kernel boundary/escape scan report | pending |
| AtlasWeb compatibility | `atlasweb:boundary-scan` result is allowed | pending |
| Code-neutral protocol | `protocol-v0-inventory.md` review and scanner result | pending |
| Read-only controller | session list/search/replay/follow proof | pending |
| Clean checkout | exact cut checkout is clean and isolated | pending |
| Rollback point | prior verified AtlasCode tag/package set | `v0.1.105` |

## Foundation topology

The first foundation uses a browser/WebView to Atlas host HTTP/WS boundary and an in-process product kernel adapter. The protocol v0 envelope remains transport-neutral for a later cross-process adapter.

The host must not read product data or config directories directly. It obtains state through the product kernel headless contract.

## Releasability rule

> **Revision (2026-11-15, S0 agreement §8)**: the rule below is split into two independent gates. **G1 — implementation admission** (`evaluateImplementationAdmission`, six evidence keys: user authorization, work-order audit pass, accurate S3b production evidence, isolation plan, single-source contract and gap review, upstream dependency/version plan) governs repository creation and the start of parallel development. **G2 — release readiness** (`evaluateFoundationReadiness`, unchanged, including the read-only controller predicate) keeps every release hard gate. `G1=true / G2=false` is a legal intermediate state; neither gate accepts missing evidence as a pass.

`releasable: true` is permitted only when every predicate is positive and every evidence reference is present. Missing evidence is not interpreted as a pass. A failed predicate blocks repository creation and the AtlasWeb foundation tag.

## Cut record

Fill these only after the gate:

- AtlasCode foundation commit: `pending`
- AtlasCode release/tag: `pending`
- Atlas headless protocol: `v0`
- AtlasWeb repository commit: `pending`
- AtlasWeb platform version: `pending`
- Family manifest: `pending`
- AtlasWeb rollback commit/tag: `pending`
