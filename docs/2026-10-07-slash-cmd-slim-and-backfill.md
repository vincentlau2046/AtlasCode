# Slash 命令精简 + 补全 工单（2026-10-07）

> 来源：2026-10-07 f4 全量命令普查（~60 活跃命令 + 14 tombstone），用户逐轮裁定。
> 上游对照源：`claude-code-sourcemap/restored-src`（Claude Code v2.1.88 还原源码）。
> 分工：f4 出工单+判据 / Main 落码+发布 / e2e 逐波 gate（守 lane 边界：e2e 不动 master）。
> 执行序：W1→W2→W3→W4 严格串行，每波一个 0.1.x 收口（in-scope 收口/前后 lane 统一/fail-closed 门禁），不预启。

## 决策基线（终版，已锁定）

| 类别 | 内容 | 处置 |
|---|---|---|
| S1 精简 | statusline · output-style · pr_comments · security-review · torch | **删**（W1） |
| voice | 命令 + 引擎 | **全保留**（用户终裁 2026-10-07） |
| B1 死码 | 14 个「上游本就 stub」tombstone | **清理**（W2） |
| A' 补全 | files · tag · version | **翻开 isEnabled**（W3，含 tag） |
| E 本地移植 | advisor | **移植**（W4 = 0.1.41，109L 搬运+注册，依赖全齐） |
| E-本地 fast | fast | **显式 deferred 到 0.1.42**（spike 结论：`utils/fastMode.ts` 缺失 + `isFastModeEnabled` 未定义；Atlas fast 走 modelAllowlist 通道，gate 语义与上游不同，需模块补+gate 适配，夜间不做） |
| E-1P 9 项 | chrome·desktop·mobile·install-github-app·extra-usage·rate-limit-options·passes·remote-env·**privacy-settings** | **零码登记**（W2 注释） |
| 不做 | B2(bridge/remote-setup/ultraplan/bridge-kick/teleport) · D(agents-platform/torch 源缺失) · C(login/logout/reload-plugins/feedback/rename) · brief · stickers · btw | 维持现状 |

---

## W1 · 精简波（删 5 命令 + 孤儿清理）

### in-scope

**删命令**（仅 5 个；voice 保留）：

| 命令 | 源文件 | commands.ts 改动点（行号基于当前 HEAD） |
|---|---|---|
| statusline | `src/tui/commands/statusline.tsx` | L125 import / L233 COMMANDS 表项 / **L542 REMOTE_SAFE_COMMANDS 项** |
| output-style | `src/tui/commands/output-style/`（index.ts + output-style.tsx） | L124 import / L222 表项 |
| pr_comments | `src/tui/commands/pr_comments/` | L35 import / L224 表项 |
| security-review | `src/tui/commands/security-review.ts` | L51 import / L241 表项 |
| torch | `src/tui/commands/torch.ts`（本就是 `export default null` stub） | L73 require 行 / L261 `...(torch…)` 展开项 |

**保留不动**：L59-62 voiceCommand 块（`feature('VOICE_MODE')` gate，默认 OFF 但保留）；voice 引擎（`src/tui/voice/`、`components/PromptInput/VoiceIndicator.tsx` 等 ~20 文件，ASR 车道）。

**孤儿清理**（删 5 命令后失去唯一用户/消费方）：
1. `src/tui/commands/createMovedToPluginCommand.ts` —— 仅 pr_comments + security-review 两用户，删后孤儿
2. `src/tui/tools/AgentTool/built-in/statuslineSetup.ts` + `builtInAgents.ts` L9 的 `STATUSLINE_SETUP_AGENT` import/注册 —— /statusline 是唯一 spawn 入口（用户已裁"一并删"）

### out-of-scope
- voice 引擎清波（后续单列）· stickers/btw（用户未选）· files 在 BRIDGE_SAFE_COMMANDS 的保留（W3 翻开后变有效项）

### 判据（e2e gate）
- `getCommands()` 不再返回 5 个 name（statusline/output-style/pr-comments/security-review/torch）
- voice 仍在表内（feature 默认关，断言 import 块存在即可）
- **statusline 命令删除不影响 StatusLine 显示组件**（用户裁定负向保证）：StatusLine 组件经 `PromptInputFooter.tsx` 渲染、配置走 `loadStatusLineConfig()`，不 import `/statusline` 命令；删命令后须探 **默认面**（`~/.atlas/statusline.json` 缺席→回退内置默认仍显示）+ **手动配置面**（写入 statusline.json→组件按配置显示）各一次
- 构建/类型检查无悬空 import；四件套绿；现有命令表单测不 regress（已核实无测试断言这 5 个）

### 风险
低。已核：5 命令仅被 commands.ts 引用（无其他直接 import）；statusline-setup 代理仅被 statusline.tsx + builtInAgents.ts 引用。StatusLine 组件与 `/statusline` 命令两条独立链路，删命令不动组件。

---

## W2 · 死码卫生波（零行为变化）

> **处理方式区分**（用户裁定）：本波 = **删 15 个命令文件**（14 stub + install-slack-app，均生产不可见，删除零行为变化）+ **1 段零码登记注释**（E-1P 8 项，命令本不存在于 AtlasCode，仅登记不搬，无文件可删）。删项与登记项不混。

### in-scope（删项 1–3 / 登记项 4）

