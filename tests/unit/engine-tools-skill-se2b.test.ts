/**
 * engine/tools/skill S-E2b（§8.67 D 波 SkillTool 本体子波）unit 层
 * （零盘零模型）：SkillTool 对象面 + JSON schema 面 + validateInput 4
 * 码面 + checkPermissions 权限面（TPC fixture：deny / allow 精确 /
 * allow 前缀 / safe-properties auto-allow / 非安全属性 ask suggestions
 * + metadata 双态）+ call inline 路径（processPromptSlashCommand 真链
 * + newMessages 过滤/打标）+ contextModifier TPC Set-union + model
 * override + call fork 路径（真 runAgent + fake provider）+
 * mapToolResult 双支 + renderToolUseMessage 字符串面 3 态 + prompt
 * 模板面 + 命令预算面（getCharBudget / formatCommandsWithinBudget
 * 纯函数）。
 *
 * 隔离纪律（send-message S-E2 unit 先例 + engine-agent-tool.test.ts
 * fake provider 先例）：
 *   - ATLAS_CONFIG_DIR=/mock-home 防御戳（不存在目录，技能目录扫描
 *     ENOENT → 空，零真实盘）；
 *   - 命令池 = registerBundledSkill 内存注入 + beforeEach
 *     clearBundledSkills/clearCommandsCache 全清（getCommands =
 *     bundled + skillDir〔防御戳空〕+ BUILT_IN〔空集，TUI 波前向接缝〕
 *     + dynamic〔本文件 0 注册〕）；
 *   - ATLAS_COORDINATOR_MODE / FEATURE_COORDINATOR_MODE 清除
 *     （isCoordinatorMode false → inline 走普通支，非 coordinator
 *     摘要支）；
 *   - validateInput 码 5（type !== 'prompt'）= 新 Command prompt
 *     单形死支（skillTool.ts delta ⑭ 登记），不造不可达断言。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  CHARS_PER_TOKEN,
  DEFAULT_CHAR_BUDGET,
  SKILL_BUDGET_CONTEXT_PERCENT,
  SKILL_TOOL_INPUT_SCHEMA,
  SkillTool,
  clearPromptCache,
  formatCommandsWithinBudget,
  getCharBudget,
  getSkillPrompt,
  type SkillToolInput,
} from '../../src/engine/tools'
import {
  clearBundledSkills,
  clearCommandsCache,
  getBundledSkills,
  registerBundledSkill,
  type Command,
} from '../../src/engine/skill'
import type {
  AssistantMessage,
  PermissionResult,
  ToolPermissionContext,
} from '../../src/shared'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'

// ── fake LLM（可脚本 + 记录每次 chat 的 role；ModelProvider 接口替身，
// 非 mock transport，engine-agent-tool.test.ts 先例逐字）──
interface ScriptStep {
  content: unknown[]
  stopReason?: string
}
function fakeProvider(steps: ScriptStep[]): {
  provider: ModelProvider
  roles: ModelRole[]
} {
  let i = 0
  const roles: ModelRole[] = []
  const unused = async () => {
    throw new Error('fake ModelProvider: 方法未被消费')
  }
  const provider = {
    chat: async (args: { role: ModelRole }) => {
      roles.push(args.role)
      const step = steps[Math.min(i, steps.length - 1)]
      i++
      return {
        type: 'assistant',
        uuid: 'u' + i,
        timestamp: '2026-09-28T00:00:00Z',
        message: {
          id: 'm' + i,
          model: 'fake',
          role: 'assistant',
          content: step.content,
          stop_reason: step.stopReason ?? 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }
    },
    chatStream: unused as unknown as ModelProvider['chatStream'],
    healthCheck: unused as unknown as ModelProvider['healthCheck'],
    countTokens: unused as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: unused as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: unused as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
  return { provider, roles }
}

/** 父消息（tool_use 块携带 id，供 newMessages sourceToolUseID 打标）。 */
function makeParentMsg(): AssistantMessage {
  return {
    type: 'assistant',
    uuid: 'uuid-p',
    timestamp: '2026-09-28T00:00:00Z',
    message: {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'toolu_skill_1', name: 'Skill', input: {} },
      ],
    },
  } as unknown as AssistantMessage
}

