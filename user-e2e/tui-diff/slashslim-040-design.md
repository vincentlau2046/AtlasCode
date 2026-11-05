# 0.1.40 slash 命令精简波（W1+W2+W3）· e2e gate 探针设计（e2e 预研备料，零产品改动）

- **对象**：0.1.40 = **W1**（删 5 命令 + 孤儿清理，voice 保留）+ **W2**（删 15 死码 + E-1P 8 项零码登记）+ **W3**（翻开 files/tag/version `isEnabled`）；**W4**（fast/privacy-settings/advisor 移植）= **0.1.41**，**不入本版 gate**（spike 先行，过则入 0.1.41，未过显式 deferred 具名版）。
- **工单**：`docs/2026-10-07-slash-cmd-slim-and-backfill.md`（W1/W2/W3 in-scope + 判据 + /help 跨波处理项 + 版本计划 0.1.40=W1+W2+W3 一版）。
- **探针**：`user-e2e/tui-diff/slashslim-040.ts`（`--repo <0.1.40 worktree> [--all | cmd | statusline-default | statusline-config | help]`）。
- **纪律**：e2e 只做测试侧；探针全在 `user-e2e/` 落工作区（Main 随 0.1.40 波收编）；零写真实 `~/.atlas`（sandbox home；StatusLine 面经 `<sandboxHome>/.atlas/statusline.json`，非真 home，§9.9.3 显示配置路径仅用户级 + PTY 内 HOME=sandboxHome）。
- **执行时点**：**0.1.39 收口后**（0.1.40 发布 gate 卡 0.1.39 收口发布；本备料现写**不跑**）。若 0.1.39 tui-diff 走查需 e2e 人力，**以 0.1.39 优先**（Main 已定此优先级，0.1.40 顺延）。

---

## f4 预置 4 判据（本设计逐条实现）

| # | f4 判据 | 实现面（探针场景） | 判据（0.1.40 必绿） |
|---|---|---|---|
| **1** | 命令表 `getCommands()` NOT 含 5 删 / 含 files·tag / version 仅 `ATLAS_DEV=1` / voice 仍在表（feature 默认关，断言 import 块存在） | **源级命令表**（`--cmd`，纯 FS 无 PTY）：`src/tui/commands.ts` COMMANDS+INTERNAL_ONLY+gating + 命令文件存在性 | W1 5 + W2 15 的 import specifier + 命令文件**全不在**；W3 files/tag/version 文件在场且 `isEnabled: () => true`（version 仍在 `INTERNAL_ONLY_COMMANDS` = ATLAS_DEV 门）；voice import 块 + `feature('VOICE_MODE')` 仍在 |
| **2** | StatusLine 双面（删 /statusline 命令**不动**显示组件——用户裁定负向保证）：默认面 + 手动配置面各探一次 | **PTY**（lib/pty）：默认面 = sandbox `.atlas` **无** statusline.json → 通道 B 默认 5 段仍显示；配置面 = 写 `<sandboxHome>/.atlas/statusline.json`（model-only）→ 通道 B 按配置显示（cwd 段离场） | 默认面 footer `⚡`(model) + `⌂`(cwd) 在场；配置面 footer `⚡` 在场 + `⌂` **离场**（段集从默认 5 段缩到 1 段 = 配置被消费，非回退默认） |
| **3** | /help 一致性：实际渲染命令集 = 0.1.40 期望集（无 5 删、有 files/tag、version gated） | **PTY**（tall 窗 `ATLAS_E2E_ROWS=360`）：/help → 切 commands tab → `/${name}` label 集 | files/tag label 在场 + 控制集（/help /model /clear）在场 + 5 删 + version label 不在场（**INCONCLUSIVE-tolerant**：commands tab 未达/窗口截 → 定因，非 FAIL；权威表 verdict 由 #1 源级承载） |
| **4** | 四件套 0 错 + 0.1.40 增量单测 0 FAIL + 生产 lane 验真 | **发布 lane 清单**（gate 跑四件套 + 命令单测；生产 lane 发布后同判据回放） | 见「发布 lane」段 |

---

## 源级 token 图（0.1.40 目标态，`--cmd` 断言锚点；基于当前 master 0.1.37 `src/tui/commands.ts` 行号）

