/**
 * /goal 非交互面（headless -p，C0-5）——local 文本版（0.1.62 /goal 波）。
 *
 * 与交互面 goal.tsx（local-jsx，渲染 C0-3 overlay 面板）同语义：set/clear/状态
 * 三径走参数（0.1.60 命令面先例模板），仅以纯文本回报（headless 无 TUI 面板
 * 渲染面）。goal 续跑核心 = 引擎 loop terminal 支（C0-2），headless 经共享
 * queryAgentLoop 行为恒等（本命令面仅 arm/clear 状态机）。
 */
import type { LocalCommandCall } from '../../types/command.js'
import {
  MAX_GOAL_CONDITION_CHARS,
  armGoal,
  clearGoal,
  getGoalCondition,
  getGoalStateForPersistence,
  isGoalArmed,
  goalClearedNotification,
  saveGoalState,
} from '../../../engine/index.js'

const USAGE = `Usage:
  /goal set <condition>   Arm a goal condition (replaces any existing goal)
  /goal clear             Clear the current goal
  /goal                   Show the current goal
Conditions must be a single testable end-state, ≤${MAX_GOAL_CONDITION_CHARS} characters.`

export const call: LocalCommandCall = async (args, _context) => {
  const raw = (args ?? '').trim()
  const parts = raw.split(/\s+/)
  const sub = parts[0]?.toLowerCase()

  if (sub === 'set') {
    const condition = raw.slice(parts[0].length).trim()
    if (condition === '') {
      return {
        type: 'text',
        value: `Missing goal condition.\n${USAGE}`,
      }
    }
    const r = armGoal(condition)
    // strict:false 项目：`!r.ok` 不收窄判别联合，须 `=== false` 字面量收窄
    if (r.ok === false) {
      return { type: 'text', value: r.reason }
    }
    // C0-1 持久化：armed goal 写入 session metadata 缓存（首条 user/assistant
    // 消息经 materializeSessionFile 落盘 + reAppendSessionMetadata 尾部窗；
    // --resume/compact 恢复经 restoreGoalState）。
    saveGoalState(getGoalStateForPersistence())
    return {
      type: 'text',
      value: `Goal armed: ${getGoalCondition()}\nThe agent will continue working until this condition is met.`,
    }
  }

  if (sub === 'clear') {
    if (!isGoalArmed()) {
      return { type: 'text', value: 'No goal is currently armed.' }
    }
    clearGoal()
    // C0-1 持久化：cleared 快照写盘（armed=false → 恢复时 no-op 防旧态泄漏）。
    saveGoalState(getGoalStateForPersistence())
    return { type: 'text', value: goalClearedNotification() }
  }

  // 状态面（无参或未知子动作）
  if (isGoalArmed()) {
    return {
      type: 'text',
      value: `Current goal: ${getGoalCondition()}\n${USAGE}`,
    }
  }
  return {
    type: 'text',
    value: `No goal is currently armed.\n${USAGE}`,
  }
}
