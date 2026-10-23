/**
 * 0.1.79 W-C ⑪ C9-5 `skillOverrides` 三档判别单测（工单
 * docs/2026-10-23-p0-wave-0179-ticket.md §1.11 + 判据① line 44）。
 *
 * 规格（CC 2.1.129 对齐 + 卷 3 §5 settings key 裁定）：新 settings key
 * `skillOverrides`（off / user-invocable-only / name-only）进双拷贝 settings
 * schema（engine/config/types.ts + tui/utils/settings/types.ts）+ 配置参考
 * 模板同步（docs/atlas-config-reference-and-template.md §2.2）。
 *
 * 判别信号（基线 569aed7 同面红）：
 *  - schema 三档接受：engine + tui 双拷贝各档 parse 通过且落值。
 *  - schema 拒非法值：基线 passthrough 透传不报错 → 现声明面报
 *    invalid_union / invalid_literal。
 *  - 纯解析面 resolveSkillOverrides：三档直通 / 缺席 → 'off' / 非法宽容降级
 *    'off'（schema 校验面已产 ValidationError，消费侧兜底不 crash）。
 *  - 文档模板锚：配置参考含三档说明。
 *
 * unit 层纪律：纯函数断言 + 源级锁；零网络 / 零盘写。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  SettingsSchema as EngineSettingsSchema,
  resolveSkillOverrides,
  DEFAULT_SKILL_OVERRIDES_MODE,
} from '../../src/engine/config'
import { SettingsSchema as TuiSettingsSchema } from '../../src/tui/utils/settings/types'

function srcOf(rel: string): string {
  return readFileSync(resolve(import.meta.dir, '../../', rel), 'utf8')
}

const TIERS = ['off', 'user-invocable-only', 'name-only'] as const

// ════════════════════════════════════════════════════════════════
// 判据① 三档断言：双拷贝 schema 各档接受
// ════════════════════════════════════════════════════════════════
describe('C9-5 skillOverrides 双拷贝 schema 三档接受', () => {
  for (const schemaName of ['engine', 'tui'] as const) {
    const Schema =
      schemaName === 'engine' ? EngineSettingsSchema : TuiSettingsSchema
    describe(`${schemaName} SettingsSchema`, () => {
      for (const tier of TIERS) {
        test(`接受 "${tier}"`, () => {
          const result = Schema().safeParse({ skillOverrides: tier })
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data.skillOverrides).toBe(tier)
          }
        })
      }
      test('字段缺席 = optional（不报错，落 undefined）', () => {
        const result = Schema().safeParse({})
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.skillOverrides).toBeUndefined()
          // 缺省档经纯解析面收口为 'off'
          expect(
            resolveSkillOverrides(result.data.skillOverrides),
          ).toBe('off')
        }
      })
      test('拒非法值（基线 passthrough 透传 → 现声明面报错）', () => {
        const result = Schema().safeParse({
          skillOverrides: 'yes-please',
        })
        expect(result.success).toBe(false)
      })
      test('拒非字符串类型', () => {
        for (const bad of [true, 1, null, ['off']]) {
          const result = Schema().safeParse({ skillOverrides: bad })
          expect(result.success).toBe(false)
        }
      })
    })
  }
})

// ════════════════════════════════════════════════════════════════
// 纯解析面 resolveSkillOverrides（消费侧兜底）
// ════════════════════════════════════════════════════════════════
describe('C9-5 resolveSkillOverrides 纯解析面', () => {
  test('三档直通', () => {
    for (const tier of TIERS) {
      expect(resolveSkillOverrides(tier)).toBe(tier)
    }
  })
  test('缺席 / undefined → 缺省档 off', () => {
    expect(DEFAULT_SKILL_OVERRIDES_MODE).toBe('off')
    expect(resolveSkillOverrides(undefined)).toBe('off')
  })
  test('非法值宽容降级 off（schema 校验面已报错，消费侧不 crash）', () => {
    for (const bad of [
      'yes-please',
      '',
      'OFF',
      'user-invocable',
      true,
      0,
      null,
      {},
      ['off'],
    ]) {
      expect(resolveSkillOverrides(bad)).toBe('off')
    }
  })
})

// ════════════════════════════════════════════════════════════════
// 文档模板 + 消费缝登记锚（源级锁）
// ════════════════════════════════════════════════════════════════
describe('C9-5 文档模板 + schema 声明源级锚', () => {
  test('配置参考模板含三档说明（docs/atlas-config-reference-and-template.md）', () => {
    const doc = srcOf('docs/atlas-config-reference-and-template.md')
    expect(doc).toContain('"skillOverrides"')
    for (const tier of TIERS) {
      expect(doc).toContain(tier)
    }
  })
  test('双拷贝 schema 声明面在场（engine + tui 同形键）', () => {
    const engineSrc = srcOf('src/engine/config/types.ts')
    const tuiSrc = srcOf('src/tui/utils/settings/types.ts')
    for (const src of [engineSrc, tuiSrc]) {
      expect(src).toContain('skillOverrides:')
      expect(src).toContain("z.literal('user-invocable-only')")
    }
  })
})
