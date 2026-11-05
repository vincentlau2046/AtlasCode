# 权限缺口工单 #263 / #264（P0a 验收逼出的 engine/tui 快路径缺口）

> 日期：2026-10-04。来源：P0a 验收（信任线·可解释审批）三轮根因调查侧发现，非 P0a 自身缺陷。
> 状态：待排期。归属：本 session 立单监控，Main 实施。
> 关联：[[tui-optimization-division]] / `docs/tui-differentiation-spec.md`（P0a 已通过，两缺口属域名外）。

---

## #263 TUI 面 checkPermissions 恒-allow stub（default 模式不保护 bash）

**现象**：`--permission-mode default` 下，TUI 车道任何 Bash 命令都静默放行（无权限弹框、无 verdict 行）。

**根因**（白盒，2026-10-04 与 Main 联合定位）：
- TUI 注册表（`src/tui/tools.ts:26`）用 TUI-local `BashTool`，其 `checkPermissions`（`src/tui/tools/BashTool/BashTool.ts:107-109`）是**恒-allow stub**：`return { behavior: 'allow', updatedInput: input }`（注释「裁定①：旧 buildTool 默认面，零行为」）。
- 完整规则链（deny/ask → allow 规则 → sandbox auto-allow → mode → read-only 快路径）只接在 **engine 侧** `bashToolHasPermission`（`src/engine/tools/bash/bashTool.ts:176-181`），TUI 车道不调用它。
- 通用管线（`src/tui/utils/permissions/permissions.ts`）1c `tool.checkPermissions` = stub 的 `'allow'` → step 3（`permissions.ts:1137-1148`）只把 `'passthrough'` 转 `'ask'`，`'allow'` 原样通过 → TUI 车道 Bash 任何模式静默放行。

**影响面**：TUI 交互式会话的 Bash 权限悬空——内容规则（如 `Bash(touch:*)`）永远到不了匹配点；只有整工具规则 `permissions.ask=['Bash']` 能经管线 1b 命中。

**修法方向**（归属：工具本体波；位于 P0a 零边界红线目录 `src/tui/tools/BashTool/` 之外）：
- A. 接 engine `bashToolHasPermission`（完整规则链）入 TUI BashTool.checkPermissions。
- B. 或至少把 stub 改 `passthrough`，把判定还给 mode/规则（管线 step 3 会把 passthrough 转 ask）。

**验收标准**：TUI 车道 `--permission-mode default` 下，非只读 Bash（如 `touch /tmp/x`）命中内容规则 `Bash(touch:*)` 应弹 ask 框（含 `Verdict:` 行）；不 seed 整工具规则时 default 模式也应拦下非只读命令。

---

## #264 engine `>` 重定向误判只读（`echo x > f` 自动放行）

**现象**：`echo x > f` 被 `isReadOnlyCommand` 判只读 → read-only 快路径直接 `allow`，绕过权限弹框。

**根因**：
- `isReadOnlyCommand`（`src/engine/tools/bash/bashReadOnly.ts:26`）只挡 `&& || ; |` 反引号 `$(`，**`>` 重定向不在守卫里**。
- `echo` ∈ READ_ONLY_PREFIXES，`isReadOnlyCommand` 只见 echo 前缀 + 只挡复合操作符，`>` 重定向漏掉 → 带 `>` 的 echo 被误判只读。

**影响面**：任何 `echo/printf … > 文件` 的重定向写入都绕过权限询问（真实权限判定缺口）。

**修法方向**（归属：engine/bash 只读判定）：`isReadOnlyCommand` 守卫加入 `>` / `>>` 重定向（带重定向即非只读）。

**验收标准**：`isReadOnlyCommand('echo x > f')` 应为 `false`（非只读）；TUI default 模式 `echo x > f` 应触发权限判定，不放行。

---

## 监控

- 两工单由本 session 立单监控，Main 实施。排期建议：TUI 差异化专项（P0b/P1a/P1b/P2）收口后，随工具本体波 / engine 只读判定波一并修；修完回填本文件「已修 commit」。
- 状态跟踪：#263／#264 修完 → 跑对应验收探针 → 勾销。