| 类 | 命令（name） | commands.ts import specifier | 命令文件（`src/tui/commands/`） | 目标态 |
|---|---|---|---|---|
| W1 删 | statusline | `from './commands/statusline.js'`（L125） | `statusline.tsx` | 删 |
| W1 删 | output-style | `from './commands/output-style/index.js'`（L124） | `output-style/index.ts` | 删 |
| W1 删 | pr-comments | `from './commands/pr_comments/index.js'`（L35） | `pr_comments/index.ts` | 删 |
| W1 删 | security-review | `from './commands/security-review.js'`（L51） | `security-review.ts` | 删 |
| W1 删 | torch | `require('src/tui/commands/torch.js')`（L73）+ `...(torch ? [torch] : [])`（L261） | `torch.ts` | 删 |
| W2 删 | autofix-pr | `from './commands/autofix-pr/index.js'`（L4） | `autofix-pr/index.ts` | 删 |
| W2 删 | backfill-sessions | `from './commands/backfill-sessions/index.js'`（L5） | `backfill-sessions/index.ts` | 删 |
| W2 删 | break-cache | `from './commands/break-cache/index.js'`（L32） | `break-cache/index.ts` | 删 |
| W2 删 | bughunter | `from './commands/bughunter/index.js'`（L52） | `bughunter/index.ts` | 删 |
| W2 删 | ctx_viz | `from './commands/ctx_viz/index.js'`（L21） | `ctx_viz/index.ts` | 删 |
| W2 删 | debug-tool-call | `from './commands/debug-tool-call/index.js'`（L145） | `debug-tool-call/index.ts` | 删 |
| W2 删 | env | `from './commands/env/index.js'`（L119） | `env/index.ts` | 删 |
| W2 删 | good-atlas | `from './commands/good-atlas/index.js'`（L7） | `good-atlas/index.ts` | 删 |
| W2 删 | issue | `from './commands/issue/index.js'`（L8） | `issue/index.ts` | 删 |
| W2 删 | oauth-refresh | `from './commands/oauth-refresh/index.js'`（L144） | `oauth-refresh/index.ts` | 删 |
| W2 删 | onboarding | `from './commands/onboarding/index.js'`（L34） | `onboarding/index.ts` | 删 |
| W2 删 | perf-issue | `from './commands/perf-issue/index.js'`（L98） | `perf-issue/index.ts` | 删 |
| W2 删 | share | `from './commands/share/index.js'`（L41） | `share/index.ts` | 删 |
| W2 删 | summary | `from './commands/summary/index.js'`（L97） | `summary/index.ts` | 删 |
| W2 删 | install-slack-app | `from './commands/install-slack-app/index.js'`（L31） | `install-slack-app/index.ts` | 删 |
| **W3 翻** | files | `from './commands/files/index.js'`（L89，**在场**） | `files/index.ts` `isEnabled: () => true` | 翻开（生产面） |
| **W3 翻** | tag | `from './commands/tag/index.js'`（L123，**在场**） | `tag/index.ts` `isEnabled: () => true` | 翻开（生产面） |
| **W3 翻** | version | `from './commands/version.js'`（L96，**在场**） | `version.ts` `isEnabled: () => true`；**仍在 `INTERNAL_ONLY_COMMANDS`（L178，ATLAS_DEV 门）** | 翻开（dev 表） |
| 保留 | voice | `const voiceCommand = feature('VOICE_MODE')`（L61）+ `...(voiceCommand ? [voiceCommand] : [])`（L248，**在场**） | `voice/index.ts`（**在场**） | 保留（feature 默认关） |

**voice 为何源级断言（非 getCommands 运行面）**：`voice.availability = ['claude-ai']`（voice/index.ts:11）→ de-ANT 世界 `meetsAvailabilityRequirement`（commands.ts:326-356）case `'claude-ai'` fall-through → `return false` → **voice 永不进 getCommands() 运行面输出**（feature 默认关时 `feature('VOICE_MODE')` 为 falsy 不入表；feature 开时 availability 门滤除）。故 f4「voice 仍在表（断言 import 块存在）」= **源级 import 块在场**（未被 W1 误删），**非运行面断言**。

**version 的 ATLAS_DEV 门**：`version` 在 `INTERNAL_ONLY_COMMANDS`（L178）；该表仅在 `IS_ATLAS_DEV && !IS_DEMO`（L262）时展开入 `allCommands` → getCommands() 运行面：生产（ATLAS_DEV 未设）无 version；`ATLAS_DEV=1`（且 IS_DEMO 未设）version 在表。PTY 面（IS_DEMO=1）恒无 version。

---

## 判别力（前后 lane 统一，规则②「测的=发布的」）

