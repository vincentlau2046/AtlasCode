# TUI 差异化专项 · 规划-管理主计划（管理侧持有）

> 持有方：atlascode-f4（管理 session）。**本文件是专项「规划/管理」侧的事实源**，
> main（实施）与 atlas-user-e2e（验收）对齐此文件；范围/时序/收口判据以此为准。
> 一手来源索引见 `docs/2026-10-04-tui-progress-research.md`；规格判据见
> `docs/tui-differentiation-spec.md`（工作树 v3）。
> 建立：2026-10-04。更新：2026-10-05（0.1.24 列车开波：A P0a 行为修复 + B P0b 持续监控 + C P1a 全量回退，用户审评定稿）。状态：维护中（每阶段收口更新 §6 状态表 + 顶部时间戳）。

---

## 0. 闭环角色分工（锁定）

| 角色 | session | 职责 |
|---|---|---|
| **规划 / 管理** | `atlascode-f4`（本 session） | 主计划/roadmap owner、时序与 scope 把关、housekeeping 提交、对用户汇报、终审把关（spec §5） |
| **实施** | `AtlasCode 架构实施Main` | 唯一实现者：worktree 落地 → cherry-pick master → 四件套 gate → release 列车 |
| **验收** | `atlas-user-e2e` | 逐阶段 `accept.ts` 验收 + 终审 + 最终回归，出「阶段验收单」（PASS/缺陷/打回） |

**闭环**：`main 实施每阶段(worktree) → ping 管理(红线索引预对齐+scope 守) → e2e 验收(accept.ts→验收单) → 打回走 3-round 缺陷单 → main cherry-pick+四件套 gate → 管理 gate 发布 → e2e 生产 lane 回归 → 管理 housekeeping 提交 → 对用户汇报`。

**红线**（spec §3，验收用 `accept.ts redline` 核验）：① 主循环零触碰（`src/engine/query/`、`src/tui/utils/permissions/` 主路径）；② 事件/信任数据只读投影不回写；③ 键位不打仗；④ 视觉/文案不碰 Claude 资产。

---

## 1. Roadmap（阶段 → 版本 → 收口判据）

| 阶段 | 内容 | 版本 | 状态 | 收口判据（e2e 验收 + 管理 gate） |
|---|---|---|---|---|
| P0a | 可解释审批一等公民（verdict 一行，零新数据） | 0.1.19 | ✅ PASS（5 轮 + 生产 lane `m2yq`） | 审批卡 verdict 三态 + 用户批准标记 |
| P0b | 两后端新信号（水平回退 + autoCompact 熔断 + 网关不可达方向性） | 0.1.20 | ✅ PASS（`kbin`/`bck5` 一轮 + 生产 lane） | 三门禁文案探针全绿 |
| P1a | 多页面侧抽屉（5 页 split + 键位 + `/sidebar` + 信任线直达） | 0.1.21 缺陷版 / 0.1.22 补 R1 双修复 / **0.1.24 全量回退** | ❌ 用户面验收不过（2026-10-05 用户裁定回退）；v2 重设计挂起 | 回退面删净（§7-C）；`/diff`/内联 diff/输入层无回归 |
| P0a-2 审批行为修复（A 波） | A1 always 生效（session 域）/ A2 No 不退出 / A3 automode 确认门 / A4 why 句式真字段全英文 / A5 标签 `automode enabled` | **0.1.24** | ✅ 已发布（31 探针 0 FAIL + 生产 lane 全绿） | 3 新行为探针（A1/A2/A3）+ why 无 CJK + S-A 回归绿 |
| P0b-2 持续监控（B 波） | B1 回退折入 model 段 `↦fast` / B2 熔断折入 context-bar 色阶 / B3 网关断异常指示（已批砍） | **0.1.24** | ✅ 已发布 | statusline 三态语义探针 + stripAnsi 视觉核 |
| P0a-3 A4 改进波（0.1.26） | A4-mode P0 修（decisionReason 透传）+ allow-face verdict 行（成功卡补 rule-allow/bypass/classifier-approved 三 allow 句）+ BASH_CLASSIFIER no-op 文档（翻它无效=ANT-ONLY stub，真链=TRANSCRIPT_CLASSIFIER+auto+live model）+ R1 skip 早退门 + R2 数据侧（engine gate 快路径 setAllowVerdict）→ 4/6 A4 句 e2e 可达（classifier 2 句 live-model 依赖） | **0.1.26** | ✅ **全链收口**（`89efabc`+tag v0.1.26+npm 验真 + **生产 lane 回归 PASS**〔hardFail=0/hardInconclusive=0，banner v0.1.26，artifact `A4F-1791205033472-dd26`〕+ **worktree-278 清**；BR-8 顺延 0.1.27） | gate = e2e A4F PASS（4 硬句 a4rallow/a4bypass/A4-mode/a1danger 绿 + classifier 2 句 INCONCLUSIVE + A1×3 + 控制×7 + S-A 不回归，3-round R1 早退门+R2 数据侧核销）+ f4 git 现场核验 → 发布 → 生产 lane 回归 PASS → worktree 清（e2e 报告 `r-20261005-2110-a4f-278-prodlane-verified.md`）|
| P0 封口（classifier 2 句，**裁定 #5 = 0.1.27 metadata 崩修 + 波 C 合并**，spec `docs/2026-10-05-live-gateway-classifier-e2e-wave.md` §4） | **0.1.27 = ① metadata 崩修**（`src/tui/services/api/metadata.ts should1hCacheTTL` 1 处防御，堵 `getPromptCache1h*` stub 返 `{}` → `allowlist.some` 崩 → 分类器 `unavailable` 恒 deny，= #3+#4 共同前置，**prod P0** `dist/cli.js:123455`）+ **② 波 C**（#3 危险句：`permissions.ts` 分类器拦截 `deny`→`ASK 弹框`，steerable-trust，src/ Main，`d64467c` 合列车）；**波 A = e2e 基建**（#4 自动放行脚本化，`fault-proxy.ts` 注入脚本 OpenAI 完成体，零 src/ 不占号，**已就绪**） | **0.1.27**（code-complete + 已发布 `c1a563a` + npm `22d22d90`，f4 核验绿；**e2e gate FAIL 5/6 → #3 渲染缺口 D-279-r1 → 渲染修 = 0.1.27.1 patch（用户裁定 #6），BR-8 品牌波仍 0.1.28**；生产 lane 随 0.1.27.1 跑） | **用户裁定 #5（2026-10-05 根因定因后，f4 2026-10-06 执行）**：分类器不可达真因 = **metadata stub 崩（非 engine 门路由，架构波已证伪——engine 门 CWD 外 Write 返 `{ask:true}` 路由 TUI 分类器应 fire）**，e2e 微诊断 + f4 白盒 + dist 证；0.1.27 = 崩修（`1b47c39` 双守卫 + stub→null）+ 波 C（`d64467c`）合并，已发布。gate = e2e 复验 S-024N/O（对 `c1a563a`，探针 a4cls/a4clsa 转 hard、seed cls 零改动）→ **全 6 句 e2e 绿 → 封 P0（Option B，0.1.27 达成）**。**版本梯队（用户定）**：0.1.27=metadata 崩修+波 C / BR-8 品牌波=0.1.28（**brand 已同步 `634d9b5`**）。波 C 安全 = f4 默认 available-拦截 ASK + unavailable/headless 仍 fail-closed deny |
| P1a-v2 | 侧抽屉重设计（基于用户面讨论，**挂起**——0.1.24 回退到干净基线后再议，不叠糙方案） | 未排 | 挂起 | 待用户与 f4 讨论定稿 |
| P1b | 计划/进度 + 工具结果/diff 可读性收口（**不新造**） | 未排 | 待 0.1.24 收口 | ① 规划期看清「目标 + 还差几步」② diff/工具结果默认可读、展开折叠无数据丢失 |
| P2 | 可重跑工具（`↻` 改参重跑，高返工后置） | 未排 | 待核心稳定 | 改参重跑成功（新 tool_use 新址，旧结果标「被取代」非删）；前置 = 触发键/命令定稿 |
| #263/#264（= #265） | TUI 车道 Bash 恒-allow stub + engine `>` 重定向误判只读（真实权限缺口） | **0.1.25** | ✅ 已修已发布（`69407b8` S1 + `41649ec` S2，用户 #265 收口委托 Main，f4 版本归属 + git 验真） | TUI default 模式非只读 Bash 命中内容规则弹 ask + `isReadOnlyCommand('echo x > f')`=false（0.1.25 后 e2e 7 项重验核） |
| 终审 | spec §5 四问 | — | 待 P0–P2 全过 | 信任线 ≤1 键 2s 看懂 / 视觉原创 / 全量 tier A/B/C/G 零新增 P0 / 一处大胆成立 |

