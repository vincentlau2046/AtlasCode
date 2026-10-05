# TUI 优化专项进展调研（2026-10-04）

> 只读调研。所有结论均跟到一手来源（提交 SHA / 文件路径 / 验收单路径）。
> 调研时间：2026-10-04；仓库 HEAD = `d4341a1`（master，0.1.21 之上含 2 个 P1a R1 修复）。

---

## (a) 专项目标与范围

**目标**（`docs/tui-differentiation-spec.md` §0/§1，工作树 v3 版）：把 TUI 从「Claude Code 复刻」升级为**可操控的信任台（Steerable Trust）**——核心是「信任线」：状态栏一眼看懂 **谁在答 / 为什么放行 / 上下文还差多少**，每项 ≤1 键可拨；其余组件保持现有质量不动（「一处大胆，其余克制」）。

**阶段划分**（spec §4，工作树 v3；**注意 v3 尚未提交，git 里只有 v2**，见 §(f)）：

| 阶段 | 内容 | 版本落点 |
|---|---|---|
| P0a | 可解释审批一等公民（审批卡默认可见 verdict 一行，零新数据） | 0.1.19 |
| P0b | 两个后端新信号（水平回退可见 + autoCompact 熔断预警 + 网关不可达方向性） | 0.1.20 |
| P1a | 多页面侧抽屉（5 页 split 布局 + 键位 + `/sidebar` + 信任线直达） | 0.1.21（R1 修复待 0.1.22） |
| P1b | 计划/进度 + 工具结果/diff 可读性收口（不新造） | 未排 |
| P2 | 可重跑工具（`↻` 改参重跑） | 未排（触发器未定稿） |

**分工**（spec 头部 + `user-e2e/tui-diff/PLAN.md` §0）：Main session（`AtlasCode 架构实施Main`）唯一实施者，worktree 落地 → cherry-pick master → 四件套 gate；atlas-user-e2e session 逐阶段验收 + 终审 + 最终回归，出「阶段验收单」。

**四条红线**（spec §3）：① 主循环零触碰（`src/engine/query/`、`src/tui/utils/permissions/` 主路径零改动，验收用 `redline` git 模式核验）；② 事件/信任数据只读投影、不回写主循环；③ 键位不打仗（不抢既有键位）；④ 视觉/文案原创（不碰 Claude spinner 动词族/banner/品牌资产）。

**与背景记忆对照**：记忆「main 实施 / atlas-user-e2e 验收、基建在 user-e2e/tui-diff/」核实一致（PLAN.md §0/§1）。

---

## (b) 进展时间线（0.1.16 → 0.1.21 + 未发提交）

### 前置波（0.1.16–0.1.18，TUI 相关部分）

| 版本 | 提交 | 内容 | 状态 |
|---|---|---|---|
| 0.1.16（10-03 15:28, `057c2e1`） | `a2a11be` #260 主循环 LLM 超时 120s→600s + settings `llmTimeoutMs` 档；`f54b250` #261 SkillTool 两车道 `getProjectRoot()`→`process.cwd()`（#259 G2 验收缺口，P1b S-F 的修复前置）；`1f0c870` TUI 差异化 spec **v2** 落仓 | 已发布 |
| 0.1.17（10-03 23:21, `20039dd`） | `#262` loop-robustness 三缺口（headless 崩溃兜底 / 回合级有界恢复 / llmTimeoutMs 死键活态读） | 已发布（非 TUI 专项，P0b 排期前置） |
| 0.1.18（10-04 01:49, `40668c1`） | config-skill-automode 工单四子决策：A1 fast 进 AUTO_MODE_ROLES（`f69399e`）/ B 配置命令 busy 态立即生效（`7083a10`）/ C 插件交互安装轻量自动激活（`ff910bd`）/ A2 权限弹框第 4 选项 = auto mode（`51839d6`） | 已发布（工单收口，见 §(e)） |

### P0a → 0.1.19（10-04）

