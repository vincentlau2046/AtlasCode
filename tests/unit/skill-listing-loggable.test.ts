/**
 * skill_listing 附件持久化例外判别单测（R4 S1 根因收口，#249 S5 前置）。
 *
 * 背景（2026-10-02 定位链）：
 *  - 发现→解析→listing 生成全链验通（getSkillToolCommands 出 skill 含
 *    whenToUse marker；--debug-file 探针「Sending 8 skills via attachment」）。
 *  - 但 isLoggableMessage（旧仓「non-ants 滤附件」遗留，双车道各一份）滤掉
 *    一切 attachment 型消息 → skill_listing 永不进 session jsonl：
 *    ① R4 S1 的 jsonl grep 断言恒 0 命中（验真面失效）
 *    ② conversationRecovery.ts:334 resume 锁（扫转录找 skill_listing →
 *       suppressNextSkillListing）成死代码（它预设 listing 已持久化）
 *  - 裁定：skill_listing 内容 = 用户自有 skill 元数据（无训练敏感面，
 *    本地转录目录本就归用户），例外放行。其余附件族维持过滤。
 *
 * 判别点（mutation-red 面）：
 *  - ① skill_listing 附件 = 可持久化（修前 = false，本测红）
 *  - ② 其他附件族（changed_files）维持过滤（防例外过宽）
 *  - ③ progress / 无 attachment 字段的裸 attachment 维持过滤
 *  - ④ user/assistant 恒真（回归）
 * 双车道（engine facade + tui sessionStorage）各验一遍——防再次测错域。
 */
import { describe, expect, test } from 'bun:test'
import { isLoggableMessage as engineIsLoggable } from '../../src/engine'
import { isLoggableMessage as tuiIsLoggable } from '../../src/tui/utils/sessionStorage'

const skillListing = {
  type: 'attachment',
  attachment: {
    type: 'skill_listing',
    content: 'The following skills are available...\nr4-hyphen-whenuse',
    skillCount: 1,
    isInitial: true,
  },
} as never

const changedFiles = {
  type: 'attachment',
  attachment: { type: 'changed_files', files: [] },
} as never

for (const [lane, fn] of [
  ['engine', engineIsLoggable],
  ['tui', tuiIsLoggable],
] as const) {
  describe(`isLoggableMessage（${lane} 车道）skill_listing 例外`, () => {
    test('① skill_listing 附件可持久化（判别点）', () => {
      expect(fn(skillListing)).toBe(true)
    })

    test('② 其他附件族维持过滤', () => {
      expect(fn(changedFiles)).toBe(false)
    })

    test('③ progress / 裸 attachment 维持过滤', () => {
      expect(fn({ type: 'progress' } as never)).toBe(false)
      expect(fn({ type: 'attachment' } as never)).toBe(false)
    })

    test('④ user / assistant 恒真（回归）', () => {
      expect(fn({ type: 'user' } as never)).toBe(true)
      expect(fn({ type: 'assistant' } as never)).toBe(true)
    })
  })
}
