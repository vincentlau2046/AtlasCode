# W-D-C 段 R1 lock-face 文书（backends 双目录全收敛）@ master d318ec25

> row F 预注册纪律：本文书 = 段 R1 落码前的判据面/修形冻结，先于落码报 f4 批复；偏离预注册形须先回本改预注册。
> 勘察对象：`src/swarm/backends/`（12 文件）vs `src/tui/utils/swarm/backends/`（9 文件），master d318ec25 实测。

## §0 勘误（对工单 §0.1 的并集定谳修正）

1. **teammateModeSnapshot 实为第 9 对，非 TUI 独有**：engine 副本在 `src/swarm/teammateModeSnapshot.ts`（91L，backends **目录外**，故工单 backends 目录清单未含）。实为 9 对同名文件 + engine-only 4 注入窗文件。
2. **engine-only 4 文件定性 = 接缝/装配件，非副本**（收敛后保留基座）：
   - `inProcessRunnerPort.ts`（135L）：seam ② fail-fast 注入窗 + `StartInProcessTeammateArgs` 端口签名（已含 C-3 四钩子可选面 + termination + allowedTools/allowPermissionPrompts/agentDefinition）。
   - `port.ts`（59L）：`BackendModuleFace` 注入窗（null 缺省 + fail-fast 双访问面）。
   - `teammateToolRegistryDeps.ts`（37L）：工具池 registry deps fail-soft 注入窗。
   - `wireBackends.ts`（35L）：port 显式装配语句（PRT-2）。

## §1 逐对 diff 表（md5 / 行数 / 语义差双档）

| # | 文件 | engine md5·行 | tui md5·行 | 语义差档 | 语义差实质 |
|---|---|---|---|---|---|
| 1 | types.ts | 80113af2·244 | b5714d9b·11 | **语义** | tui = any-stub 退化（11L `: any` 声明 + `export *`）；engine = R3 真形重建（TeammateExecutorContext 窄视图） |
| 2 | InProcessBackend.ts | 36629e43·363 | 70109ffc·469 | **语义（反向）** | engine = compose 形（spawn 支无四钩子、窄视图 ctx、域内 requireStartInProcessTeammate）；tui = C-3 后新形（四钩子闭包构造于 spawn 体内 + ToolUseContext 全量 + updateTask/tracker/appendCappedMessage TUI 消费形）——见 §2 R1-D1 |
| 3 | ITermBackend.ts | 17fda43d·388 | 2f024e21·368 | 漂移 | 唯一实质差 = PRT-2 注册点（engine=ensureBackendsRegistered 显式动态 import+register；tui=顶层自注册副作用）；余为头注/de-Claude 注释。**注册语义等价（惰性 vs import 时点，消费面同为 registry）** |
| 4 | TmuxBackend.ts | 17808d34·788 | ae43e852·763 | 漂移 | 同 #3（PRT-2 注册点）+ de-Claude 注释 + engine 本地 one-liner（count/sleep）vs tui utils import（零行为差） |
| 5 | PaneBackendExecutor.ts | db9cb7be·376 | 7b133a01·354 | 漂移 | import 重映射 + ctx 型名（engine=TeammateExecutorContext 窄视图 / tui=ToolUseContext 全量——**结构兼容：全量满足窄视图，setContext 传参零差**）+ de-Claude 注释 |
| 6 | detection.ts | 4f639075·145 | 535af608·128 | **语义（行为差一处）** | engine 裁除第三指标 `env.terminal === 'iTerm.app'`（H6 前向接缝登记：engine 域当时无 env 面）；tui 保留（utils/env.js）——见 §2 R1-D2 |
| 7 | it2Setup.ts | 57b9b009·272 | 1cadc9c1·245 | **语义（行为差一处）** | 持久化面：engine=进程内标志（globalConfig 持久化裁除登记）；tui=getGlobalConfig/saveGlobalConfig 持久化活面——见 §2 R1-D3 |
| 8 | registry.ts | a8933da6·492 | 3966a87f·464 | 漂移 | PRT-2 注册点 + de-Claude `-s atlas`（品牌面已裁定）+ teammateModeSnapshot import 路径（各指本侧副本） |
| 9 | teammateModeSnapshot.ts | 58be2ee4·91 | 110456bd·87 | **语义（行为差+状态分叉）** | capture 支：tui 读 `getGlobalConfig().teammateMode`（活面）；engine 裁面 `'auto'`。**模块态双份实证**：TUI 活面（main.tsx capture / Config.tsx override / tui spawnUtils / tui registry）全走 tui 模块态；engine lane（swarm spawnUtils / engine registry / swarm/index 门面）走 engine 模块态——TUI capture 永不落 engine 模块 → engine 读点未 capture 时走 init-bug 兜底支（logError + 'auto'）。状态分叉 = 判读分叉——见 §2 R1-D4 |

