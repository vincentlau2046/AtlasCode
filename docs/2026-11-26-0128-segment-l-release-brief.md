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

## §6 L4 执行记录（2026-11-26，atlas-mainline-f4 job 9d1c80df 亲执）

1. **执行前全项验真**：staging tgz sha256 `ebde147c…` 复算字节全等；解包
   134 entries；package.json name/version/尾换行 ✓；carrier json 四值与
   §5A 移交逐字吻合；cli.js 18,239,436 B sha256 `45259d7d…`（**变** vs
   0.1.127 `b4dfd8a4`/18,239,284——§3 预注册「预计零触碰」不兑现，勘正
   归因 = S1 wire 契约 kernel/protocol 加性 + engine/session 共享 chunk
   入 cli bundle 面；源面已 L3 全量 956 行审查无 finding；0.1.127 同形
   先例）；token 通道 npm whoami = `vincentlau2026` ✓。
2. **tag + 双远端**：`v0.1.128` @ `21d53370`（release `05e5dd76` 之上
   docs-only 回执链，零产品码）；origin master `f44749d1..21d53370` +
   tag 新推；gitcode master `07c74122..21d53370` + tag（hooks PASSED）。
3. **npm 主面**：staging tgz 同源直发（复制后 sha 复核 `ebde147c…` 再
   publish）→ `+ @atlasharness/atlascode@0.1.128`，shasum `f3c4b22a…` ·
   integrity `sha512-ZEneX6s…` · 134 files · unpacked 19.1MB。
4. **镜像双发**：staging 解包 → package.json 字节外科仅改 name（str.replace
   断言 count==1、尾换行保留、非 json.dump）→ repack
   `atlaswork-atlascode-0.1.128.tgz`（134 files）→ 发布前复验：name/
   version/尾换行 ✓ + cli.js sha256 `45259d7d…` 与 staging 字节恒等 ✓ +
   全树 diff 唯一 package.json ✓ → publish `+ @atlaswork/atlascode@0.1.128`，
   shasum `ede314c5…` · integrity `sha512-Bo9MNthf…`。
5. **packument 验真三步**：主面即时可见 latest=0.1.128 + 四值落档（SRI
   v0.1.128.md）；镜像面 12 polls×15s（~3min 传播延迟，0.1.125/127 同形）
   后可见 latest=0.1.128 + 四值（unpackedSize 19,087,349 = Δ3B name 行差）；
   round-trip 直下 sha256 双 MATCH——主面 `ebde147c…` = staging 字节全等，
   镜像 `e6914537…` = mirror repack 字节全等。
6. **通道注记**：publish = `npm publish ./<tgz> --registry
   https://registry.npmjs.org --userconfig <temp .npmrc chmod 600> --access
   public`（未走 0.1.127 pin-npmjs-dns.js 封装形态；通道 https 证书锚定 +
   packument round-trip sha 复核兜底，实况记录）；temp .npmrc 发布验真后
   即清，token 未入仓未打印。
7. **L5**：SRI `docs/sri/v0.1.128.md` 落档（四值 + 镜像节 + Δ账按实况
   含 executionSha256/cli.js 双偏离归因 + carrier↔bundle 字节互证）。
   后续：L6 候 e2e 单信号（生产 lane + §K 登记 registry 实发制品重跑 S3
   腿）；L7 归 Main（AtlasWeb pin bump 0.1.127→0.1.128 + 格 I 三元同步，
   sha 取 registry 实发制品）。

## §7 L7 执行回执（2026-11-27，Main）——段 L 全链终态

- **前置核**：L6 生产 lane PASS（user-e2e 判定单
  `user-e2e/reports/r-20261126-prodlane-128.md`：双 org registry 直下
  sha256 双 MATCH + SRI 四值即验锚全 MATCH + §K registry 实发 0.1.128
  重跑 S3 腿 39/39 GREEN + 安装车道 bin 真跑 0.1.128）。
- **真实配对链实测（registry 直下沙箱三腿逐字节）**：upgrade 腿
  `npm install @atlaswork/atlascode@0.1.128` → cli.js sha256
  `45259d7d…`（SRI 逐字，runtime `85e9b293…` / execution `5c8c095e…`
  同验）→ downgrade 腿装 0.1.127 → cli.js `b4dfd8a4…`（在案锚逐字）
  → 升回 0.1.128 恒等。
- **格 I 三元同步一 commit**：AtlasWeb `4f892ab`——双 package.json +
  lockfile pin 0.1.127→0.1.128 + gateTruthTable EXPECTED 重锚
  （upgrade `45259d7d0d1e1e2b` / downgrade `b4dfd8a415687936`）+
  `gezi-i.json` 重出证（date 2026-11-26 / reportCommit `6b75219` =
  F6-PAGE S2 消费波 commit / suites host 113 · e2e 54 双 0 fail，e2e
  +1 skip 为 lane 门控支）+ gateTruthTable.test.ts pin 断言同步。
- **旧锚销项负腿**：bump 前套件 2 fail = pin 对表行预期形（§5A 实录
  npmPackage 两腿），bump+commit 后自愈 GREEN——f4 先例形（0.1.127
  3 fail）本波 2 fail 同族。
- **终验**：AtlasWeb 全仓 `FORCE_COLOR=3 bun test` = **517 pass /
  1 skip / 0 fail**（68 files；唯一 pre-commit 红 = 格 J clean-candidate
  行按设计，commit 后自愈）；push origin main `3aba08d..4f892ab`
  ALIGNED（含 S2 6b75219 等 13 提交一并出清）。
- **段 L 终态**：L1–L7 全闭环——呈批 f44749d1 → 批复 6a0407c9 → 勘正
  81f6276c → L1 05e5dd76 → L4/L5 @985957fb（双 org published）→ L6
  prodlane PASS → L7 4f892ab。F6-PAGE 销项呈报候 f4（措辞 §B 登记②：
  接口格 + e2e fetch 腿达成、UI 消费登记未销）。

## §8 段 L 终态节 + F6-PAGE 波收口（2026-11-27）

- **§N 终采认 PASS @c58952ea**（Atlasweb-F4 本库落档 + f4 补推双远端
  origin+gitcode ALIGNED）：§M 四面独立复核（L6 registry 重跑 39/39 +
  L7 三元同步 + cli.js 勘正采记 + worktree 清理核真）。
- **a5 挂账行翻转 @ AtlasWeb 9e55e5d**（已推 origin main
  4f892ab..9e55e5d）：F6-PAGE 行「未通过（挂账维持）」→「已销
  （2026-11-27）」，原格文本保留 + 翻转采记节——**产品总放行 F6-PAGE
  阻格清零**。
- **worktree 登记行销项**：双陈旧 worktree 已清（cherry 12/12 补丁
  等价 + 零脏面实证 @1ce14062 注记），bun test 发现面 tests/ 纯面归一。
- **工单 §0–§N 全链在档**（`docs/2026-11-25-f6-page-ticket.md`）。
- **未销面去向**：UI 消费 + list 分页 = 登记 UI 波候选，后续另立。
- 本呈批书至此终态封卷。
