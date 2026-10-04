# TUI 差异化优化 — 可执行 Spec（v3：信任线 + P0a 可解释审批 + P1 多页面侧栏）

> 交付人：本 session（`atlascode-b8`）＝ 方案总体框架 + 逐阶段验收 + 终审把关 / 最终回归
> 实施人：Main session（`AtlasCode 架构实施Main`）＝ 唯一实现者
> 状态：v3 端到端复查完成——真实数据 shape 逐字 pin：信任线 = 复用已建段 + 2 个后端新信号；P0 拆 P0a 展示重排 / P0b 后端新信号
> 日期：2026-10-03

---

## 0. 一句话（v2）

把 TUI 从「Claude Code 复刻」升级为 **可操控的信任台（Steerable Trust）**：
一处大胆——把状态栏变成「信任线」，一眼看懂 **谁在答 / 为什么放行 / 上下文还差多少**，每个都能一键拨。
其余（消息流 / 工具卡 / diff / 审批 / 输入框）**保持现有 Claude 质量不动**，不做多余的视觉改造。

## 1. 核心签名：信任线（Trust Line）

```
┌──────────────── 信任线 Trust Line ───────────────────────────────┐
│ 谁在答 [fast ▾ · 回退↑(新信号)]   为什么 [自动放行 · allow 规则 ryecurl]   还剩 ████░ 78% · ⚠压缩预警(新信号)
└──────────────────────────────────────────────────────────────────┘
```

三件事，各一键拨（**v3 数据 shape 校正：真实字段逐字 pin，真新增 = 2 个后端信号，非展示**）：

| 看什么 | 真实数据源（已落盘，逐字段） | 拨档 |
|---|---|---|
| **谁在答**：角色 + 模型名 | `ModelSegment` 已渲染 `input.model.display_name`；三角色池 `roles.ts` 水平回退序 | `/model` |
| 　↳ 回退↑ 是否发生 | **新信号（Main 0.1.17 落定后）**：`queryWithRoleFallback.ts`(72L leaf，签名 `(opts: RoleQueryOptions)=>Promise<chat>`)。`RoleQueryOptions` 已有 `onPrimaryError/onFallbackError` **失败侧**回调，**成功侧无信号**（fallback 成功与 primary 成功同返回值不可区分）→ 新增面**偏好 result 加字段形**（`servedRole`/`fallbackUsed`，返回值加性扩展、消费者零签名变更；非 `onFallbackSuccess?` 回调——TUI 展示面在 await 点同步可得、无中途回调时序）；动本体 + 门面 `modelprovider/index.ts:196`（STR-1 外域只经门面）；消费者仅 `tui/commands/insights.ts` 3 站点（:718/:870/:1399，premium→small）。爆炸半径小 | `/model` |
| **为什么放行**：verdict + 命中规则/分类器 | `PermissionDecisionReason` 判别联合（`rule`/`classifier`/`mode`/`hook`/…）+ `PermissionDecisionDebugInfo` 渲染器**已建**；持久形状 `ClassifierApproval{matchedRule,reason}` | `/permissions` + 审批内联 |
| 　↳ 置信度 | **无数值置信度**。`bashClassifier.confidence:high\|medium\|low` 是 ANT-ONLY stub（`enabled=false`）；真实 auto-mode `YoloClassifierResult` = `reason` 文本 + `shouldBlock`，非数值 → 勿按数值 wiring | — |
| **还剩多少**：上下文 % | `ContextBarSegment` + `ContextAbsoluteSegment` 已渲染 | `/autocompact` |
| 　↳ 熔断预警 | **新信号（缺）**：`contextHostWiring` 有 `autoCompactWindow` 档位源（engine 侧），未接 statusline → 属 Main 后端口 | `/autocompact` |

**返工核心结论（v3）**：信任线 = **展示重排（复用已建段）+ 2 个后端新信号**，不是新建引擎面。可解释审批的裁判数据（rule/classifier/mode 判别联合 + 渲染器 + 持久形状）**比 v2 记的更全**——P0 主体应是「把 debug 抽屉里已建的解释，提升为审批卡片默认可见的一等公民」，而非重新采集。AtlasCode 的真差异——Claude 是黑盒（单模型、静默 auto-accept），你是可操控的透明本地 agent。

**后置增强（P2，核心稳定后再做）**：可重跑工具（改参 → `↻` 重跑）。
**删除**：独立预算仪表盘面板、目标带（第二条 bar）——挤占终端行数，预算并入信任线；`#id` 地址前缀——并入现有 `/rewind`，不发明审美改造。

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

### P0 — 信任透明层（v3：拆 P0a 展示重排 + P0b 后端新信号）

