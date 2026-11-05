# Implement 工单：/sessionlist 顺序+数量错乱 根因修 + UI/信息密度优化

分析侧 `issule analysist` 2026-10-06 提交 `AtlasCode 架构实施Main`。根因已定位（4 机制）+ 修法 scope 已与用户核对批过（P0 正确性 + P1 UI/信息）。**排期**：用户裁定「排序到品牌系统实施后」，本 session 收到用户「开工 sessionlist」指令后落盘；实际版本号排品牌系统（BR-8/视觉波，现 0.1.28）之后首个干净版本，由 Main + 用户拍板。

当前 master = `c1a563a`（0.1.27）。以下行号以该 HEAD 复核过。

## 症状

用户报 `/sessionlist`（`SessionTreeScreen`）清单：① 顺序不正确 ② 数量不正确。两个猜测均成立——「静默改写 session 文件」和「list 逻辑迁移」两类问题叠加。

## 根因（4 机制）

1. **数量错 = 50 硬截断**。`/sessionlist` 走 `loadSameRepoMessageLogs`（**非渐进**，`SessionTreeScreen.tsx:180`），其 `enrichLogs(..., INITIAL_ENRICH_COUNT=50)`（`sessionStorage.ts:4556` 常量 + `:5070` while 判 `result.length < count`）只 enrich 前 50 个有效 session，`:4055` `return result.logs` 把 `allStatLogs`/`nextIndex` 全丢，**无 load-more**。对比 `/resume`（`ResumeConversation.tsx:127/139-141`）走 `loadSameRepoMessageLogsProgressive` + `ref.nextIndex` 续读，能加载全部。→ 现场 `~/.atlas/projects` 79 个 .jsonl（主仓目录 34 + 多 worktree 目录合并），轻松超 50 → 静默截断。

2. **顺序错 = 排序键取文件 mtime**。`sortLogs`（`types/logs.ts:319`）按 `modified` 倒序；lite 路径 `modified = new Date(fileInfo.mtime)`（`getSessionFilesLite:4976`，源 `:4538`）——是**文件 mtime**，非「最后一条消息时间」。

3. **静默 append 顶 mtime（顺序错的主推手）**：session 文件被多处 append 改写，把 mtime 顶到「现在」：
   - **最致命是 `/sessionlist` 自己**：`SessionTreeScreen.loadLogs:185-193` 对每个无 `customTitle` 的 session `deriveAutoTitle`（纯字符串截断，非 AI）+ `void saveCustomTitle(…, 'auto')`（`:192`，fire-and-forget append → bump mtime，完成顺序任意 → 这批塌成 tie-break）。
   - 其他 append 者：`saveAiGeneratedTitle` / `saveTag` / `saveTaskSummary` / `linkSessionToPR` / consolidation（`autoDream/consolidationLock`）。

4. **数量错(次) + 脏值**：
   - `isSidechain` 误判：`readLiteMetadata:4729` `const isSidechain = head.includes('"isSidechain":true') || …` 扫**整个 64KB head**（注释写「from the first line」，但代码查整段）；应只查首行（`listSessionsImpl:89` 是正确版）。head 里混入任何 sidechain 内容 → 整条正常 session 被 `enrichLog`（`:5040`）过滤 → **数量再减**。
   - `ctime` 脏值：`getSessionFilesWithMtime:4538` `ctime: st.birthtime.getTime()`——变量名 ctime 实读 **birthtime**，作为 `created` 喂 sortLogs tie-break；birthtime 部分文件系统不支持 → tie-break 退化。

## AI 标题正确路径（现状保留，不改）

`REPL.tsx:2471-2486` 第一条真实用户消息 → `generateSessionTitle`（Haiku，`sessionTitle.ts` 单一事实源）。用户裁定「现状方案就可以」，不做 3 轮触发。`/sessionlist` 的 `deriveAutoTitle` 只是给「没拿到 AI 标题」的 session 兜底，且**不该在列表打开时回写**（见 P0-C1）。

## 改动

### P0 正确性（bug 修，必做）

**P0-A 补 load-more（消 50 截断）**
`SessionTreeScreen` 改用 `loadSameRepoMessageLogsProgressive`（返回 `{logs, allStatLogs, nextIndex}`）+ 续读（对齐 `ResumeConversation.tsx:127-141` 的 `ref.nextIndex` 模式），或等价的「加载全部」路径。目标：列出的 session 数 = 磁盘上有效 session 数（无 50 上限）。

**P0-B 排序键 &「最近活跃」回「最后一条消息时间戳」**
`sortLogs` 与「最近活跃」列统一用最后消息时间，不用 mtime。⚠️ **数据源需 main 裁定**（lite 路径当前只 scrape head+tail 字符串，且 `last-prompt`/`custom-title`/`tag`/`agent-*` 等 tail 元数据条目**都不带 timestamp**）：
- **B-lite（纯读侧）**：`modified = extractLastJsonStringField(tail, 'timestamp')`——取 tail 内最后一条**带 timestamp 的消息条目**（元数据条目无 timestamp，自然被跳过）。零写改动；但若最后一条消息条目已滚出 64KB tail 窗口，会低估活跃时间。
- **B-write（写侧小改，更可靠）**：在会话 flush 的元数据 re-append（`sessionStorage.ts:770` 一带 last-prompt/custom-title 区）加 `timestamp: new Date().toISOString()`（或新增一条 `last-active` 元数据），让 tail 恒带真实 last-active；列表读它。
  - 推荐 **B-write**（活跃时间恒可靠）；若 main 嫌写面改动大，B-lite 可先上。
