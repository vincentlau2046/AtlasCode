# 地基 full picture + 方向裁定（夯实 > 加速）— 2026-10-19 f4 零码

- 日期：2026-10-19
- 触发：用户 2026-10-19「不希望加速，希望将地基夯实；需要一个 full picture 的大方向；确认『一 git repo + 多 npm 包』是否之前定好的方向」
- 角色：f4 = 规划/判据/核验（零码）；落码/gate/release = Main/e2e 车道
- 基线：**212a1e1 = v0.1.77**（归整收官，主链 0.1.55–0.1.77 三十波全五段终态）

## 0. 方向裁定记录（用户界①，2026-10-19）

| 裁定项 | 裁定 | 依据 |
|---|---|---|
| 「一 git repo + 多 npm 包」是否既有方向 | **否——既有 L1 裁定恰为单包**：`architecture-charter.md` L1「一个 git 仓库，一个 package.json，不用 workspaces，不做 per-module package.json，不独立发版。目录即边界，边界靠 lint 强制」；多包 = L1:113 触发器面「某模块要独立发版/外部消费时，给该目录加 package.json 升级为包——机械操作，不在现在预付」 | charter L1/L4.5 + v3 P-1~P-7「达标后 monorepo/独立发布成为可选而非必需」 |
| 打包模型 | **先夯地基，多包暂挂**（用户 2026-10-19 裁定）：L1 不变（单包）；多包/多壳维持触发器态（独立发版/外部消费/port 契约稳定半年），出现时机械升级 | 用户界① 裁定（本文件 §0） |
| 当前节奏 | **不加速、夯地基**：不开 office 壳实施波；地基残面按本文件 §4 逐项裁定 | 用户 2026-10-19 原话 |

## 1. Full picture 大方向（north star）

```
单一 git repo = 单一事实源
  └─ 域级目录边界（12 顶层域 + atlascode 壳 + atlasoffice 占位）
       ├─ v3 P-1~P-7「可独立 Patch」能力：✅ 0.1.77 收官锁定（断言固化不回归）
       ├─ 结构残口 W1–W5：✅ 已执行（§8.74，见 §2）
       ├─ 发布面三十波全闭环：✅ 0.1.55–0.1.77
       └─ 真残面 = 前向缝登记族（清算型，非债务型，§3）
  └─ 多包/多壳（atlasoffice/external plugin）= 触发器时机械升级（暂挂，L1 不变）
```

**一句话**：地基的「结构层」已夯实完毕；剩余面全是**登记态前向缝**（每项都有头注裁定 + 归属波/触发条件），不存在未裁定的结构债务。「夯实地基」= 对这些前向缝逐项做**开波/挂起裁定**（§4），而非再开大迁移。

## 2. 地基三层现态盘核（@ 212a1e1，实查证据）

| 层 | 残口 | 状态 | 证据 |
|---|---|---|---|
| v3 架构能力 | P-1~P-7（门面唯一/依赖单向/组合根唯一/契约/旧路径/换实现/直测） | ✅ 满足（0.1.77 固化） | `tests/unit/arch-reorg-closure-0177.test.ts`（15 测试 56 断言 + 定向红变异核 3 件）；gate GATE-PASS + 生产 lane PASS |
| R1 残口① | 双工具面（roadmap 原「216 文件/49827 行未收敛」） | ✅ **实质闭环**（roadmap 记录陈旧） | `src/tui/tools.ts` 头注（W2-2a-2 §8.74.11）：组 A「engine-backed 36 本体」= engine 为行为事实源 + 名集单一事实源 `engine/tools/toolNames.ts` + 注册表判别单测 `tui-tools-registration-table.test.ts` 锁定；组 B「KEEP 域外设」= 活消费者/域包/平台支裁定 KEEP。tui 本体暂留 = tui 契约适配器桥（行为成员委托 engine 对象 + 渲染成员挂 UI.tsx/fused）= 头注明裁「前向接缝登记，复审勿当遗漏重提」（零行为稳态，非债务） |
| R1 残口② | bootstrapState 双份（原 187 vs 60） | ✅ **实质闭环** | `src/tui/bootstrapState.ts` 头注（M1 #209，2026-10-01）：状态单源三分层裁定固化（engine 真状态 = `src/bootstrap/` 57 导出 / TUI 运行态 = 本文件 112 导出 / 3 同名分歧 = L3 边界有意保留）+ 护栏 `tests/unit/bootstrap-state-split.test.ts` |
| R1 残口③ | lint 5 真体未启用 | ✅ **实质闭环** | eslint 配置实测 5 条全 `"error"`（no-sync-fs/no-process-exit/no-process-env-top-level/no-cross-platform-process-issues/no-lookbehind-regex）；存量 = 逐文件 legacy-debt 豁免（W-opt 波再议） |
| R1 残口④ | 单 loop（orchestrator 13540 LOC/45 文件） | ✅ 实质闭环 | §8.74.2 裁定 + §8.74.19（a 类删净）+ W3-3b REPL 重接线五件套（engine loopDeps 单组合根）；tui 侧现仅 loopDeps/loopEvents 桥接面 |
| 发布面 | 主链 0.1.55–0.1.77 | ✅ 三十波全五段终态 | 逐版 gate/生产 lane 双报告 + SRI 四值 D-8 + Δ8910B |

