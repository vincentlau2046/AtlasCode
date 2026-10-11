/**
 * AD-14（0.1.51 C-2，CC 2.1.110）`/tui` 命令 + `tui` setting func 面
 * （工单 §1.2「func setting 态断言」+ §2 判别单测行）。
 *
 * 工单 §1.2 缺口：`/tui` 斜杠命令 + `tui`/`fullscreen` setting key 不存在。
 * 改法 = 复用既有 fullscreen 管线，in-session 切换不重启（★ 改裁断言面）；
 * 本 func 面判别命令/setting 面（PTY in-session 探针归 e2e lane §3
 * 「TUI 渲染族既有 PTY 探针」）。
 *
 * 分层纪律：func 层真盘（ATLAS_CONFIG_DIR 隔离 settings 落盘面）+ 命令
 * 注册枚举（builtInCommandNames 纯面）+ 命令 call 面（动态 import——修前
 * 模块缺席 = 定向红，文件不崩）。零回归：命令面不触 env 驱动路径
 * （env 缺省态恒等面归 unit ③⑥）。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// settings 目录隔离（须先于 settings 模块首调；--isolate 每文件新进程）
const cfgDir = mkdtempSync(join(tmpdir(), 'atlas-ad14-func-'))
process.env.ATLAS_CONFIG_DIR = cfgDir
const userSettingsPath = join(cfgDir, 'settings.json')

let overrideFace: {
  set: (v: boolean | undefined) => void
  get: () => boolean | undefined
} | null = null

async function loadOverride() {
  overrideFace ??= {
    set: (await import('../../src/tui/utils/fullscreen.js')).setFullscreenRuntimeOverride,
    get: (await import('../../src/tui/utils/fullscreen.js')).getFullscreenRuntimeOverride,
  }
  return overrideFace
}

/** 修前红面：/tui 命令本体模块（缺席 → 定向红）。 */
async function loadTuiCommand() {
  const mod = await import('../../src/tui/commands/tui/tui.js')
  return mod.call as (
    onDone: (result?: string, options?: { display?: string }) => void,
    context: unknown,
    args: string,
  ) => Promise<null>
}

function stubContext() {
  return { setAppState: (_f: (prev: unknown) => unknown) => {} } as never
}

function runCommand(args: string) {
  const done: string[] = []
  return loadTuiCommand()
    .then(call =>
      call(
        (result?: string) => {
          done.push(result ?? '')
        },
        stubContext(),
        args,
      ),
    )
    .then(() => done)
}

beforeAll(async () => {
  await loadOverride()
})

afterAll(() => {
  delete process.env.ATLAS_CONFIG_DIR
  rmSync(cfgDir, { recursive: true, force: true })
})

describe('AD-14 /tui 命令 + tui setting func 面', () => {
  test('⑦ 命令注册：builtInCommandNames 含 tui（工单 §1.2 缺口面）', async () => {
    const { builtInCommandNames } = await import('../../src/tui/commands.js')
    expect(builtInCommandNames().has('tui')).toBe(true)
  })

  test('⑧ call fullscreen → 运行时覆写 true（in-session 开，不重启）', async () => {
    const { set, get } = await loadOverride()
    set?.(undefined)
    const done = await runCommand('fullscreen') // 修前红：命令模块缺席
    expect(get?.()).toBe(true)
    expect(done.join('\n')).toMatch(/fullscreen/i)
  })

  test('⑨ call off → 运行时覆写 false（in-session 关）', async () => {
    const { set, get } = await loadOverride()
    set?.(true)
    await runCommand('off') // 修前红：命令模块缺席
    expect(get?.()).toBe(false)
  })

  test('⑩ settings 持久化：fullscreen → userSettings tui.fullscreen=true', async () => {
    await runCommand('fullscreen')
    expect(existsSync(userSettingsPath)).toBe(true)
    const raw = JSON.parse(readFileSync(userSettingsPath, 'utf8')) as {
      tui?: { fullscreen?: boolean }
    }
    expect(raw.tui?.fullscreen).toBe(true)
  })

  test('⑩b settings 持久化：off → userSettings tui.fullscreen=false', async () => {
    await runCommand('off')
    const raw = JSON.parse(readFileSync(userSettingsPath, 'utf8')) as {
      tui?: { fullscreen?: boolean }
    }
    expect(raw.tui?.fullscreen).toBe(false)
  })

  test('⑪ 无参 = 状态面：报现状 + 提示，不改覆写槽', async () => {
    const { set, get } = await loadOverride()
    set?.(true)
    const done = await runCommand('') // 修前红：命令模块缺席
    expect(get?.()).toBe(true) // 状态面只读
    expect(done.join('\n')).toMatch(/fullscreen/i)
  })

  test('⑫ 非法参数 → 可操作报错 + 不改覆写槽', async () => {
    const { set, get } = await loadOverride()
    set?.(undefined)
    const done = await runCommand('bogus') // 修前红：命令模块缺席
    expect(get?.()).toBeUndefined()
    expect(done.join('\n')).toMatch(/fullscreen|off/i)
  })

  test('⑬ 零回归：env 驱动路径不被命令面触碰（无 env 缺省 = false 逐字恒等）', async () => {
    // 恒绿面：修前命令面/覆写面皆缺席，env 路径天然未被触碰
    const { set } = await loadOverride()
    delete process.env.ATLAS_NO_FLICKER
    set?.(undefined)
    const { isFullscreenEnvEnabled } = await import('../../src/tui/utils/fullscreen.js')
    expect(isFullscreenEnvEnabled()).toBe(false)
  })
})
