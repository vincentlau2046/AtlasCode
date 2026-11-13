# W-opt 国产轨 · DSH rc.8 模块研读笔记（f4 零码）— 2026-11-06 起

事实源：本机 `~/projects/deepseek-harness` @ `09d38feb8a`（= dsh-v0.1.0-rc.8 + 1 examples）。逐模块追加；替代方案落点 = AtlasCode port/deps 注入架构内（禁 engine→TUI import），非 vendor 照搬。

## ① compaction（研读完成 2026-11-06）

### DSH 侧形态（引证）

**包结构**（`packages/compaction/`，四子包共 2880L src）：
- `compaction/` 792L = 服务缝定义（abstract `CompactionEngine` extends cordis Service，`ctx.compaction`）
- `compaction-basic/` 1621L = 默认实现（replay-aware）
- `compaction-tool-result-pruner/` 331L = 伴生裁剪器
- `command-compact/` 136L = 命令面

**三入口**（`compaction/src/index.ts`）：
1. `compactIfNeeded(agent, trigger, signal)` — 自动触发，`trigger: 'pressure' | 'context-overflow'`（后者 = provider 确认的 `CONTEXT_WINDOW_EXCEEDED_CODE`，独立于阈值判定）
2. `compactNow(agent, signal, sourceCommandId)` — 显式压缩，经 `runMaintenance` 空闲串行化（withholding later waking input），FIFO 排队
3. `compactRegion(start, end, …)` — 强制区间，两端须 tool-pairing balanced

**触发策略**（`compaction-basic/src/config.ts`）：per-routed-model target policy，`thresholdRatio` 默认 **0.8** × contextWindow；retention 预算独立；`retainTokens >= thresholdTokens` 拒绝（不可修面）。

**区间选择**（`region.ts:98` `selectCompactableRange`）：token-meter 定价节点从尾部累加至 retainTokens → 向前回退至 `toolPairingBalancedBefore` 平衡边（assistant tool_calls 与 result 恒成对，两端同查）→ 零安全区间返 null。meter/session 表面不一致 = throw（防陈旧定价）。

**事务/锁模型**（`region.ts:152` `compactSurfaceRegion`）：durable `compaction/start` 标记 = 压缩锁（同步相邻于 idle/log 校验，先于 summarization yield）；每次失败**恰一次** `compaction/end` 尝试，失败关闭**故意留下未配对 start 可检测**；`assertNoActiveCompaction` 入口断言。伴生 `invariant.ts`（306L）= 日志流不变式插件（start/summary/end 状态机 + checkpoint 品牌校验 + sourceCommandId 跨事务稳定）。

**摘要器 KV-cache 设计**（`compaction-basic/src/summarizer.ts:27-32` 头注）：压缩指令作为 **replay 对话后的最后一条 user 消息**（非独立 system prompt）→ 辅助调用是最后一条 routed request 的**真前缀** → provider KV cache 复用而非失效。结构化 markdown checkpoint（`<compacted-summary>` 标签包裹落盘）。失败分类 `ManualCompactionError`（busy/cancelled/changed/summary/commit/persistence 六码）。

### AtlasCode 同域现状

- `engine/context/autoCompact.ts`：阈值 = contextWindow − min(maxOutput,20k) − 13k buffer（非 ratio 制）；tracking 语义（compacted/turnCounter/consecutiveFailures）；连续 3 败熔断（`autoCompactCircuit.ts`）；env 覆写收拢 config 面；无 countTokens fail-safe。
- `engine/context/compact.ts` 1007L：`<analysis>/<summary>` 九段摘要 prompt（安全指令逐字保留条款）；`formatCompactSummary`；boundaryMarker + summaryMessages + messagesToKeep 结果面。
- 登记残留守（autoCompact.ts 头注）：sessionMemoryCompact / promptCacheBreakDetection（**cache 面归 modelprovider 域，未做**）/ reactive compact / collapse。

### 对照 → 替代方案候选（按价值排序）

