/**
 * 0.1.85 Task B（C85-B）— 工具补充消息执行/批次层判别（unit 层纯面，零磁盘）。
 *
 * 根因（工单 §1-B）：engine pipeline 对 ToolResult.newMessages 零消费——
 * toolExecution 成功支仅留 res.data（mapToolResult 后丢弃 res 其余字段），
 * batch 层 ToolBatchOutcome 不携带，Read pages 页图补充永不交付（Gap B 主断点）。
 *
 * RED 判据（工单）：基线按丢消息失败，不以新增导出不存在充当行为红——
 * fake tool 真返回补充 image/text，executeToolUse/runToolBatch 交付判别。
 *
 * 合法化（工单）：补充必须是 user + isMeta=true，保留/补全稳定 uuid/timestamp，
 * 关联源 tool_use；坏形态明确工具错误且不交付媒体，不静默忽略后报成功。
 * 清空（工单）：deny/ask/defer/unknown/schema/validate/pre-hook 拒绝不执行
 * 不交付；call/map 失败、is_error、post blocking 清空；post updatedToolOutput
 * 保守清空；MCP 后台早返不交付未完成补充。
 */
import { afterEach, beforeEach, describe, test, expect } from 'bun:test'
import { executeToolUse, runToolBatch, createUserMessage, type Tool } from '../../src/engine'
import {
  SkillTool,
  selectSkillDeliverableMessages,
} from '../../src/engine/tools/skill'
import {
  clearBundledSkills,
  clearCommandsCache,
  getBundledSkills,
  processPromptSlashCommand,
  registerBundledSkill,
} from '../../src/engine/skill'
import { toOpenAIMessages } from '../../src/modelprovider/params'
import type { AssistantMessage, ToolUseBlock } from '../../src/shared'

const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-09-23T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

function tu(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { type: 'tool_use', id, name, input }
}

const IMG_BLOCK = {
  type: 'image' as const,
  source: { type: 'base64' as const, media_type: 'image/jpeg', data: 'aGk=' },
}