---

## 2. 闭环协同协议 v1（2026-10-04 管理侧拟定；main 逐条 ACK 后生效，ACK 状态记 §6）

> 协议为**提前约定**：0.1.22 列车走完前即成立，覆盖 0.1.23 起全部列车与 P1b/P2/#263/264/终审。

### 2.1 每阶段标准流
1. **main**：worktree 实施 → 回 4 项（worktree 路径+分支 / 键位·命令 / 涉及文件 / 四件套状态）。
2. **管理**：只读红线索引预对齐（spec 判据 vs 探针 regex）+ scope 守 → 放行验收。
3. **e2e**：`accept.ts <phase> --repo <worktree>` 出验收单（PASS/缺陷/打回）。
4. **打回流**：缺陷单 → 3-round 逐条消除（探针假阴先改 `P` 表对齐再重跑）→ 重验。
5. **main**：cherry-pick master + 四件套 gate + release 列车（bump + CHANGELOG + tag + push + npm publish + packument 验真）。
6. **管理**：gate 完成 → 触发 e2e 生产 lane 回归 → housekeeping 独立提交 → 汇报用户。

### 2.2 回报模板（固定，逐条带 SHA/artifact 路径）
- **main 阶段回报（4 项）**：worktree 路径+分支 / 键位·命令 / 涉及文件 / 四件套状态。
- **列车回报**：① release commit SHA + tag ② packument 验真输出（latest=0.1.2x）③ 四件套结果 ④ 已知残留。
- **验收单**：e2e 手填判定区（通过/缺陷/打回）+ 探针措辞对齐记录（防 P1a 式假阳性复发）。

### 2.3 列车与修复列车命名
- 每阶段收口 = 一列车；**发布后回归 FAIL → 新修复列车用下一版本号（如 0.1.22 回归挂 → 0.1.23），不重发同号**；修复列车内容须在 roadmap 内。
- **docs 不入列车**；列车走完前无人动 master 工作树（仅管理在列车走后做 housekeeping）。

### 2.4 授权边界（关键变更，需 main 确认）
- 用户已授权本专项规划-管理闭环归管理（atlascode-f4）：**0.1.23 起列车开跑/版本自授权归管理**，main 执行 outward publish。
- main 的 classifier 纪律保留：publish 被阻 / 疑似 scope 越界 → flag 管理，管理裁定；**仅当管理判定超出专项边界**（spec P0–P2 + 工单 + 0.1.x 版本纪律）才 surface 用户裁定。
- **scope 红线**：列车内容须在 §1 roadmap 内；新项须管理书面（消息）scope 批准，新 feature 波 → 用户裁定。
- **npm 发布两条裁定（2026-10-05 用户经 f4 核实确认，Main 转述→f4 向用户核实后落此条，peer 转述不直接执行）**：
  - **① 发布时序 = e2e gate 全绿闭环后，且一个 wave 只发一次**：gate red → Main 在 worktree 修 → 复跑 e2e（迭代中**不 bump、不 npm 发布**）；全绿闭环后才 bump + npm 发布（防「一个 PR 多个版本」）。
  - **② 回合内 npm 发布无需用户逐次授权，Main 直接发**（作废 0.1.26 消息里的「npm publish 逐次用户放行」不变量②；classifier 安全纪律不变：publish 被阻 / 疑似 scope 越界仍 flag 管理/上浮用户）。
  - 不变量：f4 gate 权（判 e2e verdict 放行）+ 验收判据 + 「gate 非绿不发布」+ worktree 保留至生产 lane 验真。

### 2.5 沟通与冲突规则
- 阶段接口消息逐条带 SHA/artifact 路径；时序/scope 分歧 → 管理裁定，**涉红线或 24h 未决 → surface 用户**。
- **验收判据单一出口**：回归触发与验收口径由管理统一发出（e2e 不自发），防双头判据。**（2026-10-05 用户裁定移交：A4F 复跑触发权 f4 → Main，防 0.1.26 R1 双跑竞态；「单一出口」仍保持单一——触发=Main 发、gate 权 + 验收判据归属 + npm 发布放行不变归 f4/用户侧，触发与 gate 分离不双头。peer 转述的用户裁定不直接执行，移交经 f4 向用户确认后落此条。）**
- 每阶段收口：管理更新 §6 状态表 + 记忆。