- 「创建」时间同源问题：`created` 现状 = birthtime（P0-4 脏值）。lite 可用 `extractFirstJsonStringField(head, 'timestamp')`（首条目在 head 64KB 内，`listSessionsImpl:106` 已有该算法）取真实创建时间。

**P0-C1 删「列表打开时回写」**
`SessionTreeScreen.loadLogs:185-193` 的回写循环**整段删**（内存 derive + `saveCustomTitle` 都删）。显示退 `getLogDisplayTitle`（`log.ts:44-57`）既有 fallback 链：`agentName → customTitle → summary → firstPrompt(去 tag) → sessionId 前 8 位`，且渲染层已 `truncateToVisibleWidth(…, NAME_W)` 截断 → 长 prompt 不会裸显。副作用（mtime bump 顶序）随之消失。

**P0-C2 isSidechain 首行判定修正**
`readLiteMetadata:4729` 改只查首行（镜像 `listSessionsImpl:89` 写法），避免整 head 扫描误伤。顺带把 `:4538` ctime 脏值一并修（读真 ctime 或直接用 B 的 first-message 时间，别叫 ctime 读 birthtime）。

### P1 信息层（显示）——数据可得性已核实

| 项 | 数据可得性 |
|---|---|
| `summary` 二级说明行（名称下 dim 一行） | **已可得**（`enrichLog` 已带 `meta.summary`） |
| 双时间（创建/活跃）+ 相对时间 | 「活跃」= P0-B（同源）；「创建」= B 注里的 first-message 时间接线 |
| 徽标 `PR` / `fileSize` / `worktree` | **已可得**（enrich 已提 `prNumber`/`fileSize`/`worktreeName`） |
| 徽标 `mode` / `agentName` / `agentColor` | **需接线**（目前仅 full-load 路径有，lite/enrich 未提） |
| `tag` / `agentSetting` 升格 chip（现为行尾 flags 截断） | **已可得**（enrich 已提） |

### P1 准确性
- 消息数 `非空行近似`（`getSessionFileMeta`，含 metadata 行，偏高）→ `countVisibleMessages`。**需接线**（lite 无全量 messages；要全读或另存计数字段——权衡 I/O，main 裁定）。

### P1 交互 / UI
- 接入搜索：复用 `agenticSessionSearch`（能力已有，未接到本列表）+ 过滤/排序切换。
- 列宽自适应/可折叠，替换窄终端（<80 列）当前「直接砍分支列+消息列」的硬降级。
- 操作行独立：fork 状态机（`[f 确认] → forking… → ✓/✗`）从行尾堆叠移到**底部单行操作区**，行尾只留数据徽标。

## 回归判别（分析侧承接，按 P0/P1 分层）

**P0（必测，单测 + 行为探针）：**
- B：构造「文件 mtime 旧、最后消息时间戳新」的样例 → 按消息时间戳排（非 mtime）；「最近活跃」列显示消息时间。
- C2 + 数量：造 50+ session 目录 → 列出数 == 磁盘有效 session 数（P0-A）；含 sidechain 内容但非 sidechain 的 session 不再被误滤（P0-C2）。
- C1：打开 `/sessionlist` 前后，各 session 文件 mtime **不变**（无回写）。
- 消息数：样例含 N 条 metadata 行 → 显示数 = `countVisibleMessages`（P1，若做）。

**P1（用户面走查层）**：summary 二级行 / 徽标 / chip / 搜索 / 相对时间 / 列宽自适应——走 `user-e2e/tui-diff/accept.ts` 视觉/走查 gate（见 PLAN.md §7 验收盲区注：判据需含用户面走查，不只看行为探针）。

## 注

- 本工单只含 scope 与方向，未动代码；实施由 Main 在品牌系统实施后的干净版本执行，实施完 + 四件套绿后回 hash，发布走用户授权。
- P0 四项为「顺序/数量」主因，优先于 P1；P1 可拆同波或随 P0 一起，Main 按版本容量裁。

---

## Main 侧分析落盘 + 裁定（2026-10-06，供实施 session 直接开工）

> 本段为 Main 侧对上文 scope 的核验 + 裁定 + 实施计划。**用户 2026-10-06 裁定：本 session 只分析落盘、不实施代码**（实施归 Brand 专项推进，预计 0.1.28–0.1.31，排 BR-8 品牌波之后首个干净版本）。行号以本地 master `78f3c73`（= `c1a563a` 源 + 1 个 docs 提交）复核，源文件与 c1a563a 一致。

### 1. 根因核验（4 机制全中，行号已核）

