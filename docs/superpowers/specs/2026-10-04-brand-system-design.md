# AtlasCode 品牌系统设计 spec

> **状态**：设计 spec，待审批 · **不落地代码** · 实施在 TUI 优化专项完成后单独起 0.2.x 版本
> **日期**：2026-10-04 · **作者**：品牌标志专项 · **关联**：`docs/2026-10-04-brand-assets-audit.md`（现状审计）、`docs/brand-string-classification.md`（串分类）、`docs/architecture-charter.md` L7/IDN-1/IDN-2

---

## 0. 摘要

为当前已实施的 AtlasCode 产品设计一套**专业品牌系统**，并通过 charter 已裁定的 `shared/identity.ts` + 构建配方机制（IDN-1/IDN-2）让品牌系统具备**产品族可扩展性**——AtlasOffice 未来按同机制接入，不预埋运行时开关、不预付 AtlasOffice 品牌资产（守 charter L101）。

### 已定决策（本轮 brainstorming 批准）

| 决策点 | 选定 |
|---|---|
| 品牌架构 | **Branded House** —— "Atlas" 主品牌（共享家族 mark + 家族色），AtlasCode/AtlasOffice = 描述性子产品（wordmark 后缀 + tagline + 垂直点缀差异） |
| 品牌视觉概念 | **昇腾光锥（Ascend Beam）** —— 底宽冷蓝向顶点暖金收敛上升的光锥，Ascend 攀升意象 + 算力上电升温叙事 |
| 色彩战略 | **独立色系**，不贴近华为昇腾官方品牌青绿（昇腾是华为注册商标，避商标风险）；算力叙事靠形态/文案传递 |
| 迁移时序 | **先 spec 不落地，TUI 优化专项完成后单独起 0.2.x 版本**实施；不挂 0.1.23、不与 TUI 列车并轨 |
| npm scope | `@atlasharness` 作为家族序列 scope **保留不迁**（未来 `@atlasharness/atlasoffice` 同族） |

### 不在本 spec 范围

- AtlasOffice 品牌资产设计（只留 identity 接缝，不预建内容）
- `--define` 构建配方机制完整兑现（Step 3，归独立工单）
- MACRO.VERSION 去漂移统一（独立工单，品牌 spec 只依赖 identity.ts 的 VERSION）
- npm scope 迁移（已决定不迁）

---

## 1. 品牌架构 · Branded House

### 1.1 架构模型

```
Atlas（家族主品牌）
  ├─ mark：家族共享光锥母题
  ├─ 家族色：Atlas-Orange（暖金主色）
  └─ 子产品（配方注入 PRODUCT_NAME/PRODUCT_BRAND/ACCENT_HUE）
       ├─ AtlasCode   顶点█（满块，算力激活光心）+ 满渐变 + compute 色板
       └─ AtlasOffice 顶点▀（上半块，空心通用基座态）+ 单色低饱和 + neutral 色板（远期）
```

### 1.2 三层命名对齐（charter L7）

| L7 层 | 值 | 本 spec 处理 |
|---|---|---|
| 仓库/项目 | `AtlasCode` | ✅ 已对 |
| 对外品牌 | `AtlasCode` | ⚠️ 当前 leak "AtlasHarness"，本 spec 全触面收口 |
| 内部机器标识 | `atlas`（短名） | ✅ 合规，**不动**（系统提示词 "You are Atlas"、env `ATLAS_*`、类名 `Atlas*`） |

**关键原则**：内部层 "Atlas" 是 charter L7 刻意设计，非 leak。系统提示词 `You are Atlas, a professional coding agent…` 保持不变——这是 LLM 自我认知的内部机器标识，不是对外品牌面。

---

## 2. 品牌视觉概念 · 昇腾光锥（Ascend Beam）

### 2.1 认知锚

Ascend = 攀升。光锥从底宽冷蓝向顶点暖金**收敛上升** = 算力上电、升温、聚焦执行。底冷→顶暖渐变是"算力激活升温"的视觉叙事，顶点光心 = 聚焦点。这个母题只属于"跑在 Ascend 算力上的 agent"，不指向任何通用 coding agent，与旧 "AH" 双字母 monogram 彻底不同源。

### 2.2 视觉母题系统（贯穿全 UI，非孤立 mark）

光锥母题复用到所有动态/装饰触面，形成统一视觉语言——这是"品牌 UI 认知感"的核心，不是角落一个图形：

