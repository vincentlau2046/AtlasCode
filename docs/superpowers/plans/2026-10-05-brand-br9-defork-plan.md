# BR-9 · 去 fork 化（de-Claude）实施计划（0.1.31）

> **状态**：实施计划（writing-plans）· 对应 spec §7.4（动词池）+ §7.5（guideAgent）+ §10.2（去 fork 化清单）+ §7.2（attribution Claude 注释）
> **性质**：去 Anthropic/Claude 品牌人格与产品名残留，与前序视觉工单解耦
> **范围（2026-10-05 复核新增 ③④）**：① 动词池 ② guideAgent ③ outputStyles ④ attribution Claude 注释

---

## 0. 改动范围总览

| 文件 | 改动 | 类型 |
|---|---|---|
| `src/tui/constants/spinnerVerbs.ts` | 186→~130 四轴重写（去 `Clauding`/whimsical） | 内容重写 |
| `src/tui/constants/turnCompletionVerbs.ts` | 8→20 过去式同步 | 内容重写 |
| `src/tui/tools/AgentTool/built-in/atlasCodeGuideAgent.ts` | 9 处 Claude→Atlas | 字面替换 |
| `src/tui/constants/outputStyles.ts` | 2 处 `Claude explains/pauses`→Atlas | 字面替换 |
| `src/tui/utils/attribution.ts` | L67 注释 `Claude Opus`→Atlas + 模型名不硬编码 | 注释+动态化 |

---

## 1. 逐项改动

### 1.1 动词池重写（§7.4）

`spinnerVerbs.ts` 当前 186 个（`Clauding` L45、`Gitifying` L93、`Hyperspacing` L102、`Quantumizing` L150 等 whimsical）。重写为 spec §7.4 四轴 ~130 个（**算力 45 + 意象 25 + 哲学 20 + 趣味 27 + 通用 13**），动词全文见 spec §7.4 代码块（已定）。要点：

- 删 `Clauding` + 纯荒诞词（`Beboppin'`/`Discombobulating`/`Flibbertigibbeting`/`Razzmatazzing`/`Shenaniganing`/`Tomfoolering`/`Whatchamacalliting`/`Gitifying`/`Hyperspacing`/`Quantumizing`）
- 保留 `getSpinnerVerbs()` 的 `settings.spinnerVerbs`（mode=replace/extend）用户自定义机制
- `turnCompletionVerbs.ts`：8 个（`Baked`/`Brewed`/`Churned`/`Cogitated`/`Cooked`/`Crunched`/`Sautéed`/`Worked`）→ spec §7.4 的 20 个新池

**消费方验证（4 处，2026-10-05 代码核对确认）**：`Spinner.tsx:139`（主 spinner 挂载 sample）/ `TeammateSpinnerLine.tsx:80-81` / `spawnInProcess.ts:171-172` / `SystemTextMessage.tsx:591`（回合完成过去式）。均不改调用点，只换池内容。

### 1.2 guideAgent 9 处（§7.5）

`atlasCodeGuideAgent.ts` 逐行字面替换（行号已核对）：

| 行 | 改 |
|---|---|
| L29 | `Claude guide agent`→`Atlas guide agent`；`Claude Agent SDK`→`Atlas Agent SDK`；`Claude API (formerly the Anthropic API)`→`Atlas API` |
| L35 | `Claude Agent SDK`→`Atlas Agent SDK` |
| L37 | `Claude API: The Claude API (formerly known as the Anthropic API)`→`Atlas API: …模型交互、工具调用、集成` |
| L52 | `Claude Agent SDK docs`→`Atlas Agent SDK docs` |
| L59 | `Claude API documentation`→`Atlas API documentation` |
| L61 | `Claude API docs … Claude API (formerly the Anthropic API)`→`Atlas API docs … Atlas API` |
| L63 | `Anthropic-defined tools`→`vendor-defined tools` |
| L95 | `"Can Claude..." "Does Claude..."`→`"Can Atlas..." "Does Atlas..."`；`Claude Agent SDK`/`Claude API`/`Anthropic SDK usage`→Atlas 对应 |
| L95b | `claude-code-guide agent`→`atlas-code-guide agent`（内部 agent 类型名，L20 `ATLAS_GUIDE_AGENT_TYPE='atlas-code-guide'`） |

**保留不动**：L18 `platform.claude.com/llms.txt`（外部 Anthropic 文档 URL，改会断文档源）；`omitClaudeMd` flag（内部 API、触及 15+ 文件）；`claude-in-chrome` MCP 工具名。

### 1.3 outputStyles 2 处（新增）

`src/tui/constants/outputStyles.ts`：
- L47 `'Claude explains its implementation choices and codebase patterns'` → `'Atlas explains…'`
- L60 `'Claude pauses and asks you to write small pieces of code for hands-on practice'` → `'Atlas pauses…'`

### 1.4 attribution Claude 注释（§7.2）

`src/tui/utils/attribution.ts` L67 注释 `fall back to "Claude Opus 4.6"` → `"Atlas Opus 4.6"`（值 L73 已是 `Atlas Opus 4.6`，注释滞后）。模型名不硬编码：L70-73 `modelName` 已用 `getPublicModelName(model)` / 回退 `Atlas Opus 4.6`，保留动态机制（spec §7.2「改用 `${shortModelName}` 动态取」——复核后：L367 已有 `shortModelName`，L74 的 `defaultAttribution` 用 L70 的 `modelName` 动态值，**无需额外改动**，仅注释清理）。

---

## 2. 验证

- [ ] `grep -rni "clauding" src/` 排除 `insights.ts` multi-clauding 内部术语后 = 0
- [ ] `SPINNER_VERBS` 无 `Clauding`/`Beboppin'`/`Gitifying`/`Hyperspacing`/`Quantumizing`，四轴 ~130 个
- [ ] `turnCompletionVerbs.ts` 20 个新池（无 whimsical 过去式）
- [ ] `atlasCodeGuideAgent.ts` 9 处 Claude→Atlas；`platform.claude.com` 保留；`claude-code-guide`→`atlas-code-guide`
- [ ] `outputStyles.ts` 无 `Claude explains/pauses`（用户可见输出风格描述）
- [ ] spinner 状态行 + 回合完成过去式 + guideAgent 触发实测：无 Claude/whimsical 文案
- [ ] 构建 + 既有 e2e 回归全绿

## 3. 依赖 / 时序

- **前置**：0.1.24（Main TUI）→ #265 0.1.25 / #278 0.1.26 / 波 C 0.1.27 → 本工单 0.1.31（BR-4 0.1.29 / BR-1+BR-2 0.1.30 之后）
- **自包含**：不依赖 visual 工单；可与 BR-1+BR-2 并车或独立一版（按 TUI 列车序号顺延）
- **关联**：§7.3 tips `·→▀` **不在本工单**（依赖 brand_mark 色 = BR-3，随 BR-3 pending）