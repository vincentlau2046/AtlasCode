# core/orchestrator — Agent 循环与编排域

> 状态：Phase A 完成（接口骨架 + 审计文档就位），Phase B 暂不执行
> 门面：`import { ... } from 'core/orchestrator/index.js'`
> 构造方式：`QueryEngine` 类（当前消费 `query()`）；未来 `createOrchestrator()` 经 `factory.ts` 接线

域内 35 文件 / 约 12000 行，承担：Agent 主循环（LLM 流式 + 工具调度 + 错误恢复）、
上下文压缩（auto/reactive/snip/collapse/microcompact）、工具执行管道（权限 + MCP 路由 +
调用 + 遥测）、查询引擎封装。

## 文件地图

### 根级

| 文件 | 行数 | 职责 | 阶段 |
| --- | --- | --- | --- |
| `index.ts` | 85 | 门面 — 三接口 + 状态机类型 + Phase O 导出 + context/compact 域 17 符号（三性收尾 ④-lite 扩面） | O-CLEAN.1 / A5 / 三性收尾 |
| `api.ts` | 76 | `OrchestrationRequest` / `OrchestrationEvent` / `OrchestrationResult` / `Orchestrator` 接口 | A1.1 |
| `QueryEngine.ts` | 1258 | `QueryEngine` 类 + `ask()` 函数 — 包装 `query()` 的引擎层 | O-ENGINE |

### query/ — 主循环

| 文件 | 行数 | 职责 | 阶段 |
| --- | --- | --- | --- |
| `loop.ts` | 1750 | `query()` / `queryLoop()` — Agent 主循环 `while(true)`：LLM 流式、工具调度、错误恢复、压缩编排、附件注入、stop hooks | O-LOOP |
| `transitions.ts` | 70 | `LoopPhase`(5) / `LoopTransition`(6 变体) / `LoopState` / `validateTransition()` 穷举 | A2.2 |
| `config.ts` | 46 | `buildQueryConfig()` — feature gates / session / env 快照 | O-LOOP |
| `deps.ts` | 57 | `QueryDeps` 接口 + `productionDeps()` — callModel / microcompact / autocompact / uuid 注入 | O-LOOP |
| `stopHooks.ts` | 471 | `handleStopHooks()` — stop reason 检查 + blocking error 恢复 | O-LOOP |
| `tokenBudget.ts` | 93 | `createBudgetTracker()` — token budget 决策与 continuation | O-LOOP |
| `continue-site-audit.ts` | 47 | 7 个 continue 站点 → LoopTransition 映射表（审计文档） | A2.1 |

### tools/ — 工具执行

| 文件 | 行数 | 职责 | 阶段 |
| --- | --- | --- | --- |
| `toolExecution.ts` | 1749 | `checkPermissionsAndCallTool()` 单体函数 — 输入验证 + 权限 + pre/post hooks + MCP 路由 + tool.call() + 结果格式化 + 遥测 | O-TOOLS |
| `toolHooks.ts` | 650 | `runPreToolUseHooks` / `runPostToolUseHooks` / `runPostToolUseFailureHooks` / `resolveHookPermissionDecision` — 工具前后 hook 运行器（原 `services/tools/toolHooks.ts`，2026-09-16 归位，旧路径删除） | O-TOOLS |
| `StreamingToolExecutor.ts` | 530 | 流式工具执行器 — 边收 tool_use 边执行，`getRemainingResults()` | O-TOOLS |
| `toolOrchestration.ts` | 193 | `runTools()` — 非流式批量工具执行入口 | O-TOOLS |
| `toolUseSummaryGenerator.ts` | 121 | `generateToolUseSummary()` — Haiku 异步摘要 | O-LOOP |
| `pipeline.ts` | 65 | `ToolMiddleware` 洋葱模型签名 + `ToolPipeline` 接口 + `compose()` | A1.2 |
| `defaultPipeline.ts` | 117 | `DefaultToolPipeline` — 5 中间件槽位（回调注入，骨架） + L1-L4 结构文档化 | A4a-A4d |

### context/ — 上下文压缩

