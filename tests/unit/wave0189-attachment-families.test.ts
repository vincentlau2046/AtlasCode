/**
 * 0.1.89 任务 B（Gap A 余面）— engine attachment 族逐族处置判别。
 *
 * RED 银行（本提交，锁面前基线直证）：toOpenAIMessages attachment 支仅认
 * pdf_reference（C85-A），其余族无支静默落空——工单 §6.2 (族×路径) 枚举
 * 矩阵判别：真集合 = resume JSONL 持久化族 × engine 直达（headless 车道
 * 零产点已 grep 实证；TUI 车道经 messages.ts:2300 normalize 已投影）。
 * 本文件逐族直证静默丢弃形态，作为处置（投影/显式 skip/fail-visible）
 * 前的基线证据——禁只验 GREEN 不验 base RED（工单 Review Focus 3）。
 *
 * 处置矩阵（§6.2 锁面预告，GREEN 提交翻转断言）：
 *  - 投影白名单（字段登记式，同叶子语义沿 051-A/C85-A）：plan_file_reference
 *    / invoked_skills / skill_listing / todo_reminder / task_reminder /
 *    queued_command / critical_system_reminder / hook_success(SessionStart·
 *    UserPromptSubmit 门) / hook_additional_context / hook_blocking_error /
 *    hook_stopped_continuation / file·directory（指针式，不内联内容——
 *    时效性失真防护）。
 *  - 显式 skip（登记零产物）：TUI 有意不投影「显式[]」9 + legacy 6 + 旧版
 *    遗留 resume 可达 4（bagel_console/max_turns_reached/current_session_
 *    memory/teammate_shutdown_batch——渲染面 tombstone 同契，删除条件不
 *    成立）+ 会话态/模式转换/统计/时效面 30（重放误导或零模型价值）。
 *  - 未知型 fail-visible：显式拒绝文本 marker（engine 侧无 logAntError，
 *    in-band fail-visible 替代；C85-B sanitizer 契约零改动）。
 */
import { describe, test, expect } from 'bun:test'
import { toOpenAIMessages } from '../../src/modelprovider/params'

function attachMsg(attachment: unknown): Record<string, unknown> {
  return { type: 'attachment', attachment, uuid: 'u-0189', timestamp: 1 }
}

function project(att: unknown): unknown[] {
  return toOpenAIMessages([attachMsg(att)] as any)
}

describe('0189 任务 B RED 银行 — engine attachment 族静默丢弃直证（锁面前基线）', () => {
  test('投影候选族（queued_command 排队用户意图）静默丢弃', () => {
    expect(project({ type: 'queued_command', prompt: 'continue the refactor' })).toEqual([])
  })

  test('投影候选族（plan_file_reference 计划上下文）静默丢弃', () => {
    expect(
      project({ type: 'plan_file_reference', planFilePath: '/p/plan.md', planContent: '# Plan' }),
    ).toEqual([])
  })

  test('投影候选族（todo_reminder / task_reminder 状态列表）静默丢弃', () => {
    expect(
      project({ type: 'todo_reminder', content: [{ id: '1', content: 'a', status: 'pending' }], itemCount: 1 }),
    ).toEqual([])
    expect(
      project({ type: 'task_reminder', content: [{ id: '1', subject: 'a', status: 'pending' }], itemCount: 1 }),
    ).toEqual([])
  })

  test('投影候选族（hook_success / hook_additional_context）静默丢弃', () => {
    expect(
      project({ type: 'hook_success', content: 'ctx', hookName: 'h', toolUseID: 't', hookEvent: 'SessionStart' }),
    ).toEqual([])
    expect(
      project({ type: 'hook_additional_context', content: ['c1'], hookName: 'h', toolUseID: 't', hookEvent: 'PostToolUse' }),
    ).toEqual([])
  })

  test('投影候选族（file / directory 引用面）静默丢弃', () => {
    expect(project({ type: 'file', filename: '/a/b.ts', content: { type: 'text' }, displayPath: 'b.ts' })).toEqual([])
    expect(project({ type: 'directory', path: '/a', content: 'listing', displayPath: 'a' })).toEqual([])
  })

  test('投影候选族（skill_listing / invoked_skills / critical_system_reminder）静默丢弃', () => {
    expect(project({ type: 'skill_listing', content: 'skills...', skillCount: 3, isInitial: true })).toEqual([])
    expect(
      project({ type: 'invoked_skills', skills: [{ name: 's', path: '/s', content: 'body' }] }),
    ).toEqual([])
    expect(project({ type: 'critical_system_reminder', content: 'urgent' })).toEqual([])
  })

  test('skip 候选族（显式[] 9 / legacy 6 / 旧遗留 / 会话态面）同样静默落空（当前无登记面）', () => {
    expect(project({ type: 'already_read_file', filename: '/y.txt', content: {} })).toEqual([])
    expect(project({ type: 'command_permissions', allowedTools: ['Bash'] })).toEqual([])
    expect(project({ type: 'token_usage', inputTokens: 1, outputTokens: 1 } as any)).toEqual([])
    expect(project({ type: 'todo', content: 'legacy' } as any)).toEqual([])
    expect(project({ type: 'max_turns_reached' } as any)).toEqual([])
    expect(project({ type: 'teammate_shutdown_batch', count: 3 } as any)).toEqual([])
  })

  test('未知型与畸形 attachment 静默落空（当前无 fail-visible）', () => {
    expect(project({ type: 'unknown_future_family' })).toEqual([])
    expect(toOpenAIMessages([{ type: 'attachment', uuid: 'u', timestamp: 1 }] as any)).toEqual([])
  })
})
