# 挂账池排程单——六件 → W-FC 系四波（f4 排程，2026-11-28）

> 出处：F6-PAGE UI 消费工单 §9 收口裁定「挂账池维持（未排程）」六件 + 用户
> 2026-11-28 排程指令「那你现在排一下吧」。本单 = 波划分 + 载体映射 + 波序；
> 各波仍走既定制度（波前 §0 活码重核 + §5 审视记录 → 工单双门 → 双信号）。
> 排程依据 @ master `1c590aef`（0.1.130 发布链终态）。

## §1 波划分（六件 → 四波）

| 波 | 内容（挂账池原编号） | 版号候 | 域 |
|---|---|---|---|
| **W-FC-1** | ④ ledger 行为修（issue 前置拒绝 oversized 单 payload）+ ⑤ onActiveEvict 悬空接线 | **0.1.131** 候 | AtlasCode web-session-runtime（同文件族：cursorLedger.ts + follow.ts + readonlyRuntime.ts） |
| **W-FC-2** | ① follow 200 流内错形 UI 区分度 + ② `--workspace` 目录缺席静默接受加固（fail-closed 家族并池，§8-1 判词侧建议） | **0.1.132** 候 | 跨域：① AtlasCode 侧 + AtlasWeb web-code UI 侧（UI 半走 AtlasWeb 波链不占 AtlasCode 版号）；② AtlasCode CLI 侧 |
| **W-FC-3** | ⑥ g1 `toHaveCount` RED-face artifact 第三例（判别件口径修正——判别专用断言改 scrollUnion 权威口径落件） | **零版号** | AtlasWeb e2e 判别件（test-side-only） |
| **W-FC-4** | ③ tsc 清零（2072 件） | **0.1.133/134** 候 | AtlasCode 全仓类型硬化（独立波；carrier 触面开工波前重核） |

并池依据：④⑤ 同文件族（cursorLedger.ts 一处收口）+ ①② 审视期已裁定同族
记账（fail-closed 张力面）；⑥ 独立于产品码（纯判别件）；③ 体量大且独立。

## §2 载体账与带内约束（L4 带状授权）

- L4 带状授权（用户 2026-11-28 亲署）= 0.1.130–134 五版发布步预授权；
  0.1.130 已执行闭环，**带内余量 = 0.1.131–134 四版**。
- 本排程载体版需求 = 0.1.131（W-FC-1）+ 0.1.132（W-FC-2）+ 0.1.133 或
  0.1.134（W-FC-4 若触打包面）→ 带内恰好覆盖；**0.1.134 之后若仍有新版需求
  需新鲜亲署**（带不外溢）。
- W-FC-3 test-side-only 零打包面 → 锚不重出、不占版号（viewport 根修
  @9b28206 先例：重建核验字节恒等即直证）。
- 各版仍各自 gate PASS + 双门 + 常规段 L 链（授权非跳门）。

## §3 波序与并行面

- **串行链（载体互斥）**：W-FC-1 → W-FC-2 → W-FC-4。每版一 gate 一发布链，
  载体版不并行（0.1.130 段 L 时序教训）。
- **并行面**：W-FC-3（零版号）可随时插入，不阻串行链。
- **既定版本自动推进**（用户 2026-10-23 裁定）：各波收口后 f4 直接起下波，
  不逐波要触发；每波开工前波前方案环节照旧（§0 活码重核 @ 届时 master +
  §5 审视记录，默认自决闭环）。
- **S3b/W-D 阻塞/已裁项**维持登记不排（原口径不变）。

## §4 预注记（开工波前重核项）

- **W-FC-2 ②** 触 CLI 侧 → **cli.js 字节变**（0.1.129 以来连续恒等面首次破）→
  AtlasWeb gateTruthTable EXPECTED upgrade 前缀重锚链预登记（0.1.130 pin bump
  同法）；① AtlasWeb UI 半涉 web-code 消费面（error 呈现区分度），届时与
  AtlasWeb 侧工单协调双链。
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

挂账池滚动（W-FC-1 收口后）：④⑤ 销；**⑦ 新增** = AtlasCode 包内
`dist/atlasweb-carrier.json` 陈旧一代（prepublishOnly 链未再生，零运行时消费，
0.1.126 fileCount 注记先例同形）→ W-FC-2 波前构建面再生核检查项；①②③⑥
维持原排程。带内余量 0.1.132–134 三版。
