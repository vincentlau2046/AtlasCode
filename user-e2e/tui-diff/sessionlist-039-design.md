# 0.1.39 sessionlist P1 交互/UI 波 · tui-diff 走查 gate 设计（e2e 交付，零产品改动）

- **对象**：master head `592a3b7`（0.1.39 码面 6 提交已合 master：`3a55424` S1 操作行 / `867c99b` S2 列宽 / `2d12fe2` S3 二级行 / `adcbc67` S4 8 色 / `57c3748` S5 搜索排序徽标 / `592a3b7` colorize D4 根修；off `d15c416` = 0.1.38 release）。gate 绿后 Main 执行 0.1.39 release 序列（bump+tag+push+npm）。
- **工单**：`docs/2026-10-06-sessionlist-implement.md`（P1 交互/UI 段 + 0.1.39 增补段：colorize 根修 + 徽标 + theme 精确映射）。
- **探针**：`user-e2e/tui-diff/sessionlist-039.ts`（PTY 走查；`--repo <repo> [--all|wide|col64|col56]`）+ **P0 回归** `sessionlist-038.ts --repo <repo> --sort --count --sidechain --mtime`（0.1.39 码面 P0 行为零改动，4 场景恒绿 = 「P0 5 探针保持绿」前半；后半 = 本探针 wide 场景 `SL-P0-D1-created`〔created 列 P0-B 显示面〕）。
- **判别锚点单一事实源（Main 2026-10-08 指认）**：`tests/func/sessionlist-p1-render.test.ts`（渲染面 S1/S3/S5-search）+ `tests/unit/sessionlist-p1.test.ts`（S1-S5 纯面）+ `tests/unit/colorize-d4.test.ts`（D4 根修 16 名 SGR）。本走查 = 活屏面（前后 lane 统一「测的=发布的」：单测 lane 纯面/渲染面，e2e lane 真 PTY 用户面）。
- **纪律**：e2e 只做测试侧；探针全在 `user-e2e/` 落工作区；零写真实 `~/.atlas`（sandbox home + workspace）；PTY 串行（网关 8999 竞争面）；INCONCLUSIVE 必带定因；fail-closed（hardFail>0 → GATE-OPEN 不发布）。

---

## 判据表（Main 断言面 → 探针场景/探针 ID）

| # | Main 断言面 | 场景 | 探针 ID（判据） |
|---|---|---|---|
| P0 | 0.1.38 P0 5 探针保持绿 | 038 文件 4 场景 + wide | `SL-SORT-*`/`SL-COUNT-*`/`SL-SIDECACHE-*`/`SL-MTIME-*`（038 文件）+ `SL-P0-D1-created`（created 列 = 首消息 ts `10/5/2026`，非 mtime 诱饵） |
| S1 | fork 状态机移底部操作行（行内无状态机段，操作行单行 = 提示/状态行） | wide | `SL-S1-CONFIRM-ROW`（f → 操作行「✋ … [再按 f 确认 fork · 3s 自动取消]」现形）/ `SL-S1-NEG-INLINE-TOKEN`（0.1.38 行内 token「[f 确认 fork]」全量负控不在场）/ `SL-S1-CANCEL-HINT`（3s 超时回落提示行 = 单行恒定） |
| S2 | 列宽自适应（宽全列 / 64 列砍消息列 / 56 列砍分支列） | wide+col64+col56 | `SL-S2-WIDE-cols`（200×50 全 5 列）/ `SL-S2-COL64-msg-hidden`（创建/分支在场 + 消息离场）/ `SL-S2-COL56-branch-hidden`（创建在场 + 分支/消息离场）〔纯面阈值镜像：budget=termCols−20；`<47` 砍消息 → 64 列砍消息；`<41` 砍分支 → 56 列砍分支〕 |
| S3 | x 键展开光标行 summary 二级行（└ 摘要行，再按 x 收起；展开行占 2 物理行不溢出视口） | wide | `SL-S3-X1-fallback`（x → 「└ p39-top」= firstPrompt 回落路径）/ `SL-S3-X2-summary`（光标移 p39-s3sum 再 x → 「└ p39-summary-A」= 压缩摘要优先路径 + 展开跟随光标）/ `SL-S3-PHYSICAL-POS`（└ 行物理位置介于光标行与下一行 = 2 物理行）/ `SL-S3-NO-OVERFLOW`（展开态全列表 + 操作行同帧在场；ROWS=50 视口 44 行 ≥ 14 行） |
| S4 | agentColor theme 精确 8 色（idle 代理行实心 ● 染身份色；选中 magentaBright / 焦点 cyan 优先） | wide | `SL-S4-GLYPHS`（idle 代理行 ● / 非代理 ○）/ `SL-S4-IDLE-8-PRESENT`（8 身份色 SGR 全在场 + PTY 色能力对照）/ `SL-S4-IDLE-8-DISTINCT`（8 值域两两相异 + 全 theme 色板通道 `38;`）/ `SL-S4-FOCUS-CYAN-PRIORITY`（焦点态 cyan `36` 覆盖身份色——用身份色 = cyan 的 p39-ag-cyan 行，覆盖面最强）/ `SL-S4-SEL-MAGENTA-PRIORITY`（enter#1 选中态 magentaBright `95` 且晚于焦点 cyan = 状态迁移序） |
| D4 | 根修随车：全色面 SGR 在场 + 8 值域 + 裸色处抽查（TUI 14 处裸名 fallthrough 转绿） | wide | 8 身份色在场/相异（上 S4 三探针 = 0.1.38 D4 FAIL「全屏无前景色码」基线翻面）+ `SL-D4-HEADER-CYAN`（header「🌲 Sessions」裸 cyan SGR 在场）+ `SL-D4-CONFIRM-YELLOW`（操作行 confirm 裸 yellow SGR 在场）+ 焦点/选中裸 cyan/magentaBright（S4 双探针同面）。**TUI 全局 14 处裸名回归 = 单测 lane 承载**（`tests/unit/colorize-d4.test.ts`：16 名 SGR 在场 + 裸名 ≡ ansi: 同形 + 4 通道零回归；四件套交叉） |
| S5 | / 搜索模式（本地同步过滤 + 零命中空态行 + 操作行搜索态行 + esc 退出）/ s 键排序键循环（列头 排序: 指示）/ 徽标 chip（PR #n / fileSize / [wt:]） | wide | `SL-S5-SEARCH-STATE`（/ → 操作行「搜索:"" · esc 退出」）/ `SL-S5-FILTER-SURVIVOR`（击 agred → 幸存者 p39-ag-red 行重放 = 本地同步过滤）/ `SL-S5-EMPTY-STATE`（零命中空态行 `No sessions match "zzz-no-match"`）/ `SL-S5-ESC-EXIT`（esc → 操作行回落提示行）/ `SL-S5-SORT-S1/S2/S3`（s×3 → 创建/消息数/名称 三键循环，视图重排顶行判别：s3sum→badges→ag-blue）/ `SL-S5-SORT-IND-INITIAL` + `SL-S5-SORT-IND-2`（列头「· 排序:…」指示面）/ `SL-S5-BADGES-chips`（`[PR #42]` + `(N.NKB)` + `[wt:wt-probe]` 行内 chip） |

