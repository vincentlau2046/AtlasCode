# TUI 差异化优化 — 可执行 Spec（v4：审批行为修复 + 持续监控 + P1a 回退）

> 交付人：本 session（`atlascode-b8`）＝ 方案总体框架 + 逐阶段验收 + 终审把关 / 最终回归
> 实施人：Main session（`AtlasCode 架构实施Main`）＝ 唯一实现者
> 状态：v4 用户审评定稿（2026-10-05）——P0a 从「展示重排」升级为**审批行为修复**（always 生效 / No 不退出 / automode 确认门 / why 句式全英文真字段 / 标签三态）；P0b 定位修正为**持续健康监控**（连续状态折入既有段，非瞬态事件 banner）；**P1a 多页面侧栏全量回退**（用户面验收不过），v2 重设计挂起
> 日期：2026-10-05（v3 基线 2026-10-03）

---

## 0. 一句话（v4）

把 TUI 从「Claude Code 复刻」升级为 **可操控的信任台（Steerable Trust）**：
审批行为**可信**（选了 always 真生效、No 不炸 session、进 automode 有确认门、why 说得清），
状态栏做**持续健康监控**（谁在答 / 什么姿态 / 上下文还差多少——连续状态，不是瞬态 banner），
其余（消息流 / 工具卡 / diff / 审批 / 输入框）**保持现有 Claude 质量不动**，不做多余的视觉改造。

## 1. 核心签名：信任线（Trust Line）——v4 定位修正 = 持续健康监控

**v4 原则（用户裁定 2026-10-05）**：statusline 回答「**现在**怎么样」（连续状态），不播报「**发生过**什么」（事件历史归决策面，留未来波）。三槽全部折入**既有段**，不新造独立段、不加 cryptic token：

```
 deepseek-v4-pro ↦ fast · default · ctx 42%
   └谁在答┘└姿态┘  └还剩多少┘
```

| 槽 | 呈现 | 数据源 | 连续/异常 |
|---|---|---|---|
| **谁在答** | `model` 段：正常 = 主模型名；回退活跃 = `deepseek-v4-pro ↦ fast`（黄，恢复即消失） | `ModelSegment` + `getLastRoleFallback()`（既有，零新后端信号） | 连续量，永远在；`↦` 仅回退期显形 |
| **什么姿态** | `permission-mode` 段三态标签：`default` / `automode enabled` / `bypass enabled`（shift+tab 指示牌，保留） | `PermissionModeSegment`（既有，A5 改标签文案） | 连续量，永远在 |
| **还剩多少** | `context-bar` 段：占用 % + 色阶（cyan→黄 70%→红 90%）；超 autoCompact 阈值且 isAutoCompactEnabled 尾部 `▲` | `ContextBarSegment` + `calculateTokenWarningState`（既有数据源） | 连续量，永远在；`▲` 阈值区显形 |

**「为什么放行」不在 statusline**（v4 撤回 v3 的 verdict 词槽）：per-command 的 why 是句子级信息（命中哪条规则 + source / 分类器 reason），无法压缩成 token，硬塞 statusline 是噪音。它属于**审批时刻**——审批弹框的 why 行 + 工具结果卡的 allow 原因行（P0a A4，§4）。
**网关不可达**：不做常显指示（B3 砍：modelprovider 无连接态 store，新造 = 新后端信号面超本列车边界）；保留 0.1.20 既有错误行 `IFF 不可达：已切人工确认 —— /doctor 排查`（P0b③）。

**后置增强（P2，核心稳定后再做）**：可重跑工具（改参 → `↻` 重跑）。
**删除**：独立预算仪表盘面板、目标带、`#id` 前缀（v3 决定不变）；**v4 追加删除**：`RoleFallbackSegment` / `AutoCompactWarningSegment` 独立段（折入 model / context-bar，B1/B2）。

## 2. 设计原则（三条，判据式）

- **P1 透明不藏**：任何资源/信任相关的状态，≤2 键可看、≤1 键可拨，数值从单一数据源派生（unit 锁定）。
- **P2 一处大胆，其余克制**：只让「信任线」成为被记住的那样东西；其余组件不追求视觉改动，只做可读性回归。
- **P3 主循环零污染 + 键盘不打仗**：只读投影 + 旁路渲染；不抢既有键位。

## 3. 分工与红线

| 谁 | 负责 |
|---|---|
| 本 session | 框架设计、进度把控、逐阶段验收、终审把关、最终回归 |
| Main | 实施 P0–P2，worktree → cherry-pick → 四件套 gate |

