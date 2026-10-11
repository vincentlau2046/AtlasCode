/**
 * FX-04 + PT-04（0.1.50，工单 §1.4）invoked-skill 态跨压缩保全 +
 * 「勿重执行 setup」提示词措辞：
 *
 * FX-04 定因（verify 升级落码）：附件重建链
 * （compact.ts createSkillAttachmentIfNeeded → invoked_skills 附件 →
 * post-compact System Reminder 渲染）已全接线，但状态源
 * src/tui/bootstrapState.ts 的 addInvokedSkill / getInvokedSkillsForAgent /
 * clearInvokedSkillsForAgent 为 H6 no-op 占位（H6 前向接缝登记）——
 * 注册永不发生，getInvokedSkillsForAgent 恒空 Map →
 * createSkillAttachmentIfNeeded 恒 null → invoked-skill 态跨压缩
 * **未**保全（压缩后模型可重执行 skill 一次性 setup action）。
 *
 * PT-04：invoked_skills 附件的 System Reminder 提示词（messages.ts
 * normalizeAttachmentForAPI 'invoked_skills' 支）缺「勿重执行 setup」
 * 措辞 → 补措辞 + 在场断言。
 *
 * 判别口径（修前红 → 修后绿）：
 *   修前：bootstrapState 三件 = no-op / 恒空 Map → ①-⑤ 状态断言红 +
 *    ⑥ 附件断言红（null）；⑦ PT-04 措辞断言红（缺措辞）
 *   修后：真 Map 状态（per-agent 隔离 + 重调刷新 + fork 释放）+ 附件
 *    在场 + 提示词含「do not re-execute … setup … again」措辞 → 绿
 *
 * 消费点契约（面核）：addInvokedSkill(name, path, content, agentId) =
 * processSlashCommand.tsx:663 / conversationRecovery.ts:326；
 * getInvokedSkillsForAgent(agentId) 值形 {skillName, skillPath, content,
 * invokedAt} = compact.ts createSkillAttachmentIfNeeded（.size /
 * .values() / invokedAt 降序）+ skillImprovement.ts:55；
 * clearInvokedSkillsForAgent(agentId) = SkillTool.ts:204 fork 支 finally。
 *
 * 分层纪律：unit 层——纯模块态操作 + 提示词渲染（零网络 / 零真盘 /
 * 零 LLM）；TUI 模块图 import 先例 = permission-reject-abort.test.ts。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
  addInvokedSkill,
  clearInvokedSkillsForAgent,
  getInvokedSkillsForAgent,
} from '../../src/tui/bootstrapState'
import { createSkillAttachmentIfNeeded } from '../../src/tui/contextBodies/compact'
import { normalizeAttachmentForAPI } from '../../src/tui/utils/messages'

type InvokedSkillRecord = {
  skillName: string
  skillPath: string
  content: string
  invokedAt: number
}

function records(agentId: string | null): InvokedSkillRecord[] {
  return Array.from(getInvokedSkillsForAgent(agentId).values()) as unknown as InvokedSkillRecord[]
}

afterEach(() => {
  clearInvokedSkillsForAgent('fx04-main')
  clearInvokedSkillsForAgent('fx04-w1')
  clearInvokedSkillsForAgent('fx04-w2')
})

describe('FX-04 invoked-skill 状态面（bootstrapState 真状态）', () => {
  test('① addInvokedSkill 登记：getInvokedSkillsForAgent 返条目（skillName/skillPath/content/invokedAt）', () => {
    addInvokedSkill('fx04-probe', '/probe/skill.md', 'probe body', 'fx04-w1')
    const recs = records('fx04-w1')
    expect(recs).toHaveLength(1)
    expect(recs[0]).toMatchObject({
      skillName: 'fx04-probe',
      skillPath: '/probe/skill.md',
      content: 'probe body',
    })
    expect(typeof recs[0].invokedAt).toBe('number')
  })

  test('② 重调刷新：同名再调 = 条目不增 + content/invokedAt 刷新（most-recent 排序输入）', () => {
    addInvokedSkill('fx04-probe', '/p1', 'old', 'fx04-w1')
    const first = records('fx04-w1')[0].invokedAt
    // 破 Date.now 同毫秒：显式延后
    addInvokedSkill('fx04-probe', '/p2', 'new', 'fx04-w1')
    const recs = records('fx04-w1')
    expect(recs).toHaveLength(1)
    expect(recs[0].content).toBe('new')
    expect(recs[0].skillPath).toBe('/p2')
    expect(recs[0].invokedAt).toBeGreaterThanOrEqual(first)
  })

  test('③ per-agent 隔离：主会话（null）与命名 agent 各自独立', () => {
    addInvokedSkill('fx04-main-skill', '/m', 'main body', null)
    addInvokedSkill('fx04-w2-skill', '/w2', 'w2 body', 'fx04-w2')
    expect(records(null)).toHaveLength(1)
    expect(records(null)[0].skillName).toBe('fx04-main-skill')
    expect(records('fx04-w2')).toHaveLength(1)
    expect(records('fx04-w1')).toHaveLength(0)
  })

  test('④ 未登记 agent = 空 Map（非 undefined、非他 agent 的 Map）', () => {
    addInvokedSkill('fx04-w1-skill', '/w1', 'w1 body', 'fx04-w1')
    const unknown = getInvokedSkillsForAgent('fx04-unknown')
    expect(unknown).toBeInstanceOf(Map)
    expect(unknown.size).toBe(0)
  })

  test('⑤ clearInvokedSkillsForAgent：fork 支 finally 释放语义（该 agent 清空，他 agent 不动）', () => {
    addInvokedSkill('fx04-a', '/a', 'a', 'fx04-w1')
    addInvokedSkill('fx04-b', '/b', 'b', 'fx04-w2')
    clearInvokedSkillsForAgent('fx04-w1')
    expect(records('fx04-w1')).toHaveLength(0)
    expect(records('fx04-w2')).toHaveLength(1)
  })
})

describe('FX-04 附件面（createSkillAttachmentIfNeeded 经真状态出活）', () => {
  test('⑥ 已登记 skill → invoked_skills 附件在场（skill 名 + 内容）', () => {
    addInvokedSkill('fx04-probe', '/probe/skill.md', 'probe body', 'fx04-w1')
    const att = createSkillAttachmentIfNeeded('fx04-w1')
    expect(att).not.toBeNull()
    expect(att!.attachment.type).toBe('invoked_skills')
    const skills = (att!.attachment as { skills: InvokedSkillRecord[] })
      .skills
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('fx04-probe')
    expect(skills[0].content).toContain('probe body')
  })

  test('⑥b 未登记 agent → null（零回归：无 skill 会话不挂附件）', () => {
    expect(createSkillAttachmentIfNeeded('fx04-unknown')).toBeNull()
  })
})

describe('PT-04 invoked_skills 提示词「勿重执行 setup」措辞在场', () => {
  test('⑦ System Reminder 含 do-not-re-execute-setup 措辞（在场断言）', () => {
    const msgs = normalizeAttachmentForAPI({
      type: 'invoked_skills',
      skills: [
        {
          name: 'fx04-probe',
          path: '/probe/skill.md',
          content: 'probe body',
        },
      ],
    })
    const text = msgs
      .flatMap(m =>
        typeof m.message.content === 'string'
          ? [m.message.content]
          : m.message.content.map(
              (b: { text?: string }) => String(b.text ?? ''),
            ),
      )
      .join('\n')
    expect(text).toContain('do not re-execute')
    expect(text.toLowerCase()).toContain('setup')
    expect(text).toContain('context only')
  })

  test('⑦b 空 skills → 零消息（不挂空提醒）', () => {
    const msgs = normalizeAttachmentForAPI({
      type: 'invoked_skills',
      skills: [],
    })
    expect(msgs).toHaveLength(0)
  })
})
