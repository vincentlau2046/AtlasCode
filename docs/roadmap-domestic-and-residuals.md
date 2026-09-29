# AtlasCode 残口排波 + 国产替代优化轨路线图（2026-09-29）

> 从 `product-status.md §2.3 待启动残口` 升级为**真实实施路线图**：
> 残口不止"登记不启动"，而是**排进波次顺序 + 每波实施/优化范围 + 验收**，
> 并新增**国产替代优化轨**（同类功能参考 DSH / PI Agent 开源源码，落地优质国产方案替代）。
> 配套：`product-status.md`（三类清单 + 数字快照）、`execution-strategy.md`（逐波记录 §8.73）。

---

## 0. 引用源登记（Reference Registry，先核验后引用，不虚构）

| 源 | 路径 | 性质 | 核验态 |
|---|---|---|---|
| **DSH = DeepSeek Harness** | `/home/vince/projects/deepseek-harness`（本机） | DeepSeek AI 官方开源；`everything is a plugin` 架构，powered by Cordis（时空可组合范式） | ✅ 已核验（`packages/` 50+ 包全量清点） |
| **PI Agent** | 外部开源（本机无 checkout） | 用户指定的第二参考源 | ⚠️ **本机无源码，须按官方仓核验后方可引用具体实现**（遵守项目"不虚构外部引用"铁律） |

**引用纪律**：路线图对 DSH 的引用均落到**已核验的具体包路径**（下附）；PI Agent 仅列为方向性参考源，其具体实现引用留到该仓核验后补，不在此臆造。

---

## 1. 国产替代优化轨（Domestic-Alternative Track）

**总原则**：AtlasCode 当前"核心域 3-dep 本地转写"（axios→fetch / lodash→TtlLruCache / MCP SDK→手写 JSON-RPC / chokidar→轮询 / execa→execFile）是**"够用即可"的保真转写**；本轮起，对**同类功能**升级为**参考 DSH/PI 源码实现更优的国产方案**——
目标是：供应链可审计（国产化产品）+ 行为不弱于旧仓 + **优于"刚好够"的转写**（引入 DSH 验证过的更完整语义/边界处理）。

**DSH 模块 → AtlasCode 同类功能 → 国产替代目标**（均落已核验 DSH 包路径）：

| 同类功能 | AtlasCode 现状 | DSH 参考包（已核验） | 国产替代优化目标 |
|---|---|---|---|
| **上下文压缩** | `engine/context`（autoCompact/compact/microCompact，E-1b） | `packages/compaction/`：`compaction` / `compaction-basic` / `compaction-tool-result-pruner` / `command-compact`（模块化 4 件） | 拆分压缩器为**可插拔策略族**（basic / tool-result-pruner / command 触发），国产自研 pruner 替代单一 LLM 摘要 |
| **沙箱** | `sandbox`（bwrap **占位**，D7 外部未发布包 + placeholder 禁用态） | `packages/sandbox/`：`sandbox`（452L roots/escalation）/ `sandbox-policy` / `sandbox-local` / `sandbox-windows-acl` + `packages/e2b`（云沙箱） | 国产沙箱方案：**namespace/容器隔离 + policy 声明面**（参考 sandbox-policy 声明式），替代 bwrap 单点依赖，国产化运行时可换 |
| **子代理/编排** | `engine/coordinator`（AgentTool + runAgent + swarm inProcessRunner） | `packages/subagent/`（4659L 核心）：`subagent` / `-acp` / `-claude-code` / `-codex` / `-dsh-sdk` / `-fork-in-process` / `-in-process-driver` / `-spawn-in-process` / `tool-subagent` | **多后端子代理**（in-process driver + out-of-process + ACP 协议面），深度门/fan-out 语义对齐 DSH `depth.ts`/`run-settlement.ts` |
| **定时/任务** | `engine/scheduler`（cron：lease lock + jitter，530L） | `packages/schedule/`（2003L）：`domain` / `transaction` / `runtime` / `persistence` / `tools` | 任务调度**事务域 + 持久化**升级（参考 transaction/persistence），国产定时任务可恢复/可审计 |
| **会话/检索** | `engine/session`（JSONL 持久 + 搜索 + Port 1/5） | `packages/session-query/`：`session-log-export` 等 | 会话日志**导出/检索**面（国产审计面） |
| **插件/市场面** | `ascend` 域包（9 占位，可插拔）+ 插件市场 | DSH **`everything is a plugin` + Cordis 时空可组合**（`packages/boot/`、`packages/core/`） | 插件注册面 + 域可插拔范式**国产优化**（ascend 域包对齐"一切皆插件"，降低挂载耦合） |
| **代码执行** | `executor`（Shell bash-only 真核心，裁剪版） | `packages/code-runtime/`：`code-runtime` / `-python` / `-worker-thread` | 代码执行**运行时隔离**（worker-thread / python 运行时），国产执行沙箱 |
| **权限/守卫** | `permissions`（规则求值树 + auto-mode 分类器） | `packages/guard/` + `packages/core/agent`（guard/dispatch 1636L） | 权限声明 + 守卫面**国产优化** |
| **依赖面收敛** | 核心域 3-dep 转写（§2.2） | DSH `pnpm workspace + 严格 boundaries`（tsdown 分包） | 用 **workspace 边界 + 分包**系统性收敛核心域依赖（替代逐点"刚好够"转写） |

