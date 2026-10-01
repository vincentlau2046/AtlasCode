/**
 * cli/debugSink — headless 车道 debug 日志 sink（user-e2e 1606 §7 项 6：
 * N9-debug「--debug 注册但未实现」真缺口收口）。
 *
 * 背景：TUI 域 src/tui/utils/debug.ts 为完整实现（直读 argv/env，TUI 车道
 * `--debug` 面经 argv 扫描生效）；headless 车道（cli 域）的 logForDebugging
 * 此前自 src/shared 导入 = charter C-4 no-op 占位（「logging port 定案前
 * 保持 no-op」）→ parse.ts 注册的 --debug / --debug-to-stderr / --debug-file
 * 在 headless 车道零输出（e2e N9-debug 定性「注册但未实现」）。
 *
 * 0.1.7 裁定（charter C-4 不动）：本 sink 为 cli 域侧真 writer——shared 的
 * logging port 仍留 port 定案，engine/shared 域维持 no-op。面 = tui
 * debug.ts 的裁剪移植（argv/env 面逐字）：
 *  - 启用：--debug / -d / --debug=filter / --debug-to-stderr / -d2e /
 *    --debug-file[=path] / env DEBUG / DEBUG_SDK（任一设真即启用）
 *  - 级别：ATLAS_DEBUG_LOG_LEVEL（默认 debug；verbose 为高噪档）
 *  - 路由：--debug-to-stderr → stderr；--debug-file → 指定路径；
 *    缺省 = $ATLAS_CONFIG_DIR(或 ~/.atlas)/debug/<session>.txt
 *  - 过滤：--debug=filter（"api,hooks" 包含 / "!1p,!file" 排除；混合 = 全显，
 *    与 tui parseDebugFilter 逐字）
 *  - NODE_ENV=test 且非 stderr → 不落文件（测试零副作用）
 */
import { appendFile, mkdir } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { getSessionId } from 'src/bootstrap'
import { isEnvTruthy } from 'src/shared'

export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<DebugLogLevel, number> = {
  verbose: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
}

type DebugFilter = {
  include: string[]
  exclude: string[]
  exclusive: boolean
}

let initialized = false
let enabled = false
let toStderr = false
let sinkFile: string | null = null
let minLevel: DebugLogLevel = 'debug'
let filter: DebugFilter | null = null
/** 异步写队列（no-sync-fs 规则：fs 走 promises 面；串行链保序 + 吞错）。 */
let pendingWrite: Promise<void> = Promise.resolve()

function argvHas(flag: string): boolean {
  return process.argv.includes(flag)
}

/** 取 `--flag value` / `--flag=value` 形式参数值（值不以 `-` 开头）。 */
function argvValue(flag: string): string | undefined {
  const eq = process.argv.find(a => a.startsWith(flag + '='))
  if (eq) return eq.slice(flag.length + 1)
  const i = process.argv.indexOf(flag)
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('-')) {
    return process.argv[i + 1]
  }
  return undefined
}

/** 类别过滤解析（tui debugFilter.parseDebugFilter 裁剪逐字）。 */
function parseFilter(s: string | undefined): DebugFilter | null {
  if (!s || s.trim() === '') return null
  const filters = s
    .split(',')
    .map(f => f.trim())
    .filter(Boolean)
  if (filters.length === 0) return null
  const hasEx = filters.some(f => f.startsWith('!'))
  const hasIn = filters.some(f => !f.startsWith('!'))
  if (hasEx && hasIn) return null // 混合 = 全显（tui 逐字）
  const clean = filters.map(f => f.replace(/^!/, '').toLowerCase())
  return {
    include: hasEx ? [] : clean,
    exclude: hasEx ? clean : [],
    exclusive: hasEx,
  }
}

/** 类别抽取（tui extractDebugCategories 关键三模式：MCP 名 / [CAT] 头 / "cat:" 前缀）。 */
function extractCategories(message: string): string[] {
  const out = new Set<string>()
  const mcp = message.match(/^MCP server ["']([^"']+)["']/)
  if (mcp && mcp[1]) {
    out.add('mcp')
    out.add(mcp[1].toLowerCase())
  }
  const bracket = message.match(/^\[([^\]]+)\]/)
  if (bracket && bracket[1]) out.add(bracket[1].trim().toLowerCase())
  const prefix = message.match(/^([^:[]+):/)
  if (prefix && prefix[1]) out.add(prefix[1].trim().toLowerCase())
  return [...out]
}

