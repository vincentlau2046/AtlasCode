/**
 * engine/skill 域 D 波 S-E2a unit 层（零盘零模型）：model 解析族
 * （role 别名身份映射裁定）+ 技能使用频次追踪（内存态 60s 防抖 +
 * 7 天半衰评分）+ 插件标识解析族。
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import {
  ALLOWED_OFFICIAL_MARKETPLACE_NAMES,
  buildPluginId,
  clearSkillUsageState,
  getSkillUsageScore,
  isOfficialMarketplaceName,
  parsePluginIdentifier,
  parseUserSpecifiedModel,
  recordSkillUsage,
  resolveSkillModelOverride,
} from '../../src/engine/skill'

describe('parseUserSpecifiedModel — role 别名身份映射', () => {
  test('role 别名 → 恒小写角色标识（MODEL_ROLES 判定）', () => {
    expect(parseUserSpecifiedModel('premium')).toBe('premium')
    expect(parseUserSpecifiedModel('Fast')).toBe('fast')
    expect(parseUserSpecifiedModel(' SMALL ')).toBe('small')
  })

  test('自定义模型串原样保留大小写透传（trim 后）', () => {
    expect(parseUserSpecifiedModel('My-Deployment-01')).toBe(
      'My-Deployment-01',
    )
    expect(parseUserSpecifiedModel(' gpt-4o ')).toBe('gpt-4o')
  })

  test('空值 → 空串', () => {
    expect(parseUserSpecifiedModel('')).toBe('')
    expect(parseUserSpecifiedModel(undefined)).toBe('')
    expect(parseUserSpecifiedModel(null)).toBe('')
  })
})

describe('resolveSkillModelOverride', () => {
  test('原样返回 skill 声明模型（1M 后缀语义已随 P6 删除）', () => {
    expect(resolveSkillModelOverride('gpt-4o', 'claude-x')).toBe('gpt-4o')
    expect(resolveSkillModelOverride('premium', 'fast')).toBe('premium')
  })
})

describe('技能使用频次追踪（内存态）', () => {
  beforeEach(() => {
    clearSkillUsageState()
  })

  test('未记录 → 0 分', () => {
    expect(getSkillUsageScore('unknown-skill')).toBe(0)
  })

  test('记录 → 正分（时近系数 ≈1，刚记录）', () => {
    recordSkillUsage('skill-a')
    const score = getSkillUsageScore('skill-a')
    expect(score).toBeGreaterThan(0.9)
    expect(score).toBeLessThanOrEqual(1.0)
  })

  test('60s 防抖窗口内重复调用不累加（内存态真语义）', () => {
    recordSkillUsage('common')
    recordSkillUsage('common')
    recordSkillUsage('common')
    // 防抖跳过 → 计数保持 1（评分 ≈ 1）
    expect(getSkillUsageScore('common')).toBeCloseTo(1, 4)
  })

  test('跨越防抖窗口 → 计数累加，频次主导评分', () => {
    const realNow = Date.now
    const base = 1_700_000_000_000
    try {
      Date.now = () => base
      recordSkillUsage('rare')
      recordSkillUsage('common')
      for (let i = 0; i < 3; i++) {
        Date.now = () => base + (i + 1) * 61_000
        recordSkillUsage('common')
      }
      Date.now = () => base + 3 * 61_000
      // common 计 4 次 / rare 计 1 次（时近性同刻 ≈ 1）
      expect(getSkillUsageScore('common')).toBeGreaterThan(3.5)
      expect(getSkillUsageScore('common')).toBeGreaterThan(
        getSkillUsageScore('rare'),
      )
    } finally {
      Date.now = realNow
      clearSkillUsageState()
    }
  })

  test('clearSkillUsageState 清零', () => {
    recordSkillUsage('skill-a')
    clearSkillUsageState()
    expect(getSkillUsageScore('skill-a')).toBe(0)
  })
})

describe('插件标识解析族', () => {
  test('parsePluginIdentifier 首 @ 分隔（后续 @ 忽略）', () => {
    expect(parsePluginIdentifier('my-plugin')).toEqual({ name: 'my-plugin' })
    expect(parsePluginIdentifier('my-plugin@agent-skills')).toEqual({
      name: 'my-plugin',
      marketplace: 'agent-skills',
    })
    expect(parsePluginIdentifier('a@b@c')).toEqual({
      name: 'a',
      marketplace: 'b',
    })
    expect(parsePluginIdentifier('@only-market')).toEqual({
      name: '',
      marketplace: 'only-market',
    })
  })

  test('buildPluginId 双向构造', () => {
    expect(buildPluginId('x')).toBe('x')
    expect(buildPluginId('x', 'm')).toBe('x@m')
  })

  test('官方市场名判定（大小写不敏感）', () => {
    expect(isOfficialMarketplaceName('agent-skills')).toBe(true)
    expect(isOfficialMarketplaceName('CLAUDE-PLUGINS-OFFICIAL')).toBe(true)
    expect(isOfficialMarketplaceName('my-private-market')).toBe(false)
    expect(isOfficialMarketplaceName(undefined)).toBe(false)
    expect(ALLOWED_OFFICIAL_MARKETPLACE_NAMES.size).toBe(8)
  })
})
