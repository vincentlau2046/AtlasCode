/**
 * engine/config hooks 字段族 schema 严格编辑面 unit 测试（E-5 S-5c，§8.41 判别信号）
 *
 * 被测能力 = hooksSchema.ts 全字段面 + 事件名集校验 + SettingsSchema 收紧：
 *   - 4 变体全字段面 round-trip（command 8 字段 / prompt / http / agent，
 *     旧仓 src/schemas/hooks.ts 字段面 ground truth + 新仓 timeoutMs 命名 R3）
 *   - 事件名集校验（record key ∈ HOOK_EVENTS 27，R1；假事件 parse 期拒）
 *   - SettingsSchema hooks z.any() → z.lazy(HooksSchema) 收紧（R2；
 *     坏配置 parse 期 ValidationError 非静默透传）
 *   - 字段类型检（shell enum / timeoutMs positive / url / headers record /
 *     allowedEnvVars 数组）
 *   - passthrough 前向兼容（R4：未知字段透传不丢，偏离旧仓 strict 裁定锁定）
 *   - L3 门面面（engine 根门面 import 消费，防 H6 死接缝）
 *
 * 分层纪律：纯 schema 零磁盘（无 fs / 无 gateway / 无 mock 注入）；L3 面测试
 * import engine 根门面（同 engine-hooks.test.ts 口径）。
 */
import { describe, test, expect } from 'bun:test'
import {
  HookCommandSchema,
  HooksSchema,
  SettingsSchema,
} from '../../src/engine'
import { HOOK_EVENTS } from '../../src/hooks'

// ── ①-④ 4 变体全字段面 round-trip（§8.41 R3，旧仓 leaf 字段面）──────────

describe('4 变体全字段面（§8.41 R3）', () => {
  test('① command 全字段（shell enum / timeoutMs positive / statusMessage / once / async / asyncRewake / if）', () => {
    const input = {
      type: 'command',
      command: 'npm test',
      shell: 'powershell',
      timeoutMs: 5000,
      statusMessage: 'running tests',
      once: true,
      async: false,
      asyncRewake: true,
      if: 'Bash(npm *)',
    }
    const r = HookCommandSchema.safeParse(input)
    expect(r.success).toBe(true)
    expect(r.success && r.data.type).toBe('command')
    if (r.success && r.data.type === 'command') {
      expect(r.data.command).toBe('npm test')
      expect(r.data.shell).toBe('powershell')
      expect(r.data.timeoutMs).toBe(5000)
      expect(r.data.statusMessage).toBe('running tests')
      expect(r.data.once).toBe(true)
      expect(r.data.async).toBe(false)
      expect(r.data.asyncRewake).toBe(true)
      expect(r.data.if).toBe('Bash(npm *)')
    }
  })

  test('② prompt 全字段（timeoutMs / model / statusMessage / once / if）', () => {
    const r = HookCommandSchema.safeParse({
      type: 'prompt',
      prompt: 'Check $ARGUMENTS',
      timeoutMs: 30000,
      model: 'small-fast-model',
      statusMessage: 'evaluating',
      once: true,
      if: 'Write(*.ts)',
    })
    expect(r.success).toBe(true)
    expect(r.success && r.data.type).toBe('prompt')
    if (r.success && r.data.type === 'prompt') {
      expect(r.data.prompt).toBe('Check $ARGUMENTS')
      expect(r.data.model).toBe('small-fast-model')
      expect(r.data.timeoutMs).toBe(30000)
      expect(r.data.once).toBe(true)
    }
  })

  test('③ http 全字段（url / headers record / allowedEnvVars / statusMessage / once / if）', () => {
    const r = HookCommandSchema.safeParse({
      type: 'http',
      url: 'https://hooks.local/ingest',
      timeoutMs: 10000,
      headers: { Authorization: 'Bearer $MY_TOKEN' },
      allowedEnvVars: ['MY_TOKEN'],
      statusMessage: 'posting',
      once: false,
      if: 'UserPromptSubmit',
    })
    expect(r.success).toBe(true)
    expect(r.success && r.data.type).toBe('http')
    if (r.success && r.data.type === 'http') {
      expect(r.data.url).toBe('https://hooks.local/ingest')
      expect(r.data.headers).toEqual({ Authorization: 'Bearer $MY_TOKEN' })
      expect(r.data.allowedEnvVars).toEqual(['MY_TOKEN'])
    }
  })

  test('④ agent 全字段（timeoutMs / model / statusMessage / once / if）', () => {
    const r = HookCommandSchema.safeParse({
      type: 'agent',
      prompt: 'Verify unit tests ran',
      timeoutMs: 60000,
      model: 'verify-model',
      statusMessage: 'verifying',
      once: true,
      if: 'Stop',
    })
    expect(r.success).toBe(true)
    expect(r.success && r.data.type).toBe('agent')
    if (r.success && r.data.type === 'agent') {
      expect(r.data.prompt).toBe('Verify unit tests ran')
      expect(r.data.model).toBe('verify-model')
      expect(r.data.timeoutMs).toBe(60000)
    }
  })
})

