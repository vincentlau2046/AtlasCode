/**
 * R-087-1（0.1.87 插入件 II）— runToolBatch sanitizer × TUI SkillTool
 * attachment 直通积分缝（工单 §7 约束③：接线级测试，真 TUI SkillTool
 * 全链 processPromptSlashCommand→getMessagesForPromptSlashCommand→
 * getAttachments，真 engine executeToolUse 合法化门；禁注入值测试冒充）。
 *
 * 根因（gate-087 §四）：TUI face getMessagesForPromptSlashCommand 无条件
 * 追加 command_permissions attachment（+ SKILL.md @-mention 抽取附件）→
 * SkillTool newMessages 含 attachment 型直通（过滤仅删 <command-message>
 * 元数据 user 消息）→ C85-B sanitizer 整批拒交付：tool_use_error:
 * supplemental newMessages[1] type must be 'user', got attachment。
 * 判别基线（约束⑤）：gate 双面 RED-RED 已银行——face r1ef（同错 3 次）↔
 * base r1eb（0.1.86 发布构建，同错 4 次），本文件不重立网关轮。
 *
 * 修法（f4 合缝单定案）：SkillTool 产方合形——attachment → user+isMeta
 * 白名单投影：command_permissions 零条（wire 面 messages.ts 同叶子恒 []，
 * 权限授予由 contextModifier/data.allowedTools 承载 = 权限零扩张）；
 * 'file'/'directory'（wire 面产 tool_result 伪回应块、sanitizer 禁）
 * seam 局部 text 形投影；其余型委派 normalizeAttachmentForAPI 同叶子
 * （未知型 logAntError+[]，与 wire 面同纪律）。sanitizer 零改动。
 *
 * 分层纪律：func 层真 fs + chdir（mkdtemp；ATLAS_CONFIG_DIR 指 tmp 防
 * 真用户目录污染；零网络 / 零模型 / 零 PTY）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { executeToolUse, type Tool } from '../../src/engine'
import { SkillTool as TuiSkillTool } from '../../src/tui/tools/SkillTool/SkillTool.js'
import { clearSkillCaches } from '../../src/tui/skills/loadSkillsDir.js'
import { clearSkillCaches as clearEngineSkillCaches } from '../../src/engine/skill/loadSkillsDir.js'
import type { AssistantMessage, ToolUseBlock } from '../../src/shared'

const SKILL_PLAIN = 'wave0187-seam-plain'
const SKILL_MENTION = 'wave0187-seam-mention'
const BODY_PLAIN = 'SEAM-PLAIN-BODY-0187: follow these instructions.'
const NOTES_CONTENT = 'SEAM-NOTES-CONTENT-0187: alpha beta gamma.'

const TMP = mkdtempSync(join(tmpdir(), 'atlas-wave0187-seam-'))
const CFG = join(TMP, 'cfg') // ATLAS_CONFIG_DIR（空用户技能目录，防污染）
const PROJ = join(TMP, 'proj') // ws（.atlas/skills + notes.txt）
// @-mention 用绝对路径：FileReadTool.call 路径根锚定进程启动 cwd（getCwd 读
// bootstrap 态），测环境 chdir 在启动后，相对路径会解析到 worktree 根致
// "File does not exist"（throw → generateFileAttachment 外层 catch → null →
// 附件静默滤除）。生产 face 里 getCwd 即 session cwd，相对形态不受影响；
// 本测试断言的是 attachment→投影→合法化门交付链，非路径解析域（#261）。
const NOTES_PATH = join(PROJ, 'notes.txt')
const BODY_MENTION = `SEAM-MENTION-BODY-0187: consult @${NOTES_PATH} first.`

const ORIG_CWD = process.cwd()
const PREV_CONFIG_DIR = process.env.ATLAS_CONFIG_DIR
const PREV_DELETED = ['ATLAS_SIMPLE', 'ATLAS_DISABLE_ATTACHMENTS'].map(k => ({
  k,
  v: process.env[k],
}))

function writeSkill(name: string, body: string): void {
  const dir = join(PROJ, '.atlas', 'skills', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Seam probe ${name}\n---\n${body}\n`,
  )
}

/** TUI call 链最小 context（getAttachments 族只读这些面）。 */
function fakeContext() {
  return {
    getAppState: () => ({
      mcp: { commands: [] },
      toolPermissionContext: {
        alwaysDenyRules: {},
        alwaysAskRules: {},
        alwaysAllowRules: {},
      },
    }),
    options: {
      tools: [],
      mainLoopModel: 'test-model',
      mcpClients: [],
      agentDefinitions: { activeAgents: [] },
    },
    messages: [],
    readFileState: new Map(),
  } as never
}

const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-seam',
  timestamp: '2026-11-03T00:00:00Z',
  message: { id: 'm-seam', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

function tu(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { type: 'tool_use', id, name, input }
}

/** 父消息（tool_use 块携带 id，供 SkillTool sourceToolUseID 打标）。 */
function makeParentMsg(): AssistantMessage {
  return {
    type: 'assistant',
    uuid: 'uuid-seam',
    timestamp: '2026-11-03T00:00:00Z',
    message: {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'tu-seam-1', name: 'Skill', input: {} },
      ],
    },
  } as unknown as AssistantMessage
}

