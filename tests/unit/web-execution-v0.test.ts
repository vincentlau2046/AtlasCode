/**
 * B0 执行出口波 S2 —— webExecutionV0 协议 + createExecutionOutlet 出口判别单测。
 * 呈批书 docs/2026-11-21-execution-outlet-wave-lockface-brief.md §2 S2 +
 * f4 批复条件①（符号级扫描腿）②（出口构造零引擎引导腿 / E1 增格）@a62925c0；
 * 合同 docs/superpowers/specs/2026-11-20-first-wave-execution-contract.md §2/§3。
 */
import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  EXECUTION_PROTOCOL_VERSION,
  EXECUTION_SCHEMA_VERSION,
  WebExecutionCommandSchema,
  WebExecutionEventSchema,
  WebExecutionErrorSchema,
} from '../../src/kernel/protocol/webExecutionV0'
import {
  createExecutionOutlet,
  type ExecutionOutletOptions,
} from '../../src/kernel/execution/executionOutlet'

const ROOT = resolve(import.meta.dir, '../..')
const src = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const UUID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const UUID_B = 'c232ab00-9414-11e1-b4c3-0800200c9a66'
const UUID_C = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

const baseEnvelope = {
  v: EXECUTION_SCHEMA_VERSION,
  id: UUID_A,
  ts: 1700000000000,
  bind: { workspaceId: 'ws-1', sessionId: 'sess-1' },
}

