/**
 * 0.1.82 K3-C L43 判别单测（上游 299）：Skill 工具「Unknown skill」
 * 提示附有上限的可用 skill 名单（recover aid——模型拼错名时能自纠）。
 *
 * 修前红面：现消息恒 `Unknown skill: <name>`，不列任何可用名。
 * 修后面：
 *   - 池空 → 裸消息（恒等锚，零变更）
 *   - 池内有技能 → `Unknown skill: <name>. Available skills: a, b`
 *   - 名单 cap = 10，超出附 ` (and N more)`
 *   - isHidden / disableModelInvocation 技能不入名单（模型不可调用面）
 *
 * 隔离纪律（engine-tools-skill-se2b.test.ts 先例逐字）：
 * ATLAS_CONFIG_DIR=/mock-home 防御戳（技能目录扫描 ENOENT → 空），
 * 命令池 = registerBundledSkill 内存注入 + beforeEach/afterEach
 * clearBundledSkills/clearCommandsCache 全清。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { SkillTool } from '../../src/engine/tools'
import {
  clearBundledSkills,
  clearCommandsCache,
  registerBundledSkill,
} from '../../src/engine/skill'

const ENV_KEYS = ['ATLAS_CONFIG_DIR'] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  // 防御戳：技能目录扫描落不存在目录（ENOENT → 空，零真实盘）
  process.env.ATLAS_CONFIG_DIR = '/mock-home'
  clearBundledSkills()
  clearCommandsCache()
})

afterEach(() => {
  clearBundledSkills()
  clearCommandsCache()
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('K3-C L43：Unknown skill 提示附可用名单', () => {
  test('池空 → 裸消息（恒等锚，零变更）', async () => {
    const res = await SkillTool.validateInput({ skill: 'l43-no-such' })
    expect(res).toEqual({
      result: false,
      message: 'Unknown skill: l43-no-such',
      errorCode: 2,
    })
  })

  test('池内有技能 → 消息附可用名单', async () => {
    registerBundledSkill({
      name: 'l43-alpha',
      description: 'a',
      getPromptForCommand: async () => [],
    })
    registerBundledSkill({
      name: 'l43-beta',
      description: 'b',
      getPromptForCommand: async () => [],
    })
    const res = await SkillTool.validateInput({ skill: 'l43-no-such' })
    expect(res.result).toBe(false)
    if (!res.result) {
      expect(res.errorCode).toBe(2)
      expect(res.message).toBe(
        'Unknown skill: l43-no-such. Available skills: l43-alpha, l43-beta',
      )
    }
  })

  test('名单 cap 10，超出附 (and N more)', async () => {
    for (let i = 0; i < 13; i++) {
      registerBundledSkill({
        name: `l43-skill-${String(i).padStart(2, '0')}`,
        description: 'd',
        getPromptForCommand: async () => [],
      })
    }
    const res = await SkillTool.validateInput({ skill: 'l43-no-such' })
    expect(res.result).toBe(false)
    if (!res.result) {
      expect(res.message).toBe(
        'Unknown skill: l43-no-such. Available skills: ' +
          Array.from({ length: 10 }, (_, i) => `l43-skill-${String(i).padStart(2, '0')}`)
            .join(', ') +
          ' (and 3 more)',
      )
    }
  })

  test('isHidden / disableModelInvocation 技能不入名单', async () => {
    registerBundledSkill({
      name: 'l43-visible',
      description: 'v',
      getPromptForCommand: async () => [],
    })
    registerBundledSkill({
      name: 'l43-hidden',
      description: 'h',
      userInvocable: false, // registerBundledSkill → isHidden: true
      getPromptForCommand: async () => [],
    })
    registerBundledSkill({
      name: 'l43-locked',
      description: 'l',
      disableModelInvocation: true,
      getPromptForCommand: async () => [],
    })
    const res = await SkillTool.validateInput({ skill: 'l43-no-such' })
    expect(res.result).toBe(false)
    if (!res.result) {
      expect(res.message).toBe(
        'Unknown skill: l43-no-such. Available skills: l43-visible',
      )
    }
  })
})