| 触面 | 静态 | 动态（loading/思考） |
|---|---|---|
| **mark** | 5 行渐变三角 + 顶点光心 | 顶点呼吸脉冲（reduced-motion 时静态） |
| **spinner** | `█████` 光束串 | 从底向顶**逐行点亮**（"光扫上爬"= Ascend 上升动效） |
| **进度条** | `███░░░░` 光束填充 | 光束向前推进 |
| **边框角标** | `╱` 斜线角装饰（U+2572 Neutral） | — |
| **分隔线** | `█ █ █` 光束串（Block Elements，CJK 安全） | — |
| **空态底纹** | 暗淡 `░` 光锥底纹 | — |

**loading 动效预览**（光扫上爬，4 帧，reduced-motion 时仅显示帧 4 静态终态；顶点 █ 全程 amber 高亮 + 脉冲）：
```
帧1: █        帧2: █        帧3: █        帧4: █
    ·            ██           ██           ██
    ·            ·            ████         ████
    ·            ·            ·            ██████
    ·            ·            ·            ████████
```

---

## 3. mark 形态

### 3.1 形态规格

5 行实心收敛三角，9 宽 × 5 高（与现有 `Clawd.tsx` `AH_ART` 槽位 9×5 + `logoV2Utils.ts` 布局常量 `MAX_LEFT_WIDTH=50` / clawd art 最小宽 20 兼容，零布局改动）。顶点光心靠颜色 + 脉冲动效传递，不靠字符形状：

```
    █          # amber    #FFB800  顶点光心（聚焦点，脉冲）
   ███         # flame    #FF8C42
  █████        # violet   #9B3A8A
 ███████       # blue-d   #3A4FBF
█████████      # blue     #0066FF  底（算力冷源/承重）
```

### 3.2 字符选择 · CJK 安全（关键工程约束）

**强制使用 Block Elements `█` U+2588（FULL BLOCK）**，不用 `▲` U+25B2 / `◆` U+25C6。

**原因**：`▲` `◆` 是 East Asian **Ambiguous** 宽度字符。仓里 `src/tui/ink/stringWidth.ts` 用 `eastAsianWidth({ambiguousAsWide:false})`（西方标准=测宽 1），但 **CJK 终端按 Unicode 标准 ≈ 2 宽**——AtlasCode 面向国产终端生态（中文 locale 用户多），Ambiguous 字符会导致 mark 错位。`█` U+2588 是 **Neutral 宽度=始终 1**，跨所有终端（含 CJK）稳定，`stringWidth()` 测宽准确，零错位风险。

**这是面向国产终端必须做对的细节**。分隔线/空态底纹同样只用 Neutral 宽度字符（`█▀▄░`，均 U+2580-259F Block Elements 区段）。

### 3.3 wordmark

```
AtlasCode
```
- "Atlas" 用 `brand` 色（Atlas-Orange 暖金 `#FFB800`）
- "Code" 用 `ascend-blue`（冷源 `#0066FF`）
- wordmark 本身是光锥两端色的对照，与 mark 渐变同构
- TUI 启动屏边框标题、README logo、`--version` 输出统一此处理

### 3.4 tagline（已定）

- 英文副标：保留 `AI Coding Agent`（与现有 Clawd.tsx 副标同，承认知惯性）
- 中文 tagline（README/官网/发布说明用）：**`算力驱动的 Coding Agent`** —— 直陈差异化双轴（算力 + coding agent），不蹭昇腾商标

---

## 4. 色彩系统

### 4.1 AtlasCode 渐变色板（已定 · 独立色系，非昇腾青绿）

| 色名 | 值 | 角色 |
|---|---|---|
| `ascend-blue` | `#0066FF` | 算力冷源（底/承重） |
| `ascend-blue-dark` | `#3A4FBF` | 蓝过渡 |
| `ascend-violet` | `#9B3A8A` | 中段过渡 |
| `ascend-flame` | `#FF8C42` | 焦橙 |
| `ascend-amber` | `#FFB800` | 聚焦暖顶（顶点光心/主品牌色） |
| `brand`（主色） | `ascend-amber` `#FFB800` | 承 Claude orange 视觉惯性但换为暖金，全触面单色场景 |

**商标边界**：色板**不含**华为昇腾品牌青绿（`#00C8B3` 系）。冷蓝 `#0066FF` 是通用蓝，不构成商标混淆。算力叙事由光锥形态 + tagline 传递，不由色相传递。

### 4.2 降级链（接现成基建，不造新机制）

仓里 `src/tui/ink/colorize.ts` + `src/tui/utils/theme.ts` 已有完整三档降级（truecolor level 3 → 256 level 2 含 tmux clamp → 16 ANSI level 1 → NO_COLOR 单色）。色板直接走这套：