**INCONCLUSIVE 定因登记（非产品缺口面）**：列表未渲染（`*-LIST-RENDER`，核 pty.log：REPL 未就绪/加载挂起）；二级行/搜索/排序键位面未达（核 pty.log cell-diff 重放面）；SGR 面 = 行无任何色码现形且 **PTY 色能力对照缺失**（raw 无 `38;2;`/`38;5;` = 终端色支持未坐实，双面对定因）；序位不可判（cell-diff 重放序乱序 → 行为面 = 顶行内容已变，登记非 FAIL）。**SGR 面 = 行无色码但色能力对照在场 = FAIL（产品着色缺口，0.1.38 D4 同判据）**。

---

## fixture 面（手造 JSONL，schema 镜像真实条目；尾条 last-wins 刮面）

### wide（13 session；modified 新→旧 = 默认显示序；created 刻意错排供 s 键判别）

| 序 | prompt | modified | created（首 user ts） | 尾条刮面条目 | 判别面 |
|---|---|---|---|---|---|
| 1 | p39-top | now−2m | now−2h | —（plain） | 初始焦点行（○ 空心 + 焦点 cyan）；S3 firstPrompt 回落（无 summary → `└ p39-top`） |
| 2 | p39-s3sum | now−3m | now−1h | `task-summary: p39-summary-A` | S3 摘要优先路径；s#1（创建降序）顶行（created 1h 最新 ≠ modified 序） |
| 3 | p39-s3b | now−4m | now−3h | — | 排序对照 filler |
| 4 | p39-badges | now−5m | now−4h（extraPairs×3 不抬 created） | tag `p39tag` / agent-setting `p39agent` / mode `coordinator` / **pr-link prNumber=42** / **worktree-state worktreeName=wt-probe** / 额外 3 消息对 | S5 徽标 chip 面 + 消息数降序顶行（s#2） |
| 5–12 | p39-ag-{red,blue,green,yellow,purple,orange,pink,cyan} | now−6m…now−13m | now−5h…now−12h | `agent: agentColor=<c>, agentSetting=ag<c>` | S4 8 身份色（idle SGR 全在场 + 相异 + 通道）；ag-cyan = 焦点/选中优先级判别行（身份色 = cyan → 焦点覆盖面最强） |
| 13 | p39-created3d | now−14m | **now−3d**（mtime = now 诱饵） | — | P0-D1 created 列 = `10/5/2026`（首消息 ts，非 stat 脏值） |

**数据层刮面源**（sessionStorage.ts）：agent 尾条 `type:'agent'`（:800-811）/ `tag`（saveTag 格式）/ `mode`（:812-817，coordinator last-wins）/ `task-summary`（saveTaskSummary :2660-2663，lite 刮面 `extractLastJsonStringField(tail,'summary')` :4828）/ **pr-link**（linkSessionToPR :2682，lite 刮面 prNumber :4841）/ **worktree-state**（:818-824，lite 刮面 worktreeName :4849）/ **fileSize = 盘上真值**（lite 路径 `fileInfo.size` :5056，非 fixture 尾条——size chip = 该 fixture 文件真实字节数 `N.NKB`）。

### col64 / col56（3 plain session `c-a/c-b/c-c`，列头断言面最小集）

---

## SGR 锚（darkTheme 默认——sandbox 无 global config theme 键 → `createDefaultGlobalConfig.theme='dark'`（config.ts:504）；chalk level 2/3 双兼容）

| 面 | 期望码（level 3 / level 2） | 探针 |
|---|---|---|
| 8 身份色（darkTheme rgb-600 色板） | red `38;2;220;38;38` / blue `38;2;37;99;235` / green `38;2;22;163;74` / yellow `38;2;202;138;4` / purple `38;2;147;51;234` / orange `38;2;234;88;12` / pink `38;2;219;39;119` / cyan `38;2;8;145;178`（level 2 = 同色 256 色 cube `38;5;N`） | `SL-S4-IDLE-8-*`（判据 = 非空 + 8 相异 + `^38;` 通道，不锁 level 具体值） |
| 焦点 cyan（裸名，D4 根修后） | `36`（bold `1;36`） | `SL-S4-FOCUS-CYAN-PRIORITY` |
| 选中 magentaBright（裸名） | `95`（bold `1;95`） | `SL-S4-SEL-MAGENTA-PRIORITY` |
| header cyan（裸名） | `36` | `SL-D4-HEADER-CYAN` |
| 操作行 confirm yellow（裸名） | `33` | `SL-D4-CONFIRM-YELLOW` |
| 色能力对照 | raw 任一 `38;2;`/`38;5;` 在场 | 各 SGR 探针定因面 |