/** 真 TUI SkillTool 产物接 engine 合法化门（接线 = runToolBatch sanitizer 内门）。 */
async function runSeamThroughEngineGate(skill: string, tuId: string) {
  const skillRes = await TuiSkillTool.call(
    { skill },
    fakeContext(),
    undefined,
    makeParentMsg(),
  )
  const sup: Tool = {
    name: 'Skill',
    isConcurrencySafe: () => false,
    call: async () => ({
      data: skillRes.data,
      ...(skillRes.newMessages ? { newMessages: skillRes.newMessages } : {}),
    }),
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
  const r = await executeToolUse(tu(tuId, 'Skill'), ASSISTANT, { tools: [sup] })
  return { skillRes, r }
}

/** 合法化形谓词：user 消息 + isMeta + 源 tool_use 关联（wave0185 同口径）。 */
function assertLegalizedUser(m: unknown, sourceToolUseId: string): void {
  const msg = m as Record<string, unknown>
  expect(msg.type).toBe('user')
  expect(msg.isMeta).toBe(true)
  expect(typeof msg.uuid).toBe('string')
  expect(msg.sourceToolUseId).toBe(sourceToolUseId)
  const inner = msg.message as Record<string, unknown>
  expect(inner.role).toBe('user')
}

beforeAll(() => {
  mkdirSync(CFG, { recursive: true })
  writeSkill(SKILL_PLAIN, BODY_PLAIN)
  writeSkill(SKILL_MENTION, BODY_MENTION)
  writeFileSync(NOTES_PATH, `${NOTES_CONTENT}\n`)
  process.env.ATLAS_CONFIG_DIR = CFG
  for (const { k } of PREV_DELETED) delete process.env[k]
  process.chdir(PROJ)
})

afterAll(() => {
  clearSkillCaches()
  clearEngineSkillCaches()
  process.chdir(ORIG_CWD)
  if (PREV_CONFIG_DIR === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = PREV_CONFIG_DIR
  for (const { k, v } of PREV_DELETED) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  rmSync(TMP, { recursive: true, force: true })
})

describe('R-087-1 SkillTool attachment 直通缝（TUI SkillTool → engine 合法化门）', () => {
  test('① gate 缝直证（command_permissions 无条件追加族）：产物过合法化门交付，attachment 型零残留在修后', async () => {
    const { skillRes, r } = await runSeamThroughEngineGate(SKILL_PLAIN, 't-seam-1')
    // RED 见证：修前 isError=true 且 block.content 即 gate 同串
    // （supplemental newMessages[1] type must be 'user', got attachment）
    if (r.isError) {
      console.error('[R-087-1 RED witness]', String(r.block?.content))
    }
    expect(r.isError).toBe(false)
    // command_permissions → 零条（wire 面 messages.ts 同叶子）；thread 族附件
    // （date_change 等，测环境实测流动）经 wire 叶子投影为 user+isMeta。
    // 交付面 = 主内容 + 投影消息，全部合法化形、零 attachment 型。
    expect(r.newMessages!.length).toBeGreaterThanOrEqual(1)
    for (const m of r.newMessages!) assertLegalizedUser(m, 't-seam-1')
    const contents = r.newMessages!.map(m =>
      JSON.stringify((m as Record<string, unknown>).message),
    )
    expect(contents.some(s => s!.includes(BODY_PLAIN))).toBe(true)
    // res.data 渲染信息保持（G1 面不回归）
    expect(r.toolUseResult).toBe(skillRes.data)
  })

  test('② SKILL.md @-mention 抽取附件：投影 user+isMeta 交付且文件内容在场', async () => {
    const { r } = await runSeamThroughEngineGate(SKILL_MENTION, 't-seam-2')
    if (r.isError) {
      console.error('[R-087-1 RED witness]', String(r.block?.content))
    }
    expect(r.isError).toBe(false)
    expect(r.newMessages!.length).toBeGreaterThanOrEqual(2) // 主内容 + @-mention 投影
    for (const m of r.newMessages!) assertLegalizedUser(m, 't-seam-2')
    const contents = r.newMessages!.map(m =>
      JSON.stringify((m as Record<string, unknown>).message),
    )
    expect(contents.some(s => s!.includes(BODY_MENTION))).toBe(true)
    expect(contents.some(s => s!.includes('SEAM-NOTES-CONTENT-0187'))).toBe(true)
  })

  test('③ 投影形直判（不经 engine 门）：SkillTool 出口无 attachment 型，全 user+isMeta', async () => {
    const skillRes = await TuiSkillTool.call(
      { skill: SKILL_PLAIN },
      fakeContext(),
      undefined,
      makeParentMsg(),
    )
    // 判别信号：出口零 attachment 型（修前 command_permissions/thread 族直通）
    const types = (skillRes.newMessages ?? []).map(
      m => (m as Record<string, unknown>).type,
    )
    expect(types).not.toContain('attachment')
    expect(types.length).toBeGreaterThanOrEqual(1)
    for (const m of skillRes.newMessages ?? []) {
      const rec = m as Record<string, unknown>
      expect(rec.type).toBe('user')
      expect(rec.isMeta).toBe(true)
      expect((rec.message as Record<string, unknown>).role).toBe('user')
    }
    const contents = (skillRes.newMessages ?? []).map(m =>
      JSON.stringify((m as Record<string, unknown>).message),
    )
    expect(contents.some(s => s!.includes(BODY_PLAIN))).toBe(true)
  })
})
