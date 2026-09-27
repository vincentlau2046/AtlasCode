/**
 * auto-mode 分类器族 unit 测试（§8.65 C 桶 ②，零磁盘零模型）
 *
 * 覆盖 autoMode 子域可测纯逻辑面 + ② dontAsk 转换：
 * - transcript：buildTranscriptEntries（user text / assistant tool_use /
 *   queued_command attachment / assistant text 排除）+ toCompact（jsonl vs
 *   text-prefix 两态）+ buildTranscriptForClassifier + formatActionForClassifier
 *   + jsonStringify（BigInt 降级）。
 * - xml：stripThinking / parseXmlBlock（yes / no / 不可解析 / thinking 内嵌 tag
 *   剥离）/ parseXmlReason / parseXmlThinking / replaceOutputFormatWithXml。
 * - usage：extractUsage / combineUsage / getClassifierThinkingConfig。
 * - classifierShared：extractToolUseBlock（命中 / 未命中 / 非 tool_use）/
 *   parseClassifierResponse（valid / invalid）。
 * - state / denials / approvals / allowlist：会话态 + 近拒跟踪（20 cap 头插）+
 *   放行跟踪（classifier 判别 + checking 信号）+ 安全白名单。
 * - prompts：getDefaultExternalAutoModeRules / buildDefaultExternalSystemPrompt
 *   （3 user_* tag 替换，.txt 资产内联）。
 * - ② dontAsk：hasPermissionsToUseTool 完整上下文无规则落 3 ask →（mode
 *   dontAsk）→ deny + DONT_ASK_REJECT_MESSAGE 逐字。
 *
 * 前向接缝不测（LLM 闭包 / CLI / settings / growthbook，§8.65.1.6，归
 * provider/settings/CLI 波）：classifyYoloAction 族 / buildYoloSystemPrompt LLM
 * 面 / autoMode CLI handler。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  // transcript
  jsonStringify,
  setJsonlTranscriptEnabled,
  isJsonlTranscriptEnabled,
  buildTranscriptEntries,
  buildTranscriptForClassifier,
  formatActionForClassifier,
  // xml
  XML_S1_SUFFIX,
  XML_S2_SUFFIX,
  stripThinking,
  parseXmlBlock,
  parseXmlReason,
  parseXmlThinking,
  replaceOutputFormatWithXml,
  // usage
  extractUsage,
  combineUsage,
  getClassifierThinkingConfig,
  yoloClassifierResponseSchema,
  YOLO_CLASSIFIER_TOOL_NAME,
  YOLO_CLASSIFIER_TOOL_SCHEMA,
  // classifierShared
  extractToolUseBlock,
  parseClassifierResponse,
  // state
  setAutoModeActive,
  isAutoModeActive,
  setAutoModeFlagCli,
  getAutoModeFlagCli,
  setAutoModeCircuitBroken,
  isAutoModeCircuitBroken,
  resetAutoModeStateForTesting,
  // denials
  recordAutoModeDenial,
  getAutoModeDenials,
  resetAutoModeDenialsForTesting,
  // approvals
  setClassifierApproval,
  getClassifierApproval,
  setYoloClassifierApproval,
  getYoloClassifierApproval,
  setClassifierChecking,
  clearClassifierChecking,
  subscribeClassifierChecking,
  isClassifierChecking,
  deleteClassifierApproval,
  clearClassifierApprovals,
  // allowlist
  isAutoModeAllowlistedTool,
  // prompts
  BASE_PROMPT,
  EXTERNAL_PERMISSIONS_TEMPLATE,
  getDefaultExternalAutoModeRules,
  buildDefaultExternalSystemPrompt,
  // ② dontAsk 转换 + 决策主体
  DONT_ASK_REJECT_MESSAGE,
  DENIAL_WORKAROUND_GUIDANCE,
  hasPermissionsToUseTool,
  setPermissionsBootstrapEnv,
  resetPermissionsBootstrapEnv,
  resetSandboxAccess,
  type PermissionTool,
} from '../../src/permissions'
import type {
  Tool,
  Tools,
  Message,
  ToolPermissionContext,
  PermissionDecision,
} from '../../src/shared'

/** 最小 Tool 假件（transcript 只读 name / aliases / toAutoClassifierInput）。 */
function fakeTool(
  name: string,
  proj: (input: unknown) => unknown,
  aliases?: string[],
): Tool {
  return { name, aliases, toAutoClassifierInput: proj } as unknown as Tool
}

