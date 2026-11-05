# 0.1.38 sessionlist P0 正确性波 · 4 行为探针 + 显示面断言设计（e2e 预研定稿，零产品改动）

- **对象**：0.1.38 P0 正确性波（P0-A load-all 消 50 截断 / P0-B 排序键回消息时间戳〔B-lite〕/ P0-C1 删列表打开回写 / P0-C2 isSidechain 首行判定 + ctime 脏值）**+ 55b5aa5 随车显示面断言 D1-D6（2026-10-07 用户裁定 B：随车面行为断言拉进 0.1.38 gate——版本=收口契约，0.1.38 覆盖自己的显示面）**
- **工单**：`docs/2026-10-06-sessionlist-implement.md`（Main 裁定段 + 版本规划段「e2e 覆盖」）
- **探针**：`user-e2e/tui-diff/sessionlist-038.ts`（PTY 驱动，`lib/pty.ts`）
- **纪律**：e2e 只做测试侧；探针/fixture 全在 `user-e2e/` 落工作区（Main 随 0.1.38 波收编）；零写真实 `~/.atlas`（sandbox home + `ATLAS_CONFIG_DIR` 直覆）

---

## 4 探针 × 判据 × 判别力（前后 lane 统一，规则②）

| 探针 | P0 项 | fixture 造面 | 判据（post-fix 必绿） | pre-fix 判别面（0.1.37 必红） |
|---|---|---|---|---|
| **SL-SORT** ① | P0-B | A：最后消息 ts = now−3h、文件 mtime = now−2d；B：反向（ts = now−30d、mtime = now）。**2026-10-07 格式冲突订正**（Main 55b5aa5 随车面：活跃列 = `formatActive` 混合——≤7d 相对 now/5m/2h/6d、>7d 绝对，SessionTreeScreen.tsx:154；原定稿 A=now−5min 会显相对非 fmtShort 绝对 → 假 FAIL 风险）：A 取相对面（镜像 `fmtActive` 断言，3h 桶 1h 余量稳）、B 取绝对面（`fmtShort` seed 基准），避 7d 边界 | A 行在 B 行之上（按消息时间戳排序，非 mtime）+ A「最近活跃」= `"3h"`（formatActive 相对面 = 消息时间，非 mtime 2d 面）+ B「最近活跃」= `fmtShort(B)`（>7d 绝对面 = 消息时间 30d，非 mtime now 面 `"now"`） | pre-fix 排序键 = stat mtime → B（mtime=now）在 A 上 + 活跃列显 mtime（A 显 2d/绝对 mtime 日期） |
| **SL-COUNT** ② | P0-A | 60 个有效 session（UUID 文件名 + user/assistant 消息条目；最后消息 ts 逐 60s 递减；mtime 同 ts 解耦排序变量）+ **200 行视口**（`ATLAS_E2E_ROWS=200` → visibleRows 194 ≥ 60 一屏全量呈现） | `cnt-00`（最新）+ 最旧行 `cnt-59` 同屏现形 = 全量可达（初始全量 emit 捕获，免滚动/cell-diff 捕获面） | pre-fix `enrichLogs(INITIAL_ENRICH_COUNT=50)` 只 enrich 50 个（mtime desc 前 50 = 50 最新）→ `cnt-50..59` 不在场 → 无 `cnt-59` = FAIL |
| **SL-SIDECACHE** ③ | P0-C2 | S：首行 = mode 条目（无 isSidechain 字段）+ head 内非首行 `"isSidechain":true` sidechain 内容条目 + user/assistant；T：纯主 session 对照 | S 行在场（首行判定不误滤）+ T 对照在场 | pre-fix `readLiteMetadata` 整 64KB head 扫 `head.includes('"isSidechain":true')` → S 被 `enrichLog` 过滤 → 缺失 = FAIL |
| **SL-MTIME** ④ | P0-C1 | 8 个无 customTitle session（pre-fix 回写触发面最大化：`deriveAutoTitle`→`saveCustomTitle('auto')` fire-and-forget） | 列表打开（观察窗 12s）+ q 关列表（余量 3s）后 8 文件 mtime 全不变（stat mtimeMs 前后精确比对） | pre-fix 回写 append → mtime 被顶至「现在」= FAIL |