1. **数量错 = 50 硬截断**：`SessionTreeScreen.tsx:180` 走 `loadSameRepoMessageLogs`（`sessionStorage.ts:4045-4056`，非渐进，只 `return result.logs`，把 `allStatLogs`/`nextIndex` 全丢）；`INITIAL_ENRICH_COUNT=50`（`sessionStorage.ts:4556`）+ `enrichLogs`（`:5061-5089`，`while result.length < count`）只 enrich 前 50 个有效 session，无 load-more。对比 `/resume`（`ResumeConversation.tsx:127-155`）走 `loadSameRepoMessageLogsProgressive` + `sessionLogResultRef`（`allStatLogs`/`nextIndex`）+ `loadMoreLogs` 续读。**已核。**
2. **顺序错 = 排序键取文件 mtime**：`sortLogs`（`logs.ts:319-330`）按 `modified` 倒序；lite 路径 `modified = new Date(fileInfo.mtime)`（`getSessionFilesLite:4976`，源 `:4538` stat），非「最后一条消息时间」。**已核。**
3. **静默 append 顶 mtime（顺序错主因）**：最致命 = `/sessionlist` 自己 `loadLogs:185-194` 对无 customTitle 的 session `deriveAutoTitle` + `void saveCustomTitle(…, 'auto')`（fire-and-forget append → 顶 mtime，完成顺序任意 → 塌成 tie-break）。**已核。**
4. **数量错(次) + 脏值**：`isSidechain` 误判 `readLiteMetadata:4729-4730` 扫**整 64KB head**（非首行）；`ctime` 脏值 `:4538` `ctime: st.birthtime.getTime()`（变量名 ctime 实读 birthtime，喂 `:4975` created）。**已核。**

### 2. Main 裁定（工单「需 main 裁定」项）

- **P0-B 数据源 = B-lite（纯读侧）**〔工单推荐 B-write，Main 改裁 B-lite〕
  - 依据：flush 面 `reAppendSessionMetadata` 在 **TUI `sessionStorage.ts:765-774`（last-prompt 区）与 engine `project.ts:435-441` 双处各一份**（TUI/engine 边界），B-write 须同时改两侧 = 跨边界改动、风险面大。
  - B-lite 只改读侧 `readLiteMetadata` + `enrichLog`，零写改动、零 TUI/engine 扇出。
  - `modified`（= 最近活跃列 + 排序键）= `extractLastJsonStringField(tail, 'timestamp')`（tail 内最后一条带 timestamp 的消息；last-prompt/custom-title/tag/agent-* 等元数据条目无 timestamp，自然跳过）。
  - `created`（创建）= `extractJsonStringField(head, 'timestamp')`（首条目在 head 64KB 内；算法同 `listSessionsImpl.ts:106` 的 createdAt）。
  - **残差 caveat（B-lite 固有，可接受）**：若最后一条消息滚出 64KB tail 窗口，或其后有带 timestamp 的条目（task-summary / pr-link / speculation-accept），活跃时间有分钟级偏差，不影响排序正确性。B-write（独立 last-active stamp）作后续可靠性升级，不阻塞本波。
  - **须补一步**：`enrichLog` 覆写 `modified`/`created` 后，/sessionlist 列表须**再 `sortLogs`**（初始顺序来自 `getSessionFilesLite` 的 stat-mtime 排序 `:4987`，enrichment 不重排）——否则「最近活跃」列是消息时间、但行顺序仍按 mtime，自相矛盾。（/resume 无此问题：`LogSelector.tsx:1511` 已按 modified 重排。）
- **P0-A = 「加载全部」路径**（非渐进 load-more UI）
  - 依据：/sessionlist 是管理列表（要看全部），无现成 load-more UI（无 onLoadMore / 触底触发）；渐进 UI 需新增交互，超出 P0 正确性范围。load-all 直接达成「列出数 == 磁盘有效 session 数」。
  - I/O 权衡：79 文件 × ~128KB ≈ 10MB，列表打开场景可接受（非热路径）。
- **P1 消息数 = 保留非空行近似，`countVisibleMessages` 接线 defer**
  - 依据：`countVisibleMessages` 需全量读 + 解析 JSONL，每次列表打开对全部 session 全读 = 高 I/O，与「列表快」冲突。P0 用 `getSessionFileMeta` 非空行近似（`SessionTreeScreen.tsx:48-75`，已缓存）足够；精确计数留 P1 follow-up（另存计数字段或按需全读）。
- **P1 徽标 mode/agentName/agentColor**：数据在 tail（`enrichLog` 加 3 个 `extractLastJsonStringField` 即可），改动小 → **倾向随 P0 一起接**（Main 按版本容量裁，可拆 P1）。

### 3. 实施计划（精确到函数/文件）

