# TUI 差异化（信任线）逐阶段验收计划

> 依据：`docs/tui-differentiation-spec.md`（v3，核心 = 信任线 + P0a 可解释审批 + P1 多页面侧栏）。
> 分工：Main（`AtlasCode 架构实施Main`）实施 P0–P2；本 session（atlas-user-e2e）逐阶段验收 + 终审 + 最终回归。
> harness：`user-e2e/tui-diff/accept.ts`（PTY 黑盒 + 语义探针 + 验收单自动生成）。
> 日期：2026-10-03。

## 0. 一句话

把 TUI 从「Claude Code 复刻」升级为**可操控的信任台**：状态栏变成「信任线」，一眼看懂
**谁在答 / 为什么放行 / 上下文还差多少**，每个都能一键拨。其余组件保持现有质量不动。
验收只做「用户能不能」判定（spec §4 需求语言），不追视觉像素。

## 1. 验收执行方式

```bash
# 正式验收（P0a/P0b 落地某 worktree/分支后；需本地网关 127.0.0.1:8999）
bun run user-e2e/tui-diff/accept.ts P0a --repo <P0a所在worktree或仓路径>   # 审批内联 verdict（零新数据，先做）
bun run user-e2e/tui-diff/accept.ts P0b --repo <P0b所在worktree或仓路径>   # 回退信号 + 熔断 + 网关（排 0.1.17 后）
bun run user-e2e/tui-diff/accept.ts P0  --repo <…>                          # = P0a + P0b 全量
# pre-landing 基线（硬探针全红 = 预期，记录改前状态，harness 走线自检）
bun run user-e2e/tui-diff/accept.ts P0 --baseline
# 红线 1 核验（主循环 + permissions 主路径零改动；纯 git，无 PTY）
bun run user-e2e/tui-diff/accept.ts redline --base <P0父提交> --tip <P0提交>
```

- 每阶段产物：`user-e2e/tui-diff/artifacts/<phase>-<ts>/` 下 `result.json` + `ticket.md`（验收单骨架）+ 各场景 pty 原始日志。
- **判定口径**：`hard` 探针全 PASS → 阶段可过；任一 `hard` FAIL → 缺陷单（3-round 形态）打回 Main；
  `soft` 探针 INCONCLUSIVE（触发条件未达）不算 FAIL，验收单注明触发方式待补。
- **验收单判定区**（通过/缺陷/打回 + 缺陷单 + 探针措辞对齐记录）由验收者（本 session）填写，Main 不代填。

## 2. 探针原则（防伪阴性，承接 C2②/C3② 教训）

1. **语义关键词 + 集中可配表**：探针用语义正则族（允许中英文/大小写漂移），全部集中在 `accept.ts` 顶部 `P` 表。
   文案以 Main 落地为准；**探针 miss ≠ 产品缺陷**——先改 `P` 表关键词对齐再重跑，并在验收单「探针措辞对齐记录」注明。
2. **hard / soft 两档**：`hard` = spec 门禁必需（缺即 FAIL）；`soft` = 条件性断言（如「水平回退发生时可见」「deny 面」，
   触发条件到不了 → INCONCLUSIVE，不误判 FAIL）。
3. **全量 `sinceText()` 窗口（非末 800 字）**：TUI 重绘会把瞬态确认行推出末窗（C2② 教训），探针一律查 spawn 后全量。
4. **absent 型探针**：断言「某串归零」（如 `Unknown skill` count==0 才 PASS），用于 G2 残余收口。
5. **证据截留**：每探针存命中行（≤3 行 × 160 字）或末 5 行上下文，验收单可直接人工核，避免纯计数误判。

## 3. 门禁 → 探针映射（spec §4）

### P0a — 可解释审批一等公民（零新数据，先做）
| 门禁（spec 需求语言） | 探针 | 档 | 预期输出（文案以落地为准，先对齐关键词） |
|---|---|---|---|
| 审批卡片内联一行「为什么」（rule/classifier/mode 三态，非 debug 抽屉） | `P0-3-allow` | hard | 工具卡出现「自动放行/拦截 + 命中规则 + 分类器 reason / mode」 |
| 命中规则展示（ruleValue + source，非 r-NN） | `P0-1b-rule` | hard | 「命中 allow 规则 \<value\> from \<source\>」族 |
| verdict 三态（auto-mode reason / 命中规则 / mode） | `P0-1b-verdict` | hard | 审批面出现允许/拦截 + 分类器/规则/mode 之一 |
| 数值置信度不出现（真 shape = reason 文本） | `P0a-no-conf`（absent） | hard | 全量文本 count(0.x 置信度)==0 |
| deny 面（拦截时 why） | `P0-3-deny` | soft | 需 deny fixture 触发；skip 模式 INCONCLUSIVE |
| 回归护底：谁在答 / 换档 / 上下文% 不降级（已建段） | `P0-1a-who` / `P0-2-fast` / `P0-1c-ctx` | hard×3 | Model / Context 段照旧 |
| 主路径零改动 + 四件套绿 | `redline`（git）+ Main 四件套证据 | — | redline 模式 |

