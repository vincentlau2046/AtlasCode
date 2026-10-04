# AtlasCode 品牌标志现状与优化专项分析

> **扫描日期**：2026-10-04 · **范围**：master @ 0.1.22 全仓 `src/` + `package.json` + `docs/`（排除 node_modules / .git / worktrees）
> **方法**：一手源码逐文件审计，每条结论附 `file:line` 证据
> **关联文档**：`docs/brand-string-classification.md`（2026-09-21 品牌串预分类表）、`docs/architecture-charter.md` L7 命名三层

## 0. 摘要

AtlasCode **没有任何视觉品牌资产**（无 logo 图片 / banner / icon / favicon），品牌完全以文本形式散落在 ~10 个代码触面。更严重的是：**F 波品牌串迁移（AtlasHarness → AtlasCode）在用户可见面上基本未执行**——TUI 启动屏、错误消息、欢迎语仍显示旧品牌 **"AtlasHarness"**，且品牌 mark 是旧项目的 **"AH" 块字 monogram**，AtlasCode 自身的 logo mark 尚不存在。

| 维度 | 现状 | 严重度 |
|---|---|---|
| 视觉资产 | 零（无 logo/banner/icon/favicon） | P1（缺位） |
| TUI 启动屏品牌名 | **"AtlasHarness"**（旧品牌，4 文件 7 处） | **P0** |
| 品牌 mark | "AH" monogram（AtlasHarness 首字母）+ "AtlasHarness" wordmark | **P0** |
| 品牌色 | `rgb(215,119,87)` 注释明记 "Claude orange"（Anthropic 橙） | P1 |
| 错误消息品牌名 | "access to AtlasHarness"（4 处） | **P0** |
| npm 包 scope | `@atlasharness/atlascode`（旧/新混搭） | P1 |
| LLM UA / WebFetch UA / MCP UA | 已修为 AtlasCode（0.1.21 收口） | ✅ |
| 系统提示词内部名 | "Atlas"（L7 内部层，合规） | ✅ |
| 历史"移植自 AtlasHarness"注释 | ~150 处（ascend/engine 域） | P2 |

**核心结论**：品牌串机械化替换的"对外层"（charter L7 第二层 = AtlasCode）在源码用户可见面 **大面积未落地**；`docs/brand-string-classification.md` 是分类规则快照，F 波执行缺口显著。建议立 **P0 品牌 leak 修复专项** + **logo mark 设计专项** 双轨收口。

---

## 1. 品牌触面全清单（一手源码审计）

### 1.1 用户可见面（P0 主战场）

| 触面 | 文件:行 | 当前串 | 应为 |
|---|---|---|---|
| TUI 启动边框标题 | `src/tui/components/LogoV2/LogoV2.tsx:204` | `AtlasHarness` | `AtlasCode` |
| TUI 启动边框标题（compact） | `src/tui/components/LogoV2/LogoV2.tsx:205` | `AtlasHarness` | `AtlasCode` |
| 品牌 mark wordmark | `src/tui/components/LogoV2/Clawd.tsx:110` | `AtlasHarness` | `AtlasCode` |
| 品牌 mark wordmark（AppleTerminal 分支） | `src/tui/components/LogoV2/Clawd.tsx:136` | `AtlasHarness` | `AtlasCode` |
| 欢迎语 | `src/tui/components/LogoV2/WelcomeV2.tsx:12,31,116` | `Welcome to AtlasHarness` | `Welcome to AtlasCode` |
| 凝缩 logo | `src/tui/components/LogoV2/CondensedLogo.tsx:51` | `AtlasHarness` | `AtlasCode` |
| 账号访问错误 | `src/modelprovider/errorMessaging.ts:85,123,129` | `access to AtlasHarness` | `access to AtlasCode` |
| 用量政策错误 | `src/modelprovider/errorMessaging.ts:380` | `AtlasHarness is unable to respond…` | `AtlasCode is unable to respond…` |

**证据片段**（LogoV2.tsx:204-205，每轮 TUI 启动必渲染）：
```tsx
const borderTitle = ` ${color("brand", userTheme)("AtlasHarness")} ${color("inactive", userTheme)(`v${version}`)} `;
const compactBorderTitle = color("brand", userTheme)(" AtlasHarness ");
```

### 1.2 品牌 mark（P0 — AtlasCode logo 缺位）