- **pre-0.1.40（= 0.1.37 态）**：W1 5 + W2 15 在表；W3 files/tag/version `isEnabled: () => false`（files/tag 生产面不可见、version 仅 ATLAS_DEV 且 isEnabled false 不可见）→ `--cmd` 必红（判别基线）。
- **post-0.1.40**：20 删项全离 + W3 翻开（files/tag 生产面可见、version dev 面可见）→ `--cmd` 必绿。
- **StatusLine 双面 + /help = 用户面负向保证**：W1 只删 `/statusline` **命令**（`statusline.tsx`），**不动 StatusLine 组件**（`src/tui/components/StatusLine.tsx` 经 `PromptInputFooter` 渲染，配置走 `loadStatusLineConfig()`，不 import /statusline 命令）→ 组件/config 消费链路 0.1.37/0.1.40 零改动，两面在 0.1.40 必绿（回归不翻）。/help = 纯动态（HelpV2 无硬编码命令名）→ 自动跟随命令表，0.1.40 渲染集 = 目标集。

---

## 执行流程

```bash
# 源级命令表（纯 FS，秒级，先跑——无 PTY/无网关竞争）
bun run user-e2e/tui-diff/slashslim-040.ts --repo <worktree-0.1.40> --cmd
# 全 gate（--all = cmd + statusline-default + statusline-config + help；PTY 场景串行防网关竞争）
bun run user-e2e/tui-diff/slashslim-040.ts --repo <worktree-0.1.40> --all
# 产物：user-e2e/tui-diff/artifacts/SC-<stamp>-<rand>/<scen>/{result.json[, pty.log]}
```

- **`cmd`** = 纯源级 grep（读 `<repo>/src/tui/commands.ts` + `<repo>/src/tui/commands/*`；无 PTY/无 sandbox，秒级）。
- **`statusline-default` / `statusline-config` / `help`** = 各起独立 PTY（独立 ws/sandbox，互不污染；`statusline-config` 先写 `<sandboxHome>/.atlas/statusline.json` 再 launch；`help` 用 `ATLAS_E2E_ROWS=360` tall 窗使 `visibleCount ≥ 命令总数` 全量一屏现形）。同 lane 串行。
- 判读：`GATE-PASS`（全场景 hardFail=0 且 0 INCONCLUSIVE）→ 回 0.1.40 gate 报告；任一 hardFail → FAIL（产品缺口，fail-closed 不发布）；INCONCLUSIVE → 定因核 artifact 后重跑或登记。

---

## 0.1.41 W4 预留（若 spike 过，入 0.1.41 gate，**非本版**）

`fast` / `privacy-settings` / `advisor`（`src/tui/commands/` 移植 + `src/tui/utils/` 依赖重映射，spike 先行）：getCommands() 三 name 出现 + 各功能探针（fast = modelAllowlist fast 通道联动）+ 四件套。spike 未过 = 显式 deferred 到具名版（需求封口不阻塞）。**本版 gate 不含 W4**（3 文件当前 `MISS` = 尚未移植，符合 0.1.40 scope）。

---

## 发布 lane（发布 commit 出后，e2e 测试侧；发布/commit 归 Main）

- 发布 commit worktree 同判据回放（`--all`：`cmd` 源级 + StatusLine 双面 + /help）。
- **生产 install 面**（`atlas` 全局）同判据一跑（`--cmd` 源级 + /help 用户面）。
- banner = **v0.1.40**；npm SRI 三方 MATCH（f4 口径 dist.integrity + unpackedSize）。
- 四件套交叉（build/typecheck/lint/test 0 错）+ **0.1.40 增量命令单测 0 FAIL**（W1/W2/W3 触及的命令表单测，已核无测试断言这 5 删命令 → 零 regress 面）。

---

## rerun-bdf2baa 定因记录（0.1.40 gate 执行，2026-10-08 06:18–06:36，GATE-PASS）

**gate 全绿收口**（被测体 = worktree-0.1.40-slash @ bdf2baa，基线 9f8df7f = tag v0.1.39）：
- **cmd 源级 → `SC-20261008-061914-zwb` GATE-PASS（27 探针）**：20 删项双层离场 / W3 3 翻项（files·tag 生产 + version dev 门）/ voice 保留 / **E-1P 9 项登记在场**（落码实态 9 项含 privacy-settings，设计备料按工单 8 项 → 判据按落码 9 名断言）/ **engine 侧残留面 2 探针**（statuslineSetup.ts 已删 + TUI 侧 builtInAgents 零引用 + engine 侧仅 2 注释行残留）
- **StatusLine 双面 → `SC-20261008-062030-1ab` 双 PASS**（默认面 ⚡+⌂ 在场 / 配置面 5→1 消费）
- **/help → r6 `SC-20261008-063402-lo6` PASS**（r5 假红收敛：files/tag 快照过早 2 项，settle + 完整锚后全绿；渲染集 50 标签 = W3 回现 + 21 项零残留 + 完整锚）
- **四件套 e2e 独立复跑**：tsc 0 · eslint 0e·0w · build 3848 modules/17.58MB · 全量 **3789/0·271**（与 f4 报值精确一致）
- **0.1.41 封口版面（零码）同 gate 顺跑全绿**（登记面 = cmd-e1p-registered + /help 零增减 = help 四判据）
- 报告 `user-e2e/reports/r-20261008-0140-gate.md`；verdict 单信号回 Main（→ cherry-pick 合 master + 0.1.40 常设发布序列）