function shouldShow(message: string): boolean {
  if (!filter) return true
  const cats = extractCategories(message)
  if (cats.length === 0) return false // 无类别 + 有过滤 = 隐（tui 逐字）
  return filter.exclusive
    ? !cats.some(c => filter.exclude.includes(c))
    : cats.some(c => filter.include.includes(c))
}

/**
 * 初始化 sink（幂等；组合入口 runHeadless 显式调用，单测亦可经
 * resetDebugSinkForTesting 重置后重入）。
 */
export function initDebugSink(): void {
  if (initialized) return
  initialized = true
  toStderr = argvHas('--debug-to-stderr') || argvHas('-d2e')
  const file = argvValue('--debug-file')
  if (file) sinkFile = file
  filter = parseFilter(
    argvValue('--debug') ?? argvValue('-d') ?? undefined,
  )
  const rawLevel = (process.env.ATLAS_DEBUG_LOG_LEVEL ?? '')
    .toLowerCase()
    .trim()
  if (Object.hasOwn(LEVEL_ORDER, rawLevel)) {
    minLevel = rawLevel as DebugLogLevel
  }
  enabled =
    argvHas('--debug') ||
    argvHas('-d') ||
    process.argv.some(a => a.startsWith('--debug=')) ||
    toStderr ||
    sinkFile !== null ||
    isEnvTruthy(process.env.DEBUG) ||
    isEnvTruthy(process.env.DEBUG_SDK)
  // 测试环境不落文件（非 stderr 面）——与 tui shouldWriteDebugLogs 语义对齐
  if (process.env.NODE_ENV === 'test' && !toStderr) {
    sinkFile = null
  }
  if (sinkFile === null && !toStderr) {
    const configDir =
      process.env.ATLAS_CONFIG_DIR ?? join(homedir(), '.atlas')
    sinkFile = join(configDir, 'debug', `${getSessionId()}.txt`)
  }
}

/** 测试钩子：重置全部状态（下一用例可重入 init）。 */
export function resetDebugSinkForTesting(): void {
  initialized = false
  enabled = false
  toStderr = false
  sinkFile = null
  minLevel = 'debug'
  filter = null
  pendingWrite = Promise.resolve()
}

/** 当前 sink 是否输出（测试断言面）。 */
export function isDebugSinkActive(): boolean {
  return initialized && enabled
}

/** sink 落点（stderr / 文件路径；未启用 = null）。测试断言面。 */
export function getDebugSinkTarget(): 'stderr' | string | null {
  if (!initialized || !enabled) return null
  return toStderr ? 'stderr' : sinkFile
}

/**
 * headless 车道 debug 日志（签名与 shared logForDebugging 对齐，
 * cli 域三消费文件 print/structuredIO/mcpConfigWrite 换绑本 sink）。
 */
export function logForDebugging(
  message: string,
  { level }: { level?: DebugLogLevel } = {},
): void {
  if (!initialized) initDebugSink()
  if (!enabled) return
  const lvl = level ?? 'debug'
  if (LEVEL_ORDER[lvl] < LEVEL_ORDER[minLevel]) return
  if (!shouldShow(message)) return
  const line = `${new Date().toISOString()} [${lvl.toUpperCase()}] ${message.trim()}\n`
  if (toStderr) {
    process.stderr.write(line)
    return
  }
  if (!sinkFile) return
  // no-sync-fs：异步 fire-and-forget（串行链保序；写失败吞错不炸车道，
  // 退出前经 flushDebugSink 等齐——runHeadless 末位 await）
  pendingWrite = pendingWrite.then(
    async () => {
      await mkdir(dirname(sinkFile), { recursive: true })
      await appendFile(sinkFile, line)
    },
    () => {
      // 前序写失败不阻塞后续（debug 日志面非关键路径）
    },
  ).catch(() => {
    // 队列自愈：任何 reject 不逃逸
  })
}

/**
 * 等齐异步写队列（runHeadless 末位 await，防进程退出丢尾行；
 * 测试面：文件断言前先 await）。
 */
export function flushDebugSink(): Promise<void> {
  return pendingWrite
}