| 档位 | mark 渐变 | brand 主色 |
|---|---|---|
| truecolor | 5 行真渐变（blue→violet→flame→amber + 顶点脉冲） | `rgb(255,184,0)` |
| 256 色 | 4 档离散（蓝/紫/橙/黄） | `ansi256(220)` 近金 |
| 16 色 ANSI | 两档（`blueBright` 底 + `yellowBright` 顶） | `ansi:yellowBright` |
| 单色 / no-TTY / CI | 纯块字轮廓（光锥形状可辨，无色） | 默认前景 |

### 4.3 主题映射（6 套，替换当前继承 Claude orange 的 brand/clawd_body）

`theme.ts` 现有 6 套主题（default/dark/light/ANSI/deuteranopia/protanopia），全部 `brand` 当前 = `rgb(215,119,87)` "Claude orange"。本 spec 替换：

| 主题 | brand | mark 渐变 | 备注 |
|---|---|---|---|
| default | `rgb(255,184,0)` amber | truecolor 5 档 | 主用 |
| dark | `rgb(255,184,0)` amber | truecolor 5 档（底蓝调暗 `#0050CC`） | 深底对比度校验 |
| light | `rgb(217,119,6)` amber-deep | truecolor 5 档（底蓝调亮） | 浅底对比度校验 |
| ANSI | `ansi:yellowBright` | 两档 `blueBright`→`yellowBright` | 16 色终端 |
| deuteranopia | `rgb(255,184,0)` amber | 蓝→金（色盲安全，绿盲用户可辨） | 已是色盲变体基底 |
| protanopia | `rgb(255,184,0)` amber | 蓝→金（红盲用户可辨） | 同上 |

**`clawd_body` 重命名** → `brand_mark`（去 Anthropic Clawd 命名残留），6 套主题同步改键名 + 值映射到渐变色板。

### 4.4 无障碍

- **WCAG 对比度**：amber `#FFB800` 对深底（`#1e1e1e`）对比度 ≈ 10.3:1（AAA）；对浅底（`#ffffff`）≈ 1.8:1（不足）→ light 主题用 `amber-deep #D97706`（对比度 ≈ 4.6:1 AA）。spec 实施时用工具校验所有主题 brand 对 background 的对比度 ≥ AA 4.5:1。
- **色盲**：deuteranopia/protanopia 变体用蓝→金渐变（蓝金轴对红绿色盲可辨），不依赖红绿区分。
- **reduced-motion**：顶点脉冲 + loading 上爬动效默认尊重 `prefers-reduced-motion`（终端探测：`ATLAS_NO_MOTION` env 或 tmux/CI 环境推断）；reduced-motion 时 mark/spinner 显示静态终态。详见 §7。

---

## 5. 启动屏整体调性

```
╭──╱───────────────────── AtlasCode v0.1.22 ───╮
│   █                                          │
│   ███       Welcome back, vince!             │
│   █████     ~/projects/AtlasCode             │
│   ███████   Qwen38 · API Usage Billing       │
│   █████████ ▌ Ready                         │
│                                              │
╰──────────────────────────────────────────╱──╯
```

- 左侧光锥 mark（冷底暖顶渐变，顶点 █ 脉冲高亮 amber）
- 边框 `╱` 角标（U+2572 Neutral，CJK 安全，与光锥上升斜线呼应）
- wordmark "Atlas"暖金 / "Code"冷蓝（光锥两端色对照）
- 底栏 `▌ Ready` 光标（U+258C Block Elements，coding agent 明示）

> mockup 中所有非 ASCII 字符（`╭╮╰╯╱█▌`）均属 Box Drawing / Block Elements 区段（U+2500-259F），**Neutral 宽度=1**，CJK 终端零错位。

**用户每轮启动看到**：暖金顶点光心 + 冷蓝底光锥 + 暖冷对照 wordmark——一眼是 AtlasCode，不是任何通用 agent。

### 5.1 响应式降级

| 终端宽度 | 布局 | mark 处理 |
|---|---|---|
| ≥ 70 col | horizontal（现有 `getLayoutMode`） | 完整 9×5 光锥 + 渐变 |
| < 70 col | compact | 凝缩 3×3 mini 光锥（`█ / ███ / █████` 三行），渐变保留 |
| CondensedLogo（侧栏凝缩态） | 单行 `Atlas█` mark icon + wordmark | 顶点色块作 icon |

`logoV2Utils.ts` `calculateOptimalLeftWidth` 的 "Minimum for clawd art 20" 注释改为 "Minimum for beam art 9"（光锥更窄，布局更省）。

---

## 6. identity 架构落地

### 6.1 现状与 charter IDN-1 承诺的差距

