/**
 * engine/tools/bash S-B5 bashTool.ts 本体 func 面（Bash 本体纵切子波 §8.54，
 * C 桶 ① 子波 2）。
 *
 * func 层（真盘 I/O + 真进程允许）：
 *  - call 同步 spawn：echo 真进程 stdout/exitCode/interrupted 零
 *  - **timeout clamp（P-B4 探针锚点：`Math.min` 删 = 恰好 1 红）**：env
 *    BASH_DEFAULT_TIMEOUT_MS=200/BASH_MAX_TIMEOUT_MS=400 钉 400ms 封顶 →
 *    timeout_ms=999_999 被钳到 400 → sleep 3 真 kill（interrupted 真 /
 *    信号支 exitCode=1）。突变（clamp 删）→ sleep 3 自然退出 0 →
 *    interrupted=false 恰 1 红（3s 内判别，不挂死）。
 *  - run_in_background：真 detached spawn + getBackgroundTask 模块态读 +
 *    输出文件落 getAtlasTempDir 真盘（后台任务真完成轮询）
 *  - resetCwdIfOutsideProject：真 tmpdir 双目录（原项目目录 vs 工作外目录）
 *    setCwd 复位判别（bootstrap cwd 面 + permissions bootstrap-env 注入）
 *
 * 深度 import（门面归集 S-B5 已落，本文件混用门面 + 域内直引本体导出）：
 *  ../../src/engine/tools（resetCwdIfOutsideProject）+
 *  ../../src/engine/tools/bash/bashTool（BashTool / getBackgroundTask）
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  BashTool,
  getBackgroundTask,
  listBackgroundTasks,
} from '../../src/engine/tools/bash/bashTool'
import {
  type BashToolUseContext,
} from '../../src/engine/tools/bash/bashToolInput'
import {
  getAtlasTempDir,
  resetPermissionsBootstrapEnv,
  setPermissionsBootstrapEnv,
} from '../../src/permissions'
import {
  getCwdState,
  getOriginalCwd,
  setOriginalCwd,
  setCwdState,
} from '../../src/bootstrap'
import { resetCwdIfOutsideProject } from '../../src/engine/tools'
import {
  resetBootstrapStatePort,
  setBootstrapStatePort,
} from '../../src/executor'
import type { ToolPermissionContext } from '../../src/shared'

const ROOT = join(tmpdir(), 'atlas-bash-sb5-call-')

let root: string
let savedCwdState: string
let savedOriginalCwd: string

function makeCtx(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
  }
}

/** call 面 context duck（D-7：仅消费 options.cwd ?? process.cwd()）。 */
function callCtx(cwd?: string): BashToolUseContext {
  return {
    getAppState: () => ({ toolPermissionContext: makeCtx() }),
    abortController: { signal: new AbortController().signal },
    options: { isNonInteractiveSession: true, cwd },
  }
}

function withTimeoutEnv(
  def: string,
  max: string,
  fn: () => Promise<void>,
): Promise<void> {
  const savedDef = process.env.BASH_DEFAULT_TIMEOUT_MS
  const savedMax = process.env.BASH_MAX_TIMEOUT_MS
  process.env.BASH_DEFAULT_TIMEOUT_MS = def
  process.env.BASH_MAX_TIMEOUT_MS = max
  return fn().finally(() => {
    if (savedDef === undefined) delete process.env.BASH_DEFAULT_TIMEOUT_MS
    else process.env.BASH_DEFAULT_TIMEOUT_MS = savedDef
    if (savedMax === undefined) delete process.env.BASH_MAX_TIMEOUT_MS
    else process.env.BASH_MAX_TIMEOUT_MS = savedMax
  })
}

async function sleep(ms: number): Promise<void> {
  await new Promise(r => setTimeout(r, ms))
}

beforeAll(() => {
  root = mkdtempSync(ROOT)
  savedCwdState = getCwdState()
  savedOriginalCwd = getOriginalCwd()
  // executor setCwd 经 BootstrapStatePort 落 bootstrap cwdState（未注入 fail-fast）
  setBootstrapStatePort({
    getCwd: () => getCwdState(),
    getOriginalCwd: () => getOriginalCwd(),
    setCwdState: (p: string) => setCwdState(p),
  })
})

afterAll(() => {
  setCwdState(savedCwdState)
  setOriginalCwd(savedOriginalCwd)
  resetPermissionsBootstrapEnv()
  resetBootstrapStatePort()
  rmSync(root, { recursive: true, force: true })
})

// ── call 同步 spawn 面 ──────────────────────────────────────────────────