#### P0a — 可解释审批一等公民（零新数据，复用 `PermissionDecisionDebugInfo` 已建的裁判判别联合）
- **交付**：审批卡片默认内联一行「为什么」——`rule`（命中 XX 规则 from source）/ `classifier`（auto-mode: reason）/ `mode` 三态直接可读，不再藏 debug 抽屉
- **门禁**（每项都是「用户能不能」）：
  - [ ] 任意一次(自动)放行/拦截，审批卡片直接答「命中哪条规则 / 分类器怎么说 / 什么 mode」，无需展开 debug
  - [ ] 信任线聚合段把 mode（`PermissionModeSegment` 既有）与最近一次 verdict 概要串起来
  - [ ] 数值置信度**不出现**（真实 shape = reason 文本 + 规则值），无假字段
  - [ ] `git diff` 证明主路径零改动；四件套绿

  **位置与动态（查实：`Messages.tsx` 内联渲染，非弹窗/侧栏）**：
  - 审批卡片 = 消息流里 tool_use 卡的「待审批态」，四个时刻：① 发起(executing) → ② 待审批(pending) → ③ 裁决 → ④ 结果态
  - 「为什么」两个方向，按 verdict 来源取 `PermissionDecisionReason`：
    - **ask 态** → 「为何在问你」：命中 ask 规则 / mode 触发人工确认
    - **allow 态（自动放行）** → 「为何自动放行」：命中 allow 规则 `ruleValue`+`source` / auto-mode `classifier` reason（复用已有 `UserToolSuccessMessage`，把 reason 拼进去）
  - 裁决后信任线 `verdict 概要` 随之刷新，其余段不动

#### P0b — 两个后端新信号（触 `modelprovider`/`contextHostWiring`，由 Main 定或协调，非 TUI 显示）
- **交付**：① 水平回退发生可见（哪一池成员实际应答）② autoCompact 熔断预警接入 statusline
- **门禁**：
  - [ ] 回退发生时信任线可见「已从 X 回退到 Y」（需 modelprovider/query 暴露成功回退信号，当前仅 `onFallbackError` 错误路径）
  - [ ] 达 autoCompactWindow 阈值前 statusline 提示「将自动压缩，可 `/rewind` 回退」（需 contextHostWiring 档位接 statusline）
  - [ ] 网关不可达给方向不给 mood：`IFF 不可达：已切人工确认 —— /doctor 排查`

### P1 — 活动可读性 + 多页面侧栏（信任台第二层：信任线一眼 → 侧栏一键钻）

对齐 G1/G2 已做方向接着收口；新增「多页面侧栏」作为活动可读性的统一载体（复用已建组件，主体是搬运+重组，非新建引擎面）。

#### P1a — 多页面侧栏（split 抽屉，不覆盖消息流）
- **交付**：把散落的弹窗（`/diff` DiffDialog、TodoWrite/TaskList）统一进一个**侧开抽屉**（split 布局，与消息流同屏），tab 多页：

  | 页 | 内容 | 数据源（已建） |
  |---|---|---|
  | 变革 Diff | 你改了什么；unified（现有）+ **新增 side-by-side 可选**（唯一纯新增渲染） | DiffDialog/DiffDetailView/StructuredDiff |
  | 计划 Plan | 目标 + 还差几步 | TodoWrite/TaskListV2 |
  | 活动 Activity | 本回合工具调用清单 + 结果概览 | 消息流 tool_use 事件 |
  | 决策 Decisions | 最近 N 次权限判定：放行/拦截 + why | PermissionDecisionReason + ClassifierApproval |
  | 预算 Budget | 上下文 % / token 分布 / autoCompact 状态 | ContextBar + contextHostWiring |

- **与信任线联动 = 拨档语义落地**：信任线「为什么」→ Decisions 页；「还剩」→ 预算页；「谁在答」→ 模型摘要（并入预算页第二层）
- **快捷键**：tab `1–5` 或 `←→` 切换，`Esc` 关；不抢既有键位（红线 3）
- **页面克制**：只上这 5 页（开发者高频 = Diff/Plan「我改了什么、它现在在干嘛」+ Decisions/Budget「能否信任」）；模型回退历史、会话时间线降为页内第二层或 P2 候选，不占头等页
- **门禁**（用户能不能）：
  - [ ] 任一 tab 一键打开对应页，`Esc` 关闭，消息流不被覆盖
  - [ ] Diff 页 unified 默认可见（延续 G1 #258），side-by-side 可切换且无数据丢失
  - [ ] 从信任线某段一键直达对应页（为什么→Decisions / 还剩→Budget）
  - [ ] 页数据均为只读投影，回写主循环为零

#### P1b — 计划/进度 + 工具结果/diff 可读性收口（不新造）
- **门禁**：
  - [ ] agent 规划期能看清「目标 + 还差几步」
  - [ ] 工具结果与 diff 默认可读，展开/折叠无数据丢失

### P2 — 可重跑工具（差异化增强，返工风险高，核心稳定后再做）
- **交付**：工具卡 `↻` 重跑（改参）
- **门禁**：
  - [ ] 改参重跑成功（新 `tool_use` 事件新地址；旧结果标记「被取代」非删除）

## 5. 终审（TUI 效果把关，本 session）

- [ ] 信任线三问是否 ≤1 键可拨、2 秒看懂
- [ ] 视觉/文案是否踩 Claude 资产（对照红线 4）
- [ ] 全量回归（user-e2e tier A/B/C/G）零新增 P0
- [ ] 一处大胆是否成立：用户是否只记住「那条信任线」，其余无感

## 6. 交接机制

- Main 每阶段 commit → ping 本 session → 本 session 出「阶段验收单」（通过/缺陷/打回）
- 打回清单对齐 3-round 缺陷单形态，逐条消除后重验
- P0 在 worktree 落地后不自行 merge master，交 Main cherry-pick + 跑 gate