**verdict 纪律**：hard FAIL = 产品缺口（fail-closed 不发布）；INCONCLUSIVE 必带定因（列表未渲染/行缺失/SGR 未捕获——核 artifact `pty.log`/`list-capture.txt`）；fixture 自检失败（JSONL 不可解析/无 user 条目）= 探针缺陷 ERROR（PTY 前拦截，非产品判定）。

---

## 显示面断言 D1-D6（用户裁定 B，55b5aa5 随车面；场景 `display`，双 PTY：宽 200×50 主屏 + 窄 70×30 基线屏）

| 断言 | 面 | fixture 造面 | 判据（0.1.38 必绿） | 锚点（55b5aa5 源级） |
|---|---|---|---|---|
| **D1** created 列（双时间） | P0-B 数据层 + 随车 | 首消息 ts 已知：disp-created3d = now−3d（mtime 造 now−10d 诱饵）/ disp-created2025 = 固定 2025-12-25（mtime = now 诱饵） | created 列 = `M/D/YYYY` 且值 = **首消息时间戳**（`10/4/2026` / `12/25/2025`；若 stat 脏值面 → mtime 诱饵日期） | `readLiteMetadata` `extractJsonStringField(head,'timestamp')` + `enrichLog` `created: parseLiteTimestamp(meta.firstTimestamp)`（sessionStorage.ts:4793/5114）+ `formatCreated`（SessionTreeScreen.tsx:160） |
| **D2** `[C]` 徽标 | 随车徽标 | 尾条 `{"type":"mode","mode":"coordinator"}`（last-wins tail scrape） | 行内 `[C]` token 在场 | `mode` 校验域 coordinator/normal（:4800）+ `flags += ' [C]'`（SessionTreeScreen 标志段） |
| **D3** chip（行尾 token 形保留） | 随车 chip | 尾条 `tag:"e2etag"` + `agentSetting:"e2eagent"` | 行内 `#e2etag` + `@e2eagent` | `flags += ` #${log.tag}` / ` @${log.agentSetting}`（标志段数据 chip 段） |
| **D4** agentColor 着色基线（Main 裁定③ 0.1.38 态） | 随车着色 | 尾条 `agentColor:"orange"` / `"purple"` + plain 对照行（无 agentColor） | idle 行 raw ANSI 色码（pty.log 全量 raw 通道核**行局部区**前景码：上一行 title 后 → 本行 title 前，只取 38;/16 色 fg 码排除复位/强度码）：orange → **黄族**（chalk `AGENT_ROW_COLOR.orange='yellow'`：24-bit `38;2;255;255;0` / 256 色 206/11/3 / 16 色 33）；purple → **紫族**（'magenta'：`38;2;255;0;255` / 201/13 / 35）；plain 对照行行首区不现族码（null = 无 fg 码 = 主题默认 → 交叉对照成立） | `AGENT_ROW_COLOR`（SessionTreeScreen.tsx:176，purple/pink→magenta、orange→yellow chalk 安全映射）+ idle 行 `color = AGENT_ROW_COLOR[log.agentColor]`；精确 theme 映射归 0.1.39 |
| **D5** 状态机前置态（Main 裁定④ 0.1.38 前置面） | 随车标志段重排 | 聚焦行（顶行 disp-top，带 #e2etag/@e2eagent/[C] 数据 chip）按 `f` | 宽档：3s confirm 窗口内「`[f 确认 fork]`」token 现形（confirm 前负控不在场）；**窄档截断核**（窄档 maxFlags ≈30 < confirm 后标志段全宽 ≈35 → 尾部截断：token 幸存 + 尾部 chip 被截 = 前置防截断现形；token 缺而 chip 在 = 未前置 FAIL；截断面未达 = INCONCLUSIVE 源级序锚）。**不断言底部操作行（0.1.39 面）** | `rowState==='confirm' → flags += ' [f 确认 fork]'`（状态机段先于 `#tag/@agent/[C]` 数据 chip 段拼接，防截断） |
| **D6** 列宽基线快照（供 0.1.39 自适应 diff） | 随车列宽现状 | 宽档 200×50（缺省）/ 窄档 70×30（`ATLAS_E2E_COLS=70 ATLAS_E2E_ROWS=30`，第二 PTY） | 宽档列头全列在场（名称/创建/最近活跃/分支/消息）；窄档 = **0.1.38 硬砍创建/分支/消息列退单活跃列基线**（`NARROW = termCols < 80`；走查记录为基线，非 FAIL 判据） | `SessionTreeScreen.tsx:416-421`（showCreated/showBranch/showMsg = !NARROW） |

