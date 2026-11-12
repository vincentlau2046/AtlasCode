/**
 * P0 0.1.102 切片 1：主题分层检测判据格（工单 §4 切片 1 格 + lock-face ②定形）。
 *
 * 三源优先序：显式用户设置（ThemeProvider 层，不在本格域）> OSC 11 实测 >
 * COLORFGBG > OS 外观 > dark。OSC 失败静默降级（禁卡启动）；OS 外观读一次
 * 缓存（触发点恰二：启动一次 + OSC 失败兜底读）；stub 删除单源格。
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dir, '..', '..', 'src')

describe('切片 1 格③：stub 删除单源格', () => {
  test('systemThemeWatcher.ts 不再是 stub 形（(() => ({})) 断言消失）', () => {
    const src = readFileSync(join(SRC, 'tui/utils/systemThemeWatcher.ts'), 'utf-8')
    expect(src.includes('(() => ({}))')).toBe(false)
    expect(src).toContain('export function watchSystemTheme')
  })
})

describe('切片 1 格①：三源优先序逐层注入', () => {
  test('OSC 11 实测胜 COLORFGBG（OSC 响应回填覆盖 COLORFGBG 缓存）', async () => {
    process.env['COLORFGBG'] = '0;15' // COLORFGBG 判 light
    const { setCachedSystemTheme, getSystemThemeName } = await import(
      '../../src/tui/utils/systemTheme.js'
    )
    // 模拟 OSC 11 实测 dark 回填（themeFromOscColor 在 watcher 内消费）
    const { themeFromOscColor } = await import('../../src/tui/utils/systemTheme.js')
    expect(themeFromOscColor('rgb:0000/0000/0000')).toBe('dark')
    setCachedSystemTheme('dark')
    expect(getSystemThemeName()).toBe('dark')
    delete process.env['COLORFGBG']
  })

  test('COLORFGBG 胜 OS 外观缓存（优先序第三源压第四源）', async () => {
    process.env['COLORFGBG'] = '0;0' // dark
    const mod = await import('../../src/tui/utils/systemTheme.js')
    mod.__resetSystemThemeForTests()
    mod.setCachedOsAppearance('light') // OS 层判 light
    expect(mod.getSystemThemeName()).toBe('dark') // COLORFGBG 压 OS 层
    delete process.env['COLORFGBG']
  })

  test('COLORFGBG 缺失 + OS 外观缓存 light → 判 light（macOS 格②模拟）', async () => {
    delete process.env['COLORFGBG']
    const mod = await import('../../src/tui/utils/systemTheme.js')
    mod.__resetSystemThemeForTests()
    mod.setCachedOsAppearance('light')
    expect(mod.getSystemThemeName()).toBe('light')
    // 终态：OS 也无源 → dark 兜底
    mod.__resetSystemThemeForTests()
    mod.setCachedOsAppearance(undefined)
    expect(mod.getSystemThemeName()).toBe('dark')
  })
})

describe('切片 1：watcher 消费形（OSC 成功回填 / OSC 失败降级 OS 兜底）', () => {
  test('OSC 11 响应成功 → setSystemTheme 收到实测主题', async () => {
    const { watchSystemTheme } = await import('../../src/tui/utils/systemThemeWatcher.js')
    const { TerminalQuerier } = await import('../../src/tui/ink/terminal-querier.js')
    const { oscColor } = await import('../../src/tui/ink/terminal-querier.js')

    const writes: string[] = []
    const fakeStdout = { write: (s: string) => { writes.push(s); return true } } as never
    const querier = new TerminalQuerier(fakeStdout)

    let applied: string | undefined
    const cleanup = watchSystemTheme(querier, t => { applied = t })
    expect(typeof cleanup).toBe('function')

    // watcher 发出 OSC 11 query（写 stdout）
    await Bun.sleep(10)
    expect(writes.some(w => w.includes('\x1b]11;'))).toBe(true)

    // 模拟终端响应：浅色背景（luminance > 0.5）
    querier.onResponse({ type: 'osc', code: 11, data: 'rgb:ffff/ffff/ffff' })
    await Bun.sleep(20)
    expect(applied).toBe('light')
  })

  test('OSC 失败（DA1 sentinel 先到 = 不支持）→ 静默降级触发 OS 兜底读，不上屏不抛错', async () => {
    const { watchSystemTheme } = await import('../../src/tui/utils/systemThemeWatcher.js')
    const { TerminalQuerier } = await import('../../src/tui/ink/terminal-querier.js')

    const writes: string[] = []
    const fakeStdout = { write: (s: string) => { writes.push(s); return true } } as never
    const querier = new TerminalQuerier(fakeStdout)

    let applied: string | undefined
    watchSystemTheme(querier, t => { applied = t })

    // 终端不答 OSC，DA1 sentinel 到 → send resolve undefined → 降级
    querier.onResponse({ type: 'da1', params: [62, 1, 2, 6, 9, 15, 22] } as never)
    await Bun.sleep(20)
    // 降级路径不抛错；Linux 无 OS 源 → 不回填（applied 保持 undefined，dark 兜底）
    expect(applied).toBeUndefined()
  })

  test('cleanup 后 watcher 不再回填（disposed 门）', async () => {
    const { watchSystemTheme } = await import('../../src/tui/utils/systemThemeWatcher.js')
    const { TerminalQuerier } = await import('../../src/tui/ink/terminal-querier.js')
    const fakeStdout = { write: () => true } as never
    const querier = new TerminalQuerier(fakeStdout)
    let applied: string | undefined
    const cleanup = watchSystemTheme(querier, t => { applied = t })
    await Bun.sleep(10)
    cleanup()
    querier.onResponse({ type: 'osc', code: 11, data: 'rgb:ffff/ffff/ffff' })
    await Bun.sleep(20)
    expect(applied).toBeUndefined()
  })
})

describe('切片 1：OS 外观读取面（具名常量 + 跨平台形）', () => {
  test('macOS 语义钉：defaults read 缺席（exit 1）= Light，非错误', async () => {
    const { readOsAppearance } = await import('../../src/tui/utils/osAppearance.js')
    // 注入形验语义（真 darwin 分支依赖本机平台）：exit 1 = key 缺席 → light
    const result = await readOsAppearance({
      platform: 'darwin',
      spawn: (_cmd, _args, opts) => {
        const { spawn: s } = require('node:child_process') as typeof import('node:child_process')
        return s('sh', ['-c', 'exit 1'], opts)
      },
    })
    expect(result).toBe('light')
  })

  test('macOS AppleInterfaceStyle=Dark → dark', async () => {
    const { readOsAppearance } = await import('../../src/tui/utils/osAppearance.js')
    const result = await readOsAppearance({
      platform: 'darwin',
      spawn: (_cmd, _args, opts) => {
        const { spawn: s } = require('node:child_process') as typeof import('node:child_process')
        return s('sh', ['-c', 'echo Dark; exit 0'], opts)
      },
    })
    expect(result).toBe('dark')
  })

  test('读失败/超时静默：返回 undefined（禁卡启动），不抛错', async () => {
    const { readOsAppearance } = await import('../../src/tui/utils/osAppearance.js')
    const result = await readOsAppearance({
      platform: 'darwin',
      spawn: (_cmd, _args, opts) => {
        const { spawn: s } = require('node:child_process') as typeof import('node:child_process')
        // 挂起进程 + 极短超时 → 被杀 → undefined
        return s('sh', ['-c', 'sleep 5'], { ...opts, timeout: 100 })
      },
    })
    expect(result).toBeUndefined()
  })

  test('Linux 无源 → undefined（不引 portal 依赖）', async () => {
    const { readOsAppearance } = await import('../../src/tui/utils/osAppearance.js')
    const result = await readOsAppearance({
      platform: 'linux',
      spawn: (() => { throw new Error('should not spawn') }) as never,
    })
    expect(result).toBeUndefined()
  })
})

describe('切片 1：AUTO_THEME 门翻缺省', () => {
  test('AUTO_THEME 入 ON_BY_DEFAULT（kill-switch FEATURE_AUTO_THEME=false 仍可关）', async () => {
    delete process.env['FEATURE_AUTO_THEME']
    const { feature, FEATURE_ON_BY_DEFAULT } = await import('../../src/shared/feature.js')
    expect(feature('AUTO_THEME')).toBe(true)
    expect(FEATURE_ON_BY_DEFAULT).toContain('AUTO_THEME')
    process.env['FEATURE_AUTO_THEME'] = 'false'
    expect(feature('AUTO_THEME')).toBe(false)
    delete process.env['FEATURE_AUTO_THEME']
  })
})