| 项 | charter 裁定 | 当前实状 |
|---|---|---|
| identity 机制 | `shared/identity.ts` + 构建期 `--define` 注入 | ✅ 文件存在，❌ 走运行时 `readFileSync` 读 VERSION，未用 --define |
| 常量齐全度 | VERSION/PRODUCT_NAME/PRODUCT_BRAND/PACKAGE_URL/FEEDBACK_CHANNEL | ❌ 缺 PRODUCT_BRAND、FEEDBACK_CHANNEL、PRODUCT_FAMILY、FAMILY_MARK、ACCENT_HUE |
| 产品配方 | atlascode 配方 vs atlasoffice 配方不同值 | ❌ `package.json` 单一 `bun build`，无配方分流 |
| MACRO.VERSION | build-time macro | ❌ 退化为运行时 globalThis（charter L72 明记是 bug）；多处仍用 MACRO.VERSION |

### 6.2 落地路径（Step 1+2 在本 spec 范围，Step 3 归后续工单）

**Step 1（本 spec）**：扩 `src/shared/identity.ts` 常量到齐全：

```ts
export const PRODUCT_FAMILY = 'Atlas'                    // 家族共享
export const PRODUCT_NAME = 'AtlasCode'                  // 已存在（配方注入点）
export const PRODUCT_BRAND = 'AtlasCode'                 // 新增（对外品牌名；与 PRODUCT_NAME 同值但语义独立——未来 atlasoffice 配方可 PRODUCT_NAME='AtlasOffice'）
export const PACKAGE_NAME = '@atlasharness/atlascode'    // 已存在（家族 scope 保留）
export const REPOSITORY_URL = 'https://github.com/vincentlau2046/AtlasCode'  // 已存在
export const FEEDBACK_CHANNEL = '<待定>'                 // 新增（charter 列明，当前 undefined 是 bug 症状；建议 GitHub issues URL）
export const ACCENT_HUE = 'compute'                      // 新增（配方注入；atlasoffice='neutral'）
// FAMILY_MARK_PEAK 不进 identity（视觉常量归 theme/brand 模块，非身份串）
```

**Step 2（本 spec）**：所有品牌触面改 `import { PRODUCT_BRAND, PRODUCT_FAMILY } from 'shared/identity'` 而非硬编码 `'AtlasCode'`——单一事实源落地。未来 atlasoffice 配方改一个常量值，全触面跟着变，零代码分支。

**Step 3（独立工单，非本 spec）**：`--define` 构建配方机制 + atlasoffice 配方文件 + MACRO.VERSION 去漂移。本 spec 只留接缝（`ACCENT_HUE`/`PRODUCT_BRAND` 的配方注入点），守 charter L101。

---

## 7. 触面文件映射（逐文件改动清单）

### 7.1 用户可见 P0 leak 修复 + identity 化

| 文件:行 | 当前 | 改为 | 备注 |
|---|---|---|---|
| `src/tui/components/LogoV2/LogoV2.tsx:204` | `AtlasHarness` | `${PRODUCT_BRAND}` | borderTitle |
| `src/tui/components/LogoV2/LogoV2.tsx:205` | `AtlasHarness` | `${PRODUCT_BRAND}` | compactBorderTitle |
| `src/tui/components/LogoV2/Clawd.tsx:110` | `AtlasHarness` | `${PRODUCT_BRAND}` | wordmark（见 §8 重构） |
| `src/tui/components/LogoV2/Clawd.tsx:136` | `AtlasHarness` | `${PRODUCT_BRAND}` | AppleTerminal 分支同款 |
| `src/tui/components/LogoV2/WelcomeV2.tsx:12` | `Welcome to AtlasHarness` | `Welcome to ${PRODUCT_BRAND}` | AppleTerminalWelcomeV2 |
| `src/tui/components/LogoV2/WelcomeV2.tsx:31` | `Welcome to AtlasHarness` | `Welcome to ${PRODUCT_BRAND}` | 主分支 |
| `src/tui/components/LogoV2/WelcomeV2.tsx:116` | `Welcome to AtlasHarness` | `Welcome to ${PRODUCT_BRAND}` | 主分支 |
| `src/tui/components/LogoV2/CondensedLogo.tsx:51` | `AtlasHarness` | `${PRODUCT_BRAND}` | 凝缩 logo |
| `src/modelprovider/errorMessaging.ts:85` | `access to AtlasHarness` | `access to ${PRODUCT_BRAND}` | 账号错误 |
| `src/modelprovider/errorMessaging.ts:123` | `access to AtlasHarness` | `access to ${PRODUCT_BRAND}` | 账号错误 |
| `src/modelprovider/errorMessaging.ts:129` | `access to AtlasHarness` | `access to ${PRODUCT_BRAND}` | 组织错误 |
| `src/modelprovider/errorMessaging.ts:380` | `AtlasHarness is unable to respond` | `${PRODUCT_BRAND} is unable to respond` | 用量政策错误 |

