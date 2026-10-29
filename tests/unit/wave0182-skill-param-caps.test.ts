/**
 * 0.1.82 K3-C1+C2 判别单测（上游 301 收紧，双体同步面）：
 *  - C1 参数名 64×64 双上限——skill/command frontmatter arguments 过多/过长
 *    → 只填前 64 名、每名 ≤64 字（parseArgumentNames 收口，消费面 =
 *    substituteArguments 命名替换 + generateProgressiveArgumentHint）；
 *  - C2 占位符展开内存硬化——skill/command/hooks 参数占位符填满时内存暴涨
 *    （content 占位符密度 × args 长度 = 展开量无界）→ 展开预算
 *    MAX_SUBSTITUTION_OUTPUT_CHARS（1M 字符）超限按位钳制。
 *
 * 双体：engine 域 src/engine/skill/argumentSubstitution.ts 与 TUI 域
 * src/tui/utils/argumentSubstitution.ts 为同步双副本（skillCommand.ts /
 * loadPluginCommands.ts / loadSkillsDir.ts / hookHelpers.ts 分车道消费），
 * 本文件两体同断言（同用例参数化跑两份 import，防单体裁剪漂移）。
 *
 * 测试面（RED→GREEN）：
 *  ① 100 名 → 只取前 64（修前红：100）
 *  ② 100 字名 → 截 64 字（修前红：100）
 *  ③ 恒等锚：≤64 名 ≤64 字零变更
 *  ④ 内存硬化：占位符密度 × args 超预算 → 输出有界（修前红：~10MB 无界）
 *  ⑤ 恒等锚：常规小展开零变更（含 $ARGUMENTS/$0/命名三形态）
 */
import { describe, expect, test } from 'bun:test'

import * as engine from '../../src/engine/skill'
import * as tui from '../../src/tui/utils/argumentSubstitution.js'

const COPIES = [
  { label: 'engine', mod: engine },
  { label: 'tui', mod: tui },
] as const

describe('K3-C1 参数名 64×64 双上限（上游 301，双体）', () => {
  for (const { label, mod } of COPIES) {
    describe(label, () => {
      test(`① 100 名 → 只取前 64 [${label}]`, () => {
        const names = Array.from({ length: 100 }, (_, i) => `arg${i}`)
        const parsed = mod.parseArgumentNames(names)
        expect(parsed).toHaveLength(64)
        expect(parsed[0]).toBe('arg0')
        expect(parsed[63]).toBe('arg63')
      })

      test(`② 100 字名 → 截 64 字 [${label}]`, () => {
        const longName = 'a'.repeat(100)
        const parsed = mod.parseArgumentNames([longName])
        expect(parsed[0]).toHaveLength(64)
      })

      test(`③ 恒等锚：≤64 名 ≤64 字零变更 [${label}]`, () => {
        const names = Array.from({ length: 64 }, (_, i) => `n${i}`)
        expect(mod.parseArgumentNames(names)).toEqual(names)
        // 空串/纯数字名过滤既有语义不回归
        expect(mod.parseArgumentNames(['', '42', 'ok'])).toEqual(['ok'])
      })
    })
  }
})

describe('K3-C2 占位符展开内存硬化（上游 301，双体）', () => {
  for (const { label, mod } of COPIES) {
    describe(label, () => {
      test(`④ 占位符密度 × args 超预算 → 输出有界 [${label}]`, () => {
        // 2000 个 $ARGUMENTS × 5000 字 args ≈ 10MB 无界展开（修前红）
        const content = '$ARGUMENTS '.repeat(2000)
        const args = 'x'.repeat(5000)
        const out = mod.substituteArguments(content, args)
        // 预算 1M：钳制后输出有界（允许头尾余量，远小于无界 10MB）
        expect(out.length).toBeLessThanOrEqual(1_100_000)
        expect(out.length).toBeGreaterThan(0)
      })

      test(`⑤ 恒等锚：常规小展开零变更（三形态） [${label}]`, () => {
        expect(mod.substituteArguments('full: $ARGUMENTS', 'a b')).toBe(
          'full: a b',
        )
        expect(mod.substituteArguments('first: $0', 'a b')).toBe('first: a')
        expect(
          mod.substituteArguments('hi $foo', 'bar', true, ['foo']),
        ).toBe('hi bar')
        // 无占位符追加语义不回归
        expect(mod.substituteArguments('plain', 'extra')).toBe(
          'plain\n\nARGUMENTS: extra',
        )
      })
    })
  }
})