- **实施**：`88fb3ae`（verdict 一行纯面 `permissionVerdict.ts` 三态）→ `f2509af`（ask 面弹框默认可见）→ `adf1b38`（allow 面成功卡 verdict + 用户批准标记 `userApprovals.ts`）→ `0b586d7`（第 4 轮 cardAllow 根因：`successCardRenderMode` 三态，无结果渲染器工具的批准标记行存活）。
- **验收**（`user-e2e/tui-diff/artifacts/P0a-*`）：pre-landing 基线 `P0-1791012837723-6whv`（10-03，v0.1.16 banner，硬探针预期红）+ redline×2（`redline-1791012254650`/`781587`，v0.1.15..HEAD 零违反）。正式 5 轮迭代：`8nyq`(10:27) FAIL×4 → `9xlu`(10:53) FAIL×3 → `56me`(11:01) FAIL×3 → `dwwr`(11:34) FAIL×2 → **`9de6`(12:01) PASS（判定区勾选「通过」，0.1.18 banner）**；生产 lane `m2yq`(16:03, 0.1.19 banner) PASS。
- **发布**：`704c46e` 10-04 15:34，版本 0.1.19（CHANGELOG v0.1.19 段：四件套绿 tsc 0 / lint 0 / build 17.55MB / 全量 3411 pass）。
- 验收结论：**P0a 0.1.19 PASS（5 轮 + 生产 lane）**——与背景记忆一致（来源：`PLAN.md.tmp` §7、各 ticket.md）。遗留：`P0-3-deny`（需 deny fixture）与 `P0-1a-fallback`（回退难强制触发）两轮均 INCONCLUSIVE（`9de6/ticket.md` 探针措辞记录）。

### P0b → 0.1.20（10-04）

- **实施**（17:22 三连提交）：`8451cbb` ① `queryWithRoleFallback` 成功侧加性字段 `servedRole`/`fallbackUsed` + `roleFallbackStore` + 信任线「已从 X 回退到 Y」；`baeb81e` ② autoCompact 熔断预警接 statusline（「将自动压缩，可 /rewind 回退」）；`419a001` ③ 网关不可达方向性（「IFF 不可达：已切人工确认 —— /doctor 排查」，纯 leaf `gatewayUnreachableRemediationHint`，`src/modelprovider` 导出、`REPL.tsx` 消费）。
- **验收**：基线 `P0b-…-o8n3`/`cf7e`（S-C，BASELINE-EXPECTED-RED）→ **`kbin`(18:11) PASS + `bck5`(18:16) PASS**（S-B 熔断 + S-C 网关 hard×3 全绿；`kbin/ticket.md` 判定区勾选「通过」，记录「预对齐只读 grep、零措辞调整，一轮通过」）。
- **发布**：`c9e1612` 10-04 17:22，版本 0.1.20。
- 验收结论：**P0b 0.1.20 PASS（一轮 + 生产 lane）**——与背景记忆一致。

### P1a + #272 → 0.1.21（10-04，R1 修复未含）

