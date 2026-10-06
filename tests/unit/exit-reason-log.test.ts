/**
 * exit-reason 日志（0.1.34-C ①，e2e 白盒建议）判别单测：
 * gracefulShutdown 入口必记 exit_reason（exit_code + reason）到
 * ATLAS_DIAGNOSTICS_FILE——自发退出（auto-update / 崩溃兜底 / 孤儿检测 /
 * 对话框拒接 / 用户 /exit）可复现定因（env 在场时留痕，默认零噪声）。
 *
 * 判别：修前 RED（gracefulShutdown 无 exit_reason 日志 → 断言在场失败）；
 * 修后 GREEN（在场 + code/reason 值吻合）。
 *
 * 接缝：diagLogs 按调用时读 ATLAS_DIAGNOSTICS_FILE env（opt-in）→ tmp 真文件；
 * process.exit mock 成 throw + NODE_ENV=test（forceExit rethrow 接缝，cli-sc4
 * 同型惯例）→ shutdown promise reject 由 pending.catch 收口；断言后
 * resetShutdownState 清 5s failsafe 定时器（防文件进程内定时器触发时
 * mock-exit throw 升级为 uncaught）。CLI 车道（dispatch.ts 'exit' handler
 * [atlas][exit] 一行 stderr）= e2e gate 观察项（源级断言），不占本单测。
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  gracefulShutdown,
  resetShutdownState,
} from '../../src/tui/utils/gracefulShutdown.js'

type DiagEntry = { event: string; data: Record<string, unknown> }

function readDiagEntries(file: string): DiagEntry[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as DiagEntry)
}

describe('exit-reason log（0.1.34-C ①）', () => {
  let dir: string
  let diagFile: string
  let realExit: typeof process.exit
  let realNodeEnv: string | undefined
  let realConfigDir: string | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-exit-reason-'))
    diagFile = join(dir, 'diag.jsonl')
    process.env.ATLAS_DIAGNOSTICS_FILE = diagFile
    // 配置目录隔离（空 tmp）→ 无真 SessionEnd hooks 执行（hermetic）
    realConfigDir = process.env.ATLAS_CONFIG_DIR
    process.env.ATLAS_CONFIG_DIR = join(dir, 'config-empty')
    realNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    realExit = process.exit
    process.exit = ((code?: number) => {
      throw new Error('__process_exit_stub')
    }) as typeof process.exit
  })

  afterEach(() => {
    resetShutdownState()
    process.exit = realExit
    if (realNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = realNodeEnv
    if (realConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = realConfigDir
    delete process.env.ATLAS_DIAGNOSTICS_FILE
    rmSync(dir, { recursive: true, force: true })
  })

  function run(code: number, reason?: string): void {
    const p =
      reason === undefined
        ? gracefulShutdown(code)
        : gracefulShutdown(code, reason)
    // 同 tick 挂 handler：mock-exit rethrow 的 reject 立即被收口（防中间
    // unhandledRejection 炸文件；forceExit 在 NODE_ENV=test 下 rethrow）
    p.catch(() => {})
  }

  it('gracefulShutdown 入口记 exit_reason（code+reason）', async () => {
    run(1, 'prompt_input_exit')
    // 入口日志在首个 await 前同步写盘 → 宏任务冲刷后读文件
    await new Promise(r => setTimeout(r, 50))
    const entry = readDiagEntries(diagFile).find(e => e.event === 'exit_reason')
    expect(entry, 'exit_reason 日志应在场（修前 RED / 修后 GREEN）').toBeDefined()
    expect(entry!.data.exit_code).toBe(1)
    expect(String(entry!.data.reason)).toBe('prompt_input_exit')
    resetShutdownState() // 清 5s failsafe 定时器（防 mock-exit throw 升级 uncaught）
  })

  it('缺省 reason（other）亦如实记', async () => {
    run(0)
    await new Promise(r => setTimeout(r, 50))
    const entry = readDiagEntries(diagFile).find(e => e.event === 'exit_reason')
    expect(entry).toBeDefined()
    expect(entry!.data.exit_code).toBe(0)
    expect(String(entry!.data.reason)).toBe('other')
    resetShutdownState()
  })
})