1. `readLiteMetadata`（`sessionStorage.ts:4719-4801`）：`LiteMetadata` 加 `firstTimestamp?`/`lastTimestamp?`（ISO 串）；`lastTimestamp = extractLastJsonStringField(tail, 'timestamp')`、`firstTimestamp = extractJsonStringField(head, 'timestamp')`。
2. `enrichLog`（`:4999-5054`）：`enriched.created = meta.firstTimestamp ? new Date(meta.firstTimestamp) : log.created`；`enriched.modified = meta.lastTimestamp ? new Date(meta.lastTimestamp) : log.modified`（scrape 失败回落 stat 值）。
3. **P0-C2** `readLiteMetadata:4729-4730` isSidechain 改**只查首行**（镜像 `listSessionsImpl.ts:87-94`：`head` 取第一个 `\n` 前为 firstLine，查 `firstLine.includes('"isSidechain":true'…)`）。顺带 `:4538` ctime 脏值不再被依赖（created 走 scrape，stat 值仅作 pre-enrich 兜底）。
4. **P0-A** 新增导出 `loadSameRepoAllMessageLogs(worktreePaths)`（`sessionStorage.ts`，置于 `loadSameRepoMessageLogsProgressive` 之后）：
   ```ts
   export async function loadSameRepoAllMessageLogs(worktreePaths: string[]): Promise<LogOption[]> {
     const r = await loadSameRepoMessageLogsProgressive(worktreePaths)
     let logs = r.logs
     let nextIndex = r.nextIndex
     while (nextIndex < r.allStatLogs.length) {
       const more = await enrichLogs(r.allStatLogs, nextIndex, INITIAL_ENRICH_COUNT)
       logs = logs.concat(more.logs)
       nextIndex = more.nextIndex
     }
     logs = sortLogs(logs) // 消息时间戳排序（P0-B 覆写后的 modified）
     logs.forEach((l, i) => { l.value = i })
     return logs
   }
   ```
5. **P0-A + P0-C1** `SessionTreeScreen.tsx`：
   - `loadLogs:180` `loadSameRepoMessageLogs(paths)` → `loadSameRepoAllMessageLogs(paths)`。
   - **删** 回写循环 `:185-194`（`deriveAutoTitle` + `void saveCustomTitle(…, 'auto')` 整段）+ 删 `deriveAutoTitle`（`:217-228`，删后无引用）。
   - 显示走既有 `getLogDisplayTitle`（`log.ts:30-58`：agentName→customTitle→summary→firstPrompt(去 tag)→sessionId 前 8 位）+ `:462` 已有 `truncateToVisibleWidth(…, NAME_W)`。
   - 保留 `doFork` 的 `saveCustomTitle`（`:251`，用户动作，合法）。
6. **P1（可选随 P0）** `enrichLog` 加 `mode`/`agentName`/`agentColor` 提取（`extractLastJsonStringField(tail, …)`），供徽标。

### 4. 回归判别（对齐工单「回归判别」，实施后须绿 + 四件套）

- **B**：造「文件 mtime 旧、最后消息 timestamp 新」样例 → 排序按消息 timestamp（非 mtime）；「最近活跃」列显示消息时间。
- **C2 + 数量**：50+ session 目录 → 列出数 == 磁盘有效 session 数（P0-A）；含 sidechain 内容但**非 sidechain** 的 session 不再被误滤（P0-C2 首行判定）。
- **C1**：打开 /sessionlist 前后各 session 文件 mtime **不变**（无回写）。
- **P1 消息数**（若做）：样例含 N 条 metadata 行 → 显示数 = `countVisibleMessages`。
- 四件套：tsc 0 / lint 0e·0w / build / 全量 `bun test --isolate tests/`（detached verify worktree 跑全量，master 就地全量会 SIGSEGV）。

### 5. 排期

- 用户 2026-10-06 裁定：归 **Brand 专项**实施，预计 **0.1.28–0.1.31**（BR-8 品牌波之后首个干净版本），具体号 Main + 用户拍板。
- 本 session 只落盘分析、不实施（worktree-sessionlist 已建、无代码改动，实施 session 复用或重建）。
- 实施完 + 四件套绿后回 hash，发布走用户授权（沿用常设授权发布序列）。

---

## 版本规划 + e2e 覆盖（分析侧 2026-10-07，用户认可两版切法）

Brand 序列 0.1.29–0.1.35 已全闭环（0.1.35 = Brand 封口终版）、0.1.36 已收口、0.1.37 封口版在制收尾（⑧/②④ 子集 gate 已 PASS，唯一待 ③ P2 裁定 + 全量 gate）。sessionlist 两版归属：

- **0.1.38 = sessionlist P0 正确性波**（0.1.37 收口后开波）：P0-A load-all（消 50 截断）+ P0-B 排序键回消息时间戳（B-lite 读侧 + enrich 后重排）+ P0-C1 删列表打开回写 + P0-C2 isSidechain 首行 + ctime 脏值；随车（Main 裁定「已可得/改动小」）= 徽标 mode/agentName/agentColor + tag/agentSetting 升 chip + summary 二级行 + 双时间 + 相对时间。
- **0.1.39 = sessionlist P1 交互/UI 波**（0.1.38 收口后）：搜索接线（复用 agenticSessionSearch）+ 过滤/排序切换、列宽自适应/可折叠（替换窄终端硬砍列）、fork 状态机移底部操作行。
- **deferred 显式登记**（release-governance 支柱①）：消息数 `countVisibleMessages` 全读接线 = 0.1.39 内按需做或后续波（Main 裁定 defer）；B-write（last-active stamp 写面）= 后续可靠性升级。

**e2e 覆盖（分析侧承接，涉界面+功能修改，双层判据）**：
- 0.1.38：P0 行为探针（① mtime 旧/最后消息时间戳新样例 → 排序按消息时间、最近活跃列显示消息时间；② 50+ session 目录 → 列出数 == 磁盘有效数；③ 含 sidechain 内容非 sidechain 的 session 不再误滤；④ 开列表前后各 session 文件 mtime 不变 = 无回写）+ 四件套 + 发布后生产 lane 验真（release-governance 支柱② 同判据 + 支柱③ fail-closed）。
- 0.1.39：`user-e2e/tui-diff/accept.ts` 用户面走查 gate（行为探针 + 用户面走查双层，补 PLAN.md §7 验收盲区：判据不能只行为探针）——搜索/过滤/排序切换、列宽自适应（宽/窄终端两档）、操作行单行、徽标/chip 渲染走查 + 回归不伤 P0 判别。

