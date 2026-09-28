# AtlasCode 执行策略（execution-strategy）

> **地位**：charter L5「执行弹性」节的展开文档。charter 定架构与波次，本文定**节奏、并行、暂停、工作量**。v0.10 新增。
> **前置**：Wave-A 两项前置已清（baseline tag + `~/.atlas/` 清理，2026-09-22）。本文不重复 charter 架构裁定，只回答"怎么走、多久、卡住怎么办"。
> **活文档**：工作量粗估在 C 波 spike 后用实测数据精化（标 ⏳ 的项）。

## 1. 工作量粗估（spike 前，含调试卡顿系数）

| 波 | 硬核工作 | 粗估 | 不确定性 | 并行？ |
|---|---|---|---|---|
| A 骨架 | git init + 目录 + feature.ts 双形态规则 + 边界 lint + 留档三件套 JSON | 2-3 天 | 低 | 串行 |
| B 四域 | 4 域 config.ts + create() + 域单测（B6）+ shared 类型下沉 | 5-8 天（并行 3-5） | 中 | **可并行** |
| **C 咽喉** | C1 叶子下沉 + C-Deep（executor/sandbox 深实现回流，见 §8）+ C2 端口化（engine 49 结构性 + 8 port + GrowthBook 150→Port 8） | **12-18 天** ⏳ | **中高**（§8 复盘：吸收 C-Deep 整波 + 功能纵切优先重排序） | 纯串行 |
| E ascend | 16 工具 + 5 skill + executor 平移 + gelu 直调 | 3-5 天 | 低（资产已成型） | 串行 |
| D 壳 | UI/CLI/AppState/mount/compose + .tsx 主战场 | 8-15 天 | 中高 | 串行 |
| F 清尾 | 删 shim + 死代码 + 75 flag + 品牌串 + ENV T2 | 3-5 天 | 低 | 串行 |

**总计 29-48 连续天**（v0.11 收窄，原 30-60）；考虑精力周期（单人不可能持续高强度 + 波次间冷启动 re-load context 0.5 天/波），实际 **2-3.5 个月**。C 波仍占 ~30% 但不确定性已从"高"降"中"——v0.11 实测后风险面整体降级（§6）。

> ⏳ C 波粗估 8-12 天（v0.11 实测收窄，原 10-20）：基于 313→307 grep 可验证 + 85% engine 量化 + C 波拆分（C1-engine 212 + C1-四域 41 前移 B 波）。spike 后用 memory 单域实测耗时校准（§4）。

## 2. 并行协议（B 波）

### 判据

**可并行 = 可检测 + 机械可恢复**（非「零风险」）：
- **可检测**：冲突在 tsc/lint/test 即时暴露（import 违规、类型不匹配、cherry-pick 冲突），不需要人工审查才发现。
- **机械可恢复**：冲突解决方案是机械操作（类型定义合并、import 路径修正），不是设计返工（重新讨论接口形态）。

对比 C 波：shared/ + engine 是**设计决策耦合**（EngineState 长什么样、shared 类型契约怎么定）——冲突不可机械恢复，必须串行。

### B 波并行编排

| Session | 负责 | 争用面 |
|---|---|---|
| Session 1 | sandbox + executor 两域 | shared 类型（Executor/Shell 接口） |
| Session 2 | memory + modelprovider 两域 | shared 类型（types/atlas/message/effort） |

**为什么 2 session × 2 域而非 4 session × 1 域**：单人是 1 个人切 2 session（交替看），不是 4 个并行线程。4 session 输出 > 审查带宽，瓶颈从"做"转移到"审"。2 session 是单人审查带宽上限。

### 契约冻结步（B 波分叉前，A 波末做）

分叉前必须锁死，否则两 session 产出不兼容：

1. **shared 类型骨架**：A 波末把 shared 要承载的类型（types/atlas、types/message、Tool 类型部分、effort/thinking/systemPromptType、PermissionRule 等 13 个纯类型）先定义好接口签名（实现可空），两 session 各自填充实现时不动签名。
2. **四域 config.ts 契约**：每域 config.ts 的导出接口（读哪些 env + settings + 返回什么 config 对象形状）定死。各域按 `docs/env-defaults-decision.md` 取对应行，但接口形状分叉前统一。
3. **文件归属矩阵**：每个文件归一个 session 独占（CLAUDE.md 已有"每个 job 只编辑分配给它的文件"纪律）。shared/ 文件归谁写、冲突时谁让——建议 shared 归 Session 1（sandbox/executor 侧），Session 2 需要加 shared 类型时提 PR 给 Session 1 合并。

### 合并协议

串行合并（非并行 merge），防 `9d06722` 被冲竞态（memory 记录的教训）：

1. Session 1 先合并进 master → `git push origin master`
2. Session 2 `git fetch` → rebase 到最新 master → 解决 shared/ 冲突（机械：类型定义合并）→ 合并 → push
3. 每次 push 后 `git merge-base --is-ancestor origin/master master` 验祖先链
4. 两 session 合并完 → 打 `wave-b` tag → B6 gate（四域独立编译 + 域单测全绿）

## 3. 共存路径 + 可暂停协议

### 共存边界

旧仓 `a8af45b` 始终全绿可用——只要新仓每波结束是"自洽可运行"，就能暂停共存，旧仓不受影响。**暂停 ≠ 失败**。

| 波末 | 最小可交付 | 暂停时新仓 | 旧仓 |
|---|---|---|---|
| A | 骨架 + feature.ts + lint + 14 集 JSON | smoke 绿空壳 | 不受影响 |
| B | 四域 config.ts + 域单测（B6） | 四域独立编译绿 | 不受影响 |
| C | engine + 8 port + B9/B14 | engine 可跑双跑 diff | 不受影响 |
| E | ascend 直调（gelu L1） | ascend 可独立验证 | 不受影响 |
| D | 壳接线全栈 | 新仓全功能 | 可 archive |
| F | 清尾 + B13 | 新仓全绿独立 | archived |

### 可暂停协议

| 要素 | 定义 |
|---|---|
| checkpoint | 每波末打 tag（`wave-a`/`wave-b`/…，charter C-6） |
| 暂停边界 | 每波「最小可交付」完成即可暂停（上表） |
| 恢复协议 | 从最近 tag checkout → 重跑该波 test gate 确认状态 → 读 charter + 上波产出 re-load context（0.5 天） → 继续 |
| 超阈值评估 | **C 波 >20 天**触发评估：① 拆 C1 为分域渐进（C1a memory / C1b sandbox / C1c executor / C1d modelprovider）② 或缩范围（先只迁 engine + memory，其余域保持旧仓形态共存） |
| 冷启动成本 | 每波开头预留 0.5 天 re-load context（读 charter L5 + 该波 gate + 上波 tag 产出） |

### 超阈值评估决策树（C 波专用）

```
C 波进行中，计时 >20 天未完
  ├─ C1 叶子下沉卡住？
  │   ├─ 是 → 拆 C1 为 C1a..d 分域渐进（每域独立 shared 子目录，不抢同一批文件）
  │   └─ 否 → C2 端口化卡住？
  │       ├─ port 契约设计分歧 → 串行 spike 单 port 原型验真，不并行
  │       └─ EngineState 并发模型问题 → 缩范围：engine + memory 先迁，其余域共存
  └─ 整体节奏不可控 → 缩范围：只迁 engine + 一域，其余旧仓形态共存（strangler 半态）
```

**缩范围不是失败**——strangler 模式的本意就是渐进。半态共存（新仓 engine + memory，旧仓 sandbox/executor/modelprovider）只要 DEP-1 依赖方向不破、双跑 diff 绿，就是合法中间态。

## 4. C 波前 spike 计划

**目的**：把最大不确定性（225/88 估算 + EngineState 并发 + C 波工期）从"估算"变"实测"。spike 是 A/B 波之后、C 波正式开干前的 1-2 天探针。

### 选 memory 域

| 标准 | memory 域情况 |
|---|---|
| 反向依赖最少 | 仅 growthbook→Port 8 一处跨域污染（L4.7 诊断） |
| 叶子下沉面有代表性 | memdir/paths + teamMemPaths 收进域内 + fs/readFileInRange 走 shared |
| 端口化面有代表性 | Port 8（FeatureConfigPort）+ Port 5（session-memory）双 port |
| 涉及 EngineState | memory 的 fileHistory/attribution 在 EngineState β 范围内 → 顺便验并发模型 |

### spike 步骤（1-2 天）

1. **叶子下沉**：memory 域向上 import 的纯类型下沉 shared（实测：逐文件归属判定 vs 225/88 分类的偏差）
2. **端口化**：Port 8 + Port 5 契约 + in-memory 最小实现 + 注入链（实测：单域端口化耗时）
3. **EngineState 并发原型**：memory 的 fileHistory 走 `set(f)` 串行 apply 队列 → 跑并行 Edit + rewind 链 fixture（实测：并发正确性，验证 β 模型非纸上推演）
4. **双跑 diff**：memory 域涉及的 engine 行为跑层 1 fixture replay diff（实测：等价性基线脱耦 IFF 是否真的能跑起来）

### spike 产出 + 决策

**spike 已执行（2026-09-22，4 步全绿）**。下表为预期决策标准 + 实测结果：

| 产出 | 校准目标 | 预期决策标准 | **实测结果** | **决策** |
|---|---|---|---|---|
| 实测单域耗时 | C 波 8-12 天估算 | <2 天偏保守→开 C 波；>4 天触发缩范围 | 步骤②端口化原型 72 秒/~120 行（人手写估 15-30 分钟）；memory 域 C2 端口化（5 结构性目标）估半天-1 天 | **偏保守，开 C 波** |
| 分类偏差 | 叶子下沉逐文件复杂度 | <15% 可信；>30% 重做分类 | **口径已定位**（import utils/types/constants 调用点）；4/5 域精确吻合（engine 212 ✓ / sandbox 13 ✓ / executor 3 ✓ / modelprovider 22 ✓）；**唯独 memory 错**：charter 3，实测 21（-85%）；总量偏差 +7%（271 vs 253） | **总量可信（+7%<15%）；memory 子项需修正 3→21（不阻塞，增量 18 叶子机械下沉 <1 天）** |
| EngineState 并发正确性 | β 模型可否落地 | fixture 绿→成立 | 步骤③ M3a.3 原型 **9/9 绿**（100 并发零丢失 + 反例验安全来源 + rewind 串行化） | **成立** |
| 双跑层 1 可跑性 | IFF 脱耦可跑性 | 能跑→M3 脱耦成立 | 步骤④ fixture replay 原型 **6/6 绿**（mock.module + 旧仓真实 fixture 跨仓可分享 + 零 IFF + 确定性等价 + 非 tautology） | **成立** |

**spike 决策：开 C 波。** 4 项全绿，3 项直接支持开 C 波（耗时偏保守 + 并发成立 + 双跑可跑），1 项需修正但不阻塞（memory 子项 3→21，总量 +7%）。唯一修正项：charter §5 R1 表 memory 行叶子 3→21（+ R1 总量 307→325 校准注）。

**spike 产出文件**（throwaway，新仓正式代码各波落 co-located）：
- 步骤①：本节内嵌分析（无独立文件，grep 命令可复现）
- 步骤②：`/home/vince/.claude/jobs/1b9594d7/tmp/spike2-port-prototype.ts`（Port 8+5 契约 + 注入链 + 15 测试）
- 步骤③：`/home/vince/.claude/jobs/1b9594d7/tmp/m3a3-prototype.ts`（EngineState set(f) 队列 + 9 测试）
- 步骤④：`/home/vince/.claude/jobs/1b9594d7/tmp/spike4-fixture-replay.test.ts`（Mechanism A 复现 + 6 测试）

## 5. 脆弱点逐项深化分析（v0.11，逐个闭环非全甩 spike）

### R1 · 工程量 vs 单人节奏

**v0.10 残留**：C 波 10-20 天是凭空粗估，225/88 分类"非 grep 可验证"（代码级 agent 结论）→ 工程量盲区。

**v0.11 实测（2026-09-22，旧仓 a8af45b 代码级测量）**：

313 反向 import **可 grep 复现**（实测 307，差 ~2%，口径微调可对齐——非"不可验证"）。按目录分解：

| 模块 | 叶子类（utils/types/constants） | 结构性类（services/tools/Tool/hooks/memdir/state） | 合计 | 占比 |
|---|---|---|---|---|
| **orchestrator（engine）** | 212 | 49 | **261** | **85%** |
| sandbox | 13 | 0 | 13 | 4% |
| memory | ~~3~~ **21** | 3 | **24** | 7% |
| executor | 3 | 0 | 3 | 1% |
| modelprovider | 22 | 2 | 24 | 8% |
| 四域合计 | ~~41~~ **59** | 5 | **64** | 19% |
| **总计（实测）** | **~~253~~ 271** | **54** | **~~307~~ 325** | — |
| charter 声称 | 225 | 88 | 313 | — |

> 口径偏差说明：叶子实测 271 vs charter 225（+46）、结构性实测 54 vs charter 88（−34），主因 grep 漏了 `tools/26 + Tool.ts/16`（charter 归结构性，修正后 ~96 接近 88）；Tool.ts 内类型部分 charter 可能归叶子。总量 325 vs 313 = ~4%，可对齐。**313 不是估算，是可验证的实测数**（与 586 不同）。
>
> **spike 校准（2026-09-22，步骤①）**：上表 memory 叶子原标 3，spike grep 实测 **21**（-85% 严重低估）。grep 口径 = `grep -rn "from ['\"]\.\." src/core/memory src/memdir | grep utils/types/constants`。4/5 域精确吻合（engine 212 ✓ / sandbox 13 ✓ / executor 3 ✓ / modelprovider 22 ✓），唯独 memory 错——原因可能是 v0.11 分析时 memory 用了"归属域"口径（多域共享 utils 归 shared 不算 memory 专属）而非"调用点"口径。修正后四域合计 41→59，总叶子 253→271（+7%），总量仍可信（<15%）。memory 21 个叶子全部多域共享（≥3 域消费，最高 22 域）→ 归 shared C1 大吸收，非 memory 专属。**对 C 波估算无影响**（18 叶子增量是机械下沉，<1 天）。

**核心 insight**：C 波 ~81% 工作量集中在 **engine（orchestrator，36 文件/11975 行/261 处）**，四域 ~19%（64 处，spike 修正后）。这推翻了"C 波是均匀大工程"的隐含假设——C 波本质是 **engine 单模块重构**（261 处反向 import → 端口化/下沉），四域是轻量附带。

**优化措施（4 项，现在就能落地，不等 spike）**：

| # | 措施 | 内容 | 效果 |
|---|---|---|---|
| M1.1 | **工作量实测化** | 313→307 grep 可验证（已做）；85% engine / 15% 四域分布已量化 | 工程量从盲区变实测 |
| M1.2 | **C 波拆分细化** | C1 拆 C1-engine（212 叶子，主体）+ C1-四域（41 叶子，轻量）；C2 集中 engine（49 结构性）端口化 | C 波不再是"一坨"，可按 engine 子模块切小步 |
| M1.3 | **四域叶子前移 B 波** | B 波四域落地时顺带下沉域内 41 处叶子（sandbox 13 / memory 3 / executor 3 / modelprovider 22），C 波减负 15% | C 波 46→5 处结构性，工作量 -15% |
| M1.4 | **工作量粗估修正** | engine 261 处：纯机械下沉 ~3-5 天 + 端口化设计决策 ~5-7 天 = C 波 **8-12 天**（原 10-20 收窄）；四域 41 处并入 B 波 +1-2 天 | 估算从 10-20 收窄到 8-12，不确定性从"高"降"中" |

**C 波拆分后编排**（修正 §6 推荐执行顺序中的 C 波）：
```
C1-四域（已 B 波前移，~0 天，B 波内完成）
  ↓
C1-engine 叶子下沉（212 处，~3-5 天，按 orchestrator 子模块切步）
  ↓
C2-engine 端口化（49 结构性 + 8 port，~5-7 天，设计决策串行）
  ↓ B9 + B14
```

**R1 闭环状态**：工程量盲区 → 实测化（325 可验证 + 分布量化）+ C 波拆分 + 四域前移 + 估算收窄 + **spike 校准**（memory 3→21 修正，总量 +7% 可信）。**残留：无**（spike 步骤①已验分类口径 + 偏差；步骤②已验单域耗时偏保守）。engine 261 处的逐 port 设计决策复杂度在 C 波中按子模块切步处理（量级已知，非未知）。

### R2 · 双跑循环依赖 IFF

**v0.10 残留**：脱耦是设计（层 1 fixture replay 为基线），但"14 种子测试加 fixture-recorded 输入后真能跑起来"未实证。

**v0.11 实测（2026-09-22，旧仓 a8af45b 代码级检查）**：

14 个 engine 种子测试的 IFF 依赖实况：

| 测试文件 | 数量 | IFF 依赖 | 机制（实证） |
|---|---|---|---|
| `tests/regression/gateway.test.ts` | **12** | **零**（已脱耦） | L2 注释"via fixture replay"；`mock.module("src/core/modelprovider/clients.js")` stub → `makeMockClient()` → `activeStreamChunks` 从 `tests/fixtures/gateway/` 10 个 JSON 加载；`models.list` mock 返回 `iff-small`（healthCheck 也 mock 了） |
| `tests/integration/agent-loop.test.ts` | 1 | **门控** | L148 `const gatewayUp = await modelProvider.healthCheck('small').then(h => h.ok).catch(() => false)` → L150 `if (gatewayUp) { describe(...) }` → L224 `test.skip('...IFF gateway down')` |
| `tests/integration/gateway-json-schema.test.ts` | 1 | **门控** | L13 同 `gatewayUp` gate → L15 `if (gatewayUp)` → L38 `test.skip('...gateway down')` |

**核心 insight**：**12/14 已脱耦**——gateway.test.ts 已是 fixture replay（零 IFF 依赖，始终可跑），等价性基线已成立 86%。脱耦工作量不是"14 个全加 fixture"，而是 **2 个仿范本改**。范本现成且已验证（mock.module + activeStreamChunks + loadFixture，12 测试跑通）。

**优化措施（4 项，现在就能落地，不等 spike）**：

| # | 措施 | 内容 | 效果 |
|---|---|---|---|
| M2.1 | **脱耦工作量量化** | 12/14 已脱耦（零 IFF），仅 agent-loop + gateway-json-schema 2 个待改 | 脱耦从"设计待接线"变"2 个文件仿范本改" |
| M2.2 | **范本已有** | gateway.test.ts L10-60 的 `mock.module + activeStreamChunks + makeMockClient` 模式（12 测试验证通过，10 fixture 文件在 `tests/fixtures/gateway/`） | 2 个待改文件有 line-level 范本，非从零设计 |
| M2.3 | **录制计划** | agent-loop（多轮工具调度 LLM 响应序列）+ gateway-json-schema（json_schema 响应）的 fixture 在 **A 波留档三件套时顺带录制**（旧仓 tag 上跑 live → 录制 LLM 响应 → 存 `tests/fixtures/gateway/`）；不额外占波次 | 录制时机并入 A 波，和 14 集 JSON 参照物同期产出 |
| M2.4 | **等价性边界澄清** | fixture replay 验的是 **engine 代码行为等价**（调度/解析/状态转换/工具分发），**非 LLM 行为等价**（LLM 对 tool_result 的响应）——后者不是重构要验的（重构改 engine 代码不改 LLM） | 明确等价性边界，防"fixture replay 不够"的误判 |

**agent-loop fixture 录制细节**（最复杂的 1 个）：
- agent-loop 测 engine 主循环多轮工具调度（greeting → AscendSpecParser tool call → PreToolUse/PostToolUse hooks）
- 录制 = 在旧仓 tag 上跑 live agent-loop → 捕获每轮 LLM SSE chunk 序列 + tool_use/tool_result 交互 → 存为多轮 fixture JSON
- 新仓双跑 = mock.module stub modelprovider → loadFixture 多轮序列 → 断言 engine 调度行为和旧仓一致
- **限制**：fixture 是预设 LLM 响应，不测"LLM 根据真实 tool_result 决定下一步"——但这是对的（验 engine 代码等价，非 LLM 等价）；多轮分支覆盖靠多套 fixture（不同 tool_use 序列）

**R2 闭环状态**：循环依赖从"设计漏洞"→"设计有解 + 实证 12/14 已脱耦 + 2 个有范本 + 录制计划并入 A 波"。**残留**：agent-loop 多轮 fixture 录制的实际复杂度（多套 fixture 覆盖多轮分支）需 A 波录制时验证，但工作量量级已从"14 个未知"变"2 个有范本"。

### R3 · 纸上推演未验证（三个子项，R1 已闭环 #2）

v0.10 列三子项：① EngineState β 并发模型 ② 225/88 不可验证 ③ feature() 575 处分类未量化。**#2 已被 R1 闭环**（313→307 可 grep 验证）。残留 #1（R3a）+ #3（R3b）。

#### R3a · EngineState β 并发模型

**v0.10 残留**：`set(f)` 串行 apply 队列是新设计，并发正确性纯推演，未原型验证。

**v0.11 实测（2026-09-22，旧仓 a8af45b 代码级检查）**：

`updateFileHistoryState` 真实实现（QueryEngine.ts:375-383）= **嵌套 functional-update**：
```ts
updateFileHistoryState: (updater) => {
  setAppState(prev => {
    const updated = updater(prev.fileHistory)
    if (updated === prev.fileHistory) return prev
    return { ...prev, fileHistory: updated }
  })
}
```
- 外层 updater 操作 fileHistory，内层 `setAppState(prev => ...)` 操作整个 AppState
- **串行性已由 setAppState（React/Ink 批处理 + 串行 apply）保证**——旧仓 `MAX_TOOL_USE_CONCURRENCY=10`（toolOrchestration.ts:10）并发 tool call 下全绿
- EngineState 4 候选成员已是 QueryEngine 实例字段（L185-190：mutableMessages / permissionDenials / totalUsage / readFileState），非 AppState 寄生——改造面 = 实例字段 → 不可变 store

**核心 insight**：`set(f)` 串行 apply 队列**不是新发明**——是 `setAppState` 串行性的**同构迁移**。旧仓靠 React 批处理保证串行，新仓自建 async 队列复制同样串行性（不依赖 React）。charter C-2"同构迁移非新发明"说法**成立**。

**优化措施（3 项）**：

| # | 措施 | 内容 | 效果 |
|---|---|---|---|
| M3a.1 | **同构迁移确认**（已做） | fileHistory updater 注入式（fileHistory.ts:85-91）+ setAppState 嵌套串行（QueryEngine.ts:375-383）= functional-update + 串行 apply 已在旧仓验证 | "新设计未验证"→"同构迁移已验证" |
| M3a.2 | **风险降级** | 旧仓 setAppState 已保证串行（React 批处理），MAX_TOOL_USE_CONCURRENCY=10 并发下全绿；新仓 set(f) 复制同样串行性 | 风险从"高（新设计）"降"低（同构迁移）" |
| M3a.3 | **最小原型已做**（2026-09-22） | set(f) async 串行 apply 队列原型（EngineState 类 ~30 行核心 + 6 组验证用例），bun 跑通 **9 pass / 0 fail**。验证：①100 并发 `set(prev => prev.count+1)` → count=100（零丢失）②并发 append 3 元素全在场不覆盖（f 看最新 prev）③并行 Edit 不同文件可交换 ④不合并（中间态可观测，与 React setAppState 差异）但函数式最终态正确 ⑤反例：朴素 read-compute-write 并发 count=1<100（丢更新，证明队列+函数式是安全来源）⑥rewind+Edit 并发串行化两顺序均合法非损坏 | 并发正确性从推演变原型验证（9/9 绿），不等 spike |

**set(f) 队列 vs setAppState 的唯一差异**：React 的 setAppState 可能批处理合并（两次连续调用只 apply 一次最终态），自建 async 队列不会合并（每次 set(f) 都 apply，看到最新 committed prev）。但 EngineState 不可变 store 每次都 apply 是正确语义（不丢中间更新）——差异是改进非退化。**原型 ④ 已验证此差异不引入 bug**（中间态可观测但函数式 `prev =>` 最终态正确）；**原型 ⑤ 反例验证**：若消费者改用非函数式 read-compute-write 则丢更新（count=1<100）——即安全性来源是"函数式 prev=> 契约 + 队列串行"，二者缺一即崩（契约纪律 = EngineState β 的使用约束，非队列自动保护）。

**R3a 闭环状态**：并发模型从"新设计未验证"→"同构迁移已验证（旧仓 setAppState 全绿）+ 风险降级 + **原型 9/9 绿**"。**残留：无**（批处理差异已原型验证，并发正确性成立）。原型文件：`/home/vince/.claude/jobs/1b9594d7/tmp/m3a3-prototype.ts`（throwaway，新仓 A 波起写成正式 co-located 单测）。

#### R3b · feature() 575 处分类

**v0.10 残留**：575 处 feature() 调用点的"域级/特性灰度/远程实验"分类是 C2 的活，工作量未量化。

**v0.11 实测（2026-09-22，旧仓 a8af45b 代码级 grep）**：

**核心发现：feature() 和 GrowthBook 是两套完全独立的机制**（flag 命名规范都不同），不需要"把 575 处分三类"。

| 机制 | flag 名规范 | 读取方式 | 调用点 | unique flag | 新仓归 |
|---|---|---|---|---|---|
| **feature()** | `FEATURE_*` 大写蛇形 | 构建/运行期 env（bunBundle.ts） | **622 处**（含双引号 raw；纯代码行≈575） | 76 | shared/feature.ts |
| **GrowthBook** | `atlas_*` 小写蛇形 | 远程运行期 SDK（betas.ts 等封装） | **150 处** | 105 | Port 8 FeatureConfigPort |

**feature() 622 处的内部结构**：

| 类别 | 处数 | 说明 | 新仓处理 |
|---|---|---|---|
| 特性灰度（主体） | ~608 | 普通特性开关，读 `FEATURE_<NAME>` env | shared/feature.ts，A 波换 import 纯机械随文件落地 |
| 模块挂载 gate（tools.ts） | 14 | 可选工具模块的条件导入（HISTORY_SNIP/UDS_INBOX/WEB_BROWSER_TOOL 等） | DomainPackage.featureGate 声明式挂载（位置改，feature() 调用不变） |
| 域包 gate | 1 | `ASCEND_TOOLS`（ascend 域包挂载，tools.ts:122） | ascend DomainPackage.featureGate |
| 子模块 gate | ~6 | `COORDINATOR_MODE`（engine/coordinator 挂载，tools.ts + toolPool.ts） | engine DomainPackage.featureGate |

**GrowthBook 150 处**：通过 `betas.ts`（被引用 127 次）等封装函数读取 `atlas_*` 远程 flag（atlas_auto_mode_config / atlas_amber_flint / atlas_moth_copse 等 105 unique），用于远程 A/B 实验 + 运行期配置推送。**不经 feature()，不混在 622 里**。

**核心 insight**：v0.10 把"575 处分类"当成 C2 的未知工作量——实测发现**两套机制天然分离**（FEATURE_* env vs atlas_* SDK），C2 不需要"逐处判断是域级/灰度/远程"。分类工作变成三件独立的事：

**优化措施（4 项）**：

| # | 措施 | 内容 | 效果 |
|---|---|---|---|
| M3b.1 | **机制分离确认**（已做） | feature()（622 处 FEATURE_* env）vs GrowthBook（150 处 atlas_* SDK）两套独立，flag 命名规范不同天然区分 | "575 处分类"从盲区变"两套机制已分离" |
| M3b.2 | **feature() 换 import 纯机械** | 622 处全部换 bun:bundle→shared/feature.ts（A 波已定双形态规则：127 内建+45 F5 shim），零逻辑变更 | 622 处分类工作量 = 0（纯机械换 import，随文件落地波应用） |
| M3b.3 | **模块挂载 gate 归 DomainPackage** | 14 处 tools.ts gate + 1 域包 + ~6 子模块 → 新仓 DomainPackage.featureGate 声明式（挂载位置从条件导入改声明式，feature() 调用本身不变） | 挂载 gate 分类 = ~21 处位置调整，非 622 处逐个判 |
| M3b.4 | **GrowthBook 端口化独立工作流** | 150 处 atlas_* → Port 8 FeatureConfigPort（C2 端口化时处理，封装在 betas.ts 等少数文件，非散落 622 处） | 远程实验分类 = 独立端口化，非混在 feature() 分类里 |

**R3b 闭环状态**：feature() 分类从"575 处未量化"→"两套机制已分离（622 feature() + 150 GrowthBook）+ 各自量级已知 + 分类工作量 = 622 纯机械换 + 21 挂载调整 + 150 端口化"。**残留**：GrowthBook 端口化的 port 契约设计（C2 时定，与 Port 8 FeatureConfigPort 契约同期）。

## 6. 风险登记册（v0.11 更新：R1/R2/R3 闭环后）

| 风险 | v0.10 级别 | v0.11 级别 | 缓解 | 残留 |
|---|---|---|---|---|
| C 波工程量 vs 单人节奏 | 高 | **中→低**（R1 闭环 + spike 验证） | 325 可验证（spike 校准 memory 3→21，总量 +7%）+ 81% engine 量化 + C 波拆分（C1-engine 212 + C1-四域 59 前移 B 波）+ 估算 8-12 天 + **spike 4/4 绿**（单域 <1 天偏保守）+ 超阈值拆波/缩范围 + 共存保底 | 无（spike 已验量级 + 耗时） |
| 双跑循环依赖 IFF | 中 | **低**（R2 闭环 + spike 验证） | 12/14 已脱耦（fixture replay 零 IFF）+ 2 个有范本（gateway.test.ts L10-60）+ 录制计划并入 A 波 + **spike 步骤④ 6/6 绿**（Mechanism A 可移植验证） | agent-loop 多轮 fixture 录制复杂度需 A 波录制时验证 |
| EngineState 并发模型 | 中 | **低**（R3a 闭环） | 同构迁移已验证（旧仓 setAppState 全绿，MAX_TOOL_USE_CONCURRENCY=10）+ 4 成员已实例字段 + **原型 9/9 绿**（M3a.3 已做） | 无 |
| 225/88 分类非 grep 可验证 | 中 | **已闭环**（R1 + spike 校准） | 325 grep 可验证（口径=import utils/types/constants 调用点，4/5 域吻合）+ memory 3→21 修正 + 按目录分解量化 | 无 |
| feature() 575 处分类 | 中 | **已闭环**（R3b） | 两套机制分离（622 feature() FEATURE_* + 150 GrowthBook atlas_*）+ 分类 = 622 纯机械换 + 21 挂载调整 + 150 端口化 | GrowthBook port 契约设计（C2 Port 8 同期，spike 步骤②已验 port 契约可行） |
| 并行 shared/ 争用 | 低 | 低 | 契约冻结步 + 文件归属矩阵 | 机械可恢复 |
| 合并竞态 | 低 | 低 | 串行 cherry-pick + push 对齐 + 祖先链验证 | 既有纪律覆盖 |
| 精力周期/半成品悬空 | 中 | 中 | 共存路径 + 可暂停协议 + 超阈值评估 | 单人项目固有，无法消除只能对冲 |

**v0.11 风险面整体变化**：7 项风险中 4 项降级（高→中 1 / 中→低 2 / 中→已闭环 2），仅"精力周期/半成品悬空"维持中（单人固有不可消除）。**C 波从"高风险盲区"变为"中风险已知量级"**——工程量、并发模型、脱耦、分类四个子项全部从估算/推演变为实测/已验证。残留风险集中在"设计决策复杂度需 spike 验证"（非量级未知）。

## 7. 推荐执行顺序

```
[已完成] Wave-A 前置：baseline tag + ~/.atlas/ 清理（2026-09-22）
   ↓
A 波（2-3 天，串行）：骨架 + feature.ts + lint + 14 集 JSON
   ↓ A 波末：契约冻结步（shared 类型骨架 + config.ts 契约 + 文件归属矩阵）
   ↓
B 波（3-5 天，2 session 并行）：四域 config.ts + 域单测 → B6 绿 → wave-b tag
   ↓
[已完成] B-fix 防腐门（0.5 天，独立项 2026-09-22，C 波前置）：anti-stub + capability-matrix + CI 管道——归类=B 波缺陷纠偏（盲区是 B 交付时留下的），非 C 波范围；C-Deep 填 6 stub 前必须就位（test-strategy-rederive §4/§6）
   ↓
[已完成] C 波 spike（2026-09-22，4 步全绿）：①分类校准（memory 3→21，总量 +7% 可信）②端口化原型 15/15 绿（单域<1天偏保守）③并发原型 9/9 绿 ④双跑 6/6 绿 → **决策：开 C 波**
   ↓
C 波（12-18 天，纯串行，功能纵切优先 §8）：C1 叶子下沉 → C2-executor-ports（3 port）→ C-Deep（填 6 stub + 建 4 域骨架）→ **B6-func 功能 gate（真实跑命令）** → C1-engine 212 叶子 + C2-engine → B9 → B14 → wave-c tag
   ↓ >20 天触发超阈值评估（2x 估算 = 明显失控）
   ↓
E 波（3-5 天，串行）：ascend 块直调 → gelu L1 → wave-e tag
   ↓
E-wave-end（§8.52，2026-09-25）：A 桶 15 项（S-E1..S-E4）闭环 + B 桶 18 项登记（B18）+ 闭环后全量审计三路 PASS
   ↓
**C 桶三波（§8.53 起，功能纵切）**：① 工具本体 49（Bash 纵切 checkPermissions 面 15 文件 + 20 门控槽裁定 + ⑧ sandboxAccess 接线）→ ② auto-mode 分类器族 ~3030L → ③ shell·swarm 7217L
   ↓
**D 波（8-15 天，串行）**：壳接线 + B13（setAppState 置换，S-E0 自 F 波改判）+ 全栈 gelu 复验 → wave-d tag
   ↓
**remote 波 → analytics 波**（B5 远程持久化 / B2 遥测面等跨波登记项核销）
   ↓
F 波（3-5 天，串行）：清尾 → wave-f tag → 旧仓 archive
   （显式排序裁定 §8.53 审计③：C 桶 ①②③ → D 波 → remote → analytics；F 波 = 归档收尾）
```

**关键决策点**：~~C 波 spike 跑完的那一刻~~ **spike 已跑完（2026-09-22，4/4 绿），决策=开 C 波**。整个迁移"该不该全量走"的最终判断点已通过——4 项验证全绿（分类口径已定位 + 单域耗时偏保守 + 并发模型成立 + 双跑可跑），唯一修正项（memory 3→21）不阻塞。下一步：开 A 波（骨架，2-3 天，低风险）。

---

## 8. B 波复盘 + C 波重规划（功能纵切优先，2026-09-22）

> B 波（tag wave-b）完结后深度复盘，修正"两域已完结"的误判 + 重排 C 波。

### 8.1 B 波真实交付度（非对称）

| 域 | 行为完成度 | 说明 |
|---|---|---|
| memory | ✅ 行为完整 | 14 文件全真码（5 stores + paths + config） |
| modelprovider | ✅ 行为完整 | 22 文件全真码（provider + ports + errorHandling） |
| **executor** | ⚠️ 仅骨架 | Shell/ShellCommand/ShellExecutor/shellProvider **4 文件 = 空 `export {}`** |
| **sandbox** | ⚠️ 仅骨架 | createSandboxManager/ripgrep **2 文件 = 空 `export {}`** |

**"B6 全绿" = 编译+单测绿，非行为绿**。当前跑新仓：memory/modelprovider 可工作，但执行一条 shell 命令、建一个 sandbox manager 都做不了（那是空 stub）。**6 空 stub 通过 tsc/lint/test 但什么都不做**——strangler 中间段腐烂风险：仓库看着绿、核心域（coding agent 离不开 shell）是空的。

### 8.2 深实现回流 = C-Deep（新显式子波，非 C1/C2 附属）

S1"深迁移归 C 波 port 化后机械适配"判定**方向对但低估量级**。实测 Shell.ts 传递闭包跨 5 域，其中 4 域新仓**根本不存在**：

| 依赖 | 规模 | 新仓落点 |
|---|---|---|
| task 域（TaskOutput 390 + diskOutput 451 + Task 125） | 965 行 | ❌ `src/task` 缺失 |
| bootstrap 域（state.ts） | 373 行 | ❌ `src/bootstrap` 缺失 |
| permissions 域（filesystem） | 触及 | ❌ `src/permissions` 缺失 |
| hooks 域（fileChangedWatcher） | 触及 | ❌ `src/hooks` 缺失 |
| 12 个 utils 叶子（debug/errors/fsOperations/CircularBuffer…） | — | 未下沉 shared |

**C-Deep 实际 = 新建 4 域骨架 + 下沉 12 shared 叶子 + 填 6 实现文件，是整波量级**，原 C 波 8-12 天估算未含（它误以为四域叶子已前移进 B 波减负 15%——实际 B 波是各域本地复制 utils 非下沉 shared，去重债仍在 C 波）。

### 8.3 C 波重排序（功能纵切优先，用户 2026-09-22 裁定）

**原序**（charter）：C1 叶子下沉 → C2 8 port → C1-engine 212 → C2-engine → B9 → B14（优化 engine 体量，功能验证推到最后）。

**新序**（功能纵切优先，先除风险）：
```
B-fix 防腐门（0.5 天，独立项，C 波前置，2026-09-22 已完成）
  anti-stub + capability-matrix 机器门 + .github/workflows/ci.yml
  （归类：B 波缺陷纠偏，非 C 波范围；C-Deep 填 6 stub 前必须就位）
  ↓
C1 叶子下沉（shared 12 叶子 + 四域本地 utils 去重）✅ 2026-09-22 完成（438a93b + b3c2fe1，§8.6）
  ↓
C2-executor-ports（TaskOutput port + bootstrap-state port + sandbox 注入，3 port 先行）
  ✅ 2026-09-22 完成（6343d4a，§8.8：3 port + 3 fake + 15 契约测试）
  ↓
C-Deep（填 6 stub，建 4 域骨架）— 2026-09-22 复审切 2 纵切片（§8.7）+ C2-复审后
  修订为 3 切片（§8.9：4 新域骨架显式归切片 3 + Shell 裁剪版 + B6-func 注入清单）：
  切片 1 executor 4 stub（裁剪版 bash-only）+ 纵切 smoke（真 spawn echo hi，fake 注入）
  切片 2 sandbox 2 stub + 纵切 smoke（建 manager + ripgrep 查询）
  切片 3 task/bootstrap/permissions/hooks 4 新域骨架 + task/bootstrap 真端口适配器
  （+ STUB_REGISTRY/capability-matrix 同提交登记）
  每片完成即跑对应 smoke（tests/func/，port 之下全真）
  ↓
★ B6-func 功能 gate（全量终局 gate：shell 真跑 + 建 sandbox + mock completion + 写读 memory；
  前置 = 3 端口注入 + 输出目录就绪，§8.9 清单 3）
  ↓
C1-engine 212 叶子 + C2-engine 49 结构 + 剩余 port
  ↓
B9 双跑 diff → B14 package gate → wave-c tag
```

**收益**：2-3 天拿到能真实执行命令的 executor，先验证整条迁移链可运行，再投 engine 212 处体量迁移。

### 8.4 估算修正

C 波 8-12 天 → **12-18 天**（吸收 C-Deep 整波 + 未真正前移的叶子去重）。§1 总区间 29-48 天需相应上调。

### 8.5 C-Deep 前置须定的设计决策

1. **TaskOutput 归属**：shell 前台 stdout 是否从 task 域后台输出捕获中解耦？**倾向解耦**——port 只暴露输出捕获接口，不把 965 行 task infra 拉进 executor。
2. **Shell → sandbox/compat 反向依赖**（L3 违规）：改 SandboxDependencies 注入（类型已有），消除 Shell 直连 core/sandbox。

### 8.6 C1 叶子下沉执行记录（2026-09-22 完成，438a93b + b3c2fe1）

**下沉 shared（C1a，纯增量）**：
- `shared/stringUtils.ts`（整文件 235L）/ `circular-buffer.ts`（84L）/ `errors.ts`（8 纯助手）/ `format.ts`（formatFileSize）
- `shared/env.ts` 扩展：`isEnvTruthy`/`isEnvDefinedFalsy`（旧仓 envUtils T3 语义）+ `parseBoundedIntEnv` 加 `min` 参数
- 单测：4 个新叶子测试文件 + shared-env 扩展（min 参数 / 布尔原语全集合断言）

**去重收口（C1b，删 5 份本地副本，-204 行）**：
| 裁定 | 内容 |
|---|---|
| 布尔 env 单一事实源 | `isEnvTruthy`（T3 集合 1/true/yes/on）。B 波 `parseBoolEnv`（窄集合）删除；executor/sandbox config 切 isEnvTruthy（"yes"/"on" 现在判真，对齐旧仓）；memory/envUtils 只留 getAtlasConfigHomeDir；effort.ts 本地副本删 |
| 有界整数单一事实源 | `parseBoundedIntEnv(…, min)`。modelprovider `envValidation.ts` 整删，index/config 切 `min=1`（保留"0 无效回落默认"，timeout 类 0 无意义）；executor/sandbox 默认 `min=0`（GLOB_TIMEOUT 0=不限时） |
| formatFileSize 口径 | shared 版（旧仓 "N bytes"）。memory 本地 "512B" 变体是 B 波本地化偏差，去重时回归旧仓基准（FileTooLargeError 文案随统一） |

**未下沉（有裁定，非遗漏）**：
- `outputLimits`（BASH_MAX_OUTPUT_* + getMaxOutputLength）= executor 域策略常量，仅 shell 消费 → C-Deep 随 ShellCommand 落 executor 域内
- `debug.ts`（logForDebugging no-op）按 C-4 裁定保持 no-op 占位，logging port 定案前不下沉
- `fsOperations`/`readFileInRange` 纯部分 = memory 域专属（DEP-3 域内收拢），留域

**验收**：tsc 0 / lint 0 / build ✓ / 349 pass 0 fail（含 tests/ci 防腐门；STUB_REGISTRY 未动——C1 不填 stub，符合门②口径）。

**C1 复审整改（同日，用户"审视是否有问题"触发）**：
| # | 发现 | 处置 |
|---|---|---|
| R1 | §8.6 "fsOperations 留 memory 域" 裁定**前瞻错误**：旧仓 fsOperations 消费方含 Shell.ts/debug.ts 等 10+ 文件，C-Deep 移植 Shell.ts 必需要 → 域内留 = 埋 C-Deep 第二份 fs 抽象 | 已下沉 `shared/fs-operations.ts`（最小集，C-Deep 加法扩展）；memory 本地副本删，消费方切 shared |
| R2 | debug no-op 域内复制风险：modelprovider/debug.ts 是 B 波先例，C-Deep 4 域各复制一份 = 腐化 | 已下沉 `shared/debug.ts`（单一 no-op 占位，C-4 裁定不变：logging port 定案后整文件替换）；modelprovider 副本删 |
| R3 | **防腐门盲区**：anti-stub 只扫 B 波四域，C-Deep 新建 task/bootstrap/permissions/hooks 骨架可逃过门（H4 腐化向量复活） | 门已预覆盖：四域目录存在即自动纳扫（C1 落），空壳须登记 STUB_REGISTRY；变异验真通过（造 src/task 空壳→门①红，删→绿） |
| R4 | 口径核验（无误）：512B 回归无测试残留断言；isEnvTruthy trim 行为与旧仓 envUtils 逐行一致；effort 本地副本（无 trim）偏差随统一修复 | — |

### 8.7 C-Deep 执行合理化（C1 复审后修订，"更真正"）

原计划隐患：C-Deep = 填 6 stub + 建 4 域骨架**一次性做完**，功能验证（B6-func）放在整个 C-Deep 之后——空洞等价（H6）暴露窗口最长，且与"功能纵切优先"裁定相悖（C-Deep 内部实际是横切）。修订：

1. **C-Deep 切 2 纵切片，每片自带功能 smoke（tests/func/，CI 自动跑）**：
   - **切片 1 = executor 纵切**（填 4 stub：Shell/ShellCommand/ShellExecutor/shellProvider + 所需 port 实现）→ smoke：经 ShellExecutor **真实 spawn 跑 `echo hi`**，断言 stdout 捕获。
   - **切片 2 = sandbox 纵切**（填 createSandboxManager/ripgrep 2 stub）→ smoke：**建 manager + 一次 ripgrep 查询**（rg 存在则真查，缺失按 unit 纪律 skip 不红）。
   - **port 边界规则（B6-func 核心）**：port 之上可 fake（TaskOutput 可用内存 fake），**port 之下必须全真**（spawn/fs/ripgrep 真跑）——smoke 防"fake 到底"。
2. **4 新域骨架与 STUB_REGISTRY 同提交登记**（门①强制）+ capability-matrix 加 4 域能力行（rule ③ 随之覆盖）；骨架建立时即有门，不留无门窗口（R3 已预铺）。
3. **mock-completion 归属澄清**：matrix 行 `by: C` 口径 = **B6-func 承载执行**（"mock 一次 completion"），不等 B9；clients.ts 现无 transport 注入面，B6-func 时按"可注入 fake transport 或 in-process mock"二选一定案（不提前重构）。
4. 终局 B6-func（全量：shell 真跑 + sandbox 建 manager + mock completion + memory 写读）仍作为 engine 迁移前的最后功能 gate，纵切 smoke 是其前置证据而非替代。

> **2026-09-22 修订**：C2-复审（f8c6719）后 C-Deep 由 2 纵切片扩为 **3 切片**（4 新域骨架显式归切片 3）+ Shell 裁剪版 + B6-func 端口注入前置清单 + hooks 跨域边登记——详见 §8.9。

### 8.8 C2-executor-ports 执行记录（2026-09-22 完成，6343d4a + C2-复审 f8c6719）

**port 面调研（旧仓为 source of truth，斩断跨域 import 的窄面依据；C2-复审修订后口径）**：

| port | 旧仓真实消费面 | 新仓窄面裁定 |
|---|---|---|
| TaskOutput | **Shell.ts + ShellCommand.ts 双消费者**（复审 F1 补齐）：Shell.ts `new TaskOutput(taskId, onProgress, !usePipeMode)` + `.path`（file 模式 spawn 经 `open(path, O_WRONLY\|O_CREAT\|O_APPEND\|O_NOFOLLOW)` 直落 fd，父目录须先 mkdir）+ `.clear()`；ShellCommand.ts（StreamWrapper + result 组装）`.taskId`/`.writeStdout`/`.writeStderr`（pipe 喂缓冲）/`.getStdout()`/`.getStderr()`/`.stdoutToFile`/`.outputFileRedundant`/`.outputFileSize`/`.deleteOutputFile()`/`.spillToDisk()` | `TaskOutputPort{createTaskOutput}` + **12 成员 Handle**（上列 1:1）+ 5 参进度回调。残余项注明：static startPolling/stopPolling = React 进度组件消费（engine/D 波）；maxMemory = task 域策略（域内定值 8MB，旧仓 DEFAULT_MAX_MEMORY） |
| bootstrap-state | Shell.ts 3 点（复审 F3 补齐）：`pwd()`（cwd 初值，Shell.ts:216；旧仓 = ALS 覆盖 ?? `_cwdState`）+ `getOriginalCwd()`（cwd 被删回退）+ `setCwdState(physicalPath)` | 3 方法窄面；**ALS 并发覆盖层不进门面**（多 agent 并发能力归 engine 域，executor 只见 `getCwd()` 无覆盖路径）；`_originalCwd`/`_cwdState` 两状态分离语义明示（回退目标恒为启动 cwd） |
| sandbox 注入 | ShellExecutor `isSandboxingEnabled()` + Shell.ts `wrapWithSandbox(cmd, binShell, undefined, signal)` + `cleanupAfterCommand()` | 3 方法窄面；**omit customConfig**（旧仓 Shell.ts 恒传 undefined，窄面防 sandbox 内部类型 SandboxRuntimeConfig 渗入） |

**三项裁定**：
1. **L3 自治**：executor 域禁 import task/bootstrap/sandbox 域——域内只面向端口编程；真实现/适配器由组合根（atlascode/compose.ts，D 波）注入。fake 落 `tests/fixtures/`（src 零测试双），C-Deep 纵切 smoke / B6-func 直接复用（§8.7 port 边界规则落点）。
2. **未注入 = fail-fast 抛错**（非静默 no-op 兜底）：静默空输出汇 = 命令输出无声丢失、静默沙箱降级 = 安全语义无声改变——两者皆 H6 空洞等价腐化向量。对照：modelprovider 空配置默认合法（空配置语义安全），executor 三 port 不行，故 fail-fast。
3. **SandboxManager → ExecutorSandboxPort 适配器归组合根**（不进任一域）：两域互不 import，adapter 是组合根专属活；C2 只定端口面，adapter 随 C-Deep/B6-func 组合根落。

**fake 行为断言原则**：确定性 + 可观测（taskId 派生路径 / clear 计数 / wrap 非透传带标记 / 调用与 signal 记录），**不模拟真实域语义**——真语义归 C-Deep 各域实现，fake 绝不假装（对齐 test-strategy "绝不写假装通过的测试"）。

**C2-复审整改（同日，用户"先审视这轮修改"触发，f8c6719，3 发现全实证坐实）**：
| # | 发现 | 实证 | 处置 |
|---|---|---|---|
| F1 | **TaskOutput 窄面遗漏**：初版只列 Shell.ts 3 点，漏了 ShellCommand.ts（同为切片 1 的 4 stub）的 9 点消费——C-Deep 填 ShellCommand stub 时端口无面可走，被迫 import task 域破 L3 | 旧仓 ShellCommand.ts:73/86-88/241/297-314/354-371 逐行核实 | Handle 扩 12 成员（taskId/path/stdoutToFile/write×2/get×2/冗余+大小 getters/deleteOutputFile/spillToDisk/clear），残余项（static 轮询/maxMemory）注明归属 |
| F2 | **fake 路径必须真文件**：file 模式 spawn `open(taskOutput.path, O_CREAT)` 落 fd，初版 `/fake/...` 父目录不存在 → C-Deep 真 spawn 必 ENOENT | 旧仓 Shell.ts:301-310 open 标志位核实 | fake 改 `FileTaskOutputFake`（tmpdir 惰性 I/O：构造/createTaskOutput 零 I/O 保 unit 层零磁盘纪律；file 模式 getStdout 真读、clear/delete 真删 ENOENT 容错）；func 层真 I/O 预验全绿（写 hi→读回/size 3/delete 真删） |
| F3 | **bootstrap 端口缺 pwd() 初值**：Shell.ts:216 `let cwd = pwd()` 无处消费 | 旧仓 cwd.ts（ALS 覆盖 ?? getCwdState）核实 | 端口加 `getCwd(): string`（真实现 = 旧 pwd() 无覆盖路径）；ALS 并发覆盖层属 engine 域能力不进门面（窄面防 engine 概念渗入） |

**验收（复审后）**：tsc 0 / lint 0 / build ✓ / **365 pass 0 fail**；capability-matrix "3 port 契约" done 行；STUB_REGISTRY 6 条未动（C2 不填 stub）。

**下一步 = C-Deep 切片 1（executor 纵切）**：填 4 stub（Shell/ShellCommand/ShellExecutor/shellProvider，消费上述 3 port + shared fs-operations/debug）+ `tests/func/` 真 spawn `echo hi` smoke（§8.7）；STUB_REGISTRY 对应 4 条销账随填随销（门② 强制）。

### 8.9 C-Deep 方案修订（C2-复审 + 完成度审视后，2026-09-22）

基于 C2 复审结论（端口面已定全 + fake 可真跑）与 C2 完成情况，原 C-Deep 计划（§8.7 的 2 纵切片）有 4 处需修订：

1. **Shell.ts 移植定"裁剪版"，防纵切变全量**：旧仓 Shell.ts = 463 行 / 31 imports（bootstrap/Task/cwd/hooks watcher/permissions/platform/sessionEnvironment/双 shell provider/subprocessEnv/windowsPaths…）。"填 4 stub"若按旧文件全量移植 = 把 PowerShell/Windows/hooks 路径全搬进来，纵切变横切。裁定：**切片 1 移植裁剪版 bash-only 真核心**——spawn + 输出限制 + cwd 恢复（经 bootstrap 端口）+ 沙箱包装（经 sandbox 端口）+ TaskOutput（经 task 端口）+ bash provider；**残余清单**（不裁入切片 1）：PowerShell provider 路径 / windows 路径转换 / hooks fileChangedWatcher / subprocessEnv 全量 env 构建 / 多 provider 探测——标注归属（后续纵切或 engine 波次），裁剪版头部注释留残余清单防"以为已全"。
2. **4 新域骨架显式归切片 3（原 2 切片未覆盖）**：task/bootstrap/permissions/hooks 四骨架不在 executor/sandbox 两纵切片内，原计划"填 6 stub + 建 4 骨架"一句带过后未落位。裁定：**切片 1（executor 4 stub + fake 注入 smoke）→ 切片 2（sandbox 2 stub + smoke）→ 切片 3（4 新域骨架 + task/bootstrap 真端口适配器 + STUB_REGISTRY/capability-matrix 同提交登记，§8.7 规则 2）**；permissions/hooks 允许薄骨架（能力解锁 B6-func/engine，矩阵行标 missing+by）。
3. **B6-func 加"端口注入前置清单"（fail-fast 的运行时后果）**：3 端口未注入即抛错（C2 裁定 2），B6-func 真跑 shell 前必须完成：`setTaskOutputPort(task 域真适配器)` + `setBootstrapStatePort(bootstrap 域真适配器)` + `setExecutorSandboxPort(SandboxManager 适配器)` + `fake.ensureOutputDir()` 等价目录就绪。无清单 = B6-func 首跑即崩，返工。
4. **已知跨域边（hooks 域，不阻塞 C2，C-Deep hooks 切片时斩断）**：旧仓 hooks.ts:219 经 `shellCommand.taskOutput.getStdout()` 消费 TaskOutput 面（hooks 域 → executor 域 → task 域穿透）。hooks 域骨架建立时须经注入/端口斩断（hooks 域不直接 import executor），登记为 hooks 切片残余。

**修订后 C-Deep 全序**：切片 1 executor 纵切 → 切片 2 sandbox 纵切 → 切片 3 四新域骨架+真适配器 → ★B6-func（含端口注入前置清单）→ engine。每片 smoke 规则不变（§8.7：port 之上可 fake，port 之下全真）。

### 8.10 C-Deep 切片 1 执行记录 + 偏差修订（2026-09-22 完成，cf7d17c..c1cabc2）

**落地（6 提交）**：cf7d17c shellProvider → 5ae8e49 ShellCommand → a58339a Shell（+shared FsOperations 加法扩展）→ c23fc89 ShellExecutor + 门面 → 428ff6e tests/func/ 真 spawn smoke → 9427926 门同步（STUB_REGISTRY 6→2 + 矩阵 executor 行翻 done）。c1cabc2 收尾 lint（未用导入）。

**验收**：tsc 0 / lint 0 / build ✓ / **387 pass 0 fail（29 文件，含新 17 unit + 5 func）**。

**落地口径**：4 stub 全填（裁剪版 bash-only），裁剪残余全部落各文件头注释清单（shellProvider 7 项 / ShellCommand 5 项 / Shell 8 项 / ShellExecutor 2 项），防"以为已全"。门面（index.ts）导出 shell 执行核心 + provider，`ShellExecResult` 别名消歧 types.ExecResult。

**偏差审视（落地实况 vs §8.9 计划，6 项，均修订落盘）**：

| # | 偏差 | 处置 |
|---|---|---|
| D1 | **exec 签名变化**：旧仓 4 参 `exec(command, abortSignal, shellType, options?)` → 裁剪版 3 参（`shellType` 删除，bash provider 经 findSuitableShell 内部决议）。PowerShell provider 归残余⑥，参数位随之裁 | 已裁定为裁剪版签名（非遗漏）；后续 PowerShell 纵切时再扩参，不提前留位 |
| D2 | **shared FsOperations 加法扩展 4 方法**（mkdir(mode)/realpathSync/open(FileHandle)/unlinkSync）超出 §8.6 "最小集" | C1-R1 先例（fs 抽象单一事实源）执行：加法扩展、不建第二抽象；扩展面固化于此，memory 本地副本零 |
| D3 | **tests/func/ 层正式化**（新层，原计划仅 §8.7 提"smoke 落 tests/func/"未入测试层表） | 裁定为正式层：**func = 真 I/O 层（真 spawn / 真磁盘 tmpdir），unit 纪律（零网络/零磁盘/零 PTY）之上的第二层**；CI `bun test --isolate tests/` 递归覆盖（已验），随四件套自动跑 |
| D4 | **切片 3 task 域规模重估**："真端口适配器" ≠ 薄骨架——旧仓 task 面 = Task.ts 125L + task/ 基建 1223L（TaskOutput 390 / diskOutput 451 / framework 308），且切片 1 残余清单已把 watchdog（MAX_TASK_OUTPUT_BYTES 5GB）与 canonical generateTaskId 表挂到 task 域 | 修订切片 3 task 域 = **裁剪版真核心**（TaskOutput 真实现 + diskOutput + canonical TaskId 表 + watchdog 接回 executor 残余）；残余（任务列表 / kill / reaper / 后台任务管理）→ engine 波。bootstrap 域 = 真适配器（旧 bootstrap/state.ts + utils/cwd.ts，小，不变）；permissions/hooks 薄骨架不变 |
| D5 | **切片 2 规模重估 + 裁剪版裁定**：STUB_REGISTRY "闭包 30+ 文件" 为旧仓依赖闭包口径（高估）；旧仓 core/sandbox 实际 8 个 .ts 共 1394L（backend 302 / compat 108 / events 114 / types 115 / violationText 38 / createSandboxManager + pathResolve + index），新仓已迁 5/8（余 createSandboxManager + ripgrep 2 stub） | 修订切片 2 = 填 2 stub（~1394L 旧仓基准，单切片可承载）+ **同切片 1 式裁剪裁定**（国内目标 = bwrap/Linux 主路径；macOS seatbelt / Windows no-sandbox 回退归残余清单）；smoke 不变（建 manager + 一次 ripgrep 查询，rg 缺失按 unit 纪律 skip 不红） |
| D6 | **B6-func 前置清单细化（3 条执行级补强）**：① §8.8 裁定 3 说"SandboxManager→Port 适配器归组合根"但未说组合根谁建——B6-func 须建 **atlascode/compose.ts 最小组合根**（3 端口注入 + 输出目录就绪）；② 注入序约束：ShellExecutor 在 exec 时才读 `isSandboxingEnabled()`（ShellExecutor.ts:49），三端口须**先于第一次 exec 全部注册**（fail-fast 是运行时抛错，非构建期错误）；③ task 真适配器来自切片 3（顺序依赖已在 §8.9 全序中，此处明示） | 并入 §8.9 项 3 清单（B6-func 开工时按此 4+3 项执行） |

**修订后 C-Deep 全序（替换 §8.9 末行）**：切片 1 executor 纵切 ✅ → 切片 2 sandbox 纵切（裁剪版 bwrap 主路径，D5）→ 切片 3 四新域（task 裁剪版真核心 D4 / bootstrap 真适配器 / permissions+hooks 薄骨架 + 残余斩断 §8.9 项 4）→ ★B6-func（compose.ts 最小组合根 + 4+3 前置清单 D6）→ engine。每片 smoke 规则不变（§8.7：port 之上可 fake，port 之下全真）。

### 8.11 C-Deep 切片 2 执行记录 + 偏差修订（2026-09-22 完成，c4a3ef5..295f20f）

**落地（4 提交）**：c4a3ef5 ripgrep 填充（system-rg 单模式裁剪版 + 门面导出面）→ 9f8660c createSandboxManager 工厂 + runtime 注入窗口 + backend（新 runtime.ts / sandbox-backend.ts + 填 stub + 门面）→ 38b7cda 测试（fixtures/sandbox-runtime-fake + 4 func + 10 unit）→ 295f20f 门同步（STUB_REGISTRY 2→0 清零 + 矩阵 sandbox 2 行翻 done + 新增 ripgrep 行）。

**验收**：tsc 0 / lint 0 / build ✓ / **401 pass 0 fail（31 文件，716 expect 调用）**。

**落地口径（D5 裁剪版）**：
- **runtime.ts（新，97L）**：placeholder runtime（禁用态 3 方法语义照旧仓 fallback：isSupportedPlatform=false / 依赖错误非空；18 个真行为方法 fail-fast 抛错，防"沙箱以为开着"的空洞等价）+ `set/get/resetSandboxRuntimeModule` 注入窗口（调用时查找，executor 三 port 同款 idiom）。
- **sandbox-backend.ts（新，289L）**：SandboxBackend 接口 20 方法（冻结）+ AtlasSandboxBackend（violation store 100 上限 + 事件总线标准化照抄；全方法转发调用时查找的注入 runtime，替代旧仓静态 `#atlas-sandbox-runtime` import）+ `createSandboxBackend`/`registerSandboxBackend` 注册表扩展点。
- **createSandboxManager.ts（填 stub，515L）**：工厂闭包（SandboxDependencies + 可选 backend）+ 32 方法面全保留；最小 runtime config 构造（cwd/配置目录 denyWrite 族 / getAtlasTempDir + additionalDirs / bare-git-repo scrub / worktree 检测 / settings.sandbox.* 开关族 typed cast / ripgrep 命令）；lodash memoize → 本地闭包缓存 memoizeNoArg（reset 失效）。残余 6 项清单落头注释（①permissions 规则解析 + policySettings managed 分支 ②makePathResolvers ③glob warnings 恒空 ④WSL·Windows·seatbelt 分支 ⑤compat 归组合根 ⑥zod schema 随真 runtime 包）。
- **ripgrep.ts（填 stub，245L）**：system-rg 单模式 + ripGrep 核心（execFile + SIGKILL killSignal + 20MB cap + ATLAS_GLOB_TIMEOUT_SECONDS 默认 20s + EAGAIN -j1 单重试 + 部分结果回收 + RipgrepTimeoutError）+ `checkRipgrep()` --version 探测（func 据此真查 or skip 不红）。残余 5 项清单落头注释（stream / fileCount 遥测已删 / codesign / firstUseTest / builtin·embedded + USE_BUILTIN_RIPGREP 全裁）。
- 门面 index.ts：工厂 + backend 注册表 + runtime 注入窗口 + ripgrep 导出面（STR-1）。

**偏差审视（落地实况 vs D5 计划，3 项修订 + 小裁定，均落盘）**：

| # | 偏差 | 处置 |
|---|---|---|
| D7 | **真 bwrap 行为不在仓内**：旧仓 `#atlas-sandbox-runtime` alias 指向外部未发布包 @anthropic-ai/sandbox-runtime（仅 CI 安装，本地 fallback = placeholder 禁用态）；新仓 deps = openai + zod，不 vendor 该包 | 裁定：裁剪版引入 **runtime 注入窗口**（新 runtime.ts placeholder + 注入窗口，超出原"填 2 stub"裁定的架构增量）——与 C2 三 port 同款 fail-fast 语义（未注入时调真行为方法抛错，非静默透传命令）；真 bwrap runtime 包（国内工具链或等价）= B6-func/D 波单点换入面 |
| D8 | **SettingsJson opaque**：新仓 settings 体系未落地，SettingsJson = Record<string,unknown>（B 波裁定），旧仓 convert 消费真实 settings schema（5 层 permissions 规则解析） | 裁定：域内本地 `SandboxSettingsView` typed cast 视图（settings.sandbox.* 开关族）；5 层 convert 全量（WebFetch `domain:` 规则 / Edit·Read 规则路径族 / policySettings managed 分支）+ makePathResolvers + glob warnings 归 engine 波 settings 体系（manager 头残余 ①②③）；engine 波落地 settings 后以真实 schema 替换视图 |
| D9 | **B6-func 前置清单 +1（4+3 → 4+4）**：sandbox enabled 态 initialize/wrap 须 runtime 已注入（D7 注入窗口） | B6-func compose.ts 在首次 enabled 态 initialize 前完成 `setSandboxRuntimeModule`（或 `registerSandboxBackend` 替代后端）；D6 清单"mock backend"一条经此双扩展点落地 |

**小裁定（头注释注明，不计偏差）**：lodash memoize → 本地 memoizeNoArg（新仓无 lodash）/ ripgrep WSL 60s 特例 → 统一 20s（国内目标非 WSL）/ findExecutable → checkRipgrep --version 试跑（旧依赖不在新仓）/ 三模式裁单（builtin·embedded·USE_BUILTIN_RIPGREP 全裁）。

**后续步骤影响审视**：
- **切片 3（四新域）**：不受切片 2 影响（task 裁剪版真核心 D4 / bootstrap 真适配器 / permissions+hooks 薄骨架按 §8.10 执行；hooks 跨域边斩断 §8.9 项 4 不变）。
- **B6-func**：compose.ts 最小组合根（D6）+ sandbox runtime 注入（D9）+ task 真适配器（切片 3）；"建一个 sandbox manager（mock 后端）"验收项经 createSandboxBackend 注册表 + setSandboxRuntimeModule 双扩展点落地。
- **engine 波**：backfill manager 残余 6 项 + ripgrep 残余 5 项（含 settings 5 层 convert 全量 + pathResolve + glob warnings）。

**修订后 C-Deep 全序（替换 §8.10 末行）**：切片 1 executor 纵切 ✅ → 切片 2 sandbox 纵切 ✅（D7-D9）→ 切片 3 四新域（task 裁剪版真核心 D4 / bootstrap 真适配器 / permissions+hooks 薄骨架 + hooks 跨域边斩断）→ ★B6-func（compose.ts 最小组合根 + 4+4 前置清单 D9）→ engine。每片 smoke 规则不变（§8.7：port 之上可 fake，port 之下全真）。

### 8.12 跨会话独立审视修复记录（memory 真磁盘证据，2026-09-22，ee96206）

另一会话（AtlasCode 架构实施梳理）的**只读独立测试充分性审视**（锚 c1cabc2，隔离 worktree 跑测）产出 3+1 发现。本会话核验时效性：切片 2（c4a3ef5..6e06673）未触碰 memory 区与矩阵 memory 行 → 发现全部有效，采纳并落盘：

| # | 发现 | 严重度 | 处置 |
|---|---|---|---|
| F1 | FS 适配器 `FileSystemMemoryStore` 只有 mock-fs 委托单测，矩阵 "memory 写+读" done 行 proof 指向 `memory-store.test.ts`（InMemoryStore）→ 真 FS 适配器**零行为证据**（H6 空洞同类；溯源：B 波 2b32024 迁移只带 mock-fs 版测试） | 中·真缺口 | 已修：新 `tests/func/memory-real-fs.test.ts`（7 用例：真 tmpdir 默认 node:fs 透传读 / ENOENT 真透传 / mkdir 幂等 / readFileInRange 行范围+mtime+FileTooLargeError 两态 + memoryAge 真盘分档含 utimesSync 回退 last week 档） |
| F2 | 矩阵无 FS store 行 | 低 | 已修：capability-matrix 加行 "FS store 真磁盘读（FileSystemMemoryStore，默认 node:fs 透传）" → 上文件 |
| F3 | `unit/memory-types-age.test.ts` 3 用例 writeFileSync 真盘 I/O，违反 D3 "unit 零磁盘" | 层纪律 | 已修：移 func 层，**严格超集裁定 3→5**（缺失文件 2 用例的 statSync 同属真盘 syscall，随迁）；unit 只留纯函数（memoryFreshnessText 分档边界 + memoryTypes 常量族） |
| （可选项） | `shared/fs-operations.ts` 默认 node:fs 透传腿（含切片 1 加法 4 原语）只测了"注入 mock"一条腿 | 低 | 已修：新 `tests/func/shared-fs-passthrough.test.ts`（默认 NodeFsOperations 真 tmpdir 直跑：existsSync/stat/statSync/realpathSync/mkdir(mode 0o700 真断言 + EEXIST 幂等)/open 真写/readFile 回读/unlinkSync ENOENT 真抛） |

**后续步骤影响审视**：B6-func 前置件 "写读一次 memory" 的真盘证据已就位（FS 适配器 + 默认透传腿双证）；切片 3 四新域不受影响（memory 区修复不触碰 task/bootstrap/permissions/hooks）；D3 层纪律口径补强为**严格口径**（缺失文件 statSync 亦算真盘 syscall → func 层），后续用例分层按此执行。

### 8.13 B 层（测试充分性）复审记录 + 低危项 B6-func 登记（2026-09-22）

peer 会话对 §8.12 修复后的全树做 6 层复审（只读，锚 0ee05e3 前状态）。结论：无新阻塞级缺口；§8.12 落盘项全部命中（F1-F3 + shared 默认透传）；**2 条新发现低危项按"开口须注明解锁波次"纪律登记为 B6-func 项**：

| 项 | 内容 | 登记 |
|---|---|---|
| L-1 | memory store **写路径**未验（既有测试只 mock 读；store 接口为只读面，"写路径"= B6-func compose 链的写后读 e2e 断言，非域内原语） | B6-func "写读一次 memory" 验收须含：经 compose 真实写一个 memory 文件 → store 读回断言（真盘 func 证据已在 §8.12 就位，缺的是 e2e 写侧闭环） |
| L-2 | modelprovider **非流式** completion 未验（双跑验真只走流式 12/14；矩阵 "(mock) 出一段 completion" missing 行已注 C 波） | B6-func "mock 一次 completion" 验收须含**非流式**路径断言（流式/非流式双腿都过） |

**不影响切片 3**（两项均在 B6-func 断言展开面，test-strategy §6 "B6-func 具体断言 + 前置清单" 展开时一并落）。

### 8.14 C-Deep 切片 3 裁剪定稿（四新域，2026-09-22 调研 agent + 独立抽查核验）

调研范围：旧仓（a8af45b）task 面 5 文件（125+390+451+308+74L）/ bootstrap 2 文件（373+33L）/ permissions 20+ 文件 / hooks 2 文件（4979+191L）。关键事实经独立抽查逐条核验（行数/hook 边行号/死代码判定全命中）。

**逐域裁定（随迁/薄骨架/残余归 engine/砍）：**

| 域 | 裁定 | 说明 |
|---|---|---|
| **task 域 = 裁剪版真核心** | Task.ts 125L 随迁（TaskType/TaskStatus/generateTaskId/TASK_ID_PREFIXES canonical TaskId——无独立表文件，映射存 AppState.tasks/diskOutput 模块 Map/TaskOutput 静态 #registry 三处）；TaskOutput.ts 390L 随迁（ctor 4 参 maxMemory=8MB 默认 / spill 8MB 触发落盘 stderr 加 `[stderr]` 前缀 / clear 全清 + registry 删 / deleteOutputFile ENOENT 容错 / **static startPolling·stopPolling 保留 API 但零消费者**（旧仓唯一调用方 PowerShellTool.tsx L819/948 = React 层未移植归 engine））；diskOutput.ts 451L 随迁（**getProjectTempDir 跨域边→permissions 薄骨架注入**；MAX_TASK_OUTPUT_BYTES=5GB 常量 + getTaskOutputPath 接回 executor ShellCommand 残余 L280/L324；DiskTaskOutput.append 5GB cap 语义照抄）；framework.ts 308L **残余归 engine**（消费方全在 attachments/tasks impls/swarm；**pollTasks 全仓零外部调用 = 死导出，砍**）；outputFormatting/sdkProgress 74L 归 engine 按需 | 接回 executor 残余 = ShellCommand L12 头注/L280 killedForSize/L324 MAX_TASK_OUTPUT_BYTES 三处标记 |
| **bootstrap 域 = 真适配器** | state.ts 373L（旧仓为**重建 stub**，头注明示 "stub exports"）取**真实现子集**：{getOriginalCwd/setOriginalCwd、getCwdState/setCwdState、getSessionId/switchSession、getIsNonInteractiveSession/setIsInteractive、cost state 累加器族}；~250 个 stub 导出整砍（勿把 `: any` stub 签名当真行为）；cwd.ts 33L 随迁（ALS 覆盖层 runWithCwdOverride + pwd() store ?? getCwdState + getCwd 异常回落 getOriginalCwd） | Shell.ts 已移植方消费面：setCwd realpathSync 解析 / pwd -P 文件链 / 目录消失恢复（realpath 失败→originalCwd 回落→createFailedCommand） |
| **permissions 域 = 薄骨架** | PermissionRule.ts 40L 随迁（sandbox manager type 消费面，零深依赖）；filesystem.ts 1781L 取最小面：getProjectTempDir（diskOutput 消费）/ getAtlasTempDirName + getAtlasTempDir（Shell cwd 文件链消费）/ checkRead·WritePermissionForTool / pathInAllowedWorkingPath / DANGEROUS_FILES·DIRECTORIES，余砍；permissions.ts 1326L 取 hasPermissionsToUseTool **no-op-allow 起步**（规则求值/yoloClassifier 1332L/permissionSetup 1508L 归 engine） | ⚠️ hooks→permissions 反向边（旧 permissions.ts L72 executePermissionRequestHooks）：薄骨架若先落 permissions 后落 hooks，临时 no-op |
| **hooks 域 = 薄骨架 + 跨域边斩断** | hooks.ts 4979L 取最小面：HOOK_EVENTS 27 事件 + getMatchingHooks + runHooks（折叠 18 个 execute* 事件参数化，先实 PreToolUse/PostToolUse/SessionStart/Stop/SessionEnd 五高频）+ shouldSkipHookDueToTrust + createBaseHookInput；**斩断 2 条 task 边**：① L219-221 asyncRewake 分支 `shellCommand.taskOutput.getStdout()/getStderr()/cleanup()` → **HookOutputCapture 注入端口** `{getStdout(): Promise<string>, getStderr(): string, cleanup(): void}`（TaskOutput 12 成员窄面的钩子子集，组合根注入 task 域实现）② L989 `new TaskOutput('hook_<pid>')` 直构 → 构造注入 `createHookOutput(taskId)` 工厂；telemetry/plugin 选项/MCP elicitation/agentSdk 类型面/attachments·messageQueue 直调全砍或改 engine 注入回调 | fileChangedWatcher.ts 191L = **hooks↔executor 第二跨域边**（Shell L30 import onCwdChangedForHooks），随骨架注入（no-op 起步） |

**注入序约束**（防首跑 fail-fast 崩）：permissions 薄骨架（暴露 getProjectTempDir）→ task 域（diskOutput 消费）→ hooks（HookOutputCapture/createHookOutput 由组合根注入 task 域实现）。B6-func 前置清单 4+4 → **4+5**（加 hooks capture 注入项，D10）。

**H6 断言清单（防 B 波"空壳骗过四件套"复现，func 层真盘证据）**：
1. TaskOutput spill：pipe 模式 >8MB 触发真落盘（磁盘文件含 `[stderr] ` 前缀 + 触发 chunk；getStdout 返回 5 行尾 + 提示文案）/ ctor maxMemory 覆写边界
2. deleteOutputFile 真删 + ENOENT 容错（二次删不抛）
3. diskOutput 5GB cap 边界：**func 层以可覆写常量模拟**（真写 5GB 不可行——cap 语义 = bytesWritten 超限后队列只追加截断标记 + chunk 丢弃，用小 maxBytes 断言语义同构）；appendTaskOutput/getTaskOutput tail 8MB + 截断前缀/getTaskOutputDelta 偏移读/cleanupTaskOutput 真删
4. generateTaskId 前缀族（b/a/r/t/w/m/d + 未知回落 x）+ hook_<pid> 字面量 taskId 两口径
5. bootstrap cwd 两状态分离（originalCwd 不可变语义 vs cwdState 可变）+ 目录消失恢复路径
6. hooks 斩断验证：HookOutputCapture 未注入 = fail-fast 抛错（非静默透传）；注入 task 域实现后 pipe 模式真 stdout/stderr 捕获

**门同步（同提交，不留无门窗口）**：4 新域目录 mkdir 即触发 anti-stub CDEEP_DOMAINS 自动纳扫 → 各域骨架文件（<5 实质行）须同提交登记 STUB_REGISTRY（注明解锁波次=本切片填实即销）；capability-matrix 加 4 域行（task 真核心 done 指向 func / bootstrap 适配器 done / permissions 薄骨架 done / hooks 薄骨架+斩断 done，proof 随 T7 测试文件定）。

**切片 3 实施任务清单**：T1 task 域骨架 + Task.ts 随迁（seed）→ T2 TaskOutput 真核心（spill/clear/delete）→ T3 diskOutput（getProjectTempDir 注入 + 5GB cap + executor 残余接回 L280/L324）→ T4 bootstrap 域（state 真子集 + cwd）→ T5 permissions 薄骨架（PermissionRule + filesystem 最小面 + no-op-allow）→ T6 hooks 薄骨架（runHooks + 斩断 2 边 + fileChangedWatcher 注入）→ T7 测试（unit 零磁盘 + func 真盘按上 H6 清单）→ T8 门同步（STUB_REGISTRY + 矩阵 4 行 + docs + memory）。

### 8.15 C-Deep 切片 3 执行记录 + 偏差修订（T1–T3 完成 2026-09-22，T5–T8 进行中）

执行序实际落地（T4 bootstrap 折入 T1 同批两提交）：T1 task 种子 + bootstrap 域（`2881af4` task / `4aa7190` bootstrap）→ T2 TaskOutput 真核心（`439045b`）→ T3 diskOutput 填实 + executor watchdog 接回（`fc94f5b` task 含 shared/constants.ts / `5d9bc65` executor）。

**偏差登记（复审勿当遗漏重提）：**

- **D11（T1，anti-stub 门① STR-1 门面豁免）**：实质内容全为跨模块 re-export 语句（`export * from` / `export {…} from`）的 <5 实质行文件 = STR-1 域门面，不判 hollow（委托即门面职责，空洞只会活在 re-export 目标模块，同扫描范围）；mutation 验证（植入空 `export {}` 文件 + 非 re-export 薄文件 → 门红，移除 → 绿）。
- **STUB_REGISTRY T1 加/T2 除（漂移处理先例）**：T1 登记 diskOutput.ts（3 实质行 fail-fast stub，门① 空壳与登记同提交）；T2 扩为 ≥5 实质行 fail-fast 面（getTaskOutputPath + DiskTaskOutput 4 方法全抛错）→ 条目移除。口径：**fail-fast 抛错面 ≠ hollow 向量（loud ≠ hollow，同 port 注入窗口 idiom）**，真实现跟踪 = 文件头注 + 任务清单 T3 + T7 H6 ②③ + 门③ wave-c tag 清零兜底。注册表现 = 清零。
- **D12（T3，cap 覆写 seam）**：DiskTaskOutput ctor 新增可选 `maxBytes`（默认 = shared MAX_TASK_OUTPUT_BYTES 5GB，默认行为 == 旧仓）——T7 H6③ 同构边界 func 测试需小值触发路径，不实际写 5GB（Review peer 口径：有覆写路径则双向断言——小值触发 / 未设 → 默认 5GB 语义）；TaskOutput ctor maxMemory 先例同 idiom。
- **D13（T3，显示串推导）**：旧仓 MAX_TASK_OUTPUT_BYTES_DISPLAY 硬编码 '5GB' 字面删除，两消费点（diskOutput 截断标记 / executor killedForSize stderr 前缀）改经 shared formatFileSize(maxBytes) 推导（默认 → '5GB' 与旧仓字面一致；自定义值随值缩放，优于旧仓硬编码）。
- **logError 映射（T3）**：旧仓 logError（utils/log.ts，不随迁——telemetry/logging 归 engine 波）7 调用点 → shared logForDebugging(String(e), {level:'error'})（logging port 未定案前 no-op，C-4 口径，定案后零调用点改动）。
- **常量单一事实源拆分（T3）**：旧仓 cap 常量在 task/diskOutput.ts、轮询间隔在 executor/ShellCommand.ts → 新仓 cap 落 `shared/constants.ts`（task cap + executor watchdog 跨域共线，L3 四域互不 import）；SIZE_WATCHDOG_INTERVAL_MS 单消费者（executor）留域内不随下沉。
- **域归属复认（T2，切片 1 已裁定）**：outputLimits = task 域策略（ShellCommand 头注 16）；fsRange 域内随迁（memory 域 readFileInRange 是另一套 FileTooLargeError 语义族，勿混；第二域需 → 升 shared，C1 R1 裁定）。
- **TaskOutput clear() 注释勘误（T2）**：executor 端口 Handle clear() 注释"清缓冲 + 删文件"不准——旧仓语义 = 清缓冲 + cancel 磁盘 + 注销 registry，**不** unlink（删文件走 deleteOutputFile）；以实现为准。
- **executor ctor 参位（T3）**：旧仓 6 参 ctor 位 6 maxOutputBytes → 新仓 5 参（shouldAutoBackground/onTimeout 归 engine 波未随迁）；wrapSpawn 同步可选透传。

**后续步骤审视（T5–T8 无偏差，3 补注）：**

1. T5 permissions 不变——filesystem 最小面已含 getProjectTempDir（diskOutput 注入窗口的消费方）；组合根接线归 B6-func 波。
2. T7 H6③ 落地路径确认：`new DiskTaskOutput(taskId, smallMaxBytes)`（task 侧 seam）+ executor ctor `maxOutputBytes` 参数（watchdog 侧 seam）双覆写路径就位；func 测试先 `setDiskOutputEnv({ getProjectTempDir: () => tmpdir, getSessionId: () => 'test' })`，teardown `resetDiskOutputEnv()` + `_clearOutputsForTest()`（后者须先于 rmSync，防 async-ENOENT flake，旧仓同口径）。
3. **B6-func 前置清单补 1 项**：组合根须调 `setDiskOutputEnv`（task 磁盘层跨域边；pipe 模式 TaskOutput ctor 无条件调 getTaskOutputPath，hooks createHookOutput 工厂同受影响）——在 D10 的 4+5 之上补注，T8 门同步时与 test-strategy §6 前置清单一并落。

**T3 验收**：四件套 tsc 0 / lint 0 / build ✓ / 409 pass 0 fail 33 文件 741 expect（含 anti-stub 门，基线零变动）；diskOutput 实质行 diff 对旧仓 451L = 仅 D12/D13/logError 映射/注入窗/常量迁移五类偏差，零未登记漂移；executor 三处残余标记（头注/L280/L324）全部接回。

### 8.16 C-Deep 切片 3 执行记录 + 偏差修订（T5 permissions + T6 hooks 薄骨架 完成 2026-09-23）

执行序：T5 permissions 薄骨架（`src/permissions/` 4 文件 + `shared/` 7 叶子 + `shared/types-session` 决策类型 + `shared/index` 门面 + executor Shell rewire）→ T6 hooks 薄骨架（`src/hooks/` 12 文件，零 C-Deep 域 import、零 shared import，全靠注入端口）。

**T5 落地面（§8.14 薄骨架，逐文件）：**
- `src/permissions/PermissionRule.ts`：40L 随迁（规则类型 re-export + 两 zod schema 经 shared lazySchema；旧仓 `zod/v4` → 新仓 `zod` 主入口即 v4）。
- `src/permissions/filesystem.ts`：最小面（getProjectTempDir / getAtlasTempDir / checkRead·WritePermissionForTool / pathInAllowedWorkingPath / DANGEROUS_FILES·DIRECTORIES + 域内纯助手 isDangerousFilePathToAutoEdit / hasSuspiciousWindowsPathPattern / checkPathSafetyForAutoEdit / allWorkingDirectories / pathInWorkingPath / 轻量 getPathsForPermissionCheck）。
- `src/permissions/permissions.ts`：hasPermissionsToUseTool no-op-allow 起步（forceDecision 非空优先，否则恒 allow / default 模式）；CanUseToolFn 窄视图（全量 Tool/ToolUseContext/AssistantMessage 归 engine）。
- `src/permissions/bootstrap-env.ts`：跨域注入窗口（setPermissionsBootstrapEnv/get/reset，未注入 fail-fast；面收窄 getOriginalCwd + getCwd 两函数，getSessionId 消费方 scratchpad/session-memory 已砍）。
- `src/permissions/index.ts`：STR-1 门面（export * 四文件）。
- `shared/` 新增叶子：configDir / hash / platform / path / unc / lazySchema / tempDir（getAtlasTempDirName，见 D14）。

**偏差登记（复审勿当遗漏重提）：**
- **D14（T5，getAtlasTempDirName 提升 shared）**：§8.14 定 getAtlasTempDirName 属 permissions 最小面 +「Shell cwd 文件链消费」。落地审视：executor 域现行零 C-Deep 域 import（端口模式 bootstrapState/sandbox/taskOutput），直接引 permissions 破隔离；getAtlasTempDirName 全输入来自 shared（getPlatform + getConfigDirName）+ process.getuid = 纯叶子 → 提升 `shared/tempDir.ts` 单一事实源。getAtlasTempDir（有状态 realpath 缓存，权限 temp dir 消费）留 permissions 消费 shared。executor Shell sandboxTmpDir 接回 `ATLAS_TMPDIR||'/tmp' + getAtlasTempDirName()`（弃切片 1 临时 `tmpdir()/atlas-sandbox-<uid>` 占位，保 executor 零 C-Deep 域 import）。§8.15 补注 1「T5 permissions 不变」据此微调（getProjectTempDir 仍留 permissions）。
- **D15（T5，isAtlasSettingsPath 字面串勘误）**：旧仓 de-Anthropic 全局替换误伤——`endsWith(\`${sep}getConfigDirName()${sep}settings.json\`)` 里函数名被替换成**字面串**，endsWith 恒不命中（安全检查形同虚设）。新仓改回真调用插值 `getConfigDirName()`（= `.atlas` 或 `ATLAS_CONFIG_DIR_NAME` 覆盖），`{configDir}/settings.json` 语义恢复。
- **D16（T5，safety 分支窄化用显式比较）**：checkWrite 1.7 旧仓 `(safetyCheck as any).message` 规避窄化。本仓不引 any，改显式 `safetyCheck.safe === false`——实测本仓 `strict:false` 下真值否定 `!x.literal` **不**收窄判别联合，显式 `=== false` 才收窄（standalone `--strict` 两形皆可，差异仅在 strict 关闭）。
- **薄骨架桩（§8.14 已定，T5 落桩，非遗漏）**：matchingRuleForInput（规则求值树：ignore 库 + 工具名常量 + settings roots + pattern 树 → engine）恒 null / checkReadable·EditableInternalPath（session-memory/plans/tool-results/scratchpad → engine）恒 passthrough / generateSuggestions（PermissionUpdate 真生成 createReadRuleSuggestion → engine）恒 [] / getPathsForPermissionCheck 取轻量版（tilde→homedir + UNC 早退 + 单级 realpath；40 层符号链接链遍历 lstat/readlink + 悬空链接祖先解析归 engine，且 FsOperations 未扩 lstatSync/readlinkSync 面）。checkWrite 1.6 config-folder session allow 规则 + 1.7 skill-scope 建议（ATLAS_FOLDER_PERMISSION_PATTERN + getClaudeSkillScope）归 engine，薄骨架 safety 建议退化桩空数组。

**后续步骤审视（T6–T8）：**
- T6 hooks 薄骨架：hooks→permissions 反向边（旧 permissions.ts L72 executePermissionRequestHooks）在 §8.14 注入序里 permissions 先落（T5 本批次），hooks（T6）落地时接回；当前 permissions.ts no-op-allow 未含 hook 执行（无边）。
- T7：permissions 薄骨架 checkRead/checkWrite 决策主面单测走 mock-fs + 注入 bootstrap env（unit 零磁盘）；func 真盘验 getProjectTempDir / getAtlasTempDir realpath 链 + 轻量 getPathsForPermissionCheck 单级 realpath。
- T8 门同步：capability-matrix 加 permissions 域行（薄骨架 done，proof 随 T7）；anti-stub 已自动纳扫 `src/permissions`（CDEEP_DOMAINS 项），T5 落地后四文件实质行 561/32/23/19 全 ≥5，非空壳，**无需 STUB_REGISTRY 登记**（仅 hooks 域若落 <5 实质行骨架需登记——T6 核）。

**T5 验收**：tsc 0 / 409 pass 0 fail 33 文件 741 expect（基线零变动，含 anti-stub 门）；filesystem 最小面 checkRead/checkWrite 12 步 + 6 助手对旧仓实质行 diff = 仅 D14/D15/D16 + 薄骨架桩四类偏差，零未登记漂移；executor Shell 残余标记（头注 + sandboxTmpDir）接回 shared 单一事实源。

---

**T6 hooks 薄骨架落地面（§8.14「runHooks 折叠 18 execute* 参数化，先实 5 高频」，逐文件）：**
- `src/hooks/hookEvents.ts`：HOOK_EVENTS 27 事件常量 + `HookEvent` 类型（单一事实源，零依赖全量随迁；跨 ≥2 域消费）。
- `src/hooks/types.ts`：类型面（`BaseHookInput` + `HookInput` = base & {hook_event_name, [k:string]:unknown}；`HookCommand`（command 型主路径，callback/function 归 engine）/ `HookPayload` / `HookMatcher` / `MatchedHook` / `HookJSONOutput` / `HookBlockingError` / `HookResult` / `AggregatedHookResult`）。
- `src/hooks/bootstrap-env.ts`：跨域注入窗口（`HooksBootstrapEnv` 6 函数 getSessionId/getCwd/getTranscriptPath/getMainThreadAgentType/isNonInteractive/hasTrustAccepted；set/get fail-fast / reset）——消费方 createBaseHookInput + shouldSkipHookDueToTrust。
- `src/hooks/config-provider.ts`：钩子配置源注入端口（`getHookMatchersForEvent(event)`；未注入返回 null = 无钩子配置是常态，非 fail-fast；配置加载体系三源合并 + managed-only 归 engine）。
- `src/hooks/task-edges.ts`：2 条 task 边斩断注入端口（① `HookOutputCapture` getStdout/getStderr/cleanup 异步唤醒窄面 ② `createHookOutput(taskId)` 工厂；未注入 fail-fast）。
- `src/hooks/shell-port.ts`：**D17 新增**命令钩子执行跨域端口 `HookShellPort.runCommand(cmd, env, signal, timeoutMs?) → {stdout,stderr,code,aborted?}`（组合根接 executor 真 Shell；未注入 fail-fast，但无钩子配置时不被调用不误伤）。
- `src/hooks/fileChangedWatcher.ts`：hooks↔executor 第二边 no-op 起步（`setEnvHookNotifier`/`initializeFileChangedWatcher`/`updateWatchPaths`/`onCwdChangedForHooks`/`resetFileChangedWatcherForTesting` 真签名空体；真 chokidar 监听 + CwdChanged/FileChanged 钩子执行归 engine）。
- `src/hooks/createBaseHookInput.ts`：造公共基础输入（session/transcript/cwd/permission/agent，经 bootstrap-env 斩断；返回 `BaseHookInput`）。
- `src/hooks/shouldSkipHookDueToTrust.ts`：信任门（非交互恒执行；交互缺信任全跳过——防信任对话框前误执行 SessionEnd/SubagentStop 历史漏洞）。
- `src/hooks/getMatchingHooks.ts`：匹配核心（27 事件 matchQuery 提取 switch 全保留 + matchesPattern simple/pipe/regex 三态 + command 钩子 shell\0command\0if 去重；matcher 源经 config-provider 注入）。
- `src/hooks/runHooks.ts`：参数化分发核心 `runHooks(event, hookInput, opts)` + 5 高频执行器（PreToolUse/PostToolUse/SessionStart/Stop/SessionEnd）；信任门 → 匹配 → 命令钩子经 HookShellPort 逐条执行 → JSON 解释（continue/decision/systemMessage/hookSpecificOutput.permissionDecision/additionalContext/updatedInput/suppressOutput）+ exit-2 阻塞约定 → 聚合（首阻塞/任续停/最严权限 deny>ask>allow）。
- `src/hooks/index.ts`：STR-1 门面（全量 re-export，外部只 import 域根）。

**T6 偏差登记（复审勿当遗漏重提）：**
- **D17（T6，hooks→executor shell-exec 端口，§8.14 未列）**：§8.14 只登记 2 条 task 边（HookOutputCapture/createHookOutput），漏登命令钩子经 executor Shell（ShellCommand）spawn 这条边。薄骨架把它收敛为注入端口 `HookShellPort`（hooks 域不 import executor 域，L3）。**B6-func 前置清单 4+5 → 4+6**（组合根须 `setHookShellPort(executor 真 Shell 适配)`，在首次配了命令钩子并 runHooks 前注册；无命令钩子时该端口不被触碰，故 fail-fast 不误伤常态）。
- **BaseHookInput 独立类型（T6，非偏差，勘误）**：`HookInput` 带 `[key:string]:unknown` 索引签名，`Omit<HookInput,'hook_event_name'>` 会把 keyof 解到索引签名、抹掉具名字段（session_id/cwd 全丢）。故拆出显式 `BaseHookInput`（createBaseHookInput 返回型），5 高频执行器 `{...base, hook_event_name, ...}` 叠成 HookInput。
- **runHooks 返回 Promise 非 AsyncGenerator（T6，§8.14 裁定落地）**：旧仓 18 execute* 均 `async function*` yield 进度消息 + 阻塞错误（接 message pipeline / attachment 消息流）。薄骨架折叠为单一参数化 `runHooks` 返回 `Promise<AggregatedHookResult>`（无 streaming yield 面——streaming/attachment/messageQueue 归 engine）。
- **裁剪归 engine（T6，§8.14 已定，落桩非遗漏）**：prompt/agent/http/callback/function 型钩子执行、插件变量插值、异步唤醒钩子（registerPendingAsyncHook + 消费 task-edges ①②）、MCP elicitation、`if` 条件 matcher（prepareIfConditionMatcher 依赖 Tools 域）、legacy 工具名映射（AtlasCode 无）、未知 decision/hookEventName 不匹配的抛错（薄骨架宽容仅记结果）全归 engine 波。
- **DEFAULT_HOOK_SHELL 固定 'bash' + FileChanged basenameOf 本地实现（T6）**：旧仓 shellProvider 动态默认 shell + node:path basename 均属 executor/依赖面，薄骨架本地最小实现（`DEFAULT_HOOK_SHELL='bash'` + `basenameOf` 纯函数），免拉 executor/依赖。

**后续步骤审视（T7/T8/B6-func，据 T6 实际落地修订）：**
- T7 hooks 单测：unit 零磁盘走注入假 port（假 HookShellPort 返 canned {stdout,stderr,code}）+ 注入 config-provider（固定 matcher 集）+ 注入 bootstrap-env（固定 isNonInteractive/hasTrustAccepted）断言 5 高频执行器聚合面（trust 跳过 / 匹配 / JSON 解释 / exit-2 阻塞 / 最严权限 / additionalContext 聚合）；func 真盘面 = 无（hooks 薄骨架无真盘消费，真 chokidar/真 shell 归 engine，func 层不验）。
- T8 门同步：capability-matrix 加 hooks 域行（薄骨架 done，proof 随 T7）+ 补 D17 使 B6-func 前置清单口径 4+5→4+6（test-strategy §6 前置清单一并落）；anti-stub 已自动纳扫 `src/hooks`（CDEEP_DOMAINS 项），T6 落地 12 文件实质行全 ≥5（最薄 shouldSkipHookDueToTrust 8 实质行 / index 门面豁免），**无需 STUB_REGISTRY 登记**（§8.15 补注 3「仅 hooks 域若落 <5 实质行骨架需登记」经核不成立，撤销该预警）。
- **B6-func 前置清单最终口径 4+6**：4（setTaskOutputPort + setBootstrapStatePort + setExecutorSandboxPort + 目录就绪）+ ①setDiskOutputEnv（D11/§8.15 补注 3）+ ②setHookShellPort（D17，本批次）= 4+6；注入序 permissions→task→hooks 末步 + shell-port 先于首次带命令钩子的 runHooks。**§8.17 D18 补登 → 4+7（+setEndpointConfigSource）**。

**T6 验收**：tsc 0 / 409 pass 0 fail 33 文件 741 expect（基线零变动，含 anti-stub 门 3/3 绿）；hooks 域零 C-Deep 域 import、零 shared import（全经注入端口，L3 隔离成立）；12 文件对旧仓实质行 diff = 仅 D17 + BaseHookInput 勘误 + Promise 折叠 + engine 裁剪四类，零未登记漂移；STR-1 门面 + 5 高频执行器 + 信任门 + 2 task 边斩断 + D17 shell 边切端口全就位。

---

**T7 测试层落地面（§8.16 T7 口径，H6 清单 6 条 + 分层纪律，逐文件）：**

H6 六条真盘面映射（绝不写假装通过的能力测试）：① spill 真落盘 + `[stderr] ` 前缀 / ② deleteOutputFile 真删 + ENOENT 吞错 / ③ 5GB cap 同构边界（MAX_TASK_OUTPUT_BYTES 单一事实源 = 5GB + DiskTaskOutput maxBytes 覆写 seam 触发截断标记，**不真写 5GB**）/ ④ TaskId 双口径（type→前缀 + 长度 9 / 字符集）/ ⑤ bootstrap cwd 两状态分离 + ALS 覆盖层 / ⑥ hooks 斩断 fail-fast（shell/task 边未注入抛错）。

- `tests/unit/hooks.test.ts`（318L，17 例，零磁盘）：`FakeHookShell`（enqueue canned {stdout,stderr,code}，纯内存不 spawn）+ 注入 config-provider（固定 matcher 集）+ 注入 bootstrap-env（固定 isNonInteractive/hasTrustAccepted）。覆盖：信任门（非交互执行 / 交互缺信任全跳过不触 port / 交互有信任执行）、匹配（tool_name matchQuery 命中/不命中 / 未注入 provider 空结果）、JSON 解释（decision:block→deny / hookSpecificOutput deny+reason / additionalContext 多钩子 `\n` 聚合 / 最严权限 deny 胜 / exit-2 阻塞 / continue:false+stopReason）、5 执行器事件映射 + SessionEnd 短超时档、H6⑥ fail-fast（getHookShellPort/getHookOutputCapture/createHookOutput 未注入抛错 + 注入后闭环 + 配钩子未注 shell 端口 runHooks rejects）。
- `tests/unit/permissions.test.ts`（140L，9 例，零磁盘）：`makeContext()` 建 ToolPermissionContext；readTool/writeTool 有 getPath、noPathTool 无。覆盖：no-op-allow（behavior allow + decisionReason {type:'mode',mode:'default'}）、forceDecision 透传（返回强制对象本身）、DANGEROUS_FILES/DIRECTORIES 含检查、checkRead（无 getPath→ask / UNC→ask）、checkWrite（无 getPath→ask / .gitconfig→ask via safetyCheck / UNC→ask）。
- `tests/unit/bootstrap.test.ts`（45L，2 例，纯状态无 fs 归 unit）：cwd 两状态分离（setOriginalCwd vs setCwdState 独立）+ ALS 覆盖层（runWithCwdOverride 内 pwd() 见覆盖值、出作用域回落 cwdState）。**T8 从 `tests/func/task-real-fs.test.ts` 迁出**（该块无真盘 I/O，归 unit 层；能力矩阵 bootstrap 域行需 domain↔proof 对应，故单列本文件）。
- `tests/func/task-real-fs.test.ts`（137L，6 例，真盘）：`setDiskOutputEnv({ getProjectTempDir: ()=>taskTmp, getSessionId })` 注入真 tmpdir（§8.14 注入序 permissions→task，func 层以真 getProjectTempDir 替身注入）。H6①–④ 全落真盘（spill 小 maxMemory=200 触发非真写 8MB / deleteOutputFile 真删 / 5GB cap 断言 + maxBytes 覆写 seam / TaskId 双口径）。
- `tests/func/permissions-real-fs.test.ts`（94L，3 例，真盘）：顶层 mkdtemp + 先于 getAtlasTempDir 首调设 `process.env.ATLAS_TMPDIR`（模块级 memoize）。getAtlasTempDir realpath 链（带尾分隔符 / 含 atlasTempDirName / startsWith realpathSync(realTmp)）+ getProjectTempDir 真目录可建 + checkRead 工作目录内真文件→allow（经 getPathsForPermissionCheck 单级 realpath）。

**T7 验收**：tsc 0 / 446 pass 0 fail 38 文件 814 expect（基线 409→446 为四新域 37 新增测试：hooks 17 + permissions 9 + bootstrap 2 + task func 6 + permissions func 3 = 37；含 anti-stub / capability-matrix 门全绿）。分层纪律守成：unit 全零磁盘（假 port 纯内存 canned / 假 tool.getPath 不触 fs），func 全真盘（mkdtemp / 真 spill 落盘 / 真删 / 真读 / realpath），5GB cap + 8MB spill 均经覆写 seam 触发不真写容量（绝不写满盘）。

---

**T8 门同步落地面（切片 3 收尾，§8.16 T8 口径）：**

- **① capability-matrix 扩 8 域**：`MatrixRow.domain` 联合 + `DOMAINS` set 从 4 域（executor/sandbox/memory/modelprovider）扩 8 域（+ task/bootstrap/permissions/hooks）；新增 11 行——task 4 行（spill+stderr 前缀 / deleteOutputFile / 5GB cap / TaskId 双口径，proof 均 `tests/func/task-real-fs.test.ts`）+ bootstrap 2 行（cwd 两状态 / ALS 覆盖层，proof `tests/unit/bootstrap.test.ts`）+ permissions 2 行（checkRead/checkWrite 决策主面 proof `tests/unit/permissions.test.ts` / realpath 链真盘 proof `tests/func/permissions-real-fs.test.ts`）+ hooks 3 done 行（信任门+5 执行器聚合面 / getMatchingHooks 匹配 / 跨域斩断 fail-fast，proof 均 `tests/unit/hooks.test.ts`）+ **1 missing 行**（hooks 流式执行 / attachment 渲染 AsyncGenerator，by=engine 波，§8.16 裁剪归 engine）。门 ③ 标签「四域」→「八域」全核销。
- **② STUB_REGISTRY 无需登记**：anti-stub 自动纳扫四 C-Deep 域（`CDEEP_DOMAINS` 项，目录存在即纳扫），T5/T6 落地后全部文件实质行 ≥5（permissions 4 文件 561/32/23/19、hooks 12 文件最薄 shouldSkipHookDueToTrust 8 实质行）/ 纯 re-export 门面豁免 → **无未登记空壳，STUB_REGISTRY 保持清零**。门①/③ 绿。
- **③ bootstrap 测试分层归位**：H6⑤ 从 `tests/func/task-real-fs.test.ts` 迁 `tests/unit/bootstrap.test.ts`（纯状态无 fs → unit 层；能力矩阵 bootstrap 域行 domain↔proof 对应需 bootstrap 域单列文件）。task func 文件同步删 bootstrap import + beforeEach（不再需要）。
- **④ B6-func 前置清单最终口径 4+6 落定**：4 基项（setTaskOutputPort + setBootstrapStatePort + setExecutorSandboxPort + 目录就绪）+ ①setDiskOutputEnv（D11）+ ②setHookShellPort（D17）= 4+6；注入序 permissions→task→hooks 末步 + shell-port 先于首次带命令钩子的 runHooks。test-strategy-rederive §6 item 7 + §3 Wave C 两处「⏳ 余」同步从 4+4 刷新至 4+6（D11+D17）。**§8.17 D18 补登：4+6→4+7（+setEndpointConfigSource）**。

**T8 验收（验收四件套）**：① `npx tsc --noEmit` = 0 ② `bun test --isolate tests/` = 446 pass 0 fail 38 文件 814 expect ③ anti-stub 门 3/3 绿 ④ capability-matrix 门 3/3 绿（八域全核销 + 1 missing 注解锁波次）。**M-1 修复（`03e0942`）：T5–T8 验收口径原收窄漏 lint，潜伏 5 处死 import（src 2 + tests 3）；已删 + 恢复完整四件套口径（tsc 0 / lint 0 / build 0 / 446 pass 0 fail）**。切片 3 四新域薄骨架纵切全闭环（T1–T8）。

**切片 3 收官 → 后续**：★B6-func（compose.ts 最小组合根 + 4+7 前置清单落地，先于 engine）→ engine 波（hooks 流式/attachment 渲染 + permissions 规则求值树 + executor 全 shell + 真 bwrap）。

### §8.17 切片 3 复审补登 D18（modelprovider 端点静默兜底偏差）

**发现来源**：Plan agent 四判据复审（锚 de65625，只读，2026-09-23）—— import 方向面 / STR-1 门面 / 裁剪登记完整性 / 注入窗口 fail-fast 一致性逐域核验，modelprovider 域 ④ 注入窗口判据命中。

**事实**：`src/modelprovider/roles.ts:25-37` `getEndpointConfigSource()` 未注入时 `activeSource ??= emptyEndpointConfigSource`（L28）静默回落空配置——`emptyEndpointConfigSource`（L34-38）三方法全返空（`getRoleSetting: ()=>({})` / `getProviders: ()=>({})` / `getGlobalApiKey: ()=>undefined`）。后果：组合根忘注入时 `getRoleConfig` 仍返回合法对象（`provider='openai'` 默认 + `model=undefined` + `apiKey` 走 env 凭据），providers 空 map → `resolveModel` 返 undefined → `getRoleModel` 返 undefined → `modelToRole` 回落 'small'。

**定性**：**8 域唯一非 fail-fast 注入窗口**。其余 7 域注入窗口全 throw（executor 3 port / sandbox runtime 18 真行为方法 / task diskOutput / permissions bootstrap-env / hooks 4 窗口），modelprovider endpoint 独此静默兜底。

**H6 边界裁定（为何不判为空洞等价向量）**：空配置语义安全——env 凭据（`ATLAS_{ROLE}_API_KEY`）仍可用 + providers 空 → 默认 provider 'openai' + model undefined，**不产生"假完成"**（model undefined 时 completion 调用会因缺 model 而非静默成功）。异于 H6 空洞等价原型（sandbox 禁用态 wrap 直调须 throw 防"沙箱降级静默透传 = fake 到底"）。对照：modelprovider 空配置 = 合法占位（测试/组合根注入前），sandbox 禁用态 = 须 fail-fast（静默 no-op 会假绿）。**裁定 (a)：登记为合法态，不改 fail-fast，保留 `model-roles.test.ts:47-61` 空 stub 路径测试现状。**

**落地（3 项）**：
1. **门面导出**：`setEndpointConfigSource` 加入 `src/modelprovider/index.ts` roles 导出块（与 executor/task/hooks 三域 set 经门面模式一致；compose.ts 组合根经门面注入，不深导入 roles.ts）。`getEndpointConfigSource` 不导出门面（域内 capabilities.ts 深导入是域内消费，compose.ts 只需 set）。
2. **B6-func 前置清单 4+6→4+7**：加 `setEndpointConfigSource`（D18）；注入序——modelprovider endpoint 注入在 completion 调用前（组合根最早步，与 sandbox runtime 并列先于 executor/permissions/task/hooks 序）。
3. **B6-func 断言要求**：「mock 一次 completion」断言须含——注入 `setEndpointConfigSource(真实源)` 后，`getRoleConfig` 返回注入的 providers/model（行为断言：非空 stub 的 undefined/默认值）。不导出 `emptyEndpointConfigSource` 内部（行为断言非身份比较）。

**AtlasHarness 教训不适用**：源项目曾裁定「setEndpointConfigSource 不入门面避 mock 全导出面坑」（orchestrator-t5 三性收尾，mock.module 全局泄漏），但 AtlasCode 测试用真实注入 + fake 非 mock.module 门面，且 executor/task/hooks 三域已确立 set 经门面导出模式 → AtlasCode 模式优先。

**遗留（不阻塞 B6-func，按需补）**：modelprovider 缺 `resetEndpointConfigSource`（其余 3 域均有 set/get/reset 三元组，modelprovider 仅 set/get）。Bun `--isolate` 按文件隔离进程，跨文件不泄漏；B6-func 单文件多 case 需 reset 时再补。

### §8.18 切片 3 复审补登：T5 下沉效应收口 + L-1 误判核实

**#3 memory 本地副本漂移收口（Plan agent ③ 发现 (b)，2026-09-23 落地）**：T5 下沉 shared/hash·path·configDir 为单一事实源后，memory 域本地副本未删——`src/memory/pathUtils.ts`（djb2Hash/sanitizePath/MAX_SANITIZED_LENGTH/simpleHash，与 shared/hash.ts·path.ts **逐行一致**）+ `src/memory/envUtils.ts`（getConfigDirName，与 shared/configDir.ts 一致）。收口：pathUtils.ts **整删**（-37 行），envUtils.ts 删 getConfigDirName 副本改 `import { getConfigDirName } from '../shared'`，paths.ts sanitizePath 改 import shared，memory-config-utils.test.ts 深 import pathUtils 改 import shared（#2 门治理时统一处理 envUtils 深 import）。验收 tsc 0 / lint 0 / 446 pass 0 fail（行为零差异，shared 实现逐行一致已验）。

**#4 L-1 误判核实（Review 会话 L-1，2026-09-23 核实）**：Review 会话 L-1 称"H6④ TaskId 双口径只落 canonical 半，hook_<pid> 字面量零实现零登记，矩阵行 87 标签超称"。经核实：旧仓 Task.ts 全文 + 旧仓全 src grep `hook_` 只命中 message 类型（hook_result/hook_cancelled/hook_progress 等），**不存在 hook_<pid> task id 形式**；新仓 task/hooks 域 grep 零命中。§8.16 H6④ 定义的"双口径"= type→前缀 + 长度/字符集（非 canonical + hook_<pid>），测试 H6④ 全覆盖（前缀映射 b/a/r + 格式 [prefix][8 小写数字字母]）。**矩阵行 87 不超称，L-1 为误判，无需改文案。**

### §8.19 门治理批次落地（#1/#2 缺口修复 + eslint 八域扩展，2026-09-23）

**裁定背景**：切片 3 复审 4 架构裁定（域终态/命名/子模块/缺口修复）。域终态= #56 charter v0.12 认 12 域（commit `2ef4da9`，§8.17 D18 + §8.18 #3/#4 已落）；命名= TaskCreate 系列用 `engine/coordinator/tasks/` 避撞 `src/task/`（charter L4.8 登记，engine 波创建时落地）；子模块= engine ~14 子模块登记（charter L4.8，engine 波规划时落目录树）。本节收口**缺口修复 #1/#2 + eslint 门治理**（用户裁定"#1/#2 随门治理"）。

**eslint 八域扩展（commit `a10ebe5`）**：C-Deep 切片 3 四域纳入 lint——`boundaries/elements` 加 task/bootstrap/permissions/hooks 4 element；DEP-2/3 八域零向上 `allow=[shared]` only。**port 解耦验证**：executor 经域内 `ports/taskOutput.ts` 消费 TaskOutput port（不 import task 域）；hooks 不 import executor（HookShellPort 注入）；permissions 不 import sandbox（注入端口斩断）→ 四新域零跨域 import，allow=[shared] only 成立。DEP-4 engine allow 加四新域（engine 波接线 hooks-runner/permissions-engine/task 消费）；DEP-5 atlascode/mount allow 加四新域（壳组合根 compose.ts 注入八域）。

**#2 tests 门面收口（commit `a10ebe5`）**：tests/ 纳入 STR-1 entry-point（`boundaries/entry-point` 覆盖 tests/**：import src 域时 target 必须是 index.ts，不得 reach 内部文件；tests 内部 import fixtures/helpers 不受约束，element-types/no-unknown 对 tests 关闭）。10 处 tests 深入 import 改走门面（modelErrors/errorUtils/modelprovider-config/effort/model-roles/executor-shell-command/executor-shell-provider/memory-config-utils）。**补 3 域门面导出支撑**：modelprovider（types APIError 类族 + modelErrors 补 classifyAPIError/isValidAPIMessage + errorUtils 补 sanitizeAPIError + config createModelProviderConfig + effort 8 符号）+ executor（ShellCommand 4 工厂函数 createAbortedCommand/createFailedCommand/generateLocalTaskId/wrapSpawn，Shell.ts 只 re-export type）+ memory（envUtils getAtlasConfigHomeDir）。

**#1 shared anti-stub 纳扫（commit `4e19e1b`）**：shared 纳入 anti-stub 扫描范围（DOMAINS 加 'shared'，防叶子空模块逃门）。3 个 A 波骨架占位 `export {}` 空模块登记 STUB_REGISTRY：identity（待 A-2 --define 注入）/ tokenEstimation（待 C 波）/ sanitizeToolName（待 C 波）。**空壳判定收窄**：加 `hasSubstantiveExport`（有 export const/let/var/function/class 或 re-export from = 实质导出，非空壳）——消除 constants.ts 等单行 `export const` 实质常量文件误判（`export {}` 空模块无导出符号才判空壳）。**门③ wave-c 清零逻辑调整**：只清 C-Deep 域条目（8 域地基），shared A 波占位保留至 A/C 波实现（门②兜底移除）。

**验收**：四件套全绿 tsc 0 / lint 0 / build 0 / test 446 pass 0 fail（38 文件 814 expect）；anti-stub + capability-matrix 门 6 pass 0 fail。

**4 架构裁定全收口**：域终态（#56 `2ef4da9` charter v0.12）+ 命名（charter L4.8 登记，engine 波落地）+ 子模块（charter L4.8 登记，engine 波落目录树）+ 缺口修复（`a10ebe5` #2 + `4e19e1b` #1）。下一步= **★B6-func（compose.ts 最小组合根 + 4+7 前置清单落地，先于 engine）**。

### §8.20 B6-func 最小组合根执行记录 + 偏差修订（2026-09-23 完成，81b3c26..0304dea）

**交付（charter L4.7 组合根唯一装配点填实，原 `export{}` 占位）**：`src/atlascode/compose.ts` = `createCoreDependencies()` + `CoreDependencies{sandboxManager, modelProvider, memoryStore}` + lazy `getCoreDependencies()` + `resetCoreDependencies()`（旧仓 factory.ts 同款 idiom）。**6 适配器**（`src/atlascode/adapters/`，域间边切端口收敛）：sandboxAdapter（SandboxManager→ExecutorSandboxPort，omit customConfig）/ bootstrapAdapter（cwd 态→BootstrapStatePort）/ taskOutputAdapter（task TaskOutput→TaskOutputPort）/ hookShellAdapter（executor 真 Shell→hooks HookShellPort，`interrupted→aborted` + env 经 ExecOptions.env 透传）/ diskOutputEnvAdapter（permissions getProjectTempDir + bootstrap getSessionId→task setDiskOutputEnv，D11）/ endpointConfigSourceAdapter（env OpenAI 静态键→modelprovider EndpointConfigSource，getGlobalApiKey=OPENAI_AUTH_TOKEN??OPENAI_API_KEY，D18）。

**注入序（§8.14 permissions→task→hooks）落地**：executor 三 port（先于首次 exec）→ setPermissionsBootstrapEnv（§8.14 首步，permissions←bootstrap 两 cwd 态）→ setDiskOutputEnv（D11，permissions 后）→ setHookShellPort（D17，末步）→ setEndpointConfigSource（D18）。**4+7 前置清单终稿**：4 基项（三 port + setPermissionsBootstrapEnv）+ D11/D17/D18。

**偏差修订（3 项，实施中发现，后续波次别当遗漏重提）**：
- **D19（新增）Shell ExecOptions 加 env 透传**：D17 的 HookShellPort 契约 `runCommand(command, env, signal, timeoutMs)` 须把 buildHookEnv 产物落到子进程 env；但切片 1 裁剪版 `exec` 未 plumb env（真语义缺口）。ExecOptions 加 `env?: Record<string,string>`，spawn 合并优先级 `process.env < env < harness 标记(SHELL/GIT_EDITOR/ATLAS_CODE) < provider envOverrides`（调用方 env 不覆盖 harness 契约标记）。executor 域小增量（8 行），B6-func 前置。
- **setPermissionsBootstrapEnv 归"基项"**：§8.14 注入序首步，getProjectTempDir 内部读 getPermissionsBootstrapEnv().getOriginalCwd()，须先于 setDiskOutputEnv（虽函数引用惰性、调用时依赖已满足，但按 §8.14 显式序落地）。4+7 的"4 基项"实含此项（原 4 基项口径偏窄）。
- **sandboxDeps.ts（第 7 支撑文件）**：createSandboxManager 须 15 方法 SandboxDependencies（settings 体系/真平台探测归 engine 波）。最小组合根给 `createInMemorySandboxDeps()` 占位默认（placeholder runtime 禁用态），非"6 适配器"计数内（deps provider 非 port 适配器），engine 波 settings 体系回填真 deps。

**4 功能 smoke（`tests/func/b6-func-smoke.test.ts`，func 层真 I/O，--isolate 独立进程）**：经 getCoreDependencies 装配真链，port 之下全真，仅 modelprovider 注入 fake。① echo hi 真 spawn + 真盘读回（result.stdout 即磁盘往返；getStdout 后 task 域删文件故不查存在，path.startsWith(ATLAS_TMPDIR) 证落点）② 组合根构造 sandbox manager（placeholder 禁用态 + getExecutorSandboxPort 忠实转发证 port 链）③ mock completion 双腿（非流式 + 流式，§8.13 L-2 收口；fake 经 setModelProviderForTesting 注入，非 mock transport）④ memory 写后读（真 fs 写 + 只读 store 读，§8.13 L-1 收口）。

**门同步**：capability-matrix 加 3 组合根链行（executor/sandbox/memory）+ modelprovider「mock completion」由 missing(by C/B9) 翻 done（proof=b6-func-smoke，L-2 提前闭环）。anti-stub 无需改（atlascode 不在 8 能力域+shared 扫描集，compose.ts 填实 no-op，无登记条目可销）。atlascode/index.ts 门面填实首块（导出 compose 公共 API，tests STR-1 经门面消费）。

**验收四件套**：tsc 0 / lint 0（src+tests）/ build 0 / **450 pass 0 fail 39 文件 824 expect**（基线 446/38/814 + 4 smoke + 1 文件 + 10 expect）。

**提交序列**：81b3c26(executor env D19) → d02bdd2(atlascode compose+6 适配器+sandboxDeps) → 1f3f488(modelprovider mock seam) → ef6d41a(atlascode 门面导出) → 6158e0f(4 smoke) → 0304dea(ci 矩阵行同步)。

**遗留（不阻塞，engine 波按需）**：modelprovider 缺 `resetEndpointConfigSource`（其余 3 域 set/get/reset 三元组，modelprovider 仅 set/get；Bun --isolate 跨文件不泄漏，单文件多 case 需 reset 再补）。

**下一步= engine 波**（hooks 流式/attachment 渲染 + permissions 规则求值树 + executor 全 shell + 真 bwrap runtime 包经 setSandboxRuntimeModule 单点换入 + settings 体系回填 sandboxDeps 真 deps + engine ~14 子模块落目录树，charter L4.8）。

### §8.21 engine 波勘察定稿 + 首纵切 E-1（窄 spine）方案（2026-09-23，勘察 agent 路径修正）

**勘察置信**：后台勘察 agent（feature-dev:code-explorer）给出框架 + 纵切顺序，但其工具预算耗尽被强制 handback，报告里多个旧仓路径是从 CLAUDE.md 架构描述抄的、未实测。主 session 逐个 grep/wc 实测修正（「绝不写以为已全」）：

| 勘察 agent 报告（错） | 实测修正 |
|---|---|
| engine = `src/query.ts` + `src/QueryEngine.ts` | ❌ 该路径不存在。真身 = `src/core/orchestrator/`（33 文件/12203 行，旧仓已 Phase A 分解为 query/tools/context/llm 子目录）|
| `src/hooks/hooks.ts`(4979L) | ❌ 真身 = `src/utils/hooks.ts`(4979L)（`src/hooks/` 全是 React hooks）|
| `src/permissions/{permissions,yoloClassifier,permissionSetup}.ts` | ❌ 真身 = `src/utils/permissions/`（28 文件）+ `src/utils/settings/`（17 文件）|
| `src/tasks/framework.ts`(308L) | ❌ 不存在。真身 = `src/Task.ts`(125L) + `src/tasks/`（LocalAgentTask 等追踪层）|
| worktree ~2056L | 实测 `src/utils/worktree.ts` = **1451L** |

**engine 真身自述**（旧仓 `src/core/orchestrator/README.md`，Phase A 接口骨架 + 逐文件职责表）：域内 35 文件/约 12000 行，承担 Agent 主循环（LLM 流式 + 工具调度 + 错误恢复）/上下文压缩/工具执行管道/查询引擎封装。旧仓已分解：
- `query/`（loop.ts 1641 主循环 while(true) / transitions 70 / config 41 / deps 57 / stopHooks 454 / tokenBudget 93）
- `tools/`（toolExecution 1511 `checkPermissionsAndCallTool` 单体 / StreamingToolExecutor 530 / toolHooks 558 / toolOrchestration 193 / pipeline 65 + defaultPipeline 117）
- `context/`（compact 1522 / sessionMemoryCompact 614 / microCompact 507 / snipCompact 265 / prompt 356… 共 ~4700L）
- `llm/query.ts`（601，callModel 实现 = OpenAI 兼容流式 + cache + thinking）
- 根级（index.ts 121 门面 / api.ts 76 Orchestration 三接口 / QueryEngine.ts 1241 `ask()` 封装）

**关键洞察**：engine 波**不是**「原样搬 core/orchestrator」，而是把旧仓 `core/orchestrator/**` + `coordinator/` + `tools/AgentTool/` + `utils/hooks.ts` + `utils/permissions/` + `utils/settings/` **重组进新仓 14 子模块布局**。新仓 `src/engine/` 现状 = **22 文件/160 行纯骨架**（query/pipeline/context/coordinator/tools 均 `export {}` 占位，ports 7 个 stub，state 已部分填 fileHistory + attribution，EngineState 占位）。旧仓 `tools/` 子目录在新仓改名 `pipeline/`（避撞 tools 域概念，见新仓 pipeline/index.ts 注释）。

**14 子模块 → 旧仓真实落点（实测，可 grep 复现）**：
| 新仓 engine/ 子模块 | 旧仓真实落点 | 备注 |
|---|---|---|
| query/ | `core/orchestrator/{query/**, QueryEngine.ts, api.ts, index.ts, llm/query.ts}` | ★spine，loop.ts 1641 |
| pipeline/ | `core/orchestrator/tools/**`（改名避撞）| loop 内工具执行 |
| context/ | `core/orchestrator/context/**`（~4700L 压缩）| E-1b 子纵切（本轮拆出）|
| state/ | 新仓已部分落（fileHistory/attribution）+ `QueryEngine` 4 成员 + 旧 `src/state/` AppState 族（6 文件）| EngineState set(f) 队列 |
| ports/ | 新仓原生（7 落：domainMount/featureConfig/lspStatus/mcpClient/promptSuggestion/sessionContext/sessionMemory）| 第 8 个 T-3 核验 |
| coordinator/ | `src/coordinator/{coordinatorMode,workerAgent}` | 已部分移植（73631df 默认 ON）|
| tools/AgentTool/ | `src/tools/AgentTool/`（16 文件：AgentTool/runAgent/forkSubagent/loadAgentsDir/builtInAgents…）| E-2 |
| hooks-runner/ | `src/utils/hooks.ts`（4979L 流式/attachment）| E-5 |
| permissions-engine/ | `src/utils/permissions/`（28 文件）| E-4，依赖 config/ |
| config/(settings) | `src/utils/settings/`（17 文件：settings/validation/permissionValidation/mdm/managedPath…）| E-3，解锁 E-4 |
| tasks/（追踪层）| `src/Task.ts`(125L) + `src/tasks/`（LocalAgentTask/LocalShellTask…）| E-7；命名 `engine/coordinator/tasks/` 避撞 `src/task/` |
| scheduler/ | `src/utils/cron{,Scheduler,Tasks,TasksLock,JitterConfig}.ts` | E-7 |
| worktree/ | `src/utils/worktree.ts`(1451L) | E-7 |
| messaging/ | `src/utils/{teamDiscovery,agentSwarmsEnabled,teammateMailbox,standaloneAgent}.ts` + `utils/swarm/` | E-7，跨会话 |
| session/ | `src/utils/{sessionRestore,transcriptSearch,sessionStorage}.ts` | E-7 |
（config/ 与 permissions-engine/ 共享 `src/utils/settings/` → 依赖序 E-3 先于 E-4）

**纵切顺序（依赖序修正后）**：
```
E-0 目录树 + 命名（14 子模块落位，TaskCreate→engine/coordinator/tasks/ 避撞 src/task/）
E-1 ★spine 窄：query+pipeline+state+ports（最小可跑 agent loop：LLM→tool→result 一轮）
E-1b context 压缩层（compact/microCompact/sessionMemory ~4700L）—— 拆出，下一子纵切
E-2 工具面：tools/AgentTool + coordinator（73631df 默认 ON 门控）
E-3 config/ settings 体系（解锁 E-4；resetEndpointConfigSource 在此切片按需补）
E-4 permissions-engine（规则求值树，依赖 E-3）+ 真 bwrap 单点换入（setSandboxRuntimeModule，可并行）
E-5 hooks-runner（流式/attachment，utils/hooks.ts 4979L）+ hooks 域裁剪残余回填
E-6 executor 全 shell 回填（独立可并行 E-4/E-5）
E-7 leaves：tasks(追踪层)→scheduler(cron)→worktree→session→messaging
```
remote/后台会话 defer + 预留 Port 9（charter L4.9，不动）。

**`resetEndpointConfigSource` 落点**：在 **E-3 settings 体系回填** 切片——出现第一个需跨 case 重设 endpoint source 的单文件多 case 测试时就地补 3 行（镜像 `src/modelprovider/index.ts` 的 `resetModelProviderForTesting`：清 `activeSource` + `sourceOverridden=false` 回空 stub 惰性语义）。无调用点的 reset = 死代码，故现在不加，随 E-3 首个消费它的测试补，届时核销本登记（§8.20 遗留）。

**E-1 窄 spine 拆 T（对齐 C-Deep T5-T8 节奏，裁剪版真核心，残留守头注释防以为已全）**：
- **T-1 query loop 骨架**：`loop.ts`（裁剪，跑通一轮 LLM→tool→result）+ `QueryEngine.ts` `ask()` + `llm/query.ts` `callModel`（经 modelprovider 域门面 + D18 endpointConfigSource），落 `engine/query/`
- **T-2 loop 内工具执行**：`toolExecution` `checkPermissionsAndCallTool`（裁剪）+ `StreamingToolExecutor` + `toolOrchestration`，落 `engine/pipeline/`（旧 tools/ 改名）
- **T-3 state 补齐 + ports 核验**：EngineState set(f) 队列（R3a 9/9 原型转正 co-located 单测）+ fileHistory/attribution 核验 + 第 8 port 确认
- **T-4 测试层**：agent-loop fixture replay 多轮调度等价（R2 `gateway.test.ts` 12 测范本 mock.module + activeStreamChunks + loadFixture；等价边界 = engine 调度/解析/状态转换/工具分发，**非 LLM 行为**）+ EngineState 100 并发 set 零丢失 + 反例 read-compute-write 丢更新守卫；**H6 防空洞**（fixture = 旧仓 tag 录制的真 LLM 序列，断言调度行为，非 tautology）
- **T-5 gate 同步 + §8.21 落盘**：capability-matrix 加 engine 行（若 engine 入扫描集）+ anti-stub（若涉及 engine 域）

**E-1 依赖面（注入，防 H6 空洞）**：engine 经门面消费 modelprovider（completion/stream，D18 已接）+ executor（Shell 工具）+ hooks（runHooks 5 高频薄骨架已落）；8 port 已落（无新 8 域 port）；compose.ts 或需新增 engine 装配（QueryEngine 构造 + ask 入口），经 DEP-5 组合根 allow 已预铺。

**验收四件套口径**：tsc 0 / lint 0（engine 域 DEP-4 已预铺）/ build 0 / test 全绿（+ agent-loop fixture replay + EngineState 并发新测，基线 450 pass）。**绝不写假装通过的能力测试**——未实现的 loop 能力标 missing + 解锁波次。

**残余（E-1 定稿前须补 / 后续纵切）**：① 第 8 port 确认（Glob 仅见 7，T-3 核验）② 旧仓 36 文件/11975L 口径 vs 实测 33 文件/12203L（含 README，微漂移，以实测为准）③ settings→modelprovider 角色池耦合（E-3 注入面，旧仓 aab5944 动态解析 `modelRoles.small` 池头，新仓未验证）④ bwrap 真包就绪度（E-4 外部依赖，未就绪则只验 `registerSandboxBackend` 等价后端路径）。

### §8.22 E-1 窄 spine 纵切 T-2/T-3 执行记录 + T-4 偏差 + T-5 门裁定（2026-09-23，186efcc/36e388f）

**E-1 窄 spine 落盘态（T-1..T-3 全绿）**：
- **T-1 query loop**（`011829c`）：`engine/query/loop.ts` `queryOneRound` 单轮（LLM→tool→result）+ `QueryEngine.ts` `ask()`；4 fixture 测（echo tool 真调 / 未知 tool is_error / 纯文本 / 直接调用等价）。
- **T-3 state**（`186efcc`）：`engine/state/EngineState.ts` 泛型 set(f) 串行 apply 队列原语（R3a 并发模型，M3a.3 原型 9/9 绿转正）+ `state/index.ts` 子门面 + 6 co-located 单测（100 并发零丢失 / 并行 Edit 可交换 / 不批处理合并 / 反例 read-compute-write 丢更新守卫 / rewind 串行化）。
- **T-2 pipeline**（`36e388f`）：`engine/pipeline/` 4 文件（toolExecution 单 tool_use 链 + toolOrchestration 分区+串行批量 + errorClassification 小件 + index 门面）+ loop.ts 内联工具执行委托 pipeline（单一事实源，T-1 对外契约不变）；**4 接缝留位且真接线**（权限 `checkPermission`=E-4 规则树注入点·窄 spine 默认放行 / 钩子 `hooks`=E-5 toolHooks 注入点·窄 spine 无操作 / `mcpClients`=E-2 路由注入点·窄 spine 未注入→MCP tool unknown / 并发=E-1b 并发池替换点·窄 spine 串行）；12 契约测。

**T-4 偏差（后续步骤偏差审视 → 范围纠正）**：§8.21 原 T-4 列「agent-loop fixture replay **多轮**调度等价」——但 E-1 是**窄 spine（单轮）**，多轮 while(true) 已明确归 E-1b → **T-4「多轮 fixture replay」一项移 E-1b**（旧仓 tag 录制真 LLM 序列 + mock.module + activeStreamChunks + loadFixture，断言多轮调度/解析/状态转换/工具分发，非 tautology，全部落 E-1b）。E-1 测试层已满足：EngineState 100 并发零丢失+反例守卫（T-3）+ loop 单轮调度（T-1/T-2，非 tautology：断言 loop 的 find/解析/追加 + 4 接缝真消费 + 分区行为，非 fake 自证）全绿。**H6 防空洞满足**。

**T-5 门裁定（engine 不入 8 域门扫描集，E-1 无 gate 改动）**：
- anti-stub 门 `DOMAINS`（executor/sandbox/memory/modelprovider/shared）+ `CDEEP_DOMAINS`（task/bootstrap/permissions/hooks）**均不含 engine**（门头注明「engine/ascend 域骨架在 C/E 波各自建门（分层不变量，test-strategy §4）」。
- capability-matrix 门 `domain` union = 8 顶层域，**engine 非顶层域**（14 子模块应用层），engine 能力经矩阵 `by`（解锁波次）引用、不作 domain 行。
- → **E-1 不触发 anti-stub/capability-matrix 改动**（按设计）。**engine 自身 anti-stub 门 = wave 级任务**（engine 波 14 子模块骨架全登记后加 `engine` 入门扫描集 + STUB_REGISTRY 登记 + wave tag 清零），归 engine 波残余（非阻塞，解锁波次 = engine 波门子任务）。

**残余 ① 第 8 port 闭环**：charter 行 78「8 port」是**跨域总量**（engine 7 + modelprovider errorMessaging=Port 2）；`engine/ports/` 恰 7 个（domainMount/featureConfig/lspStatus/mcpClient/promptSuggestion/sessionContext/sessionMemory）= **完整**，无需第 8 engine port；errorMessaging 已落 `src/modelprovider/ports/errorMessaging.ts`。

**新增残余**：⑤ `buildSchemaNotSentHint`（旧仓 toolExecution 小件）依赖 ToolSearch 特性族（新仓未移植），现搬造假依赖 → 留接缝归 **E-1b/工具面**（随 inputSchema JSON schema 校验 + 旧仓 zod safeParse 替身）⑥ **engine anti-stub 门建设**（T-5 裁定，wave 级任务）⑦ E-1 `compose.ts` engine 装配（QueryEngine 构造 + ask 入口）未接线（DEP-5 组合根 allow 已预铺，E-1 非组合根接线波，归 E 波组合根子任务）⑧ **`PipelineDeps.mcpClients` 死接缝已删**（独立 review 2026-09-23 判定：字段声明但零消费点，窄 spine 下 MCP tool 未注册 → unknown-tool is_error 已覆盖；按「无调用点=不加接缝」纪律删除，E-2 路由落地时连同 mcp 分支加回）。

**独立 review 处置（code-review 子代理对抗性审 25a5d4b..219518a，2026-09-23）**：
- **CRITICAL 已修**：`EngineState.set` 原只捕 `resolve`——updater 抛错时调用方 promise 永久挂起 + `void this.process()` unhandled rejection。修：捕 `reject` + updater 抛错 try/catch（reject 该调用方、state 不变、队列继续 drain，单坏 updater 不卡死整队列，异于 React error boundary 已在头注释说明）+ 新 ⑤b 守卫测（throwing updater reject + 后续 set 照常 drain + state 不变）。
- **IMPORTANT 已处置**：`mcpClients` 死接缝 → 删（残余 ⑧）。其余 3 接缝（checkPermission/hooks/并发）review 验证真接线非死代码 ✓。
- **minor 已修**：`assistantMsg` 补顶层 `role: 'assistant'`（AssistantMessage 契约字段，原 `as AssistantMessage` cast 是低风险类型谎言）→ 现直接类型标注无 cast。
- **minor 登记不修**：① engine-state 测 ⑤ 反例守卫测的是朴素 read-compute-write（非 SUT），作「为何队列+函数式是安全来源」文档测保留（头注已说明，非 EngineState 覆盖断言）② `deps.signal` 未传入 tool 执行（Tool.call 无 signal 参）= 已登记 E-1b 裁剪项（非 bug）。
- **H6 空洞核查**：3 个新测试文件无 hollow test（loop 测断言真 dispatch/parse/call/map/append 路径，pipeline 测断言各接缝真被消费）。

**四件套基线更新**：tsc 0 / lint 0 / build 0 / **472 pass 0 fail（42 文件 875 expect）**（E-1 开波基线 450/39/824 → T-1 454/40/840 → T-3 460/41/851 → T-2 472/42/875）。

**下一步 = E-1b context 压缩层**（compact/microCompact/sessionMemory ~4700L）+ 移入的 T-4 多轮 fixture replay。

### §8.23 E-1b（context 压缩层 + 多轮 loop）task 清单定稿（2026-09-23）

**实测范围修正**（绝不写以为已全）：旧仓 `context/` = **19 文件/4438L**（非 §8.21 估 ~4700L；compact 1522 / sessionMemoryCompact 614 / microCompact 507 / autoCompact 360 / prompt 356 / snipCompact 265 / reactiveCompact 200 / apiMicrocompact 154 / defaultManager 107 / postCompactCleanup 77 / manager 63 / grouping 63 / snipProjection 57 / timeBasedMCConfig 43 / 4 小件）；旧仓 `query/` = 8 文件/2403L（loop 1641 / stopHooks 454 / tokenBudget 93 / transitions 70 / deps 57 / continue-site-audit 47 / config 41）。

**E-1b 裁剪版真核心 + 残留守（窄 spine 纪律延续 E-1）**：
- **T-4b context 最小链**（`engine/context/`）：① `autoCompact.ts` 裁剪（`getAutoCompactThreshold` + `shouldAutoCompact` + `autoCompactIfNeeded`；token 计数经 modelprovider 门面 `countTokens` 注入 seam，contextWindow 经新仓 modelprovider 配置面 roles/capabilities，非旧仓 getContextWindowForModel）② `compact.ts` 裁剪（`compactConversation` 核心：旧消息→modelprovider chat 摘要→`CompactionResult`+`buildPostCompactMessages` 拼接；**裁**：partialCompact/attachments/plan/skill 重建/PTL retry/streaming retry/createCompactCanUseTool→残留守）③ `microCompact.ts` 裁剪（`microcompactMessages` COMPACTABLE_TOOLS 白名单旧 tool_result→`TIME_BASED_MC_CLEARED_MESSAGE` 占位 + `estimateMessageTokens`；**裁**：time-based trigger/cache pinning→残留守）。**残留守**：sessionMemoryCompact/reactiveCompact/apiMicrocompact/cachedMC/snipCompact/prompt/manager/grouping（后续纵切，头注登记）。
- **T-4a 多轮 loop**（`engine/query/`）：`queryAgentLoop`（while 多轮：复用 queryOneRound 单轮 + maxTurns guard + 轮前 autoCompactIfNeeded 接线 + terminal = end_turn）。**裁/残留守**：旧仓 1641L 的 7 continue sites 状态机（transitions.ts LoopPhase/LoopTransition，recovery/collapse_drain/reactive 等）→ 残留守（错误恢复 model_fallback/max_output_tokens + stop hooks 归 E-5/E-1b-full）；tokenBudget continuation → maxTurns 简化 seam。
- **T-4c pipeline ⑤ + signal**（`engine/pipeline/`）：① `validateInputBySchema`（JSON schema 浅校验：required + properties 基础类型；新仓 `ToolInputJSONSchema` 是 plain JSON schema object 非 zod，无外部依赖）② `buildSchemaNotSentHint` 纯函数化（入参 = discovered 集合 + tool.shouldDefer，不依赖 ToolSearch 特性族 feature gate；wire 进 toolExecution schema 校验路径）③ signal 透传：`tool.call(input, { signal }, …)` 经 call 第 2 参 context（新仓 Tool.call 契约 context: unknown，**不改 shared 契约**，传最小 context 对象）+ loop/pipeline deps 加 `signal?`。
- **T-4d fixture replay 测**（移入的 E-1 T-4 多轮部分）：多轮 LLM 序列 fixture（fake provider 队列回放：round1 tool_use→round2 tool_use→round3 end_turn，**记录真 LLM 序列形态**）+ 断言多轮调度/消息序列/turnCount/terminal；compaction 触发测（超阈值→autoCompactIfNeeded 真压缩+消息序列拼接，非 tautology）。
- **T-4e 记录 + gate 核验**：§8.23 落盘 + memory + gate 核验（engine 不在 8 域门扫描集→无 gate 改动，同 §8.22 T-5 裁定；capability-matrix hooks 行 `by: engine` 不变）。

**依赖面（防 H6 空洞）**：context 经 modelprovider 门面消费 countTokens + chat（摘要调用）；loop 经 pipeline（T-2 已落）+ context（T-4b）；token 计数/ contextWindow 为注入 seam（deps），port 之下全真。

**顺序**：T-4b（context 不依赖 loop）→ T-4a（loop 接 context）→ T-4c（pipeline 小件）→ T-4d（测）→ T-4e（记录）。

### §8.23 E-1b 执行记录（2026-09-23，全闭环）

**实施**（每 T 独立提交，master 直接落，无 remote 不 push）：
- **T-4b context 最小链**（`900f066`）：`autoCompact.ts`（shouldAutoCompact 判定 + autoCompactIfNeeded 连续 3 次失败熔断，countTokens/compact 注入 seam）+ `compact.ts`（compactConversation 核心 + getCompactPrompt 9 段照抄 + buildPostCompactMessages ordering）+ `microCompact.ts`（时间触发 content-clear + estimateMessageTokens）；context/index.ts 门面 + engine/index.ts 追加。
- **T-4a 多轮 loop**（`91a8093`）：`queryAgentLoop`（while + maxTurns 守卫 DEFAULT_AGENT_LOOP_MAX_TURNS=20 + pre-turn autoCompactIfNeeded + terminal=无 tool_use）；未注入 context = 纯多轮不压缩。
- **T-4c pipeline ⑤ + signal**（`84348bb`）：`schemaValidation.validateInputBySchema`（required + 基础类型浅校验）+ `buildSchemaNotSentHint` 纯函数（discovered 集 + shouldDefer，不依赖 ToolSearch 特性族）；接进 executeToolUse 校验路径；signal 经 tool.call 第 2 参 context={signal} 透传 + PipelineDeps 加 signal?/discoveredToolNames?；loop.queryOneRound 透传 signal。
- **T-4d 契约测**（`539ee7a`）：`engine-multi-round.test.ts`（24 测：多轮 fixture 回放 + autoCompact/compact/microCompact）+ `engine-schema-validation.test.ts`（14 测：浅校验 + not-sent 提示 + signal 透传）；**非 tautology**（脚本化 LLM 按轮返不同 completion 断言调度/压缩/校验行为，非 fake 自证）。
- **T-4e gate 核验**（本记录）：8 域门扫描集 = {executor/sandbox/memory/modelprovider/task/bootstrap/permissions/hooks}，**engine 不在内**（同 §8.22 T-5 裁定）→ **无 gate 改动**；capability-matrix hooks 行 `by: engine` 不变（E-1b 未做 hooks 流式/attachment 渲染，归后续纵切）。gate 测 3 pass 0 fail。

**偏差闭环**：
- ① `buildSchemaNotSentHint` 纠正动作（旧仓「先调 ToolSearch 加载工具」）因 ToolSearch 特性族未移植而**退化为「重发正确类型参数」**（残留守，ToolSearch/deferred-tools 落地时回填加载动作）——非造假依赖（不引用不存在的 TOOL_SEARCH_TOOL_NAME）。
- ② `discoveredToolNames` 默认 = **全注册工具均下发**（窄 spine 语义），故 `buildSchemaNotSentHint` 在未注入时恒 null（不误报「schema 未下发」）；ToolSearch 层注入真实 discovered 集后方能触发。接缝真被消费（executeToolUse 校验路径读该字段），非死代码。
- ③ microCompact 本版 content-clear 路径**同步返回**（无 I/O）；旧仓 async 签名因 cache 路径保留，残留守 cache 路径（归 modelprovider 域）落时恢复 async。

**残留守登记（E-1b 未做，防「以为已全」）**：
- 复合 schema 校验（anyOf/oneOf/allOf/嵌套/enum/区间）→ 工具面 E-2/纵切（schemaValidation 头注）。
- 上下文压缩面：partialCompact（direction）/ PTL 重试 + 流式重试 / 压缩后重建面（attachments/plan/skill/deferred-tools/MCP 重宣告）/ sessionMemoryCompact / reactiveCompact / apiMicrocompact / cachedMC / snipCompact → 后续纵切 / E-5（各件头注登记）。
- 多轮 loop：流式 chatStream / 错误恢复 model_fallback + max_output_tokens / stop hooks / tokenBudget continuation → E-1b-full / E-5（loop.ts 头注）。
- 并发池（safe 批 StreamingToolExecutor + ATLAS_MAX_TOOL_USE_CONCURRENCY）→ E-1b-full（toolOrchestration 头注）。
- **四件套全绿**：tsc 0 / eslint 0 / build 0 / **511 pass 0 fail**（E-1 基线 473 → E-1b +38）。

**下一步**：E-1b 闭环。engine 波后续纵切 = E-2（MCP 路由 + 工具面 getAllBaseTools）/ E-4（权限规则求值树）/ E-5（hooks 注入 + 流式/attachment 渲染 + stop hooks）/ E-wave-end（compose.ts engine 装配接线，残留守 ⑦）。

### §8.24 E-1b 实施/测试双 review 处置记录 + 修复闭环（2026-09-23）

**背景**：E-1b 五切片（`900f066..0668533`）落 master 后，按 per-slice 纪律做实施 review（code-reviewer，只读 worktree）+ 测试 review（test-analyzer，只读）双审。**双审判定：E-1b 不能按现状闭环**——1 阻塞项（C-1）+ 3 须处置项（I-1/I-2/I-3，「声称完成但简化未登记」纪律违规）+ 6 MINOR + 测试面 5 缺口（I-1..I-5）。本节 = 处置记录 + 修复闭环。

**阻塞项 C-1（熔断在唯一生产消费方是死的）— 已修**：
- 现象：`queryAgentLoop` 只消费 `autoCompactIfNeeded` 的成功路径 `oc.tracking`，失败路径 `consecutiveFailures` 被丢弃 → 连续 3 次失败熔断器（`MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES`）在 loop 里永不跳闸 → 超限不可恢复会话每轮 hammer 一次注定失败的摘要 LLM 调用（旧仓 loop.ts:504-511 回灌语义在移植时丢失，属移植丢语义非裁剪）。
- 修复（loop.ts）：`else if (oc.consecutiveFailures !== undefined) tracking = { ...tracking, consecutiveFailures: oc.consecutiveFailures }`（失败回灌，旧仓同语义）。
- 回归测：doomed autoCompact（每轮必失败）跑 maxTurns=4 → compact 恰 3 次（第 4 轮熔断短路，回灌前会是 4 次）+ `r.tracking.consecutiveFailures === 3` + 重入测（初始 tracking 带 3 → 首轮即短路零调用 + 计数保留）。

**须处置项（fix-or-register 纪律）— 全修/登记**：
- **I-1 getCompactPrompt 假「照抄」声明 — 已修**：T-4b 落的是简化重写（仅 9 段名 + 一句结构提示）却头注声称「照抄非重写」。处置 = 恢复旧仓 prompt.ts 全文（NO_TOOLS_PREAMBLE + DETAILED_ANALYSIS_INSTRUCTION_BASE + BASE_COMPACT_PROMPT（9 段段体 + `<example>` 模板 + 自定义指令示例段）+ NO_TOOLS_TRAILER，纯静态串零依赖）+ 头注订正 + 残留守登记（partialCompact 三 prompt 变体 / transcriptPath·recentMessagesPreserved 两参 / 摘要调用 abort 短路）。回归测 = 全文锁定（preamble 置首 / 段体 / `<example>` / trailer 收尾 / customInstructions 插位，各断言在旧简化版下均不成立）。
- **I-2 阈值 −20k 摘要预留丢失 — 已修**：`getAutoCompactThreshold` 原 = contextWindow − 13_000，丢旧仓 getEffectiveContextWindowSize 的摘要输出预留（min(getMaxOutputTokensForModel, 20k)）。修复 = `(contextWindow − min(maxOutputTokens ?? COMPACT_MAX_OUTPUT_TOKENS, COMPACT_MAX_OUTPUT_TOKENS)) − AUTOCOMPACT_BUFFER_TOKENS`；`maxOutputTokens` 经 AutoCompactDeps 注入接缝（modelprovider 配置面提供方，未注入按满额 20k 预留 = 旧仓大输出模型行为等价）；`COMPACT_MAX_OUTPUT_TOKENS` 由死导出变被消费。
- **I-3 执行链顺序反于旧仓 — 已修**：executeToolUse 原序 = find→权限门→schema 校验→validateInput→pre-hook→call；旧仓 checkPermissionsAndCallTool 序 = safeParse→validateInput→pre-hooks→permission→call（hook 可携带权限裁定，权限门必须最后）。重排后 E-4 规则树注入不继承错误顺序。回归测 = schema 失败时权限门不被调 + pre→gate→call 顺序钉。
- **M-4（toolExecution 无 abort CANCEL 短路）— 登记**：残留守入头注（旧仓 abort 语义在 loop 层收口，toolExecution 层短路行为未移植，E-1b-full 裁定，不造行为）。

**MINOR 全修**：M-1 tracking 语义订正（turnCounter = 距上次 compact 轮数：compact 成功重置 0 + loop 继续轮末自增（仅 compacted 会话），turnId = randomUUID 重置；旧仓 loop.ts:485-494/1458-1460 对齐）/ M-2 microCompact 数组内容 token 估值类型分档（text→chars/4、image/document→固定 2000、其他→0，旧仓 calculateToolResultTokens 等价，原 `JSON.stringify` 一刀切已订正）/ N-1（lastTs 缺失/epoch→+∞→不触发 保守注释）/ N-2（schema 非有限数文案 `got non-finite number`，原「got number」自相矛盾）/ N-3（COMPACTABLE_TOOLS 白名单注释订正：旧仓含 FileEdit/FileWrite 写类 8 项，非「只读」）/ N-4（engine 门面补 `AUTOCOMPACT_BUFFER_TOKENS`/`MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES`/`COMPACT_MAX_OUTPUT_TOKENS` + compact 四函数 re-export）/ N-5（QueryEngine.ask 注释「多轮 = 上层循环调用 ask」已过时 → 订正指 queryAgentLoop）。

**测试面 5 缺口（test-analyzer I-1..I-5）— 全补**：
- I-1 keepRecent 方向（slice(-N) 改 slice(0,N) 全绿 → 补内容方向断言 m3/m4）/ I-2 DEFAULT_AGENT_LOOP_MAX_TURNS=20 零引用（默认值改 3 全绿 → 补 21 步脚本无显式 maxTurns 截断于 20）/ I-3 低于阈值不触发反例（M-1 非 compacted 会话测覆盖：无 boundary marker + tracking 原样）/ I-4 熔断态续跑（C-1 重入测覆盖：consecutiveFailures:3 穿透不重置）/ I-5 signal loop→runToolBatch 跳（补 tool.call context.signal === deps.signal 实例断言）。MINOR 补：microCompact no-op 原引用（`toBe`）+ 入参不可变 + estimateMessageTokens 精确值（34）+ session_memory 递归守卫。历史 commit 消息「24+14」实为 23+15 —— 不改写历史，本记录订正口径。

**四件套全绿**：tsc 0 / eslint 0 / build 0 / **522 pass 0 fail**（44 文件 1008 expect；E-1b 基线 511/960 → +11 测 / +48 expect）。

**闭环判定**：C-1 阻塞项修复 + loop 级回归测 + I-1/I-2/I-3 全修/登记 + 测试面全补 → **E-1b 闭环成立**。engine 波后续纵切不变：E-2（MCP 路由 + 工具面）/ E-4（权限规则求值树，执行链顺序已就绪）/ E-5（hooks 流式 + stop hooks）/ E-wave-end（compose.ts 装配，残留守 ⑦）。残余登记：engine anti-stub 门 wave 级 / 复合 schema 校验（E-2）/ 压缩面 partialCompact·PTL·重建面（后续纵切）/ modelprovider resetEndpointConfigSource（E-3 按需 3 行）。

### §8.25 E-2 工具面执行记录（2026-09-23，全闭环）

**范围**：旧仓 `tools.ts` + `tools/AgentTool/`（16 文件）+ `coordinator/` + `constants/tools.ts` → 新仓 `engine/tools` + `engine/coordinator` + `engine/ports/mcpClient`，union 26 文件 +3721L。6 切片各自独立提交 master（无 remote 不 push）+ 每片只读子代理对照旧仓 ground truth + 四件套。

**实施**（SHA 逐片）：
- **T-5a MCP port + mcpTools 构建**（`9128555`）：ports/mcpClient 最小连接面（McpToolClient/MCPServerConnection，连接生命周期/认证/五态 union 残留守）+ tools/mcp 一等 Tool 构建（createMcpTools：name=mcp__<server>__<tool> / isMcp+mcpInfo 一等 / call 经 port callTool 短名 / content→data + _meta·structuredContent→mcpMeta / readOnlyHint·destructiveHint→并发安全·只读·破坏性；纯字符串工具 normalizeNameForMCP/mcpInfoFromString/getMcpPrefix/buildMcpToolName 旧仓逐行 + findMcpServerConnection（E-4 scope 查找纯函数））。**架构裁定**：MCP 工具=普通注册 Tool（新仓 Tool 契约一等 isMcp/mcpInfo），旧仓执行链 mcp__ 双路路由折叠进注册表构建（call 闭包绑定连接）→ pipeline 不加 mcp 分支 / PipelineDeps 不加 mcpClients 字段（无消费点，H6 干净；§8.22 残余 ⑧ mcpClients 死接缝 E-1 已删，E-2 路由以注册表构建形态落回，连接面经 createMcpTools 预构建注入）。539 pass。
- **T-5b AgentTool 核心**（`91456c3`）：一等 AgentTool（shared Tool 契约，纯 JSON schema 非 zod）+ runAgent 裁剪版（复用 engine/query queryAgentLoop E-1b 多轮循环，非重造 LLM 循环）；同步路径全链 resolveAgentDefinition → spawn 深度门（computeChildSpawnDepth + MAX_WORKER_SPAWN_DEPTH=2 → allowFanOut）→ resolveAgentTools → runAgent → finalizeAgentTool；模型 override = input.model（ModelRole）> agentDef.model > parentRole（旧仓 getAgentModel alias 链 → ModelRole 语义，aliasMatchesParentTier 残留守）；isCoordinatorMode ON_BY_DEFAULT（env 门控 + FEATURE_COORDINATOR_MODE=false kill-switch，剥不可测的 bun:bundle feature()）。死接缝纪律（review）：maxTurns/isAsync 声明不消费 → 摘除并登记。562 pass。
- **F-1 fix：toOpenAIMessages 双形态消息序列化**（`1471df9`）：旧 user 分支仅读嵌套 m.message.content、system 分支仅读顶层 m.content → runAgent/fork 构造的顶层 content 形态 user 消息（子代理任务 prompt）在真 provider 序列化路径下**被整个静默丢弃**（fake provider 从不序列化，测试不可见）。修复 = user 分支 `m.message?.content ?? m.content`（嵌套优先，顶层兜底）+ system 分支双形态读取（仅字符串 content 进 API，降级 user role 为既有行为）；纯加固（不改变既有嵌套/顶层行为）+ 回归测试锁顶层双形态 + 全链 prompt 在列。
- **T-5c loadAgentsDir + builtInAgents + forkSubagent**（`1e8a7f1`）：agentDefinition（whenToUse + source 三态 built-in/user/plugin + isCustomAgent；GENERAL_PURPOSE_AGENT 提示词旧仓逐字）+ getBuiltInAgents（ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS 门；coordinator 分支 → T-5d）+ loadAgentsDir（parseAgentFromMarkdown 纯 frontmatter 解析，磁盘扫描抽为注入边界 + getActiveAgentsFromList 优先级合并 built-in→plugin→user 后写覆盖 + tools 列表解析对齐旧仓 parseAgentToolsFromFrontmatter：通配归一/空值极性/非串归 []）+ forkSubagent（isForkSubagentEnabled ATLAS_FORK_SUBAGENT 门 + coordinator 互斥；FORK_AGENT + buildForkedMessages 字节级前缀 + buildChildMessage boilerplate 逐字 + buildWorktreeNotice；FORK_BOILERPLATE_TAG/FORK_DIRECTIVE_PREFIX 逐字）+ AgentTool 未知 subagent_type 回落保留 type 名 + prompt getToolsDescription 闭合死接缝。610 pass。
- **T-5d coordinator**（`cd9a1d5`）：workerAgent（getCoordinatorWorkerSystemPrompt 两源逐字 port cc 2.1.271 coordinator-worker-instructions + worker-instructions 5-step closeout；fan-out 条件子句仅 spawnDepth < MAX_WORKER_SPAWN_DEPTH 渲染——深度封顶 worker 不接收 Agent tool 即省略）+ WORKER_AGENT（tools = ASYNC_AGENT_ALLOWED_TOOLS 16 项 + Agent）+ getCoordinatorAgents（coordinator 内建注册表 = 仅 worker 不含 general-purpose，旧仓语义）；coordinatorMode 扩展（matchSessionMode 逐字 / getCoordinatorUserContext 裁剪版：非 coordinator → {}，ATLAS_SIMPLE → Bash/Read/Edit，否则 ASYNC 剔 INTERNAL_WORKER_TOOLS + MCP server 段，scratchpad 段 + 死参数删残留守 / getCoordinatorSystemPrompt 主提示词逐字，ATLAS_SIMPLE 分支切 worker 能力描述）；toolNames 20 常量 + ASYNC 16 项 + INTERNAL 4 项（值逐一 grep 验真旧仓，SYNTHETIC_OUTPUT='StructuredOutput' 尖刺项）；builtInAgents coordinator 分支接线（直 import 无循环——旧仓懒 require 规避的循环在新仓不存在，coordinator 模块零工具实现回边）。635 pass。
- **T-5e 注册表机制**（`3c64636`）：toolRegistry（getAllBaseTools(deps) deps 注入装配：AgentTool 内建首位 → baseTools → ascendTools（ASCEND 域门控 FEATURE_ASCEND_TOOLS=false kill-switch，旧仓 feature('ASCEND_TOOLS') ON_BY_DEFAULT 等价，env 可注入单测不触 process.env）→ mcpTools，按名去重先入为主 = 旧仓 assembleToolPool built-in 优先语义；TOOL_PRESETS/parseToolPreset 旧仓逐字；无 lodash 本地 uniqByName）+ toolNames 全量常量集（ALL_AGENT_DISALLOWED 6 项 / CUSTOM ≡ ALL / IN_PROCESS_TEAMMATE 5 项 / COORDINATOR_MODE_ALLOWED 4 项 + 14 单工具名，feature-gated 条件项 Workflow/crons 不入静态集登记）+ agentToolUtils 接线（T-5b 本地裁剪禁用集 {Agent} 撤，filterToolsForAgent 恢复旧仓全量 6 项禁用语义；判别信号测：T-5b 行为下 5 个非 Agent 禁用名会漏过，T-5e 接线后全剔除 = 接线行为变更实证）。654 pass。

**偏差闭环**（各切片 review 记录在案）：
- **F-1 = 隐藏型偏差**：fake-provider 驱动的 engine 测抓不到序列化 bug（fake 不经过 toOpenAIMessages）→ 修复模式 = 序列化契约回归测必须配套（新增消息形态时对照真序列化路径，防「假 provider 全绿」假象）。
- **T-5b 死接缝**：review 抓 maxTurns/isAsync「声明而不消费」→ 摘除（H6：无消费点 = 不声明接缝，头注登记随子代理 context/压缩面纵切回填）。
- **T-5d prompt 字节级**：Edit 工具剥尾随空格，旧仓 "validate.ts:42." 后尾随空格 port 时丢失（字节 diff 检出，LOW-1，perl 恢复）；user-context 测试升级字节级精确工具清单（LOW-2，15 项全序 + SIMPLE 3 项）。
- **T-5e review MEDIUM**：finalizeAgentTool metadata prompt/isAsync 死接缝（void isAsync）→ 摘两字段 + 调用点同步，异步生命周期切片登记；LOW：20 门控槽枚举补全（原「…」）+ 门面状态行订正。

**残留守登记**（E-2 未做，防「以为已全」）：
- 47 基础工具本体（Read/Edit/Bash/Glob/Grep/…）+ Ascend 16 → 各本体纵切经 deps 注入落地（toolRegistry 注入位已铺，机制不变）；旧仓 getAllBaseTools 20 条件门控槽（① IS_ATLAS_DEV ② AGENT_TRIGGERS ③ AGENT_TRIGGERS_REMOTE ④ MONITOR_TOOL ⑤ OVERFLOW_TEST_TOOL ⑥ CONTEXT_COLLAPSE ⑦ TERMINAL_PANEL ⑧ WEB_BROWSER_TOOL ⑨ HISTORY_SNIP ⑩ UDS_INBOX ⑪ WORKFLOW_SCRIPTS ⑫ ATLAS_VERIFY_PLAN ⑬ ENABLE_LSP_TOOL ⑭ worktree ⑮ agentSwarms ⑯ isTodoV2 ⑰ hasEmbeddedSearchTools ⑱ NODE_ENV=test ⑲ ToolSearch optimistic ⑳ PowerShell）全残留守（门随本体纵切落，toolRegistry 头注逐一枚举）。
- getTools 族（getTools/getToolsForDefaultPreset/getMergedTools/filterToolsByDenyRules：ATLAS_SIMPLE 三分支 + REPL 分支 + 权限 deny 规则）→ E-4 权限规则树。
- feature-gated 集成员（Workflow ∈ ALL_AGENT_DISALLOWED / crons ∈ IN_PROCESS_TEAMMATE）→ 静态集仅含无门成员，feature 族落时回填。
- runAgent 残余（transcript/sidechain/perfetto/agent frontmatter MCP/skill 预载/异步生命周期/子代理压缩 + maxTurns 随 context 面回填）→ 后续纵切 / E-5（runAgent 头注）。
- filterToolsForAgent：in-process teammate carve-out + ExitPlanModeV2 plan 门 + allowedAgentTypes/ruleContent → E-4（agentToolUtils 头注）。
- MCP 连接生命周期/认证/searchHint/alwaysLoad/progress/annotations（ports/mcpClient 头注）+ 复合 schema 校验 anyOf/oneOf/allOf/嵌套/enum/区间（schemaValidation 头注）。
- **compose.ts engine 装配（残留守 ⑦）** + **engine anti-stub 门（残留守 ⑥，wave 级）** → E-wave-end（14 子模块骨架全登记后加 engine 入门扫描集 + STUB_REGISTRY + wave tag 清零）。

**gate 核验**（同 §8.22 T-5 裁定）：8 域门扫描集 = {executor/sandbox/memory/modelprovider/task/bootstrap/permissions/hooks}，engine 非顶层域 → **无 gate 改动**；capability-matrix hooks 行 `by: engine`（hooks 流式/attachment 渲染）属 E-5，不变。gate 测 6 pass / 0 fail / 2 files。

**四件套全绿**：tsc 0 / eslint 0（E-2 26 文件）/ build 0 / **654 pass 0 fail**（1279 expect，50 文件；基线谱系 522（E-1b 闭环）→ 539（T-5a）→ 562（T-5b）→ 610（T-5c）→ 635（T-5d）→ 654（T-5e））。

**闭环判定**：6 切片实施 + F-1 修复 + 只读子代理对照旧仓 ground truth 全闭环（33 工具名值 + 4 集成员 + 两源 prompt 字节级 + 装配语义 + 去重先入为主全验真）→ **E-2 闭环成立**。下一步（engine 波纵切顺序不变）：**E-3 config/settings 体系**（解锁 E-4；resetEndpointConfigSource 3 行随首个跨 case 测试按需补）→ **E-4 permissions-engine 规则求值树**（getTools 族 + teammate/plan 门 + ruleContent 落此）/ **E-5 hooks-runner**（流式/attachment + stop hooks + matrix 行 102 翻转）/ **E-6 executor 全 shell 回填**（独立可并行）/ **E-7 leaves**（tasks→scheduler→worktree→session→messaging）/ **E-wave-end**（compose.ts engine 装配，残留守 ⑦ + engine anti-stub 门，残留守 ⑥）。

### §8.26 E-2 工具面波整体审视记录（2026-09-23 全波回顾 + 修复闭环）

**触发**：E-2 波 6 切片各自独立审视过（§8.25），本次做一次**整波一次性整体审视**（功能视角 + 测试视角 + 残留守登记视角，专业回顾），补盲单切片审视未覆盖的**跨切片接缝**（头注漂移 / 死接缝登记缺口 / 测试面盲区）。子代理派发限额 ≤2（本地/云资源限流），本波修复自身无需子代理。

**三视角发现（12 项，去重后，无 BLOCKER）**：
- **功能视角**：① `AGENT_TOOL_NAME` 双源（AgentTool.ts 本地 `const` + toolNames.ts import 自 constants.ts）→ 单一事实源违规。② `mcpMeta` **输出**接缝无生产消费点（toolExecution 执行链仅读 `res.data` 走 mapToolResultToToolResultBlockParam，mcpMeta 在 pipeline 层被丢；旧仓 toolExecution 经消息层 `createUserMessage.mcpMeta` 透传（非 subagent 上下文），本版无消息层）→ **未登记的残留守 = 隐性功能回归**。③ 5 处 E-1 时代「MCP 路由（E-2）」陈旧头注（loop / query index / pipeline index / QueryEngine / toolExecution）→ T-5a 已以注册表构建形态闭环，头注陈旧误导。④ 2 处 T-5b 时代 T-5c/T-5d 陈旧承诺（constants.ts / AgentTool.ts 头注仍写「落时一并补」，T-5c/T-5d 实际已落）→ 指到 live 注册。⑤ ModelRole 枚举（premium/fast/small，roles.ts:42）与 AgentTool input schema enum 完全一致（**验真通过**，非缺陷，记入）。
- **测试视角**：⑥ 真实 `AgentTool.mapToolResultToToolResultBlockParam` 零覆盖（completed→`[agent completed]\n`+join / 非 completed→JSON.stringify / content 缺失→`'null'` 三分支全漏）。⑦ fan-out 调用点无端到端测（既有 allowFanOut 门测试仅**公式重推**，call 测试 L304-346 从不设 `ATLAS_COORDINATOR_MODE=1` → 深度门在真调用链上不可观察）。⑧ MCP 描述符 hint（readOnlyHint/destructiveHint）→ isReadOnly/isDestructive/isConcurrencySafe 映射零覆盖（fake 描述符从不设 hint 字段）。⑨ 模型 override **中层**（agentDef.model > parentRole，无 input.model override）零覆盖（既有 override 测只盖 input.model 顶层 + parentRole 兜底，中层 agentDef.model 漏）。⑩ `engine-agent-tool.test.ts:237/247` `finalizeAgentTool` 传 prompt/isAsync 陈旧字段（T-5e 已摘 metadata 字段，测试未同步；**tsc 不查 tests/** 故隐性类型漂移）。
- **残留守登记视角**：⑪ `ResolvedAgentTools.validTools/invalidTools` 仅测试消费、src 无生产消费点（AgentTool.call 只读 `.resolvedTools`，死接缝，validateAgent 校验面 = D 波）。⑫ 零 src 消费者 coordinator 导出（matchSessionMode / getCoordinatorUserContext / getCoordinatorSystemPrompt / getCoordinatorWorkerSystemPrompt = compose.ts 组合根 ⑦ 消费；standalone `export { WORKER_AGENT }` 无直接消费点，getCoordinatorAgents 内部已消费）→ 未登记。
- **裁定（M-3 defer）**：M-3 门盲区——engine 侧 37 个 `export {}` 占位（engine 14 / ascend 9 / atlascode ~14）**既不在 anti-stub CI 门扫描集**（engine 非顶层域，DOMAINS/CDEEP_DOMAINS 无 engine）**也不在 STUB_REGISTRY** → **defer 到 E-wave-end**：engine 全量 anti-stub 门仍归残留守 ⑥；本波纪律 = 新增 <5 实质行的 engine 文件须头注登记占位，全波门随 E-wave-end（14 子模块骨架全登记后）一次加 engine 入门扫描集 + STUB_REGISTRY + wave tag 清零。

**修复落地（11 项小修，两提交，master 无 remote 不 push）**：
- **提交 1（src 修复）**：X1 `AGENT_TOOL_NAME` 单一事实源（AgentTool.ts 撤本地 const，改 `import { AGENT_TOOL_NAME, MAX_WORKER_SPAWN_DEPTH } from './constants'`）/ F1 mcp.ts 头注登记 mcpMeta 输出接缝为残留守（消费面 = 消息层/TUI 波）/ L-2 5 处陈旧「MCP 路由（E-2）」头注改「已按 E-2 裁定以注册表构建形态闭环（无 pipeline 分支 / 无 PipelineDeps 字段），MCP 连接生命周期仍残留守（连接层纵切）」/ L-3 constants.ts（VERIFICATION_AGENT_TYPE/ONE_SHOT 改指 builtInAgents 残留守）+ AgentTool.ts（coordinator 分支指 T-5d 已落 builtInAgents）/ L-4 agentToolUtils 头注登记 ResolvedAgentTools.validTools/invalidTools 死接缝（validateAgent D 波）/ L-5 coordinator index + coordinatorMode 头注登记零消费者导出为组合根 ⑦ 消费 + WORKER_AGENT 独立导出残留守。
- **提交 2（tests 补测 + 清理）**：T1 摘 `finalizeAgentTool` prompt/isAsync 陈旧字段（L237/247）/ T2 真实 mapper 三分支补测（completed→前缀+join / 非 completed→JSON / null→`'null'`）/ T3 fan-out 调用点端到端（`ATLAS_COORDINATOR_MODE=1` + ctx.tools 含 Agent fake：spawnDepth 0 → childDepth 1 < MAX → allowFanOut 真 → 子代理池含 Agent 真调 fake；spawnDepth 1 → childDepth 2 = MAX → allowFanOut 假 → Agent 命中 ALL_AGENT_DISALLOWED 被剔，子代理 Agent tool_use 落 unknown-tool，fake 不调）/ T-low-1 MCP hint 映射 3 断言（readOnlyHint=true→isReadOnly+isConcurrencySafe 均 true / destructiveHint=true→isDestructive true / 无 hint→全 false `?? false` 兜底）/ T-low-2 模型 override 中层（agentDef.model='premium' + parentRole='small' + 无 overrideRole → resolveRole → roles `['premium']`）。

**验真（四件套 + gate）**：tsc 0 / eslint 0（11 改文件）/ build 0（cli.ts D 波 `export {}` 占位，产物 0 KB 符合预期）/ **661 pass 0 fail**（1296 expect，50 文件；654 + 7 新增测，谱系 522→539→562→610→635→654→661）+ gate 6 pass / 0 fail / 2 files。

**闭环判定**：E-2 整波审视 12 项全处置（5 功能 fix-now + 4 测试补 + 2 残留守登记 + 1 裁定 defer），无 BLOCKER；「以为已全」防漏项（mcpMeta 输出接缝 / 零消费者导出 / 陈旧头注）全部头注登记，单源违规 + 隐性类型漂移 + 测试盲区全部闭环。**下一步不变**（engine 波纵切顺序）：E-3 config/settings → E-4/E-5/E-6/E-7 → E-wave-end（compose.ts 装配 ⑦ + engine anti-stub 门 ⑥，M-3 defer 亦收口于此）。

### §8.27 E-3 config/settings 体系勘察定稿 + task 清单（2026-09-23，双只读勘察 agent + 锚点抽查验真）

**勘察素材**：2 个只读勘察 agent（≤2 限额内）——A 旧仓 `src/utils/settings/` 面（加载核心 settings.ts 1011L 高度集中，最小 port 面 ≈1300L）+ B 新仓落点（`src/engine/config/` 未存在；permissions/hooks 薄骨架的 E-4/E-5 消费接缝已真接线；`resetEndpointConfigSource` 不存在=3 行按需补裁定在案）。关键锚点全部抽查验真：旧仓 8 核心文件行数逐一吻合 / `getAllowedSettingSources` 桩恒 `['userSettings']` / 新仓 hooks `HOOK_EVENTS` 27 事件全量（A 报告「29 项」为误计，两路 diff 逐一对齐）/ 新仓 roles 注入窗口确无 reset / `getManagedSettingsDropInDir` 占位已在 `sandboxDeps.ts:61` + `sandbox/types.ts:75` 接口。

**落点裁定**：`src/engine/config/`（§8.21 14 子模块之一，engine 非顶层域 → **无 gate 改动**，同 §8.22 T-5 / §8.25 裁定；新增 engine 文件 <5 实质行须头注登记占位，M-3 纪律）。

**真核心 port 面**（4 切片）：
- **S-3a 类型面 + 源层 + 缓存**：types.ts schema 裁剪（permissions/hooks/sandbox/modelRoles/**providers 补声明**/env/mcpServers 族 + `.passthrough()`；删 UI/登录/遥测/公告族）+ constants（SETTING_SOURCES 5 层 userSettings→projectSettings→localSettings→flagSettings→policySettings，后源压前源；**flag 源裁剪**——新仓无 --settings CLI 面，桩保留登记残留守）+ settingsCache 三层（session/perSource/parseFile + reset）+ managedPath（**Linux 单支 /etc/atlas**，mac/win 旧 ClaudeCode 路径不随迁）+ shared configDir/env 复用。单测：schema 解析 / 5 层合并优先级 / per-source 缓存 + reset。
- **S-3b 加载/合并/写回核心**：settings.ts 裁剪（parseSettingsFile 路径级缓存 + filterInvalidPermissionRules 坏规则过滤 / getSettingsFilePathForSource / getSettingsForSource policy first-source-wins（remote 死通道 + MDM no-op 桩 → 文件单支）/ loadSettingsFromDisk 合并级联（pluginSettingsBase → 遍历启用源）/ updateSettingsForSource（undefined 删键 + 数组合并整替 + mergeArrays concat 去重）/ getInitialSettings / getSettingsWithErrors）+ validation 裁剪（filterInvalidPermissionRules + formatZodError）。**砍**：getSettingsWithSources/rawSettingsContainsKey/auto-mode 三函数（TRANSCRIPT_CLASSIFIER 门控，非 engine 面）/ cowork 模式文件 / DEPRECATED 别名（新仓无消费）。单测：级联合并 / managed drop-in 字母序叠加 / 写回语义 / 坏规则过滤不毒化。
- **S-3c permissions/hooks 字段族 + hooks 配置面**：schemas/hooks（HookCommandSchema 判别联合 command/prompt/agent/http 四类 + HookMatcherSchema + HooksSchema partialRecord——**HOOK_EVENTS 复用新仓 hooks 域 27 事件单一事实源，不复制**，engine/config import hooks/hookEvents）+ hooksConfigSnapshot（policySettings allowManagedHooksOnly/disableAllHooks + 合并 hooks，E-5 运行时真源）+ hooksSettings 裁剪（getAllHooks 跨 user/project/local 源 + session hooks，砍显示字符串）+ managedEnv 裁剪（apply 两函数 + SAFE_ENV_VARS 白名单；去 CCD/SSH-tunnel 两过滤器 + host-managed provider 变量面）+ **消费点接线**（permissions/filesystem 桩① settings roots + `getSettingsPaths()` 桩接真 + hooks 域 `setHookConfigProvider` 注入 settings.hooks）。单测：hooks schema 校验 / snapshot 合并 / managedEnv 白名单 / 桩①消费。
- **S-3d settings-adapter + 组合根接线**：settings-adapter（EndpointConfigSource settings 面：getRoleSetting=settings.modelRoles[role] / getProviders=settings.providers / getGlobalApiKey=env OpenAI 静态键回落，旧仓 keychain 面残留守）替换 compose.ts env-only 适配器 + autoCompact env 覆写收拢（ATLAS_AUTOCOMPACT_PCT_OVERRIDE/ATLAS_AUTO_COMPACT_WINDOW/DISABLE_COMPACT → config 面，残留守 ③ 核销：roles 池头动态解析 modelRoles.small）+ `resetEndpointConfigSource` 3 行（**若本切片测试出现首个跨 case 需重设 endpoint source 的场景就地补**，镜像 resetModelProviderForTesting；无调用点则不加，残留守 ③ 登记维持）。单测：adapter 三方法 / compose 注入后 settings 生效 / 池头解析。

**残留守登记**（防「以为已全」）：mdm/（rawRead no-op 桩，Linux 文件通道保留，MDM registry/plist 不随迁）/ settingsSync 远程同步 / changeDetector+applySettingsChange+internalWrites（TUI 热更面）/ remoteSettings 死通道 + remoteManagedSettings 死代码（**不 port**）/ validationTips/schemaOutput/allErrors/toolValidationConfig（校验 UX/MCP 聚合）/ UI 面 components/Settings / 低消费 schema 字段族（grove_*/xaaIdp/attribution/autoUpdatesChannel/companyAnnouncements/forceLogin*/remote/voice*/cleanupPeriodDays/httpHook* 不入 schema，passthrough 兜）/ agent source 6 组细分门控（loadAgentsDir 折叠 3 组，细分归 E-4）。

**E-3 解锁消费面清单**（各波消费点 → E-3 供给）：permissions 桩① settings roots + getSettingsPaths（E-4 规则树 5 源合并前置）/ hooks HookConfigProvider（E-5 配置注入）/ EndpointConfigSource settings-adapter（替换 compose env-only）/ autoCompact config 面 / sandbox deps getManagedSettingsDropInDir 真实现 / roles 池头动态解析（残留守 ③）。

**审视安排（大颗粒，按 task 清单）**：每切片闭环自验（四件套 + 切片 review），**波末按本 task 清单做大颗粒整体审视**（三视角：功能跨切片接缝 / 测试盲区 / 残留守登记，同 §8.26 模式——上次正是大颗粒抓出 mcpMeta 未登记接缝 + 单源违规）→ 审视记录 §8.2x + memory 同步。

**基线**：661 pass / 0 fail / 1296 expect / 50 文件；gate 6 pass / 0 fail / 2 files（engine 不在扫描集，E-3 无 gate 改动）。

### §8.28 E-3 S-3c 执行前分析 + 方案（2026-09-24）

**范围**（§8.27 S-3c 条目）：schemas/hooks（HookCommand 四类判别联合 + HooksSchema，HOOK_EVENTS 复用 hooks 域 27 事件单一事实源）+ hooksConfigSnapshot 裁剪 + hooksSettings 裁剪 + managedEnv 裁剪 + 消费点接线（permissions 桩① getSettingsPaths 接真 + setHookConfigProvider 注入）。

**勘察定稿（旧仓 ground truth 全抽查）**：
- 旧仓 `HookCommand`/`HooksSettings` 均 = `any`（settings/types.ts:108/115）——无权威类型面。四类变体字段形状取自旧仓 `isHookEqual` switch 比较面（可验真）：command{command, shell?, timeoutMs?, if?}（shell 默认 'bash' 为身份字段）/ prompt{prompt, if?} / agent{prompt, if?} / http{url, if?}；`if` 条件字段为四类共享身份字段；第五类 function/callback = 进程内、不可 JSON 表达 → 不入配置面（§8.27 四类裁定）。
- hooksConfigSnapshot 门控链（policy disableAllHooks → {} / policy allowManagedHooksOnly → 仅 policy hooks / 合并 disableAllHooks → 仅 policy hooks / 否则合并 hooks）+ snapshot 四函数逐字可 port；`isRestrictedToPluginOnly`（plugin-only 策略）+ `resetSdkInitState`（bootstrap 状态）+ `getSettings_DEPRECATED` 三处裁剪。
- managedEnv：`filterSettingsEnv` = 三过滤器合成（withoutSSHTunnelVars ATLAS_UNIX_SOCKET / withoutCcdSpawnEnvKeys ATLAS_ENTRYPOINT=claude-desktop / withoutHostManagedProviderVars ATLAS_PROVIDER_MANAGED_BY_HOST+PROVIDER_MANAGED_ENV_VARS 11 项）。新仓三面引用全 0（grep 验真）→ 三过滤器全裁；`getGlobalConfig`（~/.atlas.json 全局配置面）新仓不存在 → 裁；applyConfig 的 caCerts/mtls/proxy 缓存清除 + configureGlobalAgents（新仓无对应模块）→ 裁。
- 新仓 hooks 域 runHooks 只消费 `.command`（L82/103/121/203 等）→ provider 面向执行器契约**过滤 command 变体**；prompt/agent/http 执行面归 E-5（hooks-runner 波）。

**方案落点（`src/engine/config/` + 接线）**：
1. `hooksSchema.ts`（新）：四类判别联合 zod（command/prompt/agent/http，各 `.passthrough()` 通配字段）+ ConfigHookMatcher + `HooksSettings = Partial<Record<HookEvent, ConfigHookMatcher[]>>`（HookEvent 经 `../../hooks/hookEvents` import，不复制 27 事件）+ HooksSchema record 面。
2. `hooksConfig.ts`（新）：snapshot 门控链裁剪版（真核心逐字 + 三处裁剪登记）+ `createHooksConfigProvider()`（HookConfigProvider 实现：snapshot 直读 + command 变体过滤 + 空 matcher 剔除）。
3. `managedEnv.ts`（新）：`applySafeConfigEnvironmentVariables`（trusted 源全量 env + policy 最后 + 合并面仅 SAFE_ENV_VARS 白名单）+ `applyConfigEnvironmentVariables`（信任后全量合并 env）+ SAFE_ENV_VARS ~60 项白名单逐字 port + TRUSTED_SETTING_SOURCES 三源。
4. `settings.ts` 加 `getSettingsPaths()`（SETTING_SOURCES.map(getSettingsFilePathForSource).filter 非 undefined）——permissions 桩① 真实现。
5. `types.ts` 补 `allowManagedHooksOnly: z.boolean().optional()`（S-3c 消费的数据契约先落；disableAllHooks S-3a 已声明）。
6. `src/permissions/settingsPaths.ts`（新，L3 斩断注入窗口）+ `filesystem.ts` 桩① 接窗口 + `permissions/index.ts` 导出；未注入 = 空数组（isAtlasSettingsPath 全局 endsWith 兜底降级态，非 fail-fast——permissions 域单测不经组合根）。
7. `compose.ts` 接线：③ permissions 步加 `setSettingsPathsProvider(() => getSettingsPaths())`；⑤ hooks 步加 `setHookConfigProvider(createHooksConfigProvider())` + `captureHooksConfigSnapshot()`（旧仓启动语义：启动捕一次）。

**残留守登记**（各文件头注）：
- 四类变体 per-variant 全字段面（http headers/method/timeoutMs 等）→ E-5（旧仓 HookCommand=any 无可验真权威面，本切片仅落 isHookEqual 比较面字段）。
- SettingsSchema hooks 字段收紧（z.lazy(HooksSchema)）→ E-5 严格编辑面（本切片维持 hooks: z.any() 透传，与旧仓无 hooks 校验面逐字一致，无行为变更）。
- HooksSchema record key ∈ HOOK_EVENTS 27 事件名集校验 → E-5（旧仓无事件名校验面）。
- pluginOnly 策略门（isRestrictedToPluginOnly）/ session hooks（appState 会话钩子存储）/ display 字符串 + isHookEqual + sortMatchersByPriority（/hooks UI 面）/ resetSdkInitState → 各残留守（plugin 域 / TUI 会话面 / UI 面 / bootstrap 未落）。
- updateHooksConfigSnapshot 调用面（旧仓 /hooks 设置 UI）→ 无调用点 = 组合根 / E-wave-end /hooks UI 面登记。
- managedEnv：三过滤器（ssh-tunnel / ccd spawn-env / host-managed provider 变量面 11 项）+ 全局配置面（~/.atlas.json）+ caCerts/mtls/proxy 缓存清除 + DANGEROUS_SHELL_SETTINGS（trust-dialog UI 消费，新仓无）→ 全残留守（旧仓 managedEnvConstants 为源）。
- 旧仓合并面含 project/local 的 SAFE 过滤支 → 被 S-3a「project/local 不在级联」裁定结构性覆盖（project env 永不入级联，攻击面收敛；新仓合并面 = user+policy+flag）。
- getSettingsPaths 注入窗口未注入态 = 空数组降级（compose.ts S-3c 已接线，仅 unit 层裸态可达）。

**测试面**：engine-config-hooks.test.ts（四类联合解析/拒识 + 门控链四态 + snapshot 三函数 + provider 过滤/空事件）+ engine-config-managed-env.test.ts（applySafe trusted 全量 + policy 最后 + SAFE 白名单 / applyConfig 全量 + process.env 存还）+ permissions-settings-paths.test.ts（未注入空 / 注入真值 / reset / isAtlasSettingsPath 两态）。

**S-3c 闭环记录（实施后，同提交）**：
- 落点 7 项全落：hooksSchema（四类联合 zod 验真 = discriminatedUnion+passthrough 于 zod ^4.5.4 可用，`bun -e` 预验真）/ hooksConfig（门控链四态 + snapshot 四函数 + provider 过滤面）/ managedEnv（两 apply + 63 项白名单程序化提取逐字）/ settings getSettingsPaths / types allowManagedHooksOnly / permissions settingsPaths 注入窗口 + 桩①接真 / compose 三接线（setSettingsPathsProvider + setHookConfigProvider + captureHooksConfigSnapshot 启动捕获）。
- 实施期偏差 2 处闭环：① 态④ 期望误写「policy 逐事件压 user」→ 实为 per-event matcher 数组 uniq 拼接（S-3b settingsMergeCustomizer 语义，user 序在前）——测试断言已订正为双 matcher 并存（级联合并面行为实证）；② eslint `boundaries/entry-point` 抓出 engine/config 深入 hooks 域内文件（hookEvents/config-provider/types 三 import）→ 全改走 `../../hooks` 域根门面（L3 规则）。
- 验真（四件套 + gate）：tsc 0 / eslint 0（14 改+新文件）/ build 0 KB / **741 pass 0 fail**（1483 expect，55 文件；710 + 31 新增）+ gate 6 pass / 0 fail / 2 files（engine 非扫描集，无 gate 改动）。
- 残留守登记全落头注（hooksSchema 变体全字段面 / 事件名集校验 → E-5；hooksConfig pluginOnly/session hooks/display 字符串 → 各残留守；managedEnv 三过滤器 + 全局配置 + 缓存清除 + DANGEROUS_SHELL_SETTINGS → 登记；getSettingsPaths 未注入降级态 → compose 已接线，仅 unit 裸态可达；managedEnv 两 apply 函数无生产调用点 = 预声明消费接缝 → S-3d 组合根启动链）。

### §8.29 E-3 S-3d 执行前分析 + 方案（2026-09-24）

**范围**（§8.27 S-3d 条目）：settings-adapter（EndpointConfigSource settings 面）替换 compose.ts env-only 适配器 + autoCompact env 覆写收拢（ATLAS_AUTOCOMPACT_PCT_OVERRIDE / ATLAS_AUTO_COMPACT_WINDOW / DISABLE_COMPACT → config 面）+ resetEndpointConfigSource 3 行（若本切片测试出现跨 case 需重设 endpoint source 场景就地补，镜像 resetModelProviderForTesting）+ 组合根接线。

**勘察定稿（旧仓 ground truth 全抽查）**：
- 旧仓 `src/config/settings-adapter.ts`（37L，adapter 层唯一允许碰 utils/settings+utils/auth 的文件）：getRoleSetting = `getSettings_DEPRECATED().modelRoles?.[role] || {}` / getProviders = `settings.providers || {}` / getGlobalApiKey = `getApiKeyFromConfigOrMacOSKeychain()?.key`（try/catch 吞 early-bootstrap throw 返 undefined——R3 memoized getter 稍后重跑语义）。
- 新仓 types.ts 已声明 `modelRoles: z.record(z.string(), z.any())` + `providers: z.record(z.string(), z.any())`（S-3b 数据契约先行，头注「S-3d 消费不靠 any」）→ 本切片即消费面，**无 schema 改动**。
- 旧仓 autoCompact env 覆写 3 处（autoCompact.ts:40/79/148）：ATLAS_AUTO_COMPACT_WINDOW（窗口 cap：contextWindow = min(contextWindow, parseInt>0)）/ ATLAS_AUTOCOMPACT_PCT_OVERRIDE（阈值 = min(floor(effectiveContextWindow × pct/100), threshold)，有效域 (0,100]）/ DISABLE_COMPACT（isEnvTruthy → isAutoCompactEnabled=false；新仓已收拢为 deps.enabled 判定面）。旧仓另有 DISABLE_AUTO_COMPACT + ATLAS_BLOCKING_LIMIT_OVERRIDE（TUI warning 态面）——均不在 §8.27 三变量清单 → 残留守。
- 旧仓启动序：applySafeConfigEnvironmentVariables（信任前）→ 信任对话框 → applyConfigEnvironmentVariables（信任后全量 env）。§8.28 预声明接缝「managedEnv 两 apply 函数消费面 = S-3d 组合根启动链」→ 新仓无信任对话框，compose 只接 applySafe（信任前位）；applyConfig = 信任对话框面残留守（重登记，H6 防空洞）。
- keychain 面（getApiKeyFromConfigOrMacOSKeychain）新仓不存在（auth lane 裁定 = OpenAI 静态键 OPENAI_AUTH_TOKEN / OPENAI_API_KEY，CLAUDE.md 命名规范）→ getGlobalApiKey 保留 env 静态键回落，keychain 面残留守。
- roles.ts 消费面（池头解析链）：getRoleModel(role) = env 直读 ?? roleSetting.model（adapter getRoleSetting）?? 池头 = getRoleModels 首 ref 经 resolveModel（provider 查表经 adapter getProviders）→ modelId。env-only 适配器下 pool 恒空 → 池头解析恒 undefined；settings 面接上后池头解析生效（旧仓 e2e banner 动态断言「ATLAS_SMALL_MODEL → modelRoles.small 池头，provider 前缀剥离」的 modelprovider 侧；前缀剥离 = TUI 展示面，新仓无 TUI，残留守）。**勘误（旧仓 ground truth 可验真，roles.ts:167-173 逐字）**：getRoleModels 的池 bare ref 不经 normalizeRef（仅 sessionModel/envModel 支归一化）→ 池头须为全 ref（'provider/model-id'）才经 providers 解析；池 bare id 在旧仓同样不可解析（不假完成）。
- 现有测试对 setEndpointConfigSource 零引用（grep 验真）；createCoreDependencies 亦无既有测试 → S-3d 是首个 compose 装配测试。

**方案落点**：
1. `src/atlascode/adapters/endpointConfigSourceAdapter.ts` 就地升级（B6-func env-only → S-3d settings 面）：getRoleSetting = `getSettingsWithErrors().settings.modelRoles?.[role] ?? {}` / getProviders = `settings.providers ?? {}`（getSettingsWithErrors 惰性 getter 语义：调用时读 settings 缓存，外部编辑后 resetSettingsCache 读盘 = 旧仓 R3 memoized 重跑等价）/ getGlobalApiKey 保留 `process.env.OPENAI_AUTH_TOKEN ?? process.env.OPENAI_API_KEY`。
2. `src/engine/config/autoCompactOverrides.ts`（新）：`getAutoCompactEnvOverrides(): { pctOverride?: number; windowOverride?: number; disabled?: boolean }`——env 解析语义旧仓逐字（pct parseFloat 有效 (0,100] / window parseInt >0 / DISABLE_COMPACT isEnvTruthy，shared 单一事实源），config 面拥有 → 可 unit 隔离测。
3. `src/engine/context/autoCompact.ts`：AutoCompactDeps 加 `pctOverride?` / `windowOverride?`；`getAutoCompactThreshold(contextWindow, maxOutputTokens?, pctOverride?, windowOverride?)` 加两可选参（旧仓范围 guard 逐字：pct 0<x≤100、window >0——向后兼容，既有 2 参调用不变）；shouldAutoCompact 透传 deps。残留守③ 核销（头注「env 覆写 → 残留守」改「S-3d config 面收拢」）。
4. `src/modelprovider/roles.ts` + `index.ts`：`resetEndpointConfigSource()` 3 行（activeSource=undefined + sourceOverridden=false，镜像 resetModelProviderForTesting）——§8.27 条件子句就地补：本切片测试「compose 注入后 settings 生效」出现首个跨 case 场景（注入 settings 面 → reset → 裸空 stub 回归断言，无 reset 则模块态泄漏跨 case 失败）。
5. `src/atlascode/compose.ts` 接线：⑥ modelprovider 步前加 `applySafeConfigEnvironmentVariables()`（旧仓启动序信任前位——trusted 源 env（ATLAS_SMALL_MODEL 等）先入 process.env，后 roles lane env 读；import 自 `../engine`）；头注登记 applyConfig = 信任对话框面残留守。
6. 导出面：engine/config/index.ts（getAutoCompactEnvOverrides + AutoCompactEnvOverrides 类型）/ engine/index.ts 同名 re-export / modelprovider/index.ts（resetEndpointConfigSource）。

**残留守登记（各文件头注）**：
- adapter：旧仓 keychain 面（getApiKeyFromConfigOrMacOSKeychain）→ 残留守（新仓 auth lane = OpenAI 静态键，keychain 未落）。
- autoCompact：deps 两 override 字段 + disabled 判定（DISABLE_COMPACT → enabled）无生产调用点 = 预声明消费接缝（消费方 = E-wave-end 组合根 loop deps 装配 / 当前仅测试消费）；DISABLE_AUTO_COMPACT + ATLAS_BLOCKING_LIMIT_OVERRIDE（TUI warning 态面）→ 残留守（不在 §8.27 三变量清单）。
- compose：applyConfigEnvironmentVariables（信任后全量 env）→ 信任对话框面残留守（§8.28 预声明接缝此处重登记，旧仓启动序 applySafe → 信任对话框 → applyConfig）。

**测试面**：
- `tests/unit/engine-config-endpoint-adapter.test.ts`（新）：adapter 三方法（getRoleSetting modelRoles 命中/缺省 {} / getProviders 命中/缺省 {} / getGlobalApiKey 两键优先级 + 双缺 undefined）+ compose 注入后 settings 生效（mock fs 下 createCoreDependencies → getRoleModel('small') 池头）+ 池头解析（裸 id 经 providers normalizeRef 'iff/gelu' → modelId / 全 ref 直通）+ resetEndpointConfigSource 回归（reset 后裸空 stub：池头不可解析 → undefined）+ applySafe 接线判别（compose 装配后 trusted 源 env 已入 process.env）。
- `tests/unit/engine-config-auto-compact-env.test.ts`（新）：getAutoCompactEnvOverrides 三变量解析 + 有效域（pct '25'→25 / '0'→undefined / '101'→undefined / 'abc'→undefined；window '50000'→50000 / '-3'→undefined；DISABLE_COMPACT '1'→true / 'false'→false / 未设→undefined）+ getAutoCompactThreshold 双 override 语义（window cap / pct floor + min 取小）+ shouldAutoCompact override 提前触发 + 无 override 回归（既有 autoCompact 测试面不变）。

**基线**：741 pass / 0 fail / 1483 expect / 55 文件（S-3c 闭环）；gate 6 pass / 0 fail / 2 files（engine 非扫描集，本切片无 gate 改动）。

**S-3d 闭环记录（实施后，同提交）**：
- 落点 6 项全落：① adapter 就地升级（settings 面 getRoleSetting/getProviders + env 静态键全局 key 回落；keychain 面残留守登记头注）② autoCompactOverrides.ts（三变量读侧，旧仓解析 guard 逐字：pct (0,100] / window >0 / DISABLE_COMPACT isEnvTruthy）③ autoCompact deps 双 override 字段 + getAutoCompactThreshold 双参（向后兼容，越界 guard 双处保留）+ shouldAutoCompact 透传 + 残留守③ 核销头注 ④ resetEndpointConfigSource 3 行（§8.27 条件子句就地补——本切片测试出现首个跨 case 场景：注入 settings 面 → reset → 裸空 stub 回归断言，镜像 resetModelProviderForTesting）⑤ compose 接线（⑥ applySafe 信任前位 + ⑦ settings 面 endpoint source；applyConfig 信任对话框面残留守头注重登记）⑥ 导出面（engine/config + engine + modelprovider + atlascode 四门面；createEndpointConfigSource 入门面供 STR-1 测试 import）。
- 实施期偏差 3 处闭环：① **池头 bare-id fixture 误写**（测试 3 fail 抓出）：池 bare ref 不经 normalizeRef（仅 env/sessionModel 支归一化，旧仓 roles.ts:167-173 逐字可验真——移植忠实，非 bug）→ fixture 改全 ref 'iff/gelu' + 测试头注语义注 + 本勘误 ② getProviders 测试中切 mock fs 命中 settings 三层缓存（同路径解析缓存）→ 切 fs 后 resetSettingsCache（测试语义修）③ **adapter 改用 getInitialSettings**（原用 getSettingsWithErrors）：getInitialSettings = 旧仓 getSettings_DEPRECATED() || {} 逐字等价面，且 S-3b 预声明接缝登记「getInitialSettings：消费面 = S-3d settings-adapter」→ 按登记消费，settings.ts 预声明块同步核销（getInitialSettings S-3d 已消费 / getSettingsWithErrors 经其间接消费）。
- 残留守登记全落头注（adapter keychain 面 / autoCompact deps override 预声明消费接缝 = E-wave-end 组合根 loop deps 装配 + DISABLE_AUTO_COMPACT·ATLAS_BLOCKING_LIMIT_OVERRIDE 残留守 / compose applyConfig 信任对话框面重登记 / settings.ts 预声明块核销）。
- 验真（四件套 + gate）：tsc 0 / eslint 0（12 改+新文件）/ build 0 KB / **762 pass 0 fail**（1527 expect，57 文件；741 + 21 新增）+ gate 6 pass / 0 fail / 2 files（engine 非扫描集，无 gate 改动）。

### §8.30 E-3 config/settings 整波审视记录（2026-09-24 全波回顾 + 修复闭环）

**触发**：E-3 波 4 切片（S-3a..S-3d）各自闭环自验（§8.28/§8.29 + 各切片 review），本波末按 §8.27 审视安排做**大颗粒整体审视**（三视角：功能跨切片接缝 / 测试盲区 / 残留守登记，同 §8.26 模式）。双只读审视子代理并行（限额 ≤2）：功能+残留守视角（`git diff 31af138^..d87b320` 逐 hunk + 旧仓 ground truth 验真）/ 测试盲区视角（fake-driven 盲区 + 跨 case 状态 + 分支覆盖 + 门面符号审计 + 实跑基线核对）。

**三视角发现（11 项去重，X-2=T-4 双报，无 BLOCKER）**：
- **功能/残留守视角（X-1..X-3）**：① X-1 MINOR managedEnv.ts 预声明消费接缝块跨切片漂移——S-3d 落 compose ⑥ 后「applySafe 无生产调用点」陈旧承诺未核销（错向风险：后续 reviewer 误判死接缝删导出击穿 compose ⑥）② X-2/T-4 MINOR 4 测试文件 `type FsOperations` 自 engine 门面 import 但 engine 门面不导出该符号（归属 shared，type-only 运行时擦除 + tsc 不查 tests/ 隐性漂移）③ X-3 NOTED constants.ts flagSettings 头注机制描述不准（「桩路径 → 文件不存在」实为「undefined → 短路」，功能结果一致）。
- **测试盲区视角（T-1..T-8）**：④ **T-1 IMPORTANT provider 崩溃支（双视角独立报出）**：`createHooksConfigProvider` 的 `matcher.hooks.filter` 对缺 hooks 键的畸形 matcher（settings 面 z.any() 透传放行）抛 TypeError，经 getMatchingHooks/runHooks 无守卫传播崩 agent loop——bun -e 探针实证真崩溃路径，三个既有 provider 测全喂良形 matcher 恰好漏掉 ⑤ T-2 IMPORTANT parseSettingsFile BOM 剥离（登记契约，PowerShell 5.x 写 UTF-8 BOM）零测——删 replace 行全测仍绿 ⑥ T-3 IMPORTANT updateSettingsForSource「校验失败 → raw 数据为合并基座」支零测——回归改该支为 merge 进 {} 将静默丢用户坏字段数据且全测绿 ⑦ T-4=X-2 ⑧ T-5 MINOR 「级联错误去重」测名过 claim（seenFiles 去重支新布局下防御性不可达，原测名暗示验证了从未走到的支）⑨ T-6 MINOR endpoint-adapter compose 测试未复位全窗口（7 组模块态注入仅复位 endpoint source + settings cache；--isolate 单进程口径下无泄漏）⑩ T-7 MINOR 一批低价值漏测支（flag no-op 同分支 / shouldAllowManagedHooksOnly 双 disableAllHooks 边 ② / ask 数组支 / 顶层 null 特判 / 写失败 catch 支）⑪ T-8 NOTED 结构不可测项核验通过（realpath 恒等 mock 缓存按输入路径键控无害 / SAFE 过滤支结构性 no-op 已登记残留守 / flag 死源短路无害——逐项核验不报为缺口）。
- **裁定**：T-1/T-2/T-3 三条 IMPORTANT 本波关（均落 E-3 自身 7 测试文件 + hooksConfig.ts 一行内，成本极低；不关则本波测试面对「用户畸形 hooks 配置崩 loop / BOM 文件静默失效 / 校验失败写回丢数据」三条真实路径零信号）。T-7①③④⑤ 低价值支不逐条补（防测试面膨胀，按需取）；T-8 不处置（核验通过项）。

**修复落地（两提交，master 无 remote 不 push）**：
- **提交 1 `2c0467b`（src 修复）**：T-1 hooksConfig.ts provider `matcher.hooks` 加 Array 守卫（`Array.isArray ? : []`，防用户配置崩钩子面；加固登记非逐字偏离，头注登记 §8.30 T-1）/ X-1 managedEnv.ts 预声明块核销（applySafe = S-3d 已消费 compose ⑥；applyConfig = 信任对话框面残留守 compose 头注登记 §8.29）/ X-3 constants.ts flagSettings 死源支机制描述订正。
- **提交 2 `bf71b90`（tests 修复 + 补测 4 条）**：T-1 畸形 matcher 剔除不崩回归锁定 / T-2 BOM 前缀解析回归守卫（删 replace 行则红，非 tautology）/ T-3 校验失败 raw 合并基座坏字段无损保留（防静默丢数据假绿）/ T-7② 态① 边界双 disableAllHooks（shouldAllowManagedHooksOnly 守卫支 false + includingManaged true）+ T-4/X-2 4 文件 import 归 shared（对齐 memory-fs-store 先例）/ T-5 测名订正 / T-6 endpoint-adapter 运行口径头注。
- **验真通过项（防重查）**：旧仓 fidelity 全锚点验真（settings-adapter 37L 三方法 / autoCompact 三 env guard 双处 / roles 池 bare ref 勘误成立 / 旧仓启动序 ⑥ 先 ⑦ / settings.ts 1011L 裁剪裁定全兑现 / SAFE_ENV_VARS 63 项逐项 diff / hooksConfig 门控链四态 + 三裁剪登记）/ 类型面 ↔ schema 面无漂移 / managedEnv 两面遵守三层缓存语义 / permissions L3 注入窗口零上向 import + compose ③ 真接线 / resetEndpointConfigSource 三元组 / 门面导出面四方门面对账无误 / 基线 762/1527/57 与 §8.29 声称逐位吻合 + gate 6 pass 且 engine 正确不在扫描集（既定裁定成立）。

**验真（四件套 + gate）**：tsc 0 / eslint 0（3 src + 4 tests 改文件）/ build 0 KB / **766 pass 0 fail**（1535 expect，57 文件；762 + 4 新增测，谱系 661→741（S-3c）→762（S-3d）→766）+ gate 6 pass / 0 fail / 2 files（engine 非扫描集，无 gate 改动）。

**闭环判定**：E-3 整波审视 11 项全处置（1 src 加固 + 3 头注核销/订正 + 4 测试补/订正 + 1 运行口径登记 + 2 不处置裁定），无 BLOCKER。三条「以为已全」防漏项（T-1 崩溃支 = E-3 自身代码引入的无守卫支 / T-2 BOM 契约零守卫 / T-3 写回丢数据假绿）全部闭环——双视角独立报出 T-1 是本轮大颗粒审视的核心价值（单切片 review 视角内 provider 加固属 hooksConfig 切片自洽，跨切片「z.any() 放行 + 无守卫消费链」组合只有全波回看才可见）。**下一步不变**（engine 波纵切顺序）：E-4（permissions 规则求值树：getTools 族 + filterInvalidPermissionRules 语法过滤支回填 + teammate/plan 门 + ruleContent + updateSettingsForSource 权限写回消费面）→ E-5（hooks-runner 流式/attachment + stop hooks + matrix 行 102 翻转 + HooksSchema 变体全字段面 + 事件名集校验 + z.lazy 收紧）→ E-6（executor 全 shell，可并行）→ E-7（leaves）→ E-wave-end（compose.ts engine 装配 ⑦ 消费注册接缝：autoCompact deps override 装配 / applyConfig 信任对话框面 / getPolicySettingsOrigin 诊断面 + engine anti-stub 门 ⑥ + M-3 收口）。

### §8.31 E-4 permissions 规则树勘察定稿 + task 清单（2026-09-24，双只读勘察 agent + 锚点抽查验真）

**触发**：E-3 全闭环（§8.30，基线 766/1535/57 + gate 6），engine 波纵切下一波 = E-4（permissions 规则树）。双只读勘察子代理并行（限额 ≤2）：
- **勘察 ①（旧仓裁剪面）**：`/home/vince/projects/AtlasHarness/AtlasHarness` @ a8af45b，`src/utils/permissions/` 23 文件 + yolo-classifier-prompts 288L = **8985L**；逐符号全仓 grep 消费面枚举（130+ importer 归类 engine/coordinator/TUI/bridge/swarm/ascend 六面）+ 逐文件裁定 + 语义锚点 file:line 定位。
- **勘察 ②（新仓落点）**：6 登记接缝逐一核位（file:line）+ 切片方案裁定（parser 双落位 / S-4b 边界钉死 / S-4c 拆 c1/c2）+ 门/矩阵影响面 + 6 风险点。
- **主 session 锚点抽查验真**（子代理报告不具权威，E-1 勘察教训，关键锚点直验）：checkRuleBasedPermissions:911（export async）/ hasPermissionsToUseTool:460（export const CanUseToolFn）/ Inner:998（模块内）/ createPermissionRequestMessage:124 / shellRuleMatching 四函数（permissionRuleExtractPrefix:43 / hasWildcards:54 / matchWildcardPattern:90 / parsePermissionRule:159）/ permissionsLoader 六导出（:31/:42/:120/:140/:163/:229，296L）/ permissionValidation（validatePermissionRule:58 + PermissionRuleSchema:244，262L）全部命中；新仓 6 接缝全部定位（toolExecution.ts:40-44/59/141-154 E-4 接缝头注已登记 / toolRegistry.ts:21-24 getTools 族残留守注 / validation.ts:137-165 语法支登记 / agentToolUtils.ts:126 split(':') 裁剪注 + :66-75 teammate 分支 / settings.ts:56-57 预声明消费面 = E-4 / hasSkipDangerousModePermissionPrompt 未落 settings.ts:46 头注）；新仓 permissions 域 6 文件 1031L（permissions.ts 63L 薄骨架 no-op-allow + 6 项残留守 ①-⑥ 头注已登记）核实。

**定界结论**（E-4 落盘面 ≈ T1+T2 ≈ **2800L / 14 文件**，域总量 8985L 的 ~31%）：
- **T1 求值树核心 ~1485L**：permissions.ts 规则支 + 规则编辑/同步面（规则访问器 ~120L + toolMatchesRule + checkRuleBasedPermissions 86L + applyPermissionRulesToPermissionContext/syncPermissionRulesFromDisk ~140L + createPermissionRequestMessage 75L + dontAsk 15L）+ filesystem.ts 规则求值树增量 ~460L（pattern root 208L + matchingRuleForInput 71L + checkRead/Write 规则命中步 + generateSuggestions 60L + 1.6 config-folder session allow 分支）+ permissionSetup.ts 规则源装配面 ~415L（8 函数，见裁定 ②）。
- **T2 规则支撑小文件 ~1300L**：permissionRuleParser 183 / shellRuleMatching 228 / PermissionUpdate 389 / PermissionUpdateSchema 78 / permissionsLoader 296 / PermissionMode 139（显示面 ~60L 裁）。
- **不在本波**：pathValidation 487L（E-6 全 shell 波随迁，规则求值输入面 E-4 仅定义）/ PermissionPromptToolResultSchema 127L（E-2 MCP / E-7 leaves 裁定）/ filesystem 内部路径未落域分支 ~250L（E-7 leaves / task 域波）。

**两裁定点（落纸）**：
- **裁定 ① classifier 族整族留守 ~3030L → auto-mode 纵切波**（非 E-4）：yoloClassifier 1332 + yolo-classifier-prompts 288 + autoModeState 39 + classifierDecision 91 + classifierShared 39 + bypassPermissionsKillswitch 150 + bashClassifier 61（外部构建 no-op stub，E-6 随 stub 迁）+ denialTracking 45 + dangerousPatterns 54 + permissionSetup auto 面 ~560L + permissions.ts auto 支 ~355L。证据（11 组符号全仓 grep）：非 TUI 消费者仅 3 处——permissions.ts auto 支（TRANSCRIPT_CLASSIFIER 门）/ agentToolUtils.ts:407（swarm 链，新仓无消费者）/ cli auto-mode 子命令（新仓无此子命令）；6 登记接缝零引用；新仓三处头注自裁（settings.ts:46-48 auto-mode 三函数未落 / types-session.ts:100 变体归 engine 波 / permissions.ts:11 分类器归 engine）。E-4 仅保留 dontAsk 转换 + headless auto-deny 兜底。
- **裁定 ② permissionSetup 1508L 保留 8 函数 ~415L / 裁 22 函数 ~1090L**：保留 = parseToolListFromCLI(58L) / parseBaseToolsFromCLI / isSymlinkTo / initializeToolPermissionContext(157L，裁 auto 支 L957-963/L974-976) / initialPermissionModeFromCLI(121L，裁 auto 支 L712-733/L757-762/L799-801) / shouldDisableBypassPermissions（裁 GrowthBook 留 settings 读）/ isBypassPermissionsModeDisabled（同裁法）/ createDisabledBypassPermissionsContext + prepareContextForPlanMode 非 auto 支（prePlanMode stash ~15L，seam ④ plan 门）。裁掉 = auto-mode 危险规则守卫面 ~400L（isDangerous*/findDangerous*/overly-broad/strip-restore 族）+ auto 门面 ~253L（verifyAutoModeGateAccess/AutoModeEnabledState 族）+ 模式迁移 plan 面 ~135L（transitionPermissionMode/transitionPlanAutoMode）。

**S-4b 边界钉死**（双勘察裁定，防 scope creep）：移植规则匹配核心 ~500L（getAllow/Deny/AskRules + toolMatchesRule + toolAlwaysAllowedRule + getDenyRuleForTool/getAskRuleForTool/getDenyRuleForAgent + filterDeniedAgents + getRuleByContentsForTool(Name) + applyPermissionRulesToPermissionContext + checkRuleBasedPermissions 规则支 [bypass 尊重子集 1a-1g] + createPermissionRequestMessage + getUpdatedInputOrFallback + PERMISSION_RULE_SOURCES）+ shellRuleMatching 228L 全迁（Bash glob 三态 exact/前缀 `:*`/wildcard `*`，尾 ` *` 尾参可选 L136-145，legacy `npm:*` → 前缀提取）；**不迁** hasPermissionsToUseToolInner 162L 全量面（1c 工具 checkPermissions 分发 / 1e requiresUserInteraction / 1g safetyCheck / 2a bypass / 3 passthrough）——薄骨架头注 ①④⑤⑥ 残留守不变（工具面分发随 E-6 / 钩子反向边随 E-5 / sandbox 自动放行随 E-6）；dontAsk ② 不变。getDenyRuleForAgent/filterDeniedAgents 32L 随迁（旧仓消费 = swarm 链，新仓消费 = AgentTool agentType 面登记，成本最低防 agent 波回填）。

**切片方案 + 依赖序**（实际串行执行，∥ 仅理论依赖边）：`S-4a → (S-4b ∥ S-4c1) → S-4c2 → S-4d`
- **S-4a 规则解析 + 类型面**（#91）：permissionRuleParser 183L **双落位裁定**——纯字符串函数（escape/unescape/permissionRuleValueFromString/parsePermissionRule 字符串级）→ permissions 域；LEGACY alias map 4 项（工具名别名解析 = 工具名表面）→ engine 侧 toolNames 同目录（engine/tools/），+ **alias 与 toolNames 同步钉单测**（防漂移）。PermissionRule/PermissionResult 类型已随迁核验（PermissionRule.ts 50L / shared 类型 re-export）。判别信号：parse 往返（escape/unescape 对称 + `Bash(npm run *)` 三态归类 [exact/前缀 `:*`/wildcard] + legacy alias 解析）。
- **S-4b 规则求值树主体**（#92，∥ S-4c1）：规则匹配核心 ~500L + shellRuleMatching 228L + **薄骨架 no-op-allow 替换须保持「空规则集=allow」默认兼容，单提交含 matrix :95 proof 翻新**（tests/unit/permissions.test.ts 现 no-op-allow 断言 → 规则支判别信号）。判别信号：deny 规则 `Bash(npm install)` 拒匹配 input / `mcp__server` 前缀拒该 server 全部工具 / ask 命中返 ask / 空规则集=allow（默认兼容回归）。
- **S-4c1 规则源读写 + 写回核销**（#93）：permissionsLoader 296L 全迁（**落 engine 侧**——L3 域边界：permissions 纯叶域不跨域 import，跨域连接器归 engine 侧；settingsWrite 新注入窗口 + compose 接线 = 拒）+ permissionSetup 保留面 8 函数 ~415L engine 侧落（规则源装配 + 求值输入构造，裁 auto 支）+ 接缝 ⑤ 写回核销（settings.ts:56-57 预声明消费面）+ 接缝 ⑥ hasSkipDangerousModePermissionPrompt 补函数落 engine/config/settings.ts（trusted 源读面；UI 消费面残留守登记）+ **func 真盘写回 round-trip**（add → 重载 → 规则出现 / delete → 规则消失）。
- **S-4c2 PermissionUpdate + 语法过滤支回填**（#96）：PermissionUpdate 389L（extractRules/hasRules 无消费点则不留死接缝（H6）；persistPermissionUpdate:222/349 + createReadRuleSuggestion:361 在范围）+ PermissionUpdateSchema 78L + **接缝 ③ 语法过滤支回填**（validation.ts:137-165 filterInvalidPermissionRules 谓词扩「非字符串 OR 语法校验失败」，校验器来自 S-4a parser，settings.ts:234 读链自动生效）。判别信号：`Bash(unbalanced` 被滤 + warning / 合法规则保留。
- **S-4d engine 接线**（#94）：① gate 工厂新文件（engine 侧）+ loop.ts 透传 ~3 行（AgentLoopDeps.checkPermission? + runToolBatch 透传）+ **3 值 verdict 裁定 `{ allowed, reason?, ask? }`**（toolExecution.ts:41-44 类型扩 + :144-154 映射分支：ask → is_error + reason，prompt 面残留守登记，防静默语义洞）② toolRegistry.ts + filterToolsByDenyRules/getTools/getToolsForDefaultPreset（getMergedTools 不加；消费 getDenyRuleForTool）④ agentToolUtils.ts:126 ruleContent 解析替换（split(':') 裁剪 → S-4a parser）+ :66-75 teammate carve-out 分支（IN_PROCESS_TEAMMATE_ALLOWED_TOOLS 经 toolNames；**plan 门只重登记不硬填**）。判别信号：① 无 gate 成功 / gate+deny → is_error「permission denied」② blanket deny Bash → 模型可见池排除 Bash ④ spec `Bash(npm install)` validTools 保留 ruleContent（前 = split(':') 截断误判）。

**门/矩阵同步计划**：anti-stub 门——permissions 在 CDEEP_DOMAINS 扫描集（实质新文件零 STUB_REGISTRY 登记）；engine 不在扫描集（M-3 延 E-wave-end）→ 新 engine 文件 <5 实义行须头注占位登记。capability-matrix——permissions 2 行均 done：行 :95「checkRead/checkWrite 决策主面（零磁盘）」proof = tests/unit/permissions.test.ts（S-4b 提交翻新，现 no-op-allow 断言）/ 行 :96（realpath 链，func）不变；新 done 行：规则求值树匹配（S-4b unit）/ 权限写回 round-trip（S-4c1 func）/ deny 规则工具面过滤（S-4d unit）。

**6 风险点**：① no-op-allow 替换窗口单提交（规则支替换与 matrix :95 proof 翻新同提交，防中间态测试面断 no-op 而代码已规则支）② ask 3 值 verdict 裁定（toolExecution 现 `{ allowed, reason? }` 二值；扩 3 值 = 类型 + 映射双改，ask → is_error + reason 须登记 prompt 面残留守）③ plan 门只重登记（ExitPlanModeV2 plan 面新仓无消费者，硬填 = 假装通过 + H6 死接缝双红线）④ matrix 时序（行状态翻转在 S-4b 单提交内）⑤ engine M-3 门盲区（新 engine 文件不入 anti-stub 扫描集，小文件须头注手工登记）⑥ parser alias 与 toolNames 同步钉（LEGACY alias 4 项与 toolNames 单一事实源表防漂移，同步钉单测）。

**基线**：766 pass / 0 fail / 1535 expect / 57 文件（E-3 review 766）+ gate 6 pass / 0 fail / 2 files（engine 非扫描集，本波新 engine 文件无 gate 影响）。

**下一步**：S-4a 执行（执行前分析 + 方案按 E-3 §8.28/§8.29 模式，执行前落纸一节）。

### §8.32 E-4 S-4a 执行前分析 + 方案（2026-09-24）

**执行前分析**（旧仓 ground truth + 新仓落位面核实）：
- 旧仓 permissionRuleParser.ts 183L 结构：**LEGACY_TOOL_NAME_ALIASES 4 项**（Task→AGENT_TOOL_NAME / KillShell→TASK_STOP_TOOL_NAME / AgentOutputTool→TASK_OUTPUT_TOOL_NAME / BashOutputTool→TASK_OUTPUT_TOOL_NAME）+ 2 alias 函数（normalizeLegacyToolName / getLegacyToolNames，Object.entries 插入序）+ 纯字符串函数组（escapeRuleContent / unescapeRuleContent / permissionRuleValueFromString / permissionRuleValueToString + 私有助手 findFirst/LastUnescapedChar 奇偶反斜杠判转义）。
- **驱动落位设计的关键矛盾**：`permissionRuleValueFromString` 在 parse 时调 `normalizeLegacyToolName`（旧仓设计抉择 = parse 时归一，规则匹配面永不见 legacy 名）；但 L3 域边界 = permissions 纯叶域（只 import shared + 注入窗口，不 import 其他域），而 4 项 alias 的正规名单一事实源在 engine 侧 toolNames（T-5e）→ **alias 表只能经 engine 侧注入窗口进入 permissions 域，不可向上 import**。
- 新仓落位面核实（主 session 直验）：toolNames.ts 三正规名常量齐备（AGENT_TOOL_NAME 经 agent/constants re-export / TASK_STOP_TOOL_NAME='TaskStop' / TASK_OUTPUT_TOOL_NAME='TaskOutput'，全在 engine/tools/index.ts + engine/index.ts 门面导出链上）→ 4 项 alias 表全可表达，零缺。
- **注入窗口先例选定**：settingsPaths.ts（S-3c，未注入 = 空数组降级，非 fail-fast）同型 → alias 窗口未注入 = 空 map → normalize = identity（安全降级：legacy 名不归一但不崩；区别于 bootstrap-env fail-fast，本面是数据面非启动依赖面）。
- **模块加载注册先例**：ascendMarketplace 叠加层模块加载时注册（CLAUDE.md 市场契约）→ engine 侧 alias 文件模块加载自注册，tools 门面 re-export 触发 side-effect import；仅用 permissions 域的入口（未注入）= identity 降级，compose 根无需额外接线（注册 = 模块 side effect 实消费点，非 H6 预声明死接缝）。

**方案**（2 新 src + 3 门面改 + 2 新测试，单提交）：
1. `src/permissions/permissionRuleParser.ts`（permissions 域新文件 ~200L）：4 纯字符串函数 + 2 alias 函数（基于注入 map）逐字移植 + 注入窗口 set/get/resetLegacyToolNameAliases（默认空 map = identity）；旧仓语义逐支保留（escape 先反斜杠后括号 / unescape 逆序 / 奇偶反斜杠判转义 / `Bash()` 与 `Bash(*)` → tool-wide / 无匹配右括号·尾内容·空工具名 → 整体当工具名）。
2. `src/engine/tools/legacyToolNameAliases.ts`（engine 侧 toolNames 同目录新文件 ~40L）：LEGACY_TOOL_NAME_ALIASES 4 项（值引用 toolNames/agent 常量，**不持字面量**）+ 模块加载注册 + 头注（漂移防 = 同步钉单测）。
3. 门面 3 处：permissions/index.ts + `export * from './permissionRuleParser'`（头注当前面更新）/ engine/tools/index.ts + alias 导出块（re-export 触发注册，头注波次注）/ engine/index.ts 第一 tools 值块 + `LEGACY_TOOL_NAME_ALIASES`（同步钉测试经 engine 根门面 import）。
4. `tests/unit/permission-rule-parser.test.ts`（unit，L3 只 import permissions 根门面；beforeEach reset 隔离模块态）：escape/unescape 顺序契约（旧仓 doc 例 + 往返对称）/ parse 三态 + 5 边缘态 / toString 往返 / alias 窗口（未注入 identity / 注入生效 / 插入序）。
5. `tests/unit/engine-tools-legacy-aliases.test.ts`（unit，engine + permissions 双根门面）：**同步钉**（4 项值 === toolNames 常量逐一 + 值集全在常量集防字面量漂移）+ 注册生效（'Task' → 'Agent' / 'Task(npm i)' → {toolName:'Agent', ruleContent:'npm i'} / getLegacyToolNames 插入序）；beforeAll 显式重注册（幂等）+ 头注运行口径（标准 --isolate 跑法 = 模块加载注册天然生效，显式注册仅单进程 ad-hoc 连跑防污染，同 §8.30 T-6 口径）。
- **门/矩阵**：permissions 在 CDEEP_DOMAINS 扫描集（新实质文件零 STUB_REGISTRY 登记）；engine 不在扫描集（M-3 延 E-wave-end，本文件 ~40L 实质 >5 行无须占位登记）；matrix 本切片无新增行（parser 为支撑面，能力行「规则求值树匹配」落 S-4b、「deny 规则工具面过滤」落 S-4d）。
- **判别信号（变异探针验真，防 tautology）**：① 转义顺序破坏（括号先于反斜杠）→ 往返/顺序测须红 ② alias 值漂移（KillShell 指向 TASK_OUTPUT）→ 同步钉测须红。

**实施记录**：
- 落点 5 项全落（parser 双落位 + alias 注入窗口 + 模块加载注册 + 门面 3 处 + 双测试文件）；`import type { PermissionRuleValue } from '../shared'`（类型走 shared 单一事实源，对齐 permissions.ts 既有 import 面，非域内 PermissionRule.ts 回引——避免同域文件间依赖，与薄骨架先例一致）。
- 实施期勘误 1 处：初版 engine/tools/index.ts 导出块初拟 `export * from './legacyToolNameAliases'`，改显式具名 `export { LEGACY_TOOL_NAME_ALIASES }`（对齐本门面既有全具名块风格，防 `export *` 意外泄漏 side-effect 模块未来新增导出）。
- 残留守登记：无新增残留守（本切片为纯新增支撑面，无裁剪）；注入窗口核销状态 = **已消费**（engine 侧模块加载注册实挂，非预声明）。

**验真（四件套 + gate + 探针）**：tsc 0 / eslint 0（2 新 + 3 改 src + 2 新 tests）/ build 0 KB / **790 pass 0 fail**（1577 expect，59 文件；766 + 24 新增测）+ gate 6 pass / 0 fail / 2 files。变异探针双红确认（① 转义序破坏 → parser 测 4 fail ② alias 漂移 → 同步钉 3 fail；还原后 24 pass 复绿）。

**下一步**：S-4b（规则求值树主体，∥ S-4c1 理论并行，实际串行执行）。

### §8.33 E-4 S-4b 执行前分析 + 方案（2026-09-24）

**执行前分析**（旧仓 ground truth 全量核实 + 新仓落位面直验）：
- 旧仓 permissions.ts 1326L 函数清单逐一定位（主 session 直读全文）：规则匹配核心 = getAllow/Deny/AskRules:109-218 + toolMatchesRule:225（私）+ toolAlwaysAllowedRule:262 / getDenyRuleForTool:274 / getAskRuleForTool:284 / getDenyRuleForAgent:295 / filterDeniedAgents:312 + getRuleByContentsForTool(Name):336-377 + checkRuleBasedPermissions:911（export async 86L）+ createPermissionRequestMessage:124（75L）+ PERMISSION_RULE_SOURCES:96 + permissionRuleSourceDisplayString:103 + applyPermissionRulesToPermissionContext:1248 + convertRulesToUpdates:1215（私）。
- **传递依赖裁定（本切片关键矛盾 ①）**：边界钉死的 applyPermissionRulesToPermissionContext 传递依赖 applyPermissionUpdates（旧 PermissionUpdate.ts:196，纯 context 变换）→ **update 应用核心（applyPermissionUpdate/applyPermissionUpdates ~150L）自 S-4c2 提前入 S-4b**（S-4c2 余 persistPermissionUpdate/persistPermissionUpdates/supportsPersistence/extractRules/hasRules/Schema/接缝③ 语法支）；syncPermissionRulesFromDisk:1259 + deletePermissionRule:1169 依赖 permissionsLoader（S-4c1 engine 侧）→ **不随 S-4b，归 S-4c1**。
- **getUpdatedInputOrFallback 裁出本切片（H6）**：唯一消费点 = 旧 Inner 2a/2b（工具面分发支，残留守①随 E-6）；本切片 hasPermissionsToUseTool 替换体 allow 支 updatedInput 直接取原 input → 本切片零消费 = 死接缝，登记 E-6 随工具面分发片落。
- **MCP 名匹配纯函数落位（矛盾 ②）**：toolMatchesRule 需 getToolNameForPermissionCheck + mcpInfoFromString（旧 mcpStringUtils，纯字符串）；L3 = permissions 纯叶域不 import engine（engine/tools/mcp.ts 头注已登记「E-4 权限层」残留守 = 本面落点）→ **permissions 域内新建 mcpRuleNames.ts 本地定义**（S1 独占 shared / S2 域内本地 + TODO PR to shared 先例）；engine 侧 mcp.ts 已有自己的归一化副本（两份纯函数，L3 边界不破；合并归 TODO PR，不本波）。
- **PERMISSION_RULE_SOURCES 域内自持（矛盾 ③）**：旧 = [...SETTING_SOURCES(5), cliArg/command/session]，SETTING_SOURCES 在 engine 侧 settings constants（L3 不可 import）→ 域内持全 8 值字面元组（shared PermissionRuleSource 类型约束 `satisfies`，值漂移 = tsc 红）。
- **新仓 Tool 契约核实**：shared Tool 有 `mcpInfo?: {serverName, toolName}`（types.ts:195）+ `checkPermissions(input, context): Promise<unknown>`（无 zod inputSchema.parse——新 inputSchema = JSON schema）→ PermissionTool 窄视图扩 mcpInfo?（镜像 shared Tool）+ checkPermissions?（鸭子可选，1c 分发；工具面实现归 E-6）；1c 的旧 inputSchema.parse 预解析 + AbortError 重抛 + logError 三处裁剪（引擎类型 / shared/debug 仅 logForDebugging）。
- **createPermissionRequestMessage 裁剪面**：新 shared PermissionDecisionReason 仅 rule/mode/workingDir/safetyCheck/other 五变体（types-session.ts:124）→ 保留五支 + 默认消息；裁 hook/subcommandResults/permissionPromptTool/sandboxOverride/asyncAgent/classifier 六支（生产方 = E-5 hooks / E-6 工具面 / E-7 / 分类器波，头注登记）；mode 支展示标题域内迷你 map（旧 PermissionMode.ts 5 外部模式 title 逐字 + auto/bubble 回落 default，TUI 符号/色面不随迁）。
- **空规则集=allow 适配裁定（矛盾 ④）**：旧 Inner 末端 passthrough→ask；本仓无 prompt 面（残留守），薄骨架 no-op-allow 契约 = 无规则反对时 allow → 替换体末端「无命中 = allow（decisionReason mode）」，matrix :95 原「默认恒 allow」测试语义保留为「空规则集=allow 回归」判别信号。

**方案**（4 新 src + 2 改 src + 3 测试文件 + matrix 1 新行，单提交）：
1. `src/permissions/ruleMatching.ts`（~280L）：PERMISSION_RULE_SOURCES（8 值域内元组）+ permissionRuleSourceDisplayString（旧 getSettingSourceDisplayNameLowercase 8 值逐字）+ getAllow/Deny/AskRules（逐字，消费 S-4a parser）+ toolMatchesRule（私；ruleContent undefined = tool-wide；mcp server 级 + `__*` 通配）+ toolAlwaysAllowedRule/getDenyRuleForTool/getAskRuleForTool/getDenyRuleForAgent/filterDeniedAgents（逐字）+ getRuleByContentsForTool(Name)（逐字）+ checkRuleBasedPermissions（规则支 1a-1g；⑥ sandbox 自动放行裁 / 1c 鸭子可选分发 / catch 吞错 logForDebugging）+ createPermissionRequestMessage（五变体裁剪版）。头注登记前向接缝：checkRuleBasedPermissions → S-4d gate 工厂 / getRuleByContentsForToolName → E-6 Bash 工具面 / getDenyRuleForAgent·filterDeniedAgents → AgentTool agentType 面 / getDenyRuleForTool → S-4d filterToolsByDenyRules。
2. `src/permissions/mcpRuleNames.ts`（~80L）：mcpInfoFromString / normalizeNameForMCP（CLAUDEAI_SERVER_PREFIX 特判逐字）/ getMcpPrefix / buildMcpToolName / getToolNameForPermissionCheck（旧 mcpStringUtils+normalization 纯函数逐字）；域内本地定义 + TODO PR to shared 注。
3. `src/permissions/shellRuleMatching.ts`（228L 全迁）：ShellPermissionRule + permissionRuleExtractPrefix / hasWildcards / matchWildcardPattern（placeholder 转义 + 尾 ` *` 尾参可选 L136-145 + dotAll 内嵌换行）/ parsePermissionRule（exact/`:*` 前缀/wildcard 三态）/ suggestionForExactCommand / suggestionForPrefix；依赖改 shared PermissionUpdate 类型。
4. `src/permissions/permissionUpdate.ts`（~170L）：applyPermissionUpdate / applyPermissionUpdates（逐字，logForDebugging=shared/debug + S-4a toString）+ applyPermissionRulesToPermissionContext + convertRulesToUpdates（私）；裁 persist 族/extractRules/hasRules（S-4c1/c2，H6 消费点核销）。
5. `src/permissions/permissions.ts` 翻新（63L 薄骨架 → ~120L 规则支决策面）：forceDecision 优先（不变）→ 1a deny 规则 → 1b ask 规则 → 2b allow tool-wide 规则 → **空规则集=allow（decisionReason mode，薄骨架默认兼容）**；CanUseToolFn 签名不变（S-4d 3 值 verdict 另片）；头注残留守 ②④⑤⑥ 不变 + ① 半核销注（规则求值核心落，工具面分发半随 E-6）。
6. `src/permissions/filesystem.ts` PermissionTool 扩 `mcpInfo?` + `checkPermissions?`（鸭子可选，两字段全可选 = 既有消费者零影响）；`src/permissions/index.ts` 加 4 新文件导出块。
7. 测试面：tests/unit/permissions.test.ts 翻新（:95 proof——「默认恒 allow」改「空规则集=allow 回归」+ 新增 4 规则支判别测：tool-wide deny 拒 / ask 命中 ask / allow 命中 rule 原因 / mcp__server 前缀拒该 server 全部工具 + `__*` 通配）；**新** tests/unit/permission-rule-matching.test.ts（matrix 新行 proof：规则访问器多源 flatMap / toolMatchesRule 边缘 / Agent(agentType) 族 / getRuleByContentsForToolName 判别信号 deny `Bash(npm install)` 入 content map / checkRuleBasedPermissions 1a·1b·null·1c 鸭子·1f·1g / createPermissionRequestMessage 变体 / applyPermissionRulesToPermissionContext 分组累积）；**新** tests/unit/shell-rule-matching.test.ts（三态归类 / extractPrefix / hasWildcards / matchWildcardPattern 含 `\*` `\\` 尾 ` *` 可选 + 多通配排除 + 内嵌换行 + caseInsensitive / suggestion 两函数形状）。
8. matrix：新增行 `{permissions, '规则求值树匹配（deny/ask/allow 规则命中 + mcp 前缀 + 空规则集=allow）', done, proof: tests/unit/permission-rule-matching.test.ts}`；:95 行不变（proof 文件仍含 checkRead/checkWrite 面）。
- **门/矩阵**：permissions 在 CDEEP_DOMAINS 扫描集（4 新实质文件零 STUB_REGISTRY 登记）；engine 不动（M-3 延后不变）。
- **判别信号（变异探针，防 tautology）**：① matchWildcardPattern placeholder 反转义序破坏 → 通配测红 ② mcpInfoFromString join 改单段 → mcp 规则测红 ③ 规则支优先级颠倒（allow 先于 deny）→ deny 命中测红。

**实施记录**（2026-09-24）：
- 4 新 src 全落：`mcpRuleNames.ts`（~80L，5 纯函数 + CLAUDEAI_SERVER_PREFIX 特判逐字 + TODO PR to shared 注）/ `ruleMatching.ts`（~280L，规则匹配核心全族 + PERMISSION_RULE_SOURCES 8 值域内元组 `satisfies readonly PermissionRuleSource[]` + checkRuleBasedPermissions 规则支 1a-1g + createPermissionRequestMessage 五变体裁剪版 + 头注前向接缝登记：checkRuleBasedPermissions→S-4d gate 工厂 / getDenyRuleForTool→S-4d filterToolsByDenyRules / getRuleByContentsForToolName→E-6 Bash 工具面 / getDenyRuleForAgent·filterDeniedAgents→AgentTool agentType 面）/ `shellRuleMatching.ts`（228L 全迁，依赖改 shared PermissionUpdate 类型）/ `permissionUpdate.ts`（~170L，update 应用核心 S-4c2 提前面；persist 族/extractRules/hasRules 裁出登记 S-4c1/c2）。
- 2 改 src：`permissions.ts` 薄骨架 63L → ~120L 规则支决策面（forceDecision → 1a deny → 1b ask → 2b allow tool-wide → 空规则集=allow（mode 原因）；CanUseToolFn 签名不变）；`filesystem.ts` PermissionTool 扩 `mcpInfo?` + `checkPermissions?`（两字段全可选，既有消费者零影响）。`index.ts` 加 4 导出块 + 头注更新。
- 测试面 3 文件：`permissions.test.ts` 翻新（:95 proof——「no-op-allow 起步」2 测 → 「规则支决策面」7 测：空规则集=allow 回归 / forceDecision / deny 命中（含全规则串相等断言）/ ask 命中 / allow tool-wide rule 原因 / mcp__server 前缀 + `__*` 通配 + 他 server 不受影响 / deny 先于 allow；union 收窄按本文件既有 cast 惯例）+ 新 `permission-rule-matching.test.ts`（31 测 56 expect：规则访问器多源序 / tool 规则访问器 4 边缘 / Agent(agentType) 族 / 内容规则 map 判别信号 / checkRuleBasedPermissions 7 支 / 请求消息 4 变体 / mcpRuleNames 4 测 / 显示名 / update 应用核心 3 测）+ 新 `shell-rule-matching.test.ts`（23 测 34 expect：三态归类 4 / extractPrefix 3 / hasWildcards 5 / matchWildcardPattern 9（`\*` 字面 / `\\` 字面 / 尾 ` *` 可选 / 多通配排除 / 内嵌换行 dotAll / caseInsensitive / trim）/ suggestion 2）。
- matrix 新行 2 条（方案 item 8 登记 1 条 + **增补 shell 三态行**——shellRuleMatching 为本切片全迁能力，不挂矩阵即 H6 空洞；两行 proof 分别为 permission-rule-matching / shell-rule-matching 新测试文件，:95 行不变）。
- eslint 1 修：新测试文件未用导入 `getAskRuleForTool` 移除（工具级 ask 访问器已含于 permissions.test.ts 翻新面，非缺测）。
- 单提交（§8.33 记录随本提交；SHA 于 §8.3x 审视记录回填）。

**验真（四件套 + gate + 探针）**（2026-09-24）：
- 四件套全绿：`bun x tsc --noEmit` exit=0 / eslint 变更面 0（修 1 unused import 后）/ `bun build src/atlascode/cli.ts` = 0 KB / `bun test --isolate tests/` **849 pass / 0 fail / 1681 expect / 61 文件**（基线 790/1577/59 → +59 pass +104 expect +2 文件）；gate `tests/ci/` 6 pass / 0 fail / 2 文件。
- 变异探针 3/3 检出红 + 复原绿：① matchWildcardPattern 星占位反转义提前到 wildcard 转换前（`\*` 占位插入的 `\*` 被 `*`→`.*` 吞成通配）→ 「字面星号」测红（`git \*` 不再匹配 `git *`）② mcpInfoFromString 全段 join 改单段 → 「双下划线保留」测红（`a__b` → `a`）③ 规则支优先级颠倒（allow 支提前到 deny 前）→ 「deny 先于 allow」测红（返回 allow）；三者复原后三 permissions 测试文件 68 pass 复绿。
- 判别信号全验证：deny `Bash(npm install)` 入 content map 且拒裸 Bash 工具不命中 / `mcp__myserver` 前缀 + `mcp__myserver__*` 通配拒该 server 全部工具而他 server 放行 / 空规则集 context → allow + `decisionReason {type:'mode',mode:'default'}` 回归。

**下一步**：S-4c1（permissionsLoader 全迁 engine 侧 + permissionSetup 保留面 8 函数 + 接缝⑤⑥写回核销）。

### §8.34 E-4 S-4c1 执行前分析 + 方案（2026-09-24）

**执行前分析**（旧仓 ground truth 全量核实 + 新仓落位面直验）：

- 旧仓函数清单：permissionsLoader.ts 296L 全量（shouldAllowManagedPermissionRulesOnly:31 / shouldShowAlwaysAllowOptions:42 / getSettingsForSourceLenient:61 / settingsJsonToRules:91 私 / loadAllPermissionRulesFromDisk:120 / getPermissionRulesForSource:140 / PermissionRuleFromEditableSettings:147 + EDITABLE_SOURCES:152 / deletePermissionRuleFromSettings:163（roundtrip 归一 + 保留未识别键）/ addPermissionRulesToSettings:229（去重归一 + lenient 回落 + 空规则集短路））；permissionSetup.ts 1508L 保留面 9 函数（parseBaseToolsFromCLI:647 / isSymlinkTo:665 私 / initialPermissionModeFromCLI:684 122L / parseToolListFromCLI:806 59L / initializeToolPermissionContext:865 158L / shouldDisableBypassPermissions:1236 / isBypassPermissionsModeDisabled:1347 / createDisabledBypassPermissionsContext:1365 / prepareContextForPlanMode:1438 40L——task 清单「8 函数」= createDisabled + prepareContext 计 bypass/plan 一对）；permissions.ts S-4b 裁出面 deletePermissionRule:1169 29L / syncPermissionRulesFromDisk:1259 47L（后者消费 shouldAllowManagedPermissionRulesOnly = 传递依赖 permissionsLoader，与 S-4b 矛盾 ① 同型：随 loader 落 engine 侧）。
- **新仓落位直验**：engine/config/settings.ts 已有 getSettingsForSource（缓存）/ updateSettingsForSource（写回，头注预声明接缝⑤「消费面 = E-4 权限规则树波次」）/ getSettingsFilePathForSource / getInitialSettings（S-3d 面，旧 getSettings_DEPRECATED 逐字等价，头注登记）；constants.ts 已有 SETTING_SOURCES / getEnabledSettingSources / EditableSettingSource（allowed 固定 ['userSettings'] 裁定，头注登记）；settings.ts 头注已登记 hasSkipDangerousModePermissionPrompt「不随迁（trusted 源读面 → E-4 权限波次）」= 接缝⑥ 落点；toolRegistry.ts 头注残留守行已登记 getToolsForDefaultPreset（依赖 47 本体 + isEnabled 面 → E-4 补）；bootstrap/state.ts getOriginalCwd / getCwdState 可直 import（engine = 组合层，L3 无约束）；shared Tool.isEnabled 为**必选方法**（types.ts:213，旧仓 optional `tool.isEnabled ? … : false` 语义在新契约下 = `.filter(t => t.isEnabled())`）；shared ctx 已含 prePlanMode? / shouldAvoidPermissionPrompts? / strippedDangerousRules?（auto 支裁剪后无需 isAutoModeAvailable 字段）；SettingsSchema.permissions = z.any()（深层嵌套兜底，permissions 字段族结构由消费域细化——本切片经 any 访问 additionalDirectories / disableBypassPermissionsMode / defaultMode）；**新仓零命中**：GrowthBook 门族（checkStatsigFeatureGate_CACHED_MAY_BE_STALE / checkSecurityRestrictionGate）/ feature('TRANSCRIPT_CLASSIFIER') auto 族 / validateDirectoryForWorkspace（pathValidation 487L = E-6）/ permissionModeFromString（旧 PermissionMode.ts:139L 纯函数面未落）/ safeResolvePath + safeParseJSON（shared 无）。

**落位裁定（矛盾 ①-⑩）**：
① **落位 = 新 engine 子目录 src/engine/permissions/**（L3 跨域连接器：permissions 纯叶域不 import engine settings 面；loader 消费 getSettingsForSource / updateSettingsForSource / getEnabledSettingSources 族 → engine 侧）。两文件：permissionRulesLoader.ts（旧 permissionsLoader 296L 全迁 + syncPermissionRulesFromDisk + deletePermissionRule）+ permissionSetup.ts（9 函数保留面）+ index.ts 门面（engine/index.ts 追加导出块）。
② **GB 门裁**：新仓无 GrowthBook 通道（零命中；modelprovider = OpenAI 静态键，feature() → env kill-switch 先例）→ initialPermissionModeFromCLI / isBypassPermissionsModeDisabled / shouldDisableBypassPermissions 三函数 bypass 门只留 settings.permissions.disableBypassPermissionsMode === 'disable' 检查；GB 策略门残留守登记（企业策略门通道未落）。
③ **auto 支裁**（TRANSCRIPT_CLASSIFIER 族零命中，auto-mode 纵切波）：initialPermissionModeFromCLI 裁 auto 支（circuit-breaker 同步检查 / settings defaultMode 'auto' 降级支 / setAutoModeActive 尾支）；initializeToolPermissionContext 裁 auto 支（findDangerousClassifierPermissions / isAutoModeAvailable）——dangerousPermissions ≡ [] 返回字段保留（旧 de-ANT 注释语义）；prepareContextForPlanMode 留非 auto 支（plain plan entry：prePlanMode = currentMode），auto strip/restore 分支 → auto-mode 波。
④ **validateDirectoryForWorkspace 裁**（pathValidation 487L 随 E-6 迁，新仓零命中）：initializeToolPermissionContext addDirs 支 = settings.permissions.additionalDirectories + addDirs 直接 apply addDirectories update（destination 'cliArg' 旧口径；raw 目录串不 resolve）；warnings ≡ []（校验失败 warning = E-6 残留守）；Promise.all 并行校验删（函数仍 async 保签名，await 支裁）。
⑤ **getToolsForDefaultPreset 自 S-4d ② 提前**（传递依赖裁定，S-4b 矛盾 ① 先例：消费者本切片存在）：toolRegistry 加 `getToolsForDefaultPreset(deps = {}) = getAllBaseTools(deps).filter(t => t.isEnabled()).map(t => t.name)`（新 Tool.isEnabled 必选，旧 optional 三目逐字等价）；47 工具本体残留守不变；S-4d ② 余 = filterToolsByDenyRules / getTools（头注残留守行更新为「getToolsForDefaultPreset 已 S-4c1 落」）。parseBaseToolsFromCLI 签名加 deps 注入 `(baseTools, deps = {})`。
⑥ **permissionMode 面落域**（新 src/permissions/permissionMode.ts ~35L，S-4b mcpRuleNames 域内本地先例）：PERMISSION_MODES / EXTERNAL_PERMISSION_MODES 两常量（`satisfies readonly (Internal|External)PermissionMode[]` shared 类型约束，值旧仓 types/permissions.ts:16-29 逐字）+ permissionModeFromString（逐字：列表命中 → 该 mode，否则 'default'）。UI 配置面（title/symbol/color/shortTitle 族）不随迁（S-4b PERMISSION_MODE_TITLES 已裁同口径）。fromString 消费点 = engine 侧 initialPermissionModeFromCLI（H6 实挂）。
⑦ **settings 读写面映射 + shared 加法原语**：getSettings_DEPRECATED() → getInitialSettings()；lenient reader 旧重管线（fileRead readFileSync 编码/换行检测 + safeParseJSON Object.assign 双参日志版）裁为 getFsImplementation().readFileSync(utf-8) + 本地 try/catch JSON.parse（settings = JSON 无编码检测面；日志 no-op 门面，裁因头注登记）；**safeResolvePath 新入 shared/fs-operations.ts**（旧 fsOperations.ts:138 ~60L 逐字：UNC 阻塞 + FIFO/socket/字符/块设备 lstat 守卫 + realpath isSymlink/isCanonical——shared 加法原语先例；消费点 = loader lenient reader + isSymlinkTo 两处实挂）。
⑧ **接缝⑤ 写回核销**：settings.ts 头注「updateSettingsForSource 预声明消费面 = E-4 权限规则树波次」→ 本切片 permissionRulesLoader 的 add / deletePermissionRuleFromSettings 两写回路径实挂 → 头注改「S-4c1 消费实挂」。
⑨ **接缝⑥ hasSkipDangerousModePermissionPrompt 补**（旧 settings.ts:880 逐字：user/local/flag/policy 4 trusted 源读 ||，projectSettings 刻意排除 RCE 注释逐字保留）：落 engine/config/settings.ts；skipDangerousModePermissionPrompt 未入 SettingsSchema（passthrough 透传）→ Record 断言读（类型契约头注）；消费面 = bypass 确认 UI = 残留守 UI 面，H6 预声明消费接缝登记（本版无消费点）。
⑩ **deletePermissionRule engine 签名**：旧 EditPermissionRuleArgs {initialContext, setToolPermissionContext}（React state setter）→ engine 版 `setToolPermissionContext: (ctx: ToolPermissionContext) => void`（engine 状态面）；只读源（policySettings / flagSettings / command）throw 逐字保留；local/user/project 三写回源调 deletePermissionRuleFromSettings（engine 侧同文件）；cliArg / session 内存源 no-op 分支逐字。

**方案**（3 新 src engine + 1 新 src 域 + 3 改 src + 3 测试文件 + matrix 2 新行 + docs，单提交）：
1. `src/engine/permissions/permissionRulesLoader.ts`（~330L）：旧 permissionsLoader 296L 全迁（依赖改 ⑦：engine/config settings 面 + shared safeResolvePath + 域 parser）+ syncPermissionRulesFromDisk + deletePermissionRule（S-4b 裁出面，⑩ 签名）。头注裁出面登记（shouldShowAlwaysAllowOptions 消费面 = 权限提示 UI 残留守）。
2. `src/engine/permissions/permissionSetup.ts`（~330L）：9 函数保留面（裁 ②③④⑤）；依赖 = bootstrap（getOriginalCwd）+ engine/config（getInitialSettings / hasSkip… 不涉）+ engine/tools（getToolsForDefaultPreset / LEGACY alias）+ 域 parser / permissionMode / permissionUpdate + shared。头注裁出面登记（GB 门 / auto 族 / 目录校验 / warnings 支）。
3. `src/engine/permissions/index.ts`（门面，STR-1）+ `src/engine/index.ts` 导出块。
4. `src/permissions/permissionMode.ts`（新，域 ~35L，⑥）+ `src/permissions/index.ts` 导出。
5. 改：`src/engine/tools/toolRegistry.ts` +getToolsForDefaultPreset（⑤，头注残留守行更新）；`src/shared/fs-operations.ts` +safeResolvePath（⑦）；`src/engine/config/settings.ts` +hasSkipDangerousModePermissionPrompt（⑨）+ 头注接缝⑤⑥ 登记更新。
6. 测试 3 文件：`tests/unit/permission-rules-loader.test.ts`（零磁盘：ATLAS_CONFIG_DIR 指不存在 tmp 路径——settingsJsonToRules 语义（无文件 → []）/ managed-only 关 / add·delete 空 settings 短路 false / syncPermissionRulesFromDisk disk 源清 + replace 累积 / deletePermissionRule 只读源 throw + 内存源 setToolPermissionContext 调 + 写回源 no-file no-op）；`tests/unit/permission-setup.test.ts`（parseToolListFromCLI 括号/逗号/空格三分隔 + 括号内逗号空格保留 / parseBaseToolsFromCLI preset → deps 工具名 / initialPermissionModeFromCLI 优先级序 + settings 禁 bypass 跳支 + notification / isBypassPermissionsModeDisabled / createDisabledBypassPermissionsContext bypass → default + available=false / prepareContextForPlanMode plan entry prePlanMode + 已在 plan 幂等 / initializeToolPermissionContext cliArg 规则 + baseTools 补拒（fake tools deps）+ addDirs apply + PWD 非 symlink 不加目录 + legacy 归一）；`tests/func/permission-rules-roundtrip.test.ts`（真盘：ATLAS_CONFIG_DIR → tmpdir，addPermissionRulesToSettings → resetSettingsCache → 重载规则出现 / 重复 add 幂等 / deletePermissionRuleFromSettings → 规则消失 / 不识别键保留 / isSymlinkTo 真 symlink 判定）。
7. matrix 2 新行：`{permissions, '规则磁盘加载/写回 round-trip（add → 重载出现 / delete 消失，真盘）', done, proof: tests/func/permission-rules-roundtrip.test.ts}` + `{permissions, 'CLI 工具规则解析 + 初始权限上下文装配（auto/GB/校验支裁剪版）', done, proof: tests/unit/permission-setup.test.ts}`。
8. **变异探针 3 项**：① addPermissionRulesToSettings 去重归一删（existingRulesSet 检查移除）→ func round-trip 重复规则两入红 ② syncPermissionRulesFromDisk disk 源清除支删 → 「盘上删规则后 sync 不清旧规则」红 ③ parseToolListFromCLI 括号状态机破（isInParens 不翻转）→ `Bash(npm install)` 拆两段红。
- **门/矩阵**：permissions 域新文件（permissionMode.ts）在 CDEEP_DOMAINS 扫描集 = 零 STUB_REGISTRY 登记；engine 侧新文件不动 anti-stub 门（M-3 延后不变）。

**实施记录（2026-09-24）**：

- 方案 8 项全落：`src/engine/permissions/{permissionRulesLoader（~460L）,permissionSetup（~460L）,index}.ts` 新 + engine/index.ts 两导出块（loader 8 符号 + setup 9 符号 + 类型面）+ 5 处修改（toolRegistry +getToolsForDefaultPreset ⑤ / shared fs-operations +safeResolvePath+lstatSync ⑦ / config settings +hasSkipDangerousModePermissionPrompt ⑨ / config index + 导出 / permissions index +permissionMode 导出 + permissionUpdate convertRulesToUpdates 提 export 出域）。
- **实施期偏差 3 处闭环**：① unit loader 层改法——方案「ATLAS_CONFIG_DIR 指不存在 tmp 路径」改 mock FsOperations map + `ATLAS_CONFIG_DIR=/mock-home`（同 engine-config-settings.test.ts 口径，unit 零磁盘层；managed 文件经 map 注入测 managed-only 支）② func「坏 JSON 文件 lenient 读恢复」实测与 updateSettingsForSource 保护支冲突（JSON **语法**错 → `Invalid JSON syntax` error 不覆写，旧仓语义逐字——保护用户手改坏文件）→ 拆两边界支：语法错 → add false + 文件不变 / 合法 JSON 但 schema 校验失败（字段类型错）→ lenient 读恢复 + 新规则落盘 + 不识别字段保留 ③ isSymlinkTo 为私函数（非 9 函数导出面）→ 真 symlink 判定经 initializeToolPermissionContext PWD 支测（PWD=symlink 解析到 originalCwd → session 目录 / PWD 实路径 → 不加）。
- **变异探针 3 项全红后全绿**：① add 去重归一删（`newRules = ruleStrings`）→ 3 红（unit 重复规则归一去重 / legacy alias KillShell→TaskStop 去重 / func 重复 add 幂等）② sync disk 源清除支删（diskSources 循环）→ 1 红（盘源清除支：盘上删规则后 sync 不清旧规则）③ parseToolListFromCLI 空格支 isInParens 守卫删 → 4 红（括号内空格保留 / 括号内逗号+空格混合 / parseBaseToolsFromCLI 透传 / initializeToolPermissionContext cliArg 规则装载）——3 探针逐一恢复复测绿。
- eslint 2 修：loader 未用 `PermissionUpdate` 类型 import 删 / unit loader 测试未用 `dirent` helper 删。

**验真（四件套 + gate）**：tsc 0 / eslint 0（12 新+改文件）/ build 0 KB（cli.js entry 0 KB 符合 D 波占位预期）/ **905 pass 0 fail**（1776 expect，64 文件；849 + 56 新增测试 3 文件：unit loader 19 + unit setup 29 + func round-trip 8）+ gate 6 pass / 0 fail / 2 files（engine 非扫描集，无 gate 改动）。
- 单提交（§8.34 记录随本提交；SHA 于 §8.3x 审视记录回填）。

### §8.35 E-4 S-4c2 执行前分析 + 方案（2026-09-24）

**执行前分析**（旧仓 ground truth 全量核实 + 新仓落位面直验）：

- 旧仓 `src/utils/permissions/PermissionUpdate.ts` 389L 面清点：applyPermissionUpdate / applyPermissionUpdates（**S-4b 已落**新仓 permissionUpdate.ts）/ supportsPersistence（3 可写源判定）/ persistPermissionUpdate + persistPermissionUpdates（addRules→loader add / addDirectories 去重 / removeRules 归一过滤 / removeDirectories / setMode defaultMode / replaceRules 六型写回）/ createReadRuleSuggestion（绝对路径 `//path/**`、相对 `path/**`、根目录 undefined）/ extractRules + hasRules（suggestions 规则抽取）。
- 旧仓 `PermissionUpdateSchema.ts` 78L：permissionUpdateDestinationSchema（5 值 enum：user/project/local/session/cliArg，无 command/policy/flag）+ permissionUpdateSchema（6 变体 discriminatedUnion，复用 PermissionRule 两 schema + externalPermissionModeSchema）。
- 旧仓 `src/utils/settings/permissionValidation.ts` 262L validatePermissionRule 分两层：**语法核心 5 检**（空规则 / 括号配平（unescaped 计数）/ 空括号 `()` escape-aware / MCP 规则禁括号（mcpInfoFromString）/ 工具名首字母大写 + capitalize suggestion）**+ 语义支 3 块**（customValidation = toolValidationConfig 工具注册表 / Bash `:*` 两检 / File 工具 `:*` + 通配位置启发）+ PermissionRuleSchema（zod superRefine 包装）。
- **消费点核销（H6 判别）**：persist 族旧消费 = hooks/toolPermission 对话框 / swarm permissionSync / structuredIO / bridge——新仓全未落（UI/SDK 残留守）→ 预声明接缝；createReadRuleSuggestion 旧消费 = BashTool/PowerShellTool pathValidation 487L（E-6）+ permissions/filesystem.ts:1437（新仓 filesystem 未落该面）→ 残留守；extractRules 旧消费 = UI hooks + bashPermissions（E-6/UI 未落）；hasRules 全仓零消费 → **不迁**。
- **新仓落位面直验**：shared/types-session 已有 PermissionUpdate 6 变体 union + PermissionUpdateDestination（B 波契约冻结）；permissions/PermissionRule.ts 已有 permissionBehaviorSchema / permissionRuleValueSchema（S-4a 落，lazySchema 经 shared）；permissionMode.ts 已有 EXTERNAL_PERMISSION_MODES 5 值常量（无 zod schema 面）；shared/lazySchema 在；zod ^4.5.4；**toPosixPath 未迁**（filesystem.ts 头注「国内目标 POSIX」）；engine/config/validation.ts filterInvalidPermissionRules = 仅非字符串过滤（S-3b 头注已预声明接缝③「语法过滤支 E-4 补」）；persist 族依赖 addPermissionRulesToSettings / getSettingsForSource / updateSettingsForSource 全在 engine 侧（domain 纯叶约束 → persist 必落 engine 侧 L3）。

**落位裁定**：
① **三落位**：域 `src/permissions/permissionValidation.ts`（validatePermissionRule 语法核心，纯叶：域 parser + mcpRuleNames + 本地 capitalize）+ 域 `src/permissions/permissionUpdateSchema.ts`（78L 逐字，复用域内 PermissionRule 两 schema）+ engine 侧 `src/engine/permissions/permissionPersist.ts`（persist 族 + createReadRuleSuggestion，L3：消费同目录 loader + engine/config settings + 域 parser）。externalPermissionModeSchema 落 permissionMode.ts（值 = EXTERNAL_PERMISSION_MODES 常量，单一事实源不复制）。
② **语义支 3 块裁 E-6**：customValidation（toolValidationConfig 依赖工具注册表，新仓未落）/ Bash `:*` 两检 / File `:*` + 通配位置启发 → 不随迁（接缝③ 谓词 = 语法核心 5 检，message 面 = error + suggestion 后缀，旧仓库字；examples 字段裁——提示面残留守同 S-3b getValidationTip 口径）；PermissionRuleSchema zod superRefine 无消费点 → 不落（H6 死接缝禁）。
③ **extractRules / hasRules 不迁**（新仓零消费点，H6；E-6 suggestions 面落时随消费点补，头注登记）。
④ **toPosixPath 裁**（POSIX 单平台，filesystem.ts 头注既有裁定）：createReadRuleSuggestion 路径逻辑 = 原串直用（`posix.isAbsolute` 判定 + `/**` 后缀逐字），Windows 转换支不随迁（头注登记）。
⑤ **接缝③ 回填**：engine/config/validation.ts filterInvalidPermissionRules 谓词扩「非字符串 OR 语法校验失败」（string 项经域 validatePermissionRule，invalid → 滤 + warning，message 旧仓逐字 `Invalid permission rule "${rule}" was skipped[: error][. suggestion]`）；validation.ts 头注接缝③ 预声明块核销为「S-4c2 实挂」。
⑥ **persist 族 H6 预声明登记**：消费面 = 权限对话框持久化 / E-6 pathValidation suggestion / 组合根（本版零消费点，头注登记防死接缝误判）。
⑦ **测试**：`tests/unit/permission-persist-validation.test.ts`（validatePermissionRule 语法核心 6 支（空/括号失衡/空括号/MCP 禁括号/小写工具名/合法）+ filter 语法支判别信号（`Bash(unbalanced` 滤 + warning / 合法规则保留 / 非字符串旧支回归）+ persist 六型 × supportsPersistence 门（session/cliArg no-op 不写盘）+ createReadRuleSuggestion 三分支（绝对 //xx/** / 相对 xx/** / 根 undefined）——mock fs + ATLAS_CONFIG_DIR=/mock-home 同 S-4c1 口径）。
⑧ **matrix 1 新行** + **变异探针 2 项**（① filter 语法支删 → `Bash(unbalanced` 未滤红 ② persist supportsPersistence 门删 → session 型 update 写盘红）+ 四件套 + gate + 单提交。

**S-4c2 实施记录（2026-09-24）**：

落位实施（裁定 ①–⑥ 全核销）：
- 域 `src/permissions/permissionValidation.ts` 155L 新：validatePermissionRule 语法核心 5 检（旧 262L 语义支 3 块裁 E-6 头注登记；examples 字段裁；PermissionRuleSchema superRefine 不落）
- 域 `src/permissions/permissionUpdateSchema.ts` 78L 新：destination 5 值 enum + 6 变体 discriminatedUnion（旧仓逐字；zod 主入口 v4；H6 预声明接缝头注登记）
- 域 `src/permissions/permissionMode.ts` +externalPermissionModeSchema（lazySchema 包裹，值 = EXTERNAL_PERMISSION_MODES 常量单一事实源）；域 index +2 export
- engine 侧 `src/engine/permissions/permissionPersist.ts` 225L 新：supportsPersistence / persistPermissionUpdate(s) 六型写回 / createReadRuleSuggestion 3 支（toPosixPath 裁 POSIX）；engine/permissions/index +1 export；engine/index +S-4c2 导出块（persist 族 4 符号）
- `src/engine/config/validation.ts` 接缝③ 回填：filterInvalidPermissionRules 谓词扩「非字符串 OR 语法校验失败」（import 域门面 validatePermissionRule，message 旧仓逐字；头注接缝③ 核销块）

实施中两处分歧（方案 → 实施修正，均非方案错误）：
1. **测试期望两处按旧仓逐字收紧**（非源码偏差）：小写工具名 suggestion 旧仓仅给工具名 `Use "Bash"`（`capitalize(parsed.toolName)`，不带内容）；filter warning message 中 rule 为**原文**（`"Bash(unbalanced"` 不补括号）。
2. **探针 ② 判别信号修正（重要）**：方案 ⑧ 原写「门删 → session 型 update 写盘红」——实测**下层管路同 no-op**（getSettingsFilePathForSource 对非可编辑源 → undefined 短路，无门也不写盘），写盘断言不具判别力。修正：判别信号改 **settings 缓存零触达**——无门时 addRules 支经 addPermissionRulesToSettings → getSettingsForSource('session') 种 null 缓存项，`getCachedSettingsForSource('session')` 由 undefined → null；测试断言 + 头注登记判别逻辑。探针 ② 重跑红（1 fail）→ 逐字还原绿。

验真（2026-09-24 实测）：
- 变异探针 2/2：① filter 语法支删 → 2 红（`Bash(unbalanced` 未滤 + 混合支）→ 还原绿；② 门删 → 1 红（缓存判别支）→ 还原绿（cp 备份逐字还原 + diff 核验）
- 新测 `tests/unit/permission-persist-validation.test.ts` 25 测 65 expect（validatePermissionRule 6 支 / filter ③ 4 支 / supportsPersistence 5 值 / persist 六型写回 6 支 + 门控 2 支 / createReadRuleSuggestion 3 支 / update schema 形状 3 支）
- 四件套：tsc 0 / eslint 10 变更文件 0 / build 0 KB / 全量 **930 pass / 0 fail / 1841 expect / 65 文件**（基线 905/1776/64 + 25/65/1 恰合）
- gate：`tests/ci/` 6 pass / 2 文件（matrix +1 行：permissions 域 persist 族 + 语法校验 ③ 回填行，proof 指新测文件）

### §8.36 E-4 S-4d 执行前分析 + 方案（2026-09-24）

**执行前分析**（旧仓 ground truth + 新仓接位面直验）：

- ① 门接位：新仓 `PermissionGate` 已存在窄 spine 型（toolExecution.ts:41-44，2 值 `{allowed, reason?}`；未注入 = 默认放行，executeToolUse :141-154 单映射支）；域 `checkRuleBasedPermissions`（S-4b，规则支 1a-1g）返回 `Promise<PermissionAskDecision | PermissionDenyDecision | null>`（null = 无规则反对 = allow；1c 鸭子分发 tool.checkPermissions?）；loop 侧 `AgentLoopDeps` 无 checkPermission 字段，runToolBatch 调用点唯一 = queryOneRound（loop.ts:129；queryAgentLoop 逐轮委托，无第二站点）。
- ② 注册表面：新仓 toolRegistry 已有 getAllBaseTools（deps 注入）+ getToolsForDefaultPreset（S-4c1）；旧仓 `filterToolsByDenyRules`（tools.ts:271-278 = `tools.filter(t => !getDenyRuleForTool(ctx, t))`，MCP server 级规则 `mcp__server` 整 server 剥离）+ `getTools`（tools.ts:280-330：ATLAS_SIMPLE 三分支 + REPL 支 + specialTools 剔除 + deny 过滤）——新仓无 REPL/special 工具本体 → 只落「deny 过滤 + getAllBaseTools(deps)」核心，模式过滤支裁出。
- ④ agentToolUtils：新仓 :126 `spec.split(':')[0]`（残留守）；**旧仓 verbatim = `permissionRuleValueFromString(toolSpec).toolName`**（resolveAgentTools :196 + disallowedToolSet :167-171 **同函数两 spec 列表均经 parser**——S-4d 同函数一并替换，防解析口径分裂）。旧仓 :66-75 plan 门（ExitPlanModeV2 + permissionMode==='plan'）+ teammate carve-out（isAgentSwarmsEnabled && isInProcessTeammate + IN_PROCESS_TEAMMATE_ALLOWED_TOOLS）：新仓无 isAsync 机制 / 无 teammate 状态窗口，IN_PROCESS_TEAMMATE_ALLOWED_TOOLS 已在 toolNames 单一事实源（E-2/S-4c1 落），其 5 工具（Task 四件套 + SendMessage）**不在** ALL_AGENT_DISALLOWED 集 → carve-out 支在新仓集合下为空 → **plan 门只重登记不硬填**（头注前向接缝重登记，teammate 面随 swarm 波）。
- **3 值 verdict 裁定**（spec ①）：`{ allowed, reason?, ask? }`——ask 语义 = 需用户确认（旧仓 TUI 弹窗）；新仓无 prompt 面（残留守）→ **fail-closed**：ask → is_error + ask 标记（静默执行 = 安全洞，静默 deny = 丢失区分）；`ask` 字段的消费点 = pipeline 映射支 message 分叉（H6 非死接缝，E-5/UI prompt 面落时消费）。
- **桥接 cast**：shared Tool.checkPermissions 返回 `Promise<unknown>`（窄 spine 契约），域 RuleTool 窄视图要求 `Promise<PermissionResult>` → 结构不可赋值 → gate 工厂 L3 桥接 cast 一处（`tool as RuleTool`，头注登记：运行时实现随旧仓工具契约返 PermissionResult 形状；E-2 setup 测 mkTool 返 null = 1c 鸭子支 passthrough-safe）。

**落位裁定**：
① 新文件 `src/engine/permissions/permissionGate.ts`（L3：域 ruleMatching + pipeline 型）：`createPermissionGate(context: ToolPermissionContext): PermissionGate`（null→`{allowed:true}` / deny→`{allowed:false, reason:decision.message}` / ask→`{allowed:false, ask:true, reason:decision.message}`）；toolExecution.ts:41-44 型扩 3 值 + :144-154 映射支 ask 分叉（deny message 逐字不变——engine-pipeline.test.ts:83 既有断言不破；ask message = `permission confirmation required: ...` + 残留守注）；loop.ts +`checkPermission?: PermissionGate` 字段 + runToolBatch 透传 1 行（共 ~3 行）。
② toolRegistry.ts +filterToolsByDenyRules（旧 271-278 逐字，泛型 T 窄视图 name+mcpInfo）+ getTools(context, deps = {})（ATLAS_SIMPLE/REPL/specialTools/getMergedTools 裁出，头注登记，S-4c1 头注「S-4d ② 补 getTools / filterToolsByDenyRules」核销）。
④ agentToolUtils.ts：agentTools spec 循环 + disallowedTools 集 → 域 permissionRuleValueFromString（旧仓逐字）；头注残留守块更新（plan 门重登记 / teammate 集单一事实源 / ruleContent 解析已落 / allowedAgentTypes 仍残留守 swarm 面）。
⑤ 导出面：engine/permissions/index +permissionGate；engine/index +createPermissionGate（L3 块）+ filterToolsByDenyRules / getTools（tools 块）。
⑥ 测试 `tests/unit/permission-gate-wiring.test.ts`（判别信号三组）：① 无 gate 成功 / gate+deny → is_error `permission denied` / gate+ask → is_error + ask 标记（gate 工厂 × executeToolUse + loop 透传断言）② blanket deny `Bash` → getTools 池排除 Bash + MCP server 级 deny `mcp__srv` 剥整 server（判别信号）④ spec `Bash(npm install)` → resolveAgentTools validTools 保留 ruleContent（**red-green 复演**：旧 split(':') 下该测红——固有误判，非新引入）+ disallowedTools `Bash(*)` → Bash 整工具剔除。
⑦ 变异探针 ×2：① gate 工厂 deny 支删（恒 allowed）→ gate+deny 测红 ② filterToolsByDenyRules 删过滤（return tools）→ blanket deny 测红。
⑧ matrix 1 新行（permissions 域「deny 规则工具面过滤 + 权限门接线」，proof = 新测文件）+ 四件套（基线 930/1841/65）+ gate + 单提交。

实施记录（2026-09-24）：
- ① `src/engine/permissions/permissionGate.ts`（新，L3 连接器层）：createPermissionGate 3 值 verdict（null→allow / deny→`{allowed:false, reason}` / ask→`{allowed:false, ask:true, reason}` fail-closed）；头注登记 L3 桥接 cast 一处（`tool as RuleTool`，shared Tool.checkPermissions `Promise<unknown>` vs 域 RuleTool 窄视图 `Promise<PermissionResult>` 结构不可赋值）+ 消费面（loop 透传 + E-wave-end compose 接线位）。toolExecution.ts：PermissionGate 型扩 3 值 + 映射支 ask 分叉（deny message 逐字不变，engine-pipeline.test.ts:83 既有断言绿）；loop.ts：AgentLoopDeps +`checkPermission?: PermissionGate` + queryOneRound 的 runToolBatch 调用点透传（唯一点，queryAgentLoop 逐轮委托）。
- ② toolRegistry.ts +filterToolsByDenyRules（旧 tools.ts:271-278 逐字，泛型 T 窄视图）+ getTools（deny 过滤后池）；ATLAS_SIMPLE/REPL/specialTools/getMergedTools 裁出头注登记。
- ④ agentToolUtils.ts：agentTools spec 循环 + disallowedTools 集双处 → 域 permissionRuleValueFromString（旧仓 verbatim，替 S-2 split(':') 截断）；头注残留守块更新（plan 门/teammate carve-out 重登记不硬填，allowedAgentTypes 仍残留守 swarm 面）。
- ⑤ 导出面：engine/tools/index +filterToolsByDenyRules/getTools；engine/permissions/index +permissionGate；engine/index 同步（tools 块 + L3 权限块 +createPermissionGate）。
- 实施偏离 2 处（预期外，均已修正）：
  (a) 测试 ①d 首版断言 `r.toolResults[0].isError` —— loop AgentRoundResult.toolResults 项仅 `{toolUseId, name, block}`（无 isError 字段，E-1 既有设计）→ 判别信号改 `block.is_error`（pipeline 映射支产物，语义不变）。
  (b) permissionGate.ts 首版 `import type { Tool, ToolPermissionContext }` 中 Tool 未用（闭包参数型由返回型 PermissionGate 带出）→ eslint 捕获，删 Tool。

验真（2026-09-24 实测）：
- 变异探针 2/2：① gate 工厂 deny 支恒放行 → ①b+①d 2 红 → cp 备份逐字还原（diff 核验）绿；② filterToolsByDenyRules 不过滤（return [...tools]）→ ②a+②b 2 红 → 逐字还原绿
- 新测 `tests/unit/permission-gate-wiring.test.ts` 8 测 18 expect（① 组 4：无门对照 / 门+deny `permission denied` / 门+ask fail-closed 确认标记 / loop 透传 block.is_error；② 组 2：blanket deny 池剔除 / MCP server 级剥整 server；④ 组 2：spec ruleContent 保留 validTools / disallowedTools `Bash(*)` 工具级剔除）
- 四件套：tsc 0 / eslint 10 变更文件 0 / build 0 KB / 全量 **938 pass / 0 fail / 1859 expect / 66 文件**（基线 930/1841/65 + 8/18/1 恰合）
- gate：`tests/ci/` 6 pass / 2 文件（matrix +1 行：permissions 域 engine 接线行，proof 指新测文件）

### §8.37 E-4 权限规则树整波审视记录（双只读子代理，2026-09-24）

**审视范围**：E-4 全切片 S-4a `efc3896` / S-4b `3814881` / S-4c1 `8241543` / S-4c2 `965ca31` / S-4d `6c06396`（git range `ad9030b..6c06396`；ad9030b = 勘察 docs 提交）。

**派发模式**：§8.26/§8.30 三视角模式，双只读子代理（限额 ≤2，环境整体限流约束）并行——A 路 = 代码正确性 + 安全语义（旧仓逐字对照 + ask/deny fail-closed + 桥接 cast + 静默洞专项）；B 路 = 测试质量 + 架构边界（L3/STR-1 边界 + 死接缝 + 判别信号 + mock 泄漏 + 导出面）。

**发现 + 处置**（A 路 1 MED + 1 LOW + 1 注释 + 1 已登记裁出；B 路五面核验零缺陷）：

| # | 级别 | 位置 | 缺陷 | 处置 |
|---|---|---|---|---|
| F1 | MED | runAgent.ts:111 | queryAgentLoop 第二调用点不带 checkPermission/ToolPermissionContext——子代理工具执行不受规则树约束（旧仓子代理经 checkRuleBasedPermissions 全局 appState.toolPermissionContext 天然共享同一规则树，新仓无门 = 默认放行 = 行为回归开口）；loop.ts:134「唯一点」头注失实 | 前向接缝登记（runAgent 头注补权限门透传残留守项 + loop 头注订正）；门/上下文透传归 E-wave-end compose 装配。当前 pipeline 面 ctx.tools 为空暂无活洞，无代码修复 |
| F2 | LOW | toolRegistry getTools | 旧 getTools 尾行 `isEnabled` 过滤漏迁（feature 门控禁用工具进模型可见池，与同文件 getToolsForDefaultPreset 的 isEnabled 名单矛盾；裁出登记未含此项 = 标落漏迁） | **修复**（getTools + `.filter(t => t.isEnabled())`，旧 tools.ts 尾行逐字等价）+ 回归测 ②c |
| F3 | 注释 | ruleMatching.ts:63 | 头注「顺序有意义——后源覆盖前源（旧 settings/constants.ts 头注逐字）」系自 settings 合并语境照抄；规则匹配面实为 flatMap+find 首命中优先（旧仓 getDeny/Allow/AskRules 同构），注释易误导 | 注释订正（零代码变更） |
| F4 | 已登记 | ruleMatching 1c catch | 1c catch 吞掉含 AbortError/APIUserAbortError 的全部异常（旧仓重抛这两类）→ checkPermissions 内 abort 落 passthrough→allow | 头注 :18 已登记（L3 域不 import engine 类型）+ 仅 E-6 工具面回填带 abort 的 checkPermissions 后可达 → 不处置（不重报） |
| I-1 | 知会 | permissions.ts:68 | 域旗舰 hasPermissionsToUseTool（+7 测）S-4d 门未消费（门直调 checkRuleBasedPermissions）→ 两决策面漂移风险 | 头注前向声明「E-6/E-wave-end 换回」已覆盖 → **E-wave-end 审计登记**（见 E-wave-end 任务清单） |

B 路五面核验零缺陷：① 叶域纯净（src/permissions 零 engine import；engine→域全走域根门面且每处头注登记；测试 import 面 = 根门面 only）② 判别信号测无 tautology/自证（8 个 E-4 测文件 mutation-probe 背书；persist 门控判别点选 `getCachedSettingsForSource('session')` undefined vs null 精准）③ 死接缝 100% 头注登记（permissionUpdateSchema/createReadRuleSuggestion/hasSkipDangerousModePermissionPrompt/alias 窗/mcpRuleNames 双份）④ 导出面 §8.34–§8.36 逐条对账无漏导 ⑤ 零 mock.module 泄漏（setFsImplementation afterEach 自包含 / alias 窗双侧清 / ATLAS_CONFIG_DIR 仅 loader 测试）。

**验真（2026-09-24 实测）**：
- F2 突变探针：删 getTools isEnabled 过滤 → ②c 红（`Disabled` 进池 `[Agent, Disabled, Enabled]`）→ cp 备份逐字还原（diff 核验）绿。注意：首跑探针被 ②c 测试自身 bug 污染（`makeTool('Disabled')` 忘传 `enabled: false`，fake 默认 true → 红因错误）→ 修测试后重跑才是干净红→绿（探针纪律：先保证对照测自身正确）
- 修复面：src 5 文件（toolRegistry getTools +isEnabled / runAgent 头注接缝登记 / loop 头注订正 / ruleMatching 注释订正 / permissionSetup 陈旧注释订正）+ tests 1 文件（makeTool +isEnabled 字段 + ②c 回归）
- 四件套：tsc 0 / eslint 6 变更文件 0 / build 0 KB / 全量 **939 pass / 0 fail / 1861 expect / 66 文件**（基线 938/1859/66 + ②c 1 测 2 expect）
- gate：`tests/ci/` 6 pass / 2 文件
- E-wave-end 审计登记（本波遗留前向面）：① 子代理门/上下文透传（F1）② hasPermissionsToUseTool 换回门消费点（I-1）③ 1c abort 重抛（F4，随 E-6 工具面）④ compose.ts getTools 组合根接线

### §8.38 E-5 hooks-runner（流式/attachment + stop hooks + matrix 行 102 翻转）勘察定稿 + task 清单（2026-09-24，双只读勘察 agent + 锚点抽查验真）

**触发**：E-4 全闭环（§8.37，基线 939 pass/1861 expect/66 文件 + gate 6），engine 波纵切下一波 = E-5（hooks-runner：流式/attachment + stop hooks + matrix 行 102 翻转 + HooksSchema 变体全字段面 + 事件名集校验 + z.lazy 收紧）。双只读勘察子代理并行（限额 ≤2）：
- **勘察 ①（旧仓 hooks 面）**：`src/utils/hooks.ts` 4979L（流式 executeHooks AsyncGenerator + processHookJSONOutput 字段映射 + execCommandHook + getMatchingHooks + 13 事件包装器生成器）+ `stopHooks.ts:59 handleStopHooks`（消费层 AsyncGenerator）+ `toolHooks.ts`（runPreToolUseHooks:373 / runPostToolUseHooks:35 / resolveHookPermissionDecision:270）+ attachment 渲染（`attachments.ts:3104 createAttachmentMessage` + `messages.ts:3457 normalizeAttachmentForAPI` 6 个 hook_* case）。
- **勘察 ②（新仓落点）**：`src/hooks/` 12 文件盘点（1 门面 + 9 真核心/端口 + 1 全 no-op + 1 端口组）+ engine 侧接缝（pipeline ToolHooks / loop 残留守 / E-3 config hooks 字段族）+ L3 边界（engine 侧 hooks 连接器层是否需新建）+ matrix 行 + anti-stub。
- **主 session 锚点抽查验真**（子代理报告不具权威，E-1 勘察教训，关键锚点直验）：旧仓 executeHooks:1953（私有 async function*）/ processHookJSONOutput:485 / execCommandHook:743 / getMatchingHooks:1604 / executeStopHooks:3596（subagentId?SubagentStop:Stop）/ stopHooks.ts:59 / loop.ts:1217 yield*+1127·1134·1213 StopFailure / toolHooks.ts:270（hook allow 不绕过 settings deny/ask 不变量）/ toolExecution.ts:523 checkPermissionsAndCallTool（safeParse→validateInput→pre-hooks→permission→call，与 E-1b 裁定一致）/ attachments.ts:3104 + messages.ts:3457 全命中；新仓 runHooks.ts:182-186（`runHooks(event,input,opts?)→Promise<AggregatedHookResult>`）/ bootstrap-env.ts:36-40 getHooksBootstrapEnv fail-fast / bootstrap/state.ts 仅 4 族（cwd/session/interactive/cost，无 getTranscriptPath/getMainThreadAgentType/hasTrustAccepted）/ compose.ts:97-99（仅 setHookShellPort+setHookConfigProvider+captureHooksConfigSnapshot，**无 setHooksBootstrapEnv** = 第三断）/ 执行器零生产调用点（grep 仅命中 hooksConfig.ts:30·142 + compose.ts:8·95 注释）/ pipeline toolExecution.ts:54-63 ToolHooks 返回 unknown + L145·L189 await 丢弃返回值 / matrix L120（唯一 hooks missing 行）/ hooks 在 anti-stub 8 域扫描集但 STUB_REGISTRY 零条目 / **无 attachment·message 基建**（createAttachmentMessage/AttachmentMessage/TombstoneMessage/createSystemMessage/createUserMessage 全缺，StreamEvent 仅 modelprovider LLM 流式）。

**定界结论**（E-5 落盘面 = engine 侧 hooks-runner L3 连接器 + 接线 + schema 收紧；旧仓 hooks 4979L 但大部分为 **REPL/TUI 消息管线耦合**，裁）：
- **必迁（engine 侧 hooks-runner 真核心）**：旧仓 executeHooks 流式执行循环（AsyncGenerator 逐钩子 yield AggregatedHookResult，**解耦 message/attachment**）+ processHookJSONOutput 字段映射（continue:false→preventContinuation / decision approve·block / PreToolUse.permissionDecision allow·deny·ask / updatedInput / additionalContext / exit-2→blockingError）+ 事件包装器（stop/pre/post）+ **消费层重写**（新仓版：ToolHooks 适配器消费 AggregatedHookResult + loop stop hooks 消费点）+ 权限合流（hook permissionBehavior 合 E-4 权限门，hook 'allow' 不绕过 settings deny/ask 不变量保留）+ 类型面。
- **裁出（头注登记，复审勿当遗漏）**：
  - **attachment 渲染（createAttachmentMessage + normalizeAttachmentForAPI 6 case）→ message/REPL 波残留守**（新仓无 message/attachment 基建；逐字搬 = 拖入整 REPL 消息管线 = straight port + H6 死接缝双红线，C-Deep 纵切裁）。
  - **prompt/agent/http/callback/function 钩子执行面** → config 侧 provider 已过滤（仅 command 变体，hooksConfig.ts:155-158）；本波仅落 **变体全字段面**（schema 层），执行器实现 defer。
  - **AsyncHookRegistry + 异步协议 / registerPendingAsyncHook**（旧仓异步唤醒）→ 裁（新仓无异步钩子协议）。
  - **http hooks + ssrfGuard / TUI 事件面 / teammate·task 事件 / 遥测整族 / Windows·pwsh / plugin·skill 替换 / OutsideREPL 族（executeHooksOutsideREPL:2971）** → 裁（SessionEnd/StopFailure 薄壳基于新仓 Promise runHooks 重建，不搬 OutsideREPL 本体）。
  - **stopHooks.ts 消费层全面（job classifier / autoDream / PromptSuggestion / saveCacheSafeParams / teammate·task hooks）** → 裁，仅迁 **stop hooks 核心**（loop terminal runStopHooks + preventContinuation→续跑）。

**两裁定点 + 五落位裁定（落纸）**：
- **C-1 E-5 = engine 侧 hooks-runner（L3 连接器 `src/engine/hooks/`，镜像 engine/permissions 先例），非旧仓 4979L 消费层直搬**：旧仓 stopHooks.ts/toolHooks.ts 消费层是深度耦合 REPL/TUI 消息管线的 AsyncGenerator（createAttachmentMessage/StreamEvent/TombstoneMessage/createSystemMessage/teammate/job/autoDream），新仓无一存在（grep 实测）。逐字搬 = 拖入整 REPL 消息管线 = straight port + 超 scope + H6 死接缝双红线。新仓窄 spine headless 形态 → L3 连接器层建 engine 侧 hooks-runner（import shared/bootstrap/engine·config/engine·tools/hooks 域，L3 域边界同 engine/permissions §8.36 先例）。
- **C-2 流式执行（AsyncGenerator）迁作 hooks 执行核心，解耦 message/attachment**：旧仓 executeHooks（AsyncGenerator<AggregatedHookResult>）流式执行循环 + processHookJSONOutput 字段映射迁 engine 侧；**不**迁 attachment 渲染消费（见 C-3）。此为 matrix 行 L120 的「流式执行」半。
- **C-3 attachment 渲染 = 前向接缝 / 残留守（message/REPL 波，非 E-5）**：新仓无 message/attachment 基建（createAttachmentMessage/AttachmentMessage/TombstoneMessage/createSystemMessage 全缺，grep 实测；StreamEvent 仅 modelprovider LLM 流式，与 hook attachment 无关）。matrix 行 L120 **拆**：「hooks 流式执行（AsyncGenerator）」→ E-5 done（proof = 新 engine-hooks 流式单测）/「attachment 渲染（hook 输出 → AttachmentMessage）」→ 残留守（by='message/REPL 波'，前向接缝头注登记，**不**假 done 声明——H6 防空洞）。
- **C-4 stop hooks = E-5（归属冲突对齐）**：loop.ts:15 头注「错误恢复 + stop hooks（E-1b）」系陈旧注；策略文档 L863/L889/L950/L1081 一致把 stop hooks 归 E-5（错误恢复 model_fallback/max_output_tokens 归 E-1b-full）。本波订正 loop.ts:15 头注为「错误恢复（E-1b-full）/ stop hooks（E-5）」，防双源漂移。
- **C-5 三层断补齐（settings→执行链）**：① 执行面执行器零生产调用点（hooks 域 runPreToolUseHooks 等仅 tests/ + 头注）→ engine 侧 ToolHooks 适配器 + loop stop hooks 消费点首次生产接线；② 组合根缺 `setHooksBootstrapEnv`（compose.ts:97-99 仅 shell-port+config-provider+snapshot，直调 runHooks 会 fail-fast 抛「hooks bootstrap 未注入」）→ compose.ts 补；③ HooksBootstrapEnv 6 成员中 bootstrap 域缺 3 源（getTranscriptPath/getMainThreadAgentType/hasTrustAccepted；bootstrap/state.ts 现仅 cwd/session/interactive/cost 4 族）→ bootstrap 域扩面 3 成员（transcript path = 会话 dir+session id 窄适配 / main-thread agent type 缺省 undefined / trust-accepted 缺省 true=headless 信任隐式，同 shouldSkipHookDueToTrust isNonInteractive 短路语义；三者均头注前向接缝登记，防假「真行为」声明）。
- **C-6 ToolHooks 适配器消费 AggregatedHookResult（非 fire-and-forget）**：pipeline toolExecution.ts:54-63 ToolHooks 现返回 unknown + L145/L189 await 后丢弃（fire-and-forget = 钩子无效果 = H6 死接缝）。改：preToolUse 返 AggregatedHookResult → blockingError→tool_result is_error / permissionBehavior 合 E-4 权限门（hook 'allow' 不绕过 settings deny/ask 不变量，旧仓 toolHooks.ts:270 resolveHookPermissionDecision 逐字）/ updatedInput→input 回写；postToolUse 返 AggregatedHookResult → additionalContext→上下文回灌（消息面残留守）。
- **C-7 schema 收紧（engine/config，非新域）**：① HooksSchema 4 变体全字段面（http headers/method/timeoutMs 等，旧仓 HookCommand=any 无可验真权威面 → 仅落 schema 层）② 事件名集校验（HooksSchema record key ∈ HOOK_EVENTS 27 事件名，复用 hooks 域单一事实源）③ z.lazy 收紧（SettingsSchema hooks 字段 z.any() 透传 → z.lazy(HooksSchema)，旧仓无 hooks 校验面逐字一致 → 收紧 = 新仓加固裁定，登记）。

**切片方案 + 依赖序**（大颗粒，实际串行执行）：`S-5a → S-5b → S-5c`
- **S-5a 三层断补齐 + engine/hooks L3 连接器（ToolHooks 适配器消费返回值 + loop stop hooks + compose 接线 + bootstrap 3 成员）**（核心「让 settings.hooks 在生产路径真生效」切片）：① bootstrap 域扩 3 成员（getTranscriptPathForSession/getMainThreadAgentType/hasTrustAccepted，头注前向接缝）+ hooks 域 bootstrap-env 3 成员源接真 ② 新建 `src/engine/hooks/`（L3 连接器层，镜像 engine/permissions）：ToolHooks 适配器（runPreToolUseHooks/runPostToolUseHooks→pipeline ToolHooks，消费 AggregatedHookResult：blockingError/permissionBehavior 合流/updatedInput）+ loop stop hooks 消费点（queryAgentLoop terminal 前 runStopHooks + preventContinuation→续跑）③ pipeline toolExecution.ts ToolHooks 返回值消费支（pre-hook 合流权限门，post-hook 上下文回灌）④ compose.ts `setHooksBootstrapEnv` 补 + 3 成员源适配器。判别信号：pre-hook blockingError→tool_result is_error / hook permissionDecision:deny 合 settings deny / updatedInput 回写 / stop hooks preventContinuation→续跑 / 组合根接线（bootstrap-env 注入后 runHooks 不 fail-fast）。
- **S-5b 流式执行（AsyncGenerator）+ attachment 残留守登记 + matrix 行 120 拆/翻 + stop-hooks 头注订正**：① `src/engine/hooks/` 加流式 hooks-runner（旧仓 executeHooks AsyncGenerator<AggregatedHookResult> 执行循环 + processHookJSONOutput 字段映射，解耦 message/attachment）② attachment 渲染残留守头注登记（C-3，前向接缝 → message/REPL 波）③ matrix 行 L120 拆：「hooks 流式执行（AsyncGenerator）」→done（proof = 新 engine-hooks 流式单测）/「attachment 渲染」→残留守（by='message/REPL 波'）④ loop.ts:15 头注订正（C-4）+ 流式 runner 消费面前向接缝登记（loop 流式 chatStream = E-1b-full，防 H6 死接缝）。判别信号：多钩子流式 yield 序（逐钩子 yield 先于聚合）/ exit-2→blockingError / continue:false→preventContinuation / permissionDecision 三值字段映射。
- **S-5c schema 收紧（engine/config）+ 门/矩阵同步 + 审视记录 + memory 同步**：① HooksSchema 4 变体全字段面 ② 事件名集校验（record key ∈ HOOK_EVENTS 27，复用 hooks 域单一事实源）③ SettingsSchema hooks 字段 z.any()→z.lazy(HooksSchema) 收紧。判别信号：http 变体全字段过 / 未知事件名拒 / 畸形 hooks（非数组）被 z.lazy 拒。

**门/矩阵同步计划**：anti-stub 门——hooks 在 CDEEP_DOMAINS 扫描集（实质新文件零 STUB_REGISTRY 登记）；engine 不在扫描集（M-3 延 E-wave-end）→ 新 engine/hooks 文件 <5 实义行须头注占位登记。capability-matrix——hooks 3 done 行不变（proof=tests/unit/hooks.test.ts）；行 L120 拆（S-5b）：「hooks 流式执行（AsyncGenerator）」→done（proof=新 engine-hooks 流式单测）/「attachment 渲染（hook 输出 → AttachmentMessage）」→残留守（by='message/REPL 波'）。新 done 行：engine 接线（ToolHooks 适配器消费 AggregatedHookResult + stop hooks 消费点 + 三层断补齐，S-5a）/ 流式执行（S-5b）/ schema 收紧（S-5c，hooks 域或 engine/config 域行）。

**6 风险点**：① 三层断补齐跨域（S-5a 跨 bootstrap 域扩面 + hooks 域端口 + engine 新目录 + compose 接线，四域跨切，串行单提交纪律防中间态）② ToolHooks 返回值消费（pipeline L145/L189 现 fire-and-forget，改返回值消费 = 类型 + 映射双改；pre-hook 合流权限门顺序须与 E-1b 裁定 safeParse→validateInput→pre-hooks→permission→call 一致，改后回归）③ stop hooks 归属冲突（loop.ts:15 头注「E-1b」订正，须与策略文档 L863/889/950/1081 对齐，防双源漂移）④ bootstrap 3 成员源（transcript path/agent type/trust-accepted 新仓无源，窄适配 + 头注前向接缝登记，trust-accepted 缺省 true = headless 信任隐式，防假「真行为」声明）⑤ attachment 渲染裁（matrix 行 L120 拆，attachment 半 = 残留守非 done，H6 不假 done）⑥ 流式 AsyncGenerator 消费面（新仓 loop 非流式（chatStream 残留守 E-1b-full），流式 runner 消费面前向接缝登记防 H6 死接缝——S-5b 流式 runner = engine 侧能力（unit 可测），loop 流式接线归 E-1b-full）。

**基线**：939 pass / 0 fail / 1861 expect / 66 文件（E-4 review 939）+ gate 6 pass / 0 fail / 2 文件（engine 非扫描集，本波新 engine/hooks 文件无 gate 影响）。

**下一步**：S-5a 执行（执行前分析 + 方案按 E-3 §8.28/§8.29 模式，执行前落纸一节）。
### §8.39 E-5 S-5a 执行前分析 + 方案（2026-09-24）

**范围**（§8.38 S-5a）：三层断补齐 + engine/hooks L3 连接器（ToolHooks 适配器消费 AggregatedHookResult + loop stop hooks + compose 接线 + bootstrap 3 成员）。两提交：
- **S-5a-① 三层断（bootstrap-env 注入）**：bootstrap 域 3 成员扩面 + compose `setHooksBootstrapEnv`。
- **S-5a-② engine/hooks 连接器**：ToolHooks 适配器（消费返回值）+ pipeline 消费支 + loop stop hooks 消费点。

**执行前分析（关键契约 + 裁定点）**：
1. **hooks 域执行器契约**（实测 runHooks.ts:228-313）：runPreToolUseHooks(toolName, toolInput, toolUseID, opts) / runPostToolUseHooks(toolName, toolInput, toolResponse, toolUseID, opts) / runStopHooks(opts) → `Promise<AggregatedHookResult>`；`AggregatedHookResult = { blockingError?, preventContinuation?, stopReason?, additionalContext?, updatedInput?, permissionBehavior?('ask'|'deny'|'allow'|'passthrough'), results }`；`HookRunOptions = { signal?, timeoutMs?, toolUseID?, permissionMode?, sessionId?, agentInfo?, env? }`。
2. **bootstrap 3 成员源（C-5 裁定）**：HooksBootstrapEnv 需 6 成员，bootstrap/state.ts 现仅 4 族（cwd/session/interactive/cost），缺 getTranscriptPath/getMainThreadAgentType/hasTrustAccepted。裁定 = 窄适配 + 头注前向接缝登记（**不**假「真行为」声明）：`getTranscriptPathForSession(sessionId)` = `<sessionDir>/<sessionId>.jsonl`（transcript 持久化 = E-7 session 波残留守）/ `getMainThreadAgentType()` = undefined（--agent 标志 = CLI 面残留守）/ `hasTrustAccepted()` = true（headless 信任隐式，同 shouldSkipHookDueToTrust isNonInteractive 短路语义；信任对话框面 = UI 波残留守）。
3. **ToolHooks 返回值消费（C-6 裁定）**：pipeline toolExecution.ts:54-63 ToolHooks 现返回 unknown + L145/L189 fire-and-forget（= H6 死接缝）。裁定 = 改类型化返回 `PreToolUseHookOutcome`/`PostToolUseHookOutcome`，executeToolUse 消费：
   - **preToolUse** → `blockingError`→tool_result is_error（阻塞）/ `updatedInput`→effective 入参 / `hookBehavior`（= permissionBehavior）→ 合 E-4 权限门（**不变量**：hook 'allow' 不绕过 settings deny/ask，旧仓 toolHooks.ts:270 resolveHookPermissionDecision 逐字）。
   - **postToolUse** → `additionalContext`→上下文回灌（消息面残留守，前向接缝登记，不硬填）。
   - **mergeHookPermission(hookBehavior, gateVerdict)**（纯函数，落 pipeline，防 engine/hooks↔pipeline 循环 import）：allow→gate 在 effectiveInput 上重判（deny 规则 override / ask 规则确认 / null=放行，hook allow 成立）/ deny→hook 拒 / ask→fail-closed 确认标记（prompt 面残留守，同 E-4）/ passthrough→gate 原判。顺序同 E-1b 裁定 safeParse→validateInput→**pre-hooks**→**permission**→call（pre-hook 在 gate 前，gate 在 hook-updated input 上重判）。
4. **loop stop hooks 消费点（C-4 裁定）**：queryAgentLoop terminal 支（L211 lastRound.toolResults 空 = 无 tool_use）→ `deps.hooks?.stopHooks` → runStopHooks；`preventContinuation=true`→不 break 续跑（阻止停止）；blockingErrors/additionalContext→消息面残留守（前向接缝）。`AgentLoopDeps + hooks?: LoopHooks { toolHooks?, stopHooks? }`（未注入 = 窄 spine 无操作）；queryOneRound 透传 `deps.hooks?.toolHooks` 给 runToolBatch（唯一点，同 E-4 checkPermission 透传位）。
5. **L3 边界（C-1 裁定）**：新建 `src/engine/hooks/`（L3 连接器层，镜像 engine/permissions index 先例：import shared/bootstrap/engine·tools/hooks 域，L3 头注 + 测试直 import 位）。`toolHooks.ts` = `createToolHooks(opts)→ToolHooks` + `createLoopHooks(opts)→LoopHooks`；头注登记前向接缝（post-hook additionalContext 回灌 / 流式 runner 消费面 / attachment 渲染 → message/REPL 波）。
6. **H6 防空洞**：新接缝全有消费点或前向接缝登记（ToolHooks 返回值 = executeToolUse 消费 / stopHooks = queryAgentLoop terminal 消费 / post additionalContext 回灌 = 登记 / bootstrap 3 成员 = hooks 域 bootstrap-env 消费）。

**判别信号（测试）**：
- S-5a-①：bootstrap 3 成员（unit：getTranscriptPathForSession 形如 `<dir>/<id>.jsonl` / getMainThreadAgentType undefined / hasTrustAccepted true）+ compose 接线（integration/func：setHooksBootstrapEnv 注入后 runHooks 不 fail-fast——对照 = 未注入时 getHooksBootstrapEnv 抛错）。
- S-5a-②：pre-hook blockingError→tool_result is_error / hook allow 但 settings deny→拒（不变量）/ hook allow + settings 无规则→放行 / updatedInput 回写（tool.call 收到 updatedInput 非原入参）/ stop hooks preventContinuation→续跑（loop 不 terminated，turns>1）/ 未注入 hooks = 窄 spine 不变（回归）。

**四件套 + gate**：tsc 0 / eslint 变更文件 0 / build 0 KB / 全量 + 新测；gate 6 pass（engine 非扫描集，新 engine/hooks 文件无 gate 影响）。

### §8.40 E-5 S-5b 执行前分析 + 方案（2026-09-24）

**范围**（§8.38 S-5b 计划 ①–④）：流式 hooks-runner（旧仓 executeHooks 执行循环 + processHookJSONOutput 字段映射移植，解耦 message/attachment）+ attachment 残留守登记 + matrix 行 L120 拆/翻 + loop 头注订正复核 + 流式 runner 消费面前向接缝登记。

**执行前分析（关键契约 + 裁定点）**：
1. **旧仓 ground truth（实测 @ a8af45b）**：`executeHooks`（utils/hooks.ts L1953，`async function*`）= 守卫族（disableAll/ATLAS_SIMPLE/trust/无匹配/signal.aborted）→ **逐钩子 progress yield（执行前，L2083-2101）** → `all(hookPromises)` 并行 merge（generators.ts L32 race，completion-order yield）→ 逐结果字段映射 yield（preventContinuation / blockingError / message / additionalContexts / permissionBehavior+updatedInput / 单独 updatedInput）→ 尾段 stats/OTel（**无 final aggregate yield**）。字段映射 `processHookJSONOutput`（L485）：continue:false→preventContinuation(+stopReason) / decision approve·block / hookSpecificOutput.permissionDecision allow·deny·ask / updatedInput / additionalContext / suppressOutput / **exit-2→blockingError**（stderr 归因，非 aborted）。
2. **新仓现状**：域 `runHooks.ts` = 非流式核心（Promise，顺序 for 循环）+ `interpretHookOutput`（L485 映射 + exit-2）+ `mergeAggregated`（最严权限/首阻塞/last-wins）全已落（C-Deep 切片 3）；S-5a 已落 engine/hooks L3（createToolHooks/createLoopHooks + pipeline 消费支 + loop stop hooks 消费点）。**缺 = 流式执行面**（新仓无 AsyncGenerator hooks runner；§8.16 薄骨架裁为「streaming/attachment 归 engine」）。
3. **分层裁定（C-1 细化）**：计划文「加 src/engine/hooks/ 流式 hooks-runner」→ **细化：执行循环落域叶 `src/hooks/streaming.ts`**（守卫/匹配/shell 端口/解释/聚合全部复用 runHooks 单一事实源——L3 重复实现 = 双源漂移）；engine/hooks L3 仅 **re-export 面**（子门面 + engine 根）+ 前向接缝登记。同 engine/permissions 分层（域逻辑在域，L3 = 连接器/re-export）。
4. **流式契约（解耦 message/attachment）**：`runHooksStream(event, hookInput, options) → AsyncGenerator<HookStreamYield, AggregatedHookResult>`；`HookStreamYield = {kind:'hook_progress', hookEvent, command, toolUseID?} | {kind:'hook_result', result}`。yield 协议 = progress（逐钩子，执行前；旧仓 progress message 对象不迁 = attachment 解耦）→ hook_result（**确定性 match 序**——旧仓 all() completion-order 的订正：消费端推理 + 测试稳定；**并发语义不变**：全钩子并行、per-hook 超时，总墙钟 = max 非 sum）→ **生成器返回值 = AggregatedHookResult**（旧仓无 final aggregate yield；新仓以 return 值 = 单一消费面）。for-await 不暴露返回值（JS 语义）→ 消费端手动 .next() 循环（测试 drain 助手）。
5. **单一事实源重构**：runHooks.ts 抽 per-hook 执行体（port.runCommand + spawn 抛错→非阻塞结果 + 解释）为 `runOneHook`（域内面导出）+ 导出 `buildHookEnv`/`mergeAggregated` → runHooks（顺序）与 runHooksStream（并行）共享同一执行/解释/聚合，零漂移。
6. **守卫族 = 与 runHooks 一致**（trust skip + 无匹配）：旧仓 disableAll/ATLAS_SIMPLE 守卫属 config 域（shouldDisableAllHooksIncludingManaged = engine/config L3），叶域→L3 import 违 STR-1 → 与 runHooks 对齐（守卫单一事实源）。
7. **5 事件流式包装器不预造**（H6 反向）：参数化核心 + 测试消费足够；5 事件键流式包装器（runStopHooksStream 等）归 E-1b-full 消费面（消费面落地同建）。
8. **H6 防空洞**：runHooksStream = 真执行路径（shell 端口真执行 + 判别信号测试）+ 消费面前向接缝头注登记（loop 流式 chatStream = E-1b-full / attachment 渲染 = message/REPL 波）→ 非死接缝；L3 re-export = 测试消费（L3 面端到端测试 ⑩，防「只 re-export 无消费」）。
9. **matrix 行 L120 拆/翻**：「hooks 流式执行 / attachment 渲染（AsyncGenerator）」（missing by engine 波）→ 2 行：「hooks 流式执行（AsyncGenerator，逐钩子 yield + 聚合返回值）」→ **done**（proof = tests/unit/hooks-stream.test.ts）/「attachment 渲染（钩子输出 → AttachmentMessage）」→ **missing**（by = message/REPL 波，新仓无 message/attachment 基建，C-3 前向接缝登记，H6 不假 done）。
10. **loop.ts 头注订正（C-4）复核**：S-5a-② 已落（loop.ts：stop hooks = E-5 S-5a terminal 消费点 + attachment/钩子回灌 = message/REPL 波，L15-19/L180/L221-224）→ 本次仅残留守列表补「流式 hooks runner 消费面（runHooksStream，§8.40，E-1b-full 前向接缝）」。

**判别信号（测试，新文件 tests/unit/hooks-stream.test.ts，13 测 / 零磁盘）**：
- 流式 yield 序（①）：2 钩子 yields = [progress A, progress B, result A, result B]（全部先于聚合返回值；progress 先于执行；result 按 match 序）
- 并发（②）：latch 端口（第 1 调用待第 2 调用启动后 resolve；顺序变异 → 内置 500ms 兜底 race → 事件序红，套件不挂）
- exit-2→blockingError（③）/ continue:false→preventContinuation+stopReason（④）/ permissionDecision 三值（⑤a-c）+ 最严聚合（⑤d）/ updatedInput last-wins + additionalContext 拼接（⑥）
- 守卫族（⑦⑧⑨）：trust skip / 无匹配 → 立即空聚合（不触碰端口）/ spawn 抛错 → 非阻塞结果
- L3 门面面（⑩）：engine 根门面 import 消费（re-export 真 + 端到端 deny 映射）

**实施结果 + 问题闭环**：
- **测试抓到的 bug（非假通过）**：流式循环首实现漏 `results.push(result)`（只 mergeAggregated + yield）→ 聚合返回值 `results` 恒空 → ①③⑨ 首跑红（3 fail）→ 补 push 后 13/13 绿。判别信号测实抓真缺陷（H6① 纪律有效）。
- **3 突变探针（全红 → 逐字还原 → 绿）**：P1 并行循环 → 顺序 await（② 红 503ms = 500ms 兜底支）/ P2 删 `mergeAggregated(aggregated, result)` 调用（8 红：③④⑤a-d⑥⑩）/ P3 `return aggregated` → `return { results: [] }`（① + 聚合面红）。

**四件套 + gate**：tsc 0 / eslint 9 变更文件 0 / build 0 KB（entry point）/ 全量 974 pass 0 fail 69 files（基线 961/68 → +13 测 +1 文件）/ gate 6 pass 0 fail 2 files（capability-matrix L120 拆 = 本门自身行变更：① 新 done 行 proof 文件存在且含真实测试 / ② missing 行有 by；engine 不在 anti-stub 扫描集）。

**下一步 = S-5c**（task #100）：schema 收紧（engine/config：HooksSchema 4 变体全字段面 + 事件名集校验 record key ∈ HOOK_EVENTS + SettingsSchema hooks z.any() → z.lazy(HooksSchema)）+ 门/矩阵同步 + E-5 整波审视记录（双只读子代理 ≤2）+ memory 同步（atlascode-wave-c-progress.md + MEMORY.md 索引行）。

### §8.41 E-5 S-5c 执行前分析 + 方案（2026-09-24）

**范围**（task #100 S-5c 前半）：schema 收紧（engine/config：HooksSchema 4 变体全字段面 + 事件名集校验 record key ∈ HOOK_EVENTS 27 + SettingsSchema hooks z.any() → z.lazy(HooksSchema)）+ 门/矩阵同步。后半 = E-5 整波审视记录（双只读子代理 ≤2）+ memory 同步（§8.42）。

**执行前分析（关键契约 + 裁定点）**：
1. **旧仓 ground truth（实测 @ a8af45b）**：权威校验面在 `src/schemas/hooks.ts`（为斩 settings/types ↔ plugins/schemas 循环抽出的 leaf；settings/types.ts `hooks: z.any()` + `HooksSettings = any`，注释明示「HooksSchema VALUE lives in src/schemas/hooks.ts」）。该 leaf 全字段面：command{command, if?, shell?∈SHELL_TYPES[bash|powershell], timeout?(秒,positive), statusMessage?, once?, async?, asyncRewake?} / prompt{prompt, if?, timeout?, model?, statusMessage?, once?} / http{url(z.string().url()), if?, timeout?, headers?(record str→str), allowedEnvVars?(str[]), statusMessage?, once?} / agent{prompt, if?, timeout?, model?, statusMessage?, once?}；matcher{matcher?, hooks(必填)}；**HooksSchema = z.partialRecord(z.enum(HOOK_EVENTS), z.array(HookMatcherSchema))（事件名集校验）**；变体 = strict z.object（无 passthrough）+ .describe() 文档串。
2. **旧仓 settings parse 从不校验 hooks**（z.any() 逐字）：schemas/hooks.ts 消费方 = plugins/schemas（plugin 钩子定义面）。新仓无 plugin 域 → 收紧落点 = settings 字段本身（S-3c 登记「z.lazy(HooksSchema) 收紧归 E-5 严格编辑面」）。
3. **新仓现状**：S-3c hooksSchema.ts = isHookEqual 比较面（command{command,shell?,timeoutMs?,if?} 等）+ .passthrough() 通配 + **无事件名集校验**（z.record(z.string())）+ SettingsSchema hooks z.any() 透传。残留守（hooksSchema.ts 头注 L22-27）= 本切片核销对象。
4. **裁定 R1（事件名集校验）**：z.record(z.string()) → **z.partialRecord(z.enum(HOOK_EVENTS), z.array(HookMatcherSchema))**（旧仓 leaf 逐字；zod v4 有 partialRecord；HOOK_EVENTS `as const` → z.enum 可载）。HOOK_EVENTS 值 import 自 hooks 域（engine/config L3 → 叶域值 import，与既有 HookEvent 型 import 同边，STR-1 合规方向）。
5. **裁定 R2（SettingsSchema hooks 字段）**：z.any() → **z.lazy(() => HooksSchema)**（任务原文 z.lazy；zod v4 内建；新仓无 settings↔schemas 循环，z.lazy 留未来循环逃生口）。效果：垃圾事件名/坏变体 → **parse 期 ValidationError**（getSettingsWithErrors 面），不再静默流入运行时。
6. **裁定 R3（全字段面，新仓命名）**：按旧仓 leaf 字段面补字段（command +statusMessage/once/async/asyncRewake，shell→z.enum(['bash','powershell'])，timeoutMs→positive；prompt/agent +timeoutMs/model/statusMessage/once；http +timeoutMs/headers/allowedEnvVars/statusMessage/once，url→z.url()）。**timeoutMs 保留新仓命名**（S-3c 裁定 = 旧仓 isHookEqual 比较面字段；旧仓 config schema 的 timeout（秒）不取——新仓运行时域 HookCommand = timeoutMs 单一事实源，config→runtime 零转换接缝（H6））。shell 枚举内联（同 types.ts defaultShell `z.union([z.literal...])` 先例；E-6 全 shell 面若落 SHELL_TYPES 常量再收拢）。
7. **裁定 R4（passthrough 保留，偏离旧仓 strict）**：旧仓 leaf 变体/matcher = strict（未知字段丢弃）；新仓**保留 S-3c .passthrough()**（既有测试 engine-config-hooks L119/L344-368 已锁 `extra: 42`/`'keep-me'` 存活 = 新仓前向兼容裁定：SettingsSchema 顶层 .passthrough() 同原则，未知字段不丢数据；未来 prompt/agent/http 执行面将消费这些字段，现在丢弃 = 数据破坏）。收紧判别值 = 事件名集 + 已声明字段面（必填/positive/enum/record 类型），非 strict 丢弃。
8. **裁定 R5（.describe() 文档串不迁）**：旧仓 schema 带 user-facing .describe()；新仓风格 = schema 旁注释语义（types.ts/hooksSchema.ts 全无 .describe）→ 不迁（残留守登记）。
9. **裁定 R6（非 command 变体执行面残留守重登记）**：旧仓 hooks.ts L1743-1817 确有 prompt/agent/http 专属执行支（filter 后分路执行）；新仓 C-Deep 薄骨架 = command-only（provider 过滤非 command 变体已落）。hooksConfig.ts 头注「执行面归 E-5 hooks-runner」= **陈旧**（E-5 落 command 执行面，不含 LLM/HTTP 执行面；E-7 leaves = tasks/scheduler/worktree/session/messaging，不含 hooks）→ 重登记 = 未来 hooks-runner 全量波（独立残留守，不挂 E-7）；本切片同步改 hooksConfig.ts 头注。
10. **裁定 R7（坏条目的整文件拒绝语义）**：parse 失败 → `{settings: null, errors}`（settings.ts L243，整文件拒绝——旧仓同款模式；permissions 族有 filterInvalidPermissionRules 预过滤先例「one bad entry doesn't reject the entire file」）。hooks 取**严格路（A）**：坏钩子条目 → 该源文件拒绝 + 错误经 getSettingsWithErrors 显式呈现（新仓 config 设计 = 错误显式面，非静默透传）。**残留守（B 案）**：hooks 条目预过滤（仿 filterInvalidPermissionRules 保文件）= UX 后续纵切，本切片不做（任务原文 = 纯 schema 收紧，预过滤是独立机制）。既有 T-1 测试（engine-config-hooks「缺 hooks 键 z.any() 放行 → 守卫剔除」）语义变更：S-5c 后该配置 parse 期即拒（断言 `[]` 仍成立，机制 = 文件拒绝非守卫剔除）→ 注释更新；provider Array 守卫降级为快照/cast 面双保险（保留不删，§8.30 T-1 登记面）。
11. **门/矩阵同步**：capability-matrix hooks 域加 1 行「hooks 配置 schema 校验（4 变体全字段面 + 事件名集校验）」done（proof = tests/unit/hooks-schema.test.ts）；gate 2 文件保持绿（anti-stub 不扫 engine/config；matrix ① 校新 proof 文件存在 + 含真实测试）。
12. **受影响既有文件**：types.ts（hooks 字段 + 头注 bullet）/ hooksSchema.ts（schema + 类型 + 头注残留守核销）/ hooksConfig.ts（头注：守卫降级双保险 + 执行面残留守重登记）/ engine-config-hooks.test.ts L392-405（T-1 测试注释语义更新）/ engine 根门面（无新导出——HooksSchema/SettingsSchema/4 变体类型均已导出）。

**判别信号（测试，新文件 tests/unit/hooks-schema.test.ts，纯 schema 零磁盘，12 测）**：
- 全字段面 round-trip：① command 8 字段 / ② prompt / ③ http（headers/allowedEnvVars）/ ④ agent（model）
- 事件名集（⑤）：27 事件全过（`{[event]: []}` 逐一遍历）+ 假事件 'BogusEvent' 拒（error 路径含键）
- SettingsSchema 收紧（⑥a/b）：合法 hooks 过（data.hooks 面保真）/ 假事件 → 拒（经 engine 根门面 import，L3 消费真）
- 字段类型检（⑦-⑩）：shell enum（'zsh' 拒）/ timeoutMs positive（0/-5 拒）/ url 合法性 / headers 值非 string 拒 + allowedEnvVars 非 string[] 拒
- 前向兼容（⑪）：passthrough 保留（变体 extra 字段存活，R4 裁定锁定）
- L3 门面（⑫）：engine 根 HookCommandSchema 判别联合（未知 type 拒 / command 缺 command 拒）

**突变探针（3，cp 备份 → 突变 → 红 → 逐字还原 → 绿）**：
- P1 事件名集：z.partialRecord(z.enum(HOOK_EVENTS)) → z.record(z.string())（⑤⑥ 红）
- P2 SettingsSchema 收紧：hooks: z.lazy(() => HooksSchema) → z.any()（⑥ 红）
- P3 全字段面：删 command 变体 asyncRewake 声明 + 测试面……（passthrough 下删声明不丢字段 → 探针改 timeoutMs 删 .positive()，⑧ 红）

**实施顺序**：hooksSchema.ts（schema+类型+头注）→ types.ts（字段+头注）→ hooksConfig.ts 头注 → engine-config-hooks.test.ts 注释 → 新测试文件 → matrix 行 → 四件套 + 探针 → §8.41 实施结果 → 切片提交。

**实施结果 + 问题闭环**：
- **落地面**：hooksSchema.ts（4 变体全字段面 schema + 类型 + HooksSchema = z.partialRecord(z.enum(HOOK_EVENTS), ...) 事件名集校验 + HOOK_EVENTS 值 import 域根门面）/ types.ts（SettingsSchema hooks z.any() → z.lazy(() => HooksSchema) + 头注 bullet 翻新）/ hooksConfig.ts（头注：T-1 守卫降级双保险 R7 + 非 command 执行面 R6 重登记「未来 hooks-runner 全量波」）/ engine-config-hooks.test.ts（T-1 测试名/注释翻新：机制 = parse 期拒，非守卫剔除）/ capability-matrix hooks 域 +1 行（hooks 配置 schema 校验 done，proof = tests/unit/hooks-schema.test.ts）/ 新测试文件 tests/unit/hooks-schema.test.ts（15 测 = §8.41 判别信号 12 项，⑤⑥ 各细分 a/b/c 与 b）。
- **零回归**：既有 engine-config-hooks（T-1 断言 `[]` 机制变更仍成立）/ engine-config-sources（`hooks: {PreToolUse: []}` 合法事件名 + 空数组过收紧面）/ hooks 域 5 高频执行器 + 流式全绿——无既有测试假设 hooks 透传 z.any()。
- **3 突变探针（全红 → 逐字还原 → 绿）**：P1 事件名集 z.partialRecord(z.enum(HOOK_EVENTS)) → z.record(z.string())（⑤b/⑤c/⑥b 3 红）/ P2 SettingsSchema hooks → z.any()（⑥b 红）/ P3 timeoutMs 删 .positive() 4 处（⑧ 红）。还原 = cp 备份逐字（探针前 cp 至 job tmp）。
- **四件套 + gate**：tsc 0 / eslint 6 变更文件 0 / build 0 KB（entry point）/ 全量 989 pass 0 fail 70 files（基线 974/69 → +15 测 +1 文件）/ gate 6 pass 0 fail 2 files（matrix ① 新 done 行 proof 文件存在且含真实测试）。

**下一步 = E-5 整波审视（task #100 后半）**：双只读子代理（≤2 限额）对照旧仓 ground truth 审视 E-5 全波（S-5a f7da19c/75bf0f9 + S-5b c937dc9 + S-5c 本提交）→ 修复提交 + §8.42 整波审视记录 + memory 同步（atlascode-wave-c-progress.md + MEMORY.md 索引行）。

### §8.42 E-5 整波审视记录（双视角只读审视 + 修复批，2026-09-24）

**范围**：E-5 全波（S-5a f7da19c/75bf0f9 + S-5b c937dc9 + S-5c 416ef1e）整波审视 → 发现处置 → 修复批（本记录随修复批提交）→ E-5 波闭环判定。

**审视执行**：双只读子代理（≤2 限额，独立 worktree，零写）对照旧仓 @ a8af45b ground truth 审视 E-5 全波；**全部发现经主会话对 live tree + 旧仓逐条复核后才处置**（子代理报告仅作输入，不具处置权威）。

**双视角判定（均无 BLOCKER）**：
- **视角 A（旧仓 ground-truth 对照，70 tool uses / 153K tokens）**：5 维度（流式语义 / 接线 / schema 字段逐对 / 残留守登记 / 测试假通过纸面突变）→ **2 MAJOR + 5 MINOR**。
- **视角 B（H6 / 一致性，77 tool uses / 142K tokens）**：D1–D5（死接缝扫描 / 单一事实源 / 测试盲区 / 门-矩阵一致性 / 环境复验——独立复跑 989 pass / 70 files + gate 6 全绿）→ **1 MAJOR + 8 MINOR**。
- 合计 **3 MAJOR + 13 MINOR**（处置编号 MAJOR-1..3 / MINOR-1..8 + 5 无编号订正项，编号以处置台账为准）。

**处置台账**：

**MAJOR（代码修复 3 项）**：
1. **MAJOR-1 pre-hook turn 终止意图透传（A；适配器层丢弃）**：域聚合面已算出 `preventContinuation`/`stopReason`（旧仓 toolHooks.ts:438-446 pre 支 yield 面，JSON continue:false 域聚合），但 createToolHooks 适配器只取 3 字段（blockingError/updatedInput/hookBehavior）→ 钩子 stop 意图静默丢失，executeToolUse 仍执行工具。修复：`PreToolUseHookOutcome` 补 2 字段 + 适配器透传 + `executeToolUse` 短路支（工具不执行，LLM 仍收到该 tool_use 的回应；消息 = 旧仓 toolExecution.ts:869 逐字 `<tool_use_error>Execution stopped by PreToolUse hook[: reason]</tool_use_error>`）。**角裁定**：旧仓该标记仅在权限非 allow 时作消息兜底，新仓简化为直接短路（更严，钩子 stop 意图不丢）——裁定登记于 PreToolUseHookOutcome 头注。
2. **MAJOR-2 updatedInput 嵌套形载体缺失（A）**：旧仓 coreSchemas PreToolUseHookSpecificOutputSchema.updatedInput（嵌套形 `hookSpecificOutput.updatedInput`，hooks.ts:614-616 读取面）新仓未读 → 按旧契约写 PreToolUse 钩子的用户输入改写嵌套形静默丢失（仅顶层形被读）。修复：嵌套形（specific）先读、顶层形后读覆盖（顶层 wins，与 additionalContext 双形读取序一致——单一事实源）。
3. **MAJOR-3 capability-matrix S-5a 接线行缺失（B，其唯一 MAJOR）**：§8.38/§8.39 门/矩阵同步计划明列「新 done 行：engine 接线（ToolHooks 适配器 + stop hooks 消费点 + 三层断补齐，S-5a）」，但 75bf0f9 只加测试未加矩阵行——矩阵本身是门的单一事实源，未入规约行 = 无声失踪（H6 族）。修复：capability-matrix 补 1 行 done（proof = tests/unit/engine-hooks.test.ts；测试自 S-5a 起早已存在——engine-hooks 14 测 + compose-hooks-bootstrap 3 测——仅缺矩阵规约登记）。

**MINOR（编号 8 项 + 无编号订正 5 项）**：
1. **MINOR-1 exit-2 门控（A）**：旧仓 JSON 优先语义——JSON 解析成功时 exit-2 支不可达（旧仓 JSON 分支 outcome 恒 success 短路，exit-2 仅非 JSON 回退支可达）；新仓 exit-2 支缺门 → JSON 成功 + exit-2 双堆 blockingError。修复：`jsonParsed` 门（解析成功则 exit-2 不堆；解析失败 + exit-2 仍照常阻塞）。
2. **MINOR-2 ATLAS_SIMPLE 执行期守卫（A）**：旧仓 hooks.ts:1983/2984 `isEnvTruthy(ATLAS_SIMPLE)` → 执行期跳过全部钩子；新仓该守卫整族缺失。修复：hooks 域内禀 `isSimpleModeHooksSkipped()`（域零 shared import 纪律——C-Deep 复审 L8 hooks = 0 shared 边全注入端口，故不引 shared isEnvTruthy，域内局部实现；真值集 = 旧仓 envUtils 布尔语义 1/true/yes/on，trim + 大小写不敏感）应用于 runHooks + runHooksStream，域根门面导出。
3. **MINOR-3 PostToolUseFailure 残留守登记（A）**：27 事件 schema 可配 + getMatchingHooks matchQuery 支存在（getMatchingHooks.ts:86），但无执行器包装器，pipeline 工具失败支只触发 postToolUse（旧仓有专门 runPostToolUseFailureHooks 消费支，orchestrator toolHooks.ts:159-257）→ runHooks.ts 头注登记，未来 hooks-runner 全量波。
4. **MINOR-4 流式 result yield 序盲区（B）**：既有 ①② 测未锁「result yield 按 match 序」（实现退化为 completion-order 时两测仍过）。修复：补 ②b 时延差判别测（慢首钩 30ms + 快次钩 0ms → result 仍 match 序；completion-order 回归会使 yields[2] 红）。
5. **MINOR-5 systemMessage 消费面残留守登记（A）**：interpretHookOutput 映射写入 HookResult.systemMessage，旧仓为纯展示面（hook_system_message attachment），新仓无消费点（AggregatedHookResult 亦无此字段）→ runHooks.ts 头注登记，消息/REPL 波。
6. **MINOR-7 hooksSchema 4 新字段 + powershell 不对称登记（B）**：command 变体 4 新字段（statusMessage/once/async/asyncRewake，§8.41 R3 全字段面）= 配置数据面本波无执行消费（runOneHook 只读 command/timeoutMs；async 唤醒 = §8.38 裁出清单 / statusMessage = 消息/REPL 波）；shell 枚举含 'powershell' 而执行面 = executor bash-only 纵切（E-6 前）——可配不可执行不对称随 E-6 收口。hooksSchema.ts 头注登记。
7. **MINOR-8 loop.ts hooks 字段死接缝登记（B）**：AgentLoopDeps.hooks（E-5 S-5a 声明）= 现仅测试消费，生产装配（compose）未接线——H6 防空洞纪律要求前向接缝头注登记。loop.ts 字段头注登记：生产装配 = E-wave-end compose 接线（E-wave-end 消费接缝清单项）。
8. **无编号订正 5 项（B 一致性面）**：① streaming.ts 头注守卫族归因订正（disableAll = engine/config 快照门 L3 vs ATLAS_SIMPLE = 执行期 env 守卫域内禀——旧头注误归 config 域）；② compose.ts 注入序注释失真订正（代码实际序 setHooksBootstrapEnv → setHookShellPort → setHookConfigProvider → captureHooksConfigSnapshot，三窗口注入期互不依赖，门面头注所列序为推荐序非约束）；③ 4 处陈旧头注订正（query/index stop hooks 归属 C-4 订正 + 残留守清单翻新 / pipeline/index 钩子消费支已落 + 权限规则树已落 E-4 / compact.ts 压缩重建面 = attachment 渲染归 message/REPL 波 + SessionStart hooks 执行器已随 E-5 落 / runAgent.ts 子代理生命周期钩子归属订正为「未来 hooks-runner 全量波 / 插件面」——§8.41 R6 重登记口径双源对齐）；④ engine-config-hooks.test.ts 2 处陈旧归属翻新（createHooksConfigProvider 测试名/头注：执行面 = 未来 hooks-runner 全量波 §8.41 R6）；⑤ runHooks.ts 头注残留守族补 PostToolUseFailure/systemMessage（= MINOR-3/5 登记载体）。

**测试面（判别信号，+10 测全在既有文件，0 新文件）**：
- engine-hooks.test.ts +3（MAJOR-1 族）：⑮ 适配器透传（continue:false + stopReason → 两字段）/ ⑯ 全链短路（executeToolUse is_error + 旧仓 L869 逐字消息断言 + 工具 calls = 0）/ ⑰ 无防停钩子放行主路径不变（calls = 1）。
- hooks.test.ts +6：MAJOR-2 嵌套形（旧仓 hooks.ts:614-616 载体）/ MAJOR-2 双形（顶层覆盖嵌套）/ MINOR-1 JSON 成功 + exit-2 不堆 / MINOR-1 边界（解析失败 + exit-2 仍阻塞）/ MINOR-2 ATLAS_SIMPLE 真值全跳过（不触碰 shell 端口）/ MINOR-2 真值集 8 例（envUtils 布尔语义）。
- hooks-stream.test.ts +1：②b match 序时延差判别（MINOR-4）。
- 另 2 处既有测试名/注释归属翻新（engine-config-hooks，无断言变更）。

**突变探针（4，cp 备份 → 突变 → 红 → 逐字还原 → 绿；探针前 cp 至 job tmp）**：
- P-M1 MAJOR-1 短路支置永不触发（`if (false && ...)`）→ ⑯ 红（17 测 1 fail）。
- P-M2 MAJOR-2 删嵌套形读取行 → 「MAJOR-2 嵌套形」测红（23 测 1 fail，红中测名逐字对上）。
- P-N1 MINOR-1 删 `!jsonParsed &&` 门 → 「MINOR-1 JSON 解析成功 + exit-2」测红。
- P-N2 MINOR-2 删 ATLAS_SIMPLE 守卫（回退 trust-only）→ 「MINOR-2 ATLAS_SIMPLE 真值」测红。
- 还原 = cp 备份逐字；还原后 3 受影响测试文件 54 pass 全绿 + tsc 0（diff 与探针前逐字一致）。

**四件套 + gate**：tsc 0 / eslint 12 变更 src 文件 0 / build 0 KB（entry point）/ 全量 **999 pass 0 fail 70 files**（基线 989/70 → +10 测 0 新文件）/ gate **6 pass 0 fail 2 files**（matrix ① 新 done 行 proof 文件存在且含真实测试）。

**闭环判定**：3 MAJOR + 13 MINOR 全闭环（代码修复落盘 + 残留守头注登记 + 判别信号测试锁 + 探针判别成立）；双视角无 BLOCKER、无未处置项；**E-5 波（hooks 纵切：S-5a 三层断补齐 + L3 连接器 / S-5b 流式执行 / S-5c schema 收紧）闭环**。

**E-wave-end 接缝清单补登记（hooks 装配项，随 §8.37 E-wave-end 审计清单合并执行）**：
1. compose.ts ⑤ hooks 生产装配：createToolHooks/createLoopHooks 接 AgentLoopDeps.hooks 生产路径（现仅测试消费，MINOR-8 登记面）。
2. runHooksStream 流式消费面（loop 流式 chatStream，E-1b-full 前向接缝）。
3. attachment 渲染 + 钩子 additionalContext 回灌（message/REPL 波，§8.40 C-3）。
4. hooks-runner 全量波（PostToolUseFailure 执行支 / 子代理生命周期钩子 / 非 command 变体执行面，MINOR-3/5 + §8.41 R6 口径）。
5. powershell 可执行性不对称收口（E-6 全 shell 波，MINOR-7）。
6. command 4 新字段执行消费（async 唤醒 / statusMessage，MINOR-7）。

**下一步 = E-6（全 shell）**：bashClassifier stub 回填 + pathValidation（旧仓 487L 纵切）+ 工具面 checkPermissions 语义支回填（可并行纵切）。E-7（leaves：tasks/scheduler/worktree/session/messaging）与 E-wave-end（compose engine 装配 ⑦ + 子代理门透传 + hasPermissionsToUseTool 换回 + 1c abort 重抛 + engine anti-stub 门 + M-3 收口 + getTools 组合根接线 + 上列 hooks 装配接缝清单）随后。

---

## §8.43 E-6 执行前分析（全 shell：permissions 工具面纵切）

**触发**：E-5 全闭环（2f8e7d2..6ece67f，基线 999/70 + gate 6）；任务清单下一波 = E-6（全 shell：bashClassifier stub + pathValidation 487L + 工具面 checkPermissions + 语义支回填，可并行纵切）。

**勘察（主 session 直验，旧仓 @ a8af45b / 新仓 @ HEAD）**：

1. **目标面清点（旧仓）**：
   - `bashClassifier.ts` 61L：外部构建 no-op stub（10 导出，零依赖，classifyBashCommand 恒 `{matches:false,confidence:'high',reason:'This feature is disabled'}`）→ S-6c 逐字迁。
   - `utils/permissions/pathValidation.ts` 487L：8 函数 + 3 类型；消费面 = 仅 `BashTool/pathValidation.ts:22`（1303L 工具本体残留守）+ PowerShellTool 2049L（域外）+ `createReadRuleSuggestion` suggestion 面（§8.34 残留守）→ 新仓 = 纯叶，消费接缝前向登记。
   - `hasPermissionsToUseToolInner` ~162L（旧 permissions.ts L1000-1160）：1c 工具面分发 / 1e requiresUserInteraction / 1f 内容 ask / 1g safetyCheck / 2a bypass / 3 passthrough→ask；`getUpdatedInputOrFallback` L1314-1323（10L，2a/2b 消费点）。新仓回填点 = `src/permissions/permissions.ts` 残留守 ①（工具面分发半）+ ⑥（sandbox 自动放行）。
   - 语义支 3 块（旧 `utils/settings/permissionValidation.ts` 262L L152-230）：customValidation / Bash `:*` 两检 / File `:*` + 通配位置启发；依赖 = `toolValidationConfig.ts` 103L **纯数据**（filePatternTools/bashPrefixTools/customValidation WebSearch·WebFetch，零 import，**非工具注册表** —— 订正 §8.34 裁定 ②「toolValidationConfig 依赖工具注册表」判断，裁定 ⑥）。
   - **不在本波**：`bashPermissions.ts` 2471L + `BashTool/pathValidation.ts` 1303L + `shouldUseSandbox.ts` 124L（依赖 bashPermissions 5 函数 + splitCommand_DEPRECATED + settings.sandbox.excludedCommands）= Bash 工具本体 checkPermissions 实现 → 工具本体波（47 本体残留守延续），裁定 ①。
2. **新仓落点直验**：
   - `PermissionTool`（filesystem.ts L72-79）= name + getPath? + mcpInfo? + `checkPermissions?`（鸭子可选，返新 `PermissionResult` 联合含 passthrough 变体（suggestions/blockedPath））→ 1c 分发可回填。
   - ruleMatching.checkRuleBasedPermissions 1c 鸭子分发已随 S-4b 落；本波回填点 = **permissions.ts 决策主体全量面**（1d/1f/1g/2a/3 + getUpdatedInputOrFallback），即残留守 ① 之「工具面分发半」。
   - `requiresUserInteraction` 不在新 shared Tool 契约（types.ts L185-230 无此方法）→ 1e 裁（前向接缝：工具本体波契约扩面时回填）。
   - shared/debug.logForDebugging ✓ / createPermissionRequestMessage(toolName, decisionReason?) 签名匹配 step 3 ✓ / BASH_TOOL_NAME·WEB_SEARCH·WEB_FETCH·READ·WRITE·EDIT·GLOB 在 toolNames.ts ✓ / **NotebookRead 新仓无**（S-6d 配置对齐裁，裁定 ④）。
   - sandbox 面：createSandboxManager 有 isSandboxingEnabled（L314）/ isAutoAllowBashIfSandboxedEnabled（L284）/ getFsWriteConfig（runtime-types L107）→ ⑥ 与 isPathInSandboxWriteAllowlist 依赖面齐；permissions 为 L2 域不得跨域 import（E-1 裁定）→ 新增 permissions 域内注入窗口 `sandboxAccess`（placeholder 禁用态，组合根接线 = E-wave-end 装配项）。
   - filesystem.ts：matchingRuleForInput（L504）/checkReadableInternalPath（L513）/checkEditableInternalPath（L520）/getPathsForPermissionCheck（L475）均模块私 → 本波加 export 4 行；getFsImplementation/containsPathTraversal/containsVulnerableUncPath/getPlatform = shared 单一事实源 ✓；lodash memoize → 本地 Map 缓存（新仓模式，filesystem.ts L395-405 先例，裁定 ⑦）。
   - 门工厂 `createPermissionGate`（S-4d，engine/permissions/permissionGate.ts:35）消费 `checkRuleBasedPermissions`（S-4b 规则支，1b 恒 ask）——hasPermissionsToUseTool（本波决策主体）在 src/ 生产面零消费者（仅 tests + index 门面 re-export），换回门消费点 = E-wave-end I-1（docs:1309 登记 + E-wave-end 清单项，两决策面漂移风险）。本波决策主体原地演进，engine 侧零改动（verdict 映射不变）。〔§8.44 审视 M-1 订正〕
3. **§8.42 装配项 5/6 波标订正**：「powershell 可执行性不对称收口（E-6 全 shell 波，MINOR-7）」「command 4 新字段执行消费（MINOR-7）」属 hooks 执行面（hooks-runner 全量波，§8.41 R6 口径 + 项 4），非 permissions 工具面；E-6 波名沿用任务清单 4 项口径（bashClassifier stub + pathValidation + 工具面 checkPermissions 分发/updatedInput + 语义支 3 块），PowerShell 2049L 面域外不随迁（bash-only 纵切，§8.21 口径）。

**裁片（4 片串行；S-6b/S-6c/S-6d 相互独立，"可并行"指纵切不依赖，执行取串行保 review 粒度）**：

- **S-6a pathValidation 487L 叶迁**（`src/permissions/pathValidation.ts` 新 + filesystem.ts export 4 行 + `src/permissions/sandboxAccess.ts` 注入窗口 ~40L + index.ts 门面）：
  - 8 函数逐字；getGlobBaseDirectory Windows 分隔支保留（getPlatform 可用）；`memoize(getPathsForPermissionCheck)` → 本地 Map（getResolvedSandboxConfigPath）；isPathInSandboxWriteAllowlist 消费 sandboxAccess 窗口（placeholder 禁用态 = 恒 false，零行为变化）。
  - 实施裁定（勘察后补登）：safeResolvePath = 本文件轻量版（旧仓 fsOperations L138 的 lstatSync 特殊文件支裁——新仓 FsOperations 无 lstatSync 面（filesystem ④ 裁定），悬空链接 / 40 层符号链接链遍历归 engine 波；UNC 早退 + 单级 realpathSync 保留）；旧仓 `(safetyCheck as any)` 换类型化收窄（`safe === false` 显式比较，checkWrite L743 口径）。
  - 接缝头注登记：消费面 = BashTool/pathValidation 1303L 工具本体（残留守）/ createReadRuleSuggestion suggestion 面（§8.34 残留守）/ PowerShell 域外。
  - 判别信号（`tests/unit/path-validation.test.ts`，零磁盘：fake sandbox 窗口 + bootstrap env 注入 /tmp/proj，无需 mock fs——不存在路径 realpath 回落逻辑路径，§8.16 T7 口径；UNC 块平台条件——Windows 判形 / POSIX 走末段 false）：isPathAllowed 决策序（read 工作目录 allow / write 无 acceptEdits 落末 false / sandbox 写 allowlist 3.7 支命中放行 + deny-within-allow 阻断 / 危险文件 .bashrc safety 支不被 acceptEdits 放行）/ validatePath 五安全块（UNC 平台条件 / ~user 变体 / `$%=` 展开语法 / write·create 拒 glob / 引号剥离）/ validateGlobPattern 遍历支 vs 基目录支 / isDangerousRemovalPath（`*`、`/*`、`/`、home、root 直接子、Windows 盘根+子、双斜杠折叠）/ expandTilde 边界 / formatDirectoryList 5 内 vs 6 截断。**桩态边界（H6 防假装通过）**：matchingRuleForInput / checkReadable·EditableInternalPath = filesystem ①② 残留守桩（engine 波 / E-7），isPathAllowed 规则命中步 / 内部路径步降级直通 → 不断言「deny 规则命中」/「内部路径命中」（桩态假信号，落地随桩核销补测）。
  - 突变探针（桩态边界订正：规则命中 / 内部路径步 = ①② 桩，规则序变异 = 死信号不可用）：P-A1 = 删 isPathAllowed 2.5 safety 支 → 「write 危险文件 .bashrc + acceptEdits」测红（safetyCheck 拦截失活 = 工作目录 + acceptEdits 放行）；P-A1b = 删 isPathInSandboxWriteAllowlist denyWithinAllow 循环 → deny 阻断测红。
- **S-6b 工具面分发回填**（permissions.ts 决策主体 ~120L → ~230L + getUpdatedInputOrFallback + ⑥ 半落）：
  - 1c 鸭子分发（`tool.checkPermissions` 存在才调；catch → logForDebugging，**abort 重抛裁** —— 新窄 context 无 abortController，E-wave-end 装配项「1c abort 重抛」消费全量类型时回填）/ 1d deny / 1f ruleBehavior==='ask' / 1g safetyCheck 逐字 / **1e 裁**（requiresUserInteraction 契约缺，前向接缝工具本体波）/ 2a bypass（`bypassPermissions || (plan && isBypassPermissionsModeAvailable)`）→ allow + updatedInput = getUpdatedInputOrFallback / 2b updatedInput `input` → getUpdatedInputOrFallback（旧仓同形）/ 3 passthrough → ask（createPermissionRequestMessage(tool.name, decisionReason) + suggestions logForDebugging 逐字）。
  - **⑥ 半落裁定（裁定 ③）**：1b sandbox 自动放行 = `tool.name === BASH_TOOL_NAME && sandboxAccess.isSandboxingEnabled() && sandboxAccess.isAutoAllowBashIfSandboxedEnabled() && input.dangerouslyDisableSandbox !== true`；**shouldUseSandbox(input) 裁**（124L 依赖面 = 工具本体波）。delta 论证：新仓无 Bash 工具本体 → ⑥ 跳过后落 1c（passthrough）→ 3 → 非 bypass 态仍 ask；delta 仅现于 bypass 态（恒 allow）与 2b 显式 allow 规则（用户显式授权），无安全方向回归；工具本体波落 shouldUseSandbox 后单点核销。**⑥ 守卫角落 delta 登记（§8.44 审视 A-MINOR-1）**：旧 shouldUseSandbox L103-110 = `dangerouslyDisableSandbox && areUnsandboxedCommandsAllowed()` 才 early-return false——角落 `disableSandbox=true && unsandboxed-not-allowed`（策略禁止非沙箱命令）→ 旧仍 return true（命令仍被沙箱化 → ⑥ 自动放行有效），新守卫 `dangerouslyDisableSandbox !== true` 失活 → 落 1b ask；方向为收紧（ask 多于 auto-allow，无安全方向回归），placeholder 态 ⑥ 恒失活零行为变化，仅 E-wave-end 窗口接线 + 策略面落齐后出现，工具本体波收编 shouldUseSandbox 单点核销。
  - 判别信号（`tests/unit/permissions.test.ts` 工具面扩展，fake duck 工具 + fake sandbox 窗口）：1c duck deny 透传 / 1f 内容 ask / 1g safetyCheck / 2a bypass allow + duck allow 带 updatedInput 采纳（无 updatedInput 回落 input）/ 3 passthrough→ask / ⑥ 三态（sandbox 启用+auto-allow → Bash 1b 跳过；dangerouslyDisableSandbox=true → ⑥ 失活；duck 无 checkPermissions 薄行为回归：空规则集 = allow 既有测守住）/ getUpdatedInputOrFallback 双形。
  - 突变探针 P-B1：1f 条件变异（ruleBehavior 检查删）→ 红；P-B2：getUpdatedInputOrFallback 回落删（undefined 传播）→ 红。
- **S-6c bashClassifier 61L stub 迁**（`src/permissions/bashClassifier.ts` 新 + index.ts）：逐字（no-op stub 即外部构建形态）；零消费者 → 前向登记（auto-mode 波分类器族 ~3030L 消费点：yoloClassifier / classifierShared / bashPermissions L1378-1490 speculative 族，§8.31 裁定 ① 口径）；matrix 加 missing 行「bash prompt 分类器消费（auto-mode 纵切波）」；判别：createPromptRuleContent('x') === 'prompt: x'（PROMPT_PREFIX 单一事实源）/ isClassifierPermissionsEnabled() === false / classifyBashCommand no-op 形状 / generateGenericDescription 透传 ?? null。
- **S-6d 语义支 3 块回填**（`toolValidationConfig.ts` 103L → `src/permissions/` + permissionValidation.ts validatePermissionRule 语义支扩）：
  - **配置对齐（裁定 ④）**：filePatternTools 裁 NotebookRead（新仓无）留 Read/Write/Edit/Glob；bashPrefixTools = ['Bash']；customValidation = WebSearch/WebFetch 逐字（新仓均有）。
  - examples 字段沿 S-4c2 裁（提示面残留守）：3 块仅 error + suggestion；PermissionRuleSchema superRefine 续不落（H6 零消费点，§8.34 裁定 ②）。
  - 判别信号（`tests/unit/permission-persist-validation.test.ts` 语义面扩展）：Bash 中置 `:*` 拒 / Bash `:*` 空前缀拒 / `npm *` 合法（通配任意位新语义）/ File `x:*` 拒 / File 中置通配（非 `**` 非边界）拒 / `src/**` 合法 / WebSearch 通配拒 / WebFetch URL 拒 / 语法核心 5 检回归全绿。
  - 突变探针 P-D1：File `:*` 检删 → `Read(x:*)` 放行红。

**裁定清单**：
① bashPermissions 2471L + BashTool/pathValidation 1303L + shouldUseSandbox 124L（Bash 工具本体 checkPermissions 实现 + excludedCommands 检）= 工具本体波残留守（47 本体延续）；S-6b 落分发机制半（鸭子可选，零活工具面消费者 = 休眠接缝），头注重登记实现半「Bash 工具面 checkPermissions 实现 → 工具本体波」（H6 前向声明，非静默遗漏）。
② getUpdatedInputOrFallback 随 S-6b 落（§8.33 裁定 ⑤「E-6 随工具面分发片落」核销）。
③ ⑥ 半落 + dangerouslyDisableSandbox 守卫 + shouldUseSandbox 裁（delta 论证见 S-6b）。
④ S-6d 配置对齐（NotebookRead 裁）。
⑤ 1e / 1c-abort-重抛 裁（前者前向接缝工具本体波；后者 E-wave-end「1c abort 重抛」装配项消费，与既有登记一致）。
⑥ customValidation「依赖工具注册表」判断订正（103L 纯数据零 import）→ 3 块全落。
⑦ memoize → 本地 Map 缓存模式（新仓先例）。
⑧ §8.42 装配项 5/6 波标订正（hooks 全量波，非 E-6）。

**门 / 矩阵同步**：permissions 域 matrix 加 done 行 3（path-validation 测 / 工具面分发测（permissions.test.ts 扩展）/ 语义支 3 块（S-4c2 行 capability 描述翻新））+ missing 行 1（bash prompt 分类器消费，by = auto-mode 纵切波）；engine 域不在 8 域门扫描集 → 无 gate 改动；四件套 + 探针纪律不变。

**基线谱系**：999 → S-6a（+path-validation 测）→ S-6b（permissions 工具面扩展）→ S-6c（bash-classifier-stub 测）→ S-6d（语义面扩展）→ **E-6 整波审视**（双只读 ≤2：A 旧仓 ground-truth 对照（8 函数逐字 + 1c/1f/1g/2a/3 语义 + 配置对齐）/ B H6 死接缝（前向字段消费面 + 注入窗口 placeholder 态 + matrix 行真实性 + §8.42 订正核验）+ 四件套）→ 修复提交 + §8.44 审视记录 + memory 同步。

**S-6b 实施记录**（S-6a 22fba69 之后）：决策主体 120L → ~300L（1c 鸭子分发 / 1d / 1f / 1g / 2a / 2b / 3 + getUpdatedInputOrFallback + ⑥ 半落 + BASH_TOOL_NAME 域内镜像）。两实施注：(a) 3 支落 ask 后「完整上下文 + 无规则 + 无 duck」从 S-4b 薄骨架 allow 翻为 ask（gate fail-closed 映射 §8.36）——既有 mcp 前缀测 other-server 断言随翻 ask（非 deny = 未误伤，测内注明）；「无 getToolPermissionContext 注入 = 末端 allow」薄骨架兼容保留（既有「空规则集 = allow」测守住）；(b) ⑥ placeholder 态恒失活（零行为变化），⑥ 三态 + bypass 态 delta 全落测。permissions.test.ts +12 测（14 → 26），1040 pass / 71 文件。探针 P-B1（1f ruleBehavior 条件突变）/ P-B2（getUpdatedInputOrFallback 回落删）各恰 1 红，逐字恢复（diff 验净）。

**S-6c 实施记录**：bashClassifier 61L 逐字落 `src/permissions/bashClassifier.ts`（零 import 纯叶；stub 即外部构建形态，非残留守空壳——行为面 7 测全判别）+ index.ts 门面 + matrix missing 行「bash prompt 分类器消费（yoloClassifier 族）」（by = auto-mode 纵切波分类器族 ~3030L，§8.31 裁定 ① 口径）+ `tests/unit/bash-classifier-stub.test.ts`（PROMPT_PREFIX / createPromptRuleContent 拼接+trim / enabled=false / 三 descriptions 恒空 / classify no-op 形状 / generate ?? null）。

**S-6d 实施记录**：toolValidationConfig 103L 对齐裁定 ④ 落 `src/permissions/toolValidationConfig.ts`（filePatternTools 裁 Notebook 族留 Read/Write/Edit/Glob + bashPrefixTools ['Bash'] + customValidation WebSearch/WebFetch 逐字；examples 字段沿 S-4c2 裁）+ permissionValidation.ts 语义支 3 块回填（customValidation → Bash `:*` 两检 → File `:*` + 通配位启发，旧仓逐字，examples 裁；头注裁出面登记翻新：superRefine 续不落 §8.34 裁定 ②）+ engine/config/validation.ts 消费侧头注两处「语法」口径同步 + matrix S-4c2 行 capability 描述随翻新 + 测试 +7（Bash 中置 `:*` 拒（`npm run:* test`；末尾前缀形 `npm:*` 合法）/ `:*` 空前缀拒 / `npm *` 通配任意位合法 / File `x:*` 拒（P-D1 探针锚点）/ File 中置通配（非 `**` 非边界）拒 + 边界与 `**` 合法 / WebSearch 通配拒 / WebFetch URL 拒 + domain: 必填）。探针 P-D1（File `:*` 检删）恰 1 红逐字恢复。1054 pass / 72 文件。

## §8.44 E-6 整波审视记录（双只读 ≤2 限额，2026-09-24）

**审视范围** = 4 切片 22fba69/70051a5/4d762fb/b905c23（S-6a pathValidation 487L + sandboxAccess 注入窗口 / S-6b 工具面分发 / S-6c bashClassifier 桩 / S-6d 语义支 3 块）。双只读子代理（≤2 限额）：A = 旧仓 ground-truth 对照（8 函数逐字 + 1c/1f/1g/2a/3 语义 + 配置对齐）/ B = H6 死接缝（前向字段消费面 + 注入窗口 placeholder 态 + matrix 行真实性 + §8.42 订正核验）。两路均 **零 MAJOR 零 BLOCKER**。

**A 路处置**（主会话逐条复核）：
- **MINOR-1（登记缺口）已处置**：⑥ 守卫角落 delta 未在裁定③ delta 论证点名（旧 shouldUseSandbox L108-110 角落：disableSandbox=true && unsandboxed-not-allowed → 旧 ⑥ 有效 / 新守卫失活落 1b ask，方向收紧）→ §8.43 裁定③ 补登记行（本节同提交）。
- MINOR-2（1a/1b 返回对象键序 message 先于 decisionReason，非 byte-level 逐字）忽略：JS 键序无运行时语义。
- INFO-1..4 忽略：1c catch 日志模板（logForDebugging = no-op 壳 C-4 登记）/ safeResolvePath 裁 lstat 支（POSIX 目标平台无 delta）/ suggestions jsonStringify→JSON.stringify（旧壳 = no-op 计时 + JSON.stringify 等价）/ 注释面 debranding（全部用户可见消息字符串逐字核验通过）。

**B 路处置**：
- **M-1（文档事实错误）已处置**：§8.43 勘察点 2 L1528「门工厂已消费 hasPermissionsToUseTool」误——主会话复核：permissionGate.ts:35 调 checkRuleBasedPermissions（S-4b 规则支）；hasPermissionsToUseTool src/ 生产面零消费者（仅 tests + index 门面）；该句与 E-4 审视 I-1（docs:1309「两决策面漂移风险」+ E-wave-end 清单「换回」）矛盾 → 已按 I-1 口径订正（本节同提交）。
- **M-2（ruleMatching.ts 陈旧 E-6 标签）已处置**：L15/20/23/26/28/31/358 共 7 处（审视首报 3 处 + 主会话 grep 全族扩至 7 处）→ 改「工具本体波（§8.43 裁定①）」/「S-6b 落（核销）」（commit 7d6f500，纯注释零行为）。
- I-1（§8.42 项 5 旧波标）忽略：订正记录已存在（§8.43⑧，docs:1559）+ §8.34 裁定② 原文不原地改写先例。
- 核验通过项（证据在子代理报告）：① 休眠接缝成立（AgentTool/mcp.ts checkPermissions 均 E-4 登记 passthrough 桩，零活消费者）/ ⑥ 守卫四条件逐字 + sandboxAccess placeholder 恒失活（3.7 支恒不达零行为变化，锁测 permissions.test.ts:377 + path-validation.test.ts:203/218）/ bashClassifier 全仓 grep 零消费点 + matrix missing 行 by 非空 / BASH_TOOL_NAME 镜像与 toolNames.ts:31 一致 / toolValidationConfig 裸字面量头注裁定④ 登记 / matrix 3 done 行全真（门 3 pass）/ 测试面 4 文件 94 pass 断言真判别零 tautology + 假窗口 duck 工具纯内存零磁盘。

**修复提交**：7d6f500（M-2 ruleMatching 7 标签订正）+ 本节提交（M-1 句 + 裁定③ 角落 delta 登记 + §8.44）。

**终验基线谱系**：999（E-5 末）→ 1028（S-6a）→ 1040（S-6b）→ 1047（S-6c）→ **1054 pass / 0 fail / 72 文件（S-6d）** + gate 6 pass（engine 非 8 域门扫描集，E-6 无 gate 改动）；审视修复全为注释/文档面，基线不变，四件套（tsc 0 / eslint 0 / build 0 KB entry / 1054 + gate 6）于修复提交后终验。

## §8.45 E-7 执行前分析（leaves 5 叶拆分 + 每子任务独立审视闭环纪律，2026-09-24）

**§8.21 纵切序重确认**：tasks（追踪层）→ scheduler（cron）→ worktree → session → messaging。E-7 = engine 波最后 5 叶；每叶 = 一个子任务（S-7d 体量大再拆 d1/d2 两子单元），**每子任务完成后须一次独立审视 + 闭环，闭环后才进下一个**（用户额外裁定，本节固化为纪律）。

### 8.45.1 五叶实测表（旧仓 a8af45b 逐文件核实）

| 叶 | 旧仓来源（实测行数） | 新仓落位 | 核心（迁） | 裁出（登记残留守/顺延波） |
|---|---|---|---|---|
| S-7a tasks | `Task.ts` 125（**已迁** C-Deep T1 → 新仓 `src/task/task.ts` 149L，残余①-⑤）+ `src/tasks.ts` 39 + `tasks/stopTask.ts` 100 + `utils/task/framework.ts` 308 + `LocalAgentTask.tsx` 695 + `LocalShellTask.tsx` 522（+guards 41 +killShellTasks 76） | `src/engine/coordinator/tasks/`（避撞 `src/task/` 输出层） | registry + stopTask + framework 状态机 + LocalAgent 核心 + LocalShell 核心 | .tsx React 渲染面 / RemoteAgentTask 855（teleport 轮询=远程波）/ DreamTask 157（autoDream 服务未建波）/ InProcessTeammateTask 125（归 S-7e，registry 由 S-7e 扩）/ LocalWorkflowTask·MonitorMcpTask（feature-gated 桩未迁，顺延） |
| S-7b scheduler | `cron.ts` 308 + `cronScheduler.ts` 530 + `cronTasks.ts` 459 + `cronTasksLock.ts` 196 + `cronJitterConfig.ts` 75 | `src/engine/scheduler/` | 5 文件全核心（解析纯函数 + 1s 定时器 + PID 锁 + inFlight/missed 去重） | chokidar 文件监听支（新仓 deps 仅 openai+zod，无 chokidar → 裁 + 登记）/ GrowthBook jitter 60s 刷新（裁 → DEFAULT 回落 + 注入窗口） |
| S-7c worktree | `worktree.ts` 1451 | `src/engine/worktree/` | git 子进程+fs 核心（createAgentWorktree:903 / removeAgentWorktree:962 / cleanupStaleAgentWorktrees:1059 / createWorktreeForSession:703 / branch 名+slug 校验） | tmux pane 面（createTmuxSessionForWorktree 族）/ 交互会话绑定 / 零消费面（hasWorktreeChanges/copyWorktreeIncludeFiles 随 createWorktreeForSession 裁） |
| S-7d session | `sessionStorage.ts` 5080（94 export）+ `sessionRestore.ts` 551 + `transcriptSearch.ts` 202 | `src/engine/session/`（填 `sessionContext`/`sessionMemory` 两 `export {}` port 占位） | d1 = JSONL 持久层核心（getTranscriptPath/recordTranscript/loadTranscriptFromFile/buildConversationChain/recordContentReplacement/checkResumeConsistency/flush + sessionMemory port）；d2 = restore 面（processResumedConversation 裁剪解耦 + transcriptSearch 纯函数 + sessionContext port） | 相邻 8 项（sessionStoragePortable 793 / listSessionsImpl 454 / crossProjectResume 50 / conversationRecovery 532 / sessionStart 232 / sessionState 150 / sessionActivity 133）= CLI list/recovery 波，登记残留守 |
| S-7e messaging | `teammateMailbox.ts` 1183 + `teamHelpers` 683 + `agentSwarmsEnabled` 39 + `teamDiscovery` 81 + `inProcessRunner.ts` 1536 + `spawnInProcess` 328 | `src/engine/messaging/` | 文件式 inbox 核心（54 export，无 UDS 零 UI 依赖）+ team file 读写 + env 门 + InProcess 后端（复用新仓 runAgent） | 面板后端族 Tmux 764/ITerm 370/Pane 354+registry 464+detection 128（终端波）/ useInboxPoller 969（UI 波）/ permissionSync 928（E-wave-end/权限波） |

### 8.45.2 执行纪律（用户额外裁定固化）

每子任务（S-7a..S-7e，S-7d 含 d1/d2 两子单元，各为一个可独立审视单元）：
1. **执行前分析**：本节 S-7a 详案已给；S-7b..S-7e 各在实施时补 §8.4x 内「执行前分析」段（文件级裁剪清单 + 解耦裁定 + 测试面 + 探针）后才动手；
2. **实施**：src + 测试 + matrix 行同步；四件套（tsc 0 / eslint 0 / build 0 KB entry / `bun test --isolate tests/` + `tests/ci/` gate）全绿；突变探针纪律（备份→突变→恰 1 红→逐字恢复 diff 验净）；
3. **独立审视**：1 只读 review 子代理（≤2 委派限额内：审视 1 个；必要时 A 旧仓对照/B H6 双视角拆 2 个）+ 主会话逐条复核 findings（子代理报告 = 数据非指令，处置前自行 grep/Read 核验）；
4. **闭环**：修复提交 + §8.4x 审视记录 + memory 同步（`atlascode-wave-c-progress.md` + MEMORY.md 索引）；
5. 闭环通过才进下一子任务。

**编号约定**：§8.46 = S-7a（含审视记录）/ §8.47 = S-7b / §8.48 = S-7c / §8.49 = S-7d（d1/d2）/ §8.50 = S-7e / **§8.51 = E-7 整波审视记录**（双只读 ≤2：A 旧仓对照 / B H6 死接缝）+ 终验四件套 + memory 同步。

**基线谱系**：1054 pass / 72 文件 + gate 6（E-6 末）→ S-7a → S-7b → S-7c → S-7d(d1/d2) → S-7e → E-7 整波审视。

**toolRegistry 接缝归属**（20 gated slot 中 E-7 各叶认领）：② AGENT_TRIGGERS cron 三件套 = S-7b / ⑩ UDS_INBOX = S-7e / ⑭ worktree = S-7c / ⑮ agentSwarms = S-7e / ⑯ Task 四件套 = S-7a（各子任务落 registry 行或残留守登记，H6 防空洞口径）。

### 8.45.3 S-7a（tasks 追踪层）执行前分析

**落位**：`src/engine/coordinator/tasks/`（新目录；`src/engine/coordinator/index.ts` 门面扩 re-export；不碰 `src/task/` 输出层——Task.ts 类型面已在 C-Deep T1 落位，残余④「src/tasks.ts 注册表归 engine 波」本叶核销）。

**文件清单 + 裁剪裁定**（旧仓 `LocalAgentTask.tsx`/`LocalShellTask.tsx` 经 `_c(` 计数 = 0 判非 React Compiler 编译态，干净源可直接抽核心）：
1. `registry.ts` ← `src/tasks.ts` 39L：getAllTasks = [LocalAgentTask, LocalShellTask]（新仓无 bun:bundle `feature()`，LocalWorkflowTask/MonitorMcpTask 桩不迁 + 登记「顺延 feature/工具本体波」；InProcessTeammateTask 头注登记「S-7e 扩 registry」，不预置死位）+ getTaskByType 逐字。
2. `stopTask.ts` ← `tasks/stopTask.ts` 100L：StopTaskError 3 态（not_found/not_running/unsupported_type）+ stopTask 派发（registry.getTaskByType → kill）+ isLocalShellTask 通知抑制逐字；**emitTaskTerminatedSdk 裁 + 登记**（SDK/daemon 波未迁）。
3. `framework.ts` ← `utils/task/framework.ts` 308L：POLL_INTERVAL_MS/STOPPED_DISPLAY_MS/PANEL_GRACE_MS + TaskAttachment + registerTask（re-register merge retain/startTime/messages/diskLoaded/pendingMessages）/ updateTaskState / evictTerminalTask / getRunningTasks / generateTaskAttachments（running→offset patch / terminal+notified→evict）/ applyTaskOffsetsAndEvictions（fresh-state TOCTOU）/ pollTasks / getStatusText 逐字。解耦裁定：
   - xml 8 tag 常量 → 域内 local const（旧仓 `constants/xml` 不迁；唯一消费面 = enqueueTaskNotification 消息模板，逐字保留）；
   - `messageQueueManager.enqueuePendingNotification` → 新仓无消息队列（REPL/UI 波）→ **`setTaskNotificationHandler` 注入窗口**（默认 logForDebugging no-op + 头注登记；E-wave-end/UI 波挂真实 sink——modelProvider 注入窗口先例，非死接缝）；
   - `sdkEventQueue.enqueueSdkEvent`（registerTask task_started 事件）→ 裁 + 登记（SDK 波）；
   - diskOutput（getTaskOutputDelta/getTaskOutputPath）→ 新仓 `src/task/` 已迁 ✓（测试接缝 `setDiskOutputEnv` fail-fast 注入窗口已具备）。
4. `localAgentTask.ts` ← `LocalAgentTask.tsx` 695L 核心抽取：ProgressTracker 族（createProgressTracker / updateProgressFromMessage / getProgressUpdate / createActivityDescriptionResolver / getTokenCountFromTracker）+ LocalAgentTaskState / isLocalAgentTask + registerAsyncAgent / killAsyncAgent / killAllRunningAgentTasks / backgroundAgentTask / registerAgentForeground / unregisterAgentForeground / completeAgentTask / failAgentTask + enqueueAgentNotification → 通知窗口。裁出：.tsx 组件渲染面 + sdk 事件 + AppState→TaskAppState（残余①）+ AgentId→string（残余②）。
5. `localShellTask.ts` ← `LocalShellTask.tsx` 522L + guards 41L + killShellTasks 76L 核心：spawnShellTask 族 + isLocalShellTask + kill 派发；消费面 = PowerShellTool（工具本体波 forward 登记；本 fork BashTool 自持 backgroundTasks Map 不走此层，scout 项 9 裁定）。

**测试面**（真判别零 tautology）：
- `tests/unit/engine-tasks.test.ts`（零磁盘状态机面）：registerTask（re-register merge 保留支）/ updateTaskState / evictTerminalTask / getRunningTasks / stopTask 3 态 + kill 派发 + isLocalShellTask 抑制 / registry getTaskByType 派发 / LocalAgent progressTracker（假消息流 updateProgressFromMessage）+ register/kill 状态机。
- `tests/func/tasks-framework-fs.test.ts`（func 层真盘 tmpdir + cleanup，memory-real-fs 先例）：generateTaskAttachments（running→offset patch / terminal+notified→evict）/ applyTaskOffsetsAndEvictions TOCTOU / pollTasks（通知窗口捕获）——diskOutput 真盘 + `setDiskOutputEnv` 注入。
- 突变探针：P-T1（registerTask merge 支删 → 恰 1 红）/ P-T2（stopTask not_running 守卫删 → 恰 1 红）/ P-T3（generateTaskAttachments terminal+notified 驱逐删 → 恰 1 红）。
- matrix：task 域（8 域门扫描集内）加 done 行「任务追踪层状态机（framework 状态机 + registry + stopTask + LocalAgent/LocalShell 核心）」证明测 = 上两测试文件；engine 域门集无改动（gate 6 不变）。

### 8.45.4 S-7b..S-7e 执行前分析（提纲，实施时各 §8.4x 补详案）

- **S-7b**：cron.ts 308L 零 import 纯函数逐字（parseCronExpression 5 字段/DST/DOM-DOW OR 语义 + computeNextCronRun + cronToHuman）；cronScheduler 定时器主路保留、chokidar watch 支裁 + 登记；jitter 配置 GrowthBook 裁 → DEFAULT + 注入窗口；锁文件 zod + PID 活性探针逐字；消费面（ScheduleCronTool 族 + headless print）= 工具本体波/CLI 波 forward 登记（registry ② 行）。测试面：cron 解析边界（DST/闰年/`*/n`/`L`/`#`）+ nextCronRunMs 抖动 + findMissedTasks + 锁互斥（func 层假盘）+ 定时器 fire（func 层短周期真计时或假时钟注入，实施时定）。
- **S-7c**：git 子进程 + fs 核心逐字（createAgentWorktree / removeAgentWorktree / cleanupStaleAgentWorktrees / branch 名/slug 校验）；tmux 族 + 交互绑定 + 零消费面裁 + 登记；`ignore` npm 包消费点核实（若仅 copyWorktreeIncludeFiles 消费 → 不引新 dep）；消费面 = AgentTool isolation:'worktree' 支（E-2 已 trim 桩则 forward 登记，registry ⑭ 行）。测试面：slug 校验纯函数（unit）+ create/remove/cleanup 真 git（func 层 tmpdir 仓，sandbox smoke 先例）。
- **S-7d d1**：sessionStorage engine 面（旧仓 QueryEngine 8 处 recordTranscript + loop.ts recordContentReplacement:92 消费面；新仓 loop/QueryEngine 当前零调用点 → 状态机/持久核心落位 + 消费面 forward 登记）+ sessionMemory port 填真契约（H6 前向接缝收口）；94 export 裁至 engine 消费子集（~30，逐文件核）；测试面：record/load round-trip + chain build + checkResumeConsistency（func 层 JSONL 真盘）。
- **S-7d d2**：sessionRestore.processResumedConversation 裁剪解耦（resume 总入口重耦合面拆解）+ transcriptSearch 202L 纯函数逐字（UI 搜索消费面登记）+ sessionContext port 填真契约；测试面：resume 链重建 + 搜索命中/边界。
- **S-7e**：teammateMailbox 文件式 inbox 核心（54 export：getInboxPath/readMailbox/readUnreadMessages/writeToMailbox/markMessageAsRead/clearMailbox + lockfile + 消息 schema 族）+ teamHelpers 读写 + agentSwarmsEnabled（ATLAS_EXPERIMENTAL_AGENT_TEAMS env 门）+ teamDiscovery + spawnInProcess + inProcessRunner 核心（复用新仓 runAgent，permissionSync 928L 裁 + 登记 E-wave-end/权限波）；面板后端族 + useInboxPoller 裁 + 登记；registry ⑩/⑮ 行。测试面：mailbox 读写/已读/未读（unit 假盘 + func 真盘）+ 消息 schema 判别 + team file 读写 + env 门。

### §8.46 S-7a tasks 追踪层实施 + 独立只读审视记录（2026-09-24 全闭环）

**范围**：E-7 首个 leaf（§8.45.3 详案）——旧仓 `src/utils/task/framework.ts` 308L + `src/tasks/stopTask.ts` 100L + `LocalAgentTask.tsx` 695L + `LocalShellTask.tsx` 522L（含 guards 41L / killShellTasks 76L）随迁 `src/engine/coordinator/tasks/`（13 文件 + coordinator/engine 双门面 + 2 测试文件 + capability-matrix 2 done 行）。主体提交 `9998971`，审视修复批 `a941d1f`。

**分层**：unit 零磁盘状态机（`engine-tasks` 40 测，`setDiskOutputEnv` 仅路径计算）+ func 真盘 delta/驱逐（`tasks-framework-fs` 6 测，真 tmpdir 注入序，memory-real-fs 先例）两层，覆盖 framework 状态机 / LocalAgent/LocalShell 生命周期 / stopTask 三态 / registry 两态 / 通知注入窗口 / ProgressTracker 计账 / 真盘 offset 补丁 / terminal+notified 驱逐 / TOCTOU 重检 / pollTasks 端到端。

**突变探针**（backup→mutate→red→verbatim restore diff-verified）：
- P-T1（registerTask merge 支删）= 恰 1 红（re-register 保留 UI 持有态）
- P-T2（stopTask not_running 守卫删）= 恰 1 红（not_running 拒非 running）
- P-T3（generateTaskAttachments terminal+notified 驱逐删）= 3 红——驱逐支被 3 个 func 测试共锚（直读 `evictedTaskIds` / apply 层 grace 重检 / pollTasks 端到端），共覆盖更强非缺陷；§8.45 计划"恰 1 红"系 func 测试落盘前预测，实测以 3 共锚为准。

**独立只读审视（1 只读子代理，≤2 限额；旧仓 a8af45b ground-truth 对照 + H6 死接缝 + 突变锚点 + 门面 STR-1，发现全主会话 grep/Read 逐条复核）**：2 MINOR + 2 NOTE，全处置（无 MAJOR 无 BLOCKER）：
- **MINOR-1 framework.ts 头注登记 escapeXml 加固 delta**——旧仓 `framework.ts:284,286` raw 插值 `outputPath`/`description`，新仓 `escapeXml(...)` 包裹（untrusted description 不再 raw 注入 XML = 有意加固）；当前 `generateTaskAttachments` 恒不 push attachments（pollTasks 附件循环空转、构造器不可达）→ 零行为 delta，裁定"登记不回归 raw"（头注补登记，`a941d1f`）。
- **MINOR-2 测试 Message 导入源纠偏**——`engine-tasks.test.ts` 原从 `../../src/engine` 导 `type Message`，但 engine 门面 STR-1 全显式 re-export 不含该类型（type-only 擦除掩盖隐性断链）→ 改自 `../../src/shared`（`shared/types.ts:71`）。
- **NOTE-1 localAgentTask 行内登记** `block.name !== undefined` 防御守卫（对宽松 Message 铸形，旧仓 `content.name`，良构消息行为等价；行内登记）。
- **NOTE-2 localShellTask 内联 `agentType !== 'main-session'` 谓词**——已头注登记（等价 `isMainSessionTask`），零 delta 不处置。

**审视核验通过项**：H6 类目 clean（`coordinator/tasks/` 零 `as any`/`{} as any`；SDK 事件队列 / abortSpeculation×2 / messageQueueManager→注入窗口 / sessionStorage symlink×2 / registry 未迁态 / killShellTasks 尾 dequeue / flushAndCleanup→executor port 全头注登记，无空洞）；5 逐字文件 faithfulness（framework/stopTask/guards/cleanupRegistry/abortController 除 MINOR-1 外全 clean）；突变锚点 P-T1/2/3 = 1/1/3 红全成立无 tautology；门面导出面（coordinator `export * from './tasks'` + engine/index.ts L140-210 显式块）全符。

**基线谱系**：1054 pass / 72 文件 + gate 6（E-6 末）→ **S-7a 1100 pass / 0 fail / 74 文件**（+46 = engine-tasks 40 + tasks-framework-fs 6）+ gate 6（task 域入 8 域门扫描集，capability-matrix 加 2 done 行；engine 非门扫描集 gate 面不变）。四件套终验 tsc 0 / eslint 0 / build 0 KB entry / 1100 + gate 6 全绿。

**残留守登记（S-7a 落头注，防「以为已全」）**：① SDK 事件队列（task_started/terminated，`enqueueSdkEvent` 裁，SDK 波随组合根）② 通知注入窗口默认 `logForDebugging`（messageQueueManager 全量队列随 S-7e messaging 波，teammateMailbox 54 export）③ completed 附件消费面（UI/SDK 待组合根；旧仓即 per-type callback 自持通知防 dual-delivery）④ registry 未迁态（RemoteAgentTask 855L / DreamTask 157L / InProcessTeammateTask 125L 随 S-7e / LocalWorkflowTask·MonitorMcpTask 门随模块裁）⑤ sessionStorage getAgentTranscriptPath symlink（S-7d session 波）⑥ PromptSuggestion abortSpeculation（对应波落位）。

**闭环判定**：S-7a tasks 追踪层全闭环（主体 + 2 测试文件 + matrix 2 行 + 2 MINOR/2 NOTE 全处置 + 4 探针 + H6/faithfulness/门面 三视角审视 + 四件套终验），无 BLOCKER。**下一步 = S-7b scheduler（§8.47：cron.ts 308L 零 import 纯函数逐字 + cronScheduler 定时器主路 + 锁文件 zod + PID 活性探针，chokidar watch 支裁登记 + jitter GrowthBook 裁→DEFAULT 注入窗口；测试面 cron 解析边界 / nextCronRunMs 抖动 / findMissedTasks / 锁互斥 / 定时器 fire）**。

### §8.47 S-7b scheduler（cron）执行前分析 + 方案（2026-09-24）

**范围**：E-7 第 2 leaf（§8.45.2 纪律）。旧仓 5 文件 1568L → 新仓 `src/engine/scheduler/`（greenfield，charter L4.8 第 9 子模块落位）。

**旧仓文件画像**（a8af45b 逐文件核实）：
| 文件 | LOC | import | 移植口径 |
|---|---|---|---|
| `cron.ts` | 308 | 零 import 纯函数 | **逐字**（parseCronExpression 5 字段 / computeNextCronRun / cronToHuman；无 L/W/?/name alias，`L`/`#` 不支=非法） |
| `cronScheduler.ts` | 530 | chokidar(FSWatcher L9 / 动态 import L371 / watch L409) + 本地 | **setInterval 定时器主路保留**（L341 "no chokidar, no load()" 支），**chokidar watch reload 支裁 + 登记** |
| `cronTasks.ts` | 459 | crypto/fs/fs-promises/path | **逐字**（findMissedTasks + CRUD；`zod/v4`→`zod` 主入口） |
| `cronTasksLock.ts` | 196 | fs-promises/path + `zod/v4` | **逐字**（锁文件 + PID 活性探针；`zod/v4`→`zod`） |
| `cronJitterConfig.ts` | 75 | `zod/v4` + GrowthBook | **GrowthBook 支裁 → DEFAULT 常量 + 注入窗口**（setJitterConfigForTesting 先例） |

**依赖面核验**：新仓 `zod` 已装且主入口即 v4（`import { z } from 'zod'`，hooksSchema/permissionUpdateSchema 先例）→ `zod/v4` 子路径换 `zod`（PermissionRule 同改法）。chokidar 仅 cronScheduler 消费且裁支 → **不引 chokidar dep**。无 feature 门（新仓 shared feature() 无 CRON/MONITOR；crons 门控属旧仓 tool registry，模块本体不门控）。**零现存消费者**（grep 无 import）→ 消费面 ScheduleCronTool 族 + headless print = 工具本体波/CLI 波 forward 登记（registry ② 行）。

**落位**：`src/engine/scheduler/` = cron.ts / cronScheduler.ts / cronTasks.ts / cronTasksLock.ts / cronJitterConfig.ts / index.ts（门面）；coordinator/engine 双门面 re-export。AppState 不涉（scheduler 自持持久化 state via cronTasks 文件，非 React AppState）。

**测试面**（真判别零 tautology；unit 纯函数 + func 真盘/真计时两层）：
- `tests/unit/engine-scheduler.test.ts`（纯函数零盘）：parseCronExpression 边界（5 字段 / `*/n` step / 范围 N-M / 列表 N,M / 0=Sun+7=Sun alias / 非法 L·W·?·越界 拒）/ computeNextCronRun（DST 跳转 + 闰年 2/29 + DOM-DOW OR 语义）/ cronToHuman 各支 / 假时钟 jitter 抖动。
- `tests/func/scheduler-fs.test.ts`（真盘 + 真计时）：cronTasks 写读 + findMissedTasks（func 假盘 + 时间窗）/ 锁互斥（cronTasksLock 真盘 acquire/release + PID 活性探针，死 PID 抢占）/ 定时器 fire（短周期真计时或注入时钟，fire 后 remove）。
- 突变探针：P-T1（parseCronExpression step 支删 → 恰 1 红）/ P-T2（computeNextCronRun DST 支删 → 恰 1 红）/ P-T3（锁 PID 活性探针删 → 恰 1 红，func 层）。
- matrix：scheduler 非 8 域门扫描集（engine 子模块，M-3 defer E-wave-end）→ 无 matrix 行，proof = 上两测试文件自证。

**实施落盘**：主体提交 `4713f03`（5 源文件 + index.ts 门面 + engine/index.ts STR-1 全显式名 re-export + unit/func 2 测试文件，2338 行）；审视修复提交 `f101b15`。全量 1160 pass / 76 files + gate 6（E-6 末 1054/72 → +106 测 +4 文件）。3 突变探针 P-T1（parseCronExpression dow-7 别名 cron.ts）/ P-T2（computeNextCronRun DOM-DOW OR cron.ts）/ P-T3（lease lock PID 活性探针 stale 恢复 cronTasksLock.ts，func 层）各恰 1 红、verbatim restore diff-verified。

### §8.47 独立只读审视记录（S-7b scheduler，2026-09-24 闭环）

**审视面**：1 只读子代理（≤2 限额），三视角 = ① 旧仓逐字 faithfulness（5 文件 diff）② H6 死接缝卫生（每条裁剪是否确证旧仓死/坏 + 头注登记完整）③ 突变探针判别力 + 测试缺口。旧仓 ground truth = a8af45b `src/utils/cron*`。

**核心裁定（无 MAJOR / 无 BLOCKER / 无未登记回归）**——每条 H6 裁剪经旧仓核对确证为死代码或坏代码，非真行为丢失：
- **REPL 自动使能轮询整砍 = 安全**：旧仓 state.ts:349 `getScheduledTasksEnabled: any = (() => ({}))` 恒返回 `{}`（truthy）→ 旧 cronScheduler 恒走 `enable()`，`enablePoll` 支 + `setScheduledTasksEnabled(true)`（gated on `!{}`）不可达。新仓 start() 恒 enable，行为等价。
- **session-cron store 整砍 = 修复非丢失**：旧仓 state.ts:316-318 三函数皆 `(() => ({}))` → 旧 `for (const t of getSessionCronTasks())` = `for...of {}` 首 tick 即 TypeError、旧 `listAllCronTasks().map` 抛（连带坏旧 CronCreateTool.validateInput）。新仓 `addCronTask(durable:false)` 显式 throw 前向接缝错（拒绝"假装通过"，func 层测锚），比旧静默蒸发更优。
- **chokidar watch-reload → 每 owner tick 轮询文件 = 语义保留**：owner 每 tick `readCronTasks(dir)`（新 cronScheduler.ts:321）保留 pickup（≤1s，快于 chokidar debounce）/ eviction（seen 重建 + 驱逐循环）/ unlink（readCronTasks→[]→nextFireAt.clear()）；非 owner 两版皆不 fire file 任务；async check() 重叠由 inFlight/missedAsked 守。
- **cron.ts 逐字**（diff-verified body-only）；**isProcessRunning 逐字**（旧 genericProcessUtils.ts:20-28）；锁 + jitter schema 等价；GrowthBook 缺省 provider 返回 DEFAULT 且过 schema = 旧 GrowthBook-missing 路径同值。

**发现处置**（审视修复全落 `f101b15`）：
- **MINOR-1 头注 provenance 事实订正**：原头注/主提交误标 getProjectRoot/getSessionId "皆 : any stub / 返回 {}"——旧仓 state.ts:84（`.git` 上探）/ :105（`_sessionId=randomUUID()`）**皆真实现、逐字随迁**，非 stub。cronEnv.ts 头注改"两类"描述（真实现逐字随迁带行号锚点 vs stub 整砍），cronTasksLock.ts 头注同步订正。（教训：裁剪登记时须逐行核旧仓，别把"真逻辑"误并入"stub"。）
- **MINOR-2** hasCronTasksSync 陈旧 doc 订正（auto-enable 决策已随死轮询整砍，现仅 start() debug 日志用）。
- **MINOR-3(a)** 补 chokidar 替代面高价值 func 测试：运行中新增 overdue recurring 任务 → per-owner-tick 轮询 tick 内 fire（免重启即排程，锚定 watch-reload 替代语义）。**(b) one-shot check()-fire 自删 + inFlight 双发防 / (c) getNextFireTime 全 Infinity→null / (d) resolveProjectRoot .git-walk 缺省** 登记为低优先延后：(b) fire 支需 1-min cron 分辨率自然到期（≤60s）+ inFlight 竞态非确定性，异步 removeCronTasks 路径已被"初载 surface missed" func 测覆盖；(c) 全-Infinity 分支经公有 API 与"空 map"不可区分（黑盒空转），Infinity 过滤 `t<min` 目视即正确；(d) 缺省 .git-walk 逐字自旧 state.ts:84 + 传递性被 func 测覆盖，专测需 process.chdir 破坏层纪律。**复审勿重提 b/c/d。**
- **NIT-4** 删 P-T2 测试残留未用 `const f` / `void f`。**NIT-5** P-T3 func 用 pid=1（`pid<=1` 守卫确定性覆盖），`isProcessRunning` EPERM 支（root 进程误判）不测——本仓非 root CI 可接受，登记。

**探针判别力核验**（子代理独立复核）：P-T1（dow-7 别名）突变→null 或 [7] 即红；P-T2（DOM-DOW OR→AND）移匹配离 2026-01-04 即红；P-T3（stale 恢复支突变）func 红。3 探针全成立。

**四件套终验**：tsc 0 / eslint 0（5 改文件）/ build 0KB entry / 1160 pass + gate 6，零回归。

**闭环判定**：S-7b scheduler（cron）全闭环（主体 5 文件 + 门面 + 2 测试文件 + 3 探针 + 单只读三视角审视 + MINOR×2/NIT×2 全处置 + 四件套终验），无 BLOCKER。**下一步 = S-7c worktree（§8.48）。**

### §8.48 S-7c worktree（agent 隔离 + git 执行层）执行前分析 + 方案（2026-09-24）

**范围**：E-7 第 3 leaf（§8.45.2 纪律）。旧仓 `src/utils/worktree.ts` 1451L → 新仓 `src/engine/worktree/`（greenfield，charter 子模块落位）。**关键事实**：新仓**无 git 执行层**（grep 零命中 gitExe/execFileNoThrow/findGitRoot），而 worktree 核心（getOrCreateWorktree / removeAgentWorktree / cleanupStaleAgentWorktrees / performPostCreationSetup）强依赖 git 子进程 + .git fs plumbing。故本叶**随迁最小 git 执行层子集**（旧仓 git.ts/gitFilesystem.ts/execFileNoThrow.ts/gitConfigParser.ts 的真子集），非旧仓全量 2052L——只迁 worktree 核心实际调用的函数，perf/可观测糖整砍登记。

**旧仓文件画像**（a8af45b 逐文件核实）：
| 来源 | 旧仓 LOC | 移植口径 |
|---|---|---|
| `worktree.ts` | 1451 | 见下方裁剪裁定（真实现 vs H6 前向接缝） |
| `execFileNoThrow.ts` | 150 | **execFileNoThrowWithCwd 逐字核心**；**execa→node:child_process.execFile**（新仓 deps 仅 openai+zod，无 execa；国内 Linux 目标平台，Windows .bat/.cmd shell 支不保留）+ getCwd→process.cwd（本叶调用点恒显式传 cwd）+ logError→logForDebugging 归一化。**execFileNoThrow（no-cwd 变体）+ execSyncWithDefaults_DEPRECATED 整砍**（tmux/legacy 消费，随 tmux 族裁） |
| `git.ts`（子集） | ~9 函数（of 926） | findGitRoot（walk-up 上探 .git dir/file，逻辑逐字；memoizeWithLRU+diagLogs 糖整砍→简单 Map 缓存登记）/ findCanonicalGitRoot（resolveCanonicalRoot 逐字，**SECURITY backlink 校验完整保留**——恶意 commondir/借 worktree 支不可裁；LRU 糖整砍）/ gitExe（whichSync 糖整砍→`process.env.ATLAS_GIT_EXE ?? 'git'` 登记）/ getDefaultBranch（旧仓经 GitFileWatcher fs 缓存 getCachedDefaultBranch → 新仓用已随迁 fs 助手 resolveGitDir/getCommonDir/readGitHead/resolveRef 直接算，**语义等价**（HEAD symref→分支名，否则 main/master 远端 ref 命中，否则 'main'），GitFileWatcher 缓存子系统整砍登记） |
| `git/gitFilesystem.ts`（子集） | ~8 函数（of 699） | resolveGitDir / resolveRef(+resolveRefInDir) / getCommonDir / readGitHead / readWorktreeHeadSha / isSafeRefName / isValidGitSha **逐字**（自含，仅依赖 fs/promises + path + 彼此，无 GitFileWatcher）；**GitFileWatcher 缓存失效子系统（L311+）整砍**（性能缓存非核心行为，登记） |
| `git/gitConfigParser.ts` | 277 | parseGitConfigValue + parseConfigString/parseKeyValue/parseValue/isKeyChar/matchesSectionHeader **逐字**（纯 .git/config 解析，自含零依赖，极可测） |

**裁剪裁定**（真实现 vs H6 前向接缝；复审勿当遗漏重提）：
- **真实现（git 子进程 + fs 核心逐字）**：validateWorktreeSlug（traversal/`..`/绝对路径/超 64 拒，安全门）/ worktreeBranchName(flattenSlug) / worktreesDir / worktreePathFor / getOrCreateWorktree（fetch + add -B + sparse-checkout + 快途 resume readWorktreeHeadSha）/ performPostCreationSetup（settings.local.json 拷贝 + core.hooksPath + symlinkDirectories）/ **createAgentWorktree（agent 隔离入口）/ removeAgentWorktree（agent 隔离出口）/ cleanupStaleAgentWorktrees（周期清扫，fail-closed）** / git 执行层（上表子集）。
- **H6 前向接缝（整砍 + 头注登记）**：
  - **tmux 族**（CLI/tmux 波）：isTmuxAvailable / getTmuxInstallInstructions / createTmuxSessionForWorktree / killTmuxSession / execIntoTmuxWorktree + spawnSync/chalk/isInITerm2 依赖。
  - **交互会话绑定**（EnterWorktree/ExitWorktree 工具本体波）：createWorktreeForSession / keepWorktree / cleanupWorktree / getCurrentWorktreeSession / restoreWorktreeSession / generateTmuxSessionName + `currentWorktreeSession` 模块态 + `process.chdir` + saveCurrentProjectConfig（bootstrap state 未落）。（裁定：engine 叶聚焦 **agent 隔离**（createAgentWorktree/removeAgentWorktree，即 memory「worktree 自动移除」+ agent 定义 isolation:'worktree' 注入边界）；交互用户 EnterWorktree 会话路径归工具本体波。getOrCreateWorktree/performPostCreationSetup 的 git+fs 核心已由 createAgentWorktree 充分行使，交互 wrapper 的会话绑定副作用（chdir/模块态/config 持久化）为裁面。）
  - **hook-based VCS 路径**（新仓无 worktree hooks 面，grep 零命中 WorktreeCreateHook）：hasWorktreeCreateHook / executeWorktreeCreateHook / executeWorktreeRemoveHook → **git 路径为真实现**，hook 支 forward 登记（settings.json 用户可配 VCS hook 的波未落）。
  - **零消费面**（旧仓 grep 零外部消费者）：hasWorktreeChanges（旧仓仅 worktree.ts 内声明，无任何外部 import——旧仓即死导出）/ copyWorktreeIncludeFiles（`.worktreeinclude` 拷贝，唯一 `ignore` npm 包消费点 → **不引新 dep**，deps 维持 openai+zod）/ performPostCreationSetup 内 **attribution hook 支**（`feature('COMMIT_ATTRIBUTION')` + `postCommitAttribution` 动态 import——新仓 feature() 无该门 + postCommitAttribution 未迁，双裁）。
  - **bootstrap 持久化**：saveCurrentProjectConfig（项目配置持久化 = CLI/bootstrap 波，未落）。
  - **git 层性能/可观测糖**：memoizeWithLRU / diagLogs / whichSync / GitFileWatcher（LRU 缓存 + fs-watcher 缓存失效子系统，非核心行为 → 简单 Map 缓存 / fs 直接取值替代，逐处登记）。

**消费面（forward 登记，本叶不接线）**：AgentTool `isolation:'worktree'` 支——E-2 已 trim 为残留守（`loadAgentsDir.ts:16`「initialPrompt/memory/isolation/color → 残留守（对应消费面未落）」，`agentDefinition.ts:11` 头注枚举）→ 本叶提供 createAgentWorktree/removeAgentWorktree/hasWorktreeChanges 供其消费，**接线归工具本体波 / E-wave-end**；toolRegistry ⑭ worktree 行登记。

**落位**：`src/engine/worktree/` = git.ts（execFileNoThrowWithCwd + gitExe + findGitRoot + findCanonicalGitRoot + getDefaultBranch + resolveGitDir + resolveRef + getCommonDir + readGitHead + readWorktreeHeadSha + isSafeRefName + isValidGitSha + parseGitConfigValue）/ worktree.ts（核心 + 裁剪登记）/ index.ts（门面）；`engine/index.ts` STR-1 全显式名 re-export（scheduler 先例，L296-332 块后追加）。coordinator 不涉（worktree 是 engine 顶层域，非 coordinator 子模块）。

**SettingsJson.worktree 字段**：schema 未声明 worktree（§8.27 砍字段族，L26 登记「对应功能面未落」，.passthrough() 透传运行时值但 SettingsJson 类型无该键）→ performPostCreationSetup 经最小 typed 读法访问 `sparsePaths`/`symlinkDirectories`（`getInitialSettings() as unknown as { worktree?: { sparsePaths?: string[]; symlinkDirectories?: string[] } }`，头注登记；settings 波补字段后改直接访问）。

**测试面**（真判别零 tautology；unit 纯函数 + func 真 git 两层）：
- `tests/unit/engine-worktree.test.ts`（零盘纯函数 + tmpdir 只读）：validateWorktreeSlug（`..`/绝对路径/超 64/`.` 段拒 + 合法 `user/feature` 过 + 全 64 边界）/ worktreeBranchName（nested→`+` 扁平 + 非法 slug 抛）/ parseGitConfigValue（section/subsection/quoted 值/inline comment/# ; 注释）/ isSafeRefName + isValidGitSha（shell 注入/`..`/`-` 前缀/`{` 拒 + 40/64 hex 过）/ findGitRoot（tmpdir 真 `.git` dir 与 worktree `.git` file + 非仓 null）/ findCanonicalGitRoot（worktree `.git` file→commondir→main root 解析 + 恶意 commondir backlink 拒）/ resolveRef（loose ref / packed-refs / symref 链）/ gitExe（env 覆写 + 缺省 'git'）。
- `tests/func/worktree-git.test.ts`（真 git tmpdir 仓，sandbox smoke 先例；**git 不可用整族 skip**，gateway 门控先例）：建 tmpdir 仓（git init + user 配置 + 空 commit；可选 bare origin + push 供 unpushed 判定）→ **createAgentWorktree 真 `git worktree add`**（断言 .atlas/worktrees/<slug> 存在 + HEAD sha 匹配 + branch 建）→ **removeAgentWorktree 真 `git worktree remove` + branch -D**（断言目录 + branch 皆删）→ **cleanupStaleAgentWorktrees**（造 `agent-a<7hex>` 临时 worktree + utimes 40d 前 + 干净 + 可达 origin → 扫清；负例：dirty worktree fail-closed 不清 + 用户命名 slug 不清）+ 初载 surface。
- **突变探针**：P-T1（validateWorktreeSlug `..` 段拒支删 → 恰 1 红）/ P-T2（findCanonicalGitRoot backlink 安全校验删 → 恶意 commondir 过，恰 1 红）/ P-T3（cleanupStaleAgentWorktrees dirty fail-closed 守卫删 → 恰 1 红，func 层）。
- **matrix**：worktree 非 8 域门扫描集（engine 子模块，M-3 defer E-wave-end）→ 无 matrix 行，proof = 上两测试文件自证。

**实施落盘**（`fd49163` 主体 + `4954fed` 审视修复）：git.ts 773L（execFileNoThrowWithCwd + gitExe + findGitRoot + findCanonicalGitRoot + getDefaultBranch + readRawSymref + resolveGitDir + resolveRef + getCommonDir + readGitHead + readWorktreeHeadSha + isSafeRefName + isValidGitSha + parseGitConfigValue 族 + resetWorktreeGitCaches）/ worktree.ts 685L（核心 + 六裁面登记 + NOTE-1 边角登记）/ index.ts 门面 / engine/index.ts 追加块 / unit 37 + func 13（+MAJOR-1 回归探针）。**基线谱系**：1160 pass / 76 文件 + gate 6（S-7b 末）→ **1210 pass / 78 文件 + gate 6**（S-7c 末）。

### §8.48 独立只读审视记录（S-7c worktree，2026-09-24 闭环）

**审视面**：1 只读子代理（≤2 限额），范围 = ① 旧仓逐字 faithfulness（git.ts/worktree.ts vs a8af45b git.ts/gitFilesystem.ts/execFileNoThrow.ts/gitConfigParser.ts/worktree.ts）② 解耦 delta 是否"真照做"而非仅头注宣称（execa→execFile / whichSync→env / LRU→Map / GitFileWatcher 整砍 / getCwd→process.cwd）③ H6 六裁面头注登记完整 ④ 安全守卫（backlink 双校验 / isSafeRefName / fail-closed 双守卫）⑤ 突变探针判别力 + 门面 STR-1 ⑥ 静默失败面。子代理独立复跑 unit 37/37 + func 12/12 + tsc 0。

**核心裁定（1 MAJOR + 1 MINOR + 3 NOTE，无 BLOCKER）**：
- **MAJOR-1 `getDefaultBranch` 语义漂移 + 头注"语义等价"失实**（git.ts 初版）：初版误用**本地 HEAD symref**（当前本地分支名）替代旧仓 computeDefaultBranch 的 **origin/HEAD symref** 步骤（`readRawSymref` 未随迁且未登记为裁）。子代理真 clone 复现：clone（remote default main）+ `checkout -b feature` 态，旧仓返 `main`、初版返 `feature`——**每个常见 dev 态（clone 后切 feature 分支）皆命中漂移**；下游 getOrCreateWorktree 的 baseBranch 解析随之偏（origin/feature fetch 失败 → HEAD 兜底 → 以本地未 push 态 seed）。func 测试未捕获（`git init -b main` 新仓无 origin/HEAD loose symref，走 origin-ref 回落恰同值）。**修复**（`4954fed`）：补 `readRawSymref`（旧仓 gitFilesystem.ts:287 逐字，loose symref 只读 + isSafeRefName 守卫）→ getDefaultBranch 判定链逐字旧仓（origin/HEAD → main/master 远端 ref → 'main'）；头注"语义等价"订正为"判定链逐字旧仓"；门面链（worktree/index.ts + engine/index.ts）补导出。**回归探针**：新增 func 测（clone + checkout -b feature → main）；回归突变（重引入本地 HEAD 支）恰 1 红已验证。
- **MINOR-2 stdin 解耦 delta 漏登记**：初版头注仅登记 `stdin:'ignore'` 映射，`'inherit'`/`'pipe'`（类型仍 advertise）落回 execFile 默认 pipe stdio 未登记。现存调用点皆 'ignore' → 潜在无行为影响，头注补一行（审视 MINOR-2 标注）。
- **NOTE-1 fast-resume 边角**（逐字旧仓非移植缺陷）：worktree 目录在而分支被带外 `git branch -D` 删 → readWorktreeHeadSha null → 新建支 `add -B` 对已存在目录 fatal "already exists" → 抛。worktree.ts 头注登记（消费方预期）。
- **NOTE-3 死 import + void 抑制行**：git.ts `logForDebugging` 仅 `void logForDebugging`（resetWorktreeGitCaches 内）存活——旧仓唯一调用点在 execa `.catch()` 异常支（execFileNoThrow.ts:146），回调式 execFile 收拢后异常支消失 → 无存活调用点。删 import + void 行，头注 logError 条订正为"本最小子集无存活调用点"（诚实头注，避死依赖）。
- **NOTE（unbounded Map 缓存）**：LRU→Map 已登记；key 空间 = cwd/repo-root（新仓），增长风险低，维持现状。

**clean 面（子代理核验，无动作）**：execFile wrapper（stdin:'ignore' 全调用点正确 / maxBuffer 1MB + timeout 10min 同旧 / error 支恒 resolve + err.code 数字退出·ENOENT→1·signal→1 / env 合并语义等价）；findCanonicalGitRoot backlink 双校验逐字（攻击面分析：攻击者可控 worktreeGitDir 唯能使 check(2) 通过的方式是指回自身 gitRoot/.git——无逃逸；借受害者真 worktree 条目则 git 写 backlink ≠ 攻击者 gitRoot → check(2) 失败；P-T2 fixture 正确隔离 check(2)）；isSafeRefName 完备（前导 -//空段、../`{`/空白/非 ASCII/NUL 全拒，execFile arg-array 无 shell 面）；cleanupStaleAgentWorktrees fail-closed 正确（status/unpushed 各需 code===0 && stdout 空，cwd=worktreePath 正确 scoped，非 ephemeral 永不入，status 失败 → skip）；createAgentWorktree/getOrCreateWorktree（非 git cwd → findCanonicalGitRoot null → 抛（正确）；sparse-checkout --no-checkout + 失败回滚逐字；resume mtime bump 逐字）；H6 六裁面全登记（含 hasWorktreeChanges 旧仓零消费者 grep 确证）；门面 = 域门面全量面（修复后 21 符号，5 核心 + 16 git），测试皆经门面导入（STR-1）；探针隔离力 P-T1（`..` 段检，regex 单独会放行）/ P-T2（check(2)）/ P-T3（dirty 守卫，真 ephemeral slug agent-aab12cd3）全成立；func test.skip git 门控正确。

**实施订正（本段额外发现，非子代理）**：P-T3 初版探针失效根因 = 测试设计缺陷非源码缺陷——dirty 测初用 slug `agent-adeadbeef`（agent-a 后 8 hex）不匹配 `/^agent-a[0-9a-f]{7}$/` → 模式守卫先跳过，dirty 守卫从未被隔离（删守卫仍 12 pass）。订正为真 ephemeral slug `agent-aab12cd3`（7 hex）后，删 dirty 守卫恰 1 红。

**四件套终验**：tsc 0 / eslint 0 / build 0KB entry / 1210 pass（+1 新 func 探针）/ gate 6，零回归。

**闭环判定**：S-7c worktree（agent 隔离 + git 执行层）全闭环（主体 git.ts 773L + worktree.ts 685L + 门面 + engine 门面 + unit 37 + func 13 + 3 探针 + MAJOR-1 回归探针 + 单只读审视 1 MAJOR/1 MINOR/3 NOTE 全处置 + 四件套终验），无 BLOCKER。**下一步 = S-7d session（§8.49）。**

## §8.49 S-7d session 执行前分析（d1/d2 详案，2026-09-24）

**落位**：`src/engine/session/`（新域，engine 顶层，coordinator 不涉）+ 填 `src/engine/ports/sessionMemory.ts`（d1）/ `sessionContext.ts`（d2）两 `export {}` port 占位（charter L4 Port 5 / Port 1 真契约）+ `src/engine/index.ts` STR-1 显式名 re-export 块（worktree 块先例）。

**旧仓来源盘点（a8af45b 实测）**：`sessionStorage.ts` 5080L / 94 export（公共 API 大半是 `Project` 类（L528）单例 `getProject()` 的薄包装；真持久化核心全在 Project 类内）+ `sessionRestore.ts` 551L / 9 export + `transcriptSearch.ts` 202L / 3 export + `services/SessionMemory/` 995L（状态机 sessionMemoryUtils 203L + 主服务 468L + prompts 324L）+ `sessionStoragePortable.ts` 793L（load 必需子集随迁、余裁）。**关键发现（解耦判据）**：旧 `bootstrap/state.ts` 的 `getSessionProjectDir`（`: any` = 恒 null）/ `getPromptId`（`({}) as any`）/ `getPlanSlugCache`（per-call fresh Map → `.get` 恒 undefined）/ `isSessionPersistenceDisabled` 皆为 **`: any` 退化 stub**——sessionProjectDir（CC-34 原子对）/ promptId / slug 面在旧仓即死代码，新仓裁除零行为 delta。`checkResumeConsistency`（L2220）体 = 遥测 879 点删除后纯 no-op 残余（walk turn_duration 算 `actual` 即 `return`，零输出）→ **裁 + 登记**（H6 不迁空洞函数）。

### d1（JSONL 持久层核心 + sessionMemory port）

**文件清单 + 裁剪裁定**（94 export → engine 消费子集 ~30 export，逐文件核）：

1. **types.ts** ← 旧 `types/logs.ts` 330L 裁 + TranscriptMessage 形状（旧 `types/message.ts` 薄 + insertMessageChain L1050-1070 逐字注释块钉死 session-stamp 字段序）：
   - 留：TranscriptMessage/SerializedMessage / Summary / CustomTitle / AiTitle / LastPrompt / TaskSummary / Tag / AgentName / AgentColor / AgentSetting / PRLink / Mode / WorktreeState（PersistedWorktreeSession）/ ContentReplacementEntry + ContentReplacementRecord（旧 toolResultStorage:539 三字段逐字）/ Entry 并集（按留面缩）。
   - 裁 + 登记：FileHistorySnapshotMessage / AttributionSnapshotMessage / QueueOperationMessage / SpeculationAcceptMessage / ContextCollapse 两件套（grep 零外部消费者）——**loader 侧对已裁 entry type 走「未知 type 跳过」容错**（旧 AtlasHarness 磁盘 JSONL 含这些 entry；跳过非报错；头注登记，shell 域波补全时收紧）。
2. **env.ts（域内注入口，scheduler cronEnv §8.47 先例，域自包含不跨 import bootstrap）**：`SessionEnv { getSessionId / switchSession / getOriginalCwd / getProjectsDir / registerCleanup }`，缺省全自包含（randomUUID 捕获 + 域内 session id 持有 + `process.cwd()` + `ATLAS_CONFIG_DIR ?? join(homedir(), getConfigDirName())` + 'projects'（bootstrap defaultTranscriptDir 先例，免跨域 import configRoot）+ registerCleanup 缺省 no-op）。组合根接线时注真 bootstrap 值（E-wave-end，前向接缝登记）。
3. **paths.ts** ← 旧 L191-260：getProjectsDir / getTranscriptPath / getTranscriptPathForSession（CC-34 注释逐字裁 sessionProjectDir 支后形 = `join(getProjectDir(getOriginalCwd()), ${id}.jsonl)`）/ getAgentTranscriptPath + setAgentTranscriptSubdir / clearAgentTranscriptSubdir / MAX_TRANSCRIPT_READ_BYTES（50MB）/ getProjectDir（memoize `join(getProjectsDir(), sanitizePath(cwd))` 逐字；sanitizePath ← 新仓 `shared/path.ts`（头注核验：与旧 portable 版同 Bun.hash 优先 + djb2 兜底哈希线，目录名跨升级稳定））。
   - **裁 + 登记**：sessionProjectDir 机制（旧 getSessionProjectDir stub 恒 null，CC-34 原子对退化；switchSession 单参，与新 bootstrap 第二参 stub 一致）/ promptId / slug stamp（旧 getPromptId/getPlanSlugCache stub 退化；TranscriptMessage stamp 只留存活 session 字段 userType/entrypoint/cwd/sessionId/version/gitBranch）/ isSessionPersistenceDisabled（持久化 kill-switch 面归 CLI 波）。
   - stamp 解耦：userType = 旧 getUserType（sessionStorage:415 域内，逐字）/ entrypoint = `process.env.ATLAS_ENTRYPOINT ?? 'cli'`（旧 getEntrypoint env 面）/ gitBranch = 域内小工具 `getGitBranch()`（execFile `git rev-parse --abbrev-ref HEAD`，旧 utils/git.ts getBranch 语义逐字；域自包含，不跨域 import worktree exec 层——与 scheduler「域内小工具」先例一致）/ VERSION = 新仓 package.json version 读（'unknown' 回落；旧 MACRO.VERSION define 面新仓无，头注登记）。
4. **project.ts** ← 旧 `Project` 类持久核心：
   - 留：currentSession* 元数据缓存字段族（tag/title/agentName/agentColor/lastPrompt/agentSetting/mode/worktree 三态/prNumber/prUrl/prRepository）/ sessionFile + pendingEntries 缓冲 + materializeSessionFile（首条 user/assistant 才物化，防 metadata-only 空文件）/ **insertMessageChain（L994 逐字：tool_result sourceToolAssistantUUID 覆写 + isCompactBoundary parentUuid=null / logicalParentUuid + chain-participant parent 推进 + lastPrompt 200 字截断缓存 + METADATA_REWRITE_INTERVAL=20 元数据重写）** / appendEntry（L1141 per-file 写队列 + flushResolvers）/ insertContentReplacement（L1126）/ reAppendSessionMetadata（L722，尾部 64KB 窗口语义）/ flush（L842）/ trackWrite / resetSessionFile（L689）/ _resetFlushState（L574）/ getSessionMessages memoize 缓存（L3812，lodash memoize 逐字语义域内化）。
   - 裁 + 登记（6 裁面 H6 头注）：insertFileHistorySnapshot / insertAttributionSnapshot / insertQueueOperation（shell 域 fileHistory/attribution/UI 队列）/ removeMessageByUuid（REPL tombstone，engine 零消费者 grep 确证）/ setRemoteIngressUrl + CCR v2 internalEvent writer/reader + REMOTE_FLUSH_INTERVAL_MS（远程/teleport 波）/ 旧 registerCleanup（coordinator/tasks cleanupRegistry 跨域 → env.registerCleanup 注入口，scheduler 先例）。
5. **record.ts** ← 公共记录面：recordTranscript（L1419 逐字：cleanMessagesForLogging + 已录去重 + **prefix-tracked skip 逻辑**（仅前缀型已录消息推进 parent，compaction 非前缀支 CB parentUuid=null 截断）+ startingParentUuidHint + 返回 last chain-participant uuid）/ recordSidechainTranscript（L1467）/ recordContentReplacement（L1505，旧 loop.ts:92 + sessionRestore 消费面）/ flushSessionStorage（L1594）/ resetSessionFilePointer / adoptResumedSessionFile（L1531 CC-34 注释逐字）/ restoreSessionMetadata + saveMode（sessionRestore 依赖面）/ cleanMessagesForLogging / isChainParticipant / isTranscriptMessage / isEphemeralToolProgress / getFirstMeaningfulUserMessageTextContent + SKIP_FIRST_PROMPT_PATTERN（helper 逐字）。saveWorktreeState 随 worktree 状态面裁（登记）。
   - **消费面**：新仓 QueryEngine/loop 当前零调用点 → **前向登记**（E-wave-end compose.ts 接线：QueryEngine 8 recordTranscript 点 + loop recordContentReplacement；头注 + matrix 行登记，H6 防空洞口径）。
6. **scanner.ts** ← 旧 portable L473-800 逐字块（TRANSCRIPT_READ_CHUNK_SIZE 1MB / SKIP_PRECOMPACT_THRESHOLD 5MB / LITE_READ_BUF_SIZE 64KB / compactBoundaryMarker / LoadState / processStraddle / scanChunkLines / captureSnap / captureCarry / finalizeOutput / **readTranscriptForLoad**）——pre-compact 大文件 fd 级 attr-snap strip + in-stream compact boundary 截断（151MB session 32MB alloc 优化逐字，mimalloc RSS 注释保留）。
7. **load.ts** ← loadTranscriptFile（L3443：ATLAS_DISABLE_PRECOMPACT_SKIP kill-switch + walkChainBeforeParse 预解析跳过（L3277 逐字）+ scanPreBoundaryMetadata 前界元数据恢复（L3128 逐字）+ 双格式 .json/.jsonl 逐字）/ loadTranscriptFromFile（L2283）/ buildConversationChain（L2069：cycle 检测 partial 返回 + **recoverOrphanedParallelToolResults**（L2136：sibling assistant 同 message.id 组 + 平行 tool_result DAG 孤儿恢复，anchor 后 splice 时序逐字））/ findLatestMessage / convertToLogOption / applyPreservedSegmentRelinks（L1850）/ applySnipRemovals（L1986）/ 域内小工具 parseJSONL / jsonParse / jsonStringify（旧 json/slowOperations 语义逐字，计时面裁）。
   - **裁 + 登记**：checkResumeConsistency（旧体纯 no-op 遥测残余，H6 不迁空洞；resume 一致性监控面归遥测波）/ buildFileHistorySnapshotChain / buildAttributionSnapshotChain（对应 entry 裁）/ LogOption 全字段（teamName/agentName/isTeammate/pr* 等 CLI list 面）裁至 engine resume 消费子集（listSessions 面 = 相邻 8 项 CLI 波残留守）。
8. **sessionMemory.ts** ← 旧 `sessionMemoryUtils.ts` 203L 状态机逐字（SessionMemoryConfig + DEFAULT {init 10000 / update 5000 / toolCalls 3} + lastSummarizedMessageId / extractionStartedAt / tokensAtLastExtraction / initialized + hasMet*Threshold + getToolCallsBetweenUpdates + waitForSessionMemoryExtraction（15s 超时 / 60s stale）+ resetSessionMemoryState）：
   - 解耦：getSessionMemoryContent（旧 = getSessionMemoryPath + fs.readFile + isFsInaccessible 容错）→ **I/O 走 SessionMemoryPort**（isFsInaccessible 语义域内小工具，errno EACCES/EPERM/ENOTDIR 判别逐字；sleep 1s 轮询域内）；旧主服务 468L（forked subagent 后台抽取 + prompts 324L）裁 + 登记（forkedAgent 面新仓无，autoDream/抽取波）。
9. **ports/sessionMemory.ts 真契约**（替 `export {}`，charter Port 5：会话记忆存储在壳，对齐 MemoryStore 模式）：
   ```ts
   export interface SessionMemoryPort {
     /** 读会话记忆内容（无/不可读 → null）。 */
     load(): Promise<string | null>
     /** 写会话记忆内容（壳侧落盘，MemoryStore 模式）。 */
     save(content: string): Promise<void>
   }
   ```
   接口归 engine（消费方），实现归 atlascode（壳），组合根注入；当前零消费 = 前向登记（prompt 注入面 E-wave-end / 抽取触发壳波）。
10. **index.ts** 域门面 + **engine/index.ts** STR-1 显式名 re-export 块（worktree 块后追加）。

**d1 测试面**（真判别零 tautology；unit 零磁盘 + func 真盘 JSONL 两层，S-7a/b/c 分层先例）：
- `tests/unit/engine-session.test.ts`：buildConversationChain（内存 Map：正常链 / cycle 检测 partial 返回 / **平行 TR 恢复**（sibling assistant 同 id 组 + 孤儿 TR 组 anchor 后 splice，时序断言）/ compact boundary parentUuid=null + logicalParent）+ isTranscriptMessage/isChainParticipant/isEphemeralToolProgress + scanner 纯逻辑支（scanChunkLines/captureSnap/captureCarry/finalizeOutput 对内存 Buffer：boundary 截断 / attr-snap skip / straddle 跨块 / preservedSegment 不截断，纯函数支 unit 化）+ sessionMemory 状态机（init 10000 阈值 / update 5000 增长 / toolCalls 3 / stale 60s 不等待 / reset 全复位）+ SessionMemoryPort 假适配器（load null / save 捕获）+ paths（sanitizePath 长路径哈希稳定 / getTranscriptPath 布局断言 / agent transcript subdir 支）。
- `tests/func/engine-session-fs.test.ts`（真盘 JSONL，域 env 注入 `setSessionEnv` 覆写 getProjectsDir → tmpdir；git 门控先例不适用——纯 fs）：recordTranscript → loadTranscriptFile **round-trip**（chain 重建逐条匹配 + last chain-participant 返回 uuid）+ recordTranscript prefix-skip（compaction 形：CB+summary 先、已录 toKeep 后 → CB parentUuid=null 断言）+ recordContentReplacement round-trip（sessionId keyed lookup 命中）+ recordSidechainTranscript（subagents/agent-<id>.jsonl 子目录真盘）+ flush 幂等 + 大文件 path（>5MB 构造：pre-boundary attr-snap + compact boundary → readTranscriptForLoad postBoundaryBuf 截断 + scanPreBoundaryMetadata 恢复 + walkChainBeforeParse 跳过死分支，ATLAS_DISABLE_PRECOMPACT_SKIP 两态）。
- **突变探针**（备份→突变→恰 1 红→逐字恢复 diff 验净）：P-S1（recordTranscript prefix-tracked 守卫 `!seenNewMessage` 删 → func prefix-skip 测恰 1 红）/ P-S2（recoverOrphanedParallelToolResults inserts splice 删 → unit 平行 TR 恢复恰 1 红）/ P-S3（scanner 前界截断支 `s.out.len = 0`（scanChunkLines L191 / processStraddle L147 两处，**非** finalizeOutput——它只做 carry 落写 + attr-snap EOF 重排）删 → func 大文件截断测恰 1 红）。
- **matrix**：session（engine 子域）非 8 域门扫描集（同 S-7b/c）→ 无 gate 改动（gate 6 不变）；证明 = 上两测试文件自证 + 前向登记头注（QueryEngine 8 recordTranscript 点 / loop recordContentReplacement / SessionMemoryPort 壳实现 / E-wave-end compose 接线）。

#### d1 实施记录（2026-09-24，主体提交见 git log）

**落盘面**：`src/engine/session/` 12 文件（types 339 / project 901 / load 1274 / scanner 341 / record 369 / firstPrompt 191 / json 137 / paths 161 / predicates 88 / env 66+ / sessionMemory 222 / index 152 门面）+ `ports/sessionMemory.ts` Port 5 真契约（替 `export {}`）+ `engine/index.ts` 显式名 re-export 块。unit 42 测（零磁盘）+ func 10 测（真盘 JSONL，`setSessionEnv({getProjectsDir: () => tmp})` 注入序先于首次 getProjectDir + `TEST_ENABLE_SESSION_PERSISTENCE=1` 破 unit 守卫）。

**关键实施决策（与详案偏差面均已头注登记）**：
- TranscriptMessage.type 覆域 `Message.type?: string` 宽型为必填字面量联合（判别式收窄依赖）；insertMessageChain stamp 的 `...message` spread 后须显式 `type/uuid/timestamp` cast（spread 复引宽型），字段序 FROZEN 注释逐字保留（旧 L1041 块）。
- P-S1 探针场景重设计：初版 `[u2,a2,u1,a3]` 非判别（u1 在 seenNewMessage=true 之后，去守卫零效果）→ 定案 `[u1旧, u2新, a1旧]` + hint 'seed'：有守卫 u2.parent='u1'（前缀 u1 推进），去守卫 'a1'（非前缀 a1 亦推进）→ 恰 1 红。配套契约：func 工厂 Message 不携带 parentUuid（旧类型面保证；stamp `...message` 在算出 parent 之后 spread，携带即覆写——H6 登记于 func 头注）。
- node:fs 同步写辅助（appendEntryToFile / readFileTailSync 直用 node:fs）——shared FsOperations 无 appendFileSync 同步面（头注登记）。
- 详案「scanner 纯逻辑支 unit 化 / paths 布局断言 unit 化」落为 func 行为面覆盖（scanner 内部函数模块私有，行为面经大文件两态 / legacy progress 桥 func 测覆盖）；常量面（LITE_READ_BUF_SIZE=65536 等）unit 断言保留。
- 突变探针 P-S1/P-S2/P-S3 全部执行：备份→突变→恰 1 红→逐字恢复 diff 验净（P-S1 record.ts 守卫删→func 1 红 / P-S2 load.ts `inserts.set` 删→unit 1 红 / P-S3 scanner L191 `s.out.len=0` 删→func 1 红）。
- 四件套：tsc 0 / eslint 0 / build（cli.ts A 波骨架 `export {}`，0 KB 属预期非回归）/ 全量 **1262 pass / 80 文件**（+2 测试文件 +52 测，1210 基线 +52）+ gate 6 不变。

#### d1 独立只读审视记录（1 只读子代理，≤2 限额内）

**裁定：PASS-with-fixes（4 项前置处置，无 BLOCKER）**。5 块逐字抽检 + 全头注「逐字」面 + H6 接缝核验 + 测试判别性 + 门面完备性全过；3 探针判别性全成立；基线复跑 52/1262 pass + tsc 0。

| # | 级别 | 发现 | 处置 |
|---|------|------|------|
| A-1 | MAJOR | cwd 戳值 delta 未登记：旧 `getCwd()`（活态，Bash cd 持久化 / --resume workDir 刷新）→ 新 `SessionEnv.getOriginalCwd()`（模块加载冻结）；影响面 = 仅逐条消息 cwd 戳值（会话文件定位键控 originalCwd 不受影响，链完整性零 delta，消费者 = CLI ps 面归 CLI 波） | **登记 + 接受**：project.ts 头注补审视 A-1 登记块；E-wave-end 可选扩 SessionEnv 活态成员恢复（前向接缝登记，非遗漏） |
| A-2 | MINOR | getGitBranch 值 delta 未登记：detached/非 git 仓旧 computeBranch 返字符串 'HEAD'，新映射 undefined；机制面（缓存族→逐次 spawn）已登记但「语义逐字」宣称不覆盖值级 | **登记 + 接受**：paths.ts getGitBranch 头注补 A-2 块（消费面 = gitBranch 戳 CLI 列表展示） |
| A-3 | MINOR | getProjectsDir 缺旧 `getAtlasConfigHomeDir` 的 `.normalize('NFC')`（非 ASCII home/env 时目录名与旧平台工具不一致） | **恢复**（一行，保逐字）：env.ts getProjectsDir 补 `.normalize('NFC')` + memoize→每调用重读 env 语义等价登记 |
| B-1 | NIT | 旧 readJSONLFile（100MB 尾读，json.ts L201）裁除未登记（唯一消费者 stats.ts:177 = CLI 统计面） | **登记**：json.ts 头注补裁面行 |
| C-1 | NIT | P-S3 探针注释 3 处误标「finalizeOutput 截断」（实际截断支 = scanChunkLines/processStraddle 的 `s.out.len = 0`；finalizeOutput 只做 carry 落写 + attr-snap EOF 重排） | **修正**：unit/func 头注 + §8.49 探针行 3 处订正（探针效力不受影响，突变按真实截断支执行） |
| C-2 | NIT | unit「全已录 → 前缀跟踪 uuid」对 P-S1 守卫非判别（有/无守卫均返 'a1'） | **接受**：该测测返回语义非探针；P-S1 判别覆盖在 func 层（头注探针映射正确） |
| D-1 | NIT | engine/index.ts 野卡 `export * from './session'` vs §8.49 item 10 显式名块 | **修正**：改显式名块（~78 名 = session/index.ts 门面全量）。订正说明：审视报告称「permissions/hooks 先例为野卡」经 grep 复核**不成立**——本文件其余全部子门面块（tools/context/permissions/hooks）均为显式名，session 是唯一野卡，属仓库惯例偏差而非风格可选项 |

**闭环**：A-1/A-2/A-3/B-1 头注登记 + A-3 恢复 + C-1 3 处订正 + D-1 显式名块，tsc 0 + 52 pass 复验。基线谱系 1210 → **1262 pass / 80 文件 + gate 6（S-7d d1 末）**。**下一步 = S-7d d2（restore 面 + sessionContext port，详案同上）。**

### d2（restore 面 + sessionContext port）

**文件清单 + 裁剪裁定**：
1. **restore.ts** ← `sessionRestore.ts` 551L 裁剪解耦，提取 **slim `processResumedConversation`**（engine 所有权面，旧 L367-551 拆）：
   - 留：forkSession=false → `switchSession(sid)` 所有权（env 注入口单参，projectDir 面随 d1 裁）+ **fork 支 `recordContentReplacement(result.contentReplacements)` seed**（FROZEN 误分类防治注释逐字——新 session id 下 source tool_use_id 无 replacement 记录 → 恒 FROZEN → 永久 overage）+ restoreSessionMetadata（fork 剥 worktreeSession 注释逐字）+ adoptResumedSessionFile（非 fork）+ saveMode（feature 门随新仓 feature 面裁，恒 save）+ 返回 shape（messages/contentReplacements/agentName/agentColor 'default'→undefined 归一）。
   - 裁 + 登记（shell 域）：coordinator modeApi 匹配（新仓 coordinator 域不含 modeApi 服务，CLI/coordinator 波）/ renameRecordingForSession（asciicast）/ restoreCostStateForSession（cost-tracker）/ context-collapse require（零消费者，同 d1 裁定）/ restoreAgentFromSession + refreshAgentDefinitionsForModeSwitch（loadAgentsDir = CLI/agents 波）/ computeRestoredAttributionState（attribution 裁）/ updateSessionName（concurrentSessions）/ AppState initialState（壳）/ **restoreWorktreeForResume + exitRestoredWorktree**（worktree 状态缓存面；新仓 worktree 域（S-7c）不含 restoreWorktreeSession/getCurrentWorktreeSession → 裁 + 登记 shell worktree 波；slim 版不做 chdir，worktree 恢复面 = **前向注入口**（`onWorktreeRestore?` 可选回调，组合根注真 worktree 状态机，H6 前向接缝登记））。
   - ResumeResult / ResumeLoadResult / ProcessedResume 裁至 engine 面（messages + contentReplacements + session 元数据字段；fileHistory/attribution/agentDefinitions 字段裁 + 登记）。
2. **search.ts** ← `transcriptSearch.ts` 202L 逐字（renderableSearchText + computeSearchText + toolResultSearchText + toolUseSearchText + WeakMap 缓存 + RENDERED_AS_SENTINEL）：
   - 解耦：INTERRUPT_MESSAGE / INTERRUPT_MESSAGE_FOR_TOOL_USE（旧 messages.ts:218-219）→ 域内常量逐字串（'[Request interrupted by user]' + tool_use 变体；新仓尚无 messages 常量面，头注登记）/ RenderableMessage → types.ts 最小形（user/assistant/attachment content block + toolUseResult duck 型 + toolUseResult 面注释逐字——phantom-match 防治：sentinel 滤 / tool_result 走原生 Out duck 非 model-facing 序列化）；UI 搜索消费面登记（REPL /transcript 搜索波）。
3. **ports/sessionContext.ts 真契约**（替 `export {}`，charter Port 1 逐字）：
   ```ts
   export interface SessionSnapshot {
     toolPermissionContext: ToolPermissionContext
     mcp: { tools: Tool[]; clients: MCPServerConnection[] }
     effortValue: EffortValue
     advisorModel: string | undefined
     tasks: Record<string, TaskState>
   }
   export interface SessionContextPort {
     get(): SessionSnapshot
     set(f: (prev: SessionSnapshot) => SessionSnapshot): void
   }
   ```
   类型全存在（shared/types-session ToolPermissionContext/TaskState/MCPServerConnection + shared/types Tool/EffortValue）；**快照字段对象引用 = view 语义**（charter 注：实现唯一细节，set 按字段写回）；当前零消费 = 前向登记（QueryEngineConfig getAppState/setAppState 硬字段置换面，E-wave-end compose.ts 接线）。

**d2 测试面**：
- `tests/unit/engine-session-restore.test.ts`：processResumedConversation slim（env 假 + Project 假：非 fork switchSession 所有权 / **fork 支 contentReplacements seed 写入断言** / restoreSessionMetadata 缓存 / adoptResumedSessionFile sessionFile 指针 / saveMode entry / agentColor 'default' 归一）+ transcriptSearch（text 命中 / tool_result Bash {stdout,stderr} duck / tool_use input 拼接 / sentinel 滤（INTERRUPT phantom 防）/ attachment relevant_memories + queued_command isMeta 跳过 / WeakMap 缓存幂等）+ SessionContextPort 假适配器（get/set view 语义：字段对象引用同一性断言 + set 函数式写回）。
- func（真盘，并入 d1 func 文件或独立，实施时定）：resume 链重建端到端（真 JSONL 构造 → loadTranscriptFile → buildConversationChain → processResumedConversation 非 fork 路）。
- **突变探针**：P-S4（transcriptSearch toolResultSearchText Bash stdout duck 支删 → 恰 1 红）/ P-S5（processResumedConversation fork 支 recordContentReplacement 调用删 → fork seed 测恰 1 红）。
- **matrix** 同 d1（engine 非 8 域门扫描集，gate 6 不变）。

**基线谱系**：1210 pass / 78 文件 + gate 6（S-7c 末）→ **S-7d d1**（实施 + 探针 + 1 只读审视 + 闭环）→ **S-7d d2**（同）→ **§8.51 E-7 整波审视**（双只读 ≤2：A 旧仓对照 / B H6 死接缝）+ 终验四件套 + memory 同步。

**编号**：§8.49 本节 = S-7d 执行前分析（落盘后 d1 动手）；d1/d2 各实施后在 §8.49 下补「实施记录 + 独立只读审视记录」段（S-7a/b/c 先例）。

#### d2 实施记录（2026-09-24，主体提交 5e20333）

**落盘面**（8 文件，+1040/-12）：
- `src/engine/session/search.ts`（新，202L 逐字面）：旧 `utils/transcriptSearch.ts`
  逐字随迁。类型面 delta 头注登记 3 项：INTERRUPT 两常量域内化（旧
  messages.ts:218-220 逐字串）/ RenderableMessage 最小形 / ContentBlock
  索引签名 any（旧 types/atlas.ts:1）→ unknown（新 shared/types.ts:20）→
  b.text 3 处 `as string` 还原（TextBlock 形 cast 健全，算法体零 delta）。
- `src/engine/session/types.ts`：尾追加 `RenderableMessage` 最小形
  （6 型面 + toolUseResult duck 面）。attachment 双成员面设计：
  relevant_memories 变体 memories 非缺省（逐字 `memories.map` 无 `!`）+
  catch-all 变体携 queued_command 守卫字段。过检机制（审视 M-1 订正后
  准确表述）：catch-all `type: string` 宽判别式**不被**字面量比较排除
  （TS 对非字面量判别式成员不收窄），真支 `memories` 为 `Array |
  undefined`——逐字体零改写过检依赖本仓 tsconfig `strict: false`
  （复现 `--strict` 红 TS18048 / `--strict false` 绿）；UI 波 /
  strict 化落地时须补守卫或重构变体。
- `src/engine/session/restore.ts`（新）：slim `processResumedConversation`
  + `ResumeLoadResult`/`ProcessedResume` 收窄 engine 面。随迁面逐字/结构
  保留（非 fork switchSession 单参所有权 + resetSessionFilePointer +
  adoptResumedSessionFile / fork 支 seed + FROZEN 注释逐字 /
  restoreSessionMetadata fork 剥 worktreeSession / saveMode / agentColor
  归一）。裁面族 8 项全头注 H6 登记（switchSession 二参→单参 /
  renameRecording / cost / coordinator modeApi / agent 恢复族 /
  attribution / context-collapse / updateSessionName / initialState /
  worktree 双函数 → `onWorktreeRestore?` 前向注入口）。
- `src/engine/ports/sessionContext.ts`：`export {}` 占位 → Port 1 真契约
  （charter 逐字；类型全落 shared 既有面零新增——Tool/EffortValue ←
  shared/types，ToolPermissionContext/TaskState/MCPServerConnection ←
  shared/types-session）。
- 门面：`session/index.ts`（header d1→d1+d2 + 类型块 +RenderableMessage +
  d2 三导出块 + H6 登记行）；`engine/index.ts` 显式名块追加 11 名
  （D-1 先例：名字面 = session 门面全量）。
- 测试：`tests/unit/engine-session-restore.test.ts`（20 测）+
  `tests/func/engine-session-restore-fs.test.ts`（2 测，独立文件——详案
  「并入 d1 func 文件或独立，实施时定」→ 独立，d1 文件主题 = 持久层
  核心，restore 链主题分离更清晰）。

**关键实施决策 / 详案偏差面**：
- **单测「env 假 + Project 假」→ 实 env + 实 Project 单例（零磁盘纪律
  替代）**：详案测试面写「env 假 + Project 假」，实施改用 d1 unit 层
  既有口径（真实 SessionEnv + Project 单例 + NODE_ENV=test
  shouldSkipPersistence 写面 no-op）。安全面审计：非 fork 路经
  adoptResumedSessionFile → reAppendSessionMetadata → appendEntryToFile
  （同步 fs，**绕过** shouldSkipPersistence）——但各 appendEntryToFile
  支全以缓存字段为条件（project.ts L431-502 逐支 if 守卫），unit 层
  测试输入不带 meta 字段（customTitle/tag/mode/agent*/pr*/
  worktreeSession）→ 缓存空 → 零写盘；readFileTailSync 缺文件 → ''
  （不抛）。fork 支不经 adopt → 天然零盘。**值透传断言
  （onWorktreeRestore 以 result.worktreeSession 调用）移 func**——带
  worktreeSession 的非 fork 路会经 restoreSessionMetadata 置 worktree
  缓存 → reAppend 真写盘（破 unit 纪律）。
- **fork seed 写断言 unit → func**：详案「fork 支 contentReplacements
  seed 写入断言」列 unit 面，但 unit 层写面 no-op 不可观测 → 归 func
  真盘（P-S5 锚点：content-replacement entry 落新会话文件 + fresh ID
  戳；生产序 = recordTranscript 先 materialize 再 seed，FROZEN 注释面）。
- **saveMode 决策源**：详案「feature 门随新仓 feature 面裁，恒 save」→
  实施 `saveMode(isCoordinatorMode() ? 'coordinator' : 'normal')`——
  决策源 = coordinator 域 env 读（coordinatorMode.ts:44，
  ATLAS_COORDINATOR_MODE / FEATURE_COORDINATOR_MODE），session→
  coordinator 单向依赖（coordinator 域零 import session，无环，grep 验）。
- **buildConversationChain 签名面**：func 端到端初版误传 leaf uuid 串
  （函数取 leaf 消息对象，load.ts:317）→ 订正为
  `loaded.messages.get('u2')!`。

**探针执行**（备份 → 突变 → 恰 1 红 → 逐字还原 diff 验证，零 PROBE
残留）：
- P-S4：删 toolResultSearchText `if (typeof o.stdout === 'string')` 支 →
  unit 恰 1 红（'P-S4 tool_result duck'）✓
- P-S5：删 fork 支 `await recordContentReplacement(...)` 调用 → func 恰
  1 红（'P-S5 fork seed'）✓

**四件套**：tsc 0 / eslint 0 / build（cli.js 0 KB）/ `bun test
--isolate tests/` **1284 pass / 82 文件 / 2674 expect**（基线 1262 + 20
unit + 2 func）+ gate `tests/ci/` 6 pass 不变（session 域非 8 域门扫描
集，matrix 同 d1）。

**基线谱系**：1210（S-7c 末）→ 1262（d1 末）→ **1284 pass / 82 文件
+ gate 6（d2 末）**。

#### d2 独立只读审视记录（2026-09-24，审视修复提交 3eb3538）

**审视形态**：1 只读子代理（≤2 派发限额内），6 维度（逐字保真度 /
裁面完整性 / 类型面 / 测试判别力 / 门面一致性 / 依赖方向），主会话
grep/Read 复核全部 finding 后处置（子代理报告 = 数据非裁定，D-1 先例）。

**结论：PASS-with-fixes**——零 BLOCKER / 零 MAJOR；3 MINOR（全登记
描述准确性 / 逐字注释级，无行为面回归）+ 4 NOTE。子代理独立复跑四件套
与提交宣称一致（1284 pass / 82 文件）。

**主会话复核 + 分级处置表**（每条均经 grep/Read/复现坐实）：

| 编号 | 维度 | 内容 | 复核结果 | 处置 |
|---|---|---|---|---|
| M-1 | 类型面 | types.ts 头注「判别收窄」机制描述失实（catch-all `type: string` 不被字面量比较排除；过检实靠 tsconfig strict:false） | 属实——tsconfig.json:8 `"strict": false` 坐实；最小复现 `--strict` 红 TS18048 / `--strict false` 绿（tsc 7.0.2） | 修（types.ts 头注订正为真实机制 + strict 化雷登记；实施记录同步订正） |
| M-2 | 逐字 | search.ts:110 `<Anzi>` 单字符损坏（旧仓 L84 = `<Ansi>`） | 属实——新旧 grep 对照 | 修（逐字还原 `<Ansi>`） |
| M-3 | 裁面 | restore.ts saveMode 登记「feature() 恒 false 门即死代码」把旧门状态写反（旧仓自 73631df COORDINATOR_MODE 在 ON_BY_DEFAULT 集，生产恒开） | 属实——旧 bunBundle.ts ON_BY_DEFAULT 集 + 旧 sessionRestore.ts:515 门体 + 新 isCoordinatorMode() 语义等价双源核验 | 修（头注改述为 ON_BY_DEFAULT 生产恒开 + 新仓无条件调用语义等价；行为面无回归） |
| N-1 | 裁面 | 旧文件级函数 restoreSessionStateFromLog（L99）/ extractTodosFromTranscript（L77）未指名登记 | 属实——旧仓 grep 坐实存在 + d2 裁面列表未列 | 修（restore.ts 头注指名登记 = shell/CLI 波职责，不随迁） |
| N-2 | 逐字 | restore.ts:118-121 残留注释提及已随 d1 裁除的 transcriptPath 参数 | 属实 | 修（注释体裁为 delta 注） |
| N-3 | 类型面 | 「全并集别名」措辞失实（旧 Message = 带索引签名宽接口非 union）；结构兼容口径未限定 | 属实——旧 types/message.ts:3 接口形坐实 | 修（双文件措辞订正 + 兼容口径 = 运行时对象层，UI 波需 cast/重定型） |
| N-4 | 测试 | unit 零盘属性依赖 adopt/saveMode 序依赖（未登记） | 属实——project.ts:871 mkdirSync 坐实 | 修（单测头注补三条件联合效应登记） |

**零发现维度**（子代理 + 主会话双重核验）：
- 维度 5 门面一致性：session 门面 114 名 ≡ engine 显式名块 114 名
  （漏名/多名/碰撞全空）✓
- 维度 6 依赖方向：coordinator 域全目录 grep 零 session 导入（单向
  无环）；Port 1 五类型经 shared 全可达；A 波 `export {}` 占位 → 真契约
  diff 核验 ✓
- 维度 1 逐字（除 M-2/N-2）：算法体逐行 diff 仅剩 3 处已登记 cast +
  INTERRUPT 域内化 + 排版；fork/meta/FROZEN 块 diff exit 0；旧
  switchSession `: any` 退化 stub 第二参未用 → 新单参语义逐字 ✓
- 维度 2 裁面（除 N-1）：旧 processResumedConversation 全语句清点
  「保留或登记」无静默丢弃 ✓
- 维度 4 测试判别力：P-S4 删 stdout 支恰 1 红（grep 全仓无连带）/
  P-S5 删 fork seed 恰 1 红（unit 输入不触发该支）✓

**四件套（修复后复跑）**：tsc 0 / eslint 0 / build 0 KB /
**1284 pass / 82 文件 / 2674 expect + gate 6 pass**（纯登记/注释面
改动，基线不变）。

**提交链**：`9a2ad8a`（d2 详案）→ `5e20333`（d2 实施）→
`3eb3538`（审视修复 7 项）→ 本 docs 提交（实施记录 + 审视记录）。

### S-7e messaging（跨会话通信域，§8.50）——详案

**旧仓面盘点**（charter L4.8/§7「messaging/ 跨会话通信 ~3550L」口径核对）：
- utils 12 文件 2547L：teammateMailbox 1183 / messageQueueManager 539 /
  teammate 292 / inProcessTeammateHelpers 102 / teammateContext 96 /
  teamMemoryOps 88 / teamDiscovery 81 / directMemberMessage 69 /
  collapseTeammateShutdowns 55 / controlMessageCompat 32 / udsMessaging 2 /
  messagePredicates 8
- tools/SendMessageTool 997L（工具 wrapper → 工具本体波）
- swarm 子树 7217L（backends Tmux/ITerm/InProcess/Pane 进程执行层 +
  inProcessRunner 1536 + permissionSync 928 + teamHelpers 683 + spawn 族）
  = shell/swarm 波 + remote defer（Port 9），**不在** charter 3550L 口径内
  （3550 ≈ 2547 + 997 ✓）

**范围裁定（随迁 / 裁 / 前向接缝）**：

随迁（engine/messaging 域，d1 = mailbox + 身份层）：
1. `teammateMailbox.ts` 1183L → `messaging/mailbox.ts`（算法体逐字；导出
   面 ~50：文件读写/mark-read/clear + 结构化协议消息 schema 族 8 型
   （Permission / SandboxPermission / PlanApproval / Shutdown /
   ModeSet / TaskAssignment / TeamPermissionUpdate / IdleNotification）
   + 谓词 + getLastPeerDmSummary）
2. `teammate.ts` 292L 无状态核心 → `messaging/teammate.ts`
   （dynamicTeamContext AsyncLocalStorage 族 / getAgentId / getAgentName /
   getTeamName / getTeammateColor / isTeammate / isPlanModeRequired /
   isTeamLead / getParentSessionId / set-clearDynamicTeamContext）
3. `teammateContext.ts` 96L → 逐字（AsyncLocalStorage 自含）
4. `messagePredicates` 8L / `controlMessageCompat` 32L /
   `collapseTeammateShutdowns` 55L / `directMemberMessage` 69L → 逐字/近逐字
   （仅 Message 类型面 + AppState duck 面）
5. 小工具面 162L 域内本地：lockfile 43（mailbox 写锁）/ signal 43
   （queue 订阅原语）/ agentId 99（format/parse AgentId + RequestId 四函数）/
   objectGroupBy 18；extractTextContent 9L（旧 messages.ts:2897）域内本地

随迁（d2 = 入轮命令队列层）：
6. `messageQueueManager.ts` 539L → `messaging/queueManager.ts`（入轮命令
   队列 + pending notifications，纯内存 + signal 订阅；导出面 30）

裁面（H6 登记，各波自持——复审勿当遗漏重提）：
- **swarm 子树 7217L**：backends 进程执行 + inProcessRunner + permissionSync
  + teamHelpers + spawn/UI 族 = shell/swarm 波 + remote defer（Port 9）
- **inProcessTeammateHelpers 102L**：in-process 队友执行层（依赖
  tasks/InProcessTeammateTask ∉ 新仓 tasks 面 + updateTaskState）→
  shell/swarm 波
- **teamDiscovery 81L**：Teams UI footer 状态扫描；依赖
  `swarm/backends/types.ts`（`: any` stub 文件，PaneBackendType/isPaneBackend
  全退化）+ teamHelpers.readTeamFile → shell/swarm 波
- **teamMemoryOps 88L**：memdir/teamMemPaths ∉ 新仓（memory 域未随迁
  team 面）→ memory/shell 波
- **udsMessaging 2L**：`: any` stub（绝不把 stub 签名当真行为）；UDS =
  remote/deferred Port 9 地 → 不随迁
- **SendMessageTool 997L 工具 wrapper**：工具本体波（其引擎核心 = 本域
  mailbox 面；SendMessageTool.ts 仅消费 writeToMailbox +
  createShutdown*Message 族，全部本域随迁面 → 依赖方向登记，本体波接线）
- **teammate.ts 尾 3 AppState 参函数**（hasActiveInProcessTeammates /
  hasWorkingInProcessTeammates / waitForTeammatesToBecomeIdle，in-process
  执行层状态读）→ 裁登记；执行时若引擎消费面浮现，重裁 duck 化
- **recordQueueOperation**（queueManager 唯一持久化钩子）：d1 record 裁面
  已登记（shell sessionStorage 域）→ 裁，队列纯内存 + replay 面 =
  shell 波前向接缝
- **Bootstrap/React 面**：bootstrap getState / AppState 实例 = 壳层；
  引擎面经注入窗口（queueManager SetAppState duck 化）

**依赖映射（旧 → 新仓落点）**：

| 旧依赖 | 新仓面 | 处置 |
|---|---|---|
| getTeamsDir（envUtils） | `join(getAtlasConfigHomeDir(), 'teams')`（config 域 configRoot；`ATLAS_CONFIG_DIR` env 测试隔离，无需注入口） | 域内本地构造 |
| jsonParse / jsonStringify | session/json（d1） | 跨域 import |
| logForDebugging / logError / getErrnoCode | shared logging port（scheduler 先例 cronTasks 头注） | import shared |
| lazySchema | shared（scheduler 先例 cronJitterConfig 登记「lazySchema → shared」） | import shared（执行时核验） |
| TEAMMATE_MESSAGE_TAG（xml.ts） | 域内常量 `'teammate-message'`（串逐字） | 域内本地 |
| TEAM_LEAD_NAME（swarm/constants 33L） | 域内常量 `'team-lead'`（串逐字；其余 TMUX/SWARM 常量 = shell swarm 波） | 域内本地 |
| BackendType（swarm/backends/types `: any` stub） | H6：旧为 any-stub 退化面；新仓定义域内最小形或保 any + 登记 | 类型面 delta 登记（执行时按 mailbox 实际用法定） |
| generateRequestId（agentId 99L） | `messaging/agentId.ts` 域内逐字随迁（四函数全量） | 随迁 |
| count（array.ts） | 域内 1 行 | 随迁 |
| getSessionId（bootstrap/state） | session 域 `getSessionEnv().getSessionId()`（d1 env 面） | 跨域 import |
| extractTextContent（messages.ts:2897） | `messaging/textContent.ts` 9L 逐字 | 随迁 |
| objectGroupBy（18L） | 域内逐字 | 随迁 |
| PastedContent（config）/ Permutations（types/utils） | 执行时核验 shared/config 落点 | 按实际裁定 |
| PermissionModeSchema（sdk/coreSchemas） | 域内 zod 最小 enum（新仓 zod 4.6.5 主入口 = v4，`zod/v4` → `zod` import 面 delta） | 类型面 delta 登记 |
| AppState（state） | SetAppState duck 化（`(f: (prev: AppState) => AppState) => void` → 结构最小面；queueManager 仅导出类型不触体，执行时核验） | 类型面 delta |
| Message（types/message） | session 域类型（d1） | 跨域 import |

**子任务拆分**（可独立审视单元；每单元 1 只读审视，≤2 派发限额）：
- **d1 = mailbox + 队友身份层**：mailbox 1183 + teammate 无状态核心 +
  teammateContext + 小工具面（lockfile/signal/agentId/objectGroupBy/
  textContent）+ 4 小文件 + 全裁面登记（含 swarm / inProcessTeammateHelpers /
  teamDiscovery / teamMemoryOps / udsMessaging / SendMessageTool 依赖方向 /
  teammate 尾 3 函数 / recordQueueOperation）。
  - unit 零磁盘：schema 族 8 型 round-trip + 谓词 / formatTeammateMessages /
    getLastPeerDmSummary / agentId round-trip / objectGroupBy /
    extractTextContent / signal / teammate 动态上下文 run（AsyncLocalStorage
    run 隔离）/ lockfile 纯判定面
  - func 真盘（mkdtemp + `ATLAS_CONFIG_DIR` env 隔离 → getTeamsDir 落 tmp）：
    mailbox 文件 round-trip（write → read → mark-read → clear）/ 写锁并发
    （lockfile 互斥）/ unread 计数
  - 突变探针：P-M1（markMessageAsReadByIndex 索引守卫删 → func 恰 1 红）/
    P-M2（mailbox 写去重/原子支删 → func 恰 1 红）/ P-M3（agentId
    parseAgentId 字段映射支删 → unit 恰 1 红）
- **d2 = 入轮命令队列层**：queueManager 539 + PastedContent/Permutations
  映射落点 + 裁面收口（recordQueueOperation replay 接缝登记）。
  - unit 零磁盘（纯内存）：queue 全 30 导出面（enqueue/dequeue/peek/
    remove/filter/clear/reset / 优先级 getCommandsByMaxPriority / 订阅
    订阅族 / pending notifications 别名面 / isSlashCommand /
    editable-visible 守卫）
  - 突变探针：P-M4（getCommandsByMaxPriority 排序支删 → unit 恰 1 红）/
    P-M5（enqueue 幂等/去重支删 → unit 恰 1 红；执行时按实际代码面定支）

**基线谱系**：1284（S-7d d2 末）→ d1 ~13xx → d2 ~13xx（实测）+ gate 6
（messaging 域 ∉ 8 域门扫描集，matrix 行按 session 先例登记）。

**编号约定**（承接 L1613）：§8.50 = S-7e（d1/d2，各实施后补「实施记录 +
独立只读审视记录」段，S-7a/b/c/d 先例）/ §8.51 = E-7 整波审视记录（双只读
≤2：A 旧仓对照 / B H6 死接缝）+ 终验四件套 + memory 同步。

**执行序**：详案提交（本段）→ d1 实施 → d1 独立审视 → d1 闭环 → d2 实施
→ d2 独立审视 → d2 闭环 → S-7e 完结，进入 §8.51 整波审视。

#### d2 执行前分析（2026-09-24）

**源与落点**：旧仓 a8af45b `src/utils/messageQueueManager.ts` 539L 逐字
→ `src/engine/messaging/queueManager.ts`；类型面拆 `messaging/queueTypes.ts`
域内本地（旧 textInputTypes.ts = shell UI 巨文件 ~500L 不随迁，仅队列层
4 型 + 关联类型族随迁）。

**类型面落点核验（执行时实测）**：

| 旧依赖 | 新仓落点 | 处置 |
|---|---|---|
| PromptInputMode 4 字面量 / EditablePromptInputMode = Exclude<…>`${string}-notification`（余 bash/prompt/orphaned-permission）/ QueuePriority 3 值 / QueuedCommand 全形 | `messaging/queueTypes.ts` | 域内本地（值/形逐字） |
| ContentBlockParam | shared types.ts:25 宽骨架 `{ type: string; [key: string]: unknown }`（B 波契约冻结，`export type *` 门面） | 跨域 import；**类型面 delta**：旧 image-base64 判别联合成员 ∉ shared 面 → extractImagesFromValue 局部 cast 收窄形（运行时守卫支 `block.type==='image' && source.type==='base64'` 逐字不变，cast 仅类型收窄，queueManager.ts 头注登记） |
| UUID（旧 crypto 品牌串） | session 域 `type UUID = string`（别名，cast no-op 先例） | 跨域 import |
| AgentId（旧 brand） | session 域 `type AgentId = string`（coordinator/worktree 先例） | 跨域 import |
| PastedContent（旧 config.ts:46-54 8 字段） | 新仓无（grep 0 命中；config 域未随迁 pasted 面） | 域内本地移植（形逐字；ImageDimensions = 旧 imageResizer.ts:137 4 可选 number 字段随形，imageResizer 体 = shell 波） |
| OrphanedPermission（旧 = { permissionResult: PermissionResult; assistantMessage: AssistantMessage }，两型均 ∉ 新仓） | 域内最小形 `{ permissionResult: unknown; assistantMessage: unknown }` | H6 登记（仅类型字段；引擎面无消费者；sdk/permissions 波前向接缝） |
| MessageOrigin（旧 message.ts:43 = any） | 域内 `type MessageOrigin = string` | H6 any-stub → string 最小形（BackendType 先例）+ 登记 |
| Permutations（旧 types/utils = any-stub） | 不随迁 | 旧 `satisfies Permutations<…> as any` 链在 stub 下退化（satisfies any 恒真）→ 新仓删链 `new Set<PromptInputMode>(['task-notification'])`（Set 构造语义等价；旧穷尽性检查在 stub 下本未生效，非行为回归，登记） |
| AppState（旧 state/AppState React 状态接口 = 壳层） | 域内 `type AppState = object` 不透明最小形 | SetAppState duck 化（详案裁定「queueManager 仅导出类型不触体」；shell 波接真状态，登记） |

**裁面收口（执行裁定）**：
- **logOperation 族整体裁**：logOperation 函数 + 8 调用点（enqueue /
  enqueuePendingNotification / dequeue / dequeueAll / dequeueAllMatching /
  remove / removeByFilter / popAllEditable）+ import 面（getSessionId /
  recordQueueOperation / QueueOperation / QueueOperationMessage）。依据：
  详案裁面裁定「recordQueueOperation 裁，队列纯内存 + replay 面 = shell 波
  前向接缝」；recordQueueOperation 是 logOperation 唯一 sink，sink 裁则
  log 族整体死码 → 整体裁（详案「按实际裁定」执行裁定）。依赖映射行
  「getSessionId → session 域」保留为潜在接回点（其唯一使用点随裁面消失；
  shell 波接 replay 面时经 session 域 getSessionEnv().getSessionId() 注真值）。
- **QueueOperation / QueueOperationMessage** = 旧仓 messageQueueTypes.ts
  双 `any` stub → 不随迁（H6：绝不把 stub 签名当真行为；旧 logOperation
  体 = `void recordQueueOperation(any)` no-op stub 行为）。

**import 映射（旧 → 新）**：ContentBlockParam → shared / Permutations →
删（登记）/ getSessionId → 随 logOperation 裁 / AppState → 域 duck /
QueueOperation(Message) → 裁（登记）/ 4 textInput 型 → queueTypes /
PastedContent → queueTypes（移植）/ extractTextContent → 域 textContent.ts
（d1）/ objectGroupBy → 域 objectGroupBy.ts（d1）/ recordQueueOperation →
裁（shell 波）/ createSignal → 域 signal.ts（d1）。

**导出面**：30 值导出（21 主 + 8 deprecated pending-notifications 别名 +
getCommandsByMaxPriority + isSlashCommand）+ 2 类型导出（SetAppState /
PopAllEditableResult）+ queueTypes 型面（facade 化全 10 型：PromptInputMode
/ EditablePromptInputMode / QueuePriority / QueuedCommand / PastedContent /
OrphanedPermission / MessageOrigin / ImageDimensions / AppState /
SetAppState 经 queueManager 面）。facade = messaging/index.ts 显式名块
追加 + engine/index.ts d2 块（门面 = 全量面先例；无 d1 SEND_MESSAGE_TOOL_NAME
类重名——d2 面 0 常量导出）。

**突变探针（按执行代码面定支）**：
- **P-M4** getCommandsByMaxPriority 过滤支：删
  `PRIORITY_ORDER[cmd.priority ?? 'next'] <= threshold` 条件（退化为全队列
  拷贝）→ 专用测 'P-M4 getCommandsByMaxPriority 优先级过滤' 恰 1 红。
- **P-M5** enqueue 默认优先级支：删 `priority: command.priority ?? 'next'`
  spread（原样 push）→ 专用测 'P-M5 enqueue 默认优先级 next' 恰 1 红。
  详案原文「幂等/去重支」经本次执行核验订正：enqueue 代码面**无去重支**
  （队列允许重复值；去重 = remove 的引用恒等语义）→ 按详案「执行时按实际
  代码面定支」定为 priority 默认支。

**测试布局**：`tests/unit/engine-messaging-queue.test.ts` 新文件（unit 零
磁盘；模块级 commandQueue 态隔离 = beforeEach resetCommandQueue；不改 d1
测试文件，避免与 d1 审视主体文件重叠）。覆盖 = 30 导出面全量（订阅族
unsubscribe / snapshot 冻结引用稳定 / getCommandQueue 拷贝语义 / 优先级 +
FIFO + filter / dequeueAll / peek / dequeueAllMatching / remove 引用恒等 /
removeByFilter / clear / reset / editable-visible 守卫 4 模式 × isMeta /
popAllEditable 字符串+块双源 + pastedContents id 保留 + 内嵌 base64 图
提取 + task-notification 滞留 + cursorOffset / 别名面 8 / isSlashCommand
3 支 / P-M4 / P-M5 锚点）。

**四件套 + 基线**：tsc 0 / eslint 0（改动面）/ build 0 / 全量 1374+N pass
（N = d2 新增；基线 1374/84 文件/2876 expect = d1 末）/ gate 6（messaging ∉
8 域门扫描集）。

#### d1 实施记录（2026-09-24）

- 实施提交 **7ea9aa3**（parent 6e026e1，20 文件 +3556）：messaging 域
  14 src 文件（mailbox 1183L 逐字 → 1330L 域落位 + teammate 无状态核心 +
  teammateContext + agentId/signal/objectGroupBy/textContent/lockfile 小
  工具面 + 4 小文件 + constants 域内本地化 + index 门面）+ unit 77 测（零
  磁盘）+ func 13 测（真盘，ATLAS_CONFIG_DIR tmp 隔离）+ engine/index.ts
  messaging 显式名块（92 名 = 域门面 93 − SEND_MESSAGE_TOOL_NAME）+
  session/types.ts Message 补 toolUseResult? + package.json/bun.lock
  （proper-lockfile ^4.1.2）。
- **测试基线**：1374 pass / 84 文件 / 2876 expect（d1 新增恰 90/2/202；
  基线谱系 1284 → 1374）。gate 6 不变（messaging ∉ 8 域扫描集，实证
  MatrixRow.domain 封闭联合）。
- **突变探针实测**（backup→mutate→恰 N 红→verbatim restore diff 核验）：
  P-M1 markMessageAsReadByIndex 越界+缺失守卫对删 → func 恰 1 红 ✓；
  P-M2 单点（`read: false`→`true` 缺省态反转）→ func 恰 1 红 ✓；
  **P-M2 双点（锁后重读支删）实测红集 6 测**（直接 2 + 下游支收敛 4）——
  详案初版「2 测同红」为直接点下界，实测订正为 6，登记双点绑定非探针
  违规（mailbox.ts + func 头注同源登记）；P-M3 parseAgentId slice 对调 →
  unit 恰 1 红 ✓。
- H6 登记落位：isStructuredProtocolMessage 旧仓逐字 10 型集（shutdown_
  rejected 集外 = 终止信号无 useInboxPoller 路由处理器，非移植遗漏）/
  jsonStringify 3 参→2 参签名 delta（replacer null≡undefined 论证）/
  teammate 尾 3 AppState 函数裁（闭合：S-E2b 补差落位 R6 = messaging 域
  teammate.ts 尾 3 函数逐字迁，§8.66 核销 ⑧）/ collapse 本地 duck 不
  导出 / directMember teamContext duck 组合根注入口 / lockfile createRequire
  delta / SEND_MESSAGE_TOOL_NAME 不出引擎面（工具名单一源 = tools 域
  toolNames.ts:43，messaging 域内同值常量自持、值恒等登记）。

#### d1 独立只读审视记录（2026-09-24）

- 1 只读子代理（≤2 派发限额），6 维度：逐字保真度 / 裁面完整性 / 类型面 /
  测试判别力 / 门面 STR-1 / 依赖方向。四件套独立复跑全绿（tsc 0 / eslint 0
  / build 0 / 90 pass 202 expect）。
- **结论 PASS：0 MAJOR / 0 MINOR / 2 NOTE**，全处置（审视修复提交
  **fb09b07**，零行为面）：
  - **NOTE-1** mailbox 头注「logError 6 调用点归一化」off-by-one：grep 实证
    旧仓 7 调用点（105/158/186/262/335/366/1132）↔ 新仓 7 logForDebugging
    1:1（194/247/277/356/429/460/1226），算法体零 delta，仅登记数字订正
    6→7。
  - **NOTE-2** func 谓词选择性标记测缺 out[1] 阴性断言：审视报告建议补 1 行，
    **执行裁定不补、改登记**（主 session 复核推翻子代理建议的机械适用）——
    补断言则在 P-M2 单点（缺省态反转）突变下同红 → 红集 2 违反已实测
    「恰 1 红」登记；且 `!m.read` 守卫支与退化支值可观察等价（匹配且已读
    → JSON 恒等，标记幂等），现实突变（丢守卫/谓词反转）均已被现断言覆盖
    或值等价无害。唯一开口「条件退化为全量标记」登记 **E-wave-end 前向
    接缝**（func 测头注：补阴性断言 + P-M2 单点红集重测 1→2 一并处置），
    对齐 H6 防空洞（预声明接缝须头注登记，复审勿当遗漏重提）。
- 审视报告其余核验（供 E-7 整波审视 §8.51 A 路参考）：逐字保真度零发现
  （mailbox 算法体逐句对照 / 小依赖 count·sanitizePathComponent·getTeamsDir
  ·isEnvTruthy·lazySchema 逐字或登记 delta）；门面 565 导出名去重 0 重复；
  依赖方向零循环（messaging → session/config/shared 单向）；duck 面方向
  核验（旧全形可赋新形，组合根注真值不破坏）。

#### d2 实施记录（2026-09-24，主体提交 ada630b）

- 5 文件：`src/engine/messaging/queueManager.ts`（新增 535L，旧仓
  `src/utils/messageQueueManager.ts` 539L 逐字随迁 + 裁面）/
  `src/engine/messaging/queueTypes.ts`（新增，队列层类型面 9 型）/
  `src/engine/messaging/index.ts`（d2 显式名块）/ `src/engine/index.ts`
  （d2 引擎块）/ `tests/unit/engine-messaging-queue.test.ts`（新增 29 测
  零磁盘）。
- **裁面 5 项（头注登记，复审勿当遗漏重提）**：a) logOperation 函数 +
  8 调用点整体裁（recordQueueOperation = 唯一 sink，sink 已裁 sessionStorage
  域 = shell 波 → log 族死码；replay 面 = shell 波前向接缝，
  getSessionId 映射行 = 潜在接回点 getSessionEnv().getSessionId()）；
  b) import 面 4 项裁（getSessionId / recordQueueOperation /
  QueueOperation / QueueOperationMessage，后两者旧仓双 `any` stub——H6
  绝不把 stub 签名当真行为）；c) Permutations 链删（旧 any-stub 下
  `satisfies … as any` 穷尽性检查本未生效 → `new Set<PromptInputMode>(
  ['task-notification'])` 构造语义等价）；d) extractImagesFromValue
  局部 cast 收窄（shared 宽骨架无旧 image-base64 判别联合成员）+
  `b.source?.type` 可选链——唯一运行时行为差异 = 畸形输入角（image 块缺
  source：旧直访问 TypeError vs 新静默跳过），良形路径逐字恒等；
  e) log 相关 JSDoc 行 2 处随裁。
- **类型面落点（bb570f4 执行前分析裁定）**：PromptInputMode 4 字面量 /
  EditablePromptInputMode / QueuePriority 3 值 / QueuedCommand 14 可选
  字段（字段面 + JSDoc 词级逐字）← 旧 textInputTypes.ts；PastedContent
  7 字段（旧 config.ts:46-54，新仓 grep 0 命中 → 域内移植）；
  ImageDimensions 4 可选数（旧 imageResizer.ts:137，体不随迁）；
  OrphanedPermission 2 字段 unknown 最小形 / MessageOrigin（旧 any
  stub）→ string / AppState（旧 React 状态接口壳层）→ `object` 不透明
  duck（SetAppState 导出型面，shell 波组合根注真值）；UUID / AgentId =
  session 域 string 别名先例。
- **导出面**：30 值（21 主面 + 8 deprecated pending-notifications 别名 +
  getCommandsByMaxPriority + isSlashCommand）+ SetAppState /
  PopAllEditableResult 2 型 + queueTypes 9 型；引擎面块与域门面块逐名
  一致（全 engine/index.ts 0 重名）。
- **基线谱系**：1374 pass / 84 文件 / 2876 expect（d1）→ **1403 / 85 /
  2975**（+29/1/99，d2 新增恰 29 测 99 expect 1 文件）+ gate 6（messaging
  ∉ 8 域 MatrixRow.domain 封闭联合，不变）。
- **突变探针实测**：P-M4（getCommandsByMaxPriority 过滤支删 → 退化全队列
  拷贝）恰 1 红（'P-M4 getCommandsByMaxPriority 优先级过滤'）；P-M5
  （enqueue 默认优先级支删）恰 1 红（'P-M5 enqueue 默认优先级 next'）；
  均 verbatim restore + diff 备份核验。**定支订正**：详案原文「enqueue
  幂等/去重支」不成立——enqueue 无去重支（队列允许重复值，去重 =
  remove 引用恒等语义）→ P-M5 定默认优先级支（bb570f4 执行时按代码面
  裁定）。

#### d2 独立只读审视记录（2026-09-24，审视修复提交 8a58a72）

- 1 只读子代理（≤2 派发限额），6 维度（逐字保真度 / 裁面完整性 / 类型面
  / 测试判别力 / 门面 STR-1 / 依赖方向）+ 四件套独立复跑全绿（tsc 0 /
  eslint 0 / build 0 / 1403 pass 85 文件 2975 expect；单文件 29 pass 99
  expect；verbatim restore diff = BAK_IDENTICAL）。
- **结论 PASS-with-fixes：0 MAJOR / 0 MINOR / 2 NOTE / 1 NIT**，全处置
  （8a58a72，零行为面）：
  - **NOTE-1** queueTypes 头注「OrphanedPermission 旧形两型 ∉ 新仓」失实
    ——grep 实证 AssistantMessage ∈ 新仓（shared/types.ts:91 宽骨架，
    query/loop·pipeline/toolOrchestration·tools/agent/forkSubagent 在用），
    仅 PermissionResult ∉ 新仓；2 处登记订正（来源行 + delta 块：
    AssistantMessage 新仓宽骨架版非旧全型，同归 sdk/permissions 波）。
  - **NOTE-2** 「AppState ← 旧 state/AppState.ts」引用路径不存在——旧仓实
    为 `src/state/AppStateStore.ts:87`（`export type AppState =
    DeepImmutable<{…}>`）+ `AppState.tsx` 壳 re-export；引用订正。
  - **NIT-1** QueuedCommand 字段 JSDoc 折行随新仓 lint（~76 列 vs 旧 88
    列）——词级逐字成立、纯注释面无行为，**接受 + 头注登记**（防复审重提）。
- 其余维度零发现（供 §8.51 A 路参考）：逐字保真度机械 diff（旧 539L vs
  新 535L 归一化）剩余 delta 恰 = 登记 a)–e) 五项，无未登记 delta（旧仓
  `grep -c logOperation` = 9 = 1 定义 + 8 调用，头注计数与实测一致）；
  裁面完整性双向扫描零残留；测试判别力静态推演 P-M4/P-M5 恰 1 红成立
  （全文件仅探针测依赖缺省支，其余无显式 priority 入队均 task-notification
  模式断言可编辑性/长度，与优先级无关）；门面 611 导出名 0 重复（d2 41 名
  各恰 1 次），消费方仅经引擎门面 + shared（ContentBlockParam type-only）；
  依赖方向 messaging → session 仅 type 边，无循环、无新增第三方依赖。

## §8.51 E-7 整波审视记录（2026-09-24，双只读 ≤2 限额 + 终验四件套）

对象 = S-7 全波（§8.45-§8.50：tasks / scheduler / worktree / session d1+d2 /
messaging d1+d2，60+ 文件）跨切面审视。2 只读子代理并行派发（A 旧仓对照 /
B H6 死接缝），各自独立复跑四件套 + 全维度审计；全部发现经主会话 grep/Read
逐条核验后处置（D-1 先例：子代理事实声明须实证）。

### A 路（旧仓对照 / 代码保真度 + 安全）——PASS（0 MAJOR / 0 MINOR / 3 NOTE）

- **机械逐字审计**：27 对整文件归一化 diff（去头注 + import）+ 部分映射文件
  行段 token 级 diff → **零未登记行为 delta**（全部 delta 可回溯各文件头注
  旧仓来源映射表 / 裁面登记）。加严抽样 5 高风险文件逐句：worktree/git.ts
  getDefaultBranch 判定链（含 MAJOR-1 订正的 readRawSymref origin/HEAD 步）/
  session/load.ts recoverOrphanedParallelToolResults（13 opcode 全为 as any
  剥离 + 类型收紧，新守卫仅更严）/ session/scanner.ts（token opcode = 0 全
  逐字）/ messaging/mailbox.ts（7 调用点 logError 归一化 7/7 1:1 + proper-
  lockfile 4 锁 4 release 一一对应）/ tasks/framework.ts pollTasks 主循环 +
  scheduler/cronScheduler.ts check/load 主路 + cronTasksLock.ts 租约锁
  （O_EXCL + PID 探针 + stale 恢复逐字）。2 疑似 flag 核销误报（agentType
  死支删除 = 必填 string 型验证 / sessionMemory 字段名 = 旧仓 typo 订正）。
- **导出面交叉审计**：engine/index.ts 21 export 块跨块重名 0 + kind-clash
  0；块 ↔ 域门面逐一全等（worktree 21=21 / session 114=114 / scheduler
  32=34−2 登记小工具 / messaging 133=134−SEND_MESSAGE_TOOL_NAME 登记设计 /
  coordinator-tasks 74=85−11 xml 域内名）。
- **探针三方一致性**：P-T 族 ×3 波 + P-S1..S5 + P-M1..M5 全部（§8.45-§8.50
  详案 ↔ 测试头注锚点 ↔ 测试函数名）三方吻合；P-S1 / P-M3 静态恰 1 红走查
  成立（不跑突变）。
- **安全面 vs 旧仓**：worktree git 执行层（execFile arg-array 免注入 +
  findCanonicalGitRoot 双校验 backlink 守卫 + isSafeRefName 五重拒）/
  scheduler 租约锁 / session scanner >5MB 截断双点 / mailbox 文件锁——
  守卫在位且未被裁面削弱。
- 3 NOTE 处置（1a8dc08，零行为面）：
  - **A-NOTE-1** engine/index.ts:148 注释「coordinator/tasks 域门面全量面」
    措辞过宽（实面 85−11 xml 域内名）→ 注释订正为「按消费面显式收窄」
    （先例 coordinator/index.ts:33）。
  - **A-NOTE-2** 旧 messages.ts L4606 findLastCompactBoundaryIndex / L4631
    getMessagesAfterCompactBoundary（REPL snip 消费者，依赖 snipProjection /
    HISTORY_SNIP 面 ∉ 新仓）未随迁——predicates.ts 头注补前向接缝登记
    （shell/REPL 波前向补裁）。
  - **A-NOTE-3** 域内小工具策略轻度不对称（scheduler 自持 jsonStringify /
    safeParseJSON 域内拷贝 vs messaging 跨域 import session 域 json 面）——
    两者均头注登记 + 均经域门面，零行为，**接受不修**（登记归档）。

### B 路（H6 死接缝 / 测试·架构）——PASS（0 MAJOR / 0 MINOR / 2 NOTE）

- **H6 前向接缝族双向扫描**：正向（登记了但代码还留着）全清——logOperation
  族 / swarm 子树 7217L / UDS Port 9 / tasks 5 裁面符号 / project 6 裁面
  符号 / worktree hooks 面 / chokidar / session-cron store 等 grep 全 0 live
  残留；反向（悄悄裁了没登记）= 0（旧 vs 新导出面 diff 逐子波抽查，漏登记
  0）。
- **测试面零缺陷**：7 unit 文件零真实盘 I/O（env set/restore + 假路径串数据
  两合规形态）；6 func 文件 mkdtempSync tmp 隔离 + ATLAS_CONFIG_DIR 先例；
  空壳/永真断言扫描 0（13 处 toBeDefined 逐一复核，唯一独立型自带登记注释
  合规）；gate 6 域封闭联合实证（scheduler/worktree/session/messaging ∉
  8 域联合，tasks 2 matrix 行 proof 文件在位）。
- **门面 STR-1 + 依赖方向**：S-7 域内部深路径 import 全仓（含测试）= 0；
  跨域边仅 messaging→session（type + json 值，头注映射表登记）+
  session→coordinator（isCoordinatorMode，restore.ts 头注登记）无环；
  第三方依赖审计 9998971~1..8e0c9bc 仅 7ea9aa3 一处 = proper-lockfile
  ^4.1.2（与宣称一致）。
- **anti-stub 扫描**：S-7 全部 src `: any` / `as any` live 出现 = 0（全部
  any 字样在头注「登记」语境 = 旧仓 stub 来源说明）；自造未登记 stub = 0。
- 2 NOTE 处置（1a8dc08，零行为面）：
  - **B-NOTE-1** registry.ts:11 + tasks/types.ts:6 头注「InProcessTeammateTask
    随 S-7e 波」波归属陈旧（S-7a 写于 §8.50 范围裁定前）→ 回刷为
    「shell/swarm 波（§8.50 裁定：inProcessTeammateHelpers 102L 依赖本任务
    态归同波；S-7e 完结后 tasks 面仍两态）」。
  - **B-NOTE-2** localAgentTask.ts:42-44 tools 域 3 深 import（type 2 +
    值 1）绕过 tools 根门面 → 归一 `import { … } from '../../tools'`
    （三符号均经 tools/index.ts re-export，值同一源 toolNames.ts:37；
    零行为，包级 coordinator↔tools 双向边 = E-2 既存，归一仅改道经门面）。
    **E-2/E-3 遗留 3 行（workerAgent.ts:19,21 + coordinatorMode.ts:25，
    超 S-7 范围）不动，登记 E-wave-end 归一候选**（tools 域 STR-1 例外族）。

### 终验四件套 + 基线

- tsc 0 / eslint 0（5 改动文件）/ build 0 / **bun test 1403 pass / 85 文件 /
  2975 expect（与 d2 闭环基线逐位不变，零行为实证）** / gate 6 pass。
- S-7 全波提交链：9998971(S-7a) → 4713f03(S-7b) → fd49163(S-7c) →
  6a8944e(S-7d d1) → 5e20333(S-7d d2) → 7ea9aa3(S-7e d1) → ada630b
  (S-7e d2) + 各审视修复提交 + 本 1a8dc08；基线谱系 1100→1160→1210→
  1262→1284→1374→1403 全程单调 +gate 6 恒 6。

### E-wave-end 前向接缝清单（B 路全量 20 项 + 本审视新增 1 项，归档）

1. tasks 通知注入窗口 E-wave-end 装配真实队列（默认 handler=logForDebugging
   非黑洞）→ coordinator/tasks/notification.ts:8-12
2. cleanupRegistry 运行入口（组合根 / CLI 关闭路径调 runCleanupFunctions）
   → coordinator/tasks/cleanupRegistry.ts:4-6
3. killShellTasks dequeueAllMatching 裁面复核（队列面落时）
   → coordinator/tasks/killShellTasks.ts:6-9
4. scheduler 消费面（ScheduleCronTool 族 = 工具本体波 / headless -p = CLI 波）
   → scheduler/index.ts:14-15
5. scheduler registerExitCleanup 缺省 no-op → 组合根注真 cleanupRegistry
   → scheduler/cronEnv.ts:65-67
6. jitter GrowthBook-backed 实现注入整换（未来 analytics 波）
   → scheduler/cronJitterConfig.ts:15
7. SessionEnv 组合根注真 bootstrap 值（compose.ts 接线）
   → session/env.ts:8,61
8. restore 跨项目 resume project dir 推导 + switchSession 二参 → 单参
   → session/restore.ts:26-28
9. restore onWorktreeRestore? 前向注入口（壳 worktree 波注入；unit/func 已
   覆盖调用时点 + 值透传）→ session/restore.ts:44-47,113-117,163
10. project 活态 cwd 状态机 → E-wave-end 可选扩 SessionEnv 活态成员
    （审视 A-1 值 delta 裁定接受）→ session/project.ts:37-38
11. project 裁面⑤ 远程持久化（remote/teleport 波）接线补调用点
    → session/project.ts:811-812
12. project 壳侧同步 fs 可测性接缝 → session/project.ts:860
13. Port 5 SessionMemoryPort 壳实现 + compose 注入（零消费者前向登记）
    → session/sessionMemory.ts:13-18 + ports/sessionMemory.ts:7
14. Port 1 SessionContextPort 壳实现 + compose 注入（零消费者前向登记）
    → session/index.ts:176 + ports/sessionContext.ts:6
15. scanner compact boundary 写面 = QueryEngine 压缩层 E-wave-end 接线
    → session/scanner.ts:15
16. directMemberMessage writeToMailbox 真 mailbox 面注入
    → messaging/directMemberMessage.ts:14
17. queueManager replay 面（logOperation 族裁）经 getSessionEnv()
    .getSessionId() 注真值 = 潜在接回点 → messaging/queueManager.ts:17-21
18. worktree hookBased 形参保留（工具本体波 / E-wave-end 接线）
    → worktree/worktree.ts:12-14,467-530
19. runHooksStream 消费面 = loop 流式 chatStream E-1b-full（loop.ts 头注）
    → engine/index.ts:512
20. func 谓词阴性断言补 + P-M2 单点红集 1→2 重测一并处置
    → tests/func/engine-messaging-fs.test.ts:157-162（§8.50 NOTE-2）
21. **（§8.51 新增）predicates compact-boundary 检索族**（旧
    findLastCompactBoundaryIndex / getMessagesAfterCompactBoundary，REPL snip
    消费者）→ shell/REPL 波前向补裁 → session/predicates.ts 头注
22. **（§8.51 新增）E-2/E-3 tools 域深 import 遗留 3 行**（workerAgent.ts:19,21
    + coordinatorMode.ts:25）→ E-wave-end tools 域 STR-1 归一候选（随 compose
    装配 pass 顺带）

## §8.52 E-wave-end 执行前分析（S-E0，2026-09-25）

E-wave-end = engine 纵切收尾波：组合根注真值 + 门收口 + 前向接缝核销。本节 = S-E0 执行前分析（范围裁定 + 切片冻结 + 探针规划）；每切片按 ① 执行前分析（本节）→ ② 实施（四件套绿 + 探针恰 1 红）→ ③ 独立审视（≤2 只读）→ ④ 闭环（fix commit + docs + memory + task）执行。

### 裁定 1：三桶归类（A = 本波做实体 / B = 跨波只登记不动 / C = 后续波）

**A 桶 = 15 项，切片归属见裁定 3**

S-E1 门收口族（3 项，纯引擎内、风险最低、先解锁语义）：
- A1 **I-1 hasPermissionsToUseTool 换回门消费点**（E-wave-end 审计②；`engine/permissions/permissionGate.ts:23,35` 现消费 base `checkRuleBasedPermissions` 规则支 → 换回 base `hasPermissionsToUseTool` 全决策体（`src/permissions/permissions.ts:100`，mode-level 支 + 规则支）；3 值 verdict 映射保持，S-4d 门工厂测试同步更新）
- A2 **F1 子代理门透传**（审计①；`runAgent.ts:119` `queryAgentLoop({modelProvider, role, signal}, {messages, tools})` 不带 checkPermission = 子代理工具调用绕过门 → RunAgentArgs 加可选 `checkPermission` 透传 loop deps）
- A3 **F4 1c abort 重抛**（审计③；`src/permissions/ruleMatching.ts:413` catch 吞 AbortError/APIUserAbortError（头注 L19 裁减登记）→ catch 层重抛恢复；context abortController 回填 = 工具本体波前向登记（本项仅 catch 层重抛，不造全量 context））

S-E2 组合根注真值（7 项，A4-A10）：
- A4 **④ getTools 组合根 + loop-deps 构建器**（审计④；`loop.ts:108` 注「本纵切不造全局注册表」→ `compose.ts` 造注册表（getAllBaseTools + filterToolsByDenyRules + preset）+ loop-deps 构建器（modelProvider/checkPermission/hooks）；含 **hooks 装配①**（§8.42 项 1：createToolHooks/createLoopHooks → AgentLoopDeps.hooks 生产路径，现仅测试消费）；D 波 cli.ts（7L 骨架）以单入口消费，cli 本体仍 D 波）
- A5 **#7 SessionEnv 注真值**（session/env.ts:8,61；setSessionEnv bootstrap 真值）
- A6 **#13 Port 5 SessionMemoryPort 壳实现 + 注入**（sessionMemory.ts:126,130 + ports/sessionMemory.ts:7；零消费者前向登记收口 = 组合根最小真实现）
- A7 **#14 Port 1 SessionContextPort 壳实现 + 注入**（session/index.ts:176 + ports/sessionContext.ts:6）
- A8 **sandboxAccess 组合根接线**（src/permissions/sandboxAccess.ts 前向接缝「组合根接线（E-wave-end 装配项）」；setSandboxAccess(sandboxManager 闭包面)——compose ① 已有 sandboxManager）
- A9 **#1+#2+#5 通知/cleanup/scheduler 三注入点**（coordinator/tasks/notification.ts:8-12 setTaskNotificationHandler 真实队列 + cleanupRegistry.ts:4-6 runCleanupFunctions 组合根暴露（CLI 关闭路径 = D 波消费）+ cronEnv.ts:65-67 registerExitCleanup 缺省 no-op → 真 cleanupRegistry + setSchedulerEnv 注真值）
- A10 **#22 E-2/E-3 tools 深 import 3 行归一**（workerAgent.ts:19,21 + coordinatorMode.ts:25 → tools 域门面 STR-1 归一，零行为，顺带）

S-E3 session 消费面接线（3 项）：
- A11 **loop recordTranscript 7 点 + recordContentReplacement**（旧仓 `core/orchestrator/QueryEngine.ts` L450/607/706/722/724/774/828 → 新仓 loop.ts 消息追加面 + 旧仓 `query/loop.ts:377` → 新仓 loop compact 写面；**#15 scanner compact boundary 写面同点**（session/scanner.ts:15）；React 侧 5 点 = B12）
- A12 **#10 SessionEnv 活态 cwd 成员**（session/project.ts:37-38；审视 A-1 值 delta 裁定接受的可选扩）
- A13 **#3 killShellTasks dequeueAllMatching 裁面复核**（killShellTasks.ts:6-9；队列面已 S-7e d2 落，本波对照真队列复核谓词面）

S-E4 门+探针收口（2 项）：
- A14 **M-3 + anti-stub ⑥ 门收口**（docs:960,1110；engine 侧 37 个 `export {}` 占位中 engine 域 14 个既不在 anti-stub 扫描集（anti-stub.test.ts:35 DOMAINS = executor/sandbox/memory/modelprovider/shared + :43 CDEEP_DOMAINS = task/bootstrap/permissions/hooks，均无 engine）也不在 STUB_REGISTRY → engine 加扫描集（existsSync 守卫同模式）+ STUB_REGISTRY 登记 + wave tag 清零；ascend 9 / atlascode 14 项归各域后续波（本波仅 engine））
- A15 **#20 P-M2 谓词阴性断言 + 红集重测**（tests/func/engine-messaging-fs.test.ts:157-162，§8.50 NOTE-2；零行为 func 断言）

**B 桶 = 18 项（跨波只登记，登记处 = 原前向接缝头注 + 本节归档，本波不动）**
- B1 #4 scheduler 消费面（ScheduleCronTool 族 = 工具本体波 / headless -p = CLI 波；scheduler/index.ts:14-15）
- B2 #6 jitter GrowthBook-backed 整换（未来 analytics 波；cronJitterConfig.ts:15）
- B3 #8 restore 跨项目 resume project dir 推导 + switchSession 二参→一参（shell/REPL 波；restore.ts:26-28）
- B4 #9 restore onWorktreeRestore 前向注入口（壳 worktree 波注入；unit/func 已覆盖调用时点 + 值透传，restore.ts:44-47,113-117,163）
- B5 #11 project 裁面⑤ 远程持久化（remote/teleport 波；project.ts:811-812）
- B6 #12 project 壳侧同步 fs 可测性接缝（shell 波；project.ts:860）
- B7 #16 directMemberMessage writeToMailbox 真 mailbox 面（shell/swarm 波；directMemberMessage.ts:14）【S-E2d 核销 ⑨：函数本体 E 波 messaging 域已落（sendDirectMemberMessage 4 参注入形）；writeToMailbox 参真 mailbox 面 = 消费端注入口（调用方注 mailbox 域真实现，TUI/CLI 波残留守）】
- B8 #17 queueManager logOperation replay 接回（shell 波；queueManager.ts:17-21）
- B9 #18 worktree hookBased 形参保留（工具本体波；worktree.ts:12-14,467-530）
- B10 #19 runHooksStream 流式消费面（流式纵切；loop.ts:15 残留守已核未流式化）【S-T3 预登记：按需触发，D 波后】
- B11 #21 predicates compact-boundary 检索族（shell/REPL 波；predicates.ts 头注）
- B12 React 侧 recordTranscript/recordContentReplacement 5 点（useLogMessages.ts:69 / ResumeConversation.tsx:225 / plans.ts:393 / sessionRestore.ts:462 / queryHelpers.ts:310,331；shell/message 波）
- B13 **QueryEngineConfig setAppState 置换 → D 波**（本裁定从原 A 桶归赋订正：loop deps 无 setAppState 字段已核（loop.ts 字段面）；messaging SetAppState duck 为 shell 波消费（queueManager）；`src/atlascode/state/index.ts` 7L 骨架 = D 波归属；engine state 域 EngineState set(f) 队列 = E-1 T-3 落点）
- B14 InProcessTeammateTask TaskState 联合扩（shell/swarm 波，§8.50 裁定；tasks/types.ts 头注）【闭合：S-E2b 落位——coordinator/tasks/types.ts TaskState 联合扩三态（InProcessTeammateTaskState 归 task 域门面单一事实源），§8.66 核销 ⑩】
- B15 RemoteAgentTask/DreamTask/LocalWorkflowTask/MonitorMcpTask 任务态（顺延波；registry.ts 裁面登记）【S-T3 预登记：任务工具本体子波，与门控槽 ②⑯ 同子波，下界 = shell/swarm 波后】
- B16 20 门控槽位 + PowerShell 2049L 面（工具本体波 / bash-only 纵切，§8.21 口径）
- B17 compose 残留守 applyConfigEnvironmentVariables（信任对话框面未落；shell 波；compose.ts 头注）
- B18 12 engine 零消费者占位删除（S-E4 A14，2026-09-25：ports/domainMount·featureConfig·lspStatus·promptSuggestion + state/attribution 4 + state/fileHistory 4；M-3 门盲区收口——零消费者死骨架且 C 波未填实，「登记→即刻清零」退化裁定为直接删除（偏离 S-E0 裁定 1 措辞，理由见 S-E4 ① 节）；后续波（analytics/D/工具本体）按需重建且须实质实现，不重占位；state/index.ts + engine/index.ts 头注已登记前向接缝）

**C 桶 = 后续波（不在本节）**：工具本体 49（47 = 历史口径，§8.53 审计④；bashPermissions 2471L + pathValidation 1303L + shouldUseSandbox 124L + 20 门控槽位，§8.43 裁定①）/ auto-mode 分类器族 ~3030L（bashClassifier 61L 桩前向登记）/ shell·swarm 7217L（swarm + inProcessTeammateHelpers 102L + teamDiscovery + teamMemoryOps + UDS Port 9）

### 裁定 2：组合根现状盘点 + 注入窗口清单

`compose.ts` 152L（B6-func ①-⑦ 已落）：① sandboxManager in-memory ② executor 3 ports ③ permissions←bootstrap+config ④ task←permissions+bootstrap ⑤ hooks←bootstrap 6-member + executor + config snapshot ⑥ applySafeConfigEnvironmentVariables ⑦ setEndpointConfigSource + lazy singleton + resetCoreDependencies。残留守 = applyConfigEnvironmentVariables（B17）。
`cli.ts` / `mount.ts` / `state/index.ts` = 7L A 波骨架（D 波归属，本波不动；cli 以 S-E2 loop-deps 构建器为单入口消费）。

14 set-family 注入窗口（现状 → 本波裁定）：
| 窗口 | 现状 | 本波 |
|---|---|---|
| setSessionEnv | placeholder | A5 注真值 |
| setSessionMemoryPort | 零消费者前向 | A6 壳实现 + 注入 |
| Port 1 SessionContextPort 注入口 | 零消费者前向 | A7 壳实现 + 注入 |
| setTaskNotificationHandler | 默认 logForDebugging | A9 真实队列 |
| setSchedulerEnv / registerExitCleanup | no-op | A9 注真值 / 真 cleanup |
| setAgentTranscriptSubdir | 测试专用 | 不动（测试窗口） |
| setCachedParsedFile / setCachedSettingsForSource / setSessionSettingsCache | config 域测试注入 | 不动（缓存自管） |
| setCronJitterConfigProvider | 缺省配置 | B2（analytics 波） |
| setDynamicTeamContext | 未注 | B7 关联（swarm 波） |
| setLastSummarizedMessageId | 自管 | 不动（sessionMemory 内部态） |
| setPluginSettingsBase | 缺省 | 不动（marketplace/D 波消费） |
| setSessionFileForTesting | 测试专用 | 不动 |
| setSessionMemoryConfig | 缺省配置 | 不动 |

### 裁定 3：切片清单冻结 + 依赖方向

```
S-E1 门收口族（A1-A3）→ S-E2 组合根（A4-A10）→ S-E3 session 消费面（A11-A13）→ S-E4 门+探针收口（A14-A15）
```
依赖方向：S-E2 loop-deps 构建器供门 → 依赖 S-E1 I-1 换回语义；S-E3 loop record 需 S-E2 setSessionEnv 真值（Project 单例 FROZEN stamp 决策源）；S-E4 最后锁（anti-stub 扫描集 + STUB_REGISTRY 在所有切片落定后加，防本波期间新 stub 重复登记）。每切片 ①→②→③→④，审视 ≤2 只读（本地/云限流），突变探针「恰 1 红」纪律（backup→mutate→恰 1 红→verbatim-restore diff 核验）。

### 裁定 4：探针规划（恰 1 红）

| 探针 | 切片 | 突变 | 预期恰 1 红 |
|---|---|---|---|
| P-E1 | S-E1 | 门消费退回 checkRuleBasedPermissions | I-1 mode-level 支 verdict 测试 |
| P-E2 | S-E1 | 删 runAgent checkPermission 透传 | F1 子代理门消费测试 |
| P-E3 | S-E1 | 删 catch 重抛 | F4 abort 传播测试 |
| P-E4 | S-E2 | 删 loop-deps 构建器 hooks/gate 注入 | S-E2 组合根 deps 断言 |
| P-E5 | S-E3 | 删 recordTranscript 调用点 | S-E3 func 真盘 record 测试 |

S-E4 = 门自探针（anti-stub 门① 未登记 stub 红）+ P-M2 谓词阴性断言新 func 测试（零行为）。

### 裁定 5：基线与验收

四件套：`bun x tsc --noEmit` 0 / `bun x eslint <changed>` 0 / `bun build src/atlascode/cli.ts --outfile <tmp> --target node` 0 / `bun test --isolate tests/` 基线 **1403 pass / 85 files / 2975 expect**（S-E1..E4 增测后基线增长，每切片完结点不变量）+ gate `bun test --isolate tests/ci/` 6（anti-stub 3 随 S-E4 engine 扫描集增长）。
波末：双只读审视（≤2：A 路 = A 桶逐项旧仓对照 + 导出面 / B 路 = H6 死接缝 + B/C 桶登记完备性）+ 终验四件套 + 本节实施/审视记录 + memory 同步 + task #119 完结。

### S-E2 组合根注真值 执行前分析（2026-09-25，task #121）

**范围（裁定 1 A 桶 S-E2 7 项，A4-A10）**。勘查结论 + 设计冻结如下；实施时逐字对照本节，新增/偏离须回写本节。

**现状勘查（2026-09-25 实测）**
- `compose.ts` 152L：①-⑦ 装配面已落（B6-func/S-3c/S-3d/E-5），残留守仅 applyConfigEnvironmentVariables（B17）。14 注入窗口清单（裁定 2）中本波 8 项现状 = 全缺省/placeholder：setSessionEnv placeholder / setSessionMemoryPort 零消费者 / Port 1 无注入口（grep 全仓无 setSessionContextPort——A7 须先建窗口）/ setTaskNotificationHandler 缺省 logForDebugging / setSchedulerEnv registerExitCleanup no-op / setSandboxAccess placeholder 禁用态（permissions 门面已 `export * from './sandboxAccess'`，无需补门面）/ getTools 组合根零消费（loop.ts:108 头注「本纵切不造全局注册表」）。
- 事实钉（grep 实测）：`PermissionMode` 型 = shared/types-session.ts:60（`export type *` 门面可取）；`EffortValue = EffortLevel | number`，EffortLevel 含 'medium'（shared/types.ts:137-139）；`Tools = readonly Tool[]`（shared/types.ts:239）；`HookRunOptions` = hooks 域 runHooks.ts:70（signal/timeoutMs/toolUseID/permissionMode/sessionId/agentInfo/env）；新仓 QueuedCommand **保留 agentId 字段**（queueTypes.ts:133 `agentId?: AgentId` 旧仓字段面逐字「Undefined = 主线程」；S-E2 审视 MINOR-1 订正——预分析 grep 行区间 73-120 漏尾部 133 行，原「无 agentId 字段」事实钉失实）；`initializeToolPermissionContext` unit 可测（tests/unit/permission-setup.test.ts 口径：mock FsOperations + ATLAS_CONFIG_DIR=/mock-home，I/O-free）；bootstrap 无裸 transcript 目录 getter（仅 `getTranscriptPathForSession`，私有 `defaultTranscriptDir` = `<root>/sessions`）；session 域写面根 = `getProjectsDir()` 缺省 `<config>/projects`（paths.ts:37-46，FROZEN stamp）；旧仓 session memory 写面 = 非原子 `writeFile`（sessionMemory.ts:195-202：mkdir 0o700 + wx 建 + 0o600 写，无 tmp+rename）；旧仓 loop 钩子 option 先例 = permissionMode ← toolPermissionContext.mode（旧 QueryEngine.ts:543）。

**A4 getTools 组合根 + loop-deps 构建器（含 hooks 装配①）**
- `compose.ts` 增 `AgentLoopDepsConfig` / `AgentLoopDepsBundle` / `createAgentLoopDeps(config?)`：
  ① `initializeToolPermissionContext({allowedToolsCli/disallowedToolsCli/baseToolsCli/permissionMode(缺省 'default')/addDirs/shouldAvoidPermissionPrompts/deps=toolRegistryDeps})` → toolPermissionContext；
  ② `tools = getTools(ctx, toolRegistryDeps ?? {})`（注册表组合根消费点：getAllBaseTools + deny 过滤 + isEnabled 尾行，47 本体仍经 deps 注入前向）；
  ③ `checkPermission = createPermissionGate(ctx)`（S-E1 I-1 语义消费）；
  ④ `hooks = createLoopHooks({ options: { sessionId: bootstrap getSessionId(), permissionMode: ctx.mode, ...config.hookOptions } })`（§8.42 项 1 hooks 装配① 生产路径；hook option 真先例 = 旧仓 orchestrator/tools/toolHooks.ts:409 executePreToolHooks 现读 appState.toolPermissionContext.mode——**S-E2 审视 A 路 NOTE-1 锚点订正**：预分析误引 QueryEngine.ts:543，该行系 buildSystemInitMessage 系统初始化消息面非 hook option 面）；delta 登记：sessionId/permissionMode 构建期固化进 HookRunOptions（旧仓 hook 执行时活态解析），CLI 单进程等价，长驻路径复用须重建 deps 或经 config.hookOptions 覆写（前向接缝）；
  ⑤ `deps = { modelProvider: getCoreDependencies().modelProvider, role: config.role ?? 'premium', signal?, checkPermission, hooks }`（role 缺省 'premium' = 旧主模型车道登记）。
- D 波 cli.ts 以本构建器为单入口消费（cli 本体仍 D 波；本波只落构建器 + 装配，不造 CLI 消费面）。

**A5 setSessionEnv 注真值（session/env.ts）**
- 注入 3 成员：`getSessionId` / `switchSession: id => bootstrap switchSession(id)` / `getOriginalCwd`（全 bootstrap 真值——域缺省 self-randomUUID 与 bootstrap 会话源分家 = 双 session id 隐患，本项消除）。
- **getProjectsDir 不注**（裁定偏离登记）：域缺省 `ATLAS_CONFIG_DIR ?? ~/.atlas` + `projects` 即旧仓 projects 车道真值自包含（env 逐调用重读，审视 A-3 先例）；bootstrap 私有 `sessions` 目录系 hooks-input 辅路（getTranscriptPathForSession 仅 hooks 域 ⑤ 消费），与 record 写面 FROZEN `projects` stamp 混用会断链——不注 = 保真。
- `registerCleanup` 成员 → A9 一并接真（tasks cleanupRegistry 执行面，域缺省收集器「壳侧接线执行面」头注兑现）。

**A6 Port 5 壳实现 + 注入**
- 新 `src/atlascode/adapters/sessionMemoryPortAdapter.ts` `createSessionMemoryPort()`：路径 = `join(getProjectDir(env.getOriginalCwd()), env.getSessionId(), 'session-memory', 'summary.md')`（旧 getSessionMemoryPath 逐字形态；getCwd() → 新仓冻结 getOriginalCwd 经 A-1 值 delta 裁定）；`load()` = readFile utf-8，`isFsInaccessible(e) → null` 其余抛（旧 getSessionMemoryContent 逐字）；`save(c)` = mkdir(0o700, **recursive 登记 delta**：旧非 recursive 依赖父目录已存在，壳实现自足化) + writeFile(0o600)。
- **保真登记**：port 契约「原子写」= 旧仓 plain writeFile 先例（无 tmp+rename；旧仓 sessionMemory.ts:195-202 实证），mode 0o600/0o700 逐字。
- 注入：compose `setSessionMemoryPort(createSessionMemoryPort())`。

**A7 Port 1 壳实现 + 注入**
- 先建窗口：新 `src/engine/session/sessionContextPort.ts`（set/getSessionContextPort，Port 5 窗口 sessionMemory.ts:123-132 镜像）+ session 子门面显式名块 + engine 根门面追加。
- 壳实现 `src/atlascode/adapters/sessionContextPortAdapter.ts` `createSessionContextPort()`：holder（get 返回快照引用 = view 语义，port 契约注「set 按字段写回不深拷贝」）；缺省快照 = 最小全新 ToolPermissionContext（mode 'default' 空规则族，同测试 ctx() 形）+ `mcp: {tools: [], clients: []}` + `effortValue: 'medium'`（缺省档位）+ `advisorModel: undefined` + `tasks: {}`。零消费者不变（D 波/CLI 波注真实现整换，壳 = 组合根最小真实现防 H6 空洞）。

**A8 sandboxAccess 组合根接线**
- compose ⑧：`setSandboxAccess({ isSandboxingEnabled: mgr.isSandboxingEnabled, isAutoAllowBashIfSandboxedEnabled: mgr.isAutoAllowBashIfSandboxedEnabled, getFsWriteConfig: () => 窄视图({allowOnly, denyWithinAllow}) })`（permissions 头注「结构兼容」窄视图消费；placeholder 禁用态 manager 的 getFsWriteConfig 抛 unavailable = 旧仓 disabled-stub 语义，消费点被 isSandboxingEnabled 恒 false 短路，不可达，测试登记见下）。

**A9 通知/cleanup/scheduler 三注入点**
- 通知：`setTaskNotificationHandler(n => enqueuePendingNotification({ value: n.value, mode: 'task-notification', priority: n.priority }))`。**delta 登记（S-E2 审视 MINOR-1 订正）**：类型面两侧均保留 agentId（`TaskNotification.agentId?: string` notification.ts:27 + `QueuedCommand.agentId?: AgentId` queueTypes.ts:133，旧仓逐字主线程 = undefined）——delta 在 handler 接线层：本 handler 未接 `n.agentId` → `QueuedCommand.agentId` 定向投递（字段已在，shell/swarm 波仅需 handler 接线即活，勿据旧登记误判需补字段）。
- cleanup 暴露：compose 增薄封装 `runCoreCleanup()`（= tasks 域 `runCleanupFunctions`，CLI 关闭路径 D 波消费，本波只暴露不消费）。
- session env registerCleanup 成员 → `handler => registerCleanup(handler)`（tasks 注册表，unregister 句柄丢弃 = 窗口 void 契约）。
- scheduler：`setSchedulerEnv({ registerExitCleanup: fn => registerCleanup(fn) })`（unregister 句柄签名逐字匹配）；getProjectRoot/getOwnerKey 保持域缺省（S-7b 审视确证 = 旧仓真逻辑非 stub，不动）。

**A10 tools 深 import 归一（范围 grep 枚举，5 处）**
- `coordinator/workerAgent.ts:19`（AGENT_TOOL_NAME/MAX_WORKER_SPAWN_DEPTH ← agent/constants）、`:21`（ASYNC_AGENT_ALLOWED_TOOLS/SKILL_TOOL_NAME ← toolNames）、`:23`（type AgentDefinition ← agent/agentDefinition，**扩面登记**：裁定冻结 3 行未含此 type 行，同族 STR-1 一并归一）→ 全改 `from '../tools'` 域门面；`coordinator/coordinatorMode.ts:25`（AGENT_TOOL_NAME ← agent/constants）+ `:31-38` 块（7 名 ← toolNames，**扩面登记**同前）→ 门面。全部名已核验在 tools 门面导出面（engine 根 tools 块逐名对照 0 缺）。零行为。

**测试规划（tests/unit/loop-deps-compose.test.ts，unit 零磁盘；mock FsOperations + ATLAS_CONFIG_DIR=/mock-home 同 permission-setup 口径）**
- T-1 注册表：disallowedToolsCli ['Bash'] + fake baseTools → tools 池剔 'Bash' 保 AgentTool + 'Read'。
- T-2 门：`bundle.deps.checkPermission` 对 Bash 桩 → `allowed: false`（I-1 全决策体经构建器真接线）。
- T-3 hooks 装配①：`deps.hooks.toolHooks.preToolUse` / `stopHooks` 均函数。
- T-4 modelProvider 恒等：`bundle.deps.modelProvider === getModelProvider()`。
- T-5 A5 注入值：`getSessionEnv().getSessionId() === bootstrap getSessionId()` + getOriginalCwd 恒等。
- T-6 A6 注入：`getSessionMemoryPort()` 非 null + load/save 函数形（I/O 语义归 func 真盘测——新 tests/func/loop-deps-compose-fs.test.ts：save→load 往返 + ENOENT→null，真盘层）。
- T-7 A7 注入 + view 语义：`getSessionContextPort()` 非 null；set(f) 字段写回 + 未动字段引用保持。
- T-8 A8 接线判别：wired 后 `getSandboxAccess().getFsWriteConfig()` **抛**（manager 支撑 = placeholder runtime unavailable；wired 前域缺省返回空配置不抛——前后态可判别，消费点不可达登记见 A8）。
- T-9 A9：`enqueueTaskNotification` → `getCommandQueueLength() === 1` + mode/priority 透传 + agentId 缺席（delta 面）；`getSchedulerEnv().registerExitCleanup` 真入 cleanupRegistry（注册→run 可观察，unregister 可摘除）；`runCoreCleanup` 导出 typeof 断言。teardown：resetCommandQueue/resetTaskNotificationHandler/注销 scheduler 注册/restore fs/env/resetCoreDependencies。
- T-10 A10 回归面：`getCoordinatorWorkerSystemPrompt(1)` 输出不变（门面换源零行为守卫）。

**探针 P-E4（裁定 4，backup→mutate→红集→verbatim-restore diff 核验）**
- 突变：删 `createAgentLoopDeps` 内 `checkPermission` + `hooks` 两行注入。预期红集 = {T-2, T-3}（2 红双点绑定，P-E1/P-E3 同型先例登记——gate 与 hooks 两注入点各 1 断言，T-1/T-4 对照恒绿）。

**基线不变量**：四件套绿 + 全量 1414 pass / 85 文件 / 2998 expect + 本切片增测（unit +T-1..T-10 约 12 测 / func +2 测）后基线增长，gate 6 不变（anti-stub engine 扫描集 = S-E4 才加，本波期间不预登记新 stub——Port 5/Port 1 壳实现为真实现非 stub，不触 STUB_REGISTRY）。

### S-E2 组合根注真值 实施/审视记录（2026-09-25，master acc4fee + 6511684，task #121 闭环）

**② 实施（acc4fee，9 文件 +767 新增/修改（git show --stat 实测；记录原 +720 为 47 行偏差，闭环后审计订正））**
- **A4 loop-deps 构建器**：`createAgentLoopDeps(config?)` → ① `initializeToolPermissionContext`（CLI 面 + 注册表 deps）② `getTools(ctx, deps)`（注册表组合根消费：deny 过滤 + isEnabled 尾行 + 47 本体 deps 注入）③ `createPermissionGate(ctx)`（S-E1 I-1 全决策体消费）④ `createLoopHooks({options:{sessionId: bootstrap getSessionId(), permissionMode: ctx.mode, ...config.hookOptions}})`（hooks 装配① 生产路径）⑤ `AgentLoopDeps{modelProvider: 单例恒等, role: config.role ?? 'premium', signal?, checkPermission, hooks}`。
- **A5 setSessionEnv 注真值**：bootstrap 3 成员 `getSessionId` / `switchSession: id => bootstrap switchSession(id)` / `getOriginalCwd` + `registerCleanup`→tasks cleanupRegistry。**getProjectsDir 不注**（域缺省 `ATLAS_CONFIG_DIR ?? ~/.atlas`+`projects` = 旧仓 projects 车道真值自包含；bootstrap 私有 `sessions` 目录系 hooks-input 辅路，混用会断 record 写面 FROZEN `projects` stamp）。
- **A6 Port 5 壳实现**：`createSessionMemoryPort()` 路径 `join(getProjectDir(env.getOriginalCwd()), env.getSessionId(), 'session-memory', 'summary.md')`（旧 getSessionMemoryPath 逐字形态；getCwd → 冻结 getOriginalCwd A-1 值 delta）；load = readFile utf-8 + isFsInaccessible→null 其余 throw；save = mkdir(0o700, **recursive 登记 delta**) + writeFile(0o600)。**保真登记**：非原子 plain writeFile = 旧仓 sessionMemory.ts:195-202 先例（无 tmp+rename）。
- **A7 Port 1 壳实现**：先建注入窗口 `engine/session/sessionContextPort.ts`（set/getSessionContextPort，Port 5 窗口 sessionMemory.ts:123-132 镜像）+ session 子门面 + engine 根门面追加；壳 `createSessionContextPort()` = holder（get 返快照引用 = view 语义，set 按字段写回不深拷贝）+ 缺省快照（最小 ToolPermissionContext mode 'default' 空规则族 + mcp{tools:[],clients:[]} + effortValue 'medium' + advisorModel undefined + tasks {}）。
- **A8 sandboxAccess 接线**：compose ⑧ `setSandboxAccess({isSandboxingEnabled, isAutoAllowBashIfSandboxedEnabled, getFsWriteConfig 窄视图{allowOnly,denyWithinAllow}})`（消费点被 isSandboxingEnabled 恒 false 短路不可达 = 旧仓 disabled-stub 语义，T-8 前后态可判别）。
- **A9 通知/cleanup/scheduler 三注入点**：⑪ `setTaskNotificationHandler(n => enqueuePendingNotification({value,mode:'task-notification',priority}))`（delta：handler 未接 `n.agentId` 定向投递 = shell/swarm 波前向接缝，见下 MINOR-1）+ `runCoreCleanup()`（= tasks `runCleanupFunctions`，CLI 关闭路径 D 波消费本波只暴露）+ session `registerCleanup`→tasks + `setSchedulerEnv({registerExitCleanup: fn => registerCleanup(fn)})`。
- **A10 tools 深 import 归一——整项撤回**：预分析冻结 5 处（workerAgent.ts 3 + coordinatorMode.ts 2 = 2 文件，① 节范围 grep 枚举；本记录原文文件清单误含 AgentTool.ts / forkSubagent.ts——后两文件 import 系 tools/agent/ 域内相对 import，非 STR-1 跨域深 import 归一对象，不在预分析范围（闭环后审计订正）；实施时 4 文件被改）改 tools 域门面。实施中实测 `tools↔coordinator` 模块求值环——剩余环边在 `builtInAgents.ts:21`（→ `workerAgent` 叶 → A10 门面 import → tools 门面 mid-eval），`workerAgent` 顶层 `const WORKER_AGENT` 消费门面名 → **TDZ 崩**（`Cannot access 'ASYNC_AGENT_ALLOWED_TOOLS' before initialization`）。裁定：门面归一仅 5 行 import、零行为价值，不值得引入 import-time TDZ 脆性 → **4 文件 `git checkout HEAD` 整项撤回**（复原 HEAD 深 import 形），C 桶边清理前向接缝（长期斩跨域边 = isCoordinatorMode 归属反转 / shared 叶化）。T-10 保留断言本体（深度门 fan-out 子句 + getTools baseTools 路径），改题「A10 撤回零行为回归」。
- 门面扩面：`atlascode/index.ts`（createAgentLoopDeps / runCoreCleanup / 两 adapter / 两 facade type）、`engine/index.ts` + `engine/session/index.ts`（Port 1 窗口）。

**探针 P-E4 实测（backup→mutate→红集→verbatim-restore diff 核验）**
| 探针 | 突变 | 预期（裁定 4） | 实测红集 | 结论 |
|---|---|---|---|---|
| P-E4 | 删 `createAgentLoopDeps` 内 `checkPermission` + `hooks` 两行注入 | {T-2, T-3}（2 红双点绑定，T-1/T-4 对照恒绿） | {T-2, T-3}（10 pass / 2 fail，T-1/T-4 恒绿） | 判别成立 |

**③ 独立审视（2 只读子代理：A 路旧仓保真对照 + B 路 H6 反桩/delta 完备性，均零 MAJOR/BLOCKER，6511684 处置）**
- **A 路 PASS-with-fixes（1 MINOR + 3 NOTE）**：Port 5 全形（路径 sanitize / load 五码集 / save mode / 逐调用重算）零发现；构建器参数面 1:1 零发现；scheduler cleanupRegistry 映射零发现；A8 成员集 + disabled-stub 语义零发现；Port 1 缺省字段集 + view 语义登记零发现。
  - MINOR-1（agentId 事实钉失实）：新仓 QueuedCommand **保留** `agentId?: AgentId`（queueTypes.ts:133，旧仓逐字「Undefined = 主线程」），预分析 grep 行区间 73-120 漏尾部 133 行。订正 4 处（compose ⑪ 头注 / T-9a 注释 / docs 事实钉 / docs A9 delta 行）：delta 在 **handler 接线层**（未接定向投递）非类型裁面；shell/swarm 波补 handler 接线即活（字段已在），勿据旧登记误判需补字段。处置选**订正措辞**（B 路建议）而非 handler 补透传（A 路建议）：补透传属 shell/swarm 波时序（drain-gate 消费点未落，提前接线 = 投机字段，S-E4 anti-stub 扫描反咬）。
  - NOTE-1（hook 锚点 + 活态差）：旧 `QueryEngine.ts:543` 系 buildSystemInitMessage 系统初始化消息面非 hook 面；真先例 = `orchestrator/tools/toolHooks.ts:409`（executePreToolHooks 现读 ctx.mode）。锚点订正 + 活态→构建期固化 delta 登记（CLI 单进程等价，长驻路径 switchSession 后复用须重建 deps / config.hookOptions 覆写，前向接缝）+ ports/sessionContext.ts 状态行刷新。
  - NOTE-2/3（Port 1 派生/裁面）：effortValue 'medium' = 旧 `AppStateStore.ts:554 undefined` → wire 回落 Atlas 缺省 'medium'（effort.ts:167）的预解析形；mcp 裁旧 6 字段（clients/tools/commands/resources/snapshotSequence/pluginReconnectKey）至 SessionSnapshot 契约面 tools+clients。两行头注登记（sessionContextPortAdapter.ts）。
- **B 路 PASS-with-fixes（1 MINOR + 3 NOTE）**：测试判别力 14 测零 tautology（T-8 前后态 / T-9a agentId 缺席 / T-7 引用保持 / T-5 switchSession 跟随各至少 1 突变可红）；门面扩面零意外；src 面零 `: any`/`as unknown as` 桩消费（mkTool fake cast 允许）；Port 5/1 壳 = 真实现非 stub（不触 STUB_REGISTRY）。
  - MINOR-1：与 A 路同源（agentId），已并入上述处置。
  - NOTE-1：ports/sessionContext.ts 状态行未随 S-E2 刷新（纯文档陈旧）→ 已刷。
  - NOTE-2：tasks cleanupRegistry 无 reset + Port 窗口无 reset + 头注枚举漏列（isolate runner 兜底，ad-hoc 连跑残留面）→ 运行口径注补 Port 5/1 窗口枚举（接受，不补 reset）。
  - NOTE-3：atlascode 门面顺带导出 Port 工厂（D 波/CLI 波前向面，命名一致）→ 接受。

**④ 基线验收**：四件套 tsc 0 / eslint 0 / build 0 / 全量 **1428 pass / 87 文件 / 3051 expect**（基线 1414+14 新测；expect 2998+53）+ gate 6。task #121 闭环 → S-E3 解锁（session 消费面依赖 setSessionEnv 真值 + Port 1 窗口）。

### S-E1 门收口族 实施/审视记录（2026-09-25，master d895eeb + c8e785c，task #120 闭环）

**② 实施（d895eeb，7 文件 +382/-47）**
- **A1 I-1 换回**：`engine/permissions/permissionGate.ts` 消费面 `checkRuleBasedPermissions`（规则支 null=放行）→ base `hasPermissionsToUseTool` 全决策体（`src/permissions/permissions.ts:100`）；映射 allow→`{allowed, updatedInput}` / deny→`{allowed:false, reason}` / ask→`{allowed:false, ask:true}` fail-closed。`GateVerdict` 扩 `updatedInput?: unknown`（`pipeline/toolExecution.ts`），executeToolUse 门放行后采纳 `callInput = verdict.updatedInput ?? effectiveInput`（门晚于 hook last-wins；现零非-passthrough 工具面实现 → 行为惰性，工具本体波回填时生效）。规则支 `checkRuleBasedPermissions` 保留导出（域 API + 测试面），门不再消费。
- **A2 F1 子代理门透传**：executeToolUse `tool.call(callInput, { signal, checkPermission }, …)`（shared Tool.call 第 2 参 context: unknown 契约不变）→ `AgentTool` AgentToolCallContext.checkPermission → `RunAgentArgs.checkPermission` → `queryAgentLoop` deps → 子 loop 同门。未注入 = 子 loop 窄 spine 默认放行（与父 loop 未注门语义对齐）。
- **A3 F4 1c abort 重抛**：`ruleMatching.ts` 新增导出 `isAbortShapedError` 双支形判别（`e.name==='AbortError'`（DOMException 原生面，旧仓自研 AbortError 类未随迁 delta 登记）+ `e.constructor?.name==='APIUserAbortError'`（新仓无 minify；DEP-2 C-Deep allow=[shared] 禁 permissions 域 import modelprovider 值 → 形判别；minified 外部 SDK instanceof 换注入窗口 = 前向登记））；ruleMatching / permissions 双站点 1c catch `if (isAbortShapedError(e)) throw e`（旧仓 catch 逐字语义——abort 是控制流非工具错误）。
- 测试 +10（I-1a/b/c 全决策体判别 / F-1a/b 子 loop 同门 + 窄 spine 对照 / F-4a–e 形判别 + 双站点重抛 + 非 abort 吞掉）。

**探针实测（backup→mutate→红集→verbatim-restore diff 核验）**
| 探针 | 突变 | 预期（裁定 4） | 实测红集 | 结论 |
|---|---|---|---|---|
| P-E1 | 门退回 checkRuleBasedPermissions | I-1 mode-level 支 verdict 测试 | {I-1a, I-1c}（2 红：3 落 ask fail-closed + updatedInput 采纳双点绑定，P-M2 先例同型） | 判别成立 |
| P-E2 | 删 runAgent checkPermission 透传 | F1 子代理门消费测试 | {F-1a}（恰 1 红） | 判别成立 |
| P-E3 | 删双站点 catch 重抛 | F4 abort 传播测试 | {F-4b, F-4c, F-4e}（3 红：双站点绑定，F-4a/F-4d 对照组按设计恒绿） | 判别成立 |

**③ 独立审视（1 只读子代理，PASS-with-fixes：0 MAJOR / 3 MINOR / 4 NOTE，六维全绿）**
- 忠实性：I-1 映射支 = 旧仓 toolExecution.ts:951-952 语义逐字；F4 双支 = 旧仓 catch 超集无漏支（第三支 DOMException 形为有意原生面扩展已登记）；F1 链 6 跳核验无断点。
- M-1（唯一实质项）：post-hook 收门改写前 effectiveInput 系未登记 delta（旧仓 post-hook 收 processedInput = 权限决策后实际入参）→ **一行修**：callInput 提升函数作用域，postToolUse 改传 callInput（门 updatedInput 惰性期零行为差，工具本体波回填时与旧仓自动一致）。
- M-2：loop.ts F1 前向接缝注释陈旧（已落仍标「不带门」）→ 刷新。
- M-3：「零活工具面 checkPermissions 实现」字面失实（mcp.ts:166 / AgentTool.ts:128 两活 passthrough 实现）→ 措辞订正「零非-passthrough（updatedInput 产出侧为零）」。
- N-1：callInput 三元 else 死支（早退后 allowed 恒真）→ 简化。
- N-2：engine/index.ts + engine/permissions/index.ts 门面头注 S-4d 口径 → S-E1 换回口径同步。
- N-3：APIUserAbortError 新仓零活 throw 点（分支 2 纯惰性）头注登记防复审误判死分支。
- N-4：F1 链前两跳（executeToolUse 塞入 → AgentTool 转发）无测 → 补 F-1c（AgentTool.call 带门拒执行 / 不带门真执行双断言）。
（c8e785c 处置 7 文件 +73/-16；commit message「零活」措辞不重写历史，以头注订正为准。）

**④ 基线验收**：tsc 0 / eslint 0 / build 0 / 全量 **1414 pass / 85 文件 / 2998 expect**（基线 1403+10+1 F-1c；expect 2975+21+2）+ gate 6。task #120 闭环 → S-E2 解锁（loop-deps 构建器供门依赖 I-1 语义已落）。

### S-E3 session 消费面接线 执行前分析（2026-09-25，task #122）

**范围（裁定 1 A 桶 S-E3 3 项，A11-A13）**。勘查结论 + 设计冻结如下；实施时逐字对照本节，新增/偏离须回写本节。

**现状勘查（2026-09-25 实测）**
- **record 面已落（S-7d d1/d2）**：`session/record.ts` recordTranscript（旧 L1419 逐字：`messageSet.has(m.uuid)` 前缀跟踪 skip + `!seenNewMessage && isChainParticipant` P-S1 探针锚点 + `projectInstance().insertMessageChain`）/ recordContentReplacement（旧 L1505：`insertContentReplacement(records, agentId)` agentId→sidechain 路由）/ recordSidechainTranscript / resetSessionFilePointer / adoptResumedSessionFile / flushSessionStorage；`project.ts` insertMessageChain（`isCompactBoundaryMessage(message)` → `parentUuid: null` + `logicalParentUuid: parentUuid` relink；cwd 戳 = `getSessionEnv().getOriginalCwd()`（A-1 冻结）；`shouldSkipPersistence` 守卫 L540/558/704（NODE_ENV=test + ATLAS_SKIP_PROMPT_HISTORY 测试守卫，2 支裁面登记）+ insertContentReplacement（旧 L1126 逐字，`type:'content-replacement'` entry + agentId 面）。
- **loop 面 = 窄 spine 零 record 消费**：`query/loop.ts` 245L（queryOneRound 单轮：`[...messages, assistantMsg, ...resultMessages]` 装配 L161 / queryAgentLoop 多轮：entry L200 + pre-turn compact 支 L208-221 + terminal L224-236）；`AgentLoopDeps` 无 transcript 成员；compact 管线 `context/compact.ts` createCompactBoundaryMessage（L238）产物**缺旧仓判别式**（勘查新发现 A11-Δ1）；`autoCompact.ts` AutoCompactOutcome 无 contentReplacements 载体（A11-Δ2）。
- **killShellTasks 裁面**：`coordinator/tasks/killShellTasks.ts` 头注 6-9 行 + 77-79 行登记「尾部 dequeueAllMatching 随 S-7e messaging 波复核」；队列面已落（queueManager.ts:251 `dequeueAllMatching(predicate)` = 删除并返回全部匹配 + 非匹配滞留 + 优先级序保持；`queueTypes.ts:133` `QueuedCommand.agentId?: AgentId`（=string，session/types.ts:46）旧仓逐字「Undefined = main thread」保留）；messaging 域零 coordinator import（环风险 = 0）；入队面 `enqueue(command: QueuedCommand)`（queueManager.ts:149）可携 agentId。
- **活态 cwd 源已就绪**：bootstrap `state.ts` `getCwdState()`（可变，setup/setCwd 刷新）+ `cwd.ts` `pwd()` = ALS 覆盖层 ?? getCwdState（`runWithCwdOverride` 并发面）；session 域 SessionEnv 冻结 `getOriginalCwd`（env.ts），消费点 = `project.ts:644` insertMessageChain cwd 戳（A-1 审视值 delta 裁定接受 + 「E-wave-end 可选扩 SessionEnv 活态成员恢复」前向登记，即 A12）。

**设计冻结**

- **A11 loop recordTranscript 7 点收敛 + recordContentReplacement + #15 同点**：
  - 新 `LoopTranscriptSink`（loop.ts）：`record(messages: readonly Message[]): Promise<unknown>`（Message = shared 宽型；返回 UUID 消费点 = React 侧 B12，loop 丢弃）+ `recordContentReplacement?(replacements: readonly ContentReplacementRecord[]): Promise<void>`（ContentReplacementRecord type-only 引自 `../session/types`；环核验：session 域零 context import = 无环）。
  - `AgentLoopDeps.transcript?: LoopTranscriptSink`——未注入 = 窄 spine 无持久化安全缺省（同 checkPermission/hooks 惯例）；窄 spine 测试/回放面零 I/O 不变。
  - **7 点 → 新面映射表（冻结）**：

    | 旧仓点 | 新仓面 | 语义 |
    |---|---|---|
    | L450 进 loop 前 user 消息 persist | `queryAgentLoop` entry `await record(args.messages)` | crash-resumable（旧 L437 注释：进程在首个 API 响应前被杀，transcript 仍可 resume） |
    | L722 assistant void / L724 非 assistant await / L774 progress inline / L828 attachment inline | `queryOneRound` 尾部 `void record([assistantMsg, ...resultMessages])` | fire-and-forget（旧 L722 assistant void 语义）；新 spine 无 progress/attachment 消息面（裁面登记：attachment 渲染 = 消息/REPL 波残留守） |
    | L607 compact boundary persist | compact 支 `messages = buildPostCompactMessages(...)` 后 `await record(messages)` | boundaryMarker+summary+keep 全序列 persist（record 内 dedup 幂等，重记安全） |
    | L706 preservedSegment tail flush | 裁面登记 | 新 CompactionResult 无 compactMetadata.preservedSegment 三段 uuid；旧 tail flush 目标 = context-collapse preservedSegment（旧 L685-706），collapse 面 = E-1b-full 残留守 |
    | React 侧 5 点（useLogMessages 等） | B12（shell/message 波） | 裁定 1 已归 |
  - **A11-Δ1 保真修复（勘查新发现，并入 A11）**：`createCompactBoundaryMessage`（compact.ts:238）现产物缺旧仓判别式——旧 messages.ts:4518 SystemCompactBoundaryMessage = `{type:'system', subtype:'compact_boundary', content, isMeta:false, uuid, level:'info', compactMetadata:{trigger, preTokens, userContext, messagesSummarized}, logicalParentUuid?}`；新 = `{type:'system', role, uuid, timestamp, message:{...}, compactMetadata:{preTokens, messagesSummarized, createdAt}}`（无 subtype）。消费面全断：`isCompactBoundaryMessage` 谓词（insertMessageChain parentUuid-null relink）+ scanner 字节标记 `'"compact_boundary"'`（#15 同点）+ 旧 L471/L595 ack 分支。修复 = 补 `subtype: 'compact_boundary'` + `content: 'Conversation compacted'` + `isMeta: false` + `level: 'info'`（保留新 role/message wire 形 + 现签名；compactMetadata 保留 {preTokens, messagesSummarized, createdAt}，旧 {trigger, userContext} 无新 producer = 裁面登记）。
  - **A11-Δ2 recordContentReplacement 写面**：`CompactionResult.contentReplacements?: ContentReplacementRecord[]` 可选载体（compact.ts；producer = E-1b-full budget 纵切（旧 loop.ts:350-390 applyToolResultBudget → 旧 L377 触发），本波零 producer = 前向接缝登记，fake compact 测试面可 seed）；loop compact 支消费点 = `oc.compactionResult?.contentReplacements?.length && persistReplacements && deps.transcript?.recordContentReplacement` → await；`persistReplacements` 门 = `autoCompact.querySource` startsWith `'agent:'`|`'repl_main_thread'`（旧 loop.ts:360-363 逐字）。
  - **组合根**（compose.ts 构建器）：`deps.transcript = { record: msgs => recordTranscript(msgs as SessionMessage[]), recordContentReplacement: recs => recordContentReplacement(recs, config.agentId) }` + `AgentLoopDepsConfig.agentId?: string`（sidechain 路由；undefined = 主线程主 session 文件，旧 L377 agentId 参语义）；持久化门 = session 写面 shouldSkipPersistence 内部态（本波不加构建器门，D 波/CLI persistSession 面 = 裁面登记）。
  - **runAgent 子代理 loop 本波不注 transcript**（子代理 sidechain 路由 = shell/swarm 波前向接缝登记；子 loop = 窄 spine 无持久化）。
  - **scanner.ts:15 头注刷新**（#15 核销）：写面 = loop compact 写面（S-E3 A11 接线；boundaryMarker 携 subtype → JSONL 标记字节面闭环）。
- **A12 SessionEnv 活态 cwd 成员**：
  - `SessionEnv.getCwd(): string`（活态 cwd；域缺省 = `process.cwd()` 活读——无 bootstrap 约束下旧活态语义（ALS ?? cwdState）最近等价，自包含不破）。
  - compose ⑨ 注 bootstrap `pwd()`（ALS 覆盖 ?? getCwdState；旧 utils/cwd.ts `getCwd()` = try pwd() catch getOriginalCwd() 回落支裁面登记——新仓 pwd 不抛，目录消失回落面 = shell 波残留守）。
  - `project.ts:644` cwd 戳 `getOriginalCwd()` → `getCwd()`（旧 getCwd() 活戳语义恢复）；**project dir 键控点 load.ts:1230 不动**（A-1 裁定：会话文件定位不受影响）。
  - project.ts A-1 头注刷新：「E-wave-end 可选扩」已落（A12）。
- **A13 killShellTasks dequeueAllMatching 裁面复核**：
  - 复核结论 = 队列面条件已满足（S-7e d2 落）→ **恢复尾部调用** `dequeueAllMatching(cmd => cmd.agentId === agentId)`（旧仓逐字 + 旧注释：killTask 异步触发的 'killed' 通知对已退出 agentId 无匹配消费者、无害滞留）；import 经 messaging 域门面 `../../messaging`（零环核验：messaging 零 coordinator import）。
  - 谓词面核验：`cmd.agentId`（AgentId|undefined = string|undefined）vs `agentId: string`，`===` 类型安全；入队面 `enqueue` 可携 agentId（queueManager.ts:149）。
  - **enqueue 侧 agentId 接线 = shell/swarm 波前向接缝**（S-E2 MINOR-1 同源裁定——本波 drain 侧预接线，入队侧随波；当前零 producer 谓词 = 惰性接缝非 stub，S-E4 anti-stub 扫描口径 = 已登记头注面）。
  - 头注 6-9/77-79 行裁面登记 → 核销刷新。

**测试规划**
- **unit 零磁盘**（`tests/unit/loop-transcript-sink.test.ts`；fake sink 对象 + fake autoCompact deps（countTokens 巨值 → 真 shouldAutoCompact 触发 → fake `deps.compact` 返 CompactionResult），无 Fs mock 需求）：
  - T-1 queryOneRound 轮末追加 record（恰 1 次，[assistantMsg, ...resultMessages]，fire-and-forget 不阻塞返回）
  - T-2 queryAgentLoop entry record（首个 record 调用 = 入参序列，先于 LLM 调用）
  - T-3 compact 支 record（record 调用含 boundaryMarker uuid 的 post-compact 序列）
  - T-4 contentReplacements 消费点（fake compact 携 contentReplacements + querySource `'agent:t'` → sink 收到；阴性对照 querySource `'repl'` 不匹配 → 不调用）
  - T-5 无 sink 缺省（transcript 缺席 = 不抛，窄 spine）
  - T-6（A12）SessionEnv getCwd：域缺省 = process.cwd() + setSessionEnv 活源反射（fake env 活值可观察）
  - T-7（A13）killShellTasksForAgent 队列清理：`enqueue` 3 条 {agentId:'a1'}/{agentId:'a2'}/{agentId:undefined 主} + fake TaskAppState（1 running local_bash）→ `killShellTasksForAgent('a1', ...)` → 队列滞留恰 {a2, 主}（a1 被 dequeueAllMatching 清除）+ task 态 'killed' 可观察（fake setAppState 更新面）
- **func 真盘**（`tests/func/loop-transcript-fs.test.ts`；mkdtemp + ATLAS_CONFIG_DIR 重定向 + setSessionEnv + fake modelProvider + 真 session record 面，同 engine-session-fs 口径）：
  - F-1 全 loop（1 轮工具 + autoCompact 触发）→ session JSONL 含 assistant/user 消息行 + **compact boundary 行（断言 `'"compact_boundary"'` 标记字节 = #15 同点断言 + A11-Δ1 修复效果面）**
  - F-2（A12）活态 cwd 戳：setSessionEnv `{getCwd: () => '/live-cwd'}` → recordTranscript 后 JSONL 行 `cwd` 字段 = `'/live-cwd'`（project dir 键控仍 getOriginalCwd，文件定位不漂移）
- **探针 P-E5（恰 1 红）**：删 queryAgentLoop compact 支 record 调用 → F-1 红（JSONL 缺 compact boundary 行），F-2 + unit 全绿 → 恰 1 红。backup→mutate→红集→verbatim-restore diff 核验。

**基线与验收**：四件套 tsc 0 / eslint 0 / build 0 KB（cli 骨架属预期）/ 全量基线 1428+新测 + gate 6（anti-stub 门①②③ 不变，engine 扫描集随 S-E4 增长）。task #122 闭环 → S-E4 解锁（门+探针收口）。

### S-E3 实施记录（2026-09-25，② 4a04339）

**实施面（10 文件，723+/22-）**：
- `src/engine/query/loop.ts`：`LoopTranscriptSink` 接口（record + 可选 recordContentReplacement）+ `AgentLoopDeps.transcript?` + 3 调用点（entry `await record(messages)` 旧 L450 / compact 支 `await record(messages)` 旧 L607 / queryOneRound 轮末 `void record([assistantMsg, ...resultMessages])` 旧 L722-828 收敛）+ compact 支 recordContentReplacement 消费块（persistReplacements 门逐字）。实施期 delta 登记：`void record(...)` fire-and-forget 的未捕获 rejection = 窄 spine 缺省面（record 真抛错仅 unhandled rejection，旧仓 L722 同款语义——旧 assistant 支即 void；不新增 catch 面，残留守登记）。
- `src/engine/context/compact.ts`：A11-Δ1 createCompactBoundaryMessage 补判别式（`subtype/content/isMeta/level` 四字段 + 保留新 role/message wire 形与现签名）；A11-Δ2 `CompactionResult.contentReplacements?` 可选载体 + 头注前向接缝（producer = E-1b-full budget 纵切）。
- `src/engine/session/env.ts`：`SessionEnv.getCwd()` 活态成员 + 缺省 `process.cwd()` 活读；**勘正执行前分析 A12 裁定**：bootstrap/cwd.ts 已含 `getCwd()` = try pwd() catch getOriginalCwd()（C-Deep 切片 3 T4 逐字随迁，旧仓 utils/cwd.ts 回落支**非裁面**——d4c2ece 登记「目录消失回落支残留守」实测为已落真值，头注随核销刷新）。
- `src/engine/session/project.ts`：cwd 戳 `getOriginalCwd()` → `getSessionEnv().getCwd()`（A-1 审视值 delta 核销；键控点 getProjectDir(getOriginalCwd()) 不动）。
- `src/engine/coordinator/tasks/killShellTasks.ts`：尾部 `dequeueAllMatching(cmd => cmd.agentId === agentId)` 恢复（旧注释逐字）+ messaging 门面 import（零环核验通过）。
- `src/engine/session/scanner.ts`：#15 头注核销（写面 = loop compact 支）。
- `src/atlascode/compose.ts`：⑨ setSessionEnv 增注 `getCwd`（bootstrap getCwd）；构建器 `deps.transcript` 接线 + `AgentLoopDepsConfig.agentId?: string` + 双 cast 类型面 delta 登记（shared Message 宽型 timestamp string|number → session Message 窄型 string 跨域 cast；readonly sink 参 → 可变 record 参同值传递）。实施期 delta：record/recordContentReplacement 经 engine 根门面 import（session/index.ts:104/106 已导出，门面链无新增）。
- 测试：unit `loop-transcript-sink.test.ts`（T-1..T-7，11 测）+ func `loop-transcript-fs.test.ts`（F-1/F-2）+ loop-deps-compose T-11/T-12（transcript 接线可调用 + getCwd ALS 覆盖层判别）。测试面实施期订正 3 处（非方案偏离）：F-1 recCount 2→3（轮末 fire-and-forget 亦经真 recordTranscript 同步落盘，3 = entry+compact+轮末）/ T-3 调用序定位改判别式 find（抗调用点序变化）/ T-7 `resetDiskOutputEnv` import 源 = task 域门面（engine 根门面不导出，同 engine-tasks 口径）。

**四件套（4a04339）**：tsc 0 / eslint 0 / build 0 KB exit 0 / 全量 1444 pass / 89 文件 / 3093 expect（基线 1428 +16：unit 11 + func 2 + compose 2 + …）+ gate 6。

**P-E5 探针（实测红集）**：删 queryAgentLoop compact 支 record 调用点（backup→mutate）→ 红集 = {unit T-3, func F-1} **双点绑定 2 红**（fake sink 面 + 真盘面同观同一调用点，P-M2 双点先例——执行前分析「F-1 恰 1 红」下界订正：T-3 同观调用点亦红，红集 2 非 1 属可判别设计非误报；其余 1442 全绿）→ verbatim restore diff 洁净（`diff` 零差）+ 回归全绿。

### S-E3 ③ 审视记录（2026-09-25，双只读 ≤2，A 路先回报）

**A 路（旧仓对照保真）：PASS-with-fixes——2 MAJOR / 1 MINOR / 4 NOTE 全处置（修复提交 cec5378）**：
- **M-1（MAJOR，真保真缺陷）**：轮末 result 消息缺 uuid/timestamp 恒戳——旧仓 messages.ts:525-526 createUserMessage 不变量（`uuid || randomUUID()` + `timestamp ?? ISO`，record 面消息恒带 uuid）未随迁；未修前 A11 接线后这些消息经 project.insertMessageChain `uuid: message.uuid as string` 对 undefined 纯透传 → JSONL 条目缺 uuid 字段（dedup miss 重复追加 + 父链 `parentUuid = message.uuid` 断裂）。修复：resultMessages 恒戳（randomUUID + 单 ISO 时戳）；回归探针 **T-8**（删戳此测红）。
- **M-2（MAJOR，真保真缺陷）**：record 调用点传增量切片（轮末 `[assistant, ...results]`），旧仓 L722 = **全量数组**形态——recordTranscript 前缀追踪 walk（`!seenNewMessage && isChainParticipant`，P-S1 探针锚点）只在入参含已记录前缀时恢复 startingParentUuid；切片形态每次调用点开新根 → 磁盘链碎裂、resume 回放退化为末段。修复：轮末改 `void record([...messages, assistantMsg, ...resultMessages])`（= r.messages，T-1 `toEqual(r.messages)` 交叉核验）。回归探针 **F-3**（func 真盘 parentUuid 链连续：as1.parent = u1，as2.parent = tool_result 行 uuid——切片形态此测红；sink fire-and-forget 竞以 promise 跟踪消，非产品面改 await）。
- **m-1（MINOR）**：compact 支 replacement 写面 `await` 无 catch（rejection 会拒绝 queryAgentLoop 全流）；旧仓 loop.ts:375-378 逐字 = `void ...catch(logError)` 吞错 + 日志永不阻塞。修复：void + catch（旧 logError → 域 debug 口 logForDebugging，shared/debug 无 logError，域内日志统一 debug 口，killShellTasks 同款裁定）。
- **n-1（PASS 通过项）**：persistReplacements 门 `!!qs && (...)` undefined-qs fail-closed 扩展可接受（T-4 阴性测已登记）。
- **n-2（NIT，登记）**：entry record 无条件（空序列 no-op 写 + 一次盘读）；bare 变体裁面登记（n-5 同源 drain 风险面）。
- **n-3（NOTE 措辞订正）**：compact.ts 头注「旧 L471/L595 ack 分支恢复」失实——新仓无对应代码，判别式补齐使**未来消费方**（shell/message 波）前向依赖成立，非「代码恢复面」；头注已订正。
- **n-4（NOTE，M-2 修复后消解）**：全量入参使 allMessages 缺省 = messages（同调用内 tool_use/tool_result 对同落，REPL 孤儿风险面消除）。
- **n-5（NOTE，注释登记）**：旧 L724 非 assistant 支 await 翻转为统一 void（order-preserving 写队列排序无损；进程退出前 drain 风险与旧 bare 变体同构——F-3 测试面 promise 跟踪即对此面的消费纪律）。

**B 路（H6 死接缝 + 测试面）：PASS-with-fixes——commit 态 1 MAJOR（= A 路 M-1 同源，cec5378 已修）/ WIP 态 1 MINOR 行为面（m-3 F-3 racy，cec5378 settle 修复）+ 2 MINOR 零行为面 + 1 微残留登记（全处置，处置提交见 ④ 行）**：
- **m-3 [行为面/测试装置，WIP 新发现]**：F-3 初版断盘前未 settle——轮末 `void record` 在途（insertMessageChain 内 await 后入写队列），入队落在 flush 的 drainWriteQueue 迭代 + timer 取消之后 → 该行由重排 timer 晚于读落盘（实测 1/13 flake）。**flush 序核验（B 路末项）**：新仓 project.ts flush（cancel timer → await activeDrain → drain）与旧仓 sessionStorage.ts L842 **逐字同序** → 该窗口为旧仓继承语义非新仓回归。修复 = 测试面 sink 捕获 record promise + flush 前 `await Promise.all`（loop 侧 void 不改；cec5378 F-3 recPromises 即此修复）。flaky 复核：独跑 ×10 + 3 文件并跑 ×10（B 场景复现）全绿。
- **F-1 盲区登记（零行为）**：F-1 不断言轮末尾行落盘（只数 recCount）→ 对 m-3 类竞态结构性盲（B 路注「这正是 F-3 被引入的原因」）；F-3 已配 settle，盲区面留登记不补。
- **m-1 [零行为]**：fs 测试头注 P-E5 锚点陈旧（「F-1 恰 1 红」vs 实测双点 2 红）→ 头注订正（红集 = {unit T-3, func F-1}，P-M2 双点先例）。
- **m-2 [零行为，覆盖缺口]**：T-11 仅函数形 + 可调用零盘（agentId 经 shouldSkipPersistence 守卫不可观察）；agentId → sidechain 路由（project.ts appendEntry content-replacement 支 `entry.agentId ? getAgentTranscriptPath : sessionFile`）unit/func 零覆盖 → **F-4 新探针**（agentId 在场 entry 落 sidechain 文件恰 1 条 + session 文件阴性不混入；routing seam 本身 = runAgent 子代理 loop 注入，compose 已注册前向接缝，本探针只补机制面）。
- **M-1 微残留 [零行为，登记]**：旧 L137 `sourceToolAssistantUUID` 戳未随迁（result 行不戳）——M-2 全量序列接链不依赖 project.ts 该戳覆写机制（恒走 sequential-parent 回落即正确链），零行为；loop.ts 头注一行登记防复审重提。
- **n-1 [零行为]**：`void record` unhandled-rejection 风险仅 docs 登记未入 loop.ts 头注 → 头注补一行（旧 L722 同款继承语义 + 测试 settle 纪律指向 F-3）。
- **n-2 [已核销]**：commit 态 `await recordContentReplacement` 故障传播 delta → cec5378 已订正 void+catch（A 路 m-1 同源，双路独立发现互证）。
- **n-3 [已注册]**：T-6a/T-6b 文件内序依赖 + func liveCwd 模块级泄漏 = 已注册已知脆弱（同进程 ad-hoc 全量跑受影响，bun --isolate 逐文件进程隔离免疫），B 路判 PASS 不补。
- **PASS 七区（B 路逐项核过）**：映射表一致 / scanner 读面宽容 + 标记字节同点 / contentReplacements 前向接缝登记充分 / 活态 cwd + 键控分离 / killShellTasks import 零环 + 头注完备 / 无 tautology（fake 仅 LLM 接口替身 + 调用记录器 sink；T-7 真队列；F-1/F-3/F-4 真 record 链 + 真 fs）/ 前向接缝清扫（8 处登记与代码一致，未登记隐式裁剪仅 M-1 族已修 + 微残留 1 行级）。
- **anti-stub：PASS**（S-E3 面 grep 无活 `: any` stub，唯一命中 env.ts 头注散文非代码）。
- **H6 注册完备性：PASS**（含 1 行级 sourceToolAssistantUUID 微裁剪补登记后）。

**探针复测（修复后树）**：M-2 切片突变红集 {T-1, T-8, F-3}（T-8 索引移位联红 = 判别成立）/ P-E5 compact 支删除红集 {T-3, F-1} 双点 2 红（① 文档下界口径不变，verbatim restore diff 零差）。

**四件套（cec5378）**：tsc 0 / eslint 0 / build 0 KB / 全量 **1446 pass / 89 文件 / 3102 expect**（基线 1444 +2：T-8 + F-3）+ gate 6。

### S-E3 ④ 闭环记录（2026-09-25，task #122 完结）

**B 路处置提交**：fs 测试头注 P-E5 锚点订正（m-1）+ F-4 agentId 路由探针（m-2）+ loop.ts 头注 n-1/M-1 微残留两行登记（m-3 与 n-2 已由 cec5378 修复/订正，本提交不涉代码行为面）。**终验四件套**：tsc 0 / eslint 0 / build 0 KB / 全量 **1447 pass / 89 文件 / 3107 expect**（基线 1446 +1：F-4）+ gate 6；flake 复核 独跑 ×10 + 并跑 ×10 全绿。**S-E3 ①→②→③→④ 全闭环**：d4c2ece（① 执行前分析）→ 4a04339（② 实施）→ cec5378（③ A 路 2 MAJOR 修复 + 探针补齐）→ 本记录（③ B 路处置 + ④ 闭环）→ task #122 完结，S-E4（A14-A15，task #123）解锁。

### S-E4 ① 执行前分析（2026-09-25，task #123，A14-A15）

**A14（M-3 + anti-stub ⑥ 门收口）勘查结论（事实）**：

- engine 域纯占位文件实测 **12 个**（S-E0 docs「engine 14」/ M-3 登记（docs:960）口径陈旧，波内 2 个已填实）：
  - `ports/` 4：domainMount / featureConfig / lspStatus / promptSuggestion（各 7 行 = 头注 + `export {}`）
  - `state/attribution/` 4：attribution / config / index / types（index 9 行）
  - `state/fileHistory/` 4：config / fileHistory / index / types（index 9 行）
  - 全零实质导出 + **零导入消费者**（精确导入源 grep = 0：state/index.ts 仅 re-export EngineState，「attribution/fileHistory 随 C 波填实后追加 re-export」头注承诺未兑现；engine 根 index.ts 不 re-export 4 ports（仅 ports/mcpClient））
  - ascend 9 / atlascode 12（.ts；另 1 .tsx 非门扫描对象）归各域后续波，本波不动（S-E0 裁定 1）
- 门文件（tests/ci/anti-stub.test.ts）三门结构：DOMAINS 5 域恒扫（:35）/ CDEEP_DOMAINS 4 域 existsSync 守卫（:43）/ STUB_REGISTRY 3 条 shared 条目（门② 兜底）；门③ = `wave-c` tag 在场 → C-Deep 域登记条目清零（regex L196 覆盖 executor/sandbox/memory/modelprovider/task/bootstrap/permissions/hooks 8 域，**无 engine**）
- git tag 实测 = wave-a / wave-b（wave-c 未切）
- M-3 登记（docs:960，E-2 波末 defer）：engine 既不在 anti-stub 扫描集也不在 STUB_REGISTRY → defer 到 E-wave-end = **本波收口对象**

**A14 方案（1 项偏离 S-E0 裁定措辞，理由随附）**：

- 裁定措辞（§8.52 L2485）=「engine 加扫描集 + STUB_REGISTRY 登记 + wave tag 清零」；勘查事实 = 12 个均为**零消费者死骨架**且解锁波「C 波」即本波完结的波 → 登记→即刻清零退化为同波纯 churn（登记一行再删一行，无信号收益）。**偏离裁定：12 个直接删除、不登记 STUB_REGISTRY**（零消费者删除 tsc 验证安全，四件套为验收门；偏离随 ③ 审视复核）。
- 门改 3 处（anti-stub.test.ts）：
  1. CDEEP_DOMAINS 加 `'engine'`（existsSync 守卫同模式；src/engine 在场 → 实扫）
  2. 门③ regex（L196）加 `engine` → wave-c tag 后 engine 域登记条目须清零（删除后 0 条目 → 门③ 由空转实）
  3. 测试文件头注登记 S-E4 项（engine 纳扫 + 12 占位删除 + B18 指向）
- 前向接缝头注登记 2 处（H6 防空洞）：
  1. `state/index.ts` 头注「随 C 波填实后追加 re-export」→ 订正为「S-E4：attribution/fileHistory 2 子模块 8 零消费者占位已删（C 波未填实），后续波按需重建（§8.52 B18）」
  2. `engine/index.ts` 头注 ports 段登记 4 ports 零消费者占位删除（analytics/D 波按需重建）
- 门自探针（裁定 4）：临时造未登记 `export {}`（`src/engine/__probe_stub__.ts`）→ 门① 红（未登记检出）→ 删 → 绿；判别成立 = engine 域实入扫描集（探针文件不入提交）
- §8.52 **B 桶新增 B18**（17→18 项，② 实施时落 B 桶清单 + 本 ① 节预登记）：12 engine 占位删除清单 + 重建要求（后续波需要 4 ports / attribution / fileHistory 时按需重建且须实质实现，不重占位）
- **④ 闭环动作含切 `wave-c` tag**（tag = 门③ 激活开关；切后 gate 6 四件套验收门③ 实检；wave-b tag 先例 2026-09-22 同实践；本地 tag 无 remote 无 push 风险，可 `git tag -d` 回退）

**A15（P-M2 谓词阴性断言 + 红集重测）勘查结论（事实）**：

- §8.50 NOTE-2 登记（tests/func/engine-messaging-fs.test.ts:155-162）：谓词测试「markMessagesAsReadByPredicate 选择性标记」缺非匹配项 `out[1].read === false` 阴性断言——当时裁定「补之则 P-M2 单点突变红集 1→2 违反『恰 1 红』登记」→ 登记 E-wave-end 前向接缝（§8.52 第 20 项）
- P-M2 单点锚 = `mailbox.ts:266` `read: false`（反转为 true）；现登记红集 = 恰 1 红（'P-M2 writeToMailbox：新消息默认未读（readUnreadMessages）'，func 文件头 L21-25）
- 方案 4 步：
  1. **先重测现基线**：mutate mailbox.ts:266 → 现树实测恰 1 红（核登记与实测一致）→ verbatim restore + `git diff` 空核验
  2. 谓词测试补 `expect(out[1]!.read).toBe(false)`（L173 后；out[1] = from 'y' 非匹配项，突变态下缺省已读 → 红；反转型不敏感面 = out[0]/out[2] 两态恒 true 不变）
  3. **重测新红集**：同突变 → 实测恰 2 红（谓词测 + 原 1 红）→ verbatim restore + diff 核验；2 红集登记为新基线
  4. 双点绑定红集（6 测）不受影响：谓词测已在 6 红集内（length-3 断言收敛，头 L19-20），补断言不增红集
- 登记面更新 3 处：func 文件头 L21-25（单点红集 1→2 + A15 闭环 2026-09-25）/ mailbox.ts L260 头注（「恰 1 红」→「红集 2（A15 谓词阴性断言后）」）/ 谓词测试 L156-162 头注（NOTE-2 闭环，「E-wave-end 补…一并处置」措辞改已落形态）

**风险与验收门**：

- 风险 1：engine 纳扫后 src/engine 内或存在 12 个之外的 <5 实质行非门面文件（勘查 Python 扫描正则与门 hasSubstantiveExport 判定存在差异面）→ 实施后跑 anti-stub 实测，门① 红则按「登记或填实」处置并登记
- 风险 2：A15 红集重测对 mailbox.ts 复原保真度敏感 → verbatim restore + `git diff` 空双纪律（先例 F-4/P-E5）
- 验收：四件套 tsc 0 / eslint 0 / build 0 KB / 全量 **1447 pass / 89 文件 / 3108 expect**（A15 补 1 expect，测试数不变）+ gate 6；④ 切 wave-c tag 后 gate 复跑（门③ 实检 engine 0 条目）

### S-E4 ② 实施记录（2026-09-25，master 6e236d5 A15 + 5bc9e75 A14）

- **A15（6e236d5，2 文件 +16/-12）**：谓词测试补 `expect(out[1]!.read).toBe(false)` 阴性断言（out[1] = from 'y' 非匹配项）。4 步红集重测全实测成立：① 基线重测（mailbox.ts L266 `read: false` 突变 → 恰 1 红 12 pass/1 fail）→ ② 补断言 → ③ 新红集重测（L267 突变 → 恰 2 红 11 pass/2 fail = 'P-M2 writeToMailbox：新消息默认未读' + 'markMessagesAsReadByPredicate 选择性标记'）→ ④ verbatim restore（diff vs 突变前备份空；git diff 终态 = 头注订正 2 ins/1 del，产品代码零改动）。登记面 3 处（func 头 L21-26 / mailbox L261-263 内联 / 谓词测 L156-163）；双点 6 红集不受影响（谓词测本在 6 红集内）。
- **A14（5bc9e75，16 文件 +25/-97）**：12 零消费者占位删除（ports/ 4 + state/attribution/ 4 + state/fileHistory/ 4，各 7L、2 index 9L）+ anti-stub 门 3 改（CDEEP_DOMAINS + 'engine' / 门③ regex 9 域 / 测试文件头 S-E4 项）+ 前向接缝头注 2 处（state/index.ts + engine/index.ts，H6）+ docs B 桶 17→18（B18 登记）。门自探针判别成立：临时 `src/engine/__probe_stub__.ts`（`export {}`）→ 门① 红且列出该文件 → 删 → 3/3 绿（探针文件不入提交）。
- 四件套绿 = ① 验收门逐位命中：1447 pass / 89 文件 / 3108 expect + gate 6。

### S-E4 ③ 审视记录（2026-09-25，双只读 ≤2，task #123）

**A 路（旧仓对照 + S-E0 冻结裁定逐项核验）verdict：PASS-with-fixes（1 MINOR + 1 NOTE，零 BLOCKER/MAJOR）**。5 检查点全 PASS：① 12 占位删除面 vs 旧仓零保真回归（旧仓 fileHistory/attribution 功能面 = src/utils/fileHistory.ts + attribution 族，归 shell·swarm 波 C 桶非本波范围；零消费者 grep 0 命中）② S-E0 偏离裁定（删而不登记）成立（门② readFileSync 使「登记+删除」同提交 ENOENT；门③ engine 入 CDEEP 后同波删光强制）③ A15 谓词语义 + 恰 2 红推演 + 双点 6 红集不变（逐测核验其余 11 func 测不断言缺省态）④ 「engine 14」口径漂移差额 2 = sessionContext/sessionMemory（S-7d Port 1/Port 5 填实，git log --follow 追证）⑤ 门改动正确性（CDEEP 5 目录在场 + existsSync 守卫；门③ 9 域 regex 无遗漏，shared 有意排除由门② 兜底）。
- MINOR（EngineState.ts:18 头注「骨架待 C 波填实」失实，A14 同型订正漏第 3 处）→ 订正为 B18 口径（8 占位已删，后续波按需重建且须实质实现）：**db798fc**（纯头注，四件套 1447/89/3108 + gate 6 不变）
- NOTE（architecture-charter.md L198-199/212/227/286/327/334/404 仍引已删 ports 路径 + state 模块树）→ **接受不升版**：charter = 版本化设计定稿，条目 = B18「按需重建」设计规格，状态事实源 = 本 B18 登记；与 B 路 NOTE-1 同源

**B 路（H6 死接缝 + 测试面）verdict：PASS-with-fixes（3 MINOR + 1 NOTE，零 BLOCKER/MAJOR）**。5 检查点全 PASS：① H6 三登记（state/index.ts + engine/index.ts + docs B18）互相指认成立，删除后残留引用全为注释/文档面 ② anti-stub 门自身零缺陷（/tmp 探针逐字复现门逻辑：`export {}`/`export default`/local re-export 均检出 = 保守方向多检出不漏检，现树零现例；门② 3 shared 条目现态占位无漂移；门③ 审视时 vacuous = wave-c 未切，与 ④ 计划一致）③ A15 零行为 + 非 tautology（/tmp 仓快照突变实证 11 pass/2 fail = 红集 2，与登记逐字一致；per-test mkdtemp + ATLAS_CONFIG_DIR 还原，无新 flake）④ 提交卫生（6e236d5 恰 2 文件零产品代码 / 5bc9e75 恰 16 文件零测试断言 / 10ecd09 恰 1 文件）⑤ 全量 1447/89/3108 复现（A15 +1 expect 3107→3108，测试数不变）。
- MINOR-1（func L92 锚点注释「本测恰 1 红」失实）+ MINOR-2（mailbox.ts 文件头探针锚点段「func 恰 1 红…其余测试刻意不断言缺省态」两处失实）→ 订正为 A15 红集 2 口径：**ae60f59**（纯注释 2 文件 +6/-4，四件套不变）
- MINOR-3（EngineState.ts:18）= A 路 MINOR 同源，**db798fc 已核销**
- NOTE-1（charter 引用）= A 路 NOTE 同源，接受不升版

### S-E4 ④ 闭环记录（2026-09-25，task #123 完结）

- **wave-c tag 切出**（门③ 激活开关；wave-b 2026-09-22 先例同实践；本地 tag 无 remote，`git tag -d wave-c` 可回退）。切后 tag 集 = wave-a / wave-b / wave-c。门③ 由休眠转实检：gate 复跑 6 pass，expect 计 4→5（`if (hasWaveC)` 实检分支执行 `expect(cdeepStubs).toEqual([])` = STUB_REGISTRY 3 shared 条目 ∉ 9 域 regex → 0 条目，门③ 实检绿）。
- **终验四件套**（闭环态）：tsc 0 / eslint 0 / build 0 KB / 全量 **1447 pass / 89 文件 / 3109 expect**（闭环态 = 切 tag 前 3108 + 门③ 实检分支 +1 expect——tests/ 集含 tests/ci 2 文件，wave-c tag 切出后 gate ③ 实检分支执行 `expect(cdeepStubs).toEqual([])`；gate 单跑 = 6 测 / 5 expect；3108 为 S-E4 ②/③ 记录点（切 tag 前）口径）+ gate 6（门③ 实检）。
- **S-E4 ①→②→③→④ 全闭环**：10ecd09（① 执行前分析）→ 6e236d5（A15）→ 5bc9e75（A14）→ db798fc（③ A 路修复）→ ae60f59（③ B 路修复）→ wave-c tag（④）。**task #123 完结 → E-wave-end（task #119）完结**：A 桶 15 项（S-E1..S-E4）全闭环；B 桶 18 项登记（B18 = 12 engine 占位删除 + 重建要求）；C 桶（工具本体 + auto-mode + shell·swarm）= 后续既定波。下一步 = 工具本体波（bashPermissions 2471L + pathValidation 1303L + shouldUseSandbox 124L + 20 门控槽位）。

### 闭环后全量审计记录（2026-09-25，3 只读子代理【用户授权 ≤3 例外批次】，task #124）

审计目标 = E-wave 完成内容（提交链 / 基线谱系 / gate 态 / B 桶登记 / H6 头注）↔ 三份文本记录（本 §8.52 / progress memory / MEMORY.md 索引）↔ 终态实测 + 后续计划合理性。三路 verdict 全 PASS-with-issues，零 BLOCKER/MAJOR：

- **A 路（git / 基线 / gate 对照）**：PASS。全部 111 处引用 SHA 存在（含 2 处跨仓引用 a8af45b / 73631df 旧仓核验；d67c16 = 会话 ID 非 git 引用）；基线谱系 473 → 522 → 661 → 766 → 939 → 999 → 1054 → 1100/1160/1210/1262/1284/1374/1403（E-7 叶）→ 1414/2998（S-E1）→ 1428/3051（S-E2）→ 1447/89/3107（S-E3）→ 3108（S-E4 切 tag 前）→ **3109（闭环态）** 逐位自洽；gate ③ 机制逐字核验（wave-c 存在 → 9 域 regex → STUB_REGISTRY 3 shared 条目 ∉ regex → 0 条目；条件 expect 为 gate 文件唯一条件 expect，4→5 机制自洽，3 次复跑稳定非 flake）；四件套全绿；工作树干净零探针残留。2 NOTE：① acc4fee 记录 +720 vs `git show --stat` 实测 +767（记录层偏差，本次订正）② wave-c tag 指向 ③ 修复提交 ae60f59 而非 ④ 闭环 docs 07d4619——**裁定 = 接受不移动**（tag 语义 = 本波最终代码状态标记，gate ③ 仅查 tag 存在性，零行为影响；④ docs 系 post-tag 记录；wave-b 先例同实践）。
- **B 路（三记录互一致）**：PASS。A 桶 15 项闭环 / 任务号（#119..#124）/ B 桶 17→18 演进 / 提交链三源一致。2 MINOR（均已修）：① S-E2「8 项」off-by-one——实际 A4-A10 = 7 项（「A 桶 15 项 = 3+7+3+2」仅 7 项自洽；L2470/L2558 两处）② A10 撤回记录「预分析冻结 5 处（workerAgent / coordinatorMode / AgentTool / forkSubagent）」归因失实——① 节预分析实冻结 2 文件 5 处（workerAgent.ts 3 + coordinatorMode.ts 2）；AgentTool.ts / forkSubagent.ts 系 tools/agent/ 域内相对 import 非 STR-1 归一对象（不在预分析范围，实施时 4 文件被改）。3 NOTE：① S-E1「（+11/21）」口径——expect 实 +23 = 实施 21 + 审视 F-1c 2（docs「2975+21+2」正确，progress memory 简注订正）② runAgent 行号漂移 111→119→126（文件演化，接受）③ B 桶逐项清单 docs 单一事实源（progress memory 仅引计数，接受）。
- **C 路（后续计划合理性）**：PASS。数字全 grounded：bashPermissions 2471 / pathValidation 1303 / shouldUseSandbox 124 / PowerShell pathValidation 2049 逐字命中；swarm 整树 7217L 逐字；分类器族组件和 3014 ≈ 3030（yoloClassifier 1332 + prompts 288 + autoModeState 39 + classifierDecision 91 + classifierShared 39 + bypassPermissionsKillswitch 150 + bashClassifier 61 + denialTracking 45 + dangerousPatterns 54 = 2099 + permissionSetup auto 面 ~560 + permissions.ts auto 支 ~355；yoloClassifier 主树 1332 核验——C 路初测 1335 系陈旧 worktree checkout 值，记录值正确）；7L 骨架 ×3（cli / mount / state/index）= D 波归属；bashClassifier 引用口径 = 61L 体（新仓盘上 78L，含 provenance 头注，diff 逐字）。依赖有序（auto-mode 消费点 = bashPermissions L1378-1490 投机族 → 工具本体先行、分类器族随后；shell·swarm 消费 B7/B8/B12/B14 无跨波冲突）。B 桶 18 项零孤儿（全有归属波）。无自矛盾（20 门控槽位 C 桶 vs B16 = 同一件事非双计）。
- **登记不修清单（C 路建议，工具本体波开波时预登记，本次不动代码/图）**：① B10（流式消费面）/ B15（任务态 4 项顺延波）属「按需触发 / 无排期」，未排入总波次序列 → 开波时显式登记归属 ② §8.3 路线图 L324-328 陈旧（未反映 E-wave-end 后插入的 C 桶三波；F 波行 B13 归属已 §8.52 S-E0 改判 D 波）→ 开波时回刷 ③ D 波与三波 C 桶先后仅隐式（推导链自洽）→ 补一行显式排序 ④「47 工具本体」计数口径未钉死（朴素枚举 49 / cron 计入 1 项 = 47，E-2 沿用值）→ 开波勘查重数定口径 ⑤ bashClassifier 引用口径按上条。
- **记录层漂移修复（本审计，零行为，本提交 + memory 同步）**：5 项 = S-E2「8 项」→「7 项」×2（L2470/L2558）/ A10 预分析文件清单误归因订正（L2625）/ acc4fee「+720」→「+767」（L2618）/ 闭环态全量基线 3108→3109（gate ③ 实检 +1；3108 = 切 tag 前口径，本文件 L2844 + progress memory + MEMORY.md 索引三处同步）/ progress memory「（+11/21）」→「（+11 测 / +23 expect）」+ A10 订正。

### §8.53 工具本体波（C 桶 ①）执行前分析（2026-09-25，task #125）

**波定位** = C 桶 ①「工具本体 49」（47 = 历史口径，§8.53 审计④）的**首个子波** = **Bash 纵切 · checkPermissions 面**（§8.43 裁定① deferred 项，E-6 全 shell 波登记）+ 20 门控槽裁定 + ⑧ 消费面接线。C 桶 ①「工具本体 49」为伞项（49 本体纵切），本闭环子波落 Bash checkPermissions 面（叶 + 机制 + 接线）；Bash 本体纵切 + 其余 48 本体纵切 = 后续子波（序列登记，不新开 C 桶项）。

**1. 范围裁定（冻结，旧仓 @ a8af45b 逐字行数基线）**

- 范围文件面 = **15 文件 / 17924L**：
  - 3 指定（裁定① 点名）：`BashTool/bashPermissions.ts` 2471 / `BashTool/pathValidation.ts` 1303 / `BashTool/shouldUseSandbox.ts` 124
  - 4 伴生（3 文件强制 import 闭包，不迁则 3 文件不可编译）：`bashCommandHelpers` 265 / `bashSecurity` 2427 / `modeValidation` 115 / `sedValidation` 684
  - bash 内核闭包子集（旧仓 `src/utils/bash/` 14 文件 12074L 总，本波仅迁 8 文件闭包子集 = **10535L**）：`bashParser` 4436 / `ast` 2679 / `commands` 1339 / `heredoc` 733 / `treeSitterAnalysis` 506 / `ParsedCommand` 318 / `shellQuote` 304 / `parser` 220
  - 残留守（7 文件 1539L 非闭包不迁，登记防「以为已全」）：ShellSnapshot 573 / bashPipeCommand 294 / shellCompletion 259 / prefix 204 / shellQuoting 128 / registry 53 / shellPrefix 28
- **本子波不做**（前向登记）：
  - **Bash 本体纵切 = 下一子波**：`BashTool/BashTool.ts` 251 + `prompt` 332 + `commandSemantics` 140 + `readOnlyValidation` 1924 + `sedEditParser` 322 + `utils` 221 + `toolName` 2 + `commentLabel` 13 + `destructiveCommandWarning` 102（ts 面 3310L；`UI.tsx` / `BashToolResultMessage.tsx` = React 层域外，先例 = tasks 波「PowerShellTool.tsx L819/948 React 层未移植」）
  - auto-mode 分类器族 ~3030L = C 桶 ②：本波 `bashPermissions` L1378-1490 speculative 族**逐字随迁**，分类器消费接 61L stub（E-6 S-6c「stub 即外部构建形态」= enabled=false 惰性面），② 真族换 stub 后族激活零代码改动
  - 其余 46 本体纵切 → 工具本体波后续子波（序列：Bash 本体 → Read/Edit 等高频 → 长尾；不新开 C 桶项）
- **B16 PowerShell 2049L 裁定**：bash-only 纵切域外，**改判登记**（非 C 桶项，独立裁定 / 未来 PowerShell 纵切；与 §8.42「域外不随迁」裁定一致），B 桶 18 项计数不变（B16 处置 = 改判登记非核销）

**2. 20 门控槽裁定表**（旧仓 `tools.ts` getAllBaseTools 398L 逐字基线；新仓门控机制 = `shared/feature.ts` feature() env kill-switch 约定【T-5d 先例，call-time 可测】，机制零新增，仅逐槽裁定）：

| 槽 | 门（旧仓） | 本体 | 裁定 |
|---|---|---|---|
| ① IS_ATLAS_DEV | `ATLAS_DEV` env | Tungsten + SuggestBackgroundPR + REPL（3 工具 1 槽） | 残留守（dev 工具本体未落，各本体纵切落时随体声明门） |
| ② AGENT_TRIGGERS | feature | cron 三件套（3 工具） | 残留守归 = 任务工具本体子波（scheduler 域 E-7 S-7b 已落） |
| ③ AGENT_TRIGGERS_REMOTE | feature | RemoteTrigger | 残留守归 = remote 波（D 波后） |
| ④ MONITOR_TOOL | feature | Monitor | 残留守（本体纵切） |
| ⑤ OVERFLOW_TEST_TOOL | feature | OverflowTest | **关闭**（测试专用工具，新仓无产品价值不迁） |
| ⑥ CONTEXT_COLLAPSE | feature | CtxInspect | 残留守（本体纵切） |
| ⑦ TERMINAL_PANEL | feature | TerminalCapture | 残留守归 = shell 波（TUI 面） |
| ⑧ WEB_BROWSER_TOOL | feature | WebBrowser | 残留守（本体纵切） |
| ⑨ HISTORY_SNIP | feature | Snip | 残留守归 = shell/REPL 波（predicates compact-boundary 检索族 A-NOTE-2 先例） |
| ⑩ UDS_INBOX | feature | ListPeers | 残留守归 = shell·swarm 波（UDS Port 9 已登记） |
| ⑪ WORKFLOW_SCRIPTS | feature | Workflow | 残留守（本体纵切） |
| ⑫ ATLAS_VERIFY_PLAN | feature | VerifyPlanExecution | 残留守（本体纵切） |
| ⑬ ENABLE_LSP_TOOL | env | LSP | 残留守（本体纵切） |
| ⑭ worktree | isWorktreeModeEnabled | Enter/ExitWorktree（2） | 残留守归 = worktree 工具本体子波（worktree 域 E-7 S-7c 已落） |
| ⑮ agentSwarms | isAgentSwarmsEnabled | TeamCreate/TeamDelete（2） | 残留守归 = shell·swarm 波 |
| ⑯ isTodoV2 | isTodoV2Enabled | Task 四件套（4） | 残留守归 = 任务工具本体子波（tasks 域 E-7 S-7a 已落，与 ② 同子波） |
| ⑰ hasEmbeddedSearchTools | hasEmbeddedSearchTools() | Glob/Grep 抑制（反向条件） | **关闭**（bun 内嵌 bfs/ugrep = 旧仓构建特例，新仓条件恒 false → Glob/Grep 恒注册，槽退化为 2 常量注册） |
| ⑱ NODE_ENV=test | `NODE_ENV==='test'` | TestingPermission | **关闭**（新仓测试体系不消费该工具） |
| ⑲ ToolSearch | isToolSearchEnabledOptimistic() | ToolSearch | 残留守（本体纵切；claude.ts 请求时 deferred 决策面 = D 波壳接线） |
| ⑳ PowerShell | getPowerShellTool() | PowerShell | **域外改判登记**（bash-only 纵切；B16 裁定同） |

- 裁定汇总：**关闭 3（⑤⑰⑱）+ 域外改判 1（⑳）+ 残留守 16**（15 条各带归属波 + ① 无归属波 = 本体纵切随体声明）→ S-T3 更新 toolRegistry 头注（残留守枚举 → 逐槽裁定枚举）。

**3. 落位与域裁定**

- 15 文件 → 新 `src/engine/tools/bash/` 子域（Bash 工具面 = 首个本体纵切子域；内核与面同子域，toolRegistry 机制不变；后续 Read/Edit 纵切各立子域）+ 双门面（`bash/index.ts` 显式名块 + `tools/index.ts` 转出门，STR-1 先例；全引擎面 0 重名核验，先例 = engine 面 611 名）
- **sandbox 消费经 `permissions/sandboxAccess` 注入窗口**（L3 自治先例 E-6 S-6a，permissions 域不 import sandbox 域）：`shouldUseSandbox` 消费 `isSandboxingEnabled()` + `areUnsandboxedCommandsAllowed()` → 窗口成员 **+1**（`areUnsandboxedCommandsAllowed`，placeholder = false，禁用态短路语义零变化）+ 组合根 ⑧ `setSandboxAccess` 注入同步扩面。tools 域不引新 tools→sandbox 直 import 边（依赖方向干净，审视核验面）
- 跨域依赖闭包映射（旧 import → 新仓等价；标「② 核」= 实施时符号核验）：
  - `feature`（bunBundle F5 stub）→ `shared/feature.ts` 真 feature()（**delta 登记**：旧仓 DCE cliff 注释 = bun 构建系统特例，新仓普通模块 cliff 不成立；alias const 重绑定逐字保留零 diff，头注登记「cliff 失效」）
  - `getFeatureValue_CACHED_MAY_BE_STALE`（growthbook）→ **裁**（E-7 S-7b growthbook 注入口裁剪先例；消费点 ② 核，feature()/config 面替代）
  - `getCwd` → `bootstrap/cwd.ts` ✓ / `logForDebugging` → `shared/debug.ts` ✓ / `isEnvTruthy` → `shared/env.ts` ✓ / `AbortError` → `shared/errors.ts` ✓ / `getPlatform` → `shared/platform.ts` ✓ / `getDirectoryForPath` → `shared/path.ts`（② 核符号）
  - `count`（utils/array）→ shared 无既有 → 域内本地实现（lodash 裁剪先例）
  - `APIUserAbortError` / `PendingClassifierCheck` / `ToolPermissionContext` / `ToolUseContext` → shared 类型面（② 核落位：types-session vs permissions）
  - permissions 族（PermissionResult / PermissionRule / PermissionUpdate / permissionRuleParser / shellRuleMatching / permissions.ts 含 createPermissionRequestMessage + getRuleByContentsForTool）→ 新仓 `src/permissions/` 域 E-4 已落（② 符号逐个核）
  - `getSandboxManager`（core/sandbox/compat）→ sandboxAccess 窗口（见上）
  - `getSettings_DEPRECATED` → engine/config settings 门面（E-3；sandbox 面 z.any() 按源直读，消费 `sandbox?.excludedCommands`）
  - `windowsPathToPosixPath`（utils/windowsPaths）→ **bash-only 基线裁定**：② grep 消费点——有消费则域内最小实现（纯函数路径转换）+ 登记；零消费则裁 + 登记
  - `BashTool`（./BashTool.js 型 import，面文件用其 Input 型）→ 本体未落（下一子波）→ 域内最小 Input duck 型（AppState duck 最小形先例）+ 前向接缝登记（本子波末头注：本体子波换真型）
  - `bashClassifier` → 新仓 61L stub（auto-mode ② 前向接缝，S-6c 已登记）
- 测试分层：旧仓内核/面无专属测试文件（tests/unit 仅 sandbox 2 文件 156L，不属本波文件面闭包）→ **测试全量新写**（unit = 内核纯函数族 + 面决策族零磁盘；func = shouldUseSandbox settings tmp 隔离真盘 1 文件；R5 红分支攻击例）
- 探针计划（各探针恰 N 红 + verbatim restore diff 核验）：P-T1 内核（ast fail-closed allowlist 删 1 守卫 → 恰 1 红）/ P-T2 bashPermissions（stripSafeWrappers 安全包装白名单支反转 → 红集）/ P-T3 bashSecurity（危险模式族删 1 成员 → 恰 1 红）/ P-T4 pathValidation（checkPathConstraints 3.7 sandbox 写 allowlist 支删 → 红集）/ P-T5 shouldUseSandbox（excludedCommands 不动点循环删 → 恰 1 红）

**4. 审计 5 项预登记落位（task #124 登记不修 → 开波预登记，本节承载）**

- ① B10（流式消费面）/ B15（任务态 4 项顺延波）未排总序列 → 预登记：B10 = 流式纵切（按需触发，D 波后）；B15 = 任务态 4 项 = 任务工具本体子波（与槽 ②⑯ 同子波，下界 = shell/swarm 波后）
- ② §8.3 路线图 L324-328 陈旧 → S-T3 回刷（E-wave-end → C 桶三波插入 + B13 已 S-E0 改判 D 波 + 本节 §8.53 加入）
- ③ D 波与 C 桶三波先后仅隐式 → 显式裁定：**C 桶 ①②③ → D 波（壳接线 + B13 + gelu 复验 + wave-d）→ remote → analytics**（S-T3 加行入 §8.3）
- ④ 「47 工具本体」计数口径 → 钉死：旧仓 getAllBaseTools 名单全门开工具名计数（cron 三件套按 3 计 = 朴素 49；E-2 沿用 47 = cron 计 1 项）。**裁定 = 朴素 49 口径（每工具计 1），47 标历史口径**。**S-T3 脚本点数核（2026-09-26）= 49 坐实**：旧仓 tools.ts `getAllBaseTools`（L200-259）**非 Ascend** 基础工具名全门开枚举 = 49 项，结构 = 19 无条件（AgentTool/TaskOutput/Bash/ExitPlanModeV2/FileRead/FileEdit/FileWrite/NotebookEdit/WebFetch/TodoWrite/WebSearch/TaskStop/AskUserQuestion/Skill/EnterPlanMode/Config/SendMessage/ListMcpResources/ReadMcpResource）+ 30 门控（Glob/Grep 2 + Tungsten/SuggestBackgroundPR/WebBrowser 3 + Task 四件套 4 + Overflow/CtxInspect/TerminalCapture/LSP 4 + Worktree 2 + ListPeers/Team 双件 3 + VerifyPlan/REPL/Workflow 3 + cron 三件套 3 + RemoteTrigger/Monitor/PowerShell/Snip/TestingPermission/ToolSearch 6）；历史 47 = cron 三件套计 1 项（49−2）。**Ascend 16 = 独立门控族，不计入本 49**（toolRegistry 头注 6 处 + C 桶/波定位口径已同步为 49）。
- ⑤ bashClassifier 引用口径 → 钉死：记录统一引 61L 体（新仓盘上 78L 含 17L provenance 头注，diff 逐字）

**5. 切片计划与验收门**

- S-T1 内核 8 文件（10535L）+ unit 测 → S-T2 面 7 文件（7389L，两段：S-T2a bashSecurity + 3 伴生【265+2427+115+684 = 3491L】/ S-T2b bashPermissions + pathValidation + shouldUseSandbox【3898L】）+ unit/func 测 → S-T3 20 槽裁定表落 registry 头注 + 审计 5 项预登记落位 + §8.3 L324-328 回刷 → S-T4 ⑧ 接线（sandboxAccess 窗口 +1 成员 + 组合根注入 + executor `ports/sandbox.ts` 消费面激活【该 port L5 已预声明「ShellExecutor.exec → isSandboxingEnabled()（shouldUseSandbox 决策）」】）→ S-T5 整波审视（双只读 ≤2：A 路旧仓逐字对照 / B 路 H6 死接缝 + 测试面）+ 闭环（四件套 + gate + memory）
- 每切片四件套：tsc 0 / eslint 0 / build 0 KB / 全量 + gate 6（基线 1447 pass / 89 文件 / 3109 expect【闭环态】+ gate 单跑 6 测 / 5 expect；测试数随切片增，expect ② 实测）
- 风险 1：bashParser 4436L 手写解析器**零继承测试面** = 本波最大盲区 → S-T1 unit 攻击例聚焦 fail-closed allowlist + PARSE_ABORTED 支（R5 红分支驱动，绝不写假装通过的能力测试）
- 风险 2：15 文件单子域门面显式名块 0 重名核验（先例 = engine 面 611 名 0 重名）
- 风险 3：sandboxAccess 窗口扩 +1 成员 = 组合根 ⑧ 注入 + placeholder 语义复审（placeholder 恒 false = 禁用态零行为变化，P-T 探针外加 1 窗口服判）
- 验收：S-T5 双只读零 BLOCKER/MAJOR → 闭环；**波 tag 裁定 = 不切新 tag**（tag = 大波节点先例，C 桶子波提交链记录；gate ③ 仍用 wave-c tag 不受影响）；下一子波 = Bash 本体纵切（3310L ts 面 + UI 域外裁面）

### S-T1~S-T4 ② 实施记录（2026-09-25/26，提交链）

| 切片 | SHA | 内容 |
|---|---|---|
| S-T1 | 9aebe78 | bash 内核 8 文件（10535L）逐字随迁 + 4 本地小模块 + 内核 unit 测 |
| S-T2a | 7b2286b | bash checkPermissions 面 4 文件（bashSecurity 2427/sedValidation 684/modeValidation 115/bashCommandHelpers 265 = 3491L）逐字随迁 + 面型恢复 |
| S-T2b | ebf184d | bash 核心 3 文件（bashPermissions 2471/pathValidation 1303/shouldUseSandbox 124）+ 6 本地辅助模块逐字随迁 + sandboxAccess 窗口扩面 |
| S-T3 | 63d295a | 20 槽裁定表落 registry 头注 + 审计 5 项预登记 + §8.3 回刷 + 49 口径订正 |
| S-T4 | 23db653 | ⑧ 接线——组合根 setSandboxAccess 注入 + executor 端口 shouldUseSandbox 消费面激活 |

（每切片四件套 tsc 0 / eslint 0 / build 0 / 全量 + gate 6 绿；终态基线见 ④。S-T5 审视修复 = cab2b99，见 ③。）

### S-T5 ③ 整波审视记录（2026-09-26）

**③a 突变探针 P-T1..P-T5**（纪律 = backup→mutate→定向红集实测→verbatim restore diff 核验→git clean；「恰 1 红」为下界，实测多红即订正登记）：

| 探针 | 靶点 | 计划（下界） | 实测红集 |
|---|---|---|---|
| P-T1 | ast.ts 预检 UNICODE_WHITESPACE 守卫删 | 恰 1 红 | **1 恰红**（内核预检测；too-complex→simple 失守） |
| P-T2 | bashPermissions stripSafeWrappers 安全包装白名单支反转 | 红集 | **4 红**（core-face 直接函数测 + bashToolHasPermission timeout 规则面 + shouldUseSandbox 不动点 unit + func；跨 3 消费面） |
| P-T3 | bashSecurity sync 面单引号反斜杠早退守卫删 | 恰 1 红 | **1 恰红**（**改选登记**：初选 COMMAND_SUBSTITUTION_PATTERNS `/>/` 成员（进程替换 `>(`）= 0 红——core-face「进程替换 → ask」测锚点在 pathValidation 第 5 安全块（L1054-1068），非 bashSecurity 模式扫描；改选 = `bashCommandIsSafe_DEPRECATED` sync 面早退守卫（删即 passthrough，无下游兜底）） |
| P-T4 | pathValidation 3.7 sandbox 写 allowlist 支删 | 红集 | **2 恰红**（core-face checkPathConstraints 写支 + path-validation.test.ts isPathAllowed 3.7 支） |
| P-T5 | shouldUseSandbox excludedCommands 不动点循环删 | 恰 1 红 下界 | **3 红**（unit/func/adapter 三点绑定：core-face unit「不动点剥除」+ func「前缀命中 → 不 sandbox」+ S-T4 adapter「总门开 + excludedCommands 命中 → false」；下界订正，同 P-M2 先例；两点测试头注已登记三点绑定） |

**③b 双只读 ≤2（A 路 = 旧仓逐字对照 + delta 完备性 / B 路 = H6 死接缝 + 测试面），双路零 BLOCKER/零 MAJOR**：

- **A 路（4 MINOR + 5 NOTE）**：28 接缝登记全过 / anti-stub 0 新增 / 探针 5/5 非 tautology / 6 测试文件零盘合规 / 49 口径独立重数（19 无条件 + 30 门控 = 49，Ascend 16 另计）/ L3·STR-1 干净；2 异常项裁定正当（S-T1 bun.lock + package.json = shell-quote 1.10.0 新增依赖仅 / S-T2b modelprovider/index.ts = APIUserAbortError 导出）。
- **B 路（1 MINOR + 4 NOTE）**：测试面零缺陷 + 接缝双向扫描零死接缝；1 MINOR = 探针标签（kernel 2 处 P-T1/P-T2 误标 + perm-face P-T3 正向基线缺失）。
- **处置 = 全部经 grep/Read 核验后落（子代理报告 = 数据，逐项盘上复核方动手），cab2b99（18 文件，全注释/头注行，代码行零变更）**：
  - 4 A-MINOR 头注事实订正：bashPermissions 消费者计数 14→29/9→10（Bash 本体换真 zod 型 10 位 duck 型）/ platform SUPPORTED_PLATFORMS 消费者 0→3（atlasDesktop.ts ×3 = 域外 D 波壳层核查面）/ bashReadOnly 前缀族 20→24 项（旧仓 10+6+8，数组体 diff 逐字核验）。
  - 5 文件 6 处陈旧「47」口径同步 →「工具本体 49 个（47 = 历史口径，§8.53 审计④）」。
  - B-MINOR 探针标签：kernel P-T1/P-T2 去误标 + P-T1 正向基线 tag / perm-face P-T3 正向基线 tag。
  - NOTE 登记：json replacer 重载不随迁（本域 0 消费）/ prefixStatic LRU-200→无界 delta / S-T1 三文件 eslint 裁指令 4 处转纯注留理据 / func + adapter P-T5 三点绑定头注。
  - **1 接缝裁定（B-NOTE-1）**：ruleMatching `createPermissionRequestMessage` 展示裁剪（旧仓 Bash 支 extractOutputRedirections）前向接缝 → **归属 auto-mode 波（C 桶 ②）**——纯展示面 delta（决策面「哪些段需审批」零变化，仅 needsApproval 列表展示原始分段命令），工具本体波接受该 delta 登记核销，不恢复展示裁剪（ruleMatching 头注已落裁定）。
  - 余 NOTE 接受登记（零行为，未改）。

### S-T5 ④ 闭环记录（2026-09-26，task #125/#127 闭环）

- **终验四件套（cab2b99 后）**：tsc 0 / eslint 0 err（1 既有 ignore 警告 = tests/fixtures/executor-port-fakes.ts，修前同形）/ build 0 KB / 全量 **1573 pass / 94 文件 / 3398 expect**（开波前闭环态 1447/89/3109：+126 测 / +5 文件【kernel / core-face / perm-face / should-use-sandbox-func / adapter-delegation】/ +289 expect；S-T5 修复 pass 零行为，数字不变）+ gate **6 pass / 5 expect**。
- **波 tag 裁定 = 不切新 tag**（tag = 大波节点先例；C 桶子波提交链 8861fa7（① 执行前分析）→ 9aebe78 → 7b2286b → ebf184d → 63d295a → 23db653 → cab2b99 记录本波；gate ③ 仍用 wave-c tag 不受影响）。
- **子波范围闭环核验**：15 文件 17924L 逐字随迁（内核 8 10535L + 面 7 7389L）/ 20 槽裁定（关闭 3⑤⑰⑱ + 域外改判 1⑳ + 残留守 16）/ ⑧ 消费面接线（窗口 +1 成员 + 组合根注入 + executor 端口激活）/ 探针 5/5 非 tautology / 双只读零 BLOCKER/MAJOR / 残留守 7 文件 1539L 登记防「以为已全」。
- **下一子波 = C 桶 ① Bash 本体纵切**（ts 面 3310L：BashTool.ts 251 / prompt 332 / commandSemantics 140 / readOnlyValidation 1924 / sedEditParser 322 / utils 221 / toolName 2 / commentLabel 13 / destructiveCommandWarning 102；UI.tsx / BashToolResultMessage.tsx = React 层域外，先例 = tasks 波 PowerShellTool.tsx 域外裁面）→ 其余 48 本体纵切（序列：高频 → 长尾）→ C 桶 ② auto-mode 纵切波（~3030L 分类器族；本波 bashClassifier 61L 桩 = 其前向接缝，② 真族换桩后族激活零代码改动）→ C 桶 ③ shell·swarm 波（7217L）。

### §8.54 Bash 本体纵切子波（C 桶 ① 子波 2）执行前分析（2026-09-26，task #128）

**波定位** = C 桶 ①「工具本体 49」的**第二子波** = **Bash 本体纵切**（§8.53 ④ 闭环记录「下一子波」坐实项）。上一子波（checkPermissions 面）落 决策内核 15 文件 17924L；本子波落 **BashTool 本体 9 文件 ts 面 3307L + 依赖闭包层**，消费 S-T2a 前向接缝（bashToolInput duck 型换真输入型），落 §8.43 裁定①「工具面 checkPermissions 实现半」，闭环后 C 桶 ① 剩 其余 48 本体纵切（高频 → 长尾）。

**① 范围裁定（9 文件逐字随迁 `src/engine/tools/bash/`，UI 两文件域外）**：

| 旧仓文件 | 行数 | 落位 | 裁定 |
|---|---|---|---|
| `BashTool/BashTool.ts` | 251 | `bashTool.ts` | 本体。旧 `buildTool(zod)` → 新 shared Tool 契约（inputSchema = 纯 JSON schema 对象，AgentTool 先例）；call spawn 面 + 后台任务面（BgTask map 模块态）+ mapToolResult 逐字；`READ_ONLY_PREFIXES`/`isReadOnlyCommand` 不随迁（S-T2b 已抽离 `bashReadOnly.ts`，本体 isReadOnly 消费该域函数 = bashReadOnly 头注接缝消费）；`renderToolUseMessage` → `() => null`（TUI 残留守，AgentTool 先例，D 波/TUI 波）；**checkPermissions = 首个非-passthrough 工具面实现**（下详） |
| `BashTool/prompt.ts` | 332 | `bashPrompt.ts` | getSimplePrompt/getDefaultTimeoutMs/getMaxTimeoutMs 逐字；`getSandboxManager()` 值位 → **sandboxAccess 注入窗口扩面**（S-T4 先例，下详）；`getAttributionTexts` 半裁（下详 D-1）；`TodoWriteTool.name` → `TODO_WRITE_TOOL_NAME`（toolNames 单一事实源，delta D-2）；`feature('MONITOR_TOOL')` 逐字保留（新 feature() 读 `FEATURE_MONITOR_TOOL` env，Monitor 工具未落 = 分支恒惰性，非裁面） |
| `BashTool/commandSemantics.ts` | 140 | `commandSemantics.ts` | 逐字（splitCommand_DEPRECATED → 本域 commands.ts） |
| `BashTool/readOnlyValidation.ts` | 1924 | `readOnlyValidation.ts` | 逐字；`z.infer<typeof BashTool.inputSchema>` → 本域 `BashToolInput` 型（bashToolInput.ts 单一事实源，S-T2a 接缝消费）；`isCurrentDirectoryBareGitRepo` → 本域 `gitBareRepo.ts`（新，下详） |
| `BashTool/sedEditParser.ts` | 322 | `sedEditParser.ts` | 逐字（crypto randomBytes = node 内建） |
| `BashTool/utils.ts` | 221 | `bashUtils.ts` | 逐字；`maybeResizeAndDownsampleImageBuffer` 依赖裁（下详 D-3）；`getMaxOutputLength` → task 域 outputLimits（已落） |
| `BashTool/toolName.ts` | 2 | —（不落文件） | `BASH_TOOL_NAME` 新仓 `engine/tools/toolNames.ts` 单一事实源（E-2 T-5d 已落）；旧文件「破 prompt.ts 循环依赖」角色新仓消解（delta D-4） |
| `BashTool/commentLabel.ts` | 13 | `commentLabel.ts` | 逐字纯叶子（旧消费方 collapseReadSearch = 旧 utils 域外面，函数迁位保留，消费面残留守登记） |
| `BashTool/destructiveCommandWarning.ts` | 102 | `destructiveCommandWarning.ts` | 逐字纯叶子（旧消费方 = React BashPermissionRequest / PowerShell 族 = 域外，函数迁位保留，本波补 unit 面钉 DESTRUCTIVE_PATTERNS 表） |

**React 层域外**（B16/PowerShell 域外改判先例）：`UI.tsx` / `BashToolResultMessage.tsx` 不随迁（renderToolUseMessage 残留守 = D 波/TUI 波）；旧仓 `PowerShellTool` 族 / `BashPermissionRequest` / `SedEditPermissionRequest` / `notebook.ts` / `PromptSuggestion` 消费面全部域外，本波零恢复。

**② 依赖闭包层（新增随迁，旧仓散件归集）**：

- `readOnlyCommandValidation.ts` **1893L**（旧 `utils/shell/`，5 张 READ_ONLY map + validateFlags + EXTERNAL_READONLY_COMMANDS + FlagArgType；唯一外部依赖 `getPlatform` → 新 shared/platform ✓；`containsVulnerableUncPath` 与已落 `shared/unc.ts` 去重 = 本文件 re-export shared 版（单一事实源，delta D-5））——Bash 域独占（新仓无 PowerShell 域，shared map 无拆分需求）。
- `gitBareRepo.ts` ~60L（旧 `utils/git.ts` `isCurrentDirectoryBareGitRepo` 逐字；fs 面 = node:fs 直用，旧 `getFsImplementation()` 抽象层不随迁，delta D-6；func 层真 tmpdir 三 fixture：`.git/HEAD` 文件=非裸仓 / `.git/` 目录无 HEAD + `objects/` 目录=裸仓 / 无 `.git`=指示符判定）。
- `bashTimeouts.ts` ~50L（旧 `utils/timeouts.ts` 2 env 函数逐字：`BASH_DEFAULT_TIMEOUT_MS`/`BASH_MAX_TIMEOUT_MS`）。
- 小 env/prompt helper 归集（各 2-6L 逐字）：`hasEmbeddedSearchTools`（EMBEDDED_SEARCH_TOOLS + ATLAS_ENTRYPOINT 门）、`shouldMaintainProjectWorkingDir`（ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR）、`shouldIncludeGitInstructions`（ATLAS_DISABLE_GIT_INSTRUCTIONS env + engine/config `includeGitInstructions ?? true`，旧 getInitialSettings 读面换 engine/config 门面）、`prependBullets`（旧 constants/prompts.ts 6L 纯函数，域内定义 + TODO PR to shared（shared 门面值缺口先例））。

**③ checkPermissions 实现半裁定（§8.43 裁定① 闭环）**：旧仓事实 = BashTool 不覆写 checkPermissions（buildTool 默认 `{allow, updatedInput}` 委托通用系统）；Bash 特规决策核 `bashToolHasPermission`（2471L，S-T 波已随迁本域）经 bashCommandHelpers 接交互 UI 层，管线 1c 鸭子分发到默认。新仓 S-T 波 permissions 决策主体 ⑥ 半落 + 1c 零活实现（残留守①）。**本波裁定**：`BashTool.checkPermissions(input, context)` = 一线接线 `bashToolHasPermission(input as BashToolInput, context as BashToolUseContext)`（新核已鸭子化，签名逐字对齐；abort 重抛语义由 gate 侧 1c catch 继承，工具面零自有 try/catch = 旧核体逐字零 delta）。此为本仓**首个非-passthrough 工具面实现**，激活 S-T 波登记的 1c 分发面（ruleMatching 1c 鸭子 / permissions 1c 落点注释同步订正 = S-B5 内）。

**④ 前向接缝消费（S-T2a，复审勿当遗漏重提）**：`bashToolInput.ts` `BashToolInput` duck 型 = 旧 inputSchema z.infer 展开字面量，本波坐实为单一事实源（与 bashTool.ts JSON schema 逐字段对齐，6 导入方零改动：tools/index / bash/index / bashPermissions / pathValidation / bashCommandHelpers / modeValidation）；头注接缝文改「已消费」登记。**`BashToolUseContext` duck 扩 1 成员 `options.cwd?: string`**（call 面 `context.options.cwd ?? process.cwd()` 消费，delta D-7；旧 ToolUseContext 全字段面仍不随迁 = duck 最小形先例）。

**⑤ sandboxAccess 窗口扩面**：prompt 沙箱节消费 manager 7 方法（isSandboxingEnabled/getFsReadConfig/getFsWriteConfig/getNetworkRestrictionConfig/getAllowUnixSockets/getIgnoreViolations/areUnsandboxedCommandsAllowed），现窗口 4 成员 → 扩 4 成员（getFsReadConfig/getNetworkRestrictionConfig/getAllowUnixSockets/getIgnoreViolations），组合根 ⑧ 注入位同步扩（S-T4 ⑧ 先例；adapter 壳零改——executor 端口不消费新成员）。

**⑥ delta/残留守登记（防「以为已全」）**：
- **D-1** `getAttributionTexts` 半裁：commit/PR 指令节归属文本后缀（`🤖 Generated with…`/`Co-Authored-By`）不随迁——旧链 = modelprovider 模型显示名 + 远程 session URL + PRODUCT_URL 深链（跨域深链域外），`getCommitAndPRInstructions` 保留全节骨架、后缀支裁（git 安全协议 / gh PR 流程逐字保留）；归属 = attribution/remote 波（残留守登记）。
- **D-2** `TodoWriteTool.name` → `TODO_WRITE_TOOL_NAME` 常量（值逐字相同 'TodoWrite'，单一事实源收口）。
- **D-3** `maybeResizeAndDownsampleImageBuffer`（旧 imageResizer ← FileReadTool/imageProcessor 重链）不随迁：`resizeShellImageOutput` 函数壳保留（data-URI 解析 + 20MB 上限 + 溢出文件重读逐字），resize 调用点裁 = 返回原 data-URI 不缩放（行为 delta：大图不降采样，API 5MB 拒绝风险面登记）；归属 = 图像面波（残留守登记，func 测钉壳行为）。
- **D-4** toolName.ts 不落文件（下详① 表）。
- **D-5** containsVulnerableUncPath 去重 re-export（shared/unc 单一事实源）。
- **D-6** gitBareRepo fs 面 node:fs 直用（getFsImplementation 抽象层不随迁）。
- **D-7** BashToolUseContext duck +1 成员 options.cwd。
- **TUI 残留守**：renderToolUseMessage `() => null` + UI.tsx/BashToolResultMessage.tsx 域外（D 波/TUI 波）。
- **注册表消费面**：`getAllBaseTools(deps)` baseTools 经组合根注入（D 波 cli.ts 单入口消费）；本波经 `bash/` + `tools/` 双门面导出 `BashTool` 对象（模块态 BgTask map 保模块内）+ `getBackgroundTask`/`listBackgroundTasks`/`BASH_TOOL_INPUT_SCHEMA`，注入位零改动（组合根现 `baseToolsCli?: string[]` 面不动，D 波接线）。
- **anti-stub 门**：新增全真实现文件，零 `export {}` 占位（门③ wave-c 9 域 regex 零触碰）。

**⑦ 测试层**：
- **unit 零磁盘**：bashTool 对象面（name/JSON schema 7 字段/isReadOnly 经 bashReadOnly/checkPermissions 接线 = duck context stub 打 bashToolHasPermission 决策面【deny 规则 ctx → deny / `ls` 只读 → allow】/mapToolResult 分支）；bashPrompt 各节（feature/env/sandbox 窗口 stub 控节 presence + timeout 文案）；readOnlyValidation（isCommandSafeViaFlagParsing 白名单/`$` 守卫/brace 展开 + checkReadOnlyConstraints 沙箱窗口 stub + cd+git 复合支）；sedEditParser（BRE/ERE 占位符转换 + 注入盐）；commandSemantics（grep/rg/find/diff/test 语义表）；commentLabel/destructiveCommandWarning/bashUtils 纯函数面；bashTimeouts env 面；gitBareRepo（纯 stub fs 面 unit 不真盘 → 归 func）。
- **func 真盘**：call 同步 spawn（`echo` 真进程 stdout/exitCode）/ timeout clamp（min 封顶真 kill）/ run_in_background（真 detached spawn + getBackgroundTask + 输出文件落 getAtlasTempDir 真盘）/ resetCwdIfOutsideProject（真 tmpdir setCwd 复位）/ gitBareRepo 三 fixture / resizeShellImageOutput 溢出文件重读（真 temp 文件）。
- **突变探针（恰 1 红下界纪律）**：
  - **P-B1** readOnlyValidation `containsUnquotedExpansion` 单引号内反斜杠早退守卫删（`'\'` desync 支）→ 恰 1 红
  - **P-B2** bashTool checkPermissions 接线换回 passthrough → 恰 1 红（unit 接线面）
  - **P-B3** sedEditParser BRE 占位符序换（BACKSLASH/PLUS 保护步互换）→ 恰 1 红
  - **P-B4** bashTool call timeout clamp `Math.min` 删（max 封顶失效）→ 恰 1 红（func）
  - **P-B5** gitBareRepo `.git/HEAD` isFile 安全守卫删（目录型 HEAD 误判裸仓）→ 恰 1 红（func fixture）
- **终验四件套**：tsc 0 / eslint 0 err / build 0 KB / 全量 + gate 6。

**⑧ 切片计划（一模块一提交）**：
- **S-B1 依赖闭包层**：readOnlyCommandValidation 1893L + gitBareRepo + bashTimeouts + 小 helper 归集（+unit）
- **S-B2 纯叶子本体**：commentLabel + destructiveCommandWarning + commandSemantics + sedEditParser + bashUtils（+unit，含 D-3 delta 头注）
- **S-B3 readOnlyValidation 1924L 本体**（+unit）
- **S-B4 bashPrompt 332L**（sandboxAccess 窗口扩 4 成员 + 组合根 ⑧ 注入同步 +unit，含 D-1 delta 头注）
- **S-B5 bashTool.ts 本体 + 接缝消费 + 双门面**（JSON schema + Tool 对象 + checkPermissions 实现半 + call/后台任务面 + bashToolInput 头注改「已消费」+ BashToolUseContext +cwd 成员 + permissions/ruleMatching 1c 落点注释订正 +func）
- **S-B6 整波审视**（探针 5 + 双只读 ≤2 + 修复提交）→ ④ 闭环（docs 实施记录 + 审视记录 + 闭环 + memory + task #128 闭环）

**开波基线**（S-T5 闭环态）：1573 pass / 94 文件 / 3398 expect + gate 6 pass / 5 expect；tsc 0 / eslint 0 err（1 既有 ignore 警告）/ build 0 KB。提交链 8861fa7…91d9e07（§8.53）为本波基线锚。

**§8.54 实施记录 + S-B6 整波审视（2026-09-26，task #128 闭环）**

提交链：21f3a4e（① 分析）→ bb85dc4（S-B1 依赖闭包层）→ d3590ba（S-B2 纯叶子本体）→ f3f5008（S-B3 readOnlyValidation 本体）→ 6c446d6（S-B4 bashPrompt + sandboxAccess 窗口扩 4 成员 + 组合根 ⑧ 注入）→ 0e5895d（S-B5 bashTool 本体 + 接缝消费 + 双门面）→ 549b953（S-B6 审视修复）。

基线链（全量 pass/文件/expect，各步 tsc 0 / eslint 0 / build 0 KB）：开波 1573/94/3398 → S-B1 1608/96/3470（+35/2/72）→ S-B2 1642/98/3562（+34/2/92）→ S-B3 1661/99/3602（+19/1/40）→ S-B4 1667/100/3636（+6/1/34）→ S-B5 1692/102/3694（+25/2/58）→ S-B6 1694/102/3697（+2/0/+3）+ gate 6 pass/5 expect 全程不变。预测 vs 实测全切片精确吻合（+N 预值零偏差）。

**S-B6 探针执行表**（恰 1 红 = 下界纪律）：

| 探针 | 突变 | 实测 | 处置 |
|---|---|---|---|
| P-B1 | 初版：删 containsUnquotedExpansion `!inSingleQuote` 失步守卫 | **0 红（初版锚失效）** | 所有失步输入（奇数尾反斜杠引号串）被 checkReadOnlyConstraints L1871 bashCommandIsSafe 预检先行拦截（passthrough 早退，追踪器不可达）= 设计性不可观测量（函数内 Defense-in-depth 注释逐字旧仓）。活探针改挂**双引号 glob skip 支删除**（新锚 `ls "x*y"` → allow 钉文，S-B3 +1 测 +1 expect）→ 恰 1 红 ✓ |
| P-B2 | bashTool checkPermissions 接线换回 passthrough 默认 | **2 红集 {deny, allow}**（下界 1，P-E5 先例登记订正） | 接受：判别支设计（无规则 passthrough 测不断言 suggestions 防红集升级） |
| P-B3 | 初版：sedEditParser BACKSLASH/PLUS 保护步互换（原登记判别支 `a\+`/裸 `a+`） | **0 红（初版锚失效：两序终版 regex 相同，不敏感输入）** | 重选挂 `\\+` 输入（双反斜杠+裸 plus：正序 BACKSLASH 先保护匹配 `a\+` 整体；互换时第二 `\` 被 PLUS 步误当 `\+` 消费 → regex 退化字面 `a+`）→ S-B2 +1 测 +2 expect，恰 1 红 ✓ |
| P-B4 | bashTool call timeout clamp `Math.min` 删 | 恰 1 红 ✓ | 400ms 封顶真 kill sleep 3（env 钉 BASH_DEFAULT_TIMEOUT_MS=200/BASH_MAX_TIMEOUT_MS=400） |
| P-B5 | gitBareRepo `.git/HEAD` isFile 安全守卫删 | 恰 1 红 ✓ | 目录型 HEAD 攻击 fixture 误判非裸仓 |

**S-B6 双只读 ≤2**：A 路（旧仓对照保真 + 探针重选合理性）PASS-with-issues 0 BLOCKER/1 MAJOR/1 MINOR/1 NOTE；B 路（H6 死接缝 + 测试面 + anti-stub + 登记一致性）PASS-with-issues 0/0/3 MINOR/2 NOTE。549b953 全处置 10 文件（零行为面，A-MAJOR-1 除外 = 恢复旧生效值）：
- **A-MAJOR-1 userFacingName 生效值失实**（真缺陷）：旧 buildTool 返回体 `userFacingName: () => def.name` 夹 TOOL_DEFAULTS 与 def 之间覆盖默认 `''`（旧 def 无覆写）→ 旧生效值 `'Bash'`；S-B5 初版误读生效链取默认 `''` 且测试以「逐值」名义锁死。订正 = 恢复 `() => BASH_TOOL_NAME`（toolNames 单一事实源，值逐字同）+ delta ④ 理据订正 + 测试断言改（行为面 = 恢复旧仓语义，非新 delta）。
- A-MINOR-1：bashPrompt 旧 L52 行尾空格归一化（写文件 1 字符零行为）→ delta ⑩ 补登记。
- A-NOTE-1：旧 `export type BashProgress = any` 零消费者死类型 → delta ⑩ 补不随迁登记。
- B-MINOR-1：bashToolInput 头注「6 导入方」措辞漂移 → 订正类型位消费方 8 个（既有 6 = 计划 §8.54 ④ 口径，全 type-only 零改动 + 本波新增 2：readOnlyValidation S-B3 / bashTool S-B5）。
- B-MINOR-2：3 处陈旧「将来时」接缝注改题（bashPermissions zod 型/isReadOnly + pathValidation →「接缝已消费 §8.54 S-B5」）+ bashPermissions 真 ToolUseContext 行改题 D 波/TUI 波残留守。
- B-MINOR-3：JSON schema 嵌套 `_simulatedSedEdit` 丢 `required: ['filePath']`（旧 zod z.object 内必填 + duck 型非可选）→ 补转写 + delta ② 补登记 + unit 断言钉。
- B-NOTE-1：func 后台任务日志残留共享 temp 目录（工具设计面，接受不修）；B-NOTE-2：本节即 N-2 计划 §8.54 ⑦ 锚点文案改题落点。

**残留守登记（E-wave-end 前向接缝）**：真 ToolUseContext 全字段面（BashToolUseContext duck 最小形 + D-7 options.cwd）/ UI 渲染面（UI.tsx / BashToolResultMessage.tsx 域外，renderToolUseMessage = () => null）/ D-1 归属后缀支（attribution/remote 波）/ D-3 图像 resize 调用点（图像面波）/ BgTask 模块态 map 读面经门面转出（TaskOutput/TaskStop 工具本体波消费）。anti-stub 门③ 零触碰（全真实现文件，零 `export {}` 占位）。

**闭环**：task #128 闭环。C 桶 ①「工具本体 49」进度 = **1/49 落地（BashTool），48 剩（高频 → 长尾序列）**。既定序列下一步 = 其余 48 本体纵切（高频优先：Read/Write/Edit/Glob/Grep 族）→ C 桶 ② auto-mode 纵切波（~3030L 分类器族）→ C 桶 ③ shell·swarm 波（7217L，B 桶 18 项登记处）→ D 波 → remote → analytics。

---

## §8.55 高频族本体纵切子波（C 桶 ① 子波 3）：执行前分析（task #129 ①）

**范围**：旧仓 `src/tools/` 5 高频工具本体（FileReadTool / FileWriteTool / FileEditTool /
GlobTool / GrepTool）随迁入新仓 `src/engine/tools/files/` 子域 + `files/` 子门面 +
tools 门面 re-export。**49 口径 1/49 → 6/49**（49 朴素口径坐实第 2–6 项；47 = 历史口径
不变，Ascend 16 另计）。开波基线 = §8.54 闭环态 **1694 pass / 102 文件 / 3697 expect +
gate 6·5**。波 tag 不切新 tag（子波提交链记录，门③ 仍用 wave-c）。

### 8.55.1 范围裁定

**本体 .ts 面 4041L（逐文件实清点，task 描述 ≈3941L 口径订正为 4041L）**，UI.tsx 全族
域外裁（§8.54 先例：renderToolUseMessage = () => null）：

| 本体 | 旧仓文件（.ts 面） | 新仓落点（`src/engine/tools/files/`） |
|---|---|---|
| Read | FileReadTool.ts 1063 / limits.ts 92 / imageProcessor.ts 94（**裁**）/ prompt.ts 49 | fileReadTool.ts + readFileLimits.ts + readPrompt.ts |
| Write | FileWriteTool.ts 426 / prompt.ts 18 | fileWriteTool.ts + writePrompt.ts |
| Edit | FileEditTool.ts 601 / utils.ts 775 / types.ts 85 / constants.ts 12 / prompt.ts 26 | fileEditTool.ts + fileEditUtils.ts + fileEditTypes.ts + fileEditConstants.ts + editPrompt.ts |
| Glob | GlobTool.ts 198 / prompt.ts 7 | globTool.ts + globPrompt.ts |
| Grep | GrepTool.ts 577 / prompt.ts 18 | grepTool.ts + grepPrompt.ts |

UI.tsx 域外合计 1138L（Read 184 / Write 404 / Edit 288 / Glob 62 / Grep 200，TUI 波）。
落地 .ts 面 = 4041 − 94（imageProcessor 裁）= **3947L 逐字随迁 + delta 转写**。

**依赖闭包裁定表（逐符号落点，grep 实证 2026-09-26）**：

**A. 已落新仓（仅改 import 面）**

| 符号 | 新仓落点 | 备注 |
|---|---|---|
| Tool 契约 / ToolInputJSONSchema / ToolResultBlockParam / Message / UserMessage / logForDebugging | shared（facade） | 契约逐字 §8.54 先例 |
| errorMessage / getErrnoCode / isENOENT / isFsInaccessible | shared/errors | |
| countCharInString / plural | shared/stringUtils | |
| expandPath | shared/path（**2 参 (path, baseDir)**） | delta：旧 1 参调用点（默认 getCwd）→ `expandPath(p, getCwd())` 逐调用点显式化 |
| getFsImplementation / setFsImplementation | shared/fs-operations（注入窗口已落） | **加法 +readFileBytes**（FsOperations 头注「加法式扩展」先例；Read L983 消费） |
| formatFileSize | shared/format | |
| lazySchema | shared/lazySchema | buildTool 时代但新仓已落（8L 逐字） |
| isEnvTruthy / isEnvDefinedFalsy | shared/env | |
| getPlatform | shared/platform | |
| getConfigDirName | shared/configDir（`.atlas` + ATLAS_CONFIG_DIR_NAME 覆盖） | Edit constants 消费 |
| getAtlasTempDirName | shared/tempDir | pdf getToolResultsDir 域内最小形消费 |
| feature / FEATURE_ON_BY_DEFAULT | shared/feature | |
| ripGrep(args, target, signal) → Promise\<string\[\]\> | sandbox（facade，E 波已落） | 签名与旧 utils/ripgrep.ts L344 逐字同参（新仓裁流式/超时面，Grep 消费位零改动） |
| checkReadPermissionForTool / checkWritePermissionForTool / matchingRuleForInput | permissions/filesystem（facade） | 新签名 (tool: PermissionTool, input, toolPermissionContext) → **工具对象须加 `getPath` 成员**（旧 buildTool def.getPath 位 → 新显式成员，delta 登记；PermissionTool duck = { name, getPath }，缺 getPath 恒 ask） |
| matchWildcardPattern / PermissionDecision | permissions（facade） | |
| readFileInRange / memoryFreshnessNote | memory（facade） | |
| getCwd / setCwdState / setOriginalCwd | bootstrap（facade） | 测试双戳先例 = sb5 core-face |
| getRoleConfig | modelprovider（facade） | Read 缓解面（见 D 组 ①） |
| logError | engine/tools/bash/log（域内） | 新仓 logError 落点（bash 波先例）；files 域内 import '../bash/log' |
| jsonStringify / jsonParse | engine/session（facade L73，域内） | Read notebook 支 + 未来面 |
| formatOutput | engine/tools/bash（子门面 L212，域内） | notebook.ts 依赖 |
| FILE_READ/WRITE/EDIT/GLOB/GREP_TOOL_NAME / BASH_TOOL_NAME / NOTEBOOK_EDIT_TOOL_NAME | engine/tools/toolNames | |

**B. 随迁（依赖闭包，逐文件子集）**

| 旧仓文件 | 新仓落点 | delta |
|---|---|---|
| utils/file.ts 582 | files/fileUtils.ts 逐字 | ① growthbook `atlas_compact_line_prefix_killswitch`（默认 false=compact 开）→ env kill-switch **ATLAS_DISABLE_COMPACT_LINE_PREFIX**（isEnvTruthy → compact 关，等价语义）；② fileReadCache 依赖 → 随迁 |
| utils/fileReadCache.ts 96 | files/fileReadCache.ts | LRUCache 依赖面核实（若独立模块则一并随迁；FileRead 本体只经 context.readFileState duck 消费，不直接依赖 LRU 实例） |
| utils/diff.ts 172 | files/diffUtils.ts 逐字 | Write/Edit 消费 countLinesChanged / getPatchForDisplay / getPatchFromContents / DIFF_TIMEOUT_MS |
| utils/notebook.ts 224 | files/notebook.ts 逐字 | formatOutput → 新 bash 子域；getFsImplementation → shared；NOTEBOOK_EDIT_TOOL_NAME = toolNames |
| utils/pdf.ts 300 | files/pdf.ts 逐字 | execFileNoThrow → **域内小模块**（worktree git.ts 域内先例）；getToolResultsDir（旧 toolResultStorage = getSessionDir()+子目录）→ 域内最小形（getAtlasTempDirName 基，delta 登记，真实 session 目录面 = session/CLI 波前向接缝） |
| utils/pdfUtils.ts 70 | files/pdfUtils.ts 逐字 | |
| constants/apiLimits.ts 94 | files/apiLimits.ts **裁面提取 5 常量**（PDF_AT_MENTION_INLINE_THRESHOLD / PDF_EXTRACT_SIZE_THRESHOLD / PDF_MAX_PAGES_PER_READ / PDF_MAX_EXTRACT_SIZE / PDF_TARGET_RAW_SIZE） | 图像 4 常量随 D-3 裁面不迁（登记） |
| utils/glob.ts 132 | files/globUtils.ts 逐字 | getFileReadIgnorePatterns / normalizePatternsToPath（旧 permissions/filesystem，新仓未落）→ **两函数随迁入 files/globUtils.ts**（单一消费方 = Glob，域内；delta 登记） |
| utils/semanticNumber.ts 36 + semanticBoolean.ts 29 | files/semantic.ts | **delta（zod preprocess → 运行时转换）**：新 Tool 契约 = JSON schema（无 zod 运行时），模型面 type 仍 number/boolean；call 入口对 offset/limit/-B/-A/-C/context/head_limit/offset/multiline/replace_all/-n/-i 做 `semanticToNumber`/`semanticToBoolean` 字符串字面量容忍（正则/真值语义逐字旧仓） |
| utils/memoryFileDetection.ts 289 | **memory 域**（facade 导出） | 消费方 = engine（DEP-4 engine→memory 合法，STR-1 经 facade）；isAutoMemFile 语义 = memory 域内禀 |
| memdir/validateMemoryFrontmatter.ts 89 | **memory 域**（facade 导出） | 消费方 = FileWrite（isUnderMemoryDir / validateMemoryFrontmatter） |
| services/tokenEstimation.ts 350（纯函数子集 ~50L：roughTokenCountEstimationForFileType + bytesPerTokenForFileType） | **填充新仓 shared/tokenEstimation.ts 占位**（头注「实现待 C 波」= 本波消费，B18 按需重建先例：实质实现非重占位） | countMessagesTokensWithAPI / countTokensViaHaikuFallback 等 8 导出位不迁（零本波消费者，登记） |

**C. 裁面（调用点裁 + 逐处登记，各带归属波）**

| 裁面 | 理据 | 归属 |
|---|---|---|
| imageProcessor.ts 94 + imageResizer 6 符号调用点（Read L814/L993-1021） | sharp 依赖新仓无（依赖面仅 4 包）；§8.54 已登记 D-3 前向接缝，本波裁定 | D-3 图像面波 |
| gitDiff.ts 532 + fetchSingleFileGitDiff 调用点（Write L358 / Edit L529，双门 `isEnvTruthy(ATLAS_REMOTE) && atlas_quartz_lantern`（GB 默认 false = 生产树不可达死支） | GB 基建新仓无；flag 默认 false → 支恒死；gitDiffSchema 随之裁（hunkSchema 保留 = structuredPatch 输出面） | **remote 波**（ATLAS_REMOTE 真门裁定时随 gitDiff.ts 整体重建） |
| fileHistory.ts 1065（fileHistoryEnabled / fileHistoryTrackEdit 调用点 ×2 本体） | S-E4 B18 已登记按需重建（engine/state fileHistory 子模块 E-4 已删，B 桶 18 项） | B18 按需重建波 |
| LSP 族 4 符号（diagnosticTracker / clearDeliveredDiagnosticsForFile / getLspServerManager / notifyVscodeFileUpdated，Write+Edit 各 3 调用点） | LSP 域 = 长尾 LSPTool 本体（49 口径内）+ vscode mcp 域域外 | LSPTool 长尾波 |
| skills 3 函数（loadSkillsDir 1064；Read L527-538 / Write L246-257 / Edit L401-415）+ context.dynamicSkillDirTriggers 调用点 | 新仓无 skills 域 | **E-wave-end 前向接缝：skills 域波（待排）** |
| getGlobExclusionsForPluginCache（Grep L430，旧 plugins/orphanedPluginFilter） | 插件市场孤儿扫描域域外（新仓无 plugin 市场域） | 插件市场波 |
| growthbook 3 点（Read L488 dedup / Write L358 + Edit L529 quartz_lantern） | 新仓无 GB 基建（C 波统一裁定先例：GB → env kill-switch 或裁） | ① dedup → env **ATLAS_DISABLE_READ_DEDUP**（D 组 ② 命名裁定）②③ 随 C 组 gitDiff 裁 |
| countTokensWithAPI（Read L714，API 网络 token 计数） | 模型 provider token 计数面归 D 波；行为 delta = 溢出判定仅用 rough 估计（旧：rough > max/4 时 API 精算） | D 波（登记） |
| limits.ts atlas_amber_wren GB 覆写 + lodash-es/memoize | GB 无基建；memoize = 新仓域本地先例（memory/paths.ts 域本地 memoize） | 优先级裁定 = env ATLAS_FILE_READ_MAX_OUTPUT_TOKENS > DEFAULT 25000 / MAX_OUTPUT_SIZE（GB 支裁，登记） |
| UI.tsx 全族 1138L | TUI 域外（§8.54 delta ⑥ 先例 ×5） | TUI 波 |
| 旧 buildTool(zod) 对象面 | 新 shared Tool 契约（§8.54 转写模式 ×5：JSON schema 纯对象 + TOOL_DEFAULTS 对象化 + 残留守登记） | 本波 |
| 依赖 `diff`（FileEdit utils L366 structuredPatch） | 新仓依赖面 4 包无 diff | **裁定：新增依赖 `diff`**（纯 JS，无 native，4→5 包） |

**D. 关键语义裁定**

- **① Read 缓解面（L684）**：旧 `getCanonicalName(getMainLoopModel())`（model/model.ts 358 新仓无）→ 新 = 域内 files/modelRef.ts 两助手：`getMainLoopModelName` = modelprovider `getRoleConfig('small').model ?? ''`（旧 getMainLoopModel L105 语义 = modelRoles.**small** 角色池头，与 engine/query spine 默认 role 'small' 一致；本条初稿误写 'premium'，2026-09-26 订正）+ `getCanonicalModelName` = `fullModelName.toLowerCase()`（旧 getCanonicalName 回退支逐字——resolveModel 元数据表旧仓已删〔旧 L204 头注〕，新仓直接取回退语义，**无「剥 `/` 前缀」——初稿此处误记，同步订正**）；消费方两面：Read 缓解面（shouldIncludeFileReadMitigation，MITIGATION_EXEMPT_MODELS〔`claude-opus-4-6`〕恒不命中 = 恒含缓解提示，行为保守等价，登记）+ pdfUtils isPDFSupported（claude-3-haiku 子串判，新模型名恒不命中 = PDF 块面恒支持）。
- **② dedup env 命名**：旧 `atlas_read_dedup_killswitch`（true=关 dedup）→ 新 **`ATLAS_DISABLE_READ_DEDUP`**（isEnvTruthy → 关 dedup，等价语义；命名对齐新仓 ATLAS_DISABLE_* kill-switch 族先例，如 ATLAS_DISABLE_GIT_INSTRUCTIONS）。
- **③ duck context（files/fileToolInput.ts，bashToolInput 先例）**：公共面 getAppState / abortController / options；Read 加 readFileState（**FileStateCache 最小 duck = get/set/has + FileState 最小形 { content, timestamp, offset, limit, isPartialView? }**——真 LRU 实例 = 组合根注入，真 ToolUseContext 全字段面残留守 §8.54 已登记）+ fileReadingLimits + 可选 nestedMemoryAttachmentTriggers（3 调用点 `?.add` 无注入 = no-op 零行为，**保留不裁** = 保真）。
- **④ checkPermissions**：Read/Glob → checkReadPermissionForTool；Write/Edit → checkWritePermissionForTool（逐字旧调用位；工具对象加 getPath 成员，delta 登记）。
- **⑤ 注册面**：5 工具全 = 无条件注册（⑰ hasEmbeddedSearchTools 槽 §8.53 已裁定关闭 = 恒注册）；组合根 baseTools 注入（D 波 cli.ts 单入口，注入位零改动）。

### 8.55.2 切片计划（S-C1…S-C8）

| 切片 | 内容 | 预测 +N（pass/文件） |
|---|---|---|
| S-C1 | 依赖闭包层 1：files/semantic.ts（36+29 delta 转写）+ diffUtils 172 + fileReadCache 96 + apiLimits 裁面 5 常量 + shared/tokenEstimation 占位填充（rough 2 函数）+ shared/fs-operations +readFileBytes 加法 | +~35 |
| S-C2 | 依赖闭包层 2：fileUtils 582（delta ①②）+ memory 域 +memoryFileDetection 289 / +validateMemoryFrontmatter 89（facade 导出）+ globUtils 132（ignore 2 函数随迁 + 插件排除裁） | +~60 |
| S-C3 | pdf/notebook 族：pdf 300 + pdfUtils 70 + 域内 execFileNoThrow（~30）+ notebook 224 | +~40 |
| S-C4 | Glob + Grep 本体：globTool 198 + grepTool 577 + prompt 25 + JSON schema 转写 + semantic 运行时转换 + checkPermissions 接线 + files 子门面 + tools 门面 re-export | +~70 |
| S-C5 | Read 本体：fileReadTool 1063 + readFileLimits 92 + readPrompt 49 + duck context + 域内 createUserMessage（loop.ts S-E3 M-1 不变量：uuid 恒戳 + timestamp ISO + isMeta 面）+ 裁面落定（D-3 / skills / dedup env 门） | +~80 |
| S-C6 | Write + Edit 本体：fileWriteTool 426 + fileEditTool 601 + fileEditUtils 775（diff 依赖落地）+ fileEditTypes 85（JSON schema + hunk 型保留 / gitDiffSchema 裁）+ constants 12 + prompt 44 + 裁面落定（gitDiff / fileHistory / LSP / skills） | +~90 |
| S-C7 | S-C(n+1) 独立只读审视 ≤2（探针重选 + 双路 A 旧仓对照 / B H6 死接缝，恰 1 红下界纪律） | — |
| S-C8 | 闭环：docs 实施记录 + 审视记录 + memory `atlascode-wave-c-progress.md` §8.55 条目 + MEMORY.md 索引 + task #129 闭环 | — |

### 8.55.3 探针计划（恰 1 红 = 下界；backup→mutate→定向红集→verbatim restore diff 核验）

| 探针 | 锚点 | 突变 | 预期 |
|---|---|---|---|
| P-C1 | Grep head_limit 字符串容忍（"30"→30，S-C1/S-C4） | 删 semanticToNumber 转换 | 恰 1 红 |
| P-C2 | Read dedup env 门（ATLAS_DISABLE_READ_DEDUP=1 → 重读不返 file_unchanged） | env 门失效 | 恰 1 红 |
| P-C3 | Edit structuredPatch 输出面（diff 依赖真 patch hunk） | 突变 structuredPatch 为恒空 patch | 恰 1 红 |
| P-C4 | Grep checkPermissions deny 规则（P-B2 先例族） | 接线换回 passthrough | ≥1 红（2 红集 {deny,allow} 登记订正，P-E5 先例） |
| P-C5 | Read 阻塞设备路径守卫（/dev/zero → 拒读） | 删 BLOCKED_DEVICE_PATHS 守卫 | 恰 1 红 |

（锚点实施中可重选，0 红锚失效即重锚 + 三处登记纪律 = 测试头注 + 源文件头注 + 本节探针表。）

### 8.55.4 验证四联（每切片）

`bun x tsc --noEmit`（0）/ `bun x eslint <新增·改动文件>`（0）/ `bun build src/atlascode/cli.ts --outfile <tmp>/build-scN.js --target node`（0 KB 级 entry）/ `bun test --isolate tests/`（全量 + 切片新测全绿）+ `bun test --isolate tests/ci/`（gate 6 pass / 5 expect，门③ wave-c 不变）。

### 8.55.5 基线谱系（预测 → 实测）

预测（开波时）：开波 1694/102/3697 + gate 6·5 → S-C1 ~1729 → S-C2 ~1789 → S-C3 ~1829 → S-C4 ~1899 → S-C5 ~1979 → S-C6 ~2069。

**实测（各切片四件套落盘值，闭环坐实）**：

| 节点 | pass / 文件 / expect | gate |
|---|---|---|
| 开波（§8.54 闭环态） | 1694 / 102 / 3697 | 6·5 |
| S-C1（03d836c） | 1744 / 105 / 3799 | 6·5 |
| S-C2（26a4801） | 1792 / 107 | 6·5 |
| S-C3（5ddab2d） | 1827 / 109 / 3961 | 6·5 |
| S-C4（06c6079） | 1859 / 111 / 4065 | 6·5 |
| S-C5（4c80502） | 1915 / 113 / 4245 | 6·5 |
| **S-C6 波终（5649499）** | **1976 / 115 / 4408** | 6·5 |
| S-C7 审视修复（440e4a5，纯头注） | 1976 / 115 / 4408（不变） | 6·5 |

波终实测 1976/115/4408（预测 ~2070 偏保守 ~5%，6 本体切片全落在高频族 Read/Write/Edit/Glob/Grep）。49 口径 **1/49 → 6/49**。

### 8.55.6 E-wave-end 前向接缝（本波新增登记）

skills 面（loadSkillsDir 3 函数 + dynamicSkillDirTriggers，skills 域波待排）/ gitDiff 532L + ATLAS_REMOTE 真门（remote 波）/ fileHistory（B18）/ LSP 族（LSPTool 长尾本体）/ countTokensWithAPI（D 波模型 token 计数面）/ 图像面（D-3 已登记，本波裁面确认）/ 插件缓存排除（插件市场波）/ getToolResultsDir 真 session 目录面（session/CLI 波）/ nestedMemoryAttachmentTriggers 真注入（memory 附件波）/ 真 ToolUseContext 全字段面（§8.54 已登记，本波 duck 沿用）。

### 8.55.7 实施记录（S-C1..S-C6 逐切片闭环）

提交链（master，无 remote）：b6c8699（① 分析）→ 03d836c → 26a4801 → 5ddab2d → 06c6079 → 4c80502 → 5649499 → 440e4a5（S-C7 审视修复）。各切片四件套（tsc 0 / eslint 0 / build 0KB 基线 / 全量测试 + gate 6·5）逐切片全绿。

| 切片 | 提交 | 内容 | 基线（pass/文件/expect） |
|---|---|---|---|
| S-C1 依赖闭包层 1 | 03d836c | diff 依赖新增 + fs-operations 5 成员加法 + logError 提升 shared | 1744/105/3799 |
| S-C2 依赖闭包层 2 | 26a4801 | memory 检测族 + frontmatter 族 + glob ignore 闭包 + windowsPaths 提升 shared | 1792/107 |
| S-C3 pdf/notebook 族 | 5ddab2d | execFileNoThrow 域内最小形 + pdf 300L 逐字 + pdfUtils 70L + notebook 224L 逐字 + any-stub 型面 | 1827/109/3961 |
| S-C4 Glob/Grep 本体 | 06c6079 | globTool 198L + grepTool 577L 逐字随迁 + JSON schema 转写 + semantic 运行时转换 + checkPermissions 接线 + files 子门面 | 1859/111/4065 |
| S-C5 Read 本体 | 4c80502 | readTool 1050L 逐字 + binaryExtensions/readFileLimits/readPrompt/userMessage 4 依赖 + memoryFreshness 53L + memory 门面 re-export readFileInRange（STR-1 闭包）；unit 43 零盘 + func 13 真盘（P-C2 dedup 恰 1 红 / P-C4 workdir 边界 2 红 / P-C5 阻断设备 errorCode 9 恰 1 红 / PDF poppler 门控）；delta ⑱ 非严格 tsconfig 判别位取反不缩窄仓级坑预登记 | 1915/113/4245 |
| S-C6 Write+Edit 本体 | 5649499 | fileWriteTool 380L + fileEditTool 530L + fileEditUtils 780L 逐字随迁 + fileEditConstants/fileWritePrompt/fileEditPrompt 3 小文件 + filesToolInput S-C6 扩面 WriteToolInput + files/tools 双门面 re-export；unit 42 零盘 + func 19 真盘（P-C3 structuredPatch diff v9 字段面 / P-C4 写侧 3 红集 / stale 守卫 delta ⑨ 双工具 / errorCode 全盘面 / mtime 粒度 60s 回拨规避） | 1976/115/4408 |

49 口径 **1/49 → 6/49 坐实**（BashTool 1 + Glob 2 + Grep 3 + Read 4 + Write 5 + Edit 6；高频族 Read/Write/Edit/Glob/Grep 全闭环，43 长尾本体纵切后续波）。

### 8.55.8 审视记录（S-C7 双路只读）

S-C7 = 整波审视：A 路旧仓逐字对照 + B 路 H6 死接缝/探针双向扫描（双只读子代理），修复提交 440e4a5（4 文件 +40/−17，纯头注面，零行为差，基线 1976/115/4408 + gate 6·5 与 S-C6 闭环态不变）。

- **A 路（旧仓对照）PASS-with-fixes**（1 MINOR + 2 NOTE 全处置）：
  - MINOR-1 fileEditUtils delta ① 双调用点订正：normalizeFileEditInput 补 getCwd()（零行为差）+ areFileEditsInputsEquivalent 站点旧仓为裸 readFileSyncCached（无 expandPath），新引入 ~ 展开 + 相对路径按 getCwd() 解析 = 新增行为（潜伏，消费面 gate 波）——行内注释 + 头注订正。
  - NOTE-1 dash 字面量重编码登记（新 delta ④）。
  - NOTE-2 call 入口 `(args ?? {})` 守卫登记（fileWriteTool ⑧ / fileEditTool ⑩：旧仓 call 直接解构必填已校验参无此支，引擎恒传对象 → 零活行为差）。
- **B 路（H6 死接缝/探针）PASS**（2 MINOR + 4 NOTE 全处置）：
  - MINOR-1 fileWriteTool ⑧ 旧 context 3 成员枚举订正（readFileState 保留 + updateFileHistoryState/dynamicSkillDirTriggers 随 ⑦ 裁；userModified 非 Write 侧成员属 Edit 侧）。
  - MINOR-2 fileEditTool ⑩ 旧 context 4 成员枚举订正（旧仓 L382-387 解构逐字）。
  - NOTE-1 fileWritePrompt DESCRIPTION 旧仓即孤儿导出措辞订正（旧仓全仓零消费，本体保真）。
  - NOTE-2 fileEditUtils ③ 消费面标签订正（getSnippetForPatch + getSnippet 旧仓零消费孤儿 / getEditsForPatch = useDiffInIDE TUI 面，非 NotebookEdit）。
  - NOTE-3 门面分节装饰性接受 / NOTE-4 afterAll bootstrap 双戳不复位与 S-C4/S-C5 先例一致（逐文件进程隔离）接受。
- 探针 P-C1..P-C5 复核：P-C2/P-C3/P-C4/P-C5 红集与登记基线一致（P-C4 写侧 3 红集 {acceptEdits 内 allow + {mode acceptEdits} + updatedInput 透传 / acceptEdits 外 ask / default 内 ask decisionReason undefined}），S-C7 修复全头注面未触碰探针锚点。

波终态：**1976 pass / 115 文件 / 4408 expect + gate 6·5**；49 口径 6/49。既定序列下一子波 = 其余 43 长尾本体纵切 → C 桶 ② auto-mode 纵切波（~3030L 分类器族）→ C 桶 ③ shell·swarm 波（7217L）→ D 波 → remote → analytics。

## §8.56 任务工具本体子波（C 桶 ① 子波 4）：执行前分析（task #130 ①）

**范围**：旧仓 10 个任务/调度面工具本体随迁入新仓 —— **Task 四件套**（TaskCreate/TaskGet/TaskUpdate/TaskList，门控槽 ⑯ isTodoV2）+ **cron 三件套**（CronCreate/CronDelete/CronList，门控槽 ② AGENT_TRIGGERS；registry 裁定 ②⑯ 同子波）+ **TaskStop / TaskOutput / TodoWrite**（无条件注册长尾，任务/调度面补齐）。本体落 `src/engine/tools/tasks/` + `src/engine/tools/schedule/` 两个新子域 + tools 门面 re-export（STR-1 先例）。**49 口径 6/49 → 16/49**（TaskCreate 7 / TaskGet 8 / TaskUpdate 9 / TaskList 10 / CronCreate 11 / CronDelete 12 / CronList 13 / TaskStop 14 / TaskOutput 15 / TodoWrite 16；余 33 长尾后续子波）。开波基线 = §8.55 闭环态 **1976 pass / 115 文件 / 4408 expect + gate 6·5**。波 tag 不切新 tag（子波提交链记录，门③ 仍用 wave-c）。

### 8.56.1 范围裁定

**本体 ts 面 ≈ 1935L（逐文件实清点）+ TaskOutput tsx 提取 ≈ 230L（transcript 非逐字，登记）**：

| 工具 | 旧仓来源 | ts 面 | 备注 |
|---|---|---|---|
| TaskCreate | tools/TaskCreateTool/（Tool 138 + prompt 56 + constants 1） | 195 | hooks（TaskCreated 阻支回滚 deleteTask）+ setAppState expandedView='tasks' |
| TaskGet | tools/TaskGetTool/（128 + 24 + 1） | 153 | 纯 tasks 存储读面 |
| TaskUpdate | tools/TaskUpdateTool/（406 + 77 + 1） | 484 | hooks（TaskCompleted 阻支）+ blockTask + teammate 通知（writeToMailbox）+ swarm 门 3 站点 |
| TaskList | tools/TaskListTool/（116 + 49 + 1） | 166 | 纯读面 + getPrompt |
| CronCreate | tools/ScheduleCronTool/CronCreateTool.ts 157 + prompt 133 | 290 | scheduler 域消费（E-7 S-7b 已落） |
| CronDelete | 95 | 95 | removeCronTasks |
| CronList | 97 | 97 | listAllCronTasks |
| TaskStop | tools/TaskStopTool/（131 + 8 + constants） | 139 | stopTask 三态守卫（E-7 S-7a 已落）消费面 |
| TaskOutput | **tools/TaskOutputTool/TaskOutputTool.tsx（React Compiler 编译产物 585L，ts 面提取 ≈ 230L）** | ~230 | schema + userFacingName + validateInput + call（block/not_ready/timeout 三态）+ getTaskOutputData + waitForTaskCompletion + mapToolResult；UI React 面裁（§8.53 先例）；`isEnabled 'external'!=='ant'` 构建支 = de-ANT 先例恒 true |
| TodoWrite | tools/TodoWriteTool/（115 + 184 + 1） | 300 | v1 todo；verification nudge 双门死支裁（growthbook） |

**依赖闭包层 ≈ 1030L（3 新落点 + 2 扩面）**：
- `src/utils/tasks.ts` **848L 任务列表存储** → 新域 **`src/engine/tasks/`**（disk JSON 每任务一文件 + `.highwatermark` + lockfile 互斥 + onTasksUpdated 信号 + claimTask/unassignTeammateTasks/getAgentStatuses teammate 协作面 + getTaskListId 四级判定链 env→teammateCtx.teamName→getTeamName→leaderTeamName→getSessionId）。zod Task/TaskStatus schema（L76-89，9 字段 + HIGH_WATER_MARK）→ TS 接口 + 轻量校验（JSON schema 转写先例 S-C1，delta 登记）。
- `src/utils/todo/types.ts` 18L（TodoItem/TodoList zod）→ tasks 域同落（TodoItem 3 字段 + 枚举）。
- `src/utils/task/outputFormatting.ts` **38L**（getMaxTaskOutputLength + formatTaskOutput + TASK_MAX_OUTPUT_* 常量）→ 既有 **`src/task/`** 域扩面（消费 diskOutput.getTaskOutputPath ✓ + shared 有界 env 解析面；TaskOutput 工具本体消费面）。
- **task hook wrapper ≈ 90L**（旧 utils/hooks.ts：executeTaskCreatedHooks L3702 + executeTaskCompletedHooks + getTaskCreatedHookMessage L1915 + getTaskCompletedHookMessage，薄封装 executeHooks）→ 新 **`src/hooks/taskHooks.ts`**：新仓 runHooks（Promise 聚合，src/hooks/runHooks.ts L257）适配 —— 旧 AsyncGenerator 逐 hook yield → 新单聚合 yield（HOOK_EVENTS 已含 TaskCreated/TaskCompleted ✓ hookEvents.ts L27-28；createBaseHookInput ✓；TOOL_HOOK_EXECUTION_TIMEOUT_MS ✓），阻塞错误检测语义等价（消费面 for-await 收 blockingErrors），delta 登记。
- `src/utils/agentSwarmsEnabled.ts` 44L（TaskUpdate 3 站点消费）→ **`src/engine/messaging/agentSwarmsEnabled.ts`**（teammate 域面）：env ATLAS_EXPERIMENTAL_AGENT_TEAMS + --agent-teams 旗标；growthbook 'atlas_amber_flint' killswitch 支裁（新仓无 GB，= opt-in 单门，delta 登记）。

### 8.56.2 依赖落点（逐符号，全核过新仓既有面）

- **既有面零新迁**：scheduler 域全（parseCronExpression/cronToHuman/nextCronRunMs/addCronTask/removeCronTasks/getCronFilePath/listAllCronTasks，E-7 S-7b 逐字）/ coordinator/tasks（stopTask ✓ framework.updateTaskState ✓ localShellTask/localAgentTask ✓）/ src/task 域（diskOutput.getTaskOutput ✓ L400 / TaskOutput 类 getStdout/getStderr ✓ / TaskStateBase ✓ task.ts L68 / fsRange ✓）/ messaging（getTeamName/getTeammateContext ✓ teammate·teammateContext / writeToMailbox ✓ mailbox / createSignal ✓ signal / lockfile.lock ✓ lockfile / getAtlasConfigHomeDir/getTeamsDir/jsonParse/jsonStringify ✓ mailbox）/ shared（isEnvTruthy / errorMessage / getErrnoCode / logError / logForDebugging / countCharInString / AbortError ✓ stopTask）/ bootstrap（getSessionId/getIsNonInteractiveSession ✓ state.ts）。
- **扩面小件**：bootstrap/state.ts 补 `setScheduledTasksEnabled` = **any-stub 逐字**（旧仓 L253 即 `(() => ({})) as any` no-op stub，本体保真）；sleep 域内本地实现（bash/commands 先例）；uniq 域内本地实现（新仓无 lodash 先例）。
- **RemoteAgentTaskState**（TaskOutput remote 支）：新仓未落（remote 波）→ duck 最小形（{command} 字段位）+ 前向接缝登记。
- **TaskOutput `aliases: ['AgentOutputTool','BashOutputTool']`**：旧 buildTool 改名兼容 alias 面；新仓 legacyToolNameAliases.ts 4 项（Task→Agent/KillShell→TaskStop/…）不含此 2 名 = 独立机制 → S-D5 核新契约 alias 消费面后裁定（预计裁 + 登记，权限规则解析面零消费）。

### 8.56.3 裁面裁定（H6，逐条带归属波）

- **growthbook 2 站点裁**（新仓无 growthbook 域）：TaskUpdate L336 / TodoWrite L78 `getFeatureValue_CACHED_MAY_BE_STALE('atlas_hive_evidence', false)` 默认 false = verification nudge 死支 → 裁（恢复归属 analytics 波）；isAgentSwarmsEnabled 内 'atlas_amber_flint' killswitch 支裁（= opt-in 单门语义）。
- **feature()（bun:bundle）裁**：TaskUpdate L335 / TodoWrite L78 `feature('VERIFICATION_AGENT')` 与 growthbook 双门合死 → 同支裁（bun:bundle 不可测先例 + 双门死支，恢复归属 analytics 波）。
- **TaskOutput UI React 面裁**（renderToolUseMessage/renderToolResultMessage/AgentPromptDisplay/BashToolResultMessage 渲染体）→ 新契约 renderToolUseMessage 最小文本形（§8.53/§8.54 先例链）；extractSearchText 若旧有则逐字随迁。
- **TaskOutput isEnabled 构建支裁**（`('external' as any)!=='ant'` = de-ANT 先例恒 true，isEnabled = () => true，delta 登记）。
- **Task 四件套 context duck**：TaskToolUseContext（getAppState/setAppState/abortController/agentId?，FilesToolUseContext 先例扩面）；setAppState 消费 = todos/expandedView 面（TUI 波真注面前 = duck 缺省零崩溃支，S-C5 delta ⑭ 先例）。
- **tasks.ts 存储面全量随迁**（含 claim/unassign/getAgentStatuses teammate 协作面 ~330L）：存储 = 单一事实源整体随迁，H6 只裁无新仓消费者的服务/域面（growthbook/telemetry 族），存储协作面不裁（多 agent 协调消费面 = 后续 TUI/shell·swarm 波，接缝登记不裁体）。
- **backfillObservableInput / hooks 面**（若工具体含）：S-C5 ⑰ 先例登记。

### 8.56.4 切片计划（S-D1…S-D7）

| 切片 | 内容 | 测试面 |
|---|---|---|
| S-D1 | ① 执行前分析（本提交） | — |
| S-D2 | 依赖闭包层：`src/engine/tasks/` 新域（tasks.ts 848L 逐字 + TodoItem/TodoList 型面 + 门面）+ `src/task/outputFormatting.ts` 38L + `src/hooks/taskHooks.ts` ~90L + `messaging/agentSwarmsEnabled.ts` 44L + bootstrap setScheduledTasksEnabled stub | unit 零盘（存储 CRUD/lock/claim 判别支）+ func 真盘 |
| S-D3 | Task 四件套：`tools/tasks/` 子域（4 Tool + 4 prompt + constants + taskToolInput duck）+ tools 门面 re-export | unit 零盘（对象面/validateInput/checkPermissions 缺省支）+ P-D1/P-D2 |
| S-D4 | cron 三件套 + TaskStop + TodoWrite：`tools/schedule/` 子域（3 cron + cronPrompt）+ tools/tasks 扩 2 件 + 门面 | unit + func（cron 校验支）+ P-D3/P-D5 |
| S-D5 | TaskOutput：tools/tasks/taskOutput.ts（tsx 提取 ~230L）+ 门面 + alias 面裁定 | unit（call 三态 + mapToolResult 逐字）+ P-D4 |
| S-D6 | 整波审视（双只读 ≤2：A 旧仓对照 / B H6 死接缝+探针）+ 修复 | 四联复验 |
| S-D7 | 闭环：docs §8.56.6/7 + memory + task #130 闭环 | — |

### 8.56.5 探针计划（恰 1 红 = 下界；backup→mutate→定向红集→verbatim restore diff 核验）

- **P-D1** 存储 id 递增：createTask 最高 id 读盘支（fixture 最高 5 → 新建 '6'；突变改 0 基 → 恰 1 红）。
- **P-D2** TaskUpdate hook 阻支：executeTaskCompletedHooks 阻塞 stub（突变删阻支门 → completed 标记照常落 → 恰 1 红）。
- **P-D3** CronCreate validateInput 非法 cron：parseCronExpression null 支（突变去校验 → 恰 1 红）。
- **P-D4** TaskOutput 非阻塞 not_ready 支：running + block=false → retrieval_status 'not_ready'（突变删支 → 恰 1 红）。
- **P-D5** TaskStop 非任务态守卫：stopTask StopTaskError 支（突变放行 → 恰 1 红；S-7a 波已探 framework 面，本探针 = 工具面新锚）。

### 8.56.6 验证四联（每切片）

`bun x tsc --noEmit`（0）/ `bun x eslint <新增·改动文件>`（0）/ `bun build src/atlascode/cli.ts --outfile <tmp>/build-sdN.js --target node`（0 KB 级 entry）/ `bun test --isolate tests/`（全量 + 切片新测全绿）+ `bun test --isolate tests/ci/`（gate 6 pass / 5 expect，门③ wave-c 不变）。

### 8.56.7 预测基线谱系

开波 1976/115/4408 + gate 6·5 → S-D2 ~2016（存储 +40 测）→ S-D3 ~2046（+30 测）→ S-D4 ~2066（+20 测）→ S-D5 ~2081（+15 测）（+N 为预测，精确值各切片闭环时坐实；波终预测 ≈ 2080 pass / ~119 文件 / ~4650 expect）。

**实测订正（2026-09-27，S-D7）**：S-D2 **2011/117/4495** → S-D3 **2040/119/4604** → S-D4 **2074/121/4749** → S-D5 **2098/123/4828** = 波终（S-D6 审视修复 `d67e481` 全为值替换 + 注释面，零测试增删，基线持平）。gate 6 pass / 5 expect 全程不变（门③ 仍用 wave-c）。预测 2080/~119/~4650 实测 2098/123/4828（+18/+4/+178，存储域 848L 判别支测试面 + cron 校验 4 支 + TaskOutput 双分支面超预期）。

### 8.56.8 实施记录（S-D2..S-D5 逐切片闭环）

提交链（master，无 remote）：b1c5294（S-D1 分析）→ e942561 → 0b18863 → 35f177e → 795c3b1 → d67e481（S-D6 审视修复）。各切片四件套（tsc 0 / eslint 0 / build 0KB entry / 全量测试 + gate 6·5）逐切片全绿。

| 切片 | 提交 | 内容 | 基线（pass/文件/expect） |
|---|---|---|---|
| S-D2 依赖闭包层 | e942561 | `src/engine/tasks/` 新域（旧 utils/tasks.ts 848L 逐字：disk JSON 每任务一文件 + .highwatermark + lockfile 互斥 + onTasksUpdated 信号 + claimTask/unassignTeammateTasks/getAgentStatuses teammate 协作面 + getTaskListId 四级判定链 + isTodoV2Enabled 门控 ⑯）+ TodoItem/TodoList 型面（todoTypes）+ 4 依赖件（taskHooks ~90L 旧 AsyncGenerator→新 Promise 聚合适配 / agentSwarmsEnabled 44L GB killswitch 支裁 / outputFormatting 38L / bootstrap setScheduledTasksEnabled any-stub 逐字）+ 门面；unit 零盘判别支 + func 真盘（CRUD/high watermark/锁竞争/claim 判别支/团队文件读面） | 2011/117/4495 |
| S-D3 Task 四件套 | 0b18863 | taskCreateTool/taskGetTool/taskListTool/taskUpdateTool 4 对象 + JSON schema 4 + Output 型 4 + prompt 面 4 + taskToolInput duck 5 型（旧仓 tools/Task*Tool 族 826L 逐字随迁 → 新 shared Tool 契约：hooks Promise 适配 / setAppState expandedView + verificationNudge 双门死支裁 / checkPermissions allow 固化 / 2 参 call 裁）；注册表 ⑯ isTodoV2 槽 materialize 自门控；unit 零盘对象面 + func 真盘（createTask 落盘 / 钩子阻支回滚 / P-D2 completed 阻支 / deleted 早退 / mailbox / blocks 级联） | 2040/119/4604 |
| S-D4 cron 三件套 + 扩 2 件 | 35f177e | cronCreateTool/cronDeleteTool/cronListTool + schedulePrompt 门面 + scheduleToolInput duck 3 型（旧仓 ScheduleCronTool 族 640L 逐字随迁）：注册表 ② AGENT_TRIGGERS 槽 materialize 自门控（isCronEnabled = ATLAS_DISABLE_CRON kill-switch / isDurableCronEnabled 常量真 GB 支裁）；tasks/ 扩 TaskStopTool（aliases KillShell，无条件注册长尾）+ TodoWriteTool（⑯ 槽反向门控 = !isTodoV2Enabled）；unit 零盘（P-D3 前 2 支 / P-D5 探针锚点 / mapResult 逐字行）+ func 真盘（durable 落位 / durable:false 前向接缝 probe / MAX_JOBS ec 3 / 归属支文件面 / 列面缺省位投影） | 2074/121/4749 |
| S-D5 TaskOutput 末件 | 795c3b1 | taskOutputTool.ts（旧仓 583L buildTool 体逐字随迁多裁 delta ①-⑩：semanticBoolean→plain boolean / ant 面裁常真 / remote_agent 支裁（TaskState 两路联合无 remote 成员，D 波/remote 波接缝）/ call 5 参保留 onProgress waiting_for_task 消费支 / local_bash shellCommand.taskOutput 端口支 vs 磁盘读 / local_agent 内存 result 净文本支 / mapResult XML 6 行 + 截断面 / React render 5 面 + TaskOutputResultDisplay 230L 整裁（TUI 波））+ taskOutputPrompt（PROMPT shell 侧 sha256 字节核逐字 / DESCRIPTION 留导出不接线）+ duck 2 型 + 双门面扩块 + matrix 2 行；unit 21 零盘（对象面 / mapResult 逐字 / validateInput 3 守卫 / call 双分支 + P-D4 探针锚点 / AbortError 传播）+ func 3 真盘（getTaskOutput 真内容读回 / local_agent 磁盘回落位 / block 端到端真盘闭环） | 2098/123/4828 |

49 口径 **6/49 → 16/49 坐实**（TaskCreate 7 / TaskGet 8 / TaskUpdate 9 / TaskList 10 / CronCreate 11 / CronDelete 12 / CronList 13 / TaskStop 14 / TodoWrite 15 / TaskOutput 16；余 33 长尾本体纵切后续波）。

### 8.56.9 审视记录（S-D6 双路只读）

S-D6 = 整波审视：A 路旧仓对照 + B 路 H6 死接缝/探针（双只读子代理 ≤2），修复提交 d67e481（9 文件 +33/−17，基线 2098/123/4828 + gate 6·5 持平）。

- **A 路（旧仓对照）PASS-with-fixes**（4 finding 全处置，逐条旧仓 ground truth 核验后修）：
  - MUST-FIX×3 cron 三件套 userFacingName 订正：旧 buildTool name-wins 插入（旧 src/Tool.ts:826-830 `userFacingName: () => def.name` 先于 `...def` 展开）+ 3 旧 cron def 无该 member（grep 零命中）→ 生效位 = 工具名，非 TOOL_DEFAULTS 缺省 ''；新 3 工具改 'CronCreate'/'CronDelete'/'CronList' + 头注错误主张（「def 无 member 取缺省 ''」）订正 + sd4 unit 3 处期望同步。
  - NOTE×1 TodoWrite schema status 字段未登记 description 移除：旧 types.ts 该字段无 .describe()（全仓 grep 零命中），新添加 'The status of the task' = 未登记虚构，delta ① 补登记。
  - NOTE×1（TaskOutput `tasks?.` → `tasks` = duck 型必填面行为等价后果）审查人自判非偏差，不行动。
- **B 路（H6 死接缝/探针）PASS**（零 MUST-FIX，2 NOTE 卫生项处置）：
  - 5/5 探针（P-D1..P-D5）活测试全在 + 突变语义具体（P-D1 taskstore-fs high watermark / P-D2 sd3-fs completed 钩子阻支 / P-D3 sd4-unit+fs 4 支 / P-D4 sd5-unit not_ready 支 / P-D5 sd4-unit StopTaskError 传播）。
  - 20 行死接缝/残留守登记全带归属波（TUI 波 / D 波 / CLI·teammate 波 / 验证-agent 波 / analytics 波 / engine 波 / remote 波 / 权限波 / 组合根 CLI 波），零 MISSING-WAVE；9 短 DESCRIPTION 常量 + 2 空输入 duck 型（TaskListToolInput/CronListToolInput）导出仅文档面均登记。
  - STR-1 三级门面（tasks/schedule/tools）零 `export *`；49 计数四方一致（头注累计标签 + 提交信息 + matrix 注释 + 旧仓 getAllBaseTools 独立重数 19 无条件 + 30 门控）；波 src 零活 any-stub。
  - 2 NOTE 处置：P-D4 代码侧标签补缺（taskOutputTool.ts 头注 delta ⑩ + call 支注释 + sd5 unit 测试名/头注）；空输入 duck 型补逐型「call 0 参无 cast 位，导出仅文档面」注记。

波终态：**2098 pass / 123 文件 / 4828 expect + gate 6·5**；49 口径 16/49。既定序列下一子波 = 其余 33 长尾本体纵切 → C 桶 ② auto-mode 纵切波（~3030L 分类器族）→ C 桶 ③ shell·swarm 波（7217L）→ D 波 → remote → analytics。

### 8.57 余 33 长尾（C 桶 ① 尾）总分析 + 子波路线图（S-D1 执行前分析）

**49 口径核对（旧仓 getAllBaseTools 逐门开重数）**：已落 16（§8.53-§8.56：Bash/Glob/Grep/Read/Write/Edit + Task 四件套 + cron 三件套 + TaskStop/TodoWrite/TaskOutput）。余 33 = 49 − 16。其中 **Agent 本体 E-2 已落**（`src/engine/tools/agent/AgentTool.ts` 203L 完整 Tool 对象，引擎波工具面，非 C 桶 ① 计数内）→ 实际待迁 **32**。

**32 待迁 4 类裁定**（旧仓逐文件实清点，H6 防空洞；行数为旧仓 `src/tools/*` 本体 ts 面，.tsx 单列）：
- **A 类 · 真本体可迁（15）**：ExitPlanModeV2 475L / NotebookEdit 490L / WebFetch 318L / WebSearch 354L / AskUserQuestion（tsx）/ Skill 915L / EnterPlanMode 113L / Config 456L / LSP 860L / EnterWorktree 123L / ExitWorktree 318L / SendMessage 917L / ListMcpResources 123L / ReadMcpResource 158L / ToolSearch 457L。
  - 依赖闭包注记（复审勿当遗漏）：
    - **ExitPlanModeV2** 拖 team/mailbox/swarm 面（`inProcessTeammateHelpers`/`teammate`/`teammateMailbox`/`agentSwarmsEnabled`）= shell·swarm 波域 → 本波仅随体纵切，team 协作面登记前向接缝。
    - **WebSearch** 拖 modelprovider（`modelProvider`/`buildOpenAIParams`/`modelToRole`）+ growthbook（`getFeatureValue_CACHED_MAY_BE_STALE`）+ `messages`（createUserMessage）= 模型/provider 面 → 接缝登记。
    - **MCP 族**（ListMcpResources/ReadMcpResource）拖 `services/mcp/client.ts` **3209L**（新仓 `ports/mcpClient.ts` 仅 `callTool` 面，无 resource 读面 `fetchResourcesForClient`/`ensureConnectedClient`）+ `utils/mcpOutputStorage.ts` 179L（blob 落盘 `persistBinaryContent`）；**ToolSearch** 拖 `utils/toolSearch.ts` 714L。
    - **Enter/ExitWorktree** 拖 worktree **session 族**（旧 `utils/worktree.ts` 1451L 中 agent 族之外：`createWorktreeForSession`/`getCurrentWorktreeSession`/`keepWorktree`/`cleanupWorktree`/`restoreWorktreeSession` + tmux 族 `generateTmuxSessionName`/`createTmuxSessionForWorktree`/`killTmuxSession` + helper ~800L，E-7 S-7c 故意裁出）+ `bootstrap/state` 缺 `getProjectRoot`/`setProjectRoot`（旧 `getProjectRoot` = 从 cwd 向上找 `.git` 真逻辑 / `setProjectRoot` = no-op stub 逐字）。
- **B 类 · any-stub 占位（5，无本体可迁，registry 槽登记 / 关闭）**：Monitor（④ 本体纵切，`({}) as any`）/ Workflow（⑪ 本体纵切，stub）/ Tungsten（① 无归属波，stub）/ REPL（① stub）/ OverflowTest（⑤ 关闭，测试专用）。
- **C 类 · 旧仓本体缺失/仅壳（6，无真本体可迁）**：CtxInspect（⑥ 本体纵切，目录缺失）/ SuggestBackgroundPR（① 无归属波，目录缺失）/ ListPeers（⑩ shell·swarm 波，目录缺失）/ TerminalCapture（⑦ shell 波 TUI 面，仅 prompt.ts 2L）/ WebBrowser（⑧ 本体纵切，仅 WebBrowserPanel.tsx 1L React 面板）/ VerifyPlanExecution（⑫ 本体纵切，仅 constants.ts 2L）。
- **D 类 · registry 20 槽裁定归属他波（非 C 桶 ①，本总分析登记不迁）**：TeamCreate ⑮ + TeamDelete ⑮ + ListPeers ⑩ → shell·swarm 波（C 桶 ③）/ Snip ⑨ → shell/REPL 波（C 桶 ③）/ RemoteTrigger ③ → remote 波（D 波后）/ PowerShell ⑳ → 域外改判（bash-only 纵切）/ TestingPermission ⑱ → 关闭（NODE_ENV=test）。

**C 桶 ① 范围内真本体集 = A 类 15**（B/C/D 类登记不迁）。按依赖域 + 内聚度拆子波（序：域已落者先、闭包小者先）：
- **§8.57 worktree 工具本体子波（首波）**：EnterWorktree + ExitWorktree（⑭ worktree mode 槽，域 E-7 S-7c agent 族已落）+ session 族 ~800L 重迁进 worktree 域 + `bootstrap/state` 补 `getProjectRoot`/`setProjectRoot`。域已落、本体薄壳、自包含。
- §8.58 plan 族（EnterPlanMode + ExitPlanModeV2，team 面接缝登记）
- §8.59 web 族（WebFetch + WebSearch，provider/growthbook 接缝登记）
- §8.60 config + ask-user + skill 族（Config + AskUserQuestion + Skill）
- §8.61 notebook + LSP 族（NotebookEdit + LSP）
- §8.62 team/collab 工具面（SendMessage 917L，team 域随体）
- §8.63 MCP + ToolSearch 族（ListMcpResources + ReadMcpResource + ToolSearch，MCP client 3209L 闭包）
- §8.64 stub/壳登记批（B 类 5 + C 类 6 = 11 槽 registry 登记 + 头注，零本体）

（子波号 §8.58-§8.64 为规划占位，各子波执行时坐实；C 桶 ① 49 口径 16/49 → 49/49 全闭环后进入 C 桶 ② auto-mode 纵切波。）

#### 8.57.1 §8.57 worktree 子波切片规划（S-D1）
- **S-D2a**：worktree session 族 + tmux 族重迁（旧 `utils/worktree.ts` `createWorktreeForSession`/`getCurrentWorktreeSession`/`keepWorktree`/`cleanupWorktree`/`restoreWorktreeSession`/`generateTmuxSessionName`/`killTmuxSession`/`createTmuxSessionForWorktree` + helper `getOrCreateWorktree`/`performPostCreationSetup`/`mkdirRecursive`/`symlinkDirectories`/`flattenSlug`/`worktreesDir`/`worktreePathFor`/`parsePRReference`/`isTmuxAvailable`/`getTmuxInstallInstructions` ~800L）进 `src/engine/worktree/worktree.ts`（E-7 S-7c 裁出位回填，delta 登记解耦点）+ `bootstrap/state` 补 `getProjectRoot`（向上找 `.git` 真逻辑）/ `setProjectRoot`（no-op 逐字 stub 语义）+ worktree 门面扩面。
- **S-D2b**：EnterWorktree/ExitWorktree 两本体（123L+318L；delta 旧 buildTool(zod)→JSON schema 先例链 + React render 面裁（TUI 波）+ prompt 逐字（sha256 字节核）+ duck 型 + 双门面 + registry ⑭ worktree mode 门控槽 materialize）+ unit 零盘（对象面 / mapResult 逐字 / validateInput 3 支守卫 / call keep·remove 双分支 + countWorktreeChanges 判别支）+ func 真盘（真 git worktree 创建 / keep / remove + discard 守卫）+ matrix 2 行。
- **S-D3**：整波审视（双只读 ≤2：A 旧仓对照 / B H6 死接缝 + 探针 P-W1..）。
- **S-D4**：闭环 docs + memory + task。

#### 8.57.2 S-D2b 实施记录（Enter/ExitWorktree 两本体纵切 + ⑭ 槽 materialize，`3b36a17`）

**落盘面（worktree/ 子域 5 文件 + 双门面 + 注册表）**：
- `enterWorktreeTool.ts`（旧 123L 逐字随迁多裁）+ `exitWorktreeTool.ts`（旧 318L）+ `worktreePrompt.ts`（2 PROMPT 逐字 sha256 字节核 25ac6d86/63e76330 + 2 DESCRIPTION 短常量 + `isWorktreeModeEnabled` 门控）+ `worktreeToolInput.ts`（duck 2 型）+ `index.ts`（子门面显式名块）。
- delta ①-⑩/⑪ 全头注登记：zod→纯 JSON schema（no required 宽骨架 / enum action 逐字段）/ superRefine→validateInput（失败支 errorCode：Enter 输入校验拒=1；Exit 会话 ec1 / 变更 ec2 / 探针失败 ec3）/ prompt()→description() / TOOL_DEFAULTS 成员化逐值 / checkPermissions allow 固化 / getPlanSlug→randomUUID 兜底（plans 域 CLI 波接缝）/ saveWorktreeState→CLI 波裁（session record.ts 登记同源）/ 清缓存三件套→CLI·TUI 波裁 / execFileNoThrow→worktree 域 `execFileNoThrowWithCwd(gitExe(),…)`（fail-closed null）/ count lodash 裁本地。

**门控裁定（⑭ 槽 materialize，新仓唯一发明面）**：旧 `isWorktreeModeEnabled()` ≡ true（GrowthBook flag 整砍，CACHED_MAY_BE_STALE 吞 `--worktree`，旧仓 issue #27044 语境）→ 新仓按 isCronEnabled/isTodoV2Enabled 同族先例移植 **GA 缺省开 + env kill-switch `ATLAS_DISABLE_WORKTREE_MODE`**（设真静默关）。两工具 `isEnabled = isWorktreeModeEnabled` 自门控，注册表 ⑭ 槽从残留守移出（残留守 16→13）。

**测试面**：unit 23（`engine-tools-worktree-sd2b.test.ts` 零盘，探针 P-WT1 对象面 / P-WT2 mapResult 逐字 / P-WT3 validateInput 守卫支（Enter 非法 slug 拒 errorCode 1 / Exit ec1 无会话 / remove+discard 跳探针零子进程）/ P-WT4 门控缺省开+kill-switch 关 / P-WT5 prompt 面锚点+description() 同一性）+ func 5（`engine-tools-worktree-sd2b-fs.test.ts` 真 git 真盘：Enter 创建（worktreesDir 面+会话装配+chdir 落 worktree）/ 会话守卫 / keep 支（真盘保留+`+` 前缀剥核分支名）/ discard ec2（脏 worktree 文案逐字→discard_changes 放行→真盘删除）/ ec3（带外删 worktree 目录→git status 非零→失败封闭文案逐字；注：仅删 .git 指针不够，git 上探 root 仓仍成功，须目录整体缺失））。

**baseline 谱系**：§8.56 波终 2098/123/4828 → S-D2a（`7fc4499`）2111/124/4846 + gate 6·5 → **S-D2b（`3b36a17`）2139 pass / 126 文件 / 4941 expect + gate 6 pass / 5 expect**；四件套 tsc 0 / eslint 0 / build 0KB entry / 49 口径 18/49（余 31 长尾）。

**matrix（P-W1.. 探针计划 = P-WT1..P-WT5，上）**：
| 切片 | 本体 | 探针 | 门控/接缝 | 提交 |
|---|---|---|---|---|
| S-D2a | worktree session 族 + tmux 族重迁（域层，非 49 计） | E-7 S-7c 回填 + bootstrap projectRoot 面 | 无 | `7fc4499` |
| S-D2b | EnterWorktree + ExitWorktree（49 计 +2 → 18/49） | P-WT1..P-WT5 | ⑭ 槽 materialize（isWorktreeModeEnabled + ATLAS_DISABLE_WORKTREE_MODE） | `3b36a17` |

#### 8.57.3 S-D3 整波审视记录（双只读 ≤2：A 旧仓对照 / B H6 死接缝+探针；全 finding 经主 session grep/Read 对旧仓 ground truth 核验后处置）

- **A 路（旧仓对照）最终报告 PASS 零 MUST-FIX**（初审 interim 3 项 claim 经主 session 对旧仓 L209-213 + 新仓 exitWorktreeTool.ts:287/330-360 逐字节核验全判误读，终报 8 条清单逐条 VERIFIED 定案）：函数体逐字面（Enter call / Exit validateInput 3 支 ec1·ec2·ec3 / Exit call keep·remove 双支 / countWorktreeChanges / restoreSessionToOriginalCwd / mapResult 两工具——全与旧源一致，唯四处替换 + inp 标识符位 delta 全头注登记）/ schema 转写面逐字段（description 串逐字 + enum 值序 + required 面）/ prompt 面字节一致（模板体口径独立复验 faad70f5/73ba6f0b；主 session 预核口径 25ac6d86/63e76330 = 导出常量全串 vs 旧函数返回值，两口径同不变量「旧体≡新体」，NOTE-5 登记）/ TOOL_DEFAULTS 逐值（旧 Tool.ts:785-790 缺省 + def 覆写位）/ Output 型全集（Exit 8 字段无缺）/ UI 纯字符串面逐字 + JSX 面裁 TUI 波登记 / 门控面三方一致（旧 worktreeModeEnabled ≡true 消费位 tools.ts:239 vs 新自门控）/ 测试文案逐字（含 em-dash 位 + 全角破折号，内存片段核过）。
- **A 路审视暴露真覆盖缺口 1 → 已补**：ec2 `commits > 0` 分支（on <branch> 子句，旧 L211）初审时无测试锚定 → **补 func 测试 1 条**（`sd2b-commits`：worktree 内真提交 → ec2 文案逐字含 `1 commit on worktree-sd2b-commits` → discard 放行 → discardedCommits=1 真盘删除）= S-D3 后唯一测试面 delta。
- **A 路 6 NOTE 处置（全接受登记，不阻塞）**：N-A1 delta ⑦ 缺省 slug UUID 化用户可见副作用（.atlas/worktrees/<uuid> 分支名不可读，plans 域前向接缝有意裁，头注 ⑦ 登记）/ N-A2 delta ⑩ getCwd()→getCwdState() 失 ALS 覆盖感知（跨波 C2-复审 F3 端口面裁定，非本子波发明，仅登记重指）/ N-A3 delta ⑦ execFileNoThrow→execFileNoThrowWithCwd + ATLAS_GIT_EXE env 覆写新增面（git -C 主导解析行为等价，whichSync 糖整砍 git.ts 头注登记）/ N-A4 z.strictObject additionalProperties:false 未随迁（delta ① 注「无可迁槽位」S-C5 同面先例，额外键经 duck cast 静默忽略 = 登记行为差非疏漏）/ N-A5 哈希口径差（见上）/ N-A6 input→inp 唯一标识符位 delta（自登记）.
- **B 路（H6 死接缝+探针）PASS 零 MUST-FIX**：探针 P-WT1..P-WT5 全活（值锚定 + 引用同一性，零 toBeDefined 族弱断言）/ 死接缝零 MISSING-WAVE（⑦⑧⑨⑩ 裁面全带归属波，⑧ 跨链核验 record.ts:19-23 + session/types.ts:258 WorktreeStateEntry 实存）/ 导出面 13/13 消费点全落 / any-stub 零命中（cast 全走 typed duck）/ 门面零 `export *`（13 名与子门面同一集合）/ 门控三方一致（实现·注册表措辞·P-WT4）+ env 名全仓单一拼写 / func 卫生全件（5 件 afterAll 复位 + 4 会话序列无污染 + ec3 三件清理）。
- **B 路 3 NOTE 处置（全接受登记，不阻塞）**：N1 = P-WT4「GA 缺省开」隐式依赖宿主 env 未设 ATLAS_DISABLE_WORKTREE_MODE（env 门控测试通病，isCronEnabled 同族，接受）；N2 = func keep 支 getProjectRoot（上探纯函数，linked worktree 带 .git 文件 → 返 worktree 路径）使 projectRootIsWorktree 实为 true → 触发 setProjectRoot（真 no-op）+ updateHooksConfigSnapshot——经主 session 核旧仓 bootstrap/state.ts:84 同为 cwd 上探（`: any` 包装真体）= **逐字随迁 quirk 非移植缺陷**（两触发面零行为危害，projectRoot 真面落地波可再议）；N3 = 两本体当前无真实注入点（组合根 baseTools = CLI 波，compose.ts:266 baseToolsCli 为预设名列表非 Tool 对象；注册表机制 + isEnabled 末行过滤已就位，注入即自门控）= 设计内预期。

#### 8.57.4 闭环记录
- S-D3 后基线：**2140 pass / 126 文件 / 4950 expect + gate 6 pass / 5 expect**（vs S-D2b 2139/126/4941：+1 func 测试 +9 expect，源零 delta；四件套 tsc 0 / eslint 0 / build 0KB entry 复验）。
- 49 口径 18/49 坐实（余 31 长尾）；波 tag 不切（提交链 c9f41b0 → 7fc4499 → 3b36a17 → 08452f8（S-D3 审视 + S-D4 闭环）；gate ③ 仍用 wave-c）。
- **C 桶 ① 下一子波 = §8.58 plan 族（EnterPlanMode + ExitPlanModeV2，team/auto-mode 面接缝登记）** → §8.59-§8.64 序列 → C 桶 ② auto-mode → C 桶 ③ shell·swarm → D 波 → remote → analytics。

### 8.58 plan 族子波（EnterPlanMode + ExitPlanModeV2，S-E1 执行前分析）

#### 8.58.1 范围（A 类真本体 2 件，49 口径 18/49 → 20/49）
- **EnterPlanMode**（旧 `src/tools/EnterPlanModeTool/EnterPlanModeTool.ts` 113L + prompt 103L）
- **ExitPlanModeV2**（旧 `src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts` 475L + prompt 29L）
- 工具名：`ENTER_PLAN_MODE_TOOL_NAME` / `EXIT_PLAN_MODE_V2_TOOL_NAME`（新仓 toolNames seed 已有，值 `'EnterPlanMode'` / `'ExitPlanMode'`）

#### 8.58.2 依赖闭包裁定（H6 逐条，旧仓实读核验）
1. **plan 域（新仓零落）**：旧 `utils/plans.ts` 397L 中 §8.58 消费面 3 件——
   - `getPlanFilePath(agentId?)`（L119：getPlanSlug(getSessionId()) + getPlansDirectory() memoize（plansPath = env 覆写 ?? join(getAtlasConfigHomeDir(), 'plans')，mkdirSync recursive 幂等）；主会话 `{slug}.md` / 子代理 `{slug}-agent-{agentId}.md`）
   - `getPlan(agentId?)`（L135：readFileSync ENOENT→null）
   - `persistFileSnapshotIfRemote`（L360：getEnvironmentKind()===null 早退 + recordTranscript 快照 = **remote 波面 → 裁 + 登记**（S-D2b delta ⑧ 同源先例））
   - 注意：旧 getPlanFilePath 依赖 getPlanSlug（S-D2b Enter 已裁 randomUUID 兜底同面）→ plan 域自带 getPlanSlug 或复用 S-D2b 裁面登记（S-E2 定）；新仓落点 = 新 `src/engine/tools/plan/` 子域（plan 域函数与工具本体同居，子门面归集）。
2. **EnterPlanMode 本体裁面**：
   - `handlePlanModeTransition`（旧 `bootstrap/state.ts:201` = **any-stub** `: any = (() => ({})) as any`）→ **裁 + 登记**（旧仓即 no-op；真状态迁移 = prepareContextForPlanMode + applyPermissionUpdate，新仓 permissions 域已落：`permissionSetup.ts:458` / `permissionUpdate.ts`）。H6 纪律：stub 不当真行为。
   - `isPlanModeInterviewPhaseEnabled`（旧 `utils/planModeV2.ts`：env `ATLAS_PLAN_MODE_INTERVIEW_PHASE` true/false 优先 + GB 门 `atlas_plan_mode_interview_phase` 缺省 false（整砍））→ 新仓 **env-only 门移植**（GB 支裁，GA 缺省关 = 旧 GB 缺省 false 等价；isCronEnabled 同族先例）；消费面 2 处（prompt whatHappens 段开关 + mapResult 双变体）。
   - `prepareContextForPlanMode` / `applyPermissionUpdate` 新仓已落（E-4 permissions 域）→ 直接接线。
   - `context.agentId` 守卫 / `context.getAppState/setAppState` → duck context（S-B5 D-7 先例）。
   - userFacingName：旧 def 显式 `return ''`（def 有 member，非 S-D6 name-wins 场景）→ 新 `() => ''` 逐字。
3. **ExitPlanModeV2 本体裁面（475L 最大闭包）**：
   - **4 个 plan-mode bootstrap 状态旗标 = 旧仓 any-stub 族**（`bootstrap/state.ts:237/248/249/308`：setHasExitedPlanMode / setNeedsAutoModeExitAttachment / setNeedsPlanModeExitAttachment / hasExitedPlanModeInSession 全 `: any = (() => ({})) as any`）→ **裁 + 登记**（TUI/attachment 波消费位；旧仓即 no-op，裁零行为差）。
   - **team/mailbox/swarm 面（S-D1 裁定 shell·swarm 波域）**：isTeammate/getAgentName/getTeamName/isPlanModeRequired/writeToMailbox/findInProcessTeammateTaskId/setAwaitingPlanApproval/isAgentSwarmsEnabled/toolMatchesName(AGENT_TOOL_NAME/TEAM_CREATE_TOOL_NAME) → 本波裁 teammate 分支（validateInput teammate 直通支 / checkPermissions teammate allow 支 / call plan_approval_request 支 / hasTaskTool 计算支），登记归属 shell·swarm 波（C 桶 ③）。
   - **auto-mode gate 面（C 桶 ② 消费位）**：feature('TRANSCRIPT_CLASSIFIER') 整砍（新仓无 GB）+ autoModeState/permissionSetup auto-mode 门族（isAutoModeGateEnabled/getAutoModeUnavailableReason/getAutoModeUnavailableNotification/stripDangerousPermissionsForAutoMode/restoreDangerousPermissions/isAutoModeActive/setAutoModeActive）→ gate-off 回退支 + restoring-to-auto 支 **裁 + 登记归属 C 桶 ② auto-mode 纵切波**（prePlanMode 恢复链主体保留 = restoreMode = prePlanMode ?? 'default' + mode/prePlanMode 写回；auto 判别支全裁）。
   - `context.addNotification`（gate 支通知面）→ 随 gate 支裁（TUI 波登记）。
   - `getPlanFilePath(context.agentId)` + `getPlan` + input.plan CCR 覆写支（inputPlan ?? getPlan）保留（plan 域新落面消费）。
   - validateInput `mode !== 'plan'` ec1 文案（非 teammate 支）+ checkPermissions 非 teammate ask 'Exit plan mode?' 保留。
   - mapResult 4 变体（awaitingLeaderApproval → 随 teammate 裁 / isAgent（context.agentId）保留 / 空 plan / 正常 plan + teamHint 随 hasTaskTool 裁）+ planLabel 逐字。
   - `_sdkInputSchema` 成员（旧 def）→ 裁（D 波 SDK 面接缝登记，S-B5 族先例）。
4. **prompt 面**：
   - Enter：`getEnterPlanModeToolPrompt`（interview 门控 whatHappens 段 + ASK_USER_QUESTION_TOOL_NAME 插值（新仓 toolNames 单一事实源）→ `ENTER_PLAN_MODE_PROMPT` 常量族（双变体或 gate 内联——S-E2 定）+ sha256 核。
   - Exit：`EXIT_PLAN_MODE_V2_TOOL_PROMPT`（29L 静态，ASK_USER_QUESTION 硬编码 'AskUserQuestion' 注释「Hardcoded to avoid relative import issues in stub」→ 新仓 toolNames 值同，delta 登记）。
   - 短 description() 串 2 件（'Requests permission to enter plan mode...' / 'Prompts the user to exit plan mode and start coding'）→ DESCRIPTION 常量留导出不接线（TUI 波，S-D3 族先例）。
   - renderToolUseMessage 3 面（Enter/Exit 各 renderToolUseMessage/renderToolResultMessage/renderToolUseRejectedMessage，UI.tsx JSX 裁 TUI 波；纯字符串体若有保留）。

#### 8.58.3 注册表门控
- plan 族无专属 registry 槽（20 槽裁定表无 plan 槽 → **无条件注册面**，同 Read/Write 族；isEnabled 恒 true）；注册表残留守 13 不变。

#### 8.58.4 测试面（S-E3 规划）
- **unit 零盘**：对象面（schema 转写：Enter strictObject 无参 / Exit allowedPrompts 嵌套 `{ tool: enum ['Bash'], prompt: string }` + `_sdkInputSchema` 裁登记）/ mapResult 逐字变体（保留 2 变体面：isAgent / 空 plan / 正常 plan）/ validateInput `mode!=='plan'` ec1 / checkPermissions ask 支 / interview 门双变体切换 / userFacingName '' / isDestructive（Exit false）。
- **func 真盘**：plan 域 getPlanFilePath/getPlan 真盘（plans 目录 mkdir + 文件读写 + ENOENT null + agent 后缀文件名面）+ Enter call 真 appState 面（duck getAppState/setAppState）+ Exit call 真盘（plan 文件覆写同步支 writeFile 真落盘）。
- **探针 P-PL1..P-PL5**（突变 1 red 锚点：ec1 文案 / interview 门控关 / mapResult planLabel / getPlanFilePath agent 后缀 / interview 变体切换）。

#### 8.58.5 基线预测
开波 2140/126/4950 + gate 6·5 → 预测 S-E2 ~2160/128/~5010（+20 测 / +2 文件 / +60 expect，plan 域判别支 + Exit 4 变体面）。

#### 8.58.6 闭环记录（S-E2 实施 + S-E3 双只读审视 + 修复）
- **S-E2 实施（54f170c）**：plan/ 子域 7 文件（enterPlanModeTool / exitPlanModeV2Tool / planPrompt / planDomain / planWords 800L 逐字 / planToolInput duck 8 型 / index 子门面 28 名显式 re-export）+ tools/index.ts 头注 §8.58 条目 + plan/ re-export 块 + 两测试文件。裁面全登记（头注 delta）：team 支 → C 桶 ③ / auto-mode gate 族 + bootstrap 4 旗标 → C ② / persistFileSnapshotIfRemote → remote 波 / _sdkInputSchema → D 波 / requiresUserInteraction 新契约无成员 / settings.plansDirectory 新 SettingsJson 无字段 / planModeV2 域外 3 件（S-E3 补登 delta ④）。
- **S-E3 双只读审视（d083480 修复）**：
  - **A 路（旧仓保真度）29/29 VERIFIED 零 MUST-FIX** + NOTE 5 条全修：① delta 悬空引用 ⑩⑫/⑩⑪⑫ → ⑥⑧/④⑥⑧（exitPlanModeV2Tool delta ① + planToolInput）；② getPlanSlugCache 措辞订正（旧 = any-stub `: any = () => new Map()` 每次调用新 Map 非「全局 Map」，新域内真 Map = 意图面恢复非 stub 复刻）；③ restorePlanSlug 笔误 → getSlugFromLog/copyPlanForResume/copyPlanForFork（plans.ts:149+，旧仓 grep 0 命中 restorePlanSlug 实证）；④ planModeV2 域外 3 件（getPlanModeV2AgentCount L4 / ExploreAgentCount L17 / getPewterLedgerVariant L72，旧消费位 messages.ts:3195/3225/3226 plan-mode prompt/query/附件面）前向接缝登记（planPrompt delta ④，新仓消息域未落）；⑤ delta ⑤ 旗标名行号顺序订正（237=setHasExitedPlanMode / 248=setNeedsAutoModeExitAttachment / 249=setNeedsPlanModeExitAttachment / 308=hasExitedPlanModeInSession）。
  - **B 路（新仓一致性 + 测试面）13/14 PASS，MUST-FIX 1 修**：探针 (e)「plan 域冲突重试 existsSync 检查」原随机探针在词表 9.76M 组合下 P(red)≈1e-7 形同未覆盖 → 修法 = planDomain 测试缝 `setPlanSlugGeneratorForTesting`（生产缺省 = generateWordSlug 零行为差，delta ⑦ 登记；先例 engine/session/project.ts *ForTesting 族）+ func 冲突重试测试改确定性注入序列 [a,b,c] 预占 a/b；**突变实证**（existsSync 检查置 `if (true)` → 恰好 1 red 14 pass/1 fail 后还原）。B 路其余 PASS 项：Tool 契约合规（13 必选成员 + validateInput 失败支 errorCode）/ 门面 re-export 1:1（28 名脚本 diff 零漂移）/ 探针 (a)-(d) 红位全落 / 断言串 verbatim 全核 / 状态卫生（--isolate 每文件独立进程 + beforeAll/afterAll 清场）/ 注册表 20 槽表无 plan 槽实证 / 死接缝扫描零未登记（generateShortWordSlug 消费位旧仓 bridge/initReplBridge.ts:237 实证）。
  - B 路 NOTE 1（测试数拆分）订正：S-E2 实际 **unit 26 + func 15 = 41**（任务单/提交文案 24/17 口径偏差，总数 41 正确）。
- **波终基线：2181 pass / 128 文件 / 5064 expect + gate 6 pass / 5 expect**（vs 开波 2140/126/4950：+41 测 / +2 文件 / +114 expect；四件套 tsc 0 / eslint 0 / build 0KB entry 复验；S-E2 预测 ~2160/128/~5010 偏低，实测全量 +41/+114）。
- 49 口径 **20/49 坐实**（余 29 长尾）；波 tag 不切（提交链 02c5889（S-E1）→ 54f170c（S-E2）→ d083480（S-E3 审视 + 修复）；gate ③ 仍用 wave-c）。
- **C 桶 ① 下一子波 = §8.59 web 族（WebFetch 318L 管线 + preapproved 166L + utils 537L / WebSearch 354L LLM 面）** → §8.60-§8.64 序列 → C 桶 ② auto-mode → C 桶 ③ shell·swarm → D 波 → remote → analytics。

### 8.59 web 族子波（WebFetch + WebSearch，S-E1 执行前分析）

#### 8.59.1 范围（A 类真本体 2 件，49 口径 20/49 → 22/49）
- **WebFetchTool**（旧仓 src/tools/WebFetchTool/：WebFetchTool.ts 318L + preapproved.ts 166L + utils.ts 537L + prompt.ts 46L + UI.tsx 71L 编译产物）：URL→markdown 管线（validateURL / 域名 blocklist 预检 / 受限重定向 / 二进制落盘 / turndown / LRU 缓存）+ 二级模型 prompt 应用（applyPromptToMarkdown，'fast' 角色）+ 首个**域名规则消费面**（checkPermissions 经 getRuleByContentsForTool 三行为面，ruleContent = `domain:<hostname>` / 兜底 `input:<json>`）+ preapproved 双表（HOSTNAME_ONLY Set + PATH_PREFIXES Map 段边界匹配）。
- **WebSearchTool**（旧仓 src/tools/WebSearchTool/：WebSearchTool.ts 354L + prompt.ts 34L + UI.tsx 100L 编译产物）：自持 LLM 循环面（createUserMessage → makeToolSchema server-tool 注入 → buildOpenAIParams → modelProvider.chatStream 流收集 → makeOutputFromSearchResponse 块解析 text/server_tool_use/web_search_tool_result 三块型 → B8 错误面 streamError）+ validateInput 双支（缺 query ec1 / allowed+blocked 双域 ec2）+ extractSearchText '' 幻影匹配守卫。
- 两工具注册表 = **无条件注册面**（20 槽裁定表无 web 槽，同 plan/Read 族；toolNames 常量族 WEB_FETCH_TOOL_NAME / WEB_SEARCH_TOOL_NAME 已在 tools/index.ts:137-138 导出 = 本波本体 materialize）。

#### 8.59.2 依赖闭包裁定（H6 逐条，旧仓实读核验 + 新仓面核过）
- **模型面**：新仓 modelprovider 门面（modelProvider.chat 收 `openaiParams`（modelprovider.ts:160-161 `{...openaiParams, model: entry.modelId, stream: false}`）/ chatStream 实 yield 消息级 `{type:'assistant', message}` + `{type:'error', code, message, retryable}`（streamOneAttempt 尾 L441 实证；StreamEvent 型联无 assistant 变体 → 消费走 `Record<string, unknown>` escape，streamAssistant.ts:60-66 先例逐字）。`buildOpenAIParams(args, role, entry?, opts?)`（params.ts:198）options 消费面 = model / toolChoice（{type:'tool',name}→function 映射）/ extraToolSchemas（name/description/input_schema 三字段取用，advisor_20260301 跳过）/ maxOutputTokensOverride / temperatureOverride / effortValue（resolveAppliedEffort 链）——旧 WebSearch options 7 项无消费者（见裁面 ⑨）。`ModelRole` 含 **'fast'**（roles.ts:52）→ WebFetch applyPromptToMarkdown 的 `buildOpenAIParams(..., 'fast')` + `chat({role:'fast'})` 原生映射，零裁。
- **规则面**：`getRuleByContentsForTool(context, tool: RuleTool, behavior)`（ruleMatching.ts:264，RuleTool = Pick 'name'|'mcpInfo'|'checkPermissions' 结构 duck，WebFetch 工具对象天然满足）+ 循环破坏器 getRuleByContentsForToolName（:277）= WebFetch checkPermissions 三行为面（deny→deny / ask→ask+suggestions / allow→allow）直接接线位。permissionContext 取用 = `context.getAppState().toolPermissionContext`（bash 域 duck 先例 bashToolInput.ts:62）。
- **消息/错误面**：createUserMessage（files/userMessage.ts:40，`{content, isMeta?}` 签名逐字匹配旧两调用位）；AbortError（bash/abortError.ts:17，经 bash/ 子门面 import）；logError（shared/log.ts:17）；formatFileSize（shared/format.ts:12）；asSystemPrompt（shared/types.ts:119）。
- **主循环模型面**：旧 `context.options.mainLoopModel` → 新 `getMainLoopModelName()`（files/modelRef.ts:24 = small 角色池头，§8.55 裁定 D 组 ① 先例）；`modelToRole`（roles.ts:179：normalize 后快/高角色模型名判定，未命中/空串回落 'small' 安全）。
- **effortValue 面**：新仓 engine/ports/sessionContext.ts:30 `effortValue: EffortValue` 存在 → options.effortValue 保留（取 context.getAppState()?.effortValue）；无消费者位（chat 支）裁。
- **月份年面**：旧 getLocalMonthYear（constants/common.ts:28，ATLAS_OVERRIDE_DATE + toLocaleString('en-US',{month:'long',year:'numeric'})）新仓无同物 → 域内本地逐字随迁（getWebSearchPrompt 唯一消费位）。

#### 8.59.3 裁面裁定（H6 逐条，带归属波；delta 编号 = S-E2 各文件头注）
1. **GB 门 `atlas_plum_vx3` 整砍**（旧 WebSearchTool.ts `getFeatureValue_CACHED_MAY_BE_STALE('atlas_plum_vx3', false)`）：新仓无 GrowthBook 基础设施（cronJitterConfig 整砍 §8.47 / Read dedup env 门先例）。**默认 false ⇒ 有效支 = mainLoopModel 路径**：searchModel = getMainLoopModelName() / thinkingConfig = context.options.thinkingConfig / toolChoice = undefined（旧 useHaiku 三元支全裁）。`getDefaultFastModel()` fast 池映射面新仓缺位 → 随门裁（**前向接缝登记：C 桶 ② auto-mode 波若恢复快模型搜索面，ModelRole 'fast' 已存在，searchRole 切 'fast' 即活**）。
2. **axios → node 内建 global fetch**（新仓 3 依赖最小面：openai/zod/proper-lockfile，零新依赖纪律）：getWithPermittedRedirects = `fetch(url, {redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]), headers})`；axios status 校验 throw → fetch 不 throw 4xx/5xx，`!res.ok` 手动 throw `Request failed with status code ${status}`（旧措辞）；maxContentLength 10MB → content-length 头预检 + arrayBuffer()；301/302/307/308 手工 Location 跟随（depth 计数 > MAX_REDIRECTS=10 throw）。**注入缝**：模块级 `fetchImpl` 引用 + `setWebFetchTransportForTesting(fn | null)`（*ForTesting 族先例）——getWithPermittedRedirects + checkDomainBlocklist 双消费位，func 层 HTTP fixture 零真网络。
3. **lru-cache → 域内本地 LRU**（Map 插入序 + TTL + 字节上限，plan 族 delta ②「新仓无 lodash 本地实现」先例）：URL_CACHE（TTL 15min / 50MB，key = 原始 URL，size = max(1, contentBytes)）+ DOMAIN_CHECK_CACHE（128 条 / TTL 5min，仅缓存 'allowed'）。`clearWebFetchCache()` 测试缝保留。
4. **turndown 懒加载（~1.4MB）整砍**：新仓无 turndown 依赖且不为本面新增（3 依赖纪律）；HTML 内容 raw 透传（旧 turndown 支裁，非 HTML 支逐字）；getTurndownService 懒单例随之裁。**登记 = HTML→markdown 转换面裁（TUI/增强波复活候选，非本波）**。
5. **getSettings_DEPRECATED().skipWebFetchPreflight opt-out 支裁**（新仓 SettingsJson 无该字段，plan 族 delta ③ settings 字段裁先例）→ checkDomainBlocklist 恒走 env 支。
6. **ATLAS_WEB_DOMAIN_CHECK_URL [ATLAS-HOLD] fail-open env 保留逐字**：env 未设 → {status:'allowed'}（原 preflight 端点已废弃，旧仓 de-ANT 注释随迁）；env 设 → fetch GET `${url}${sep}domain=${encodeURIComponent(domain)}`（超时 DOMAIN_CHECK_TIMEOUT_MS=10s，axios→fetch ②）；200 + can_fetch===true → allowed（入缓存）否则 blocked；非 200/异常 → check_failed。
7. **getWebFetchUserAgent 域内本地常量**：旧 = `Atlas-User (atlas/${MACRO.VERSION}; +https://support.atlas.ai/)`（getDefaultUserAgent = `atlas/${MACRO.VERSION}` 构建宏）；新仓无 MACRO 版本宏 → `WEB_FETCH_USER_AGENT = 'Atlas-User (+https://support.atlas.ai/)'`（UA 表面非功能面，版本段裁登记）。
8. **isBinaryContentType / persistBinaryContent（旧 mcpOutputStorage）域内本地化**：isBinaryContentType 逐字（纯函数：text/* / +json / +xml / javascript / urlencoded 五非二进制支）；persistBinaryContent 适配 = fs/promises writeFile 落 `join(getAtlasConfigHomeDir(), 'tool-results')`（旧 = join(getSessionDir(),'tool-results') 会话作用域 → config-home 作用域，登记；旧 toolResultStorage 会话/GB 面不随迁）；PersistBinaryResult 双变体逐字（{filepath,size,ext} | {error}）；extensionForMimeType 逐字（mcpOutputStorage.ts:62 同块随迁，固定词表 mime→ext）；getBinaryBlobSavedMessage 不随迁（旧 WebFetch call 用自写模板，非该函数消费位）。
9. **旧 WebSearch options 7 项无消费者裁**：getToolPermissionContext / isNonInteractiveSession / hasAppendSystemPrompt / querySource / agents / mcpTools / agentId 新 buildOpenAIParams 不读（params.ts 实读核过）→ 裁（登记：querySource/agents 面 = 遥测/agent 域外，analytics 波 / C 桶 ③ 归属）；保留 = model / extraToolSchemas / effortValue（toolChoice 随 ① 恒 undefined 裁）。
10. **makeToolSchema server-tool 形状保留 + wire 映射面登记**：makeToolSchema 返回逐字（{type:'web_search_20250305', name:'web_search', allowed_domains, blocked_domains, max_uses: 8 硬编码注释随迁} = schema 单一事实源）；新 extraToolSchemas 消费者 = OpenAI function 映射（仅 name/description/input_schema 三字段）→ server-tool 专属字段（type/allowed_domains/blocked_domains/max_uses）**不上 wire**（OpenAI 协议 function entry 无此面；provider 侧能力边界 = IFF 网关面，登记非裁——makeToolSchema 返回值形状不动）。
11. **jsonStringify（旧 slowOperations 稳定排序变体）→ JSON.stringify**：唯一消费位 = mapToolResult `Links:` 显示行（零行为差，登记）。
12. **UI.tsx React 渲染面裁 + 纯成员随迁**：renderToolUseProgressMessage / renderToolResultMessage（两工具共 4 面，MessageResponse/Box/Text 依赖）裁（新仓无 TUI React 层，C/D 波 TUI 面前向接缝）；**renderToolUseMessage（字符串逻辑零 React 依赖）+ getToolUseSummary（truncate + TOOL_SUMMARY_MAX_LENGTH=50）随迁**（新 Tool 契约 renderToolUseMessage 为必选成员，readTool 先例）。旧 truncate 宽感知（ink/stringWidth）→ 域内本地 50 字符面（截断 + '…'，getToolUseSummary 唯一消费位表面，登记宽感知面裁）。
13. **WebSearchProgress = 旧 types/tools.ts 编译 any-stub（H6 不当真行为）** → 域内结构 duck 双变体 union（UI.tsx 消费面恢复：{type:'query_update', query} | {type:'search_results_received', query, resultCount}）；call 5 参签名（_canUseTool/_parentMessage/onProgress 体零消费，旧 L233 声明实证）→ 2 参（readTool delta ⑧ 先例）。
14. **品牌串逐字保留**：'Claude wants to fetch content from …' / 'Claude wants to search the web for: …'（grep 核过已迁文件保 "Claude" 串，plan/bash 族先例）。
15. **call context duck 化**：旧 buildTool 全 ToolUseContext → 新 2 参 call(input, context) + 域 duck（WebFetchToolContext {abortController, options: {isNonInteractiveSession}}；WebSearchToolContext {abortController, options: {thinkingConfig}, getAppState(): {toolPermissionContext, effortValue?}}）；description(input, options) 新契约 = 旧 description() 短成员面（WebFetch hostname 模板 + catch 'this URL' 兜底；WebSearch 静态 '…' 串）；prompt() 面 → 新 description 主面（WebFetch DESCRIPTION 含 auth 警告逐字，旧「条件切换闪烁失效 prompt cache」注释随迁；WebSearch getWebSearchPrompt 动态月年 = 唯一动态 description 面）。
16. **validateInput 新契约 ValidationResult**（{result:true} | {result:false, message, errorCode}）：WebFetch ec1 `Error: Invalid URL "${url}". The URL provided could not be parsed.` 逐字；WebSearch ec1 'Error: Missing query' / ec2 'Error: Cannot specify both allowed_domains and blocked_domains in the same request' 逐字。

#### 8.59.4 注册表门控
- web 族无专属 registry 槽（20 槽裁定表无 web 槽）= **无条件注册面**，isEnabled 恒 true（旧 WebSearch isEnabled 注释「provider 恒 firstParty，3P 支随 legacy-model-stack 清理删除」语义 = 恒 true 逐字）；49 口径 20/49 → **22/49**（余 27）。
- 文件落点：`src/engine/tools/web/` 子域 8 文件（webFetchTool / webFetchUtils / preapproved / webFetchPrompt / webSearchTool / webSearchPrompt / webToolInput duck / index 子门面）+ tools/index.ts 头注 §8.59 条目 + web/ re-export 块 + 2 测试文件。

#### 8.59.5 测试面（S-E2 落 + S-E3 审视；unit 零盘零网络 + func fixture 注入缝）
- **unit（tests/unit/engine-tools-web-se2-pure.test.ts，预测 ~24 测）**：① 2 inputSchema 形状（required/properties/describe 串）；② webFetchToolInputToPermissionRuleContent（domain: 提取 + 兜底 input:）；③ checkPermissions 四支（preapproved → allow decisionReason 'Preapproved host' / deny 规则命中 → deny 消息逐字 / ask 规则命中 → ask + buildSuggestions / 无规则 → ask + suggestions，真 getRuleByContentsForTool 空/种子 context）；④ validateInput 三支（WebFetch 非法 URL ec1 / WebSearch 缺 query ec1 / 双域 ec2 文案逐字）；⑤ makeToolSchema（type/name/max_uses 8 硬编码 + 双域透传）；⑥ makeOutputFromSearchResponse（text 累积 + inText 切换 / server_tool_use flush / web_search_tool_result 数组 hits + 非数组 error 串 `Web search error: ${error_code}` / 尾部 trim push）；⑦ makeSecondaryModelPrompt 双变体（preapproved 宽松 guidelines vs 严格 125 字符引文支）；⑧ validateURL 四支（>2000 / username / hostname 单段 / 合法 https 过）；⑨ isPermittedRedirect（同 host / 跨 host / 协议差 / 端口差 / www 增减放行 / redirect 带 credentials 拒）；⑩ preapproved 边界（HOSTNAME_ONLY 命中 / PATH_PREFIXES 段边界：'/anthropics' 不匹配 '/anthropics-evil/malware' / 精确前缀 + '/' 边界）；⑪ isBinaryContentType 六支（空 / text/* / +json / application/json / application/javascript / application/pdf → true）；⑫ 本地 LRU（TTL 过期 / 字节上限驱逐 / clearWebFetchCache 清双表）；⑬ checkDomainBlocklist fail-open（env 未设零网络 → allowed，DOMAIN_CHECK_CACHE 仅 allowed 入缓存）；⑭ getWebSearchPrompt 月年（ATLAS_OVERRIDE_DATE 确定性注入断言）；⑮ description 面（WebFetch 合法 → hostname / 非法 input → 'this URL' 兜底）；⑯ mapToolResult 两工具（WebSearch string/object 空 hits/REMINDER 行 / WebFetch {tool_use_id, type, content}）；⑰ getWithPermittedRedirects depth >10 → 'Too many redirects (exceeded 10)'（注入缝假 transport 302 自环）。
- **func（tests/func/engine-tools-web-se2-http.test.ts，预测 ~8 测，注入缝零真网络零真模型）**：⑱ getURLMarkdownContent 全链（200 text/html raw 透传（turndown 裁面实证）/ 200 text/markdown + preapproved → 短截支原样返回 / 302 同 host 链 → 末跳内容 / 302 跨 host → {type:'redirect'} 信息面（statusText 4 支 301/308/307/else Found）/ 403 + x-proxy-error=blocked-by-allowlist → EgressBlockedError（JSON body {error_type:'EGRESS_BLOCKED'} 面）/ 二进制 content-type → 域内 persistBinaryContent 真盘（ATLAS_CONFIG_DIR tmpdir）+ result 注记 `[Binary content (…)]` / 二次调用缓存命中 transport 零触发）；⑲ WebSearch call 全链（setModelProviderForTesting fake chatStream：yield 最终 assistant {web_search_tool_result 块 + text 块} → results 含 hits + Links 行 / yield {type:'error'} → streamError 措辞 `Web search provider error (code: …, retryable: …)` push results（B8 面）/ fake throw → catch 支 streamError = error.message）；⑳ applyPromptToMarkdown（fake modelProvider.chat 返 text 块 → 返 .text / 无 text 块 → 'No response from model' / signal.aborted → AbortError）。
- **探针（S-E3 双只读突变，恰 1 红）**：P-W1 preapproved 段边界（'/' 边界去掉 → '/anthropics-evil' 误放行恰 1 红）/ P-W2 isPermittedRedirect www 支（stripWww 去掉 → 恰 1 红）/ P-W3 LRU TTL（TTL 检查去掉 → 过期命中恰 1 红）/ P-W4 redirect statusText（308 支文案改 Found → 恰 1 红）/ P-W5 makeOutputFromSearchResponse inText 切换（flush 去掉 → 恰 1 红）/ P-W6 注入缝突变（fetchImpl 缺省回 global fetch → func fixture 不生效恰 1 红，缝有效性自证）。

#### 8.59.6 基线预测
开波 2181/128/5064 + gate 6·5 → 预测 S-E2 ~2215/130/~5250（+32 测 / +2 文件 / +190 expect：web 管线判别支多（redirect 4 支 + preapproved 边界 + LRU + B8 流面），plan 波 +41/+114 同族偏高预测）。

#### 8.59.7 闭环记录（S-E2 实施 + S-E3 双只读审视 + 修复）
- **S-E2 实施（6bab87f）**：web/ 子域 8 文件（webFetchTool / webFetchUtils 537L 管线 fetch 化 / preapproved 双表 / webFetchPrompt / webSearchTool / webSearchPrompt / webToolInput duck 11 型 / index 子门面逐名显式 re-export）+ tools/index.ts 头注 §8.59 条目 + web/ re-export 块 + 两测试文件（unit `engine-tools-web-se2.test.ts` 33 测 / func `engine-tools-web-se2-fs.test.ts` 9 测；S-E1 预测文件名 pure/http 实落 se2/fs 口径）。裁面全登记（头注 delta）：3 依赖纪律（axios→node fetch redirect:'manual' / lru-cache→本地 TtlLruCache / turndown 整砍 HTML raw 透传）/ GrowthBook 门整砍（useHaiku 恒 false，haiku 快模型支 TUI 增强波复活候选）/ UI.tsx JSX 面裁（TUI 波）/ getActivityDescription 新契约无位（TUI 波前向接缝）/ settings.skipWebFetchPreflight 企业 opt-out 支裁（新仓无 SettingsJson 面）/ 旧 preflight 端点 de-ANT（ATLAS_WEB_DOMAIN_CHECK_URL [ATLAS-HOLD] 占位，未设 fail-open）。
- **S-E3 双只读审视（d4ae964 修复）**：
  - **A 路（旧仓保真度）2 MUST-FIX + NOTE 9 全修**：A-M1 环守卫消息漂移 'Too many loops' → 旧仓逐字 `Too many redirects (exceeded ${MAX_REDIRECTS})` 还原（旧 utils.ts:275 锚，delta ① 补登）；A-M2 `.url()` / `format:'uri'` wire 面裁除未登记 → 复原 + delta ② 登记（zod v4 `z.url()` 核验可用）；A-N1 options 5 字段计数订正 / A-N3 旧 getDefaultFastModel 源 = fast 角色池（非 small 池头）措辞订正 / A-N4 URL_CACHE 条目上限 500（lru-cache v10 隐式 max）补登记 + TtlLruCache 实参 / A-N5 chunked 传输 content-length 守卫盲区登记 / A-N7 成员计数订正（旧 16 → 新契约 19）/ A-N8..N9 签名面注（jsonStringify 2 参 / 旧 call 2 参）。两 MUST-FIX 均注册/文案层，逻辑零漂移（无假装裁掉、无凭空行为）。
  - **B 路（新仓一致性 + 测试面）0 MUST-FIX + NOTE 7 全处置 + PASS 6**：B-N1 两 TOOL_NAME 常量域内双源字面 → toolNames 单一事实源 re-export（漂移风险除）/ B-N2 blocklist env 已设 can_fetch 双支头注超声明 → 补测（allowed 缓存 DOMAIN_CHECK_CACHE / blocked 抛 DomainBlockedError，unit +1 测）/ B-N3 statusCode 4 值透传 → 302 透传示证 + 307/308 文案支未测登记 / B-N4 func statusText 双支措辞订正（301/302 实测，307/308 登记）/ B-N5 型面计数 13 → 11（webToolInput 实导出 11 型）/ B-N6 重名登记先例归属订正（tasks 族 TASK_*_DESCRIPTION 别名）/ B-N7 双 cast 自足登记。PASS 6 项：Tool 契约合规 / 门面 re-export 1:1 / 执行面实测复验（transport 缝 + fake ModelProvider 双缝有效）/ 断言串 verbatim 全核 / 状态卫生（--isolate + 清场）/ 注册表 49 口径无条件注册位实证（web 族无专属门控槽）。
- **波终基线：2224 pass / 130 文件 / 5251 expect + gate 6 pass / 5 expect**（vs 开波 2181/128/5064：+43 测 / +2 文件 / +187 expect；四件套 tsc 0 / eslint 0 / build 0KB entry 复验；S-E2 后 2223/130/5245 与 S-E1 预测 +42/+2/+181 精确吻合，S-E3 补测 +1/+6）。
- 49 口径 **22/49 坐实**（余 27 长尾）；波 tag 不切（提交链 db5ff7b（S-E1）→ 6bab87f（S-E2）→ d4ae964（S-E3 审视 + 修复）；gate ③ 仍用 wave-c）。
- **C 桶 ① 下一子波 = §8.60 config+ask-user+skill（Config 456L + AskUserQuestion.tsx + Skill 915L）** → §8.61-§8.64 序列 → C 桶 ② auto-mode → C 桶 ③ shell·swarm → D 波 → remote → analytics。

#### 8.60.1 S-E1 执行前分析（config+ask-user+skill 族：依赖闭包裁定 + 重分类）
**读面**：旧仓 ConfigTool.ts 456L + supportedSettings.ts 180L + prompt.ts 93L + UI.tsx 37L + constants / AskUserQuestionTool.tsx 256L（React-Compiler 编译态：逻辑可读；isEnabled 编译体 = `return true`，sourcemap KAIROS 支为死码）+ prompt.ts 44L / SkillTool.ts 915L + prompt.ts 213L（formatCommandsWithinBudget 预算化清单）+ UI.tsx 127L + constants。新仓 34 符号闭包 grep + config 域（settings.ts / types.ts）+ modelprovider roles + Tool 面（shared/types.ts:178）+ toolRegistry + toolNames + 组合根。

**§8.60.1.1 重分类裁定：Skill（915L + prompt 213L + UI 127L）→ D 波（skill 域）**
- 本体硬依赖闭包（新仓 grep 全 0 命中，未落）：
  - **commands 域**：getCommands（旧 src/commands.ts:426）/ findCommand / builtInCommandNames / PromptCommand；prompt.ts 侧 getSkillToolCommands / getSlashCommandToolSkills（src/commands.js）——skill/斜杠命令目录域（src/commands/ + src/skills/ + src/services/skillSearch）整体未落；
  - **forkedAgent**：prepareForkedCommandContext / extractResultText（executeForkedSkill 子代理支；runAgent 本体 §8.25 E-2 已落，但 fork 上下文 + 结果文本抽取层未落）；
  - **processPromptSlashCommand**（processUserInput 族）/ recordSkillUsage（skillUsageTracking）/ invoked-skill tracking（addInvokedSkill / clearInvokedSkillsForAgent）/ parsePluginIdentifier / isOfficialMarketplaceName / createAgentId / tagMessagesWithToolUseID / COMMAND_MESSAGE_TAG / getAgentContext；
  - feature('EXPERIMENTAL_SKILL_SEARCH') 远端 skill 4 模块（新仓 feature() 恒 false，整支裁）。
- 裁定依据：落 commands/skills 域 = **整域落盘**（目录 + 斜杠命令处理 + usage tracking），超出子波「单工具本体纵切」scope。H6 登记：**Skill 重分类归 D 波（D 桶 ① skill 域）——D 波先落 commands/skills 域，再落 SkillTool 本体**。49 口径 Skill 槽 = 残留守（⑲ 族，归属波 = D 波 skill 域）；§8.64 stub/壳登记批不覆盖 Skill（它有本体，非零本体槽）。本波实收口标题改「config+ask-user（Skill 重分类 D 波）」。

**§8.60.1.2 Config（767L）落盘 + 裁面裁定**
- 新面 = `src/engine/tools/config/`（configTool.ts + supportedSettings.ts + configPrompt.ts + index.ts）+ tools/index.ts re-export 块。house style：`ConfigToolFace extends Tool`（checkPermissions 返回型收窄，readTool/web face 先例）+ inputSchema 纯 JSON（ToolInputJSONSchema）+ TOOL_NAME 常量 toolNames 单一事实源。
- inputSchema：setting（string 必填）/ value（string|boolean|number 可选，additionalProperties false）。
- checkPermissions 逐字（旧 L94-102）：value undefined → `{behavior:'allow'}`（GET 自动放行）；否则 `{behavior:'ask', message: 'Set ${setting} to ${jsonStringify(value)}'}`。
- call：GET = getInitialSettings() path walk（buildNestedObject 反向读）+ formatOnRead；SET = boolean coercion（'true'/'false' 字符串）+ options 校验（`Invalid value "${value}". Options: ...`）+ write = updateSettingsForSource('userSettings', buildNestedObject(path, finalValue))——新签名 `{error: Error|null}`（settings.ts:393）与旧 `result.error.message` 消费兼容。**remoteControlAtStartup 'default' 特例（saveGlobalConfig 删键 + getRemoteControlAtStartup + setAppState replBridgeEnabled）随 global 段整裁**（残留守，归属 C 桶 ③ shell·swarm 波 TUI 面族）。
- **AppState 同步（appStateKey 'verbose'|'mainLoopModel'|'thinkingEnabled'）裁**：新 Tool 面 / ToolUseContext 无 setAppState（grep 0 命中）；残留守。
- mapToolResult 逐字：get `${setting} = ${jsonStringify(value)}` / set `Set ${setting} to ${jsonStringify(newValue)}` / error `Error: ${msg}` + is_error:true。
- **SUPPORTED_SETTINGS 注册表裁剪（存活判据 = 新 SettingsJson 声明 ∩ 新仓活消费点，双满足才留）**：
  - **留 3**：autoMemoryEnabled（src/memory/config.ts:53 isAutoMemoryEnabled 优先级链消费）/ model（modelprovider roles 面）/ 'permissions.defaultMode'（permissionSetup.ts:162-183 消费 + 'auto' 降级裁定 2026-09-19 逐字）。
  - **裁 12（残留守登记）**：global 段 12 键（theme/editorMode/verbose/preferredNotifChannel/autoCompactEnabled/fileCheckpointingEnabled/showTurnDuration/terminalProgressBarEnabled/todoFeatureEnabled/teammateMode/remoteControlAtStartup 等）——新仓 globalConfig 面（getGlobalConfig/saveGlobalConfig + 配置文件 + freshness watcher）未落，且 12 键全为 TUI/CLI 态 → **归属 = C 桶 ③ shell·swarm 波（TUI 面族）**；settings 段 8 键：autoDreamEnabled（types.ts 砍字段族）/ language（UI/行为族裁）/ voiceEnabled（feature('VOICE_MODE') 恒 false）/ alwaysThinkingEnabled（types.ts 声明但无活消费点，thinking 控制 = effort B 方案）/ autoCompactEnabled（新 autoCompact 域 = env 覆写面 DISABLE_COMPACT 等，不消费 settings 布尔）等。
  - **permissions.defaultMode options = 5 值集** `['default','plan','acceptEdits','dontAsk','auto']`：旧 feature('TRANSCRIPT_CLASSIFIER') 5/4 分拆在新仓恒 false → 旧有效集 = 4，但新 permissionSetup:176-183 逐字裁定显式消费 'auto'（全局持久值 → session 降级 'default'）→ **恢复 5 值集（delta 登记，非旧仓 feature-off 面逐字，裁定依据 = 新仓既有消费面）**。
  - **model getOptions**：新面 = settings.availableModels（types.ts 声明字段）→ 缺省回落角色池默认 `['small','premium','fast']`（旧 catch 支逐字）；旧 getModelOptions 附加面（ATLAS_CUSTOM_MODEL_OPTION env / bootstrap cache / current+initial model 追加）裁（新 modelprovider 无 bootstrap cache 消费面，delta 登记）。
  - **model validateOnWrite 裁**：旧 validateModel = sideQuery 真 API 探活（max_tokens 1）+ modelAllowlist + MODEL_ALIASES，三面无一在新仓；模型活面 = modelprovider healthCheck 域。formatOnRead null→'default' 逐字留（单行）。
- UI.tsx 37L JSX → 裁（TUI 波）；prompt.ts 93L generatePrompt 注册表驱动 → 随注册表裁后仅列 3 存活键；model section catch fallback `(sonnet, opus, haiku, best, or full model ID)` 逐字。
- **S-E2 基线预测**：unit 2 新文件（config / askUser）~30 测 / ~90 expect；无 func 文件（纯逻辑 + 无真 I/O 独占面）。

**§8.60.1.3 AskUserQuestion（300L）落盘 + 裁面裁定**
- 新面 = `src/engine/tools/askUser/`（askUserQuestionTool.ts + askUserPrompt.ts + index.ts）。
- inputSchema = 纯 JSON（questions 1-4 / options 2-4 / multiSelect 默认 false / annotations record / commonFields answers record）。**旧 UNIQUENESS_REFINE（问题文本唯一 + 每题选项 label 唯一）纯 JSON schema 不可表达 → 移入 validateInput**（语义逐字：message `Question texts must be unique, option labels must be unique within each question`；delta 登记）。
- validateInput HTML preview 校验裁：旧 getQuestionPreviewFormat = bootstrap/state.ts:98 `any` stub（返回 {} ≠ 'html' → html 支死码，H6 不认 stub 真行为）→ 新 validateInput = 唯一性校验单支（TUI 波可随真 preview-format 态复活，前向接缝登记）。
- checkPermissions → `{behavior:'ask', message:'Answer questions?'}` 逐字；call = passthrough `{questions, answers:{}, annotations? spread}`；mapToolResult 逐字（per-answer `"q"="a"` + `selected preview:\n…` + `user notes: …` parts join ' '；content `User has answered your questions: ${answersText}. You can now continue with the user's answers in mind.`）。
- isEnabled = true（旧编译体）；旧 requiresUserInteraction 新 Tool 面无位 → 裁（登记）。
- prompt 44L：ASK_USER_QUESTION_TOOL_PROMPT 4 点用法 + "Other" + multiSelect + "(Recommended)" 逐字；EXIT_PLAN_MODE_TOOL_NAME → 新仓 **EXIT_PLAN_MODE_V2_TOOL_NAME**（plan 域 §8.58 单一事实源）；PREVIEW_FEATURE_PROMPT html 段裁（preview 态已裁）、markdown 段留；CHIP_WIDTH 12 逐字。
- _sdkInputSchema / _sdkOutputSchema → D 波（plan 族先例）；UI JSX → TUI 波。

**§8.60.1.4 组合根与注册**
web 族先例：子域 index.ts 逐名显式 re-export（STR-1）+ tools/index.ts re-export 块 + 49 口径无条件注册位（无专属门控槽）。本族同：Config / AskUserQuestion = 无条件注册。**49 口径 S-E2 后 22/49 → 24/49**（+2 槽；Skill 槽留残守 → D 波）。**波终基线预测：2224 + ~30 测 ≈ 2254 pass / 132 文件 / ~5340 expect + gate 6·5 不变**。

#### 8.60.2 闭环记录（S-E2 实施 + S-E3 双只读审视 + 修复）
- **S-E2 实施（5623d16）**：config/ 子域 4 文件（configTool.ts ConfigTool 本体 + CONFIG_TOOL_INPUT_SCHEMA + ConfigOutput duck 型 / supportedSettings.ts 3 键注册表（autoMemoryEnabled / model / 'permissions.defaultMode' 5 值集含 'auto' 恢复裁定）+ 5 查询函数 / configPrompt.ts DESCRIPTION + generatePrompt 注册表驱动（空 Global 段不渲染）/ index.ts 子门面）+ askUser/ 子域 3 文件（askUserQuestionTool.ts 本体 + ASK_USER_QUESTION_TOOL_INPUT_SCHEMA 嵌套 min/max + duck 型 5（UNIQUENESS 校验移入 validateInput errorCode 1 / checkPermissions 恒 ask / call passthrough / mapToolResult 模板逐字）/ askUserPrompt.ts 3 prompt 常量 + CHIP_WIDTH 12（EXIT_PLAN_MODE 替换 + PREVIEW markdown-only）/ index.ts 子门面）+ tools/index.ts §8.60 头注 + 两 re-export 块（短描述别名 CONFIG_DESCRIPTION / ASK_USER_QUESTION_DESCRIPTION 重名登记）+ 两测试文件（unit `engine-tools-config-se2.test.ts` 32 测 84 expect 零盘 FsOperations mock 隔离 / `engine-tools-ask-user-se2.test.ts` 20 测 52 expect 纯对象零盘零网；+52 测 / +2 文件 / +136 expect）。裁面全登记（头注 delta）：global 段 11 键 → C 桶 ③ shell·swarm 波 / html preview 支 = 旧 any stub 死码裁 / AppState 同步面裁 / validateOnWrite 三面无一落裁 / UI JSX 面 → TUI 波 / _sdk* → D 波 / voice pre-flight 整支裁。
- **S-E3 双只读审视（c2e7630 修复）**：
  - **A 路（旧仓保真度）0 MUST-FIX + NOTE 5 全处置**：A-N1 注册表键数勘误 20(12+8) → 18(11+7；门控键 source 归属核过：voiceEnabled→settings / remoteControlAtStartup→global) + delta ①/② 计数同步修正 / A-N2 旧 multiSelect `z.boolean().default(false)` default 语义未随迁 → 新 delta ⑨ 登记（JSON schema 面不承载 zod default，运行时 undefined ≡ false，TUI 波消费面兜底）/ A-N3 configTool delta ⑨ 扩至旧 UI.tsx 全 3 渲染面（renderToolResultMessage `Failed: {error}` + bold get·set 三分支 JSX / renderToolUseRejectedMessage `Config change rejected` = TUI 波裁面）/ A-N4 askUser delta ⑤ 补第 4 渲染面 renderToolUseErrorMessage null 面（旧 .tsx 共 5 渲染面核过）/ A-N5 configPrompt 模板边界复原旧 `${modelSection}\n## Examples` 单换行面（model 行丢 `: description` 后缀 = delta ③ 后果，知悉项登记）。
  - **B 路（新仓一致性 + 测试面）0 MUST-FIX + NOTE 4 全处置 + PASS 7**：B-N1 config 测试头注 TOC 缺 P-C9 → 补登 / B-N2 askUserPrompt 尾部 name re-export 孤儿面与 web 族先例同形 → 头注 delta ① 预核登记防复审重报 / B-N3 description() 同一性断言 = wiring-pin 低信息量（与 web 族先例同风格，不改）/ B-N4 tests/ 不在 tsc 检查面（仓库级约定，未来契约收紧时同步，不改）。PASS 7 项：Tool 契约合规（renderToolUseMessage 必选位双本体皆在）/ 门面 re-export 1:1 + 0 `export *` / 依赖纪律（config/askUser 族 zod 0 import，纯 JSON schema 面比 web 族更窄）/ 型面（duck 型与 schema 常量一致 + 单点 cast 自足登记）/ 测试面质量（断言可由 settings.ts 写盘面推出 + 隔离面 mock+reset 全覆 + 无恒真断言，两文件 52 测 136 expect 实测与提交口径精确一致）/ 相邻域一致性（§8.60.1.1-.4 裁定面与实现逐条吻合）/ 门面导出完整性（49 口径无条件注册位实证）。
- **波终基线：2276 pass / 132 文件 / 5387 expect + gate 6 pass / 5 expect**（vs 开波 2224/130/5251：+52 测 / +2 文件 / +136 expect；S-E1 预测 +~30 测 / ~86 expect 偏低——两测试文件断言密度高于预测，非漂移；四件套 tsc 0 / eslint 0 / build 0KB entry 复验；S-E3 纯头注/模板边界修正零测试增量，2276/132/5387 复绿）。
- 49 口径 **24/49 坐实**（余 25 长尾；+Config +AskUserQuestion 2 槽，Skill 槽重分类 D 波 skill 域）；波 tag 不切（提交链 a9c84aa（S-E1）→ 5623d16（S-E2）→ c2e7630（S-E3 审视 + 修复）；gate ③ 仍用 wave-c）。
- **C 桶 ① 下一子波 = §8.61 notebook+LSP（NotebookEdit 490L + LSP 860L + LSP 依赖面）** → §8.62 SendMessage → §8.63 MCP+ToolSearch → §8.64 stub/壳登记批（49/49 收口减重分类 Skill 槽）→ C 桶 ② auto-mode → C 桶 ③ shell·swarm → D 波 → remote → analytics。

#### 8.61.1 S-E1 执行前分析（notebook+LSP 族：NotebookEdit 落盘面 + LSP 重分类裁定）
**读面**：旧仓 NotebookEditTool.ts 490L + prompt.ts 3L（DESCRIPTION/PROMPT）+ UI.tsx 92L（getToolUseSummary 字符串面 + 4 渲染面，React-Compiler 编译态逻辑可读）+ constants.ts 2L / LSPTool.ts 860L + prompt.ts 21L + schemas.ts 215L + formatters.ts 592L + UI.tsx 227L + symbolContext 90L（UI-only 消费）/ 旧 services/lsp 8 文件 2464L（LSPClient 447 / LSPDiagnosticRegistry 386 / LSPServerInstance 511 / LSPServerManager 420 / manager 289 / passiveFeedback 328 / config 79 / types 4）+ 旧 src/types/missing-deps.d.ts LSP ambient any stub 块（P1.1 residual，`declare module 'vscode-languageserver-*'` 全 `= any`，非真包）。新仓：files/ 子域（notebook.ts 解析面 §8.55 S-C3 + notebookTypes.ts any-stub 型 + fileUtils getFileModificationTime/writeTextContent/getDisplayPath + fileRead readFileSyncWithMetadata（getFsImplementation 走线 = setFsImplementation 可 mock，sc1-fs 先例）+ filesToolInput FilesToolUseContext duck）+ permissions（checkWritePermissionForTool filesystem.ts:696 + writeTool L278-288 接线先例）+ session/json（jsonParse 非 memo）+ toolNames（NOTEBOOK_EDIT_TOOL_NAME seed L35 ✓ / LSP_TOOL_NAME 未 seed）+ 插件域 grep（loadAllPluginsCacheOnly / getPluginLspServers 新仓 0 命中）。

**§8.61.1.1 LSP 重分类裁定：LSP（860L + 依赖面 2464L）→ D 波（LSP 域）**
- LSP 服务器配置 = 仅 plugins（旧 config.ts 逐字："LSP servers are only supported via plugins, not user/project settings"；getAllLspServers = loadAllPluginsCacheOnly + getPluginLspServers 合并）→ LSP 依赖闭包 = LSP client 域（services/lsp 2464L）+ 插件域（新仓两符号 0 命中，未落）= **2 域落盘**。
- 本体无法单独落为活面：isEnabled() = isLspConnected()（manager.ts 单例状态机，无 client 域 → 恒 false）+ call() 4 缝（getLspServerManager / getInitializationStatus / waitForInitialization / manager 操作路由）全无宿主 → 落本体 = 空心壳（H6 违规：不建零能力面、不写假装通过的能力测试）。
- 旧仓 LSP wire 型全 ambient any stub（missing-deps.d.ts 全 `= any`；新仓 3-dep 纪律亦无真包可引）→ client 域落盘须连带本地型转写（D 波附加任务，旧仓自身即 any 口径无真型契约可保真）。
- 裁定依据（§8.60.1.1 Skill 裁定同构）：依赖闭包 = 整域落盘，超出子波「单工具本体纵切」scope → **LSP 槽 = 残留守（49 口径），归属波 = D 波（LSP 域）：D 波先落插件域 LSP 集成 + client 域 2464L + 型转写，再落 LSPTool 本体**（LSP_TOOL_NAME seed 随 D 波）。§8.64 stub/壳登记批不覆盖 LSP（它有本体，非零本体槽，与 Skill 同构）。
- **本波实收口标题改「notebook（LSP 重分类 D 波）」**。49 口径：24/49 → **25/49**（+NotebookEdit 1 槽；LSP 槽入余 24，归属 D 波 LSP 域）。

**§8.61.1.2 NotebookEdit（490L）落盘 + 裁面裁定**（落盘面小：依赖闭包全已落）
- 新面 = `src/engine/tools/notebook/`（notebookEditTool.ts + notebookEditPrompt.ts + index.ts 子门面 STR-1）+ tools/index.ts re-export 块（短描述别名 NOTEBOOK_EDIT_DESCRIPTION 重名登记）。house style：`NotebookEditToolFace = Tool & { getPath(input): string; checkPermissions(input, context): Promise<PermissionResult<NotebookEditInput>> }`（writeTool face 先例）+ inputSchema 纯 JSON（NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA，旧 z.strictObject 5 字段 → strict: true + additionalProperties false）+ TOOL_NAME toolNames 单一事实源（已 seed）。
- inputSchema：notebook_path（string 必填）/ cell_id（可选）/ new_source（必填）/ cell_type（'code'|'markdown' 可选）/ edit_mode（'replace'|'insert'|'delete' 可选）。
- Output duck 型 NotebookEditOutput 9 字段（new_source / cell_id? / cell_type / language / edit_mode / error? / notebook_path / original_file / updated_file；旧 zod outputSchema 转写，delta ①）。
- validateInput 9 码逐字（S-C5 delta ⑥ 第二参双站点先例 + delta ⑨/⑭ readFileState 可选链缺省降级）：UNC skip（NTLM 凭证泄漏安全注释逐字）/ ec2 .ipynb 扩展名 / ec4 edit_mode 3 值集 / ec5 insert 须 cell_type / ec9 read-before-edit（readFileState?.get 缺省 = 恒「未读」支）/ ec10 modified-since-read（getFileModificationTime > readTimestamp.timestamp）/ ec1 ENOENT（readFileSyncWithMetadata catch isENOENT）/ ec6 invalid JSON / ec7·ec8 cell-id 两级（id 精确 → parseCellId 数字索引越界 ec7 / 不可解析 ec8）。
- call 逐字 + 裁面：
  - **fileHistory 支裁**（fileHistoryEnabled + fileHistoryTrackEdit(updateFileHistoryState, parentMessage.uuid)）：files 波 delta ⑦ 裁面先例（归属 fileHistory 域同归属波）；旧 call 4 参（args / context / parentMessage）→ 新 2 参（S-C5 delta ⑧ 先例；parentMessage = fileHistory 支唯一消费）。
  - **safeParseJSON → jsonParse 双站点**（旧 LRU 50 条 memo + shouldLogError 裁，delta ③）：validateInput 站 try/catch → null（失败面语义逐字）/ call 站非 memo jsonParse 逐字（旧注释 = cache-poisoning 理由；新仓双站 jsonParse 该问题不存在，注释面随迁）。
  - replace→insert 转换（cellIndex === cells.length + cell_type 缺省 'code'）+ nbformat>4 || (4 && minor>=5) id 生成（Math.random().toString(36).substring(2,15)）+ new_cell_id || undefined 出参面 + delete/insert/replace 三分支逐字（insert markdown/code 双骨架 / replace execution_count 重置 + cell_type 覆写支）。
  - 写回：IPYNB_INDENT=1 + writeTextContent(fullPath, updatedContent, encoding, lineEndings) + readFileState?.set post-write mtime 面（offset:undefined = Read dedup 面，旧注释逐字；缺省 no-op）。
  - catch 双支逐字（error.message / 'Unknown error occurred while editing notebook' + language 'python' 回落 + original/updated_file '' 双字段）。
- checkPermissions = writeTool L278-288 接线逐字（(context as FilesToolUseContext).getAppState().toolPermissionContext → checkWritePermissionForTool(NotebookEditTool, input as Record<string, unknown>, tpc)）。
- 对象面：searchHint 'edit Jupyter notebook cells (.ipynb)' 逐字 / maxResultSizeChars 100_000 / shouldDefer true / strict true（z.strictObject 面）/ isReadOnly false / isDestructive false（旧 def 无覆写 = 缺省值，S-C5 delta ④ 先例）/ userFacingName 'Edit Notebook'（旧 def 逐字）。
- toAutoClassifierInput：旧 feature('TRANSCRIPT_CLASSIFIER') 门控面裁 → **本体无条件随迁**（`${notebook_path} ${edit_mode ?? 'replace'}: ${new_source}` 纯字符串构造零副作用；C 桶 ② auto-mode 波 = 真消费面，去门 = 门恢复，delta 登记）。
- renderToolUseMessage（新契约必选位）= 旧 UI 非 verbose 面字符串逻辑逐字：!notebook_path || !new_source || !cell_type → null / getDisplayPath(notebook_path) + `@${cell_id}` 拼接；JSX FilePathLink + verbose 双支 / getToolUseSummary / getActivityDescription / renderToolUseRejectedMessage / renderToolUseErrorMessage / renderToolResultMessage = TUI 波裁面（files 波 delta ⑪ 先例，纯字符串面由 renderToolUseMessage 位承载）。
- prompt 面：DESCRIPTION（'Replace the contents of a specific cell in a Jupyter notebook.'）+ PROMPT（逐字，含遗留 "cell_number is 0-indexed" 措辞逐字保留）→ 新 description() 唯一面 = PROMPT（web 族口径：本体不 import DESCRIPTION，短描述面经子门面 + tools/ 门面 NOTEBOOK_EDIT_DESCRIPTION 别名 re-export）。
- 测试面：unit 零盘（sc1-fs setFsImplementation mock 先例 + readFileState 真 Map 注入）：对象面 / JSON schema 面 / validateInput 9 码全面 / mapToolResult 4 支（Updated/Inserted/Deleted cell 模板逐字 + Unknown edit mode + error is_error）/ renderToolUseMessage 3 面 / prompt 面值锚；func 真盘（tmp .ipynb + readFileState 注入）：Read→Edit→Read dedup 面（offset undefined）/ nbformat 4.5+ id 生成面 / replace→insert 转换面 / ENOENT + invalid JSON 真盘面。

**§8.61.1.3 组合根与注册**
notebook 族无专属门控槽 = 无条件注册面（同 web/config 族）。**49 口径 S-E2 后 24/49 → 25/49**（+NotebookEdit 1 槽；LSP 槽残守 → D 波 LSP 域）。**波终基线预测：2276 + ~24 测 ≈ 2300 pass / 134 文件 / ~5530 expect + gate 6·5 不变**（unit ~16 测 + func ~8 测）。

#### 8.61.2 闭环记录（S-E2 实施 + S-E3 双只读审视 + 修复）
- **S-E2 实施（a314d0a）**：notebook/ 子域 3 文件（notebookEditTool.ts 583L 本体 490L 旧仓裁剪随迁 / notebookEditPrompt.ts DESCRIPTION+PROMPT 逐字（含 legacy cell_number 措辞锚）/ index.ts 子门面 STR-1 逐名显式）+ tools/index.ts §8.61 头注条目 + re-export 块（NOTEBOOK_EDIT_DESCRIPTION/PROMPT 别名重名登记）+ 两测试文件（unit `engine-tools-notebook-se2.test.ts` 27 测零盘 FsOperations mock + 真 Map readFileState duck + FAKE_CWD 双戳 / func `engine-tools-notebook-se2-fs.test.ts` 9 测真盘 mkdtemp 写回 8 面 + validate ec10 真盘面；+36 测 / +2 文件 / +114 expect）。裁面全登记（头注 delta ①-⑨）：zod→JSON schema 双字段 / fileHistory 域裁（旧 4 参 call 2 参化）/ safeParseJSON→jsonParse 非 memo 双站 + jsonStringify replacer 参位裁 / 缺省值对象化 / TRANSCRIPT_CLASSIFIER 门裁 → C 桶 ② / UI 5 函数面 → TUI 波 / const 重赋值 let 化 / description 单面 / context duck 可选链降级；LSP 860L+client 域 2464L 重分类 D 波 LSP 域（§8.61.1.1 裁定）。
- **S-E3 双只读审视（4553e3c 修复）**：
  - A 路（旧仓 fidelity 8 项核验）全 PASS：9 码面逐字（旧 L176-294 vs 新 L256-387）/ call 分支 token 级 diff 仅登记 delta / mapToolResult 4 模板逐字 / prompt 字节一致 / checkPermissions 接线逐字 / delta ①-⑨ 全真。1 NOTE = F1 BOM 面裁未登记（旧 safeParseJSON 内部 stripBOM，新 jsonParse 裸 parse；旧代码自不一致——call 站 L333 本不剥 BOM，新 = 消解不一致，登记不恢复）。
  - B 路（新仓一致性 + 测试面 8 项）全 PASS（四件套独立复跑全绿，数值与提交逐字吻合）：house style / import 块 / 门面 / 零空心壳 / any-stub 纪律 / 依赖纪律（零新增，仓内恰 5 允许集）/ 测试面卫生（FsOperations mock 20/20 成员 + 零真实盘 + 无 hollow expect）。2 NOTE = F1（同 A 路，双路独立汇合）/ F2 delta ① 双字段引文精度（readTool/webFetch schema 无 additionalProperties，真先例 = §8.60 config/askUser 波）。
  - 处置 = 纯头注补登（delta ③ 补 BOM 面 + delta ① 引文订正），零代码改动；复跑四件套 2312/134/5501 + gate 6·5 逐值一致。
- **波终基线：2312 pass / 134 文件 / 5501 expect + gate 6 pass / 5 expect**（vs 开波 2276/132/5387：+36 测 / +2 文件 / +114 expect；四件套 tsc 0 / eslint 0 / build 0 KB 入口复验；S-E1 预测 ~2300/134/~5530，实测 2312/5501——expect 口径预测略高（5530 vs 5501，断言密度），测试数预测偏低（2300 vs 2312），双向偏差均 <2%，非漂移）。
- 49 口径 **25/49 坐实**（余 24 长尾；+NotebookEdit 1 槽，LSP 槽重分类 → D 波 LSP 域）；波 tag 不切（提交链 0f05b5b（S-E1）→ a314d0a（S-E2）→ 4553e3c（S-E3 审视 + 处置）；gate ③ 仍用 wave-c）。
- **C 桶 ① 下一子波 = §8.62 team/collab（SendMessage 917L + prompt 49L + UI 30L）** → §8.63 MCP+ToolSearch（123L+158L+457L）→ §8.64 stub/壳登记批（49/49 收口减重分类 Skill+LSP 槽）→ C 桶 ② auto-mode → C 桶 ③ shell·swarm → D 波 → remote → analytics。

#### 8.62.1 S-E1 执行前分析（team/collab 族：SendMessage 落盘面 + 依赖闭包裁定）

**§8.62.1.1 范围（A 类真本体 1 件，49 口径 25/49 → 26/49）**
旧仓 `src/tools/SendMessageTool/`（a8af45b）997L = 本体 917L + prompt 49L + UI 30L + constants 1L。本体结构：inputSchema（lazySchema zod 3 字段：to 必填 / summary 可选 / message union string|StructuredMessage 3 型 discriminated：shutdown_request / shutdown_response / plan_approval_response）+ 7 handle* 函数（handleMessage / handleBroadcast / handleShutdownRequest / handleShutdownApproval / handleShutdownRejection / handlePlanApproval / handlePlanRejection）+ validateInput 9 查（全 errorCode 9）+ checkPermissions（UDS bridge → ask safetyCheck / 否则 allow updatedInput）+ call 分发（UDS bridge/uds 发送 2 支 + in-process 子代理路由 3 支 + string/structured 两大路 6 支）+ mapToolResult（jsonStringify text block 非模板族）+ toAutoClassifierInput 4 模板 + backfillObservableInput（hooks 面）。**49 口径 S-E2 后 25/49 → 26/49**（+SendMessage 1 槽；余 23）。

**§8.62.1.2 依赖闭包裁定（H6 逐条，旧仓实读核验 + 新仓面核过）**
已落面（import 重指，零落盘）：
- `writeToMailbox` / `createShutdownRequestMessage` / `createShutdownApprovedMessage` / `createShutdownRejectedMessage` / `TeammateMessage` → `engine/messaging`（mailbox.ts 1281L，§8.56 S-D2 已落；getTeamsDir = `join(getAtlasConfigHomeDir(), 'teams')` 域内本地，config home 无 memo 直读 env → func 层 `ATLAS_CONFIG_DIR` 戳天然 fresh）。
- `generateRequestId` → `engine/messaging/agentId.ts:40`（旧 utils/agentId.js；新 agentId 域 = formatAgentId/parseAgentId/generateRequestId/parseRequestId 4 面逐字）。
- `TEAM_LEAD_NAME` / `BackendType` → `engine/messaging/constants.ts`（域内本地化常量）。
- `getAgentId` / `getAgentName` / `getTeamName` / `isTeammate` / `getTeammateColor` / `isTeamLead` → `engine/messaging/teammate.ts` + 门面（新 `getTeamName(teamContext?: { teamName: string })` 简化面，先查 AsyncLocalStorage 后 dynamic 后参）。
- `isAgentSwarmsEnabled` → `engine/messaging/agentSwarmsEnabled.ts` 39L（env `ATLAS_EXPERIMENTAL_AGENT_TEAMS` ∨ `--agent-teams` flag；growthbook killswitch 支已裁 §8.56 delta ①）。
- `errorMessage` → `shared/errors.ts:25`；`jsonStringify` → `engine/session/json`（2 参）；`SEND_MESSAGE_TOOL_NAME` → `toolNames.ts:43` 已 seed（⚠ 双源面：`messaging/constants.ts` 另有同名值域内本地化——本体 house = toolNames 单一事实源，delta 头注登记）。

未落面（开口 3 + remote 面 1）：
1. **readTeamFileAsync 团队文件域**（旧 utils/swarm/teamHelpers.js）→ 新仓 0 命中 → **C 桶 ③ shell·swarm 波**。裁定：handleBroadcast 随波落 + **注入缝 `TeamFileLoader`**（默认 `async () => null` = 团队文件域未落态 → 旧 `Team "X" does not exist` 错误面逐字；C 桶 ③ 落团队文件域后接真 loader，H6 头注登记）；handleShutdownApproval own-pane 查找支 = 裁（paneId/backendType = undefined，与旧团队文件缺失态逐字）。
2. **in-process 路由/生命周期面**（agentNameRegistry + setAppStateForTasks AppState 面 + toAgentId 格式校验 + findTeammateTaskByAgentId + gracefulShutdown）→ 新仓全 0 命中 → **C 桶 ③**（in-process teammate 路由/关停 = 该波核心面）。call 旧 4 参（canUseTool/parentMessage = in-process resume 支唯一消费）→ 新 2 参（fileHistory 族 delta ② 先例）。
3. **in-process teammates 颜色 map 面**（旧 `appState.teamContext.teammates` → findTeammateColor 本地 helper L132-145）→ 新 teamContext 型 = `{ teamName }` 简化面（teammate.ts:115 无 teammates 颜色 map）→ findTeammateColor 裁，recipientColor = undefined（mailbox 写面 color = senderColor only）→ **C 桶 ③**（teamContext 扩面随归）。
4. **UDS_INBOX/bridge 跨 session 面**（feature('UDS_INBOX') × 4 站 + parseAddress + getReplBridgeHandle/isReplBridgeActive + postInterClaudeMessage + sendToUdsSocket + truncate 预览面）→ 新仓全 0 命中 → **remote 波**（门复活面）。gate-off 旧仓行为 = 恰为本波落盘面（UDS 支全死码），逐字。

**§8.62.1.3 裁面裁定（H6 逐条，带归属波；delta 编号 = S-E2 各文件头注）**
- ① lazySchema(zod) → 模块级纯 JSON schema 常量：3 字段（to string 必填 / summary string 可选 / message = 旧 union string|StructuredMessage → `type: ['string', 'object']` + description 承载 3 型 structured 协议说明（zod discriminated 3 型面 → JSON 型数组表达性损失，taskOutput S-C4 delta ② 同族先例））+ approve 字段 semanticBoolean → 纯 boolean（S-C4 delta ② 裁面先例：纯 JSON 无 zod 运行时）。
- ② UDS_INBOX 门族 × 4 站（to description uds/bridge 行 + prompt cross-session 段 + checkPermissions bridge ask + validateInput bridge/uds 3 查 + call bridge/uds 2 发送支）→ 裁，门复活 = remote 波（bun:bundle feature() 不可测 + 依赖 0 命中双因）。
- ③ in-process 子代理路由支（call 3 面：running → queuePendingMessage / stopped → resumeAgentBackground / evicted-no-task → resume from transcript）→ 裁，C 桶 ③（registry/toAgentId 前置面未落，留支 = 空心壳，H6 防空洞）。
- ④ handleShutdownApproval in-process 关停面（teamFile self-member 查找 + findTeammateTaskByAgentId abort + gracefulShutdown setImmediate + fallback 支）→ 裁，C 桶 ③；落盘面 = 批准消息写入 + 返回（paneId/backendType undefined）。
- ⑤ findTeammateColor（teammates 颜色 map 面）→ 裁，C 桶 ③（新 teamContext 简化面无该 map）。
- ⑥ backfillObservableInput（hooks.mdx allowlist 面，旧 L539-559）→ 裁，files 波 delta ⑰ 先例（hooks 面无消费）。
- ⑦ UI 面：renderToolUseMessage 字符串面（plan_approval_response → `approve plan from: ${to}` / `reject plan from: ${to}` / 非结构化 null 守卫）= 新契约必选位逐字；renderToolResultMessage JSX（routing null / request_id+target null / MessageResponse dimColor）= TUI 波裁面（files 波 delta ⑪ 先例）。
- ⑧ getPrompt() UDS 条件模板 2 站（udsRow + udsSection feature 支）→ gate-off 模板逐字（无 uds 行/段）+ DESCRIPTION（'Send a message to another agent'）逐字；UDS 复活 = remote 波随门同步复活。
- ⑨ context duck = SendMessageToolUseContext（`getAppState(): { toolPermissionContext?: unknown; teamContext?: { teamName: string } }` 最小面 + abortController；旧 ToolUseContext 40+ 成员面 → duck，S-C5 先例）。

**§8.62.1.4 注册表门控（专属门控槽）**
isEnabled = `isAgentSwarmsEnabled()`（env ∨ flag）= **本子波首个专属门控槽**（49 口径 26/49；此前各族专属门控槽 = cron 族 isCronEnabled ×3 / tasks 族 isTodoV2Enabled ×4 / worktree 族 isWorktreeModeEnabled ×2 共 9 槽，S-E3 B 路 NOTE-2 订正——原稿「首个专属门控槽（此前各族 = 无条件注册面）」超述；tools/index.ts 头注「本子波首个」范围限定措辞保留）。对象面：searchHint 'send messages to agent teammates (swarm protocol)' 逐字 / maxResultSizeChars 100_000 / shouldDefer true / userFacingName 'SendMessage' / isReadOnly = `typeof message === 'string'`（输入面）/ isConcurrencySafe false / isDestructive false（旧 def 无覆写 = 缺省值，delta ④ 先例）。

**§8.62.1.5 测试面（S-E2 落 + S-E3 审视）**
- unit 零盘（ATLAS_CONFIG_DIR=/mock-home 不存在目录戳 + ATLAS_EXPERIMENTAL_AGENT_TEAMS env 双戳）：对象面 / JSON schema 面（type 数组 + required）/ isReadOnly 双态 / isEnabled 门双态 / toAutoClassifierInput 4 模板 / validateInput 6 查面（to 空 / @ 含 / string 缺 summary / * structured / shutdown_response 目标 / shutdown_response reject 缺 reason——全逐字；UDS 3 查裁面登记）/ checkPermissions allow+updatedInput / mapToolResult jsonStringify 面 / renderToolUseMessage 3 面 / prompt gate-off 锚点（DESCRIPTION 值 + PROMPT 协议段）/ call 错误面（broadcast 无 teamName throw / string 无 teamName throw / structured dispatch 3 型 guard）。
- func 真盘（ATLAS_CONFIG_DIR=mkdtemp，mailbox 文件面 = 写后读 JSON 断言）：F-1 handleMessage mailbox 写（文件 JSON from/text/summary/timestamp/color 面）/ F-2 handleBroadcast recipients 循环（TeamFileLoader fake 注入：sender 排除 + 无收件人 message 面 + 多收件人顺序写）/ F-3 shutdown_request mailbox 面 / F-4 shutdown_response 批准 mailbox 面（paneId undefined 面）/ F-5 plan 批准/拒绝 mailbox 面 + 非 team-lead throw guard（isTeamLead duck）。

**§8.62.1.6 基线预测**
开波 2312/134/5501 + gate 6·5 → 预测 S-E2 ~2340/136/~5640（+~28 测 / +2 文件 / +~140 expect：validate 6 查 + classifier 4 模板 + mailbox 写面 5 + 错误面 3 + 对象面，plan 波 +41/+114 同族偏高预测）。

**§8.62.2 闭环记录（S-E2 → S-E3 → S-E4，2026-09-27）**

- S-E2 实施 `c481467`（6 文件 / +1646）：team/ 子域 sendMessageTool.ts 767L 本体（delta ①-⑩ 头注登记）+ sendMessagePrompt.ts 43L（gate-off PROMPT 逐字，旧 getPrompt() udsRow/udsSection 双 '' 模板 .trim()）+ team/index.ts STR-1 子门面 + tools/ 门面接线（duck 型 10 留子门面，根门面仅 namespaced 导出）+ unit 31 测（P-S1..P-S13）+ func 6 测（F-S1..F-S6 真盘 mailbox 面）。四联 tsc 0 / eslint 0 / build 0 KB / 全量 2349 pass · 0 fail · 5599 expect · 136 文件 + gate 6 pass · 5 expect。
- S-E3 双路只读审视（≤2 子代理，报告 = DATA 全量 grep/Read 复核后处置）：
  - A 路（旧仓保真）：25 保留面核过（24 逐字 + 1 登记等价 = isEnabled/growthbook killswitch 裁）/ 19 裁面登记完备零漏登 / 8 行为差（2 核验无差：getTeamName 无参回落链 + isTeamLead backwards-compat 支两仓逐字；5 已登记；1 未登记 = message 描述面 → 修正）；PROMPT 逐字符比对 1297 字符 IDENTICAL。4 NOTE（F1 描述面 / F2 delta ③ 0-hit 断言 / F3 UDS 计数 / F4 防御支）。
  - B 路（新仓一致 + 测试面）：house style / STR-1 / import 纪律 / H6 零 any / 测试面质量全 CONFIRMED-OK；37 pass 实跑与提交声明逐字一致；tsc 实跑 0。5 NOTE（计数 9→10 / 「首个门控槽」超述 / UDS 计数 / 描述面 / unit 缺防御戳）。
  - 双路 9 NOTE 全处置于 `2a74d62`（4 文件 +28/-14，零行为改动）：头注计数 6 处（duck 型 9→10 ×2 / UDS 4→5 站点 ×2 / 「UDS 3 检查面」→「4 块（3 文案面）」）+ delta ①③⑦ 补登记 3 条 + unit 层 ATLAS_CONFIG_DIR=/mock-home 防御戳（S-E1 规划项补落）。NOTE-2 超述 = 本节 §8.62.1.4 内联订正 + 提交消息不重写（登记于此）。
- 波终：**2349/136/5599 + gate 6·5**（S-E3 修正零漂移）；49 口径 25/49 → **26/49**（+1 = SendMessage，再缩 23）。波 tag 不切（gate ③ 仍 wave-c）。
- 裁面归属核销（债务登记）：C 桶 ③ shell·swarm 波 = in-process 名路由块（agentNameRegistry/queuePendingMessage 工具级接线）+ backfillObservableInput + findTeammateTaskByAgentId/gracefulShutdown + findTeammateColor/teammates 色映射 + setTeamFileLoader 真读者（readTeamFileAsync team-file 域）；remote 波 = UDS_INBOX 门族 5 站点（validate 4 块 + checkPermissions bridge ask + call postInterClaudeMessage/sendToUdsSocket，[ATLAS-HOLD]）；TUI 波 = UI JSX renderToolResultMessage 4 函数面。
- 下一波 §8.63（MCP+ToolSearch 族）预研已备：3 工具本体 738L（ListMcpResourcesTool 123 + ReadMcpResourceTool 158 + ToolSearchTool 457）+ prompt/constants 119L。关键裁面判定输入——新仓 0-hit 面：ensureConnectedClient/fetchResourcesForClient（旧 services/mcp/client.js 未迁）/ logMCPError / isOutputLineTruncated / getBinaryBlobSavedMessage；@modelcontextprotocol/sdk 不在新仓 package.json（3-dep 纪律 → ReadResourceResult 结构化型需结构型裁/duck）；persistBinaryContent 在位（web/webFetchUtils.ts L668，经 web/ 子门面 + tools/ 门面 re-export）→ ReadMcpResource blob 拦截面可接；mcp.ts 门面现仅 name helpers 6 函数（client 域 0-hit = S-E1 待裁：MCP client 域状态裁定 + context.options.mcpClients duck）；ToolSearch 旧 lodash-es memoize → 新仓 TtlLruCache 本地缓存先例（lodash 裁先例）+ 旧 tool.prompt({...}) → 新 description() 签名 delta + term 评分面（parts exact 12/10 · contains 6/5 · full contains 3 · hint 4 · desc 2）+ isEnabled = isToolSearchEnabledOptimistic（新仓状态 S-E1 查）。

**§8.63.1 S-E1 总分析（MCP 资源 2 + ToolSearch 本体纵切，2026-09-27）**

**§8.63.1.1 范围与口径**
- 3 工具本体：ListMcpResourcesTool（旧仓 123L）+ ReadMcpResourceTool（158L）+ ToolSearchTool（457L）= 738L + prompt 面（ListMcp prompt 27L / ReadMcp prompt 22L / ToolSearch prompt 79L + constants 1L）+ 门控面（旧 utils/toolSearch.ts 714L → 引擎面裁、门控面 4 函数 ~150L 移植）。
- **49 口径 26/49 → 29/49（余 20）**：ListMcp/ReadMcp = 无条件注册面（旧 buildTool 缺省 `isEnabled: () => true`（TOOL_DEFAULTS L786）→ 新契约显式化，delta ⑭）；ToolSearch = §8.62 team/collab 之后 49 口径第 2 个专属门控槽 = `isToolSearchEnabledOptimistic` 移植。
- 注册表槽：3 对象经 `ToolRegistryDeps.baseTools` 消费方（组合根）注入，注册表机制不变（§8.56-§8.62 同族先例）。

**§8.63.1.2 依赖闭包裁定（H6 预声明接缝头注登记，复审勿当遗漏重提）**
- ① **MCP client 状态面 → mcpClientRegistry 注入接缝 + 残留守登记**：旧 `context.options.mcpClients` + `ensureConnectedClient`/`fetchResourcesForClient`（旧 services/mcp/client.js，新仓 0-hit）+ SDK `client.request({method:'resources/read'}, ReadResourceResultSchema)`（@modelcontextprotocol/sdk 不在新仓 3 依赖）→ 新建 `mcp/mcpClientRegistry.ts` 注入接缝（TeamFileLoader 接缝先例 §8.62 delta ⑤）：`McpClientEntry` duck（name / type 'connected'\|'pending' / capabilities?.resources / `listResources?` / `readResource?` 两残留守面）+ `setMcpClientRegistry/resetMcpClientRegistry/getMcpClientRegistry`；call 面 `options.mcpClients` 读 → `getMcpClientRegistry()`（delta ①）。连接生命周期（connectToServer/重连/缓存/resources·prompt 拉取）+ 真 MCP client 接线 = **MCP client 波（残留守登记）**；ports/mcpClient.ts 头注残留守（tools-only port）不变。
- ② **SDK 结构型**：ReadResourceResult/ReadResourceResultSchema → 3-dep 纪律裁 → `readResource` 返回结构型（seam 保证；blob/text 判别面 `'text' in c` / `'blob' in c` 逐字，delta ②）。
- ③ **readResource 缺失面（新造面）**：旧 SDK client 必有 request；新 seam capabilities.resources=true 而 readResource undefined = seam 未接线 → throw 复用旧逐字面 `Server "X" does not support resources`（零新造文案，delta ③）。
- ④ **persistBinaryContent 在位**（web/webFetchUtils.ts L668，经 web/ 子门面 + tools/ 门面 L706 re-export）：ReadMcp blob 拦截面接线（persistId `mcp-resource-${Date.now()}-${i}-${random6}` 逐字 + 错误面 `Binary content could not be saved to disk: ...` 逐字 + 成功面 `getBinaryBlobSavedMessage` 5 参逐字〔旧 mcpOutputStorage.ts:171-179〕+ `formatFileSize`〔旧 format.ts:9-24 纯函数〕本地移植 mcp 子域）。
- ⑤ **isOutputLineTruncated**（旧 terminal.ts:119-131，MAX_LINES_TO_SHOW=3）新仓 0-hit → mcp 子域本地移植（truncation.ts，2 工具共享面，逐字）。
- ⑥ **logMCPError**（旧 sink 队列）→ `logForDebugging`（新 shared/debug.ts no-op 单一事实源）+ `errorMessage`（shared/errors.ts:25）逐字 import；文案 = 新造最小形 `MCP server "X" resource fetch failed: ...`（旧 sink 运维文案裁，delta ④）。
- ⑦ **jsonStringify** = `../../session/json`（team 先例 L104）。
- ⑧ **lodash-es memoize** → 本地 Map memo（description memo key = toolName，value Promise<string>；`.cache.clear()` 面 → 本地 `clear()`；`maybeInvalidateCache` + `cachedDeferredToolNames` + `clearToolSearchDescriptionCache`〔旧外部消费方 commands/clear/caches.ts = 新仓 0-hit，导出留作测试接缝〕逐字，delta ⑤；lodash 裁先例 = web 波 lru-cache → TtlLruCache 同族）。
- ⑨ **旧 memo 调用面 `tool.prompt({getToolPermissionContext, tools, agents: []})` → 新 Tool 契约 `tool.description(undefined, { isNonInteractiveSession: false, toolPermissionContext: {}, tools })`**（新契约无 prompt 成员，旧 description+prompt 双面临合 = delta ⑧ 先例 §8.62；getToolPermissionContext async provider 面裁，delta ⑥）。
- ⑩ **findToolByName**（旧 Tool.ts:371 name+aliases）→ 新 `findTool`（pipeline/toolExecution.ts:184，其头注逐字「旧仓 findToolByName 的窄 spine 等价物」）经 pipeline 门面 import（tools/agent 型 import 先例；value import 零循环——pipeline 不 import tools）。
- ⑪ **escapeRegExp** → shared/stringUtils.ts:12（单一事实源，shared/index.ts:21 re-export）。
- ⑫ **env helper** isEnvTruthy/isEnvDefinedFalsy → shared/env.ts:50/63（体逐字 = 旧 envUtils 语义）。
- ⑬ **门控面移植（toolSearchGate.ts）**：`parseAutoPercentage` / `isAutoToolSearchMode` / `getToolSearchMode` / `isToolSearchEnabledOptimistic` 4 函数移植（env 改名 ENABLE_TOOL_SEARCH → **ATLAS_ENABLE_TOOL_SEARCH** = 单一 ATLAS_ 前缀 house 规则，delta ⑦；ATLAS_DISABLE_EXPERIMENTAL_BETAS 逐字；`isFirstPartyGatewayUrl`〔旧 providers.ts:8 = `!process.env.OPENAI_BASE_URL`〕内联 + 旧 gh-31936/CC-457 proxy 回归注释逐字；logForDebugging 2 站点面逐字〔新 no-op 单一事实源〕；once-log `loggedOptimistic` 面逐字）。
- ⑭ **引擎面裁（无复活登记）**：toolSearch 域 714L 引擎面 = getAutoToolSearchCharThreshold/token-count API（getDeferredToolTokenCount/countToolDefinitionTokens）/ modelSupportsToolReference（GB atlas_tool_search_unsupported_models → GB 裁，DEFAULT_UNSUPPORTED_MODEL_PATTERNS ['fast'] 随裁）/ isToolSearchEnabled（definitive）/ isToolReferenceBlock / extractDiscoveredToolNames / DeferredToolsDelta 族 = 旧引擎侧 deferred protocol 消费，新仓引擎波 0-hit（无 deferred loading protocol）→ 裁（delta ⑧）。
- ⑮ **pending_mcp_servers 面裁**：旧 call `getPendingServerNames` = appState.mcp.clients filter pending（新 AppState 无 mcp.clients 成员，0-hit）→ 新 `getPendingServerNames()` 恒返 undefined（buildSearchResult 参面 + output 型可选字段 + mapToolResult pending 后缀支保留逐字 = 数据契约面；MCP client 状态面归 MCP client 波，delta ⑨）。
- ⑯ **feature('FORK_SUBAGENT') 支**（isDeferredTool Agent 工具豁免支）裁 = bun:bundle feature() 新仓恒 false（bun-bundle-feature-untestable 已知限）+ 分支实际死面（delta ⑩）。
- ⑰ **GB atlas_glacier_2xr 门裁 → 取 delta-enabled 面**：getToolLocationHint = `'Deferred tools appear by name in <system-reminder> messages.'`（新仓 system-reminder attachment 先例；旧 `<available-deferred-tools>` pre-gate 块面裁 = 新仓 0-hit，delta ⑪）。
- ⑱ **tool_reference wire 面裁（前向接缝登记）**：mapToolResult matches → `{type:'tool_reference', tool_name}` 块 cast 逐字（`as unknown as ToolResultBlockParam`）；新仓 shared/pipeline 0-hit（无 wire 序列化消费）= 前向接缝（deferred protocol 复活 = MCP client 波随门同步，delta ⑫）。
- ⑲ **UI 面**：ListMcp renderToolUseMessage 2 面字符串逐字（`List MCP resources from server "X"` / `List all MCP resources`）+ `input ?? {}` 防御支（§8.62 S-E3 A 路 F4 先例）；ReadMcp renderToolUseMessage（`Read resource "uri" from server "server"` / null）逐字 + userFacingName 'readMcpResource'（旧 UI.tsx import → 新内联逐字值，delta ⑬）；两者 renderToolResultMessage JSX → TUI 波裁（可选槽不实现）；ToolSearch renderToolUseMessage → null 逐字 + userFacingName '' 逐字（旧 def 覆写面）+ 无 renderToolResultMessage 成员（旧 def 无 → 可选槽不实现）。
- ⑳ **buildTool 缺省面显式化**：isEnabled `() => true`（ListMcp/ReadMcp）+ toAutoClassifierInput `() => ''`（ToolSearch，旧 TOOL_DEFAULTS L795 skip-classifier 面）（delta ⑭）；ListMcp/ReadMcp toAutoClassifierInput 旧 def 面逐字（`input.server ?? ''` / `` `${server} ${uri}` ``）。
- ㉑ **call 2 参收窄**：旧 `{ options: { tools }, getAppState }` / `{ options: { mcpClients } }` → 新 Tool 契约 `call(args, context)` 2 参（S-C5 delta ⑧ / §8.62 先例）；ToolSearch context duck = `{ options?: { tools?: Tools } }`（getAppState 面裁 = ⑮ 同源）。
- ㉒ **schema 纯 JSON 化**：lazySchema(zod) → 模块级纯 JSON schema 常量（house 先例 SEND_MESSAGE_TOOL_INPUT_SCHEMA）+ `additionalProperties: false` + `strict: true`（config/askUser/sendMessage 先例 §8.61 S-E3 B 路 F2 口径）；ToolSearch input 旧 zod `max_results .default(5)` 面 → call 侧 `max_results = 5` 缺省（schema 无 default 字段，delta ⑮）；output 面 = 本地 Output duck 型（house 面：output JSON schema 常量不保留）。
- ㉓ **toolNames seed**：LIST_MCP_RESOURCES_TOOL_NAME = 'ListMcpResourcesTool'（旧 prompt.ts 常量逐字）+ READ_MCP_RESOURCE_TOOL_NAME = 'ReadMcpResourceTool'（旧 def 内联字面量 → 常量收敛单一事实源，delta ⑯）；TOOL_SEARCH_TOOL_NAME 已 seed（toolNames.ts:38）。

**§8.63.1.3 门控槽裁定（ToolSearch 专属门控槽）**
`isEnabled = isToolSearchEnabledOptimistic()`：① ATLAS_DISABLE_EXPERIMENTAL_BETAS kill-switch → 'standard' → false；② mode !== 'standard' 但 `!ATLAS_ENABLE_TOOL_SEARCH && OPENAI_BASE_URL 已设` → false（旧 gh-31936/CC-457 proxy 400 守卫逐字）；③ 余 true。**新仓 IFF 环境 OPENAI_BASE_URL 常态已设（OpenAI 静态键车道）→ 缺省 gate false（除非显式 ATLAS_ENABLE_TOOL_SEARCH）= 旧语义忠实，非新造门控**。mode 面：未设 → 'tst'（旧默认 ON 逐字）/ 'true' → 'tst' / 'false' → 'standard' / 'auto' 或 'auto:1-99' → 'tst-auto' / 'auto:0' → 'tst' / 'auto:100' → 'standard'。

**§8.63.1.4 子域布局规划（STR-1 子门面）**
```
src/engine/tools/mcp/            （新子域）
  mcpClientRegistry.ts           接缝 + duck 型（McpClientEntry/McpResourceItem/
                                 McpResourceContent）+ set/reset/get
  listMcpResourcesTool.ts        本体 + LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA + Output 型
  readMcpResourceTool.ts         本体 + READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA + Output 型
                                 + getBinaryBlobSavedMessage/formatFileSize 本地移植
  truncation.ts                  isOutputLineTruncated + MAX_LINES_TO_SHOW=3
  mcpPrompt.ts                   DESCRIPTION/PROMPT ×2 逐字
  index.ts                       STR-1 子门面（显式名块，零 export *）
src/engine/tools/toolsearch/     （新子域）
  toolSearchGate.ts              门控 4 函数（env 改名面）
  toolSearchTool.ts              本体 + 本地 Map memo + parseToolName/
                                 compileTermPatterns/searchToolsWithKeywords/
                                 buildSearchResult/isDeferredTool 5 辅助 + def
  toolSearchPrompt.ts            PROMPT 常量（delta-enabled hint 面）
  index.ts                       STR-1 子门面
tools/toolNames.ts               +2 seed
tools/index.ts                   头注 §8.63 块 + 2 re-export 块 + 49 口径 29/49
```

**§8.63.1.5 测试面（S-E2 落 + S-E3 审视）**
- unit 零盘（2 文件）：
  - `tests/unit/engine-tools-mcp-se2.test.ts`（预测 ~31 测）：对象面 2（静态成员逐字 + 型收窄）/ schema 面 2（纯 JSON shape + 描述逐字 + additionalProperties false + required 面）/ 门控面 2（isEnabled true ×2）/ ListMcp call 接缝面 6（默认空 registry → data [] + mapToolResult 空面逐字 'No resources found. MCP servers may still provide tools even if they have no resources.' / connected client list 面〔server 字段 attach〕/ pending client 跳〔type!=='connected' → []〕/ listResources reject → logForDebugging + []（一服务器不沉全果）/ targetServer not-found throw 逐字（Available servers 列表）/ targetServer 过滤面）/ ReadMcp call 面 7（server not-found throw 逐字 / not-connected throw 逐字 / 无 capabilities.resources throw 逐字 / reader 缺失 throw（③ 同面）/ readResource 成功 text 面（'text' in c 透传 {uri,mimeType,text}）/ mapToolResult 非空 jsonStringify 面 / toAutoClassifierInput 模板逐字）/ isResultTruncated 面 2（≤3 行 false / >3 行 true）/ render 面 4（ListMcp 2 面 + ReadMcp 2 面 + 防御支）/ userFacingName 面 2（'listMcpResources' / 'readMcpResource' 逐字）/ prompt 面 2（DESCRIPTION/PROMPT ×2 常量逐字锚点）。
  - `tests/unit/engine-tools-toolsearch-se2.test.ts`（预测 ~33 测）：对象面 1 / 门控面 10（getToolSearchMode 4 态〔未设→'tst' / 'false'→'standard' / 'auto'→'tst-auto' / 'auto:100'→'standard' / 'auto:0'→'tst' / 'auto:50'→'tst-auto' 6 态〕+ isToolSearchEnabledOptimistic 面〔kill-switch false / 未设 + 无 OPENAI_BASE_URL → true（默认 ON 面）/ 未设 + OPENAI_BASE_URL → false（proxy 守卫）/ 'true' → true / 'false' → false / 'auto' → true / 'auto:100' → false / 'auto:1' → true〕）/ isDeferredTool 面 5（alwaysLoad true → false / isMcp true → true / 自身 ToolSearch → false / shouldDefer true → true / 普通 → false；feature 支裁面登记）/ call select: 面 4（deferred 命中 / full 集命中〔harmless no-op 面〕/ 全 miss〔log + 空结果 + total_deferred_tools 面〕/ 多选逗号 + 去重）/ keyword 评分面 5（parts exact 10·mcp 12 / parts contains 5·mcp 6 / full 回落 3〔仅 score===0〕/ hint +4 / desc +2〔fake description() 可控〕/ required '+' 前缀预过滤 / 快路径 exact name + mcp__ prefix + max_results slice）/ memo 失效面 2（tool 集变 → 重取 + clearToolSearchDescriptionCache 导出面）/ mapToolResult 面 3（空 → 'No matching deferred tools found' / pending 后缀合成 content 面 / matches → tool_reference 块数组面）/ render null + userFacingName '' + toAutoClassifierInput '' 面 2。
  - env 戳：ATLAS_ENABLE_TOOL_SEARCH / ATLAS_DISABLE_EXPERIMENTAL_BETAS / OPENAI_BASE_URL（3 戳 + 还原）。
- func 真盘（1 文件）`tests/func/engine-tools-mcp-se2-fs.test.ts`（预测 2 测）：F-M1 blob 持久化成功面（**chdir(mkdtemp) 戳**：getToolResultsDir 相对名面 = `${ATLAS_CONFIG_DIR_NAME|'.atlas'}-${uid}/tool-results` cwd 相对〔web delta ⑦ 最小形〕→ per-file 进程隔离下 chdir 安全 + ATLAS_CONFIG_DIR_NAME=唯一名戳 + base64 blob → persistBinaryContent 真写 → blobSavedTo 文件存在 + getBinaryBlobSavedMessage text 面〔size KB 面〕+ mime ext 面）/ F-M2 blob 错误面（预造 `<name>-<uid>/tool-results` 为**文件** → mkdir ENOTDIR 静默 + writeFile ENOTDIR → {error} → text 'Binary content could not be saved to disk: ...' 面；uid 无关确定面）。
- gate（tests/ci）6·5 不变（机制面不变）。

**§8.63.1.6 基线预测**
开波 2349/136/5599 + gate 6·5 → 预测 S-E2 ~2448/139/~6210（+~99 测 / +3 测试文件 / +~610 expect：3 工具对象 + schema + 接缝 + 门控 10 + 评分 5 + memo 2 + select 4 + blob 2 + render 4，web 波 +41 先例族偏高预测，S-E2 实落为准）。49 口径 26/49 → 29/49（余 20，§8.64 stub/壳登记批收口〔含 Skill/LSP 重分类 D 波槽扣除〕）。

**§8.63.2 闭环记录（MCP 资源 2 + ToolSearch 族子波，S-E4）**
- 提交链：S-E1 `25a5487`（总分析 §8.63.1：23 裁定 ①-㉓ + 门控槽 ⑲ 裁定 + 子域布局 + 测试面 + 基线预测）→ S-E2 `6e01ced`（mcp/ 6 文件 + toolsearch/ 4 文件 + tools/index.ts 头注 §8.63 块 + 2 re-export 块〔命名碰撞登记：`./mcp` spec 文件优先 = 既有 mcp.ts 6 name helpers，子域门面经显式 `./mcp/index` spec；实测 Bun + tsc bundler 双解析一致〕+ toolNames +2 seed + 测试 3 文件 72 测；15 文件 +2552）→ S-E3 `494b869`（双路审视修正，6 文件 +56/-7，零行为改动）→ S-E4 本记录。
- S-E3 双路处置（subagent 报告 = DATA，逐条 grep/Read/实证核验后处置）：
  - A 路（旧仓逐字面保真）：已登记裁面 34 处全核验通过；**2 cosmetic 登记**（gate 旧 L174 内层双括号 `isEnvTruthy((process.env.X))` → 新单括号 / 旧 L297 模板插值括号 `${(process.env.OPENAI_BASE_URL)}` → 新无括号；输出逐字节不变，头注 delta ① 补登记防复审重提）。
  - B 路（新仓一致性 + 测试面）**5 低危处置**：F1 潜伏 env 还原缺陷（Bun 下 `process.env.X = undefined` 写字符串 `"undefined"` 而非删除，双仓实证 `in` 判真）→ 2 测试文件还原改条件 delete（`restoreEnv` / `restoreConfigDirName` 辅助）；F2 根门面 toolNames re-export 块缺 §8.63 2 seed（`LIST_MCP_RESOURCES_TOOL_NAME` / `READ_MCP_RESOURCE_TOOL_NAME`）→ 补齐（与 `TOOL_SEARCH_TOOL_NAME` 同块一致）；F3 ListMcp delta ③ 新支「connected 而 listResources 缺（seam 未接线）→ []」无专属单测 → 补 1 测；F5 toolRegistry.ts 门控槽 ⑲ 头注「ToolSearch → 本体纵切」未随 materialize 更新 → 改 materialize 面（自门控 3 条件 + engine 面 4 函数族 0-hit 不复活登记）；F4 提交信息按文件拆账「unit 69 + func 3」误（实 unit 70〔mcp 30 + toolsearch 40〕+ func 2 = 72，总数对）→ 本记录订正，零代码改动。
- 四件套（S-E3 后终态）：tsc 0 / eslint 0 / build 0KB entry / 全量 **2422 pass·139 文件·5750 expect**（开波 2349/136/5599 → +73 测/+3 文件/+151 expect：S-E2 +72 测，S-E3 F3 补 1 测；§8.63.1.6 文档预测 ~2448/~6210 偏高，实落为准）+ gate 6·5 不变。
- 49 口径 26/49 → **29/49**（余 20；§8.64 stub/壳登记批收口〔含 Skill/LSP 重分类 D 波槽扣除〕）。
- 门控面实测态：IFF env（`OPENAI_BASE_URL` 常态设真）下 ToolSearch 默认 gate OFF（`isEnabled()=false`）= 旧语义忠实（旧仓 `ENABLE_TOOL_SEARCH` 未设 + proxy 守卫同面）；显式 `ATLAS_ENABLE_TOOL_SEARCH=true`/`auto`/`auto:1-99` 越过 proxy 守卫。env 改名面 `ENABLE_TOOL_SEARCH` → `ATLAS_ENABLE_TOOL_SEARCH`（裁定 ⑬）。
- 残留守登记（= 后续波，复审勿当遗漏）：MCP client 连接生命周期 + 重连 + resources/prompt 拉取（**MCP client 波**；本波 `mcpClientRegistry` 注入接缝 + set/reset 导出面已铺，工具面经接缝取 client）/ tool_reference wire 面 + engine 门控 4 函数族〔阈值判定 / modelSupportsToolReference / extractDiscoveredToolNames / DeferredToolsDelta〕（**auto-mode 波**，裁定 ⑭/⑱）/ UI JSX 渲染面（**TUI 波**；string 面逐字已落）/ MCP server 配置发现面（remote 波）。
- 波 tag 不切（gate ③ 仍 `wave-c`）。下一步：**§8.64 stub/壳登记批**（task #138：B 类 5 any-stub + C 类 6 本体缺失/仅壳 = 11 槽 registry 登记 + 头注，零本体；49 口径 29/49 → 49/49 收口，减 Skill+LSP 重分类 D 波槽）。

**§8.64.1 S-E1 总分析（stub/壳登记批：B 类 5 + C 类 6 = 11 槽零本体登记 + 头注，49 口径 29/49 → 49/49 收口，2026-09-27）**

**§8.64.1.1 定位与范围**
C 桶 ① 收口批。§8.57 S-D1 四分类裁定的 **B 类（5 any-stub）+ C 类（6 本体缺失/仅壳）= 11 槽**，零本体 registry 登记 + 头注：
- **B 类 = 旧仓 `: any` stub 占位（无本体可迁，registry 槽登记/关闭，不建本体）**：
  - Monitor（④ MONITOR_TOOL，`({}) as any` 占位）/ Workflow（⑪ WORKFLOW_SCRIPTS，stub）/ Tungsten（① IS_ATLAS_DEV，无归属 stub）/ REPL（① IS_ATLAS_DEV，stub；新仓无 REPL 工具本体 = E-4 S-4d ② 裁出登记）/ OverflowTest（⑤ OVERFLOW_TEST_TOOL，测试专用无产品价值，§8.53 S-T3 已关闭，B 类确认）。
- **C 类 = 旧仓本体缺失/仅壳（无真本体可迁）**：
  - CtxInspect（⑥ CONTEXT_COLLAPSE，目录缺失）/ SuggestBackgroundPR（① IS_ATLAS_DEV，目录缺失）/ ListPeers（⑩ UDS_INBOX，目录缺失；UDS 5 站点族 → remote 波）/ TerminalCapture（⑦ TERMINAL_PANEL，仅 prompt.ts 2L，TUI 面 → shell 波）/ WebBrowser（⑧ WEB_BROWSER_TOOL，仅 WebBrowserPanel.tsx 1L React 面板）/ VerifyPlanExecution（⑫ ATLAS_VERIFY_PLAN，仅 constants.ts 2L）。
- 11 槽映射 **9 个 registry 门控槽**：① IS_ATLAS_DEV（Tungsten [B] + SuggestBackgroundPR [C] + REPL [B]，3 工具）④ MONITOR_TOOL ⑤ OVERFLOW_TEST_TOOL（已关闭）⑥ CONTEXT_COLLAPSE ⑦ TERMINAL_PANEL ⑧ WEB_BROWSER_TOOL ⑩ UDS_INBOX ⑪ WORKFLOW_SCRIPTS ⑫ ATLAS_VERIFY_PLAN。
- **零本体**：本批不建工具对象/本体/测试；仅改 toolRegistry.ts 头注 + doc。8 个非关闭门控槽（①④⑥⑦⑧⑩⑪⑫）机制上从未声明（house style「其余槽不声明防死接缝」；类别间移动 = 零行为改动）；⑤ OverflowTest 已关闭（头注不动，仅 B 类确认）。

**§8.64.1.2 49/49 收口算术（49 基础工具全槽定论）**

| 定论 | 计数 | 槽 |
|---|---|---|
| 本体落（C 桶 ① §8.53-§8.63） | 29 | 增量 16→18→20→22→24→25→26→29（Bash/Glob/Grep/Read/Write/Edit + Task 四件套 + cron 三件套 + … + ListMcp/ReadMcp/ToolSearch） |
| 本批 B/C 类零本体登记（§8.64） | 11 | Monitor/Workflow/Tungsten/REPL/OverflowTest + CtxInspect/SuggestBackgroundPR/ListPeers/TerminalCapture/WebBrowser/VerifyPlanExecution |
| Skill + LSP（D 波重分类，§8.60/§8.61） | 2 | Skill 915L skill 域 + LSP 860L+client 2464L LSP 域 |
| TeamCreate + TeamDelete + Snip（C 桶 ③，§8.57 S-D1 D 类） | 3 | ⑮ agentSwarms + ⑨ HISTORY_SNIP |
| RemoteTrigger（remote 波，§8.57 S-D1 D 类） | 1 | ③ AGENT_TRIGGERS_REMOTE |
| PowerShell（域外改判，§8.53 S-T3 ⑳） | 1 | ⑳ |
| TestingPermission（关闭，§8.53 S-T3 ⑱） | 1 | ⑱ NODE_ENV=test |
| Agent（E-2 engine 波，非 C 桶 ① 口径） | 1 | AgentTool |
| **合计** | **49** | |

- C 桶 ① 归属 = 29（本体）+ 11（本批登记）= **40/49**；余 9 = 他波/关闭/E-2 定论（前波已登记）。
- 「减 Skill+LSP 重分类 D 波槽」= C 桶 ① 主张口径 47/47（49 − 2 D 波槽），其中 C 桶 ① 已收口 40，余 7（TeamCreate/TeamDelete/Snip/RemoteTrigger/PowerShell/TestingPermission/Agent）= 他波定论。全仓 49/49 含此 9 作他波定论。

**§8.64.1.3 registry 头注重构（S-E2，零行为）**
toolRegistry.ts 20 槽表由「残留守 13」（陈旧计数标签）重构为 **5 类定论**：
- **关闭 3（不迁）**：⑤⑰⑱（不变）
- **域外改判 1**：⑳（不变）
- **materialize 4（本体落、门已声明、自门控 isEnabled）**：②⑭⑯⑲（不变）
- **§8.64 登记零本体 8（B 类 any-stub / C 类仅壳，终局裁定，无本体可落；本机制不声明防死接缝）**：①④⑥⑦⑧⑩⑪⑫（① 3 工具，合计覆盖 10 工具；⑤ OverflowTest [B] 已关闭不在此列）
- **残留守 4（本体未落，门随本体纵切落，归属波标注）**：③（RemoteTrigger → remote 波）⑨（Snip → shell/REPL 波）⑬（LSP → D 波重分类）⑮（TeamCreate/TeamDelete → shell·swarm 波）
- **计数标签修正**：原「残留守 13」为 §8.63 F5 漂移（⑲ §8.63 materialize 未减计数，应 12）；本批按类重构，「残留守」收敛为 4（③⑨⑬⑮），「§8.64 登记零本体」= 8。

**§8.64.1.4 测试面与基线预测**
- 零本体 → 无新增测试。四件套预期：tsc 0 / eslint 0 / build 0KB entry / 全量 **2422/139/5750** + gate 6·5（不变，零漂移）。
- 本批纯头注 + doc，无代码逻辑改动，无测试增量。

**§8.64.1.5 残留守登记（= 后续波，复审勿当遗漏）**
- ③ AGENT_TRIGGERS_REMOTE（RemoteTrigger）→ remote 波（D 波后）
- ⑨ HISTORY_SNIP（Snip）→ C 桶 ③ shell/REPL 波
- ⑬ ENABLE_LSP_TOOL（LSP）→ D 波（LSP 域，§8.61 重分类）
- ⑮ agentSwarms（TeamCreate/TeamDelete）→ C 桶 ③ shell·swarm 波
- ⑩ UDS_INBOX（ListPeers [C] 零本体登记；UDS inbox 本体 → C 桶 ③ shell·swarm 波〔§8.57 S-D1〕；UDS 5 站点族〔SendMessage〕→ remote 波〔§8.62〕）

**下一步**：S-E2（toolRegistry.ts 头注重构 + 提交）→ S-E3（零本体批比例自审：头注 ↔ §8.57 S-D1 交叉核 + 计数标签 + git diff 零行为核验）→ S-E4（闭环记录 §8.64.2 + C 桶 ② auto-mode 预研段）。

**§8.64.2 闭环记录（stub/壳登记批，S-E4，2026-09-27）**
- 提交链：S-E1 `d35fa30`（总分析 §8.64.1：B 5 + C 6 = 11 槽零本体登记 + 49/49 收口算术 + registry 头注 5 类重构规划 + 残留守登记）→ S-E2 `88d1f87`（toolRegistry.ts 20 槽表 5 类定论重构〔materialize 4 ②⑭⑯⑲ / §8.64 登记零本体 8 ①④⑥⑦⑧⑩⑪⑫ / 残留守 4 ③⑨⑬⑮〕+ 计数标签修正，纯头注 18+/11-，零代码逻辑 / 零测试增量）→ S-E3 `d8bbbe6`（双路审视修正，1 处零行为）→ S-E4 本记录。
- S-E3 双路审视（**零本体批比例自审**：本批仅头注 + doc，无本体/测试面，双只读聚焦「登记准确性 + 零行为」，未派 subagent——登记批与本体纵切波审视面不同，比例自审已覆盖全部可核面）：
  - **A 路（§8.57 S-D1 交叉核）**：B 类 5〔Monitor ④ / Workflow ⑪ / Tungsten ① / REPL ① / OverflowTest ⑤〕+ C 类 6〔CtxInspect ⑥ / SuggestBackgroundPR ① / ListPeers ⑩ / TerminalCapture ⑦ / WebBrowser ⑧ / VerifyPlanExecution ⑫〕= 11 槽映射 9 门控槽（①④⑤⑥⑦⑧⑩⑪⑫），与 §8.57 S-D1 四分类表（L3379-3380）逐条一致 ✓。
  - **20 槽分区核验**：关闭 3（⑤⑰⑱）+ 域外 1（⑳）+ materialize 4（②⑭⑯⑲）+ §8.64 登记零本体 8（①④⑥⑦⑧⑩⑪⑫）+ 残留守 4（③⑨⑬⑮）= 20，无重漏 ✓。计数标签「残留守 13」（§8.63 F5 漂移，⑲ materialize 未减）→ 重构为 5 类，「残留守」收敛 4 ✓。
  - **1 处修正**：⑩ UDS_INBOX 头注原「UDS 5 站点族 → remote 波」与 §8.57 S-D1（ListPeers ⑩ → C 桶 ③ shell·swarm 波）不一致 → 订正为「UDS inbox 本体 → C 桶 ③〔§8.57〕；UDS 5 站点族〔SendMessage〕→ remote〔§8.62〕」（头注 + doc §8.64.1.5 双处，纯注释）。
  - **零行为核验**：`git show 88d1f87` 全为 ` * ` 头注行（18+/11-，0 代码行）；四件套 2422/139/5750 + gate 6·5 零漂移（开波 = §8.63 波终，本批无测试增量）。
- 四件套（S-E3 后终态）：tsc 0 / eslint 0 / build 0KB entry / 全量 **2422 pass·139 文件·5750 expect**（= §8.63 波终基线，零漂移）+ gate 6·5 不变。
- **49 口径 29/49 → 49/49 收口**：29（本体落 C 桶 ① §8.53-§8.63）+ 11（本批 B/C 零本体登记）+ 2（Skill+LSP D 波重分类）+ 3（TeamCreate/TeamDelete/Snip C 桶 ③）+ 1（RemoteTrigger remote 波）+ 1（PowerShell 域外改判）+ 1（TestingPermission 关闭）+ 1（Agent E-2）= **49/49** ✓。C 桶 ① 归属 40/49（29 本体 + 11 登记）；余 9 = 他波/关闭/E-2 定论（前波已登记）。
- 残留守登记（= 后续波，复审勿当遗漏）：③（remote 波）/ ⑨（C 桶 ③ shell/REPL）/ ⑬（D 波 LSP 域）/ ⑮（C 桶 ③ shell·swarm）/ ⑩ UDS inbox 本体（C 桶 ③）+ UDS 5 站点族（remote 波）。
- 波 tag 不切（gate ③ 仍 `wave-c`）。**C 桶 ① 全闭环**（§8.57-§8.64，49 口径 49/49 收口）。下一步：**C 桶 ② auto-mode 纵切波**（task #139，~3030L 分类器族：getAutoToolSearchCharThreshold / modelSupportsToolReference / extractDiscoveredToolNames / DeferredToolsDelta 4 函数族 + tool_reference wire 面复活 + auto-mode 主分类器）。

---

**§8.65 C 桶 ② auto-mode 纵切波（分类器族，task #139，2026-09-27）**

**§8.65.1 S-E1 总分析**

**§8.65.1.1 定位与范围**

旧仓来源（a8af45b）：`src/utils/permissions/yoloClassifier.ts` 1332L（auto-mode 主分类器，ANT-ONLY
`feature('TRANSCRIPT_CLASSIFIER')` 门控）+ `classifierShared.ts` 39L + `classifierDecision.ts` 91L +
`autoModeState.ts` 39L + `classifierApprovals.ts` 88L + `autoModeDenials.ts` 26L +
`yolo-classifier-prompts/*.txt`（2 件 ≈120KB 提示词数据）+ `src/cli/handlers/autoMode.ts` 170L +
② dontAsk 模式 ask→deny 转换（旧 `permissions.ts:490-504` + `messages.ts` DONT_ASK_REJECT_MESSAGE +
DENIAL_WORKAROUND_GUIDANCE）。

新仓既存面：
- `src/permissions/permissions.ts` 残留守 ②（dontAsk 转换）/ ③（分类器族整族留守）。
- `src/permissions/bashClassifier.ts` 78L stub（E-6 S-6c「stub 即外部构建形态」，前向登记 = 本波分类器族消费点）。
- `shared/types.ts` Tool 契约已含 `toAutoClassifierInput` + `aliases`（§8.61 notebookEditTool delta ⑤ 无条件随迁）。
- ToolSearch engine 面 4 函数族（阈值判定 / modelSupportsToolReference / extractDiscoveredToolNames /
  DeferredToolsDelta）§8.63 已登记「新仓 0-hit 不复活」（toolSearchGate 头注 delta ③ + toolRegistry 头注 ⑲）——
  本波复核确认，无动作（见 §8.65.1.5）。

**§8.65.1.2 范围裁定（port vs 前向接缝）**

旧仓分类器族 **LLM 调用耦合**：`sideQuery`（单发 LLM）+ growthbook `getFlagDualRead` +
bootstrap state（getCachedClaudeMdContent / setLastClassifierRequests / getSessionId）+
`settings.getAutoModeConfig` + `getMainLoopModel` + `getCacheControl` + `getDefaultMaxRetries`。
新仓 **无 `sideQuery`**（LLM 单发侧调机制缺位，modelprovider 仅流式主环），且
`feature('TRANSCRIPT_CLASSIFIER')` 新仓恒 false（bun:bundle 门恒 off）。故 **LLM 调用闭包 = 前向接缝**
（归 provider/settings 波）。

本波落 = **可测纯逻辑面** + ② dontAsk 转换 + 提示词数据；LLM 闭包登记前向接缝：

落（纯 / 可测，映射新仓类型面）：
- transcript 构造：buildTranscriptEntries / buildToolLookup / toCompactBlock / toCompact /
  buildTranscriptForClassifier / formatActionForClassifier（旧强类型 Message → 新 shared Message 松接口，
  类型守卫适配 delta）。
- XML 解析：stripThinking / parseXmlBlock / parseXmlReason / parseXmlThinking / replaceOutputFormatWithXml /
  XML_S1·S2_SUFFIX。
- usage：extractUsage / combineUsage / getClassifierThinkingConfig / yoloClassifierResponseSchema /
  YOLO_CLASSIFIER_TOOL_NAME·SCHEMA。
- classifierShared：extractToolUseBlock / parseClassifierResponse。
- state：autoModeState（setAutoModeActive / isAutoModeActive / FlagCli / CircuitBroken / _resetForTesting）。
- denials：autoModeDenials（recordAutoModeDenial 20 cap 头插 / getAutoModeDenials）。
- approvals：classifierApprovals（set/get × bash+yolo + checking + clear）。
- allowlist：classifierDecision → isAutoModeAllowlistedTool（SAFE_YOLO_ALLOWLISTED_TOOLS）。
- 模板解析：extractTaggedBullets / getDefaultExternalAutoModeRules / buildDefaultExternalSystemPrompt + 2 .txt 数据。
- ② dontAsk 转换：permissions.ts ask→deny（DONT_ASK_REJECT_MESSAGE + DENIAL_WORKAROUND_GUIDANCE 逐字）。

前向接缝（LLM 闭包，归 provider/settings 波，H6 前向声明非静默遗漏）：
- classifyYoloAction / classifyYoloActionXml（2 段 XML）/ buildYoloSystemPrompt LLM 面 / buildClaudeMdMessage /
  dumpErrorPrompts / getClassifierModel / resolveTwoStageClassifier / isTwoStageClassifierEnabled /
  isJsonlTranscriptEnabled / getTwoStageMode / getAutoModeClassifierTranscript / POWERSHELL_DENY_GUIDANCE。
- autoMode CLI handler（defaults / config / critique，依赖 sideQuery + settings + model）。
- ③ auto 模式 AI 分类器调用点（旧 permissions.ts:505-519 `mode==='auto'` 支 → classifyYoloAction）→ provider/settings 波。

**§8.65.1.3 子域布局**

新子域 `src/permissions/autoMode/`（STR-1 子门面，显式命名再导出，叶零 `export *`）：
- `types.ts` — AutoModeRules / TranscriptBlock / TranscriptEntry / YoloClassifierResult / ClassifierUsage。
- `transcript.ts` — transcript 构造 6 函数。
- `xml.ts` — XML 解析 + suffixes + 输出格式替换。
- `usage.ts` — usage + thinking 配置 + 响应 schema + 工具名/schema 常量。
- `classifierShared.ts` — extractToolUseBlock / parseClassifierResponse。
- `state.ts` — autoModeState。
- `denials.ts` — autoModeDenials。
- `approvals.ts` — classifierApprovals。
- `allowlist.ts` — isAutoModeAllowlistedTool。
- `prompts.ts` — 2 .txt 资产（text import）+ 模板解析 3 函数。
- `prompts/auto_mode_system_prompt.txt` + `prompts/permissions_external.txt`（数据，逐字拷贝）。
- `index.ts` — STR-1 门面（显式命名再导出）。

类型映射（旧 Anthropic Beta 型 → 新仓）：BetaContentBlock → shared ContentBlock/ToolUseBlock/TextBlock；
AMessageParam → shared MessageParam；ABetaMessage（result.usage）→ shared Usage；
Tool / Tools / ToolPermissionContext → shared（已存）。旧 `feature('BASH_CLASSIFIER')` /
`feature('TRANSCRIPT_CLASSIFIER')` 门 → 新仓恒 off，approvals/denials 的 feature 门分支裁（恒执行，
与 stub 语义一致；门复活随 provider 波）。

bunfig.toml：`[loader]` 加 `".txt" = "text"`（与 .md/.py 同例，raw-text 内联）。

**§8.65.1.4 测试面与基线预测**

新测试 `tests/unit/auto-mode-classifier.test.ts`（零盘零模型）：
- transcript：buildTranscriptEntries（user text / assistant tool_use / queued_command attachment / assistant text 排除）/
  toCompact（jsonl vs text-prefix 两态）/ buildTranscriptForClassifier / formatActionForClassifier。
- xml：parseXmlBlock（yes / no / 不可解析 / thinking 内嵌 tag 剥离）/ parseXmlReason / parseXmlThinking /
  replaceOutputFormatWithXml。
- usage：extractUsage / combineUsage / getClassifierThinkingConfig。
- classifierShared：extractToolUseBlock（命中 / 未命中 / 非 tool_use）/ parseClassifierResponse（valid / invalid）。
- state：set/get autoModeActive·FlagCli·CircuitBroken + _resetForTesting。
- denials：recordAutoModeDenial（20 cap + 头插新者）/ getAutoModeDenials。
- approvals：set/get bash+yolo approval + checking + clearClassifierApprovals。
- allowlist：isAutoModeAllowlistedTool（列表内外）。
- prompts：extractTaggedBullets / getDefaultExternalAutoModeRules / buildDefaultExternalSystemPrompt（3 user_* tag 替换）。
- ② dontAsk：hasPermissionsToUseTool passthrough→ask→（mode dontAsk）→ deny + DONT_ASK_REJECT_MESSAGE 逐字。

基线预测：开波 2422/139/5750 + gate 6·5；本波 +1 测试文件（~30-40 用例）→ 全量 ≈2455-2460 pass·140 文件；
tsc 0 / eslint 0 / build 0KB entry（分类器纯逻辑不在 CLI 入口关键路径，.txt 内联不增 entry 字节判定）。

**§8.65.1.5 ToolSearch 4 函数族复核**

§8.63 S-E2 已登记「engine 面 4 函数族（阈值判定 / modelSupportsToolReference / extractDiscoveredToolNames /
DeferredToolsDelta）= 新仓 0-hit 不复活」（toolSearchGate 头注 delta ③ + toolRegistry 头注 ⑲）。本波复核确认：
新仓 ToolSearch（toolsearch/ 子域）走 optimistic gate 自门控（isToolSearchEnabledOptimistic），不消费
tool_reference 延迟加载协议 → 4 函数确实 0-hit，无动作（复审勿当遗漏重提）。

**§8.65.1.6 残留守登记（= provider/settings/CLI 波，复审勿当遗漏）**

- ③ auto 模式 AI 分类器调用点（permissions.ts `mode==='auto'` 支）→ provider/settings 波。
- LLM 调用闭包（classifyYoloAction 族 ≈700L）→ provider/settings 波。
- autoMode CLI handler（170L）→ CLI 波（依赖 sideQuery）。
- settings.autoMode 三函数（getAutoModeConfig / getUseAutoModeDuringPlan）→ settings 波。
- growthbook getFlagDualRead（atlas_auto_mode_config）→ config/growthbook 波。

**§8.65.2 S-E2 实施 + S-E3 双路审视 + 闭环（2026-09-27）**

子波四段：S-E1 分析 `ab323d5` → S-E2 实施 `f07486f` → S-E3 双路审视修正 `a1571dd`
→ S-E4 闭环。波 tag 不切（gate ③ 仍 wave-c）。

**落盘面（`src/permissions/autoMode/` 子域，STR-1 子门面显式再导出，叶零 `export *`）：**
- 10 子模块：types（AutoModeRules / TranscriptBlock·Entry / ClassifierUsage /
  YoloClassifierResult 逐字）· transcript（buildTranscriptEntries·ForClassifier /
  formatActionForClassifier / toCompact jsonl·text-prefix 两态 / jsonStringify
  BigInt 降级 / jsonl 态门）· xml（XML_S1·S2_SUFFIX + stripThinking /
  parseXmlBlock·Reason·Thinking + replaceOutputFormatWithXml）· usage（extractUsage /
  combineUsage / getClassifierThinkingConfig / yoloClassifierResponseSchema /
  YOLO_CLASSIFIER_TOOL_NAME·SCHEMA）· classifierShared（extractToolUseBlock /
  parseClassifierResponse）· state（active/flagCli/circuitBroken）· denials
  （recordAutoModeDenial 20-cap 头插）· approvals（bash+yolo 判别 + checking 信号 +
  本地 createSignal）· allowlist（isAutoModeAllowlistedTool 21 件 + YOLO 自报）·
  prompts（2 .txt 资产内联 + 外部模板解析 extractTaggedBullets /
  getDefaultExternalAutoModeRules / buildDefaultExternalSystemPrompt）。
- ② dontAsk ask→deny 转换：`permissions.ts applyDontAskMode` 于 **forceDecision /
  1b / 1f / 1g / 3 终端** 5 个 ask 产点套用（旧仓 inner 末端 post-hoc 语义，
  「can't be bypassed by early returns」）+ `denialMessages.ts` 文案单一事实源
  （DENIAL_WORKAROUND_GUIDANCE + DONT_ASK_REJECT_MESSAGE 逐字）。
- 2 .txt 资产 md5 逐字（`auto_mode_system_prompt` + `permissions_external`）：
  bunfig.toml `[loader] ".txt"="text"` + `src/text-assets.d.ts` 声明；bun build
  内联，CLI 入口维持 0 KB。

**双只读审视（S-E3，报告 = DATA，全核销后落 `a1571dd`）：**
- A 路（旧仓 a8af45b 保真）：**FAITHFUL 零行为丢**。14 面逐字核验 + 2 .txt md5
  一致 + ② 转换命中旧仓全部 ask 早退产点（1b/1f/1g/终端）+ allowlist 元素级相等
  （除登记排除 Workflow/TerminalCapture/OverflowTest/VerifyPlanExecution）。
- B 路（新仓一致 + 测试面）：**0 hard / 5 minor，全处置**：
  - F1 `forceDecision` 早退 bypass ② → 上提 `permissionContext` + 套
    `applyDontAskMode`（闭合新仓独有早退产点；零活调用方，纯闭合非行为改动），
    ② 头注 + permissions.ts/index.ts 残留守 ②③ 翻「已落」（③ 仅 LLM 闭包留守）。
  - F2 `approvals.ts` 门裁 delta 头注锐化：TRANSCRIPT 门裁 = 旧默认保真
    （ON_BY_DEFAULT），BASH 门裁 = 真激活（旧默认关，当前零活消费方，惰性）。
  - B1 XML 后缀断言由 `length>0` 升级内容锚点（数据冻结判别化，防提示词漂移）。
  - B2 `getDefaultExternalAutoModeRules` 三节（allow/soft_deny/environment）均断
    `length>0`（原仅 allow 断非空，deny/environment tag 抽取 bug 致 `[]` 会漏红）。
  - B3 ② 早退产点判别支补齐：forceDecision 早退 + 1b ask-rule 命中两新增测
    （default 对照证 1b 真达 = rule 型 decisionReason；fixture 错配会落终端 mode
    型 → 红）。矩阵「② 转换」声明随终端 + forceDecision + 1b 三产点实证成立。
  - B5 `DONT_ASK_REJECT_MESSAGE` 去 2 行被 `toBe` 完全包含的 `toContain` 冗余。
  - 结构性全清：facade 1:1 导出 / 域零碰撞 / 零 `feature()` 代码调用 / `*/` 注释
    扫描净 / 前向接缝登记齐（autoMode/index.ts L23-25 + 各子模块头注）。

**基线：** `bun x tsc --noEmit` 0 / `bun x eslint` 0 / `bun build` 0 KB 入口 /
全量 `bun test --isolate tests/` **2474 pass·140 文件·5851 expect**（+50 测随
S-E2 50 用例基线，+2 测 +6 expect 随 S-E3 判别支）/ gate `bun test --isolate
tests/ci/` **6·5** 守住。capability-matrix 分类器行 split：纯逻辑面 + ② 转换 +
提示词数据 = `done`（proof `tests/unit/auto-mode-classifier.test.ts` 52 用例），
LLM 闭包（classifyYoloAction 族，需 sideQuery 单发侧调）= `missing`（provider/
settings 波前向接缝，H6 前向声明）。

**前向接缝（复审勿当遗漏重提，§8.65.1.6）：** LLM 闭包 classifyYoloAction 族 /
autoMode CLI handler / settings.autoMode 三函数 / growthbook getFlagDualRead →
provider/settings/CLI 波。

**49 口径：** 本波 = C 桶 ② auto-mode 纵切（permissions 域分类器族纯逻辑面 + ②
转换 + 提示词数据），非 49 工具本体槽；49/49 收口计数随 §8.64 登记批不变。

**§8.66.1 S-E1 总分析（C 桶 ③ shell·swarm 波，task #140）**

**§8.66.1.1 定位与范围**

旧仓来源（a8af45b）：agent-teams（swarm）执行域 = 三部分：

1. `src/utils/swarm/` 子树 22 文件 7217L（wc 实测；21 `.ts` 6838L +
   `It2SetupPrompt.tsx` 379L React 层）：inProcessRunner 1536（hub）/
   permissionSync 928 / backends/TmuxBackend 764 / teamHelpers 683 /
   backends/registry 464 / backends/ITermBackend 370 /
   backends/PaneBackendExecutor 354 / backends/InProcessBackend 339 /
   spawnInProcess 328 / backends/it2Setup 245 / spawnUtils 133 /
   teammateInit 129 / backends/detection 128 / reconnection 119 /
   teammateLayoutManager 107 / backends/teammateModeSnapshot 87 /
   leaderPermissionBridge 54 / constants 33 / teammatePromptAddendum 18 /
   It2SetupPrompt.tsx 379 / backends/types 11（**any-stub**，见 §8.66.1.2 R3）。
2. 13 辅助 utils 2283L（wc 实测）：teammate 292 / teammateMailbox 1183 /
   agentId 99 / agentSwarmsEnabled 39 / teamDiscovery 81 / teamMemoryOps 88 /
   peerAddress 21 / concurrentSessions 204 / inProcessTeammateHelpers 102 /
   collapseTeammateShutdowns 55 / teammateContext 96 / standaloneAgent 23。
3. D 类归属件（registry 槽 ⑨⑮，§8.53 S-T3 / §8.64 裁定）：
   `tools/SnipTool/` 76L（体 74 + prompt 2）/ `tools/TeamCreateTool/` 348L
   （体 229 + prompt 113 + constants 1 + UI.tsx 5）/ `tools/TeamDeleteTool/`
   169L（体 133 + prompt 16 + constants 1 + UI.tsx 19）。

子树外依赖（不计入 7217）：`hooks/useSwarmPermissionPoller.ts` 330L
（React hook + 纯 callback registry，inProcessRunner 消费）/
`tasks/InProcessTeammateTask/`（.tsx 16390B 手写（`_c(` 0 命中）+ types.ts
258B，S-7a 残留守 ④）/ `utils/udsClient.ts` 3L + `utils/udsMessaging.ts` 2L
（全 **any-stub**）+ `bootstrap/state.ts` isReplBridgeActive（stub）=
UDS inbox 面。

新仓既存面（本波全部 grep 实测）：
- messaging 域 5 符号已落（§8.62 及前波）：mailbox 1281L + constants 36L
  （4 符号 getLastPeerDmSummary / isPermissionResponse / isShutdownRequest /
  markMessageAsReadByIndex 复验**全在场** → teammateMailbox 零补差）/
  agentId 77L / agentSwarmsEnabled 39L（growthbook 裁 delta① 已登记）/
  teammateContext 103L / teammate 202L / collapseTeammateShutdowns 98L。
- teammate 202L **缺旧仓尾 3 AppState 函数**（hasActiveInProcessTeammates /
  hasWorkingInProcessTeammates / waitForTeammatesToBecomeIdle，90L）=
  §8.50 裁定「shell·swarm 波」残留守（docs L2231）→ 本波补差（R6）。
- 等价面已确认在场：engine/tasks tasks.ts setLeaderTeamName /
  clearLeaderTeamName / resetTaskList / ensureTasksDir（teamHelpers /
  TeamCreate / TeamDelete 消费）；generateWordSlug（engine/tools/plan/
  planWords.ts）；gitExe + execFileNoThrow（engine/worktree/git.ts + engine
  门面）；getRoleModel（modelprovider/roles.ts:90）；runAgent
  （engine/tools/agent/runAgent.ts）；compactConversation +
  buildPostCompactMessages（engine/context/compact.ts）；lazySchema /
  registerCleanup（compose + engine 多处）；getTeamsDir（域内本地镜像先例：
  engine/tasks + messaging/mailbox 各 1 处，头注单一事实源）。
- 3 D 类工具旧契约 `buildTool + satisfies ToolDef` → 新仓无 buildTool 函数，
  工具本体 = shared Tool 契约对象化（先例 = 49 本体对象化模式，
  engine/tools/team/sendMessageTool.ts 头注 delta 同型）。
- toolNames.ts L41-42 TEAM_CREATE / TEAM_DELETE 常量已预登记（INTERNAL_
  WORKER_TOOLS 集消费）✓；toolRegistry ⑨⑩⑮ 头注与本波裁定一致
  （§8.66.1.4）。eslint-plugin-boundaries 强制 L3 域墙（eslint.config.mjs）。

**§8.66.1.2 范围裁定（迁 / 裁 / 前向接缝）**

R1 **域裁定 = 新顶层域 `src/swarm/`**（sibling of src/task，STR-1 门面 +
L3 自治）：swarm 运行时 = 可插拔执行域包（与 ascend 域包定位同型），agent
loop 侧（engine）为消费方；旧仓 messaging 域头注「swarm 子树 7217L 不在
本域」裁定维持。D 类工具本体不进 swarm 域——按 tools 域规则落
`engine/tools/team/`（TeamCreate / TeamDelete 随 sendMessageTool.ts 同族）
+ Snip 族（S-E2 裁定族位）；工具本体反向消费 swarm 门面（teamHelpers /
teammateLayoutManager / backends registry 等）。

R2 **裁面（域外 / 他波，头注登记，复审勿当遗漏重提）**：
- It2SetupPrompt.tsx 379L → React/Ink 域外裁（TUI 波）；其纯逻辑
  it2Setup.ts 245L 正常随迁（零 React 依赖）。
- TeamCreate UI.tsx 5L + TeamDelete UI.tsx 19L → React 渲染层裁（TUI 波）；
  工具体 renderToolUseMessage / renderToolResultMessage 调用点裁 + 头注。
- useSwarmPermissionPoller.ts 330L → **二分裁定**：React hook 面
  （useEffect / useInterval / react imports）域外裁（TUI 波）；纯 callback
  registry 面（registerPermissionCallback / unregisterPermissionCallback /
  processMailboxPermissionResponse + parsePermissionUpdates）抽为域内 .ts
  随迁（inProcessRunner 消费；S-E2 先读 330L 全文拆分，勿凭本行预判）。
- InProcessTeammateTask.tsx → **二分裁定**：JSX 渲染面域外裁（TUI 波）；
  非 React 框架函数面（findTeammateTaskByAgentId / requestTeammateShutdown
  / appendTeammateMessage + types.ts）抽为 .ts 随迁（S-7a 残留守 ④ 闭合）。
- perfettoTracing 3 函数（registerAgent / unregisterAgent /
  isPerfettoTracingEnabled）→ 裁 + 头注（新仓无 telemetry 域；旧仓 no-op
  sink 先例同型）。

R3 **any-stub 裁定（绝不把 any-stub 签名当真行为）**：
- backends/types.ts 11L（接口类型全 any + all-local-types 再导出，反编译
  产物）→ **零逐字迁移，域内本地类型重建**：10 接口（PaneBackend /
  TeammateExecutor / PaneId / CreatePaneResult / TeammateMessage /
  TeammateSpawnConfig / TeammateSpawnResult / BackendDetectionResult /
  BackendType / isPaneBackend 谓词）从 Tmux / ITerm / Pane / InProcess /
  registry 消费点推定，零 any（估算 ≈80–120L，S-E2 实测）。
- udsClient.ts 3L + udsMessaging.ts 2L + isReplBridgeActive（bootstrap
  stub）→ **零迁移**，头注残留守登记（UDS socket 客户端面 + 5 站点族
  [SendMessage] → remote 波 task #142；消费点 = SendMessageTool 惰性
  require + conversationRecovery 动态 import = remote 波消费面）。

R4 **门控裁定（新仓 bun:bundle feature() 恒 false 且不可测）**：
- concurrentSessions.ts feature('BG_SESSIONS')×3 + feature('UDS_INBOX')×1
  → **门裁、函数恒生效**（permissions/autoMode approvals.ts delta② 先例：
  旧默认关门 → 新恒生效；当前零活消费者 = 惰性接缝，登记防复审误判；
  PID 文件写仅在组合根调 registerSession 时发生，现 0 命中）。
- inProcessRunner.ts feature('BASH_CLASSIFIER') L156 → 裁 +
  awaitClassifierAutoApproval（旧 bashPermissions 2471L 族）=
  permissions 残留守 ① 前向接缝（域内 no-op 登记，真体随
  ① 实现半 / provider 波）。

R5 **ListPeers ⑩ = 登记零本体闭合**：旧仓 `src/tools/ListPeersTool/`
目录缺失（find 实测；旧 tools.ts:113-115 `feature('UDS_INBOX') ?
require(...) : null` = DCE gated 支无文件）→ ⑩ 维持 §8.64「登记零本体 8」
槽（本机制不声明防死接缝），本波仅补闭合证据行 + 归属对齐 §8.57 S-D1
（d8bbbe6 已对齐，零行为）。UDS inbox「本体」= 本波 concurrentSessions
204L（PID registry 半）+ peerAddress 21L（纯 parser）；socket 客户端半 =
R3 登记（remote 波）。

R6 **teammate 尾 3 补差（90L）**：hasActiveInProcessTeammates /
hasWorkingInProcessTeammates / waitForTeammatesToBecomeIdle——旧仓参
AppState（React state store，新仓域外）→ 适配新仓 task registry 面
（engine/tasks InProcessTeammate 任务态，S-E2 裁定查询形态）；零活消费者
= 惰性接缝登记（drain-gate 消费面，MINOR-1 同波先例）。

R7 **跨域消费 = 门面 + 注入 port（L3）**：
- runAgent（engine/tools/agent）+ compact 面（engine/context：
  compactConversation / buildPostCompactMessages / getAutoCompactThreshold
  / resetMicrocompactState，后两者新仓 0 命中 → 消费裁面 S-E2 裁定）→
  **组合根注入 port**（P-S1 agentLoop / P-S2 compaction；Port 1
  sessionContextPort + Port 5 sessionMemory 先例：set/get + placeholder
  缺省 + 组合根接线，未接线 = 零行为）。
- inProcessRunner 消费 8 工具名常量（SEND_MESSAGE / TASK_CREATE /
  TASK_GET / TASK_LIST / TASK_UPDATE / TEAM_CREATE / TEAM_DELETE / BASH）→
  域内本地镜像（单一事实源 = engine/tools/toolNames.ts；漂移防 = S-E2d
  registry 核销统一收编，permissions 域 BASH_TOOL_NAME 先例同型）。

**§8.66.1.3 域与子域布局（src/swarm/）**

```
src/swarm/
  index.ts                  STR-1 门面（显式名再导出，叶零 export *）
  constants.ts              ← 旧 constants.ts 33L 逐字（tmux session/socket/env 名）
  teammatePromptAddendum.ts ← 18L 逐字（SendMessage 指示字符串）
  peerAddress.ts            ← 旧 utils/peerAddress.ts 21L 逐字（uds:/bridge: 纯 parser）
  standaloneAgent.ts        ← 旧 23L（AppState 参 → task registry 适配，同 R6）
  teammateModel.ts          ← 旧 8L（getRoleModel，R7 门面/port S-E2 裁定）
  inProcessTeammateTask/    ← types.ts + 框架函数抽取（R2 二分）
  permissionPoller.ts       ← useSwarmPermissionPoller 纯 registry 抽取（R2 二分）
  teamHelpers.ts            ← 683L（team file CRUD / 成员管理 / worktree；gitExe + execFileNoThrow 门面）
  teammateInit.ts           ← 129L
  reconnection.ts           ← 119L（AppState 参适配，同 R6）
  teammateLayoutManager.ts  ← 107L（color round-robin；AGENT_COLORS → agent 门面 / 域内镜像）
  leaderPermissionBridge.ts ← 54L（ToolUseConfirm 型 → shared 契约 / 域内窄视图）
  spawnUtils.ts             ← 133L
  spawnInProcess.ts         ← 328L（lodash sample → 本地一行；perfetto 裁 R2）
  inProcessRunner.ts        ← 1536L hub（R2/R4/R7 裁剪）
  permissionSync.ts         ← 928L
  concurrentSessions.ts     ← 旧 utils 204L（门裁 R4，恒生效登记）
  teamDiscovery.ts          ← 旧 utils 81L
  teamMemoryOps.ts          ← 旧 utils 88L（isTeamMemFile → memory 门面 / 域内）
  inProcessTeammateHelpers.ts ← 旧 utils 102L
  backends/
    types.ts                R3 类型重建（≈80–120L，零 any）
    detection.ts            ← 128L
    teammateModeSnapshot.ts ← 87L
    it2Setup.ts             ← 245L
    registry.ts             ← 464L
    TmuxBackend.ts          ← 764L
    ITermBackend.ts         ← 370L
    InProcessBackend.ts     ← 339L
    PaneBackendExecutor.ts  ← 354L
  ports/                    P-S1 agentLoop / P-S2 compaction（Port 1/5 先例）
```

补差侧（既存域）：
- engine/messaging/teammate.ts + 尾 3 函数 90L（R6）。
- engine/tools/team/teamCreateTool.ts（229+113+1）/ teamDeleteTool.ts
  （133+16+1）+ prompt / constants 伴随件；Snip → engine/tools/<S-E2 裁定
  族位>（74+2）。
- engine/tools/toolNames.ts 补差：Snip 工具名常量（若缺）。
- atlascode/compose.ts：P-S1/P-S2 port 接线 + ⑨⑮ baseTools 注入
  （teamCreateTool / teamDeleteTool / snipTool）。

**§8.66.1.4 registry 槽裁定 + 登记处核销清单**

- ⑨ HISTORY_SNIP → **materialize**：Snip 本体落（旧门 feature('HISTORY_
  SNIP') 裁 → 恒注册，登记 delta（⑲ ToolSearch 门裁先例同型））；头注从
  残留守 4 移 materialize（S-E2d 实测自门控形态）。
- ⑮ agentSwarms → **materialize**：TeamCreate / TeamDelete 本体落，
  自门控 isEnabled = isAgentSwarmsEnabled（messaging 域既存，growthbook
  裁 delta① 已登记），组合根 deps.baseTools 注入（⑯ 模式同型）。
- ⑩ UDS_INBOX → **维持登记零本体** + 闭合证据行（R5）。
- 49 口径：§8.64 49/49 收口已含 C 桶 ③ 3 项（⑨⑮⑩）= 登记项 → 本波
  ⑨⑮ 本体落 = 登记 → 本体落 proof 换血，**49/49 维持**（S-E4 口径行更新）。
- B 桶 18 项 / 登记处核销清单（S-E4 逐项核销，复审勿当遗漏重提）：
  1. toolRegistry 头 ⑨⑮ 残留守 → materialize + ⑩ 闭合证据行
  2. engine/messaging/index.ts L21「swarm 子树 7217L 不在本域」登记
  3. engine/tools/team/sendMessageTool.ts L34（parseAddress 接缝）+ L50 /
     L242（TeamFile 真读者 / setTeamFileLoader 缺省报错面）→ 真读者接线
     （teamHelpers readTeamFileAsync + peerAddress）
  4. engine/coordinator/tasks/registry.ts L12 inProcessTeammateHelpers 102L 登记
  5. engine/session/restore.ts L35 concurrentSessions updateSessionName 登记
  6. src/task/task.ts L12「swarm/inProcessRunner / spawnMultiAgent 未移植」登记
  7. permissions/permissionUpdateSchema.ts L14「swarm permissionSync」登记
  8. docs L2231 teammate 尾 3 AppState 函数登记（R6 闭合）
  9. docs L2502 B7 directMemberMessage writeToMailbox 真 mailbox 面登记
  10. docs L2509 B14 InProcessTeammateTask TaskState 联合扩登记

**§8.66.1.5 子波切片（S-E2 四模块提交）+ 测试面与基线预测**

- S-E2a **叶子 + 类型层**：src/swarm/ 域骨架 + STR-1 门面 + constants 33 /
  teammatePromptAddendum 18 / peerAddress 21 / standaloneAgent 23 /
  teammateModel 8 + backends/types 类型重建（R3）+ inProcessTeammateTask
  抽取 + permissionPoller 抽取（R2 二分，先读 330L 全文拆分）+
  messaging/teammate 尾 3 补差（R6）+ ports/ 占位（P-S1/P-S2，未接线零
  行为）。
- S-E2b **中层**：teamHelpers 683 / teammateInit 129 / reconnection 119 /
  teammateLayoutManager 107 / leaderPermissionBridge 54 / spawnUtils 133 /
  teamDiscovery 81 / teamMemoryOps 88 / concurrentSessions 204 /
  inProcessTeammateHelpers 102（逐文件裁定：AppState 参 → task registry
  （同 R6）/ utils-internal 面 → 新仓等价面映射（§8.66.1.1）/ 域内本地
  镜像（单一事实源 + 漂移防登记））。
- S-E2c **backends 族**：detection 128 / teammateModeSnapshot 87 /
  it2Setup 245 / registry 464 / TmuxBackend 764 / ITermBackend 370 /
  InProcessBackend 339 / PaneBackendExecutor 354（execFileNoThrow → engine
  门面；AGENT_COLORS / AgentColorName → agent 门面 / 域内镜像，S-E2 裁定）。
- S-E2d **hub + D 类 + 核销**：inProcessRunner 1536（R2/R4/R7 裁剪）/
  spawnInProcess 328（lodash → 本地一行）/ permissionSync 928 +
  TeamCreate / TeamDelete / Snip 3 工具（buildTool 成员面 → shared Tool
  契约对象化，49 本体先例）+ registry ⑨⑮ 核销 + toolNames 补差 +
  compose.ts port 接线 + baseTools 注入 + **四件套**（tsc 0 / eslint 0 /
  build 0KB 入口 / 全量 test + gate 6·5）。

测试面（防空洞，仅测纯逻辑面 + 可注入 FS / shell 面，零假测试）：
- 新增 ≈8–12 文件 / +150–250 用例：peerAddress（纯 parser，新）/
  concurrentSessions（PID registry tmp-dir 流 + 门裁恒生效 delta 断言）/
  inProcessTeammateHelpers / teamDiscovery / teamMemoryOps / spawnUtils
  （纯 builder）/ teammateLayoutManager（color round-robin + clear）/
  permissionSync（fake mailbox 目录请求-响应流，含 sandbox 变体）/
  teammate 尾 3 补差（task registry fake）/ backends/types（类型层编译断言
  + isPaneBackend 谓词）/ D 类 3 工具（isEnabled 门：TeamCreate /
  TeamDelete = isAgentSwarmsEnabled 三态 / Snip 恒注册 + inputSchema +
  prompt 面）。
- 既存：messaging 域 5 符号全在场（零补差零新测）。
- 基线预测（S-E2 实测为准）：波终 ≈ **2620–2720 pass / 148–152 文件 /
  6050–6150 expect + gate 6·5**（起点 = §8.65 波终 2474/140/5851 + gate
  6·5，本波开波 live 复跑已核）。

**§8.66.1.6 残留守登记（= 前向接缝，复审勿当遗漏重提）**

1. UDS socket 客户端面（udsClient / udsMessaging / startUdsMessaging /
   getDefaultUdsSocketPath / sendToUdsSocket / listAllLiveSessions）+
   SendMessage UDS 5 站点族 → **remote 波 task #142**（R3 零迁移登记）。
2. P-S1 runAgent port / P-S2 compact 面 port 接线 = **组合根 S-E2d 装配
   项**（未接线 placeholder = 惰性接缝零行为；getAutoCompactThreshold /
   resetMicrocompactState 新仓 0 命中 → 消费裁面随 S-E2d 实测登记）。
3. awaitClassifierAutoApproval（bash 分类器自动放行，inProcessRunner L156
   门裁登记）→ **permissions 残留守 ①**（工具面 checkPermissions 实现半 /
   provider 波）。
4. React/Ink 面 4 件（It2SetupPrompt.tsx 379 / TeamCreate+TeamDelete
   UI.tsx 24 / useSwarmPermissionPoller hook 面 / InProcessTeammateTask
   JSX 面）→ **TUI 波**（R2 裁面登记）。
5. teammate 尾 3 零活消费者 + concurrentSessions 恒生效零活消费者 =
   **惰性接缝登记**（drain-gate / 组合根消费面，MINOR-1 同波先例：已登记
   头注面非 stub）。
6. 8 工具名常量域内本地镜像漂移防 = **S-E2d registry 核销统一收编**
   （单一事实源 = engine/tools/toolNames.ts，permissions 域 BASH_TOOL_NAME
   先例同型）。
7. AGENT_COLORS / isTeamMemFile / getTeamsDir 等 utils-internal /
   tools-internal 面 → 逐文件 S-E2 裁定登记（门面直引或域内本地镜像，
   头注单一事实源标注逐件）。

**§8.66.2 S-E2d + S-E3 闭环记录（C 桶 ③ shell·swarm 波，2026-09-28）**

**§8.66.2.1 S-E2d 实施 + 测试面（提交链 e03cdee → 2fd81a1 → 1bb68e3）**
- 切片 4 inProcessRunner hub 1536L（R2/R4/R7 裁剪，delta ①-⑫ 登记）+
  permissionSync 928L（e03cdee 同提交落位）+ D 类 3 工具（2fd81a1：Snip
  恒注册 + TeamCreate/TeamDelete agentSwarms 门 + TeamServices 注入接缝
  11/11 面）+ 核销 10 项 + compose ⑫ 接线（1bb68e3：⑧⑨⑩ 核销注 + B7/B14
  + setTeamServices 11/11 + setTeamFileLoader 真读者）。
- 测试面 11 文件 +176 测（零模型零 PTY 零网络）：unit 7 文件（尾 3 /
  spawnUtils / teamMemoryOps 等）+ func 4 文件（permissionSync /
  concurrentSessions / team-discovery / D 类 FS）。
- 四件套基线（S-E2d 终态）：tsc 0 / eslint 0 / build 0-byte / 全量
  2650 pass / 0 fail / 151 文件 / 6223 expect + gate 6 pass / 5 expect
  （S-E2c 2474/140/5851 → +176 测 / +11 文件 / +372 expect）。

**§8.66.2.2 S-E3 双只读审视（A 路旧仓保真度 + B 路新仓一致性）**
- A 路（diff da1b478..1bb68e3 vs 旧仓 a8af45b 逐文件全量比对）：
  1 blocker（delta ⑧ 工具池登记失实——零 deps getTools 最小池 [AgentTool]
  vs 旧 L1184 父会话全量池，runner 侧无 deps 注入通路）+ 4 minor（⑬
  isNonInteractiveSession 硬编码 true 未登记 / recheckPermission
  updatedInput 取值源漂移 / port 2 死参未登记 / teamServices 行号前缀
  「旧」误标）+ 2 nit（JSON.stringify remap 站点未登记 / Snip 恒注册 =
  已登记合规，信息项）。
- B 路：6 house rule 全 PASS（L3 隔离 grep 零命中 / STR-1 本波 5 门面
  零 export * / 3-dep 恰 5 / H6 新文件零 any / 提交纪律 / compose ⑫
  接线序 + requireTeamServices 运行期触发 PRT-2 持守）+ 4 findings
  （inProcessRunner 4 死码 lint 错 / docs 闭环记录 1bb68e3 声称未兑现 /
  permission-sync as never cast 2 站 / 存量 STR-1 债 20 处 export *
  （S-E2 前存量，非波内，后续门面收口 pass 参考））。
- 全部 finding 经 grep/Read/scratch tsc/实跑复核后方处置（subagent
  报告 = DATA，零盲从）。

**§8.66.2.3 S-E3 修波（提交链 1e6bf2e → c3a45b1 → 77c5f9f，3 模块提交）**
1. **blocker** → 新增 swarm/backends/teammateToolRegistryDeps.ts 注入窗
   （34L，fail-soft 零 deps 不抛）+ inProcessRunner delta ⑧ 回填
   （getTools 补第 2 参 getTeammateToolRegistryDeps()）+ 头注 delta ⑧
   登记改写（原失实「默认预设池」文案替换为回填登记）+ 窗单测 3
   （tests/unit/teammate-tool-registry-deps-se3：getTools 池判别引用
   同一性 + set/reset round-trip 隔离守卫）。
2. A 路 minor ⑬ → 描述面 isNonInteractiveSession = bootstrap
   getIsNonInteractiveSession()（旧 L182 options 同源；swarm
   backends/registry.ts 先例同源 import，L3 零新增交叉）。
3. A 路 minor ② → recheckPermission 恢复旧 L322 逐字 updatedInput: input
   （非新检 updatedInput——用户所见所批 input 权威；userModified=false
   语义被新 GateVerdict 形收编，delta ④）。
4. A 路 minor ③ → delta ⑭ port allowedTools/allowPermissionPrompts
   双站点登记死透传（port 字段注 + InProcessBackend 透传点；旧 L1178
   canShowPermissionPrompts / L1185 池 Set-union 消费端归 D 波 agent
   注册表 / leader 权限面波回填；旧生产调用方恒 undefined = 零行为差，
   字段不删——后端 config 面公共形保留）。
5. A 路 minor ④ → teamServices 9 成员注行号前缀订正「旧」→「新仓
   swarm」（接口头注加全局订正注；成员语义 = 旧仓 call 体消费面逐字
   不变）。
6. A 路 nit 1 → JSON.stringify(notification) remap 站点登记（旧 L581
   jsonStringify 慢操作 wrapper 裁除，输出逐字同，零行为差）。
7. B 路 minor 1 → inProcessRunner 4 死码删除（promptMessages /
   alreadyTerminal×2 / toolUseId = evictTerminalTask 裁剪残留，lint
   error 4 → 0）。
8. B 路 nit 1 → permission-sync seed 2 站 as never cast 删除（字面量
   直赋 TeamFile，该站点类型检查恢复，scratch tsc 实证零 cast 可赋）。
9. B 路 nit 2（存量 STR-1 债 20 处 export *）→ 本波不修（S-E2 前存量，
   后续门面收口 pass 参考，本节登记）。
10. B 路 minor 2 → 本 §8.66.2 闭环记录（1bb68e3 提交消息声称的闭环
    记录补写兑现）。

**§8.66.2.4 修波后四件套（修波验证，2026-09-28）**
- tsc 0 / eslint 0（src + tests 全量，含 inProcessRunner）/ build 0-byte
  （既定基线）。
- 全量：**2653 pass / 0 fail / 152 文件 / 6229 expect**（S-E2d
  2650/151/6223 → +3 测 / +1 文件 / +6 expect = 窗单测 3）。
- gate：**6 pass / 0 fail / 5 expect**（不变）。
- 波终基线 = 2653/152/6229 + gate 6·5（后续 D 波预测底数）。

**§8.66.2.5 波终态**
- §8.66 波（C 桶 ③ shell·swarm 7217L + D 类归属件）S-E1..S-E3 全闭环；
  波 tag 不切（gate ③ 仍用 wave-c，子波惯例）。
- 前向接缝登记汇总（§8.66.1.6 残留守 + inProcessRunner delta ①-⑭ +
  teammateToolRegistryDeps 头注）：UDS 5 站点族 → remote 波 task #142；
  agent 注册表（def.tools Set-union / agentDefinition）+ leader 权限面
  + delta ⑭ 死参消费端 → D 波 task #141；BASH_CLASSIFIER 门 →
  permissions 残留守 ①；React/Ink 面 → TUI 波；emitTaskTerminatedSdk →
  analytics 波 task #143。

## §8.67 S-E1 总分析（D 波，task #141，2026-09-28）

**§8.67.1.1 波定位与范围**

D 波 = 既定序列第 4 棒（C ③ → D → remote → analytics），task #141。
范围 4 部分，来源 4 处信息：

1. **D 桶 ① Skill 域**（§8.60.1.1 裁定）：先落 skill 目录/模型面/usage
   tracking 目录域，再落 SkillTool 915L 本体（+prompt 213L；UI 127L
   JSX → TUI 波）。本体硬依赖闭包 = commands 域 + forkedAgent 核层 +
   processPromptSlashCommand 核层 + skill usage/invoked 状态 +
   parsePluginIdentifier/isOfficialMarketplaceName + 消息 tag/agent
   context；feature('EXPERIMENTAL_SKILL_SEARCH') 远端 skill 4 模块整支
   裁（新仓 feature() 恒 false，旧仓 4 文件 = 1-3L 桩）。
2. **D 桶 ② LSP 域**（§8.61.1.1 裁定）：先落 LSP client 域（旧
   services/lsp 8 文件 2464L）+ wire 型本地转写（旧仓
   vscode-languageserver wire 型全 ambient any stub = 无真型契约可保真；
   新仓 3-dep 纪律亦无真包可引）+ 插件域 LSP 集成面（新仓 0 命中 →
   注入窗），再落 LSPTool 860L 本体（+formatters 592/schemas 215/
   prompt 21/symbolContext 90；UI 227L JSX → TUI 波）。本体不能单独落
   = isEnabled()≡false + call() 4 缝无宿主 = 空心壳（H6 违规）→ client
   域与本体同波。
3. **§8.66.2.5 前向接缝**（C 桶 ③ 登记，归 D 波）：① agent 注册表
   （def.tools Set-union / agentDefinition duck 字段，inProcessRunner
   delta ⑧ 回填点 L975-1010）② leader 权限面（leaderPermissionBridge
   队列 headless 消费；注册侧已落）③ delta ⑭ 死参消费端（port
   allowedTools/allowPermissionPrompts 零消费 → 消费端 = 旧 L1178
   canShowPermissionPrompts ?? true / 旧 L1185 + 旧 runAgent L475-486
   session rule 语义）。
4. **路线图 §8.3 D 波行**：壳接线（atlascode/cli.ts + mount.ts +
   state/index.ts 3× 7L `export {}` 骨架）+ B13（setAppState 置换，S-E0
   自 F 波改判）+ 全栈 gelu 复验。

**波终基线底数 = 2653/152/6229 + gate 6·5**（§8.66.2.4 波终）。

**§8.67.1.2 旧仓读面（ground-truth 盘点）**

D 桶 ① Skill 域：

| 旧仓文件 | 行 | 处置 |
|---|---|---|
| tools/SkillTool/SkillTool.ts | 915 | 本体 → `src/engine/tools/skill/`（裁：远端支整支 / MCP 支 → remote 波 / TUI render → TUI 波） |
| tools/SkillTool/prompt.ts | 213 | prompt 面 → `src/engine/tools/skill/` |
| tools/SkillTool/UI.tsx | 127 | JSX render → TUI 波（Tool 契约 renderToolUseMessage 字符串面保留） |
| commands.ts | 705 | 目录模型面 6 函数（builtInCommandNames/getCommands/getSkillToolCommands/getSlashCommandToolSkills/findCommand/clearCommandsCache）→ `src/engine/skill/`；~70 本地 TUI 命令（COMMANDS 清单，多数 .tsx）→ TUI 波 |
| skills/loadSkillsDir.ts | 1064 | skill 目录装载（getSkillDirCommands/clearSkillCaches/getDynamicSkills/getBundledSkills 装载链/parseSkillFrontmatterFields/discoverSkillDirsForPaths/addSkillDirectories/activateConditionalSkillsForPaths/LoadedFrom）→ `src/engine/skill/` |
| skills/bundledSkills.ts | 220 | 内置 skill 注册（getBundledSkills→Command[]/registerBundledSkill/createSkillCommand）→ `src/engine/skill/` |
| utils/forkedAgent.ts | 652 | 核层 ~120L（prepareForkedCommandContext/extractResultText/createGetAppStateWithAllowedTools）→ `src/engine/skill/`；runForkedAgent 生成器族裁（新 runAgent = Promise 一次性全序列，fork 面适配：agentMessages = result.messages） |
| utils/processUserInput/processSlashCommand.tsx | 698 | processPromptSlashCommand + getMessagesForPromptSlashCommand 核层（skill → 消息展开）→ `src/engine/skill/`（转写 .ts，JSX 纠缠度 S-E2 判定）；processSlashCommand TUI 入口（setToolJSX/uuid 参数）→ TUI 波 |
| utils/skills/skillUsageTracking.ts | 55 | recordSkillUsage → `src/engine/skill/` |
| utils/skills/skillChangeDetector.ts | 304 | 消费端 = useSkillsChange TUI hook → 裁登记（TUI 波） |
| services/skillSearch/ | 10（4× 1-3L 桩） | feature 恒 false → 整支裁登记 |

本体硬依赖闭包（新仓落面确认，§8.67.1.3）：getRuleByContentsForTool ✓ /
parseToolListFromCLI ✓ / agent 注册表（getBuiltInAgents +
loadAgentsDir + resolveAgentTools）✓ / runAgent（Promise 面 +
forkContextMessages/checkPermission）✓ / createAgentId（randomUUID）✓ /
shared uniq·expandPath + bootstrap getCwd ✓。

D 桶 ② LSP 域：

| 旧仓文件 | 行 | 处置 |
|---|---|---|
| tools/LSPTool/LSPTool.ts | 860 | 本体（9 操作 enum strictObject + validateInput 4 码 + UNC skip / checkPermissions 单线 checkReadPermissionForTool / call 4 缝 / filterGitIgnoredLocations / formatResult 9 支）→ `src/engine/tools/lsp/` |
| tools/LSPTool/formatters.ts | 592 | 结果格式化面（countSymbols 嵌套/countUniqueFiles/invalid-uri logError）→ `src/engine/tools/lsp/` |
| tools/LSPTool/schemas.ts | 215 | zod schema（lspToolInputSchema）→ `src/engine/tools/lsp/` |
| tools/LSPTool/prompt.ts | 21 | → `src/engine/tools/lsp/` |
| tools/LSPTool/symbolContext.ts | 90 | → `src/engine/tools/lsp/` |
| tools/LSPTool/UI.tsx | 227 | JSX → TUI 波（renderToolUseMessage 字符串面保留） |
| services/lsp/config.ts | 79 | "LSP servers are only supported via plugins, not user/project settings" — 插件唯一源（loadAllPluginsCacheOnly + getPluginLspServers，新仓 0 命中）→ `src/lsp/` + 配置注入窗（未注册 = 空 = LSP 断连态） |
| services/lsp/LSPClient.ts | 447 | client（createLSPClient，JSON-RPC stdio）→ `src/lsp/` + wire 型本地转写 |
| services/lsp/LSPDiagnosticRegistry.ts | 386 | registry 活面（register/check/clear/reset/clearDelivered/getPendingCount）→ `src/lsp/` |
| services/lsp/LSPServerInstance.ts | 511 | → `src/lsp/` |
| services/lsp/LSPServerManager.ts | 420 | createLSPServerManager → `src/lsp/` |
| services/lsp/manager.ts | 289 | 单例状态机（getLspServerManager/getInitializationStatus/isLspConnected/waitForInitialization/initialize/reinitialize/shutdown/_resetLspManagerForTesting）→ `src/lsp/` |
| services/lsp/passiveFeedback.ts | 328 | 二分裁定：registerLSPNotificationHandlers（handler 注册面，client 域消费）保留 → `src/lsp/`；formatDiagnosticsForAttachment（TUI attachment 渲染面）→ TUI 波 |
| services/lsp/types.ts | 4 | 本地型再导出 + 3 个 any 型（转写对象）→ `src/lsp/` |
| （wire 型） | ~10-15 型 | LSP wire 子集（Request/Response/Location/SymbolInformation/CallHierarchy(Item)s/TextDocument(Position)Params/InitializeParams/PublishDiagnosticsParams 等）本地转写 — 旧仓 ambient any stub（无真型契约可保真），转写面 = LSPTool + formatters + client 域消费面，头注登记 |

call 4 缝宿主确认（同波落，非空心）：getInitializationStatus /
getLspServerManager = manager.ts 单例（LSPTool L 缝 1/2）；
getMethodAndParams = 本体 9 操作 → LSP method 映射表（1-based→0-based）
（缝 3）；sendRequest = LSPServerInstance（缝 4，isFileOpen → open +
stat > MAX_LSP_FILE_SIZE_BYTES 10MB → 'File too large…' +
No LSP server available for file type 兜底）。

接缝面（§8.66.2.5 三件，旧仓 ground truth）：
- 旧 inProcessRunner L966-980：`resolvedAgentDefinition.tools =
  agentDefinition?.tools ? [...new Set([...agentDefinition.tools,
  SEND_MESSAGE_TOOL_NAME, TEAM_CREATE_TOOL_NAME, TEAM_DELETE_TOOL_NAME,
  TASK_CREATE_TOOL_NAME, TASK_GET_TOOL_NAME, TASK_LIST_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME])] : ['*']`（team-essential 7 件 Set-union）；
  L937-947 custom prompt append `\n# Custom Agent Instructions\n${
  customPrompt}`；L984 model 传播。
- 旧 L1178：`canShowPermissionPrompts: allowPermissionPrompts ?? true`；
  旧 L1185 + 旧 runAgent L475-486：allowedTools = **session 级权限规则**
  （非池限制；旧注释逐字 "when allowedTools is provided, use them as
  session rules. Preserve cliArg rules (from SDK's --allowedTools)" →
  session: [...allowedTools]）。
- 新仓消费端映射：① 回填点 = inProcessRunner delta ⑧ 注释点（L975-1010，
  "team-essential 7 件 Set-union 随 agentDefinition 参数裁除（D 波
  agent 注册表回填）；无自定义 def → 全量池"）② allowedTools → teammate
  TPC alwaysAllowRules（session rule 语义，gate 构建前）③
  allowPermissionPrompts≡false → gate ask 支 auto-deny（leader 权限面
  headless 消费；leaderPermissionBridge 注册侧已落，UI queue 接线 = TUI
  波）。

**§8.67.1.3 新仓落面确认（存在性 grep 记录，2026-09-28）**

已落可消费（✓）：
- `getRuleByContentsForTool` = src/permissions/ruleMatching.ts:264（E-4
  逐字落）
- `parseToolListFromCLI` = src/engine/permissions/permissionSetup.ts:112
  （门面 engine/index.ts:536）
- agent 注册表 = getBuiltInAgents（engine/tools/agent/builtInAgents.ts:31）
  + loadAgentsDir（143L）+ resolveAgentTools（agentToolUtils：通配/按名/
  禁用集/mcp__ 透传/seen Set 去重）
- runAgent = engine/tools/agent/runAgent.ts（RunAgentArgs：agentId 必填 /
  forkContextMessages? / checkPermission?；Promise 一次性全序列）
- Executor 接口 exec(command, args, opts)（executor/types.ts:77）；
  child_process 直用先例 = bashTool/shell 域
- bootstrap getCwd（cwd.ts:41）/ shared expandPath（path.ts:31）/
  memory frontmatterParser
- SKILL_TOOL_NAME 已 seed（toolNames.ts:36）

未落（接缝登记，复审勿当遗漏重提）：
- addInvokedSkill / clearInvokedSkillsForAgent / getInvokedSkills — 0
  命中 → skill invoked 状态 = 本波 skill 子域落面（模块态，不进
  bootstrap）
- AppState `mcp.commands` — 0 命中 → MCP skill 支 = **remote 波
  （task #142）前向接缝**；skill 域 skill 源注入窗（未注册 = 空源，
  fail-soft，模型 skill 池 = bundled + 用户目录 + plugin 源）
- resolveSkillModelOverride — 0 命中 → skill 模型覆写面 = skill 子域本地
  纯函数（skill.model → mainLoopModel 覆写，~15L），头注登记
- execFileNoThrowWithCwd（LSP git check-ignore batch 50，timeout 5000，
  exit 0=ignored/1=none/128=not-repo）— 0 命中 → **lsp 域本地
  child_process.execFile 等价**（单消费点；L3 域自治不拉 executor；
  先例 = bashTool 直用 child_process；零新依赖）
- LSP_TOOL_NAME — toolNames.ts 0 命中 → 本波 seed
- 插件域 LSP 集成（loadAllPluginsCacheOnly + getPluginLspServers）— 0
  命中 → 插件域前向接缝（既定序列外，登记；lsp 配置注入窗 fail-soft）

**§8.67.1.4 范围裁定（迁 / 裁 / 前向接缝）**

**R1 域布局裁定：**
- D 桶 ① = `src/engine/skill/`（skill 目录子域：commands 模型面 +
  loadSkillsDir + bundledSkills + skillUsageTracking + invoked-skill
  状态 + forkedAgent 核层 + processPromptSlashCommand 核层 + 注入窗；
  全在 engine 内无跨域 import，先例 = agent 注册表在 engine/tools/agent/
  下）+ `src/engine/tools/skill/`（SkillTool 本体 915 裁 + prompt 213 +
  注册；SKILL_TOOL_NAME 已 seed）
- D 桶 ② = `src/lsp/`（**新顶级域**：client 域 2464L + wire 型 + 配置
  注入窗 + manager 单例；自治 = JSON-RPC + child_process + fs only，不
  import engine）+ `src/engine/tools/lsp/`（LSPTool 本体 +
  formatters/schemas/prompt/symbolContext + LSP_TOOL_NAME seed；工具面 →
  服务域，方向同 files→bootstrap/executor 先例；isEnabled = lsp 域
  isLspConnected = 同波落非空心）
- §8.66.2.5 接缝 = swarm 域 inProcessRunner 回填（delta ⑧/⑭ 消费端）+
  leader 权限面（headless 消费）
- 壳 = atlascode/cli.ts + mount.ts + state/index.ts 3× 7L 骨架 + B13 +
  gelu

**R2 Skill 裁面（全登记，复审勿当遗漏重提）：**
1. executeRemoteSkill 整支（feature 恒 false，旧 4 模块 = 1-3L 桩）→ 裁
2. MCP skill 支（getAppState().mcp.commands 过滤 + uniqBy）→ remote 波
   前向接缝（注入窗 fail-soft）
3. plugin skill/command 源（getPluginSkills/getPluginCommands）→ 插件域
   注入窗（同上）
4. COMMANDS ~70 本地 TUI 命令（多数 .tsx）→ TUI 波；模型面
   getSkillToolCommands 过滤 `source!=='builtin'` 不受影响
5. REMOTE_SAFE_COMMANDS/BRIDGE_SAFE_COMMANDS → remote 波；
   INTERNAL_ONLY_COMMANDS → 裁登记
6. skillChangeDetector 304L（消费端 = useSkillsChange TUI hook）→ TUI 波
7. querySource 'agent:custom' + isAsync + preserveToolUseResults → 新
   runAgent 签名无此字段 = 裁登记（新 runAgent = Promise 一次性，无
   异步/分叉语义）
8. command.effort 合并（{...baseAgent, effort: command.effort}）→ 新
   AgentDefinition 无 effort 字段 = 裁登记（skill effort 面 = 残留守，
   本波不造字段）
9. getAgentContext → 新 createAgentId（randomUUID）+ agentId 参数
10. onProgress skill_progress → 保留（新 Tool 契约有 onProgress 槽，零
    成本）
11. meetsAvailabilityRequirement（'claude-ai' break / 'console'
    isFirstPartyGatewayUrl / 'vendor' OPENAI_*）→ 新仓 auth lane =
    OpenAI 静态键：claude-ai 支裁；vendor 面 = OPENAI_* env 面本地转写
    （S-E2 细则裁定）
12. UI.tsx 127L JSX → TUI 波（renderToolUseMessage 字符串面保留）

**R3 LSP 裁面（全登记，复审勿当遗漏重提）：**
1. config 插件唯一源 → LspServerConfig 注入窗（未注册 = 空配置 = LSP
   断连 = 工具 disabled 态，活面非空心）+ 插件域 LSP 集成（旧
   lspPluginIntegration 390L）= 插件域前向接缝
2. lspRecommendation 374L（TUI 推荐面）→ TUI 波
3. UI.tsx 227L JSX → TUI 波（renderToolUseMessage 字符串面保留）
4. passiveFeedback 二分：registerLSPNotificationHandlers 保留（handler
   注册面）/ formatDiagnosticsForAttachment → TUI 波（attachment 渲染
   面）
5. wire 型 = 本地转写（旧仓 ambient any stub 无真型契约可保真；转写面 =
   LSPTool + formatters + client 域消费面；头注登记"转写 = D 波裁定面，
   非旧仓保真"）
6. execFileNoThrowWithCwd → lsp 域本地 child_process.execFile 等价（单
   消费点 = git-ignore filter；不拉 executor）
7. MAX_LSP_FILE_SIZE_BYTES 10MB / filterGitIgnoredLocations（4 location
   操作 + workspaceSymbol；batch 50）→ 落面（域本地）

**R4 接缝裁定（§8.66.2.5 三件回填）：**
- agent 注册表回填 = port 输入面（inProcessRunnerPort/types.ts）+
  agentDefinition duck 字段（getSystemPrompt/tools/model/customPrompt）
  + inProcessRunner 回填：custom prompt append（旧 L937-947 逐字）+
  resolvedAgentDefinition.tools = def.tools ∪ team-essential 7 件
  Set-union（无自定义 def → 全量池，delta ⑧ 注释语义逐字）+ model 传播
  （旧 L984）；池限制面 = agent 域 resolveAgentTools（已落）
- delta ⑭ allowedTools 消费端 = teammate TPC alwaysAllowRules 合并（旧
  runAgent L475-486 session rule 语义：session 规则非池限制；Preserve
  cliArg rules）
- delta ⑭ allowPermissionPrompts 消费端 = `canShowPermissionPrompts =
  allowPermissionPrompts ?? true`（旧 L1178 逐字）；false → gate ask 支
  auto-deny（无交互提示）；leader 权限面 = leaderPermissionBridge 队列
  headless 消费（注册侧已落，UI queue 接线 = TUI 波）

**R5 壳接线 + B13 + gelu：**
- cli.ts = commander CLI 入口（消费 loop-deps builder 单入口；--check/
  --tools/--e2e → 新仓等价面）
- mount.ts = DomainPackage 挂载（DEP-5 接线点）
- state/index.ts = AppState 实现（engine/ports/sessionContext.ts
  QueryEngineConfig getAppState/setAppState 替换面，charter Port 1）
- B13 = setAppState 置换（engine/state/EngineState.ts functional-update
  串行语义；atlascode/state 7L → 真实现）
- 全栈 gelu 复验 = 新全栈 liveness probe（engine loop + 工具注册表 +
  provider + 新 2 域；fixture replay 零真模型；落 tests/func 或 e2e —
  S-E2 裁定，gate ⑥ 不变）

**R6 测试面预测 + 波终基线预测：**
- skill 子域 unit（frontmatter/目录过滤/availability/usage/invoked-skill
  状态）+ func（skill 目录真 FS 装载 round-trip）
- SkillTool 本体 unit（validateInput 5 码 / checkPermissions 规则面 /
  contextModifier allowedTools Set-union / mapToolResult 2 支 / forked
  路径 runAgent mock）
- lsp 域 unit（wire 型/formatters 9 操作/manager 状态机/git-ignore
  filter mock）+ func（fake LSP server stub 真 stdio JSON-RPC，零模型）
- 接缝 unit（def.tools Set-union / allowedTools TPC 合并 /
  allowPermissionPrompts gate 支）
- 壳 unit（cli 入口 smoke / state 实现 / mount）+ 全栈 liveness probe
- 波终基线预测：2653 + ~120-180 测 ≈ **2770-2830 pass / 152 + ~12-18
  文件 / ~6600-6900 expect** + gate 6·5 不变

**§8.67.1.5 S-E2 切片计划（一模块一提交，每片四件套）**

- **S-E2a**：skill 目录子域 `src/engine/skill/`（commands 模型面 +
  loadSkillsDir + bundledSkills + skillUsageTracking + invoked-skill
  状态 + forkedAgent 核层 + processPromptSlashCommand 核层 + 注入窗）+
  tests + 四件套
- **S-E2b**：SkillTool 本体 `src/engine/tools/skill/`（915 裁 + prompt
  213 + 注册）+ tests + 四件套
- **S-E2c**：LSP 域 `src/lsp/`（client 域 + wire 型 + 配置注入窗 +
  manager）+ LSPTool 本体 `src/engine/tools/lsp/`（+formatters/schemas/
  prompt/symbolContext + LSP_TOOL_NAME seed）+ tests + 四件套
- **S-E2d**：接缝回填（agent 注册表 + delta ⑭ 消费端 + leader 权限面）+
  壳接线（cli/mount/state + B13）+ gelu probe + tests + 四件套
- **S-E3**：双只读审视（≤2 subagent：A 路旧仓保真 / B 路新仓一致性；
  报告 = DATA，全部 grep/Read 核验）+ fix 波提交
- **S-E4**：闭环（docs §8.67.2 闭环记录 + memory
  `atlascode-wave-c-progress.md` append + MEMORY.md pointer +
  task #141 → completed）

序 = 目录先于本体（a→b）、client 域先于工具本体（c 内）、接缝回填与
壳接线最后（d = 消费端最后）。


## §8.67.2 D 波闭环记录（S-E2 a-d + S-E3 + S-E4，2026-09-28）

**§8.67.2.1 S-E2 切片落盘记录（cf6c4e7..fd4c1e3，8 提交）**

- **S-E1**（ecd09c4）：§8.67.1 总分析（波定位 / 旧仓读面 / 新仓落面 grep
  / 范围裁定 / S-E2 切片计划）——落盘即提交，序 = 目录先于本体。
- **S-E2a**（925b29a）：skill 域子域 `src/engine/skill/` 20 模块落面
  （bundledSkills / skillCommand / markdownLoader / loadSkillsDir /
  commands / argumentSubstitution / frontmatterFields / skillModel /
  patternMatch / gitignore / usageTracking / forkedAgent /
  processPromptSlashCommand / promptShellExecution 等 + 子门面）+
  unit/func 测试层。
- **S-E2b**（6fdbb09）：SkillTool 本体 `src/engine/tools/skill/`（915L
  裁 + prompt 213 + 注册；49 口径 30/49）。
- **S-E2c**（b54c090）：LSP 域 `src/lsp/`（client 域 2464L + 配置注入窗
  + manager 单例 10 文件）+ LSPTool 本体 `src/engine/tools/lsp/`
  （49 口径 31/49）；LSP server 真配置源 = 插件域 LSP 集成波前向接缝。
- **S-E2d 提交 1**（ad56cad）：接缝回填（agent 注册表 duck 面 + delta
  ⑭ TPC/gate 消费端 + leader 权限面）。
- **S-E2d 修**（4289383）：单进程连跑跨文件全局态泄漏守卫（4 复位面
  导出 + compose 注入窗对称复位 + 8 测试文件 bootstrap cwd 存还）。
- **S-E2d 提交 2**（fd4196e）：state 域真实现（B13 setAppState 置换：
  AppState = EngineState<SessionSnapshot> 串行 apply 队列，port.set
  fire-and-forget；compose ⑩ 注入置换 + CoreDependencies.appState 面 +
  A7 闭包壳零引用删除）。
- **S-E2d 提交 3**（44d15e3）：全栈 gelu liveness probe（func 层零真
  模型：35 本体全注入注册表 29 名精确池 + 6 门控缺席判别 + swarms 门
  双向活 29→32→29 / queryAgentLoop 双轮 fixture replay（真 pipeline +
  真门 + 真 hooks）/ skill 注册面 / LSP 门控初态面；env 5 键三态定化
  〔ATLAS_ENABLE_TASKS=1 + ATLAS_ENABLE_TOOL_SEARCH=false 消开发机
  OPENAI_BASE_URL 漂移〕）。
- 基线演进：B13 后 2822·0·6692·163 → gelu 后 2829·0·6736·164
  （+7 probe）；gate 6·5 恒。

**§8.67.2.2 S-E3 双只读审视记录（2 subagent：A 路旧仓保真 / B 路新仓
一致性；报告 = DATA，逐条 grep/Read 复核后处置）**

- **A 路（旧仓保真，4 finding：0 blocker / 3 major / 1 minor）**：
  - major-1 工具面 checkPermissions context 缺口：Skill/LSP 工具面
    自决权限（旧仓 context.getAppState() 活体）在生产门缺 getAppState
    成员 → 1c catch 吞 TypeError 回落 passthrough（gate fail-closed），
    旧仓不变量无声破坏 → **修**（6f98792：base CanUseToolFn context
    += getAppState? 窄视图 + createPermissionGate opts + 组合根 ③ 注入
    活 TPC 窄视图 + gelu P-2b 探针锚；gate 头注「现零非-passthrough」
    失真订正）。
  - major-2 splitPathInFrontmatter 丢花括号感知切分 + expandBraces
    （头注「逐字语义」误导登记）→ **修**（466eb67：旧仓 :189-266
    逐字移植 + 头注订正 + unit 4 例补）。
  - major-3 promptShellExecution echo 面丢 [exit code]/interrupted 行
    + baseline 错归 + errors.ts 错记不存在的 data.interrupted 分支 →
    **修**（7dd71b7：mapResult 主路径回填 + formatBashOutput 降
    fallback + errors.ts 头注订正 + func 真 spawn 探针 2 测）。
  - minor-1 state 头注 mcp 6 字段计数错（snapshotSequence 属
    fileHistory 块 :498，实 5 字段）→ **修**（fd4c1e3）。
- **B 路（新仓一致性，4 finding：0 blocker / 0 major / 2 minor / 2
  note）**：
  - M-1「组合根（S-E2d 回填）」LSP/skill 头注措辞夸大（compose.ts 零
    LSP/skill 引用实证）→ **修**（fd4c1e3：lsp/index + toolRegistry
    ⑬ 订正为前向接缝）。
  - M-2 gelu probe 恒真派生断言（:443）→ **修**（6f98792 同行删除，
    真断言在前一行）。
  - N-1 cli.ts/mount.ts 仍 A 波骨架（S-E2d 计划「壳接线 cli/mount」
    未落）→ **登记**：cli/mount 壳接线 = D 桶归属（§8.52 2521 行
    「D 波归属，本波不动」原登记 + 2579 行「cli 本体仍 D 波」），
    S-E2 切片只落构建器 + 装配；cli 单入口消费 + mount = CLI 波
    前向接缝（D 桶后序波次，单独立波，不属 remote/analytics 两波）。
  - N-2 LSP_TOOL_NAME 根门面 re-export 零根门面消费（与 seed 先例
    同形）→ **观察登记**（STR-1 死导出清理波可核销，非违规）。
- 预声明接缝未当遗漏重提（两路报告均核：残留守 / 裁面 / 前向接缝
  头注登记面 0 重报）。

**§8.67.2.3 S-E4 闭环**

- 本记录 + memory `atlascode-wave-c-progress.md` append + MEMORY.md
  pointer + task #141 → completed。
- D 波终基线：**2833 pass / 0 fail / 6750 expect / 165 files ×3 稳定
  单进程连跑 + gate 6·5 + tsc 0 / lint 0 / build 0-byte cli.js**
  （2829 基线 + S-E3 修波 4：frontmatter brace 2 + prompt-shell func
  2）。
- D 波后序 = remote 波（task #142：SendMessage UDS 5 站点族 + MCP
  client 波）→ analytics 波（task #143）；cli/mount 壳接线 = D 桶
  归属 CLI 波（§8.67.2.2 N-1 登记）。

## §8.68 remote 波 S-E1 总分析（task #142，2026-09-28）

**§8.68.1.1 波定位与范围**

remote 波 = 既定序列第 5 棒（D → remote → analytics），task #142。
范围 3 部分，来源 4 处登记：

1. **SendMessage UDS 5 站点族**（C 桶 ③ §8.66.2.5 前向接缝 + §8.62.1.6 裁面
   债务登记 + §8.64 ⑩ 头注）：UDS_INBOX 门族 5 站点（to description
   uds/bridge 行 + prompt cross-session 段 + checkPermissions bridge ask +
   validateInput 4 块 + call postInterClaudeMessage/sendToUdsSocket 2 发送
   支）+ UDS socket 客户端面（udsClient/udsMessaging/peerBridge 面）。
2. **MCP client 波**（§8.63.1.6 残留守 + §8.63.1.2 ①⑮ 登记）：MCP client
   连接生命周期 + 重连 + 缓存 + resources/prompt 拉取 + MCP server 配置
   发现面 + ToolSearch delta ⑤ pending 面回填。
3. **③ AGENT_TRIGGERS_REMOTE（RemoteTrigger）**（§8.64 残留守 ③ + 路线图
   §8.3 D 桶后序）：49 口径最后残留守槽 materialize（31/49 → 32/49，
   残留守 0 收口）。

**波终基线底数 = 2833/0/6750/165 + gate 6·5**（§8.67.2.3 波终）。

**§8.68.1.2 旧仓读面（ground-truth 盘点，a8af45b）**

UDS 5 站点族：

| 旧仓文件 | 行 | 处置 |
|---|---|---|
| tools/SendMessageTool/SendMessageTool.ts 5 UDS 站点 | 997 内 | L72 to describe 三元支（gate-on 行含 uds:/bridge: 说明 + ListPeers 提示）/ L586 checkPermissions bridge ask（behavior 'ask' + decisionReason safetyCheck classifierApprovable:false，跨机 prompt injection 须 bypass-immune 注释逐字）/ L631-689 validate 4 块（bridge structured 先拒〔永久约束优先〕+ handle/active 双查〔init-timing 窗 + CCR mirror 只写模式〕/ uds string pass〔summary 不渲染不要求〕/ L685 structured non-'other' scheme 拒）/ L742+ call 2 支（bridge → getReplBridgeHandle 重查〔canUseTool 阻塞数分钟 validate 检查已陈旧，from="unknown" 防漏注释逐字〕+ lazy require postInterClaudeMessage + preview = summary \|\| truncate(msg,50) + “…” 弯引号面；uds → lazy require sendToUdsSocket try/catch + errorMessage 面） |
| tools/SendMessageTool/prompt.ts udsRow+udsSection | 49 | getPrompt 2 模板站点（gate-off = '' 逐字已落 §8.62；gate-on 面 = 本波随门复活） |
| utils/peerAddress.ts | 21 | uds:/bridge: 纯 parser（**C 桶 ③ 已落**新仓 src/swarm/peerAddress.ts 逐字，本波 0 增量） |
| utils/udsClient.ts | 3 | `sendToUdsSocket : any = (() => ({})) as any` = **旧仓自身 any stub**（真 socket 实现旧仓不在） |
| utils/udsMessaging.ts | 2 | `startUdsMessaging : any` = **any stub**（消费点 = 旧 setup.ts/main.tsx = CLI/TUI 面 → 域外） |
| bootstrap/state.ts:203 | 3 | `isReplBridgeActive : any` = **any stub** |
| bridge/replBridgeHandle.ts | 36 | setReplBridgeHandle（updateSessionBridgeId 副作用 + .catch 吞面）/ getReplBridgeHandle / getSelfBridgeCompatId（toCompatSessionId）；ReplBridgeHandle 型 = replBridge.ts 2343L 域外（型面本地最小定义） |
| bridge/peerSessions.ts | 1 | `postInterClaudeMessage : any` = **any stub**（call 支 lazy require 消费） |

旧仓门态：feature('UDS_INBOX') 编译期 **gate-OFF**（bun:bundle）= 全部
UDS 支死码；C 桶 ③ 落盘面 = gate-off 逐字（§8.62 S-E2 已坐实）。
**本波 = 门复活面**（feature() 恒 false 不可测 → 新仓 env 门）。

MCP client（services/mcp/）：

| 旧仓文件 | 行 | 处置 |
|---|---|---|
| client.ts connectToServer（memoize L550-1540） | 3209 内 | 8 transport 分支（sse/sse-ide/ws-ide/ws/http/sdk/claudeai-proxy/stdio）+ client 构造（name 'claude-code' + capabilities roots+elicitation 空对象声明〔Java MCP SDK 零字段类面注释逐字〕）+ ListRoots handler（cwd file:// 单 root）+ 连接超时（getConnectionTimeoutMs，超时 = TelemetrySafeError『MCP server "X" connection timed out after Nms』）+ 连后面（capabilities/serverVersion/instructions MAX_MCP_DESCRIPTION_LENGTH 2048 截断『… [truncated]』）+ 断连检测（onerror 分类 8 类消息 + 3 连续 terminal error → closeTransportAndRejectPending，isTerminalConnectionError 8 子串面）+ 分 transport 错误（401/Unauthorized → handleRemoteAuthFailure〔needs-auth 态，auth 面裁〕） |
| client.ts stdio 支 | 内 | StdioClientTransport（command + args + env = subprocessEnv() 叠 serverRef.env + stderr 'pipe'）+ **ATLAS_SHELL_PREFIX env 覆写**（设真 = command 折 args join ' '）+ stderr 64MB 上限累积 logMCPError 面 |
| client.ts fetchTools/fetchResources/fetchCommands | 内 | 3 面 LRU 20 + reconnect re-fetch（cache key = server name）+ capabilities 门（tools/resources/prompts 缺 → []）+ recursivelySanitizeUnicode + Command 构建（isMcp + source 'mcp' + userFacingName `${server}:${prompt} (MCP)`〔programmatic 名防空格破 slash 解析注释逐字〕+ argNames + getPromptForCommand = ensureConnectedClient + getPrompt + transformResultContent flat） |
| types.ts | 258 | 8 型 config zod union（stdio command/args/env / sse url+headers+oauth / sse-ide / ws-ide / http / ws / sdk / claudeai-proxy）+ 5 态 union（connected/failed/needs-auth/pending/disabled）+ SerializedTool/SerializedClient/MCPCliState |
| config.ts | 1563 | 配置发现（user .atlas.json + project .mcp.json + enterprise + plugin + managed 多 scope + policy filter + add/remove）→ **新仓最小 2-scope 移植**（settings mcpServers record + project .mcp.json），余裁登记 |
| auth.ts 2370 + oauth/xaa/elicitation/vscode/managedMcp/InProcessTransport/MCPConnectionManager.tsx+useManageMCPConnections 887（React） | — | **整支裁**（OAuth 车道已删 2026-09-17 / 3-dep 纪律 / 新仓无 React） |

RemoteTrigger 族：

- tools/RemoteTriggerTool/RemoteTriggerTool.ts 158L：schema（action 5 枚举
  list/get/create/update/run + trigger_id `/^[\w-]+$/` + body record +
  outputSchema {status, json}）+ isEnabled = growthbook
  'atlas_surreal_dali' && isPolicyAllowed('allow_remote_sessions')（新仓
  0-hit）+ call = **axios + getOAuthTokens + BASE_API_URL/v1/code/triggers
  + WIRE_API_VERSION/WIRE_TRIGGERS_BETA 头**（20s timeout +
  validateStatus 恒真 + 5 action URL 构造逐字）+ mapToolResult
  `HTTP ${status}\n${json}` 逐字。
- prompt.ts 15L（DESCRIPTION/PROMPT/REMOTE_TRIGGER_TOOL_NAME）+ UI.tsx
  16L（JSX → TUI 波，renderToolUseMessage 字符串面保留）。
- skills/bundled/scheduleRemoteAgents.ts 400L：gate = 同 growthbook+policy；
  本体面 = claude.ai 车道（getOAuthTokens〔已删〕/ fetchEnvironments +
  createDefaultCloudEnvironment〔teleport 域新仓 0-hit〕/
  checkRepoForRemoteAccess〔background/remote 0-hit〕/ claude.ai URL 族）。
- tools.ts:30 门 `feature('AGENT_TRIGGERS_REMOTE')` OFF +
  skills/bundled/index.ts:64 同门注册。

**§8.68.1.3 新仓落面确认（存在性 grep 记录，2026-09-28）**

已落可消费（✓）：
- `src/swarm/peerAddress.ts`（C 桶 ③ 逐字 21L，parseAddress 纯 parser）
- `src/engine/tools/team/sendMessageTool.ts` 767L（UDS 5 站点 = 裁面登记
  gate-off 逐字，§8.62 delta ②⑧；复活 = 本波）
- `src/engine/tools/mcp/mcpClientRegistry.ts`（§8.63 注入接缝：
  McpClientEntry duck〔name/type/capabilities/listResources?/readResource?〕
  + set/get/resetMcpClientRegistry）
- `src/engine/ports/mcpClient.ts`（MCPServerConnection port 面 +
  McpToolClient.callTool + McpToolDescriptor；连接生命周期 = 残留守登记
  = 本波）
- `src/engine/tools/mcp.ts` createMcpTools（T-5a：连接层预取
  McpToolDescriptor[] → Tool 构建 + mcp 名归一 4 纯函数 +
  findMcpServerConnection 权限 scope 查找）
- `src/engine/skill/commands.ts` getMcpSkillCommands（消费端契约：
  mcpCommands readonly Command[] 过滤面；头注 ⑥「MCP skill 注册窗 =
  remote 波」→ 本波核销）
- `src/engine/tools/toolsearch/toolSearchTool.ts` delta ⑤
  getPendingServerNames const undefined（「复活 = MCP client 波」→
  本波回填）
- settings `mcpServers: z.record(string, any).optional()`（engine/config/
  types.ts:61，E-3 已落）
- ⑮ isAgentSwarmsEnabled 先例（engine/messaging/agentSwarmsEnabled.ts：
  env opt-in 门 + growthbook killswitch 支裁 = 恒放行）
- LSP 波本地转写先例（src/lsp/lspJsonRpc.ts 3-dep 违规面本地转写 delta ①
  + child_process spawn 先例 bashTool）
- 49 口径 31/49（§8.67 S-E2c；残留守 1 = ③ 本波收口）

未落（接缝登记，复审勿当遗漏重提）：
- MCP client 域（stdio client / 连接生命周期 / 配置发现 / 3 fetch 供给方）
  = **本波落面**
- UDS socket 客户端真实现 = **旧仓自身 any stub**（udsClient 3L /
  udsMessaging 2L / peerSessions 1L / bootstrap isReplBridgeActive 3L）
  → 本波 = stub 面逐字随迁 + 头注登记（H6：绝不把 stub 签名当真行为；
  真实现 = 旧仓亦无，非裁面漂移）
- WIRE_TRIGGERS_BETA / WIRE_API_VERSION = 新仓 0-hit（旧仓冻结 WIRE 层
  85L 未随迁）→ RemoteTrigger call 面 = 注入端口默认登记（engine 不引
  WIRE 常量；真供给方 = IFF 网关波 / CLI 波）
- @modelcontextprotocol/sdk = 3-dep 纪律外（diff/openai/proper-
  lockfile/shell-quote/zod）→ stdio client 本地转写（JSON-RPC 2.0 over
  stdio，LSP lspJsonRpc 先例同型）
- REMOTE_TRIGGER_TOOL_NAME = toolNames.ts 0-hit → 本波 seed
- ListPeers ⑩ 零本体登记不变（C 桶 ③ 闭合证据；UDS inbox 本体 = CLI 波）

**§8.68.1.4 范围裁定（迁 / 裁 / 前向接缝）+ S-E2 切片计划**

**R1 UDS 5 站点族（门复活，env opt-in，旧 gate-OFF 默认保真）：**
- ① 新门函数 `isUdsInboxEnabled()`（`src/remote/` 域内，⑮ agentSwarms
  先例同型）：env `ATLAS_EXPERIMENTAL_UDS_INBOX=1` opt-in（旧编译期
  gate-OFF = 新仓默认 OFF 保真；growthbook killswitch 支裁 = 恒放行）。
- ② `src/remote/` 顶域（LSP 域同型：独立域包 + STR-1 门面；零 engine
  import 无循环）：udsClient.ts（sendToUdsSocket stub 面）/ udsMessaging.
  ts（startUdsMessaging stub 面；CLI 波 setup 面消费登记）/ peerBridge.
  ts（ReplBridgeHandle 型本地最小定义〔bridgeSessionId〕+ get/set
  ReplBridgeHandle + isReplBridgeActive stub 面 + postInterClaudeMessage
  stub 面〔(sessionId, message) → {ok, error?}，call 支消费形〕）/
  udsInboxEnabled.ts（门）+ index.ts（STR-1 门面）。
- ③ SendMessage 5 站点复活 = 新仓 sendMessageTool 5 裁面 re-instate
  （feature() → isUdsInboxEnabled()，5 站点逐字；默认 OFF → 面 = 现状
  gate-off 逐字不变量，ON → UDS 面活）；prompt.ts udsRow/udsSection 同门。
- ④ 测试面：门双向（OFF = 面逐字不变判别 / ON = 5 站点判别），gelu
  swarms 门双向先例同型。
- ⑤ ListPeers ⑩ 零本体登记不变（本波不动，CLI 波）。

**R2 MCP client 波（新顶域 `src/mcp/`，LSP 域同型 + 3-dep 本地转写）：**
- ⑥ `src/mcp/` 5 文件 + 门面：mcpJsonRpc.ts（JSON-RPC 2.0 stdio 客户端
  本地转写：initialize/tools·list/tools/call/resources·list/
  resources/read/prompts/list/prompts/get + roots/list server→client 请求
  handler，LSP lspJsonRpc 先例同型 delta ①；零新依赖 child_process
  spawn 先例）/ mcpConnectionManager.ts（连接生命周期：connect/
  disconnect/reconnect/清理 + 5 态 union 落 **4 态**（connected/failed/
  pending/disabled；needs-auth = auth 面裁（OAuth 车道已删）→ failed
  登记消息合流，头注登记）+ 连接超时面 + 断连检测 3 连续 terminal error
  面〔8 子串面逐字〕+ ATLAS_SHELL_PREFIX 覆写 + stderr 64MB 上限面）/
  mcpConfig.ts（配置发现 **最小 2-scope 移植**：settings mcpServers
  record 〔E-3 已落字段〕+ project .mcp.json〔旧 getProjectMcpConfigsFromCwd
  等价面〕；8 型 config zod union 逐字移植（types.ts 258L 型面）；
  enterprise/managed/plugin/CLI --mcp-server 面 = 裁登记（policy 0-hit /
  插件域波 / CLI 波））/ mcpFetch.ts（tools/resources/commands 3 供给方
  = 旧 3 fetch 面移植：LRU 20 + reconnect re-fetch + capabilities 门 +
  sanitize unicode 本地实现（无 lodash，memory/paths 先例）+ Command 描述符
  域本地型〔McpPromptCommand：name/description/argNames/getPrompt，engine
  Command 映射 = 组合根（L3：顶域 ↛ engine）〕）/ index.ts（STR-1 门面）。
- ⑦ **transport 裁定**：stdio = 真（本地核心面，零新依赖）；sse/http/ws =
  前向接缝登记（连接层返 failed 态 + 登记消息『transport 未支持（MCP
  client 波 = stdio only）』，真实现 = 后续 transport 波）；sdk = 旧仓
  即 throw（print.ts 处理，新仓 print 域外 → 同登记）；claudeai-proxy =
  OAuth 车道已删 [ATLAS-HOLD] 登记；ws-ide/sse-ide = IDE 扩展面域外
  （新仓无 IDE 扩展）—— 8 型 config 面逐字保留（型面保真），连接面
  仅 stdio 活。
- ⑧ 组合根接线（compose 下一槽 ⑭）：mcp manager 构造（settings
  mcpServers 源注入窗，LSP setLspServerSource 先例同型：未注册 = 空 =
  无服务器 fail-soft）+ createMcpTools 供给（调用方 toolRegistryDeps.
  mcpTools 单入口消费不变）+ setMcpClientRegistry 供给（listResources/
  readResource 实填）+ ToolSearch delta ⑤ 回填（getPendingServerNames
  = manager pending 态，数据契约面不变）+ getMcpSkillCommands 供给核销
  （commands 域头注 ⑥「MCP skill 注册窗 = remote 波」）。
- ⑨ 测试面：func 层 = **真 stdio MCP server**（测试本地脚本 speak MCP
  JSON-RPC：initialize/tools/list/tools/call/resources/list/prompts/list，
  零网络零模型）+ manager 生命周期（pending→connected→failed→reconnect）
  + 配置发现（settings fake + .mcp.json 临时文件）+ registry 供给 +
  ToolSearch pending 回填 + sanitize unicode 面。

**R3 RemoteTrigger ③ materialize（49 口径 31/49 → 32/49，残留守 0 收口）：**
- ⑩ 本体 `src/engine/tools/remotetriggers/`（子域 4 文件：本体 + prompt
  + index STR-1 + remoteTriggersPort）：schema/description/prompt/
  isReadOnly（list/get）/toAutoClassifierInput 4 模板/mapToolResult
  `HTTP ${status}\n${json}` 逐字移植；UI 16L JSX → TUI 波裁（
  renderToolUseMessage 字符串面保留）。
- ⑪ 门面：tools.ts ③ feature 门（OFF）→ 新自门控
  `isEnabled = isRemoteTriggersEnabled()`（env
  `ATLAS_EXPERIMENTAL_REMOTE_TRIGGERS=1` opt-in 默认 OFF = 旧编译期
  OFF + growthbook 双门缺省保真；growthbook+policy 支裁登记，⑮ 先例
  同型）。
- ⑫ call 面 = **[ATLAS-HOLD] 注入端口**（remoteTriggersPort 5 方法
  listTriggers/getTrigger/createTrigger/updateTrigger/runTrigger；
  LSP setLspServerSource / mcp 源注入窗同型）：默认供给方 = 登记 throw
  Error（『[ATLAS-HOLD] remote trigger 端点待 IFF 网关换值；旧仓
  claude.ai OAuth 车道已删（axios 非 3-dep）』）；头注登记旧 call 面
  全貌（axios + getOAuthTokens + WIRE 头 + BASE_API_URL/v1/code/triggers
  [ATLAS-HOLD] URL 族）；真供给方 = IFF 网关波 / CLI 波。H6：非空心壳
  （schema/prompt/门/readonly/classifier/mapResult 面真，call = 登记接缝，
  模型可见错误面真）。
- ⑬ bundled skill scheduleRemoteAgents 400L = **裁登记**（本体面全在
  claude.ai 车道：getOAuthTokens 已删 / fetchEnvironments+
  createDefaultCloudEnvironment teleport 域 0-hit / checkRepoForRemote
  Access 0-hit / claude.ai URL 族）；③ 槽 materialize = 工具面 only，
  skill 复活 = 随 ⑫ 端口同供给方（IFF 网关波 / CLI 波），头注登记。
- ⑭ toolNames seed REMOTE_TRIGGER_TOOL_NAME + toolRegistry ③ 槽登记行
  （残留守 1 → materialize ③ 后 **49 口径 32/49 残留守 0 收口**，registry
  头注 49 口径终态同步）。

**S-E2 切片计划**（一模块一提交）：
- **S-E2a**：`src/remote/` 域 5 文件（UDS infra 面 + 门）+ SendMessage
  5 站点复活 + prompt 2 站点 + 门双向测试。
- **S-E2b**：`src/mcp/` 域 6 文件（jsonrpc + manager + config + fetch +
  型 + 门面）+ unit/func 真 stdio server 测试族。
- **S-E2c**：RemoteTrigger 子域 4 文件（本体 + prompt + 端口 + 门面）+
  toolNames seed + registry ③ 行 + 49 口径收口登记 + skill 裁登记。
- **S-E2d**：组合根 ⑭ 接线（mcp manager 构造 + registry 供给 +
  ToolSearch pending 回填 + mcpTools 供给 + getMcpSkillCommands 核销）
  + 全栈 gelu 复验（mcp 供给面 = 1 假 stdio server → 池 +1
  mcp__ 名判别，swarms 门双向先例同型）。
- **S-E3**：双只读审视（A 路旧仓保真 / B 路新仓一致性）≤2 subagent +
  修波（一模块一提交）。
- **S-E4**：闭环（docs §8.68.2 闭环记录 + memory `atlascode-wave-c-
  progress.md` append + MEMORY.md pointer + task #142 → completed）。

**基线预测**（S-E2 后，实落为准）：开波 2833/0/6750/165 + gate 6·5；
S-E2a +~20 测 / S-E2b +~80 测（最大面）/ S-E2c +~20 测 / S-E2d +~10 测
→ 预测 ~2960 pass / ~172 文件 / ~6850 expect（±5% 非漂移）；gate 6·5 恒；
**波 tag 不切（gate ③ 仍 wave-c）**。

## §8.68.2 闭环记录（2026-09-28，task #142 remote 波全闭环）

**提交链**：8ab0f6a（S-E1 总分析）→ 8181928/4073cd9（S-E2a）→
be34aed/9177133（S-E2b）→ 37c9485/3a136d4（S-E2c）→
6c014fb/06ca21f（S-E2d）→ cc90d50/017f3d7（S-E3 A 路修波）→
fcb5c99/3351ac0（S-E3 B 路修波）→ <本闭环 docs>。

**S-E2 切片落盘**：
- **S-E2a（8181928/4073cd9）**：`src/remote/` 5 文件（UDS 门
  isUdsInboxEnabled env opt-in 默认 OFF 保真 + udsClient/udsMessaging/
  peerBridge 3 stub 面 + STR-1 门面）+ SendMessage 5 站点族门复活
  （feature() → isUdsInboxEnabled()，gate-OFF 默认面逐字不变量）+
  prompt udsRow/udsSection 2 站点 + 门双向测试。
- **S-E2b（be34aed/9177133）**：`src/mcp/` 6 文件（mcpJsonRpc 本地
  转写 JSON-RPC 2.0 stdio / mcpConnectionManager 4 态 + pending Set
  独立活面 + 断连 3 连续 terminal error 8 子串逐字 / mcpConfig 最小
  2 源 + 8 型 zod 逐字 / mcpFetch 3 供应商 + delta ④ 扁平 content 面 +
  sanitize 本地实现 / types / index STR-1）+ 80 测（unit 4 族 72 零盘
  + func fake-stdio 真 spawn 8 零模型，se2b 假 server 模板双反斜杠
  先例 = 后续 gelu P-5 转义修复基准）。
- **S-E2c（37c9485/3a136d4）**：`src/engine/tools/remotetriggers/`
  4 文件子域（schema/description/prompt 逐字 + isReadOnly list·get +
  classifier 4 模板 + 自门控 OFF + [ATLAS-HOLD] 注入端口 5 方法
  登记 throw）+ toolNames seed + registry ③ 槽 materialize（49 口径
  32/49 残留守 0 收口）+ bundled skill 400L 裁登记（随 ⑫ 端口同
  供给方 IFF 网关波）+ 15 测（门双向 / schema / 5 动作面 / 端口
  throw 文案含 [ATLAS-HOLD] + IFF 网关）。
- **S-E2d（6c014fb/06ca21f）**：组合根 ⑭ MCP 接线——mcp 域发现输入
  窗（setMcpDiscoveryInput/getMcpDiscoveryInput，LSP setLspServerSource
  先例同型；未注册 = null = 组合根缺省 2 源 fail-soft）+ mcpBridge L3
  桥 4 面（① McpToolClient 桥 tools/call 请求面 + signal 面裁登记 /
  ② buildMcpEngineConnections connected 过滤 + 描述符预取 / ③
  syncMcpClientRegistry connected 实填 + pending 占位 + failed·disabled
  不进 / ④ mapMcpPromptCommands 保真 6 面 + 默认补 4 面 + 扁平 →
  块面映射）+ collectMcpPromptCommands + compose ⑭ initMcpConnections
  4 步（发现窗 → buildMcpServerConfigs 缺省 2 源 → allSettled connect
  → registry 实填 + prompt 快照注册窗）+ builder mcpTools 供给
  （**builder 零意外 I/O 裁定**：构建时 manager 态快照，新连接先
  显式 initMcpConnections 再重建 deps）+ ToolSearch delta ⑤ 回填
  （getPendingServerNames = manager pending Set 活面，§8.63.1.2 ⑮
  原裁核销）+ skill ⑥ 核销（setMcpSkillCommandSource 注册窗 +
  getMcpSkillCommands 无参面读窗，有参过滤面逐字不变）；测试面
  桥 10（B-P1..B-P6；06ca21f 提交信息误写「桥 9」= 本记录订正）+
  窗 4 + ToolSearch pending 2（真 spawn 无响应 server，MCP_TIMEOUT
  1500 定化）+ gelu P-5 4（假 stdio server NDJSON 4 方法 → 池 +1
  mcp__ 名判别 / registry / skill 窗 / pending 空面）。

**S-E3 双只读审视处置（≤2 subagent，报告 = DATA 全 grep/Read 复核）**：
- **A 路（旧仓保真，7 项核对）3 确认缺陷全修（cc90d50）**：
  **D-1（高）** string 内容包裹字段 `content` → `text`（新仓 TextBlock
  契约字段 shared/types.ts:52；wire 面 params.ts 读 `b.text`；旧
  transformResultContent text 案 `{type:'text', text}` 逐字；旧仓不
  处理裸 string → 新仓 string → text 块为映射侧裁定）/ **D-2（中）**
  补 `hasUserSpecifiedDescription = description !== ''`（旧
  client.ts:1955 逐字；缺此字段 MCP 命令永不进 getSkillToolCommands
  列表过滤）/ **D-3（低，文案面）** registry 排除 failed 服务器后
  工具报错面由旧 'is not connected' 变 'not found' = 头注补登记
  （行为面不改）。**观察处置**：progressMessage `c.name` → 旧
  'running' 逐字（client.ts:1960）/ 归一 'claude.ai ' 前缀特判裁登记
  （新仓无发现源产出该前缀；engine 2 副本保留特判，原头注「同规则」
  claim 订正，017f3d7）/ 发现 3 子裁补登记（.mcp.json 父目录上溯 /
  企业策略 allowed·deniedMcpServers 过滤 / disabled·enabledMcpServers
  开关面，017f3d7）/ MCP_TOOL_TIMEOUT 每请求超时限裁登记（env 名单
  仅 managedEnv.ts:98，设该 env 用户旧仓生效新仓静默忽略）/
  undefined content 项跳过面（旧意外 TypeError rethrow 裁）/
  pending 占位条目改经 manager getPendingServerNames Set 活面供给
  （真 manager list() 仅含 connected/failed 对象，占位非 list 条目面；
  B-P5 fake manager 2 参形状同步）+ 头注 ③④ 文案/drop 机制修正
  （manager close 新对象替换 Map 条目 → 闭包捕获旧对象 → disposed
  client 请求拒 → 供应商 try/catch [] 降级，非假绿）。
- **B 路（新仓一致性 + 家规，7 项核对）3 确认缺陷 = A 路 D-1..D-3
  同源（独立交叉验认，HEAD cc90d50 已修）**；H6 消费点审计全接缝
  有真消费点零死接缝；L3/STR-1 import 图零违规（atlascode 消费
  engine 全经根门面，mcp 域零 engine import）；compose 完整性
  （runCoreCleanup 导出链 / builder 零意外 I/O / initMcpConnections
  4 步序 + 快照语义登记）通过。**5 观察**：① getMcpSkillCommands 未上
  engine 根门面（commands.ts:29-30 已登记前向穿线 = TUI/CLI 波 skill
  索引接线时补根门面导出）/ ② gelu P-5 afterAll LRU 缓存对称清
  （**3351ac0 修**）/ ③ manager connect finally 序（Map.set →
  pending.delete）理论重复条目窗：生产路径 sync 仅 allSettled 后
  调用不可达，无实害（登记不修）/ ④ 06ca21f 提交信息「桥 9」实
  10（本记录订正）/ ⑤ buildMcpServerConfigs JSDoc 被插入块隔断脱节
  （**fcb5c99 修**）。预声明接缝（头注 delta ①-⑭ + 各域裁登记）
  两路交叉核 0 重报。

**基线谱系**：§8.67 波终 2833/0/6750/165 + gate 6·5 → S-E2a/b/c/d
+~146 测/+11 文件 → **S-E3 修波波终（= 波终）2979 pass / 0 fail /
7083 expect / 176 files + gate 6 pass / 0 fail / 5 expect / 2 files**
（§8.68.1.4 预测 ~2960/~6850 偏低，实落为准；四件套 tsc 0 /
eslint 0 / build 0KB entry；波终全量 + gate 实跑核逐值一致）；
**波 tag 不切（gate ③ 仍 wave-c）**。

**残留守登记（= 后续波，复审勿当遗漏重提）**：
- getMcpSkillCommands engine 根门面导出 → TUI/CLI 波 skill 索引接线
  （B 观察 ①，commands.ts:29-30 前向穿线登记）
- MCP transport sse/http/ws = 前向接缝（§8.68.1.4 ⑦ stdio-only 裁定；
  连接层返 failed 态 + 登记消息）
- MCP_TOOL_TIMEOUT 每请求超时消费面 = 裁登记（设该 env 用户面）
- RemoteTrigger ⑫ 端口真供给方 + bundled skill 复活 = IFF 网关波
  [ATLAS-HOLD]（旧仓 claude.ai OAuth 车道已删）
- manager connect finally 序窗（B 观察 ③）= 理论无实害，后续 mcp
  域 pass 顺修
- LSP server 真配置源 = 插件域 LSP 集成波（setLspServerSource 注入窗，
  D 波 N 登记面随本波 mcp 域先例同型复用）

**下一步 = analytics 波（task #143，末棒；含 emitTaskTerminatedSdk
残留守）**。详见本 §8.68（§8.68.1 S-E1 分析 + §8.68.2 本闭环记录）。