**探针侧定因链（5 项全探针侧，0 产品缺口；探针已修全 transpile clean）**：
1. **E-1P 泛 marker 误配（cmd r1 假红）**：「前向缝登记」文件内 6 处（§8.74.29 ×5 在前）indexOf 首现窗不覆盖 E-1P 块 → 专属头锚「E-1P 9 项零码登记」
2. **/help 旧哨兵幻影串（r1 假 INC）**：「Browse default commands」本版不存在（tab 头 = general/commands/custom-commands）
3. **SGR 帧形 × 剥净流管线错位（r2/r4 假 INC ×2）**：`Pty.text()` = `stripAnsi(pty.log)`，探针 sinceText() 所见 = 剥净流（列表行塌缩「/label␣␣desc␣␣」空格表）→ 哨兵 + labelPresent 改 `/<label>\s{2,}` 列偏移判据
4. **/help boot 期输入吞（r3 面未达）**：无 REPL 就绪门 → 三段门（footer ⚡ 就绪 → custom-commands 屏开〔旧「AtlasCode v」与 banner 撞车〕→ 键序）
5. **列表快照过早（r5 假红 2 + 缺席假绿风险）**：哨兵首命中即快照（45 行未完）→ settle 3s + 完整锚 `Space to cancel`（缺席 = 四判据全 INCONCLUSIVE）

**gate 重开判据（若 Main 侧 bdf2baa 后有增量提交）**：增量面重跑 `--all`（cmd 秒级 + 3 PTY 场景）；判据面零改动（5 项修复 + 完整锚为终态）。
**生产 lane 判据（0.1.40 发布 commit 出后）**：发布 commit worktree `--all` 回放 + 生产 install 面（`--cmd` + /help）+ banner v0.1.40 + npm SRI 三方 MATCH + 增量命令单测交叉（见报告末段）。

---

## prodlane-040 lane + 0.1.41 封口 gate 执行记录（2026-10-08 07:26–07:4x）

- **0.1.40 生产 lane @ d5c6608（= tag v0.1.40，worktree prodlane-040）= PASS**（`SC-20261008-072740-f3d`：cmd 27/27 + StatusLine 双面 + /help 零增减 21 项零残留 + 完整锚；增量命令单测族 130/0·8 文件；四件套交叉 = gate 值 3789/0·271 在案）。**npm 面（SRI/install 面/banner v0.1.40）= deferred 定因项**（npm publish 待用户动作，Main 裁定不 gate lane，落盘后回放）。报告 `r-20261008-prodlane-040.md`。
- **0.1.41 封口版 gate @ 05103c2（worktree-0.1.41-seal，基线 d5c6608，1 file 9+/3- 纯注释）**：探针 `slashslim-041.ts`（0.1.40 探针复制 + E-1P 面 9→10 项：头锚「E-1P 10 项零码登记」+ 10 名全命名〔#10=advisor〕+ #10 三重 1P 门论证〔server_tool_use〕+ O-adv-1 观察项登记；600 字窗实测全覆盖）→ ① 登记面 `SC-20261008-072654-ha5` GATE-PASS 27/27（0.1.40 波全回归同绿 = 命令集源级零增减）② /help 零增减 `SC-20261008-073045-j2s` PASS ③ 四件套独立复跑（tsc 0 · eslint 0 · build 3848/17.58MB 精确；全量 = 3789/0·271 期望）。报告 `r-20261008-gate-041.md`。
- **探针调用约定定因 2 项（探针侧，0 产品缺口）**：① PTY 场景 `--repo` 必须绝对路径（launch cwd = sandbox ws，相对路径 module not found → lane r1 FATAL 定因）② 模式参 = bare 名（`help` 非 `--help`；落回默认 cmd 无损失）。

---

## 0.1.42 gate 执行记录（2026-10-08 16:0x–16:2x，GATE-PASS）

