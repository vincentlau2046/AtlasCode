# AtlasCode 产品状态与功能实现描述（2026-09-29）

> 权威快照。配套：`docs/execution-strategy.md`（逐波执行记录 §8.53–§8.73）、
> memory `atlascode-wave-c-progress.md`（波进度权威）。
> 旧仓 ground truth = `AtlasHarness/AtlasHarness @ a8af45b`（只读，tag `atlascode-baseline-2026-09-21`）。

---

## 0. 一句话定位

**AtlasCode = AtlasHarness（旧仓）的独立重架构复刻**：把 Claude Code 系 Coding Agent
的**核心引擎 + 可插拔 Ascend 域 + CLI/TUI 壳**，按「**策展式移植（curated port）+ 已移植面逐字保真核验**」
方式重组进干净分层新仓（12 顶层域 + engine 16 子域）。

> ⚠️ **保真度定性（勿高估）**：这是「已移植面逐字保真 + 有意策展裁剪 + 828 前向接缝登记」，
> **不是逐字节 1:1**。复刻的是"已落盘面的行为保真"，不等于"旧仓每一行 / 每个功能都搬了"。
> 大量 UI 渲染面、第三方依赖、整域缺失面、前向接缝是**设计上明确裁掉或延后**的，非遗漏。

---

## 1. 波次进度总览

| 波 | 状态 | 波终基线 | 说明 |
|---|---|---|---|
| 既定序列 C 桶①②③ → D → remote → analytics → F 归档 | ✅ 全闭环 | 2984/0/7110/177 + gate 6·0·5·2 | `wave-f` tag 已切；旧仓 `ARCHIVED.md` 就地标记 |
| §8.71 CLI 公共域波（#151） | ✅ 闭环 | 3039/0/7250/180 + gate 6·0·5·2 | 新开 `src/cli/` L3 公共域 + 壳瘦身 |
| §8.72 TUI 壳波（#152） | ✅ 闭环 | 3039/0/7250/180 + gate 6·0·5·2 | UI 闭包 C-7 原样搬入 `src/tui/` + launcher/mount 壳接线 |
| §8.73 全功能复刻审视波（#154/#171/#172） | ✅ 闭环 | **3055/0/7318/182 + gate 6·0·5·2** | S-E1 总分析 → S-1 保真轮1 → S-2 轮2 → S-3 活性 → S-4 修波 → S-5 闭环 |

- **提交总数 330**；波 tag = `wave-a / wave-b / wave-c / wave-f`（本地，无 remote，不 push）。
- **四件套全绿**：tsc 0 / lint 0 error（384 warn 基线）/ build 798 模块 / 全量 **3055 pass · 0 fail · 182 文件** + CI gate **6·0·5·2**。

---

## 2. 三类完整清单

### 2.1 已落盘（真实现 + 行为验真）

> 「真实现」= 代码逐字/策展移植 + 非空洞行为断言（unit 零盘 + func 真盘 + 探针突变判别）。

**engine 域（294 文件 / 77k 行，核心引擎）** — 16 子域：
- `query`：agent loop（`queryOneRound` 单轮 + `queryAgentLoop` 多轮 while + maxTurns 守卫 + pre-turn 压缩）
- `pipeline`：工具编排（isConcurrencySafe 分区/串行批）+ 权限门 + 错误分类三级 + schema 校验
- `context`：autoCompact 触发+熔断 / compact 摘要体 / microCompact 时间触发
- `coordinator`：AgentTool + runAgent（深度门/fan-out）+ forkSubagent + coordinator worker 两源提示词
- `tools`（174 文件 / 16 工具本体子域）：见下表
- `skill`（20 模块）/ `tasks` / `scheduler`（cron）/ `worktree` / `session`（JSONL 持久 + 搜索/恢复 + Port 1/5）/ `messaging`（mailbox + 命令队列）/ `permissions`（engine 侧）/ `state` / `ports`（注入窗口）

**49 工具本体口径（19 无条件 + 30 门控；47 历史口径；Ascend 16 另计）— 已落本体**：

| 族 | 已落本体 | 门控 |
|---|---|---|
| bash | BashTool（checkPermissions 一线接线） | 无条件 |
| files | Read / Write / Edit / Glob / Grep | 无条件 |
| 任务 | TaskCreate / TaskGet / TaskUpdate / TaskList / TaskStop / TodoWrite / TaskOutput | TodoWrite ⑯ 门控 |
| cron | CronCreate / CronDelete / CronList | ② AGENT_TRIGGERS 门控 |
| plan | EnterPlanMode / ExitPlanModeV2 | 无条件 |
| web | WebFetch / WebSearch | 无条件 |
| config | Config / AskUserQuestion | 无条件 |
| notebook | NotebookEdit | 无条件 |
| team | SendMessage | isAgentSwarmsEnabled 门控 |
| MCP/搜索 | ListMcpResources / ReadMcpResource / ToolSearch | ToolSearch ⑲ 自门控 |
| skill / LSP | Skill / LSP | LSP isLspConnected 自门控 |
| worktree | EnterWorktree / ExitWorktree | ⑭ isWorktreeModeEnabled 自门控 |
| remote | RemoteTrigger | ③ 自门控（[ATLAS-HOLD] 端点） |
| agent | AgentTool（E-2） | 无条件 |