`src/tui/components/LogoV2/Clawd.tsx` 渲染的"logo"实为 **AtlasHarness 的 "AH" 块字 monogram**：

```tsx
// Clawd.tsx:99-110（两处同款，L99 / L125）
const AH_ART = [
  ' ▄▄▄▄      ██  ██',   // ← 块字 "AH"（AtlasHarness 首字母）
  '██  ██     ██  ██',
  '██████     ██████',
  '██  ██     ██  ██',
  '██  ██     ██  ██'
];
// 渲染：
{AH_ART.map((line) => <Text color="clawd_body">{line}</Text>)}
<Text color="brand">AtlasHarness</Text>
<Text dimColor={true}>AI Coding Agent</Text>
```

注释明记 `// AH 子母 logo: blocky "AH" monogram (母) + "AtlasHarness" + "AI Coding Agent" (子)`。文件名 `Clawd.tsx` + `AnimatedClawd.tsx`（14KB）+ 主题色 `clawd_body` 均继承自 Claude Code fork 的 Clawd 吉祥物体系，但当前 art 已改为 AH monogram——**既非 Anthropic Clawd，也非 AtlasCode mark，是旧项目 AtlasHarness 的残留 mark**。

### 1.3 已收口面（✅ 合规）

| 触面 | 文件:行 | 串 | 收口版本 |
|---|---|---|---|
| LLM 请求 UA | `src/tui/utils/http.ts:34` | `AtlasCode/<v> (atlascode, <entry>, +repo)` | 0.1.21 |
| 默认 UA helper | `src/tui/utils/userAgent.ts:11` | `AtlasCode/<v>` | 0.1.21 |
| MCP UA | `src/tui/utils/http.ts:55` | `AtlasCode/<v> (+repo)` | 0.1.21 |
| WebFetch UA | `src/engine/tools/web/webFetchUtils.ts:232` | `Atlas-User (AtlasCode/<v>; +repo)` | 0.1.21 |
| TUI 启动 stderr | `src/atlascode/launcher.ts:12,24` | `[AtlasCode]` | 早期 |
| `--version` | `src/cli/parse.ts:774-778` | `<v> (AtlasCode)` | 早期 |
| 程序名/description | `src/cli/parse.ts:417-419` | `atlascode` / `AtlasCode - starts an interactive session…` | 早期 |
| Node 版本错误 | `src/cli/setup.ts:123` | `AtlasCode requires Node.js…` | 早期 |
| headless 提示词 | `src/cli/headlessPrompt.ts:35` | `You are AtlasCode…` | 早期 |
| MCP server_name | `src/cli/print.ts:434` | `atlascode` | 早期 |

### 1.4 内部机器标识面（✅ L7 第三层合规）

charter L7 第三层"内部机器标识 = atlas（短名）"，以下用 `Atlas`/`atlas` 合规：
- 系统提示词前缀 `src/tui/constants/system.ts:18-20`：`You are Atlas, a professional coding agent…`
- 子 agent 定义 `src/engine/tools/agent/agentDefinition.ts:51`：`…coding agent for Atlas…`
- auto-mode 分类器 `src/cli/handlers/autoMode.ts:100`：`…reviewer of auto mode classifier rules for Atlas.`
- env 前缀 `ATLAS_*`、配置目录 `.atlascode`、类名 `Atlas*` —— 全合规。

> **注意**：这是 charter L7 刻意设计（对外 AtlasCode / 内部 atlas），非 leak。

### 1.5 品牌色（P1 — 仍用 Anthropic 橙）

`src/tui/utils/theme.ts` 6 套主题里 `brand` 色全部是 Anthropic 的 Claude 橙：

| 主题 | brand 色 | 注释 |
|---|---|---|
| default / dark | `rgb(215,119,87)` | `// Claude orange` |
| light / ANSI | `ansi:redBright` | — |
| deuteranopia 变体 | `rgb(255,153,51)` | 色盲适配橙 |

`clawd_body` 同样 `rgb(215,119,87)`。AtlasCode **未定义自己的品牌色**，全盘继承 Claude Code fork 的 Anthropic 橙。

---

## 2. L7 命名三层合规性审计

`docs/architecture-charter.md` L7（L851-857）：