### P0b — 两后端新信号（排 0.1.17 落定 + Main 快照后；非 TUI 显示）
| 门禁 | 探针 | 档 | 预期输出 | 前置 |
|---|---|---|---|---|
| 回退发生时可见「已从 X 回退到 Y」 | `P0-1a-fallback` | soft | 需 queryWithRoleFallback 成功回退信号（现仅 onFallbackError） | Main 快照 |
| 熔断预警（达阈值前「将自动压缩 + /rewind」） | `P0-1c-fuse` | soft | 需 contextHostWiring 档位接 statusline | Main 快照 |
| 网关不可达方向性（IFF 不可达 → 人工确认 + /doctor） | `P0-5-gw` / `-manual` / `-doctor` | hard×3 | 死端口 → 方向性提示 | — |

### P1a — 多页面侧栏（split 抽屉，排 P0b 之后；side-by-side = 唯一纯新增渲染）· ⛔ 0.1.24 全量回退，本节探针退役
> **已退役（2026-10-05 用户裁定回退）**：S-H 场景 + 本节目录探针随 0.1.24 C 波回退核退役；判据改由
> `accept-024.ts`（逐项探针表 + 回退核）承接。保留如下仅作历史——回退面删净由 `C-*` 探针核，`/diff`/内联 diff 无回归由 `C-diff-no-regress` 护底。
| 门禁 | 探针 | 档 | 备注 |
|---|---|---|---|
| 任一 tab 一键开侧栏 | `P1a-open` | hard（自动） | S-H；键位待 Main 定稿，`TUI_DIFF_SIDEBAR_OPEN` 注入；未注入 → INCONCLUSIVE |
| Esc 关、消息流不被覆盖（split 同屏） | 人工核 | — | S-H；布局状态变化，验收单判定区填（PLAN §5 模式） |
| Diff 页 unified 默认可见 + side-by-side 可切无丢失 | `P1a-diff-sbs`（hard 自动）+ `P1-2-diff`（hard 护底） | hard | S-H；side-by-side 基线 grep=0（纯新增），`TUI_DIFF_SIDEBAR_SBS` 注入切档 |
| 信任线某段一键直达对应页（为什么→Decisions / 还剩→Budget） | 人工核 | — | S-H；联动落地后人工核，或后续加自动探针 |
| 页数据只读投影（回写主循环为零） | `redline`（git） | — | redline 模式 |

### P1b — 计划/进度 + 工具结果/diff 可读性收口（不新造）
| 门禁 | 探针 | 档 | 场景 |
|---|---|---|---|
| 规划期可见「目标 + 还差几步」 | `P1-1-plan` | hard | S-D |
| 工具结果/diff 默认可读（延续 G1 #258） | `P1-2-diff` | hard | S-E |
| 展开/折叠无数据丢失（ctrl+o 见 hunk） | `P1-2-expand` | hard | S-E |
| 非 git 项目 `.atlas/skills` 可发现（G2 残余 #259 验收缺口，#261 待修） | `P1-3-skill` / `P1-3-nounknown`(absent) | hard | S-F（故意不 git init） |

### P2 — 可重跑工具（核心稳定后）
| 门禁 | 探针 | 档 | 场景 |
|---|---|---|---|
| 改参重跑（新 tool_use 新地址；旧结果标「被取代」非删除） | `P2-1-superseded` | soft | S-G（触发键 `TUI_DIFF_RERUN_TRIGGER` 待 Main 定稿） |

## 4. 场景 / 会话矩阵

| 场景 | 沙箱 seed | workspace | 活网关? | 驱动回合 |
|---|---|---|---|---|
| S-A | live（三角色→iff/deepseek-v4-pro） | git init + note.txt | 是 | 非 skip（`--permission-mode default`）+ Bash 文件写入 ask-fixture → 数字 `1` 批准 → `/model fast` + 读 note 回归护底 |
| S-B | fuse（+autoCompactWindow=16k） | git init + big.txt(~60KB) | 是 | 读 big.txt（逼近阈值 → 熔断预警） |
| S-C | deadgw（IFF baseURL→127.0.0.1:9） | git init + note.txt | 否（死端口） | 读 note（快速失败 → 方向性提示） |
| S-D | live | git init（空） | 是 | 建 a/b/c.txt + ls（计划可见） |
| S-E | live | git init + calc.js | 是 | 改 add()（diff 默认可读 + ctrl+o 展开 + diskCheck） |
| S-F | live | **不 git init** + data.json + `.atlas/skills/summarize-numbers` | 是 | 用 skill 算 data.json（G2 残余） |
| S-G | live | git init + note.txt | 是 | 读 note →（P2 重跑触发，待定稿） |
| S-H | live | git init + calc.js | 是 | ~~编辑 add() 产生 diff → 开侧栏 → 切 side-by-side → Esc 关~~ ⛔ 0.1.24 C 波回退核退役（侧栏删除后无 S-H）；1-5/`/sidebar` 归零由 `C-*` 探针核 |

