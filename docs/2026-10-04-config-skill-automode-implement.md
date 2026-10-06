# Implement 工单：配置命令立即生效 + Auto mode 打通 + 插件交互安装自动激活

分析侧 `issule analysist` 2026-10-04 提交 `AtlasCode 架构实施Main` 实施。三项均已定位到精确根因与改动点；回归判别方案见文末（分析侧承接验收）。

---

## Task A：Auto mode 打通（premium/fast/small 全开放 + 权限默认 4 选项）

用户裁定终版：**不需要判断 premium/small 角色池，premium/fast/small 都可实现；权限申请默认 4 个选项。**

### A1 放开 fast 角色池（单行 + 注释同步）

`src/tui/utils/model/modelAllowlist.ts:107`

```ts
const AUTO_MODE_ROLES: ModelRole[] = ['premium', 'small']
// → 改
const AUTO_MODE_ROLES: ModelRole[] = ['premium', 'fast', 'small']
```

连带把两处写着「fast 不进默认放行清单」的旧裁定注释改掉（2026-09-19 裁定，已被本条终版推翻）：
- `modelAllowlist.ts:94`（`fast 不进默认放行清单——快速/轻量模型不预信任跑安全分类器` 段）
- `betas.ts:113`（同款段）

fast 进 `AUTO_MODE_ROLES` 后，`localPoolRefs()`（modelAllowlist.ts:109）自动并进 fast 池成员，`isModelInLocalModelPools`（:123）→ `modelSupportsAutoMode`（betas.ts:115）→ `isAutoModeGateEnabled`（permissionSetup.ts:1250）整链零改动即通。

### A2 权限弹框默认 4 选项（auto 作为弹框按钮，已与用户确认 UI 面）

用户已确认：**落在权限弹框按钮面**（工具请求授权时弹出的对话框），不是 shift+tab 模式循环。

现状：权限弹框选项由各操作构造器生成——文件权限走 `getFilePermissionOptions`（`src/tui/components/permissions/FilePermissionDialog/permissionOptions.tsx:54`），当前是 Yes（accept-once）/ Yes, session（accept-session）/ No（reject）三档；其余弹框（Bash / PowerShell / NotebookEdit / FileEdit / WebSearch 等）各有 inline options。弹框内 shift+tab 切模式走 `confirm:cycleMode` → `useFilePermissionDialog.ts:133/144`（handleCycleMode）作为既有「模式切换进弹框」先例。

目标：权限弹框默认给出 **4 个选项**，第 4 个 = auto mode（选中即把本 session 切到 auto：`transitionPermissionMode('auto')`，`permissionSetup.ts:585`）。

改动画：
1. `getFilePermissionOptions` 追加第 4 个 option（`option: { type: 'accept-auto-mode' }` 之类），auto 不可用时（`isAutoModeGateEnabled()` false）隐藏该档。
2. 各 inline options 弹框（Bash/PowerShell/NotebookEdit/…）同款补齐，或抽个共享 `AutoModePermissionOption` 复用。
3. 选中 auto 的语义：切模式后当前这笔 pending 请求按 auto 逻辑走（open 分类器判定；危险工具仍弹框问，用户之前裁定「危险工具仍弹框问」）。具体实现（切了模式后是 re-dispatch 当前请求还是只落模式、当前请求仍按 accept/reject 收一次）请 main 裁定并注明。

> 锚点补充：`PermissionPrompt.tsx`（通用弹框，`options: PermissionPromptOption[]` 透传自各构造器）；`transitionPermissionMode`（permissionSetup.ts:585）为模式切换原语；`useFilePermissionDialog.ts:133` handleCycleMode 为既有「弹框内切模式」范式。

---

## Task B：配置命令立即生效（local-jsx 默认 immediate + 杀 growthbook stub）

