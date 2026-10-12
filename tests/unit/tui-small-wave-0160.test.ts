/**
 * 0.1.60 TUI 小波判别单测（TUI-1 /output-style + TUI-2 /cd + TUI-3 /reload-skills，
 * 纯 unit，零盘/零 PTY；工单 `docs/2026-10-13-p0-wave-0160-ticket.md`）。
 *
 * 工单 §0 缺口：三命令 ∅（/output-style 0.1.40 W1 裁除；/cd、/reload-skills 未加）。
 * 改法 = 3 新 local 命令（reload-plugins 模板）+ skillChangeDetector.reloadSkillsNow
 * 强制重扫面 + /cd 状态面移动（Shell.setCwd → setCwdState，**不 process.chdir**，
 * 破缓存判别面 = 缓存键前缀稳定）。
 *
 * 判别（修前红 → 修后绿，动态 import 定向红·文件不崩）：
 *  - 三命令 impl 模块 / reloadSkillsNow 导出缺席（修前）→ `toBeTypeOf('function')` 红
 *  - /cd 破缓存判别：process.cwd() 恒定（未 chdir）+ cwdState 变（状态面移动）
 *  - /output-style：无参列表 / 非法报错 / 有效写配置面（ATLAS_CONFIG_DIR 隔离）
 *  - /reload-skills：reloadSkillsNow 触发 skillsChanged.emit（REPL 刷新面）
 * 零回归：既有 outputStyle 配置语义不变（命令仅消费入口）；/cd 无参不改状态；
 * /reload-skills 仅 skill 面（不扩交互安装自动 refresh scope）。
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getCwdState, setCwdState } from '../../src/bootstrap'

/** 修前红面 helper：动态 import（模块缺席 → 定向红，文件不崩）。 */
type LocalCall = (
  args: string,
  ctx: unknown,
) => Promise<{ type: string; value?: string }>

async function loadCall(
  spec: string,
): Promise<LocalCall | undefined> {
  const mod = await import(spec).catch(() => ({}))
  return (mod as { call?: unknown }).call as LocalCall | undefined
}

let cfgDir: string
let savedCfgDir: string | undefined

beforeEach(() => {
  // 隔离 settings/plugin I/O（userSettings 落盘 + 插件 output style 读取均走 temp 根，
  // 快速且不碰真 ~/.atlas）。
  cfgDir = mkdtempSync(join(tmpdir(), 'atlas-0160-'))
  savedCfgDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = cfgDir
})