| 层 | 名 | 出现在哪 | 合规？ |
|---|---|---|---|
| 仓库/项目 | `AtlasCode` | `~/projects/AtlasCode/`、GitHub repo 名 | ✅ |
| **对外品牌** | `AtlasCode` | TUI 启动横幅、`--version`、README 标题、二进制名、Release 名 | **⚠️ 部分违规** |
| 内部机器标识 | `atlas` | env `ATLAS_*`、类名 `Atlas*`、`.atlascode` | ✅ |

**第二层（对外品牌）违规明细**：L7 明列"TUI 启动横幅"应 = AtlasCode，实测 LogoV2.tsx / WelcomeV2.tsx / Clawd.tsx / CondensedLogo.tsx 四文件七处 = AtlasHarness。这正是 `docs/brand-string-classification.md` ① 类"对外品牌文本"应机械替换却未替换的面。

---

## 3. 缺口分级

### P0 · 用户可见品牌名错误（每轮启动必现）
- **范围**：4 文件 7 处（LogoV2 / Clawd / WelcomeV2 / CondensedLogo）+ errorMessaging 4 处
- **影响**：用户每次启动 TUI 看到的边框标题、欢迎语、logo wordmark 全是旧品牌 AtlasHarness；账号/政策错误消息同样。对外品牌一致性断裂。
- **修复**：机械 `AtlasHarness` → `AtlasCode`（F 波 ① 类规则，已预分类，缺执行）

### P0 · AtlasCode logo mark 缺位
- **范围**：`Clawd.tsx` 的 `AH_ART` 块字 monogram（"AH" = AtlasHarness 首字母）
- **影响**：AtlasCode 没有自己的视觉 mark，复用旧项目 AtlasHarness 的 "AH" 块字 + 文件名/主题色继承自 Anthropic Clawd 体系
- **修复**：设计 AtlasCode 自身 mark（"AC" monogram 或其他图形）+ 重命名 Clawd.tsx → 独立品牌组件 + 主题色 `clawd_body` 重命名

### P1 · npm 包 scope 旧/新混搭
- `package.json:2`：`"name": "@atlasharness/atlascode"` —— scope `@atlasharness` 是旧品牌，产品名 `atlascode` 是新品牌
- README / CHANGELOG / docs 共 ~15 处引用 `@atlasharness/atlascode`
- **影响**：npm 安装命令品牌不一致；scope 属"对外品牌"层（L7 第二层）应统一
- **修复**：迁 npm scope `@atlasharness` → `@atlascode`（breaking，需 deprecated 旧包 + 引导用户重装，单列迁移工单）

### P1 · 品牌色未独立
- `theme.ts` `brand` / `clawd_body` = Anthropic `rgb(215,119,87)` "Claude orange"
- **影响**：AtlasCode 视觉品牌无独立色相，与 Anthropic Claude 品牌混淆
- **修复**：定 AtlasCode 品牌色（建议保留橙系以承 Clawd 视觉惯性，或换国产算力意象色），改 `// Claude orange` 注释

### P2 · 历史"移植自 AtlasHarness"注释（~150 处）
- 集中在 `src/ascend/tools/*`（~25 文件）+ `src/engine/session/*` + `src/ascend/executor/*`
- 性质：`// 从 AtlasHarness src/tools/ascend/Xxx.ts 移植` 迁移溯源注释，非用户可见
- **影响**：零功能影响，仅代码考古噪声
- **修复**：F 波 ② 类机械替换或整段删除（低优，随下次大重构清尾）

---

## 4. 优化专项建议（双轨）

### 轨 A · P0 品牌 leak 修复（机械化，可立即落 main）

**工单 BR-A1：TUI 启动屏品牌名机械替换**
- LogoV2.tsx:204-205（borderTitle / compactBorderTitle）
- Clawd.tsx:110, 136（wordmark Text）
- WelcomeV2.tsx:12, 31, 116（Welcome to）
- CondensedLogo.tsx:51（bold Text）
- 验收：`atlas`（无参）启动 TUI，边框/欢迎语/logo wordmark 全显 AtlasCode

**工单 BR-A2：错误消息品牌名机械替换**
- errorMessaging.ts:85, 123, 129, 380
- 验收：触发账号/政策错误路径，消息显 AtlasCode