> 落地纪律：每项**先读 DSH 对应包源码**（本机 `deepseek-harness/packages/...`），再在 AtlasCode 落国产方案；**PI Agent 具体实现引用须其仓核验后补**，本路线图不虚构。每项国产替代都须**行为不弱于旧仓 + 带判别单测**（非空洞替换）。

> **排期裁定（2026-09-29，用户）**：§1 国产替代轨整体**顺延为发布后优化波（W-opt）**——"先完成完整功能发布上线，再做优化"。W1 不做 DSH 研读（原 W1-1.1 划出）；W2-W5 发布关键路径不含任何国产替代钩子。W-opt 与 G-β 前置波（R2/R3）并行排期，不阻塞 G-α/G-β。

---

## 2. 残口排波（Residual Wave Sequencing）

> 把 `product-status.md §2.3` 待启动残口排成有序波次。**R1 优先**（架构收敛，是后续国产替代的地基）。
> 每波：范围 / 实施要点 / 验收（四件套 + 判别测）。D-9/D-6 依赖 IFF 网关，可并行不阻塞 R1-R3。

### R1 — E-wave-end 审计 + 架构收敛波（地基，最高优先）
- **范围**（= §8.73 残口"engine spine vs tui orchestrator 去重" + 全量 lint 复原波）：
  1. **双工具面去重**：**两套完整注册表**——`src/tui/tools/`（**216 文件/49,827 行**〔§8.74 实测订正 181/44k 旧口径〕自带本体 + 真 React 渲染成员，C-7 原样搬，实测 **0 import engine**）vs `src/engine/tools/`（35 真工具对象 + 4 非工具导出，render 成员裁到字符串/null 面，引擎 DI 架构，经 3055 测保真）——裁定**生产单一事实源**（**§8.74 已裁定**：engine 为行为事实源 + tui 27 UI.tsx 渲染路由叠加，删双份），逐文件命运清单见 `execution-strategy.md §8.74.1`。
  2. **engine spine vs tui orchestrator 运行体去重**（12K 行级）：`src/tui/` orchestrator 运行体 vs `src/engine/query+pipeline` 去重，单一 loop 事实源。
  3. **bootstrapState 187 双份**：`src/tui/bootstrapState.ts`（187 全量副本）vs 新 `bootstrap` 域 54 导出——去重，单源。
  4. **全量 lint 复原波**：D-4b 5 真体（no-process-exit/no-sync-fs/no-cross-platform-process-issues/no-lookbehind-regex/no-process-env-top-level）从"已注册未启用"翻 severity 启用 + 处置重燃的 1483-error 基线（保 quartet 0-error 语义，非清零后放任）。
  5. **TUI 交互活链路实施 + 端到端验真**（去重后的落地）：接 TUI 交互 loop（输入 prompt → LLM → tool_use 真执行 → 结果在 TUI 渲染 → 续轮）+ PTY func/gelu 探针固化——**这是实施量，非纯验证**。