- 模型对齐：S-A/B/D/E/F/H 三角色 + 顶层 model 统一 `iff/deepseek-v4-pro`（能力对齐、隔离渲染层；非模型强弱结论）。
- 隔离：全部 I/O 落 `user-e2e/tui-diff/`（沙箱 HOME + 一次性 workspace + artifacts），真实 `~/.atlas` 零写入。
- S-C 前提 = IFF 是沙箱唯一 provider 池；若 P0 引入多 provider 容灾，S-C 需改为「全部 provider 置死」，届时调 seed。
- **阶段归属（v3）**：S-A → P0a（审批内联 verdict）；S-B（熔断预警）+ S-C（网关方向性）→ P0b；S-H → P1a（多页侧栏）；S-D/E/F → P1b；S-G → P2。
- ⚠️ **P0a 验收缺口（critical）**：`accept.ts` 现全局 `ATLAS_E2E_TUI_ARGS='code --dangerously-skip-permissions'`（skip 模式），审批卡片不触发「待审批」态 → P0a 的「内联 why」无法在 skip 下验收。需 Main 落地 P0a 时提供非 skip 触发面（普通权限模式 + 命中 ask 规则 fixture，或场景级 TUI args 覆盖），否则 `P0-3-allow`/`-deny` 只能 INCONCLUSIVE。

## 5. 红线核验（spec §3）

- **红线 1（主循环零触碰）**：`redline` 模式对 `git diff --name-only base..tip` 求交
  `REDLINE_PATHS = [src/engine/query/, src/tui/utils/permissions/]`（spec 点名的 streamAssistant 无同名符号，
  以 `src/engine/query/**` 覆盖），违反 = 阶段打回。
- **红线 2（事件/信任数据只读投影）**：读 diff 人工核（不回写主循环）——验收单人工项。
- **红线 3（键位不打仗）**：签名动作走 slash；`ctrl+b` 释放以 `defaultBindings.ts` 实测为准——验收单人工项。
- **红线 4（视觉/文案原创）**：不碰 Claude spinner 动词族/banner/品牌；对照人工核——验收单人工项。
- **四件套 gate**：Main 跑并提供证据（验收单附链接/输出），本 harness 不代跑仓库 gate。

## 6. 打回流程（对齐 3-round 缺陷单）

1. 任一 hard FAIL → 验收单「缺陷单」逐条：现象 + 复现（场景/探针/日志路径）+ 证据截留 + 定级（P0/P1）。
2. 打回 Main 修 → Main 修完 ping → 本 session 重跑 `accept.ts <phase>`（只重跑失败场景可加 `--only S-X`，后续补）。
3. 全 hard PASS + 红线 0 违反 + 四件套绿 → 阶段「通过」，进下一阶段。
4. P0–P2 全过 → 终审（spec §5：三问 ≤1 键可拨 2 秒看懂 / 视觉文案原创 / 全量回归零新增 P0 / 一处大胆是否成立）。

## 7. 已知基线 & 开放项

- **pre-landing 基线**：P0 未落地时跑 `--baseline`，预期所有 P0 hard 探针红（记录改前状态 + 走线自检）。
- **G2 残余（#259 验收缺口，#261 待修）**：SkillTool 用 `getProjectRoot()` 而非 `process.cwd()`，
  非 git 目录 / git 子目录的 `.atlas/skills` 不被发现 → S-F 专测（故意不 git init）。#261 修完 S-F 应绿。
- **P2 触发器未定**：`↻` 重跑的键/命令由 Main 在 P2 定稿，S-G 先备骨架（`TUI_DIFF_RERUN_TRIGGER` 注入）。
- **C1/C2/C3 + S4-skill 回归**（Main 0.1.16 列车 #260 触及主请求路径 + #261）：0.1.16 落地后重跑
  `repro-slash-autocompact-spinner.ts`（C1/C2/C3）+ `compare.ts S4-skill`（#261），已排本 session 队列。