**main 待输入项（提前约定，可反提）**：
- ① P1b：P1b 开波前列子决策清单（0.1.18「A1+B+C+A2」式），有无需先 pin 的。
- ② P2：`TUI_DIFF_RERUN_TRIGGER` 触发键/命令 2–3 候选 + 红线③键位不打仗分析（可与 P1b 并行，不占列车）。
- ③ #263/#264：波次排序 + #263 修法 A（接 engine `bashToolHasPermission`）红线①影响评估。
- ④ 终审：`loop-robustness/fault-proxy.ts` 能否注入网关故障强制「primary 失败+fallback 成功」以覆盖 `P0-1a-fallback`（`P0-3-deny` 需 deny fixture，e2e 侧备）。

---

## 3. 0.1.22 列车（已发布 8a21a63 · ⚠️ 含 P0a 回归 → 已开 0.1.23 修复列车）

- **内容**：R1 缺陷①`/sidebar` 未注册（`27df1ed`）+ 缺陷②CSI-u kitty 0-based 位掩码 + Diff 页空态标当前档（`d4341a1`，+9 例键链单测）。对应 R2 验收 PASS 的 `worktree-p1a-sidebar@e8b9165`（cherry-pick 零冲突）。
- **⚠️ 回归（e2e 报，S-A FAIL）**：Main 触发 e2e 跑 parse-keypress 回归门（`accept.ts P0`）→ **S-A FAIL（hardFail=4，复跑 2/2 一致）**：权限弹框按 `1` 被侧栏 1–5 抢走（开抽屉而非选 Yes），cardAllow/whoRole/modelFast/ctxPct 全挂。S-B/S-C PASS。**0.1.22 已发布（npm latest）但含 P0a 审批面回归 → 开 0.1.23 修复列车（§3b），P1a 生产 lane 挂起。**
- **main 进度（10-04 21:xx 回告）**：四件套 3/4 绿（tsc 0 / lint 0e·0w / build 17.58MB），全量后台 ~23min 后 → release 提交 → tag v0.1.22 → push → DNS-pin npm publish → packument 验真。
- **探针编码注记（须进 CHANGELOG + 告知 e2e）**：修后 kitty 0-based 下 modifier `6`=alt+ctrl（非 ctrl+shift），旧探针 `\x1b[100;6u` 失效 → harness 用 `\x1b[100;5u`（kitty 0-based）或 xterm `\x1b[27;6;100~`（1-based 6=ctrl+shift，不变）；`TUI_DIFF_SIDEBAR_OPEN`/`TUI_DIFF_SIDEBAR_SBS` 必注入否则 diff-sbs 探针 INCONCLUSIVE。
- **发布结果（main 回报，已核验 git 现场）**：master `8a21a63`（chore(release) 0.1.22）+ tag `v0.1.22` + npm latest=0.1.22（packument 直连 registry 验真，time 2026-10-04T13:56:16Z，npm shasum 79ac8b…）；四件套 tsc 0 / lint 0e·0w / build 17.58MB / 全量 13782 pass·0 fail·939 文件。master 链 `00642a0[0.1.21] → 27df1ed → d4341a1 → 8a21a63[release]`。
- **收口序列**：~~npm publish+packument 验真~~（✅ 完成）→ **e2e P1a 生产 lane 挂起**（待 0.1.23 修复后跑）→ housekeeping 已提交（列车外）→ 汇报。
- **顺带勾销**：P1a 3 项人工核（Esc 关 / split 不覆盖 / 信任线直达）随生产 lane 正式勾销（挂起）。
- **残留**：#263/#264 等专项收口。

---

## 3b. 0.1.23 修复列车（P1a 回归 P0a 审批面 · 修复合入 + gate 全绿 · 待 Main 发布）

**触发**：0.1.22 发布后 e2e 回归门 S-A FAIL（P1a 侧栏 1–5 键抢权限弹框数字选，P0 回归）。按 §2.3「发布后回归 FAIL → 新修复列车下一版本号」开 0.1.23。

**缺陷（2 项，Main 白盒定精确机制）**：
1. **P0 · 红线③键位不打仗**：`sidePanelHandlers.ts:23-27` 的 1–5「一键开页」（openDiff…openBudget）唯独无「关闭时 return false」守卫（←→/Esc/ctrl+shift+d 都有），与权限弹框 `1/2/3`（`PermissionPrompt.tsx` `useKeybindings(..., context:"Confirmation")`）冲突，模态态下 `1` 被 `SidePanel` context 抢走（Select 数字选 `use-select-input.ts:255` 收不到）。**修法约束**：须让 1–5 在模态（Confirmation 激活）时让位（模态态透传），**保留无模态时一键开页（spec 门禁①）**——不可简单 `!isSidePanelOpen()→return false`。
2. **P1 · 视觉**：抽屉 40% 右列 split 在弹框打开时叠/挤在弹框下方（两 footer 叠加）。修：模态打开时抽屉不渲染/挤占，或弹框干净 overlay。

**gate 组成（定稿，全绿才 gate 发布 0.1.23）**：
- **① P0a 回归口径（harness，e2e 跑）**：`accept.ts P0 --only S-A` PASS（cardAllow/whoRole/modelFast/ctxPct 回绿）+ S-B/S-C 护底 + S-H 核无模态时 1–5 仍一键开页（门禁①不回归）+ stripAnsi 视觉人工核（抽屉不叠弹框/双 footer 不再叠加，写验收单判定区）。
- **② #4/#5 零成本单测交叉（e2e 跑，不新写 harness）**：`bun test tests/unit/modelprovider-retry-cause-chain.test.ts`（7/7）+ `bun test tests/unit/engine-loop-empty-response.test.ts`（10/10）。#4/#5 的 harness 判据（drop-gateway/空 0-0）**留 loop-robustness 专项正式验收补**，本 gate 不建。
- **发布后**：P1a 生产 lane（S-H）全绿 → 收口。

**流程改进（0.1.23 起生效）**：回归门（P0a 全 + P1a 生产 lane）进 **release 前置 gate**——不通过不发包（0.1.22 教训：回归门在发布后才跑，晚了）。