## §2 per-file 收敛方向（逐个明示；基座 = src/swarm/backends 仅默认倾向，允许反向）

| # | 方向 | 依据 |
|---|---|---|
| 1 | **tui→engine**（tui 删 stub，消费 engine 真形） | tui=退化形；engine=真形。PaneBackendExecutor setContext 窄视图与全量结构兼容 |
| 2 | **TUI 侧消费形为准吸收进 engine（反基座预判，明示）** | engine compose 形缺 C-3 四钩子消费形。**落码修形预注册（R1-D1）**：四钩子闭包体全在 TUI 域（getSystemPrompt/LocalAgentTask/InProcessTeammateTask/appendCappedMessage），engine 不可 import → **新 seam `inProcessSpawnHooksPort`（fail-soft null 缺省）**：`setInProcessSpawnHooksFactory(factory)`，factory(config, ctx, taskId) → `{mainSystemPrompt?, onMessage?, onPermissionWaitMs?, getPermissionMode?}`（签名 = StartInProcessTeammateArgs 四钩子面逐字）；engine InProcessBackend.spawn 调 factory（未接线 = 零钩子，engine lane 恒等）；**接线点 = tui/factory 组合根（与 setStartInProcessTeammate 同批装配，PRT-2）**，四钩子闭包体（现 tui spawn 体内 L120-167）整段迁入 tui 域工厂。types.ts 窄视图按四钩子消费形扩面（options.tools/mainLoopModel/mcpClients/getAppState/setAppState 已在 TeammateExecutorContext 者核实、缺者补） |
| 3 | engine 为准 | PRT-2 纪律（显式装配非顶层副作用）为准；tui 删副本 |
| 4 | engine 为准 | 同 #3 |
| 5 | engine 为准 | 窄视图为准（结构兼容）；tui 删副本 |
| 6 | **engine 为准 + 裁面维持（R1-D2 呈裁）** | 第三指标 `env.terminal` 裁面维持：Linux 开发机结构性不可达 iTerm2；前 2 指标（TERM_PROGRAM/ITERM_SESSION_ID）覆盖 iTerm2 主识别路径；避免为不可达平台引 terminal 识别面进 engine/shared 域。代价 = macOS iTerm2 且 TERM_PROGRAM 缺省的边缘场景识别收窄（理论面，无活证据）。**若 f4 裁回填**：terminal 识别面须先落 shared 域（另小切片） |
| 7 | **engine 为准 + 持久化 port 注入（R1-D3 呈裁）** | **修形预注册**：it2Setup 两标志（iterm2It2SetupComplete/preferTmuxOverIterm2）改经可选 `it2SetupPersistencePort`（`getFlags(): {it2SetupComplete, preferTmux} \| null` + `setFlag(name, value)`）读写；缺省 null = 进程内标志（现 engine 行为恒等）；**接线点 = tui/factory 组合根**（getGlobalConfig/saveGlobalConfig 适配）。恢复 tui 现行为（跨进程 setup 提示不重复弹 + preferTmux 持久）。与段 M todosPort 同族先例。**若 f4 裁维持进程内标志**：tui 侧行为回归（setup 提示每进程重弹），须在 CHANGELOG 登记 |
| 8 | engine 为准 | PRT-2 + de-Claude（品牌面已裁定）；teammateModeSnapshot import 换道本侧单源 |
| 9 | **engine 单源 + capture 签名扩面（R1-D4 呈裁）** | **修形预注册**：`captureTeammateModeSnapshot(configMode?: TeammateMode)` 增可选参——TUI 组合根（main.tsx capture 调用点）读 `getGlobalConfig().teammateMode` 后显式传参；headless/引擎直调不传 = `'auto'` 恒等。tui 副本删，main.tsx/Config.tsx/setup.ts/tui spawnUtils/tui registry 全改道 engine（swarm 门面）。**消除状态分叉**（单模块态）+ 恢复 tui config 读取行为。Config.tsx 的 getCli/clearCli 两面走 swarm 门面 |

