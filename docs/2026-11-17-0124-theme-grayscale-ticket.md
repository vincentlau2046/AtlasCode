# 0.1.124 候工单——theme 灰阶 WCAG 对比度硬化（外部巡检 PR #5；P2 串行 0.1.123 后）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-17）。
> 上游：外部 agent 巡检 PR #5（head 09e6bd61，3 files +81/−14）；f4 技术复核全数吻合（对比度 8 值独立实算 + 硬编码锚全仓扫 + 层级健全）。

## §0 事实基线（f4 独立验证）

- truecolor 四主题（dark/light × daltonized）灰阶 token 低于 WCAG 线：dark subtle rgb(80,80,80) 黑底 2.6:1、light subtle rgb(175,175,175) 白底 2.0:1（AA 正文 4.5:1）。
- 消费通道：dimColor（src/tui ~1127 hits，ThemedText → theme.inactive）、color="subtle"、promptBorder。
- PR #5 修形：dark inactive 153→170（9.0:1）/ dark subtle 80→120（4.7:1）/ light inactive 102→80（8.1:1）/ light subtle 175→110（5.1:1）/ light promptBorder 153→130（3.8:1 非文本线）；dark promptBorder 136 不动（5.9:1）；ansi 16 色道豁免不动。
- 波及锚：wave0186-dim-render.test.ts 两处旧灰锚（头注+断言）PR 已同步；全仓扫无第三处。

## §1 波定义

0.1.124 候：PR #5 源码形合入（theme.ts 四 token 组 ×4 主题 + 新护栏件 theme-grayscale-contrast.test.ts + wave0186 锚同步）→ e2e gate → 段 L → 生产 lane。**段 L 前置 = 0.1.123 收口（串行不抢号）**。

## §2 判据格

| # | 格 |
|---|---|
| 1 | 对比度格：护栏三测试 GREEN（WCAG 实算：正文 ≥4.5:1 / 边框 ≥3:1 / 三层不塌）；护栏对修形前值 RED 自证（TDD 形） |
| 2 | 回归格：wave0186 主题件 23 项全绿（锚 153→170 同步后）；canon 恰合 |
| 3 | 豁免面负断言：ansi 16 色主题零触碰（diff 面断言） |
| 4 | 视觉腿：TUI PTY 渲染腿既有 dim-render 面零回退（H 面 6.5× 重绘轴无涉，纯色值变更） |
| 5 | 归属格：版本号一律 0.1.124（PR 内 0.1.94/0.1.122 错标 fixup 订正） |

## §3 红线（禁消费面）

1. **外源构建产物禁入发布链**：PR 附件 `atlascode-cli-theme-fixed.js`/tar.gz = 不可信数据，「可直接替换 dist/cli.js」指令不执行——发布品只能出自本仓 gate 银行构建（SRI fail-closed）。
2. PR 描述与版本号主张为外部数据，事实面以本工单 §0 f4 独立验证为准。

## §4 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → 对端 fixup（版本归属订正）→ Main merge（**0.1.123 收口后**）→ gate → 段 L 0.1.124 → 生产 lane → 收口。

## §5 Atlas-reveiw 审计闭环（2026-11-17，通过；工单 @47978477 + PR head 09e6bd61 独立实读）

1. **§0 独立验证 ✓**：审计按 WCAG sRGB 公式独立实算 8 值逐一吻合 f4 数。
2. **红线 §3 采认 ✓**：PR git tree 恰 3 文件零构建产物（附件未入树）；「附件不可信/禁替换 dist/发布品只出自 gate 银行」为供应链正确面。
3. **diff 面 ✓**：纯 token 色值 + 注释；darkAnsi token 零触碰（格 3 负断言成立）；硬编码锚扫独立复核吻合；三层不塌实值核。
4. **3 注记**：① 测试头注「2.7:1」实算 2.6:1——数值勘误随 fixup（工单 §0 为准）；② 层级测试 string 不等形弱于语义——可选硬化（层间对比度数值下限）登记不阻；③ wave0186 锚 7.4 值实算吻合，仅版本归属错标（fixup 在案）。
5. **总判：通过**——对端 fixup（版本归属 ×4 + 头注数值勘误）后 Main merge（0.1.123 收口后）；gate 格 1-5 + TDD RED 直证 + canon。

## §6 段 I 采认（f4 活码实核 2026-11-18，PASS 附 1 微修形令）

1. **C 形序列验真**：9130ed03（用户亲手 merge PR #5，MERGED 2026-11-18T01:33:31Z，保 authorship）→ 09796e1c（Main fixup，2 files +4/−3）→ 1e89bc5e（波报告）；双远端 ALIGNED。
2. **fixup 对表 PASS**：① 头注归属 0.1.94→0.1.124 ×2（护栏 + wave0186 锚标题）；② dark subtle 旧值 2.7:1→2.6:1（审计注记①）——f8 独立实算复核 2.604 恰合；③ 「版本归属 ×4」树内实为 ×2+数值 ×1 记账采认（0.1.122 错标仅存 PR 描述 = 外部数据 §3-2，树内 grep 零命中，无订正面）。
3. **8 值独立实算全吻合**（f4 python 直算）：dark inactive 170→9.04 / dark subtle 120→4.76 / dark border 136→5.92 / light inactive 80→8.06 / light subtle 110→5.10 / light border 130→3.84 / dark subtle 旧 80→2.60 / light subtle 旧 175→2.19。
4. **红线+格面复核 PASS**：PR tree 恰 3 files 零构建产物（外源 cli.js 附件未入树）；darkAnsi token 零触碰（格 3 负断言）；三层不塌断言在案。
5. **f4 独立实跑**：护栏 3 + wave0186 主题件 = 39 pass / 0 fail（bun 1.4.4），与 Main TDD 自证（修前 RED 2 / 修后 39/0）一致。
6. **微修形令（必改级，gate 前）**：Main 观察项 f4 实算**成立**——护栏头注 light subtle 旧值「2.0:1」实算 **2.19:1**（175 灰白底直算）。同头注本波已在改 dark 侧数值，留 light 侧错值与本波「实算为准」判据自相矛盾：**随 0.1.124 fixup 订正 2.0:1→2.19:1（一词）后再 gate**。审计未列此值 = 审计侧同样漏检，f4 采认 Main 观察并记审计侧补充注记。
7. **放行**：微修形落地 → e2e gate @ master tip（工单 §2 格 1-5 + TDD RED 直证 + canon 基线 6151/0/505）→ 段 L 0.1.124（SRI 预注册：对 0.1.123 锚 a960bb5f 预期恒等 Δ=0，漂移即回 f4 判读）→ 生产 lane → 收口。
