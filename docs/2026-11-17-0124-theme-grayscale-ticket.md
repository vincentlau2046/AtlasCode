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