收敛后态：`src/tui/utils/swarm/backends/` 整目录删除（9 文件）；tui 消费端改道 `src/swarm`（C-3 先例：tui→swarm 直 import 已通）。tui 侧 ../array.js、../sleep.js、../constants.js 等 tui 域内依赖不动（engine 侧已各有对应）。

## §3 判别格可达性分层预注册（审计必改①落形）

| backend 支 | 取证形 | 防假绿条款 |
|---|---|---|
| in-process | **活面 wire 直证**：0.1.94 C-3 判别格回归（wdb-c3 13 格）+ R1 新增 bundle 结构断言 | 直证层 |
| tmux | **首选 wire 直证**：单测进程预置 `TMUX` env 后动态 import detection（模块加载期捕获窗口内）+ registry 选择序探针；**若模块级缓存使 env 注入不可达**（detection 已被同进程他测试加载），降级为选择逻辑单测（isInsideTmux 指标逻辑 + registry 优先级序），**降级须在测试文件头注登记降级原因** | 禁未登记降级冒充直证 |
| iterm2/it2Setup | **Linux 结构性不可达 → 单测/结构判别格替代**：isInITerm2 指标逻辑单测（TERM_PROGRAM/ITERM_SESSION_ID 两指标 + R1-D2 裁面断言）+ it2SetupPersistencePort 行为单测（注入 fake port 读写回环 + null 缺省进程内兜底）+ registry 优先级序 iterm2 腿单测 | 禁以「环境不可达」冒充直证绿 |
| bundle 结构断言 | backends 各模块实现体实例数=1 + `src/tui/utils/swarm/backends/` 路径 existsSync=false + 全仓 module specifier 解析 tui backends 路径零命中（§2.7 纪律：specifier 解析禁路径子串 grep） | 删副本三证齐全 |
| TUI lane 可达性 | R1-D1 hooks 工厂装配实证（tui/factory setInProcessSpawnHooksFactory + engine spawn 侧 factory 调用形锚）+ R1-D4 capture 传参形锚（main.tsx 调用点带 configMode 实参） | 组合根装配面直证 |

## §4 落码面清单预估 + 判读纪律

- 改：engine backends 6 文件（InProcessBackend 钩子工厂接入 / it2Setup port / teammateModeSnapshot capture 扩面 / types 窄视图扩面 / registry·detection 微调）+ 新 inProcessSpawnHooksPort + it2SetupPersistencePort（port.ts 同族或独立文件）+ tui 消费端改道（main.tsx / setup.ts / Config.tsx / tui spawnUtils / tui registry 消费点 / tui/factory 装配）。
- 删：`src/tui/utils/swarm/backends/` 整目录 9 文件。
- 判别格：新 `tests/unit/wdc-r1-backends-single-source.test.ts`（§3 全表）。
- 判读三纪律继承：func 单副本绿 ≠ e2e 双副本真环境绿；点火面/消费面/读面三分账；状态面分叉 = 判读分叉（R1-D4 即实证先例）。
- 回归面：§2 Global Constraints 2——tmux/iterm/pane/in-process 各 backend 支路判别格覆盖（§3 分层表即覆盖矩阵）。

## §5 处置

f4 批复（含 R1-D1~D4 四呈裁点逐个裁定）→ Main 依批复落码 → 判别格 RED→GREEN → 四件套 → 报段 R2。