**errorMessaging 安全性核查清单**（实施时必须验证）：
- [ ] 4 处错误消息是否按子串匹配触发（若 LLM 后端返回的错误体含 "AtlasHarness" 子串做条件分支，改品牌名会破坏匹配）→ 实施前 grep `includes('AtlasHarness')` 核查
- [ ] 错误消息是否有 i18n 多语言版本（若有 zh/en 双语，同步改）

### 7.2 已合规面（不动，仅记录）

| 触面 | 文件 | 状态 |
|---|---|---|
| LLM UA / MCP UA / WebFetch UA / default UA | `src/tui/utils/http.ts` + `userAgent.ts` + `webFetchUtils.ts` | ✅ 0.1.21 收口 |
| `--version` / CLI description / program name | `src/cli/parse.ts:417-419,774` | ✅ |
| launcher stderr | `src/atlascode/launcher.ts:12,24` | ✅ |
| headless 提示词 | `src/cli/headlessPrompt.ts:35` | ✅ |
| Node 版本错误 | `src/cli/setup.ts:123` | ✅ |
| MCP server_name | `src/cli/print.ts:434` | ✅ |
| commitAttribution repo allowlist | `src/tui/utils/commitAttribution.ts` | ✅ 已 `vincentlau2046/AtlasCode` |
| releaseNotes repo URL | `src/tui/utils/releaseNotes.ts` | ✅ |
| 系统提示词 "You are Atlas" | `src/tui/constants/system.ts:18-20` | ✅ L7 内部名合规，**不动** |

### 7.3 历史"移植自 AtlasHarness"注释（P2，随大重构清尾）

~150 处 `// 从 AtlasHarness src/... 移植` 注释（集中 `src/ascend/tools/*` + `src/engine/session/*`），非用户可见，零功能影响。本 spec 不强制清尾，归 F 波 ② 类机械替换或下次大重构。

---

## 8. Clawd → Beam 重构

### 8.1 文件重命名

| 旧 | 新 | 说明 |
|---|---|---|
| `src/tui/components/LogoV2/Clawd.tsx` | `Beam.tsx` | 去 Anthropic Clawd 命名残留 |
| `src/tui/components/LogoV2/AnimatedClawd.tsx` | `AnimatedBeam.tsx` | 同上 |
| theme 键 `clawd_body` | `brand_mark` | 6 套主题同步 |
| theme 键 `clawd_background` | `brand_mark_bg` | 同上 |

### 8.2 pose 机制废弃（已定 · 重写上爬动效）

现有 `AnimatedClawd.tsx` 支持 `ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right'`（Anthropic Clawd 吉祥物的手臂/眼睛动画，仅在 `CondensedLogo.tsx:44` 全屏模式 `isFullscreenEnvEnabled()` 时触发；普通 TUI `<Clawd />` 静态不触发）。光锥是抽象图形无肢体，pose 机制**整体废弃**，重写为单一"光扫上爬"动效（§2.2 loading 动效）——光锥从底向顶逐行点亮即 Ascend 攀升的微缩表演，品牌语义一致。

**保留**：react compiler runtime `$[n]` memo cache 结构（性能关键，14KB 缓存逻辑不动）、`AppleTerminalClawd` 分支（Apple Terminal 渲染降级，改名为 `AppleTerminalBeam`，保降级逻辑换 art 内容）。

### 8.3 AnimatedAsterisk 处理

`src/tui/components/LogoV2/AnimatedAsterisk.tsx`（7.5KB）是 Anthropic Claude ✦ mark 的动画残留。本 spec **删除**（AtlasCode 不用星号 mark，光锥 mark 用 Beam.tsx 统一）。grep 确认无消费方后删。

### 8.4 mark art 数据结构

`Beam.tsx` 的 `BEAM_ART` 替代 `AH_ART`，按行配渐变色（非单色）：

```tsx
const BEAM_ART: Array<{ chars: string; color: string }> = [
  { chars: '    █    ', color: 'ascend-amber' },     // 顶点（脉冲目标）
  { chars: '   ███   ', color: 'ascend-flame' },
  { chars: '  █████  ', color: 'ascend-violet' },
  { chars: ' ███████ ', color: 'ascend-blue-dark' },
  { chars: '█████████', color: 'ascend-blue' },       // 底
];
// AppleTerminal 降级：单色 brand_mark，形状同上
```

