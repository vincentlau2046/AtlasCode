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