/** 无 checkPermissions 的探路工具（纯 passthrough → 落 3）。 */
const probeTool: PermissionTool = { name: 'Probe', getPath: () => '/tmp/probe' }

function contextWithMode(mode: ToolPermissionContext['mode']): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}

beforeEach(() => {
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => '/tmp/proj',
    getCwd: () => '/tmp/proj',
  })
  resetSandboxAccess()
  setJsonlTranscriptEnabled(false)
  resetAutoModeStateForTesting()
  resetAutoModeDenialsForTesting()
  clearClassifierApprovals()
})
afterEach(() => {
  resetPermissionsBootstrapEnv()
  resetSandboxAccess()
  setJsonlTranscriptEnabled(false)
  resetAutoModeStateForTesting()
  resetAutoModeDenialsForTesting()
  clearClassifierApprovals()
})

// ── transcript ─────────────────────────────────────────────────────────────
describe('buildTranscriptEntries（分类器 transcript 投影）', () => {
  test('user 文本（字符串 content）→ 单 user turn', () => {
    const messages: Message[] = [{ type: 'user', message: { content: 'hi' } }]
    expect(buildTranscriptEntries(messages)).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ])
  })

  test('user 文本（content 块数组）→ 合并 text 块', () => {
    const messages: Message[] = [
      {
        type: 'user',
        message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
      },
    ]
    expect(buildTranscriptEntries(messages)).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
    ])
  })

  test('assistant 仅 tool_use 块（排除 assistant 文本，防模型自撰文本影响分类）', () => {
    const messages: Message[] = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'model prose' },
            { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
          ],
        },
      },
    ]
    expect(buildTranscriptEntries(messages)).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
      },
    ])
  })

  test('assistant 纯文本（无 tool_use）→ 不产 entry', () => {
    const messages: Message[] = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'only prose' }] } },
    ]
    expect(buildTranscriptEntries(messages)).toEqual([])
  })

  test('queued_command attachment（字符串 prompt）→ user turn', () => {
    const messages: Message[] = [
      { type: 'attachment', attachment: { type: 'queued_command', prompt: 'queued msg' } },
    ]
    expect(buildTranscriptEntries(messages)).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'queued msg' }] },
    ])
  })

  test('queued_command attachment（块数组 prompt）→ 合并 text 块', () => {
    const messages: Message[] = [
      {
        type: 'attachment',
        attachment: {
          type: 'queued_command',
          prompt: [{ type: 'text', text: 'p1' }, { type: 'text', text: 'p2' }],
        },
      },
    ]
    expect(buildTranscriptEntries(messages)).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'p1\np2' }] },
    ])
  })

  test('queued_command attachment（非 text 块数组）→ 不产 entry', () => {
    const messages: Message[] = [
      {
        type: 'attachment',
        attachment: { type: 'queued_command', prompt: [{ type: 'image', data: 'x' }] },
      },
    ]
    expect(buildTranscriptEntries(messages)).toEqual([])
  })
})

