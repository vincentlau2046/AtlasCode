# BR-1 + BR-2 · identity 扩常量 + 主题换值实施计划（0.1.28）

> **状态**：实施计划（writing-plans）· 对应 spec §6.2（BR-1）+ §4.3（BR-2）
> **性质**：identity 单一事实源落地 + theme 橙→暖金纯换值
> **范围（2026-10-05 复核）**：BR-1 = identity 扩常量 + 触面 import 化；BR-2 = theme.ts 6 套 **3 键纯换值**（不含 clawd 键，clawd 全归 BR-3）

---

## 1. BR-1 · identity 扩常量（§6.2 Step 1+2）

### 1.1 扩 `src/shared/identity.ts`（现已有 PRODUCT_NAME/PACKAGE_NAME/REPOSITORY_URL/VERSION/getVersion/buildUserAgent）

新增 4 常量（spec §6.2 代码块）：

```ts
export const PRODUCT_FAMILY = 'Atlas'                    // 家族共享
export const PRODUCT_BRAND = 'AtlasCode'                 // 对外品牌名（与 PRODUCT_NAME 同值、语义独立；未来 atlasoffice 配方可不同）
export const FEEDBACK_CHANNEL = 'https://github.com/vincentlau2046/AtlasCode/issues'  // 现 undefined 是 bug 症状
export const ACCENT_HUE = 'compute'                      // 配方注入（atlasoffice='neutral'）
// FAMILY_MARK_PEAK 不进 identity（视觉常量归 theme/brand 模块）
```

`src/shared/index.ts` 门面同步导出 4 常量（与既有 `PRODUCT_NAME`/`REPOSITORY_URL` 同批）。

### 1.2 触面 import 化（Step 2，单一事实源 sweep）

品牌触面硬编码 `'AtlasCode'` 改 `import { PRODUCT_BRAND } from '…/shared'`（BR-4 已把 `AtlasHarness`→`AtlasCode` 字面收口，此处把字面 `'AtlasCode'` 升级为 `${PRODUCT_BRAND}`）。Sweep 范围（实施时 grep `'AtlasCode'` 定位，重点）：

- `src/modelprovider/errorMessaging.ts`（BR-4 改后的 4 处字面 `AtlasCode`）
- `src/tui/utils/attribution.ts`（BR-4 改后的 `[AtlasCode]` → `[${PRODUCT_BRAND}]` + `PRODUCT_URL`→`REPOSITORY_URL`）
- 启动屏系列 wordmark（`LogoV2/Clawd/WelcomeV2/CondensedLogo`）——注意这些是编译产物，import 化需在编译产物里加 import + 替换字面（或**建议归入 BR-3 mark 工单一起处理**，避免二次改编译产物）

> **取舍**：启动屏 4 编译产物文件的 identity import 化，与 BR-3（Clawd→Beam 重写编译产物）重叠。**建议**：`errorMessaging`/`attribution` 等普通 .ts 文件在 BR-1 做 import 化；LogoV2 编译产物的 `PRODUCT_BRAND` import 化并入 BR-3 一起（避免同一编译产物改两次）。Main 可据 build 实操在此取舍。

## 2. BR-2 · theme 3 键橙→暖金（§4.3）

`src/tui/utils/theme.ts` 6 套主题，仅换 3 键 `brand` / `brandShimmer` / `briefLabelAssistant`（**不碰** `clawd_body`/`clawd_background`，归 BR-3）。

### 2.1 `brand` 主色（6 套，定稿）

| 主题 | 现状 | 新 |
|---|---|---|
| `darkTheme` :433 | `rgb(215,119,87)` | `rgb(255,184,0)` `#FFB800` |
| `lightTheme` :116 | `rgb(215,119,87)` | `rgb(217,119,6)` `#D97706`（浅底 AA） |
| `darkAnsiTheme` :275 | `ansi:redBright` | `ansi:yellowBright` |
| `lightAnsiTheme` :196 | `ansi:redBright` | `ansi:yellowBright` |
| `darkDaltonizedTheme` :512 | `rgb(255,153,51)` | `rgb(255,184,0)`（蓝金轴色盲安全） |
| `lightDaltonizedTheme` :354 | `rgb(255,153,51)` | `rgb(255,184,0)` |

注释 `// Claude orange` → `// Atlas-Orange`（§10.2）。

### 2.2 `brandShimmer`（"Lighter brand orange"→浅一档暖金）

| 主题 | 现状 | 新（提议值，实施时对比度工具定稿） |
|---|---|---|
| `darkTheme` :434 | `rgb(235,159,127)` | `rgb(255,213,74)` `#FFD54A`（浅金） |
| `lightTheme` :117 | `rgb(245,149,117)` | `rgb(245,158,11)` `#F59E0B`（amber-500，比 light brand 浅一档） |
| `darkAnsiTheme` :276 | `ansi:yellowBright` | `ansi:yellow` |
| `lightAnsiTheme` :197 | `ansi:yellowBright` | `ansi:yellow` |
| `darkDaltonizedTheme` :513 | `rgb(255,183,101)` | `rgb(255,213,74)` |
| `lightDaltonizedTheme` :355 | `rgb(255,183,101)` | `rgb(255,213,74)` |

### 2.3 `briefLabelAssistant`（随 brand 同步映射）

| 主题 | 现状 | 新 |
|---|---|---|
| `darkTheme` :488 | `rgb(215,119,87)` | `rgb(255,184,0)` |
| `lightTheme` :172 | `rgb(215,119,87)` | `rgb(217,119,6)` |
| `darkAnsiTheme` :330 | `ansi:redBright` | `ansi:yellowBright` |
| `lightAnsiTheme` :251 | `ansi:redBright` | `ansi:yellowBright` |
| `darkDaltonizedTheme` :567 | `rgb(255,153,51)` | `rgb(255,184,0)` |
| `lightDaltonizedTheme` :409 | `rgb(255,153,51)` | `rgb(255,184,0)` |

同名注释 `// Brand orange` / `// Orange adjusted for deuteranopia` 同步改 `// Atlas-Orange` / `// Amber adjusted…`。

## 3. 验证

- [ ] identity.ts 5 常量齐全 + index.ts 导出；`PRODUCT_FAMILY='Atlas'`/`PRODUCT_BRAND='AtlasCode'`/`FEEDBACK_CHANNEL`/`ACCENT_HUE='compute'`
- [ ] theme.ts 6 套 `brand`/`brandShimmer`/`briefLabelAssistant` 值换暖金；无 `rgb(215,119,87)` / `rgb(255,153,51)` / `ansi:redBright` 残留（brand 家族内）
- [ ] `clawd_body`/`clawd_background` **未动**（仍 `rgb(215,119,87)` 等，待 BR-3）
- [ ] 6 套主题 brand 对 background 对比度 ≥ AA 4.5:1（spec §4.4，对比度工具校验，结果记 `docs/assets/brand-system-spec.md`）
- [ ] TUI 各主题启动：边框/文字/标签显暖金，无 Anthropic 橙
- [ ] 构建 + 既有 e2e 回归全绿

## 4. 依赖 / 时序

- **前置**：BR-4（0.1.27）把 `AtlasHarness`→`AtlasCode` 字面先落地；BR-1 在其基础上 import 化
- **BR-2 依赖 BR-1**（brand 色对齐 `PRODUCT_BRAND` 语义；实际 theme 换值无需 BR-1 先落地，但同版并列干净）
- **后续**：0.1.29 BR-9 去 fork；BR-5 资产 wordmark.svg 用 BR-2 的 brand 色值（`#FFB800` 暖金 + `#0066FF` 冷蓝）