- **实施**：`646698c`（19:51）P1a 多页面侧抽屉（25 文件 +1171 行，5 页 split 布局 + 键位 + `/sidebar` + 信任线直达 + 29 例单测）；`b66a88d`（19:51）#272 LLM 出站 UA 品牌串（`src/shared/identity.ts` `buildUserAgent` 接 modelprovider 两处 `new OpenAI`，工单 `docs/2026-10-04-http-useragent-fix.md` 收口）。
- **发布**：`00642a0` 10-04 20:17，版本 0.1.21。
- **验收 3-round**（`artifacts/P1a-*`）：
  - `zytb`(18:23) 骨架预演 INCONCLUSIVE（pre-landing，hard 2 INCONCLUSIVE）。
  - `y79n`(19:58) 首轮正式 PASS——**后被证明假阳性**（探针宽松命中非侧栏文案）。
  - 探针收紧（sideOpen 收紧为 tab 行编号序列；diffSbs 收紧为实际渲染标志）→ `u47p`(20:08)/`4r0z`(20:16)/`ls1b`(20:22) 三轮 FAIL。**R1 打回**（`ls1b/ticket.md` 缺陷单，勾选「缺陷」）：
    - 缺陷 1（P1，产品缺陷）：`/sidebar` 命令未注册（`src/tui/commands/sidebar/` 存在但 `commands.ts` 主注册表未 import）→ `Unknown skill: sidebar`。
    - 缺陷 2（P1）：ctrl+shift+d 不切 side-by-side。Main 白盒三层结论：① FAIL 直接因 = **探针假阴**（setupWs 只 `git init` 无 commit → 工作树 diff 空 → Diff 页空态，切档成功探针也 miss）；② 真产品缺陷 = CSI-u（Kitty 协议）误用 XTerm 1-based modifier 解码，0-based 位掩码下 shift 静默丢失（kitty 终端 Ctrl+Shift+D 发 `\x1b[100;5u`，旧码解成 ctrl-only）；③ 可观测性：Diff 页空态标当前档。
  - Main 修（worktree 分支 `worktree-p1a-sidebar`：`a907136` ① + `e8b9165` ②③）+ harness 修 3 处（setupWs 加 initial commit、ctrl+shift+d 改 xterm `\x1b[27;6;100~`、diffSbs 探针加空态证据）→ **R2 `gwkc`(20:48) PASS**（`gwkc/ticket.md` 判定区勾选「通过」，缺陷单注明「R1 两缺陷 Main 已修」，⇄双列 18 cell 真实渲染核验）。
- **⚠️ R1 修复未进 0.1.21**：0.1.21 发布（20:17）早于修复落地；cherry-pick 到 master 的 `27df1ed`（/sidebar 注册，21:24）+ `d4341a1`（CSI-u 0-based + Diff 空态，21:24）位于 `00642a0` 之上，**未进任何发布版本**（`package.json` = 0.1.21；CHANGELOG 无 0.1.22 条目；`PLAN.md.tmp` 明确「npm 0.1.21 已发含缺陷版 → Main 补发 0.1.22 → 待生产 lane 回归」）。

### 关联工单状态（`docs/2026-10-04-*.md`）

| 工单 | 状态 | 一手来源 |
|---|---|---|
| `2026-10-04-config-skill-automode-implement.md` | **已收口**：A1/B/C/A2 四子决策全进 0.1.18（CHANGELOG v0.1.18 段逐条对应）；文末「回归判别方案」由分析侧承接（探针脚本 `user-e2e/repro-auto-mode.ts`、`repro-immediate.ts`、`repro-slash-model.ts` 等现存于 master 工作树，未跟踪） | `40668c1` + CHANGELOG |
| `2026-10-04-http-useragent-fix.md` | **已收口**：#272 进 0.1.21（`b66a88d`）。工单内「注：本地 version 现为 0.1.19」为立单时快照，现版本 0.1.21 | `b66a88d` commit message 引工单 |
| `2026-10-04-permission-gaps.md`（#263/#264） | **待排期，未修**：#263 TUI 车道 BashTool `checkPermissions` 恒-allow stub——master `src/tui/tools/BashTool/BashTool.ts:107-109` 仍为 `return { behavior: 'allow' }`（本次调研 grep 复核）；#264 `isReadOnlyCommand` 未挡 `>` 重定向。文件自述「排期建议：TUI 差异化专项收口后，随工具本体波 / engine 只读判定波一并修；修完回填本文件『已修 commit』」 | 文件头「状态：待排期」+ 代码复核 |

### 版本落点核对（哪些已进版本 / 还挂着）

- 已进版本：#260、#261（0.1.16）；#262（0.1.17）；config-skill-automode（0.1.18）；P0a（0.1.19）；P0b（0.1.20）；P1a 原始版 + #272（0.1.21）。
- **挂着**：P1a R1 两修复（`27df1ed`/`d4341a1`，master 未发）→ 0.1.22；P1b、P2 未实施；#263/#264 未修。