describe('buildTranscriptForClassifier / toCompact（text-prefix vs jsonl 两态）', () => {
  const tools: Tools = [
    fakeTool('Bash', (input) => (input as { command?: string }).command ?? ''),
  ]

  test('text-prefix 缺省态：user `User: <text>` + tool `<Name> <encoded>`', () => {
    const messages: Message[] = [
      { type: 'user', message: { content: 'hello' } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } },
    ]
    expect(buildTranscriptForClassifier(messages, tools)).toBe(
      'User: hello\nBash ls\n',
    )
  })

  test('jsonl 态：user `{"user":"<text>"}` + tool `{"<Name>":"<encoded>"}`', () => {
    setJsonlTranscriptEnabled(true)
    expect(isJsonlTranscriptEnabled()).toBe(true)
    const messages: Message[] = [
      { type: 'user', message: { content: 'hello' } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } },
    ]
    expect(buildTranscriptForClassifier(messages, tools)).toBe(
      '{"user":"hello"}\n{"Bash":"ls"}\n',
    )
  })

  test('toAutoClassifierInput 投影为空串 → 该块跳过', () => {
    const skipTools: Tools = [fakeTool('SkipMe', () => '')]
    const messages: Message[] = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'SkipMe', input: { a: 1 } }] } },
    ]
    expect(buildTranscriptForClassifier(messages, skipTools)).toBe('')
  })

  test('toAutoClassifierInput 抛错 → 回落原始 input（单次编码不双重）', () => {
    const throwTools: Tools = [
      fakeTool('Throwy', () => {
        throw new Error('boom')
      }),
    ]
    const messages: Message[] = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Throwy', input: { a: 1 } }] } },
    ]
    expect(buildTranscriptForClassifier(messages, throwTools)).toBe(
      'Throwy {"a":1}\n',
    )
  })

  test('transcript 内未知工具名（lookup 未命中）→ 跳过', () => {
    const messages: Message[] = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'UnknownTool', input: { a: 1 } }] } },
    ]
    expect(buildTranscriptForClassifier(messages, tools)).toBe('')
  })

  test('formatActionForClassifier → assistant tool_use entry', () => {
    expect(formatActionForClassifier('Bash', { command: 'ls' })).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
    })
  })
})

test('jsonStringify 降级 BigInt 为 undefined（键剥离）', () => {
  expect(jsonStringify({ big: 10n, ok: 1 })).toBe('{"ok":1}')
})

// ── xml ────────────────────────────────────────────────────────────────────
describe('XML 2 段分类器解析面', () => {
  test('parseXmlBlock yes / no / 不可解析', () => {
    expect(parseXmlBlock('<block>yes</block>')).toBe(true)
    expect(parseXmlBlock('<block>no</block>')).toBe(false)
    expect(parseXmlBlock('no xml here')).toBeNull()
  })

  test('parseXmlBlock 剥离 thinking 内嵌 <block> tag（防 CoT 误匹配）', () => {
    const text =
      '<thinking>first instinct: <block>yes</block></thinking><block>no</block>'
    expect(parseXmlBlock(text)).toBe(false)
  })

  test('parseXmlReason 提取 + 缺省 null', () => {
    expect(parseXmlReason('<reason>sensitive</reason>')).toBe('sensitive')
    expect(parseXmlReason('no reason tag')).toBeNull()
  })

  test('parseXmlThinking 提取 + 缺省 null', () => {
    expect(parseXmlThinking('<thinking>ponder</thinking>')).toBe('ponder')
    expect(parseXmlThinking('no thinking')).toBeNull()
  })

  test('stripThinking 移除闭合 + 未闭合 thinking 块', () => {
    expect(stripThinking('a <thinking>x</thinking> b')).toBe('a  b')
    expect(stripThinking('a <thinking>unterminated')).toBe('a ')
  })

  test('replaceOutputFormatWithXml 替换 tool_use 输出指令为 XML 格式', () => {
    const toolUseLine = 'Use the classify_result tool to report your classification.'
    const out = replaceOutputFormatWithXml(`Rules...\n${toolUseLine}\nMore...`)
    expect(out).toContain('## Output Format')
    expect(out).toContain('<block>yes</block>')
    expect(out).not.toContain(toolUseLine)
  })

  test('XML_S1_SUFFIX / XML_S2_SUFFIX 内容锚点（数据冻结，防提示词漂移）', () => {
    expect(XML_S1_SUFFIX).toContain('Err on the side of blocking')
    expect(XML_S1_SUFFIX).toContain('<block>')
    expect(XML_S2_SUFFIX).toContain('follow it carefully')
    expect(XML_S2_SUFFIX).toContain('<thinking>')
  })
})

