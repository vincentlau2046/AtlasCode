/**
 * 0.1.82 K3-C2 security review round-5 判别单测（双体同步面）：
 *  - #1（HIGH）替换串模式解释 + 多遍重展开——旧实现四遍正则按序跑在
 *    已替换文本上：① string replacement 解释 `$&`/`` $' ``/`` $` ``/`$$`
 *    （`$'` 值拼接匹配点之后的全部文本，密集模板 × 2 字 args 可展开
 *    ~content²/12，绕过按 args.length 计的预算）；② 前遍插入的占位符
 *    被后遍重展开（命名值内含 `$ARGUMENTS` 被裸 $ARGUMENTS 遍再展开，
 *    预算投影失真）。修法 = 单遍扫描原模板 + 字面值输出（值不回扫、
 *    不当 replacement pattern 解释）→ 预算预点成为真上界。
 *  - #2（MEDIUM）门控 hook 静默截断——hookHelpers.addArgumentsToPrompt
 *    喂 PreToolUse/Stop 门控决策，超预算静默钳制 = 决策模型看到截断
 *    前缀。修法 = substituteArgumentsStrict 超预算返 null（显式
 *    input-preparation 失败），exec hook 收 null → blocking（fail-closed，
 *    绝不基于未标记前缀放行门控动作）。
 *
 * 双体：engine 域 src/engine/skill/argumentSubstitution.ts 与 TUI 域
 * src/tui/utils/argumentSubstitution.ts 同构双副本，两体同断言。
 */
import { describe, expect, test } from 'bun:test'

import * as engine from '../../src/engine/skill'
import { addArgumentsToPrompt } from '../../src/tui/utils/hooks/hookHelpers.js'
import * as tui from '../../src/tui/utils/argumentSubstitution.js'

const COPIES = [
  { label: 'engine', mod: engine },
  { label: 'tui', mod: tui },
] as const

describe('K3-C2 round-5 #1：替换值字面语义（单遍，双体）', () => {
  for (const { label, mod } of COPIES) {
    describe(label, () => {
      test(`$& 值按字面输出不被解释 [${label}]`, () => {
        expect(mod.substituteArguments('prefix $ARGUMENTS suffix', '$&')).toBe(
          'prefix $& suffix',
        )
      })

      test(`$' 值按字面输出不拼接后文 [${label}]`, () => {
        expect(mod.substituteArguments("$ARGUMENTS tail", "$'")).toBe(
          "$' tail",
        )
      })

      test(`$$ 值按字面输出 [${label}]`, () => {
        expect(mod.substituteArguments('a $ARGUMENTS b', '$$')).toBe('a $$ b')
      })

      test(`命名值内含 $0 不被后续遍重展开 [${label}]`, () => {
        // 旧多遍：pass1 插入 'x $0' → pass3 把插入的 $0 再展开
        // （'x x $0 x x $0'）；单遍：值字面输出
        expect(
          mod.substituteArguments('$foo $0', "'x $0'", true, ['foo']),
        ).toBe('x $0 x $0')
      })

      test(`裸 $ARGUMENTS 值内含 $ARGUMENTS 不重展开、无误追加 [${label}]`, () => {
        // 旧多遍：replaceAll 替换回自身 → 内容零变更判定命中 → 误走
        // 追加路径产出 'x $ARGUMENTS\n\nARGUMENTS: $ARGUMENTS'
        expect(mod.substituteArguments('x $ARGUMENTS', '$ARGUMENTS')).toBe(
          'x $ARGUMENTS',
        )
      })

      test(`$' 放大攻击有界（预算真上界）[${label}]`, () => {
        // 100 占位符 × $' 值：旧实现每占位符拼接匹配点后文
        // （≈455KB 展开）；单遍字面 = 100×2 + 模板
        const content = '$ARGUMENTS '.repeat(100) + 'y'.repeat(5000)
        const out = mod.substituteArguments(content, "$'")
        expect(out).toBe("$' ".repeat(100) + 'y'.repeat(5000))
        expect(out.length).toBeLessThan(10_000)
      })
    })
  }
})

describe('K3-C2 round-5 #1：良性语义恒等锚（回归网，双体）', () => {
  for (const { label, mod } of COPIES) {
    describe(label, () => {
      test(`三形态常规替换零变更 [${label}]`, () => {
        expect(mod.substituteArguments('a $ARGUMENTS b', 'X Y')).toBe(
          'a X Y b',
        )
        expect(
          mod.substituteArguments('a $ARGUMENTS[0] and $1 b', 'X Y'),
        ).toBe('a X and Y b')
        expect(
          mod.substituteArguments('$foo then $bar', 'X Y', true, [
            'foo',
            'bar',
          ]),
        ).toBe('X then Y')
      })

      test(`追加路径 / 空参 / 未提供参 [${label}]`, () => {
        expect(mod.substituteArguments('no placeholder', 'A B')).toBe(
          'no placeholder\n\nARGUMENTS: A B',
        )
        expect(mod.substituteArguments('a $ARGUMENTS b', '')).toBe('a  b')
        expect(mod.substituteArguments('a $ARGUMENTS b', undefined)).toBe(
          'a $ARGUMENTS b',
        )
      })
    })
  }
})

describe('K3-C2 round-5 #2：strict 模式 + 门控 hook fail-closed（双体）', () => {
  for (const { label, mod } of COPIES) {
    describe(label, () => {
      test(`超预算 → null 显式失败（不静默截断）[${label}]`, () => {
        expect(
          mod.substituteArgumentsStrict(
            '$ARGUMENTS $ARGUMENTS',
            'z'.repeat(600_000),
          ),
        ).toBeNull()
      })

      test(`预算内 strict 与非 strict 同值 [${label}]`, () => {
        expect(mod.substituteArgumentsStrict('a $ARGUMENTS b', 'X')).toBe(
          'a X b',
        )
        // 无占位符（追加路径）不经预算 → 恒可用
        expect(mod.substituteArgumentsStrict('plain', 'A')).toBe(
          'plain\n\nARGUMENTS: A',
        )
      })
    })
  }

  test('hookHelpers.addArgumentsToPrompt 超预算 → null（门控决策不喂截断前缀）', () => {
    expect(
      addArgumentsToPrompt('$ARGUMENTS $ARGUMENTS', 'z'.repeat(600_000)),
    ).toBeNull()
  })

  test('hookHelpers.addArgumentsToPrompt 预算内 → 常规替换', () => {
    expect(
      addArgumentsToPrompt('check: $ARGUMENTS', '{"cmd":"ls"}'),
    ).toBe('check: {"cmd":"ls"}')
  })
})
