/**
 * permissions 域 bash 分类器桩 unit 测试（E-6 S-6c，§8.43 判别；零磁盘）
 *
 * 被测 = src/permissions/bashClassifier.ts（旧仓 61L 逐字，「stub 即
 * 外部构建形态」）：判别信号 = PROMPT_PREFIX 单一事实源 /
 * createPromptRuleContent 拼接 + trim / isClassifierPermissionsEnabled
 * 恒 false / 三 descriptions 族恒空 / classifyBashCommand no-op 形状
 *（matches:false + high + 固定 reason）/ generateGenericDescription
 * 透传 ?? null。零消费者前向登记（auto-mode 纵切波分类器族，§8.31
 * 裁定 ①；matrix missing 行「bash prompt 分类器消费」）。
 */
import { describe, test, expect } from 'bun:test'
import {
  PROMPT_PREFIX,
  extractPromptDescription,
  createPromptRuleContent,
  isClassifierPermissionsEnabled,
  getBashPromptDenyDescriptions,
  getBashPromptAskDescriptions,
  getBashPromptAllowDescriptions,
  classifyBashCommand,
  generateGenericDescription,
} from '../../src/permissions'

describe('bash 分类器桩（外部构建形态，§8.43）', () => {
  test('PROMPT_PREFIX 单一事实源 = prompt:', () => {
    expect(PROMPT_PREFIX).toBe('prompt:')
  })

  test('createPromptRuleContent 拼接 + trim', () => {
    expect(createPromptRuleContent('x')).toBe('prompt: x')
    expect(createPromptRuleContent('  y  ')).toBe('prompt: y')
  })

  test('extractPromptDescription 恒 null（stub 形态）', () => {
    expect(extractPromptDescription(undefined)).toBeNull()
    expect(extractPromptDescription('prompt: x')).toBeNull()
  })

  test('isClassifierPermissionsEnabled 恒 false', () => {
    expect(isClassifierPermissionsEnabled()).toBe(false)
  })

  test('三 descriptions 族恒空（任意 context）', () => {
    const ctx = { x: 1 }
    expect(getBashPromptDenyDescriptions(ctx)).toEqual([])
    expect(getBashPromptAskDescriptions(ctx)).toEqual([])
    expect(getBashPromptAllowDescriptions(ctx)).toEqual([])
  })

  test('classifyBashCommand no-op 形状（matches:false + high + 固定 reason）', async () => {
    const result = await classifyBashCommand(
      'ls',
      '/tmp',
      ['desc'],
      'allow',
      new AbortController().signal,
      false,
    )
    expect(result).toEqual({
      matches: false,
      confidence: 'high',
      reason: 'This feature is disabled',
    })
  })

  test('generateGenericDescription 透传 specificDescription，缺省 null', async () => {
    const signal = new AbortController().signal
    expect(await generateGenericDescription('ls', 'specific', signal)).toBe(
      'specific',
    )
    expect(await generateGenericDescription('ls', undefined, signal)).toBeNull()
  })
})