// ── usage ──────────────────────────────────────────────────────────────────
describe('分类器用量 / 思考配置', () => {
  test('extractUsage 取四字段', () => {
    expect(
      extractUsage({
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 2,
          cache_creation_input_tokens: 3,
        },
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 2,
      cacheCreationInputTokens: 3,
    })
  })

  test('extractUsage 无 usage → 全 0', () => {
    expect(extractUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    })
  })

  test('combineUsage 逐字段求和', () => {
    expect(
      combineUsage(
        { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 3, cacheCreationInputTokens: 4 },
        { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 30, cacheCreationInputTokens: 40 },
      ),
    ).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      cacheReadInputTokens: 33,
      cacheCreationInputTokens: 44,
    })
  })

  test('getClassifierThinkingConfig 恒 [false, 0]', () => {
    expect(getClassifierThinkingConfig('claude')).toEqual([false, 0])
  })
})

// ── classifierShared ───────────────────────────────────────────────────────
describe('extractToolUseBlock / parseClassifierResponse', () => {
  const blocks = [
    { type: 'text', text: 'x' },
    { type: 'tool_use', id: 't1', name: 'classify_result', input: { shouldBlock: true } },
  ] as const

  test('extractToolUseBlock 命中 → 返回该块', () => {
    const block = extractToolUseBlock(blocks, 'classify_result')
    expect(block?.name).toBe('classify_result')
    expect(block?.type).toBe('tool_use')
  })

  test('extractToolUseBlock 未命中名称 → null', () => {
    expect(extractToolUseBlock(blocks, 'other_tool')).toBeNull()
  })

  test('extractToolUseBlock 无 tool_use 块 → null', () => {
    expect(extractToolUseBlock([{ type: 'text', text: 'x' }], 'any')).toBeNull()
  })

  test('parseClassifierResponse valid → 解析对象', () => {
    const schema = yoloClassifierResponseSchema()
    const parsed = parseClassifierResponse(
      { input: { thinking: 't', shouldBlock: true, reason: 'r' } },
      schema,
    )
    expect(parsed).toEqual({ thinking: 't', shouldBlock: true, reason: 'r' })
  })

  test('parseClassifierResponse invalid（缺字段）→ null', () => {
    const schema = yoloClassifierResponseSchema()
    expect(
      parseClassifierResponse({ input: { thinking: 't', shouldBlock: true } }, schema),
    ).toBeNull()
  })
})

// ── state ──────────────────────────────────────────────────────────────────
describe('auto-mode 会话态', () => {
  test('autoModeActive set/get + reset', () => {
    expect(isAutoModeActive()).toBe(false)
    setAutoModeActive(true)
    expect(isAutoModeActive()).toBe(true)
    resetAutoModeStateForTesting()
    expect(isAutoModeActive()).toBe(false)
  })

  test('autoModeFlagCli set/get', () => {
    setAutoModeFlagCli(true)
    expect(getAutoModeFlagCli()).toBe(true)
  })

  test('autoModeCircuitBroken set/get', () => {
    setAutoModeCircuitBroken(true)
    expect(isAutoModeCircuitBroken()).toBe(true)
  })

  test('resetAutoModeStateForTesting 三态全清', () => {
    setAutoModeActive(true)
    setAutoModeFlagCli(true)
    setAutoModeCircuitBroken(true)
    resetAutoModeStateForTesting()
    expect(isAutoModeActive()).toBe(false)
    expect(getAutoModeFlagCli()).toBe(false)
    expect(isAutoModeCircuitBroken()).toBe(false)
  })
})

// ── denials ────────────────────────────────────────────────────────────────
describe('auto-mode 近拒跟踪（20 cap 头插）', () => {
  test('recordAutoModeDenial 新者头插', () => {
    recordAutoModeDenial({ toolName: 'T', display: 'first', reason: 'r', timestamp: 1 })
    recordAutoModeDenial({ toolName: 'T', display: 'second', reason: 'r', timestamp: 2 })
    const d = getAutoModeDenials()
    expect(d.length).toBe(2)
    expect(d[0]?.display).toBe('second')
    expect(d[1]?.display).toBe('first')
  })

  test('20 cap：记录 25 条 → 保留最新 20 条（新者头）', () => {
    for (let i = 0; i < 25; i++) {
      recordAutoModeDenial({ toolName: 'T', display: `d${i}`, reason: 'r', timestamp: i })
    }
    const d = getAutoModeDenials()
    expect(d.length).toBe(20)
    expect(d[0]?.display).toBe('d24')
    expect(d[19]?.display).toBe('d5')
  })

  test('resetAutoModeDenialsForTesting 清空', () => {
    recordAutoModeDenial({ toolName: 'T', display: 'x', reason: 'r', timestamp: 1 })
    resetAutoModeDenialsForTesting()
    expect(getAutoModeDenials()).toEqual([])
  })
})

