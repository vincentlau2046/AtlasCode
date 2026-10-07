/**
 * 0.1.39-D4 colorize 裸色名根修判别单测。
 *
 * 缺陷：colorize 入口只认 ansi:/#/ansi256()/rgb() 四通道，裸 ANSI 色名
 *（Ink <Text color="red"> 透传形态，TUI 14 处现存）落 `return str` 无 SGR
 * 产出。根修 = 入口 bare→`ansi:` 前缀归一（单点，全 TUI 生效，纯加性——
 * theme 色板值全走 rgb()/ansi: 通道不经此面）。
 *
 * 判别锚点（突变须恰好红）：
 *   ① 任一裸名 SGR 在场且色值恰对（red→fg 31 / bg 41；16 名全在场）
 *   ② 裸名 ≡ 同形 ansi: 名（归一语义）
 *   ③ 既有 4 通道（ansi:/# /ansi256()/rgb()）+ 非法/空输入 零回归
 *
 * chalk level 固定：FORCE_COLOR=3 在**动态 import colorize 之前**注入
 *（colorize 模块顶层 boost/clamp 在 import 时读 chalk.level 锁定 level，
 * 静态导入会先于 env 注入读 level，0.1.38 探针同坑）。
 */
import { describe, expect, it, beforeAll, afterAll } from 'bun:test'
import chalk from 'chalk'

type ColorizeFn = (
  str: string,
  color: string | undefined,
  type: 'foreground' | 'background',
) => string

let colorize: ColorizeFn

const ALL_16 = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'blackBright',
  'redBright',
  'greenBright',
  'yellowBright',
  'blueBright',
  'magentaBright',
  'cyanBright',
  'whiteBright',
]

beforeAll(async () => {
  process.env.FORCE_COLOR = '3'
  ;({ colorize } = await import('../../src/tui/ink/colorize.js'))
})

afterAll(() => {
  delete process.env.FORCE_COLOR
})

describe('D4 裸色名根修（入口 bare→ansi: 归一）', () => {
  it('裸名 foreground：SGR 在场且恰红（red → \\u001b[31m）', () => {
    const out = colorize('x', 'red', 'foreground')
    expect(out).toContain('\u001b[31m')
    expect(out).toBe(chalk.red('x'))
  })

  it('裸名 background：SGR 在场且背景码（red → \\u001b[41m）', () => {
    const out = colorize('x', 'red', 'background')
    expect(out).toContain('\u001b[41m')
    expect(out).toBe(chalk.bgRed('x'))
  })

  it('16 裸色名全部 SGR 在场（输出 ≠ 原文，突变即恰好红）', () => {
    for (const name of ALL_16) {
      const out = colorize('x', name, 'foreground')
      expect(out.startsWith('\u001b['), `${name} 无 SGR 前缀`).toBe(true)
      expect(out.includes('x')).toBe(true)
    }
  })

  it('裸名 ≡ 同形 ansi: 名（归一语义等价）', () => {
    for (const name of ALL_16) {
      expect(colorize('x', name, 'foreground')).toBe(
        colorize('x', `ansi:${name}`, 'foreground'),
      )
      expect(colorize('x', name, 'background')).toBe(
        colorize('x', `ansi:${name}`, 'background'),
      )
    }
  })

  it('既有 4 通道零回归（ansi:/# /ansi256()/rgb() 行为不变）', () => {
    expect(colorize('x', 'ansi:red', 'foreground')).toBe(chalk.red('x'))
    expect(colorize('x', '#ff0000', 'foreground')).toBe(
      chalk.hex('#ff0000')('x'),
    )
    expect(colorize('x', 'ansi256(197)', 'foreground')).toBe(
      chalk.ansi256(197)('x'),
    )
    expect(colorize('x', 'rgb(1,2,3)', 'foreground')).toBe(
      chalk.rgb(1, 2, 3)('x'),
    )
  })

  it('域外裸串/空输入仍透传（不误伤，行为不变）', () => {
    expect(colorize('x', 'definitelyNotAColor', 'foreground')).toBe('x')
    expect(colorize('x', 'ansi:notARealName', 'foreground')).toBe('x')
    expect(colorize('x', undefined, 'foreground')).toBe('x')
  })
})