**记录对齐（零码）**：`docs/roadmap-domestic-and-residuals.md` §2 R1「待启动」= 09-29 排波记录，执行态见 `docs/execution-strategy.md` §8.74（W1 设计 #173 → W5 发布通道 #197，2026-09-30 全执行）：R2（D-3 Ascend）= ascend 域包占位 + D-3 挂载前向缝；R3（D-9 换值）= §8.74.28 全量清理（grep `[ATLAS-HOLD]` = 0，前向缝 ⑭ #200 登记）；R4（非 stdio transport）= mcp 域 sse/http/ws 已落（0.1.74 通用化收口波）；R5（切端）= §8.74.14–16 W3 切端已执行。**建议 roadmap 面加一行「执行态索引」指向 §8.74（防再误读为未启动）**。

## 3. 真残面清单（全部 = 登记态前向缝，逐项有归属/触发条件）

| # | 残面 | 性质 | 归属/触发 |
|---|---|---|---|
| F-1 | 组 A 36 本体 tui 壳「暂留」（行为已委托 engine，仅渲染/适配壳残留） | 结构清算型（零行为价值，纯洁净度） | 前向缝登记；**多包触发时**（目录升包）随包化一并物理删，或独立小清算波（可选，非地基债务） |
| F-2 | 前向缝 ⑭ #200（1P 远端车道域换 gateway：wire 9 常量 + oauth 账号面 + 桥/CCR 簇） | 外部依赖挂起 | IFF gateway 端点定案（R3 同源前置） |
| F-3 | bootstrap 3 同名分歧 TUI 面硬编码缺省（flag-settings 功能未落盘，H6 登记） | 功能未落盘登记 | 功能面另裁 |
| F-4 | APIError 双族 defer（modelprovider/types vs tui/types，instanceof 跨模块 risk） | 类型面技术债 | 后续波 |
| F-5 | `providers.ts:6` 一方判定（IFF 网关域未定案） | 外部依赖挂起 | IFF gateway 定案（同 F-2） |
| F-6 | P0 残留 19 项（☆ 低优先/待核/SDK 面/1P 判定基线） | 登记不排 | 用户界① 另行裁定（收官盘 §3） |
| F-7 | 国产替代轨 W-opt（DSH/PI 八项） | P1 让位 | P0 轨收官后开波排期 |
| F-8 | 多包/多壳（atlasoffice 三相 + external plugin） | **触发器暂挂**（§0 裁定） | 触发条件 = 独立发版/外部消费/port 契约稳定半年；机械升级（目录加 package.json） |

## 4. 裁定项（用户界①，f4 建议列）

- ① **roadmap R1 记录对齐**（零码）：加执行态索引行指向 §8.74，防「R1 未启动」误读——**建议执行**
- ② **F-1 组 A 本体物理删**：建议**挂起**（零行为价值；多包触发时随包化一并处理；现在开清算波 = 为一个稳态登记面付一个发布波，与「不加速」相悖）——确认/推翻
- ③ **F-2/F-5（IFF gateway 定案族）**：外部依赖，建议**挂起等 gateway 端点定案**（定案后一波清 F-2+F-5）——确认
- ④ **F-3/F-4**：建议**登记不动**（低价值/技术债，随后续波自然吸收）——确认
- ⑤ **F-6 19 项 / F-7 W-opt**：维持登记不排 / P1 让位——确认
- ⑥ **多包方向**：L1 不变 + 触发条件登记（§0）；**不预建任何 package.json / workspaces 结构**——确认

## 5. 结论（一句话）

**地基已夯实**（v3 能力 + R1 结构残口 + 发布面三层全闭环）；剩余 8 类残面全部是**有归属的登记态前向缝**，「夯实地基」= 本文件 §4 六件裁定（f4 建议 ①执行 / ②③④⑤⑥挂起）；「一 repo + 多 npm 包」= 触发器时机械升级，暂挂不预付。

---
*f4 零码方向产物（规划/判据，不落码）。裁定 = 用户界①；落码/gate/release = Main/e2e 车道。*
