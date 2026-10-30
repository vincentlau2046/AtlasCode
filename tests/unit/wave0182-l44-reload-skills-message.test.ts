/**
 * 0.1.82 K3-C L44 判别单测（上游 299）：/reload-skills 回执文案补
 * 「完整 skill 列表将在下一条消息重发给模型」语义。
 *
 * 机制已在场（0.1.60 TUI-3）：reloadSkillsNow() = clearSkillCaches +
 * clearCommandsCache + resetSentSkillNames + skillsChanged.emit——
 * resetSentSkillNames 使下一条用户提示触发完整 skill 列表重发。
 * 修前缺口 = 回执文案未说明该语义（用户不知 registry 刷新对模型可见）。
 *
 * 修前红面：现文案无 skill list 重发表述。修后面 = 文案补
 * re-sent to the model / next message 语义。
 *
 * 隔离纪律：reloadSkillsNow 全内存副作用（cache 清 + Set 清 + emit），
 * unit 层零盘零模型安全；_args/_context 未消费按最小形传入。
 */
import { describe, expect, test } from 'bun:test'

import { call } from '../../src/tui/commands/reload-skills/reload-skills.js'

describe('K3-C L44：/reload-skills 回执文案含 skill 列表重发语义', () => {
  test('回执说明完整 skill 列表将随下一条消息重发给模型', async () => {
    const result = await call('', {} as never)
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      // registry 刷新语义（原有，恒等锚）
      expect(result.value).toContain('registry refreshed')
      // 新增：skill 列表重发语义（修前红）
      expect(result.value).toContain('re-sent to the model')
      expect(result.value).toContain('next message')
    }
  })
})
