# 段 L 呈批书 — 0.1.128候（F6-PAGE S1 内容分页公开接口发布段）

> **状态：候 f4 批复 + GATE-PASS 双在案**（硬门条款）。呈批时 gate 终态
> 在途——e2e S3 fetch 级判据腿（双锚 AtlasCode cfee67eb + AtlasWeb
> 6b75219，开工令 §H 在案）；GATE-PASS 判定单出即补录本档。

> 波：F6-PAGE S1——carrier replay 分页契约 + 装窗读路径（工单
> `docs/2026-11-25-f6-page-ticket.md`；§B 审计 3 必改修形 + §D/§F/§G
> 采认-复核-复判三环 @570f7491 + §J 合并采记 @477709a1）。

## §1 发布内容（产品码 3 commits，becf0458..b5a2dfd7）

| commit | 内容 |
|---|---|
| becf0458 | fix(ci): pack d.ts symbol-face test 读 runtimeEntry.d.ts（entry split 后续，PR #6，test-only 随车） |
| 2a353f7e | F6-PAGE S1 replay 分页装窗读路径 + wire 契约加性（feat） |
| b5a2dfd7 | 审计必改①修形：replay skeleton 保留 subtype+snipMetadata（compact/snip 剪枝变换修复） |

版本：`0.1.127 → 0.1.128`。用户面摘要：>帽转录 replay 内容分页公开接口
（wire 加性——`pageToken`/`pageSize`/`hasMore`/`nextPageToken`，**键在场
语义**：无分页参 = request 零分页键，旧客户端逐字节零行为变更；装载期
relink/snip 变换分页路径与全量路径同体复用，A2 拼接恒等含 compact/snip
会话）。range 内其余 commits 均为 f6-page/wave1 docs 沿革（零产品码）。

**完整重验（F3 判据）**：master @cfee67eb 全量 `FORCE_COLOR=3 bun test
--isolate tests/` = **17635 pass / 1 fail**（唯一红 =
`tests/func/atlascode-tui-pty-probe.test.ts` pty-live-alpha——TUI 真 LLM
live 环境基线，与分页改动无涉，§D 判词已坐实同基线）；三件套 128/128 +
`bun run typecheck` 0 + push origin ALIGNED。

## §2 执行序列（GATE-PASS + f4 批复双在案后）

- **L1 release prep 落码**：`rm -rf dist/web-session-runtime` → package.json
  bump 0.1.128 + CHANGELOG `v0.1.128` 节 + atlaswebCarrier 元数据重算 →
  release commit（路径限定）。
- **L2 build 紧贴 publish**：release commit 后跑 prepublishOnly 5 步链 →
  staging tgz（Δ 账按 §3 预注册逐格核对）。
- **L3 push 安全审查补查**（先于任何 push）：2a353f7e/b5a2dfd7 两 commit
  全量 diff 补查（503 未覆盖；becf0458 已随 PR #6 审计）；有 finding 即停
  呈批改形。
- **L4 发布动作（候用户亲署）**：tag `v0.1.128` → push origin master+tag →
  gitcode 镜像双推（master+tags）→ npm publish（D-8 SOP：DNS-pin +
  `--registry https://registry.npmjs.org`）→ **@atlaswork 镜像双发**（同一
  staging tgz 仅改 name，禁独立重建）→ packument 验真三步。
- **L5 SRI 留档**：`docs/sri/v0.1.128.md` 四值 + atlaswebCarrier Δ账 +
  tree commit 记录 + 双 org tarball 值。
- **L6 生产 lane**：单信号 → e2e 同套判据 → 收口单 → Main → 用户。
- **L7（发布后，§J 定形序）**：AtlasWeb pin bump 0.1.127→0.1.128 + 格 I
  背书三元同步（gateTruthTable.ts EXPECTED + gezi-i.json + sha 前缀取
  registry 实发制品）一 commit；随回滚配对重测。

## §3 预注册形

1. **atlaswebCarrier 元数据**：字段形不变
   `{ product: 'atlascode', version: '0.1.128', runtimeSha256, executionSha256 }`
   （script `build:atlasweb-carrier` 已在格，prepublishOnly 第 5 步）。
2. **Δ 账预估**：`dist/web-session-runtime` runtimeSha256 **变**（S1 新模块
   engine/session/replayScan 入包 + readonlyRuntime wire 契约加性扩面——
   ReplaySessionRequest/Result 分页键 + hasMore/nextPageToken）；d.ts 树
   含 replayScan.d.ts（61→62 预计 +1）；executionSha256 预计**恒等**
   （execution subpath 零触碰——若打包器共享 chunk 致变，按实况报并注明
   归因）；cli.js 预计零触碰（S1 不触 TUI 面）；exports 面零新增（wire
   加性在既有 subpath 内）。
3. **镜像双发**：@atlasharness/atlascode + @atlaswork 同版本并行，同一
   staging tgz 重 name 打包，禁独立重建。
4. **回退形**：publish 后 gate/生产 lane RED → 按硬门条款补丁版 + npm
   deprecate 标注，无豁免面。

## §4 验收件（发布后）

gate 判定单终态路径 + f4 批复记录 + SRI v0.1.128.md（runtimeSha256 变值 +
executionSha256 实况对 §3 预注册）+ packument 双 org 验真输出 + 生产 lane
收口单 + AtlasWeb pin bump / 格 I 三元同步回执（L7）。