- **国产替代钩子**：去重后单一 loop/工具面，是 §1"子代理/编排 多后端"（DSH subagent）与"依赖面收敛"的落点地基。
- **验收**：四件套全绿 + gate 6·0·5·2 + 探针（删双份后旧路径引用 0 命中）+ lint 复原基线锁定。

### R2 — D-3 Ascend 独立实施波
- **范围**：C-7 执行器六件套**实挂载** + DomainPackage 注册面 + `mount.ts` 实挂载（现 DEP-5 前向接缝）+ gelu S5 探针；`ascend` 域 9 占位填真实现。
- **国产替代钩子**：Ascend 域包对齐 DSH"一切皆插件"范式（§1 插件/市场面）；CANN 工具链（bisheng/atc/msame/msprof）国产执行沙箱对齐 §1 沙箱。
- **验收**：`bun run src/cli.ts --e2e`（`ATLAS_ASCEND_MOCK=1`）16 工具 L1 活探 + 六件套挂载后四件套全绿。

### R3 — D-9 换值（IFF 网关波，可与 R1/R2 并行）
- **范围**：`[ATLAS-HOLD]` **56 行/31 文件** URL 族（`ATLAS_API_BASE_URL` / `ATLAS_WEB_DOMAIN_CHECK_URL` / remote trigger 端点）逐行换真值；RemoteTrigger ⑫ 端口真供给方 + bundled skill 复活。
- **前置**：IFF 网关端点定案（外部依赖，非本仓量级）。
- **验收**：grep `[ATLAS-HOLD]` = 0（或仅保留"待定案"显式占位）+ 相关端点活探。

### R4 — D-6 非 stdio transport（remote 族）
- **范围**：MCP transport 从 stdio-only 扩 sse/http/ws（现 `src/mcp/` 前向接缝登记）。
- **国产替代钩子**：参考 DSH `packages/mcp/` + ACP 协议面。
- **验收**：4 态 manager 三 transport 活探 + 四件套。

### R5 — D-2a 切端（E-wave-end 独立切端波）
- **范围**：engine-dedup 后的切端（与 R1 同源，切端面单独立波）。
- **验收**：切端后四件套 + 行为回归。

**总序**：`R1（地基）→ R2（Ascend）→ R5（切端）`，`R3/R4 并行`（依赖 IFF 网关，独立不阻塞）。

---

## 3. 波次与既有关系 + 验收基线

- **接续关系**：R1-R5 是 `product-status.md §2.3` 的落地排波，接续 §8.73 审视波（#154 已闭环）。R1 吸收 §8.73 登记的"engine spine vs tui orchestrator 去重 / bootstrapState 双份 / 全量 lint 复原"三残口。
- **波 tag**：R1-R5 为**独立波**（非子波），每波闭环可切 tag（R1 建议切 `wave-e-wave-end` 或 `wave-r1`，沿 wave-a/b/c/f 惯例；本地不 push）。
- **四件套基线**（各波开波前继承 3055/0/7318/182 + gate 6·0·5·2，波内单调不回归）。
- **国产替代轨**（§1）不单独排波，而是**挂靠在 R1/R2 波内作为优化项**（去重/挂载后才有优化落点）；每项须判别单测，禁止空洞替换。
- **边界（非目标）**：① 非逐字节 1:1（策展移植定性不变）；② PI Agent 具体实现引用**须仓核验后补**，本路线图不虚构；③ 3-dep 纪律**在国产替代轨内有意放宽**（用 workspace 边界系统性收敛，替代逐点"刚好够"转写）——此放宽须每波显式裁定，不默认破纪律。

---

## 4. 严谨执行顺序（波/切片 + 依赖图 + 前置项 + 门禁）

