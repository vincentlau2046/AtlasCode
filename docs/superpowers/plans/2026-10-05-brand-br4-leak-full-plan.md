# BR-4 · AtlasHarness 用户可见面全量收口实施计划（0.1.30）

> **状态**：实施计划（writing-plans）· **前置版本已出清（0.1.24 TUI / 0.1.25 #265 / 0.1.26 #278 / 0.1.27 波 C）** · 对应 spec §7.1 + §13.2
> **性质**：纯机械字面替换（`AtlasHarness`→`AtlasCode`），自包含、零依赖、不做 identity 化
> **范围修正（2026-10-05 复核）**：原 12 处 → **全量用户可见 ~80 处 / ~40 文件**（用户裁定「扩展为全量一次性收口」）

---

## 0. 改动规则（Main 照着做）

**替换对象**：所有**用户可见字符串字面量**里的 `AtlasHarness` → `AtlasCode`（错误消息、权限弹框、更新/安装提示、UI 标签、提交签名、shell 补全头等）。

**禁止替换（保留 `AtlasHarness` 原样）**：

| 类别 | 原因 | 文件/位置 |
|---|---|---|
| **迁移溯源注释** | 描述的是旧项目名，改了就断历史 | `src/ascend/tools/*`、`src/ascend/executor/*`（「从 AtlasHarness 移植」）、`src/engine/session/load.ts:30,1151`、`src/engine/session/types.ts`、`src/tui/utils/configDir.ts:28-32`、`commitAttribution.ts:28`、`releaseNotes.ts:28`、`src/atlascode/launcher.ts:7`、`src/engine/tools/web/preapproved.ts:27`、`src/tui/tools/WebFetchTool/preapproved.ts` |
| **注册表路径** | 文件系统标识，暂缓同 npm scope（spec §10.5） | `src/tui/utils/settings/mdm/constants.ts:23,25`（`HKLM/HKCU\SOFTWARE\Policies\AtlasHarness`） |

**随代码同步改的描述性注释**：注释本身描述的是「当前渲染的串」，代码改串后注释须同步（避免注释与代码脱节）。例：`src/tui/components/LogoV2/Clawd.tsx:98,124`「AH 子母 logo: … + "AtlasHarness" + …」→ 注释里的 AtlasHarness 一并改 AtlasCode；`self-describing` 注释同理。

> 一句话：**字符串字面量（含描述当前行为的注释）→ 改；历史/迁移溯源注释 + 注册表路径 → 留。**

---

## 1. 全量收口清单（按触面分组）

### 1.1 P0 启动屏 + 错误消息（12 处，每轮启动 / 高频必现）

| 文件:行 | 改法 |
|---|---|
| `src/tui/components/LogoV2/LogoV2.tsx:204,205` | `AtlasHarness`→`AtlasCode`（borderTitle + compactBorderTitle） |
| `src/tui/components/LogoV2/Clawd.tsx:110,136` | wordmark `AtlasHarness`→`AtlasCode`（**不碰** AH_ART L99-105/125-131，属 BR-3） |
| `src/tui/components/LogoV2/WelcomeV2.tsx:12,31,116` | `Welcome to AtlasHarness`→`Welcome to AtlasCode`（×3 分支） |
| `src/tui/components/LogoV2/CondensedLogo.tsx:51` | `AtlasHarness`→`AtlasCode` |
| `src/modelprovider/errorMessaging.ts:85,123,129,380` | 3×`...to AtlasHarness` + 1×`AtlasHarness is unable...`→`AtlasCode`（已复核：纯字面量、无子串匹配） |

### 1.2 权限弹框（22 处，每次权限请求必现）

| 文件 | 处 |
|---|---|
| `src/permissions/filesystem.ts` | 11（`AtlasHarness requested permissions to write/edit/read/use...`） |
| `src/tui/utils/permissions/filesystem.ts` | 11（同上） |

### 1.3 更新 / 安装（约 20 处）

| 文件 | 处 |
|---|---|
| `src/tui/cli/update.ts` | 10 |
| `src/tui/utils/autoUpdater.ts` | 2（`Your version of AtlasHarness needs an update` / WSL 提示） |
| `src/tui/commands/install.tsx` | 5 |
| `src/tui/utils/localInstaller.ts` | 1（`Failed to install AtlasHarness package`） |
| `src/tui/utils/nativeInstaller/installer.ts` | 2 |
| `src/tui/utils/nativeInstaller/pidLock.ts` | 1 |

### 1.4 主循环 / REPL / 模型 / MCP（约 22 处）