---

## (c) tui-diff 验收基建说明

**入口**：`user-e2e/tui-diff/accept.ts`（499 行）+ 计划 `user-e2e/tui-diff/PLAN.md`（131 行，工作树另有未落盘的 `PLAN.md.tmp.*` 更新版）。

- **跑法**（PLAN.md §1）：
  ```bash
  bun run user-e2e/tui-diff/accept.ts P0a --repo <worktree|仓路径>   # 审批内联 verdict
  bun run user-e2e/tui-diff/accept.ts P0b --repo <…>                  # 回退信号+熔断+网关
  bun run user-e2e/tui-diff/accept.ts P1a --repo <…>                 # 多页面侧栏（S-H）
  bun run user-e2e/tui-diff/accept.ts P0 --baseline                   # pre-landing 基线（硬探针全红=预期）
  bun run user-e2e/tui-diff/accept.ts redline --base <sha> --tip <sha> # 红线 1 纯 git 核验
  ```
  需本地网关 127.0.0.1:8999（S-C 死端口场景除外）；`--repo` 指向 Main 的 worktree，`user-e2e/lib` 恒取 master 副本。
- **测什么**：PTY 黑盒驱动 TUI（`user-e2e/lib/pty`）+ 语义探针（`accept.ts` 顶部 `P` 表集中可配的正则族）+ 场景矩阵 S-A…S-H（sandbox HOME + 一次性 workspace，全部 I/O 落 `user-e2e/tui-diff/`，真实 `~/.atlas` 零写入）。模型对齐 `deepseek-v4-pro`（隔离渲染层）；S-C 用死端口 `127.0.0.1:9`。侧栏键位经 `TUI_DIFF_SIDEBAR_OPEN`/`TUI_DIFF_SIDEBAR_SBS`（hex）注入，未注入 → 探针 INCONCLUSIVE 而非 FAIL。
- **判定口径**：`hard` 探针全 PASS → 阶段通过；任一 hard FAIL → 缺陷单（3-round 形态）打回 Main；`soft` 触发未达 = INCONCLUSIVE（不误判）；`absent` 型探针断言归零（如 `Unknown skill`）。探针 miss ≠ 产品缺陷——先改 `P` 表关键词对齐再重跑，并在验收单「探针措辞对齐记录」注明（P1a R1 的假阳性收紧即此流程，见 `ls1b`/`gwkc` ticket）。
- **报告格式**：每 run 落 `user-e2e/tui-diff/artifacts/<phase>-<ts>/`：`result.json`（verdict 三态 PASS/FAIL/INCONCLUSIVE + 各探针 ok/evidence 截留）+ `ticket.md`（阶段验收单：探针判定表 + 判定区「通过/缺陷/打回」由验收者手填 + 缺陷单 + 探针措辞对齐记录）+ 各场景 `S-X.log`/`.stderr` 原始 PTY 日志。红线 1 用 `git diff --name-only base..tip ∩ {src/engine/query/, src/tui/utils/permissions/}` 核验。
- **现状**：整个 `user-e2e/tui-diff/` 目录 **git 未跟踪**（`git status: ?? user-e2e/tui-diff/`），验收基建只存在于 master 工作树，尚未入库。

---

## (d) TUI 功能清单（master 当前，中等深度）