**SGR 提取法**（0.1.38 D4 同法）：pty.log 全量 raw（kill 后读）；行局部区 = 上一行 marker 首现之后 → 本行 marker 首现之前，只取前景码（`38;`/`30-38`/`90-97`；复位 39/强度码排除）；状态迁移面（idle→焦点→选中）= 同一 marker 全部现形位置的色码序列（每次前溯 80 字符取最后前景码）。

---

## 执行流程

```bash
# P0 回归 + 显示面证据（0.1.38 探针 5 场景 --all〔sort/count/sidechain/mtime/display〕；~8min）
# 注意 1：038/039 harness 的场景参数 = 裸名（MODES.filter(m => argv.includes(m))），非 --sort 旗标
# 注意 2（run2 定因）：两命令必须 `;` 分隔独立跑，禁 `&&` 链——display 场景含 gap-B 证据探针
#   （SL-DISP-D2/D3 徽标截断），gap 未修前 038 必 exit 1，`&&` 会挡掉 039 走查（run2 实证踩坑）。
#   判读面分离：038 判据 = P0 4 场景（sort/count/sidechain/mtime）恒绿 + display 按探针定因分流；
#   039 判据 = 走查判据表（wide+col64+col56）。
bun run user-e2e/tui-diff/sessionlist-038.ts --repo /home/vince/projects/AtlasCode --all
bun run user-e2e/tui-diff/sessionlist-039.ts --repo /home/vince/projects/AtlasCode --all   # 独立跑，不卡 038 退出码
# 产物：artifacts/SL-<stamp>-<rand>/<sort|count|sidechain|mtime|display>/{result.json,pty.log}
#       artifacts/S39-<stamp>-<rand>/{wide,col64,col56}/{result.json,pty.log,list-capture.txt}
```

- 判读：全 `GATE-PASS`（两文件 totalFail=0 且 totalInc=0）→ 单信号回 Main（hash `592a3b7` + 结论）→ Main 执行 release；任一 hardFail → GATE-OPEN（产品缺口，fail-closed 不发布，回具体探针/锚点给 Main 修后重开 gate）；INCONCLUSIVE → 定因核 artifact 后重跑或登记。
- 四件套 + 增量单测（`sessionlist-p1.test.ts`/`sessionlist-p1-render.test.ts`/`colorize-d4.test.ts`）= Main 已报（3786/0·270 全绿）；e2e gate 侧交叉 = 本走查活屏面 + 单测 lane 既有覆盖（分工见判别锚点段）。

## 已知风险面（走查预期，非预设结论）

- **S2 全宽 nameW × S5 显示面交互**（纯面预算推演，走查实证裁定）：`computeColumnLayout` nameW = budget−optionalSlots 吃掉剩余全宽（200 列 nameW=149）→ 数据行行前段恒满 `termCols−4` → `maxFlags = termCols−2−fixedW = 0`（所有档宽）→ **徽标 chip 段（`[PR #n]`/`(size)`/`[wt:]`/`#tag`/`[C]`）恒截断**；同因列头「· 排序:」/「· 过滤:」指示追加在满宽行尾 → 恒被 `truncateToVisibleWidth(termCols−4)` 截去。若走查坐实（`SL-S5-BADGES-chips` / `SL-S5-SORT-IND-*` FAIL）= S2 预算模型未给 S5 显示面留槽的**产品缺口**（Main 修复面：预算内预留 FLAGS_SLOT/指示槽，或指示面移操作行），非探针缺陷；**行为面（过滤/排序/搜索态行/空态行）与显示面（chip/指示）分判据**——行为绿 + 显示红 = 部分达成，处置归 Main 裁。
- **cell-diff SGR 复用**：焦点/选中态重放若 ink 复用既有 SGR（不重发码）→ SGR 序列缺码 → INCONCLUSIVE 定因（映射面单测 `agentRowColors`/`colorize-d4` 承载，非 FAIL）。

## run1 定因记录（2026-10-08，gate run 1 = `S39-20261008-025024-0d2`；run2 探针修订依据）

**A/B 实证（测试侧独立探针 `ab-d4-bare.ts` + driver 变体 `lib/pty-driver-d4.py` + 活进程内 shim `d4-preload.ts`，同 driver 同 env 同拓扑三跑）**：

1. **活屏裸 16 色 SGR 全缺席（系统性，非 run1 偶发）**：wide 全 raw 无任何 16 色族 SGR（30-38/90-97 计数全 0）；`<Text color="cyan" bold>` 标题 raw 仅 `\x1b[1m🌲 Sessions`（bold-only，无 36）；搜索态行/confirm 行/选中行同（无 33/95）。theme 值 `38;2;`（darkTheme rgb + dim 153;153;153）在场。
2. **活进程内 colorize 实例工作正常（shim，与 app 同一模块实例）**：`chalk.level=3`（FORCE_COLOR=3 + COLORTERM=truecolor + TTY）；`colorize('X','cyan')` → `\x1b[36m`；`applyTextStyles('X',{color:'cyan',bold:true})` → `\x1b[36m\x1b[1m…`；`colorize('X','yellow')` → `\x1b[33m`。**D4 根修码在活进程内有效。**
3. **`ansi:` 通道活屏工作（dark-ansi 主题对照跑）**：`.atlas/.config.json` 注入 `theme:'dark-ansi'` 后活屏 16 色 SGR 在场（`37`/`93`/`94`/`97`，dark-ansi 主题 `ansi:` 值经 colorize ansi: 通道兑现）；同跑裸名 `color="cyan"` 标题仍 bold-only 无 36。