- **P0b① 快照已收（2026-10-03 Main）**：`queryWithRoleFallback.ts`(72L leaf) 签名 `(opts: RoleQueryOptions)=>Promise<chat>`；`RoleQueryOptions` 含 `onPrimaryError/onFallbackError`（失败侧回调）但**成功侧无信号**；门面导出 `modelprovider/index.ts:196`；消费者仅 `tui/commands/insights.ts`（:718/:870/:1399，premium→small）。success-fallback = 新增面（**偏好 result 加字段** `servedRole`/`fallbackUsed`，加性、消费者零签名变更，非 `onFallbackSuccess?` 回调——TUI 展示 await 点同步可得、无中途回调时序），动本体 + 门面，爆炸半径小。已 pin 进 spec §1。
- **P0a 非 skip 触发链（已兑现）**：S-A 用 `tuiArgs: 'code --permission-mode default'` + `extraSettings: s => s.permissions.ask=['Bash']` + `sendRaw('1')` 批准键。P0a 第 5 轮 PASS（0.1.19）+ 生产 lane 回归 PASS（0.1.19/0.1.20）。
- **P1a 验收基建已就绪（2026-10-04）**：S-H 场景骨架 + 2 自动探针（`P1a-open`/`P1a-diff-sbs`，hard）+ 3 人工核（Esc 关/split 不覆盖/信任线直达）。键位/命令待 Main P1a 定稿，环境变量 `TUI_DIFF_SIDEBAR_OPEN`/`TUI_DIFF_SIDEBAR_SBS`（hex）注入；未注入 → hard 探针 INCONCLUSIVE（evalProbe 改进：触发未达含 hard → null，非 FAIL）。骨架预演 `accept.ts P1a` = INCONCLUSIVE（hardFail=0 hardInconclusive=2），diffInline 护底绿。side-by-side 基线 grep=0 确认（纯新增渲染）。verdict 三态：PASS/FAIL/INCONCLUSIVE。
- **P0a/P0b 收口状态（2026-10-04）**：P0a 0.1.19 PASS（5 轮 + 生产 lane）；P0b 0.1.20 PASS（一轮 + 生产 lane）。两 worktree 已通知 Main 清理。剩 P1a（待 Main 实施）→ P1b（S-D/E/F，#261 已修待 S-F 验）→ P2（S-G，触发器待定）→ 终审。
- **⚠️ 验收盲区（2026-10-05，P1a 用户面缺陷揭示）**：0.1.22/0.1.23 行为 gate + 生产 lane **四清单全绿**，但用户直接指出 P1a 用户面不可用（① 侧栏「完全不可用」——割裂圆角灰框 `SidePanel.tsx:35` borderStyle=round+borderColor=gray、未做 Claude 面板的无框融入；初始页死板落 Diff 不跟随活动；40% 定宽不适配终端/CJK ② P0 信任线可发现性=0——RoleFallback `if(!fb)return null` / AutoCompactWarning 三重 null 门、正常会话 statusline 三信号全空）。**落差根因 = 判据只有行为探针（'1' 能否开页 / `@@ 8 ⇄ 8 @@` 是否渲染），无「用户面走查」层**（信息架构 / 可用性 / 视觉融入）。0.1.24 验收判据须补这一层。P1a 收口挂起、P1b 推迟到 P1a 用户面重设计（0.1.24，方向由管理侧对齐用户）收口之后——勿在旧侧栏形态上叠 P1b。
- **0.1.24 逐项探针 + 基线已就绪（2026-10-05 本 session）**：`accept-024.ts`（判据先行，独立 harness，承接 accept.ts 的 Probe 形状）——31 探针（A 波 19 / B 波 6 / C 波 4 / UA 2），判据文档面 `probeTable()` + 白盒基线 `whiteboxBaseline()` + 文本基线 `textBaseline()`。基线预演结论：① A/B 新行为 present 探针对现日志 **0 假阳性**；② C 波回退目标**尚在**（SidePanel 13 文件、`/sidebar` commands.ts:41+231、defaultBindings:350-358 1-5 键、0.1.23 双 cede sidePanelHandlers）；③ absent 探针正确显「旧面尚存」（抽屉 tab 行 S-H.log、CJK statusline S-B.log）；④ 措辞假阳性已淘 2 处（A4-no-cjk 全量 CJK 已删、A5-label-default `default` 碰撞降 soft）、续紧 C-sidebar-unknown（`Unknown skill|command: sidebar` 精确句式）与 A4-rule-ask（`\S+` source）。触发 env `TUI_DIFF_A*/B*/C*` 待 Main 回键位面填 hex；未触发→ hard INCONCLUSIVE（非 FAIL）。
