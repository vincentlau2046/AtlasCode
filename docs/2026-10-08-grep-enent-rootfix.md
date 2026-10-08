# 工单：Grep 工具 ENOENT 根修（方案 A+S3 — sandbox 单一事实源 + system 优先 + @vscode/ripgrep 兜底）

> **状态**：`已放行 / code-complete`（用户 2026-10-08 裁定 **A+S3 + 单独版本 0.1.44 + 协同 e2e + 本 lane 承担分析+Main 职责**，后**放行**实施；本 lane 已完成 §2 全部变更面 + §4.1 源级自检 + 四件套（tsc0·eslint0·build3847·全量单测 3814/0），待 e2e gate（§4）→ GATE-PASS → 本 lane T3 发布）。
> 分析 session（issule analysist）2026-10-08 落盘。落码归 Main 车道，测试侧归 e2e（atlas-user-e2e）。
> 关联记忆 `grep-tool-enent-npm-vendor`（根因）+ `r5-cache-defeats-r1-retry`（同 session 双缺陷，IFF 侧已用户自修，本工单不涉）。

---

## 0. 一句话

Grep 工具（+ 文件补全 / 全局搜索 / 文件计数 / Bash shell 集成 / doctor）在 **npm 通道恒 ENOENT**：C-Deep 波（c4a3ef5）裁定的"system-rg 单模式"只落到了 engine/sandbox 侧，**TUI 侧迁移漏了**——TUI 仍走旧三模式 resolver，默认落 builtin `vendor/ripgrep/...`（该二进制从未随 npm 包发布，0.1.7~0.1.42 四版 tarball 实测 0 条目）。本工单 = **完成裁定迁移到 TUI 侧（方案 A：TUI 6 消费方全走 sandbox 门面、删三模式分支）+ 二进制供给策略 S3（system rg 优先、`@vscode/ripgrep` 平台二进制兜底、缺失时可操作报错）**，全场景（含无系统 rg 的新机器）彻底根除 ENOENT。

**用户裁定链**（2026-10-08）：方案 A（单一事实源）→ 二进制供给问"能否打包/自动装" → 裁定 **A+S3**（system 优先 + `@vscode/ripgrep` 兜底）→ **单独版本 0.1.44**（0.1.43 multi-OS 收口后开波）→ **协同 e2e** → **本 lane 承担分析 + Main 职责（实施 + 发布），只协同 e2e**（2026-10-08 终裁，覆盖"落码一律 Main 车道"默认）。

---

## 1. 目标 / 非目标

**目标**
- `src/sandbox/ripgrep.ts` 成为 rg 解析**单一事实源**：三级 resolver = ① 系统 rg（$PATH，命令名 `rg` 由 OS 解析防劫持）② `@vscode/ripgrep` 的 `getBinPath()`（npm 自动装当前平台二进制）③ 缺失 → 可操作报错面。
- TUI 6 消费方（GrepTool / fileSuggestions / GlobalSearchDialog / main.tsx / ShellSnapshot / doctorDiagnostic）全改走 sandbox 门面；删 `src/tui/utils/ripgrep.ts` 三模式分支（builtin vendor + embedded argv0 + codesign）。
- npm 通道 Grep 全场景可用；无 rg 的新机器不再"恒 ENOENT"，而是 system 缺失自动落兜底二进制。

**非目标（0.1.44 收口契约边界，支柱①）**
- 不动 IFF（R5 缓存已用户自修）；不动引擎空输出判据（thinking-only 判空语义正确）。
- embedded/ant-native(bun) 的 argv0 shell-function 分支 + `hasEmbeddedSearchTools` bfs/ugrep 面 = dead 分支**留置 + E-1P 登记**（产品 npm-node 不触发；不裁，保 0.1.44 纯缺陷修波）。
- 孤儿模块（`findExecutable`/`bundledMode`/`execFileNoThrow` 若因本波零引用）不删，归后续 W 波。
- Windows 端到端真机核验 = 0.1.43 multi-OS 波已建 Windows lane，本波 gate 判据以 Linux + 平台矩阵单测覆盖，Windows 真机面登记（§4.3）。

---

## 2. 改动面（精确到文件 / 函数 / 签名）

### A. `src/sandbox/ripgrep.ts` 重写（单一事实源 + S3 兜底）