**定因结论（单缺口 × 4 探针实例）**：活 cell-diff 渲染代际兑现 `ansi:` 前缀色（经 colorize ansi: 通道），**但裸 ANSI 色名不经 D4 入口归一**——D4 根修（colorize.ts 入口 bare→ansi:）对「直接 colorize() 调用」与「legacy applyTextStyles 面」有效（单测 lane 绿 + 活进程内实证），**未覆盖活 cell-diff 代的 Text color prop 路径**（该代样式物化只接受 4 种文档化格式 `rgb()/ansi:name/#hex/ansi256()`，裸名在 colorize 上游被丢/未归一）。**归 Main 修复面**（让活代 Text color prop 走 D4 归一，或该代物化器接 bare→ansi:）；修后 4 探针（SL-D4-HEADER-CYAN / SL-D4-CONFIRM-YELLOW / SL-S4-FOCUS-CYAN-PRIORITY / SL-S4-SEL-MAGENTA-PRIORITY）转绿 = gate 重开判据。锚：`SessionTreeScreen.tsx:913`（标题）/`src/tui/ink/colorize.ts:104-107`（D4 入口）/`src/tui/ink/render-node-to-output.ts:257`（legacy 面）vs 活 cell-diff 代（`output.ts`/`screen.ts`/`log-update.ts` + `@alcalzone/ansi-tokenize`）。

**038 `display` 场景 6 hard FAIL 定因（run2 `SL-20261008-032255-vmw`；0.1.39 码面 = S2/S4/S1 故意改基线 + gap-B 证据 + 探针缺陷三类）**：

| 探针 | run2 面 | 定因 |
|---|---|---|
| SL-DISP-D2-coordinator-badge（`[C]` 缺） | FAIL | **gap-B 证据**（S2×S5 预算：200 列 maxFlags=termCols−2−fixedW≈0 → chip 段恒截；与 039 SL-S5-BADGES-chips 同根） |
| SL-DISP-D3-chips（`#e2etag`/`@e2eagent` 缺） | FAIL | **gap-B 证据**（同上，行尾 token chip 面） |
| SL-DISP-D4-orange-yellow（SGR=`38;2;234;88;12` 非黄族） | FAIL | **探针基线陈旧**（0.1.38 chalk 保守近似 yellow 族期望；0.1.39 S4 故意改 theme 精确值 rgb(234,88,12)——观测值 = S4 正确值。探针断言面已更新为「38; 通道码 + 非旧近似族」） |
| SL-DISP-D4-purple-magenta（SGR=null） | FAIL | **探针缺陷（双）**：① `rowStartFgSgr` prevMarker 行序颠倒（旧注释误置 created2025 于 purple 前；实证序 top>created3d>orange>purple>plain>created2025，created2025=最旧末行）→ 窗口空 → SGR=null 假象（**实证 `38;2;147;51;234` 在场** = S4 精确 purple 值，list-capture/pty.log 交叉）；② 期望 magenta 族陈旧（同 D4-orange）。探针已修（prevMarker→disp-orange + 断言面更新） |
| SL-DISP-D5-confirm-token（`[f 确认 fork]` 未现形） | INCONCLUSIVE | **探针基线陈旧**（0.1.39 S1 故意把 fork 状态机移底部操作行，行内 token 移除〔039 SL-S1-NEG-INLINE-TOKEN 负控〕；0.1.39 面 = 操作行「再按 f 确认 fork」。探针断言面已更新为操作行 confirm 文本 + 行内 token 负控） |
| SL-DISP-D5-pre-truncation（窄档 confirm 态未现形） | INCONCLUSIVE | **探针基线陈旧**（同上 S1 面；0.1.38「状态机先于数据 chip 拼接」前置防截断面被 S1 操作行拆分取代。探针已更新为窄档操作行 confirm 文本现形面） |
| SL-DISP-D6-wide-header（列头缺创建/分支/消息） | FAIL | **gap-B 证据 + 探针面订正**（200 列数据面 5 列值全在场 = S2 数据面零回归；FAIL 根因 = 列头末标签「消息」截为「消…」〔S5 指示追加满宽行尾〕= gap-B 同根。探针已拆：数据面断言 PASS 判据 + 标签截断记 gap-B 证据不入 FAIL 判据） |
| SL-DISP-D6-narrow-baseline（窄档 70 列与 0.1.38 双列基线不符） | FAIL | **探针基线陈旧（S2 故意改）**（0.1.39 S2 自适应：70 列 budget=50≥47 → 5 列数据面全可见，0.1.38 硬降级双列基线被故意替换。探针已更新为 S2 自适应面） |
| SL-DISP-D4-control-plain | PASS | 屏级观察 = **gap-A 证据**（裸色名活屏不现 SGR；判据由 039 SL-D4-* 承载） |

**gap-A（D4 根修活路径缺口，Main 修复面）**：0.1.39 断言面「D4 根修随车（全色面 SGR + 裸色抽查）」在活屏未达成——活 cell-diff 代 Text color prop 物化只兑现 `rgb()/ansi:/#/ansi256()` 4 通道，裸 ANSI 名（标题 cyan / 操作行 yellow / 焦点 cyan / 选中 magentaBright）不产 SGR；D4 根修只归一了 `colorize()` 入口（legacy `applyTextStyles` 面），未覆盖活代物化站。判据探针 = 039 `SL-D4-HEADER-CYAN`/`SL-D4-CONFIRM-YELLOW`/`SL-S4-FOCUS-CYAN-PRIORITY`/`SL-S4-SEL-MAGENTA-PRIORITY`（预期红 = 缺口实证）。修复提示：活代 `TextStyles.color→AnsiCode` 物化站接 bare→ansi: 归一（或活代 Text color prop 走 D4 归一入口），非 colorize() 入口再加一层。