> 把 §2 的 R1-R5 细化为**可执行波（W1-W5 + 并行带 R0）**。R1 拆成 W1（设计）/W2（去重）/W3（TUI 活链路）/W4（lint 复原）四段**严格串行**；R0 工具链为**并行带**（零代码面冲突），但 tag/release 动作严格收进 W5。

**六条不变式（严谨性约束）**：
1. **设计先于实施**：W1 的逐文件命运清单是 W2 删码**唯一依据**；W2 实施中如需临场裁 → 回 W1 补设计，不在实施波裁设计。
2. **零行为波每切片绿**：W2 是行为零改动去重，每个切片四件套（tsc/lint/build/3055 测）必须绿才进下一切片；W3 是行为新增，须带新探针（非纯断言旧行为）。
3. **lint 复原殿后**：W2/W3 新增代码全部在**旧 lint 基线**下落，W4 一次性启用 5 真体 + 处置重燃错误——不在"将被 W2 删除 / 将被 W3 改动"的代码上修 lint。
4. **工具链并行、tag 最后**：R0（install.sh / `atlas update` / dev-loop 文档）纯新增文件，可与 W2-W4 并行合并；**v0.1.0 tag + push + Release 严格在 W4 之后（W5）**。
5. **每波收尾三件套**：`execution-strategy.md` 记录 + memory 更新 + 基线谱系（测试数谱系）落盘。
6. **既有规则变更显式化**：「AtlasCode 绝不 push」自 **W5 起解除**（用户明确要求远端升级）；W5 前全部本地 master 提交。

**用户前置项（前置到 W1 期间完成，不阻塞 W1/W2 开跑，但阻塞后续门禁）**：
- **P-1**：建 GitHub 仓库（私有/公开待裁定）→ R0 远端 / W5 push + Release 渠道
- **P-2**：TUI 端到端验真可用的 LLM 端点 + key（IFF 网关或任意 OpenAI-compatible，如 DeepSeek 兼容端点）→ W3 活验真（网关不可达时探针走 skip-clean 门控，但 **G-α 冒烟至少需真跑 1 次通过**）
- **P-3**：确认发布渠道 = GitHub only（按版本管理方案 memory）

**依赖图（串行主链 + 并行带）**：
```
W1 设计裁定波（零代码，纯 docs）
 ├─→ W2 双工具面去重 + 单 loop + bootstrapState（行为零改动）
 │      └─→ W3 TUI 活链路接上 + 端到端验真（行为新增，需 P-2）
 │             └─→ W4 全量 lint 复原（殿后，一次性）
 │                    └─→ W5 发布工具链收口 + G-α v0.1.0（需 P-1，解除 no-push）
 └─→ R0 并行带：install.sh / atlas update / dev-loop 文档（纯新增，随时并入；tag 动作归 W5）
G-α 后：W-opt（国产替代优化波，DSH/PI 研读 + §1 八项实施，用户裁定发布后）∥ W6 = R2（D-3 Ascend 实施）→ W7 = R3（D-9 换值，IFF 前置）→ G-β v1.0 → W8 = R4/R5
```

**波/切片定义**：

**W1 设计裁定波（零代码，纯 docs）**
- ~~1.1 DSH 参考研读~~（**划出 → W-opt 发布后优化波**，排期裁定见 §1；W1 纯发布关键路径设计）
- 1.2 双工具面收敛裁定：**216 文件逐文件命运清单**（§8.74.1 已落盘：类 a 34 目录删体留 27 UI.tsx 渲染层 / 类 b 16 目录 9 删 7 留 / 类 c 0）+ 渲染叠加接法（裁定：engine = 行为事实源，tui 保留 UI.tsx React 渲染函数作路由叠加，删 tui 重复注册与本体；删体前先迁兄弟体类型）
- 1.3 单 loop 切法：tui orchestrator 运行体 12K 行 vs engine query+pipeline 的保留/删除清单
- 1.4 bootstrapState 187 vs 54 导出裁定
- 1.5 TUI 活链路接法设计（REPL → 单 loop → 工具执行 → 渲染路由 → 续轮 + PTY 探针设计）
- 1.6 lint 复原处置策略（重燃基线：修集合 vs 登记延后集合）
- 门禁：§8.74 设计记录落盘 + 四件套不变（纯 docs 波）