| # | DSH 机制 | AtlasCode 现状 | 候选价值 |
|---|---|---|---|
| C-1 | **KV-cache 保真摘要**（指令=最后 user 消息真前缀，同模型时 cache 复用） | **已核（print.ts:1190 + loopDeps.ts:267 双车道）：指令后置形已在**（`[...msgs, prompt]`）；真 delta = ① 路由 role:'small'（非同模型则 cache 池不同，复用前提破）；② system prompt/tools 线格式奇偶未证（DSH 明言「保留对话自身 system+tools 使真前缀成立」，AtlasCode 辅调用是否带同 tools 待 provider 面核） | 中→**待核**——单模型池（如现 glm-5 单面）下 small=main 时价值升高；核 ② 后定 |
| C-2 | **tool-pairing 平衡边选择** | **已核（compact.ts:549）：`messages.slice(-keepRecent)` 无 pairing 平衡检查**——切点可落 tool_use/tool_result 中间（keepRecent>0 时） | **高**——孤儿 tool_result 边是 provider 拒绝/resume 兼容硬伤族（085 R-085-1 同族缝）；修法小（切点回退至平衡边，沿 DSH toolPairingBalancedBefore 语义） |
| C-3 | **provider 确认 overflow 触发**（第二触发类） | **已实现（0.1.92 波前活码重核勘误 2026-11-07，初判口径作废）**：413/PTL 反应式压缩 0.1.37 D1 双车道在位（engine/query/loop.ts:875-935 消费点 + TUI contextHostWiring 全量体 + headless engine/loopDeps.ts:264 窄体；`reactiveRetried` 全 loop 一次性门，非每轮 hammer）；阈值路径三败熔断独立（autoCompact.ts:683）。残面 = `isReactiveCompactRecoverableError` 判形对现网错误形态覆盖小核（归 0.1.92 C-3 登记收口件） | 已核销——登记收口 |
| C-4 | **durable 事务标记 + 不变式插件**（压缩锁落盘可恢复） | 内存熔断 + 内存 tracking（crash 即失） | 中——crash 后压缩中断可检测可续；体量较大 |
| C-5 | 失败六码分类 + tool-result-pruner 伴生 | 失败面笼统 | 低（顺带） |

**首波建议形态**（C-2 已坐实）：**C-2 单件入首波**（小面高价值、判别清晰）；C-1 待 tools/system 奇偶核后定（若奇偶成立且单模型池 → 同波或紧随波）；C-3/C-4/C-5 登记候补。判别单测要求：① 区间边 tool_use/result 配对断言（RED = keepRecent 构造跨界切点 → 现 slice 产孤儿 tool_result 直证，GREEN = 切点回退平衡边）；② （若 C-1 入波）摘要调用请求体与末轮 routed request 前缀恒等断言（cache 复用直证）。

### 待核（下轮补）
- [x] AtlasCode 切点 tool-pairing 核（**缺口坐实**，C-2）
- [x] C-1 指令后置形核（已在；余 tools/system 奇偶 + small 路由前提）
- [ ] compaction-tool-result-pruner 331L 细读
- [ ] `spill` 包与 compaction 关系（同域？）
- [ ] C-1 provider 面 tools/system 奇偶直证（抓摘要请求 wire 对比末轮请求）

## ② subagent（研读完成 2026-11-06）

### DSH 侧形态（引证）

**包结构**（`packages/subagent/`，9 子包共 ~9548L src）：
- `subagent/` 核心缝：registry（`ctx.subagents`，多命名 provider 共存，镜像 LLM adapter registry 非 bash 单例）+ `start` / `startContinuable` / `followup` 三操作（index.ts 头注）
- provider 族：`subagent-in-process-driver` / `subagent-fork-in-process` / `subagent-acp` / `subagent-codex`（wire.ts 744L）/ `subagent-claude-code`（run.ts 594L）/ `subagent-dsh-sdk`——同一缝多后端
- 模型面消费：`tool-subagent`（476L）+ `tool-subagent-control` + `tool-subagent-report`

**continuation.ts 1545L（最大件）**：continuable child = **一条持久 Session + 至多一个进程内 Activation**（一次 residency epoch）；Activation 非请求/结果/取消边界，可执行多 FIFO 回合，descendant 存活期间保持驻留；Agent inbox 是唯一回合队列（manager 只管驻留，loop 管全部回合序）；cold resume（从持久 descriptor 重建 child Agent）；child-first disposal；settlement 投递给 parent 由 manager 负责（`subagent/end` 外部监听者**不可能正确做**——payload 无 parent 名、handle 已 dispose）。descriptor 持久化 fold/snapshot（descriptor.ts 314L）。

