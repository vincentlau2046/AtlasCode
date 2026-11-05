# 对齐 Claude 商用版能力轨道（P0）+ 优先级裁定（2026-10-09 用户）

> **用户裁定（2026-10-09）**：
> - **P0 = 对齐 Claude 商用版能力**（本轨道）：以两个参考源**逐版本对比**，加入新的提示词工程、反推功能新增，**记录 PR + 详细描述（引用内容）+ 优先顺序**；后面实施时**逐个分析**。
> - **P1 = 国产替代优化轨**（W-opt 国产波，DSH 模块优化分析 → 8 项国产替代，见 `docs/roadmap-domestic-and-residuals.md` §1，2026-09-29 已顺延）。
>
> 本文件 = P0 轨道章程 + 参考源登记 + 方法 + **PR 记录表骨架 + seed 首批候选**（2026-10-09 扫描）。

---

## 0. 参考源登记（Reference Registry，先核验后引用，不虚构）

| 源 | 路径（本机） | 性质 / 覆盖 | 顶版本 | 维度 |
|---|---|---|---|---|
| **A = system-prompts** | `/home/vince/projects/claude-code-system-prompts`（源 = `vincentlau2046/claude-code-system-prompts`，Piebald-AI 维护） | 全量系统提示词逐版本档案：CHANGELOG 覆盖 **294 版（since v2.0.14）**，每版 commit（`v2.1.277 (+5,234 tokens)` + `Update changelog for …` 双提交对）；`system-prompts/` = 顶版快照（737 文件） | **v2.1.277**（2026-09-18；镜像 2026-10-09 clone @ d268e41，实施前 `git pull` 追平） | **提示词工程**（NEW/REMOVED/修改 逐版 diff + token 增量） |
| **B = 官方 claude-code** | `/home/vince/projects/claude-code-upstream`（`anthropics/claude-code`，shallow depth 300） | CHANGELOG.md（8707 行，**0.2.21 → 2.1.295** 用户面 Added/Fixed 逐版）+ git 历史 commit message 带 **PR 号**（`(#99206)` 等 = 落地表述）+ `mods/` `plugins/` | **v2.1.295** | **功能落地表述**（PR 级） |
| **基线 = sourcemap** | `/home/vince/projects/claude-code-sourcemap`（CC **v2.1.88** restored-src，AtlasCode 移植基线） | 源码级对照（2.1.88 面） | v2.1.88 | 实现面 |

**对齐区间 = v2.1.89 → v2.1.295**（约 156 版有变更；A 面锚点：其 CHANGELOG L2362 = `# [2.1.88]` 分界，L1–2361 = gap 内全量）。

**引用纪律**（同 DSH 轨）：每条 PR 记录必须带 **CC 版本 + 源（A changelog 行 / B changelog 行 / PR#）+ 原文引用**；不臆造。A 面 1P 重面（Artifact*/claude.ai/Design System/Claude Test 家族）= **E-1P 登记区（零码）**，先例 = 0.1.42 E-1P 11 项登记面（`--advisor`/fast 等永禁死命令只登记不搬）。

## 1. 方法（逐版本分析流，实施时执行）

1. **逐版本扫（2.1.89 → 2.1.295，~156 版）**：每版三源交叉 ——
   - A：CHANGELOG 该版节（NEW/REMOVED/修改条目 + token delta）= 提示词工程面；
   - B：CHANGELOG 该版节（Added/Fixed）= 用户面特性；
   - B：`git log` 该版区间 PR refs（落地表述；shallow 只到 ~2.1.251，更早按需 `git fetch --unshallow`）。
2. **三分归类**：每条特性判 **3P 可移植**（通用 agent 能力 → 排入波）/ **1P-gated**（依赖 claude.ai / apps gateway / 1P server tools / 1P 模型表 / growthbook 实验 → 追加 E-1P#12+ 登记，零码）/ **out-of-scope**（终端/OS 特例等，登记不排）。
3. **落码纪律**（同 DSH 轨）：3P 项移植须 **行为不弱于上游 + 判别单测**；每波 ≤ N 项，走 release-governance 五段闭环（gate → 发布 → 生产 lane），波次自 **0.1.47+** 起（前置 = 0.1.46 在途重 gate + 发布收口）。
4. **PR 记录表**（本文件 §4，滚动追加）：逐版本分析结果落表，实施时按表逐项核销。

## 2. 优先顺序判据（P0 内部排序）