// ── approvals ──────────────────────────────────────────────────────────────
describe('分类器自动放行跟踪', () => {
  test('bash / yolo approval set/get', () => {
    setClassifierApproval('id-b', 'rule-a')
    expect(getClassifierApproval('id-b')).toBe('rule-a')
    setYoloClassifierApproval('id-y', 'reason-b')
    expect(getYoloClassifierApproval('id-y')).toBe('reason-b')
  })

  test('classifier 判别：bash 读取器不返 yolo 值（同 key 覆盖）', () => {
    setYoloClassifierApproval('id1', 'reason-b')
    expect(getYoloClassifierApproval('id1')).toBe('reason-b')
    // bash 读取器要求 classifier==='bash'，被 yolo 覆盖 → undefined
    expect(getClassifierApproval('id1')).toBeUndefined()
  })

  test('checking 指示 set/is/clear + 订阅信号', () => {
    const events: number[] = []
    const unsub = subscribeClassifierChecking(() => {
      events.push(1)
    })
    setClassifierChecking('x')
    expect(isClassifierChecking('x')).toBe(true)
    clearClassifierChecking('x')
    expect(isClassifierChecking('x')).toBe(false)
    unsub()
    expect(events.length).toBe(2)
  })

  test('deleteClassifierApproval 单删 / clearClassifierApprovals 全清', () => {
    setClassifierApproval('a', 'ra')
    setYoloClassifierApproval('b', 'rb')
    deleteClassifierApproval('a')
    expect(getClassifierApproval('a')).toBeUndefined()
    expect(getYoloClassifierApproval('b')).toBe('rb')
    clearClassifierApprovals()
    expect(getYoloClassifierApproval('b')).toBeUndefined()
  })
})

// ── allowlist ──────────────────────────────────────────────────────────────
describe('auto-mode 安全工具白名单', () => {
  test('白名单内工具（只读 / 任务 / 计划 / swarm 协调）', () => {
    for (const name of ['Read', 'Grep', 'Glob', 'TaskCreate', 'EnterPlanMode', 'SendMessage']) {
      expect(isAutoModeAllowlistedTool(name)).toBe(true)
    }
  })

  test('白名单外工具（Bash / Write 走 acceptEdits fast-path，非安全免分类）', () => {
    expect(isAutoModeAllowlistedTool('Bash')).toBe(false)
    expect(isAutoModeAllowlistedTool('Write')).toBe(false)
  })

  test('内部分类器自报工具入白名单', () => {
    expect(YOLO_CLASSIFIER_TOOL_NAME).toBe('classify_result')
    expect(YOLO_CLASSIFIER_TOOL_SCHEMA.name).toBe('classify_result')
    expect(isAutoModeAllowlistedTool(YOLO_CLASSIFIER_TOOL_NAME)).toBe(true)
  })
})

// ── prompts ────────────────────────────────────────────────────────────────
describe('分类器提示词数据 + 外部模板解析', () => {
  test('资产内联：BASE_PROMPT 含 <permissions_template> 占位；外部模板含 3 user_* tag', () => {
    expect(BASE_PROMPT).toContain('<permissions_template>')
    expect(EXTERNAL_PERMISSIONS_TEMPLATE).toContain('<user_allow_rules_to_replace>')
    expect(EXTERNAL_PERMISSIONS_TEMPLATE).toContain('<user_deny_rules_to_replace>')
    expect(EXTERNAL_PERMISSIONS_TEMPLATE).toContain('<user_environment_to_replace>')
  })

  test('getDefaultExternalAutoModeRules 解析三节（allow / soft_deny / environment 均非空数组）', () => {
    const rules = getDefaultExternalAutoModeRules()
    expect(rules.allow.length).toBeGreaterThan(0)
    expect(rules.soft_deny.length).toBeGreaterThan(0)
    expect(rules.environment.length).toBeGreaterThan(0)
  })

  test('buildDefaultExternalSystemPrompt 替换占位 + 3 user_* tag（无残留 tag）', () => {
    const prompt = buildDefaultExternalSystemPrompt()
    expect(prompt).not.toContain('<permissions_template>')
    expect(prompt).not.toContain('<user_allow_rules_to_replace>')
    expect(prompt).not.toContain('<user_deny_rules_to_replace>')
    expect(prompt).not.toContain('<user_environment_to_replace>')
  })
})

