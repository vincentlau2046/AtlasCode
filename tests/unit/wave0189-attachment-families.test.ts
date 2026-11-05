/**
 * 0.1.89 任务 B（Gap A 余面）— engine attachment 族逐族处置判别。
 *
 * RED 银行（fcdb51be，锁面前基线）：toOpenAIMessages attachment 支仅认
 * pdf_reference（C85-A），其余族无支静默落空——8 测试直证该形态。
 *
 * 本提交 = GREEN 契约：attachment 支改三段登记式（params.ts +
 * attachmentProjection.ts 单一事实源）：
 *  - 投影白名单 13 族（字段登记式，核心文本与 TUI wire 叶子逐字恒等——
 *    同叶子双面消费；file/directory 为指针式投影，不内联内容）。
 *  - 显式 skip 50 族（登记零产物：TUI「显式[]」9 + legacy 6 + 旧遗留 4 +
 *    会话态 11 + 统计 5 + 时效 6 + 记忆 4 + swarm 5——覆盖核算见工单
 *    §6.2 矩阵，64 族 = 投影 13 + pdf_reference 1 + skip 50）。
 *  - 未知型/畸形载荷 fail-visible marker（禁静默、禁 spread；C85-B
 *    sanitizer user+isMeta 契约零改动——本面只产 user 文本）。
 */
import { describe, test, expect } from 'bun:test'
import { toOpenAIMessages } from '../../src/modelprovider/params'
import { normalizeAttachmentForAPI } from '../../src/tui/utils/messages'

function attachMsg(attachment: unknown): Record<string, unknown> {
  return { type: 'attachment', attachment, uuid: 'u-0189', timestamp: 1 }
}

function project(att: unknown): any[] {
  return toOpenAIMessages([attachMsg(att)] as any)
}

function singleText(att: unknown): string {
  const out = project(att)
  expect(out.length).toBe(1)
  expect(out[0].role).toBe('user')
  return typeof out[0].content === 'string' ? out[0].content : JSON.stringify(out[0].content)
}

function tuiExpandedText(attachment: unknown): string {
  const out = normalizeAttachmentForAPI(attachment as any)
  for (const m of out as any[]) {
    const c = m?.message?.content ?? m?.content
    if (typeof c === 'string') return c
  }
  return ''
}