- **被测体 = master @ 7806035（bump 前，e2e 专用 gate worktree `worktrees/gate-042`，基线 9564e63 = v0.1.41 release）**；波内提交 `b25b1d7` W-B（main.tsx 8+/34−，--advisor 双重死 flag 4 落点裁除）+ `7806035` E-1P#11（commands.ts 11+/4−，前向缝 10→11 项登记）。
- **探针 `slashslim-042.ts` = 041 探针扩展**：E-1P 面 10→11 项（头锚「E-1P 11 项零码登记」+ 11 名全命名〔+fast/fastMode〕+ #11 选项 A 裁定 + O-adv-1 执行注「0.1.42 W-B 裁除」，**900 字窗**实测覆盖〔600/700 缺 fast/fastMode〕）+ 新判据 `cmd-advisor-flag-removed`（main.tsx 0 活动 addOption/option('--advisor') 行 + advisor import 裁除，残留仅 2 注释行）+ `cmd-fast-role-unchanged`（ATLAS_FAST_MODEL @ managedEnvConstants + model.ts 解析链 + modelRoles schema 源级锚）+ 新场景 `model`（/model 选择器 Fast 行 = 三角色池合并行「Fast」label + 「快速」CN 描述，控制行 Default (recommended)）+ 新场景 `flag-advisor`（`bun run cli.ts --advisor x` 非 PTY 短命 spawn → exit=1 + unknown option 拒 = 裁前同拒法；超时〔TUI 起〕= FAIL）+ `help-set-identity-041`（50 标签集 = 0.1.41 权威集 SC-…-073045-j2s 双向 diff ∅，提取法同 gate-041 先例）。
- **执行实况（Main 单信号触发，verify 四件套在案全绿后开跑）**：cmd 31/31（`SC-20261008-160257-tgq`，含 0.1.40/0.1.41 波 27 探针零增减回归）· statusline 双面 2/2（`SC-20261008-160420-phn`）· help 集恒等 5/5（`SC-20261008-160503-uxp`，双向 diff ∅ 缺 0/多 0）· model+flag-advisor 3/3（`SC-20261008-160600-z2f`，Fast 行在场 + --advisor exit=1 unknown option 拒）= **0 FAIL / 0 INCONCLUSIVE**。
- **四件套独立复跑 = 3789/0·271 精确**（tsc 0 · eslint src/ 0e·0w · build 3848 modules 17.58MB · 全量 FORCE_COLOR=1 9791 expect 357.79s SUITE_EXIT=0 = Main verify 值交叉）；增量单测交叉 5 文件族 35/0·59 expect。
- **探针侧定因 2 项（0 产品缺口）**：① 场景参 bare 名约定误触 1 次（`--statusline-default` 旗号参未匹配 filter → 缺省回 cmd 重跑 `-160320-esm` 无损失；0.1.41 先例同型）② 探针 detail 模板字面量嵌套反引号转译修 1 处（bun build clean）。
- **观察项备案（Main 提示，不入 gate）**：tests 桶裸跑 eslint 5 unused-vars（exit-reason-log / modelprovider-llm-timeout，基线 9564e63 既有非本波引入；官方门 = `eslint src/` 零错在案）。
- 报告 `user-e2e/reports/r-20261008-gate-042.md`（全局特性列表视图 A–H）；GATE-PASS 单信号已回 Main（→ 0.1.42 常设发布序列；lane = 按需非阻塞观察项）。

---

## 定因登记（INCONCLUSIVE 面，非产品缺口）

- **/help 面**：tall 窗 + commands tab 切换后，若「Browse default commands:」标题未现（tab 切换未生效 / Select 窗口未达 / REPL 未进 /help）→ INCONCLUSIVE（定因：commands tab 未渲染，核 pty.log），**非 FAIL**（命令表 verdict 由 `cmd` 源级 + W1/W2/W3 落码承载，/help 仅用户面 corroboration）。tall 窗（`ATLAS_E2E_ROWS=360` → `visibleCount ≈ 85`）确保命令总数（~60）全量一屏 → 缺席断言有效（late-alphabet 命令如 version/output-style 不 below-fold）。
- **StatusLine 面**：footer 未捕获 / REPL 未就绪（`⚡` 缺失）→ INCONCLUSIVE（定因：footer 未渲染，核 pty.log）。
- **源级面**：命令文件在场但 `isEnabled` 字面非 `() => true`（Main 落码口径差异）→ 记 **WARN**（非 FAIL，交 Main 核 W3 落码口径），因 W3 判据 = 生产面可见（`isEnabled: () => true`）。