**红线**：
1. **主循环零触碰**：`src/engine/query` / `streamAssistant` / `permissions` 主路径零改动。
2. **事件/信任数据只读投影**：从 `OrchestrationEvent` + session JSONL + 既有 statusline 采集派生，不回写主循环。
3. **键位不打仗**：签名动作走 slash 命令；唯一待释放 `ctrl+b`（聚焦信任线拨档），实施前以 `defaultBindings.ts` 实测为准。
4. **视觉/文案原创**：不碰 Claude spinner 动词族 / banner / 品牌资产；`/stickers` `/thinkback` `/upgrade` 等 Claude 彩蛋属删除面。

## 4. 阶段交付物 + 验收门禁（需求语言，非 feature 语言）

验收由本 session 执行：每阶段 Main 落地即验（fixture + PTY e2e + 读 diff 对照本表），出「阶段验收单」。

### P0 — 审批行为修复 + 持续监控（v4：0.1.24 三波 A+B；判据详见管理主计划 §4b）

#### P0a — 审批行为修复（全 session 域：权限选择写 session 记忆，**不写 settings 文件、不改原存储模型**；resume 恢复、新 session 重置）

**A1 always 必须生效**（修「选了 don't ask again 下次还问」）
- 选 `Yes, and don't ask again for <prefix>:*` → 写 **session 域** allow 规则 → 本 session 同前缀命中直接 allow 不再弹框（工具结果卡显示 allow 原因）；写失败显式报错，不静默假装成功
- 安全护栏：危险前缀（`rm`/`sudo`/`cd`/单字符/`*`）不出现 always 选项
- **门禁**：① 选 always 后同前缀第二次不弹框 ② 危险前缀无 always 选项 ③ 新 session 不继承

**A2 No 不退出**（修「选 No 直接退出整个 session」）
- `No` = 拒绝**这一次**工具调用 + feedback（"tell Atlas what to do differently"）送回 agent → agent 继续运行（换方案/换工具/解释），**session 不退出**；Esc = 取消无 feedback
- **门禁**：① 选 No 后 session 存活、agent 继续响应 ② Esc 变体同语义

**A3 automode 确认门**（防误入：auto 模式下命令被分类器自动放行，误入代价高）
- 弹框选 `Enable automode` → 模态确认视图（4 行：`Entering automode / auto-approved by safety classifier / Switch back: Shift+Tab / 1 Confirm 2 Cancel`）→ **确认后**才切 session state + 当前请求 re-dispatch 走 auto 门控（复用既有 `recheckPermission` 面，不新造判定逻辑）
- `shift+tab` 手切是用户显式动作，**不加门**；bypass 仅 shift+tab 手切（审批弹框选项枚举无 bypass，不在本波）
- **门禁**：① 未确认前 statusline 仍 `default`（mode 未切）② Confirm → `automode enabled` ③ Cancel/Esc → 回原选项列表、停留 default

**A4 why 句式（全英文、真字段、非空话；与 `"Do you want to proceed?"` 主题一致，无 CJK 混入）**
| verdict 来源 | 句式 |
|---|---|
| rule(ask/deny) | `Rule "<ruleValue>" from <source> requires confirmation.` |
| rule(allow) | `Allowed by rule "<ruleValue>" (<source>).` |
| classifier 危险 | `Auto mode: classifier flagged this as dangerous.` |
| classifier 放行 | `Auto-approved by classifier: <reason>.` |
| mode | `<modeLabel> mode requires confirmation for <tool>.` |
| bypass | `Bypass mode — all commands allowed.` |
- **门禁**：六来源句式各 1 探针 + why 行无 CJK + 无数值置信度假字段（真实 shape = reason 文本 + 规则值，v3 校正不变）

**A5 statusline 姿态标签三态**：`default` / `automode enabled` / `bypass enabled`（shift+tab 指示牌保留，仅 `shortTitle` 文案；Config 屏/title 族不动）

