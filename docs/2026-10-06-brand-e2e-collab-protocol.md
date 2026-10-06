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

## 6a. 发布通道备记（housekeeping 事实，后续版本发布须知）

- **D-8（0.1.33 tracker）**：本机 registry 通道 **scoped tarball 带 scope 前缀文件名恒 404**（canonical 无 scope 前缀）。`@atlasharness/atlascode` 发布验真时 tarball 直下须用**无 scope 前缀**的 canonical 文件名，勿按 `@atlasharness/atlascode-<v>.tgz` 取（404）。packument `dist.shasum` 验真不受影响（registry 元数据正常）。
- **R2 复验基线纪律**：e2e 前 gate 若切在「实施前基线」commit 上，结果（如 1/6）系基线错位、**非真缺陷**——须待实施落地后 R2 复验核真实 gate，勿据错位基线判定 FAIL。

## 7. 品牌序列状态（随闭环滚动更新）

| 版本 | 工单 | 状态 |
|---|---|---|
| 0.1.28 | D-279-r1 渲染修（Main） | ✅ 已发布（release `e1f79d3`，npm latest=0.1.28 + shasum `ae04768a…` e2e 独立验真 MATCH） |
| 0.1.29 | BR-8 UA 品牌串 | ✅ **已发布收口**（e2e verdict 3/3 PASS releasable=true〔artifact A4F=`A4F-1791231349358-is3m`+P0a=`P0a-1791232078979-9onx`〕；Main 全链收口 master `f1c34db` + tag v0.1.29 + npm latest=0.1.29 shasum `2d0da16d…` + tarball 独立复验 MATCH + dist BR-8 标记核验绿；e2e 生产 lane 验真信号已发） |
| 0.1.30 | BR-4 全量收口 | ✅ **闭环**（master `f3f3480`〔`ace84a1` BR-4 + `8e230d3` UDS 判别单测〕+ tag v0.1.30 + npm latest shasum `b028df95…`〔D-8 SOP：`atlascode-0.1.30.tgz` 无 scope 前缀直下 MATCH〕+ dist 核验〔AtlasHarness 残留 2 = 全 keep-set 注册表键，用户可见=0〕；四件套 4/4〔3535/0·247〕+ e2e R2 6/6 PASS + 生产 lane PASS〔banner v0.1.30 + UA 无回归 + BR-4 子集=0 + 报告 `r-20261006-0631-prodlane-030`〕） |
| 0.1.31 | BR-1+BR-2 | ✅ **闭环**（`562ffb7` BR-1 + `74aabe1` BR-2 + master `098cbd3` + tag v0.1.31 + npm latest shasum `456463cf470c…`；四件套 4/4〔3540/0·248〕+ e2e gate 4/4 PASS〔THEMES `…-mksx`，报告 `r-…-0705`；探针④软面 INCONCLUSIVE 定因=ANSI 16-color 降级 SGR 形不可唯一断言→回落单测+truecolor 指纹实捕〕+ 生产 lane PASS〔报告 `r-…-0742`，暖金 SGR 注入实证 + Anthropic 橙=0〕） |
| 0.1.32 | BR-9+BR-5 | ✅ **闭环（品牌序列终版）**（`29aef48` BR-9 + `3e26c75` BR-5 资产奠基〔docs/assets 3 件〕+ master `1b06856` + tag v0.1.32 + npm latest shasum `455f61387217…`；四件套 4/4〔3544/0·249〕+ e2e gate **4/4 PASS 0 INCONCLUSIVE**〔报告 `r-…-0722`〕+ 生产 lane PASS〔报告 `r-…-0803`〕；clauding 命中 3=全内部术语〔multi-clauding 排除 + D-10 HTML 标题，spinner 池零残留〕） |
| **0.1.29–0.1.32 全闭环** | BR-8→BR-4→BR-1+2→BR-9+5 终版 | ✅ **全链闭环达成（2026-10-06）**——四版每版 gate→发布→生产 lane 同口径绿（用户明早交付物达成）；权威事实源 = `docs/2026-10-06-0.1.33-deferred-tracker.md`（master `ee68565` 终态） |
| 0.1.33 | 品牌 mark 定稿（BR-3 棱镜光锥）+ 收尾波 | ✅ **闭环**（用户 2026-10-06 裁定 **BR-3 方案 A 棱镜光锥 + 光核微符号** 并入 0.1.33：mark 重设计 `Clawd.tsx`→`Beam.tsx` 棱镜 A 形 + `AnimatedBeam` 光扫上爬 + 删 `AnimatedAsterisk` + 光锥色板 + wordmark 双色 + 中文 tagline + tips 光核〔D-3〕+ 编译产物 PRODUCT_BRAND import〔D-2〕+ clawd 键族→`brand_mark`/`brand_mark_bg`〔D-9〕+ insights HTML 标题〔D-10〕+ 发布验真 SOP〔D-8〕；Main 实施 worktree-0.1.33 → master `412ca61` + tag v0.1.33 + npm latest=0.1.33 shasum `52f01fb2…`；四件套 4/4〔3546/0·249〕+ e2e 前 gate **5/6 PASS + ⑥ INCONCLUSIVE 定因登记（多终端 CJK 宽度归 0.1.34 BR-7，不阻塞）**〔报告 `r-20261006-1246-brand-br3-0133`〕+ **生产 lane PASS**〔报告 `r-20261006-1343-prodlane-033`，A4F 14 条 hard 全 PASS + ①-④ 子集全绿 + npm 独立验真 MATCH〕） |
| 0.1.34 | BR-7 多终端 CJK 宽度矩阵 + e2e 用户视角体验报告优化（**非 Brand 序列版本**，Main+e2e lane） | 用户 2026-10-06 裁定（规划文档 `docs/2026-10-06-0.1.34-0.1.35-version-plan.md`）：0.1.34-1 BR-7（0.1.33 gate ⑥ 定因承接：Block Elements U+2580-259F 全角字体实际宽度矩阵，Main 实施终端/宽度探测 + mark 降级策略 + e2e 验真〔本机可验=硬项，真多终端=软面定因登记〕）+ 0.1.34-2 e2e 体验报告加性并入（独立于 Brand 序列，不占品牌 gate 面）+ 0.1.34-C 候选登记（exit-reason 日志 / D-10 残留标识符改名专审，开波时裁定归属）。**brand 侧唯一职责 = BR-7 spec 侧要点（宽度矩阵定义 / mark 降级策略 / 全角字体 Block Elements 行为规则）开波时与 Main 对确，预留支持**；**Main ACK（2026-10-06）**：0.1.35 spec 已核（`eccd290`，排期 #288 pending 锁定）+ BR-7 三要点预研方向定（spec §3.2/§15 + `stringWidth.ts` 实测面）+ 0.1.34-C 候选开波裁定口径同意 + **0.1.34-2 O 项 triage 登记 master `fe6a553`（O-7 源级预核=双渲染点排除，余 2 候选因 PTY 探针定夺；O-2 npm scope=独立 breaking 波，不入 0.1.34/0.1.35）**。**2026-10-06 开波（#287 in_progress，worktree-0.1.34）**：① **切片序登记 master `4d52edd`：O-8 P0 → O 低成本切片（O-1/O-3/O-4/O-5/O-9/O-11/O-12-B 加性）→ BR-7（0.1.34-1）**；**O-12-B（welcome 边框 brand→inactive，1 行）开波裁定 = 0.1.34-2 加性先行**（A/C 留 0.1.35；e2e gate §4-⑥ 边框 inactive SGR 断言随之部分提前生效，harness 120/200 列双档 e2e 侧先行补好）② **BR-7 spec 侧三要点已对确（brand 侧 2026-10-06，事实源 = spec §3.5 新节）**：a 宽度矩阵定义（品牌字符全集 + **footer 4 glyph O-10 搭车** × 终端矩阵，每格 3 项实测，含「全角字体 metrics 可画 2 cell = 字体 metrics 问题非 EAW property 问题」判据）/ b mark 降级 3 档（T0 全形态→T1 半块转实心→T2 ASCII 骨架；触发=blocklist/DSR-6 探针/`ATLAS_MARK_DEGRADE` 手动）/ c 全角字体规则（property 保证+字体实测兜底，三源识别信号）/ O-10 4 glyph 全 Ambiguous 初判（**以仓 `eastAsianWidth` 包运行时 EAW 断言单测为准**）+ 非 emoji 降级档（纯文本 label 推荐/Neutral 几何 `*/§/>/~` 备选，矩阵结论后随裁定）③ **e2e 前置风险承接（ACK 2026-10-06）**：0.1.34-2 gate 验收输入第一项=核 O-8 P0 是否入列，未含=显式标记「0.1.35 动效精修前置缺失」请 Main 裁定，fail-closed 不静默放行 ④ **推进状态（Main ACK 2026-10-06）**：BR-7 三要点+O-10 签收（实施核 spec §3.5，EAW 断言单测锁 4 值，矩阵判据冲突回 brand 加 blocklist 不自行扩 scope）；**O-8 P0 已落 worktree-0.1.34 `6dc9dbf`**（light/lightDaltonized 光锥 amber→`rgb(180,83,9)` / flame→`rgb(194,65,12)` + 对比度单测 8/8 绿〔WCAG 实算 amber 5.03/flame 5.18≥3:1〕+ spec 对比度表补光锥 4 色行；SGR 期望 `38;2;180;83;9`/`38;2;194;65;12` = **0.1.35 动效精修 light 基线**，fail-closed 前置输入第一项已满足）；**O-1 开波裁定=维持现状**（16 色空间无品牌色相内 ≥3:1 色、magenta 降级破坏暖金色相一致性、spec §2 已知限制定因记录维持、gate「无橙残留」不变；gate 前 brand/e2e 可推翻）→ **brand 侧立场=同意维持**（16 色 ANSI 色域固有限制、与 spec §2/§4.4 已知限制定位一致，非缺陷）；切片②（O-3/O-4/O-5/O-9/O-11/O-12-B）进行中 → 切片④⑤（exit-reason+D-10 / BR-7） ⑤ **BR-7 EAW 前提订正（Main 运行时回订正，2026-10-06，**supersede ② 中 O-10/a/c 三处旧判据）**：BR-7 已 code-complete（worktree-0.1.34 `5b04973`，四件套绿），运行时 `get-east-asian-width` 实测订正 spec 两处初判 → **spec §3.2/§3.5 + 0.1.35 plan 已订正落盘**：(i) **§3.2「Block Elements Neutral 零错位」前提有误**——`█▓▒▄▀` + 边框 `╱` U+2571 **多为 Ambiguous**（仓模型 ambiguousAsWide:false 测宽 1、Ink 按 1 cell 布局内部自洽；全角 CJK 上下文 ambiguousAsWide:true=2 = 错位风险根源），**仅 `░` U+2591 真 Neutral** → CJK 安全论证改「Ambiguous + §3.5 3 档降级兜底」（降级从"兜底"升为"主机制"）；(ii) **O-10 4 glyph 初判"全 Ambiguous"订正**（`mark-cjk-width.test.ts` 锁 4 值）：⚡🧠=**Wide**（恒 2 cell）/ ▶=Ambiguous（仓 1/CJK 2）/ ⌂=Neutral（恒 1）。**代码已随 3 档降级兜底，不阻塞 gate/发布**；brand 侧承诺：真多终端矩阵软面定因登记项 → 滚动加项入 MARK_BLOCKLIST（附 终端+字体+advance≠1+复现步骤）+ 按需扩 T2 触发面（**在 scope 内，非扩 scope**）；gate C5 = Main 按「本机硬项 + 真多终端软面定因登记」出 ⑥ **闭环知会（Main 2026-10-06，无需回复）**：BR-7 切片⑤ code-complete（worktree-0.1.34 `5b04973`，四件套 + 全量 suite **3576/0·253** 绿，detached verify `verify-0134`）；**分工澄清**：真多终端软面定因登记项 → **brand 侧出登记项**（Main 滚动加项入 `MARK_BLOCKLIST` + 按需扩 T2 触发面，**无需逐次对确**）+ gate C5 = 本机硬项 + 真多终端软面定因登记；Main 已 ping e2e 出 C1-C5 判据草案（e2e 锁定序列），gate 绿后走常设发布序列 → **v0.1.34**；0.1.35 全部输入已收（0.1.35 plan + O-12 A/C 设计 + EAW 订正入 plan），0.1.34 闭环后开波 |
| 0.1.35 | **Brand 专项封口最后一轮**（母题铺开 + 动效精修 + Brand 残留项 + **O-12 宽终端品牌块设计**，brand spec + Main 实施） | 用户 2026-10-06 裁定 = **Brand 专项封口终版**（0.1.29 BR-8 → 0.1.30 BR-4 → 0.1.31 BR-1+2 → 0.1.32 BR-9+5 → 0.1.33 BR-3 mark → **0.1.35 封口终轮**）：范围 = 母题铺开（spinner 光束串 / 进度条光束 / 分隔线 `█ █ █` / 边框 `╱` / 空态 `░`）+ 动效精修（光扫上爬 / 顶点脉冲 / reduced-motion）+ 残留项（0.1.34-C 未入 0.1.34 候选开波时并入）+ **O-12 宽终端品牌块"左上角聚落"设计**（e2e 用户视角设计输入 `r-20261006-1408` §5.5 V-5，**用户已认可此发现 + Main triage 裁定归 0.1.35 母题轮 master `4bafee0`**：分级 B〔核心 1 行 welcome 边框 brand→inactive〕/ A〔布局层 ≥160 列品牌卡条件居中〕/ C〔精修 右侧重平衡〕+ 明确排除〔移右下/删边框〕+ 验证=120/200 列双档 harness 断言）；**开波条件 = 0.1.34 闭环后**（BR-7 宽度矩阵结论 = 0.1.35 CJK 宽度判据输入；O-8 light 光锥重映射 = 0.1.34-2 P0 为 0.1.35 动效精修前置）；封口后 Brand 专项 = 全闭环（持续优化止，不预启）；spec = writing-plan（brand 侧出，`docs/superpowers/plans/2026-10-06-brand-0135-final-wave-plan.md` §0.4 O-12 + §4 gate ⑥-⑨）。**推进状态（2026-10-06，Main 开波实施 + 用户封口门禁指令）**：① **0.1.35 = Brand 专项封口终版 + fail-closed 门禁**（用户 2026-10-06 裁定：0.1.35 必须**保证所有 in-scope 需求闭环**，e2e 前 gate / 生产 lane 任一未闭环〔FAIL / 无定因 INCONCLUSIVE / 残留需求未落地〕→ **不发布 0.1.35**；封口版无顺延，Brand 专项无下一版可 deferred）；② **残留项已空**（exit-reason `b5c4734` + D-10 改名 `015160f` 均随 0.1.34 核销）+ **O-8 light 基线已满足**（0.1.34 `a1fc9a8`，动效精修在 light SGR 上不重映射）+ **O-9 脉冲收敛已随 0.1.34 `d0cb6cd` 落地**（gate ⑦ 只验"顶部注意元素≤1"）；③ **逐档拍板（用户 2026-10-06）**：O-12 **C 档 = 做 C**（A 居中 + C 右侧重平衡一起做，A+C 彻底解决宽屏"左上聚落+右侧留白"）/ **V-6 腿行 = 保持衰减**（不立项、维持 0.1.33 定稿）；④ **Main 实施中**（`worktree-0.1.35` @ 341b7fe，O-12 A code-complete〔logoV2Utils.ts WIDE_CENTRAL_MIN_COLUMNS=160 + leftPad + LogoV2.tsx 编译产物 memo 手术 + 判别单测 12/12 + 四件套 4/4，200 列 PTY 几何验真中〕；C 作 A 之后独立切片；②-⑤ 硬 scope〔母题 7 触面/动效 4 项/MARK_BLOCKLIST 模板/O-8 基线〕逐切片四件套绿）；gate 判据 ①-⑨（⑥ 含 `≥200` 列右侧重平衡断言）开波时发 e2e，**全需求 fail-closed 闭环，任一未闭环不发布** |
| ~~pending~~ | ~~BR-3（Clawd→Beam + 渐变色板）~~ | ✅ **用户 2026-10-06 裁定方案 A 定稿，并入 0.1.33 已闭环（不再 user-gate/不自动推进）**：spec §3.1/§4.1/§8/§13 定稿 |
