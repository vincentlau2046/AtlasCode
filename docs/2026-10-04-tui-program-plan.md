# TUI 差异化专项 · 规划-管理主计划（管理侧持有）

> 持有方：atlascode-f4（管理 session）。**本文件是专项「规划/管理」侧的事实源**，
> main（实施）与 atlas-user-e2e（验收）对齐此文件；范围/时序/收口判据以此为准。
> 一手来源索引见 `docs/2026-10-04-tui-progress-research.md`；规格判据见
> `docs/tui-differentiation-spec.md`（工作树 v3）。
> 建立：2026-10-04。状态：维护中（每阶段收口更新 §6 状态表 + 顶部时间戳）。

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
| P1a | 多页面侧抽屉（5 页 split + 键位 + `/sidebar` + 信任线直达） | 0.1.21 缺陷版 / **0.1.22 补 R1 双修复** | ⏳ 进行中（列车） | R1 双缺陷修 + 生产 lane `accept.ts P1a` hardFail=0 |
| P1b | 计划/进度 + 工具结果/diff 可读性收口（**不新造**） | 未排 | 待 P1a 收口 | ① 规划期看清「目标 + 还差几步」② diff/工具结果默认可读、展开折叠无数据丢失 |
| P2 | 可重跑工具（`↻` 改参重跑，高返工后置） | 未排 | 待核心稳定 | 改参重跑成功（新 tool_use 新址，旧结果标「被取代」非删）；前置 = 触发键/命令定稿 |
| #263/#264 | TUI 车道 Bash 恒-allow + engine `>` 重定向误判只读（真实权限缺口） | 未排 | **用户裁定：等专项收口后**随工具本体/engine 只读波修 | TUI default 模式非只读 Bash 命中内容规则弹 ask + `isReadOnlyCommand('echo x > f')`=false |
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

### 2.5 沟通与冲突规则
- 阶段接口消息逐条带 SHA/artifact 路径；时序/scope 分歧 → 管理裁定，**涉红线或 24h 未决 → surface 用户**。
- **验收判据单一出口**：回归触发与验收口径由管理统一发出（e2e 不自发），防双头判据。
- 每阶段收口：管理更新 §6 状态表 + 记忆。

**main 待输入项（提前约定，可反提）**：
- ① P1b：P1b 开波前列子决策清单（0.1.18「A1+B+C+A2」式），有无需先 pin 的。
- ② P2：`TUI_DIFF_RERUN_TRIGGER` 触发键/命令 2–3 候选 + 红线③键位不打仗分析（可与 P1b 并行，不占列车）。
- ③ #263/#264：波次排序 + #263 修法 A（接 engine `bashToolHasPermission`）红线①影响评估。
- ④ 终审：`loop-robustness/fault-proxy.ts` 能否注入网关故障强制「primary 失败+fallback 成功」以覆盖 `P0-1a-fallback`（`P0-3-deny` 需 deny fixture，e2e 侧备）。

---

## 3. 0.1.22 列车（已收口 8a21a63 · 待 e2e 生产 lane 回归）

