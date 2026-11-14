# 件 E 设计稿——长 no-op 工具后台化（用户裁定「先设计稿后码」，2026-11-14）

> f4 出稿 · 上游：W-AB2 §6 件 E 裁定（批准，先设计稿；与 timeoutMs/钉⑥ 同域统筹，呈批后才立落码工单）。
> 证据面：T07 H·shape 级（cc sleep → background + scheduled wakeup；atlas 直发阻塞）。

## §0 波前盘点（活码实锚——域内已有五块，前提再度收窄）

原「atlas 缺后台化形态」前提不成立。活码盘点：

| # | 已有件 | 锚 |
|---|---|---|
| 1 | **bash `run_in_background`** | `src/engine/tools/bash/bashTool.ts:222`+（BgTask 注册/后台任务 id/输出文件/detached spawn） |
| 2 | **TaskOutput 轮询 + notified 旗标** | `src/tui/Task.ts:73` + `src/engine/tools/tasks/taskOutputTool.ts:355/410`（完成通知标记面） |
| 3 | **MCP 慢调用自动后台** | `src/engine/pipeline/mcpAutoBackground`（C5-3 race + `onMcpToolBackgrounded` 计时槽） |
| 4 | **timeoutMs 声明预算（live，0.1.105 重落）** | `src/engine/pipeline/toolTimeout.ts`（arm/哨兵/raceWithToolDeadline）+ Tool 契约字段；WebFetch 90s/WebSearch 30s 首批 |
| 5 | **钉⑥ 转后台 disarm** | toolTimeout.ts:22/47-48——工具转后台即 disarm deadline（后台 continuation 不受预算面） |

⇒ 真缺口收敛为**两点**（T07 定谳腿先行，禁预答）：

- **缺口 A（wakeup 注入面）**：后台任务完成 → 会话如何被唤起？现形 = 模型须主动 TaskOutput 轮询（notified 旗标是否已接回合注入面待定谳）；CC 形 = scheduled wakeup 主动注入。定谳 = Task.ts notified 消费链追踪 + T07 语料 pty/reqlog 对表。
- **缺口 B（编排引导面）**：T07 atlas 模型直发阻塞 sleep——是否系统提示词/工具描述缺「长等待应 run_in_background」引导（CC Bash 描述含此引导为候选参照）。定谳 = 双侧系统提示词/工具描述对表 + T07 语料行为归因（H 面引导缺 vs M 面模型自择——**若是后者按 A/B 纪律不收**）。

## §1 方案（定谳后二选一/组合，呈批面）

- **方案 1（若缺口 A 坐实）**：后台完成 wakeup 注入——后台任务完成时向回合队列注入通知事件（复用 notified 旗标，钉⑥ disarm 语义对表），对齐 CC scheduled wakeup 形。
- **方案 2（若缺口 B 坐实）**：编排引导修形——Bash/Task 工具描述增「长等待/监控型用 run_in_background + TaskOutput」引导（CC 现行文案为参照基准）；零机制改动。
- **方案 3（A+B 双坐实）**：组合，先 2 后 1（引导零险面先行，wakeup 机制面独立 lock-face）。
- **禁项**：timeoutMs/钉⑥/mcpAutoBackground 语义零触碰；后台 continuation 预算面零变；watchdog 弧（0.1.102 教训域）交互面须专项判据。

## §2 与同域件统筹

- timeoutMs：live（0.1.105），本设计稿仅消费其 disarm 语义，零改动。
- watchdog 钉⑥：转后台 disarm 已是同向机制——本稿 = 「转后台更易被选中 + 完成后主动唤起」，与钉⑥ 同域不冲突。
- 0.1.102 回退域相邻：wakeup 注入面触碰回合队列 = 压缩/watchdog 交互敏感区，判据格须含长静默腿（T7 谱）回归。

## §3 呈批结果（用户 2026-11-14 交互裁定）

1. ✅ **批准，定谳先行**——A/B 双缺口归因定谳腿先行，坐实后按 §1 方案 1/2/3 二选一/组合立落码工单。
2. ✅ **M 面出口预授权**——若定谳坐实 T07 直发属模型自择（M 面）而非产品引导缺，按 A/B 系列纪律不收计划，件 E 封存（无需再呈）。
3. 方案 1 wakeup 注入细节（优先级/去重）归 lock-face，无预答。

## §4 判据格（落码工单预注册素材，随定谳面定形）

wakeup 注入形：完成→注入→下回合可见直证 + T7 长静默腿回归 + watchdog 误杀负断言 + canon 恰合。引导修形形：T07 复验腿（atlas 改走 background 形）+ 文案 diff 面 + 回归零触碰面。

## §5 定谳收口——件 E 封存（2026-11-14，e2e 定谳 r-20261114-wopt-e-longnoop-verdict.md，按预授权②）

**双缺口均不成立 → M 面 → 件 E 封存，不收计划**（用户预授权 2026-11-14 兑现，无需再呈）：

1. 缺口 A（wakeup 注入面）不成立：后台完成→回合注入机制链 TUI 车道源码级全链闭合（enqueuePendingNotification → command queue store → useQueueProcessor 双 useSyncExternalStore 闲时注入 REPL.tsx:3673）；notified 旗标 = 原子 check-and-set 去重闩 + GC 标记，非注入触发器本体。headless 窄 spine 不 drain（loop.ts:332）与 CC 对称非缺口。
2. 缺口 B（编排引导面）不成立：wire 直证 Bash.description 10,761 字符六要素全在（run_in_background 说明/getBackgroundUsageNote/"long running→run_in_background. No sleep needed"/"will be notified — do not poll"/sleep 约束族），与 CC 同构。
3. **归因：T07 atlas 直发 = 模型自择 100%（M 面）；引导 0%、机制 0%**——同模型对直证纪律下双侧同权。
4. 语料注记：B7/T07 atlas wire 零 task-notification 注入回合（唤醒面未被行使非被证伪）；e2e 正证缺席已登记，后续可立 background+idle 验证腿补 wire 直证（本波禁扩腿）。
5. 同域价值沉淀：timeoutMs/钉⑥/mcpAutoBackground/任务通知机制链盘点面（§0 五件表）作为资产留档。
