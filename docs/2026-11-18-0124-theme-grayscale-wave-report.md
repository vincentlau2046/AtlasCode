# 0.1.124 波报告——theme 灰阶 WCAG 对比度硬化（C 形第二例）

> 日期：2026-11-18。工单：docs/2026-11-17-0124-theme-grayscale-ticket.md（47978477 + §5 审计 67dedb6f）。
> 链形：**C 形第二例**——用户亲手 as-is merge PR #5（merge commit 9130ed03，保对端 authorship、分支未删）→ Main master fixup 单 commit 承载全范围。

## 1. C 形落形实录

| 步 | commit/形态 | 内容 |
|---|---|---|
| PR #5 head | 09e6bd61 | theme.ts 四 token 组 ×4 主题 + 新护栏件 + wave0186 锚同步（3 files +81/−14，零 dist 面——红线预核查通过） |
| 用户 merge | 9130ed03 | as-is merge（2026-11-18T01:33Z） |
| Main fixup | **09796e1c** | 版本归属订正 + 头注数值勘误（见 §2） |

## 2. fixup 明细（09796e1c，2 files +4/−3）

1. **theme-grayscale-contrast.test.ts 头注**：背景归属 `0.1.94` → `0.1.124`（本波才是可读性修复；153/80/175 旧灰 0.1.86 wave0186 时代即在，0.1.94 未触 theme 灰阶）。
2. **同头注数值勘误**：dark subtle 旧值 `2.7:1` → `2.6:1`（Atlas-reveiw 审计注记①；工单 §0 实算为准）。
3. **wave0186-dim-render.test.ts 锚标题**：`0.1.94 对比度 7.4→9.0:1` → `0.1.124 …`（7.4 值实算吻合保留——审计注记③）。
4. **0.1.122 错标**：仅存在于 PR 描述（外部数据，工单 §3-2 不采信），树内 grep 零命中——无订正面，记账归零。

## 3. TDD 证据链（工单格 1）

- **RED 自证**：`git checkout 2bdbe120 -- src/tui/utils/theme.ts`（修前值）→ 护栏 3 测试 **2 fail**（dark 系 + light 系，light.subtle 修前实测 2.19:1 < 4.5）→ 还原。
- **GREEN**：修后 `bun test theme-grayscale-contrast + wave0186-dim-render` → **39 pass / 0 fail**（4 files 114 expect）。

## 4. 判据格状态（工单 §2）

| # | 格 | 状态 |
|---|---|---|
| 1 | 对比度格 + TDD RED 自证 | ✅ §3 |
| 2 | wave0186 主题件回归 | ✅ 39/0（含 wave0186 23 项） |
| 3 | ansi 16 色道负断言 | ✅ diff 面：darkAnsi 块仅注释文字（153→170 指涉 truecolor 值），token 值 `ansi:blackBright` 等零触碰 |
| 4 | 视觉腿 | 纯色值变更，H 面重绘轴无涉；PTY 腿归 e2e gate |
| 5 | 归属格 | ✅ §2（版本号一律 0.1.124） |

## 5. 红线核查（工单 §3）

- PR git tree 恰 3 文件，**零构建产物**（附件 atlascode-cli-theme-fixed.js/tar.gz 未入树）；发布品只出自本仓 gate 银行构建。
- PR 描述与版本号主张按外部数据处理，事实面以工单 §0 为准。

## 6. 观察呈报（不阻采认，候 f4 裁量）

新护栏件头注 light 系旧值写 `2.0:1`，修前值实测 **2.19:1**（rgb(175,175,175) 白底，WCAG sRGB 公式直算）。审计 §5-1 判「8 值吻合」未列此差；与本波 2.7:1→2.6:1 同类但方向相反（高估差距）。不阻语义（同 <4.5 结论），如 f4 认需订正随下波 fixup 承载。

## 7. 后续链

gate @ master tip（工单 §2 五格）→ 段 L 0.1.124（SRI 对照 0.1.123 新锚 a960bb5f 预注册：本波锚预期恒等 Δ=0——纯测试文件 + 注释变更不入 bundle，theme.ts 为模块常量但 bundle 内字面值变化极小；如漂移即 RED 判据面回 f4）→ 生产 lane → 收口。

## 8. 五段闭环终态（2026-11-18）

- **gate**：r-20261118-gate-0124 **GATE-PASS（改判形）@eb02baad**——预注册 Δ=0 前提勘误（「零 src/ 面」误推，PR #5 主件即 theme.ts 产品码）→ GATE-RED → f4 工单 §7 @fb44c75c 裁定① 改锚重注册（e2e 四重纯度直证）→ 格 1-4 既有证据复用零码面免重跑（0.1.112 先例同形）；canon 6154/0/506 Δ+3/+1 恰合护栏件首落。
- **段 I**：f4 采认 @20dfe991 PASS + 必改微修 1 件（头注 light 旧值 2.0:1→2.19:1，本报告 §6 观察项实算成立）→ **eb02baad**。
- **段 L**：release **e2ae5598** + tag v0.1.124 双远端 + npm publish（integrity `sha512-bVZI3OVsg+7tO…1YY0RaZGD0VIA==` 三源 MATCH）+ SRI docs/sri/v0.1.124.md @5e1049fe（cli.js 18,219,983B · 4f75289b… = 重注册锚逐字；**预注册-实测-SRI 三点链第二例，源 = 产品码面**）。
- **生产 lane**：r-20261118-prodlane-124 **PASS**——SRI 四点 MATCH（含解包 cli.js/web-contract/runtime 三锚 + 装树同 hash）+ theme 新值生产直证 GREEN（promptBorder 130×2 / subtle 110×2 / inactive 80×2 在品，旧值 153/175/102 字节级零残留）+ bin 锚 0.1.124 PONG。
- **方法论入册**（f4）：信号面预注册前须回查全波 diff 含 merged PR 本体——本波 RED 即漏查 theme.ts 所致。