#### P0b — 持续健康监控（连续状态折入既有段，非瞬态 banner；事件历史不进 statusline）
- **B1 回退折入 model 段**：回退活跃时 `deepseek-v4-pro ↦ fast`（黄），恢复即消失；数据源既有 `getLastRoleFallback()`，零新后端信号；`RoleFallbackSegment` 独立段删除
- **B2 熔断折入 context-bar**：色阶 cyan（<70%）→黄（70–90%）→红（>90%）；超 autoCompact 阈值且 `isAutoCompactEnabled` 尾部 `▲`；`AutoCompactWarningSegment` 独立段删除
- **B3 网关断指示 → 已砍（管理裁定 2026-10-05）**：modelprovider 无连接态 store，新造 = 新后端信号面超「零新后端信号」边界；保留 0.1.20 既有错误行 `IFF 不可达：已切人工确认 —— /doctor 排查`（P0b③，gate 核不回归）
- **门禁**：B1 `↦ fast` 现形/消失（不可强制 → INCONCLUSIVE 留终审，同 P0-1a-fallback 口径）；B2 色阶阈值 + `▲`（fixture 可强制 context 用量）；P0b③ 错误行三锚点不回归

### P1 — 活动可读性（v4：P1a 回退，P1a-v2 挂起，P1b 0.1.24 后）

#### P1a — 多页面侧栏 → **已全量回退（0.1.24，C 波）；v2 重设计挂起**
- **回退裁定（用户 2026-10-05）**：40% 圆角灰框抽屉用户面验收不过——割裂的白色框（非终端原生）、初始页死板落 Diff 不跟随上下文、40% 定宽不适配终端/CJK；且触发键实际不可达（1-5 打字时被输入框吃掉、弹框时抢权限数字选 = P0a 回归根因；`/sidebar` 0.1.23 生产 lane 实测走 `Unknown skill` fallback，从未可发现）
- **回退面（C 波，删 19 文件 + 3 接线）**：`SidePanel/` 整目录（15）+ `commands/sidebar/`（2）+ 注册/键位/渲染点 3 处 + 0.1.23 双 cede（随目录删）。**留勿误伤**：`useDiffData`（`/diff` 在用）/ `decodeKittyModifier`（通用输入修复，单测迁 `parse-keypress-modifiers.test.ts`）/ `decisionLog`+`useCanUseTool` 收敛点（零 UI 面，留未来决策面）
- **回退后基线**：消息流（内联 diff `StructuredDiffList`）+ `/diff` 全屏审查（DiffDialog：文件列表/详情/per-turn 源）+ statusline 持续监控。diff 属消息流与 `/diff`，不另开常驻侧栏
- **门禁（回退核）**：抽屉残留 0 命中（含模态期）/ `/sidebar` 未注册 / 1-5 不开抽屉 / `/diff` + 内联 diff 无回归 / kitty 单测在 parse-keypress 名下绿
- **P1a-v2（挂起）**：「第二层钻取面」重新设计（候选方向仅记录，未定稿：无框全宽临时面板 / `/diff` 增强 / 决策面），回到干净基线后与用户讨论定稿，**不在糙方案上叠版本**；P1b 排 0.1.24 收口后

#### P1b — 计划/进度 + 工具结果/diff 可读性收口（不新造）
- **门禁**：
  - [ ] agent 规划期能看清「目标 + 还差几步」
  - [ ] 工具结果与 diff 默认可读，展开/折叠无数据丢失

### P2 — 可重跑工具（差异化增强，返工风险高，核心稳定后再做）
- **交付**：工具卡 `↻` 重跑（改参）
- **门禁**：
  - [ ] 改参重跑成功（新 `tool_use` 事件新地址；旧结果标记「被取代」非删除）

## 5. 终审（TUI 效果把关，管理 session；v4 增用户面走查层）

- [ ] 信任线持续监控：三槽（谁在答/姿态/还剩）一眼看懂，无 cryptic token
- [ ] 审批行为：A1-A5 逐项探针全绿（选了 always 真生效 / No 不炸 / automode 有门 / why 说得清全英文）
- [ ] 视觉/文案是否踩 Claude 资产（对照红线 4）；用户面文案无 CJK 混入
- [ ] 全量回归（user-e2e tier A/B/C/G + §4b 31 条逐项探针）零新增 P0
- [ ] **用户面走查层**（v4 新增，补「行为探针全绿 ≠ 用户面可用」验收盲区）：无抽屉视觉残留 / statusline 标签英文可读 / 审批弹框 why 行人话可懂

## 6. 交接机制

- Main 每阶段 commit → ping 本 session → 本 session 出「阶段验收单」（通过/缺陷/打回）
- 打回清单对齐 3-round 缺陷单形态，逐条消除后重验
- P0 在 worktree 落地后不自行 merge master，交 Main cherry-pick + 跑 gate