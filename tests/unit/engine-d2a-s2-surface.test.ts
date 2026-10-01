/**
 * D-2a S2（M5 切端）判别单测：CompactionResult 富面加字段 +
 * buildPostCompactMessages ordering 复原（旧仓逐字：
 * boundaryMarker → summaryMessages → messagesToKeep → attachments → hookResults）。
 *
 * 判别目标：
 *   1. 富 ordering：attachments/hookResults 非空时按旧仓顺序进拼接（S2 前
 *      engine 裁剪体只有 3 段，此断言 RED 成立即回填缺失坐实）。
 *   2. 裁剪回归护栏：attachments/hookResults 空数组 = 旧 3 段 ordering
 *      （engine 裁剪 producer 行为零变更——S8 切端前 TUI 仍走 orchestrator 富体）。
 *   3. 裁剪 producer 必填字段存在性：compactConversation 结果携空数组
 *      （富放置归 S3，字段先立 = 类型契约 additive）。
 */
import {
  buildPostCompactMessages,
  compactConversation,
  type CompactionResult,
  type HookResultMessage,
} from '../../src/engine'
import type { Message } from '../../src/shared'

const msg = (uuid: string, extra: Record<string, unknown> = {}): Message => ({
  uuid,
  type: 'user',
  role: 'user',
  ...extra,
})

// HookResultMessage 索引签名（[key: string]: any）允许 uuid 附加字段
const hookResult = (uuid: string, hookName: string): HookResultMessage => ({
  type: 'hook_result',
  hookName,
  result: 'ok',
  uuid,
})

describe('D-2a S2 buildPostCompactMessages ordering', () => {
  test('富 ordering：boundary → summary → keep → attachments → hookResults', () => {
    const result: CompactionResult = {
      boundaryMarker: msg('boundary', { type: 'system', subtype: 'compact_boundary' }),
      summaryMessages: [msg('s1')],
      attachments: [
        { ...msg('a1'), attachment: { type: 'file' } },
        { ...msg('a2'), attachment: { type: 'plan' } },
      ],
      hookResults: [hookResult('h1', 'pre')],
      messagesToKeep: [msg('k1')],
    }
    expect(buildPostCompactMessages(result).map((m) => m.uuid)).toEqual([
      'boundary',
      's1',
      'k1',
      'a1',
      'a2',
      'h1',
    ])
  })

  test('裁剪回归护栏：空 attachments/hookResults = 旧 3 段 ordering', () => {
    const result: CompactionResult = {
      boundaryMarker: msg('boundary'),
      summaryMessages: [msg('s1')],
      attachments: [],
      hookResults: [],
      messagesToKeep: [msg('k1')],
    }
    expect(buildPostCompactMessages(result).map((m) => m.uuid)).toEqual([
      'boundary',
      's1',
      'k1',
    ])
  })
})

describe('D-2a S2 compactConversation 裁剪 producer 字段存在性', () => {
  test('result.attachments/hookResults = 空数组（富放置归 S3）', async () => {
    const result = await compactConversation(
      [msg('m1'), msg('m2')],
      { summarize: async () => 'SUMMARY' },
    )
    expect(result.attachments).toEqual([])
    expect(result.hookResults).toEqual([])
    expect(result.summaryMessages.length).toBe(1)
  })
})