**W2 双工具面去重 + 单 loop（行为零改动，每切片四件套绿）**〔§8.74.6 已重分切片，以此为准〕
- 2a 工具注册面收敛（照 §8.74.1 命运清单）/ 2b 渲染路由层（先迁 UI.tsx 兄弟体类型，27 UI.tsx + 2 fused 特例 + MCPTool KEEP；渲染函数挂接 engine 工具对象；删 tui 重复本体）/ **2-pre engine 缺面填平**（autoCompact 3 / compact 4 / microCompact 3 / context 扩面族，零行为 + 判别单测，为 W3 删码铺路）/ 2d bootstrapState 去重（47 碰撞名切 src/bootstrap + 3 drift 裁定）/ 2e 删净 + 旧路径 0 引用探针 + 四件套 + gate 6·0·5·2
- **单 loop 运行体（orchestrator ≈11k (a) 类）删除不在 W2**（活链路依赖 orchestrator generator，删除 = 行为变更 → W3）
- 门禁：波终四件套（行为零改动，测试数谱系 ±0 或仅探针增减）+ execution-strategy 记录

**W3 TUI 活链路接上 + 单 loop 切换 + 端到端验真（行为新增）**〔§8.74.4/§8.74.6〕
- 3a engine 扩面：`AgentLoopDeps.emit?` 可选槽（不注入 = 零行为）+ 事件适配层 / 3b REPL 重接线五件套 + `createAgentLoopDeps` 单组合根（替换 headless 行内组装 + factory 注入，核销 `orchestrator?: unknown` 接缝）/ 3c 删 orchestrator (a) 类 27 文件 ≈11k + (c) 类改写薄 re-export / 3d PTY 探针固化（func/gelu；live-gateway 门控，网关不可达 skip-clean；G-α 冒烟真跑 ≥1 次）+ 人工 PTY 验真（`script -qec`，本地跑；CI skip）
- 门禁：四件套 + 新探针全绿（P-2 端点可用态）

**W4 全量 lint 复原（殿后）**
- 4a 5 真体启用（eslint.config.mjs tui 桶 5 规则 severity 翻 error）/ 4b 重燃错误处置（照 1.6 策略：修 vs 登记延后）/ 4c 新 lint 基线锁定（测试基线文档同步）
- **重燃面实测（W1-1.6，2026-09-29，W2 删码前口径）**：5 真体启用 = **211 errors**（非文档旧称"1483 基线"——1483 是 14 条豁免规则全开口径，W4 范围仅 5 真体；§8.73 旧措辞订正）：no-sync-fs **149**/39 文件（大头集中 utils 层：fsOperations 30 / config 17 / plugins 17 / pidLock 10 / file 8 / git 7…）+ no-process-exit **54**/6 文件（main.tsx 独占 47 = CLI 出口分发层）+ no-process-env-top-level **8**/7 文件（逐点可修）；no-cross-platform-process-issues 与 no-lookbehind-regex **0 命中**
- **策略（W2 删码后重测缩面再定终局）**：no-process-env-top-level 8 + no-process-exit 非 main.tsx 6 处 = 低成本修；main.tsx 47 = CLI 合法出口（登记延后逐站点 eslint-disable 带 owner 注 或 抽 exit 助手）；no-sync-fs 大头 = **不改写 sync→async（行为零改动纪律）**，按文件登记 legacy-debt 豁免（逐文件 eslint-disable 带注，W-opt 波再议）；W2 删掉的 tui 重复本体（BashTool 4 / AgentTool 等）自带重燃点随之消失，W4 终局数 < 211
- 门禁：lint = 新基线（启用 5 规则下 0 error，豁免全部带 owner 注）+ 四件套