**明确不进 0.1.38 gate（0.1.39 面，不断言）**：summary 二级行（Main 裁定①拆 0.1.39）/ agentName 独立 chip（裁定②不渲染，只验 title 首位 fallback）/ PR/fileSize/worktree 徽标 / agentColor 精确 theme 映射 / 搜索·过滤·排序切换 / 底部操作行。

---

## fixture schema（镜像真实 session JSONL，实测自 e2e 沙箱样例）

- **文件名 = UUID（8-4-4-4-12）**：`getSessionFilesWithMtime` 经 `validateUuid` 过滤，**非 UUID 文件名 = 磁盘无效 session 静默排除**（探针初版用非 UUID sid → 预研首跑 0 命中定因，已修）。
- 条目结构（真实样例镜像）：
  - 首行 `{"type":"mode","mode":"default","sessionId":<uuid>}`（无 timestamp）
  - user 条目：`{parentUuid,isSidechain:false,promptId, type:"user", message:{role,content:<prompt>}, uuid, timestamp:<ISO>, permissionMode, cwd, sessionId, version, gitBranch}`
  - assistant 条目（消息流末条 = B-lite 最后消息时间戳源）：`{isSidechain:false, type:"assistant", message:{content:[{type:"text",text}]}, timestamp:<ISO>, ...}`
  - P0-C2 触发条目（仅 S fixture）：`{type:"task", isSidechain:true, agentId, sessionId, timestamp, task}`（非首行）
- **mtime 解耦**：`fs.utimesSync(path, t, t)` 精确造「mtime 旧/新」面（B-lite 排序键 = tail 末条带 timestamp 消息条目；`extractLastJsonStringField(tail,'timestamp')` 元数据条目无 timestamp 自然跳过）。
- **sort 场景活跃列双断言面（2026-10-07 订正）**：A 行用相对 token 提取器（marker 后首 `now|\d+[mhd]` 匹配——行内创建列 M/D/YYYY、分支、消息数裸数字均无 m/h/d 后缀不误配），B 行用绝对 `M/D HH:mm` 提取器；任一面提取 null = INCONCLUSIVE 定因核 list-capture（列布局/相对面未渲染），非产品 FAIL。

## 预研实证（2026-10-07，pre-fix = 当前 master 2cdc0bd 读侧真路径）

fixture 判别力已用**产品真代码路径**验证（`sl-sanity.ts` job tmp：`loadSameRepoMessageLogs` + 60/2 session 沙箱目录，`ATLAS_CONFIG_DIR` 直覆）：