**P1a 多页面侧抽屉**（`646698c` + R1 修复 `27df1ed`/`d4341a1`）：
- 5 页：`1 Diff / 2 Plan / 3 Activity / 4 Decisions / 5 Budget`；消息流旁 **40% 定宽 split**（`SidePanel.tsx:28` `width="40%"`，不覆盖消息流；关闭返回 null 布局零变化）。
- 键位（`defaultBindings.ts:346-358`，`SidePanel` context，抽屉关闭时 handler `return false` 透传、既有键位零改动）：`1–5` 开对应页、`←/→` 循环切页（wrap）、`Esc` 关、`ctrl+shift+d` 仅 Diff 页切 unified ↔ side-by-side（双列 `SideBySideDiff.tsx` 为纯新增渲染）。
- 命令：`/sidebar [page]`（空/无效参数回落 Diff 页）——命令文件 `src/tui/commands/sidebar/`，主注册表 import + 注册由 `27df1ed` 补齐。
- 数据面全只读投影（红线 2）：Diff = `useDiffData`（git 工作树 diff）；Plan = `getPlan`+任务清单；Activity = 消息流 tool_use/tool_result 末 12 条（`projectActivity.ts`）；Decisions = 新增 ring buffer `decisionLog.ts`（cap 50，`useCanUseTool` 判定点**加性**记录，engine 主循环零改动）；Budget = 模型角色 + 上下文余量 + 会话累计。
- 信任线直达（门禁③）：`RoleFallbackSegment`「· 5 谁在答」/ `AutoCompactWarningSegment`「· 5 还剩」→ tab 键 5（`646698c` 内 StatusLine segments 改动）。
- 关键文件：`src/tui/components/SidePanel/{SidePanel.tsx, SidePanelKeybindings.tsx, sidePanelHandlers.ts, store.ts, types.ts, pages/*}`、`src/tui/utils/decisionLog.ts`、`src/tui/screens/REPL.tsx`（split 装配）。
- R1 修复面：`d4341a1` 修 `parse-keypress` 的 CSI-u 解码（新增 `decodeKittyModifier` 0-based 位掩码；modifyOtherKeys 保持 1-based）+ Diff 页 clean-tree 空态标当前档 + 9 例单测 `tests/unit/sidepanel-sbs-keychain.test.ts`。

**P0a 可解释审批**（0.1.19）：`src/tui/components/permissions/permissionVerdict.ts`（`PermissionDecisionReason` 判别联合只读投影，verdict 三态：rule 命中 / classifier says / mode asks）；ask 面弹框默认可见（Bash/PowerShell）；allow 面成功卡 verdict + 用户批准标记（`src/tui/utils/userApprovals.ts`，`✓ Allowed · your decision` / `Allowed by auto mode classifier: <reason>`）；数值置信度不出现（真实 shape 无此字段）。

**P0b 信任线新信号**（0.1.20）：`src/modelprovider/roleFallbackStore.ts` + `queryWithRoleFallback` 加性字段 `servedRole`/`fallbackUsed` → `StatusLine/segments/RoleFallbackSegment.tsx`「已从 X 回退到 Y」（warning 黄）；`AutoCompactWarningSegment.tsx` 熔断预警「将自动压缩，可 /rewind 回退」；`gatewayUnreachableRemediationHint`（modelprovider 导出、`REPL.tsx` 错误行消费）「IFF 不可达：已切人工确认 —— /doctor 排查」。

**#272 UA 品牌串**（0.1.21）：`src/shared/identity.ts`（`buildUserAgent` = `AtlasCode/<v> (+repo)`，`getVersion` 沿 `process.argv[1]` 上行走读 package.json）+ modelprovider 两处 `new OpenAI` 加 `defaultHeaders` User-Agent（`src/modelprovider/clients.ts` / `modelprovider.ts` verifyKey）。

**0.1.18 配套 TUI 面**（config-skill-automode 工单）：auto mode 三角色全开放（`modelAllowlist.ts`）、local-jsx 命令 busy 态立即生效（`immediate ?? true` + 删 growthbook 死 stub）、插件交互安装轻量自动激活（`refreshActivePluginsLightweight` 数据面 swap）、权限弹框第 4 选项 auto mode（`autoModePermissionOption.ts`，re-dispatch 当前 pending 请求）。

---

## (e) 待办 / 风险 / 下一步候选