**白盒结论（Main 回告，比缺陷单猜测更准，gate 预期行为以此为准）**：根因**非**「SidePanel context 残留 activeContexts / 优先级压过 Confirmation」，而是：① 本地 `'SidePanel'` context **恒入** `useKeybinding` 匹配栈（`isActive` 第二参只控 activeContexts 注册，本地 context 不受控，关闭态仍匹配开页）+ ② open* handler 无模态门（区别于 nextPage/close 的 `isSidePanelOpen` 门）→ 模态 open 时 1-5 抢消费 → 饿死模态 ink `useInput` 数字选（parseInt）→ 审批卡死。**修法=双 cede 面**：键位面（模态激活全 9 handler 透传，模态拥有键位）+ 渲染面（模态激活抽屉不渲染，双底栏重叠同修）；**无模态保留门禁①**（与我缺陷单修法约束一致，认可）。

**列车实况（worktree-0.1.23-p0a-fix-loop，base `f190bc0`）**：3 提交 = `0f8de6b`（P0a 回归修/双 cede）+ `95a0670`（#271 #4 cause 链重试门）+ `ea45461`（#271 #5 占位块排除出非空判据）。全量 suite 补报已回：tsc 0 / lint 0e·0w / build 17.59MB / 全量 3491 pass·0 fail·240 文件（worktree 口径，exit 0）。base 含我的 2 个 housekeeping docs 提交（`d4c82bd`/`f190bc0`）→ 0.1.23 发布 push 顺带推 docs（「push 2 docs 提交」任务自动解决）。

**✅ scope 裁定=合并 #271（用户确认，2026-10-04）**：Main 转达「用户裁定=合并」→ 管理未采信 peer 转述、surface 用户 → 用户「先看 #271 判据再定」→ 管理审判据包（#4 cause 链重试门 / #5 占位块排除出非空判据，均干净·模块化·单测齐·全量 3491/0/240 绿）→ **用户裁定=合并入 0.1.23**。0.1.23 = 3 提交全进（`0f8de6b`+`95a0670`+`ea45461`），gate=①回归口径 +②#4/#5 单测交叉（见上）。e2e 不新写 #4/#5 harness（留 loop-robustness 正式验收）。

**关联**：Main 的 ①–④ 决策输入（P1b 子决策 / P2 触发键 + 红线③ / #263/264 波次 / fault-proxy）仍按 P1b 开波前给，可并行不占 0.1.23 列车。

---

## 4. 后续阶段（P1b → P2 → #263/264 → 终审）

- **P1b**（P1a 收口后）：spec §4 P1b 两门禁；#261 已修（`f54b250`）待 S-F（非 git 项目 skill）验。`accept.ts P1`（S-D/S-E/S-F）。
- **P2**（核心稳定后）：`↻` 改参重跑；前置 = main 定稿 `TUI_DIFF_RERUN_TRIGGER` 触发键/命令。
- **#263/#264**（专项收口后，用户裁定）：修法方向见 `docs/2026-10-04-permission-gaps.md`（#263 stub 改 passthrough 或接 engine `bashToolHasPermission`；#264 `isReadOnlyCommand` 补 `>`/`>>` 守卫）；修完回填工单「已修 commit」。
- **终审**（spec §5，管理侧把关）：四问 + 全量 tier A/B/C/G 零新增 P0；INCONCLUSIVE 遗留（`P0-3-deny` 需 deny fixture / `P0-1a-fallback` 回退难强制）用 loop-robustness `fault-proxy.ts` 故障注入覆盖。

---

## 4b. 0.1.24 列车（A P0a 行为修复 + B P0b 持续监控 + C P1a 回退 · 2026-10-05 用户审评定稿）

**触发**：P1a 用户面验收不过（用户裁定：抽屉割裂圆角灰框 / 初始页死板 / 40% 定宽不适配 TUI + P0 信任线三信号全条件渲染、可发现性=0）。P1a 全量回退回干净基线（消息流 + /diff + statusline），P0 行为修复与持续监控同波落地。**P1a v2 重设计挂起**（回到干净基线后再议，不在糙方案上叠版本）。

**A 波 · P0a 审批行为（全 session 域，不写 settings 文件，不改原存储模型）：**
- **A1 always 生效**：选 `don't ask again for <prefix>:*` → 写 session 域 allow 规则，本 session 同前缀命中 → 直接 allow 不再弹框；resume 恢复、新 session 重置；危险前缀（`rm`/`sudo`/`cd`/单字符/`*`）不出现 always 选项（安全护栏）；写失败显式报错不静默
- **A2 No 不退出**：No = 拒绝**这一次** + feedback（tell Atlas what to do differently）送回 agent → agent 继续运行，session 不退出；Esc = 取消无 feedback。当前「No 直接退出」路径 Main 白盒定位，语义锁定
- **A3 automode 确认门**：弹框选 `Enable automode` → 模态 `Entering automode / auto-approved by safety classifier / Switch back: Shift+Tab / 1 Confirm 2 Cancel` → **确认后**才切 + re-dispatch（复用既有 recheckPermission 面，不新造门控）；shift+tab 手切是显式动作**不加门**
- **A4 why 句式（全英文，真字段，非空话）**：
  - rule(ask) `Rule "<ruleValue>" from <source> requires confirmation.`
  - rule(allow) `Allowed by rule "<ruleValue>" (<source>).`
  - classifier `Auto mode: classifier flagged this as dangerous.` / `Auto-approved by classifier: <reason>.`
  - mode `default mode requires confirmation for <tool>.` / bypass `Bypass mode — all commands allowed.`
- **A5 标签**：statusline permission-mode 段 `default` / `automode enabled` / `bypass enabled`（shift+tab 指示牌保留，仅标签文案）

**B 波 · P0b 持续监控（连续状态，非瞬态 banner；事件历史不进 statusline，归未来决策面）：**
- **B1 回退折入 model 段**：回退活跃时 `deepseek-v4-pro ↦ fast`（黄），恢复即消失；数据源既有 `getLastRoleFallback()`，零新后端信号
- **B2 熔断折入 context-bar**：删 `AutoCompactWarningSegment` 独立段；context-bar 色阶（cyan→黄 70%→红 90%），超 autoCompact 阈值该段显 `▲`
- **B3 网关断指示 → 已批准砍（2026-10-05 管理裁定）**：Main 白盒结论=modelprovider 层无连接态 store（grep connectionState/healthState 零命中；`gatewayUnreachableRemediationHint` 是纯静态错误行文案 leaf，`extractConnectionErrorDetails` 是 per-error 一次性诊断），新造连接态 store（gwUp/gwDown 写 + 段订阅）属新后端信号面，超本列车「零新后端信号」边界 → **B3 砍**，保留既有错误行提示 `IFF 不可达：已切人工确认 —— /doctor 排查`（P0b③）不回归。B 波 scope = B1+B2

