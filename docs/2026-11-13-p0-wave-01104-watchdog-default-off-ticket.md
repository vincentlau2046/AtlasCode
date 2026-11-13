# 0.1.104 插入波工单——watchdog 缺省纠偏 + per-tool timeoutMs 声明面（用户 P0 报告：loop 延续断裂）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-13）。
> 上游：用户 2026-11-13 P0 报告——0.1.102 后「任务连贯性几乎被破坏，无法独立完成有效的 loop 延续」；分诊嫌疑 = 切片 2-B 回合内看门狗（`c87b8621`+`9f88c44b`）误杀合法慢；0.1.103 S3a 已排除（纯搬移字节恒等）。临时缓解已交用户（`ATLAS_LOOP_WATCHDOG_MS=0`）。
> 排期勘误：本波插 0.1.104，S3b 顺延 0.1.105，ENV 专项顺延 0.1.106。

## §0 波前审视（活码重核 @ master 9b79a635，f4 2026-11-13）

### 0.1 watchdog 现形（活码锚）

- `src/engine/query/loopWatchdog.ts:26` `DEFAULT_LOOP_WATCHDOG_MS = 120_000`；`:33` `resolveLoopWatchdogTimeoutMs`——env **未设 = 120s 开启**（fail-open 到「开」，本波翻转为 fail-safe 到「关」）。
- arm/disarm 单点 = loop.ts:825 链（round_start arm / round_end·loop_end disarm）；活动源单点 = deps.emit（noteEvent）——**任意已到达事件 reset 计时窗**。
- 「在途即活」四豁免（lock-face §6.1）覆盖：轮间 idle / permission·defer / **在途工具** / backoff。**模型请求在途未单列**——其活动性依赖流式事件到达。

### 0.2 误杀形态定谳（用户症状吻合链）

noteEvent 单源只计「已到达事件」。合法慢但**事件面断裂**形态：① 非流式/网关整包缓冲的模型请求（>120s 无增量）；② reasoning 模型长静默思考（部分网关不吐 reasoning 增量）；③ 心跳枚举外长操作（四豁免「在途工具」依赖在途集判定面，工具类型覆盖不全时漏计）。三者 = **回合合法在途但 120s 零事件** → watchdog abort → loop 延续断裂。gate-102 G1a/G1b 判据面（合成事件流「有活动不触发 / 真空闲不触发」）**未含第三面「在途但零事件」**——判据设计缺口，本波补格（§4 格 6）。

### 0.3 per-tool timeoutMs 现状

无工具级协作式超时面（grep 零命中 engine tools timeoutMs）；#260 600s 门族 = 主请求路径非工具级；长工具心跳（W-C C4-3）= 心跳非预算。DSH 引证（`docs/2026-11-12-p0-triple-user-report-design-proposal.md` §2-v2）：`timeout-policy` 111L——工具声明 `timeoutMs` → wrapper arm deadline → 到期结构化 `TOOL_TIMEOUT` isError tool_result；嵌套 deadline 消歧（外层 timer 读作上游 cancel 不误记）；无声明 = 无限期（cooperative）。登记池既有件提级入波。

### 0.4 设计原则转向（事故沉淀）

「loop 级猜挂起」= fail-visible 但误杀面系统性大（合法慢不可枚举），降为 **opt-in 诊断工具**；「声明预算」= 工具最懂自身时长，为主力。看门狗本体不删（opt-in 保留，真挂起场景仍有可见中止面）。

## §1 波定义