---

## 9. 无障碍

### 9.1 reduced-motion

- 探测：`prefers-reduced-motion`（ink 不直接支持 CSS media query，改用环境推断）—— `ATLAS_NO_MOTION=1` env / CI 环境（`CI=true` 且无 TTY）/ `--no-animation` CLI flag（可选）
- 行为：mark 顶点脉冲关、loading 上爬动效关（显示静态终态帧 4）、spinner 用静态 `█` 串
- 默认：动效开启（终端用户默认有动效）；CI/无 TTY 自动降级静态

### 9.2 WCAG 对比度

实施时用对比度工具校验所有 6 套主题的 `brand` 对 `background` ≥ AA 4.5:1（§4.4 已初校，amber 深底 AAA / 浅底需 amber-deep）。

### 9.3 屏幕阅读器

mark 是装饰性图形，TUI 无屏幕阅读器场景（终端），不强制 aria。README/官网的 SVG mark 加 `<role="img" aria-label="AtlasCode logo">`。

---

## 10. 品牌战略

### 10.1 品牌名书写规范

| 场景 | 写法 | 示例 |
|---|---|---|
| 对外品牌名（标题/文档/对话） | `AtlasCode`（CamelCase，无空格） | "Welcome to AtlasCode" |
| CLI 命令 / bin 名 | `atlas` / `atlascode`（lower） | `atlas --help` |
| npm 包名 | `@atlasharness/atlascode` | `npm install -g @atlasharness/atlascode` |
| 仓库名 | `AtlasCode` | `github.com/vincentlau2046/AtlasCode` |
| 内部机器标识 | `atlas`（短名） | env `ATLAS_*`、类名 `Atlas*` |
| 句中提及 | `AtlasCode`（不拆 "Atlas Code"） | "AtlasCode supports Ascend NPU" |

### 10.2 去 fork 化清单（Claude Code fork 残留视觉元素）

AtlasCode 是 Claude Code fork，视觉系统继承了大量 Clawd 体系。本 spec 明确去 fork 化范围：

| 元素 | 当前（fork 残留） | 本 spec 处理 |
|---|---|---|
| mark 组件名 `Clawd` | Anthropic Clawd 吉祥物 | → `Beam`（§8.1） |
| mark art `AH_ART` | AtlasHarness "AH" monogram | → `BEAM_ART` 光锥（§8.4） |
| `AnimatedAsterisk.tsx` | Anthropic ✦ mark 动画 | 删除（§8.3） |
| theme 键 `clawd_body`/`clawd_background` | Anthropic Clawd 配色 | → `brand_mark`/`brand_mark_bg`（§8.1） |
| theme `brand` `// Claude orange` 注释 | Anthropic 品牌色 | → `// Atlas-Orange` + 换值（§4.3） |
| 系统 prompt "You are Atlas" | 已去 fork 化（Atlas 非 Claude） | ✅ 保留（L7 内部名） |
| 文件名 `Clawd.tsx` 引用 | 散落 import | 全量改 `Beam.js` |

### 10.3 UA 串

- LLM UA `AtlasCode/<v>`、MCP UA、WebFetch UA `Atlas-User (AtlasCode/<v>; +repo)` 已 0.1.21 收口，**不动**
- `Atlas-User` 串保留（WebFetch 对外 agent 名，已文档化，不改）

### 10.4 系统提示词自我认知

保持 `You are Atlas, a professional coding agent…`（`src/tui/constants/system.ts:18-20`）。理由：L7 第三层"内部机器标识 = atlas"，系统提示词是 LLM 内部指令非对外品牌面，"Atlas" 是合规短名。改 "You are AtlasCode" 会让内部标识与对外品牌混淆，违 L7 分层。

---

## 11. 资产目录奠基

### 11.1 当前现状

零视觉资产目录（`assets/` / `docs/assets/` / `public/` 均不存在）。README 零 `![]()` 图片引用。npm `files: ["dist"]` 不含图片。

### 11.2 本 spec 范围

新建 `docs/assets/` 目录，首批资产：

| 资产 | 格式 | 用途 |
|---|---|---|
| `docs/assets/ascend-beam-mark.svg` | SVG 源（矢量） | mark 设计源、README 引用、未来官网 |
| `docs/assets/ascend-beam-mark.png` | PNG 128×128 / 512×512 | GitHub repo social preview、npm 包页面 |
| `docs/assets/wordmark.svg` | SVG | "AtlasCode" wordmark（暖冷对照色） |
| `docs/assets/brand-system-spec.md` | md | 色板/字号/间距规范（设计 token 文档） |