**C 波 · P1a 回退（删 19 文件 + 3 接线）：**
- 删：`src/tui/components/SidePanel/` 整目录（15 文件）/ `src/tui/commands/sidebar/`（2 文件）+ `commands.ts:41,231` 注册 / `defaultBindings.ts:350-357`（1-5/←→/Esc/ctrl+shift+d）/ `REPL.tsx:277,4640` 渲染点 / 0.1.23 双 cede `0f8de6b`（改动全在 SidePanel 3 文件内，随目录删除自然消失）
- **留（勿误伤）**：`useDiffData`（`/diff` DiffDialog 在用）/ `decodeKittyModifier`（parse-keypress，通用输入修复，单测从 sidepanel 名下迁到 parse-keypress）/ `decisionLog`+`useCanUseTool` 收敛点（纯加法零 UI 面，留作未来决策面复用）
- e2e 侧：S-H 场景 + P1a 探针退役，PLAN.md 更新

**gate（release 前置，全绿才发；e2e 对每个需求点详实测试 + 回归，逐项探针 + 证据不合并）：**
1. 四件套（tsc/lint/build/全量）
2. 回归：P0 S-A/B/C 全绿（A2 修复后 S-A 口径重核）
3. A 波逐项探针：A1 同前缀第二次不弹 + 危险前缀无 always 选项 / A2 No 后 session 存活 + agent 继续 / A3 未确认前 mode 不切
4. B 波逐项探针：B1 `↦ fast` 现形/消失（不可强制 → INCONCLUSIVE 留终审，与 P0-1a-fallback 同口径）/ B2 色阶阈值（fixture 可强制 context 用量）/ **B3 已砍** → 核既有 `IFF 不可达` 错误行提示不回归
5. C 波回退核：stripAnsi 抽屉残留 0 命中（含模态期）/ `/sidebar` 未注册 / 1-5 不开抽屉 / `/diff` 审查 + 内联 diff 无回归 / kitty 解码单测在 parse-keypress 名下绿
6. **用户面走查层**（补验收盲区）：statusline 三标签英文 / 审批 why 行无 CJK 混入 / 无抽屉视觉残留
7. 生产 lane：e2e 对 0.1.24 产物验

**不进本列车**：P1a v2 重设计（挂起）/ P1b（0.1.24 后）/ #263·#264（专项收口波，不变）。
**housekeeping（列车外，管理提交）**：spec v4（P0a 段重写 + P1a 段标回退/v2 挂起 + P0b 持续监控标准）+ 本计划 §1/§4b/§6 + 调研报告增量。

---

## 5. 风险 / 开放项（管理侧盯）

| # | 项 | 处置 |
|---|---|---|
| R1 | spec v3 只在未提交工作树（git 里是 v2 `1f0c870`）→ 判据漂移 | 列车走后我独立提交（§2 规则） |
| R2 | `user-e2e/tui-diff/` 整目录未跟踪 + `PLAN.md.tmp.*` 残留 → 验收基建丢失风险 | 用户裁定暂不入库；e2e owner 后续定（artifacts/workspaces 若入库需 gitignore） |
| R3 | P0a `m2yq` / P0b `bck5` 生产 lane ticket「判定区」未勾（仅 `kbin` 填） | e2e 补勾销记录 |
| R4 | #263/#264 是真实权限缺口（TUI default 模式 Bash 悬空）但排期在专项收口后 | 用户已裁定；收口时优先核销，勿遗忘 |
| R5 | 0.1.19–0.1.21 npm 发布仅外部 registry 可核（仓库 CHANGELOG 0.1.18 起不写 npm 行） | 每版本 publish 后 packument 验真并记 SHA |

---

## 6. 状态快照（随收口更新）

> 更新：2026-10-05（**0.1.23 已收口；P1a 用户面验收不过（用户裁定）→ 0.1.24 列车开波（A P0a 行为修复 + B P0b 持续监控 + C P1a 全量回退，§4b），用户审定 scope + 要求 e2e 对每个需求点详实测试和回归**）

- P0a ✅0.1.19 / P0b ✅0.1.20 / P1a 0.1.22 已发布但**含 P0a 回归**（S-A FAIL：侧栏 1–5 键抢权限弹框数字选，红线③违反 + P1 视觉抽屉叠弹框）→ **0.1.23 修复列车**（worktree-0.1.23-p0a-fix-loop @ `ea45461`，3 提交 `0f8de6b`回归修/`95a0670`#4/`ea45461`#5，全量 3491/0/240 绿；白盒根因=本地 SidePanel context 恒入匹配栈+open* 无模态门，修法=双 cede）
- **✅ 0.1.23 gate 全绿 verdict（e2e，2026-10-04）→ 已放行 Main 发布**：
  - gate① 回归：S-A hardFail=0（cardAllow/whoRole/modelFast/ctxPct + verdict/rule/noConf 全绿）；**stripAnsi 视觉核侧栏 tab 行 0 命中 = 抽屉模态期未渲染（双 cede 生效）+ 单 footer 无叠**；S-B/S-C hardFail=0。2 soft INCONCLUSIVE（P0-3-deny / P0-1a-fallback）留终审非缺陷。
  - gate① 门禁① P1a S-H：P1a-open（无模态 '1' 仍开页不回归）+ P1a-diff-sbs（⇄ 双列）+ P1-2-diff 护底全绿。
  - gate② #4/#5（e2e proxy 实测，非仅单测）：droprecover recovered（proxyCalls=7，pre-fix 基线 1 整任务死）/ emptyretry recovered（proxyCalls=10，pre-fix 基线 2 假 success）。
  - artifacts：`P0-1791125414157-vtrz` / `P1a-1791126395761-121f` / verify-droprecover / verify-emptyretry。
