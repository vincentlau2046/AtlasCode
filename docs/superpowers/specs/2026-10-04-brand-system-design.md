# AtlasCode 品牌系统设计 spec

> **状态**：设计 spec，待审批 · **不落地代码** · 实施在 TUI 优化专项完成后以**多个干净 0.1.x 版本**逐一落地（不升 0.2.x）
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
| 迁移时序 | **先 spec 不落地**（不挂 0.1.23、不与 TUI 列车并轨）；TUI 优化专项完成后，**完整方案拆成多个干净 0.1.x 版本逐一落地**（UA 品牌串 BR-8 起头，随后色板/mark/Beam/动词池逐工单排进后续 0.1.x），**全程 0.1.x、不升级 0.2.x**——用户 2026-10-05 裁定「通过多个 0.1.x 干净版本落地完整方案，不想升级大版本」 |
| npm scope | `@atlasharness` 作为家族序列 scope **保留不迁**（未来 `@atlasharness/atlasoffice` 同族） |
| UA 品牌串 | 「品牌 + 版本 + repo URL」三段定式，**无字面 `+` 号**，identity 单一事实源 + delta ⑥ 版本段收口（§10.3）；**作为完整方案 0.1.x 序列的起点版本**实施（§13.1） |

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
| **mark** | 5 行渐变三角 + 顶点光心 | 顶点呼吸脉冲 |
| **spinner** | `█████` 光束串 + `<verb>…` 状态行 | 从底向顶**逐行点亮**（"光扫上爬"= Ascend 上升动效）；verb 池为算力+意象双轴（§7.4） |
| **进度条** | `███░░░░` 光束填充 | 光束向前推进 |
| **边框角标** | `╱` 斜线角装饰（U+2572 Neutral） | — |
| **分隔线** | `█ █ █` 光束串（Block Elements，CJK 安全） | — |
| **空态底纹** | 暗淡 `░` 光锥底纹 | — |
| **闲时 tips 轮播** | prefix `·` 改 `▀` 光锥顶点色块 | 切换瞬间光扫渐显 |

**闲时态说明**：spinner 静止后，status line 闲时 tips（`useDynamicTips.ts` 12s 轮播 6 条命令提示）是 TUI 唯一动效触面。光锥母题延伸至此——tips 前缀 `·` 改为光锥顶点色块 `▀`（brand_mark 色），切换时用"光扫渐显"动画（80ms 渐入）而非硬切。这让闲时态仍保持品牌视觉认知，不退化为纯灰文本。

**loading 动效预览**（光扫上爬，4 帧循环，顶点 █ 全程 amber 高亮 + 脉冲）：
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

5 行实心收敛三角，9 宽 × 5 高（与现有 `Clawd.tsx` `AH_ART` 槽位 9×5 + `src/tui/utils/logoV2Utils.ts` 布局常量 `MAX_LEFT_WIDTH=50`（L18）/ `calculateOptimalLeftWidth`（L80）"Minimum for clawd art 20"（L89）兼容，零布局改动）。顶点光心靠颜色 + 脉冲动效传递，不靠字符形状：

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

### 4.3 主题映射（6 套，替换当前继承 Claude orange 的 UI 品牌色 brand 族）

`src/tui/utils/theme.ts` 现有 6 套主题（代码实测名，2026-10-05 核对）。`brand` 当前 3 值 ×2：`rgb(215,119,87)` `// Claude orange`（darkTheme:433 / lightTheme:116）、`ansi:redBright`（darkAnsiTheme:275 / lightAnsiTheme:196）、`rgb(255,153,51)` `// Orange adjusted for deuteranopia`（darkDaltonizedTheme:512 / lightDaltonizedTheme:354）——均属 Anthropic 橙族。本 spec 替换：

| 主题（代码名 · 位置） | 当前 brand | 新 brand | mark 渐变 | 备注 |
|---|---|---|---|---|
| `darkTheme`（:430） | `rgb(215,119,87)` | `rgb(255,184,0)` amber | truecolor 5 档（底蓝调暗 `#0050CC`） | 深底对比度校验 |
| `lightTheme`（:113） | `rgb(215,119,87)` | `rgb(217,119,6)` amber-deep | truecolor 5 档（底蓝调亮） | 浅底对比度校验（§4.4 AA） |
| `darkAnsiTheme`（:272） | `ansi:redBright` | `ansi:yellowBright` | 两档 `blueBright`→`yellowBright` | 16 色终端 |
| `lightAnsiTheme`（:193） | `ansi:redBright` | `ansi:yellowBright` | 同上 | 16 色终端 |
| `darkDaltonizedTheme`（:509） | `rgb(255,153,51)` | `rgb(255,184,0)` | 蓝→金（色盲安全） | 色盲变体基底 |
| `lightDaltonizedTheme`（:351） | `rgb(255,153,51)` | `rgb(255,184,0)` | 蓝→金（色盲安全） | 同上 |

**BR-2 换值范围 = 3 键（纯 UI 品牌色）**：`brand`（上表 6 套）+ `brandShimmer`（theme.ts:117/434/197/276/355/513，当前"Lighter brand orange"，随 brand 换浅一档暖金）+ `briefLabelAssistant`（theme.ts:172/488/251/330/409/567，随 brand 同步映射，漏它会让 assistant 消息标签残留 Claude orange）。

**`clawd_body`/`clawd_background` 归 BR-3**：mark 主体/背景色（AH_ART 用色），含 `clawd_body`→`brand_mark`、`clawd_background`→`brand_mark_bg` 键改名（去 Anthropic Clawd 命名残留），全部随 §8.1 Clawd→Beam 重构 pending，BR-2 不碰（用户 2026-10-05 裁定：**凡 clawd 术语内容均归 BR-3**）。

### 4.4 无障碍

- **WCAG 对比度**：amber `#FFB800` 对深底（`#1e1e1e`）对比度 ≈ 10.3:1（AAA）；对浅底（`#ffffff`）≈ 1.8:1（不足）→ light 主题用 `amber-deep #D97706`（对比度 ≈ 4.6:1 AA）。spec 实施时用工具校验所有主题 brand 对 background 的对比度 ≥ AA 4.5:1。
- **色盲**：2 套 daltonized 主题变体（代码注释标 deuteranopia adjusted，`theme.ts:354/512`）用蓝→金渐变（蓝金轴对红绿色盲可辨），不依赖红绿区分。
- **动效**：顶点脉冲 + 光扫上爬 + tips 渐入等动效**始终开启**（不做 reduced-motion 探测，详见 §9.1）。

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

### 5.1 响应式布局（不缩 mark）

| 终端宽度 | 布局 | mark 处理 |
|---|---|---|
| ≥ 70 col | horizontal（现有 `getLayoutMode`） | 完整 9×5 光锥 + 渐变 |
| < 70 col | compact | **完整 9×5 光锥**（9 宽本就窄，70col 容得下；只调周围布局，不缩 mark） |
| CondensedLogo（侧栏凝缩态） | 单行 `Atlas█` mark icon + wordmark | 顶点色块作 icon（凝缩态本就该极简，独立组件非降级） |

**不缩 mark 理由**：光锥 9 宽是设计最小单元，70col 终端留 60+col 给文本仍充足；3×3 mini 光锥会丢渐变层次（3 行承不了 5 档），破坏品牌识别。compact 模式只调布局间距，mark 形态不变。