**gap-B（S2×S5 预算缺口，Main 修复面）**：`computeColumnLayout` nameW=budget−optionalSlots 吃全宽 → `maxFlags=termCols−2−fixedW≈0` 全档宽（`SessionTreeScreen.tsx:972`）→ ①徽标 chip 段（`[C]`/`#tag`/`@agent`/`[PR #n]`/`(N.NKB)`/`[wt:]`）恒截；②列头「· 排序:」/「· 过滤:」指示 + 末标签「消息」恒截（200 列 header 210 display chars > termCols−4=196）；③窄档 70 列操作行提示尾亦截（`x 摘…`）。判据探针 = 039 `SL-S5-BADGES-chips`/`SL-S5-SORT-IND-INITIAL`/`SL-S5-SORT-IND-2` + 038 display `SL-DISP-D2/D3/D6-*`（证据面）。修复裁面（Main）：预算内预留 FLAGS_SLOT/指示槽，或指示面移操作行。

**run2c 定因记录（gate run 2c = `S39-20261008-033406-w52`；7 hard FAIL 全落预测缺口 + 7 INCONCLUSIVE 全定因 → run2d 探针修订）**：

- **7 hard FAIL = gap-A/gap-B 预测面全命中**（无新红项）：gap-A 4（SL-D4-HEADER-CYAN / SL-D4-CONFIRM-YELLOW / SL-S4-FOCUS-CYAN-PRIORITY〔序列恒 38;2;8;145;178 无裸 36〕/ SL-S4-SEL-MAGENTA-PRIORITY〔无裸 95〕）+ gap-B 3（SL-S5-SORT-IND-INITIAL / SL-S5-SORT-IND-2 / SL-S5-BADGES-chips 全 false）。
- **7 INCONCLUSIVE 定因（探针缺陷为主，1 项待 run2d 复判）**：
  1. **S5-FILTER-SURVIVOR / EMPTY-STATE = 探针 burst 输入缺陷**：`sendRaw('agred')` 5 字节同落一个 stdin data 事件 → 产品 `useInput` 单字符事件守卫（`input.length===1`，`SessionTreeScreen.tsx:667-675`）整段丢弃（run2c 全 raw 零 'agred'/'zzz-no-match' 片段实证，query 恒 ''）。真实用户击键 = 单字符事件。**修 = 逐字符 120ms 间隔输入（typeChars）**。
  2. **S5-SORT-S1/S2/S3 = 探针「offset 后首个重放行名」面不可靠**：cell-diff 稀疏重放（只重放变化 cell；p39-top 末次现形 @15620 早于排序键相，重排后行名不再现形；而 f 操作行实证 s#3 已生效〔confirm 行焦点 = p39-ag-blue = 名称序顶行〕→ 排序行为面实际达成，判据面选错）。**修 = 「f confirm 行顶行标题判别」**（操作行单行内容变 = 整行重放，免碎片）：s#1 期望 'p39-summary-A'（0.1.39 标题链 `agentName→customTitle→summary→firstPrompt`〔SessionTreeScreen.tsx:523〕summary 优先，s3sum session 带 task-summary → 标题 = summary 值，活屏实证）/ s#2 'p39-badges' / s#3 'p39-ag-blue'。
  3. **fixture 根因修（writeFixture extraPairs）**：旧码 pairs 写在主 prompt 之前且 ts 更新（userTs+k·1h）→ 文件序首条 user 消息 = 'p39-badges pair-1' → firstPrompt/标题漂移（活屏实证标题 = 'p39-badges pair-1'，s#2 判别词面失真 + 与文档意图「pairs 更旧、created 不变」相悖）。**修 = pairs 置主消息之后 + ts 更旧（userTs−k·1h）**。
  4. **S3-X1-fallback（'└ p39-top' 独缺）= 待 run2d 复判**：展开机制在场（X2 '└ p39-summary-A' 在场），p39-top（无 summary → firstPrompt 回落路径）独缺。probe 已加 X1/X2 键相 offset + kill 后 X1 键相区 └ 行诊断（有其他行 └ 行 = 回落路径缺口升级 Main；无任何 └ 行 = x#1 键位面重跑核）。连带 PHYSICAL-POS（iNext 判词 'p39-s3sum' 订正为 'p39-summary-A'）。
- **run2 探针修订记录（039 文件，run2d 起）**：topLine TDZ（run2b FATAL 实证已修）；S3 x 键 1s 就绪窗 + X_SETTLE 1.2s + cumulative 断言 + 键相 offset/└ 诊断；S5 搜索逐字符输入（typeChars）；S5 排序面 = f confirm 行顶行标题判别（sTopTitles）；fixture extraPairs 订正；038 display 探针面更新（上表 6 项）。
- **0.1.39 码面新认知（探针假设基线）**：标题链 summary 优先（`SessionTreeScreen.tsx:523`）→ 带 task-summary 的 session 行标题 = summary 值（非 firstPrompt）；useInput 单字符事件面（burst 输入被产品丢弃 = 探针侧须模拟单字符击键）。
- `SL-S5-SORT-IND-INITIAL/2` + `SL-S5-BADGES-chips` FAIL = **产品缺口坐实**（已知风险面：`maxFlags = termCols−2−fixedW = 0` 所有档宽〔SessionTreeScreen.tsx:972，nameW 吃掉全宽 budget〕→ 徽标 chip + 列头 排序/过滤指示恒截断；live 实证：`[PR #42]`/`wt-probe`/`· 排序:` 全 raw 缺席）。**归 Main 修复面**（预算内预留 FLAGS_SLOT / 指示面移操作行）；行为面（过滤/排序/搜索态/空态）与显示面（chip/指示）分判据。
- 7 INCONCLUSIVE = **探针捕获面缺陷（cell-diff 逐 cell 重放交错，delta 片段不可靠）+ x1 键位落点时序**：run2 探针改「raw 全量 + 键相 offset」（pty.logSize 记键相，kill 后 offset 后找行为产物）+ x 键前 1s 就绪窗 + X_SETTLE 1.2s。若 run2 仍缺（如 `└ p39-top` 独缺而 `└ p39-summary-A` 在场 = 展开机制在场）→ 升级行为面缺口报 Main。
- 038 P0 under-run = **harness 调用 bug**（`--sort` 旗标形态不命中 `argv.includes('count')` 裸名过滤 → 仅 sort 跑）→ run2 改 `--all`。

