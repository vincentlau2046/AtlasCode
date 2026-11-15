# Atlas Family Platform / AtlasWeb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the Atlas family for a shared AtlasWeb platform without changing the AtlasCode mainline before the 0.1.106 S3b production cut, then establish AtlasWeb as an independent platform repository with Code, Office, and Comic product lanes.

**Architecture:** AtlasCode remains the owner of `src/kernel`, the headless contract, protocol/schema semantics, and the AtlasCode product. After `0.1.106` S3b production PASS, AtlasWeb becomes an independent repository containing the Web shell, host, mode/brand system, and product bundles. Office and Comic begin as independent packages/lanes inside AtlasWeb and split into repositories only when their release and ownership boundaries justify it.

**Tech Stack:** Existing AtlasCode TypeScript/Bun workspace; Zod schemas in the existing kernel/shared domain; React/Vite/Cordis-derived Web packages from DeepSeek Harness `dsh-v0.2.2-rc.2`; Bun unit tests; repository-local release gate and compatibility manifests.

**Spec:** `docs/superpowers/specs/2026-11-13-atlas-family-platform-design.md`

## Global Constraints

- Before `0.1.106` S3b production PASS, work is read-only preparation: no AtlasWeb source tree, Web-specific kernel behavior, TUI/engine changes, or release-chain changes.
- The foundation cut requires S3b seam-name negative assertions, zero TUI escapes, a passing AtlasWeb compatibility scanner, and stable read-only `session list/replay/follow` controller behavior.
- AtlasWeb may consume only UI-neutral exports from `src/kernel`; it must not import `src/tui`, `src/engine`, or private UI implementations.
- Kernel/shared remains the single semantic source for protocol/schema; do not create a parallel Web schema.
- Kernel headless contract contains approval event emission, decision submission, and diff/deliverable data projections; approval UI, diff review interaction, terminal presentation, layout, and product visuals remain in host/renderer.
- Host must not read product data or configuration directories directly; all state access goes through the product kernel headless contract.
- Shared protocol v0 must remain Code-neutral; terminal/bash and other Code-only concepts belong to the Code bundle, not the shared schema.
- Foundation defaults to browser/WebView and Atlas host in separate processes, with the product kernel instance in-process with the host; protocol v0 remains transport-neutral for a later cross-process adapter.
- AtlasOffice and AtlasComic are product packages/bundles and lanes initially, not permanent Git branches or mandatory independent repositories.
- Every family version records repository commit, package version, protocol version, and per-product `configDirName`.
- P0 uses designated-only, zero-write-real-environment, fail-closed, release-governance, and Atlas-review rules.

## Review Focus

- A compatibility scan accidentally permits a relative import through a non-obvious path into `src/tui`, `src/engine`, or a private UI module; test nested relative imports and aliases in the boundary test owned by Task 2.
- A host controller reads `~/.atlas-*` directly instead of going through the kernel contract; test forbidden filesystem access in the host-state guard owned by Task 3.
- A protocol schema silently acquires Code-only terminal/bash/tool fields; test Code-neutral schema inventory in the protocol review owned by Task 3.
- The family manifest points to individually valid commits that are not a tested compatible combination; test manifest validation and protocol/version matching in Task 4.
- A foundation cut is attempted before S3b evidence is complete or from a dirty/shared checkout; test the readiness checklist and clean-worktree guard in Task 4.

---

## Program decomposition

This is a program-level plan. The implementation phases are intentionally separated into follow-up execution plans because P0 preparation, AtlasWeb repository creation, Code Web, and Office/Comic product lanes have independent review gates:

1. P0 read-only preparation in the current AtlasCode repository;
2. foundation cut and AtlasWeb repository bootstrap after `0.1.106` PASS;
3. AtlasCode Web platform and Code bundle;
4. Office/Comic dogfood and possible later repository extraction.

No later phase starts by assumption; each phase consumes the previous phase's evidence and compatibility manifest.

