# TUI 专项 · P0 收口状态（2026-10-05 收尾）

> 一页恢复入口：任何 session 打开此文件即可接续。判据事实源 = 主计划 §4b/§6 + spec v4；本文件只记「状态 + 挂起项 + 恢复入口」，不重复判据。
> 收尾裁定（用户 2026-10-05）：**P0 波（0.1.24）干净收口，第二波挂起等启动，就此收尾。**

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

### 2.2 终审补测（12 项 INCONCLUSIVE，触发 = 全部波收口后终审）
| 项 | 原因 | 补测方式 |
|---|---|---|
| A1×3（always allow-reason / no-dialog / dangerous-no-always） | #263 未修：default 模式 Bash 恒-allow 正常流弹不出框 | **#263 修后**重验 |
| A4×4（rule-allow / classifier×2 / mode / bypass 句式） | verdictLine 仅 Bash·PowerShell 弹框面，automode/bypass 启动参数 e2e 未跑 | 终审补启动参数 + 场景 |
| B1×2（↦fast 现形/消失） | 回退难强制 | loop-robustness `fault-proxy.ts` 故障注入（Main 决策输入④已备） |
| A2-esc / B3-gw-down | 软项 | 终审 |
全部有单测覆盖（48/48），非缺陷，是「验收没跑到」。

### 2.3 #263 / #264 收口波（**用户裁定：专项收口后**随工具本体/engine 只读波）
- 工单已立：`docs/2026-10-04-permission-gaps.md`（根因/修法方向/验收标准齐全，待 Main 实施）
- #263 = TUI 车道 `BashTool.checkPermissions` 恒-allow stub（default 模式不设防 bash）；#264 = engine `>` 重定向误判只读
- 影响：#263 修前 A1「选了 always」在正常流不可触达（已记录，非缺陷）

## 3. 恢复入口（下次启动读这三处）

1. `docs/2026-10-04-tui-program-plan.md` §4b（0.1.24 列车全判据）+ §6（状态快照至收口）
2. `docs/tui-differentiation-spec.md` v4（P0a 行为修复 / P0b 持续监控 / P1a 回退+v2 挂起 / §5 终审含用户面走查层）
3. 记忆 `tui-optimization-division.md` 末段（0.1.24 全链收口 + 残留清单）；e2e 侧 `user-e2e/tui-diff/PLAN.md`（S-H/P1a 探针退役标记 + 0.1.24 探针表）

**角色不变**：atlascode-f4 = 规划/管理 · Main = 实施 · e2e = 验收（逐项探针 + 用户面走查层为固定判据）。
