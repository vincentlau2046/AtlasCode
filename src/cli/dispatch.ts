/* eslint-disable custom-rules/no-process-exit -- W4 全量 lint 复原（§8.74.21）：CLI/壳合法进程出口点（exit 分发层/关闭工具/对话框退出动作），登记延后（exit 助手收敛 W-opt 波再议） */
/**
 * CLI 模式分派面（S-C2，§8.71.1.4）— 旧仓 main.tsx main() L517-773 逐字随迁 +
 * 裁登记，及 getInputPrompt L773-799 逐字随迁。
 *
 * 随迁：NoDefaultCurrentDirectoryInExePath 安全守卫 / SIGINT -p 特判 /
 * hasPrintFlag·hasInitOnlyFlag·hasSdkUrl·isTTY → setIsInteractive 判定 /
 * clientType 判定（GITHUB_ACTIONS / ATLAS_ENTRYPOINT 族 / remote ingress）/
 * questionPreviewFormat / ATLAS_ENVIRONMENT_KIND bridge 会话源标记 /
 * eagerLoadSettings / runCli 交接 / getInputPrompt（stdin 3s peek 超时支）。
 *
 * 裁登记（不随迁，复审勿当遗漏重提）：
 *   - profileCheckpoint（性能剖析面未落盘，残留守）/ initializeWarningHandler
 *     （警告处理器面 = 残留守）/ process.on('exit', resetCursor)（TUI 光标面
 *     = 壳波 #152）
 *   - cc://·cc+unix:// 预解析改写块（feature DIRECT_CONNECT，_pendingConnect
 *     缺席）/ LODESTONE deep-link 块（--handle-uri / __CFBundleIdentifier
 *     Apple Event）/ SSH_REMOTE 预解析块（_pendingSSH 缺席）= 域外裁
 *     （remote 族波 / IFF 网关波 [ATLAS-HOLD]，§8.71.1.3）
 *   - stopCapturingEarlyInput（早期输入捕获面未落盘，残留守）
 *   - SIGINT 非 -p 支：旧 gracefulShutdown(0) 族缺席（残留守）→ process.exit(0)
 *     逐字落地（headless -p 支由 print.ts 自注册 handler，S-C3 核销）
 *   - clientType 'claude-vscode' / 'claude-desktop' / 'local-agent' / 'remote'
 *     判定支保留（env 判定数据面，无消费依赖；desktop/CCR 消费面缺席不阻塞）
 */
import { isEnvTruthy } from '../shared'
import {
  setClientType,
  setQuestionPreviewFormat,
  setSessionSource,
  setIsInteractive,
} from '../bootstrap'
import {
  eagerLoadSettings,
  enforceNoDebugGuard,
  initializeEntrypoint,
} from './entryInit'
import { runCli } from './parse'

/**
 * CLI 主入口（旧仓 main() 同型；bin 壳 src/atlascode/cli.ts 经 cli 门面调用）。
 * 时序：debug 守卫 → 安全 env → SIGINT → 模式判定 → entrypoint → clientType →
 * settings 早加载 → runCli（commander parse）。
 */
