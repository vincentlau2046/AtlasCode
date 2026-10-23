/**
 * 0.1.80 V3-1 K1-F③④ 判别锁 — per-agent 压缩窗位覆写 + 子代理独立窗位
 *
 * K1-F③ (@296)：subagent frontmatter/JSON `autoCompactWindow`（tokens 绝对
 * 值）全链透传——解析面（tui twin loadAgentsDir）+ 装配面（buildAgentLoopParams
 * 优先级链 env > frontmatter > settings 档位：env = 操作员硬杠杆保持最高；
 * per-agent 最具体声明压过全局档位；均缺省 = 修前 merged 档位面精确同值，
 * 零回归）。
 *
 * K1-F④ (@296)：子代理独立窗位（可早于主会话压缩）双面现状锚——
 *   (a) TUI 车道：runAgent → buildAgentLoopParams 无条件装配
 *       args.context.autoCompact，mainLoopModel 缺省 = 子代理自己的模型
 *       （toolUseContext.options.mainLoopModel，非主会话模型）→ 窗位按
 *       子代理模型独立解析；frontmatter 窗位覆写生效（长任务 agent 提前压缩）。
 *   (b) engine/headless 车道：runAgent 窄 spine 零 context 注入（headless
 *       子代理永不自动压缩）——源码级锚。engine twin loadAgentsDir 同裁定
 *       不加 autoCompactWindow 字段（声明了却不消费 = 死接缝，T-5b 纪律）。
 *
 * 判别锚（修前红）：③ b（frontmatter > settings——修前装配体 windowOverride
 * 恒 = merged 档位面，frontmatter 值被吞）。settings 档位经 setSessionSettingsCache
 * 注入（getSettingsWithErrors 缓存短路 → 本文件零磁盘）；env 经 process.env 存还。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildAgentLoopParams,
  type AgentLoopMaterials,
} from '../../src/tui/agentLoopDeps'
import {
  parseAgentFromJson,
  parseAgentFromMarkdown,
} from '../../src/tui/tools/AgentTool/loadAgentsDir'
import {
  setSessionSettingsCache,
  resetSettingsCache,
} from '../../src/tui/utils/settings/settingsCache'
import type { Tools } from '../../src/shared'
import type { ToolUseContext } from '../../src/tui/Tool'
import type { CanUseToolFn } from '../../src/tui/hooks/useCanUseTool'

// ── 脚手架（repl-loop-deps.test.ts 同款 fake 材料 + env/settings 注入）──────

const fakeCanUseTool = (() =>
  Promise.resolve({ behavior: 'allow' })) as unknown as CanUseToolFn

const SUBAGENT_MODEL = 'subagent-model-k1f'

const fakeToolUseContext = {
  getAppState: () => ({ toolPermissionContext: {} }),
  options: { mainLoopModel: SUBAGENT_MODEL },
} as unknown as ToolUseContext

function makeMaterials(
  over: Partial<AgentLoopMaterials> = {},
): AgentLoopMaterials {
  return {
    messages: [{ role: 'user', content: 'hi', uuid: 'm1' }],
    userContext: {},
    systemPrompt: ['BASE-PROMPT'] as unknown as AgentLoopMaterials['systemPrompt'],
    systemContext: {},
    tools: [] as unknown as Tools,
    toolPermissionContext: { mode: 'default' },
    canUseTool: fakeCanUseTool,
    toolUseContext: fakeToolUseContext,
    querySource: 'agent:k1f-test',
    ...over,
  }
}

const TRACKED_ENV_KEYS = [
  'ATLAS_AUTO_COMPACT_WINDOW',
  'ATLAS_AUTOCOMPACT_PCT_OVERRIDE',
  'DISABLE_COMPACT',
  'DISABLE_AUTO_COMPACT',
]

let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv = {}
  for (const k of TRACKED_ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  // settings 快照注入（getSettingsWithErrors 缓存短路 → 本文件零磁盘）
  setSessionSettingsCache({ settings: {}, errors: [] })
})

afterEach(() => {
  for (const k of TRACKED_ENV_KEYS) {
    if (savedEnv[k] === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = savedEnv[k]
    }
  }
  resetSettingsCache()
})

// ── K1-F③ 装配面：windowOverride 优先级链 env > frontmatter > settings 档位 ──

describe('K1-F③ buildAgentLoopParams windowOverride 优先级链', () => {
  test('a) env > frontmatter（ATLAS_AUTO_COMPACT_WINDOW 压 frontmatter 覆写）', () => {
    process.env.ATLAS_AUTO_COMPACT_WINDOW = '111000'
    const { args } = buildAgentLoopParams(
      makeMaterials({ autoCompactWindowOverride: 222_000 }),
    )
    expect(args.context?.autoCompact?.windowOverride).toBe(111_000)
  })

  test('b) frontmatter > settings 档位（per-agent 声明压过全局档位；修前红：修前装配体吞 frontmatter 值恒回 settings 档）', () => {
    setSessionSettingsCache({
      settings: { autoCompactWindow: { kind: 'window', tokens: 128_000 } },
      errors: [],
    })
    const { args } = buildAgentLoopParams(
      makeMaterials({ autoCompactWindowOverride: 222_000 }),
    )
    expect(args.context?.autoCompact?.windowOverride).toBe(222_000)
  })

  test('c) frontmatter 未设 + settings 档位 128k → merged 档位面精确同值（零回归锚，修前同绿）', () => {
    setSessionSettingsCache({
      settings: { autoCompactWindow: { kind: 'window', tokens: 128_000 } },
      errors: [],
    })
    const { args } = buildAgentLoopParams(makeMaterials())
    expect(args.context?.autoCompact?.windowOverride).toBe(128_000)
  })

  test('d) 全未设 → windowOverride undefined（修前恒等面）', () => {
    const { args } = buildAgentLoopParams(makeMaterials())
    expect(args.context?.autoCompact?.windowOverride).toBeUndefined()
  })
})

// ── K1-F③ 解析面：tui twin loadAgentsDir frontmatter/JSON 双形 ──────────────

describe('K1-F③ autoCompactWindow 解析面（loadAgentsDir tui twin）', () => {
  const md = (frontmatter: Record<string, unknown>) =>
    parseAgentFromMarkdown(
      '/mock-home/agents/demo.md',
      '/mock-home/agents',
      frontmatter,
      'You are a demo agent.',
      'userSettings',
    )

  test('e) markdown frontmatter 数字 150000 → agentDef.autoCompactWindow 透传', () => {
    const a = md({
      name: 'demo',
      description: 'd',
      autoCompactWindow: 150_000,
    })!
    expect(a.agentType).toBe('demo')
    expect(a.autoCompactWindow).toBe(150_000)
  })

  test('f) 字符串形 "150000" 同样有效（YAML 宽容面，maxTurns 同款 parser）', () => {
    const a = md({
      name: 'demo',
      description: 'd',
      autoCompactWindow: '150000',
    })!
    expect(a.autoCompactWindow).toBe(150_000)
  })

  test('g) 无效值（"abc" / 0 / -5 / 1.5）→ undefined（agent 仍可用，logForDebugging 面）', () => {
    for (const bad of ['abc', 0, -5, 1.5]) {
      const a = md({
        name: 'demo',
        description: 'd',
        autoCompactWindow: bad,
      })!
      expect(a).not.toBeNull()
      expect(a.autoCompactWindow).toBeUndefined()
    }
  })

  test('h) 未声明 → undefined（零回归：既有 agent 定义不受影响）', () => {
    const a = md({ name: 'demo', description: 'd' })!
    expect(a.autoCompactWindow).toBeUndefined()
  })

  test('i) JSON 定义透传（--agents 面同字段；缺省不带键）', () => {
    const withWindow = parseAgentFromJson('demo', {
      description: 'd',
      prompt: 'You are a demo agent.',
      autoCompactWindow: 99_000,
    })!
    expect(withWindow.autoCompactWindow).toBe(99_000)
    const without = parseAgentFromJson('demo2', {
      description: 'd',
      prompt: 'You are a demo agent.',
    })!
    expect(without.autoCompactWindow).toBeUndefined()
  })
})

// ── K1-F④ 子代理独立窗位（双面现状锚）──────────────────────────────────────

describe('K1-F④ 子代理独立窗位（双面现状锚）', () => {
  test('a) TUI 车道：autoCompact 无条件装配 + 窗位按子代理自己模型独立 + frontmatter 覆写生效', () => {
    const { deps, args } = buildAgentLoopParams(
      makeMaterials({ autoCompactWindowOverride: 100_000 }),
    )
    // mainLoopModel 缺省 = toolUseContext.options.mainLoopModel（子代理自己的
    // 模型，非主会话模型）→ 窗位按子代理模型独立解析（可早于主会话压缩）
    expect(deps.sessionModel).toBe(SUBAGENT_MODEL)
    // autoCompact 无条件入 args.context（TUI 子代理车道 = 独立压缩面）
    expect(args.context?.autoCompact).toBeDefined()
    expect(args.context?.autoCompact?.contextWindow).toBeGreaterThan(0)
    // frontmatter 窗位覆写生效（长任务 agent 声明 100k → 提前压缩）
    expect(args.context?.autoCompact?.windowOverride).toBe(100_000)
  })

  test('b) engine/headless 车道：runAgent 窄 spine 零 context 注入（源码锚——headless 子代理永不自动压缩；若未来有意给 engine 车道接 autoCompact，须有意识更新本锚 + 判别测试）', () => {
    const src = readFileSync(
      join(import.meta.dir, '../../src/engine/tools/agent/runAgent.ts'),
      'utf8',
    )
    const idx = src.indexOf('await queryAgentLoop(')
    expect(idx).toBeGreaterThan(0)
    // call site 200 字窗内零 context 注入 = 窄 spine 现状锚
    const callSite = src.slice(idx, idx + 200)
    expect(callSite).not.toContain('context')
  })
})