- **内容**：R1 缺陷①`/sidebar` 未注册（`27df1ed`）+ 缺陷②CSI-u kitty 0-based 位掩码 + Diff 页空态标当前档（`d4341a1`，+9 例键链单测）。对应 R2 验收 PASS 的 `worktree-p1a-sidebar@e8b9165`（cherry-pick 零冲突）。
- **main 进度（10-04 21:xx 回告）**：四件套 3/4 绿（tsc 0 / lint 0e·0w / build 17.58MB），全量后台 ~23min 后 → release 提交 → tag v0.1.22 → push → DNS-pin npm publish → packument 验真。
- **探针编码注记（须进 CHANGELOG + 告知 e2e）**：修后 kitty 0-based 下 modifier `6`=alt+ctrl（非 ctrl+shift），旧探针 `\x1b[100;6u` 失效 → harness 用 `\x1b[100;5u`（kitty 0-based）或 xterm `\x1b[27;6;100~`（1-based 6=ctrl+shift，不变）；`TUI_DIFF_SIDEBAR_OPEN`/`TUI_DIFF_SIDEBAR_SBS` 必注入否则 diff-sbs 探针 INCONCLUSIVE。
- **发布结果（main 回报，已核验 git 现场）**：master `8a21a63`（chore(release) 0.1.22）+ tag `v0.1.22` + npm latest=0.1.22（packument 直连 registry 验真，time 2026-10-04T13:56:16Z，npm shasum 79ac8b…）；四件套 tsc 0 / lint 0e·0w / build 17.58MB / 全量 13782 pass·0 fail·939 文件。master 链 `00642a0[0.1.21] → 27df1ed → d4341a1 → 8a21a63[release]`。
- **收口序列**：~~npm publish+packument 验真~~（✅ 完成）→ **e2e `accept.ts P1a --repo <0.1.22 产物>` 生产 lane**（xterm 探针 + env 注入 + 核验 R1 双缺陷 + P1a 3 项人工核）→ 我落 spec v3 + 调研报告独立提交（✅ housekeeping 已提交，列车外）→ 汇报。
- **顺带勾销**：P1a 3 项人工核（Esc 关 / split 不覆盖 / 信任线直达）随生产 lane 正式勾销。
- **残留**：P0a/P0b 生产 lane 回归结果待 e2e 回；#263/#264 等专项收口。

---

## 4. 后续阶段（P1b → P2 → #263/264 → 终审）

- **P1b**（P1a 收口后）：spec §4 P1b 两门禁；#261 已修（`f54b250`）待 S-F（非 git 项目 skill）验。`accept.ts P1`（S-D/S-E/S-F）。
- **P2**（核心稳定后）：`↻` 改参重跑；前置 = main 定稿 `TUI_DIFF_RERUN_TRIGGER` 触发键/命令。
- **#263/#264**（专项收口后，用户裁定）：修法方向见 `docs/2026-10-04-permission-gaps.md`（#263 stub 改 passthrough 或接 engine `bashToolHasPermission`；#264 `isReadOnlyCommand` 补 `>`/`>>` 守卫）；修完回填工单「已修 commit」。
- **终审**（spec §5，管理侧把关）：四问 + 全量 tier A/B/C/G 零新增 P0；INCONCLUSIVE 遗留（`P0-3-deny` 需 deny fixture / `P0-1a-fallback` 回退难强制）用 loop-robustness `fault-proxy.ts` 故障注入覆盖。

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

> 更新：2026-10-04（0.1.22 已发布 8a21a63 + 协议 v1 已 ACK + housekeeping 已提交）

- P0a ✅0.1.19 / P0b ✅0.1.20 / **P1a 0.1.22 已发布**（master 8a21a63 + tag v0.1.22 + npm latest=0.1.22 packument 验真，四件套 13782/0/939）→ 待 e2e 生产 lane 回归
- **闭环协同协议 v1 已 ACK（main）**：ACK ①③⑄⑤⑥⑧ + item-2 授权边界保留两条——(a) classifier 纪律全程保留（publish 被阻/scope 存疑→flag 管理/surface 用户，不自动放行）；(b) publish 授权基础=**用户常设授权「完整功能落地且回归完成后可授权发布」**（用户原话，非管理代发），main 每列车按 plan §1 核验 scope、超界即停。①–④ 决策输入 main 按 P1b 开波前给。
- 用户裁定（本会话）：#263/#264 = 等专项收口；housekeeping = 只提交 spec v3 + 报告（+ 管理主计划；tui-diff 基建 e2e 定）
- **housekeeping 已提交（列车外 docs）**：spec v3 + `docs/2026-10-04-tui-progress-research.md` + 本主计划 `docs/2026-10-04-tui-program-plan.md`
- 下一步触发点：**e2e P1a 生产 lane 回归**（0.1.22 产物，xterm `\x1b[27;6;100~` / 修后 kitty `\x1b[100;5u`，TUI_DIFF_SIDEBAR_OPEN/SBS 必注入 + 核验 R1 双缺陷 + P1a 3 项人工核）→ 回归 FAIL 则修复列车 **0.1.23**（不重发同号）→ PASS 则收口进 P1b