/** fake tool：call 返回 res.data + 可选原始 newMessages（执行边界真形态）。 */
function makeSupTool(
  name: string,
  opts?: {
    safe?: boolean
    data?: unknown
    throw?: Error
    newMessages?: unknown[]
    isMcp?: boolean
    hangMs?: number
  },
): Tool {
  return {
    name,
    isMcp: opts?.isMcp,
    isConcurrencySafe: () => opts?.safe ?? false,
    call: async () => {
      if (opts?.hangMs) await new Promise((r) => setTimeout(r, opts.hangMs))
      if (opts?.throw) throw opts.throw
      return {
        data: opts?.data ?? `result:${name}`,
        ...(opts?.newMessages ? { newMessages: opts.newMessages } : {}),
      }
    },
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

/** 合法化形谓词：user 消息 + isMeta + 稳定 uuid/timestamp + 关联源 tool_use。 */
function assertLegalizedUser(m: unknown, sourceToolUseId: string): void {
  const msg = m as Record<string, unknown>
  expect(msg.type).toBe('user')
  expect(msg.isMeta).toBe(true)
  expect(typeof msg.uuid).toBe('string')
  expect((msg.uuid as string).length).toBeGreaterThan(0)
  expect(typeof msg.timestamp).toBe('string')
  expect(msg.sourceToolUseId).toBe(sourceToolUseId)
  const inner = msg.message as Record<string, unknown>
  expect(inner.role).toBe('user')
}

describe('C85-B executeToolUse 补充消息提取与合法化', () => {
  test('S① 成功支：text 补充交付为合法化 meta-user（uuid/timestamp/源 tool_use 关联）', async () => {
    const raw = [createUserMessage({ content: 'supplemental text for model', isMeta: true })]
    const r = await executeToolUse(tu('t1', 'sup'), ASSISTANT, {
      tools: [makeSupTool('sup', { newMessages: raw })],
    })
    expect(r.isError).toBe(false)
    expect(r.newMessages).toHaveLength(1)
    assertLegalizedUser(r.newMessages![0], 't1')
    const inner = (r.newMessages![0] as Record<string, unknown>).message as Record<string, unknown>
    expect(inner.content).toBe('supplemental text for model')
    // res.data 渲染信息保持（G1 面不回归）
    expect(r.toolUseResult).toBe('result:sup')
    expect(String(r.block!.content)).toBe('result:sup')
  })

  test('S② image 块补充交付（content 块数组形；text/image 允许面）', async () => {
    const raw = [createUserMessage({ content: [IMG_BLOCK], isMeta: true })]
    const r = await executeToolUse(tu('t2', 'sup'), ASSISTANT, {
      tools: [makeSupTool('sup', { newMessages: raw })],
    })
    expect(r.isError).toBe(false)
    expect(r.newMessages).toHaveLength(1)
    const inner = (r.newMessages![0] as Record<string, unknown>).message as Record<string, unknown>
    expect(Array.isArray(inner.content)).toBe(true)
    expect((inner.content as unknown[])[0]).toMatchObject({ type: 'image' })
  })

  test('S③ 拒绝支不交付：deny / ask / defer / pre-hook blocking / validate / unknown / schema', async () => {
    const raw = [createUserMessage({ content: 'should never deliver', isMeta: true })]
    const mk = () => [makeSupTool('sup', { newMessages: raw })]
    // deny
    const deny = await executeToolUse(tu('d1', 'sup'), ASSISTANT, {
      tools: mk(),
      checkPermission: async () => ({ allowed: false, reason: 'no' }),
    })
    expect(deny.isError).toBe(true)
    expect(deny.newMessages).toBeUndefined()
    // ask（fail-closed 短路）
    const askV = await executeToolUse(tu('d2', 'sup'), ASSISTANT, {
      tools: mk(),
      checkPermission: async () => ({ allowed: false, ask: true, reason: 'confirm' }),
    })
    expect(askV.newMessages).toBeUndefined()
    // defer
    const defer = await executeToolUse(tu('d3', 'sup'), ASSISTANT, {
      tools: mk(),
      checkPermission: async () => ({ allowed: false, deferred: true, reason: 'hold' }),
    })
    expect(defer.deferred).toBe(true)
    expect(defer.newMessages).toBeUndefined()
    // pre-hook blocking
    const hooked = await executeToolUse(tu('d4', 'sup'), ASSISTANT, {
      tools: mk(),
      hooks: { preToolUse: async () => ({ blockingError: 'hook says no' }) },
    })
    expect(hooked.isError).toBe(true)
    expect(hooked.newMessages).toBeUndefined()
    // validate 失败
    const bad = makeSupTool('sup', { newMessages: raw }) as Record<string, unknown>
    bad.validateInput = async () => ({ result: false, message: 'bad input', errorCode: 1 })
    const validated = await executeToolUse(tu('d5', 'sup'), ASSISTANT, {
      tools: [bad as unknown as Tool],
    })
    expect(validated.isError).toBe(true)
    expect(validated.newMessages).toBeUndefined()
    // unknown tool
    const unknown = await executeToolUse(tu('d6', 'ghost'), ASSISTANT, { tools: mk() })
    expect(unknown.isError).toBe(true)
    expect(unknown.newMessages).toBeUndefined()
    // schema 校验失败（input 不合 tool.inputSchema）
    const strict = {
      name: 'strict',
      isConcurrencySafe: () => false,
      inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'], additionalProperties: false },
      call: async () => ({ data: 'x', newMessages: raw }),
      mapToolResultToToolResultBlockParam: (c: unknown, id: string) => ({ type: 'tool_result', tool_use_id: id, content: String(c) }),
    } as unknown as Tool
    const schemaFail = await executeToolUse(tu('d7', 'strict', { wrong: 1 }), ASSISTANT, { tools: [strict] })
    expect(schemaFail.isError).toBe(true)
    expect(schemaFail.newMessages).toBeUndefined()
  })

  test('S④ call 失败清空（catch 支不交付补充）', async () => {
    const raw = [createUserMessage({ content: 'nope', isMeta: true })]
    const r = await executeToolUse(tu('t4', 'sup'), ASSISTANT, {
      tools: [makeSupTool('sup', { throw: new Error('boom'), newMessages: raw })],
    })
    expect(r.isError).toBe(true)
    expect(r.newMessages).toBeUndefined()
  })

  test('S⑤ is_error block 清空（map 返回 is_error → 不交付）', async () => {
    const raw = [createUserMessage({ content: 'nope', isMeta: true })]
    const t = {
      name: 'errmap',
      isConcurrencySafe: () => false,
      call: async () => ({ data: 'x', newMessages: raw }),
      mapToolResultToToolResultBlockParam: (c: unknown, id: string) => ({
        type: 'tool_result',
        tool_use_id: id,
        content: String(c),
        is_error: true,
      }),
    } as unknown as Tool
    const r = await executeToolUse(tu('t5', 'errmap'), ASSISTANT, { tools: [t] })
    // 基线语义：isError = pipeline 控制流标志（call 成功即 false，不读 block.is_error
    // ——既有面零回归）；工单清空面 = is_error 块不交付补充（newMessages 缺席）。
    expect(r.isError).toBe(false)
    expect((r.block as { is_error?: boolean }).is_error).toBe(true)
    expect(r.newMessages).toBeUndefined()
  })

  test('S⑥ post updatedToolOutput / post blocking 保守清空原补充', async () => {
    const raw = [createUserMessage({ content: 'original media', isMeta: true })]
    // updatedToolOutput：输出替换不能旁路原媒体
    const updated = await executeToolUse(tu('t6a', 'sup'), ASSISTANT, {
      tools: [makeSupTool('sup', { newMessages: raw })],
      hooks: { postToolUse: async () => ({ updatedToolOutput: 'rewritten' }) },
    })
    expect(updated.isError).toBe(false)
    expect(String(updated.block!.content)).toBe('rewritten')
    expect(updated.newMessages).toBeUndefined()
    // post blocking
    const blocked = await executeToolUse(tu('t6b', 'sup'), ASSISTANT, {
      tools: [makeSupTool('sup', { newMessages: raw })],
      hooks: { postToolUse: async () => ({ blockingError: 'post deny' }) },
    })
    expect(blocked.isError).toBe(true)
    expect(blocked.newMessages).toBeUndefined()
  })

  test('S⑦ MCP 后台早返不交付未完成补充（armed + hang 调用）', async () => {
    const raw = [createUserMessage({ content: 'late media', isMeta: true })]
    let bgCalled = false
    const r = await executeToolUse(tu('t7', 'slowmcp'), ASSISTANT, {
      tools: [makeSupTool('slowmcp', { newMessages: raw, isMcp: true, hangMs: 60 })],
      onMcpToolBackgrounded: () => {
        bgCalled = true
      },
      mcpAutoBackgroundMs: 1,
    })
    // 早返语义（C5-3）：转后台即返（工具未完成 → 补充未产出，不交付）；
    // onBackgrounded 在后台 continuation settle（工具真完成）时才回调——
    // 等 settle 后断言 armed 生效。
    expect(r.isError).toBe(false)
    expect(r.newMessages).toBeUndefined()
    expect(String(r.block!.content)).toContain('moved to the background')
    expect(bgCalled).toBe(false)
    await new Promise((res) => setTimeout(res, 150))
    expect(bgCalled).toBe(true)
  })

  test('S⑧ 坏形态明确工具错误且不交付（tool_result 伪回应块；不静默忽略后报成功）', async () => {
    const raw = [
      createUserMessage({
        content: [{ type: 'tool_result', tool_use_id: 'x', content: 'fake response' }],
        isMeta: true,
      }),
    ]
    const r = await executeToolUse(tu('t8', 'sup'), ASSISTANT, {
      tools: [makeSupTool('sup', { newMessages: raw })],
    })
    expect(r.isError).toBe(true)
    expect(String(r.block!.content)).toContain('tool_use_error')
    expect(r.newMessages).toBeUndefined()
  })

  test('S⑨ 无补充面恒等（普通工具零 newMessages 字段，outcome 形不变）', async () => {
    const r = await executeToolUse(tu('t9', 'plain'), ASSISTANT, {
      tools: [makeSupTool('plain')],
    })
    expect(r.isError).toBe(false)
    expect(r.newMessages).toBeUndefined()
    expect(r.toolUseResult).toBe('result:plain')
  })
})

describe('C85-B runToolBatch 补充携带（混合批次）', () => {
  test('B① 混合批次 outcomes 携带：两工具各一图、一个无图、一个失败', async () => {
    const img1 = [createUserMessage({ content: [ { ...IMG_BLOCK, source: { ...IMG_BLOCK.source, data: 'a=' } } ], isMeta: true })]
    const img2 = [createUserMessage({ content: [ { ...IMG_BLOCK, source: { ...IMG_BLOCK.source, data: 'b=' } } ], isMeta: true })]
    const outcomes = await runToolBatch(
      [tu('1', 'supA'), tu('2', 'plain'), tu('3', 'boom'), tu('4', 'supB')],
      ASSISTANT,
      {
        tools: [
          makeSupTool('supA', { safe: true, newMessages: img1 }),
          makeSupTool('plain', { safe: true }),
          makeSupTool('boom', { safe: true, throw: new Error('x') }),
          makeSupTool('supB', { safe: true, newMessages: img2 }),
        ],
      },
    )
    expect(outcomes).toHaveLength(4)
    expect(outcomes[0].newMessages).toHaveLength(1)
    expect(outcomes[1].newMessages).toBeUndefined()
    expect(outcomes[2].isError).toBe(true)
    expect(outcomes[2].newMessages).toBeUndefined()
    expect(outcomes[3].newMessages).toHaveLength(1)
  })
})

// ── Skill 旁支回归（工单 L87/L147 主路径）────────────────────────────
//
// 定界：真 processPromptSlashCommand（fixture prompt Command）→ 真
// SkillTool / selectSkillDeliverableMessages → 真 executeToolUse 交付门。
// 契约（skillTool.ts selector 头注）：只放行 isMeta:true 主内容（技能正文），
// 非 isMeta metadata 回显不交付——过不了补充合法化门（user + isMeta 形
// 契约，坏形 = 明确工具错误）。allowedTools/model/contextModifier 仍不被
// pipeline 消费（权限不扩张）——Skill 上下文闭合不宣称完整。

describe('C85-B Skill 旁支回归（工单 L87/L147）', () => {
  let savedEnv: Record<string, string | undefined>
  const ENV_KEYS = [
    'ATLAS_CONFIG_DIR',
    'ATLAS_COORDINATOR_MODE',
    'FEATURE_COORDINATOR_MODE',
  ]

  beforeEach(() => {
    savedEnv = {}
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
    // 防御戳：技能目录扫描落不存在目录（ENOENT → 空，零真实盘；se2b 惯例）
    process.env.ATLAS_CONFIG_DIR = '/mock-home'
    delete process.env.ATLAS_COORDINATOR_MODE
    delete process.env.FEATURE_COORDINATOR_MODE
    clearBundledSkills()
    clearCommandsCache()
    registerBundledSkill({
      name: 'wave0185-skill',
      description: 'd',
      getPromptForCommand: async () => [
        { type: 'text', text: 'SKILL BODY: follow these instructions' },
      ],
    })
  })

  afterEach(() => {
    clearBundledSkills()
    clearCommandsCache()
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k]
      else process.env[k] = savedEnv[k]
    }
  })

  /** 父消息（tool_use 块携带 id，供 SkillTool sourceToolUseID 打标）。 */
  function makeSkillParentMsg(): AssistantMessage {
    return {
      type: 'assistant',
      uuid: 'uuid-skill',
      timestamp: '2026-11-02T00:00:00Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu-skill-1', name: 'Skill', input: {} },
        ],
      },
    } as unknown as AssistantMessage
  }

  test('K① 真 SkillTool.call 产物经真 executeToolUse 交付（合法化 + 正文在场）', async () => {
    const skillRes = await SkillTool.call(
      { skill: 'wave0185-skill' },
      {},
      undefined,
      makeSkillParentMsg(),
    )
    // SkillTool 出口已按交付子集过滤：仅 isMeta 主内容（1 条）
    expect(skillRes.newMessages).toHaveLength(1)
    const out0 = skillRes.newMessages![0] as Record<string, unknown>
    expect(out0.isMeta).toBe(true)
    expect(out0.sourceToolUseID).toBe('tu-skill-1')

    // 真执行边界：SkillTool 产物作为 ToolResult.newMessages 过补充合法化门
    const r = await executeToolUse(tu('t-k1', 'Skill'), ASSISTANT, {
      tools: [
        makeSupTool('Skill', {
          data: skillRes.data,
          newMessages: skillRes.newMessages,
        }),
      ],
    })
    expect(r.isError).toBe(false)
    expect(r.newMessages).toHaveLength(1)
    assertLegalizedUser(r.newMessages![0], 't-k1')
    const inner = (r.newMessages![0] as Record<string, unknown>).message as Record<string, unknown>
    expect(JSON.stringify(inner.content)).toContain(
      'SKILL BODY: follow these instructions',
    )
    // res.data 渲染信息保持（G1 面不回归）
    expect(r.toolUseResult).toBe(skillRes.data)
  })

  test('K② 原始未过滤产物（含非 isMeta metadata 回显）过 executeToolUse → 明确工具错误', async () => {
    const raw = await processPromptSlashCommand(
      'wave0185-skill',
      '',
      getBundledSkills(),
      {},
    )
    // 两活路径同形：[metadata 非 isMeta, 主内容 isMeta]
    expect(raw.messages).toHaveLength(2)
    expect((raw.messages[0] as Record<string, unknown>).isMeta).not.toBe(true)
    expect((raw.messages[1] as Record<string, unknown>).isMeta).toBe(true)

    // 门锁：未过滤产物过合法化门 = 整调用明确工具错误，不交付不静默
    const r = await executeToolUse(tu('t-k2', 'Skill'), ASSISTANT, {
      tools: [makeSupTool('Skill', { data: 'x', newMessages: raw.messages })],
    })
    expect(r.isError).toBe(true)
    expect(String(r.block!.content)).toContain('tool_use_error')
    expect(r.newMessages).toBeUndefined()
  })

  test('K③ selectSkillDeliverableMessages：metadata 回显不交付，isMeta 主内容放行', async () => {
    const raw = await processPromptSlashCommand(
      'wave0185-skill',
      '',
      getBundledSkills(),
      {},
    )
    const picked = selectSkillDeliverableMessages(raw.messages)
    expect(picked).toHaveLength(1)
    expect(picked[0].isMeta).toBe(true)
    expect(JSON.stringify(picked[0].message?.content)).toContain('SKILL BODY')
  })
})

// ── params 防线二（provider 投影 document 块不静默丢弃）──────────────
//
// 工单 L88/L165：document 块无 provider（OpenAI 协议）映射——不静默丢弃，
// 投影文本显式指引 pages 参读（与 readTool full-PDF 支显式错误同口径）。

describe('C85-B params 防线二（document 块投影）', () => {
  test('P① tool_result content 含 document 块 → 投影文本显式指引 pages', () => {
    const out = toOpenAIMessages([
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'x-doc',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: 'aGk=',
                  },
                },
                { type: 'text', text: 'trailing text' },
              ],
            },
          ],
        },
      },
    ] as unknown as Parameters<typeof toOpenAIMessages>[0])
    const toolMsg = (out as Array<Record<string, unknown>>).find(
      m => m.role === 'tool',
    )
    expect(toolMsg).toBeDefined()
    expect(toolMsg!.tool_call_id).toBe('x-doc')
    const text = String(toolMsg!.content)
    expect(text).toContain('pages parameter')
    expect(text).toContain('not supported')
    // 同 content 其余块照常投影（document 提示不排挤 text）
    expect(text).toContain('trailing text')
  })
})