/** checkPermissions 上下文（窄 TPC 切片，webFetchTool ctx 先例同形）。 */
function permCtx(
  overrides?: { allow?: string[]; deny?: string[] },
): unknown {
  const tpc: ToolPermissionContext = {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: { localSettings: overrides?.allow ?? [] },
    alwaysDenyRules: { localSettings: overrides?.deny ?? [] },
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
  }
  return { getAppState: () => ({ toolPermissionContext: tpc }) }
}

/** 裸 Command fixture（Command = CommandBase & PromptCommand 单形）。 */
function makeCmd(p: {
  name: string
  description: string
  whenToUse?: string
  source?: string
  loadedFrom?: 'commands_DEPRECATED' | 'skills' | 'bundled'
}): Command {
  return {
    type: 'prompt',
    progressMessage: 'running',
    contentLength: 0,
    source: p.source ?? 'bundled',
    name: p.name,
    description: p.description,
    whenToUse: p.whenToUse,
    loadedFrom: p.loadedFrom,
    getPromptForCommand: async () => [],
  } as Command
}

const ENV_KEYS = [
  'ATLAS_CONFIG_DIR',
  'ATLAS_COORDINATOR_MODE',
  'FEATURE_COORDINATOR_MODE',
  'SLASH_COMMAND_TOOL_CHAR_BUDGET',
] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  // 防御戳：技能目录扫描落不存在目录（ENOENT → 空，零真实盘）
  process.env.ATLAS_CONFIG_DIR = '/mock-home'
  delete process.env.ATLAS_COORDINATOR_MODE
  delete process.env.FEATURE_COORDINATOR_MODE
  delete process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
  clearBundledSkills()
  clearCommandsCache()
  clearPromptCache()
})