1. **删 14 个 B1 tombstone**（上游 v2.1.88 本就是 1 行 `name:'stub'`，dev-gated，生产不可见）：
   `autofix-pr` `backfill-sessions` `break-cache` `bughunter` `ctx_viz` `debug-tool-call` `env` `good-atlas` `issue` `oauth-refresh` `onboarding` `perf-issue` `share` `summary`
   各删：1 行 stub 文件 + commands.ts 对应 import（L36-46 区段内各 1 行）+ `INTERNAL_ONLY_COMMANDS` 表项
2. **删 `install-slack-app`**：`availability:['claude-ai']` 在 de-ANT 世界恒 false（`meetsAvailabilityRequirement` 永不通过），死项。删 `src/tui/commands/install-slack-app/` + L32 import + COMMANDS 表项
3. **`BRIDGE_SAFE_COMMANDS` 清死项**：删 `summary`（tombstone）；`files` 保留（W3 翻开后是有效且 remote-safe 的 local 命令）
4. **E-1P 9 项零码登记**：commands.ts 加前向缝注释段，标明 `chrome / desktop / mobile / install-github-app / extra-usage / rate-limit-options / passes / remote-env / privacy-settings` = 上游有真实现、依赖 1P 服务（Claude.ai/1P 计费/远程环境/**grove+consumer 门**），de-ANT 有意不搬

### out-of-scope
- INTERNAL_ONLY 里**真实现**的 dev 脚手架（commit/commit-push-pr/init-verifiers/version/agentsPlatform/forceSnip）不动
- B2 五个 1P 远程命令（已有 §8.74.29 登记，不重复动）

### 判据
- 生产命令表**零变化**（14 stub + install-slack-app 本就不可见）
- 文件数减 15；构建绿；四件套绿

### 风险
极低（纯删死码 + 注释）。注意 INTERNAL_ONLY 表项与 import 一一对应，删漏 import 会悬空。

---

## W3 · A' 补全波（翻开 3 个被移植期一刀切禁用的命令）

### 背景
`files`/`tag`/`version` 上游原态 `isEnabled: () => process.env.USER_TYPE === 'ant'`（1P 内部门）；移植波 78624e4 统一改写为 `() => false` 后再未复核。三者实现完整、纯本地无 1P 依赖。

### in-scope（各 1 行）
| 文件 | 改动 | 效果 |
|---|---|---|
| `src/tui/commands/files/index.ts` | `isEnabled: () => false` → `() => true` | 生产面：列上下文文件（依赖 `context.readFileState`，已接好：agentLoopDeps/attachments/memoryFiles） |
| `src/tui/commands/tag/index.ts` | 同上 | 生产面：会话打标（208L 完整实现） |
| `src/tui/commands/version.ts` | 同上 | **留在 INTERNAL_ONLY（dev 表，与上游定位一致）**；若需生产面可见，额外 1 行挪入 COMMANDS 主表（Main 执行时默认只开开关不挪表，如需挪表由 f4 单信号确认） |

### 判据
- `getCommands()` 生产断言：files/tag 出现；version 在 `ATLAS_DEV=1` 断言出现
- 功能探针：/files 输出上下文文件列表、/tag 切换会话 tag、/version 打印版本号
- 四件套绿

### 风险
低（各 1 行；files 依赖已验接好）。

---

## W4 · E 本地移植波（spike 已跑，2026-10-08 f4 只读核验）

### spike 结论（决定性，修正初版分类）
| 命令 | 上游依赖面 | AtlasCode 现状 | 结论 |
|---|---|---|---|
| **advisor** | `utils/advisor.js`(canUserConfigureAdvisor/modelSupportsAdvisor/isValidAdvisorModel) + model + validateModel + settings | ~~依赖全齐（`utils/advisor.ts` 三专属函数在场），无 1P 依赖~~ **⚠️ 2026-10-08 深夜 f4 复核修正（落码前只读核验）：`utils/advisor.ts` 在场但 = D2 波「advisor 整体删除」全 false 墓碑**（canUserConfigureAdvisor/modelSupportsAdvisor/isValidAdvisorModel 恒 false，头注「D2: advisor 整体删除（不做元数据化保留）」） | **❌ 不可移植 → E-1P 第 10 项登记**（见下「spike 误判根因」） |
| **fast** | `utils/fastMode.ts`(isFastModeEnabled/FAST_MODE_MODEL_DISPLAY) + availability[claude-ai,console] | `utils/fastMode.ts` **缺失**、`isFastModeEnabled` 未定义；Atlas fast 走 modelAllowlist 通道（gate 语义与上游不同） | **⏸ 显式 deferred 到 0.1.42**（需补模块 + gate 适配，夜间不做；登记在案） |
| **privacy-settings** | index gate=`isConsumerSubscriber()`；jsx 依赖 `components/grove/Grove.js`(GroveDialog/PrivacySettingsDialog) + `services/api/grove.js` | `isConsumerSubscriber` 已随 D1 裁除（恒 false）+ **grove 已整裁**（仅 logout 注释残留） | **❌ 非本地命令**（1P 依赖：grove + consumer 门）→ **移入 E-1P 登记**（第 9 项） |

### spike 误判根因 + advisor 定案（2026-10-08 深夜，f4 落码前只读核验）

**误判根因**：spike 判「依赖全齐」只看**文件在场**，未验文件**活性**——`utils/advisor.ts` 在场但整体是 D2 波（早期架构波）的全 false 墓碑。三重定罪证据：

1. **D2 墓碑**：`src/tui/utils/advisor.ts` 头注「D2: advisor 整体删除（不做元数据化保留）。所有函数恒返回 false/null/[]」——`canUserConfigureAdvisor()`≡false、`modelSupportsAdvisor()`≡false、`isValidAdvisorModel()`≡false。
2. **上游门 = 三重 1P**（`restored-src/src/utils/advisor.ts` 145L 真实现核验）：① `shouldIncludeFirstPartyOnlyBetas()` 门（advisor beta header 仅 1P，Bedrock/Vertex 400）② growthbook 实验 `tengu_sage_compass`（`getFeatureValue_CACHED_MAY_BE_STALE(..., {})` 默认 `{}` → enabled≡false；Atlas growthbook 已裁 stub）③ 模型支持表 = `opus-4-6/sonnet-4-6/USER_TYPE==='ant'`（1P 模型名）。
3. **无执行面**：advisor 是 **1P server-side tool**（`server_tool_use` block，API 服务端执行）；Atlas 全仓无 advisor 工具执行路径（`server_tool_use` 仅 messages.ts 的 1P 块渲染/孤儿清理 + cost-tracker usage 计数）。网关（Qwen/deepseek IFF）无法执行服务端工具。

**推论（决定性）**：
- 只搬命令体（109L）= `isEnabled: () => canUserConfigureAdvisor()` ≡ false → **永远禁用的死命令**（违 W2 死码卫生目标）。
- 连墓碑复活（改 gate 真实现）= 新造 1P 功能（越出本波「补全」scope，且无服务端执行面 → 配置存了也永不触发 = 空壳承诺）。
- 旁证：`main.tsx` `--advisor` CLI flag 现状 = **恒 hard-error**（L1758 `modelSupportsAdvisor()`≡false → `process.exit(1)`）——D2 残留，现任何用户带 `--advisor` 启动必炸（观察项 O-adv-1，归后续波：删 flag 或降级提示，不属本波）。

**定案**：advisor → **E-1P 第 10 项登记不做**（1P server_tool_use + 1P growthbook 实验 + 1P 模型表；D2 已有意整裁，回流 = 网关获 1P server-side tool 能力车道再议）。**0.1.41 内容消失 → 重规划**（见版本计划节）。

**复活路径备料（若用户明早裁定复活，30 秒落码）**：Atlas 化移植稿已备 `/tmp/advisor-0141-draft/commands-advisor.ts`（上游 109L 唯一重映射 = normalizeModelStringForAPI 从 `src/modelprovider` 导入；依赖面全核：utils/advisor.ts 4 函数 ✓ AppState.advisorModel ✓ mainLoopModel ✓ model.ts 2 函数 ✓ validateModel ✓ updateSettingsForSource ✓ ToolUseContext getAppState/setAppState ✓）；落码面 = 该文件 + commands.ts（import + 生产主表注册，对齐上游 L152/L260 语义）+ **D2 墓碑复活**（`utils/advisor.ts` 换上游 145L 真实现或 Atlas 化 gate——越界项，需用户点头）；worktree `worktrees/worktree-0.1.41-advisor`（@ 9f8df7f）预留，保持 clean。

### out-of-scope（本波不做，登记在案）
- `fast` → 0.1.42 deferred（缺 `utils/fastMode.ts` + gate 需适配 Atlas modelAllowlist fast 通道）
- `privacy-settings` → E-1P 第 9 项（grove 已裁 + consumer 门恒 false，de-ANT 无意义）
- **`advisor` → E-1P 第 10 项**（D2 全 false 墓碑 + 1P server_tool_use + 1P growthbook 实验 tengu_sage_compass + 1P 模型表；只搬命令体=永禁死命令，复活墓碑=越界新造 1P 功能）
- **`--advisor` CLI flag 恒 hard-error**（main.tsx L1758，D2 残留）→ 观察项 **O-adv-1**（归后续波：删 flag 或降级为提示；不属本波，不阻塞封口）
- `brief`（130L，需连子模块，成本最高，缓做）

### 判据（W4 定案后）
- W4 三件（advisor/fast/privacy-settings）**全登记、零落码** → 本波无功能探针；0.1.41 封口版判据 = 四件套绿 + 登记面核验（E-1P #9/#10 + fast 0.1.42 在案）+ /help 一致性断言（0.1.41 命令集 = 0.1.40 命令集，零增减）
- ~~落码后 `getCommands()` 含 `advisor`~~（已废，见 spike 误判根因）

### 风险
低（W4 定案后零落码；风险源 = 用户明早对「advisor 不补、0.1.41 改封口版」的裁定 → 已按 fast/privacy-settings 同型先例预走封口，若用户裁定改判复活 advisor 则 0.1.41 回退为功能版（复活 D2 墓碑 + 命令体，越界项需用户点头））

---

## 跨波处理项 · /help 一致性核验（用户裁定新增）

> **结论先行**：`/help` 命令列表是**纯动态**的——`help.tsx` → `<HelpV2 commands={commands} />`，命令表来自 REPL 的 `getCommands`；`HelpV2/Commands.tsx` 是 `commands.filter().map(cmd=>'/'+cmd.name)` 渲染，**无任何硬编码命令名**（HelpV2 三文件 grep 命令名全空）。所以删 5（W1）、加 6（W3/W4）后 `/help` 列表**自动跟随，`/help` 本身零改动，无需手动"刷新文档"**。

**处理项内容 = 每波 e2e gate 里加一条行为断言**（不是改代码，是核验）：
- 打开 `/help`，断言其**实际渲染的命令集 = 该波期望命令集**
  - W1 后：不含 statusline / output-style / pr-comments / security-review / torch（5 个已删）
  - W3 后：含 files / tag / version
  - W4 定案后：零增减（advisor/fast/privacy-settings 全登记不做）→ 0.1.41 封口版 /help 断言 = 命令集与 0.1.40 精确一致
- 判据 = 命令集**精确匹配**（既无已删残留、也无遗漏新增），作为该波 gate 的收尾断言

> 若发现 `/help` 未跟随（不应发生，因是动态的），则该条 FAIL 定位到命令表注入链路（`REPL.tsx:517/563 commands` prop 传递），而非 /help 本身。

---

## 执行链（每波统一）

```
f4 判据就绪 → Main 落码（工作区）→ e2e gate（四件套 + 命令表断言 + 功能探针 + /help 一致性断言）
→ gate PASS 单信号回 f4 → Main 收口发布（commit/tag/npm）→ 生产 lane 验真
```

- 每波独立 0.1.x 版本，in-scope 收口 + deferred 显式命名
- W1 发布前注意：voice 保留裁定是本波 in-scope 边界的负向声明，gate 断言里要含"voice 仍在表内"
- 每波 gate 收尾含 /help 一致性断言（见上"跨波处理项"）

## 版本计划 + 时间线（2026-10-08 协商定案，f4↔Main）

**现状锚点**：master = `0.1.37`（已发布 v0.1.37，HEAD d99e764）；`worktree-0.1.38/0.1.39-sessionlist` 占 0.1.38/0.1.39（在途 3/7 提交，未发布，归 Main 常设发布序列）。

**Main 裁定（2026-10-08）**：
- **编号**：本 track = **0.1.40**（W1+W2+W3 合并一版）+ **0.1.41**（W4）。
- **发布序（SemVer 单调，master 不回退号）**：`0.1.38 → 0.1.39`（sessionlist，Main 在途）`→ 0.1.40 → 0.1.41`。本 track 可**并行开发**（worktree 基 master 0.1.37 独立落码无冲突），但 **0.1.40 发布 gate 卡 0.1.39 收口发布之后**。
- **文件冲突**：Main 确认无重叠（我 commands.ts+命令文件 / Main SessionTreeScreen+colorize+sessionStorage）。唯一风险点 = W2 删 15 死码是否命中 sessionlist 导入链 → **已 grep 清**（20 删除项除 commands.ts 主表外全仓零 import；sessionlist 导入面 agenticSessionSearch/SessionTreeScreen/ResumeConversation/resume/branch 无一 import 我的删除项；branch/resume 不在我删除名单）→ W2 可并行安全落。
- **W4**：spike 先行，过了上 0.1.41、没过显式 deferred 到具名版（需求封口不阻塞），Main 认可。**执行结果（2026-10-08 深夜）**：spike 初判「过了」（依赖全齐）经落码前复核推翻=文件在场但 D2 墓碑（全 false）+ 三重 1P 门 → 走「没过」分支：E-1P #10 登记，0.1.41 收窄为封口版（Main 原裁定「没过显式 deferred 到具名版，需求封口不阻塞」覆盖此情形，无需重新裁定；复活 advisor 属新 scope，留用户明早）。

**时间线（今晚 → 明早，含 Main 的 0.1.38/0.1.39 前置）**：
| 序 | 动作 | 责任 | 依赖 |
|---|---|---|---|
| 1 | ~~0.1.38 发布~~ **✅ 已发布收口**（2026-10-08 ~01:30：release d15c416 + tag v0.1.38 + npm 0.1.38，shasum 26b87dc0cd87…）| Main | 0.1.37 |
| 2 | ~~0.1.39 发布~~ **✅ 已发布收口**（0.1.39 全链：`592a3b7` 码面 → GATE-OPEN(hardFail=7) → `b7ef49f` 双簇根修（3789/0·271 全绿）→ e2e GATE-PASS → **release `9f8df7f` + tag v0.1.39**，master head = 0.1.40 开波基线）| Main + e2e | 0.1.38 ✅ |
| 3 | **0.1.40 开发**（W1+W2+W3 code-complete + 四件套）| **f4 落码（Main 2026-10-08 裁定 a 案委托）** | **基线（Main 裁定 a）= Main 执行 0.1.39 release 提交（bump+tag+push）后的 master head**（Main 主动同步 head hash；release bump 提交不混进 0.1.40 分支，基线干净）。f4 据该 head 开 worktree 落码：W1 删 5+孤儿 / W2 删 15+E-1P 8 登记 / W3 三件翻开 + 本地四件套 |
| 4 | **0.1.40 闭环**（gate → 生产 lane → 发布 v0.1.40）| e2e gate + Main 发布 | **0.1.39 已收口** |
| 5 | **0.1.41 = 封口版**（~~advisor 移植~~ **2026-10-08 深夜重规划**：spike「依赖全齐」误判=只验文件在场未验活性，`utils/advisor.ts` 实为 D2 全 false 墓碑 + 1P server_tool_use 三重 1P 门 → **E-1P 第 10 项登记不做**；0.1.41 内容消失 → 改**零码封口版**：E-1P #9/#10 + fast 0.1.42 具名 deferred 正式登记 + W4 三件收口 + /help 断言零增减；先例 = 0.1.35 Brand 封口版；**用户明早裁定点**：若裁定复活 advisor 则 0.1.41 回退功能版）+ gate + 发布 | f4 登记 + e2e gate + Main 发布 | 0.1.40 |
| 6 | **W4 三件登记收口**：fast → 0.1.42 deferred（缺 fastMode 模块 + gate 需适配 modelAllowlist 通道）；privacy-settings → E-1P 第 9 项；**advisor → E-1P 第 10 项**（D2 墓碑 + 1P 三重门）；**O-adv-1 观察项**（`--advisor` CLI flag 恒 hard-error，D2 残留，归后续波） | f4 登记 | — |

> 关键：0.1.40 **开发并行、发布串行**（发布卡 0.1.39）。**优先级已裁（Main 2026-10-08）**：e2e 当前最高优先 = 0.1.39 tui-diff 走查 gate；0.1.40 gate 备料顺延（本就卡 0.1.39 发布，备料不赶）。

**0.1.40 落码状态（2026-10-08，f4 执行 Main 委托 a 案，worktree `worktrees/worktree-0.1.40-slash` @ 分支 `worktree-0.1.40-slash`，基线 = `9f8df7f` = v0.1.39 release commit，基线干净未混 bump 提交）**：

- **改动面（29 文件 = 5 M + 24 D，10 增/588 删）**：
  - `src/tui/commands.ts` −42 行：20 import 删 + INTERNAL_ONLY 14 项删 + COMMANDS 表 6 项删（installSlackApp/outputStyle/pr_comments/statusline/securityReview/torch）+ REMOTE_SAFE 去 statusline + BRIDGE_SAFE 去 summary + torch feature require 行删；**新增 E-1P 9 项前向缝登记注释**（chrome·desktop·mobile·install-github-app·extra-usage·rate-limit-options·passes·remote-env·privacy-settings = 1P 依赖有意不搬，回流=对应 1P 车道实施波）
  - 24 文件删除 = W1 删 5 命令体（statusline.tsx / output-style×2 / pr_comments / security-review.ts / torch.ts）+ install-slack-app×2 + W2 14 tombstone（autofix-pr/backfill-sessions/break-cache/bughunter/ctx_viz/debug-tool-call/env/good-atlas/issue/oauth-refresh/onboarding/perf-issue/share/summary 各 index.js）+ createMovedToPluginCommand.ts + `tools/AgentTool/built-in/statuslineSetup.ts`
  - `src/tui/tools/AgentTool/builtInAgents.ts` −2 行：STATUSLINE_SETUP_AGENT import + 注册数组项（现 `[GENERAL_PURPOSE_AGENT]` 起）
  - W3 三件翻开：`commands/files/index.ts`、`commands/tag/index.ts`（生产主表）+ `commands/version.ts`（INTERNAL_ONLY dev 表）`isEnabled: () => false` → `() => true`
  - **voice 保留确认**（L48-50 voiceCommand + L216 注册，注释标注 VOICE_MODE=国产 ASR 网关车道）
  - `src/engine/tools/agent/builtInAgents.ts` 注释 2 处订正：STATUSLINE_SETUP_AGENT 由「残留守/随后续纵切落」改「0.1.40 W2 终裁移除，非残留守」（防误判为待落项；仅注释，零行为变化）
- **核验**：20 删除符号全仓 import 残留 = 0（tsc 0 为决定性证据 + 路径级 grep NONE）；createMovedToPluginCommand / statuslineSetup / STATUSLINE_SETUP_AGENT 无代码引用（engine 侧仅注释已订正）；sessionlist 导入面零命中
- **四件套（worktree 本地）**：tsc --noEmit **0** · eslint src/ **0e·0w** · bun build **3848 modules / 17.59MB** · 全量单测 `bun test --isolate tests/` = **3789 tests / 271 文件（与 0.1.39 基线同口径，删除未减测试数）**：默认环境 3786 pass / 3 fail（全在 `tests/unit/colorize-d4.test.ts`，= 后台进程无 TTY → chalk level 0 环境因子，**非本波代码**；该文件 `FORCE_COLOR=1` 单跑 **6/6 全绿**）→ **`FORCE_COLOR=1` 全量重跑 = 3789 pass / 0 fail / 9791 expect = 与 0.1.39 基线 3789/0·271 完全对齐，四件套全绿 ✅**
- **提交**：**`bdf2baa`** 已落 `worktree-0.1.40-slash` 分支（@ 9f8df7f 之上，30 files 15+/590-，工作树 clean）
- **闭环进度**：✅ 四件套全绿 → ✅ 单信号回 Main（code-complete + 0.1.41 收窄重规划）→ ✅ Main 认 + 只读核验通过（bdf2baa 30 files/590 删同量级）→ ✅ e2e 0.1.40 gate 开波 → **✅ GATE-PASS（e2e 单信号 r-20261008-0140-gate.md，2026-10-08 早）**：命令表 27 探针全绿（20 删项双层离场 + files/tag/version 翻开 + voice 保留 + E-1P 9 项登记在场 + engine 残留核销）+ StatusLine 双面（默认面 ⚡+⌂ 在场 + 配置面 5→1 消费）+ /help 零增减（渲染集 50 标签，21 项零残留）+ 0.1.41 封口版（零码）同 gate 顺跑全绿 + 四件套 e2e 独立复跑 3789/0·271 与 f4 报值一致；探针侧 5 项判据修复全定因（0 产品缺口）→ ✅ Main cherry-pick `bdf2baa` → master **`2d1ddcc`** + release **`d5c6608`**（bump+CHANGELOG）+ tag v0.1.40 + push×2 + merge-base 对齐 PASS + Main 全量 suite 3789/0·271 SUITE_EXIT=0（三独立复跑精确一致）→ **⏳ npm publish 0.1.40 = 用户动作项**（auto-mode 分类器拒：transcript 缺逐字发布授权；用户执行 `! cd /home/vince/projects/AtlasCode && npm publish --registry https://registry.npmjs.org` 后 Main 续 packument 验真）→ 生产 lane（e2e 按需，npm 出后）
- **0.1.41 收窄裁定（Main 已认）**：advisor → E-1P 第 10 项登记不做（E-1P 9→10）；0.1.41 = 零码封口版（四件套+登记面核验+/help 零增减断言，先例 0.1.35）；O-adv-1 观察项登记 0.1.41+（归 issule intake 面 triage）；fast → 0.1.42 具名 deferred 维持；用户裁定点 = advisor 是否复活（复活则 0.1.41 回退功能版，备料已就绪）

**0.1.39 gate 观察项登记（不阻塞 gate，归 0.1.39+）**：3 条 INCONCLUSIVE（全探针侧）+ `input.length===1` 多字符丢弃观察项（Main 2026-10-08 同步）。

**封口语义（2026-10-08 深夜更新）**：明早终态 = 0.1.38/0.1.39 已发布 + **0.1.40 已发布**（W1+W2+W3 需求闭环）+ **0.1.41 已发布（封口版：E-1P #9/#10 + fast 0.1.42 具名 deferred + W4 三件收口）** + **fast 显式 deferred 到 0.1.42**（具名版）+ **advisor 归 E-1P 第 10 项**（D2 墓碑 + 1P 三重门，只搬命令体=永禁死命令）+ **O-adv-1 观察项**（`--advisor` flag 恒 hard-error 待后续波）——需求封口不阻塞。**用户明早裁定点（不预支）**：advisor 是否复活（复活 = 新 scope，0.1.41 回退功能版）。

## 登记在案不做项（防回潮）

| 项 | 原因 |
|---|---|
| bridge / remote-setup / ultraplan / bridge-kick / teleport | 1P 远程/CCR 簇，§8.74.29 前向缝登记有意裁除 |
| agents-platform / torch 实现体 | 上游快照缺实现文件（无源可搬），挂起 |
| **fast → 0.1.42 deferred**（spike） | `utils/fastMode.ts` 缺失 + `isFastModeEnabled` 未定义；Atlas fast 走 modelAllowlist 通道，gate 语义与上游不同，需补模块+gate 适配（夜间不做，显式具名版封口） |
| **privacy-settings → E-1P 第 9 项**（spike） | 非本地命令：index gate=`isConsumerSubscriber`（已裁、恒 false）+ jsx 依赖 grove（GroveDialog/PrivacySettingsDialog + services/api/grove，已整裁）= 1P 依赖，de-ANT 无意义 |
| **advisor → E-1P 第 10 项**（2026-10-08 深夜复核，推翻 spike 初判） | 三重 1P：① 1P server-side tool（`server_tool_use` block，API 服务端执行，Atlas 网关无执行面）② 1P growthbook 实验 `tengu_sage_compass`（默认 `{}` → enabled≡false）③ 1P 模型表 opus/sonnet-4-6；且 `utils/advisor.ts` 已被 D2 波整裁为全 false 墓碑（头注「advisor 整体删除，不做元数据化保留」）→ 只搬 109L 命令体 = `isEnabled`≡false 永禁死命令；复活墓碑 = 越界新造 1P 功能。回流 = 网关获 1P server-side tool 能力车道再议 |
| **O-adv-1 观察项：`--advisor` CLI flag 恒 hard-error**（main.tsx L1758） | D2 残留：`modelSupportsAdvisor()`≡false（墓碑）→ 任何 `--advisor <model>` 启动必 `process.exit(1)`；归后续波（删 flag 或降级提示），不阻塞封口 |
| login / logout / reload-plugins / feedback / rename | de-ANT 正确裁除 1P 副作用（§8.74.29 登记），命令核心完整 |
| brief | 成本最高，缓做 |
| stickers / btw | 用户未选 |

## Main 侧发布列车收口记录（2026-10-08）

- **cherry-pick**：`bdf2baa` → master **`2d1ddcc`**（`feat(tui): 0.1.40 slash 精简波 W1+W2+W3…`，master checkout 落盘，主题核销一致）
- **Main 全量 suite 证实**：verify worktree（@ 2d1ddcc）`bun test --isolate tests/` = **3789 pass / 0 fail / 9791 expect / 271 文件 / 356.15s / SUITE_EXIT=0**（与 f4·e2e 双独立复跑精确一致）
- **release 提交**：**`d5c6608`**（bump 0.1.40 + CHANGELOG 0.1.40 段）+ tag **`v0.1.40`** + push×2（master 9f8df7f..d5c6608 + tag）+ `git merge-base --is-ancestor origin/master master` 对齐 PASS
- **★ npm publish 阻塞（待用户动作，非代码缺口）**：`npm publish --registry https://registry.npmjs.org`（0.1.40）被 auto-mode 权限分类器拒（transcript 无用户逐字发布授权；常设授权以 peer 转达/压缩摘要形式存在不满足门槛）。GitHub 侧已全收口，npm 侧 + packument 验真（~3min 传播，落盘 JSON + node require 第三次查）待用户执行 `! cd /home/vince/projects/AtlasCode && npm publish --registry https://registry.npmjs.org` 后续跑
- **基线交接**：0.1.41 封口波基线 = **d5c6608**（裁定 a：各波基线 = 上一波 release 提交）；0.1.41 = 零码封口版（E-1P #10 advisor 登记 + /help 零增减断言）；W4 spike 并行面不受影响

## 0.1.41 封口版落码状态（2026-10-08，f4，worktree `worktrees/worktree-0.1.41-seal` @ 分支 `worktree-0.1.41-seal`，基线 = `d5c6608` = v0.1.40 release commit）

- **落码面（零行为登记，1 文件）**：`src/tui/commands.ts` E-1P 前向缝登记注释块 9→**10 项**（补 **#10 advisor**：三重 1P 门〔① 1P 服务端工具 server_tool_use，de-ANT 网关无执行面 ② 1P growthbook 实验 tengu_sage_compass ③ 1P 模型表 opus/sonnet-4-6〕+ D2 全 false 墓碑 + 只搬命令体=永禁死命令推论 + 回流=1P 服务端工具能力车道再议）+ **O-adv-1 观察项入代码登记**（`--advisor` CLI flag 现恒 hard-error，归 0.1.41+ 后续波 triage：裁 flag / 降 no-op 二选一，Main 已回 issule intake 面）
- **doc 侧登记**：W4 三件收口（advisor→E-1P#10 / fast→0.1.42 具名 deferred / privacy-settings→E-1P#9）+ 封口语义更新（本节 + 版本计划 row 5-6 + 不做项表，已全量同步）
- **判据（e2e gate，Main 裁同口径顺跑）**：四件套绿 + 登记面核验（commands.ts E-1P 注释块 10 项在场 + /help 零增减断言=命令集与 0.1.40 精确一致 50 标签）
- **提交**：**`05103c2`** 已落 `worktree-0.1.41-seal` 分支（@ d5c6608 之上，1 file 9+/3-，工作树 clean）
- **四件套**：tsc 0 · eslint 0 · build 3848 modules · 全量单测 **3789/0·271**（FORCE_COLOR=1，与 0.1.40 d5c6608 基线对齐，356s/9791 expect）
- **进度**：✅ code-complete + 单信号回 Main（2026-10-08 ~07:20）→ ✅ **e2e GATE-PASS（`r-20261008-gate-041.md`）**：登记面 27/27（E-1P 10 项在场）+ /help 50 标签双向 diff ∅ + 四件套 3789/0·271 与 d5c6608 基线精确一致 → ✅ **Main cherry-pick `05103c2` → master `62cf95c`**（feat 先入 master）+ verify worktree 四件套（tsc 0 / eslint 0e·0w / build 17.59MB / 全量后台）
- **★ Main 裁定（2026-10-08）：0.1.41 bump+CHANGELOG+tag v0.1.41+push×2 压后至 0.1.40 npm 落盘之后连续收口**（npm 单调性：若先 bump master 至 0.1.41，registry 将永久拒绝 0.1.40 回发，破坏 GitHub·npm 同步裁定）→ 0.1.41 走「feat 先入 master（`62cf95c` 已入）→ release 提交+tag+push 待 0.1.40 npm 后」
- **待办链（全链唯一阻塞 = 用户动作项）**：用户执行 `! cd /home/vince/projects/AtlasCode && npm publish`（0.1.40）→ Main 续 packument 验真 + 0.1.41 release 提交+tag+push + 0.1.41 npm → e2e 生产 lane（0.1.39 task #97 + 0.1.40 按需 + 0.1.41 按需）→ 需求封口终态
- **用户裁定点（不预支）**：advisor 是否复活（复活 = 新 scope，0.1.41 回退功能版；备料 = 移植稿 `/tmp/advisor-0141-draft/commands-advisor.ts` + worktree `worktrees/worktree-0.1.41-advisor` @ 9f8df7f clean，30 秒启用面）

## npm 落盘实况（f4 核验，2026-10-08 ~10:27）

- **0.1.40 npm = ✅ 已发布**：registry 直查 = `0.1.40 @ 2026-10-08T02:24:58.239Z`（本地 10:24:58，介于 10:05 检查点与 10:27 核验之间落盘），`dist-tags.latest = 0.1.40`。**SRI 三方 MATCH**：registry shasum `f5eb1bf30933bf4074e8f77e505649901ff7c3d2` + integrity `sha512-FGcfg5pt…Nguw==` + unpackedSize 17,596,267 **与 f4 在 `publish-0140` worktree（@ d5c6608 = tag v0.1.40 = 生产 lane git-tag 实测面）dry-run 值精确一致** → 发布面 = 被测面（支柱②成立）。发布执行方 = 用户或 Main 侧重试（f4 侧执行被 auto-mode 分类器拦截，未由 f4 落）
- **0.1.41 npm = ✅ 已发布（用户终端 `!` 执行，Main 10:xx 订正确认）**：registry 值 = shasum `ef2ef1cc54627afb51b1e4add0c9e28d0fef589b` + SRI `sha512-qKNwpDEL…` + unpacked 17.6MB + latest=0.1.41（Main packument 双验真：0.1.40 MATCH〔FGcfg5pt…〕+ 0.1.41 MATCH〔qKNwpDEL…〕，传播 ~3.5min 窗口各第三次查到达）
- **f4 SRI 交叉核验实况（同法：发布面 dry-run vs registry）**：
  - **0.1.40 = 精确 MATCH**：registry `f5eb1bf3…ff7c3d2` = f4 `publish-0140` worktree（@ d5c6608 = tag v0.1.40）dry-run 值逐字一致 → 发布面=被测面（支柱②成立）
  - **0.1.41 = 版本+unpackedSize MATCH、shasum 差值定因**：f4 `publish-0141-verify` worktree（@ 9564e63 = tag v0.1.41）dry-run 值 = shasum `12e4b3a1…` + SRI `sha512-u0bzoSnZ…` + unpacked 17.6MB vs registry `ef2ef1cc…/qKNwpDEL…/17.6MB` → 版本 ✓、unpackedSize ✓、**shasum/integrity 差值定因 = 打包时刻 mtime 非确定性**（tarball 字节含文件 mtime，独立两次 build 必异；0.1.40 精确 MATCH = 发布恰取 f4 构建面之巧合非保证）；**源级一致性成立**：git diff `62cf95c→9564e63` = 仅 package.json（bump）+ CHANGELOG，src/ 零改动 → 0.1.41 发布代码面 = 0.1.41 gate 被测面（62cf95c 代码面）逐字一致。按 0.1.37 先例口径（SRI+unpackedSize 为判据、md5/shasum 差值 = 观测项），**0.1.41 发布面核验 = PASS（定因非缺口）**
- **全链现态（2026-10-08 ~11:00）**：GitHub 两版 ✅（2d1ddcc/d5c6608 + 9564e63，tag v0.1.40/v0.1.41）+ npm 两版 ✅（0.1.40@10:24:58 本地 + 0.1.41，皆用户终端执行；Main 侧 auto-mode 瞬态故障全程未落）+ packument 双 MATCH ✅ → **待 e2e 双 lane 回放（① 0.1.40 lane npm SRI 段 ② 0.1.41 生产 lane，被测体 tag v0.1.41/9564e63，已触发）→ 需求封口终态**
- **后续波基线**：0.1.42（fast 具名 deferred 版）= `9564e63`（0.1.41 release head，Main 裁定 a）

## 检查点核查记录（f4）

- **10:05 核查（无进展登记）**：① packument latest 仍 **0.1.39**（0.1.40/0.1.41 未发布，registry 直查）→ 用户 `npm publish` 仍未落盘 ② Main 状态 **idle→busy**（09:17 idle；busy 原因不推断、不插队，下一检查点核其产出）；e2e 仍 idle ③ advisor 裁定点未裁（0.1.41 保持零码封口版）。→ 全链单阻塞不变，顺延下一检查点 11:00。
- **09:17 核查（无进展登记）**：① packument latest 仍 **0.1.39**（0.1.40/0.1.41 未发布，registry 直查）→ 用户 `npm publish` 动作仍未落盘 ② Main/e2e 均 idle 等待态（ListAgents 核实）③ advisor 裁定点未裁（0.1.41 保持零码封口版）。→ 全链单阻塞不变，顺延下一检查点 10:05。
- **08:05 核查（无进展登记）**：① npm packument `@atlasharness/atlascode` latest = **0.1.39**（0.1.40/0.1.41 均未发布，registry 直查）→ **用户 `npm publish` 动作未落盘**，全链单阻塞维持 ② master = `62cf95c`（0.1.41 feat-only，0.1.41 release 面按 Main 裁定冻结至 0.1.40 npm 后）③ Main/e2e 均 idle 等待态（ListAgents 核实）④ advisor 裁定点未裁（0.1.41 保持零码封口版，备料不动）。→ 无单信号推进项（推进唯一入口 = 用户 npm 动作），顺延下一检查点。
- **待用户动作（明早终态唯一入口）**：`! cd /home/vince/projects/AtlasCode && npm publish`（0.1.40）→ 落盘后 Main 续 ① packument SRI 三方 MATCH + e2e npm 面回放 ② 0.1.41 release 提交+tag v0.1.41+push×2+0.1.41 npm → 需求封口终态。

## 0.1.42 范围重裁定（2026-10-08 下午，用户终裁 + f4 越界回退）

- **用户裁定：「0.1.42 不增加 fast 需求」**——此前 f4 提出的 fast 方案（窄核心适配 / 整体清理 / fast 角色删除三案）**全部作废**；fast 相关改动（f4 曾在 worktree-0.1.42-fast 落码 9 文件：ModelPicker 死 prop / systemInit+SDK schema fast_mode_state / main.tsx --advisor 链 / cost-tracker+bypassKillswitch 注释）**已全部回退**（worktree 归 9564e63 基线 clean，git checkout 核验）
- **fast 终态（取代原「0.1.42 具名 deferred」）**：**E-1P 第 11 项登记不做**——用户裁定「未来不会有 Claude 相关的模型特性」：fast/fastMode（Claude 1P 模型特性：速度档 + org-status 端点 + OAuth + extra-usage 计费）不搬、不复活；Atlas fast 角色（三角色体系轻量路由，6 消费方）**保持原状零改动**（轻量任务维持原逻辑，用户「还是维持原来的逻辑，轻量任务还是需要的」）；`/fast` 命令本不存在（登记缺席）。**原「删 fast 角色、轻量任务改走主 loop」裁定随「0.1.42 不加需求」一并作废**
- **0.1.42 范围（待 Main 裁定，f4 只出方案不编码）**：内容收窄 = **W-B O-adv-1（main.tsx `--advisor` flag 裁除，Main 已裁①裁 flag）+ E-1P #11 fast 登记（零码）**；若用户裁 0.1.42 亦不保留 W-B → 0.1.42 取消，O-adv-1 + E-1P#11 归后续波/观察项
- **★ 角色边界裁定（用户原话，2026-10-08）：「我并没有让你直接实施和编码，这不是你的职责」**——f4 职责 = 规划/管理/协调/判据/核验；**落码一律 Main 车道**（0.1.40/0.1.41 系 Main 明确委托才落，0.1.42 无委托，f4 直接编码 = 越界，已回退归零）。后续波 f4 交付物 = 方案文档 + 判据，不碰 src/
