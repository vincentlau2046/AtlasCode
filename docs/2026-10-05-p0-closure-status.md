# TUI 专项 · P0 封口状态（2026-10-05）

> 一页恢复入口：任何 session 打开此文件即可接续。判据事实源 = 主计划 §4b/§6 + spec v4；本文件只记「状态 + 挂起项 + 恢复入口」，不重复判据。
> 封口裁定（用户 2026-10-05）：**P0 阶段（P0a 审批行为 A1–A5 + P0b 持续监控 B1/B2）功能/代码 100% 闭环，无未闭环项，正式封口。第二波（P1a-v2 讨论 + P1b）确认不启动，维持挂起。**
>
> **P0 无未闭环的判定**：0.1.24 已把 P0 全部子项落地 + 发布 + 生产 lane 验真（§1）。12 项 INCONCLUSIVE 是「P0 做完、验收没强制到」的**验收覆盖**项，归终审/loop-robustness/#263 各管一段，**不属于 P0 阶段未闭环**；#263/#264 是用户裁定的独立收口波，非 P0 的活。

## 1. 已收口（发布 + 验真 + 生产 lane 全绿）

| 版本 | 内容 | 状态 |
|---|---|---|
| 0.1.19 | P0a 可解释审批（verdict 一行） | ✅ |
| 0.1.20 | P0b 两后端新信号（回退/熔断/网关不可达方向性） | ✅ |
| 0.1.21 | P1a 侧抽屉 + #272 UA 品牌串 | ✅（P1a 后被回退） |
| 0.1.22 | P1a R1 双修复 | ✅（含 P0a 回归 → 0.1.23） |
| 0.1.23 | P0a 回归双 cede + #271 #4/#5 | ✅ |
| **0.1.24** | **A 审批行为修复（A1 always session 域 / A2 No 不退出 / A3 automode 确认门 / A4 why 全英文真字段 / A5 标签三态）+ B 持续监控（B1 ↦fast 折 model 段 / B2 熔断折 context-bar 色阶；B3 已批砍）+ C P1a 全量回退（抽屉删净）** | ✅ master `6be29bd` + tag v0.1.24 + packument 双通道验真 + 生产 lane 6 项全绿（含用户面走查层） |

worktree 卫生：列车 worktree（0.1.24）+ p1a-sidebar / 023·024-prodlane / http-useragent 已清；保留 `worktree-0.1.23-p0a-fix-loop` / `worktree-loop-robustness`（各 owner 定）。

## 2. 挂起项（按触发条件排好，不会丢）

### 2.1 第二波（**等用户启动**，任何 session 不预启）
- **P1a-v2 设计讨论**：干净基线（消息流 + /diff + statusline 持续监控）后重议第二层钻取面。讨论序（教训：先场景后组件）：① 用户使用场景 → ② 形态+触发（含可发现性）→ ③ 与 P1b 边界 → ④ 决策面与 #263 时序。候选方向（未定稿）记在 spec v4 P1a 段。
- **P1b 开波**：spec §4 P1b 两门禁；Main ①-④ 决策输入先行；#261 S-F（非 git 项目 skill）复验。
- **顺带项**：`PermissionRuleExplanation.tsx` 详情面 pre-A4 旧措辞对齐（一行 patch，随波走）。

### 2.2 终审补测（12 项 INCONCLUSIVE，非 P0 未闭环 = 验收覆盖项，归终审/loop-robustness/#263 各管一段）
| 项 | 原因 | 归属 | 前置 |
|---|---|---|---|
| A1×3（always allow-reason / no-dialog / dangerous-no-always） | #263 未修：default 模式 Bash 恒-allow 正常流弹不出框 | 终审 + #263 波 | **依赖 #263 先修**（修后重跑这 3 探针即 PASS，无新 harness） |
| A4×4（rule-allow / classifier×2 / mode / bypass 句式） | verdictLine 仅 Bash·PowerShell 弹框面，automode/bypass 启动参数 e2e 未跑 | 终审（e2e 补 seed） | **无前置**——可现在单独补（e2e 加 `--permission-mode auto`/`bypassPermissions` seed） |
| B1×2（↦fast 现形/消失） | 回退难强制 | 终审 + loop-robustness | 需 fault-proxy 注入（跨 loop-robustness 基建） |
| A2-esc / B3-gw-down | 软项 | 记录 | 无（A2-esc 单测已覆盖；B3 已砍项预期缺席） |
全部有单测覆盖（48/48），非缺陷，是「验收没跑到」。**唯一现在无前置可补的是 A4×4**；A1×3 待 #263、B1×2 待 fault-proxy。

### 2.3 #263 / #264 收口波（**用户裁定：专项收口后**随工具本体/engine 只读波）
- 工单已立：`docs/2026-10-04-permission-gaps.md`（根因/修法方向/验收标准齐全，待 Main 实施）
- #263 = TUI 车道 `BashTool.checkPermissions` 恒-allow stub（default 模式不设防 bash）；#264 = engine `>` 重定向误判只读
- 影响：#263 修前 A1「选了 always」在正常流不可触达（已记录，非缺陷）

### 2.4 P0 封口结论（2026-10-05）
- **P0 阶段（P0a A1–A5 + P0b B1/B2）= 已封口**：功能/代码全闭环，0.1.24 发布验真 + 生产 lane 全绿，无「P0 没做完」项。
- **第二波（P1a-v2 讨论 + P1b）= 确认不启动**，挂起（§2.1），任何 session 不预启。
- **12 项补测 / #263·#264 = 不阻塞 P0 封口**：12 项归终审/loop-robustness/#263（§2.2 逐条归属），#263·#264 是独立收口波（§2.3）。
- **唯一可现在做的 P0 验收加分项 = A4×4**（e2e 补 automode/bypass 启动参数，无前置）——用户定：补则 P0 验收无空洞（剩 A1×3 待 #263 + 记录项），不补则 P0 按「功能闭环 + 单测覆盖」封口、12 项统一留终审。**（待用户一句话定，见 §4 待定项）**

## 3. 待定项（用户未拍板，不擅动）
- [ ] **A4×4 现在补 or 留终审**：现在补 = 我发 e2e 加 2 个启动参数 seed 跑 4 条探针（纯 e2e，无产品改动，1 个 e2e 波）；留终审 = P0 按功能闭环封口、验收空洞留终审统一补。
- [ ] #263/#264 提级 or 维持「专项收口后」：P0 封口后 #263 仍是真安全缺口（default 模式 bash 不设防），可提级为独立小波（0.1.25）现在就修，或维持原裁定等第二波。用户定。

## 4. 恢复入口（下次启动读这三处）

1. `docs/2026-10-04-tui-program-plan.md` §4b（0.1.24 列车全判据）+ §6（状态快照至收口）
2. `docs/tui-differentiation-spec.md` v4（P0a 行为修复 / P0b 持续监控 / P1a 回退+v2 挂起 / §5 终审含用户面走查层）
3. 记忆 `tui-optimization-division.md` 末段（0.1.24 全链收口 + 残留清单）；e2e 侧 `user-e2e/tui-diff/PLAN.md`（S-H/P1a 探针退役标记 + 0.1.24 探针表）

**角色不变**：atlascode-f4 = 规划/管理 · Main = 实施 · e2e = 验收（逐项探针 + 用户面走查层为固定判据）。