## run2d 定因记录（gate run 2d = `S39-20261008-034743-8va`；7 hard FAIL 全落预测缺口 + 3 INCONCLUSIVE 全定因 + 探针侧 4 项订正落地）

**终态 = GATE-OPEN（hardFail=7，fail-closed 不发布）**：col64/col56 场景 PASS（S2 自适应 64 列砍消息 / 56 列砍分支 ✓）；wide = 14 PASS + 7 hard FAIL + 3 INCONCLUSIVE。

**7 hard FAIL = gap-A×4 + gap-B×3（全部预测面命中，无新红项）**：

- **gap-A（D4 根修活路径缺口，4 探针：SL-D4-HEADER-CYAN / SL-D4-CONFIRM-YELLOW / SL-S4-FOCUS-CYAN-PRIORITY / SL-S4-SEL-MAGENTA-PRIORITY）**：
  - **屏级铁证（run2d 全 raw 统计）**：16 色族 SGR（30-37/90-97，含 `1;` 前缀变体）**全 raw 计数 = 0**（36/95/33/32 逐一核）；theme truecolor `38;2;` = **217 次在场**（PTY 色能力坐实，控制面双面对齐）。→ 活屏只兑现 theme 通道（rgb()/ansi:），**所有裸 ANSI 名使用点（标题 `<Text color="cyan">` / 操作行 `yellow|green` / 焦点 `'cyan'` / 选中 `'magentaBright'`，agentRowColors SessionTreeScreen.tsx:266-274）SGR 全灭**。
  - **修复站定位（run2d 追迹完成，推翻 run1「活代物化器」假设）**：活屏 `Text` = **`ThemedText`（design-system 主题层）**，`src/tui/components/design-system/ThemedText.tsx` `resolveColor(color, theme)`：裸名不匹配 `rgb(/#/ansi256(/ansi:` 四前缀 → 落「theme key」分支 → `theme['cyan']` = **undefined → 静默丢弃**（color 从未到达 D4 已修的 colorize 入口）。theme 色板值（rgb()/ansi: 字符串）走 raw 分支透传 ✓ = 与 217 次 `38;2;` + dark-ansi 对照跑 37/93/94/97 全一致。**修复面（Main）= `ThemedText.resolveColor` 加 16 裸名透传**（import D4 `BARE_ANSI_COLOR_NAMES`（colorize.ts:78-95）或同构集合；透传后下游 D4 入口（colorize.ts:104-107）已接住 = 单点修）。run1 A/B shim 绿而活屏红 = shim 直调 colorize() 绕过 ThemedText（A/B 证据链对修复站有误导，run2d 追迹订正）。
- **gap-B（S2×S5 预算缺口，3 探针：SL-S5-SORT-IND-INITIAL / SL-S5-SORT-IND-2 / SL-S5-BADGES-chips）**：全 false 复现（run2c/2d 双跑同面）。根因 = `computeColumnLayout` nameW 吃全 budget → `maxFlags = termCols−2−fixedW ≈ 0`（SessionTreeScreen.tsx 行渲染段 flags 截断行，L975 附近）→ 徽标 chip + 列头「· 排序:」/「· 过滤:」指示 + 末标签「消息」全档宽恒截。修复裁面（Main）：预算内预留 FLAGS_SLOT/指示槽 或 指示面移操作行。行为面（过滤/排序/空态/搜索态）全绿 = 分判据，不混判。

**3 INCONCLUSIVE 定因（全探针侧，非产品缺口）**：

1. **SL-S3-X1-fallback（+ SL-S3-PHYSICAL-POS 连带）= 三层探针侧定因**：
   - **层 ① fixture 尾条 ts（主因）**：`summaryEntry`/`prLinkEntry` 尾条 `timestamp: new Date()`（=now）；产品 `modified = new Date(transcript.at(-1).timestamp)`（sessionStorage.ts:2489，transcript 首末 = 带 ts 条目）→ s3sum/badges 两行 modified=now 恒排列表顶 2 行（非 p39-top）→ 初始焦点 = s3sum → x1 展开的是 s3sum（`└ p39-summary-A`，raw @10453 实证）→ 判词「└ p39-top」恒缺席。**S3 机制本身全达成**：run2d 同 raw 内 `└ p39-summary-A`（摘要优先路径 ✓）+ `└ p39-badges`（firstPrompt 回落路径 ✓，@17371 实证 `>○ p39-badges` 下 └ 行）双路径现形。
   - **层 ② 展开模型**：产品 S3 = boolean toggle + 展开跟随光标（`expandedIdx = expanded ? focusedIdx : null`，SessionTreeScreen.tsx:488-491，码注「行级属性语义，不做 per-session 记忆」= 有意设计）→ Down 即重锚展开到新焦点行，x2 = 收起。旧探针假设「x 再展开新行」= 模型错（run2c/2d 的 X2 PASS 系 cumulative 串味：`└ p39-summary-A` 是 x1 相产物）。
   - **层 ③ sandbox 累积**：`makeSandboxHome(home, REAL_SETTINGS, false)`（fullHome=false，不 wipe）+ fixture `randomUUID()` sid → 每 run 13 新 fixture 累积同一项目会话目录（run2d = 4 run × 13 = 52 文件，list-capture 视口 43 行实证）→ 13 行布局的行号/行序/Down 计数假设全破（S4 FOCUS/SEL 探针 Down 计数亦被污染 = 其 FAIL 面归 gap-A 屏级铁证承载，非探针判词面）。
   - **订正（已落探针）**：① `rmSync(projectDir)` 每 run 清项目会话目录；② 尾条 ts 回拨 `iso(lastMs)`（显示序 = fixture 写序，top 顶行）；③ X2 判词改 Down 后「└ p39-summary-A」现形（展开跟随光标）+ x2 收起相无新 └ 行（toggle 收起实证）。
