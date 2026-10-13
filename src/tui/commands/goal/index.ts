/**
 * /goal [set <condition> | clear] — 0.1.62 /goal 核心+持久化波（CC 2.1.139）。
 *
 * 跨回合完成条件新原语：set → armed（loop terminal 支评估器续跑，条件 ≤500
 * 字符单一可测终态；one goal at a time 新设替换旧）；clear → 提前清除。
 * 无参 = 状态面。达成为自清除（loop 评估器判达成 → clearGoal + 通知行，不提示
 * 用户 run /goal clear〔2.1.173 原文纪律〕）。
 *
 * 双形态注册（/context 先例）：交互面 = local-jsx（渲染 C0-3 overlay 面板）；
 * 非交互面（headless -p，C0-5）= local 文本版。两者同 name 'goal'（/help·cmd
 * 探针按 name 去重计 1 项，context/contextNonInteractive 同模式）。
 */
import { getIsNonInteractiveSession } from 'src/bootstrap'
import type { Command } from '../../commands.js'

export const goal: Command = {
  name: 'goal',
  description: 'Set or clear a goal condition (set <condition> | clear)',
  argumentHint: '[set <condition> | clear]',
  isEnabled: () => !getIsNonInteractiveSession(),
  type: 'local-jsx',
  load: () => import('./goal.js'),
}

export const goalNonInteractive: Command = {
  type: 'local',
  name: 'goal',
  supportsNonInteractive: true,
  description: 'Set or clear a goal condition (set <condition> | clear)',
  argumentHint: '[set <condition> | clear]',
  get isHidden() {
    return !getIsNonInteractiveSession()
  },
  isEnabled() {
    return getIsNonInteractiveSession()
  },
  load: () => import('./goal-noninteractive.js'),
}
