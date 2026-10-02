/**
 * S4（感知面反馈波）：skill listing 单条描述上限 env 可配判别单测
 * （getMaxListingDescChars，engine + tui 双车道同 env 同默认）。
 *
 * 被测能力：`SKILL_LISTING_MAX_DESC_CHARS`（正整数）覆盖硬编码 250 上限
 *（修前常量写死，无配置面）；未设/非法值回落 250（零行为变更）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getMaxListingDescChars as engineGetMax,
  MAX_LISTING_DESC_CHARS as engineDefault,
} from '../../src/engine/tools'
import {
  getMaxListingDescChars as tuiGetMax,
  MAX_LISTING_DESC_CHARS as tuiDefault,
} from '../../src/tui/tools/SkillTool/prompt'

const ENV = 'SKILL_LISTING_MAX_DESC_CHARS'

describe('getMaxListingDescChars（S4 双车道）', () => {
  beforeEach(() => {
    delete process.env[ENV]
  })
  afterEach(() => {
    delete process.env[ENV]
  })

  test('常量面：engine/tui 双车道默认一致 = 250', () => {
    expect(engineDefault).toBe(250)
    expect(tuiDefault).toBe(250)
  })

  test('未设 env → 双车道默认 250', () => {
    expect(engineGetMax()).toBe(250)
    expect(tuiGetMax()).toBe(250)
  })

  test('env 正整数覆盖（双车道同值）', () => {
    process.env[ENV] = '500'
    expect(engineGetMax()).toBe(500)
    expect(tuiGetMax()).toBe(500)
  })

  test('env 小数 → floor', () => {
    process.env[ENV] = '30.7'
    expect(engineGetMax()).toBe(30)
  })

  test('非法值（0 / 负数 / NaN / 未设形态）回落默认', () => {
    for (const v of ['0', '-5', 'abc', '']) {
      process.env[ENV] = v
      expect(engineGetMax()).toBe(250)
      expect(tuiGetMax()).toBe(250)
    }
  })
})