describe('S2 · 格 A 协议 codec（webExecutionV0）', () => {
  test('常量分域：schemaVersion=0（消息形）/ protocolVersion=v0（配对域）', () => {
    expect(EXECUTION_SCHEMA_VERSION).toBe(0)
    expect(EXECUTION_PROTOCOL_VERSION).toBe('v0')
  })

  test('turn.submit 合法解析 + 判别 type', () => {
    const parsed = WebExecutionCommandSchema.safeParse({
      ...baseEnvelope,
      type: 'turn.submit',
      payload: { submitId: UUID_B, text: 'hello' },
    })
    expect(parsed.success).toBe(true)
  })

  test('strictObject：payload 未知字段拒（fail-closed）', () => {
    const parsed = WebExecutionCommandSchema.safeParse({
      ...baseEnvelope,
      type: 'turn.submit',
      payload: { submitId: UUID_B, text: 'hello', extra: 1 },
    })
    expect(parsed.success).toBe(false)
  })

  test('未知 v 拒', () => {
    const parsed = WebExecutionCommandSchema.safeParse({
      ...baseEnvelope,
      v: 1,
      type: 'turn.submit',
      payload: { submitId: UUID_B, text: 'hello' },
    })
    expect(parsed.success).toBe(false)
  })

  test('未知 type 拒（合同：未知 v 或 type 拒绝并回 error）', () => {
    const parsed = WebExecutionCommandSchema.safeParse({
      ...baseEnvelope,
      type: 'turn.wat',
      payload: {},
    })
    expect(parsed.success).toBe(false)
  })

  test('approval.decide：bind 须含 turnId（合同 §5 审计必改 2，schema 层强制）', () => {
    const missing = WebExecutionCommandSchema.safeParse({
      ...baseEnvelope,
      type: 'approval.decide',
      payload: { approvalId: UUID_C, decision: 'approved' },
    })
    expect(missing.success).toBe(false)
    const ok = WebExecutionCommandSchema.safeParse({
      ...baseEnvelope,
      bind: { workspaceId: 'ws-1', sessionId: 'sess-1', turnId: 'turn-1' },
      type: 'approval.decide',
      payload: { approvalId: UUID_C, decision: 'denied' },
    })
    expect(ok.success).toBe(true)
  })

  test('approval.decide：decision 越域值拒', () => {
    const parsed = WebExecutionCommandSchema.safeParse({
      ...baseEnvelope,
      bind: { workspaceId: 'ws-1', sessionId: 'sess-1', turnId: 'turn-1' },
      type: 'approval.decide',
      payload: { approvalId: UUID_C, decision: 'maybe' },
    })
    expect(parsed.success).toBe(false)
  })

  test('follow.resume：cursor 可缺（§6 恢复语义）', () => {
    const bare = WebExecutionCommandSchema.safeParse({
      ...baseEnvelope,
      type: 'follow.resume',
      payload: {},
    })
    expect(bare.success).toBe(true)
    const withCursor = WebExecutionCommandSchema.safeParse({
      ...baseEnvelope,
      type: 'follow.resume',
      payload: { cursor: 'opaque-cursor-token' },
    })
    expect(withCursor.success).toBe(true)
  })

  test('六命令判别面齐：capability.probe / turn.cancel / queue.remove', () => {
    for (const t of ['capability.probe', 'turn.cancel', 'queue.remove']) {
      const parsed = WebExecutionCommandSchema.safeParse({
        ...baseEnvelope,
        type: t,
        payload: t === 'capability.probe' ? {} : { targetTurnId: 'turn-9' },
      })
      expect(parsed.success).toBe(true)
    }
  })

  test('事件 codec：turn.accepted 携 bind + cursor（cursor 唯一排序权威）', () => {
    const parsed = WebExecutionEventSchema.safeParse({
      ...baseEnvelope,
      type: 'turn.accepted',
      cursor: 'e-000001',
      payload: { submitId: UUID_B },
    })
    expect(parsed.success).toBe(true)
  })

  test('事件缺 cursor 拒', () => {
    const { cursor: _omit, ...noCursor } = {
      ...baseEnvelope,
      type: 'turn.accepted',
      cursor: 'e-000001',
      payload: { submitId: UUID_B },
    }
    const parsed = WebExecutionEventSchema.safeParse(noCursor)
    expect(parsed.success).toBe(false)
  })

  test('approval.settled：decision 四态 + actorId/timestamp（f4 裁定：服务端产展示字段）', () => {
    for (const d of ['approved', 'denied', 'expired', 'voidedByCancel']) {
      expect(
        WebExecutionEventSchema.safeParse({
          ...baseEnvelope,
          bind: { workspaceId: 'ws-1', sessionId: 'sess-1', turnId: 'turn-1' },
          type: 'approval.settled',
          cursor: 'e-000002',
          payload: { approvalId: UUID_C, decision: d, actorId: 'actor-1', timestamp: 1700000000000 },
        }).success,
      ).toBe(true)
    }
    expect(
      WebExecutionEventSchema.safeParse({
        ...baseEnvelope,
        type: 'approval.settled',
        cursor: 'e-000002',
        payload: { approvalId: UUID_C, decision: 'approved', actorId: 'actor-1', timestamp: 1 },
      }).success,
    ).toBe(true)
    // 缺 actorId / timestamp 拒（B 附表 §3 actorId 展示值依赖）
    expect(
      WebExecutionEventSchema.safeParse({
        ...baseEnvelope,
        type: 'approval.settled',
        cursor: 'e-000002',
        payload: { approvalId: UUID_C, decision: 'approved', actorId: 'actor-1' },
      }).success,
    ).toBe(false)
    // 越域 decision 拒
    expect(
      WebExecutionEventSchema.safeParse({
        ...baseEnvelope,
        type: 'approval.settled',
        cursor: 'e-000002',
        payload: { approvalId: UUID_C, decision: 'pending', actorId: 'a', timestamp: 1 },
      }).success,
    ).toBe(false)
  })

  test('error 形：{code, message, retryable}', () => {
    expect(
      WebExecutionErrorSchema.safeParse({ code: 'x', message: 'm', retryable: false }).success,
    ).toBe(true)
    expect(
      WebExecutionErrorSchema.safeParse({ code: 'x', message: 'm' }).success,
    ).toBe(false)
  })
})