**npm 包不含图片**：CLI 工具无需二进制图片资产（TUI mark 是块字符渲染，非图片）。`package.json` `files: ["dist"]` 不变。README 引用 `docs/assets/` 相对路径（git 仓可见，npm 不可见——CLI 用户不需要 README logo）。

### 11.3 远期（非本 spec）

- favicon.ico（官网用，CLI 不需要）
- 桌面端 icon（atlasDesktop.ts 若激活，`.icns`/`.ico` 多尺寸）
- atlasoffice 品牌资产（AtlasOffice 实施时）

---

## 12. Branded House 扩展 · AtlasOffice 接缝

### 12.1 接缝设计（不预建内容）

AtlasOffice 同家族光锥母题，但降饱和 + 换顶点字符区分态：

| 项 | AtlasCode | AtlasOffice（远期） |
|---|---|---|
| 顶点字符 | `█`（满块，算力激活光心） | `▀`（上半块，空心通用基座态） |
| 渐变 | 满渐变（blue→amber 5 档） | 单色低饱和（brand 单色） |
| `ACCENT_HUE` | `'compute'` | `'neutral'` |
| tagline | `算力驱动的 Coding Agent` | `通用 Coding Agent`（远期定） |
| ascend 域包 | 挂载 | 不挂载（charter L299） |

### 12.2 identity 接缝

`shared/identity.ts` 的 `PRODUCT_NAME`/`PRODUCT_BRAND`/`ACCENT_HUE` 是配方注入点。AtlasOffice 配方（Step 3 独立工单）改这三个值 + mark 顶点字符常量，全触面跟着变，零运行时 `if(product==='office')` 分支（守 charter L945）。

### 12.3 不预付复杂度（charter L101）

本 spec **不设计 AtlasOffice mark/色板/tagline 具体内容**，只在 identity 层与 Beam.tsx 留好非阻塞接缝（`ACCENT_HUE` 分支、顶点字符常量）。AtlasOffice 实施时另起 spec。

---

## 13. 迁移时序与实施计划

### 13.1 时序（用户已定）

```
当前 (0.1.22) ──> TUI 优化专项 (0.1.23+) ──> 品牌系统落地 (0.2.x 单独版本)
   │                    │                          │
   └ spec 设计（本文件）  └ TUI P0a/P0b/P1a 列车     └ 本 spec 实施
     不落地代码            完成后触发品牌实施
```

- **不挂 0.1.23**：0.1.23 是 TUI P0a 回归列车（memory `tui-optimization-division`），品牌不并轨
- **0.2.x breaking 窗口**：品牌色变更（Claude orange → Atlas-Orange）+ mark 变更（AH → Beam）是用户可见 breaking，走 minor bump（0.1.x → 0.2.0）
- **master 不开分支**：直接在 master 上实施，不开 feature 分支；实施完作为 0.2.x 独立版本发布
- **feature flag 回退**：不设回退 flag（品牌系统是确定方向，不预留旧视觉回退；若需回退靠 `git revert` 发布补丁）

### 13.2 实施工单分解（实施时落 writing-plans）

| 工单 | 范围 | 依赖 |
|---|---|---|
| BR-1 identity 扩常量 | `shared/identity.ts` Step 1 + 触面改 import Step 2 | 无 |
| BR-2 theme 色板重构 | `theme.ts` 6 套主题 brand/clawd_body → brand_mark + 渐变色板 | BR-1 |
| BR-3 Beam 组件 | `Clawd.tsx`→`Beam.tsx` + `AnimatedClawd`→`AnimatedBeam` + 删 `AnimatedAsterisk` | BR-2 |
| BR-4 触面 leak 修复 | LogoV2/WelcomeV2/CondensedLogo/errorMessaging 全 `${PRODUCT_BRAND}` 化 | BR-1 |
| BR-5 资产目录 | `docs/assets/` SVG/PNG + README 引用 | BR-3 |
| BR-6 e2e 基线重生成 | user-e2e/compare + tui-diff 启动屏快照重生成 | BR-4 |
| BR-7 真机多终端验证 | iTerm2/GNOME/kitty/Windows Terminal/Alacritty 截图校验 | BR-6 |

---

## 14. 验证计划

### 14.1 e2e 基线重生成

- `user-e2e/compare/` + `user-e2e/tui-diff/` 现有 TUI 启动屏快照基线（含 "AtlasHarness" 文本）需重生成
- 时序：BR-4 落地后重生成，旧基线 archive（不删，保留回归历史）

