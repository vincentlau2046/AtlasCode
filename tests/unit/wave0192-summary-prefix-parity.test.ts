/**
 * wave0192 W-opt-3：C-1 KV-cache 保真摘要——三车道摘要请求 system/tools
 * 与主车道同源对齐（工单 docs/2026-11-07-p0-wave-0192-ticket.md §1；
 * f4 锁面批注：单测断言锚「同源」非字面拷贝——同一变量/同一构造源，防
 * 复制粘贴型假对齐；wire 字节级由 DC-1 复跑兜底）。
 *
 * 现状 RED 锚（工单 §0）：
 *   C1-1 print.ts summarize chat —— 无 systemPrompt 无 tools
 *   C1-2 engine loopDeps reactiveCompact —— 无 systemPrompt 无 tools
 *   C1-3 TUI compact.ts 流式兜底支 —— system = 摘要专用串 + tools 降采样集
 *   （TUI 默认 cache-share fork 支经 cacheSafeParams 本就主 system 同源；
 *     本波对齐对象 = 流式兜底支，同源锚 = cacheSafeParams + 主车道构造器）
 *
 * 机制面（f4 定谳 2026-11-07）：buildOpenAIParams 对传入 systemPrompt
 * unshift({role:'system'}) 到 messages[0]（params.ts:328）——摘要请求修法 =
 * 同源传 systemPrompt + tools 经同一 chat() 路径，wire 现形自动恒同。
 * 段 A 锁该投影机制（C1-4 缺省面基础）；段 B 锁三车道同源。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { asSystemPrompt } from '../../src/tui/utils/systemPromptType'
import { buildOpenAIParams } from '../../src/modelprovider'

const read = (rel: string): string =>
  readFileSync(join(import.meta.dir, '..', '..', rel), 'utf8')

describe('wave0192 段 A：buildOpenAIParams system/tools 投影机制（f4 定谳 unshift 面）', () => {
  const fakeTool = {
    name: 'Read',
    description: 'read a file',
    inputSchema: { type: 'object', properties: {} },
  } as unknown as Parameters<typeof buildOpenAIParams>[0]['tools'][number]

  test('systemPrompt 在场 → wire messages[0] = role system（内容 = systemPrompt join）', async () => {
    const params = await buildOpenAIParams({
      messages: [
        { role: 'user', content: 'hello' },
      ] as Parameters<typeof buildOpenAIParams>[0]['messages'],
      systemPrompt: asSystemPrompt(['You are AtlasCode.', 'extra block']),
      options: { model: 'test-model' },
    })
    expect(params.messages[0]).toEqual({
      role: 'system',
      content: 'You are AtlasCode.\nextra block',
    })
    expect(params.messages[1]).toEqual({ role: 'user', content: 'hello' })
  })

  test('systemPrompt 空（缺省面 C1-4）→ 无 system 消息注入', async () => {
    const params = await buildOpenAIParams({
      messages: [
        { role: 'user', content: 'hello' },
      ] as Parameters<typeof buildOpenAIParams>[0]['messages'],
      systemPrompt: asSystemPrompt([]),
      options: { model: 'test-model' },
    })
    expect(params.messages[0]).toEqual({ role: 'user', content: 'hello' })
    expect(params.messages.some(m => m.role === 'system')).toBe(false)
  })

  test('tools 在场 → params.tools 逐件投影（name 恒同）；缺省 → tools 键不出现', async () => {
    const withTools = await buildOpenAIParams({
      messages: [
        { role: 'user', content: 'hi' },
      ] as Parameters<typeof buildOpenAIParams>[0]['messages'],
      systemPrompt: asSystemPrompt([]),
      tools: [fakeTool],
      options: { model: 'test-model' },
    })
    expect(Array.isArray(withTools.tools)).toBe(true)
    expect(
      (withTools.tools as { function: { name: string } }[]).map(
        t => t.function.name,
      ),
    ).toEqual(['Read'])

    const noTools = await buildOpenAIParams({
      messages: [
        { role: 'user', content: 'hi' },
      ] as Parameters<typeof buildOpenAIParams>[0]['messages'],
      systemPrompt: asSystemPrompt([]),
      options: { model: 'test-model' },
    })
    expect(noTools.tools).toBeUndefined()
  })
})

describe('wave0192 段 B：三车道摘要请求 system/tools 主车道同源锚（RED→GREEN）', () => {
  test('C1-1 print 车道：summarize 补 systemPrompt: bundle.deps.systemPrompt + 主车道同源 tools 变量', () => {
    const src = read('src/cli/print.ts')
    // 同源锚①：主车道 tools = bundle 解构的同一变量（createAgentLoopDeps
    // 返回面 { toolPermissionContext, tools, deps, warnings }）
    expect(src).toContain(
      'const { toolPermissionContext: initialTpc, tools, warnings } = bundle',
    )
    // summarize 体内：systemPrompt = bundle.deps.systemPrompt（主车道 deps
    // 同源）；tools = 同一解构变量（主车道 queryAgentLoop 同参源）
    const summarizeBlock = src.match(
      /summarize:\s*async\s*\(msgs,\s*prompt\)\s*=>\s*\{[\s\S]*?\n    \},/,
    )
    expect(summarizeBlock).not.toBeNull()
    const body = summarizeBlock![0]
    expect(body).toContain('systemPrompt: bundle.deps.systemPrompt')
    expect(body).toMatch(/\btools,\s*\n/)
  })

  test('C1-2 engine 窄体：reactiveCompact summarize 补 systemPrompt: config.systemPrompt + 主车道同形 tools 门', () => {
    const src = read('src/engine/loopDeps.ts')
    // 同源锚：reactiveCompact 槽体（同函数作用域 tools = getTools 主池、
    // config.systemPrompt = deps 主车道透传源）
    const block = src.match(
      /reactiveCompact:\s*async\s*\(\{\s*messages\s*\}\)\s*=>\s*\{[\s\S]*?\n    \},/,
    )
    expect(block).not.toBeNull()
    const body = block![0]
    expect(body).toContain('systemPrompt: config.systemPrompt')
    // 主车道同形门（loop.ts:502 `tools: tools.length > 0 ? tools : undefined`）
    expect(body).toContain('tools: tools.length > 0 ? tools : undefined')
  })

  test('C1-3 TUI 流式兜底支：专用串裁除 + system 经 cacheSafeParams 主源同构造 + tools 全池同源', () => {
    const src = read('src/tui/contextBodies/compact.ts')
    // 摘要专用 system 串裁除（f4 锁面裁定 ④：inline 字面无其他消费方）
    expect(src).not.toContain(
      'You are a helpful AI assistant tasked with summarizing conversations.',
    )
    // system 同源锚：cacheSafeParams.systemPrompt（fork 支同源变量）+
    // 主车道同一构造器 appendSystemContext（agentLoopDeps:352 同形）
    expect(src).toMatch(
      /systemPrompt:\s*asSystemPrompt\(\s*appendSystemContext\(\s*cacheSafeParams\.systemPrompt/,
    )
    // tools 全池同源锚（f4 裁 A：context.options.tools = 主车道同源，
    // 降采样特判裁除）
    expect(src).toMatch(/tools:\s*context\.options\.tools/)
  })
})