describe('S2 · 格 B 出口（createExecutionOutlet · E1 增格）', () => {
  const mkOutlet = (over: Partial<ExecutionOutletOptions> = {}) =>
    createExecutionOutlet({
      dispatchCommand: async () => ({
        type: 'error',
        code: 'unreachable',
        message: 'spy',
        retryable: false,
      }),
      ...over,
    })

  const fiveCommands = (): Array<{ type: string; payload: unknown }> => [
    { type: 'turn.submit', payload: { submitId: UUID_B, text: 'hi' } },
    { type: 'turn.cancel', payload: { targetTurnId: 'turn-1' } },
    { type: 'queue.remove', payload: { targetTurnId: 'turn-1' } },
    { type: 'approval.decide', payload: { approvalId: UUID_C, decision: 'denied' } },
    { type: 'follow.resume', payload: {} },
  ]

  test('probe（默认 off）：enabled=false + protocolVersion=v0，泄露面仅 on/off+v', () => {
    const outlet = mkOutlet()
    const cap = outlet.probe()
    expect(cap.enabled).toBe(false)
    expect(cap.protocolVersion).toBe('v0')
  })

  test('E1 增格：probe=off 下六命令任一 = 拒且内核零痕迹（dispatch 零触达）', () => {
    const calls: unknown[] = []
    const outlet = mkOutlet({
      dispatchCommand: async (cmd) => {
        calls.push(cmd)
        return { type: 'error', code: 'unreachable', message: 'spy', retryable: false }
      },
    })
    // probe 命令
    const probeResult = outlet.probe()
    expect(probeResult.enabled).toBe(false)
    // 五执行命令逐一：capabilityDisabled 拒
    for (const c of fiveCommands()) {
      // @ts-expect-error 测试构造的宽形逐个过 schema 判别后传入
      const r = outlet.handle({ ...baseEnvelope, ...c })
      // handle 为 async —— 同步断言不适用，改用下一条 async 测试覆盖
      void r
    }
    expect(calls.length).toBe(0)
  })

  test('E1 增格（async 逐命令）：off 下 handle 返回 capabilityDisabled 错误且 dispatch 未调', async () => {
    const calls: unknown[] = []
    const outlet = mkOutlet({
      dispatchCommand: async (cmd) => {
        calls.push(cmd)
        return { type: 'error', code: 'unreachable', message: 'spy', retryable: false }
      },
    })
    for (const c of fiveCommands()) {
      const r = await outlet.handle({ ...baseEnvelope, ...c } as never)
      expect(r).toMatchObject({ code: 'capabilityDisabled' })
      expect((r as { retryable?: boolean }).retryable).toBe(false)
    }
    expect(calls.length).toBe(0)
  })

  test('懒触达：构造零副作用（enabled 门真也不触发 dispatch）', async () => {
    const calls: unknown[] = []
    mkOutlet({
      isExecutionEnabled: () => true,
      dispatchCommand: async (cmd) => {
        calls.push(cmd)
        return { type: 'error', code: 'unreachable', message: 'spy', retryable: false }
      },
    })
    expect(calls.length).toBe(0)
  })

  test('enabled=on：命令薄适配透传 dispatch（事件/错误原样上抛，不重写排序）', async () => {
    const seen: Array<{ type: string }> = []
    const accepted = {
      ...baseEnvelope,
      bind: { ...baseEnvelope.bind, turnId: 'turn-1' },
      type: 'turn.accepted',
      cursor: 'e-000001',
      payload: { submitId: UUID_B },
    }
    const outlet = mkOutlet({
      isExecutionEnabled: () => true,
      dispatchCommand: async (cmd) => {
        seen.push({ type: (cmd as { type: string }).type })
        return accepted
      },
    })
    const r = await outlet.handle({
      ...baseEnvelope,
      type: 'turn.submit',
      payload: { submitId: UUID_B, text: 'hi' },
    } as never)
    expect(r).toBe(accepted)
    expect(seen).toEqual([{ type: 'turn.submit' }])
  })

  test('S4 followResume：off = capabilityDisabled 拒且内核零痕迹；on = §6 replay 透传', async () => {
    const calls: unknown[] = []
    const offOutlet = createExecutionOutlet({
      dispatchCommand: async (cmd) => {
        calls.push(cmd)
        return { code: 'unreachable', message: 'spy', retryable: false }
      },
    })
    const off = offOutlet.followResume({ workspaceId: 'ws', sessionId: 's1' })
    expect('kind' in off ? off.kind : (off as { code: string }).code).toBe('capabilityDisabled')
    expect(calls.length).toBe(0)

    const onOutlet = createExecutionOutlet({
      isExecutionEnabled: () => true,
      resumeExecution: (_bind, cursor) =>
        cursor === 'dead'
          ? { kind: 'expired', events: [], headCursor: 'x' }
          : { kind: 'baseline', events: [], headCursor: 'y' },
      dispatchCommand: async (cmd) => {
        calls.push(cmd)
        return { code: 'unreachable', message: 'spy', retryable: false }
      },
    })
    const base = onOutlet.followResume({ workspaceId: 'ws', sessionId: 's1' })
    expect(base).toEqual({ kind: 'baseline', events: [], headCursor: 'y' })
    const expired = onOutlet.followResume({ workspaceId: 'ws', sessionId: 's1' }, 'dead')
    expect(expired).toEqual({ kind: 'expired', events: [], headCursor: 'x' })
    expect(calls.length).toBe(0) // replay 原语不经 dispatch（kernel 缝独立）
  })

  test('wire follow.resume：off = capabilityDisabled；on + 过期 cursor = cursorExpired（§6 基线替换信号）', async () => {
    const offOutlet = createExecutionOutlet({
      dispatchCommand: async () => ({ code: 'unreachable', message: 'spy', retryable: false }),
    })
    const off = await offOutlet.handle({
      ...baseEnvelope, type: 'follow.resume', payload: {},
    } as never)
    expect(off).toMatchObject({ code: 'capabilityDisabled' })

    const onOutlet = createExecutionOutlet({
      isExecutionEnabled: () => true,
      resumeExecution: () => ({ kind: 'expired', events: [], headCursor: 'x' }),
      dispatchCommand: async () => ({ code: 'unreachable', message: 'spy', retryable: false }),
    })
    const expired = await onOutlet.handle({
      ...baseEnvelope, type: 'follow.resume', payload: { cursor: 'gone' },
    } as never)
    expect(expired).toMatchObject({ code: 'cursorExpired' })
  })

  test('S4 修正锚（f4 裁定）：wire follow.resume 命令响应 = 完整三态 ExecutionReplay（与原语同形归一，不截断）', async () => {
    const baselineReplay = { kind: 'baseline', events: [], headCursor: '0000000000000001' } as const
    const deltaReplay = {
      kind: 'delta',
      events: [{
        ...baseEnvelope,
        bind: { ...baseEnvelope.bind, turnId: 'turn-1' },
        type: 'turn.accepted',
        cursor: '0000000000000002',
        payload: { submitId: UUID_B },
      }],
      headCursor: '0000000000000002',
    } as const
    let mode: 'baseline' | 'delta' = 'baseline'
    const outlet = createExecutionOutlet({
      isExecutionEnabled: () => true,
      resumeExecution: () => (mode === 'baseline' ? baselineReplay : deltaReplay),
      dispatchCommand: async () => ({ code: 'unreachable', message: 'spy', retryable: false }),
    })
    // baseline：原样全量返回（events 可空 = 执行流基线为空，内容基线经只读
    // replay 面重读；不因空而落 cursorExpired 兜底）
    const base = await outlet.handle({
      ...baseEnvelope, type: 'follow.resume', payload: {},
    } as never)
    expect(base).toBe(baselineReplay)
    // delta：增量事件序列 + headCursor 原样全量返回（恰一次补齐，不截断 events[0]）
    mode = 'delta'
    const delta = await outlet.handle({
      ...baseEnvelope, type: 'follow.resume', payload: { cursor: '0000000000000001' },
    } as never)
    expect(delta).toBe(deltaReplay)
  })

  test('probe=on 经出口面：capability.probe 返回 on/off + 受支持 v（不经 dispatch）', async () => {
    const calls: unknown[] = []
    const outlet = mkOutlet({
      isExecutionEnabled: () => true,
      dispatchCommand: async (cmd) => {
        calls.push(cmd)
        return { type: 'error', code: 'unreachable', message: 'spy', retryable: false }
      },
    })
    const cap = outlet.probe()
    expect(cap.enabled).toBe(true)
    expect(cap.protocolVersion).toBe('v0')
    expect(calls.length).toBe(0)
  })
})