- **P0-a（用户主诉 × 核心鲁棒性）**：loop 鲁棒性 / 重试回退 / 上下文压缩 / 权限安全 / 多代理编排 —— 直接命中「持续长时间不中断 + 不静默丢」主诉。
- **P0-b（用户面）**：TUI 交互（backgrounding / /loop / 状态面）/ statusline / 插件管理 UX。
- **P0-c（提示词工程 + 生态基建）**：A 面提示词工程反推（delegation 策略 / 委托纪律 / memory 分类）+ MCP / hooks / 插件生态硬化。

## 3. seed 扫描（2026-10-09，gap 全量粗扫，定规模 + 筛首批）

**规模**：A 面 gap 内 156 版 / 612 条变更（460 NEW + 152 REMOVED；NEW 分布：Data 120 / Tool Description 80 / Skill 74 / System Prompt 68 / System Reminder 48 / Agent Prompt 47）。B 面 gap 内 Added 主力计数：mod 627 / background 360 / plugin 310 / MCP 272 / permission 224 / hook 161 / subagent 157 / skill 106 / status 92 / worktree 92 / context 76 / compact 64 / memory 63 / workflow 54 / retry 51。**1P 信号低**（claude.ai 7 / artifact 1 / gateway 40 / remote-control 1 / Slack·Chrome 各 1）→ gap 内绝大多数特性 3P 可移植。

**首批候选（B 面引自 v2.1.295 节 + 扫面；A 面引自 gap 内条目；原文引号内为引用）**：

| # | 簇 | 候选（引用） | 源 | 归类 |
|---|---|---|---|---|
| 1 | P0-a 鲁棒性 | "Added `CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS` to limit how long unattended retry mode … waits out 429 and 529 errors" | B 2.1.295 | 3P（呼应 loop-robustness #4/#5 族） |
| 2 | P0-a 鲁棒性 | "Fixed `claude -p` text output dropping earlier responses when background work started another turn; each turn's response now prints when the turn ends" | B 2.1.295 | 3P（headless 面） |
| 3 | P0-a 鲁棒性 | "Fixed Bash tool calls failing when the model passes `command_description` instead of `description`" | B 2.1.295 | 3P（工具入参容错） |
| 4 | P0-a 鲁棒性 | A gap："**NEW:** System Reminder: Still-running tool call — A call still loading while the user's new message is answered; its result arrives later and must not be repeated or described as cancelled." | A gap | 3P（提示词工程 × loop 面） |
| 5 | P0-a 权限 | "Fixed `--tools` and `--restricted` not applying to built-in tools that register after launch, and deprecated tool names reaching tools outside the caller's tool set" | B 2.1.295 | 3P（工具面权限收敛） |
| 6 | P0-a 权限 | "Fixed Bash permission checks for for-loops over glob patterns, improving permission-check accuracy" | B 2.1.295 | 3P |
| 7 | P0-a 权限 | B 2.1.29x："sec-default: a settings deny rule holds over an allow or ask from a plugin the person installed (#98080)" | B PR #98080 | 3P（deny 优先语义） |
| 8 | P0-a 多代理 | "Fixed forked skills invoked from Workflow subagents delivering their results to the main conversation instead of the invoking agent" | B 2.1.295 | 3P |
| 9 | P0-a 多代理 | "Fixed in-process agent teammates failing their first SendMessage call until they loaded the tool through tool search" | B 2.1.295 | 3P |
| 10 | P0-a 多代理 | "Fixed subagents in their own linked worktree being shown the parent session's git branch, status and recent commits" | B 2.1.295 | 3P |
| 11 | P0-a 多代理 | "Fixed `CLAUDE_AUTO_BACKGROUND_TASKS` moving a subagent to the background while an edit or shell command waited behind it" | B 2.1.295 | 3P |
| 12 | P0-a 压缩/上下文 | B gap compact 64 / context 76 / memory 63 条（实施时逐条取）：含 auto-compact 提示面、context 1m `[1m]` 回退（"Fixed every request failing on a `[1m]` model when a gateway … refuses the context-1m beta; Claude Code now resends without it"） | B 2.1.295+ | 3P（部分条目含 1P gateway 词但机制通用） |
| 13 | P0-a 压缩 | A gap："**REMOVED:** System Prompt and Tool Description: REPL — Retires the JavaScript runner that looped, branched and composed tool calls" | A 2.1.275 | 3P（上游裁 REPL 工具 = 对照我们 REPL 面的决策输入） |
| 14 | P0-b TUI | "Added Program Status Protocol (OSC 7501) support: terminals that implement it can show whether Claude Code is working, waiting on you, or done" | B 2.1.295 | 3P（TUI 状态面） |
| 15 | P0-b TUI | "Added a 'Backgrounding cancelled' message when you stop the turn while `←` is waiting for the current tool to finish" + "Fixed Esc not stopping a self-paced `/loop` … cancelling a pending wakeup now shows a notice" | B 2.1.295 | 3P |
| 16 | P0-b TUI | "Added a line on stderr, when it is a terminal, that says what a `claude -p` run is waiting for when it stays open after its last turn" | B 2.1.295 | 3P |
| 17 | P0-c hooks | "Added `onFailure: \"block\"` for command and HTTP hooks: a hook that can't start, times out, or exits with an unexpected code blocks the action instead of letting it through" | B 2.1.295 | 3P（hooks fail-closed 硬化，呼应 0.1.36 硬化波） |
| 18 | P0-c hooks | "Fixed a mod's hook being handed a deeply nested tool input cut short with no error, so a guard could pass content it never saw" | B 2.1.295 | 3P（guard 完整性） |
| 19 | P0-c MCP | "Fixed remote MCP servers in headless and SDK sessions staying disconnected after an outage longer than 15 seconds … repeated drops now back off, up to 30s" + cursor 20x 重复页 + CSS/JS/XML 存成 .bin | B 2.1.295 | 3P |
| 20 | P0-c 插件 | "Added a warning to `claude plugin install/enable/disable/marketplace add` when the settings file they write to does not load" + marketplace add 名称校验 + `/plugin` Errors tab 不再误删 | B 2.1.295 | 3P（呼应 0.1.43/46 插件源波） |
| 21 | P0-c 提示词工程 | A gap："**REMOVED:** Agent Prompts: Agent (simple usage notes) — Retires brief delegation guidance in favor of the dedicated cost-aware system prompt and its stronger bias toward inline work" | A gap | 3P（delegation 成本感知策略） |
| 22 | P0-c 提示词工程 | A gap："**REMOVED:** Commit and PR skill routing — Replaces dedicated skill routing with direct commit and `gh pr create` instructions embedded in coordinator and worker prompts" + "Memory file contents — Labels each loaded file by type … auto-memory, or organization-managed policy" + "Nested instruction file contents" | A gap | 3P |
| — | 1P 排除区 | A 面 NEW 家族大头 = `Artifact *`（claude.ai Artifacts 服务）/ Claude apps gateway 管理面 / Claude Test / Design System / remote-control·phone = **E-1P 登记区（零码）** | A gap | 1P |

