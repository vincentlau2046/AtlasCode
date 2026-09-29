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

---

## 2. 残口排波（Residual Wave Sequencing）

> 把 `product-status.md §2.3` 待启动残口排成有序波次。**R1 优先**（架构收敛，是后续国产替代的地基）。
> 每波：范围 / 实施要点 / 验收（四件套 + 判别测）。D-9/D-6 依赖 IFF 网关，可并行不阻塞 R1-R3。

### R1 — E-wave-end 审计 + 架构收敛波（地基，最高优先）
- **范围**（= §8.73 残口"engine spine vs tui orchestrator 去重" + 全量 lint 复原波）：
  1. **双工具面去重**：`src/tui/tools.ts`（tui 自持 `getAllBaseTools`）+ `src/tui/Tool.ts`（自有 Tool 契约）vs `src/engine/tools/`（49 本体，render 成员裁到字符串/null 面）——裁定**生产单一事实源**，engine 工具对象接 tui 渲染路由，删双份。
  2. **engine spine vs tui orchestrator 运行体去重**（12K 行级）：`src/tui/` orchestrator 运行体 vs `src/engine/query+pipeline` 去重，单一 loop 事实源。
  3. **bootstrapState 187 双份**：`src/tui/bootstrapState.ts`（187 全量副本）vs 新 `bootstrap` 域 54 导出——去重，单源。
  4. **全量 lint 复原波**：D-4b 5 真体（no-process-exit/no-sync-fs/no-cross-platform-process-issues/no-lookbehind-regex/no-process-env-top-level）从"已注册未启用"翻 severity 启用 + 处置重燃的 1483-error 基线（保 quartet 0-error 语义，非清零后放任）。
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

## 4. 发布门禁评估（何时可发布 + 安装/升级/迭代方式）

> 用户目标：本地 git repo **一键安装**、**远端升级**、**本地边使用边优化**持续迭代；
> 发布硬条件 = **TUI UI + 完善的 Coding Agent 功能**。

**现状盘点（3055/0/182 + gate 6·0·5·2）**：
- ✅ 引擎完善：agent loop / 49 工具本体 / skill / session / hooks / 权限 / auto-mode / scheduler / swarm / LSP / MCP(stdio) / Web
- ✅ CLI headless（-p / stream-json / 高频 5 选项 + effort）活探验真（gelu 探针）
- ✅ TUI 闭包已搬（C-7）+ 启动验真（PTY：模型配置→写 settings→**REPL banner + 输入框**）
- ❌ **TUI 交互全链未验**：输入 prompt → 真 LLM → tool_use → 执行 → 结果渲染 → 续轮（Slice E 只验到 banner/输入框，**未验完整 tool 执行回合**）
- ❌ **双工具面未去重**（R1）：`src/tui/tools.ts`（自持 `getAllBaseTools`）vs `src/engine/tools/`（49 本体）——**交互式 TUI 的工具执行面 vs CLI headless 的 engine 面，尚未裁定单一事实源**；发布前必须收敛（否则交互面与 headless 面行为漂移）
- ❌ **分发工具链缺失**：AtlasCode 现**无 git remote**（本地 master，330 提交不 push）/ 仅波 tag（wave-a/b/c/f，**SemVer 未初始化**，memory 版本管理方案"一次性初始化待执行"未做）/ 无安装脚本 / 无自升级命令
- ⚠️ `[ATLAS-HOLD]` 56 行（IFF 网关端点）未换值——**非基础发布阻塞**：基础车道 = OpenAI 协议静态键，经 `settings.json` modelRoles / `ATLAS_*_MODEL` env 可接**任意 OpenAI-compatible 端点（含 DeepSeek 官方 OpenAI 兼容 API）**；D-9 只影响"国产默认端点"内置，不阻塞 alpha

**发布门禁 G-α（0.1.0 内部 alpha）= 以下全绿方可发布**：
1. **R1 波闭环**（双工具面去重 + 单 loop 事实源 + bootstrapState 187 去重 + 全量 lint 复原）——正确性前提
2. **TUI 交互全链验真**：PTY 真 LLM 一轮（tool_use 真执行 Read/Write/Bash 之一 + 结果渲染 + 续轮），落 func/gelu 探针固化
3. **版本管理初始化**（memory 版本方案：master 主干 + SemVer + 注解 tag + **GitHub 渠道 only**）：`v0.1.0` 注解 tag + 远端仓库建立
4. **安装/升级/迭代工具链**：
   - `install.sh` 一键：git clone → pnpm install → build（dist/cli.js，798 模块）→ link `atlas` 入 PATH（~/.atlas/bin）
   - `atlas update` 自升级：git pull（tag/branch）+ 重 build + relink = **远端升级**
   - 本地 dev loop（**边使用边优化**）：本地 clone 改码 → `pnpm build` → 即刻生效；文档落 `docs/dev-loop.md`
   - （可选延后）npm/npx 发布渠道——版本方案裁定"GitHub 渠道 only"，npx 不入 G-α
5. **发布物**：README（定位/安装/配置 settings.json 三角色模型池）+ 冒烟清单（--help / headless -p 一轮 / TUI 启动 + 交互一轮）

**门禁序列**：
```
现在 ──→ R1（E-wave-end 架构收敛）──→ TUI 交互全链验真 ──→ 版本初始化 + install.sh + atlas update
        （R0 发布准备 3/4 项可与 R1 并行，无代码面冲突）
                ───────────────────────────────────────────→ G-α 0.1.0 alpha（内部）
G-α ──→ R2（D-3 Ascend 实挂载）+ R3（D-9 换值）──→ G-β 1.0 外部（国产默认端点 + NPU 差异化域）
（R4 D-6 非 stdio / R5 切端 随 G-β 或其后）
```

**结论（回答"哪个环节可发布"）**：
- **现在不可发布**：交互全链未验 + 双工具面未去重 + 分发工具链三缺（remote/SemVer/install+update 全未做）。
- **可发布环节 = R1 闭环 + 3 项发布准备（TUI 交互验真 / 版本初始化 / 安装升级工具链）完成 = G-α 0.1.0 alpha**；按既往波节奏（单波 5–12 提交）R1 + 发布准备 ≈ 1–2 波量级，**并行 R0 准备项可压缩到 R1 同期收尾**。
- **外部 1.0（G-β）等 D-9（IFF 换值）+ D-3（Ascend）**；alpha 阶段用 OpenAI-compatible 车道（settings.json 配端点 + 静态键）即可真用，不阻塞。

---

## 5. 下一步

- 本路线图为**规划文档**（用户裁定"先出路线图文档"）；评审通过后**开 R1**（地基波）+ **并行 R0 发布准备**（安装/升级工具链 + 版本初始化，与 R1 无代码面冲突）。
- R1 开波前：读 DSH `packages/subagent/`、`packages/core/agent`、`packages/sandbox/` 源码（本机已 checkout），定双工具面去重 + 单 loop 事实源的**具体切法**，落 `execution-strategy.md §8.74`。
- PI Agent 参考源：用户提供仓地址/本地 checkout 后，核验其同类功能实现，补入 §1 映射表（不臆造）。
