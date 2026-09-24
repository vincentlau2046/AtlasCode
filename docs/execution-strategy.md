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