### 14.2 真机多终端验证矩阵

| 终端 | truecolor | CJK 宽度 | 验证点 |
|---|---|---|---|
| iTerm2 (macOS) | ✅ | — | 渐变 5 档渲染 |
| GNOME Terminal (Linux) | ✅ | 中文 locale 测 `█` 宽度=1 | CJK 安全验证 |
| kitty | ✅ | — | CSI-u 兼容（memory `tui-optimization-division` P1a R1） |
| Windows Terminal | ✅ | — | 渐变 + 块字符 |
| Alacritty | ✅ | — | 渐变 |
| Apple Terminal | ❌ 降级 | — | ANSI 16 色降级形态 |
| CI (no TTY) | ❌ 单色 | — | 单色块字轮廓 |

### 14.3 WCAG 校验

实施时用对比度工具（如 `color-contrast-checker`）校验 6 套主题 brand 对 background ≥ AA 4.5:1，结果记入 `docs/assets/brand-system-spec.md`。

### 14.4 验收 gate

- [ ] `grep -rn "AtlasHarness" --include="*.ts" --include="*.tsx" src/` 排除注释行后 = 0（CI grep 门，charter L8 ③ review 桶加一条）
- [ ] TUI 启动屏真机截图（≥3 终端）显 AtlasCode + 光锥 mark + 暖金顶点
- [ ] errorMessaging 4 处错误消息显 AtlasCode
- [ ] 6 套主题 brand 色对比度 ≥ AA
- [ ] reduced-motion 下 mark/spinner 静态
- [ ] e2e 基线重生成 + 全绿

---

## 15. 风险与回退

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 块字符 `█` 在某冷门终端宽度异常 | 低 | mark 错位 | §14.2 真机验证矩阵覆盖主流终端；`stringWidth()` 已校验 Neutral 宽度 |
| errorMessaging 改品牌名破坏子串匹配 | 中 | 错误分支误判 | §7.1 实施前 grep `includes('AtlasHarness')` 核查清单 |
| 品牌色变更用户感知 breaking | 高 | 用户困惑 | 0.2.0 release notes 说明 + README 截图更新 |
| AnimatedClawd 重构引入性能回归 | 中 | TUI 启动卡顿 | 保 react compiler memo 结构；启动性能 profiler 对比（memory `tui-optimization-division` P0a 已有 profiler 基建） |
| AtlasOffice 远期需求迫使 mark 重做 | 低 | 返工 | §12 接缝设计预留 ACCENT_HUE + 顶点字符常量，非阻塞 |

**回退策略**：不设 feature flag。若 0.2.0 发布后严重问题，`git revert` + 0.2.1 补丁回退到 0.1.x 视觉。

---

## 16. 与 charter 对齐

| charter 条目 | 本 spec 对齐 |
|---|---|
| L7 命名三层 | §1.2 三层对齐，内部层 atlas 不动 |
| L72 b identity 注入裁定 | §6 identity.ts 扩常量，Step 3 --define 归后续（不引 IdentityPort，身份串是静态常量） |
| L80 IDN-1 identity 机制 | §6.1 现状差距 + §6.2 落地路径 |
| L101 不预付 AtlasOffice 复杂度 | §12 只留接缝不预建内容 |
| L299/L384 不挂 ascend = AtlasOffice | §12.1 AtlasOffice 不挂 ascend 域包 |
| L940 身份串 --define 注入 | §6.2 Step 3（独立工单） |
| L945 不预埋运行时产品开关 | §6.2 Step 2 全触面 import 单一事实源，零 `if(product==='office')` 分支 |

---

## 17. 决策点状态（本轮审批已定）

1. **tagline**：✅ `算力驱动的 Coding Agent`（§3.4）
2. **色板**：✅ 暖金 `#FFB800` 顶点 + 冷蓝 `#0066FF` 底渐变（§4.1）
3. **pose 机制**：✅ 废弃重写上爬动效（§8.2）
4. **时序**：✅ 0.2.x 单独版本 + master 不开分支 + 不设 feature flag（§13.1）
5. **FEEDBACK_CHANNEL 值**：建议 `https://github.com/vincentlau2046/AtlasCode/issues`（实施时定，非阻塞）
6. **是否加 `--no-animation` CLI flag**：reduced-motion 默认 env 推断（推荐，实施时定）
7. **P2 历史"移植自 AtlasHarness"注释清尾时机**：随大重构（推荐，非 0.2.0 必须）

---

**审批后下一步**：spec 已审批通过 → 作为设计文档存档 → **等 TUI 优化专项完成后**转 `writing-plans` skill 生成实施计划（不现在落地代码）。