| 实证 | 结果 | 结论 |
|---|---|---|
| 60-session 目录 `loadSameRepoMessageLogs` 返回数 | **= 50**（非 60） | ② 截断判别面坐实（`INITIAL_ENRICH_COUNT=50`；post-fix load-all 应 = 60） |
| sidechain 场景列表 | **仅 T（1 条）**，S（head 内 sidechain 内容）被滤 | ③ 误滤判别面坐实（整 head 扫 `"isSidechain":true`；post-fix 首行判定应 S+T 在场） |
| fixture 首跑 0 命中 | 非 UUID 文件名被 `validateUuid` 排除 | fixture 文件名约束（UUID）已固化进探针 |
| 读侧调用面定因 | `getStatOnlyLogsForWorktrees` 单路径支走 `getOriginalCwd()`（非传入路径） | PTY 拓扑天然满足（harness cwd = workspace）；探针无需额外处理（仅预研脚本需传双路径） |

**探针机制发现（登记，非产品缺陷）**：① 文件名 UUID 约束（上表第 3 行）；② 单路径 `getStatOnlyLogsForWorktrees` 走 `getOriginalCwd()`（PTY cwd=workspace 恒满足，预研直调需 2 路径）；③ sort 断言期望时间须以 **seed 时刻**为基准（PTY 启动 1-2min 内分钟漂移会使断言时刻重算错位）。

**2026-10-07 显示面 full-gate run1 探针缺陷定因（2 项，run2 探针修正后复跑；均非产品缺口）**：
- **D4 三探针误判**：「marker 前 300 字符窗最后 SGR 码」提取取到 **focus 行强度复位 `22`**（粗体 off 码）而非行色码（idle 行色码位于行首，与 marker 间隔行内文本）→ 3 探针全 FAIL/误判。修正 = **行局部区提取**（上一行 title 后 → 本行 title 前的窗口，只取前景色码 38;/16 色 30-38，排除复位/强度码）+ 对照行改「行首区无族码」（null = 无 fg 码 = 主题默认 → 交叉对照成立）。
- **D5-order 宽档序判据误判**：宽档 confirm 重 emit 为 **cell-diff 乱序**（raw 流内 chip 文本可能先于 confirm token 被 emit，与视觉左右序无关）→「token 先于 chip」按 raw 位置比较恒假风险。修正 = 宽档只断 token 现形 + 负控；**前置防截断面改窄档截断核**（窄档 maxFlags < 标志段全宽 → 尾部截断：状态机 token 幸存 + 尾部 chip 被截 = 前置防截断行为现形；源级序锚 = flags 拼接顺序）。

**2026-10-07 gate run1/run2 探针缺陷定因（3 项，run3 探针修正后复跑；均非产品缺口）**：
- **SL-SORT-order 误判 FAIL（run1）**：TUI 原地重绘使整列表为**单行 capture**（重绘无 `\n` 分隔）→ 两 marker 同行 → 行级 `indexOf(aLine) < indexOf(bLine)` 退化恒假。修正 = marker 串位置比较（列表自上而下重绘，A 在上 ⇔ A marker 先现）。capture 实证 A 行确在 B 行之上（消息时间排序正确）。run2 核销（SL-SORT 3/3 PASS）。
- **SL-COUNT-bottom 误判 FAIL（run1）**：探针误发 `\x1b[5~`（= **PageUp**，xterm PRI5；顶行 focus 处 no-op）当 PageDown → 底区=顶区恒同。产品侧键位链路实证完好（`parse-keypress.ts:357-358` `'[5~'→pageup / '[6~'→pagedown` + `input-event.ts:33` `pageDown = name==='pagedown'` + SessionTreeScreen `key.pageDown` 分支在场）。
- **SL-COUNT-bottom 误判 FAIL（run2，cell-diff 捕获面）**：正确 PageDown（`ESC[6~`）后滚动屏为 **cell 级 diff 重绘**（TUI 只重发变化 cell——相对时间列分钟 tick 等，标题 cell 不再 emit）→ `sinceText()` 底区捕获缺 cnt-59 标题文本。**产品面实证无误**：pty.log 全量 raw 实捕 cnt-59 行已渲染（`59 … 1h` 相对时间列现形）+ 数据层加载全 60（cnt-48..59 滚动区在场）= P0-A load-all 已生效；误判纯探针捕获面。修正 = count 场景 **200 行视口**（`ATLAS_E2E_ROWS=200`，harness pty-driver 读 env）→ visibleRows 194 ≥ 60 → 初始全量 emit 一屏全量现形（免滚动、免键位依赖、免 cell-diff 捕获面）；`cnt-59` 缺失才判产品 FAIL。

