# 缺陷单：0.1.26 波 A4 allow 面重验 —— 2 项 P0 hard FAIL（a4rallow / a4bypass 不渲染）

- **判定**：FAIL（hardFail=2）
- **被测体**：worktree `worktree-278-a4-verdict` @ 3 提交 `a59f6d3`(item 1 A4-mode) / `94edd40`(item 2 allow 面) / `d991f95`(item 4 doc)，base `8dd9690`
- **artifact**：`user-e2e/tui-diff/artifacts/A4F-1791180416454-a6hl`（ticket.md / result.json / S-024*.log）
- **执行**：`bun run user-e2e/tui-diff/accept.ts A4F --repo /home/vince/projects/AtlasCode/worktrees/worktree-278-a4-verdict`
- **判据口径（f4 定稿）**：e2e 可强制 4 硬句 = a4rallow / a4bypass / A4-mode / a1danger → 应 4 绿；classifier 2 句（a4cls/a4clsa）= INCONCLUSIVE（产品局限，live-model 依赖）

---

## 逐项判定（7 场景）

| 探针 | 场景 | 判定 | 证据 |
|---|---|---|---|
| A4-mode（`default mode requires confirmation for X`） | S-024L | **PASS** ✅ | `Verdict: default mode requires confirmation for Bash.`（item 1 修透传生效） |
| A1-dangerous-no-always（红线 hard-absent） | S-024M | **PASS** ✅ | 0 次 always/don't-ask-again（rm 弹框现形但无 always） |
| **A4-rule-allow-allowface** | S-024I | **P0 FAIL(hard)** | "Allowed by rule" 0 命中（raw+解码双 0） |
| **A4-bypass-allowface** | S-024J | **P0 FAIL(hard)** | "Bypass mode" 0 命中 |
| A4-classifier-dangerous | S-024N | INCONCLUSIVE（预期，softTriggers=false） | — |
| A4-classifier-approved | S-024O | INCONCLUSIVE（预期） | — |
| 控制×7（seed-default×2 / label-bypass / label-automode×3 / seed-dialog） | 各场景 | 全 PASS | 模式标签 + 弹框现形 |

---

## P0-1：allow 面 verdict 行不渲染（rule-allow + bypass 同根因，classifier-approved 潜在同病）

- **需求**：spec §4b —— 0.1.26 item 2 给成功卡加 allow 面 verdict：rule-allow → `Allowed by rule "<v>" (<source>).`，bypass → `Bypass mode — all commands allowed.`，classifier-approved → `Auto-approved by classifier: <reason>.`（判据 = a4rallow/a4bypass 两硬句 e2e 绿）
- **复现**：S-024I（`--permission-mode default` + allow(['Bash']) + `touch`）→ 命令确 auto-allow（A1-no-dialog 0 次弹卡 PASS），但成功卡无 "Allowed by rule" 行；S-024J（`--permission-mode bypassPermissions` + `touch`）→ bypass 标签现形（a5bypass PASS）、命令 auto-allow，但无 "Bypass mode" 行。
- **证据**：S-024I.log / S-024J.log，stripAnsi(CUF) 解码后 "Allowed by rule"=0、"Bypass"=0、"Verdict"=0、"Auto-approved"=0、"Allowed · your decision"=0。故成功后卡 approval/verdict 标记行整体缺席。
- **白盒定位（唯一根因，已钉死）**：
  - `UserToolSuccessMessage.tsx`（item 2 的 allow 面渲染点）：
    - L49 `getAllowVerdict(toolUseID)` 读值正确；L94-102 `allowVerdictLine` 计算逻辑正确（bypass 判 mode、rule-allow 判 `vReason.type==='rule' && ruleBehavior==='allow'`）；L126-127 渲染 `allowVerdictLine`。
    - **但 L68-75 `renderedMessage = tool.renderToolResultMessage?.(...) ?? null`；L80 `renderMode = successCardRenderMode(renderedMessage, userApproved)`；L81-83 `if (renderMode === 'skip') return null`。**
  - `permissionVerdict.ts:123-129 successCardRenderMode`：`renderedMessage !== null → 'full'；否则 userApproved ? 'marker' : 'skip'`。
  - TUI-lane Bash 桥接适配器（`src/tui/tools/BashTool/BashTool.ts`）**无 `renderToolResultMessage`**（只挂 `renderToolUseMessage` + `mapToolResultToToolResultBlockParam`）→ `renderedMessage === null`。auto-allow 无用户弹框 → `userApproved === false`。⇒ `successCardRenderMode(null, false) = 'skip'` → 组件早退 return null → **L126 allowVerdictLine 永不达**。
  - 决策侧无误：`useCanUseTool.tsx:42-56` auto-allow 支 `setAllowVerdict` 已正确置位，『reason/mode』形状对——2a bypass 返 `{type:'mode',mode:'bypassPermissions'}`（permissions.ts:1114-1117）、2b 返 `{type:'rule',rule:alwaysAllowedRule(ruleBehavior:'allow')}`（:1130-1133）。
  - ⇒ 静态链路应当渲染、实测不渲染的根因 = **`successCardRenderMode` 未把 `allowVerdict` 计入 render-mode**，对 Bash auto-allow（renderedMessage null + 无 userApproved）误判 'skip'。
- **同类隐患**：`yoloReason` 行（L119，classifier-approved 句）同样在 early-return 之后——一旦 live 分类模型可达（TRANSCRIPT_CLASSIFIER），classifier-approved 句会撞同一 'skip' 早退不渲染。
- **严重度**：P0 —— 0.1.26 item 2 的 3 allow 句对 Bash（唯一实际走 auto-allow 的工具）整体不可达，2 硬句 e2e FAIL。

## 修法建议（供 Main）

`UserToolSuccessMessage.tsx` L81 早退条件把 `allowVerdict` 计入（它已在 L49 读入变量）：
```ts
if (renderMode === 'skip' && !allowVerdict) return null
```
或把 allowVerdict 折进 `successCardRenderMode(renderedMessage, userApproved, hasAllowVerdict)` 返 'marker'。改后给 Bash auto-allow 渲染 allowVerdictLine（rule-allow/bypass 经 verdictLine 派生，句体单一事实源不变）；classifier-approved 的 yoloReason 行同理需免于 'skip' 早退。

## 已确认修复（非缺陷）

- **item 1 A4-mode（0.1.25 P0 hardFail）已修**：S-024L 现 PASS，`Verdict: default mode requires confirmation for Bash.` 现形（a59f6d3 决策透传生效）。
- #265 静默放行洞仍堵（S-024L/M 弹框现形 + Esc 拒绝）。