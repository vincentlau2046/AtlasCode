# B 波 S1 深迁移阻塞报告

> 2026-09-22 · Session 1 (sandbox + executor) · 状态：需 C 波 port 基础设施解锁

## 已完成（自洽层，零 cross-domain 运行时依赖）

| 文件 | 行 | 内容 | 状态 |
|---|---|---|---|
| `src/shared/env.ts` | 52 | parseBoolEnv + parseBoundedIntEnv 纯函数 | ✅ 实现 + 测试 |
| `src/executor/config.ts` | 38 | createShellExecutorConfig() | ✅ 实现 + 测试 |
| `src/executor/types.ts` | 97 | ExecResult/Executor/ExecError/AscendConfig 等 | ✅ 全迁移 |
| `src/executor/toolchain.ts` | 73 | NpuToolchain + applyToolchainPlaceholders | ✅ 全迁移 + 测试 |
| `src/executor/index.ts` | 28 | 门面 re-export | ✅ |
| `src/sandbox/config.ts` | 42 | createSandboxConfig() | ✅ 实现 + 测试 |
| `src/sandbox/runtime-types.ts` | 113 | sandbox-runtime 11 结构类型 | ✅ 从 vendor shim 下沉 |
| `src/sandbox/types.ts` | 165 | SandboxManager(32法) + SandboxDependencies | ✅ 全迁移 |
| `src/sandbox/violationText.ts` | 38 | tag 移除/提取纯函数 | ✅ 全迁移 + 测试 |
| `src/sandbox/sandbox-events.ts` | 114 | ViolationEvent + DefaultSandboxEventBus | ✅ 全迁移 + 测试 |
| `src/sandbox/index.ts` | 53 | 门面 re-export | ✅ |

**CI 四件套**：tsc 0 / lint 0 / test 46 pass / build ✓。

## 阻塞：深迁移需 C 波 port 基础设施

以下文件的实现迁移**blocked**，原因是跨域传递依赖闭包过深（30+ 文件 / 3000+ 行），
charter C 波（C1 shared 叶子下沉 + C2 8 port 化）正是为此设计。强行迁移只有两条路，
均不可取：① 把 task/hooks/permissions/bootstrap 代码拉进 executor/sandbox（违反 L3 域边界）；
② stub 跨域依赖（产出不可运行代码，违反"不重写逻辑"）。

### executor 侧（Shell.ts 闭包）

| 阻塞文件 | 旧仓行数 | 阻塞依赖（跨域） |
|---|---|---|
| `shell/Shell.ts` | 463 | bootstrap/state（getOriginalCwd/setCwdState）、core/sandbox/compat（**反向依赖** Shell→sandbox，应注入）、hooks/fileChangedWatcher、permissions/filesystem、sessionEnvironment |
| `shell/ShellCommand.ts` | 466 | **Task.ts（generateTaskId）、task/TaskOutput（390L 类）、task/diskOutput（451L）** — task 输出基础设施，非 executor 域 |
| `ShellExecutor.ts` | 157 | 依赖 Shell.ts + ShellCommand.ts（上述闭包） |

**根因**：ShellCommand 依赖 TaskOutput（task 域的 stdout/stderr 缓冲 + 文件 I/O + 进度追踪类）。
TaskOutput 自身又依赖 CircularBuffer/debug/fsOperations/shell/outputLimits/stringUtils/diskOutput
（390L + 451L + 各自子依赖）。这是 task 域基础设施，不应进 executor。

**解锁条件**：C 波 TaskOutput port（charter C2 8 port 之一）+ bootstrap state port + sandbox 注入。
ShellExecutor 的 Executor 接口契约已就位（types.ts），C 波 port 化后实现迁移是机械适配。

### sandbox 侧（createSandboxManager 闭包）

| 阻塞文件 | 旧仓行数 | 阻塞依赖（跨域） |
|---|---|---|
| `createSandboxManager.ts` | 609 | utils/errors（238L）、utils/debug（**271L → 8 子依赖**）、utils/ripgrep（**673L → 8 子依赖**）、utils/settings/* |
| `sandbox-backend.ts` | 302 | `#atlas-sandbox-runtime` 运行时值加载器（vendor shim 170L，需 src/sandbox/runtime.ts）|
| `ripgrep.ts` | 673 | bundledMode/debug/envUtils/execFileNoThrow/findExecutable/log/platform/stringUtils（8 跨域依赖）|
| `pathResolve.ts` | 66 | utils/path（expandPath → getCwd/getFsImplementation/homedir，级联）|

**根因**：ripgrep（673L）和 debug（271L）各带 8 个跨域子依赖，整条 utils 链 30+ 文件互锁。
charter 附录 C ② 带"带行为 utils（12，域自管 or shared 工具）"已识别此类——C1 波逐文件
分类（纯函数→shared / 带副作用→消费域 / 走 port）后才能干净迁移。

**解锁条件**：C1 波 utils 叶子下沉（debug/errors/fsOperations/platform → shared）+
ripgrep 收进域内（其 8 子依赖先下沉 shared 或 port 化）。

## 建议

1. **B 波收口**：S1 交付的自洽层（config + types + 自包含模块 + 46 测试）已是 B 波可独立
   验收的增量——四域 config.ts 契约全实现、executor/sandbox 类型契约全迁移、门面就位。
2. **深迁移归 C 波**：Shell.ts/createSandboxManager.ts 的实现迁移并入 C1（utils 下沉）+
   C2（port 化）波次，port 就位后是机械适配（接口契约已锁，不动签名）。
3. **不降级验收**：B6 gate（四域独立编译 + 域单测绿）对 S1 侧成立——executor/sandbox
   均独立编译绿、域单测 46 pass。ShellExecutor.ts stub 保留（不 re-export 自门面），
   消费方 C 波接线时实现。