**其余顶层域**：
- `modelprovider`（2833L）：OpenAI 静态键三角色池（premium/fast/small）+ `getRoleModels` 三态 + fallbackModel 尾位 + thinkingConfig + `response_format`（json_object/json_schema）
- `permissions`（5012L）：规则求值树 + 三层写回 + 门工厂 3 值 verdict（ask fail-closed）+ auto-mode 分类器族（10 子模块 + ② dontAsk 5 产点）
- `cli`（6255L）：commander 52 选项 + headless（-p）结构化 stdio IO + stream-json + `buildHeadlessOptions` 18 字段映射 + **高频 5 选项（jsonSchema/systemPrompt/appendSystemPrompt/fallbackModel/thinkingConfig）+ --effort 真消费**
- `tui`（1947 文件 / 463k 行）：React+Ink UI 闭包 **C-7 原样搬运**（533 .tsx 零重编译）+ launcher/mount 壳接线 + **启动验真 REPL 真达**（模型配置→写 settings→REPL）
- `memory` / `sandbox`（bwrap 占位 + ripgrep）/ `executor`（Shell bash-only 真核心）/ `hooks`（27 事件 + 流式执行 + schema 收紧）/ `lsp`（client 域 2464L）/ `mcp`（JSON-RPC stdio + 4 态 manager）/ `remote`（UDS 5 站点族门）/ `bootstrap` / `shared`（24 叶子）/ `swarm`（inProcessRunner hub 1536L）/ `task`
- `ascend`（9 占位）：可插拔域包骨架，实挂载归 D-3 波

**测试体系**：`unit` 132 文件（零真实盘/零网络/零 PTY）+ `func` 47 文件（真 spawn/真盘）+ `ci` 2 文件（gate）。分层纪律：unit 零盘 / func 真盘 / ci 门控；探针突变判别（backup→mutate→定向红集→verbatim restore）。

---

### 2.2 已裁登记（有意不搬 / 裁剪，H6 前向接缝登记，归属波或永久不复活）

> 「已裁登记」= 明确裁剪、头注登记、**非遗漏**；复审勿当遗漏重提。

- **第三方依赖 3-dep 纪律本地转写**（核心域波不引原包）：axios→node fetch（redirect:'manual' 语义移植）/ lodash·lru-cache→本地 TtlLruCache（500 条目）+ 本地 Map memo（reject 亦缓存，同旧 memoize 语义）/ @modelcontextprotocol/sdk→手写 JSON-RPC 2.0 stdio client + 本地结构型 / turndown 整砍（HTML raw 透传，delta 登记）/ chokidar→per-tick 轮询 / execa→execFile arg-array（免 shell 注入）；proper-lockfile 保留（唯一新增第三方）。⚠️ **UI 例外栈**：TUI 壳波 §8.72 裁定装全 UI 闭包运行时依赖栈（46 包，含 ink/react/axios/turndown/@modelcontextprotocol/sdk 等），tui 闭包消费这些包；**核心域（engine/mcp 等）仍用本地转写**（`src/mcp/` 核验 0 import 该 SDK，纯本地转写）。**功能定位** = 依赖面收敛（国产化产品：供应链/许可/版本须可审计，核心域运行时第三方仅 openai/zod/proper-lockfile）+ 行为保真（转写语义与旧仓库行为逐字对齐并单测回归，如 memoize「reject 亦缓存」语义保留）。
- **GrowthBook 支**：新仓无 GB，改 env 门控或整砍（cron jitter / worktree GA 缺省开 + kill-switch / ToolSearch 门）。
- **整域缺失面**（登记归属波，未落盘）：MCP client 连接生命周期 + resources/prompt 拉取（MCP client 波）/ LSP server 真配置源（插件域 LSP 集成波 `setLspServerSource` 注入窗）/ 非 stdio transport（sse/http/ws，remote 波）。
- **死代码 / any-stub 死导出**：`checkResumeConsistency` 纯 no-op 遥测残余缺席登记不复活 / `recordQueueOperation` 等 log 族死码 / `Permutations` 链等 any-stub 面。
- **feature-gated 整支**：ToolSearch deferred 4 函数族（阈值判定/modelSupportsToolReference/extractDiscoveredToolNames/DeferredToolsDelta）+ tool_reference wire 面（auto-mode 波）。

---

### 2.3 待启动残口（登记未启动，明确归属后续波，本轮刻意不动）