`src/tui/utils/logoV2Utils.ts` `calculateOptimalLeftWidth`（L80）的 "Minimum for clawd art 20"（L89）注释改为 "Minimum for beam art 9"（光锥更窄，布局更省）。

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
export const FEEDBACK_CHANNEL = 'https://github.com/vincentlau2046/AtlasCode/issues'  // 新增（charter 列明，当前 undefined 是 bug 症状）
export const ACCENT_HUE = 'compute'                      // 新增（配方注入；atlasoffice='neutral'）
// FAMILY_MARK_PEAK 不进 identity（视觉常量归 theme/brand 模块，非身份串）
```

**Step 1b（BR-8 · 完整方案 0.1.x 序列的起点版本）**：WebFetch UA 共用 builder 进 `shared/identity.ts`——**只用现有 identity.ts 常量**（`PRODUCT_NAME`/`getVersion`/`REPOSITORY_URL`，均已在库），不依赖后续视觉工单 BR-1 的 `PRODUCT_FAMILY`/`PRODUCT_BRAND` 扩展，故 BR-8 可与 BR-1~BR-7 解耦、单独起一个干净 0.1.x（序列第一版）：

```ts
// BR-8（§10.3）：WebFetch UA 共用 builder（tui ④ 与 engine ⑤ 同一出处，零分叉）。
// 'Atlas-User' = 家族级 WebFetch agent 名（robots.txt 匹配串，Branded House 共享面 §12）。
export function buildWebFetchUserAgent(): string {
  return `Atlas-User (${PRODUCT_NAME}/${getVersion()}; ${REPOSITORY_URL})`
}
// 后续视觉工单 BR-1 落地 PRODUCT_FAMILY/PRODUCT_BRAND 后，'Atlas-User' 可切
// `${PRODUCT_FAMILY}-User`、版本段可切 PRODUCT_BRAND（同值，无行为变化）——归后续 0.1.x 视觉工单。
```

**Step 2（本 spec）**：所有品牌触面改 `import { PRODUCT_BRAND, PRODUCT_FAMILY } from 'shared/identity'` 而非硬编码 `'AtlasCode'`——单一事实源落地。未来 atlasoffice 配方改一个常量值，全触面跟着变，零代码分支。

**Step 3（独立工单，非本 spec）**：`--define` 构建配方机制 + atlasoffice 配方文件 + MACRO.VERSION 去漂移。本 spec 只留接缝（`ACCENT_HUE`/`PRODUCT_BRAND` 的配方注入点），守 charter L101。

---

## 7. 触面文件映射（逐文件改动清单）

### 7.1 用户可见 AtlasHarness leak 全量收口（BR-4 · 纯机械字面替换 · **全量一次性**）

> **改法（用户 2026-10-05 裁定，2026-10-05 复核扩展）**：`AtlasHarness` → `AtlasCode` 纯字面替换，**不碰 mark art、不做 identity 化**（`${PRODUCT_BRAND}` 单一事实源归 BR-1 身份工单后续 sweep），零依赖、最可靠。
>
> **范围修正（2026-10-05 代码级复核）**：原「12 处」严重低估——实测全仓用户可见 `AtlasHarness` ~**80 处 / ~40 文件**。BR-4 从「12 处启动屏+错误消息」**扩展为全量用户可见面一次性收口**（用户裁定：扩展为全量一次性收口）。**排除**两类（非本次对象）：① mdm 注册表路径（`mdm/constants.ts:23,25` `HKLM/HKCU\SOFTWARE\Policies\AtlasHarness`，文件系统标识，暂缓同 npm scope 理由，见 §10.5）；② `ascend/*` + `engine/session/*` 的「从 AtlasHarness 移植」迁移溯源注释（~150 处，P2，§7.7）。

**P0 启动屏 + 错误消息子集（每轮启动 / 高频必现，先行核对）**：

| 文件:行 | 当前 | 改为 | 备注 |
|---|---|---|---|
| `src/tui/components/LogoV2/LogoV2.tsx:204` | `AtlasHarness` | `AtlasCode` | borderTitle |
| `src/tui/components/LogoV2/LogoV2.tsx:205` | `AtlasHarness` | `AtlasCode` | compactBorderTitle |
| `src/tui/components/LogoV2/Clawd.tsx:110` | `AtlasHarness` | `AtlasCode` | wordmark 文字（AH_ART 属 BR-3 不碰） |
| `src/tui/components/LogoV2/Clawd.tsx:136` | `AtlasHarness` | `AtlasCode` | AppleTerminal 分支同款 |
| `src/tui/components/LogoV2/WelcomeV2.tsx:12` | `Welcome to AtlasHarness` | `Welcome to AtlasCode` | AppleTerminalWelcomeV2 |
| `src/tui/components/LogoV2/WelcomeV2.tsx:31` | `Welcome to AtlasHarness` | `Welcome to AtlasCode` | 主分支 |
| `src/tui/components/LogoV2/WelcomeV2.tsx:116` | `Welcome to AtlasHarness` | `Welcome to AtlasCode` | 主分支 |
| `src/tui/components/LogoV2/CondensedLogo.tsx:51` | `AtlasHarness` | `AtlasCode` | 凝缩 logo |
| `src/modelprovider/errorMessaging.ts:85,123,129,380` | `...to AtlasHarness...`（×3）+ `AtlasHarness is unable...` | `AtlasCode` | 账号/组织/用量错误 ×4 |

**全量收口清单（超出 12 处的其余用户可见面，按高频→低频分组，均字面 `AtlasHarness`→`AtlasCode`）**：

| 触面 | 文件 | 处 |
|---|---|---|
| 权限弹框（每次权限请求必现） | `src/permissions/filesystem.ts` + `src/tui/utils/permissions/filesystem.ts` | 11+11 |
| 自动更新 | `src/tui/cli/update.ts` + `src/tui/utils/autoUpdater.ts` | 10+2 |
| 安装器 | `src/tui/commands/install.tsx` + `localInstaller.ts` + `nativeInstaller/installer.ts` + `pidLock.ts` | 5+1+2+1 |
| 主循环 / REPL | `src/tui/main.tsx` + `src/tui/screens/REPL.tsx` | 8+3 |
| 模型 / MCP 界面 | `src/tui/utils/model/model.ts` + `ModelSetup.tsx` + `services/mcp/client.ts` + `MCPRemoteServerMenu.tsx` | 5+1+4+1 |
| 提交签名（每次 commit 写入） | `src/tui/utils/attribution.ts` | 3 |
| insights / 状态通知 / onboarding | `src/tui/commands/insights.ts` + `statusNoticeDefinitions.tsx` + `projectOnboardingState.ts` | 4+2+1 |
| swarm / 遥测 | `src/swarm/constants.ts` | 3 |
| 其余用户可见（各 1-2 处） | `apiErrors.ts`/`atlasDesktop.ts`/`Shell.ts`/`completionCache.ts`/`commands.ts`/`git.ts`/`preflightChecks.tsx`/`setup.ts`/`HelpV2.tsx`/`Feedback.tsx`/`AddWorkspaceDirectory.tsx`/`FilePermissionDialog/permissionOptions.tsx`/`PluginTrustWarning.tsx`/`marketplacePreset.ts`/`marketplaceManager.ts`/`computerUse/wrapper.tsx`/`WebFetchTool/preapproved.ts`/`SendMessageTool/SendMessageTool.ts`/`engine/tools/team/sendMessageTool.ts`/`engine/tools/web/preapproved.ts`/`permissions/PermissionRule.ts` 等 | ~25 |

> **实施口径（机械替换）**：`grep -rln "AtlasHarness" src/` 得全量文件 → **排除** mdm 注册表 + ascend/engine 迁移注释 → 其余文件每个 `AtlasHarness`→`AtlasCode` 全局替换。文件内注释（如 Clawd.tsx "AH 子母 logo...AtlasHarness" 注释、launcher.ts 注释）随同替换或保留，无行为差异。
>
> **⚠️ 编译产物注意**：`LogoV2` 目录 4 个组件（`LogoV2/Clawd/WelcomeV2/CondensedLogo.tsx`）是 **React Compiler 编译产物**（含 `_c` memo cache + 尾部 base64 source map），非手写 JSX。字面替换直接作用于编译产物中的字符串字面量即可（历史上 AtlasHarness rebrand 即如此改编译产物）；尾部 base64 source map 是 stale/dev-only，不进 `dist`，无需同步。
>
> **errorMessaging 安全性核查（已复核）**：4 处均为纯字符串字面量，**无 `includes('AtlasHarness')` 子串匹配**，替换安全。无 i18n 双语版本。✅ 无需额外处理。

**验收 gate（扩展后）**：`grep -rn "AtlasHarness" src/` 排除注释行后，**仅剩** mdm 注册表路径（`mdm/constants.ts:23,25`）与 ascend/engine 迁移注释——即「用户可见字符串字面量中的 AtlasHarness = 0」。

### 7.2 commit/PR 签名行 leak（高频用户可见 · 每次 git commit 写入）

`src/tui/utils/attribution.ts` 生成 commit trailer + PR body 签名，**每次 git commit 都写入**——这是最高频用户可见品牌串之一，当前 3 处仍 `AtlasHarness`：

| 文件:行 | 当前 | 改为 | 备注 |
|---|---|---|---|
| `src/tui/utils/attribution.ts:74` | `🤖 Generated with [AtlasHarness](${PRODUCT_URL})` | `🤖 Generated with [${PRODUCT_BRAND}](${REPOSITORY_URL})` | PR body 默认签名 |
| `src/tui/utils/attribution.ts:77` | `Co-Authored-By: ${modelName} <vincent.lau2046@gmail.com>` | 保留（邮箱是用户个人 git config，非品牌串） | commit trailer |
| `src/tui/utils/attribution.ts:321` | `🤖 Generated with [AtlasHarness](${PRODUCT_URL})` | `🤖 Generated with [${PRODUCT_BRAND}](${REPOSITORY_URL})` | 增强签名 fallback |
| `src/tui/utils/attribution.ts:367` | `🤖 Generated with [AtlasHarness](${PRODUCT_URL}) (${atlasPercent}% …)` | `🤖 Generated with [${PRODUCT_BRAND}](${REPOSITORY_URL}) (${atlasPercent}% …)` | 增强签名主形态 |

**`PRODUCT_URL` 统一**：`src/tui/constants/product.ts:3` `PRODUCT_URL='https://github.com/vincentlau2046/AtlasCode'` 已正确（URL 对），但 attribution.ts 用 `[AtlasHarness](${PRODUCT_URL})` 是"URL 对、品牌名错"。**分层落地（2026-10-05 复核澄清）**：① **BR-4** 只做字面 `AtlasHarness`→`AtlasCode`（3 处 L74/321/367，纯机械，不碰 URL/PRODUCT_URL）；② **BR-1** 可选 refine `[AtlasCode]`→`[${PRODUCT_BRAND}]` + `PRODUCT_URL`→`REPOSITORY_URL`（identity 单一事实源，去 `PRODUCT_URL` 重复定义）。BR-4 不越界到 identity 化。attribution 属 user-visible 面，已并入 §7.1 全量清单。

**模型名 `Atlas Opus 4.6`**（L73）：已用 "Atlas" 短名（L7 合规），但 "Opus" 是 Anthropic 模型族名。AtlasCode 接国产 LLM 后端（Qwen38 等），签名模型名应反映实际后端——本 spec **不硬编码模型族名**，改用 `${shortModelName}` 动态取（attribution.ts L367 已有 `shortModelName` 变量，L74 的 `modelName` 同步改动态）。

**签名 `🤖` emoji**：保留（emoji 是跨品牌通用符号，非 Anthropic 专属；`🤖 Generated with` 是 GitHub 生态约定俗成的 AI 辅助提交标记，去 emoji 反而打破惯例）。

### 7.3 闲时动态文字品牌化（useDynamicTips）

`src/tui/components/StatusLine/useDynamicTips.ts` 闲时 tips 轮播（12s 周期 6 条命令提示），现状纯文本 + prefix `·`（L77 `PREFIX_CHAR`）。本 spec 品牌化：

| 项 | 当前 | 改为 |
|---|---|---|
| `PREFIX_CHAR`（L77） | `·` | `▀`（光锥顶点色块，brand_mark 色） |
| tips 切换 | 硬切 | 80ms 渐入 |
| IDLE_TIPS 内容 | 6 条命令提示 | **保留**（已中文化、无品牌串 leak） |

**理由**：闲时态是 spinner 静止后 TUI 唯一动效触面，prefix `·` 改 `▀` 让光锥母题延伸到闲时，品牌视觉认知不断档。tips 内容已合规不动。

### 7.4 Spinner 动词池重写（最高频品牌人格触面 · 每次 LLM 推理显示）

`src/tui/constants/spinnerVerbs.ts` 的 `SPINNER_VERBS`（**186 个** whimsical 动词，代码实测 2026-10-05）+ `src/tui/components/Spinner.tsx:139`（`randomVerb` useState initializer）主 spinner 渲染：挂载时随机抽一个动词，显示为 `· <verb>… (elapsed · ↓ tokens)` 状态行。

**现状问题**：
- L45 `'Clauding'` —— Anthropic Claude 品牌串直接混在动词池（用户看到的 `· clauding…` 来源）
- 整个 186 动词池是 Claude Code fork 的"幽默 whimsical"人格（`Beboppin'`/`Discombobulating`/`Flibbertigibbeting`/`Razzmatazzing`/`Shenaniganing`/`Tomfoolering`/`Whatchamacalliting`…）——Anthropic Claude 品牌人格表达，非 AtlasCode 调性
- `turnCompletionVerbs.ts` 8 个过去式（`Baked`/`Brewed`/`Cogitated`…）同款 whimsical 调性

**重写方向（已定 · 算力 + 意象混合池）**：

删 `Clauding` + 整个 whimsical 池，重写为**双轴混合**——核心算力动词 + 昇腾光锥意象动词，呼应 AtlasCode 差异化双轴（算力 × coding agent）+ 光锥 mark 的 Ascend 攀升叙事：

```ts
// src/tui/constants/spinnerVerbs.ts（重写）
export const SPINNER_VERBS = [
  // ── 算力轴（45）：编译/推理/优化/编排/算子开发语义 ──
  'Compiling', 'Inferring', 'Synthesizing', 'Optimizing', 'Orchestrating',
  'Profiling', 'Vectorizing', 'Parallelizing', 'Quantizing', 'Scheduling',
  'Dispatching', 'Pipelining', 'Tiling', 'Fusing', 'Lowering',
  'Analyzing', 'Computing', 'Crunching', 'Hashing', 'Resolving',
  'Indexing', 'Tracing', 'Instrumenting', 'Diagnosing', 'Verifying',
  'Transpiling', 'Linking', 'Loading', 'Executing', 'Evaluating',
  'Benchmarking', 'Debugging', 'Refactoring', 'Parsing', 'Tokenizing',
  'Embedding', 'Aligning', 'Calibrating', 'Tuning', 'Pruning',
  'Distilling', 'Caching', 'Streaming', 'Decoding', 'Encoding',
  // ── 意象轴（25）：攀升/光锥/聚焦/加速动势（呼应昇腾光锥 mark）──
  'Ascending', 'Climbing', 'Summiting', 'Rising', 'Elevating',
  'Converging', 'Focusing', 'Beaming', 'Illuminating', 'Kindling',
  'Forging', 'Crafting', 'Building', 'Shaping', 'Refining',
  'Exploring', 'Navigating', 'Mapping', 'Charting', 'Pioneering',
  'Awakening', 'Igniting', 'Catalyzing', 'Amplifying', 'Accelerating',
  // ── 哲学轴（20）：Atlas 擎天智者/知识承载语义——深度思辨、追问、洞察 ──
  // 思辨（深度思考的正式感，非幽默自嘲）
  'Reasoning', 'Pondering', 'Deliberating', 'Reflecting', 'Imagining',
  'Cerebrating', 'Cogitating', 'Ruminating', 'Contemplating', 'Considering',
  // 追问（追问本质、洞察真相）
  'Philosophising', 'Pontificating', 'Deciphering', 'Perusing', 'Mulling',
  // 愿景（承载知识、构想未来——Atlas 权威地图集语义）
  'Envisioning', 'Determining', 'Mustering', 'Musing', 'Discerning',
  // ── 趣味轴（26）：从 fork 原 186 池保留有算力/构造/物理意象的幽默动词 ──
  // 算力化学/相变意象（加热、结晶、电离——幽默呼应算力升温）
  'Brewing', 'Cooking', 'Crystallizing', 'Caramelizing', 'Fermenting',
  'Ionizing', 'Photosynthesizing', 'Percolating', 'Simmering', 'Stewing',
  'Levitating', 'Transmuting', 'Metamorphosing', 'Unfurling',
  // 工匠趣味（修补/自举）
  'Tinkering', 'Bootstrapping',
  // 烹饪数据双关（切片/搅拌/腌制——Tiling/Hashing 的趣味版）
  'Julienning', 'Whisking', 'Kneading', 'Marinating',
  // 探索/执行趣味
  'Spelunking', 'Foraging', 'Meandering', 'Skedaddling', 'Swooping',
  'Warping', 'Transfiguring',
  // ── 通用收尾（13）：保多样性、避免高频重复 ──
  'Working', 'Processing', 'Thinking', 'Generating', 'Producing',
  'Assembling', 'Composing', 'Constructing', 'Investigating',
  'Researching', 'Studying', 'Reviewing', 'Planning',
];
```

- **算力轴**（45 个）：编译/推理/优化/编排等 coding agent + NPU 算力语义，含 `Tiling`/`Fusing`/`Lowering`/`Quantizing`/`Transpiling` 等 Ascend 算子开发专属动词（AtlasCode 差异化能力）
- **意象轴**（25 个）：`Ascending`/`Climbing`/`Summiting` 直扣 Ascend 擎天攀升，`Converging`/`Focusing`/`Beaming`/`Illuminating` 呼应光锥收敛聚焦，`Pioneering`/`Catalyzing`/`Amplifying`/`Accelerating` 传递算力加速——纯动势，不混入思辨动词
- **哲学轴**（20 个）：**Atlas 擎天智者/权威地图集语义**——深度思辨（`Reasoning`/`Pondering`/`Deliberating`/`Reflecting`/`Cerebrating`/`Cogitating`/`Ruminating`/`Contemplating`）、追问本质（`Philosophising`/`Pontificating`/`Deciphering`/`Perusing`/`Mulling`/`Discerning`）、愿景与知识承载（`Envisioning`/`Determining`/`Mustering`/`Musing`/`Imagining`/`Considering`）。与光锥 mark 的一动一静互补——光锥是上升聚焦动势，哲学是沉淀深度思辨；同时诚实表达 LLM 推理时在"思考"
- **趣味轴**（27 个）：**从 fork 原 186 池保留**有算力/构造/物理意象的幽默动词——算力化学相变（`Crystallizing`/`Caramelizing`/`Ionizing`/`Fermenting`，幽默呼应算力升温）、烹饪数据双关（`Julienning`/`Whisking`/`Kneading`，Tiling/Hashing 的趣味版）、探索执行（`Spelunking` 深挖代码库/`Warping` 算力加速扭曲）。**保留 fork 品牌人格的趣味性，但只留与算力/构造/物理意象同调的**，排除纯荒诞词（`Beboppin'`/`Discombobulating`/`Flibbertigibbeting`/`Razzmatazzing`/`Shenaniganing`/`Tomfoolering`/`Whatchamacalliting` 等）和 fork 专属梗（`Clauding`/`Gitifying`/`Hyperspacing`/`Quantumizing`）
- **通用收尾**（13 个）：`Working`/`Processing`/`Thinking` 等保多样性，避免高频重复显眼
- **共 ~130 个**（vs fork 186 个）——保 70% 体量，零跨轴重复已校验；四轴覆盖算力硬核（45）+ 光锥动势（25）+ 哲学深度（20）+ 趣味幽默（27）+ 通用（13），品牌人格立体
- **重复率机制澄清**（2026-10-05 代码核对）：spinner 动词**不是 12s 轮播**——`Spinner.tsx:139` 是挂载时 `useState` 一次性 `sample()`，`TeammateSpinnerLine.tsx:80-81` / `spawnInProcess.ts:171-172` 各自挂载/回合时重抽，`SystemTextMessage.tsx:591` 每回合完成时抽过去式。130 池 + 每挂载/每回合重抽，用户感知重复率比轮播更低

**`turnCompletionVerbs.ts` 同步重写**（过去式，`<verb> for <duration>`）：
```ts
export const TURN_COMPLETION_VERBS = [
  'Compiled', 'Inferred', 'Synthesized', 'Optimized', 'Orchestrated',
  'Analyzed', 'Computed', 'Crunched', 'Resolved', 'Verified',
  'Ascended', 'Converged', 'Forged', 'Crafted', 'Built', 'Refined',
  'Explored', 'Reasoned', 'Generated', 'Processed',
];
```

**prefix 联动**：`Spinner.tsx` 的 `· <verb>…` 的 `·` prefix 同 §7.3 改 `▀`（光锥顶点色块），与闲时 tips prefix 统一——spinner 活跃态与闲时态都顶光锥顶点色块，品牌视觉贯穿。

**settings 覆盖机制保留**：`getSpinnerVerbs()` 的 `settings.spinnerVerbs`（mode=replace/extend）用户自定义机制保留——用户可注入自己的动词池，默认池改上述重写版。

**核查清单**（实施时验证）：
- [ ] `grep -rni "clauding" src/` 排除 insights.ts multi-clauding 内部术语后 = 0
- [ ] `turnCompletionVerbs.ts` 过去式同步重写（8 个 → 20 个新池）
- [ ] 动词池 4 处消费方验证：`Spinner.tsx:139`（主 spinner）/ `TeammateSpinnerLine.tsx:80-81` / `spawnInProcess.ts:171-172` / `SystemTextMessage.tsx:591`（回合完成过去式）
- [ ] e2e 基线（若含 spinner 动词快照）重生成

### 7.5 built-in agents Claude 文案去 fork 化（全 6 agent 核查）

**核查范围**：`src/tui/tools/AgentTool/built-in/` 全 6 个 agent 文件。

**① atlasCodeGuideAgent.ts**（重灾区，9 处改 + 1 处保留）：

| 行 | 当前 | 改为 |
|---|---|---|
| L18 | `platform.claude.com/llms.txt` | 保留（外部 Anthropic 文档 URL，AtlasCode fork 仍引 Anthropic SDK 文档；改 URL 会断文档源） |
| L29 | `You are the Claude guide agent… Atlas, the Claude Agent SDK, and the Claude API (formerly the Anthropic API)` | `You are the Atlas guide agent… Atlas, the Atlas Agent SDK, and the Atlas API` |
| L35 | `**Claude Agent SDK**: … based on Atlas technology.` | `**Atlas Agent SDK**: … based on Atlas technology.` |
| L37 | `**Claude API**: The Claude API (formerly known as the Anthropic API) …` | `**Atlas API**: … model interaction, tool use, integrations` |
| L52 | `**Claude Agent SDK docs**` | `**Atlas Agent SDK docs**` |
| L59 | `Agent SDK docs are part of the Claude API documentation` | `… part of the Atlas API documentation` |
| L61 | `**Claude API docs** … Claude API (formerly the Anthropic API)` | `**Atlas API docs** … Atlas API` |
| L63 | `Anthropic-defined tools (computer use, code execution…)` | `vendor-defined tools (computer use, code execution…)` |
| L95 | `whenToUse: … ("Can Claude...", "Does Claude...") … Claude Agent SDK … Claude API (formerly Anthropic API) … Anthropic SDK usage` | `… ("Can Atlas...", "Does Atlas...") … Atlas Agent SDK … Atlas API … Atlas SDK usage` |
| L95b | whenToUse 尾部 `check if there is already a running or recently completed claude-code-guide agent`（**stale 内部引用**：`L20 ATLAS_GUIDE_AGENT_TYPE = 'atlas-code-guide'`，agentType 已改 Atlas 名但 L95 仍指旧类型名 `claude-code-guide`，该类型名已不存在于注册表） | `atlas-code-guide`（2026-10-05 代码核对补入；内部 agent 类型名引用非品牌面，随本处一并修正） |

**② exploreAgent.ts:80 + planAgent.ts:90** `omitClaudeMd: true`：
- flag 名指 CLAUDE.md 记忆文件（AtlasCode 用 ATLAS.md）
- **核查**：`omitClaudeMd` 散落 15+ 文件（context.ts/factory.ts/memoryFiles.ts 等全用 `ClaudeMd`/`getAdditionalDirectoriesForClaudeMd`/`setCachedClaudeMdContent` 命名族）
- **裁定**：**保留不改**。理由：(a) `omitClaudeMd` 是内部 API flag 名非用户可见；(b) 改名触及 15+ 文件大范围重构，出 spec scope；(c) AtlasCode 的 ATLAS.md 实际是 CLAUDE.md 的别名（fork 兼容），内部命名留 `ClaudeMd` 不影响用户面。归 F 波清尾候选（低优）。

**③ verificationAgent.ts:22,30,59** `mcp__claude-in-chrome__*`：
- 引用真实 MCP server `claude-in-chrome`（Anthropic 第一方浏览器自动化工具）
- **裁定**：**保留不改**。理由：(a) `mcp__claude-in-chrome__*` 是 MCP 工具名，改名破坏工具匹配（agent 按此名探测工具是否存在）；(b) 这是外部 MCP server 名非 AtlasCode 品牌串；(c) 若用户装了 claude-in-chrome MCP server，工具名就是 `mcp__claude-in-chrome__*`，必须原样引用。

**④ generalPurposeAgent.ts / statuslineSetup.ts**：核查无 Claude 残留（✅ 干净）。

**核查清单**（实施时验证）：
- [ ] atlasCodeGuideAgent.ts L29/35/37/52/59/61/63/95/95b 共 9 处改 Claude→Atlas（含 L95b `claude-code-guide`→`atlas-code-guide`）
- [ ] L18 `platform.claude.com` URL 保留（外部文档源）
- [ ] exploreAgent/planAgent `omitClaudeMd` 保留（内部 flag，归 F 波）
- [ ] verificationAgent `claude-in-chrome` 保留（外部 MCP 工具名）
- [ ] generalPurposeAgent/statuslineSetup 复核无残留

### 7.6 已合规面（不动，仅记录）

| 触面 | 文件 | 状态 |
|---|---|---|
| UA 品牌串五变体 | `http.ts` ×3 + `userAgent.ts` + `webFetchUtils.ts` + `identity.ts buildUserAgent` | ⚠️ 本 spec 标准对象面（§10.3：去 `+` + import 化 + delta ⑥ 收口，BR-8），**独立干净 0.1.x 版本**实施前不动 |
| `--version` / CLI description / program name | `src/cli/parse.ts:417-419,774` | ✅ |
| launcher stderr | `src/atlascode/launcher.ts:12,24` | ✅ |
| headless 提示词 | `src/cli/headlessPrompt.ts:35` | ✅ |
| Node 版本错误 | `src/cli/setup.ts:123` | ✅ |
| MCP server_name | `src/cli/print.ts:434` | ✅ |
| commitAttribution repo allowlist | `src/tui/utils/commitAttribution.ts` | ✅ 已 `vincentlau2046/AtlasCode` |
| releaseNotes repo URL | `src/tui/utils/releaseNotes.ts` | ✅ |
| 系统提示词 "You are Atlas" | `src/tui/constants/system.ts:18-20` | ✅ L7 内部名合规，**不动** |

### 7.7 历史"移植自 AtlasHarness"注释（P2，随大重构清尾）

~150 处 `// 从 AtlasHarness src/... 移植` 注释（集中 `src/ascend/tools/*` + `src/engine/session/*`），非用户可见，零功能影响。本 spec 不强制清尾，归 F 波 ② 类机械替换或下次大重构。

---

## 8. Clawd → Beam 重构（⏸ PENDING · 最后 · 待用户审——BR-3，用户 2026-10-05 判「设计面未充分审核、不靠谱」，停摆放最后）

### 8.1 文件重命名

| 旧 | 新 | 说明 |
|---|---|---|
| `src/tui/components/LogoV2/Clawd.tsx` | `Beam.tsx` | 去 Anthropic Clawd 命名残留 |
| `src/tui/components/LogoV2/AnimatedClawd.tsx` | `AnimatedBeam.tsx` | 同上 |
| theme 键 `clawd_body` | `brand_mark` | 6 套主题同步 |
| theme 键 `clawd_background` | `brand_mark_bg` | 同上 |

### 8.2 pose 机制废弃（已定 · 重写上爬动效）

现有 `AnimatedClawd.tsx` 支持 `ClawdPose = 'default' | 'arms-up'`（2 态，`Clawd.tsx:5`；`arms-up` 跳动作帧 + `APPLE_EYES` 眼睛帧，仅 `CondensedLogo.tsx:44` 全屏模式 `isFullscreenEnvEnabled()` 时触发；普通 TUI `<Clawd />` 静态不触发）。光锥是抽象图形无肢体，pose 机制**整体废弃**，重写为单一"光扫上爬"动效（§2.2 loading 动效）——光锥从底向顶逐行点亮即 Ascend 攀升的微缩表演，品牌语义一致。

**保留**：react compiler runtime `$[n]` memo cache 结构（性能关键，14KB 缓存逻辑不动）、`AppleTerminalClawd` 分支（Apple Terminal 渲染降级，改名为 `AppleTerminalBeam`，保降级逻辑换 art 内容）。

### 8.3 AnimatedAsterisk 处理

`src/tui/components/LogoV2/AnimatedAsterisk.tsx`（7.5KB）是 Anthropic Claude ✦ mark 的动画残留。本 spec **删除**（AtlasCode 不用星号 mark，光锥 mark 用 Beam.tsx 统一）。

**消费方处置**（2026-10-05 代码核对，**有 1 个消费方**，非"零消费"）：`VoiceModeNotice.tsx:9,57`（语音模式通知的 ✦ 动画）。处置：VoiceModeNotice 先改渲染 `▀` 光锥顶点静态色块（brand_mark 色，§7.3 同 prefix 语言），再删 `AnimatedAsterisk.tsx`。实施时 grep `AnimatedAsterisk` 全 src 复核（当前仅此 1 消费方）。

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

### 9.1 动效策略（已定 · 始终开启）

- **不做 reduced-motion 探测**：终端不像浏览器有 `prefers-reduced-motion` media query，环境推断（env/CI）不准确，显式 flag 又增加用户认知负担。
- **动效始终开启**：mark 顶点脉冲、loading 光扫上爬、tips 80ms 渐入、spinner verb 轮播等动效在所有环境（含 CI/无 TTY）始终按设计渲染。
- **降级仅在色彩档位**：truecolor → 256 → 16 ANSI → 单色降级链（§4.2）只影响色彩，不影响动效；单色/no-TTY 环境动效仍跑（用字符形状传递动效，如 spinner 用 `█` 串逐行点亮）。

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
| HTTP User-Agent | `AtlasCode/<version> (repo URL)`（三段定式，**无字面 `+`**，§10.3） | `AtlasCode/0.1.29 (https://github.com/vincentlau2046/AtlasCode)` |
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
| commit/PR 签名 `🤖 Generated with [AtlasHarness]` | AtlasHarness 品牌名 × 3 处 | → `[${PRODUCT_BRAND}]`（§7.2） |
| 闲时 tips prefix `·` | 中性点，无品牌 | → `▀` 光锥顶点色块（§7.3） |
| guideAgent `Claude Agent SDK` / `Claude API` 文案 | Anthropic 产品名 × 3 处 | → `Atlas Agent SDK` / `Atlas API`（§7.5） |
| spinner 动词池 186 个 whimsical + `Clauding` | Claude Code fork 品牌人格 + L45 brand leak | → 算力+意象+哲学+趣味四轴 ~130 个（保 70%，§7.4） |
| spinner `· <verb>…` prefix | 中性点 | → `▀` 光锥顶点色块（与闲时 tips 统一） |
| guideAgent `Claude` × 9 处（含 L95b stale `claude-code-guide` 引用）+ `omitClaudeMd` flag + `claude-in-chrome` MCP | Anthropic 产品名 + 内部 flag + 外部 MCP 名 | guideAgent 9 处改 Atlas；flag/MCP 名保留（§7.5） |
| `outputStyles.ts:47,60` 「Claude explains…」「Claude pauses…」 | Anthropic 品牌名（输出风格描述，用户可见） | → Atlas（BR-9，2026-10-05 复核补入） |
| `attribution.ts:67` 注释「Claude Opus 4.6」+ 返回值 `Atlas Opus 4.6` | Anthropic 模型族名（Opus） | 注释→Atlas（值已改 Atlas Opus，注释滞后）；模型族名不硬编码，BR-9 改 `${shortModelName}` 动态取（§7.2） |

### 10.3 UA 品牌串标准（请求头识别面）

**标准（用户 2026-10-04 裁定）**：UA 品牌串 = **品牌 + 版本 + repo URL** 三段，段间以空格/括号分隔，**不带字面 `+` 号**。

> **`+` 号根因**：G-3 裁定注释（§8.74.28 R4）写的是「品牌串 = AtlasCode + 版本 + repo」——`+` 是裁定笔记里的**枚举分隔符**，0.1.21 实施时把分隔符字符写进了串体，形成 `+repo` 形态（`+url` 亦为 RFC 9110 世界 bot UA 的"信息指针"惯例，但 Atlas 品牌标准**不采纳**：无爬虫识别依赖，品牌串服务于人/服务端日志识别，`+` 无品牌语义，纯污染）。

**五变体标准表**（现状 0.1.22 → 目标 干净 0.1.x 版本 · BR-8）：

| # | 变体 | 触面 | 现状 | 目标 |
|---|---|---|---|---|
| ① | LLM 出站 UA（核主请求路径） | `src/shared/identity.ts:52` `buildUserAgent()`（`modelprovider/clients.ts:34` + `modelprovider.ts:730` 消费） | `AtlasCode/<v> (+repo)` | `AtlasCode/<v> (repo)` |
| ② | LLM 出站 UA（tui 面，带客户端后缀） | `src/tui/utils/http.ts:16` `getUserAgent()` | `AtlasCode/<v> (atlascode, <entry>[, agent-sdk/x][, client-app/y][, workload/z], +repo)` | 同左，仅去 repo 前 `+` |
| ③ | MCP UA | `src/tui/utils/http.ts:37` `getMCPUserAgent()` | `AtlasCode/<v>[ (parts)] (+repo)` | `AtlasCode/<v>[ (parts)] (repo)` |
| ④ | WebFetch UA（tui 面） | `src/tui/utils/http.ts:58` `getWebFetchUserAgent()` | `Atlas-User (AtlasCode/<v>; +repo)` | `Atlas-User (AtlasCode/<v>; repo)` |
| ⑤ | WebFetch UA（engine 静态面） | `src/engine/tools/web/webFetchUtils.ts:232` | `Atlas-User (+repo)`（**无版本段，delta ⑥ 裁登记**） | `Atlas-User (AtlasCode/<v>; repo)`（**delta ⑥ 收口：版本段恢复**） |

辅助面 `getDefaultUserAgent()`（`src/tui/utils/userAgent.ts:10`）= `AtlasCode/<v>`，当前干净（0.1.22 无 `+` 无 repo）。BR-8 后 ④ 改用共用 builder，该 helper 仓内零消费者（现唯一消费者即 http.ts:59）——保留不删（dependency-free 设计供 SDK bundle 外部消费者使用，见文件头注）。

**落地规则（BR-8 工单执行 · 完整方案 0.1.x 序列起点版本，依赖仅 identity.ts 现有常量，与 BR-1~BR-7 视觉工单解耦）**：

1. **去字面 `+`**：5 处代码串（①-⑤）+ 6 处注释（`http.ts:13-15,33,49` G-3 裁定注 ×3 / `userAgent.ts:8-9` / `identity.ts:50` / `clients.ts:33`）统一改写为「品牌串 = 品牌/版本 + 版本 + repo URL（无 `+`）」
2. **repo URL 单一事实源**：4 处硬编码 `https://github.com/vincentlau2046/AtlasCode`（②③④⑤）改 `import { REPOSITORY_URL }`，字面量只留 `shared/identity.ts` 一处（与 §7.2 commitAttribution allowlist 同机制）
3. **版本/品牌段单一事实源**：②③ 的 `MACRO.VERSION`（charter L72 明记运行时 globalThis 退化 bug）与 `'AtlasCode'` 字面量改 `import { getVersion, PRODUCT_NAME }`（**用现有 identity.ts 常量**；后续视觉工单 BR-1 落地 `PRODUCT_BRAND` 后同值可切换，无行为变化）；⑤ 静态常量升级为 `shared/identity.ts` 新增 `buildWebFetchUserAgent()`（§6.2 Step 1b，随 BR-8 落地），tui ④ 与 engine ⑤ 共用同一 builder（engine import shared 为既有 DEP 模式，`agentDefinition.ts` 同款），零分叉保证
4. **`Atlas-User` 保留**：WebFetch 对外 agent 名（站点 operator robots.txt 匹配串，已文档化），非品牌串标准化对象
5. **delta ⑥ 版本段缺口收口**：engine ⑤ 恢复版本段（与 ④ 对齐），版本段统一走 identity `getVersion()`（process.argv[1] 上行走算法，dev/npm 两态一致）

**非对象**：billing header `cc_version`（`x-atlas-billing-header`，`constants/system.ts:76`）与 MCP server_name `atlascode`（L7 内部层）不涉及本条。`http.ts:53-57` 的 WebFetch UA 描述注释块（"trailing repo link identifies the product" 等）无字面 `+`，改后描述仍为真，**不改**。

### 10.4 系统提示词自我认知

保持 `You are Atlas, a professional coding agent…`（`src/tui/constants/system.ts:18-20`）。理由：L7 第三层"内部机器标识 = atlas"，系统提示词是 LLM 内部指令非对外品牌面，"Atlas" 是合规短名。改 "You are AtlasCode" 会让内部标识与对外品牌混淆，违 L7 分层。

### 10.5 文件系统/注册表标识（暂缓 · 非本次 brand 文本替换对象）

`mdm/constants.ts:23,25`（`HKLM\\SOFTWARE\\Policies\\AtlasHarness` / `HKCU\\SOFTWARE\\Policies\\AtlasHarness`）是 Windows MDM 策略的**注册表读取路径**，非用户可见品牌文本——改它会改变企业 MDM 策略查找位置（breaking + 兼容面）。与 npm scope `@atlasharness` 同性质，属「文件系统标识层」，**暂缓不迁**（用户 2026-10-05 裁定），归 F 波清尾候选。BR-4 全量收口**排除**该文件。

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
当前 (0.1.22) ──> TUI 优化专项 (0.1.23 → 0.1.24) ──> 品牌系统完整方案（多个干净 0.1.x）
   │                    │                          │
   └ spec 设计          └ TUI P0a/P0b/P1a 列车     └ 逐工单拆块、逐版干净落地：
     （本文件）           （不并轨 · TUI 0.1.24 / P0 封口前置已占位）· 0.1.29 UA 品牌串（BR-8，自包含 · 序列起点）
                                               · 0.1.30 AtlasHarness leak 全量收口（BR-4，纯机械 · ~80 处 · 自包含）
                                               · 0.1.31 identity 扩常量 + 主题换值（BR-1 + BR-2）
                                               · 0.1.32 去 fork 化（BR-9：动词池 + guideAgent + outputStyles）+ 资产（BR-5 wordmark/token）
                                               · …（BR-6 e2e + BR-7 多终端随视觉版；BR-3 Beam = ⏸ PENDING · 最后 · 待用户审）
                                               （序号随 TUI 列车顺延；全程 0.1.x，不升 0.2.x）
```

- **不挂 0.1.23**：0.1.23 是 TUI P0a 回归列车（memory `tui-optimization-division`），品牌不并轨
- **完整方案 = 多个干净 0.1.x 版本**：TUI 列车之后，把本 spec 全部工单逐块拆成多个干净 0.1.x（每版 diff 聚焦一块：UA / 色板 / mark+Beam / 动词池+资产…），**全程 0.1.x、不升级 0.2.x**——用户 2026-10-05 裁定「通过多个 0.1.x 干净版本落地完整方案，不想升级大版本」
- **BR-8（UA）为序列起点**：紧跟 P0 封口前置波（品牌序列 **0.1.29 起**；0.1.25 #265 / 0.1.26 #278 A4 / 0.1.27 波 C「分类器拦截→ASK」均已占位），diff 仅 UA 五变体，自包含（不依赖 BR-1），是整条 0.1.x 序列的第一版
- **用户可见变更不升大版本**：品牌色（Claude orange → Atlas-Orange）+ mark（AH → Beam）是用户可见变更，但**随 0.1.x 干净版本落地**（pre-1.0，用户接受 0.1.x 承载用户可见变更，不用 0.2.0 minor-bump 信号）；原「0.2.x breaking 窗口」口径作废
- **master 不开分支**：所有 0.1.x 版本都直接在 master 上实施，不开 feature 分支；逐版独立发布
- **feature flag 回退**：不设回退 flag（品牌系统是确定方向，不预留旧视觉回退；若需回退靠 `git revert` 发布补丁）

### 13.2 实施工单分解（实施时落 writing-plans）

| 工单 | 范围 | 依赖 |
|---|---|---|
| BR-1 identity 扩常量 | `shared/identity.ts` Step 1 + 触面改 import Step 2 | 无 |
| BR-2 主题换值 | `theme.ts` 6 套 UI 品牌色 3 键（brand/brandShimmer/briefLabelAssistant）橙→暖金纯换值；**clawd_body/clawd_background 键改为 BR-3**（渐变色板随 BR-3 pending） | BR-1 |
| BR-3 Beam 组件 | ⏸ **PENDING · 最后 · 待用户审**（mark 重设计：`Clawd.tsx`→`Beam.tsx` + `AnimatedClawd`→`AnimatedBeam` + 删 `AnimatedAsterisk` + pose 废弃重写上爬动效 + BEAM_ART 5 档渐变 + 全部 clawd 术语内容：theme 键 `clawd_body`/`clawd_background`→`brand_mark`/`brand_mark_bg` 改名换值 + 其余 clawd 命名残留）——用户 2026-10-05 判定设计面「不靠谱、未充分审核」，停止、放序列最后重新排期 | 待用户审后另有 writing-plans |
| BR-4 AtlasHarness leak 全量收口（**扩展**） | **全量用户可见 `AtlasHarness`→`AtlasCode` 字面替换 ~80 处/~40 文件**（启动屏 12 处 + 权限弹框 22 + 更新 12 + 安装器 9 + 模型/MCP 11 + 主循环/REPL 11 + attribution 3 + insights/状态/onboarding/swarm 等；§7.1 全量清单）。**排除** mdm 注册表路径（§10.5）+ ascend/engine 迁移注释。纯机械，不碰 mark art，不 identity 化 | 无（自包含） |
| BR-9 去 fork 化 · de-Claude（**新增**） | ① spinner 动词池重写（§7.4，186→~130 四轴，去 `Clauding`/whimsical）② guideAgent 9 处 Claude→Atlas（§7.5）③ `outputStyles.ts:47,60` 两处 `Claude explains/pauses`→Atlas（新增，复核发现）④ attribution.ts `Claude Opus 4.6` 注释清理（§7.2） | 无（与前序视觉解耦） |
| BR-5 资产目录 | `docs/assets/` wordmark.svg + 品牌 token 文档（brand-system-spec.md）+ README 引用；**mark SVG/PNG 随 BR-3 pending** | wordmark/token 随 BR-2，mark 随 BR-3 |
| BR-6 e2e 基线重生成 | user-e2e/compare + tui-diff 启动屏快照重生成 | BR-4 |
| BR-7 真机多终端验证 | iTerm2/GNOME/kitty/Windows Terminal/Alacritty 截图校验 | BR-6 |
| BR-8 UA 品牌串标准化（**序列起点 · 干净 0.1.x**） | 五变体去字面 `+`（5 串 + 6 注释）+ repo/版本/品牌段 import 化（现有 `REPOSITORY_URL`/`getVersion`/`PRODUCT_NAME`）+ `shared/identity.ts` 新增 `buildWebFetchUserAgent()`（§6.2 Step 1b）+ delta ⑥ 版本段收口（§10.3）。**完整方案 0.1.x 序列的起点版本，与 BR-1~BR-7 视觉工单解耦** | 无（identity.ts 现有常量已足，不依赖 BR-1） |

> **版本策略（用户 2026-10-05 裁定）**：以上全部工单随 **多个干净 0.1.x 版本**逐一落地，**不升级 0.2.x**。BR-8 自包含可先行（序列起点）；BR-1~BR-7 按依赖链成组排进后续 0.1.x，每版 diff 聚焦一块（序号随 TUI 列车顺延，见 §13.1）。

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

- [ ] `grep -rn "AtlasHarness" --include="*.ts" --include="*.tsx" src/` 排除注释行 + mdm 注册表（§10.5）+ ascend/engine 迁移注释后，**用户可见字符串字面量 = 0**（CI grep 门，charter L8 ③ review 桶加一条）
- [ ] `grep -rnF '+https://github' src/` = 0 **且** `grep -rnF '+${REPOSITORY_URL}' src/` = 0（UA 品牌串无字面 `+`，§10.3；后者覆盖 `identity.ts:52` 模板形态，两条都要跑）
- [ ] repo URL 字面量 src/ 内仅 `shared/identity.ts`（REPOSITORY_URL）一处，UA 4 触面 import 化（§10.3 规则 2）
- [ ] WebFetch engine 静态串带版本段（delta ⑥ 收口）：`Atlas-User (AtlasCode/<v>; repo)`（§10.3 ⑤）
- [ ] TUI 启动屏真机截图（≥3 终端）显 AtlasCode + 光锥 mark + 暖金顶点
- [ ] errorMessaging 4 处错误消息显 AtlasCode
- [ ] commit/PR 签名 `git commit` 后 trailer 显 `Generated with [AtlasCode]`（§7.2 三处）
- [ ] 闲时 tips prefix 显 `▀` 光锥顶点色块（§7.3）
- [ ] spinner 动词池无 `Clauding`，动词为算力+意象+哲学+趣味四轴 ~130 个（§7.4）
- [ ] spinner `· <verb>…` prefix 显 `▀` 光锥顶点色块
- [ ] atlasCodeGuideAgent 9 处 Claude→Atlas（含 L95b `claude-code-guide`→`atlas-code-guide`，§7.5）
- [ ] compact 模式（<70col）mark 保持完整 9×5 不缩（§5.1）
- [ ] 6 套主题 brand 色对比度 ≥ AA
- [ ] 动效始终开启（顶点脉冲/光扫上爬/tips 渐入在所有环境渲染）
- [ ] e2e 基线重生成 + 全绿

---

## 15. 风险与回退

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 块字符 `█` 在某冷门终端宽度异常 | 低 | mark 错位 | §14.2 真机验证矩阵覆盖主流终端；`stringWidth()` 已校验 Neutral 宽度 |
| errorMessaging 改品牌名破坏子串匹配 | 中 | 错误分支误判 | §7.1 实施前 grep `includes('AtlasHarness')` 核查清单 |
| 品牌色变更用户感知 breaking | 高 | 用户困惑 | 随对应 0.1.x 视觉版 release notes 说明 + README 截图更新（不升 0.2.x） |
| AnimatedClawd 重构引入性能回归 | 中 | TUI 启动卡顿 | 保 react compiler memo 结构；启动性能 profiler 对比（memory `tui-optimization-division` P0a 已有 profiler 基建） |
| AtlasOffice 远期需求迫使 mark 重做 | 低 | 返工 | §12 接缝设计预留 ACCENT_HUE + 顶点字符常量，非阻塞 |

**回退策略**：不设 feature flag。若某 0.1.x 视觉版发布后严重问题，`git revert` + 下一个 0.1.x 补丁回退到上一版视觉（全程 0.1.x，无 0.2.x）。

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
3. **pose 机制**：⏸ 随 BR-3 Clawd→Beam 整体 PENDING（§8.2），待用户审后重定；本轮不实施
4. **时序**：✅ 完整方案拆**多个干净 0.1.x 版本**落地（不升 0.2.x）+ master 不开分支 + 不设 feature flag（§13.1）
5. **动效策略**：✅ 不做 reduced-motion，动效始终开（§9.1）
6. **FEEDBACK_CHANNEL 值**：✅ `https://github.com/vincentlau2046/AtlasCode/issues`（§6.2）
7. **P2 历史"移植自 AtlasHarness"注释清尾时机**：随大重构（推荐，非本方案必须）
8. **UA 品牌串标准**：✅ 三段定式「品牌/版本 + 版本 + repo URL」，去字面 `+`（RFC 9110 `+url` 惯例不采纳）+ identity 单一事实源 + delta ⑥ 版本段收口（§10.3，BR-8）
9. **版本策略（整案）**：✅ 完整品牌方案拆成**多个干净 0.1.x 版本**落地，**不升级 0.2.x**（用户 2026-10-05 裁定；BR-8 为序列起点，逐工单排进后续 0.1.x，§13.1）

---

**审批后下一步**：spec 已审批通过 → 作为设计文档存档 → **等 TUI 优化专项完成后**转 `writing-plans` skill 生成实施计划（不现在落地代码）。