**新增依赖**（治理登记项，见 §6）：`package.json` dependencies 加 `@vscode/ripgrep`（MIT / Microsoft 维护；12 平台二进制走其 optionalDependencies，npm install 时自动只装当前平台、**无 postinstall**；API 已核：`getBinPath()` 于 `lib/index.js` 导出，平台包缺失时抛 `"Could not find @vscode/ripgrep-<platform>"` 明确错误）。
`package.json` build 脚本 `--external` 列表加 `@vscode/ripgrep`（`--target node`，运行时从 node_modules require，不 bundle）。`files: ["dist"]` 不变。

**三级 resolver**（替换现 `getRipgrepConfig` 单模式）：
```
resolveRg()（memoize，进程内一次）:
  1. 系统 rg：checkRipgrep()（rg --version 探测，2s 超时，已有）通过
     → { mode:'system', command:'rg', source:'path' }        // 命令名经 $PATH 由 OS 解析（防 ./rg 劫持，C-Deep 安全语义保留）
  2. 系统缺失：try { const p = getBinPath() } → 文件在场
     → { mode:'bundled-dep', command:p, source:'vscode-ripgrep' }  // 绝对路径 = 受控依赖目录，非 repo 相对路径，无劫持面
  3. 都失败 → { mode:'missing', command:'rg', source:'none' }
     → ripGrep/ripGrepStream/ripGrepFileCount 抛可操作错误：
       "rg not found (not in PATH and @vscode/ripgrep platform binary missing) — install ripgrep (apt/brew/scoop/winget) or re-run npm install (platform optional deps)"
```

**补 C-Deep 残余清单 ①②④**（从 TUI 移植、去 embedded/codesign/argv0 后的版本）：

| 新增 | TUI 源（`src/tui/utils/ripgrep.ts`） | 消费方 | 移植要点 |
|---|---|---|---|
| `ripGRepStream`（残余①） | :295-343 | GlobalSearchDialog | 删 argv0-spawn 分支 + codesign 调用；保留流式 onLines（跨 chunk 残留行 carry / stripCR / abort 竞态 close-guard / code 0\|1 成功语义） |
| `countFilesRoundedRg`（残余②）+ 私有 `ripGRepFileCount` | :475-521 / :246-281 | main.tsx | **新仓无 lodash** → keyed memo（key=dirPath+ignorePatterns）本地闭包实现（参考 `createSandboxManager.ts:55` memoizeNoArg 扩 keyed 版）；`countCharInString` 引 `src/shared/stringUtils.ts:57`（非 TUI 版）；TUI `logError` → shared `logForDebugging` |
| `getRipgrepStatus`（残余④） | :534-545 + 探测 :550-611 | doctorDiagnostic | 返回形状扩为 `{mode:'system'\|'bundled-dep'\|'missing', path, source, working:boolean\|null}`；探测复用 `checkRipgrep` + `getBinPath` 在场性；doctor 消费面（`working/mode/systemPath`，doctorDiagnostic.ts:590-597）同步适配 |

保留现有语义：EAGAIN 单线程重试、code 1=无匹配、部分结果回收、`RipgrepTimeoutError`（超时 20s + `ATLAS_GLOB_TIMEOUT_SECONDS`）、`maxBuffer 20MB`、SIGKILL killSignal。
**裁除**：argv0 分支、`codesignRipgrepIfNecessary`（:613+，服务从未发布的 builtin 二进制）、三模式 `USE_BUILTIN_RIPGREP` 分支、TUI WSL 60s 特例（C-Deep 已裁，统一 20s；登记 delta §3）。

`src/sandbox/index.ts` 补 export：`ripGrepStream` / `countFilesRoundedRg` / `getRipgrepStatus` / `checkRipgrep`（已有）。

### B. 6 个 TUI 消费方 rewire（`../utils/ripgrep.js` → sandbox 门面）

边界合法：`eslint.config.mjs:246` tui DEP allow 列表含 `sandbox`。

