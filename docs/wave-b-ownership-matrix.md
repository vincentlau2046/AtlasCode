# B 波文件归属矩阵（契约冻结步第 3 项）

> **charter §2 要求**：分叉前锁死文件归属，每个文件归一个 session 独占，
> 防两 session 产出不兼容。shared 归 S1，S2 需加类型时提 PR 给 S1。

## Session 配对

| Session | 域 | shared 争用面 |
|---|---|---|
| **S1** | sandbox + executor | Executor/Shell 接口、PermissionRule、platform 纯函数（**shared 归 S1**） |
| **S2** | memory + modelprovider | types/atlas/message/effort/thinking/systemPromptType（需加类型走 PR 合并给 S1） |

## 文件归属

### shared/（S1 独占，S2 改走 PR）

| 文件 | 归属 | 契约冻结状态 |
|---|---|---|
| `shared/feature.ts` | S1 | ✅ A 波已实现 |
| `shared/identity.ts` | S1 | 契约冻结：VERSION/PRODUCT_NAME 等常量签名 |
| `shared/types.ts` | S1 | 契约冻结：Message/Tool/Tools/SystemPrompt/ThinkingConfig 签名 |
| `shared/types-session.ts` | S1 | 契约冻结：ToolPermissionContext/MCPServerConnection/TaskState 签名 |
| `shared/sanitizeToolName.ts` | S1 | 契约冻结：sanitizeToolName 签名（C 波实现） |
| `shared/tokenEstimation.ts` | S1 | 契约冻结：tokenEstimation 签名（C 波实现） |
| `shared/index.ts` | S1 | 门面 re-export（随各文件落地更新） |

> **S2 加 shared 类型规则**：S2 迁移 memory/modelprovider 时若发现需要新增 shared 类型，
> 不直接改 shared/*.ts，而是在自己的 worktree 里定义临时 local type + 标 `// TODO: PR to S1 shared`，
> 合并前提 PR 给 S1 合入 shared。防两 session 同时改 shared 产出冲突。

### sandbox/（S1 独占）

| 文件 | 动作 |
|---|---|
| `sandbox/config.ts` | 实现：读 ATLAS_GLOB_* + settings → SandboxConfig |
| `sandbox/createSandboxManager.ts` | 迁移：createSandboxManager(deps) + compat.ts 残留直连清除 |
| `sandbox/types.ts` | 迁移：SandboxManager/SandboxDependencies 接口 |
| `sandbox/ripgrep.ts` | 迁移：ripgrep 搜索后端收进域内 |
| `sandbox/index.ts` | 门面 re-export |

### executor/（S1 独占）

| 文件 | 动作 |
|---|---|
| `executor/config.ts` | 实现：读 ATLAS_SHELL/SHELL_PREFIX → ShellExecutorConfig |
| `executor/ShellExecutor.ts` | 迁移：ShellExecutor wraps Shell.ts |
| `executor/shell/Shell.ts` | 迁移：Shell 类收进域内 |
| `executor/shell/ShellCommand.ts` | 迁移：ShellCommand 收进域内 |
| `executor/shell/shellProvider.ts` | 迁移：shellProvider 收进域内 |
| `executor/toolchain.ts` | 迁移：toolchain 配置 |
| `executor/types.ts` | 迁移：Executor 接口 + NpuToolchain 接口 |
| `executor/index.ts` | 门面 re-export |

### memory/（S2 独占）

| 文件 | 动作 |
|---|---|
| `memory/config.ts` | 实现：读 ATLAS_DISABLE_AUTO_MEMORY/IDLE_* → MemoryConfig（改接 Port 8） |
| `memory/FileSystemMemoryStore.ts` | 迁移：MemoryStore 实现 |
| `memory/RootedMemoryStore.ts` | 迁移：RootedMemoryStore 装饰器 |
| `memory/paths.ts` | 迁移：memdir/paths/teamMemPaths 收进域内 |
| `memory/types.ts` | 迁移：MemoryStore 接口 |
| `memory/index.ts` | 门面 re-export |

### modelprovider/（S2 独占）

| 文件 | 动作 |
|---|---|
| `modelprovider/config.ts` | 实现：读 endpoint/role env+settings → ModelProviderConfig |
| `modelprovider/constants.ts` | 迁移：apiLimits/betas 自管（LLM 调用限制+beta header） |
| `modelprovider/ports/errorMessaging.ts` | 迁移：Port 2 errorMessaging |
| `modelprovider/index.ts` | 门面 re-export |
| 其余 modelprovider 文件 | C 波随 engine 迁移（B 波只做 config + constants + port） |

## 合并协议（串行，防 cherry-pick 竞态）

1. **S1 先合并**进 master → `git push origin master`
2. **S2** `git fetch` → rebase 到最新 master → 解决 shared/ 冲突（机械：类型定义合并）→ 合并 → push
3. 每次 push 后 `git merge-base --is-ancestor origin/master master` 验祖先链
4. 两 session 合并完 → 打 `wave-b` tag → B6 gate（四域独立编译 + 域单测全绿）

## 冲突预见

| 冲突点 | 解决方式（机械可恢复） |
|---|---|
| shared/types.ts 两 session 都加类型 | 类型声明合并不冲突（不同 export），机械合并 |
| shared/index.ts re-export 列表 | 合并两 session 的 re-export 行 |
| tsconfig.json paths | 不改（A 波已定，无 bun:bundle 映射） |
| eslint.config.mjs | 不改（A 波已定，element types 不变） |