**depth 守**（depth.ts）：委托深度 = parent+1；**持久化 session header 为权威且单调——runtime options 只可加深不可降低**（resumed child 带新 options 若从零计则「冒充顶层再委托」逃逸）。显式列为此洞的防御。

### AtlasCode 同域现状

- `tui/tools/AgentTool/`：`computeChildSpawnDepth`（parentOptions.spawnDepth ?? 0 + 1，纯函数）+ runAgent.ts:320-333 线程化到 child options（嵌套 async→async 面有显式处理）；fan-out 门（coordinator 模式 + depth cap 下 allowFanOut）。
- `engine/tools/agent/AgentTool.ts`：无 resume/persist/continu 命中（grep 零）——**child 深度在 resume 后是否保持未证**（AtlasCode 子代理会话恢复面：0.1.83 K4 波做了 session resume 持久化，child options 重建路径待核）。
- swarm/teammate 面：mailbox 硬化 0.1.36；teammate_shutdown_batch（0.1.89 §6.2 已核=渲染折叠产物）。

### 对照 → 替代方案候选

| # | DSH 机制 | AtlasCode 现状 | 候选价值 |
|---|---|---|---|
| S-1 | **深度单调持久守**（resume 不得归零重委托） | spawnDepth 运行时线程化在场；resume 路径深度来源待核——若 options 重建即归零 = 同洞 | **待核定级**（一单测即可定：resume child 再 spawn 是否受 cap） |
| S-2 | **durable continuable children**（一条 Session 一 Activation，cold resume，descendant 驻留保持） | 子代理 = 一次性 run（结果返回即弃）；长任务 child 无跨进程续命 | 高但**体量大**（continuation manager 1545L 语义面）——登记不排首波，W-opt 中期件 |
| S-3 | 多后端 provider registry（acp/codex/claude-code/sdk 同缝） | 单 AgentTool 缝 | 低优先（当前无多后端需求） |
| S-4 | settlement 投递归 manager（外部监听不可能正确） | agentDisplay/UI 面自有 | 参考语义，不独立成件 |

**待核（下轮）**：S-1 resume 深度直证（构造 resumed child spawn 场景）。

## ③ sandbox（研读完成 2026-11-06）

### DSH 侧形态（引证）

**包结构**（共 ~6563L）：`sandbox/sandbox` 719L（缝 + escalation）+ `sandbox-local` 567L（本机 OS 级执行后端）+ `sandbox-windows-acl` ~1580L（Win32 ACL FFI/spawn）+ `e2b/subprocess-e2b` 698L + `e2b/fs-e2b` 582L（远端执行后端族）。

**缝形态**（sandbox/src/index.ts 头注）：「同世界进程禁闭」——wrap 精确 argv 于 host-path file policy 下；容器/microVM/远端是**替换外层缝**而非本缝（本缝共享 host kernel/fs）。模式词汇封闭三元：`read-only | workspace-write | danger-full-access`；**fail-safe 默认 = read-only**（policy/index.ts:56 显式）。

**escalation 编排**（escalation.ts 189L）：`sandbox_permissions` + `justification` 成对校验在**执行时**（明确不进 tool schema——schema 表达不了）；`WIDER_MODES`（可升往何处）与 `ESCALATION_TARGETS`（封闭目标词汇，read-only 是地板不可升达）；denial marker + 同回合 escalation hint（nudge 落在决策点）。

**durable 模式事件**（sandbox-policy/index.ts 头注）：`sandbox/mode` 事件落 session 持久层，fold 进模型历史 → **replay 重建与执行面同一 mode+root**（mode 变更跨 resume 一致）。

### AtlasCode 同域现状

- `tui/sandboxCompat`（getSandboxManager）+ BashTool `bashPermissions.ts`：sandbox auto-allow（autoAllowBashIfSandboxed，尊重显式 deny/ask 规则）+ sandbox.excludedCommands（自注「非安全边界」）+ escalate-to-leader（**分类器转发语义**，非 mode 升级词汇）。
- config settings.ts sandbox 按源直读面；无 `sandbox_permissions`/`workspace-write` 词汇（grep 零命中 src 产品码）。

### 对照 → 替代方案候选