| 文件 | 行数 | 职责 | 阶段 |
| --- | --- | --- | --- |
| `compact.ts` | 1698 | `buildPostCompactMessages()` — 压缩结果构造 + summary/attachments/hooks 组装 | O-COMPACT |
| `autoCompact.ts` | 351 | `autoCompactIfNeeded()` — 主动压缩阈值检查 + 调用 | O-COMPACT |
| `reactiveCompact.ts` | 200 | `tryReactiveCompact()` — PTL/media 错误后被动压缩恢复 | O-COMPACT |
| `snipCompact.ts` | 265 | `snipCompactIfNeeded()` — HISTORY_SNIP 历史裁剪 | O-COMPACT |
| `snipProjection.ts` | 57 | snip 投影 — 被裁剪消息的视图重建 | O-COMPACT |
| `microCompact.ts` | 530 | `microcompactMessages()` — 微压缩（cached MC / API MC） | O-COMPACT |
| `apiMicrocompact.ts` | 153 | API 侧微压缩请求 | O-COMPACT |
| `cachedMicrocompact.ts` | 15 | cached MC 配置入口 | O-COMPACT |
| `cachedMCConfig.ts` | 1 | cached MC 配置常量 | O-COMPACT |
| `timeBasedMCConfig.ts` | 43 | 基于时间的 MC 配置 | O-COMPACT |
| `prompt.ts` | 374 | 压缩 prompt 构造（安全资产，一字不改） | O-COMPACT |
| `grouping.ts` | 63 | 消息分组 — 压缩前的 conversation 分段 | O-COMPACT |
| `postCompactCleanup.ts` | 77 | 压缩后清理 — 旧消息引用清除 | O-COMPACT |
| `compactWarningState.ts` | 18 | 压缩警告状态 | O-COMPACT |
| `compactWarningHook.ts` | 16 | 压缩警告 hook | O-COMPACT |
| `sessionMemoryCompact.ts` | 630 | session memory 压缩 — forked agent 场景 | O-COMPACT |
| `manager.ts` | 63 | `ContextManager` 接口 + `CompactionDirective` 契约 + `LoopStateSnapshot` | A1.2 |
| `defaultManager.ts` | 107 | `DefaultContextManager` — 3 方法回调注入（骨架） + P1-P4 交互点清单 | A3a-A3c |

### llm/ — LLM 调用

| 文件 | 行数 | 职责 | 阶段 |
| --- | --- | --- | --- |
| `query.ts` | 628 | `callModel` 实现 — OpenAI 兼容流式调用 + cache + thinking | O-COMPACT |

## 注入窗口

当前通过 `QueryEngine` 间接消费：

```typescript
import { QueryEngine, ask } from 'core/orchestrator/index.js'

// TUI / headless 入口
const engine = new QueryEngine(config)
for await (const event of ask({ messages, systemPrompt, ... })) { ... }
```

Phase A 后 `factory.ts` 已声明 `CoreDependencies.orchestrator?` 字段（骨架接线，
实际实例化待 Phase B）：

```typescript
import { getCoreDependencies } from 'core/factory.js'

const { orchestrator } = getCoreDependencies()
// Phase B 后: for await (const event of orchestrator.execute(request)) { ... }
```

## 三接口（Phase A 产出，骨架就位）

### Orchestrator

```typescript
interface Orchestrator {
  execute(request: OrchestrationRequest): AsyncGenerator<OrchestrationEvent, OrchestrationResult>
}
```

- `OrchestrationRequest`：镜像 `QueryParams` 13 字段，零偏差
- `OrchestrationEvent`：5 变体联合（StreamEvent / RequestStartEvent / Message / Tombstone / ToolUseSummary）
- `OrchestrationResult`：10 个判别变体（从 12 处 return 压缩）

### ToolPipeline

```typescript
type ToolMiddleware = (ctx: ToolExecutionContext, next: () => Promise<ToolExecutionResult>) => Promise<ToolExecutionResult>

interface ToolPipeline {
  execute(ctx: ToolExecutionContext): Promise<ToolExecutionResult>
  readonly middlewares: readonly ToolMiddleware[]
}
```