> seed 仅首批示意；**全量 ~156 版逐版分析 = 实施期任务**（每版落 §4 表，不一次性做完）。

## 4. PR 记录表（滚动，实施时逐版本追加）

> **卷 1（CC 2.1.89 → 2.1.120，23 版有变更）已完成逐版分析** → 落独立滚动文件 **`docs/2026-10-09-p0-pr-log.md`**：
> B 面 Added 49 条全量（AD-01–49）+ Fixed P0-a 簇 38 条（FX-01–38）+ A 面 3P 提示词 34 条（PT-01–34）+ **1P 登记 E-1P-12–19（8 簇，零码）** + out-of-scope 4 项 + **0.1.47 波 TOP 15 候选**。
> 后续卷（2.1.121 → 2.1.160 → … → 2.1.295）滚动追加同一文件，不另起；每卷记录量级见该文件 §0。

**状态机**：`backlog → 已分析（归类终判+引用落表）→ 排入波（0.1.4x）→ 落码（Main）→ gate（e2e）→ 发布核销`；1P 项终态 = `E-1P 登记（零码）`。

## 5. 角色与排期

- **分析/规划/PR 记录 = f4 车道（本 lane）**（规划/管理/判据/核验角色边界先例：0.1.42 裁定）；**落码 = Main 车道**；**gate/生产 lane = e2e**（release-governance 五段闭环）。
- **前置**：0.1.46 重 gate（master `d927dd7`）+ 发布收口 —— **已满足**（release `42c48fb` + tag v0.1.46 + npm 0.1.46 live，五段闭环终态；见 memory `w-opt-trust-0145-0146`）。
- **开波判据（2026-10-09 更新，两判据均已满足）**：① 0.1.46 闭环 ✅ ② 本文件 §4 表完成 **首版区间（2.1.89→2.1.120）逐版分析** ✅（卷 1 已落 `docs/2026-10-09-p0-pr-log.md`：TOP 15 候选 + 1P 登记 E-1P-12–19）。**→ 开波只差「用户确认 0.1.47 TOP 候选优先级」→ 按 P0-a 簇切 0.1.47 波（每波 ≤ N 项 + 判别单测 + release-governance 五段闭环）。**
- **P1（国产替代优化轨）让位于本轨道**（用户 2026-10-09 裁定）；DSH 模块优化分析（现 v0.1.0-rc.8）作为 P1 波输入，不预启。