| # | 文件 | 现 import（行） | 改引 |
|---|---|---|---|
| 1 | `tools/GrepTool/GrepTool.ts` | `ripGrep` :21 | sandbox `ripGrep`；catch 处 :510 族 ENOENT/missing → 可操作消息（D 面） |
| 2 | `hooks/fileSuggestions.ts` | `ripGrep` :28 | sandbox `ripGrep` |
| 3 | `components/GlobalSearchDialog.tsx` | `ripGrepStream` :14 | sandbox `ripGrepStream` |
| 4 | `main.tsx` | `countFilesRoundedRg` :128 | sandbox `countFilesRoundedRg` |
| 5 | `utils/bash/ShellSnapshot.ts` | `ripgrepCommand` :18 | sandbox 版 `ripgrepCommand()`（返回 `{rgPath,rgArgs,source}`；argv0 恒 undefined → `createRipgrepShellIntegration` 走 alias-to-rg 分支，embedded function 分支留置 §1） |
| 6 | `utils/doctorDiagnostic.ts` | `getRipgrepStatus` :35 | sandbox 版（`{working,mode,systemPath}` 形状适配） |

### C. 删 `src/tui/utils/ripgrep.ts`（整文件离场）

三模式 resolver + embedded + codesign + `testRipgrepOnFirstUse`(Bun) + 6 个导出全移除。孤儿依赖（`findExecutable`/`bundledMode` 等）登记不删。

### D. 登记项（零码或半码）

- **E-1P#12**：`USE_BUILTIN_RIPGREP`（`src/engine/config/managedEnv.ts:118` 白名单）三模式裁除后成死键 → E-1P 登记（不删白名单项，留观察，同 E-1P 前例）。
- **E-1P#13**：TUI↔sandbox 双实现漂移已结构消除（本波后 TUI 无 ripgrep 实现）；embedded/ant-native argv0+bfs/ugrep 死分支登记留置。
- **依赖治理登记**：`@vscode/ripgrep` = 叶子二进制依赖（`lib/index.js` 仅出 `getBinPath`，无逻辑依赖树），按仓内依赖纪律登记（`docs/execution-strategy.md` / STR 面，落码时 Main 随行登记）。

---

## 3. 行为 delta（显式登记，非回归）

| delta | 旧（TUI 三模式） | 新（sandbox A+S3） | 判定 |
|---|---|---|---|
| npm 通道 rg 来源 | builtin vendor（从未发布 → 恒 ENOENT） | 系统 rg 优先 → `@vscode/ripgrep` 平台二进制兜底 | **根修** |
| 超时 | WSL 60s / 其他 20s | 恒 20s（`ATLAS_GLOB_TIMEOUT_SECONDS` 可调） | C-Deep 已裁（国内目标非 WSL），接受 |
| macOS codesign | builtin 二进制签名 | 无（builtin 裁除；兜底二进制来自 npm 依赖目录，不经 macOS quarantine 流程） | 登记 |
| embedded argv0 / bfs·ugrep | bun 内嵌面 | 裁（dead 分支留置 E-1P#13） | 产品 npm-node 不触发 |
| `rg --files` 计数（telemetry 已删消费方） | `countFilesRoundedRg` 服务 main.tsx | 同（keyed memo 本地化） | 等价 |

---

## 4. 回归判据（e2e gate brief，**0.1.44 实施后**触发）

### 4.1 源级断言（e2e 独立复验，非采信）
1. 全仓 `vendor/ripgrep` 字符串 **0 处**；`USE_BUILTIN_RIPGREP` 三模式分支离场（仅剩 managedEnv 白名单死键 + E-1P#12 注）。
2. `src/tui/utils/ripgrep.ts` 删除；6 消费方 import 全部指向 `src/sandbox`（grep 交叉，含 `@vscode/ripgrep` 仅 `src/sandbox/ripgrep.ts` 一处 require）。
3. `package.json`：`@vscode/ripgrep` 入 dependencies + build 脚本 `--external` 含该包。

### 4.2 PTY 行为探针（npm 通道，独立 PTY/sandbox）
- **G1 系统 rg 优先面**：正常 PATH（`/home/vince/bin/rg` 14.1.0 在场）→ Grep 工具真调用 → 结果与 `rg` 直跑一致 + **无 ENOENT** + resolver `source='path'`（debug 面/doctor 断言）。
- **G2 兜底面（本波关键新判据）**：PATH 隔离 sandbox（PTY env 剥除 rg 所在目录，如 `PATH=/usr/bin:/bin`）→ Grep 工具真调用 → **仍全绿**（落 `@vscode/ripgrep-linux-x64` 二进制）+ `source='vscode-ripgrep'`。
- **G3 缺失错误面**：单测级（Main 单测族承载，gate 交叉跑）：system 缺失 + `getBinPath` 抛错（mock）→ 可操作报错消息在场（非裸 ENOENT）。
- **G4 平台矩阵单测**：`getBinPath` 按 platform/arch 解析 12 包映射 + 不支持平台抛错 → 走 missing 错误面（覆盖 Windows/ARM，免真机）。
- **G5 消费方回归**：fileSuggestions 文件补全真触发 + doctor 面板 ripgrep 状态面 + ShellSnapshot 生成 snippet 含 alias-to-rg（PTY 面抽验，防 rewire 断线）。