### Task 1: Record the Atlas family Git topology and roadmap

**Files:**
- Create: `docs/products/atlas-family-roadmap.md`
- Create: `docs/products/atlascode/README.md`
- Create: `docs/products/atlasweb/README.md`
- Create: `docs/products/atlasoffice/README.md`
- Create: `docs/products/atlascomic/README.md`
- Modify: `docs/superpowers/specs/2026-11-13-atlas-family-platform-design.md` only if the approved design gains a clarified governance rule

**Interfaces:**
- Consumes: approved platform design; current `origin`/`gitcode` mirror roles; current `master` and 0.1.106 S3b state.
- Produces: a human-readable family roadmap and lane-owned document index. The roadmap must distinguish repository, package, lane, worktree, release tag, and compatibility matrix.

- [ ] **Step 1: Write the roadmap structure test**

Create a documentation validation test or repository check that requires the roadmap to contain: current phase, foundation cut condition, repository map, product lanes, protocol version, per-product `configDirName`, blockers, evidence links, and rollback references.

- [ ] **Step 2: Run the documentation check before content exists**

Run the narrow Bun test/check. Expected: FAIL because the roadmap and lane documents are not present or required sections are absent.

- [ ] **Step 3: Write the roadmap and lane index documents**

Record:

- `AtlasCode` as the current kernel/Code source repository;
- GitHub as the primary development remote and GitCode as mirror/publishing surface;
- `AtlasWeb` as the post-0.1.106 independent platform repository;
- Office/Comic as AtlasWeb packages/lanes initially;
- no permanent `atlasoffice`, `atlascomic`, or `atlasweb` Git branches;
- `0.1.106` S3b production PASS as the foundation cut;
- default post-cut choice: AtlasWeb foundation first when both Web compatibility and Office dogfood are ready;
- the machine-readable family manifest fields and the document links for each lane.

- [ ] **Step 4: Run the documentation check**

Run the narrow check again. Expected: PASS with all required sections and links present.

- [ ] **Step 5: Commit the documentation-only change**

Use a docs-only commit on the designated mainline documentation lane; do not alter runtime code or create AtlasWeb source directories.

### Task 2: Add the read-only AtlasWeb kernel-boundary compatibility scanner

**Files:**
- Create: `scripts/atlasweb-kernel-boundary-scan.ts`
- Create: `tests/unit/atlasweb-kernel-boundary.test.ts`
- Modify: `package.json` only to add a non-mutating check command if the existing script conventions require it

**Interfaces:**
- Consumes: a repository root and a list of AtlasWeb candidate source roots.
- Produces: `scanAtlasWebKernelBoundary(input): { allowed: boolean; violations: Array<{ importer: string; specifier: string; resolved?: string; reason: string }> }`.
- The scanner must be read-only, deterministic, and fail closed on unresolved local imports that could conceal a forbidden target.

- [ ] **Step 1: Write failing boundary tests**

Cover:

- a permitted import from `src/kernel`;
- a forbidden direct import from `src/tui`;
- a forbidden nested relative import resolving into `src/engine`;
- a forbidden alias/private UI import;
- an unresolved local import producing a violation instead of being silently ignored;
- an external package import remaining allowed.

- [ ] **Step 2: Run the focused test**

Run: `bun test tests/unit/atlasweb-kernel-boundary.test.ts`

Expected: FAIL because the scanner is not implemented.

- [ ] **Step 3: Implement `scanAtlasWebKernelBoundary`**

Resolve TypeScript/TSX local imports from the candidate roots, classify only UI-neutral `src/kernel`/approved shared exports as allowed, reject `src/tui`, `src/engine`, private UI paths, and unresolved local targets, and never write files or mutate the checkout.

- [ ] **Step 4: Run the focused test**

Run the same command. Expected: PASS with violations listed deterministically and no filesystem writes.

- [ ] **Step 5: Add the scanner to the P0 readiness command**

Expose a clearly named, non-mutating command that future AtlasWeb CI can invoke against the AtlasCode foundation commit.