2. **SL-S5-EMPTY-STATE = 探针输入流 vs 判词窗定因**：产品搜索输入守卫 `input.length===1`（SessionTreeScreen.tsx:667-675）丢多字符 data 事件；typeChars 80ms/字符时读侧合并（事件循环忙于过滤重渲染）→ 11 字符只入 query 'z' → 空态行 = `No sessions match "z"`（机制在场实证）≠ 判词全串。**订正（已落探针）**：300ms/字符 + 流后 settle。产品侧登记项（非 gate 阻塞，归 Main 0.1.39+ 裁定）：搜索模式多字符/粘贴输入被守卫丢弃 = 快速击键面缺口。
3. **SL-S3-PHYSICAL-POS = X1 连带**（X1 订正后自解）。

**0.1.39 码面新认知（run2d 补录）**：
- `log.modified` = 文件内**末条带 ts 条目** ts（含 task-summary/pr-link 尾条；mode/tag/agent/worktree 无 ts 尾条不参与）= 产品真实 append 语义（真实 task-summary 追加亦发生在「now」= fixture 忠实镜像，非产品缺陷；探针侧订正）。
- 活屏 `Text` = ThemedText 主题层（非裸 Ink Text）= D4 类根因的标准修复站（theme key 查表未命中 = 静默 undefined）。
- S3 单展开位 + 跟随光标模型（码注有意）：gate 判词按此模型；若 Main 意图 = per-row 多展开记忆，为 0.1.39+ 交互设计裁项（非 gate 阻塞）。

**gate 重开判据（Main 修 gap-A + gap-B 后）**：探针已订正完毕（transpile-clean）→ 重跑 `sessionlist-039.ts --all` + `sessionlist-038.ts --all`（P0 4 场景 + 显示面分流）→ 预期 wide 全绿（gap-A 4 探针转绿 = 屏级 16 色 SGR 现形；gap-B 3 探针转绿 = chip/指示面现形；S3/EMPTY-STATE 按订正判词绿）+ 038 display 分流面全核销 → GATE-PASS 单信号 → 0.1.39 release。

**038 探针修订后重跑记录（`SL-20261008-041144-fuz`，0.1.39 码面 592a3b7，038 探针含本 session 更新面 + 项目目录清污订正）**：P0 4 场景恒绿（sort 3/3 / count 2/2 / sidechain 2/2 / mtime 1/1）；display 分流面全按定因落位 = D1 PASS + D4×3 PASS（S4 精确映射 38;2; 通道）+ D5×2 PASS（操作行面）+ D6×2 PASS（数据面 + S2 面，「消息」标签截断记 gap-B 证据非 FAIL 判据）+ **D2/D3 FAIL = gap-B 徽标/chip 证据面（唯一 2 hard FAIL，判读面 = 归 Main gap-B 修复面，非探针缺陷）** → 038 判读面（P0 4 场景绿 + display 分流）闭环。

## rerun-b7ef49f 定因记录（gate 重开三连跑；gap-A/gap-B 根修 @ b7ef49f 后的探针侧收敛）

**r1（`S39-20261008-044058-v8b` @ b7ef49f）= GATE-OPEN hardFail=4**：
- **gap-A 核心绿**：D4-HEADER-CYAN（SGR 36）/ D4-CONFIRM-YELLOW（SGR 33）/ S4-IDLE-8-PRESENT+DISTINCT（8 真色码 8/8 全 theme 通道）= ThemedText 裸名透传根修复实证；S3 X1/X2 双路径绿（run2d 探针修订生效：尾条 ts 回拨 + 展开跟随光标模型 + sandbox 清污）；S5 行为面全绿（搜索态/esc/fork 状态机三探针/过滤幸存者/排序 3 键重排/徽标 chip）+ S2 col64/col56 窄档绿。
- **残余 4 红 + 1 soft 全定因 = 探针侧（0 产品缺口）**：
  1. **S3-PHYSICAL-POS（FAIL）**：s3PosOk 的 iNext 锚（完整字面 'p39-summary-A'）在 X1 相累积文本缺席 = cell-diff reflow 只重放变化 cell（s3sum 行未变前导 cell 不重发，raw 实证 X1 相后续行只现形 `ummary-A` 片段；完整字面首现 = Down 相全量重渲，不在 cumAfterX1 内）→ iNext=-1 恒 FAIL。**产品物理位置实正确**（raw：`└ p39-top` @5533 紧接光标行 + 后续行 reflow 片段于其下）。
  2. **S5-SORT-IND-2（FAIL）**：「· 排序:」前缀（初始全量列头渲染）× 排序标签 cell（s 键重放：创建/消息数/名称 raw 实证）分属不同重放段 → 完整字面「· 排序:创建」不连续。**指示面实功能**（gap-B chip 槽修复后列头预算容纳 = IND-INITIAL + BADGES-chips 绿）。
  3. **S4-FOCUS-CYAN / 4. S4-SEL-MAGENTA（FAIL）**：探针 S4 键相（Down+enter）假设「自顶行 Down 一次落 ag-cyan」，**产品焦点会话保持面**：s#3（名称序）后焦点 = p39-top 会话（名称序末行），Down 落邻行 p39-summary-A，enter 选中之（raw 实证 `> ○ p39-summary-A` 焦点帧 + `\x1b[95m\x1b[1m» ● p39-summary-A` 选中帧）→ ag-cyan 行恒 idle（identity 色 38;2;8;145;178 ×5 = 产品正确行为，8 色身份面由 IDLE-8 族承载）。**焦点/选中色面在实焦点/选中行已物化**：36（焦点行 37 处）/ 95（选中行 1 处）= D4 根修裸名物化实证。
  5. **S5-EMPTY-STATE（INCONCLUSIVE）**：零命中空态面实功能（raw：`No sessions match "z"` 完整行实捕 + zzz 相搜索行逐字符 cell 片段链〔z×3→- n o - m a t c h〕证 query 达全量 'zzz-no-match'）；全量 query 完整字面不连续 = 前缀未变不重发 + 引内字符 cell 片段化。