afterEach(() => {
  if (savedCfgDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedCfgDir
  rmSync(cfgDir, { recursive: true, force: true })
})

describe('TUI-1 /output-style [name]（CC 2.1.269）', () => {
  test('无参 = 状态面：报当前 + 可用列表（内建 style 恒在场）', async () => {
    const call = await loadCall('../../src/tui/commands/output-style/output-style.js')
    expect(call, '/output-style call 导出缺席（修前红）').toBeTypeOf('function')
    const res = (await call!('', {})) as { type: string; value?: string }
    expect(res.type).toBe('text')
    expect(res.value).toContain('Current output style:')
    expect(res.value).toContain('Available:')
    expect(res.value).toContain('Explanatory')
    expect(res.value).toContain('Learning')
    expect(res.value).toContain('default')
  })

  test('非法 name = 报错面（不在可用集 → 不写配置）', async () => {
    const call = await loadCall('../../src/tui/commands/output-style/output-style.js')
    expect(call).toBeTypeOf('function')
    const res = (await call!('definitely-not-a-style', {})) as {
      value?: string
    }
    expect(res.value).toContain('Invalid /output-style "definitely-not-a-style"')
    // 未写配置面
    expect(existsSync(join(cfgDir, 'settings.json'))).toBe(false)
  })

  test('有效 name = 写配置面切换生效（userSettings 落盘 outputStyle）', async () => {
    const call = await loadCall('../../src/tui/commands/output-style/output-style.js')
    expect(call).toBeTypeOf('function')
    const res = (await call!('Explanatory', {})) as { value?: string }
    expect(res.value).toContain('Output style switched to "Explanatory"')
    expect(res.value).not.toContain('Invalid')
    expect(res.value).not.toContain('Failed')
    const written = JSON.parse(
      readFileSync(join(cfgDir, 'settings.json'), 'utf8'),
    ) as { outputStyle?: string }
    expect(written.outputStyle).toBe('Explanatory')
  })
})

describe('TUI-2 /cd（CC 2.1.169）', () => {
  test('状态面移动 + 破缓存判别：cwdState 变 + process.cwd() 恒定（不 chdir）', async () => {
    const call = await loadCall('../../src/tui/commands/cd/cd.js')
    expect(call, '/cd call 导出缺席（修前红）').toBeTypeOf('function')

    const savedState = getCwdState()
    const target = mkdtempSync(join(tmpdir(), 'atlas-cd-'))
    const origProcessCwd = process.cwd()
    try {
      const res = (await call!(target, {})) as { value?: string }
      expect(res.value).toContain('Session working directory changed to:')
      // 状态面移动：cwdState = target 的物理路径
      expect(getCwdState()).toBe(realpathSync(target))
      // 破缓存判别：process.cwd() 恒定（未 process.chdir → SkillTool memo 键/缓存键前缀稳定）
      expect(process.cwd()).toBe(origProcessCwd)
    } finally {
      setCwdState(savedState)
      rmSync(target, { recursive: true, force: true })
    }
  })

  test('无参 = 状态面：报当前 cwd + 用法（不改状态）', async () => {
    const call = await loadCall('../../src/tui/commands/cd/cd.js')
    expect(call).toBeTypeOf('function')
    const saved = getCwdState()
    try {
      const res = (await call!('', {})) as { value?: string }
      expect(res.value).toContain('Session working directory:')
      expect(res.value).toContain('Usage: /cd')
      expect(getCwdState()).toBe(saved)
    } finally {
      setCwdState(saved)
    }
  })

  test('非法/不存在路径 = 报错面（不移动状态）', async () => {
    const call = await loadCall('../../src/tui/commands/cd/cd.js')
    expect(call).toBeTypeOf('function')
    const saved = getCwdState()
    const bogus = join(tmpdir(), 'atlas-cd-does-not-exist-xyz')
    try {
      const res = (await call!(bogus, {})) as { value?: string }
      expect(res.value).toContain('cd failed')
      expect(res.value).toContain('does not exist')
      expect(getCwdState()).toBe(saved)
    } finally {
      setCwdState(saved)
    }
  })
})

describe('TUI-3 /reload-skills（CC 2.1.152）', () => {
  test('reloadSkillsNow 强制重扫面在场 + 触发 skillsChanged.emit', async () => {
    const detector = await import(
      '../../src/tui/utils/skills/skillChangeDetector.js'
    ).catch(() => ({}))
    const reloadNow = (detector as { reloadSkillsNow?: unknown })
      .reloadSkillsNow as (() => void) | undefined
    expect(
      reloadNow,
      'reloadSkillsNow 导出缺席（修前红）',
    ).toBeTypeOf('function')

    const det = await import(
      '../../src/tui/utils/skills/skillChangeDetector.js'
    )
    let emitted = 0
    const unsub = det.subscribe(() => {
      emitted++
    })
    try {
      reloadNow!()
      expect(emitted).toBe(1)
    } finally {
      unsub()
    }
  })

  test('命令 call = 触发重扫 + 回报（会话内 registry 刷新）', async () => {
    const call = await loadCall(
      '../../src/tui/commands/reload-skills/reload-skills.js',
    )
    expect(call, '/reload-skills call 导出缺席（修前红）').toBeTypeOf('function')
    const det = await import(
      '../../src/tui/utils/skills/skillChangeDetector.js'
    )
    let emitted = 0
    const unsub = det.subscribe(() => {
      emitted++
    })
    try {
      const res = (await call!('', {})) as { value?: string }
      expect(res.value).toContain('Re-scanned skill directories')
      expect(emitted).toBe(1)
    } finally {
      unsub()
    }
  })
})