- **波名**：watchdog 缺省纠偏 + per-tool timeoutMs。**版本**：0.1.104。
- **切片 1 watchdog 缺省改关**：`resolveLoopWatchdogTimeoutMs` env 未设/空 → **返 0（关）**；env 显式设正值 → 生效（opt-in）；`0` 仍 = 显式关；非法值 → 关（fail-safe 同向）。错误行文案同步（opt-in 提示语）。CHANGELOG 行为句（缺省行为变化：0.1.102–0.1.103 缺省 120s 开 → 0.1.104 起缺省关）。
- **切片 2 per-tool timeoutMs 声明面**（DSH timeout-policy 形）：工具声明 `timeoutMs` → toolExecution wrapper arm deadline → 到期替换为结构化 `TOOL_TIMEOUT` isError tool_result（content = 模型可见消息 + error.code，模型可路由重试）；**无声明 = 无限期（cooperative，零行为变更）**；嵌套 deadline 消歧（外层 wrapper 先触发的 timer 读作普通上游 cancel）；AbortSignal 贯通（到期 abort 该工具执行）。首批声明清单 lock-face 定（候选 = 已知长操作工具族；禁全量缺省预算——无据数值不拍头）。
- **非目标**：watchdog 删除（opt-in 保留）；自动回合重建（登记池）；心跳枚举全量扩充（缺省关后不紧迫）；S3b/ENV 内容零混入。
- **性质**：修复+能力波（判据清晰，体量小）。

## §2 Global Constraints

1. 缺省行为变更面 = 仅判据格显式覆盖两点（watchdog 缺省关 / timeoutMs 到期替换）；无声明工具链零行为变更（canon 前滚面）。
2. row F 全程；判据面冻结先于落码；Atlas-reveiw 审计先于双信号。
3. 段 L 硬门条款（e2e GATE-PASS + f4 采认双在案）；build 紧贴 publish + SRI 记 tree commit。
4. 真实环境零污染；探针 designated-only；npm 一律 --registry npmjs.org。

## §3 工作段

段 D lock-face（切片 1 env 解析终形 + 切片 2 wrapper 挂点/toolExecution 集成面/首批声明清单/TOOL_TIMEOUT 消息终形）→ 段 I → 段 G（§4 判据格 + 前滚 standing + canon 净域）→ 段 L → f4 收口。

## §4 判据格（预注册，e2e 侧承接）

| # | 格 |
|---|---|
| 1 | **缺省关格**：无 env → watchdog 恒不 arm（合法慢 >120s 零事件回合不中止）——真实形态 pty 腿（模拟 >120s 无事件合法在途，如声明长 timeoutMs 工具执行），RED（0.1.103 缺省杀）→ GREEN |
| 2 | **opt-in 格**：env 设正值 → 真挂起可见中止 + 可重入（既有 G1/G2 面回归，env 注入腿） |
| 3 | **timeoutMs 到期格**：声明 5s 工具 + 10s 实执行 → 结构化 `TOOL_TIMEOUT` isError tool_result（模型可见）+ 回合继续 + 二轮可重试 |
| 4 | **无声明永限期**：未声明工具长执行零干预（cooperative 零行为变更面） |
| 5 | **嵌套消歧格**：外层 deadline 与内层工具 deadline 并存时序正确（外层先到不误记内层超时） |
| 6 | **合法慢不误杀格（standing）**：格 1 固化为回归格（防未来缺省回翻） |
| 全波 | 前滚 standing 14 腿 + 零持久残留 + canon 净域（Δ 容许 = 新格族面） |

## §5 Review Focus（Atlas-reveiw 焦点建议）

1. 切片 1：env 解析形兼容面（现网已设 `ATLAS_LOOP_WATCHDOG_MS` 用户面——设值者 opt-in 意图明确零破坏；未设者 = 翻转目标面，CHANGELOG 登记）。
2. 切片 2：wrapper 挂点与 defer/permission 暂停面交互（permission 等待期是否计预算——建议不计，与 watchdog 四豁免同源单源）；TOOL_TIMEOUT 消息对 provider 兼容面（isError tool_result 形既有惯例）；AbortSignal 贯通对子进程清理面。
3. 缺省关后的真挂起暴露面：无 watchdog 时网关真挂起 = 恒挂回旧形态——缓解 = timeoutMs 首批清单覆盖长操作族 + 用户可 opt-in + 挂起面登记（诚实登记残余风险，不静默）。
4. 格 1 pty 腿时长成本（>120s 探针）——可用 env 注入缩短窗（opt-in 1-2s）证同构逻辑，真实 120s 形态抽测一腿。

## §6 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main 段 D → 段 I → 段 G → 段 L → f4 收口。row F 全程。
