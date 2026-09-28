/**
 * cli（CLI 公共域）S-C4（§8.71.1.4）— 启动 setup 面（旧仓 src/setup.ts 415L
 * 裁剪随迁）。
 *
 * 消费点：parse --init-only 支（S-C4 落盘；旧 main.tsx「Run Setup and
 * SessionStart hooks, then exit」语义）+ -p 支 runHeadless 前置（**S-C5 修波
 * S2 接线**；commit 6 头注误记「commit 6 接线」已订正——旧 main.tsx L1599
 * setup() 全模式前置含 -p，恢复 root/sudo 安全门 + cwd/worktree 状态初始化）。
 *
 * 随迁面（支序旧仓逐字）：
 *   - node>=18 gate（exit 1；chalk → plain stderr delta）
 *   - switchSession（customSessionId；旧 asSessionId 品牌 cast 裁，string 直传）
 *   - UDS messaging 启动：旧 feature('UDS_INBOX') 门 → 新 remote 域
 *    isUdsInboxEnabled()（parse.ts delta 同裁定）+ startUdsMessaging（旧仓
 *    逐字 stub 面——no-op resolve，旧仓零真实现，域头注登记非新接缝）；
 *    --bare 支 + 显式 --messaging-socket-path 逃生门逐字
 *   - teammate 快照（swarm 域 captureTeammateModeSnapshot；gate = !bare ∧
 *    isAgentSwarmsEnabled，旧 isBareMode() → bare 参数）
 *   - setCwd（旧 Shell setCwd → bootstrap ① cwdState，delta 登记）
 *   - hooks 快照 + FileChanged watcher（engine/config hooksConfig 门面 +
 *    hooks 域；captor 在 setCwd 后 = hooks 自正确目录加载，旧注释逐字）
 *   - worktree 链（engine/worktree 门面：git gate → slug → canonical root
 *    解析 + worktree→主仓切换 → tmux 会话名 → createWorktreeForSession →
 *    tmux 会话 → chdir/setCwdState/setOriginalCwd/setProjectRoot）
 *   - getCommands 预取（cli/commands.ts 再导出面；!bare）
 *   - bypassPermissions root/sudo 安全门（exit 1，旧仓逐字）
 *   - NODE_ENV=test 早退（安全门之后，旧仓支序逐字）
 *
 * 裁登记（H6 防空洞，复审勿当遗漏重提）：
 *   - terminal 备份恢复族（iTerm2 checkAndRestoreITerm2Backup / Terminal.app
 *    checkAndRestoreTerminalBackup）——新仓无 macOS 终端集成面，整裁；
 *   - initSessionMemory / CONTEXT_COLLAPSE init / lockCurrentVersion /
 *    attribution hooks / sessionFileAccessHooks / initSinks /
 *    prefetchApiKeyFromApiKeyHelper / releaseNotes·logo v2 getRecentActivity /
 *    config store lastCost·lastDuration 日志块——各归属面已裁（analytics
 *    死面清核 / 版本管理波 / 无 plugin 域 / auth 车道 = OpenAI 静态键无
 *    helper 执行面 / 无 release-notes 面 / 全局 config store 缺席），不随迁；
 *   - plugin 预取 loadPluginHooks·setupPluginHookHotReload + ATLAS_SYNC_
 *    PLUGIN_INSTALL 跳预取支（新仓无 plugin 域，plugin 域波）——getCommands
 *    预取保留（本域 commands.ts 再导出面，commit 1 头注登记核销）；
 *   - logForDiagnosticsNoPII / profileCheckpoint（诊断·profiler 死面）；
 *   - worktree 链 hasWorktreeCreateHook 非 git VCS hook 逃生门 = worktree
 *    域整砍（worktree.ts 头注登记）：--worktree 硬要求 git 仓（非 git 直接
 *    exit 1，旧「WorktreeCreate hook 可配」文案裁）；非 git hook 模式 tmux
 *    命名 else 支同裁；
 *   - saveWorktreeState（旧 sessionStorage 写面）/ clearMemoryFileCaches
 *    （memoryFiles 面）= 本波不随迁（session record save* 族 / memory 域，
 *    各归属波登记）；
 *   - worktreePRNumber 参数面保留但 parse 面传 undefined（无 --worktree-pr
 *    选项，PR 号面登记残留守）；
 *   - 默认 slug（订正 #28：旧 plans.ts L32-47 getPlanSlug 是真实词 slug 实现
 *   〔generateWordSlug + MAX_SLUG_RETRIES plans-dir 冲突重试〕，非「stub 退化
 *    族」；裁结论成立 = 新仓 engine 根门面未携 generateWordSlug，缺省降级本地
 *    session 片段前缀，勿为单一缺省扩 engine 门面）；
 *   - UDS 缺省 socket 路径 = tmpdir + session-id 约定（订正 #30：旧
 *    getDefaultUdsSocketPath 实现未实核，原登记「any stub 无真值」不实；本
 *    约定为惰性值——startUdsMessaging = 旧仓逐字 stub no-op，路径值不被消费）。
 *
 * boundaries allow 面扩展登记（eslint.config.mjs cli 规则同登记，S-C4
 * commit 3）：cli → swarm（captureTeammateModeSnapshot teammate 快照面，
 * 壳 compose.ts 同型先例）。
 */
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getProjectRoot,
  getSessionId,
  setOriginalCwd,
  setCwdState,
  setProjectRoot,
  switchSession,
} from '../bootstrap'
import {
  captureHooksConfigSnapshot,
  createTmuxSessionForWorktree,
  createWorktreeForSession,
  findCanonicalGitRoot,
  findGitRoot,
  generateTmuxSessionName,
  isAgentSwarmsEnabled,
  updateHooksConfigSnapshot,
  worktreeBranchName,
  type WorktreeSession,
} from '../engine'
import { initializeFileChangedWatcher } from '../hooks'
import { isUdsInboxEnabled, startUdsMessaging } from '../remote'
import { isEnvTruthy } from '../shared'
import { captureTeammateModeSnapshot } from '../swarm'
import { getCommands } from './commands'