- [ ] **Step 6: Commit the scanner and tests**

Commit only the scanner, its tests, and the minimal command wiring; do not add AtlasWeb application code.

### Task 3: Define the headless contract inventory and Code-neutral review gates

**Files:**
- Create: `docs/products/atlasweb/protocol-v0-inventory.md`
- Create: `tests/unit/atlas-headless-contract-boundary.test.ts`
- Create: `tests/unit/atlas-host-state-access.test.ts`
- Modify: `src/kernel/entrypoints/sdk/coreSchemas.ts` only if the inventory proves an existing schema must be extended; otherwise leave it unchanged

**Interfaces:**
- Consumes: existing kernel/shared schemas, S3b export boundaries, and the Office third-consumer list.
- Produces: a v0 inventory separating kernel facts/commands from host/renderer interaction, plus tests that reject direct product-directory access and Code-only concepts in shared protocol declarations.

- [ ] **Step 1: Write failing contract-inventory tests**

Pin the two-way split:

- kernel/shared: approval request event emission, decision submission, diff/deliverable data projection, session facts and commands;
- host/renderer: approval UI, diff review interaction, terminal display/interaction, layout, and product visuals.

Also assert that shared declarations do not contain terminal/bash or Code-only tool concepts.

- [ ] **Step 2: Write failing host-state access tests**

Create a test fixture that fails if a future host/controller path reads `~/.atlas`, `~/.atlas-office`, or `~/.atlas-comic` directly instead of calling the product kernel contract.

- [ ] **Step 3: Run both focused tests**

Run:

```sh
bun test tests/unit/atlas-headless-contract-boundary.test.ts tests/unit/atlas-host-state-access.test.ts
```

Expected: FAIL until the inventory and guards are present.

- [ ] **Step 4: Write the protocol v0 inventory**

Document exact event/command/data-projection ownership, the transport-neutral envelope fields (`schemaVersion`, `generation`), the Code-neutral rule, the in-process foundation adapter, and the future cross-process adapter seam. Do not create a parallel schema source.

- [ ] **Step 5: Implement the narrow guards**

Implement only the read-only/static checks needed to protect the inventory. If an existing kernel schema needs a real extension, route it through the existing Zod source and generated type process; do not introduce a Web-owned duplicate.

- [ ] **Step 6: Run both focused tests**

Expected: PASS, with forbidden direct state access and Code-first shared schema reported fail-closed.

- [ ] **Step 7: Commit the contract inventory and guards**

Commit docs/tests and any required existing-schema extension as one reviewable contract-boundary change.

### Task 4: Create the 0.1.106 foundation-readiness and family-manifest gate

**Files:**
- Create: `scripts/atlas-family-foundation-readiness.ts`
- Create: `tests/unit/atlas-family-foundation-readiness.test.ts`
- Create: `docs/products/atlasweb/foundation-readiness.md`
- Create: `docs/products/atlas-family-manifest.schema.yaml`

**Interfaces:**
- Consumes: current Git commit/worktree state, S3b gate evidence, Task 2 scanner result, Task 3 contract review, and the documented session read-only controller evidence.
- Produces: `evaluateFoundationReadiness(input): { releasable: boolean; reasons: string[]; evidence: Record<string, string> }` and a machine-readable manifest schema for repo commits, package versions, protocol, and product config directories.

- [ ] **Step 1: Write failing readiness tests**

Cover:

- dirty/shared checkout rejects readiness;
- missing 0.1.106 S3b production PASS rejects readiness;
- nonzero TUI escape rejects readiness;
- scanner violation rejects readiness;
- missing Code-neutral protocol review rejects readiness;
- all evidence present and matching returns `releasable: true`.

- [ ] **Step 2: Run the focused test**

Run: `bun test tests/unit/atlas-family-foundation-readiness.test.ts`

Expected: FAIL because the evaluator and manifest schema are absent.

- [ ] **Step 3: Implement the fail-closed evaluator**