- **✅ 0.1.23 已发布收口（Main 回报 + 本地 git 核验，2026-10-04 16:09Z）**：release `af9f4c2` + tag `v0.1.23` 已 push（master 与 origin 同步；cherry-pick 新 SHA `ff33357`#4/`ca810e8`#5/P0a 回归修）；packument latest=0.1.23（直连 registry 验真）；四件套 tsc 0/lint 0e·0w/build 17.58MB/全量 **17286 pass·0 fail·1180 文件**。push 面核验：非 docs 恰 11 个预期文件（3 fix+3 单测+package.json+CHANGELOG+5 src），8 docs 提交全 docs-only（含品牌线 `c76c6f3`，未碰 src，护栏满足）。**残留**：2 soft INCONCLUSIVE 留终审 / #4/#5 harness 判据留 loop-robustness 正式验收 / worktree 保留至生产 lane 验真。
- **⚠️ push 前品牌线交叉注记（管理裁定=随波走）**：master `ce68311` 在 housekeeping `f190bc0` 之上多 3 个 `docs(brand)` 提交（`f10ce14`/`788cee1`/`ce68311`，品牌系统设计 spec+审计，docs-only 不进 npm）→ **0.1.23 push 会含它们，v0.1.23 tag 落在其之上**；Main 核验若任一非 docs-only（碰 src/）→ 停 push flag 管理，否则照旧。
- **闭环协同协议 v1 已 ACK（main）**：ACK ①③⑄⑤⑥⑧ + item-2 授权边界保留两条——(a) classifier 纪律全程保留（publish 被阻/scope 存疑→flag 管理/surface 用户，不自动放行）；(b) publish 授权基础=**用户常设授权「完整功能落地且回归完成后可授权发布」**（用户原话，非管理代发），main 每列车按 plan §1 核验 scope、超界即停。①–④ 决策输入 main 按 P1b 开波前给。
- 用户裁定（本会话）：#263/#264 = 等专项收口；housekeeping = 只提交 spec v3 + 报告（+ 管理主计划；tui-diff 基建 e2e 定）
- **housekeeping 已提交（列车外 docs）**：spec v3 + `docs/2026-10-04-tui-progress-research.md` + 本主计划 `docs/2026-10-04-tui-program-plan.md`
- **P1a 用户面裁定（2026-10-05 用户）**：行为探针全绿 ≠ 用户面可用——抽屉「完全不可用」（割裂圆角灰框 / 初始页死板落 Diff / 40% 定宽不适配终端·CJK，且 1-5 键与 `/sidebar` 实际不可达：打字被输入框吃掉、弹框时抢数字选）+ P0 信任线三信号全条件渲染、健康 session 可发现性=0。→ **0.1.24 列车（§4b）= A P0a 行为修复（A1-A5）+ B P0b 持续监控（B1+B2，**B3 已批准砍**）+ C P1a 全量回退**；P1a v2 重设计挂起（回到干净基线：消息流 + /diff + statusline 后再议）；P1b 推迟到 0.1.24 收口后。**用户要求：e2e 对每个需求点做详实测试和回归（逐项探针 + 证据，不合并粗粒度场景）**。
- **e2e 探针面就绪（2026-10-05）**：`user-e2e/tui-diff/accept-024.ts` 独立 harness，**31 条逐项探针**（A 19 / B 6 / C 4 / 用户面走查 2）+ 基线预演（artifact `024-baseline-1791137574575`，新行为 present 探针 0 假阳、C 回退目标尚存符合预期）+ 4 处措辞假阳性淘洗 + S-H/P1a 探针退役（PLAN.md 更新）。**留痕观察⑤**：0.1.23 生产 lane 实测 `/sidebar diff` → `Unknown skill: sidebar`（命令走 skill 查找 fallback，R1 注册 27df1ed 带参路径未通）→ 「`/sidebar` 实际不可达」用户裁定实证，进收口报告；C 波删净后该串仅由未注册拒绝产生，探针无歧义。**kitty 单测迁移验收**：C 波探针核 `sidepanel-sbs-keychain.test.ts` 删除 + parse-keypress 名下新单测绿（Main C 波提交必含，漏迁打回）。
- **0.1.24 code-complete（Main 4 项回报，2026-10-05）**：worktree `worktree-0.1.24-approval-monitor-p1a-revert` @ tip `8651d7b`（8 提交 C `9dcb727` / A2 `74a5888` / A1 `5245939`+`846e905` / A3+A4 `8d8f12f` / A5 `213912d` / B1 `b53f4c9` / B2 `8651d7b`，66 文件 +1411/−1477，每提交四件套绿，终态 3499/0/243）。键位面=**无新增键位**（A3 确认视图 1 Confirm 2 Cancel 在既有数字选面内 / A5 shift+tab 既有）。**f4 红线索引预对齐已过**（一手核 worktree：C 目录删净+defaultBindings 干净+kitty 单测迁 `parse-keypress-modifiers.test.ts` / A3 `AutoModeConfirm.tsx` 四行文案 / A4 `permissionVerdict.ts` 五句式 / A5 `PermissionMode.ts` shortTitle 三态 / B1 ModelSegment `↦{to}` 黄+RoleFallback 段删 / B2 ContextBar 色阶+▲+AutoCompact 段删 / P0b③ `modelprovider.ts:173` 原文在位）。**e2e gate 已放行**（31 条逐项 + S-A/B/C 回归 + P0b③ 不回归增项 + 用户面走查层；env 填值清单已发：A 波 label 定位非死编号 / B 波 fixture / C 波无模态 1-5 期望 0 抽屉）。
- **✅ 0.1.24 §4b gate 全绿 verdict（e2e，2026-10-05）**：P0 S-A/B/C PASS hardFail=0 + P024 探针 **19 PASS + 12 INCONCLUSIVE + 0 FAIL**（计数 e2e 更正后口径；8 hard INCONCLUSIVE 全在 S-024F A1/A4-classifier 族——根因 #263 default 模式 Bash 恒-allow 弹不出框 + verdictLine 仅 Bash·PowerShell 面；4 soft = A2-esc/B1×2/B3-gw-down〔已砍项〕；48/48 单测 + 白盒覆盖）+ C 回退白盒核（SidePanel 0 文件/单测已迁/勿误伤三件留）+ harness 基建修（stripAnsi CUF→空格，非产品）。artifacts `P0-1791150616486-ua9k` / `P024-1791152354855-a3bc`。**管理放行发布列车**（cherry-pick + 四件套 + tag v0.1.24 + push〔品牌 f0888f7/9cd0663 已核 docs-only〕+ publish + packument）。**残留（不阻塞）**：① 12 INCONCLUSIVE 终审跟进（A1×3 待 #263 修后重验）② `PermissionRuleExplanation.tsx` 详情面旧措辞与 A4 并存（P1a-v2 波候选）③ e2e harness stripAnsi 修（非产品）。
- **✅ 0.1.24 已发布（Main 4 项回报 + f4 git 现场核验，2026-10-05）**：master `6be29bd`（chore(release) 0.1.24）+ tag `v0.1.24` 已 push，origin 同步；release 提交面仅 CHANGELOG+package.json（docs 护栏满足），8 列车提交 master 新 SHA = `626e378`C/`a556da2`A2/`410d7bc`A1a/`f30bf37`A1b/`dc8e78a`A3+A4/`5867cfd`A5/`4dcd56e`B1/`fbee6de`B2。packument 双通道验真（npmmirror + 真 registry 直连）latest=0.1.24，shasum `9c915490…` 与 publish 回执逐字一致。四件套（release 树口径）tsc 0/lint 0e·0w/build 17.57MB/全量 3499/0/243。**f4 git 核验**：master=tag=6be29bd、origin 同步、release 面干净。
- **✅ 0.1.24 生产 lane 全绿 verdict（e2e，npm 产物 / tag v0.1.24 = master 6be29bd，verify worktree-024-prodlane 实测，2026-10-05）**：6 项清单全过——①banner v0.1.24 实测 ②P0 S-A/B/C hardFail=0 ③C 波回退核（SidePanel 0 文件//sidebar 未注册/1-5 删净/双 cede 删净/useDiffData+decodeKittyModifier 保留/`parse-keypress-modifiers.test.ts` 6/0 绿/抽屉 0 残留含模态期/1-5 不开抽屉/`/diff`+内联 diff 无回归）④**用户面走查层**（statusline 三标签英文 default/automode enabled/bypass enabled 各现形 + why 行无 CJK + 无抽屉视觉残留——验收盲区补层首跑即绿）⑤P0b③ 三锚点（`IFF 不可达：已切人工确认 —— /doctor 排查`）不回归 ⑥INCONCLUSIVE 不强制（12 项终审跟进）。P024 = hardFail=0/0 FAIL/19 PASS+12 INCONCLUSIVE，与 worktree 验收一致。
- **0.1.24 收口（本条目）**：housekeeping 列车外提交（spec v4 + 本计划 + 调研报告增量，docs-only）；列车 worktree `worktree-0.1.24-approval-monitor-p1a-revert` 已令 Main 清理。**残留（终审跟进，不阻塞）**：① 8 hard-INCONCLUSIVE（A1×3 待 #263 修后重验 / A4×4 verdictLine 仅 Bash·PowerShell 面）+ 4 soft（A2-esc/B1×2/B3-gw-down）② `PermissionRuleExplanation.tsx` 详情面 pre-A4 旧措辞（P1a-v2 波候选）③ e2e harness stripAnsi CUF 修（`user-e2e/lib/util.ts`，e2e owner 定入库）。
- 下一步触发点：**P1a-v2 设计讨论**（回到干净基线后与用户重议，候选方向：无框全宽临时面板 / `/diff` 增强 / 决策面，未定稿）与 **P1b 开波**（Main ①-④ 决策输入先行 + #261 S-F 复验）——两线可并行不占列车（**第二波挂起，用户确认不启动，任何 session 不预启**）。
- **0.1.25（#265）已发布 + P0 封口时序 = Option 2（用户 2026-10-05 裁定）**：#265（#263+#264 修）用户收口委托 Main 执行 → **0.1.25 已发布**（master/tag `837f72f` + origin sync + npm latest=0.1.25，f4 git 验真通过；版本归属 0.1.25=#265 先于 BR-8）。**P0 封口（字面零空洞）= 等 0.1.25 上 7 项重验转绿**——f4 已触发 e2e A4F。B1×2（↦fast 现形/消失）留 loop-robustness fault-proxy，不阻塞 P0 封口。
- **A4F 重验 FAIL（2026-10-05）→ 0.1.26 P0 A4 改进波 + P0 封口推迟 live-gateway 波（用户终裁 Option B）**：A4F 对 0.1.25 功能代码实跑——① A1-no-dialog / A1-dangerous-no-always PASS + 控制×5 全绿，**#265 静默放行洞已确认修复**（no-rule `touch`/`rm -rf` default 模式现弹框现形 + Esc 拒绝）② 暴露新 P0：A4-mode verdict 行断裂（`BashTool.checkPermissions` 委托 engine 后 `decisionReason` 未透传 → `verdictLine` 命中 `default→null`）。**Main 白盒 (i)(ii)**：(i) 运行时真开分类器 = `TRANSCRIPT_CLASSIFIER`（ON_BY_DEFAULT）+ mode=auto + live model；`BASH_CLASSIFIER` 门的是 ANT-ONLY stub（`isClassifierPermissionsEnabled` 恒 false → `classifierAutoApproved` 永不 true）→ flip 它=no-op，**Main 已 revert feature.ts + 记 no-op 根因文档**（非「默认开」）；(ii) classifier 2 句（危险 flag/自动放行）唯一产 `decisionReason:{type:'classifier',classifier:'auto-mode'}` 处 = `permissions.ts:755-778` `classifyYoloAction` 真 LLM（需 gateway+live 模型）→ **PTY 不可强制**。**用户裁定终局（逐次：强修 4 句 → 守全 6 句绿）**：P0 **封口推迟到 live-gateway 分类器 e2e 波**（跨 loop-robustness/fault-proxy 基建 + LLM 非确定，让 classifier 2 句 e2e 可强制后才封 P0；version TBD，待用户排期）。**0.1.26 = P0 改进波（非封口，照常发）**：`worktree-278-a4-verdict` 3 提交 = `a59f6d3` decisionReason 透传（修 A4-mode P0）/ `94edd40` allow-face 三 allow 句 / `d991f95` BASH_CLASSIFIER no-op 文档，四件套 3513/0/244 绿，**4/6 A4 句可达**。序列 = f4 触发 e2e A4F gate（4 硬句绿 + classifier 2 INCONCLUSIVE + A1×3 + 控制）→ Main 发布 0.1.26（BR-8 顺延 0.1.27）→ e2e 生产 lane → f4 housekeeping。`worktree-265-bash-perm-fix` 可清（A4-mode 已由 0.1.26 `a59f6d3` 覆盖重验）。
- **✅ 0.1.26 已发布收口推进中（2026-10-05，f4 gate + git 现场核验）**：3-round 收口 = R1 渲染面（`29316c7` skip 早退门，修对但非根因）→ **R2 数据侧根因命中**（`c1c3b46`：auto-allow 被 engine gate 快路径 `loopPermissionBridge !verdict.ask→return` 短路 → 永不达 useCanUseTool → allowVerdicts 恒空；修 = GateVerdict 加性 `decisionReason?` + permissionGate allow 支附字段（判定体零触碰）+ 桥快路径 guard 式 setAllowVerdict，4 文件 +102/−2 全加性零触红线，f4 逐 diff 核过；setYolo 偏离=证伪式不修〔engine 门不跑 yolo LLM，classifier 句真实链本走 ask 支既有接线〕）→ **e2e A4F R2 复跑 PASS（hardFail=0，4 硬句全绿 + classifier 2 INCONCLUSIVE + A1×3 + 控制×7 + S-A 不回归，artifact `A4F-1791202099591-qoyo`）→ f4 gate 放行 + git 现场核验（origin/local sync、6 提交=5 cherry-pick+release、release `89efabc` 仅 package.json+CHANGELOG、tag `v0.1.26`→`89efabc`）→ Main 发布**（master `89efabc` + tag v0.1.26 + npm latest=0.1.26 packument 验真 shasum `ab2467996851…` MATCH + 四件套 master 口径 3519/0/244）。**0.1.26 全链收口（2026-10-05，e2e 单份生产 lane verdict PASS + Main 核验）**：生产 lane 回归 = PASS（hardFail=0/hardInconclusive=0，4 硬句全绿 + classifier 2 INCONCLUSIVE〔预期 live-model 依赖〕+ 控制×7 + S-A 未回归 + banner v0.1.26 MATCH，artifact `A4F-1791205033472-dd26`，报告 `r-20261005-2110-a4f-278-prodlane-verified.md`）→ **worktree-278-a4-verdict 已清**（5 提交全 cherry-pick 入 master，`git worktree remove`+`branch -D` 完成）。**0.1.26 终态 = 全链闭环（worktree gate 绿 → 常设授权发布段 89efabc+tag+npm → 生产 lane PASS → worktree 清）**。
- **P0 封口 classifier 2 句 = 用户拍板拆两波（`docs/2026-10-05-live-gateway-classifier-e2e-wave.md`，2026-10-05 定稿）**：白盒新结论（修正 Main「classifier 2 句 PTY 不可强制」）= ① #4 自动放行**直接**可强制（脚本 `shouldBlock:false`→auto-allow→`useCanUseTool.tsx:47 setYoloClassifierApproval`→成功卡 `Auto-approved by classifier:`）② #3 危险句**平铺拦截=`behavior:'deny'` 不进 ASK**（A4 危险句只在 ASK 弹框 `BashPermissionRequest.tsx:427` 渲染；当前唯一可达面=拒绝上限回退 `maxConsecutive=3`，但用户不认此口径）。**用户拍板（两问）**：#3 走**产品波（波 C）**把「分类器拦截」`deny`→`ASK 弹框`（steerable-trust，#3 遂一等可达）+ e2e 基建波（波 A）**现在开**（e2e 侧）。**∴ P0 封口 = 波 A（#4，e2e 基建零 src/ 不占号，现在开）+ 波 C（#3，src/ Main 实施 = **0.1.27 拉前**）+ e2e 复验 #3 现形 → 全 6 句绿封 P0（0.1.27 达成）**。**版本梯队（用户 2026-10-05 定）= 波 C 0.1.27 / BR-8 品牌波 0.1.28**（**brand session 已同步 `634d9b5`**，三端锁定：f4 主计划/closure-status/记忆 + brand 落定；BR-8 开波触发 = P0 封口达成，f4 回传 verdict）。波 C 安全姿态 = f4 默认 available-拦截 ASK + unavailable/headless 仍 fail-closed 硬 deny（最小放宽，用户 push back 则走低影响「deny 面加 why 行」）。
- **裁定 #5（2026-10-05 根因定因后，f4 2026-10-06 执行）= 0.1.27 = metadata 崩修 + 波 C 合并**：e2e A4F gate 首跑发现「分类器 e2e 车道从不 fire」→ 微诊断 + f4 白盒 + dist 证**定因 = metadata stub 崩**（`getPromptCache1h*` dev stub 返 `{}` → `should1hCacheTTL` `allowlist.some` `TypeError` → 分类器 `unavailable` 恒 deny，**挡 #3+#4 两句**；**架构波/engine 门短路已证伪**——engine 门 CWD 外 Write 返 `{ask:true}` 路由 TUI 分类器应 fire；**prod P0** `dist/cli.js:123455` 随 npm 0.1.26 发布）。**0.1.27 = `metadata.ts` 1 处防御修（Main lane，红线外 services/api）+ 波 C（`d64467c` 拦截→ASK）合并**；BR-8 品牌波仍 0.1.28 不动。f4 调度：**Main 0.1.27 已 code-complete + 发布（2026-10-06）= master 三提交 `d64467c`（波 C）+ `1b47c39`（崩修 双守卫 + stub→null）+ `c1a563a`（release），tag `v0.1.27`→`c1a563a`，npm latest=0.1.27 dist.shasum `22d22d90…`；四件套 3529/0·246 绿 + prod dist 崩点核验消除**。**f4 白盒 + git + packument 独立核验全绿**（双守卫到位、stub→null 未接线哨兵、崩点消除）→ **已触发 e2e 对 `c1a563a` 跑 A4F S-024N/O（探针 a4cls/a4clsa 转 hard，seed cls 零改动）→ 全 6 句绿封 P0（Option B）in-flight**。spec §4/§5/§6 已重构（本地草案，用户逐行审完再落 master）；一手 `user-e2e/reports/r-20261005-2330-a4f-278-classifier-rootcause-definitive.md`。
- **协议增量（2026-10-05，用户经 f4 核实确认，§2.4/§2.5 已落）**：① A4F 复跑触发权 f4→Main（单一出口仍单一：触发=Main，gate 权+判据归 f4）② npm 发布时序=e2e 全绿闭环后 + 一 wave 一版 ③ 回合内 npm 免用户逐次授权（Main 直接发，classifier 安全纪律不变）。peer 转述裁定一律经 f4 向用户核实后才落协议（本轮两次执行）。
