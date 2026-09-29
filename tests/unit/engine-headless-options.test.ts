/**
 * D-5b（S-4，§8.73.2）headless 高频 5 选项 + --effort 真消费回填断言
 * （F-S2-2 · F-S2-5）。
 *
 * 目的：证「三段回填」非空洞 H6——
 *   Stage 2（buildHeadlessOptions 映射面）：commander 平铺 options → HeadlessOptions
 *     5 高频字段 + effort 真映射（jsonSchema 字符串→对象 / thinkingConfig 派生 /
 *     -file 读支 / 缺省不泄漏）。
 *   Stage 3（引擎面真消费）：queryOneRound 逐槽透传 AgentLoopDeps 5 槽 + effortValue
 *     进 modelProvider.chat（假 provider 捕获 args 断言，非接口声明假绿）；
 *     getRoleModels 第 3 参 fallbackModel 追加末位（role 池最低优先）。
 *   F-S2-5（fixture 接线）：toResponseFormat json_schema → OpenAI response_format
 *     形状 + tests/fixtures/baseline/json_schema_response.json（旧仓 live gateway
 *     录制的 orphan 件）接线为结构化输出参照端（text 块 JSON 对象，非裸文本）。
 *
 * 纪律（同 D-4b）：本测试 = 真执行证明（非「已注册未启用」死体）。零模型 /
 * 零网络（queryOneRound 走假 provider）/ 零磁盘（仅读仓内 fixture）。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { queryOneRound, type AgentLoopDeps } from '../../src/engine'
import { buildHeadlessOptions } from '../../src/cli'
import { getRoleModels, toResponseFormat } from '../../src/modelprovider'
import { asSystemPrompt } from '../../src/shared'

// ── Stage 3：queryOneRound 逐槽透传（假 provider 捕获 chat args）──────────
describe('D-5b Stage 3 · queryOneRound 引擎面真消费（5 槽 + effortValue）', () => {
  const captured: any[] = []
  const fakeProvider = {
    chat: async (args: any) => {
      captured.push(args)
      return {
        type: 'assistant',
        uuid: 'u-1',
        timestamp: new Date().toISOString(),
        message: {
          id: 'm-1',
          model: 'fake',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }
    },
  } as unknown as AgentLoopDeps['modelProvider']

  test('deps 5 槽 + effortValue 全透传进 modelProvider.chat（非接口声明）', async () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    }
    const deps: AgentLoopDeps = {
      modelProvider: fakeProvider,
      role: 'premium',
      systemPrompt: asSystemPrompt(['you are a gelu operator']),
      thinkingConfig: { type: 'enabled', budgetTokens: 4096 },
      responseFormat: toResponseFormat({ type: 'json_schema', schema }),
      effortValue: 'high',
      fallbackModel: 'openai/backup',
    }
    const result = await queryOneRound(
      deps,
      [],
      [{ type: 'user', role: 'user', content: 'hi' } as never],
    )
    // loop 真跑（assistant 无 tool_use → 单轮终止）
    expect(result.stopReason).toBe('end_turn')
    expect(captured.length).toBe(1)
    const args = captured[0]
    // 5 槽逐字段命中（H6 防空洞：证明 plumb 进引擎链，非仅 interface 加字段）
    expect(args.thinkingConfig).toEqual({ type: 'enabled', budgetTokens: 4096 })
    expect(args.responseFormat?.type).toBe('json_schema')
    expect(args.responseFormat?.json_schema?.schema).toEqual(schema)
    expect(args.fallbackModel).toBe('openai/backup')
    expect(args.options?.effortValue).toBe('high')
    expect(Array.from(args.systemPrompt as readonly string[])).toEqual([
      'you are a gelu operator',
    ])
  })

  test('deps 5 槽全缺省 → chat args 字段 undefined（窄 spine 缺省行为不变）', async () => {
    captured.length = 0
    const deps: AgentLoopDeps = {
      modelProvider: fakeProvider,
      role: 'premium',
    }
    await queryOneRound(
      deps,
      [],
      [{ type: 'user', role: 'user', content: 'hi' } as never],
    )
    const args = captured[0]
    expect(args.systemPrompt).toBeUndefined()
    expect(args.thinkingConfig).toBeUndefined()
    expect(args.responseFormat).toBeUndefined()
    expect(args.fallbackModel).toBeUndefined()
    // effortValue 未设 → options 槽 undefined（buildOpenAIParams 回落模型缺省）
    expect(args.options).toBeUndefined()
  })
})

// ── Stage 3：getRoleModels 第 3 参 fallbackModel 追加末位 ────────────────
describe('D-5b Stage 3 · getRoleModels fallbackModel 末位 fallback', () => {
  test('第 3 参追加为末位（最低优先）；2 参调用不含 fallback（唯一来源）', () => {
    const saved = process.env['ATLAS_PREMIUM_MODEL']
    delete process.env['ATLAS_PREMIUM_MODEL']
    try {
      const refs = getRoleModels('premium', undefined, 'openai/backup')
      expect(refs.length).toBeGreaterThanOrEqual(1)
      // fallbackModel 恒为末位（横向 fallback 最低优先）
      expect(refs[refs.length - 1]).toBe('openai/backup')
      // 2 参（无 fallback）不含该 ref → 证明第 3 参是其唯一来源
      const noFb = getRoleModels('premium', undefined)
      expect(noFb).not.toContain('openai/backup')
    } finally {
      if (saved !== undefined) process.env['ATLAS_PREMIUM_MODEL'] = saved
    }
  })
})

// ── Stage 2：buildHeadlessOptions 5 高频选项 + effort 映射面 ─────────────
describe('D-5b Stage 2 · buildHeadlessOptions 映射面', () => {
  test('5 选项 + effort 全映射（jsonSchema 字符串→对象 / thinking enabled→adaptive）', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    }
    const opts = buildHeadlessOptions({
      systemPrompt: 'SYS',
      appendSystemPrompt: 'APPEND',
      fallbackModel: 'openai/backup',
      jsonSchema: JSON.stringify(schema),
      thinking: 'enabled',
      maxThinkingTokens: 4096,
      effort: 'high',
    })
    expect(opts.systemPrompt).toBe('SYS')
    expect(opts.appendSystemPrompt).toBe('APPEND')
    expect(opts.fallbackModel).toBe('openai/backup')
    expect(opts.jsonSchema).toEqual(schema)
    // 旧仓 main.tsx L2051 语义：--thinking enabled ≡ adaptive（budget 仅在
    // 未设 --thinking 时经 --max-thinking-tokens 生效，此处 --thinking 优先）
    expect(opts.thinkingConfig).toEqual({ type: 'adaptive' })
    expect(opts.effort).toBe('high')
  })

  test('thinking 缺省 + maxThinkingTokens>0 → enabled+budget（旧仓 L2063-2069）', () => {
    const opts = buildHeadlessOptions({ maxThinkingTokens: 2048 })
    expect(opts.thinkingConfig).toEqual({ type: 'enabled', budgetTokens: 2048 })
  })

  test('thinking disabled → disabled；maxThinkingTokens=0 → disabled', () => {
    expect(
      buildHeadlessOptions({ thinking: 'disabled' }).thinkingConfig,
    ).toEqual({ type: 'disabled' })
    expect(
      buildHeadlessOptions({ maxThinkingTokens: 0 }).thinkingConfig,
    ).toEqual({ type: 'disabled' })
  })

  test('5 选项 + effort 全缺 → 6 字段 undefined（窄 spine 缺省不泄漏）', () => {
    const opts = buildHeadlessOptions({})
    expect(opts.systemPrompt).toBeUndefined()
    expect(opts.appendSystemPrompt).toBeUndefined()
    expect(opts.fallbackModel).toBeUndefined()
    expect(opts.jsonSchema).toBeUndefined()
    expect(opts.thinkingConfig).toBeUndefined()
    expect(opts.effort).toBeUndefined()
  })
})

// ── F-S2-5：toResponseFormat + json_schema_response.json fixture 接线 ────
describe('D-5b F-S2-5 · 结构化输出 response_format + fixture 参照端', () => {
  test('toResponseFormat json_schema → OpenAI response_format 形状', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    }
    const rf = toResponseFormat({ type: 'json_schema', schema })
    expect(rf.type).toBe('json_schema')
    expect(rf.json_schema.name).toBe('output')
    expect(rf.json_schema.strict).toBe(true)
    expect(rf.json_schema.schema).toEqual(schema)
    // json_object 支 + 空支（toResponseFormat 全分支）
    expect(toResponseFormat({ type: 'json_object' })).toEqual({
      type: 'json_object',
    })
    expect(toResponseFormat(undefined)).toBeUndefined()
  })

  test('json_schema_response.json（orphan fixture）接线为结构化输出参照端', () => {
    const raw = readFileSync(
      new URL(
        '../fixtures/baseline/json_schema_response.json',
        import.meta.url,
      ),
      'utf8',
    )
    const fixture = JSON.parse(raw)
    // 旧仓 live gateway 录制：callModel()/modelProvider.chat() 完整产出。
    // 结构化输出断言 = assistant content 的 text 块是 JSON 对象字符串（非裸文本）。
    const textBlock = fixture.results.message.content.find(
      (b: { type?: string }) => b.type === 'text',
    )
    expect(textBlock).toBeDefined()
    const structured = JSON.parse(textBlock.text)
    expect(structured).toHaveProperty('name')
  })
})