**W5 发布工具链收口 + G-α**
- 5a 版本初始化（SemVer + 注解 tag；需 P-1 远端）→ **解除 no-push 规则** / 5b README + 冒烟清单（settings.json 三角色模型池配置 / `--help` / headless `-p` 一轮 / TUI 启动 + 交互一轮）/ 5c G-α 全绿门禁 → **v0.1.0 注解 tag + push + GitHub Release（alpha，内部）**
- 门禁：一键安装验真（全新目录）+ `atlas update` 验真 + 冒烟全过

**R0 并行带（零代码面冲突）**：install.sh / `atlas update` 命令 / `docs/dev-loop.md`（本地 clone 改码 → build → 即刻生效）——纯新增，随 W2-W4 期间并入提交；**tag/release 动作严格归 W5**。

**tag 体系**：波 tag（wave-r1.. 沿既有波收尾先例，每波闭环可切）与 SemVer 发布 tag（v0.1.0/v1.0.0）**双轨并存不混用**。

---

## 5. 发布门禁评估（何时可发布 + 安装/升级/迭代方式）

> 用户目标：本地 git repo **一键安装**、**远端升级**、**本地边使用边优化**持续迭代；
> 发布硬条件 = **TUI UI + 完善的 Coding Agent 功能**。

**现状盘点（3055/0/182 + gate 6·0·5·2）**：
- ✅ 引擎完善：agent loop / 49 工具本体 / skill / session / hooks / 权限 / auto-mode / scheduler / swarm / LSP / MCP(stdio) / Web
- ✅ CLI headless（-p / stream-json / 高频 5 选项 + effort）活探验真（gelu 探针）
- ⚠️ **TUI 渲染 = 已移植但活链路未接**（勿误判"整个 TUI 没做"）：
  - ✅ 渲染**本体/组件已实施**：`src/tui/tools/` **216 文件 / 49,827 行**〔§8.74 实测订正〕自带工具本体（C-7 整体搬入），`renderToolUseMessage`/`renderToolResultMessage` 是**真 React 渲染成员**（`BashTool/UI.tsx` 等 27 个，非 engine 的 `() => null` 面）；启动已 PTY 验真到 REPL（banner + 输入框）。
  - ❌ **交互活链路未落地**：① "输入 prompt → LLM → tool_use → 真执行 → 结果渲染 → 续轮"整回合**从未端到端验真**（Slice E 只验到 REPL 可达，非完整 tool 回合）；§8.74.4 坐实：活链路 `query` 经 engineCompat 解析到 **tui orchestrator 自有 generator**（loop.ts:215），engine `queryAgentLoop`（`Promise<AgentLoopResult>`，窄 spine 无 emit 面）在 TUI **零消费**，headless 亦为行内组装 deps 直接调 `queryAgentLoop`（`createAgentLoopDeps` 全仓 0 活调用方 = 前向接缝）；② **双工具面 = 两套完整注册表未去重**（R1 实质）：`src/tui/tools/`（216/49.8k，真 React 渲染，C-7 原样搬，**实测 0 import engine/tools**）vs `src/engine/tools/`（35 本体，render 裁 null/字符串面，引擎 DI 架构，**经 3055 测保真**）——**只有 engine 那套经保真测试，tui 这套原样搬、没接引擎 DI、没验**；发布前必须收敛（否则交互面与 headless 面行为漂移）。
- ❌ **分发工具链缺失**：AtlasCode 现**无 git remote**（本地 master，330 提交不 push）/ 仅波 tag（wave-a/b/c/f，**SemVer 未初始化**，memory 版本管理方案"一次性初始化待执行"未做）/ 无安装脚本 / 无自升级命令
- ⚠️ `[ATLAS-HOLD]` 56 行（IFF 网关端点）未换值——**非基础发布阻塞**：基础车道 = OpenAI 协议静态键，经 `settings.json` modelRoles / `ATLAS_*_MODEL` env 可接**任意 OpenAI-compatible 端点（含 DeepSeek 官方 OpenAI 兼容 API）**；D-9 只影响"国产默认端点"内置，不阻塞 alpha

