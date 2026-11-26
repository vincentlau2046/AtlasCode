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
live 环境基线，与分页改动无涉，§D 判词已坐实同基线；f4 独立复跑逐字吻合
+ 单跑直证 322s 内部超时）；三件套 128/128 + `bun run typecheck` 0 +
push origin ALIGNED。

> **F3 扫描面口径注记（f4 §L 勘正令 @6a0407c9，2026-11-26）**：bun 1.4.4
> test 位置参数 = **子串过滤器非路径根**（f4 判别探针直证），上行命令有效
> 扫描面 = tests/ 512 文件 + 两枚陈旧 worktree（worktree-0.1.94-wdb 459 /
> worktree-0.1.90-w-opt-1 447）+ 零星 = 1426 文件（含 `wdb/` 等子串命中）；
> §D/§H 判词 6246–6248 = tests/ 纯面。两计数均真实、无套件回归、非矛盾。
> **全量判定准绳 = tests/ 纯面（合并后态 §H 附记 6248/8/2）**。
> **G7 判别帽勘正（§K 注记 1 折入）**：G7 判别帽 = `maxProjectionBytes`，
> 校正句——全量投影帽（4MiB）不施加于分页路径；页帽按页计。

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

## §5A L1–L3 执行回执（2026-11-26，Main）

- **前置**：勘正令折入 commit 81f6276c（§L 批复条件两件：F3 扫描面口径
  注记 + G7 判别帽校正句）。
- **L1**：release commit 05e5dd76（package.json bump 0.1.128 + CHANGELOG
  v0.1.128 节）。
- **L2**：prepublishOnly 5 步链 exit 0；`dist/atlasweb-carrier.json` =
  runtimeSha256 **85e9b293…（变，§3 预注册兑现——7e7e6f38 三版恒等打破）** /
  executionSha256 **5c8c095e…（变，§3 预注册「预计恒等」偏离）**。
  **偏离归因（已闭合）**：S1 计划外修形①②（已随 §J 采记）——d.ts barrel
  分支修形 + types.ts specifier 窄化（pack d.ts 消费闭包 557→61）改变两
  bundle 编译输出；且 engine/session 共享 chunk 使 replayScan 入 execution
  bundle（grep replayScan 1 处在品）；版本串注入排除（127/128 两 bundle
  均零版本串）。d.ts 树 Δ = +4/−4：replayPaging.d.ts + replayScan.d.ts
  各入两 bundle；execution 面 entry/executionOutlet/webExecutionV0.d.ts
  重复份修形②后只留 execution bundle（公共类型面完好——execution subpath
  types → web-session-runtime-execution/index.d.ts；wsrt runtimeEntry.d.ts
  在格 = becf0458 测试锚）。wsrt d.ts 总数 126 恒等。exports 面 4 subpath
  零新增 ✓。staging tgz `atlasharness-atlascode-0.1.128.tgz` sha256
  `ebde147cb77e4240a4b74d1aa2798f2edb821946e3e41f68212b36b916411b4f`
  （/home/vince/.claude/jobs/1b9594d7/tmp/；carrier json 在包内已验）。
- **L3 回执（无 finding）**：v0.1.127..b5a2dfd7 src+scripts 全量 diff
  956 行补查——敏感命中全部为分页协议 `pageToken` 命名字面（opaque replay
  游标编解码，非凭据）；新增行零密钥 / 零 exec·eval / 零网络端点 /
  零 child_process。becf0458 test-only 已随 PR #6 审计。

> **状态：L1–L3 完；L4 用户亲署已在案（§5，atlas-mainline-f4 session 亲键
> 2026-11-26）**——L4 执行单点 = atlas-mainline-f4（job 9d1c80df），本
> session（L1–L3 执行方）单信号移交 staging tgz + 验真链后不自执 L4。

## §5 L4 发布亲署（用户提前授权，2026-11-26 落档）

- **授权原文**：用户于 2026-11-26 在 atlas-mainline-f4 session（job 9d1c80df）亲键「**L4 发布亲署，我提前授权。**」——§2 L4 全范围（tag `v0.1.128` → push origin master+tag → gitcode 镜像双推 → npm publish `--registry https://registry.npmjs.org` → @atlaswork 镜像双发同 tgz 仅改 name → packument 验真）亲署在案。0.1.125 先例通路：用户亲键 = 有效亲署，peer 转达不构成——本节为原文落档，非转达。
- **条件面（授权非跳门）**：L4 执行仍以 **GATE-PASS + 呈批书批复双在案**为前置（§2 硬门条款照旧）；本亲署仅消除「候用户亲署」等待支。
- **执行单点**：L4 由 **atlas-mainline-f4（job 9d1c80df，持授权原文 session）亲执**——0.1.125 先例（Main 分类器面对 peer 转达不构成 publish 授权，f4 亲执通路成立）。段 L 现执行 session（L1 已落 05e5dd76）于 L2/L3 完成后**单信号移交 staging tgz + 验真链（§3 Δ账预注册）予执行单点**，不再自执 L4；并存 f4 角色 session 以本记录为执行单点指定，不得重复执行。
- L4 执行记录（tag/push/publish 回执/双 org 对表/round-trip 锚）随执行落档本档 §6。

## §6 L4 执行记录（执行时落档）

（候 GATE-PASS + L2/L3 移交）
