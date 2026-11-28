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
| **W-FC-3** | ⑥ g1 `toHaveCount` RED-face artifact 第三例（判别件口径修正——判别专用断言改 scrollUnion 权威口径落件） | **零版号** | AtlasWeb e2e 判别件（test-side-only） |
| **W-FC-4** | ③ tsc 清零（2072 件） | **0.1.132 候（若触打包面）；纯 type-only 零字节变则零版号收口** | AtlasCode 全仓类型硬化（独立波；波前重核 2072 件现值 + carrier 触面定性）；**挂账 ⑦ 构建面再生核检查项随域勘正改归本波波前**（原归 W-FC-2，W-FC-2 已无 AtlasCode 构建触面） |

并池依据：④⑤ 同文件族（cursorLedger.ts 一处收口）+ ①② 审视期已裁定同族
记账（fail-closed 张力面）；⑥ 独立于产品码（纯判别件）；③ 体量大且独立。

## §2 载体账与带内约束（L4 带状授权）

- L4 带状授权（用户 2026-11-28 亲署）= 0.1.130–134 五版发布步预授权；
  0.1.130/0.1.131 已执行闭环（W-FC-1），**带内余量 = 0.1.132–134 三版**。
- 本排程 AtlasCode 载体版需求（域勘正后）= 仅 W-FC-4 若触打包面（0.1.132 候）
  → 带内覆盖充裕；**0.1.134 之后若仍有新版需求需新鲜亲署**（带不外溢）。
  W-FC-2 走 AtlasWeb 发布链（AtlasWeb 0.1.4 候，段 L 形 + 镜像纪律），不消耗
  AtlasCode 带。
- W-FC-3 test-side-only 零打包面 → 锚不重出、不占版号（viewport 根修
  @9b28206 先例：重建核验字节恒等即直证）。
- 各版仍各自 gate PASS + 双门 + 常规段 L 链（授权非跳门）。

## §3 波序与并行面

- **串行/并行面（域勘正后修订）**：AtlasCode 载体链内串行（每版一 gate 一发布
  链，0.1.130 段 L 时序教训）；W-FC-2 已勘正为 AtlasWeb 域 → 与 W-FC-4
  （AtlasCode 候）跨仓无载体互斥，可并行推进（各自工单/双门/发布链独立）。
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
- **W-FC-4** type-only 修复预期零字节变，若触面据实占版号并走对应重锚链。

## §5 工单状态

| 波 | 工单 | 状态 |
|---|---|---|
| W-FC-1 | `docs/2026-11-28-wfc1-ledger-evict-ticket.md` | ✅ **收口** @2026-11-28（全链终态：双门齐→a4552457→gate GATE-PASS→0.1.131 段 L→pin bump 9e2b0aa→锚 #4 实勘 PASS→T6+carrier 复判 GATE-PASS；收口文书 `docs/2026-11-28-wfc1-closure.md`；挂账 ④⑤ 销） |
| W-FC-2 | 未出（按 §0 重核出稿；波前增 ⑦ 构建面再生核检查项） | **排程定，起波** |
| W-FC-3 | 未出（可随时出，判别件口径单点） | 排程定 |
| W-FC-4 | 未出（波前重核 2072 件现值） | 排程定 |

挂账池滚动（W-FC-1 收口后；W-FC-2 波前勘正版）：④⑤ 销；**⑦** = AtlasCode 包内
`dist/atlasweb-carrier.json` 陈旧一代（prepublishOnly 链未再生，零运行时消费，
0.1.126 fileCount 注记先例同形）→ **W-FC-4 波前**构建面再生核检查项（域勘正
后改归——W-FC-2 已无 AtlasCode 构建触面）；①②③⑥ 维持原排程；**⑧ 新增**
（W-FC-2 审计建议 3 落面）= 适配器终态自动重连候选（S1 三态语义变更险面，
W-FC-2 工单 §5 自决 2 弃采登记）——待独立波另议不排程。带内余量 0.1.132–134
三版。