洋葱模型，5 个中间件槽位（顺序与 `checkPermissionsAndCallTool` 逐行对应）：
`[telemetryStart] → [permissionCheck] → [mcpRoute] → [toolInvoke] → [resultNormalize]`

### ContextManager

```typescript
interface ContextManager {
  shouldPreCompact(state, messages): Promise<CompactionDirective>    // P1
  shouldPostCompact(state, messages): Promise<CompactionDirective>   // P4
  recoverFromError(state, messages, errorType): Promise<CompactionDirective>  // P2+P3
}
```

`CompactionDirective` 契约：纯决策器——只返回"该做什么"（proceed / yield_boundaries /
yield_tombstone / continue / return_terminal），不执行 yield/return/continue。

## 状态机（Phase A 产出）

| 类型 | 变体数 | 说明 |
| --- | --- | --- |
| `LoopPhase` | 5 | streaming / compaction / tool_execution / recovery / stop_hooks |
| `LoopTransition` | 6+1 | 7 continue 站点 → 6 变体（C4/C5 合并） + 1 exit 变体 |
| `LoopState` | 11 字段 | phase / messages / tracking / recoveryCount / transitionHistory 等 |

`validateTransition()` 提供编译期穷举 switch + 运行时断言。

## 三性状态

- **可独立 patch** ⚠️ — Phase O 已完成文件归位（旧路径 shim 全删，grep=0），
  但 loop.ts（1750 行）和 toolExecution.ts（1749 行）仍为单体函数，
  修改任意段落 diff 无法限制在子目录内。Phase A 接口骨架不改变此现状。
- **可拼接** ⚠️ — `QueryDeps` 注入窗口已就位（callModel / microcompact /
  autocompact / uuid），`getAllBaseTools` 已在 O-CLEAN.3 改为注入。
  但 `query()` 仍直接消费 14 个闭包变量，无法整体替换。
  2026-09-16 三性收尾后补充：门面 ④-lite 全量迁移 + G-1 import 静态门禁
  （`tests/regression/orchestrator-import-gate.test.ts`）+ orch/mp 运行时纯度
  锁定测试（A-3）——依赖方向 D1/D3/D4 门禁已收敛，契约锁定 2/5→4/5。
- **可搬迁** ❌ — 36 文件 / ~12650 行（2026-09-16 含 toolHooks 归位），伴生件数量庞大（54+61 个 import），
  未做独立编译演练。当前不具备搬迁条件。

## Phase B 定界分析与决策

**Phase B 暂不执行**（2026-09-14 决策）。根因：三模块功能定界不清晰——

| 模块 | 定界判定 | 根因 |
| --- | --- | --- |
| Orchestrator | ❌ 不可行 | 1750 行 0% 是"编排"，全部是直接实现 |
| ContextManager | ⚠️ 勉强 | 压缩决策仅占 P1-P4 的 40%，P4 的 208 行 0% 是压缩 |
| ToolPipeline | ❌ 不可行 | 四层按代码顺序而非职责划分，每层混 3-5 种职责 |

详见设计文档 `12-Orchestrator模块设计.md` §十.A。Phase A 骨架保留为目标架构，
重启条件：需要 mock 做测试 / CANN 工具折叠中间件 / LLM 调用层替换 / 行数超 2000。

## 消费方清单

### query() 直接消费方（5 个，全部经门面）

```
screens/REPL.tsx:                    import { query } from '../core/orchestrator/index.js'
tasks/LocalMainSessionTask.ts:       import { type QueryParams, query } from '../core/orchestrator/index.js'
utils/forkedAgent.ts:                import { query } from '../core/orchestrator/index.js'
utils/hooks/execAgentHook.ts:        import { query } from '../../core/orchestrator/index.js'
tools/AgentTool/runAgent.ts:         import { query } from '../../core/orchestrator/index.js'
```

### ask() 直接消费方（1 个）

```
cli/print.ts:                        import { ask } from 'src/core/orchestrator/index.js'
```

### 门禁口径（2026-09-16 三性收尾后，supersede 旧 "grep 深路径 = 0" 表述）