---

## 0.1.38 实施落盘（Main，2026-10-07，code-complete + 四件套绿）

**分支** `worktree-0.1.38-sessionlist`（`AtlasCode/worktrees/worktree-0.1.38-sessionlist`，基 d99e764），
3 提交：

| 提交 | 内容 |
|---|---|
| `2d5b8bf` | P0-B/C2 数据层（sessionStorage.ts）：readLiteMetadata 增 firstTimestamp/lastTimestamp 抓取 + isSidechain 首行判定（P0-C2）+ ctime→birthtime 改名降级兜底 + 徽标数据接线（mode/agentName/agentColor tail scrape）；enrichLog 覆写 created/modified（parseLiteTimestamp 无效值回落 stat）；新增导出 `loadSameRepoAllMessageLogs`（P0-A load-all：enrichLogs while 续读至全量 + 消息时间戳 sortLogs 重排 + value 重编号） |
| `55b5aa5` | P0-A/C1 + 随车显示面（SessionTreeScreen.tsx）：切 loadSameRepoAllMessageLogs；删列表打开回写整段（deriveAutoTitle + void saveCustomTitle 'auto'，P0-C1 纯读）；双时间列（创建 M/D/YYYY + 最近活跃 formatActive 混合：≤7d 相对 now/5m/2h/6d，>7d 绝对）；窄终端（<80 列）砍创建/分支/消息列；徽标 [C]（coordinator）+ tag/agentSetting chip 保留行尾 token 形；标志段重排（状态机前置防 3s confirm 窗口被截断）；agentColor（8 值域）→ idle 行整体着色（chalk 安全映射） |
| `6d70429` | 回归判别探针（tests/func/sessionlist-p0-fs.test.ts，5 探针，突变已核恰好红）：B 排序按消息时间戳 / created 数据源首消息时间戳 / C2 内嵌 sidechain 不误滤（+真 sidechain 仍滤守卫）/ count 60 全列（无 50 截断）/ C1 加载路径纯读（mtime 不变、无新文件） |

**四件套（detached verify worktree worktrees/verify-0.1.38 跑全量，master 就地 SIGSEGV 先例）**：
tsc 0 / eslint src/ 0e·0w（仓 canonical lint 面；`eslint .` 含 tests/ 的 68 存量 any/unused 非 0w 基线 scope）/ build 3872 模块 17.60MB / 全量 **3729/0·267**（基线 0.1.37 3724/0·266 + 本波 5 探针 1 文件，零回归）。

**实施裁定（工单「Main 按版本容量裁」行使，e2e 走查 gate 0.1.39 复核）**：
1. **summary 二级行拆 0.1.39**：变高行模型与本屏虚拟窗口光标-窗口不变量（单行=单行、1:1 对齐防脱轨）冲突面大，归 0.1.39 交互/UI 波随列宽自适应一起做（走 tui-diff 用户面走查 gate）。
2. **agentName 徽标不渲染**：agentName 本就是 getLogDisplayTitle 首位 fallback（设了即标题），独立 chip 零信息量；数据已接线（enrich 提 agentName）供后续用。
3. **agentColor 渲染 = idle 行整体着色**（单行模型内可行面）；chalk 无 purple/orange/pink 精确名 → 保守映射 purple/pink→magenta、orange→yellow（三对撞色可接受，0.1.39 走 theme 精确映射 + 圆点着色）。
4. **标志段重排**：fork 状态机（[f 确认]/forking/✓/✗）提前到数据 chip 前——3s confirm 窗口操作提示不可被行尾截断，数据 chip（#tag @agent [C]）可截。

**e2e 覆盖（分析侧承接，0.1.38 行为探针 ①~④）**：① mtime 旧/最后消息时间戳新样例 → 排序按消息时间 + 最近活跃列显示消息时间 ② 50+ session 目录 → 列出数 == 磁盘有效数 ③ 含 sidechain 内容非 sidechain 的 session 不再误滤 ④ 开列表前后各 session 文件 mtime 不变（无回写）+ 四件套 + 发布后生产 lane 验真。
**发布**：e2e gate 绿后走 Main 会话用户授权流程（常设授权发布序列）。

---

## 0.1.39 预研（Main，2026-10-07，等 0.1.38 gate 绿后开波）

**scope（工单版本规划段 + 0.1.38 四裁定落面）**：
1. 搜索接线（复用 agenticSessionSearch）+ 过滤/排序切换
2. 列宽自适应/可折叠（替换 0.1.38 窄终端硬砍列：创建/分支/消息三列改为按可用宽度渐进隐藏或折叠段）
3. fork 状态机移底部操作行（0.1.38 裁定④的状态机前置为行内临时态，0.1.39 改固定底部操作行：当前行操作 + 3s confirm 窗口不动行模型）
4. summary 二级行（裁定①：变高行模型，须解虚拟窗口光标-窗口 1:1 不变量——展开行计入窗口行号映射，走 tui-diff 用户面走查 gate）
5. agentColor theme 精确映射 + 圆点着色（裁定③的 0.1.39 升面：chalk 保守映射→theme 色板精确 8 色 + idle 行前置圆点 ●）
6. countVisibleMessages 按需全读（deferred 项，0.1.39 内按需做：打开列表不预读，展开某行/悬停时按需全读解析，带 LRU 缓存）