**工单 BR-A3：用户可见面 AtlasHarness 全清 grep 门**
- `grep -rn "AtlasHarness" --include="*.ts" --include="*.tsx" src/` 排除注释行后 = 0（CI grep 门，charter L8 ③ review 桶可加一条）

> 轨 A 全部是 `docs/brand-string-classification.md` ① 类已预分类的机械替换，预计 1 commit 收口，可挂 0.1.23 列车。

### 轨 B · logo mark 设计专项（需设计决策）

**工单 BR-B1：AtlasCode mark 设计**
- 决策项：保留 "AH" 块字风格但改 "AC"？还是全新图形（如国产算力意象的 Ascend/芯片纹）？
- 落点：`src/tui/components/LogoV2/Clawd.tsx` 重构（含 `AnimatedClawd.tsx` 14KB 动画）
- 命名：`Clawd.tsx` → `BrandMark.tsx`（去 Anthropic Clawd 命名残留）；主题色 `clawd_body` → `brand_mark`

**工单 BR-B2：品牌色定调**
- 决策项：承 Anthropic 橙 `rgb(215,119,87)` 还是换独立色？
- 落点：`src/tui/utils/theme.ts` 6 套主题 `brand` + `clawd_body`（→ `brand_mark`）

**工单 BR-B3：品牌资产目录奠基**
- 新建 `assets/` 或 `docs/assets/`（当前零视觉资产目录）
- 首批：README logo（当前 README 无任何 `![]()` 图片引用）、TUI mark 的设计源（SVG）
- 远期：favicon / 桌面端 icon（atlasDesktop.ts 若激活）

### 轨 C · P1 scope 迁移（breaking，单列）

**工单 BR-C1：npm scope `@atlasharness` → `@atlascode`**
- `package.json:2` name 改 `@atlascode/atlascode` 或 `@atlascode/cli`
- README / docs / CHANGELOG 引用同步
- npm 侧：发布新 scope，旧 `@atlasharness/atlascode` 标 deprecated + README 引导 `npm install -g @atlascode/atlascode`
- 时序：建议 0.2.x 大版本窗口（breaking 变更集合），不挂 0.1.x

---

## 5. 时序建议

| 优先级 | 工单 | 列车 | 依赖 |
|---|---|---|---|
| P0 | BR-A1/A2/A3（机械品牌 leak 修复） | 0.1.23 | 无，立即可做 |
| P0 | BR-B1（mark 设计 + 重构） | 0.2.x | 需用户设计决策 |
| P1 | BR-B2（品牌色定调） | 0.2.x | 需用户设计决策 |
| P1 | BR-C1（npm scope 迁移） | 0.2.x | breaking 窗口 |
| P2 | 历史"移植自"注释清尾 | 随大重构 | 低优 |

**与既有计划的关系**：本专项属 charter F 波"品牌串分类"的执行缺口补全——`docs/brand-string-classification.md` 已完成分类规则（2026-09-21），但 F 波在用户可见面未落地。轨 A 即 F 波 ① 类的补执行。TUI 专项（`docs/2026-10-04-tui-program-plan.md`）与品牌色/mark 设计（轨 B）可在 0.2.x 并行。

---

## 6. 一手证据索引

| 证据 | 位置 |
|---|---|
| TUI 边框标题 leak | `src/tui/components/LogoV2/LogoV2.tsx:204-205` |
| AH monogram + wordmark | `src/tui/components/LogoV2/Clawd.tsx:99-110, 125-136` |
| 欢迎语 leak | `src/tui/components/LogoV2/WelcomeV2.tsx:12, 31, 116` |
| 凝缩 logo leak | `src/tui/components/LogoV2/CondensedLogo.tsx:51` |
| 错误消息 leak | `src/modelprovider/errorMessaging.ts:85, 123, 129, 380` |
| 品牌色 = Claude orange | `src/tui/utils/theme.ts:116, 433`（+ `clawd_body` L159/397/476/555） |
| 包 scope 混搭 | `package.json:2` |
| L7 命名三层 | `docs/architecture-charter.md:851-857` |
| 品牌串分类规则 | `docs/brand-string-classification.md`（2026-09-21） |
| UA 已收口 | `src/tui/utils/http.ts:34,55` + `userAgent.ts:11` + `webFetchUtils.ts:232` |
| src 全量 AtlasHarness 命中 | 159 处 / ~40 文件（含 ~150 注释 + ~9 用户可见 P0） |