describe('0189 任务 B GREEN — engine attachment 族三段登记式处置', () => {
  test('① pdf_reference 恒等锚（C85-A 支原位不动）：投影不变', () => {
    const text = singleText({
      type: 'pdf_reference',
      filename: '/abs/report.pdf',
      pageCount: 12,
      fileSize: 2048,
      displayPath: 'report.pdf',
    })
    expect(text).toContain('/abs/report.pdf')
    expect(text).toMatch(/not attached to this message/i)
  })

  test('② queued_command 投影：用户意图框架 + 文本（同 wrapCommandText 语义）', () => {
    const text = singleText({ type: 'queued_command', prompt: 'continue the refactor' })
    expect(text).toContain('<system-reminder>')
    expect(text).toContain('The user sent a new message while you were working:\ncontinue the refactor')
    expect(text).toContain("you MUST address the user's message above")
    // task-notification 推导（commandMode 旧形状）
    const tn = singleText({ type: 'queued_command', prompt: 'done', commandMode: 'task-notification' })
    expect(tn).toContain('A background agent completed a task:\ndone')
  })

  test('③ plan_file_reference 投影：同叶子恒等（params 文本 ⊆ TUI 展开文本）', () => {
    const att = { type: 'plan_file_reference', planFilePath: '/p/plan.md', planContent: '# Plan\nstep 1' }
    const prov = singleText(att)
    expect(prov).toContain('A plan file exists from plan mode at: /p/plan.md')
    expect(prov).toContain('# Plan\nstep 1')
    // 同叶子恒等：包裹结构 + 内容文本逐字恒等（C85-A ⑤ 同判据；K3-A9 转义
    // 仅在内容含字面标签时生效，本例无字面标签 → 全文包含成立）。
    expect(tuiExpandedText(att)).toContain(prov)
  })

  test('④ todo_reminder / task_reminder 投影：状态列表 + 固定引导文案', () => {
    const todo = singleText({
      type: 'todo_reminder',
      content: [{ id: '1', content: 'write tests', status: 'pending' }],
      itemCount: 1,
    })
    expect(todo).toContain("The TodoWrite tool hasn't been used recently.")
    expect(todo).toContain('1. [pending] write tests')
    const task = singleText({
      type: 'task_reminder',
      content: [{ id: '7', subject: 'ship it', status: 'in_progress' }],
      itemCount: 1,
    })
    expect(task).toContain("The task tools haven't been used recently.")
    expect(task).toContain('#7. [in_progress] ship it')
    // 空列表 → 登记零产物（同 wire 空支）
    expect(project({ type: 'todo_reminder', content: [], itemCount: 0 })).toEqual([])
  })

  test('⑤ hook_success 门 + hook_additional_context / hook_blocking_error / hook_stopped_continuation 投影', () => {
    const hs = singleText({ type: 'hook_success', content: 'ctx', hookName: 'SessionHook', toolUseID: 't', hookEvent: 'SessionStart' })
    expect(hs).toContain('SessionHook hook success: ctx')
    // 非 SessionStart/UserPromptSubmit 事件 → skip（同 wire 门）
    expect(project({ type: 'hook_success', content: 'x', hookName: 'h', toolUseID: 't', hookEvent: 'PostToolUse' })).toEqual([])
    const hac = singleText({ type: 'hook_additional_context', content: ['c1', 'c2'], hookName: 'H', toolUseID: 't', hookEvent: 'PostToolUse' })
    expect(hac).toContain('H hook additional context: c1\nc2')
    const hbe = singleText({ type: 'hook_blocking_error', hookName: 'H', toolUseID: 't', hookEvent: 'PreToolUse', blockingError: { command: 'rm -rf /', blockingError: 'blocked by policy' } })
    expect(hbe).toContain('H hook blocking error from command: "rm -rf /": blocked by policy')
    const hsc = singleText({ type: 'hook_stopped_continuation', message: 'stopped', hookName: 'H', toolUseID: 't', hookEvent: 'Stop' })
    expect(hsc).toContain('H hook stopped continuation: stopped')
  })

  test('⑥ file / directory 指针式投影：路径在场 + 零内容内联 + 重读指引', () => {
    const f = singleText({ type: 'file', filename: '/a/b.ts', content: { type: 'text' }, displayPath: 'b.ts' })
    expect(f).toContain('/a/b.ts')
    expect(f).toContain('use the Read tool')
    expect(f).not.toContain('base64')
    const d = singleText({ type: 'directory', path: '/a', content: 'listing', displayPath: 'a' })
    expect(d).toContain('/a')
    expect(d).not.toContain('listing')
  })

  test('⑦ skill_listing / invoked_skills / critical_system_reminder 投影（同叶子恒等）', () => {
    const sl = singleText({ type: 'skill_listing', content: 'skills body', skillCount: 3, isInitial: true })
    expect(sl).toContain('The following skills are available for use with the Skill tool:\n\nskills body')
    const att = { type: 'invoked_skills', skills: [{ name: 's', path: '/s', content: 'skill body' }] }
    const inv = singleText(att)
    expect(inv).toContain('do not re-execute these skills')
    expect(inv).toContain('### Skill: s\nPath: /s\n\nskill body')
    expect(project({ type: 'invoked_skills', skills: [] })).toEqual([])
    expect(singleText({ type: 'critical_system_reminder', content: 'urgent note' })).toContain('urgent note')
  })

  test('⑧ 显式 skip 族零产物（登记面：TUI「显式[]」9 + legacy 6 + 旧遗留 4 + 会话态/统计/时效/记忆/swarm 代表）', () => {
    // TUI「显式[]」9 族（同叶子决策）
    expect(project({ type: 'already_read_file', filename: '/y.txt', content: {} })).toEqual([])
    expect(project({ type: 'command_permissions', allowedTools: ['Bash'] })).toEqual([])
    expect(project({ type: 'structured_output', content: '{}' } as any)).toEqual([])
    // legacy 6
    expect(project({ type: 'todo', content: 'legacy' } as any)).toEqual([])
    expect(project({ type: 'budget_usd', amount: 1 } as any)).toEqual([])
    // 旧遗留 4（旧 JSONL resume 可达，tombstone 同契）
    expect(project({ type: 'max_turns_reached' } as any)).toEqual([])
    expect(project({ type: 'bagel_console', content: 'x' } as any)).toEqual([])
    expect(project({ type: 'teammate_shutdown_batch', count: 3 } as any)).toEqual([])
    // 会话态/模式转换
    expect(project({ type: 'plan_mode_exit', planFilePath: '/p', planExists: true })).toEqual([])
    expect(project({ type: 'compaction_reminder' })).toEqual([])
    // 统计/时效/记忆/swarm 代表
    expect(project({ type: 'token_usage', inputTokens: 1, outputTokens: 1 } as any)).toEqual([])
    expect(project({ type: 'git_status_refresh', status: 'M f' })).toEqual([])
    expect(project({ type: 'relevant_memories', memories: [{ path: '/m', content: 'c', mtimeMs: 1 }] })).toEqual([])
    expect(project({ type: 'task_status', taskId: '1', taskType: 'local', status: 'completed', description: 'd', deltaSummary: null })).toEqual([])
  })

  test('⑨ 未知型/畸形载荷 fail-visible：显式拒绝 marker（禁静默）', () => {
    const unk = project({ type: 'unknown_future_family' })
    expect(unk.length).toBe(1)
    expect(unk[0].role).toBe('user')
    expect(unk[0].content).toContain('[attachment unknown_future_family')
    expect(unk[0].content).toContain('explicit rejection')
    // 畸形 pdf_reference（C85-A 守卫不过）
    const bad = project({ type: 'pdf_reference' })
    expect(bad.length).toBe(1)
    expect(bad[0].content).toContain('[attachment pdf_reference')
    // 畸形 attachment（无 attachment 字段）
    const missing = toOpenAIMessages([{ type: 'attachment', uuid: 'u', timestamp: 1 }] as any)
    expect(missing.length).toBe(1)
    expect(missing[0].content).toContain('[attachment <missing>')
    // 已知族畸形载荷 → marker 而非静默
    const badPlan = project({ type: 'plan_file_reference', planFilePath: 42 })
    expect(badPlan.length).toBe(1)
    expect(badPlan[0].content).toContain('[attachment plan_file_reference')
  })

  test('⑩ 投影纯文本：零 base64 / 零 image_url / 零 spread 原对象', () => {
    const out = toOpenAIMessages([
      attachMsg({ type: 'queued_command', prompt: 'x' }),
      attachMsg({ type: 'unknown_future_family' }),
      attachMsg({ type: 'file', filename: '/f', content: { type: 'text' }, displayPath: 'f' }),
    ] as any)
    const s = JSON.stringify(out)
    expect(s).not.toContain('base64')
    expect(s).not.toContain('image_url')
    expect(s).not.toContain('data:')
    for (const m of out) expect(m.role).toBe('user')
  })
})
