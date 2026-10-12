/**
 * 0.1.59 C1-1 hard_deny 第 4 类解析层判别单测（CC 2.1.136）。
 *
 * 语义：AutoModeRules 由 3 类（allow/soft_deny/environment）扩 4 类
 * （+hard_deny，用户无条件 BLOCK，User Intent 不清除）。解析层 = 模板 tag
 * `<user_hard_deny_rules_to_replace>` + 5 处形状 + severity 最严聚合纯函数
 * aggregateAutoModeSeverity。
 *
 * 判别面（RED→GREEN，修前）：
 *   - aggregateAutoModeSeverity 修前不存在 → 本文件 import 即 RED。
 *   - getDefaultExternalAutoModeRules().hard_deny 修前 undefined →
 *     toEqual([]) RED。
 *   - buildDefaultExternalSystemPrompt 修前无 '## USER HARD DENY' 段 → RED。
 *
 * rank 聚合三例（Main 裁定）：
 *   {hardDeny, allow} → hard_deny（不清除，FINAL 无清除支）
 *   {softDeny, allow} → soft_deny（allow 聚合面不清除 soft 块）
 *   {deny, allow}     → allow（allow 清除常规 deny）
 *
 * 纪律：零模型 / 零网络 / 零磁盘（纯逻辑 + 仓内 .txt 模板）。
 */
import { describe, test, expect } from 'bun:test'
import {
  aggregateAutoModeSeverity,
  getDefaultExternalAutoModeRules,
  buildDefaultExternalSystemPrompt,
} from '../../src/permissions'

describe('0.1.59 C1-1 · aggregateAutoModeSeverity rank 聚合（hard_deny 第 4 类）', () => {
  test('{hardDeny, allow} → hard_deny（不清除，FINAL 无清除支）', () => {
    expect(aggregateAutoModeSeverity({ hard_deny: true, allow: true })).toBe(
      'hard_deny',
    )
    // 命中规则清单形（非布尔）同判
    expect(
      aggregateAutoModeSeverity({
        hard_deny: ['no prod deploy'],
        allow: ['read-only'],
      }),
    ).toBe('hard_deny')
  })

  test('{softDeny, allow} → soft_deny（allow 聚合面不清除 soft 块）', () => {
    expect(
      aggregateAutoModeSeverity({ soft_deny: true, allow: true }),
    ).toBe('soft_deny')
  })

  test('{deny, allow} → allow（allow 清除常规 deny）', () => {
    expect(aggregateAutoModeSeverity({ deny: true, allow: true })).toBe('allow')
  })

  test('单类命中各定：hard_deny / soft_deny / deny / allow', () => {
    expect(aggregateAutoModeSeverity({ hard_deny: ['x'] })).toBe('hard_deny')
    expect(aggregateAutoModeSeverity({ soft_deny: ['x'] })).toBe('soft_deny')
    expect(aggregateAutoModeSeverity({ deny: ['x'] })).toBe('deny')
    expect(aggregateAutoModeSeverity({ allow: ['x'] })).toBe('allow')
  })

  test('无命中 → allow（中性缺省）；空数组 = 未命中', () => {
    expect(aggregateAutoModeSeverity({})).toBe('allow')
    expect(
      aggregateAutoModeSeverity({
        hard_deny: [],
        soft_deny: [],
        deny: [],
        allow: [],
      }),
    ).toBe('allow')
  })

  test('hard_deny 胜全类（最严即定，soft/deny/allow 不翻案）', () => {
    expect(
      aggregateAutoModeSeverity({
        hard_deny: ['x'],
        soft_deny: ['y'],
        deny: ['z'],
        allow: ['w'],
      }),
    ).toBe('hard_deny')
  })
})

describe('0.1.59 C1-1 · hard_deny 第 4 类解析层（模板 tag + 缺省提取）', () => {
  test('getDefaultExternalAutoModeRules 含 hard_deny 键（缺省空 = hard_deny ∅）', () => {
    const rules = getDefaultExternalAutoModeRules()
    // 第 4 类缺省空（模板 tag 非 `- ` bullet）
    expect(rules.hard_deny).toEqual([])
    // 既有 3 类缺省仍在场（回归不破坏）
    expect(rules.allow.length).toBeGreaterThan(0)
    expect(rules.soft_deny.length).toBeGreaterThan(0)
    expect(rules.environment.length).toBeGreaterThan(0)
  })

  test('buildDefaultExternalSystemPrompt 注入 ## USER HARD DENY 段 + 无裸 tag 残留', () => {
    const prompt = buildDefaultExternalSystemPrompt()
    expect(prompt).toContain('## USER HARD DENY')
    expect(prompt).not.toContain('<user_hard_deny_rules_to_replace>')
    expect(prompt).not.toContain('</user_hard_deny_rules_to_replace>')
  })
})
