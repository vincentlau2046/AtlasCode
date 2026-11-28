# 挂账池排程单——六件 → W-FC 系四波（f4 排程，2026-11-28）

> 出处：F6-PAGE UI 消费工单 §9 收口裁定「挂账池维持（未排程）」六件 + 用户
> 2026-11-28 排程指令「那你现在排一下吧」。本单 = 波划分 + 载体映射 + 波序；
> 各波仍走既定制度（波前 §0 活码重核 + §5 审视记录 → 工单双门 → 双信号）。
> 排程依据 @ master `1c590aef`（0.1.130 发布链终态）。

## §1 波划分（六件 → 四波）

| 波 | 内容（挂账池原编号） | 版号候 | 域 |
|---|---|---|---|
| **W-FC-1** | ④ ledger 行为修（issue 前置拒绝 oversized 单 payload）+ ⑤ onActiveEvict 悬空接线 | **0.1.131** 候 | AtlasCode web-session-runtime（同文件族：cursorLedger.ts + follow.ts + readonlyRuntime.ts） |
| **W-FC-2** | ① follow 200 流内错形 UI 区分度 + ② `--workspace` 目录缺席静默接受加固（fail-closed 家族并池，§8-1 判词侧建议） | **零 AtlasCode 版号**（AtlasWeb 0.1.4 候走 AtlasWeb 发布链） | **域勘正（W-FC-1 收口后波前活码重核定谳，2026-11-28）**：①② 均 AtlasWeb 全域——① web-code 消费侧（controller 单一泛 error 面 + follow 订阅零区分消费）+ ② web-host `launchCli.ts:63-67`（`--workspace` 实址在 AtlasWeb 非 AtlasCode；对照 `--static` httpHost.ts:223 校验先例）；AtlasCode 侧零触碰 → L4 带不消耗 |
| **W-FC-3** | ⑥ g1 `toHaveCount` RED-face artifact 第三例（判别件口径修正——判别专用断言改 scrollUnion 权威口径落件） | **零版号** | AtlasWeb e2e 判别件（语义面——判别对象系 AtlasWeb e2e gate 资产）；落件实址 = AtlasCode `user-e2e/atlasweb-g-legs/`（域述勘正随收口，工单注记②） |
| **W-FC-4** | **⑦ carrier json 构建面再生核**（域勘正拆波：⑦ 由 ③ 波前检查项升独立波先行——波前已根因复现直证：`npm pack` 不跑 `prepublishOnly`，段 L pack→publish tgz 路径静默跳过 emitter，registry 0.1.131 制品 bundles 新鲜+json 陈旧同体制品分裂） | **0.1.132 候**（package.json scripts 变 = 打包面） | AtlasCode 构建面（工单 `docs/2026-11-29-wfc4-carrier-regen-ticket.md`；修形 = prepack 接线 emitter，src/packages 零触） |
| **W-FC-5** | ③ tsc 清零（**AtlasWeb 2080 件**——域勘正第二例：2072 出处 = viewport 根修工单 §6-4 AtlasWeb 预验 @020f3cb，排程原划「AtlasCode 全仓」系转写勘误；AtlasCode 本仓 typecheck 现值 0 错直证 @19538207） | **零 AtlasCode 版号**；候 AtlasWeb 0.1.5（若触 bundle 面；type-only 预期零字节变则零版号收口） | AtlasWeb 全仓类型硬化（独立波；判据形 = 版本钉 `bunx -p typescript@5.9.3 tsc --noEmit -p tsconfig.json`；现值 2080 @3391e6b，类型分布 TS7026×778/TS5097×396/TS2307×235/…） |

并池依据：④⑤ 同文件族（cursorLedger.ts 一处收口）+ ①② 审视期已裁定同族
记账（fail-closed 张力面）；⑥ 独立于产品码（纯判别件）；③ 体量大且独立。

## §2 载体账与带内约束（L4 带状授权）

- L4 带状授权（用户 2026-11-28 亲署）= 0.1.130–134 五版发布步预授权；
  0.1.130/0.1.131 已执行闭环（W-FC-1），**带内余量 = 0.1.132–134 三版**。
- 本排程 AtlasCode 载体版需求（W-FC-4 拆波勘正后）= 仅 W-FC-4（**确定
  打包面**，package.json scripts 变，0.1.132）→ 带内覆盖充裕；**0.1.134
  之后若仍有新版需求需新鲜亲署**（带不外溢）。
  W-FC-2 走 AtlasWeb 发布链（AtlasWeb 0.1.4 候，段 L 形 + 镜像纪律），不消耗
  AtlasCode 带。
- W-FC-3 test-side-only 零打包面 → 锚不重出、不占版号（viewport 根修
  @9b28206 先例：重建核验字节恒等即直证）。
- 各版仍各自 gate PASS + 双门 + 常规段 L 链（授权非跳门）。

## §3 波序与并行面

- **串行/并行面（W-FC-4 拆波后修订）**：AtlasCode 载体链内串行（每版一 gate 一发布
  链，0.1.130 段 L 时序教训）；W-FC-4（AtlasCode 打包面）与 W-FC-5
  （AtlasWeb 域）跨仓无载体互斥，可并行推进（各自工单/双门/发布链独立）。