Require every foundation predicate; never infer a PASS from missing evidence. Persist only evidence references and result state, not product data or secrets.

- [ ] **Step 4: Write the readiness document and manifest schema**

The readiness document must name the exact 0.1.106 tag/commit once available, S3b evidence, scanner result, protocol review, session controller proof, and rollback point. The manifest schema must include `schemaVersion`, kernel repo/commit/package, Web repo/commit/platform, product package versions, `configDirName`, and protocol name/version.

- [ ] **Step 5: Run the focused test**

Expected: PASS for complete evidence and fail-closed for every missing/negative predicate.

- [ ] **Step 6: Commit P0 readiness assets**

Commit the evaluator, tests, readiness template, and manifest schema without creating the AtlasWeb repository or changing AtlasCode runtime behavior.

### Task 5: Execute the foundation cut after 0.1.106 PASS

**Files:**
- Create in a new repository after the gate: `AtlasWeb/apps/atlasweb/`
- Create in the new repository: `AtlasWeb/packages/web-shell/`, `AtlasWeb/packages/web-host/`, `AtlasWeb/packages/web-brand/`, `AtlasWeb/packages/web-mode/`, `AtlasWeb/packages/web-code/`
- Create in the new repository: `AtlasWeb/package.json`, `AtlasWeb/pnpm-workspace.yaml`, `AtlasWeb/README.md`, `AtlasWeb/compatibility.yaml`
- Modify in AtlasCode only through the approved release path: the package publication metadata for `kernel-contract` if required by the readiness decision

**Interfaces:**
- Consumes: the exact 0.1.106 production tag/commit, protocol v0 inventory, foundation readiness result, and published AtlasCode contract package.
- Produces: an independent AtlasWeb repository with a minimal buildable app, a pinned kernel compatibility entry, and no copied AtlasCode kernel source.

- [ ] **Step 1: Verify the cut evidence**

Run the readiness evaluator against the exact 0.1.106 production commit. Expected: `releasable: true`; otherwise stop without creating the formal foundation.

- [ ] **Step 2: Create the AtlasWeb repository from the approved foundation procedure**

Initialize the new repository, preserve the DeepSeek Harness MIT notices for copied code, pin the dsh baseline tag, and record the AtlasCode foundation commit and protocol version. Do not copy `src/kernel` into AtlasWeb.

- [ ] **Step 3: Add the minimal package/app skeleton**

Create the shell/host/brand/mode/Code package boundaries and `apps/atlasweb`; make the app consume the published contract package and expose compatibility metadata.

- [ ] **Step 4: Add the independent repository checks**

Run the kernel-boundary scanner against AtlasWeb source, verify no direct product-directory reads, and verify the compatibility manifest matches the pinned AtlasCode package/protocol.

- [ ] **Step 5: Commit and tag the foundation**

Commit the repository bootstrap and create the first AtlasWeb platform tag only after the foundation gate and independent repository checks pass.

### Task 6: Build the AtlasWeb shell and AtlasCode Web bundle

**Files:**
- Modify in AtlasWeb: `packages/web-shell/*`, `packages/web-host/*`, `packages/web-brand/*`, `packages/web-mode/*`, `packages/web-code/*`
- Create in AtlasWeb: package-level tests and app integration tests following the DeepSeek Harness package layout

**Interfaces:**
- Consumes: `@atlas/kernel-contract`, the approved dsh baseline `dsh-v0.2.2-rc.2`, and the AtlasWeb compatibility manifest.
- Produces: a platform-neutral shell, Atlas brand slots, Atlas-X mode selection, in-process host/kernel adapter, loopback authentication, and the Code bundle.

- [ ] **Step 1: Port shell package tests before changing behavior**

Bring over the relevant dsh boot/store/slots/renderer/theme tests and make the package names resolve under `@atlas/*` without adding product-specific shell assumptions.

- [ ] **Step 2: Implement the host/kernel adapter contract**