export async function main(): Promise<void> {
  // 旧仓 main.tsx 顶层 L244 调试守卫 → 新仓 bin 入口首行（等价时序：任何命令
  // 执行前；de-ANT delta 见 entryInit.enforceNoDebugGuard 头注）
  enforceNoDebugGuard()

  process.stderr.write('[AtlasCode] main() starting...\n')
  // 裁登记：profileCheckpoint（性能剖析面未落盘）

  // SECURITY: Prevent Windows from executing commands from current directory
  // This must be set before ANY command execution to prevent PATH hijacking attacks
  // See: https://docs.microsoft.com/en-us/windows/win32/api/processenv/nf-processenv-searchpathw
  process.env.NoDefaultCurrentDirectoryInExePath = '1'

  // 裁登记：initializeWarningHandler（警告处理器面 = 残留守）

  process.on('exit', () => {
    // 裁登记：旧 resetCursor（TUI 光标面 = 壳波 #152 随迁），此处空 handler
    // 保留挂载点时序不变
  })
  process.on('SIGINT', () => {
    // In print mode, print.ts 注册自身 SIGINT handler = abort 在途 query
    //（S-C5 修波 B1，print.ts runHeadless 内 process.on('SIGINT', abort)；
    // 旧附 gracefulShutdown(0) 持久化/force-exit = 残留守〔进程生命周期/壳波〕）；
    // skip here to avoid preempting it with a synchronous process.exit().
    if (process.argv.includes('-p') || process.argv.includes('--print')) {
      return
    }
    // 裁登记：旧 gracefulShutdown(0) 族缺席（残留守），process.exit(0) 逐字
    process.exit(0)
  })

  // 裁登记：cc://·LODESTONE·SSH_REMOTE 三预解析块（域外裁，头注裁登记段）

  // Check for -p/--print and --init-only flags early to set isInteractiveSession before init()
  // This is needed because telemetry initialization calls auth functions that need this flag
  const cliArgs = process.argv.slice(2)
  const hasPrintFlag = cliArgs.includes('-p') || cliArgs.includes('--print')
  const hasInitOnlyFlag = cliArgs.includes('--init-only')
  const hasSdkUrl = cliArgs.some(arg => arg.startsWith('--sdk-url'))
  const isNonInteractive =
    hasPrintFlag || hasInitOnlyFlag || hasSdkUrl || !process.stdout.isTTY

  // Stop capturing early input for non-interactive modes
  // 裁登记：stopCapturingEarlyInput（早期输入捕获面未落盘，残留守）

  // Set simplified tracking fields
  const isInteractive = !isNonInteractive
  setIsInteractive(isInteractive)

  // Initialize entrypoint based on mode - needs to be set before any event is logged
  initializeEntrypoint(isNonInteractive)

  // Determine client type
  const clientType = (() => {
    if (isEnvTruthy(process.env.GITHUB_ACTIONS)) return 'github-action'
    if (process.env.ATLAS_ENTRYPOINT === 'sdk-ts') return 'sdk-typescript'
    if (process.env.ATLAS_ENTRYPOINT === 'sdk-py') return 'sdk-python'
    if (process.env.ATLAS_ENTRYPOINT === 'sdk-cli') return 'sdk-cli'
    if (process.env.ATLAS_ENTRYPOINT === 'claude-vscode') return 'claude-vscode'
    if (process.env.ATLAS_ENTRYPOINT === 'local-agent') return 'local-agent'
    if (process.env.ATLAS_ENTRYPOINT === 'claude-desktop') return 'claude-desktop'

    // Check if session-ingress token is provided (indicates remote session)
    const hasSessionIngressToken =
      process.env.ATLAS_SESSION_ACCESS_TOKEN ||
      process.env.ATLAS_WEBSOCKET_AUTH_FILE_DESCRIPTOR
    if (process.env.ATLAS_ENTRYPOINT === 'remote' || hasSessionIngressToken) {
      return 'remote'
    }
    return 'cli'
  })()
  setClientType(clientType)
  const previewFormat = process.env.ATLAS_QUESTION_PREVIEW_FORMAT
  if (previewFormat === 'markdown' || previewFormat === 'html') {
    setQuestionPreviewFormat(previewFormat)
  } else if (
    !clientType.startsWith('sdk-') &&
    // Desktop and CCR pass previewFormat via toolConfig; when the feature is
    // gated off they pass undefined — don't override that with markdown.
    clientType !== 'claude-desktop' &&
    clientType !== 'local-agent' &&
    clientType !== 'remote'
  ) {
    setQuestionPreviewFormat('markdown')
  }

  // Tag sessions created via `atlascode remote-control` so the backend can identify them
  if (process.env.ATLAS_ENVIRONMENT_KIND === 'bridge') {
    setSessionSource('remote-control')
  }

  // Parse and load settings flags early, before init()
  eagerLoadSettings()

  await runCli()
}

/**
 * 本地转写（旧仓 utils peekForStdinData 同语义）：stdin 首数据 peek，
 * timeoutMs 内无数据 resolve true（超时），有数据 resolve false。
 * 旧仓 utils 面缺席，本地最小实现（前向接缝登记：utils 域波可整换）。
 */
function peekForStdinData(
  stream: NodeJS.ReadStream,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false
    const onFirstData = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(false)
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      stream.removeListener('data', onFirstData)
      resolve(true)
    }, timeoutMs)
    stream.once('data', onFirstData)
  })
}

/**
 * 旧仓 getInputPrompt L773-799 逐字随迁（stdin 管道支 + stream-json 直透支 +
 * 3s 超时警告支）。
 */
export async function getInputPrompt(
  prompt: string,
  inputFormat: 'text' | 'stream-json',
): Promise<string | AsyncIterable<string>> {
  if (
    !process.stdin.isTTY &&
    // Input hijacking breaks MCP.
    !process.argv.includes('mcp')
  ) {
    if (inputFormat === 'stream-json') {
      return process.stdin
    }
    process.stdin.setEncoding('utf8')
    let data = ''
    const onData = (chunk: string) => {
      data += chunk
    }
    process.stdin.on('data', onData)
    // If no data arrives in 3s, stop waiting and warn. Stdin is likely an
    // inherited pipe from a parent that isn't writing (subprocess spawned
    // without explicit stdin handling). 3s covers slow producers like curl,
    // jq on large files, python with import overhead. The warning makes
    // silent data loss visible for the rare producer that's slower still.
    const timedOut = await peekForStdinData(process.stdin, 3000)
    process.stdin.off('data', onData)
    if (timedOut) {
      process.stderr.write(
        'Warning: no stdin data received in 3s, proceeding without it. ' +
          'If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.\n',
      )
    }
    return [prompt, data].filter(Boolean).join('\n')
  }
  return prompt
}