- **静态门禁 = G-1**（`tests/regression/orchestrator-import-gate.test.ts`）：扫 src/+tests/
  全部 ES import/export + 动态 `import()`，断言域外 import 落 `index.ts` 门面
  （入口集 = {index.js}，④-lite；tests 无豁免）。
- **豁免类**（不属静态 import 图，扫描器天然不可见）：CJS `require()` 惰性加载点
  （snipCompact/snipProjection/reactiveCompact/cachedMCConfig）、mock.module 字符串、
  coverage-attack 动态 import（tokenBudget，显式豁免 1 条）；组合根 `factory.ts` 为
  设计内直连豁免（`MP_EXTERNAL_EXEMPT`，injection window，保留 2 条 mp 子路径接线边）。
- **C-8 已闭环（2026-09-16，master `7f5943d`/`d93b58a`）**：mp 域外域 33 文件子路径深导
  全量迁移至 mp 根门面（门面扩 ~30 符号，窄面原则），G-1 R-mp-external 白名单核销至 0
  （P-1「门面唯一」五域判据闭合）；外域→mp 子路径 0 允许，新增即挂。

## 设计文档

- `vault/01-项目/15-AtlasHarness/12-Orchestrator模块设计.md` — 完整设计（Phase O + A + B 定界分析）
- `vault/01-项目/15-AtlasHarness/14-Orchestrator实施评估.md` — 实施评估
- `vault/01-项目/15-AtlasHarness/15-Orchestrator实施前校验报告.md` — 校验报告（2 blocker + 6 设计错误）

## 版本历史

| 日期 | 变更 |
| --- | --- |
| 2026-09-16 | C-8 闭环：mp 外域 33 文件子路径深导全量改走根门面（门面扩 ~30 符号，窄面原则；roles↔capabilities 共享 6 名只从 roles.js 源导出一次）；G-1 R-mp-external 白名单核销至 0 + factory 组合根整文件豁免（`MP_EXTERNAL_EXEMPT`）；P-1 五域判据闭合（master `7f5943d`/`d93b58a`，全量回归 562/2 零新增） |
| 2026-09-16 | 三性收尾（④-lite）：门面 +18 符号（context/compact 域 17 + callModel，Options→LlmQueryOptions）；外域 33 src 行 + 7 tests 行深路径全量迁移至门面；D1 9 行改走 mp 门面；A-1 单实例断言 + A-3 orch/mp 纯度 + G-1 import 静态门禁（mp 外域 40 条白名单=C-8 未闭环）；C-4~C-8 登记（12号§11.5） |
| 2026-09-16 | O-TOOLS 补尾：`toolHooks.ts`（650 行，pre/post hook 运行器）自 `services/tools/` 归位，`services/tools/` 旧路径目录删除（core→services 旧路径边消除，`grep services/tools = 0`） |
| 2026-09-14 | A5 门面收敛 + factory.ts 接线（`orchestrator?` 字段） |
| 2026-09-14 | A4a-A4d ToolPipeline 骨架（5 中间件槽位 + L1-L4 结构文档化 + golden-file 10 case） |
| 2026-09-14 | A3a-A3c ContextManager 骨架（CompactionDirective 契约 + P1-P4 交互点清单） |
| 2026-09-14 | A2.1-A2.2 状态机重写（LoopPhase/LoopTransition/LoopState + 7 continue 审计） |
| 2026-09-14 | A1.1-A1.2 接口定义（api.ts + pipeline.ts + manager.ts） |
| 2026-09-14 | O-CLEAN.3 依赖方向合规化（getAllBaseTools 注入，D1 合规） |
| 2026-09-14 | O-CLEAN.1-2 index.ts 门面 + shim 全删 |
| 2026-09-14 | O-ENGINE QueryEngine.ts 迁入 |
| 2026-09-14 | O-LOOP query/ 5 子文件 + loop.ts 迁入 |
| 2026-09-14 | O-COMPACT 16 compact 文件 + llm/query.ts 迁入 |
| 2026-09-14 | O-TOOLS toolExecution / StreamingToolExecutor / toolOrchestration 迁入 |