| # | DSH 机制 | AtlasCode 现状 | 候选价值 |
|---|---|---|---|
| SB-1 | **执行时 escalation 编排**（permissions+justification 成对、封闭目标词汇、denial marker+同回合 hint） | auto-allow + excludedCommands；无 per-call 升级词汇 | 中——对齐 Claude 商用版 sandbox_permissions 面（对齐区间内存在此面）+ 安全语义更完整 |
| SB-2 | **durable session-mode 事件**（replay 重建 mode+root） | 模式为进程内存态 | 中——resume 后沙箱模式漂移风险消除（0.1.83 K4 resume 族同域） |
| SB-3 | read-only fail-safe 默认 | 现状默认面待核 | 低-中（默认语义变更须用户裁定） |
| SB-4 | OS 级本机后端（landlock/bwrap 类）+ Win ACL + e2b 远端 | sandboxCompat 现状（实现层待核） | 待核——若现实现无 OS 级禁闭则价值升 |

**待核（下轮）**：sandboxCompat 现实现禁闭层级（进程级？命名空间级？）；SB-3 现默认值。

## ④ code-runtime（研读完成 2026-11-06）

### DSH 侧形态（引证）
三子包共 2696L：`code-runtime` 137L 缝定义（「run one model-written program against host async bindings」，runtimes 无 tool/session 概念）+ `code-runtime-worker-thread` 1611L（JS 后端：worker 线程 + log 捕获）+ `code-runtime-python` 656L protocol + bootstrap（CPython 子进程，**JSON-lines 走 fd 3**，stdio 三管留程序自有输出；host 侧把每个入站帧当敌意输入——模型代码可经同 fd 投递任意内容）。
关键设计：**可移植标识符缝**——跨后端共享的 binding globals 拒绝集（console/__dsh_main__/__name__/__debug__），保证一个后端合法的命名空间清单在所有后端合法（跨语言 mirror 测试钉 PROTOCOL_FD=3 常量双侧一致，漂移即响）。

### AtlasCode 同域现状
无对应能力（grep 零命中 binding/code-runtime 面）；Bash 工具 = 任意执行但非 binding 注入式编程接口。

### 对照 → 候选
| CR-1 | binding 注入式代码执行（模型写程序调 host API，双后端可移植） | 无 | **新能力**非修复——体量中-大，价值取决于产品方向（agent 编程接口 vs Bash 即可）；**登记 W-opt 中期，不入首波** |

## ⑤ guard（研读完成 2026-11-06）

### DSH 侧形态（引证）
两小包 374L：
- `timeout-policy` 111L：**协作式工具超时强制器**——工具声明 `timeoutMs` 并承诺遵守 `exec.signal`；包装器 arm deadline，到期映射为结构化 `TOOL_TIMEOUT` 错误结果（content=模型可见消息 + error.code）；**嵌套 deadline 消歧**（外层 wrapper 先触发的 timer 读作普通上游 cancel，不误记本插件超时）。
- `repeat-tool-reminder` 233L：**建议性连击检测器**——连续同工具调用计数达阈值（默认 [3,5,8]）注入提醒 user 消息；不否决不改写；`*` 通配 include/exclude（模式零命中合法——exclude mcp_* 须在无 MCP 部署仍合法）；**配置错误 load 时响亮失败**（空 thresholds/非整数/<2/重复 = throw，禁静默回落）。

### AtlasCode 同域现状
- 连击检测：**无**（loop.ts consecutive 仅 autocompact 熔断面；grep 零命中 repeat-reminder 类）。
- 工具超时：#260 600s 门族（主请求路径超时）+ W-C C4-3 长工具心跳；无 per-tool `timeoutMs` 协作式结构化超时面。

### 对照 → 候选
| G-1 | repeat-tool-reminder（连击提醒） | 无 | **中-高**——弱模型循环打转正是 loop-robustness 观察到的真实失败族（R1-delay 086 事件同族观察面）；建议性注入零 veto 风险；小件 |
| G-2 | per-tool 协作式超时（TOOL_TIMEOUT 结构化码 + 嵌套 deadline 消歧） | #260 门族部分覆盖 | 低-中——登记；#260 族收口后评估增量 |

## ⑥ schedule（研读完成 2026-11-06）