| # | 事项 | 状态 | 阻塞点 / 下一步 | 来源 |
|---|---|---|---|---|
| 1 | **0.1.22 补发（P1a R1 修复）** | 代码就绪未发：`27df1ed`+`d4341a1` 已在 master（0.1.21 之上）；`package.json`=0.1.21，CHANGELOG 无 0.1.22 条目，docs/ 无 0.1.22 工单 | Main 执行：版本 bump + 发布（PLAN.tmp 称「cherry-pick a907136+e8b9165，授权面用户既有授权」——实际 cherry-pick 已做，剩发布动作）+ 发布后 P1a 生产 lane 回归 | `PLAN.md.tmp` §7；`gwkc/ticket.md` |
| 2 | P1a 3 项人工核（Esc 关 / split 不覆盖 / 信任线直达） | R2 日志已目验（`gwkc` ticket 注明），但未走正式生产 lane | 随 #1 生产 lane 回归正式勾销 | `gwkc/ticket.md` |
| 3 | **P1b**（S-D 计划可见 / S-E diff 可读 / S-F 非 git 项目 skill，#261 已修 `f54b250` 待 S-F 验） | 未执行 | 排 P1a 收口后跑 `accept.ts P1` | `PLAN.md` §3/§7 |
| 4 | **P2 可重跑工具**（S-G） | 未实施，触发键/命令（`TUI_DIFF_RERUN_TRIGGER`）待 Main 定稿 | spec §4 P2 | `accept.ts` P 表注释 |
| 5 | **#263 TUI 车道 Bash checkPermissions 恒-allow / #264 `>` 重定向误判只读** | 待排期、未修（master 复核：stub 仍在 `BashTool.ts:107-109`） | 工单自述「TUI 差异化专项收口后，随工具本体波 / engine 只读判定波一并修；修完回填『已修 commit』」——真实权限缺口，TUI 车道 default 模式 Bash 悬空 | `docs/2026-10-04-permission-gaps.md` |
| 6 | config-skill-automode 回归判别（分析侧承接） | 代码已进 0.1.18；探针脚本（`repro-auto-mode.ts` 等）未跟踪、未见执行记录 | 分析侧跑探针闭环 | 工单「回归判别方案」节 |
| 7 | #272 §3 壳 UA 归一（消版本读/品牌串三处复制） | 工单自述「非本轮必需，可后续」，未做 | 后续去漂移波 | `docs/2026-10-04-http-useragent-fix.md` §3 |
| 8 | spec v3 未提交 + tui-diff 基建未跟踪 | `docs/tui-differentiation-spec.md` 工作树 M（v2→v3 diff 大），`user-e2e/tui-diff/` 整目录 untracked，另有 `PLAN.md.tmp.*` 编辑残留 | 提交入库（含 PLAN.md 更新版合并） | `git status` |
| 9 | 终审（spec §5：三问 ≤1 键 / 视觉原创 / 全量回归零新增 P0 / 一处大胆） | 未开始，前置 = P0–P2 全过 | 依赖 #1–#4 | spec §5 |
| 10 | INCONCLUSIVE 遗留：`P0-3-deny`（需 deny fixture）、`P0-1a-fallback`（回退发生难强制触发） | 两轮验收单均注「待补触发方式」 | 终审/回归时用故障注入或 fixture 补 | `9de6`/`kbin` ticket 探针记录 |

---

## (f) 开放问题