### 4.3 四件套 + 生产 lane
- 四件套同口径（tsc/eslint/build/单测）。
- 生产 lane（发布后）：生产 install 0.1.44 → node_modules 内 `@vscode/ripgrep` + 当前平台包在场核验 + Grep 真调用无 ENOENT + npm SRI 三方 MATCH（packument integrity；注意 unpackedSize 因新增依赖上升，按新基线精确值）+ banner v0.1.44。
- **Windows 真机面 = 登记项**（0.1.43 lane 已建 Windows 通道，按需回放；本波 gate 以 G4 平台矩阵单测 + Linux PTY 为 hard 判据）。

---

## 5. 版本 / 触发序

- **0.1.44 独立波**：0.1.43 T3 收口已达成（master head = `f701208` = release commit，tag v0.1.43 在场；npm 面 = 用户裁定不发布）→ 0.1.44 直接 off master（`f701208`）开波，无排队阻塞。
- **角色分工（用户 2026-10-08 终裁，本任务覆盖"落码一律 Main 车道"默认）**：
  - **本 lane（分析 session）承担分析 + Main 职责**：实施（worktree/code-complete/四件套）+ 版本/发布/master 操作（bump/CHANGELOG/release commit/tag/push）+ 独立核验（源级 grep 交叉 + packument SRI + 判据复跑，不采信自报）。
  - **e2e（atlas-user-e2e）只做测试侧**（既有边界裁定不变）：gate/生产 lane/回归/报告/verdict。
  - **用户**：本稿审批 + 放行实施 + npm publish 裁定（0.1.44 npm 面：若发布需显式授权，否则按 0.1.43 裁定"不发布"）。
- 触发序（**用户放行后**由本 lane 直接执行，不再转发 Main session）：
  1. 本 lane：worktree off master（`worktree-0.1.44-grep` @ f701208）→ 实施 A+S3 改动面（§2）→ 四件套同口径绿 + 源级自查（§4.1）→ hash 留档（= e2e 被测体）。
  2. 本 lane → e2e（单信号）：gate brief = §4（判据表 + 探针设计 + pre-fix 判别基线：0.1.43 面 G2 必红〔无兜底、ENOENT〕→ post-fix 必绿 = 判别力闭环）。
  3. e2e gate（hard，支柱③ 未闭环不发布）→ GATE-PASS 单信号回本 lane（报告 + verdict）。
  4. 本 lane T3 发布序列：bump 0.1.44 + CHANGELOG + release commit + tag v0.1.44 + push（master 操作 = 本 lane，用户裁定）；npm = 按用户裁定。
  5. e2e 生产 lane（§4.3 同判据回放）→ 5 段闭环终态 + 本 lane 收口报告。

---

## 6. 风险 / 治理（知情项）

1. **新依赖治理**：`@vscode/ripgrep` 入 dependencies（叶子二进制依赖；registry.npmmirror 已核实可拉；12 平台 optional 包 npm 自动裁当前平台）。落码时 Main 在依赖纪律处随行登记（STR 面/execution-strategy）。
2. **unpackedSize 基线漂移**：新增依赖后 tarball 面变化 → 生产 lane SRI 判据按 0.1.44 新基线（e2e 首跑取精确值，同 0.1.42 SRI 观察面流程）。
3. **系统 rg 优先语义**：用户环境有 rg 走系统（版本用户可控），无系统 rg 走兜底（版本随依赖锁定 1.18.0 系）——两路 rg 版本可能不同，行为差（rg flag 兼容面）登记：resolver 只用 `rg --files/-n/-F/-m/--glob` 稳定旗标族，14.x 与 1.18 兼容。
4. **死分支留置**（E-1P#13）：embedded 面未来要复活时照登记重启。

---

## 7. 审阅状态

本稿 = 用户审阅对象。**未触发任何信号**（Main/e2e 未接令，代码未动）。审批后按 §5 触发序执行。