> 「待启动残口」= 登记在册、**尚未排期实施**；非本审视波量级（D-8b 裁定：不切波 tag，闭环记录即归档）。

| 残口 | 内容 | 归属波 |
|---|---|---|
| **E-wave-end 审计** | engine spine vs tui orchestrator 运行体去重 / Ascend 执行器六件套 vs ascend 域 9 占位去重 / bootstrapState 187 双份去重 / **全量 lint 复原波**（D-4b 5 真体启用 + 1483-error 基线处置） | E-wave-end 独立审计波 |
| **UI 工具渲染面 / 双工具面去重**（自 §2.2 移入，2026-09-29 裁定） | tui 闭包自持 `src/tui/tools.ts` + `src/tui/Tool.ts`（工具注册面 + 自有 Tool 契约 + 46 包全依赖栈）；engine 49 工具本体 render 成员裁到字符串/null 面（`renderToolUseMessage`）——**两面去重 + 工具结果渲染面接线**（哪个工具面是生产单一事实源、engine 工具对象是否接 tui 渲染路由）= 残口，未接线 | E-wave-end 审计波（与「engine spine vs tui orchestrator 去重」同项） |
| **D-2a 切端** | engine-dedup 切端 | E-wave-end 独立波 |
| **D-3 Ascend 独立实施波** | C-7 执行器六件套实挂载 + DomainPackage 注册面 + `mount.ts` 实挂载 + gelu S5 | 独立实施波 |
| **D-9 换值** | IFF 网关 `[ATLAS-HOLD]` URL 族（**56 行 / 31 文件**：`ATLAS_WEB_DOMAIN_CHECK_URL` / remote trigger 端点；`ATLAS_API_BASE_URL` 的 modelprovider 域 config 层读者已随 G-3 ⑬（`createModelProviderConfig` 整删）除名，残余消费（preflight 探测 / filesApi）归 #200 1P-REST/remote 簇） | IFF 网关波 |
| **D-6 非 stdio transport** | remote 族 sse/http/ws | remote 族波 |
| **mount.ts 实挂载** | ascend 域实挂载 | E 波 ascend 实施波 |

**注**：`[ATLAS-HOLD]` 56 行/31 文件逐行带注、**未换值**（D-9 波才换）；D-4b 的 5 个高价值 lint 真体（no-process-exit/no-sync-fs/no-cross-platform-process-issues/no-lookbehind-regex/no-process-env-top-level）**已落真体 + 执行单测，但"已注册未启用"**（刻意不翻 severity，避免重燃 1483-error 基线保 quartet 绿）。

---

## 3. 数字快照（src/ 全域实测）

| 指标 | 值 | 说明 |
|---|---|---|
| `[ATLAS-HOLD]` | **56 行 / 31 文件** | 逐行带注，待 IFF 网关换值（D-9） |
| 前向接缝/残留守登记标记 | **828** | grep 口径 `前向接缝\|残留守\|前向声明\|归X波\|owner=`（标记数，非行数） |
| `export {}` 纯占位门面 | **29** | 零消费者死骨架，E-wave-end 按需重建（不重占位） |
| 提交总数 | **330** | 无 remote，全本地 master |
| 波 tag | wave-a / b / c / f | 本地，不 push |
| 全量测试 | **3055 pass / 0 fail / 7318 expect / 182 文件** | 四件套全绿 |
| CI gate | **6·0·5·2** | 6 pass / 0 fail / 5 expect / 2 文件 |

**顶层域规模**（文件数 / 行数）：engine 294/77014 · tui 1947/463523 · swarm 39/9320 · cli 20/6255 · permissions 30/5012 · lsp 10/3241 · modelprovider 18/2833 · memory 15/1962 · sandbox 10/1678 · mcp 6/1676 · task 8/1409 · hooks 14/1312 · bootstrap 3/496 · executor 11/1609 · remote 5/145 · shared 24/2088 · atlascode 24/1357 · ascend 9/65 · atlasoffice 1/17。

---

## 4. 保真度定性（如何读"复刻完成度"）

1. **已移植面逐字保真**：每波闭环都跑 A 路（旧仓 a8af45b 逐行/逐字对照）+ B 路（H6 死接缝/测试面）双只读审视，逐字 diff **零未登记 delta**；探针突变判别（恰 1 红）验真非空洞。
2. **非逐字节 1:1**：策展裁剪（死码 / GrowthBook / 3-dep 本地转写 / 整域缺失；UI 工具渲染面 = 待启动残口见 §2.3）+ **828 前向接缝显式延后**（各带归属波，非遗漏）。
3. **复刻的是"已落盘面的行为保真"**，不等于"旧仓每行每功能都搬了"。判断完成度看三类清单：**§2.1 已落盘**（已搬且验真）/ **§2.2 已裁登记**（有意不搬）/ **§2.3 待启动残口**（登记未启动）。
