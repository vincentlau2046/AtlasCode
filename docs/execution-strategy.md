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
D 波（8-15 天，串行）：壳接线 → 全栈 gelu 复验 → wave-d tag
   ↓
F 波（3-5 天，串行）：清尾 → B13 → wave-f tag → 旧仓 archive
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

**新增残余**：⑤ `buildSchemaNotSentHint`（旧仓 toolExecution 小件）依赖 ToolSearch 特性族（新仓未移植），现搬造假依赖 → 留接缝归 **E-1b/工具面**（随 inputSchema JSON schema 校验 + 旧仓 zod safeParse 替身）⑥ **engine anti-stub 门建设**（T-5 裁定，wave 级任务）⑦ E-1 `compose.ts` engine 装配（QueryEngine 构造 + ask 入口）未接线（DEP-5 组合根 allow 已预铺，E-1 非组合根接线波，归 E 波组合根子任务）。

**四件套基线更新**：tsc 0 / lint 0 / build 0 / **472 pass 0 fail（42 文件 875 expect）**（E-1 开波基线 450/39/824 → T-1 454/40/840 → T-3 460/41/851 → T-2 472/42/875）。

**下一步 = E-1b context 压缩层**（compact/microCompact/sessionMemory ~4700L）+ 移入的 T-4 多轮 fixture replay。