1. **0.1.22 的范围**：只含 R1 两修复，还是顺带 P1b/P2 之外的其他挂起项？仓库内无任何 0.1.22 工单/条目可查。
2. **`P0-1a-fallback`（回退发生可见）如何强制触发**：基线难触发（需 primary 失败 + fallback 成功实际发生），终审时是否用故障注入（loop-robustness 基建 `user-e2e/loop-robustness/fault-proxy.ts` 可复用）覆盖？
3. **spec v3 与验收判据的一致性风险**：v3（真实数据 shape 逐字 pin、P0 拆 a/b、P1a 侧栏）只在未提交的工作树里；git 里的 spec 还是 v2。若后续以 git 版 spec 对照，会出现判据漂移。
4. **P0a 生产 lane ticket（`m2yq`）判定区未填**：`result.json` PASS 但 ticket.md「通过/缺陷/打回」未勾选——正式收口记录缺一笔（P0b `bck5` 同样未填，仅 `kbin` 填了「通过」）。
5. **#263/#264 与 TUI 专项的耦合**：#263 是 P0a 验收逼出的 engine/tui 快路径缺口（「非 P0a 自身缺陷」），但修它在 P0a 零边界红线目录之外；排期归 Main 哪个波、是否阻塞终审「全量回归零新增 P0」，工单未明说。
6. **npm 发布面**：仓库内 CHANGELOG 自 0.1.18 起不再写「npm @atlasharness/atlascode@0.1.x」行；0.1.19–0.1.21 的 npm 发布只能以外部 npm registry 为准（背景记忆称 npm latest=0.1.21 已独立复验 PASS，本调研无法从仓库核实）。

---

## (g) 0.1.22–0.1.24 收口增量（2026-10-05 补记）

| 版本 | 内容 | 收口态 |
|---|---|---|
| 0.1.22 | P1a R1 双修复（`27df1ed` /sidebar 注册 + `d4341a1` kitty 0-based 解码 + Diff 空态标档）发布 `8a21a63` | ⚠️ 含 P0a 回归（1-5 抢弹框数字选）→ 开 0.1.23 |
| 0.1.23 | P0a 回归修「双 cede」（`0f8de6b`，后随 0.1.24 C 波删除）+ #271 #4/#5（`95a0670`/`ea45461`）；发布 `af9f4c2`，gate 全绿 + 生产 lane 全绿 | ✅ 收口 |
| 0.1.24 | **用户面重裁定波**：A P0a 审批行为修复（A1 always session 域生效 / A2 No 不退出 / A3 automode 确认门 / A4 why 句式全英文真字段 / A5 标签三态）+ B P0b 持续监控（B1 回退 ↦fast 折 model 段 / B2 熔断折 context-bar 色阶 / B3 砍）+ C P1a 全量回退（抽屉 19 文件+3 接线删净，留 useDiffData/kitty 解码/decisionLog）。8 提交，发布 `6be29bd` + tag v0.1.24 + packument 验真 | ✅ 收口（gate 31 探针 0 FAIL + 生产 lane 6 项全绿） |
| 0.1.25 | **#265 = #263+#264 修（收口波）**：S1 `>` 输出重定向只读守卫 + S2 TUI BashTool `checkPermissions` 委托 engine 模式门控（堵 default 模式 Bash 恒-allow stub 安全洞）。发布 `837f72f` + tag v0.1.25 + npm latest 验真（shasum `46d216…`） | ✅ 收口（A4F 重验确认静默放行洞已堵：no-rule `touch`/`rm -rf` default 模式现弹框 + Esc 拒绝） |
| 0.1.26 | **P0 A4 可解释审批全可达（#278，P0 改进波）**：A4-mode P0 修（`decisionReason` 透传，default 无规则 Bash 弹框 verdict 行断裂真缺陷）+ allow-face verdict 行（成功卡补 rule-allow/bypass/classifier-approved 三 allow 句）+ R1 skip 早退门（`hasSuccessCardMarker` 纯面）+ R2 数据侧（engine gate 快路径 `setAllowVerdict`，判定逻辑零改动）+ `BASH_CLASSIFIER` no-op 根因文档（flip 无效=ANT-ONLY stub，真链=TRANSCRIPT_CLASSIFIER+auto+live model）。5 提交，gate = e2e A4F R2 复跑 PASS（3-round：R1 渲染面修对但非根因 → R2 数据侧命中）+ f4 git 现场核验，发布 `89efabc` + tag v0.1.26 + npm latest 验真（shasum `ab2467996851…`） | ⏳ 发布收口中（**生产 lane 回归 in-flight**，worktree-278 保留至验真） |

