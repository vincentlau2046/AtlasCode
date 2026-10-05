# 品牌序列（0.1.29~0.1.32）× e2e 协同闭环协议

> 触发：2026-10-06 用户指示「从 main session 继承闭环逻辑，协同 e2e 完成闭环严谨性，明确协同协议」。
> 继承源：`docs/2026-10-05-p0-closure-status.md`（协议增量 ①②③ + 3-round + packument 验真）/ `docs/wave-b-s1-blocker.md`（CI 四件套定义）/ `docs/dev-loop.md` §3（四件套命令）/ 记忆 `3-round-closed-loop`。
> 性质：操作协议（非设计 spec）。版本梯队判据事实源 = spec `docs/superpowers/specs/2026-10-04-brand-system-design.md` §14 + 四份 writing-plans。

---

## 0. 角色（继承 f4/Main/e2e 三角色，适配品牌序列）

| 角色 | 本序列归属 | 职责 |
|---|---|---|
| 实施 + 自检 + 发布 | **Main session**（单一实施者，继承原架构） | 代码实施、四件套 + 版本品牌 gate、commit、bump + tag + npm publish + packument 验真 |
| 协调 + housekeeping | **brand session**（退回规划/管理定位） | 版本规划/号段把控、writing-plans 逐工单细化、本协议维护、记忆/状态文档、BR-3 待审把控；**不做代码实施**（避免与 Main 双实施者 master 漂移） |
| 验收 | **atlas-user-e2e session**（继承 e2e 角色） | 逐版目标探针 + 回归基线 + 用户面走查层（固定判据），出 verdict（矩阵 + artifact + 报告路径），生产 lane 验真发布版 |
| 裁定 | 用户 | 前置 gate（0.1.28 + TUI 封口）；闭环后自动推进至下一版（用户已授权，逐版免逐次授权） |
| Main（0.1.28 波） | 0.1.28 在制（D-279-r1 渲染修 / 用户裁定 #6 落 0.1.28） | **A4F / P0 封口触发权仍归 Main**（协议增量①：单一出口；品牌序列不触发 A4F，只做品牌探针） |

**触发权分立（继承，不越界）**：品牌探针（UA/品牌串/主题/动词池）= Main 请求 e2e 执行（brand 出判据）；A4F/P0 探针 = Main 触发、f4 判据。e2e 同一 harness 两族探针，触发出口各自单一。

## 1. 前置 gate（用户裁定，2026-10-06）

正式实施（0.1.29 开波，**由 Main 实施**）须先满足：
1. **0.1.28 完成**（Main 当前正在提交，含 D-279-r1 `FilePermissionDialog` 接 verdictLine 渲染修 + 发布；用户裁定 #6 落 0.1.28 而非 patch 号）
2. **TUI 封口完成**（P0 封口 = 全 6 句 A4 e2e 绿，Option B）

BR-8 代码改动已由 brand 预研并导出 WIP patch（`docs/superpowers/plans/2026-10-06-brand-br8-wip.patch`，7 文件，lint+build+UA 单测已过）交 Main；Main 在 0.1.28 收口后 `git apply` + 对届时 master 重新 diff 核对（防 0.1.28 触碰同文件漂移）再正式落地 0.1.29。

## 2. 逐版闭环（一波一版 · 自动推进）

每版 5 段，全绿推进下一版（用户授权逐版自动推进，不预启、不跳版）：

```
① 实施(Main) → ② e2e 前 gate(e2e) → ③ 缺陷回环(FAIL 时，3-round 上限)
             → ④ 发布(Main) → ⑤ 发布后生产 lane(e2e) → 版本闭环 → 下一版
```

1. **实施（Main）**：代码改动 + **四件套绿**（`tsc --noEmit` 0 / `eslint src/` 0 / `bun test tests/` 全量 / `bun run build` ✓）+ **版本品牌 gate**（§4 逐版 grep/断言，brand 提供判据）+ 实现提交；发布提交保持干净纪律（仅 `package.json` + `CHANGELOG.md`，tag = master tip）。
2. **e2e 前 gate**：目标探针 + 回归基线（S-A hardFail=0 + 既有硬句不回归）→ verdict。
3. **缺陷回环**（gate FAIL 时）：e2e 缺陷报告 `D-BRx-rN` → Main 修（先出码后定版，判别单测先红后绿）→ e2e 复验 R2。继承 3-round 上限：R1 修非根因→R2 根因→R3 仍红 = 升级用户裁定（不自行扩 scope）。
4. **发布（Main）**：`bump version → tag vX.Y.Z → npm publish → packument 验真`（`npm view @atlasharness/atlascode version + dist.shasum`，与 registry 独立复验 MATCH）。继承协议增量②③：发布时序 = e2e gate 绿闭环后；回合内 npm 发布免用户逐次授权（classifier 安全纪律不变）。
5. **发布后生产 lane**（e2e）：对**发布 tag** 验真（banner 实测版本 + §4 探针子集 + 用户面走查层）→ verdict 归档 → **版本闭环**。

## 3. 逐版探针矩阵（e2e 验收判据，e2e 出单时核此表）