**搜索面预研（本段核心结论）**：
- `agenticSessionSearch(query, logs, signal?) → Promise<LogOption[]>`（`src/tui/utils/agenticSessionSearch.ts:146`，唯一导出；LLM 语义面，前置 `logContainsQuery` 同步预滤 title/customTitle/tag/gitBranch/summary/firstPrompt/transcript，transcript 走 extractTranscript 截断面）。
- 消费模式：现有两消费点（`commands/resume/resume.tsx:21` / `screens/ResumeConversation.tsx:296`）都是把函数当 `onAgenticSearch` prop 交给 `LogSelector`。SessionTreeScreen 自建行模型（非 LogSelector）→ 0.1.39 接线二选一裁定（开波时拍）：
  - **A（倾向）**：SessionTreeScreen 加同步本地过滤（抽 `logContainsQuery` 同名纯面导出 or 屏内自实现 title/summary/firstPrompt 三字段 includes）+ 保留 agentic 语义搜索为可选键（如 `/` 本地、`S` agentic）——列表管理场景秒级反馈优先，LLM 调用按需不预触。
  - B：直接复用 agenticSessionSearch 走 LogSelector 面——交互模型与树屏行模型冲突大，弃。
- 排序切换 = 现 `sortLogs`（modified 倒序 + created tie-break）扩为可切换键（modified/created/messageCount/title），键切换仅重排行模型零数据层改动。
- 过滤切换 = 谓词组合面（coordinator-only / 有 tag / 有 branch / idle-agent 有 color），谓词纯函数可单测。

**e2e gate（工单 §版本规划）**：`user-e2e/tui-diff/accept.ts` 用户面走查（行为探针 + 用户面走查双层）：搜索/过滤/排序切换、列宽自适应（宽/窄两档）、操作行单行、徽标/chip 渲染走查 + 回归不伤 P0 判别（5 探针 0.1.38 已落，0.1.39 须保持绿）。

**开波前置**：0.1.38 全链收口（gate 绿 + 发布 + 生产 lane）→ 0.1.39 worktree 基 = 0.1.38 发布后 master；实施序建议 ③操作行→②列宽→④二级行→⑤色板→①搜索/过滤/排序（UI 骨架先稳，交互面后接）→ 四件套 + 回 hash（e2e 承接 gate，同 0.1.38 协议）。

### 0.1.39 scope 增量（2026-10-07 用户裁定 B 经 issule analysist 转达）

- **0.1.38 发布 hold**：gate 扩为「P0 四探针 + 55b5aa5 随车显示面行为断言」（created 列/[C] 徽标/tag·agentSetting chip/agentColor 着色基线/状态机前置态/列宽宽窄基线），原 4 探针 PASS 报告 r-20261007-1835-0138-gate.md 有效作 P0 段，显示面段 e2e 扩展后补报；发布 hold 到扩展 gate verdict PASS。显示面探针若揭 55b5aa5 缺口 → 0.1.38 内小修 commit（发布前），0.1.39 分支（叠 6d70429）须合并该修。
- **0.1.39 显示面增补**：PR 徽标（prNumber/prUrl）/ fileSize / worktree 徽标（worktreeSession.worktreeName）**不在 0.1.38 随车集，归 0.1.39 P1 显示**（gate 不断言 0.1.38 段）→ 0.1.39 行渲染 chip 段补 PR/fileSize/worktree 三类数据 chip（数据层 0.1.38 enrichLog 已接线 prNumber/prUrl/prRepository + worktreeSession，仅缺渲染）。

---

## D4 缺陷 + disposition（2026-10-08，e2e 扩展 gate 抓出，用户裁定 (b)）

**缺陷**（分析侧源码复核坐实，e2e 定因准确）：`src/tui/ink/colorize.ts:69-168` 只认 `ansi:`/`#`/`ansi256()`/`rgb()` 前缀，**裸 ANSI 色名 `:168 return str` 落空 = 无 SGR**。TUI 492 处 `color="..."` 中 478 为主题 token（组件层解析正常）+ **14 处裸 ANSI 名（cyan×5/red×4/yellow×3/magenta×1/green×1）全落空**——含 SessionTreeScreen 的 idle 身份色（AGENT_ROW_COLOR）/焦点 cyan/选中 magentaBright/头部/底部。**既有全局缺陷**（0.1.37 该文件已 4 处裸名，git 2cdc0bd 核验），非 0.1.38 引入；0.1.38（55b5aa5）新增 agentColor 消费面被 gate 抓出。