根因（两个口子，都在 immediate 判定）：
1. `/model` `/fast` `/effort` 的 `immediate` getter → `shouldInferenceConfigCommandBeImmediate()` → growthbook stub `atlas_immediate_model_command` 恒 false（`immediateCommand.ts:10-15`）。AtlasCode 无 growthbook，此 gate 是死 stub。
2. `/autocompact` 及只读展示命令（`/cost` `/usage` `/stats` `/memory` `/session` `/context`）无 `immediate` 字段 → 恒 undefined → busy 时排队。

改动：
1. `src/tui/utils/immediateCommand.ts:10-15`：`shouldInferenceConfigCommandBeImmediate()` 直接 `return true`。
2. `src/tui/utils/handlePromptSubmit.ts:237-243`：immediate 判定从 `cmd.immediate && ...` 改为 local-jsx 默认 immediate —— `(cmd.immediate ?? true) && ...`（undefined → true，显式 `immediate: false` 可 opt-out），使 `/autocompact` 与只读展示命令 busy 时立即执行。

判定：只读展示类一并 immediate（分析侧建议已被用户认可——只读类更该立即生效，读到 in-flight 旧值属良性，远优于整条命令 stall）。

---

## Task C：插件交互安装自动激活（Layer-3 refresh，去 /reload-plugins）

根因（已核实，**非发现层缺陷**）：三层模型里交互安装只做了 Layer-2 物化 + `clearAllCaches()`（发现缓存确实清到位了——`clearCommandsCache` → `clearPluginSkillsCache` → `getPluginSkills.cache.clear()`），但 **Layer-3 AppState 换血（`refreshActivePlugins`）被 PR 5b/5c 故意留在手动 `/reload-plugins`**：
- `refresh.ts:14-17` 注释：「NOT called from useManagePlugins needsRefresh effect (PR 5c)；/plugin menu sets needsRefresh (PR 5b)」。
- `PluginSettings.tsx:1077-1081`（/plugin 菜单安装成功 → `needsRefresh: true`）。
- `useManagePlugins.ts:272-281`（needsRefresh effect → 只弹通知，注释「Do NOT auto-refresh」）。
- `pluginInstallationHelpers.ts:561`（success message 写「Run /reload-plugins to activate」）。

改动：
1. `/plugin` 菜单安装成功后，用 `await refreshActivePlugins(setAppState)` 替代 `needsRefresh: true`（`PluginSettings.tsx:1081` 附近）。
2. `useManagePlugins.ts` 的 needsRefresh effect 同步改为 auto-refresh（或删除该通知分支）。
3. `pluginInstallationHelpers.ts:561` 消息去掉「Run /reload-plugins to activate」。

> ⚠️ 设计取舍需 main 裁定：`refreshActivePlugins` 会连带 reinit LSP（refresh.ts:145）、MCP reconnect（:136）、hook 全量 reload（:154），有会话内副作用。若不想每次安装都 LSP 重连，可做「轻量版」只 swap `AppState.commands`（skills/commands 列表），不留 LSP/MCP。请 main 选其一实施并注明理由。

---

## 回归判别方案（分析侧承接，main 落地后执行）

- **A**：新增 `user-e2e/repro-auto-mode.ts` —— import `modelSupportsAutoMode` / `isAutoModeGateEnabled`，从 `getRoleModels('fast')` 取真实 fast 池模型名，断言 `modelSupportsAutoMode(fastModel) === true`（修前 false）；附 cycle 判别（auto 在循环里一档可见）。A2 re-dispatch 面另加 pty 探针：gate 开时权限弹框现第 4 档 auto → 选它对非危险工具 auto 放行、对危险工具仍弹框再问。
- **B**：复用 `user-e2e/repro-slash-model.ts` + `repro-slash-autocompact-spinner.ts`，加 busy 态立即生效断言（长回合中发 `/model` `/autocompact` `/cost`，断言不排队、立即出结果）。
- **C**：复用 `$CLAUDE_JOB_DIR/tmp/repro-plugin-skills.ts` / `repro-skilltool.ts`，扩展为「temp `ATLAS_CONFIG_DIR` 里模拟安装 → 断言 `getSkillToolCommands` 立即含新 skill（无需 /reload-plugins）」。