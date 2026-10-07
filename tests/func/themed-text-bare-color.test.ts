/**
 * 0.1.39 gate gap-A 判别单测（渲染面）：ThemedText.resolveColor 裸 ANSI 色名透传。
 *
 * 根因（e2e tui-diff run2d 定因）：D4 根修只归一了 colorize 入口（bare→ansi:），
 * 但 TUI 的 Text 经 ThemedText（theme-aware 包装）——裸名不匹配四 raw 前缀
 *（rgb(/#/ansi256(/ansi:）→ 落 theme-key 分支 → theme['red'] = undefined，
 * 静默丢弃（color 到不了 colorize 入口）→ 活屏无 SGR。
 *
 * 修：theme-key 优先（真 theme 键同名时取 theme 值——Theme 无 16 裸名同名字段，零回归）；
 * undefined 时 16 裸名透传 → base Text → colorize 入口（D4 已归一 bare→ansi:）产 SGR。
 *
 * 判别锚点（突变须恰好红）：
 *   ① 裸名 red → SGR 31 在场（修前：静默丢弃无 SGR）
 *   ② theme 键（inactive）仍走 theme 值解析（≡ 有色，≢ 无色——theme-key 优先级回归守卫）
 *   ③ 域外未知键 ≡ 无色（输出逐字相同，裸名透传不误伤域外串）
 *
 * 配方承 sessionlist-p1-render（Writable 捕获流 + 伪 stdin + 动态 import）：
 * FORCE_COLOR=3 须于动态 import 前注入（colorize 模块顶层锁 chalk level）。
 */
import { PassThrough, Writable } from 'stream'
import { describe, it, beforeAll, afterAll, expect } from 'bun:test'
import React from 'react'

type InkModule = typeof import('../../src/tui/ink.js')
type ThemedTextModule = typeof import('../../src/tui/components/design-system/ThemedText.js')

let inkRender: InkModule['render']
let Text: ThemedTextModule['default']

function makeFakeStdin(): PassThrough {
  // useInput 走 raw-mode 判定（stdin.isTTY）；PassThrough 补 setRawMode/ref/unref 桩
  //（同 sessionlist-p1-render 配方）。
  const stdin = new PassThrough()
  const fake = stdin as unknown as {
    setRawMode: (m: boolean) => void
    ref: () => void
    unref: () => void
    isTTY?: boolean
  }
  fake.setRawMode = () => {}
  fake.ref = () => {}
  fake.unref = () => {}
  fake.isTTY = true
  return stdin
}

/** 渲染 <Text color>{anchor}</Text>（ink.js render 自带 ThemeProvider 包裹），捕获输出全文。 */
async function renderTextToText(color: unknown): Promise<string> {
  const chunks: string[] = []
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk))
      cb()
    },
  })
  const stdin = makeFakeStdin()
  const tree = React.createElement(Text, { color: color as never }, 'bare-anchor')
  const instance = await inkRender(
    tree,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
    },
  )
  await new Promise(r => setTimeout(r, 300))
  const out = chunks.join('')
  instance.unmount()
  return out
}

beforeAll(async () => {
  process.env.FORCE_COLOR = '3'
  // ThemeProvider defaultInitialTheme 读 getGlobalConfig：非 NODE_ENV=test 面先开 config 读（幂等）
  const { enableConfigs } = await import('../../src/tui/utils/config.js')
  enableConfigs()
  ;({ render: inkRender } = await import('../../src/tui/ink.js'))
  ;({ default: Text } = await import(
    '../../src/tui/components/design-system/ThemedText.js'
  ))
})

afterAll(() => {
  delete process.env.FORCE_COLOR
})

describe('gap-A ThemedText 裸 ANSI 色名透传（渲染面）', () => {
  it('① 裸名 red → SGR 31 在场（修前突变：theme["red"] undefined 静默丢弃）', async () => {
    const out = await renderTextToText('red')
    expect(out).toContain('bare-anchor')
    expect(out).toContain('\u001b[31m')
  })

  it('② theme 键 inactive 仍走 theme 值解析（≢ 无色输出，theme-key 优先级回归守卫）', async () => {
    const themed = await renderTextToText('inactive')
    const plain = await renderTextToText(undefined)
    expect(themed).toContain('bare-anchor')
    expect(themed).not.toBe(plain)
  })

  it('③ 域外未知键 ≡ 无色（逐字相同，16 裸名透传不误伤域外串）', async () => {
    const colored = await renderTextToText('definitelyNotAKey')
    const plain = await renderTextToText(undefined)
    expect(colored).toBe(plain)
    expect(plain).toContain('bare-anchor')
  })
})