- **探针 5 判据修复（sessionlist-039.ts，transpile clean）**：S3 iNext 锚 reflow 片段容错（后续行标记集：完整字面/片段任一）/ IND-2 前缀 + 门控标签 cell / S4 FOCUS-SEL 判据移实标记行（`\x1b[36m\x1b[1m> ` 焦点帧 / `\x1b[95m\x1b[1m»` 选中帧）/ EMPTY-STATE 碎片容错（oEmpty 后「No sessions match」前缀判据）。**ag-cyan 行「焦点/选中覆盖身份」优先级走查面 = 后续登记项**（导航键相落 ag-cyan；Main 已登记 0.1.39+ 观察项，S4 单测族承载，gate 不阻塞）。

**r2（`S39-20261008-045921-81c`）= GATE-OPEN hardFail=2（4→2 收敛，残余 2 红全定因 = 探针侧判据面单位/锚缺陷）**：
- **IND-2 再 FAIL 定因**：r2 修订版 offset 门控 `raw.slice(oS1)` 中 **oS1 = `logSize()` = `statSync(pty.log).size`（字节）× raw = `readFileSync(...,'utf8')`（JS 字符串字符下标）单位失配**——CJK 重日志字节偏移 > 字符下标（r2 raw：'创建' 字符下标 @1769/18849，字节 oS1 越位）→ slice 错过排序标签 cell。r2 raw 实证两子条件在字符语义下均真（'· 排序:' 完整字面在场 @1786 + '创建' s#1 标签 cell 在场）= 判据面单位缺陷非产品面。
- **D4-HEADER-CYAN 新 FAIL 定因（r1 绿 → r2 红 = 启动时序变体假红）**：r2 raw 无 `/sessionlist` 命令回显（列表屏先于 REPL 提示行渲染，回显未现形 = PTY 启动时序变体）→ `rowStartFgSgr` 的 prevMarker 前溯语义返回 null；**header 行 36 SGR 实捕在场**（`\x1b[36m\x1b[1m🌲 Sessions` raw 实证，D4 根修面完好）= 探针锚依赖缺陷非产品缺口。
- **探针 2 修**：IND-2 改内容锚（字符安全）= 初始指示「排序:最近活跃」锚后「创建」标签 cell（列头列标签在锚前排除；3 次 s 无回绕锚恒唯一）；`rowStartFgSgr` prevMarker 缺席回退 marker 前 160 字符局部窗（在场时行为不变）。

**r3（`S39-20261008-050851-zm6`）= GATE-PASS**：wide 26 探针 0 FAIL 0 INCONCLUSIVE（5 订正判据全绿：S3-PHYSICAL-POS〔reflow 片段容错锚〕/ S5-SORT-IND-2〔内容锚碎片容错〕/ S4-FOCUS-SEL〔实标记行 36/95 帧〕/ S5-EMPTY-STATE〔前缀容错〕/ D4-HEADER-CYAN〔rowStartFgSgr prevMarker 缺席回退 160 字符局部窗——r2 假红核销〕）+ S2 col64/col56 恒绿。

**038 契约重跑（`SL-20261008-051523-yjz` @ b7ef49f，显式 `--repo /home/vince/projects/AtlasCode`〔main checkout〕）** = **GATE-PASS**：P0 4 场景 8/8（sort 3/3 / count 2/2 / sidechain 2/2 / mtime 1/1）+ display 10/10（D4 S4 精确映射 orange/purple 真色码 + D5 操作行 confirm 宽窄双档 + D6 S2 窄档自适应面 = 0.1.39+ face 判据全对齐；0.1.38 lane face 重跑时的 5 项面漂移在本 face 全部按设计落绿）= 契约「038 display 分流 D2 [C] chip / D6 末标签核销」达成（本 face 无截断 = gap-B chip 槽修复后 70 列 budget 50 ≥ 47 五列全容）。
- **探针卫生订正（verdict 后，不涉判据）**：038 探针 `--repo` 默认原 = prodlane-038 lane worktree（0.1.38 face）→ 0.1.39+ face 重跑忘传 --repo 会误测 0.1.38 face（display 判据 face 漂移假红）；订正 = 默认 `process.cwd()`（probe 惯例自 repo root 执行）；lane 重跑仍显式 --repo。
- **GATE-PASS 单信号已发 Main**（0.1.39 常设发布序列 = Main 侧；0.1.39 生产 lane 按需排期，口径 = 0.1.38 lane 同判据〔P0 ①~④ 行为探针 + 随车显示面 in-scope 判据 + banner/UA + npm SRI 三方 MATCH + 发布 commit 单测交叉〕）。

## 发布 lane（发布 commit 出后，e2e 测试侧；发布/commit 归 Main）

- 发布 commit worktree 同判据回放（038 P0 4 场景 + 039 `--all`）。
- 生产 install 面：banner **v0.1.39** + sessionlist 走查面抽样（wide 场景 1 跑）。
- npm SRI 三方 MATCH（f4 口径 dist.integrity + unpackedSize）+ 四件套交叉。
- D4 根修本版**入 gate**（非 deferred）：走查 8 色在场 + 裸色抽查转绿 = 0.1.38 D4 两项 deferred 项核销面。