### DSH 侧形态（引证）
单包 2003L：**agent 作用域持久 one-shot/fixed-rate 提醒，落于 session 事件日志**（domain.ts 807L fold 语义——SCHEDULE_CHANGE_VERSION 变更编解码 + foldScheduleEvents 重建）；runtime.ts 324L 活定时器投影（`MAX_TIMER_DELAY_MS` 钳制 Node timer 上限；DueDecision 一次性/每 occurrence 决策）；changes 走 `runScheduleTransaction`（事务化）；every 触发批量 framing（`renderEveryReminderBatchFraming`——同 tick 多 occurrence 合一帧防模型面洪泛）。

### AtlasCode 同域现状
`engine/scheduler/` 1697L（cron.ts + cronTasks 460L + cronTasksLock 214L + cronJitterConfig + cronEnv）：**文件持久化**（lastFiredAt 落盘 + missed-task prompt 补发 + cwd 共享防双发锁）+ jitter 面。成熟度相当，模型不同：文件/cwd 共享 vs DSH agent 作用域事件日志。

### 对照 → 候选
| SC-1 | every 批量 framing（同 tick 多 occurrence 合帧） | 逐发 | 低-中（多任务用户面） |
| SC-2 | 事件日志 fold 持久化（替代文件） | 文件已够用 | 低（重架构无行为收益，不排） |

## ⑦ session-query（研读完成 2026-11-06）

### DSH 侧形态（引证）
两包 5215L：`tool-session-query` = **模型面 workspace 授权会话历史搜索/读取工具**（DEFAULT_MAX_SEARCH_RESULTS=100 + 协作式 deadline）；后端 `session-query-sqlite`（FTS 全文索引 1103L + query 477L）；corpus.ts 会话语料装配。

### AtlasCode 同域现状
会话列表面（sessionlist 0.1.38/39 收口：50 截断/mtime/回写/isSidechain）+ /resume；**模型面会话历史搜索工具无**。

### 对照 → 候选
| SQ-1 | 模型面会话历史搜索工具（FTS 授权检索） | 无 | 中——跨会话记忆检索能力（「上周怎么改的」类工作流）；体量中；SQLite FTS 引入须供应链评估。登记 W-opt 中期 |

## ⑧ 插件市场 / boot+core（研读完成 2026-11-06）

### DSH 侧形态（引证）
`boot/app-boot` 829L + profile 420L + cmdline 172L：**「一切皆插件」= 全应用 Cordis 插件树**（cordis.yml leaf → Loader 驱动至树稳定；include/group/HMR 插件；fail-loud Loader 守卫；~/.dsh 用户 patch 层；launch env snapshot）。core 13497L = 系统提示/agent-loop/tools 等皆以 Cordis 服务缝形态存在。**无独立「市场」件**——市场语义在 AtlasCode 侧为官方 marketplace（A3-1 用户裁定保留）。

### 对照 → 候选
| PL-1 | Cordis 全插件化架构 | AtlasCode 自有 plugin/skill + marketplace 体系 | **不排**——架构级重写，风险/体量远超收益；仅作参考架构留档（缝定义风格 = 本笔记各模块已吸收的真正可移植部分） |

## ⑨ 汇总取舍（2026-11-06，8 模块研读齐）

**首波（0.1.90 候选，W-opt-1）建议组成**：
1. **C-2 compaction 切点 tool-pairing 平衡**（坐实缺口，小面高价值，判别清晰）——主件
2. **G-1 repeat-tool-reminder 连击提醒**（弱模型循环族直接对策，建议性零 veto，小件）——同波副件
3. S-1 深度单调 resume 守：先一单测直证（f4 下步），坐实则并入首波第三件；不坐实则零动作

**登记候补（不入首波）**：C-1（待 tools/system 奇偶直证）/ C-3 / C-4 / SB-1 / SB-2 / SB-4 / CR-1 / G-2 / SC-1 / SQ-1；PL-1 不排。
**C-6（0.1.90 生产 lane 勘误转 f4 裁定新增，2026-11-06）**：headless -p 车道 autoCompact 结构性禁用——print.ts:1231 最小面 deps 无 countTokens → shouldAutoCompact fail-safe false，-p 长会话不自动压缩（既有车道形态非 0.1.90 回归）；补注入须先做压缩风暴风险面重估（激活 -p 压缩路径非平凡），与 C-3 overflow 触发同域横排。

**首波工单前置**：S-1 直证 + C-2 切点精确行为快核（keepRecent 与 boundary 的切点组合矩阵）→ 工单落盘 → Atlas-reveiw 审计 → 双信号。