// ── ② dontAsk 转换 ────────────────────────────────────────────────────────
describe('② dontAsk 模式 ask→deny 转换', () => {
  test('DONT_ASK_REJECT_MESSAGE 逐字（含 dontAsk 短语 + 拒绝引导）', () => {
    const msg = DONT_ASK_REJECT_MESSAGE('Bash')
    expect(msg).toBe(
      `Permission to use Bash has been denied because Atlas is running in don't ask mode. ${DENIAL_WORKAROUND_GUIDANCE}`,
    )
  })

  test('完整上下文无规则落 3 ask →（mode dontAsk）→ deny + 逐字文案', async () => {
    const decision = await hasPermissionsToUseTool(
      probeTool,
      {},
      { getToolPermissionContext: () => contextWithMode('dontAsk') },
    )
    expect(decision.behavior).toBe('deny')
    expect(decision.decisionReason).toEqual({ type: 'mode', mode: 'dontAsk' })
    expect(decision.message).toBe(DONT_ASK_REJECT_MESSAGE('Probe'))
  })

  test('对照：完整上下文无规则 mode default → 落 3 ask（不转换）', async () => {
    const decision = await hasPermissionsToUseTool(
      probeTool,
      {},
      { getToolPermissionContext: () => contextWithMode('default') },
    )
    expect(decision.behavior).toBe('ask')
  })

  test('forceDecision 早退 ask →（mode dontAsk）→ deny（F1：② 覆盖新仓独有早退产点）', async () => {
    const forcedAsk: PermissionDecision = {
      behavior: 'ask',
      message: 'forced ask',
      decisionReason: { type: 'other', reason: 'forced' },
    }
    const decision = await hasPermissionsToUseTool(
      probeTool,
      {},
      { getToolPermissionContext: () => contextWithMode('dontAsk') },
      undefined,
      'tu1',
      forcedAsk,
    )
    expect(decision.behavior).toBe('deny')
    expect(decision.decisionReason).toEqual({ type: 'mode', mode: 'dontAsk' })
    expect(decision.message).toBe(DONT_ASK_REJECT_MESSAGE('Probe'))
  })

  test('1b ask 规则命中 →（mode dontAsk）→ deny（早退 ask 产点 ② 覆盖；default 对照证 1b 真达）', async () => {
    const ctx = (mode: ToolPermissionContext['mode']) => ({
      ...contextWithMode(mode),
      alwaysAskRules: { session: ['Probe'] },
    })
    const dDefault = await hasPermissionsToUseTool(
      probeTool,
      {},
      { getToolPermissionContext: () => ctx('default') },
    )
    // default 态 1b 命中 = ask 且 decisionReason 为 rule 型（非终端 mode 型），
    // 证 1b 早退产点真达（fixture 错配会落终端 mode-reasoned ask → 本断言红）
    expect(dDefault.behavior).toBe('ask')
    expect(dDefault.decisionReason).toEqual({
      type: 'rule',
      rule: { source: 'session', ruleBehavior: 'ask', ruleValue: { toolName: 'Probe' } },
    })
    const dDontAsk = await hasPermissionsToUseTool(
      probeTool,
      {},
      { getToolPermissionContext: () => ctx('dontAsk') },
    )
    expect(dDontAsk.behavior).toBe('deny')
    expect(dDontAsk.decisionReason).toEqual({ type: 'mode', mode: 'dontAsk' })
  })
})