describe('call 同步 spawn（真 echo 进程）', () => {
  test('stdout 捕获 + exitCode 0 + 非中断', async () => {
    const t0 = Date.now()
    const r = await BashTool.call(
      { command: 'echo sb5-echo' },
      callCtx(),
    )
    expect(r.data.stdout).toBe('sb5-echo\n')
    expect(r.data.exitCode).toBe(0)
    expect(r.data.interrupted).toBe(false)
    expect(Date.now() - t0).toBeLessThan(10_000)
  })

  test('非零退出码真捕获（exit 3）', async () => {
    const r = await BashTool.call({ command: 'exit 3' }, callCtx())
    expect(r.data.exitCode).toBe(3)
    expect(r.data.interrupted).toBe(true) // 非 0 退出 = 中断语义支（逐字旧体）
  })

  test('cwd 参数真生效（D-7 duck options.cwd）', async () => {
    const r = await BashTool.call(
      { command: 'pwd' },
      callCtx(root),
    )
    expect(r.data.stdout.trim()).toBe(root)
  })
})

// ── timeout clamp（P-B4 探针锚点）──────────────────────────────────────

describe('call timeout clamp（P-B4：Math.min 删 = 恰 1 红）', () => {
  test('max 封顶真 kill（999s 入参钳到 400ms → sleep 3 被 SIGTERM）', async () => {
    await withTimeoutEnv('200', '400', async () => {
      const t0 = Date.now()
      const r = await BashTool.call(
        { command: 'sleep 3', timeout_ms: 999_999 },
        callCtx(),
      )
      const elapsed = Date.now() - t0
      // 钳制支：~400ms kill（非 999s 等待、非 sleep 自然 3s 退出）
      expect(elapsed).toBeLessThan(2_500)
      expect(r.data.interrupted).toBe(true)
      // 信号支 exitCode = 1（逐字旧体：signal 非空 → 1）
      expect(r.data.exitCode).toBe(1)
    })
  })
})

// ── run_in_background 真 detached spawn ─────────────────────────────────

describe('call run_in_background（真 detached spawn + 模块态读面）', () => {
  test('模块态初始空集（--isolate 文件进程内本文件首启任务）', () => {
    expect(listBackgroundTasks()).toEqual([])
  })

  test('backgroundTaskId 返回 + getBackgroundTask 轮询完成 + 输出真落盘', async () => {
    const out = join(root, 'bg-out.txt')
    const r = await BashTool.call(
      {
        command: 'echo sb5-bg > ' + out,
        run_in_background: true,
      },
      callCtx(root),
    )
    const id = r.data.backgroundTaskId
    expect(typeof id).toBe('string')
    expect((id ?? '').length).toBeGreaterThan(0)

    const task = getBackgroundTask(id as string)
    expect(task).toBeDefined()
    expect(task?.command).toBe('echo sb5-bg > ' + out)
    // 输出文件落 getAtlasTempDir（$TMPDIR 指引面真盘位）
    expect(task?.outputFile.startsWith(getAtlasTempDir())).toBe(true)

    // 轮询真完成（detached 子进程写文件 + close 事件回写 done）
    for (let i = 0; i < 100 && task && !task.done; i++) {
      await sleep(50)
    }
    expect(task?.done).toBe(true)
    expect(task?.exitCode).toBe(0)
    expect(readFileSync(out, 'utf8').trim()).toBe('sb5-bg')
  })
})

// ── resetCwdIfOutsideProject（真 tmpdir 双目录）─────────────────────────

describe('resetCwdIfOutsideProject（真盘 setCwd 复位）', () => {
  test('工作外目录 → 复位原目录 + true', async () => {
    const proj = join(root, 'proj')
    const outside = join(root, 'outside')
    mkdirSync(proj, { recursive: true })
    mkdirSync(outside, { recursive: true })

    setOriginalCwd(proj)
    setCwdState(outside)
    setPermissionsBootstrapEnv({
      getOriginalCwd: () => proj,
      getCwd: () => outside,
    })

    const changed = resetCwdIfOutsideProject(makeCtx())
    expect(changed).toBe(true)
    // executor setCwd 落物理路径（realpathSync 对齐 pwd -P 行为）
    expect(getCwdState()).toBe(realpathSync(proj))
  })

  test('项目内 cwd 不动 → false（fast-path 短路）', async () => {
    const proj = join(root, 'proj2')
    mkdirSync(proj, { recursive: true })

    setOriginalCwd(proj)
    setCwdState(proj)
    setPermissionsBootstrapEnv({
      getOriginalCwd: () => proj,
      getCwd: () => proj,
    })

    expect(resetCwdIfOutsideProject(makeCtx())).toBe(false)
    expect(getCwdState()).toBe(proj)
    // fast-path 未触 setCwd → cwdState 原值不动（setCwdState 直戳未 realpath）
  })
})
