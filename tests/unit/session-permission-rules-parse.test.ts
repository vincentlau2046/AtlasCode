/**
 * 2026-10-05 §4b A 波 A1：session-rules sidecar 纯解析判别单测。
 *
 * 被测：parseSessionRulesJson（JSON 文本 → 校验后 PermissionUpdate[]）。
 * 只接受本模块写出的形状（addRules + allow + session 域）；畸形一律 [] 不抛。
 * 分层纪律：零磁盘（磁盘 round-trip 在 integration 层）。
 */
import { describe, test, expect } from 'bun:test'
import { parseSessionRulesJson } from '../../src/tui/utils/permissions/sessionPermissionRules'

describe('parseSessionRulesJson', () => {
  test('合法形状 → 透传（无 ruleContent 的 tool 级规则保留）', () => {
    const json = JSON.stringify({
      updates: [
        {
          type: 'addRules',
          rules: [{ toolName: 'Write' }],
          behavior: 'allow',
          destination: 'session',
        },
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash', ruleContent: 'git:*' }],
          behavior: 'allow',
          destination: 'session',
        },
      ],
    })
    expect(parseSessionRulesJson(json)).toEqual([
      {
        type: 'addRules',
        rules: [{ toolName: 'Write' }],
        behavior: 'allow',
        destination: 'session',
      },
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'git:*' }],
        behavior: 'allow',
        destination: 'session',
      },
    ])
  })

  test('非法 JSON / 非对象 / updates 非数组 / 超尺寸 → []', () => {
    expect(parseSessionRulesJson('not json')).toEqual([])
    expect(parseSessionRulesJson('null')).toEqual([])
    expect(parseSessionRulesJson('{"updates": "nope"}')).toEqual([])
    expect(parseSessionRulesJson(JSON.stringify({ updates: [] }))).toEqual([])
    expect(parseSessionRulesJson(JSON.stringify('x'))).toEqual([])
    // 1MB 防御上限
    expect(parseSessionRulesJson('x'.repeat(1024 * 1024 + 1))).toEqual([])
  })

  test('混合条目：仅留 addRules/allow/session，丢弃异形条目与空 rules', () => {
    const json = JSON.stringify({
      updates: [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash', ruleContent: 'npm:*' }],
          behavior: 'allow',
          destination: 'session',
        },
        // 空 rules → 丢弃
        { type: 'addRules', rules: [], behavior: 'allow', destination: 'session' },
        // 非 addRules → 丢弃
        { type: 'addDirectories', directories: ['/tmp'], destination: 'session' },
        // deny → 丢弃
        { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'deny', destination: 'session' },
        // 非 session 域 → 丢弃
        { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'localSettings' },
        // rule toolName 非 string → rules 过滤后为空 → 丢弃
        { type: 'addRules', rules: [{ toolName: 42 }], behavior: 'allow', destination: 'session' },
        // 非对象条目 → 丢弃
        'garbage',
      ],
    })
    expect(parseSessionRulesJson(json)).toEqual([
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'npm:*' }],
        behavior: 'allow',
        destination: 'session',
      },
    ])
  })
})