- **并行面**：W-FC-3（零版号）可随时插入，不阻串行链。
- **既定版本自动推进**（用户 2026-10-23 裁定）：各波收口后 f4 直接起下波，
  不逐波要触发；每波开工前波前方案环节照旧（§0 活码重核 @ 届时 master +
  §5 审视记录，默认自决闭环）。
- **S3b/W-D 阻塞/已裁项**维持登记不排（原口径不变）。

## §4 预注记（开工波前重核项）

- **W-FC-2**（域勘正版随件改写）：② 触 AtlasWeb web-host launchCli →
  **AtlasWeb server bundle 变**（非 AtlasCode cli.js——cli 恒等三连面不受扰）；
  ① 触 web-code 消费/呈现面 → AtlasWeb client bundle 变 → 两修形均入
  AtlasWeb 0.1.4 候载体 → **锚 #5 重出链**（确定性重建 + f4 实勘，工单
  `AtlasWeb/docs/2026-11-28-wfc2-failclosed-ticket.md` §2 格 8）；原 CLI 侧
  预注记（gateTruthTable 重锚链）随域勘正作废。
- **W-FC-1** 预期 runtime/execution sha 变 + cli.js 恒等（三连）；execution
  链教训在案（readonlyRuntime/limits 依赖链入 126-module 超集，Δ 账预注册
  不得凭直觉，按 0.1.130 段 L 实测法）。
- **W-FC-4**（⑦ 修形）package.json scripts 变 = **确定打包面**，0.1.132；
  bundles 零触 → cli/runtime/execution sha 恒等预期（格 4 五面 Δ 账预注册，
  工单 §1）。**W-FC-5**（③）type-only 修复预期零字节变，若触面据实占
  AtlasWeb 版号并走对应重锚链。
- **W-FC-2 判词侧 §8-4 登记（2026-11-28）**：AtlasCode `server --workspace`
  （main.tsx:2872）现挂一行 stub（server.ts:1）零消费——server lane 实装时
  波前须补目录校验定性（归本预注记池，非 W-FC-2 本波）。

## §5 工单状态

| 波 | 工单 | 状态 |
|---|---|---|
| W-FC-1 | `docs/2026-11-28-wfc1-ledger-evict-ticket.md` | ✅ **收口** @2026-11-28（全链终态：双门齐→a4552457→gate GATE-PASS→0.1.131 段 L→pin bump 9e2b0aa→锚 #4 实勘 PASS→T6+carrier 复判 GATE-PASS；收口文书 `docs/2026-11-28-wfc1-closure.md`；挂账 ④⑤ 销） |
| W-FC-2 | `AtlasWeb/docs/2026-11-28-wfc2-failclosed-ticket.md` @4b5d65e（终版=折入版+审计 §7+判词 §8；⑦ 已改归 W-FC-4 波前） | ✅ **收口** @2026-11-29（全链终态：双门齐→落码 a714dfd→gate GATE-PASS `r-20261129-wfc2-gate.md`（判词侧采认 6b999109）→0.1.4 段 L（双 org 直发 + SRI c9f6489 + pin micro 3391e6b）→锚 #5 实勘 PASS→格 8 载体对账 GATE-PASS `r-20261129-wfc2-carrier-014.md`（pw 8/8 artifact 级）；收口文书 `docs/2026-11-29-wfc2-closure.md`；挂账 ①② 销） |
| W-FC-3 | `docs/2026-11-29-wfc3-g1-discriminator-ticket.md` @4438e18f（折入版+判词 §8 @0b7ca471） | ✅ **收口** @2026-11-29（双门齐→lane 落盘三件 sha256 回执→Main 代 path-limited 19538207 双远端→四钉独立终判全 PASS（f4+判词侧双源合流）；落件 `user-e2e/atlasweb-g-legs/`；收口文书 `docs/2026-11-29-wfc3-closure.md`；挂账 ⑥ 销） |
| W-FC-4 | `docs/2026-11-29-wfc4-carrier-regen-ticket.md` @28ab3f32（折入版 + 审计点核 PASS @01589353 + 判词 §8 PASS @28ab3f32 = **双门齐**） | 双信号已发（Main 落码格 2 / e2e 判据 §2 四格）→ gate → 0.1.132 段 L |
| W-FC-5 | 未出（③ 域勘正后 AtlasWeb 域；波前备料：2080 件现值 + 类型分布 + 版本钉判据形） | 排程定（W-FC-4 后） |

挂账池滚动（W-FC-3 收口后 + W-FC-4 波前勘正）：①② 销（W-FC-2 全链终态
@2026-11-29）；④⑤ 销（W-FC-1）；**⑥ 销**（W-FC-3 判别件落件 @19538207）；
**⑦ → W-FC-4 独立波先行**（波前根因复现直证：pack 路径 prepublishOnly
缺口，0.1.132 候）；**③ → W-FC-5**（域勘正 = AtlasWeb 2080 件，原划
AtlasCode 系转写勘误）；**⑧**（适配器终态自动重连候选，S1 三态语义变更
险面，W-FC-2 审计建议 3 落面）——待独立波另议不排程。带内余量
0.1.132–134 三版（W-FC-4 拟耗 0.1.132）。