describe('S2 · 格 C 源级（条件①符号级扫描 + 审计格沿用）', () => {
  test('import 闭包：webExecutionV0.ts import 面 = zod/v4 唯一', () => {
    const s = src('src/kernel/protocol/webExecutionV0.ts')
    const froms = s.match(/from\s+'([^']+)'/g) ?? []
    expect(froms.length).toBeGreaterThan(0)
    for (const f of froms) {
      expect(f).toContain('zod/v4')
    }
  })

  test('import 闭包：executionOutlet.ts 唯一依赖 = webExecutionV0（懒触达·零 engine 导入）', () => {
    const s = src('src/kernel/execution/executionOutlet.ts')
    const froms = s.match(/from\s+'([^']+)'/g) ?? []
    expect(froms.length).toBeGreaterThan(0)
    for (const f of froms) {
      expect(f).toContain('webExecutionV0')
    }
  })

  test('Code-neutral 词汇审计：禁词零命中（沿 webSessionV0 格 C 同法）', () => {
    const forbidden = [
      'atlascode',
      'AtlasCode',
      'tool_use',
      'toolUseResult',
      'Bash',
      'sidechain',
      'compact_boundary',
      'jsonl',
      'Anthropic',
      'Claude',
    ]
    for (const rel of [
      'src/kernel/protocol/webExecutionV0.ts',
      'src/kernel/execution/executionOutlet.ts',
    ]) {
      const s = src(rel)
      for (const w of forbidden) {
        expect(s.includes(w)).toBe(false)
      }
    }
  })

  test('条件①符号级扫描：createExecutionOutlet 单接触点（src 面 = 出口本体 + entry.ts + 组合根助手）', () => {
    const hits = execFileSync(
      'grep',
      ['-rlE', 'createExecutionOutlet|ExecutionOutletOptions', 'src/'],
      { cwd: ROOT },
    )
      .toString()
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
      .sort()
    expect(hits).toEqual([
      'src/atlascode/web/entry.ts',
      'src/kernel/execution/executionComposition.ts',
      'src/kernel/execution/executionOutlet.ts',
    ])
  })

  test('条件①扩腿：createExecutionKernel src 面 = 内核本体 + 壳侧组合根助手（零旁路消费）', () => {
    const hits = execFileSync('grep', ['-rlE', 'createExecutionKernel', 'src/'], {
      cwd: ROOT,
    })
      .toString()
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
      .sort()
    expect(hits).toEqual([
      'src/kernel/execution/executionComposition.ts',
      'src/kernel/execution/executionKernel.ts',
    ])
  })

  test('条件①扩腿：webExecutionV0 协议消费面 = 出口 + 内核三件（零 module-specifier 旁路）', () => {
    const hits = execFileSync('grep', ['-rlE', "webExecutionV0|WebExecutionCommandSchema", 'src/'], {
      cwd: ROOT,
    })
      .toString()
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
      .sort()
    expect(hits).toEqual([
      'src/atlascode/web/entry.ts',
      'src/kernel/execution/executionKernel.ts',
      'src/kernel/execution/executionOutlet.ts',
      'src/kernel/protocol/webExecutionV0.ts',
    ])
  })

  test('§5 纪律：客户端自报 actorId/timestamp 即拒（decide payload strictObject）', () => {
    const parsed = WebExecutionCommandSchema.safeParse({
      ...baseEnvelope,
      bind: { workspaceId: 'ws-1', sessionId: 'sess-1', turnId: 'turn-1' },
      type: 'approval.decide',
      payload: { approvalId: UUID_C, decision: 'approved', actorId: 'spoofed' },
    })
    expect(parsed.success).toBe(false)
  })

  test('entry.ts 扩具名导出（§1 定名）：出口 factory + 型 + 协议常量/schema', () => {
    const s = src('src/atlascode/web/entry.ts')
    for (const name of [
      'createExecutionOutlet',
      'type ExecutionOutlet',
      'type ExecutionOutletOptions',
      'EXECUTION_PROTOCOL_VERSION',
      'EXECUTION_SCHEMA_VERSION',
      'WebExecutionCommandSchema',
      'WebExecutionEventSchema',
      'WebExecutionErrorSchema',
    ]) {
      expect(s.includes(name)).toBe(true)
    }
  })

  test('S4 pack 面隔离：runtimeEntry 导出名 ⊆ entry 导出名（漂移守卫·零 zod pack 合同）', () => {
    const re = src('src/atlascode/web/runtimeEntry.ts')
    const en = src('src/atlascode/web/entry.ts')
    // runtimeEntry 每个 from './x' 相对 specifier 必须也被 entry 同样消费
    // （面漂移 = pack 产物与公开出口分叉）
    const specifiers = [...re.matchAll(/from\s+'(\.\.?\/[^']+)'/g)].map((m) => m[1])
    expect(specifiers.length).toBeGreaterThan(0)
    for (const sp of specifiers) {
      expect(en.includes(`from '${sp}'`)).toBe(true)
    }
    // pack 入口零执行面（webExecutionV0 / executionOutlet 不入 pack 加载图）
    expect(re.includes('webExecutionV0')).toBe(false)
    expect(re.includes('executionOutlet')).toBe(false)
    // package.json pack 构建入口指向 runtimeEntry（零 zod 契约载体）
    const pkg = src('package.json')
    expect(pkg.includes('build src/atlascode/web/runtimeEntry.ts')).toBe(true)
  })
})