| 版本 | 目标探针 | 回归基线 | 用户面走查层 |
|---|---|---|---|
| **0.1.29 BR-8** | ① UA 五变体无字面 `+`（LLM 核/LLM tui/MCP/WebFetch-tui/WebFetch-engine，经 fault-proxy 请求头捕获或 gateway 8999 日志）② WebFetch engine 版本段补齐（`Atlas-User (AtlasCode/<v>; repo)`）③ 品牌 grep gate 镜像：`grep -rnF '+https://github' src/`=0 且 `'+${REPOSITORY_URL}'`=0 | S-A hardFail=0 + 既有硬句不回归 | 低（UA 用户不可见，仅日志面） |
| **0.1.30 BR-4** | ① 启动屏 4 组件（borderTitle/wordmark/welcome/condensed）= `AtlasCode` ② 权限弹框文案 ③ commit 签名 `Generated with [AtlasCode]` ④ grep gate：用户可见字符串字面量 `AtlasHarness`=0（剩余仅 mdm 注册表 + 迁移溯源注释） | S-A + 既有硬句 | 启动屏全 `AtlasCode` 无 `AtlasHarness` |
| **0.1.31 BR-1+BR-2** | ① identity 5 常量（PRODUCT_FAMILY/PRODUCT_BRAND/FEEDBACK_CHANNEL/ACCENT_HUE + 既有）② theme 6 套 3 键暖金（BR-6 基线快照重生成后对比：无边框/文字/标签残留 Anthropic 橙）③ 对比度 ≥ AA（记录） | S-A + 全主题启动不炸 | 启动屏色调 = 暖金非 Anthropic 橙（6 主题抽查 dark/light + 2 ansi） |
| **0.1.32 BR-9+BR-5** | ① spinner 动词行无 `Clauding`/whimsical 四轴词（`grep -rni "clauding" src/` 排 insights multi-clauding = 0）② guideAgent 触发文案 = Atlas ③ outputStyles 描述无 Claude ④ 资产目录奠基（docs/assets wordmark + token 文档存在） | S-A + 既有硬句 | spinner/回合完成措辞无 Claude 人格 |

**INCONCLUSIVE 纪律（继承 0.1.26 先例）**：预期 INCONCLUSIVE（live-model/终端依赖等）= 不阻塞但须**定因 + 记报告**（归终审/后续波），禁止裸记；意外 INCONCLUSIVE = 定因后才放行。

## 4. 信号协议（跨 session 消息 · 单信号式 · 无 per-tick 噪声）

| 信号 | 方向 | 格式 |
|---|---|---|
| **验收请求** | brand → e2e | `【BR-N 0.1.N e2e 验收】commit <sha> · 目标探针 P1..Pn（判据 §3 表）· 回归基线 S-A+硬句 · 报告命名 r-YYYYMMDD-HHMM-brand-brN.md · verdict 格式 = 逐探针 PASS/FAIL/INCONCLUSIVE(定因) + artifact id + 报告路径` |
| **verdict** | e2e → brand | `【BR-N e2e verdict】gate: x/y PASS + z INCONCLUSIVE(原因) · artifact <id> · 报告 <path> · [FAIL 时：缺陷清单 D-BNx-rN + 复验需 R2]` |
| **复验请求** | brand → e2e | `【BR-N R2 复验】修 commit <sha> · 复验缺陷 D-BNx-rN（根因 <..>）· 报告命名 r2-YYYYMMDD-HHMM-brand-brN.md` |
| **发布验真** | brand → e2e | `【0.1.N 发布】tag vX.Y.Z → <sha> · npm packument latest + shasum <..> MATCH · 生产 lane：banner 实测 + 探针子集 <..> + 用户面走查层` |
| **梯队同步** | brand → Main | 仅版本号/发布事实知会（非 go）；**A4F/P0 触发权不变归 Main**（协议增量①），品牌侧不触发 |

**单信号纪律**：每版每方向只发收口信号（验收请求 / verdict / R2 / 发布验真）；中途号段真变才发更正。无进度轮询。

## 5. 版本闭环判据（四件全立 = 闭环）

① 实施侧四件套 + 版本品牌 gate 绿；② e2e 前 gate verdict 绿（INCONCLUSIVE 须定因记录）；③ 发布验真（tag + npm latest + shasum MATCH）；④ e2e verdict + 报告/ artifact 归档（记忆 + 状态文档登记）。

闭环后自动推进下一版（用户已授权）；BR-3（Clawd→Beam + 渐变色板）= 序列终点 pending，**不自动推进**（设计面用户已停，须用户审后另行开波）。

## 6. housekeeping（每版闭环后，brand 侧）

- 记忆 `brand-assets-audit.md` 更新版本行（发布 hash/tag/shasum + verdict + 报告路径）
- `CHANGELOG.md` 版本段（发布提交内）
- 异常/定因 → `user-e2e/reports/` 归档路径登记进 `docs/2026-10-05-p0-closure-status.md` 式状态文档（品牌序列状态记本文件 §7）

## 7. 品牌序列状态（随闭环滚动更新）

| 版本 | 工单 | 状态 |
|---|---|---|
| 0.1.28 | D-279-r1 渲染修（Main） | Main 正在提交（品牌序列前置 gate 之一） |
| 0.1.29 | BR-8 UA 品牌串 | 已移交 Main 实施（WIP patch 已交 `2026-10-06-brand-br8-wip.patch`）；gate = 0.1.28 + TUI 封口 |
| 0.1.30 | BR-4 全量收口 | 排队（Main 实施） |
| 0.1.31 | BR-1+BR-2 | 排队（Main 实施） |
| 0.1.32 | BR-9+BR-5 | 排队（Main 实施） |
| pending | BR-3 | 待用户审（不自动推进） |
