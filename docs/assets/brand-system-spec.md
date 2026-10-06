# 品牌系统 spec —— token + 对比度记录（BR-1/BR-2，0.1.31）

> 落点：`src/shared/identity.ts`（BR-1 常量单一事实源）+ `src/tui/utils/theme.ts`（BR-2 6 主题 3 键换值）。
> 本文件 = spec §4.4 要求的「对比度工具校验结果记录」+ token 值定稿（BR-5 资产奠基的前身；0.1.32 BR-5 在此目录加 wordmark）。

## 1. identity 常量（BR-1，`src/shared/identity.ts`）

| 常量 | 值 | 语义 |
|---|---|---|
| `PRODUCT_FAMILY` | `Atlas` | 家族共享（atlascode/atlasoffice 配方共用） |
| `PRODUCT_BRAND` | `AtlasCode` | 对外品牌名（与 PRODUCT_NAME 同值、语义独立） |
| `FEEDBACK_CHANNEL` | `https://github.com/vincentlau2046/AtlasCode/issues` | 反馈通道（原触面 undefined 是 bug 症状，收口） |
| `ACCENT_HUE` | `compute` | 强调色相配方注入（atlasoffice='neutral'） |

`FAMILY_MARK_PEAK` 不进 identity（视觉常量归 theme/brand 模块）。

## 2. 品牌色 token（BR-2，theme.ts 6 主题 × brand/brandShimmer/briefLabelAssistant）

| 主题 | brand | brandShimmer | briefLabelAssistant |
|---|---|---|---|
| darkTheme | `#FFB800` rgb(255,184,0) | `#FFD54A` rgb(255,213,74) | `#FFB800` |
| lightTheme | **`#B45309` rgb(180,83,9)**（amber-700） | `#D97706` rgb(217,119,6)（glow 装饰） | **`#B45309`** |
| darkAnsiTheme | `ansi:yellowBright` | `ansi:yellow` | `ansi:yellowBright` |
| lightAnsiTheme | `ansi:yellowBright`（ANSI 限制，见 §3） | `ansi:yellow` | `ansi:yellowBright` |
| darkDaltonizedTheme | `#FFB800` | `#FFD54A` | `#FFB800` |
| lightDaltonizedTheme | **`#B45309`**（色盲轴安全 + AA） | `#FFD54A`（glow 装饰） | **`#B45309`** |

**裁定（实施期对比度工具定稿，偏离 plan §2 提议值处）**：
- plan §2 提议 lightTheme `#D97706`（标注「浅底 AA」），实测 3.19:1 < 4.5 → **上修 `#B45309`（5.02:1，AA）**；lightDaltonized 同值（色盲轴不变）。
- lightTheme shimmer 由 plan 的 `#F59E0B` 改 `#D97706`（shimmer = 浅一档 glow 装饰非文本，不强制 AA；3.19:1 记录）。
- lightAnsi `ansi:yellowBright` on white = **1.07:1，已知限制**（ANSI 16 色无 amber 族可用；yellowBright 是亮端最亮黄）——定因记录：ANSI 色域限制非配色错误，gate「无 Anthropic 橙残留」满足（黄非橙）；若后续要 ANSI 浅底 AA 须出 16 色空间（truecolor 主题，非本波范围）。

**clawd_body/clawd_background 未动**（仍 `rgb(215,119,87)`/黑 等 = BR-3 域，D-2 随 BR-3 处理）。

## 3. 对比度校验（WCAG 2.x 相对亮度，node 脚本 2026-10-06 计算）

| 组合（文本色 vs 底） | 比值 | AA(4.5) |
|---|---|---|
| `#FFB800` on 黑（dark/darkDalton 终端底） | **12.11** | ✅ AAA |
| `#FFD54A` on 黑（shimmer 装饰） | **14.87** | ✅ AAA |
| `#B45309` on 白（light/lightDalton 终端底） | **5.02** | ✅ AA |
| `#D97706` on 黑（shimmer 装饰） | 6.59 | ✅ |
| `ansi:yellowBright` on 黑（darkAnsi） | **19.56** | ✅ AAA |
| `ansi:yellowBright` on 白（lightAnsi） | **1.07** | ⚠️ 已知限制（§2 定因） |
| （对照）旧 Anthropic 橙 `rgb(215,119,87)` on 黑 | 6.67 | ✅（被替换） |
| 光锥 4 色 `#FFB800`/`#FF8C42` on 白（light，0.1.33 原值） | 1.73 / 2.31 | ⚠️ O-8 定因记录（<3:1 不可读，0.1.34 替换） |
| 光锥 4 色 `#B45309` on 白（light light-cone amber，O-8 0.1.34） | **5.02** | ✅ 非文本 3:1 线（mark 图形判据） |
| 光锥 4 色 `#C2410C` on 白（light light-cone flame，O-8 0.1.34） | **5.18** | ✅ 非文本 3:1 线（mark 图形判据） |
| 光锥 4 色 `#0066FF` on 白（light light-cone blue，O-8 不变） | **4.83** | ✅ 非文本 3:1 线 |
| 光锥 4 色 `#9B3A8A` on 白（light light-cone violet，O-8 不变） | **6.24** | ✅ 非文本 3:1 线 |
| 光锥 4 色 on 黑（dark 系 4 色，O-8 零回归） | 12.11 / 9.08 / 3.37 / 4.34 | ✅ 非文本 3:1 线 |

注：光锥 mark = 非文本图形，判据 = WCAG 非文本 3:1 线（非 AA 文本 4.5）；O-8（0.1.34）= light/lightDaltonized 光锥 4 色白底安全变体（同色相加深，`theme.ts` light 系 2 块 4 键），gate 判据补 light 场景对比度断言（堵"只验在场不验可读"缺口，单测 `tests/unit/theme-brand-warm-gold.test.ts` O-8 节交叉）。

6 主题启动不炸 = TUI 各主题冒烟（e2e gate ②③ 抽查 dark/light + 2 ansi）。