- 用户面裁定依据（2026-10-05 用户）：抽屉「完全不可用」（割裂圆角灰框/初始页死板/40% 定宽不适配 TUI）+ P0 信任线可发现性=0 → 回退回干净基线（消息流 + /diff + statusline 持续监控），P1a v2 挂起重议；验收补「用户面走查层」补行为探针盲区。
- 残留：#263/#264 权限缺口（专项收口波）/ 12 INCONCLUSIVE 终审 / `PermissionRuleExplanation.tsx` 旧措辞（P1a-v2 候选）。
- 判据事实源：`docs/2026-10-04-tui-program-plan.md` §4b（0.1.24 列车）+ `docs/tui-differentiation-spec.md` v4。

## (h) 0.1.25–0.1.26 收口增量（2026-10-05 补记）

- **P0 封口时序（用户裁定链，2026-10-05 逐次递进）**：① Option 2（等 0.1.25 重验转绿再封）→ A4F 重验 FAIL 暴露 A4-mode P0 + A4×4 结构不可达 → ②「强修 4 句再封」开 0.1.26 波 → ③ Main 白盒实证 classifier 2 句（危险 flag/自动放行）live-model 依赖 PTY 不可强制 → **终裁 Option B = 守全 6 句 e2e 绿判据 → P0 暂封不了，封口推迟到 live-gateway 分类器 e2e 波**（跨 loop-robustness/fault-proxy 基建 + LLM 非确定；version TBD，待用户排期）。**0.1.26 = P0 改进波（4/6 A4 句 e2e 可达）独立发布，非封口**。
- **0.1.26 gate 3-round 轨迹**：R0（a4rallow/a4bypass 0 命中，allow 面未接线）→ R1 渲染早退门修（`29316c7`）复跑仍红 → **R2 数据侧根因**（auto-allow 被 engine gate 快路径短路 → allowVerdicts 恒空，`c1c3b46` 加性修：GateVerdict `decisionReason?` + permissionGate allow 支附字段〔判定体零触碰〕+ 桥 guard 式 setAllowVerdict）→ e2e A4F R2 复跑 PASS（artifact `A4F-1791202099591-qoyo`）。
- **协议增量（2026-10-05，用户经 f4 核实确认）**：A4F 复跑触发权 f4→Main（§2.5，单一出口仍单一：触发=Main、gate 权+判据归 f4）；npm 发布时序 = e2e 全绿闭环后 + 一 wave 一版（§2.4）；回合内 npm 免用户逐次授权（Main 直接发，classifier 安全纪律不变）。peer 转述的用户裁定一律经 f4 向用户核实后才落协议。

---

## 附：关键一手来源索引

- Spec：`docs/tui-differentiation-spec.md`（工作树 v3；git 版 = `1f0c870` v2）
- 验收计划/基建：`user-e2e/tui-diff/PLAN.md`（+ 未落盘 `PLAN.md.tmp.1843197.80f28167c693`）、`user-e2e/tui-diff/accept.ts`
- 验收记录：`user-e2e/tui-diff/artifacts/{P0-…-6whv, redline-*, P0a-*×6, P0b-*×4, P1a-*×6}/ticket.md + result.json`
- 提交：`057c2e1`(0.1.16) / `20039dd`(0.1.17) / `40668c1`(0.1.18) / `704c46e`(0.1.19) / `c9e1612`(0.1.20) / `00642a0`(0.1.21) / `27df1ed` / `d4341a1`（未发）；worktree 分支 `worktree-p1a-sidebar`（`8aed926`/`a907136`/`e8b9165`）
- 工单：`docs/2026-10-04-config-skill-automode-implement.md`（已收口 0.1.18）、`docs/2026-10-04-http-useragent-fix.md`（已收口 0.1.21）、`docs/2026-10-04-permission-gaps.md`（待排期）
- 版本：`package.json` 0.1.21；`CHANGELOG.md` 止于 v0.1.21（无 0.1.22）