afterEach(() => {
  clearBundledSkills()
  clearCommandsCache()
  clearPromptCache()
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

// ── 对象面（静态成员 + face 收窄）───────────────────────────────────

describe('对象面（静态成员 + face 收窄）', () => {
  test('name/schema/门控静态成员逐字', () => {
    expect(SkillTool.name).toBe('Skill')
    expect(SkillTool.inputSchema).toBe(SKILL_TOOL_INPUT_SCHEMA)
    expect(SkillTool.inputJSONSchema).toBe(SKILL_TOOL_INPUT_SCHEMA)
    expect(SkillTool.searchHint).toBe('invoke a slash-command skill')
    expect(SkillTool.maxResultSizeChars).toBe(100_000)
    expect(SkillTool.isEnabled()).toBe(true)
    // 仅一个技能同时跑（头注逐字注释语义）
    expect(SkillTool.isConcurrencySafe()).toBe(false)
    expect(SkillTool.isReadOnly()).toBe(false)
    expect(SkillTool.isDestructive()).toBe(false)
    expect(SkillTool.userFacingName()).toBe('Skill')
  })

  test('toAutoClassifierInput 双态（skill 名 / 缺省空串）', () => {
    expect(SkillTool.toAutoClassifierInput({ skill: 'x', args: 'a' })).toBe(
      'x',
    )
    expect(SkillTool.toAutoClassifierInput({})).toBe('')
  })
})

// ── schema 面 ───────────────────────────────────────────────────────

describe('schema 面（纯 JSON schema，delta ① 非 strict）', () => {
  test('shape 逐字（2 属性 + required skill）', () => {
    const s = SKILL_TOOL_INPUT_SCHEMA
    expect(s.type).toBe('object')
    expect(s.required).toEqual(['skill'])
    const props = s.properties as Record<string, Record<string, unknown>>
    expect(Object.keys(props).sort()).toEqual(['args', 'skill'])
    expect(props.skill).toEqual({
      type: 'string',
      description: 'The skill name. E.g., "commit", "review-pr", or "pdf"',
    })
    expect(props.args).toEqual({
      type: 'string',
      description: 'Optional arguments for the skill',
    })
  })
})

// ── validateInput 4 码面 ────────────────────────────────────────────

describe('validateInput 4 码面（码 5 死支 = prompt 单形，delta ⑭ 不造不可达断言）', () => {
  test('码 1：空 skill（trim 空）', async () => {
    const res = await SkillTool.validateInput({ skill: '   ' })
    expect(res).toEqual({
      result: false,
      message: 'Invalid skill format:    ',
      errorCode: 1,
    })
  })

  test('码 2：未知技能（前导 / 归一后池内未中）', async () => {
    const res = await SkillTool.validateInput({ skill: '/se2b-no-such' })
    expect(res).toEqual({
      result: false,
      message: 'Unknown skill: se2b-no-such',
      errorCode: 2,
    })
  })

  test('码 4：disableModelInvocation 技能拒模型调用', async () => {
    registerBundledSkill({
      name: 'se2b-disabled',
      description: 'd',
      disableModelInvocation: true,
      getPromptForCommand: async () => [],
    })
    const res = await SkillTool.validateInput({ skill: 'se2b-disabled' })
    expect(res).toEqual({
      result: false,
      message:
        'Skill se2b-disabled cannot be used with Skill tool due to disable-model-invocation',
      errorCode: 4,
    })
  })

  test('通过：注册技能（前导 / 兼容归一）', async () => {
    registerBundledSkill({
      name: 'se2b-valid',
      description: 'd',
      getPromptForCommand: async () => [],
    })
    const res = await SkillTool.validateInput({ skill: '/se2b-valid' })
    expect(res).toEqual({ result: true })
  })
})

// ── checkPermissions 权限面 ─────────────────────────────────────────

describe('checkPermissions 权限面（deny/allow 规则 + safe-properties 门）', () => {
  test('deny 规则命中（Skill(blocked-skill) 精确）', async () => {
    const res = await SkillTool.checkPermissions(
      { skill: 'blocked-skill', args: 'x' },
      permCtx({ deny: ['Skill(blocked-skill)'] }),
    )
    expect(res.behavior).toBe('deny')
    const deny = res as Extract<PermissionResult<SkillToolInput>, { behavior: 'deny' }>
    expect(deny.message).toBe('Skill execution blocked by permission rules')
    expect(deny.decisionReason?.type).toBe('rule')
  })

  test('allow 精确规则命中（updatedInput + rule 决策因）', async () => {
    const res = await SkillTool.checkPermissions(
      { skill: 'allowed-skill', args: 'x' },
      permCtx({ allow: ['Skill(allowed-skill)'] }),
    )
    expect(res.behavior).toBe('allow')
    const allow = res as Extract<
      PermissionResult<SkillToolInput>,
      { behavior: 'allow' }
    >
    expect(allow.updatedInput).toEqual({ skill: 'allowed-skill', args: 'x' })
    expect(allow.decisionReason?.type).toBe('rule')
  })

  test('allow 前缀规则命中（Skill(prefix-skill:*) 匹配 skill 名）', async () => {
    const res = await SkillTool.checkPermissions(
      { skill: 'prefix-skill' },
      permCtx({ allow: ['Skill(prefix-skill:*)'] }),
    )
    expect(res.behavior).toBe('allow')
  })

  test('safe-properties auto-allow（bundled 全安全属性 → allow 无决策因）', async () => {
    registerBundledSkill({
      name: 'se2b-safe',
      description: 'd',
      getPromptForCommand: async () => [],
    })
    const res = await SkillTool.checkPermissions(
      { skill: 'se2b-safe' },
      permCtx(),
    )
    expect(res.behavior).toBe('allow')
    const allow = res as Extract<
      PermissionResult<SkillToolInput>,
      { behavior: 'allow' }
    >
    expect(allow.decisionReason).toBeUndefined()
  })

  test('非安全属性 → ask（suggestions 2 条 localSettings + metadata 带命令对象）', async () => {
    registerBundledSkill({
      name: 'se2b-unsafe',
      description: 'd',
      getPromptForCommand: async () => [],
    })
    // 注入非 SAFE_SKILL_PROPERTIES 键的有意义值 → safe 行走失败
    const cmd = getBundledSkills().find(c => c.name === 'se2b-unsafe')!
    ;(cmd as unknown as Record<string, unknown>).mysteryUnsafeProp = 'x'

    const res = await SkillTool.checkPermissions(
      { skill: 'se2b-unsafe' },
      permCtx(),
    )
    expect(res.behavior).toBe('ask')
    const ask = res as Extract<
      PermissionResult<SkillToolInput>,
      { behavior: 'ask' }
    >
    expect(ask.message).toBe('Execute skill: se2b-unsafe')
    expect(ask.suggestions).toEqual([
      {
        type: 'addRules',
        rules: [{ toolName: 'Skill', ruleContent: 'se2b-unsafe' }],
        behavior: 'allow',
        destination: 'localSettings',
      },
      {
        type: 'addRules',
        rules: [{ toolName: 'Skill', ruleContent: 'se2b-unsafe:*' }],
        behavior: 'allow',
        destination: 'localSettings',
      },
    ])
    expect(ask.metadata).toEqual({ command: cmd })
  })

  test('未知技能 → ask（commandObj 未命中 → auto-allow 跳过 + metadata undefined）', async () => {
    const res = await SkillTool.checkPermissions(
      { skill: 'se2b-ghost' },
      permCtx(),
    )
    expect(res.behavior).toBe('ask')
    const ask = res as Extract<
      PermissionResult<SkillToolInput>,
      { behavior: 'ask' }
    >
    expect(ask.metadata).toBeUndefined()
    expect(ask.suggestions?.[0]?.rules?.[0]).toEqual({
      toolName: 'Skill',
      ruleContent: 'se2b-ghost',
    })
  })
})

// ── call inline 路径 ────────────────────────────────────────────────

describe('call inline 路径（processPromptSlashCommand 真链 + 过滤/打标）', () => {
  test('data 面 + newMessages 过滤（metadata 剔除 isMeta 保留）+ sourceToolUseID 打标', async () => {
    registerBundledSkill({
      name: 'se2b-inline',
      description: 'd',
      allowedTools: ['Read'],
      model: 'small',
      getPromptForCommand: async args => [
        { type: 'text', text: `inline-body:${args}` },
      ],
    })

    const res = await SkillTool.call(
      { skill: 'se2b-inline', args: 'hi' },
      { getAppState: () => ({}) },
      undefined,
      makeParentMsg(),
    )

    expect(res.data).toEqual({
      success: true,
      commandName: 'se2b-inline',
      allowedTools: ['Read'],
      model: 'small',
    })
    // metadata 消息（含 <command-message> 串）被 SkillTool 展示面过滤，
    // isMeta 内容块消息保留（消费 = 消息/REPL 波前向接缝，delta ⑬）
    expect(res.newMessages).toHaveLength(1)
    const m = res.newMessages![0] as unknown as {
      sourceToolUseID?: string
      isMeta?: boolean
      message: { content: unknown[] }
    }
    expect(m.sourceToolUseID).toBe('toolu_skill_1')
    expect(m.isMeta).toBe(true)
    expect(m.message.content).toEqual([{ type: 'text', text: 'inline-body:hi' }])
  })

  test('contextModifier：TPC alwaysAllowRules.command Set-union + mainLoopModel 覆盖', async () => {
    registerBundledSkill({
      name: 'se2b-inline2',
      description: 'd',
      allowedTools: ['Read'],
      model: 'small',
      getPromptForCommand: async () => [{ type: 'text', text: 'x' }],
    })

    const res = await SkillTool.call(
      { skill: 'se2b-inline2' },
      {},
      undefined,
      makeParentMsg(),
    )
    expect(res.contextModifier).toBeInstanceOf(Function)

    const modified = res.contextModifier!({
      getAppState: () => ({
        toolPermissionContext: { alwaysAllowRules: { command: ['Bash'] } },
      }),
      options: { mainLoopModel: 'm0' },
    }) as {
      getAppState: () => {
        toolPermissionContext: { alwaysAllowRules: { command?: string[] } }
      }
      options?: { mainLoopModel?: string }
    }
    // delta ⑨：skill 域 createGetAppStateWithAllowedTools 同形（既有
    // 在前 + 技能授权在后）
    expect(
      modified.getAppState().toolPermissionContext.alwaysAllowRules.command,
    ).toEqual(['Bash', 'Read'])
    // resolveSkillModelOverride 直通（1M 后缀语义已随 P6 裁）
    expect(modified.options?.mainLoopModel).toBe('small')
  })
})

// ── call fork 路径（真 runAgent + fake provider）────────────────────

describe('call fork 路径（context: fork → runAgent 单 Promise）', () => {
  test('forked 输出面（agentId 前缀 + 结果文本抽取 + overrideRole 记录）', async () => {
    registerBundledSkill({
      name: 'se2b-fork',
      description: 'd',
      context: 'fork',
      model: 'small',
      getPromptForCommand: async args => [
        { type: 'text', text: `fork-body:${args}` },
      ],
    })
    const { provider, roles } = fakeProvider([
      { content: [{ type: 'text', text: 'forked-done' }] },
    ])

    const res = await SkillTool.call(
      { skill: 'se2b-fork', args: 'go' },
      { modelProvider: provider, tools: [], parentRole: 'small' },
      undefined,
      makeParentMsg(),
    )

    expect(res.data).toMatchObject({
      success: true,
      commandName: 'se2b-fork',
      status: 'forked',
      result: 'forked-done',
    })
    const forked = res.data as { agentId: string }
    expect(forked.agentId).toMatch(/^skill-[0-9a-f-]{36}$/)
    // delta ⑮：command.model 'small' ∈ MODEL_ROLES → overrideRole
    expect(roles[0]).toBe('small')
    expect(res.newMessages).toBeUndefined()
    expect(res.contextModifier).toBeUndefined()
  })
})

// ── mapToolResult 双支 ──────────────────────────────────────────────

describe('mapToolResultToToolResultBlockParam 双支', () => {
  test('forked 支（结果全文随块）', () => {
    const b = SkillTool.mapToolResultToToolResultBlockParam(
      {
        success: true,
        commandName: 'fx',
        status: 'forked',
        agentId: 'a1',
        result: 'res',
      },
      'tu1',
    )
    expect(b).toEqual({
      type: 'tool_result',
      tool_use_id: 'tu1',
      content: 'Skill "fx" completed (forked execution).\n\nResult:\nres',
    })
  })

  test('inline 支（Launching skill 短串）', () => {
    const b = SkillTool.mapToolResultToToolResultBlockParam(
      { success: true, commandName: 'in', status: 'inline' },
      'tu2',
    )
    expect(b).toEqual({
      type: 'tool_result',
      tool_use_id: 'tu2',
      content: 'Launching skill: in',
    })
  })
})

// ── renderToolUseMessage 字符串面 3 态（delta ⑪ 逐字）──────────────

describe('renderToolUseMessage 字符串面 3 态', () => {
  test('无 skill → null', () => {
    expect(
      SkillTool.renderToolUseMessage({}, { theme: null, verbose: false }),
    ).toBeNull()
  })

  test('legacy /commands/ 来源 → /name 前缀', () => {
    expect(
      SkillTool.renderToolUseMessage(
        { skill: 'legacy-cmd' },
        {
          theme: null,
          verbose: false,
          commands: [
            makeCmd({
              name: 'legacy-cmd',
              description: 'd',
              loadedFrom: 'commands_DEPRECATED',
            }),
          ],
        },
      ),
    ).toBe('/legacy-cmd')
  })

  test('普通技能 → 原名', () => {
    expect(
      SkillTool.renderToolUseMessage(
        { skill: 'plain-skill' },
        { theme: null, verbose: false },
      ),
    ).toBe('plain-skill')
  })
})

// ── prompt 模板面 ───────────────────────────────────────────────────

describe('prompt 模板面（getSkillPrompt memoize + description() 接线）', () => {
  test('模板关键面逐字 + memoize 缓存面', async () => {
    const p = await getSkillPrompt('/tmp/x')
    expect(p).toContain('Execute a skill within the main conversation')
    expect(p).toContain('BLOCKING REQUIREMENT')
    // 模板引用 <command-name> 标签（COMMAND_NAME_TAG 常量值）
    expect(p).toContain('<command-name>')
    expect(getSkillPrompt.cache?.size).toBe(1)
    clearPromptCache()
    expect(getSkillPrompt.cache?.size).toBe(0)
  })

  test('SkillTool.description() = 唯一 prompt 面实现体（delta ④）', async () => {
    const d = await SkillTool.description()
    expect(d).toContain('Execute a skill within the main conversation')
  })
})

// ── 命令预算面（纯函数）─────────────────────────────────────────────

describe('命令预算面（getCharBudget / formatCommandsWithinBudget）', () => {
  test('getCharBudget 3 态（env 覆盖 / contextWindow 缩放 / 缺省）', () => {
    expect(SKILL_BUDGET_CONTEXT_PERCENT).toBe(0.01)
    expect(CHARS_PER_TOKEN).toBe(4)
    expect(DEFAULT_CHAR_BUDGET).toBe(8_000)
    expect(getCharBudget()).toBe(8_000)
    // 200k tokens × 4 × 1% = 8000（与缺省同值，判据独立）
    expect(getCharBudget(200_000)).toBe(8_000)
    expect(getCharBudget(1_000_000)).toBe(40_000)
    process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET = '500'
    expect(getCharBudget(1_000_000)).toBe(500)
    delete process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
    expect(getCharBudget()).toBe(8_000)
  })

  test('formatCommandsWithinBudget：空池空串', () => {
    expect(formatCommandsWithinBudget([])).toBe('')
  })

  test('预算内 → 全描述条目（desc - whenToUse 拼接）', () => {
    const out = formatCommandsWithinBudget([
      makeCmd({ name: 'bund', description: 'bd', whenToUse: 'bw' }),
      makeCmd({ name: 'rest', description: 'rd', whenToUse: 'rw' }),
    ])
    expect(out).toBe('- bund: bd - bw\n- rest: rd - rw')
  })

  test('超预算 → 非 bundled 截断（…尾标）+ bundled 永不截断', () => {
    const bundled = makeCmd({
      name: 'bund',
      description: 'bundled desc',
      whenToUse: 'bundled use',
    })
    const longDesc = 'x'.repeat(40)
    process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET = '100'
    const out = formatCommandsWithinBudget([
      bundled,
      makeCmd({
        name: 'r1',
        description: 'd1',
        whenToUse: longDesc,
        source: 'userSettings',
      }),
      makeCmd({
        name: 'r2',
        description: 'd2',
        whenToUse: longDesc,
        source: 'userSettings',
      }),
    ])
    const lines = out.split('\n')
    // bundled 全描述恒保留
    expect(lines[0]).toBe('- bund: bundled desc - bundled use')
    // 非 bundled 描述截断（长 whenToUse 被 … 尾标截）
    expect(lines[1]).toContain('…')
    expect(lines[1]).not.toContain(longDesc)
    expect(lines[2]).toContain('…')
    delete process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
  })

  test('极端预算 → 非 bundled 仅名 + bundled 保留描述', () => {
    const bundled = makeCmd({
      name: 'bund',
      description: 'bundled desc',
      whenToUse: 'bundled use',
    })
    process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET = '30'
    const out = formatCommandsWithinBudget([
      bundled,
      makeCmd({ name: 'r1', description: 'd1', source: 'userSettings' }),
      makeCmd({ name: 'r2', description: 'd2', source: 'userSettings' }),
    ])
    const lines = out.split('\n')
    expect(lines[0]).toBe('- bund: bundled desc - bundled use')
    expect(lines[1]).toBe('- r1')
    expect(lines[2]).toBe('- r2')
    delete process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
  })
})