/**
 * CLI 入口 setup 参数面（parse options 映射；worktreePRNumber parse 面无
 * 对应选项 = 恒 undefined，参数面保留防未来选项注册时改签名）。
 */
export interface CliSetupOptions {
  /** 目标 cwd（缺省 = process.cwd()；CLI 入口进程活读）。 */
  cwd?: string
  permissionMode?: string
  allowDangerouslySkipPermissions?: boolean
  worktreeEnabled?: boolean
  worktreeName?: string
  tmuxEnabled?: boolean
  customSessionId?: string | null
  worktreePRNumber?: number
  messagingSocketPath?: string
  /** --bare（旧 isBareMode() 全局读 → 显式参数，调用方 = parse options）。 */
  bare?: boolean
}

/** 默认 worktree slug（裁登记见头注：session 片段前缀）。 */
function defaultWorktreeSlug(): string {
  return `atlas-${getSessionId().replace(/-/g, '').slice(0, 8)}`
}

export async function runCliSetup(options: CliSetupOptions): Promise<void> {
  // ── node>=18 gate（旧仓逐字；chalk → plain stderr delta）──
  const nodeVersion = process.version.match(/^v(\d+)\./)?.[1]
  if (!nodeVersion || parseInt(nodeVersion) < 18) {
    // S7 订正：新仓品牌 = AtlasCode（与 parse.ts program 描述句自洽；commit 3
    // 误抄旧仓「AtlasHarness」，本修波订正品牌自洽）。
    process.stderr.write(
      'Error: AtlasCode requires Node.js version 18 or higher.\n',
    )
    process.exit(1)
  }

  const bare = options.bare === true
  const cwd = options.cwd ?? process.cwd()

  // ── session id（旧 asSessionId 品牌 cast 裁，string 直传）──
  if (options.customSessionId) {
    switchSession(options.customSessionId)
  }

  // ── UDS messaging（--bare 跳过，显式 --messaging-socket-path 逃生门
  //    逐字；startUdsMessaging = 旧仓逐字 stub 面 no-op，裁登记见头注）──
  if (
    (!bare || options.messagingSocketPath !== undefined) &&
    isUdsInboxEnabled()
  ) {
    const socketPath =
      options.messagingSocketPath ??
      join(tmpdir(), 'atlas-messaging', `${getSessionId()}.sock`)
    await startUdsMessaging(socketPath)
  }

  // ── teammate 快照（SIMPLE/bare-only 门逐字；swarm 未启用 = 跳过）──
  if (!bare && isAgentSwarmsEnabled()) {
    captureTeammateModeSnapshot()
  }

  // ── cwd 细化（旧 Shell setCwd → bootstrap ① cwdState；必须在任何
  //    依赖 cwd 的代码前）──
  process.chdir(cwd)
  setCwdState(cwd)

  // ── hooks 快照（须 setCwd 后调用，hooks 自正确目录加载，旧注释逐字）+
  //    FileChanged watcher（同步，读 hooks 配置快照）──
  captureHooksConfigSnapshot()
  initializeFileChangedWatcher(cwd)

  // ── worktree 链（旧仓逐字；hasWorktreeCreateHook 非 git VCS 逃生门裁
  //    （worktree 域整砍）→ git 仓硬要求）──
  if (options.worktreeEnabled) {
    const inGitRoot = findGitRoot(cwd)
    if (inGitRoot === null) {
      process.stderr.write(
        `Error: Can only use --worktree in a git repository, but ${cwd} is not a git repository.\n`,
      )
      process.exit(1)
    }

    const slug =
      options.worktreePRNumber !== undefined
        ? `pr-${options.worktreePRNumber}`
        : (options.worktreeName ?? defaultWorktreeSlug())

    // canonical root 解析（处理自 worktree 内调用）+ worktree→主仓切换
    // （git 前导逐字；旧 inGit 分支，非 git else 支随 hook 面同裁）
    const mainRepoRoot = findCanonicalGitRoot(cwd)
    if (!mainRepoRoot) {
      process.stderr.write(
        'Error: Could not determine the main git repository root.\n',
      )
      process.exit(1)
    }
    let workCwd = cwd
    if (mainRepoRoot !== inGitRoot) {
      process.chdir(mainRepoRoot)
      setCwdState(mainRepoRoot)
      workCwd = mainRepoRoot
    }
    const tmuxSessionName = options.tmuxEnabled
      ? generateTmuxSessionName(workCwd, worktreeBranchName(slug))
      : undefined

    let worktreeSession: WorktreeSession
    try {
      worktreeSession = await createWorktreeForSession(
        getSessionId(),
        slug,
        tmuxSessionName,
        options.worktreePRNumber !== undefined
          ? { prNumber: options.worktreePRNumber }
          : undefined,
      )
    } catch (error) {
      process.stderr.write(`Error creating worktree: ${String(error)}\n`)
      process.exit(1)
    }

    if (options.tmuxEnabled && tmuxSessionName) {
      const tmuxResult = await createTmuxSessionForWorktree(
        tmuxSessionName,
        worktreeSession.worktreePath,
      )
      if (tmuxResult.created) {
        process.stdout.write(
          `Created tmux session: ${tmuxSessionName}\nTo attach: tmux attach -t ${tmuxSessionName}\n`,
        )
      } else {
        process.stderr.write(
          `Warning: Failed to create tmux session: ${tmuxResult.error}\n`,
        )
      }
    }

    process.chdir(worktreeSession.worktreePath)
    setCwdState(worktreeSession.worktreePath)
    setOriginalCwd(worktreeSession.worktreePath)
    // --worktree 意味着 worktree 就是会话的 project（skills/hooks/cron 等
    // 在此解析；旧注释逐字）。setProjectRoot = bootstrap ⑥ 登记真 no-op 面。
    setProjectRoot(worktreeSession.worktreePath)
    // 设置缓存已自原目录填充，worktree 重读 + hooks 重捕获（旧注释逐字）。
    // saveWorktreeState / clearMemoryFileCaches 裁登记见头注。
    updateHooksConfigSnapshot()
  }

  // ── getCommands 预取（旧 skipPluginPrefetch 面 → bare 参数；plugin 预取
  //    裁登记见头注）──
  if (!bare) {
    // 保真订正（旧 main.tsx L1603 commandsPromise?.catch(() => {}) 逐字）：
    // getCommands 预取 fire-and-forget，吞掉 reject 防 unhandledRejection
    //（-p 支 S-C5 修波接线后，unit 测试经本支，catch 兼作测试面安全网）。
    void getCommands(getProjectRoot()).catch(() => {})
  }

  // ── bypassPermissions root/sudo 安全门（旧仓逐字；de-ANT 沙箱硬检已裁，
  //    旧注释语义保留）──
  if (
    options.permissionMode === 'bypassPermissions' ||
    options.allowDangerouslySkipPermissions
  ) {
    if (
      process.platform !== 'win32' &&
      typeof process.getuid === 'function' &&
      process.getuid() === 0 &&
      process.env.IS_SANDBOX !== '1' &&
      !isEnvTruthy(process.env.ATLAS_BUBBLEWRAP)
    ) {
      process.stderr.write(
        '--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons\n',
      )
      process.exit(1)
    }
  }

  if (process.env.NODE_ENV === 'test') {
    return
  }
  // 旧仓尾段 lastCost/lastDuration 日志块 = 全局 config store 缺席（裁登记
  // 见头注），无行为。
}