**disposition（用户 2026-10-08 裁定 b）**：
- **0.1.38 按「P0 4 探针 + D1/D2/D3/D5/D6 全绿 + D4 显式 deferred」收口发布**（agentColor 当前本就不可见，无功能损失）。
- **0.1.39 scope 增补 colorize 裸名根修**：① 根修（推荐）= colorize.ts 入口加裸名 fallthrough（bare→ansi: 单点修，全 TUI 一次生效 + 免疫未来散用）或 ② 逐处 14 处加前缀（治标，Main 裁）；随原 0.1.39 scope（agentColor 精确 theme 映射 + 焦点/选中/头部/底部色 + 搜索/列宽/操作行 + PR/fileSize/worktree 徽标渲染）。e2e 走查 gate 已同步扩容断言（全色面 SGR 在场 / 8 值域精确映射 / 其他裸色处抽查 / P0+D 段不回归）。

---

## 0.1.39 实施闭环记录（Main，2026-10-08）

**实施序（按预研推荐 ③→②→④→⑤→①）**：worktree-0.1.39-sessionlist（叠 0.1.38 头 6d70429），
每切片 tsc 0 + 判别单测/func 探针绿 + 改动面 lint 0：

| 切片 | worktree 提交 | master cherry-pick | 面 |
|---|---|---|---|
| S1 操作行 | a4094d3 | 3a55424 | fork 状态机移底部操作行（单行固定，buildActionRow 纯面） |
| S2 列宽 | 102ea0a | 867c99b | computeColumnLayout 纯面（msg→branch→created 渐进隐藏 + 名称伸缩下限 16） |
| S3 二级行 | f1fcc89 | 2d12fe2 | x 键展开变高行（slot 前缀和单一事实源；HEADER/FOOTER 行预算输入/渲染段单源） |
| S4 色板 | 10fecd4 | adcbc67 | agentColor theme 精确 8 色（*_FOR_SUBAGENTS_ONLY 映射）+ idle 实心圆点独立着色 |
| S5 搜索/过滤/排序 | 58263b2 | 57c3748 | 方案 A（/ 本地同步过滤 + agentic 可选键 onAgenticSearch + s 排序键循环 + LRU(64) 按需精确计数 + **裁定 B 增补 PR/fileSize/worktree 三类 chip**）；搜索分支置于 current guard 之前（零命中空视图不卡死）；列头排序/过滤指示 + 搜索态操作行 |
| D4 根修 | d439a6a | 592a3b7 | colorize 入口 bare→ansi: 归一（16 名集合，递归一层复用既有 switch；14 处裸名全收编，纯加性零回归）+ 判别单测 6（FORCE_COLOR=3 钉 level） |

**测试面**：单测 48（S1-S4 36 + S5 12）+ colorize-d4 6 + func 渲染探针 3（S1 守卫/S3 开合/S5 搜索态）= 57 新增。

**四件套（detached verify worktree verify-0.1.39-sessionlist @ d439a6a）**：tsc 0 · eslint
0e·0w · build 17.61MB · 全量 `bun test --isolate tests/` **3786/0·270 文件**（3729 基线 + 57）。

**发布序（2026-10-08 裁定 38→39→40→41）**：
- **0.1.38 已发布**（本记录同时点）：cherry-pick 8cfa3cf/378a339/251056d → release d15c416
  + tag v0.1.38 + push×2 + npm 0.1.38（shasum 26b87dc0…，packument latest=0.1.38 MATCH）。
- **0.1.39 码面已合 master**（592a3b7，已 push 对齐）；**release 提交待 e2e tui-diff
  走查 gate 绿**（断言面 = P0 5 探针保持绿 + S1-S5 交互面 + D4 全色面 SGR 在场/8 值域
  精确映射/裸色抽查）→ gate 绿后 bump 0.1.39 + tag + push×2 + npm（e2e 闭环后才 npm）。

## 0.1.39 gate 修记录（gap-A + gap-B，2026-10-08）