Keep the product kernel in-process with the host for foundation, route all state through the headless contract, and leave a transport-neutral protocol envelope for future cross-process use.

- [ ] **Step 3: Implement brand and mode slots**

Register Atlas brand slots independently of shell code; implement Code as the default `layout.main` provider and persist the selected product `configDirName`/mode without mixing product state.

- [ ] **Step 4: Implement read-only Code surfaces first**

Deliver session list/search/replay/follow and the shared session projection before prompt/queue/cancel/approval interactivity.

- [ ] **Step 5: Run the platform and compatibility gate**

Verify shell boot, required-plugin failure visibility, kernel-boundary scanner, host-state guard, protocol compatibility, and TUI standing regression.

- [ ] **Step 6: Commit and tag the first Code Web platform release**

Publish the platform and Code bundle versions separately and update the family manifest with exact commits and compatibility ranges.

### Task 7: Add Office and Comic product lanes without duplicating the platform

**Files:**
- Modify in AtlasWeb: `packages/web-office/*`, `packages/web-comic/*`, product bundle manifests, family manifest
- Create in AtlasWeb: Office document-first renderer/controller tests; Comic canvas-first/storyboard renderer/controller tests
- Modify only through the product lane: `docs/products/atlasoffice/*`, `docs/products/atlascomic/*`

**Interfaces:**
- Consumes: AtlasWeb shell/host/mode contracts, `@atlas/kernel-contract`, Office S2 compose evidence, and Code-neutral protocol review.
- Produces: Office and Comic bundles with independent domain controllers/renderers, without copying the shell or kernel.

- [ ] **Step 1: Write failing product-shape tests**

Assert that Office registers a document-first `layout.main` provider and Comic registers a canvas/storyboard-first provider; Chat must remain Code bundle-owned rather than platform-owned.

- [ ] **Step 2: Implement Office bundle and renderer**

Add document preview, artifact/deliverable projections, and Office-specific interaction in the Office host/renderer domain while reusing the platform shell and headless facts.

- [ ] **Step 3: Implement Comic bundle and renderer**

Add storyboard/panel and image-generation job projections in the Comic product domain while reusing the platform shell and headless facts.

- [ ] **Step 4: Run the third-consumer contract gate**

Verify Office or Comic consumes the same headless contract, the shared schema remains Code-neutral, product config directories remain isolated, and no platform duplication appears.

- [ ] **Step 5: Decide whether a product repository split is justified**

Use release cadence, owner, CI scale, repository size, and external contribution needs as explicit criteria; keep the product package in AtlasWeb if none are met.

- [ ] **Step 6: Update family manifest and product roadmaps**

Record package/repository commits, protocol version, `configDirName`, gate verdict, rollback point, and compatibility ranges.

## Execution gates

- **Gate P0:** Tasks 1–4 complete; no AtlasWeb source repository; current AtlasCode runtime and S3b gate untouched.
- **Gate Foundation:** exact 0.1.106 S3b production PASS plus Task 4 `releasable: true`; only then execute Task 5.
- **Gate Code Web:** AtlasWeb shell and Code read-only surface pass boundary, state-source, protocol, and TUI standing checks before interactive work.
- **Gate Product:** Office/Comic consumes the shared contract and proves its own main-workspace renderer before any product repository split.

## Self-review

- The plan covers the spec's current Git topology, foundation timing, repository/package distinction, no-permanent-product-branch rule, kernel boundary, protocol single source, process topology, host state source, Code-neutral schema, product lanes, manifest fields, and documentation aggregation.
- P0 tasks are read-only with respect to runtime behavior; later tasks are explicitly gated on the 0.1.106 production result.
- The exact future AtlasWeb implementation is intentionally not mixed into the current AtlasCode checkout; Task 5 creates it only after the foundation gate.
- Office and Comic are independently testable product lanes, but the plan does not force premature repository splits.
- No subagent execution or code implementation is authorized by this plan; an execution method must be chosen after plan review.
