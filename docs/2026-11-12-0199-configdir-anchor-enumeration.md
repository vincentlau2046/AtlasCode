# 0.1.99 S1a 步 2 — getConfigDirName 消费点锚定分型全量清册（row F 批复条件②）

f4 批复 @§8 b8a55c40（2026-11-12）：双出口拆分 `getConfigDirName()`（homedir 锚，四层全序）/
`getConfigDirNameForProject()`（项目根锚/名字标签，剥 L1 三层）。本清册 = `join(…getConfigDirName)`
域级扫描逐点分型归档（anchored 正则 + 逐点人工复核），随波收尾归档。

恒等判据：`ATLAS_CONFIG_DIR` 未设时两出口同值（现网行为字节级不变）。分型唯一效应 = L1 全路径
不再进入项目点目录/名字标签位（canon 19 fail 单根因修复实证）。

## KEEP（homedir/XDG 锚 / env 旁路，维持四层全序）

| 站点 | 锚型 |
|---|---|
| src/memory/envUtils.ts:19 | `ATLAS_CONFIG_DIR ?? join(homedir(), …)` 旁路 |
| src/engine/config/configRoot.ts:19 | 同旁路 |
| src/engine/session/env.ts:61 | 同旁路 |
| src/tui/utils/envUtils.ts:12 | 同旁路 |
| src/cli/debugSink.ts:164 | 同旁路 |
| src/bootstrap/state.ts:407 | 同旁路 |
| src/tui/utils/ide.ts:476,501 | WSL/用户主目录锚（ide lockfile） |
| src/tui/utils/completionCache.ts:28 | `join(home, …)` |
| src/tui/utils/doctorDiagnostic.ts:214 | `join(homedir(), …, 'local')` |
| src/tui/utils/nativeInstaller/installer.ts:118,121,124,1580 | XDG data/cache/state + homedir |
| src/tui/components/StatusLine/segments/statusLineConfig.ts:56,157 | `join(homedir(), …)` |
| src/tui/components/permissions/FilePermissionDialog/permissionOptions.tsx:38 | 全局 `~/<cfg>` 判定 |

## SWITCH（项目根锚 / 名字标签，切 ForProject 出口）

| 文件 | 代码站点 | 锚型 |
|---|---|---|
| src/engine/skill/markdownLoader.ts | 209,252,260,266 | walk-up 项目目录 / gitRoot / canonicalRoot / managed 子路径 |
| src/engine/skill/skillCommand.ts | 68,72 | managed 子路径 / 相对名 |
| src/engine/worktree/worktree.ts | 232 | `join(repoRoot, …, 'worktrees')` |
| src/engine/scheduler/cronTasks.ts | 101,200 | `getProjectRoot()` 锚 |
| src/engine/scheduler/cronTasksLock.ts | 39 | 同上 |
| src/engine/config/settings.ts | 324,326 | projectSettings/localSettings 相对路径 |
| src/engine/tools/files/fileEditConstants.ts | 18,21 | 权限 pattern 串（名标签） |
| src/shared/tempDir.ts | 22,26 | tmp 目录名标签（`.atlas-{uid}`） |
| src/atlascode/sandboxDeps.ts | 62 | sandbox deps provider（denyWrite cwd 锚） |
| src/tui/factory.ts | 166 | sandbox deps provider（同上，shorthand 改显式键） |
| src/tui/utils/worktree.ts | 209 | `join(repoRoot, …, 'worktrees')` |
| src/tui/utils/markdownConfigLoader.ts | 251,302,322,328 | walk-up / managed / gitRoot / canonicalRoot |
| src/tui/utils/cronTasks.ts | 71,167 | `getProjectRoot()` 锚 |
| src/tui/utils/cronTasksLock.ts | 24 | 同上 |
| src/tui/utils/config.ts | 1693 | managed rules 子路径 |
| src/tui/utils/memoryFiles.ts | 888,899,944,955,1243,1262,1310,1427 | 项目/additional 目录 join + 路径段匹配 |
| src/tui/utils/plugins/addDirPluginSettings.ts | 41,64 | additional 目录 join |
| src/tui/utils/skills/skillChangeDetector.ts | 237 | additional skills 目录 join |
| src/tui/utils/hooks/skillImprovement.ts | 186 | `join(getCwd(), …, 'skills')` |
| src/tui/skills/loadSkillsDir.ts | 81,85,655,688,725,899 | managed/相对名/additional/walk-up |
| src/tui/utils/permissions/filesystem.ts | 82,111,170,193,238-240,314,319,465,1639 | DANGEROUS_DIRECTORIES / 路径段匹配 / 项目 join / tmp 名标签 |
| src/permissions/filesystem.ts | 128,170,193,285 | 同上（permissions 域副本） |
| src/tui/utils/settings/settings.ts | 301,303 | projectSettings/localSettings 相对路径 |
| src/tui/components/agents/types.ts | 6 | FOLDER_NAME 标签 |
| src/tui/components/agents/new-agent-creation/wizard-steps/LocationStep.tsx | 20 | 显示标签 |
| src/tui/components/agents/new-agent-creation/wizard-steps/MemoryStep.tsx | 38 | 显示标签 |
| src/tui/components/skills/SkillsMenu.tsx | 102 | 显示标签 |
| src/tui/tools/AgentTool/agentMemory.ts | 44,60,81,98 | project/local scope `join(getCwd(), …)` |
| src/tui/tools/AgentTool/agentMemorySnapshot.ts | 33 | `join(getCwd(), …)` |
| src/tui/tools/FileEditTool/constants.ts | 6,9 | 权限 pattern 串 |
| src/tui/components/permissions/FilePermissionDialog/permissionOptions.tsx | 19 | 项目 `<cwd>/<cfg>` 判定 |

## 接口不动点

- `src/sandbox/types.ts:73` `getConfigDirName(): string` —— SandboxDependencies 接口方法名不变
  （签名面冻结）；两个 provider（atlascode/sandboxDeps.ts、tui/factory.ts）注入值切 ForProject。
- `src/sandbox/createSandboxManager.ts:157-162` 经 `deps.getConfigDirName()` 消费，随 provider 切换生效。

## 扫描中发现的前存在 artifact（不属本波改动，登记待 f4 裁）

- `src/tui/screens/Doctor.tsx:170` —— `join(getOriginalCwd(), "getConfigDirName()", "agents")`：
  字符串字面量（de-Anthropic 全局替换误伤残留，同 permissions/filesystem.ts §8.16 已修先例），
  join 出目录名字面 `"getConfigDirName()"`。语义 bug 但非本波锁面范围，单独报裁。
- `src/tui/utils/doctorDiagnostic.ts:177-178`、`installer.ts:808` 等 `bingetConfigDirName()` /
  `butgetConfigDirName()` —— 同族字符串误伤残留（`.local/bin` + `atlas` 拼接位），无路径语义影响，
  登记不修。

## 判别格（条件③，tests/unit/s1a-step2-configdir-dims.test.ts 4→6 格）

① atlascode 默认恒等格 / ② product 层判别格 / ③ env 优先序格（双出口各验）/
④ office 目录探针隔离格 / ⑤ ForProject L1 剥离格（新增）/
⑥ 两出口同值恒等格（新增，L1 未设行为字节级不变判据）。