**2026-10-08 显示面 full-gate 定因登记（D4 = 产品着色缺口 / D5 探针修正）**：
- **D4（agentColor 着色）= 产品着色缺口（非探针/环境约束）**：源级 + 实证双向坐实——① 源级：`SessionTreeScreen` 的 `AGENT_ROW_COLOR`（:176，orange→'yellow'/purple→'magenta'）+ 屏内色字面（header `color="cyan"` / footer·error `color="red"`）均为**裸色名**；bundled ink `colorize()`（`src/tui/ink/colorize.ts:69-169`）只认 `ansi:`/`#`/`ansi256`/`rgb` 前缀，裸名 fall-through → `return str`（**无 SGR，与终端 color level 无关**）。对照 `theme.ts:207-236` 全走 `ansi:` 前缀（valid `Color`）→ 主题色正常渲染。② 实证：PTY 全量 raw 中 **dimColor 真色值 `38;2;153;153;153` 在场**（列头/底部 dimColor 行 = PTY truecolor 支持坐实），但 disp-orange/disp-purple/disp-plain 数据行 + 「🌲 Sessions」header **无任何前景色码**（仅 focus 行 `\x1b[1m` bold）。→ 0.1.38 基线「idle 行现 ANSI 色码」**未达成 = 产品着色缺口**（agentColor 保守着色 Main 裁定③ 未真正渲染可见色）。**处置（用户/主裁）**：a) 主小修 bare→`ansi:` 前缀（`AGENT_ROW_COLOR` 值 + 屏内色字面 ~5 行）重 gate D4 → 转 PASS；b) 用户/主显式裁 D4 出 0.1.38 gate（deferred 显式命名 → 收口契约「deferred」满足）→ 登记 0.1.39 theme 精确映射一并修。**e2e 不自裁，单信号上报待裁**。
- **D5-pre-truncation 探针修正（run2→run3 捕获面）**：run2 用 `sinceText()`（delta）核窄档 confirm 态 → delta 混入**初渲染未截断的全 chip**（`#e2etag @e2eagent [C]` 全在场）→ 假「截断面未达」INCONCLUSIVE。但全量 `pty-narrow.log` 实捕 confirm 态行 = `[f 确认 fork] #e2etag @e2ea…`（**token 幸存 + 尾部 chip 截断 = 前置防截断行为现形**，`…` = `truncateToVisibleWidth` 省略号）。修正 = **kill 后读全量 pty-narrow.log**（`lastIndexOf('[f 确认')` 前缀 + `…` 截断标记，cell-diff-safe，免 sinceText delta 假象）。

---

## 执行流程（Main 回 0.1.38 hash 后）

```
bun run user-e2e/tui-diff/sessionlist-038.ts --repo <worktree-0.1.38> --all
# 单场景：--sort | --count | --sidechain | --mtime | --display（缺省 = sort）
# 产物：user-e2e/tui-diff/artifacts/SL-<stamp>-<rand>/<scen>/{result.json, pty.log[, pty-narrow.log], list-capture.txt[, list-capture-narrow.txt]}
```

