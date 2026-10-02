/**
 * W3-3b（§8.74.15 ①）：REPL 活链路 → engine loop 活态装配判别测试
 * （buildReplLoopParams 面映射，非 tautology——断言槽位真透传 / 面真映射）。
 *
 *   R-1 模型车道：mainLoopModel → role（modelToRole）+ sessionModel pin
 *       （会话主模型优先，getRoleModels 池头语义透传）。
 *   R-2 systemPrompt 面：asSystemPrompt(appendSystemContext(systemPrompt,
 *       systemContext))——systemContext 键值真嵌入（旧 loop.ts:442-444 逐字）。
 *   R-3 无轮次上限：args.context.unboundedTurns=true（旧 REPL 无 maxTurns 门
 *       保真；engine 缺省 20 轮兜底仅 headless）。
 *   R-4 装配槽位：checkPermission（gate 可调用）/ hooks（createLoopHooks 产物）
 *       / transcript（record + recordContentReplacement 双写面）/ effortValue
 *       （EffortValue→string）/ tools 透传。
 *   R-6 工具调用 context 桥：deps.toolContext = 活 toolUseContext 同引用（TUI
 *       活 ToolUseContext 入 engine pipeline，getAppState 族崩溃面单点修复）。
 *
 * 运行口径注：prependUserContext 在 NODE_ENV=test 早退（= 消息面透传，R-5
 * 断言 test-env 保真）；autoCompact 面（contextWindow 经 resolveModel 缺省
 * 回落）与 modelProvider 单例读取零网络（unit 零磁盘零网络，标准 bun
 * --isolate）。userContext 前插真行为（非 test-env）归 func/func-live 层。
 */
import { describe, test, expect } from 'bun:test'
import {
  buildReplLoopParams,
  type ReplLoopMaterials,
} from '../../src/tui/replLoopDeps'
import type { Tools } from '../../src/shared'
import type { ToolUseContext } from '../../src/tui/Tool'
import type { CanUseToolFn } from '../../src/tui/hooks/useCanUseTool'

const fakeCanUseTool = (() => Promise.resolve({ behavior: 'allow' })) as unknown as CanUseToolFn
const fakeToolUseContext = { getAppState: () => ({ toolPermissionContext: {} }) } as unknown as ToolUseContext

function makeMaterials(over: Partial<ReplLoopMaterials> = {}): ReplLoopMaterials {
  return {
    messages: [{ role: 'user', content: 'hi', uuid: 'm1' }],
    userContext: { project: 'demo' },
    systemPrompt: ['BASE-PROMPT'] as unknown as ReplLoopMaterials['systemPrompt'],
    systemContext: { cwd: '/repo', git: 'main' },
    tools: [] as unknown as Tools,
    mainLoopModel: 'Qwen38-27B-TXT',
    toolPermissionContext: { mode: 'default' },
    canUseTool: fakeCanUseTool,
    toolUseContext: fakeToolUseContext,
    querySource: 'repl_main_thread',
    ...over,
  }
}

describe('buildReplLoopParams（W3-3b §8.74.15 ①）', () => {
  test('R-1 模型车道：role + sessionModel pin 透传', () => {
    const { deps } = buildReplLoopParams(makeMaterials({ mainLoopModel: 'Qwen38-27B-TXT' }))
    expect(deps.sessionModel).toBe('Qwen38-27B-TXT')
    expect(typeof deps.role).toBe('string')
    // modelToRole 回落 'small'（Qwen 非角色池头 = 归 small 车道）
    expect(deps.role).toBe('small')
  })

  test('R-2 systemPrompt 面：systemContext 键值真嵌入', () => {
    const { deps } = buildReplLoopParams(
      makeMaterials({ systemContext: { cwd: '/repo', git: 'main' } }),
    )
    const prompt = deps.systemPrompt as readonly string[]
    expect(Array.isArray(prompt)).toBe(true)
    const joined = (prompt as readonly string[]).join('\n')
    expect(joined).toContain('BASE-PROMPT')
    expect(joined).toContain('cwd: /repo')
    expect(joined).toContain('git: main')
  })

  test('R-3 无轮次上限：unboundedTurns=true + autoCompact 面在场', () => {
    const { args } = buildReplLoopParams(makeMaterials())
    expect(args.context?.unboundedTurns).toBe(true)
    expect(args.context?.autoCompact).toBeDefined()
    expect(typeof args.context?.autoCompact?.compact).toBe('function')
    // contextWindow 缺省回落（无配置态 resolveModel 未命中 → HARD_DEFAULT）
    expect(args.context?.autoCompact?.contextWindow).toBeGreaterThan(0)
  })

  test('R-4 装配槽位：gate / hooks / transcript / effortValue / tools', () => {
    const fakeTools = [{ name: 'Read' }] as unknown as Tools
    const { deps, args } = buildReplLoopParams(
      makeMaterials({ tools: fakeTools, effort: 'high' }),
    )
    expect(typeof deps.checkPermission).toBe('function')
    expect(deps.hooks).toBeDefined()
    expect(typeof deps.hooks?.toolHooks?.preToolUse).toBe('function')
    expect(deps.transcript).toBeDefined()
    expect(typeof deps.transcript?.record).toBe('function')
    expect(typeof deps.transcript?.recordContentReplacement).toBe('function')
    expect(deps.effortValue).toBe('high')
    // tools 透传到 args（模型可见池）
    expect(args.tools).toBe(fakeTools)
  })

  test('R-4b effort 缺省 = 未设（窄 spine 模型缺省面）', () => {
    const { deps } = buildReplLoopParams(makeMaterials())
    expect(deps.effortValue).toBeUndefined()
  })

  test('R-5 消息面：test-env 下 userContext 前插早退（消息透传保真）', () => {
    const messages = [{ role: 'user', content: 'hi', uuid: 'm1' }]
    const { args } = buildReplLoopParams(makeMaterials({ messages, userContext: { project: 'demo' } }))
    // NODE_ENV=test → prependUserContext 早退（不前插 system-reminder）
    expect(args.messages).toHaveLength(1)
    expect((args.messages[0] as { uuid?: string }).uuid).toBe('m1')
  })

  test('R-6 工具调用 context 桥：deps.toolContext = 活 toolUseContext（同引用，非拷贝）', () => {
    const { deps } = buildReplLoopParams(makeMaterials())
    // R6（P0）：TUI 活 ToolUseContext 入 engine pipeline（tool.call/validateInput
    // 第 2 参全活面）；断言同引用 = 活态桥（非装配时快照拷贝）
    expect(deps.toolContext).toBe(fakeToolUseContext)
  })
})