**发布门禁 G-α（0.1.0 内部 alpha）= 以下全绿方可发布**：
1. **R1 波闭环**（双工具面去重 + 单 loop 事实源 + bootstrapState 187 去重 + 全量 lint 复原）——正确性前提
2. **TUI 活链路实施 + 双工具面去重 + 端到端验真**（= R1 的实施量，**非"只差验真"**）：裁定 tui/engine 双工具面单一事实源 → 接 TUI 交互活链路（真 LLM 一轮：tool_use 真执行 Read/Write/Bash 之一 + 结果在 TUI 渲染 + 续轮）→ PTY func/gelu 探针固化
3. **版本管理初始化**（memory 版本方案：master 主干 + SemVer + 注解 tag + **GitHub 渠道 only**）：`v0.1.0` 注解 tag + 远端仓库建立
4. **安装/升级/迭代工具链**：
   - `install.sh` 一键：git clone → pnpm install → build（dist/cli.js，798 模块）→ link `atlas` 入 PATH（~/.atlas/bin）
   - `atlas update` 自升级：git pull（tag/branch）+ 重 build + relink = **远端升级**
   - 本地 dev loop（**边使用边优化**）：本地 clone 改码 → `pnpm build` → 即刻生效；文档落 `docs/dev-loop.md`
   - （可选延后）npm/npx 发布渠道——版本方案裁定"GitHub 渠道 only"，npx 不入 G-α
5. **发布物**：README（定位/安装/配置 settings.json 三角色模型池）+ 冒烟清单（--help / headless -p 一轮 / TUI 启动 + 交互一轮）

**门禁序列**：
```
现在 ──→ R1（E-wave-end 架构收敛：双工具面去重 + TUI 活链路实施+验真 + bootstrapState + lint 复原）──→ 版本初始化 + install.sh + atlas update
        （R0 发布准备 3/4 项可与 R1 并行，无代码面冲突）
                ───────────────────────────────────────────→ G-α 0.1.0 alpha（内部）
G-α ──→ R2（D-3 Ascend 实挂载）+ R3（D-9 换值）──→ G-β 1.0 外部（国产默认端点 + NPU 差异化域）
（R4 D-6 非 stdio / R5 切端 随 G-β 或其后）
```

**结论（回答"哪个环节可发布"）**：
- **现在不可发布**：TUI 交互活链路未落地（渲染本体已移植但活链路没接没验）+ 双工具面（两套完整注册表）未去重 + 分发工具链三缺（remote/SemVer/install+update 全未做）。
- **可发布环节 = R1（双工具面去重 + TUI 活链路实施 + 端到端验真 + bootstrapState 去重 + 全量 lint 复原）闭环 + 2 项发布准备（版本初始化 / 安装升级工具链）完成 = G-α 0.1.0 alpha**。⚠️ **量级提醒**：R1 含 TUI 活链路实施（非纯验证）+ 双工具面收敛，比"R1 + 验真"预估大，建议 **R1 单独立波（≥1 波）+ 并行 R0 发布准备**，不塞进"1–2 波压缩"乐观口径。
- **外部 1.0（G-β）等 D-9（IFF 换值）+ D-3（Ascend）**；alpha 阶段用 OpenAI-compatible 车道（settings.json 配端点 + 静态键）即可真用，不阻塞。

---

## 6. 下一步

- 本路线图为**规划文档**（用户裁定"先出路线图文档"）；评审通过后**开 R1**（地基波）+ **并行 R0 发布准备**（安装/升级工具链 + 版本初始化，与 R1 无代码面冲突）。
- R1 开波前：读 DSH `packages/subagent/`、`packages/core/agent`、`packages/sandbox/` 源码（本机已 checkout），定双工具面去重 + 单 loop 事实源的**具体切法**，落 `execution-strategy.md §8.74`。
- PI Agent 参考源：用户提供仓地址/本地 checkout 后，核验其同类功能实现，补入 §1 映射表（不臆造）。
