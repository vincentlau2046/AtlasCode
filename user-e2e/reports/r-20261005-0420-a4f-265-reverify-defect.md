# 缺陷单：#265 重验（A4F）—— 1 项 P0 hard FAIL（A4 verdict 「为什么在问你」行断裂）

- **判定**：FAIL（hardFail=1）
- **被测体**：worktree-265-bash-perm-fix @ `69e32f4`（含 #265 S1 `9425903` + S2 `69e32f4`）
- **artifact**：`user-e2e/tui-diff/artifacts/A4F-1791174821436-bz41`（ticket.md / result.json / S-024*.log）
- **执行**：`bun run user-e2e/tui-diff/accept.ts A4F --repo /home/vince/projects/AtlasCode/worktrees/worktree-265-bash-perm-fix`
- **⚠ 版本注记**：本支（worktree-265-bash-perm-fix）未 cherry-pick release 版本 bump（master `837f72f`），TUI banner 仍显示 `v0.1.24`；功能代码 = #265 修复版（与 npm 0.1.25 shasum 46d2165905 的 verdict/权限代码同源 dc8e78a/f2509af/#265 S1+S2），故行为等价。若 f4 要求严格 npm 0.1.25 对齐需另跑。

---

## 逐项判定（8 探针 + 5 控制探针）

| 探针 | 场景 | 判定 | 说明 |
|---|---|---|---|
| **A4-mode**（`default mode requires confirmation for X`） | S-024L（default+无规则+touch） | **P0 FAIL(hard)** | 弹框现形但无 verdict 行 |
| A4-rule-allow-forced（`Allowed by rule`） | S-024I（allow 规则） | FAIL(soft) | 2b 自动放行，无 ask 面无 verdict → 结构不可达（非 #265 范围） |
| A4-bypass-forced（`Bypass mode`） | S-024J（bypass） | FAIL(soft) | 2a 自动放行，不可达 |
| A4-classifier-dangerous-forced | S-024K（auto） | FAIL(soft) | BASH_CLASSIFIER 关，不可达 |
| A4-classifier-approved-forced | S-024K（auto） | FAIL(soft) | 同上 |
| A4-mode-forced | S-024K（auto） | FAIL(soft) | auto 模式绕过 ask，不可达 |
| A1-no-dialog（allow 后不弹卡） | S-024I | **PASS** | 0 次 "Do you want to proceed" |
| A1-dangerous-no-always（危险前缀无 always/don't-ask-again） | S-024M（rm -rf） | **PASS** | 0 次 |
| 控制×5（seed-default×2 / label-bypass / label-automode / seed-dialog） | 各场景 | 全 PASS | 模式标签 + 弹框现形 |

---

## P0-1：Bash 审批弹框「verdict 一行」不渲染

- **需求**：spec §4b A4 —— 无规则 benign 写命令在 default 模式应弹「Verdict: default mode requires confirmation for Bash.」（Perl `default mode requires confirmation for X`）
- **复现**：`code --permission-mode default`（无 allow/ask/deny 规则）→ `touch /tmp/atlas-a4r-mode` → 审批弹框现形（"Do you want to proceed?" + Yes / "always allow tmp/" / automode / No）→ **"Verdict:" 行缺席**。危险 `rm -rf` 弹框同样 0 次 "Verdict"。
- **证据**：S-024L.log + S-024M.log，raw 字节与 ANSI/CUF 解码双重 0 命中 "Verdict"；同解码 "Do you want to proceed?" =1 命中（证明弹框本身现形、编码解码正确、探针非误负）。
- **白盒定位**：
  - 渲染代码在 `BashPermissionRequest.tsx:427-458`（`{verdictLineText !== null && <Text dimColor>{verdictLineText}</Text>}`，非 debug 分支默认可见，已提交于 HEAD）。
  - `verdictLine()`（permissionVerdict.ts:50-106）对 `type:'other'|'mode'|'safetyCheck'` 均返回非 null。
  - `bashToolHasPermission` 对 `touch` 实测走 `checkPathConstraints` 返回 `decisionReason.type='other'`（pathValidation.ts:623/650 等）。
  - ⇒ 静态链路**应当**渲染；实测不渲染 ⇒ 疑似 runtime `toolUseConfirm.permissionResult.decisionReason` 未透传（verdictLine `default` 支 → null）或渲染路径未达。**需 Main 白盒确认 no-rule Bash 命令的 runtime `decisionReason`（建议 Ctrl+d debug 面板 / 单测断言）。**
- **严重度**：P0 —— P0a「为何在问你」可解释面**整体**断裂（非仅 mode 一句；危险/路径两类 verdict 同样缺席），0.1.25 上首次因 ask 面现形而暴露。

---

## 已确认修复（非缺陷）

**#265 核心静默放行洞已堵**：
- S-024M `rm -rf` → 弹框现形（0.1.24 时静默放行）。
- S-024L no-rule `touch` → 弹框现形 + Esc 拒绝（"The user doesn't want to proceed"）。
- S-024I allow 规则 → 自动放行（0 次弹卡）。

## 附：A1×5 结论

A1 会话域 always / 危险前缀护栏 / allow 自动放行三条核心行为在 #265 后全部 PASS；仅 A4「verdict 可解释」一句表面断裂，打回 Main 修复。