| 文件 | 处 |
|---|---|
| `src/tui/main.tsx` | 8 |
| `src/tui/screens/REPL.tsx` | 3 |
| `src/tui/utils/model/model.ts` | 5 |
| `src/tui/components/ModelSetup.tsx` | 1 |
| `src/tui/services/mcp/client.ts` | 4 |
| `src/tui/components/mcp/MCPRemoteServerMenu.tsx` | 1 |

### 1.5 提交签名 / 遥测 / 状态 / onboarding / swarm（约 13 处）

| 文件 | 处 |
|---|---|
| `src/tui/utils/attribution.ts` | 3（L74/321/367 `[AtlasHarness]`→`[AtlasCode]`，**不改** `PRODUCT_URL`，identity 化归 BR-1） |
| `src/tui/commands/insights.ts` | 4（含「multi-clauding」内部术语除外的 4 处牌子串） |
| `src/tui/utils/statusNoticeDefinitions.tsx` | 2（`instead of AtlasHarness account/Console key`） |
| `src/tui/projectOnboardingState.ts` | 1（`instructions for AtlasHarness`） |
| `src/swarm/constants.ts` | 3 |

### 1.6 其余用户可见（各 1-2 处，~20 文件）

`src/tui/utils/Shell.ts`(2) / `apiErrors.ts`(2) / `atlasDesktop.ts`(2) / `completionCache.ts`(1「# AtlasHarness shell completions」) / `commands.ts`(1) / `git.ts`(1) / `preflightChecks.tsx`(1) / `src/cli/setup.ts`(1) / `HelpV2.tsx`(1) / `Feedback.tsx`(1) / `AddWorkspaceDirectory.tsx`(1) / `FilePermissionDialog/permissionOptions.tsx`(1) / `PluginTrustWarning.tsx`(1) / `marketplacePreset.ts`(1) / `marketplaceManager.ts`(1) / `computerUse/wrapper.tsx`(1) / `SendMessageTool/SendMessageTool.ts`(1) / `engine/tools/team/sendMessageTool.ts`(1) / `permissions/PermissionRule.ts`(1) / `constants/github-app.ts`(1) / `utils/settings/...mdm/settings.ts`(2，仅注释)

> **权威清单**：实施时 `grep -rln "AtlasHarness" src/` 得全量 → 剔除「禁止替换」清单 → 每文件执行替换。

---

## 2. ⚠️ 编译产物注意

`LogoV2` 目录 4 组件（`LogoV2.tsx` / `Clawd.tsx` / `WelcomeV2.tsx` / `CondensedLogo.tsx`）是 **React Compiler 编译产物**（`import { c as _c } from "react/compiler-runtime"` + `_c(n)` memo cache + 尾部 base64 `sourceMappingURL`）。

- 字面替换直接作用于编译产物中的字符串字面量即可（历史上 AtlasHarness rebrand 即如此改编译产物）。
- **尾部 base64 source map 无需同步**：stale/dev-only，`bun build` 进 `dist/cli.js` 时不携带源映射语义，不影响运行。
- **不要**尝试「重新编译」这些文件——build pipeline 无 react-compiler 步骤（只 `bun build` 打包）。

## 3. 验证（spec §14.4 扩展 gate）

- [ ] `grep -rn "AtlasHarness" src/` 排除注释行 + mdm 注册表 + ascend/engine 迁移注释后，**用户可见字符串字面量 = 0**
- [ ] 剩余 `AtlasHarness` 仅含：`mdm/constants.ts:23,25` 注册表路径 + `ascend/*`/`engine/session/*` 迁移注释 + 历史追溯注释（configDir/commitAttribution/releaseNotes/launcher/preapproved）
- [ ] `atlas`（无参）启动 TUI：边框标题、欢迎语、logo wordmark、凝缩态全显 `AtlasCode` 无 `AtlasHarness`
- [ ] 触发权限弹框（读写文件）+ 账号/用量错误路径：消息显 `AtlasCode`
- [ ] `git commit` 后 PR body 签名显 `Generated with [AtlasCode]`
- [ ] 构建 + 既有 e2e 回归全绿

## 4. 依赖 / 时序

- **前置**：前置版本 0.1.24/0.1.25(#265)/0.1.26(#278)/0.1.27(波 C) 出清 + BR-8（0.1.29）落地；本工单为 0.1.30（紧随 BR-8 0.1.29）
- **自包含**：不依赖 BR-1/BR-2/BR-9/BR-3
- **后续**：0.1.31 BR-1+BR-2；0.1.32 BR-9 去 fork；BR-3 待审（不含本工单范围）