// ── ⑤ 事件名集校验（§8.41 R1，旧仓 leaf z.partialRecord(z.enum(HOOK_EVENTS)) 逐字）─

describe('事件名集校验（record key ∈ HOOK_EVENTS 27）', () => {
  test('⑤a 27 事件全过（逐一遍历，空 matcher 数组合法）', () => {
    for (const event of HOOK_EVENTS) {
      const r = HooksSchema.safeParse({ [event]: [] } as Record<string, unknown>)
      expect(r.success, `事件 ${event} 应通过`).toBe(true)
    }
  })

  test('⑤b 假事件名拒识（error 信息含键名）', () => {
    const r = HooksSchema.safeParse({
      BogusEvent: [{ hooks: [{ type: 'command', command: 'x' }] }],
    } as Record<string, unknown>)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toContain('BogusEvent')
    }
  })

  test('⑤c 混合（合法事件 + 假事件）→ 拒（整 record 校验）', () => {
    const r = HooksSchema.safeParse({
      PreToolUse: [{ hooks: [{ type: 'command', command: 'ok' }] }],
      NotAnEvent: [],
    } as Record<string, unknown>)
    expect(r.success).toBe(false)
  })
})

// ── ⑥ SettingsSchema hooks 收紧（§8.41 R2：z.any() → z.lazy(HooksSchema)）──

describe('SettingsSchema hooks 字段收紧（§8.41 R2）', () => {
  test('⑥a 合法 hooks 配置过 SettingsSchema（data 面保真）', () => {
    const r = SettingsSchema().safeParse({
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] },
        ],
      },
      disableAllHooks: false,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(JSON.stringify(r.data.hooks)).toContain('"command":"x"')
    }
  })

  test('⑥b 假事件名 → SettingsSchema 拒（parse 期 ValidationError，非静默透传）', () => {
    const r = SettingsSchema().safeParse({
      hooks: { NotAnEvent: [] },
    })
    expect(r.success).toBe(false)
  })
})

// ── ⑦-⑩ 字段类型检 ────────────────────────────────────────────────────

describe('字段类型检（enum / positive / url / record / 数组）', () => {
  test('⑦ shell enum：zsh 拒 / bash 过（SHELL_TYPES 内联，旧仓两值）', () => {
    expect(
      HookCommandSchema.safeParse({ type: 'command', command: 'x', shell: 'zsh' })
        .success,
    ).toBe(false)
    expect(
      HookCommandSchema.safeParse({
        type: 'command',
        command: 'x',
        shell: 'bash',
      }).success,
    ).toBe(true)
  })

  test('⑧ timeoutMs positive：0 拒 / 负数拒 / 正数过（旧仓 timeout(秒).positive() 语义）', () => {
    expect(
      HookCommandSchema.safeParse({ type: 'command', command: 'x', timeoutMs: 0 })
        .success,
    ).toBe(false)
    expect(
      HookCommandSchema.safeParse({ type: 'command', command: 'x', timeoutMs: -5 })
        .success,
    ).toBe(false)
    expect(
      HookCommandSchema.safeParse({
        type: 'command',
        command: 'x',
        timeoutMs: 5000,
      }).success,
    ).toBe(true)
  })

  test('⑨ http url 合法性：非 URL 拒 / 合法 URL 过', () => {
    expect(
      HookCommandSchema.safeParse({ type: 'http', url: 'not-a-url' }).success,
    ).toBe(false)
    expect(
      HookCommandSchema.safeParse({
        type: 'http',
        url: 'https://hooks.local/ingest',
      }).success,
    ).toBe(true)
  })

  test('⑩ headers 值非 string 拒 / allowedEnvVars 非 string[] 拒', () => {
    expect(
      HookCommandSchema.safeParse({
        type: 'http',
        url: 'https://h.local/hook',
        headers: { Authorization: 42 },
      }).success,
    ).toBe(false)
    expect(
      HookCommandSchema.safeParse({
        type: 'http',
        url: 'https://h.local/hook',
        allowedEnvVars: ['OK', 7],
      }).success,
    ).toBe(false)
  })
})

// ── ⑪ passthrough 前向兼容（§8.41 R4，偏离旧仓 strict 裁定锁定）────────

describe('passthrough 前向兼容（R4）', () => {
  test('⑪ 变体未知字段透传不丢（future-wave 执行面消费字段不破坏）', () => {
    const r = HookCommandSchema.safeParse({
      type: 'command',
      command: 'x',
      extra: 42,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect((r.data as Record<string, unknown>).extra).toBe(42)
    }
  })
})

// ── ⑫ L3 门面面（engine 根 import 消费，防 H6 死接缝）─────────────────

describe('L3 门面面（re-export 真）', () => {
  test('⑫ HookCommandSchema 判别联合（未知 type 拒 / command 缺 command 拒）', () => {
    expect(
      HookCommandSchema.safeParse({ type: 'bogus', command: 'x' }).success,
    ).toBe(false)
    expect(HookCommandSchema.safeParse({ type: 'command' }).success).toBe(false)
  })
})