- 5 场景各起独立 PTY（独立 workspace/sandbox，列表态互不污染；`display` 场景双 PTY：宽 200×50 主屏〔D1-D5 + D6 宽档 + D4 raw 核〕+ 窄 70×30 基线屏〔D6 窄档〕；同 lane 串行防网关竞争——本探针 /sessionlist 打开 = 纯 FS 读路径不涉模型调用，无网关竞争面，串行仍守互斥纪律）。
- 判读：`GATE-PASS`（4 场景 hardFail=0 且 0 INCONCLUSIVE）→ 回 0.1.38 gate 报告「回归判别 P0」段；任一 hardFail → FAIL（产品缺口，fail-closed 不发布）；INCONCLUSIVE → 定因核 artifact 后重跑或登记。
- **发布后生产 lane**（release-governance 支柱②③）：发布 commit 上同判据回放（`--all`，worktree 指发布 commit）+ 生产 install 面（`atlas` 全局）同判据一跑 + 四件套交叉。

---

## 0.1.39 P1 交互/UI 波 · 走查 gate 预研（0.1.38 收口后实施）

走查基建 = `user-e2e/tui-diff/accept.ts` + PLAN.md §7 用户面走查层（行为探针 + 走查双层，补验收盲区）。锚点表（0.1.39 实施面定稿后回填 regex，先备场景骨架）：

**0.1.38 已断基线标注（用户裁定 B，显示面 D1-D6 已入 0.1.38 gate）**：下表带「0.1.38 基线已断」标记的行 = 基线已断言（0.1.38 gate `display` 场景绿），**0.1.39 只断增量（变更面）**：

| 走查项 | 场景步（/sessionlist 面） | 锚点（待 0.1.39 定稿回填） | 判据 |
|---|---|---|---|
| 搜索接线（agenticSessionSearch 复用） | 列表内输入搜索词 | 搜索输入框现形 + 过滤后行集合收敛（词命中行在场/未命中行离场） | 行为 + 渲染双层 |
| 过滤/排序切换 | 切排序（时间/名称）+ 过滤（branch/tag） | 切换后行序/行集变化（对照 0.1.38 排序基准） | 行为 |
| 列宽自适应（宽/窄两档） | PTY 200×50（宽）/ 70×30（窄，`ATLAS_E2E_COLS=70 ATLAS_E2E_ROWS=30`） | **0.1.38 基线已断**（D6：宽档全列/窄档砍创建·分支·消息列快照）→ **0.1.39 只断增量**：窄档不再「直接砍列」硬降级（自适应面现形，对照 0.1.38 基线快照 diff） | 两档各一截图锚 |
| fork 状态机移底部操作行 | 选中行 f 确认 | **0.1.38 基线已断**（D5：宽档 confirm token 现形 + 负控 + 窄档截断核〔token 幸存/尾部 chip 截〕+ 3s 窗）→ **0.1.39 只断增量**：底部单行操作区现形（状态机 4 态文案迁移，`[f 确认 fork]` 行内位离场） | 渲染 |
| 徽标/chip 渲染 | 带 PR/tag/agentSetting/mode/agentColor 徽标的 fixture session | **0.1.38 基线已断**（D2 `[C]` / D3 `#tag @agent` 行尾 token 形）→ **0.1.39 只断增量**：PR 徽标现形（不在 55b5aa5 随车集）。**Main 裁定②：agentName 不作独立 chip 断言**（getLogDisplayTitle 首位 fallback 已覆盖，重复显示无信息量，0.1.38/0.1.39 均不渲染独立 chip；走查只验 title 首位 fallback 面） | 渲染走查 |
| agentColor 精确映射（Main 裁定③） | agentColor 8 值域 fixture（purple/pink/orange/…） | **0.1.38 基线已断**（D4：orange→黄族 / purple→紫族 idle 行着色 raw ANSI + 对照行交叉）→ **0.1.39 只断增量**：theme 精确映射 + 圆点着色（焦点/选中态 cyan/magenta 状态优先于身份色不变） | 渲染 |
| summary 二级行（Main 裁定①拆入 0.1.39） | 带 summary 的 fixture session（0.1.38 不期望、gate 不检查） | summary dim 二级行现形（变高行模型）+ **虚拟窗口光标-窗口不变量回归**（变高行与 scrollOffset/focusedIdx 索引对齐——0.1.38 拆分根因面，走查必双侧核） | 渲染 + 不变量 |
| P0 判别不回归 | 0.1.38 全探针 `--all`（P0 4 + display）于 0.1.39 发布 commit 复跑 | SL-SORT/COUNT/SIDECACHE/MTIME + SL-DISP D1-D6 全绿（P1 不改正确性面；显示面基线回归） | 回归 |

