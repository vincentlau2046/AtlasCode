/**
 * cli/debugSink 判别单测（user-e2e 1606 §7 项 6 N9-debug 收口：
 * headless 车道 --debug / --debug-to-stderr / --debug-file 真消费面）。
 *
 * 面 = tui debug.ts 的裁剪移植（argv/env 面逐字，见 debugSink 头注）。
 * 判别点（mutation-red 面）：
 *  - 启用判定：任一 flag / env 设真 → active；全缺 → no-op（未启用零写入）
 *  - 路由：--debug-to-stderr → stderr / --debug-file → 指定路径 /
 *    缺省 → $ATLAS_CONFIG_DIR/debug/<session>.txt
 *  - --debug-file 隐式启用（无 --debug 也 active）
 *  - 级别门：ATLAS_DEBUG_LOG_LEVEL=error → debug 级被滤、error 级过
 *  - 类别过滤：--debug=api（包含）/ --debug=api,!file（混合 = 全显）
 *
 * 注：bun test 下 NODE_ENV=test 触发 sink 的测试环境防副作用支（非
 * stderr 不落文件）——文件写入用例临时置 NODE_ENV=production 验真。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getSessionId } from '../../src/bootstrap'
import { logForDebugging as sharedLogForDebugging } from '../../src/shared'
import {
  flushDebugSink,
  getDebugSinkTarget,
  initDebugSink,
  isDebugSinkActive,
  logForDebugging,
  resetDebugSinkForTesting,
} from '../../src/cli'

const ENV_KEYS = [
  'DEBUG',
  'DEBUG_SDK',
  'ATLAS_DEBUG_LOG_LEVEL',
  'ATLAS_CONFIG_DIR',
  'NODE_ENV',
] as const

let savedArgv: string[]
let savedEnv: Record<string, string | undefined>
let tmpRoot: string
let tmpFiles: string[] = []

function freshEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k]
}

function withArgv(flags: string[]): void {
  process.argv = [...savedArgv.slice(0, 2), ...flags]
}

beforeEach(() => {
  savedArgv = [...process.argv]
  savedEnv = {}
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  freshEnv()
  tmpRoot = join(tmpdir(), `atlas-debug-sink-${process.pid}-${Date.now()}`)
  mkdirSync(tmpRoot, { recursive: true })
  tmpFiles = []
  resetDebugSinkForTesting()
})

afterEach(() => {
  process.argv = savedArgv
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  resetDebugSinkForTesting()
  for (const f of tmpFiles) {
    try {
      rmSync(f, { force: true })
    } catch {
      // 已删 / 未建
    }
  }
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe('启用判定', () => {
  test('全缺 flag/env → 未启用（no-op，无落点）', () => {
    withArgv([])
    initDebugSink()
    expect(isDebugSinkActive()).toBe(false)
    expect(getDebugSinkTarget()).toBeNull()
    logForDebugging('x') // 不抛、零副作用
    expect(isDebugSinkActive()).toBe(false)
  })

  test('--debug → 启用 + 缺省落点 = $ATLAS_CONFIG_DIR/debug/<session>.txt', () => {
    process.env.ATLAS_CONFIG_DIR = tmpRoot
    process.env.NODE_ENV = 'production' // 测试环境防副作用支关闭（落点真算）
    withArgv(['--debug'])
    initDebugSink()
    expect(isDebugSinkActive()).toBe(true)
    expect(getDebugSinkTarget()).toBe(
      join(tmpRoot, 'debug', `${getSessionId()}.txt`),
    )
  })

  test('env DEBUG 设真 → 启用（与 flag 同义）', () => {
    process.env.ATLAS_CONFIG_DIR = tmpRoot
    process.env.DEBUG = '1'
    withArgv([])
    initDebugSink()
    expect(isDebugSinkActive()).toBe(true)
  })

  test('--debug-file 隐式启用（无 --debug 也 active + 落点 = 指定路径）', () => {
    const f = join(tmpRoot, 'explicit.txt')
    tmpFiles.push(f)
    process.env.NODE_ENV = 'production'
    withArgv(['--debug-file', f])
    initDebugSink()
    expect(isDebugSinkActive()).toBe(true)
    expect(getDebugSinkTarget()).toBe(f)
  })

  test('--debug-file= 等号形态 → 值解析正确', () => {
    const f = join(tmpRoot, 'eq.txt')
    tmpFiles.push(f)
    process.env.NODE_ENV = 'production'
    withArgv([`--debug-file=${f}`])
    initDebugSink()
    expect(getDebugSinkTarget()).toBe(f)
  })
})

describe('路由与写入', () => {
  test('文件路由真写入（NODE_ENV=production 支）', async () => {
    const f = join(tmpRoot, 'routed.txt')
    tmpFiles.push(f)
    process.env.ATLAS_CONFIG_DIR = tmpRoot
    process.env.NODE_ENV = 'production'
    withArgv(['--debug', '--debug-file', f])
    initDebugSink()
    logForDebugging('hello world')
    logForDebugging('boom', { level: 'error' })
    await flushDebugSink() // 异步写队列等齐（no-sync-fs 面）
    expect(existsSync(f)).toBe(true)
    const body = readFileSync(f, 'utf8')
    expect(body).toContain('[DEBUG] hello world')
    expect(body).toContain('[ERROR] boom')
  })

  test('--debug-to-stderr → stderr 路由（不落文件）', () => {
    const captured: string[] = []
    const orig = process.stderr.write
    process.stderr.write = ((s: string | Uint8Array) => {
      captured.push(String(s))
      return true
    }) as typeof process.stderr.write
    try {
      process.env.ATLAS_CONFIG_DIR = tmpRoot
      withArgv(['--debug-to-stderr'])
      initDebugSink()
      expect(getDebugSinkTarget()).toBe('stderr')
      logForDebugging('to-stderr-line')
      expect(captured.join('')).toContain('[DEBUG] to-stderr-line')
    } finally {
      process.stderr.write = orig
    }
  })
})

describe('级别门 + 类别过滤', () => {
  test('ATLAS_DEBUG_LOG_LEVEL=error → debug 级被滤 / error 级过', async () => {
    const f = join(tmpRoot, 'level.txt')
    tmpFiles.push(f)
    process.env.ATLAS_CONFIG_DIR = tmpRoot
    process.env.NODE_ENV = 'production'
    process.env.ATLAS_DEBUG_LOG_LEVEL = 'error'
    withArgv(['--debug', '--debug-file', f])
    initDebugSink()
    logForDebugging('quiet-debug') // debug 级 < error 门 → 滤
    logForDebugging('loud-error', { level: 'error' })
    await flushDebugSink()
    const body = readFileSync(f, 'utf8')
    expect(body).not.toContain('quiet-debug')
    expect(body).toContain('loud-error')
  })

  test('--debug=api（包含）→ 命中类别过 / 未命中与无类别隐', async () => {
    const f = join(tmpRoot, 'filter.txt')
    tmpFiles.push(f)
    process.env.ATLAS_CONFIG_DIR = tmpRoot
    process.env.NODE_ENV = 'production'
    withArgv(['--debug=api', '--debug-file', f])
    initDebugSink()
    expect(isDebugSinkActive()).toBe(true) // --debug=* 本身即启用
    logForDebugging('api: token retry')
    logForDebugging('file: wrote tmp')
    logForDebugging('uncategorized plain text')
    await flushDebugSink()
    const body = readFileSync(f, 'utf8')
    expect(body).toContain('api: token retry')
    expect(body).not.toContain('file: wrote tmp')
    expect(body).not.toContain('uncategorized plain text')
  })

  test('--debug=api,!file（混合）→ 过滤退化为全显（tui parseDebugFilter 逐字）', async () => {
    const f = join(tmpRoot, 'mixed.txt')
    tmpFiles.push(f)
    process.env.ATLAS_CONFIG_DIR = tmpRoot
    process.env.NODE_ENV = 'production'
    withArgv(['--debug=api,!file', '--debug-file', f])
    initDebugSink()
    logForDebugging('file: wrote tmp') // 混合 = 全显（含 exclude 类）
    await flushDebugSink()
    const body = readFileSync(f, 'utf8')
    expect(body).toContain('file: wrote tmp')
  })
})

describe('0.1.93b 段 R-aux：shared 可注入窗接线', () => {
  test('initDebugSink 注册后，shared logForDebugging 行经 sink 落 --debug-file（判别格收证路径）', async () => {
    const f = join(tmpRoot, 'shared-window.txt')
    tmpFiles.push(f)
    process.env.NODE_ENV = 'production'
    withArgv(['--debug-file', f])
    initDebugSink()
    // swarm/engine 域判别格行（src/swarm/inProcessRunner 等 ~30 处 import
    // 自 src/shared/debug.ts）自此经本 sink 落盘——R-①/②/⑤ 收证面。
    sharedLogForDebugging('[probe-R1][runner] agent=w1@t1 taskId=t controller=ac-1')
    sharedLogForDebugging('[probe-R2][anchor2-idle-in] agent=w1', { level: 'debug' })
    await flushDebugSink()
    const body = readFileSync(f, 'utf8')
    expect(body).toContain('[probe-R1][runner] agent=w1@t1')
    expect(body).toContain('[probe-R2][anchor2-idle-in] agent=w1')
  })

  test('复位清窗：resetDebugSinkForTesting 后 shared 行零输出（跨用例泄漏守卫）', async () => {
    const f = join(tmpRoot, 'shared-window-reset.txt')
    tmpFiles.push(f)
    process.env.NODE_ENV = 'production'
    withArgv(['--debug-file', f])
    initDebugSink()
    sharedLogForDebugging('window-registered-line')
    await flushDebugSink()
    const before = readFileSync(f, 'utf8')
    expect(before).toContain('window-registered-line')
    resetDebugSinkForTesting()
    sharedLogForDebugging('post-reset-must-not-appear')
    await flushDebugSink()
    expect(readFileSync(f, 'utf8')).not.toContain('post-reset-must-not-appear')
  })

  test('未启用 lane 缺省零输出（锁面②：注册无条件、输出经 enabled 门控）', async () => {
    const f = join(tmpRoot, 'shared-window-default.txt')
    tmpFiles.push(f)
    process.env.NODE_ENV = 'production'
    withArgv([]) // 无 --debug / --debug-file / env DEBUG → enabled=false，sink 仍注册
    initDebugSink()
    sharedLogForDebugging('disabled-lane-must-not-appear')
    await flushDebugSink()
    expect(existsSync(f)).toBe(false)
  })
})