**e2e tui-diff 首跑 verdict = GATE-OPEN（hardFail=7，双簇 + 3 INCONCLUSIVE 全探针侧）**：
- **gap-A（4 探针红，D4 活路径比入口高一层的静默丢弃）**：TUI Text 经 ThemedText
  theme-aware 包装——裸 ANSI 色名不匹配四 raw 前缀（rgb(/#/ansi256(/ansi:）→ 落
  theme-key 分支 → `theme['red']` undefined 静默丢弃，color 到不了 colorize 入口
  （D4 只修了入口，活屏仍无色码）。修 = colorize 导出 `BARE_ANSI_COLOR_NAMES` +
  `ThemedText.resolveColor` 末段 theme-key 优先（Theme 无 16 裸名同名字段——直接核
  Theme 类型字段面定因，零回归）+ undefined 回落 16 裸名透传 → base Text →
  colorize 入口（D4 已归一）产 SGR。判别 func 3 新增
  （`tests/func/themed-text-bare-color`：① 裸名 red SGR 31 / ② theme 键 inactive 回归守卫 /
  ③ 域外未知键 ≡ 无色逐字相同）。
- **gap-B（3 探针红，S2×S5 预算交互）**：nameW 吃全预算 → fixedW≈termCols →
  maxFlags≈0 全档宽 → 徽标 chip（[PR #42]/(size)/[wt:]）+ 列头「· 排序:」指示恒截。
  裁面（Main）= **名称列比例 chip 槽 `round(budget×0.3)`**（初裁固定 56 被 func 100 列
  面打回：100 列名称列塌缩 16 不成立——最常见真实宽度牺牲 33 字符名称换无 chip 行的
  死空间，产品 trade 不成立 → 改比例槽）：wide 200 ≈54（全 chip 行最坏 ≈53 容纳，
  e2e fixture p39-badges 全字段 51-53 实算）/ 100 列 ≈24（名称列 25 不塌缩）/ 窄档钳 16；
  **砍列阈值不含此槽**（showX 布尔零回归，S2 六探针阈值面不变）。S2 单测 7 项 nameW
  期望更新（95/25/16/16/16/16/17）。
- 3 INCONCLUSIVE 全探针侧（无需 Main 动作）；**观察项登记（0.1.39+ 裁定面，gate
  不阻塞）**：S5-EMPTY-STATE 暴露产品搜索输入 `input.length===1` 守卫——快速击键/
  粘贴多字符被整段丢弃（PTY 300ms/字符间隔可绕开），归 0.1.39+ 击键面缺口裁定。

**提交**：worktree b5252d1 → master **b7ef49f**（cherry-pick，已 push 对齐 origin）。

**验证**：4 文件 60/0（sessionlist-p1 48 + colorize-d4 6 + 渲染 func 3 + gap-A func 3，
较 0.1.38 基线 +60 新增）+ tsc 0 + 改动面 lint 0e·0w + build 17.61MB；全量 suite
verify worktree @ b7ef49f 后台跑（预期 3789/0·271 文件）。

**重开契约**：e2e 重跑 `sessionlist-039.ts --all` + `sessionlist-038.ts --all`
（预期 wide 全绿 + 038 P0 恒绿 + display 分流 D2/D6 核销）→ GATE-PASS 单信号 →
0.1.39 常设发布序列（bump + tag + push×2 + npm + packument 验真）。

## 0.1.39 gate 重跑 r1/r2 判定记录（e2e，2026-10-08）

- **0.1.38 生产 lane = PASS**（全判据绿，5 段闭环终态达成）：worktree prodlane-038 @
  d15c416（= tag v0.1.38 = 发布 commit）+ npm 0.1.38 独立验真；A–J 全满足（生产
  update 0.1.37→0.1.38 auto-updater 即刻生效 / npm SRI 三方 MATCH / P0 ①~④ 行为
  探针 8/8 全绿发布 face 同口径回放 / banner v0.1.38 PTY 实捕 / 发布 commit 单测
  交叉 6/0）。报告 = user-e2e/reports/r-20261008-prodlane-038.md。
- **0.1.39 gate r1 @ b7ef49f = gap-A 核心绿 + 残余 4 红 + 1 soft 全探针侧定因（0 产品缺口）**：
  gap-A 三探针转绿（D4-HEADER-CYAN SGR 36 / D4-CONFIRM-YELLOW SGR 33 / S4 8 色真色码
  8/8 全 theme 通道 = ThemedText 裸名透传修复实证）+ S3 X1/X2 双路径 + S5 行为面
  （过滤/搜索态/esc/排序 3 键/fork 状态机/徽标 chip）+ S2 col64/col56 窄档全绿。
  残余 4 红定因全探针侧：S3-PHYSICAL-POS（iNext 锚完整字面在 reflow 碎片缺席，产品
  物理位置实正确）/ S5-SORT-IND-2（「· 排序:」前缀 × 标签 cell 分属不同重放段，
  指示面实功能）/ S4-FOCUS/SEL（探针导航假设错位——产品焦点会话保持面正确行为，
  36/95 色码在实焦点/选中行 raw 实捕）/ S5-EMPTY-STATE（零命中空态面实功能，全量
  query 完整字面被 cell-diff 碎片化）。探针 5 判据修复完成 → r2 + 038 --all 全绿
  即 GATE-PASS 单信号。
- **观察项登记（0.1.39+，gate 不阻塞，2 项）**：① S5 搜索输入 `input.length===1`
  守卫整段丢弃多字符/粘贴输入（快速击键面缺口）；② ag-cyan 行「焦点/选中覆盖身份」
  优先级走查面（导航键相落 ag-cyan；优先级逻辑 S4 单测族承载）。

## 0.1.39 发布收口（2026-10-08）

gate GATE-PASS（e2e 双命令 @ b7ef49f：039 wide 26 探针 0 FAIL + 038 P0 8/8 +
display 10/10）→ 常设发布序列全链收口：
- release 提交 **9f8df7f**（bump 0.1.39 + CHANGELOG 0.1.39 段）→ tag **v0.1.39**
  （远端核验同 SHA）→ push×2（master + tag，origin 对齐）
- npm `@atlasharness/atlascode@0.1.39`（DNS-pin 通道 `--registry
  https://registry.npmjs.org`；shasum `ef02a7fba1d28a3d5abeadb7ace5eff4a89be8f1`
  + integrity sha512-tEQG9XZi…）
- packument 验真：`latest=0.1.39` + shasum MATCH（传播延迟 ~3min，第三次查到达）。
- 协同：f4 收 0.1.40 基线 = **9f8df7f**（= tag v0.1.39 = release commit，裁定 a
  兑现）；issule 终态回传 + 2 观察项 intake 面登记。
- 0.1.39 生产 lane：e2e 按需排期（口径 = 0.1.38 lane 同判据，被测体 =
  tag v0.1.39 = 9f8df7f）。