### 0.1.39 colorize 裸名根修断言（用户裁 D4=(b) 归 0.1.39，既有全局缺陷根修面；0.1.39 实施面定稿后回填 regex）

根修对象 = bundled ink `colorize()`（`src/tui/ink/colorize.ts:69-169`）只解析 `ansi:`/`#`/`ansi256`/`rgb` 前缀、裸 ANSI 名 fall-through 无 SGR 的**既有全局缺陷**（TUI 492 处 `color=` 中 14 处裸名 cyan×5/red×4/yellow×3/magenta×1/green×1 全落空；0.1.37 已有 4 处，0.1.38 仅新增 agentColor 消费面触发）。0.1.39 根修后走查断言：

| 断言 | 场景步（/sessionlist 面 + TUI 全局面） | 锚点（0.1.39 定稿后回填） | 判据 |
|---|---|---|---|
| **① SessionTreeScreen 全色面在场** | 带 agentColor 的 fixture session 打开 /sessionlist（idle 行 / 焦点行 / 选中行 + 头部「🌲 Sessions」+ 底部操作行） | PTY raw 通道核 SGR：idle 身份色（`AGENT_ROW_COLOR` 现 ANSI 色码，非 null）/ 焦点行 cyan / 选中行 magentaBright / 头部 cyan / 底部操作行（状态迁移后）各现对应 SGR（fg 码族在场，对照 0.1.38 基线「全屏无前景色码」翻面） | 渲染（raw SGR） |
| **② agentColor 精确 theme 映射（8 值域）** | agentColor 8 值域 fixture（red/blue/green/yellow/purple/orange/pink/cyan） | 各值 → theme 精确映射色码现形（0.1.38 保守 chalk 映射 purple·pink→magenta / orange→yellow 的近似面被 theme 精确映射取代；焦点/选中态 cyan/magenta 状态优先于身份色不变） | 渲染 |
| **③ TUI 其他裸色名处抽查回归** | 14 处裸色名分布（cyan×5/red×4/yellow×3/magenta×1/green×1）抽查（SessionTreeScreen 头部·底部 + 其余 TUI 屏） | 根修后裸名经 colorize 现 SGR（抽查若干处有色 = 根修面回归，非仅 SessionTreeScreen 单点） | 渲染回归 |
| **④ P0 四探针 + 显示面 D1-D3/D5/D6 不回归** | 0.1.38 全探针 `--all`（P0 4 + display）于 0.1.39 发布 commit 复跑 | SL-SORT/COUNT/SIDECACHE/MTIME + SL-DISP D1(created 列)/D2([C])/D3(chip)/D5(状态机前置)/D6(列宽宽窄基线) 全绿（P1 根修不改正确性面；显示面基线回归，D4 除外=已由 ①② 承接根修断言） | 回归 |

**注**：①②③ = 0.1.39 colorize 根修正面断言（PTY raw SGR 通道核，对照 0.1.38「全屏无前景色码」基线翻面）；④ = 正确性/显示面基线不回归（0.1.38 已断 D1-D6 基线，0.1.39 只断增量 + 根修翻面）。

**预研 ETA 已收**：0.1.38 四探针 = 定稿（本文件 + `sessionlist-038.ts`，fixture 判别力 pre-fix 实证通过）；0.1.39 走查 gate = 场景骨架 + 锚点表已备（0.1.39 实施面定稿后 1 轮回填 regex 即跑，预计 0.5 人时）。
