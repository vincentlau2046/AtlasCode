/**
 * /goal 交互面（0.1.62 /goal 核心+持久化波，CC 2.1.139）——local-jsx。
 *
 * 子动作走参数（0.1.60 命令面先例模板）：
 *   /goal set <condition>  → armGoal（armed + 条件存储；one goal at a time
 *     新设替换旧；条件 ≤500 字符单一可测终态）
 *   /goal clear            → clearGoal（提前清 + 通知行）
 *   /goal                  → 状态面
 * 每次调用渲染 C0-3 overlay 面板（elapsed/turns/tokens 三要素 + armed 条件；
 * 0.1.60 命令面先例 = renderToAnsiString 渲染面板 → onDone 内联展示，非挂载
 * 交互面板）。达成自清除 = loop 评估器判达成 → clearGoal + 通知行（不在此
 * 命令面；2.1.173 纪律：勿提示用户 run /goal clear after success）。
 */
import * as React from 'react'
import type { LocalJSXCommandCall } from '../../types/command.js'
import type { Message } from '../../types/message.js'
import { renderToAnsiString } from '../../utils/staticRender.js'
import { GoalOverlay } from '../../components/GoalOverlay.js'
import {
  getTotalDuration,
  getTotalAPIDuration,
  getTotalInputTokens,
  getTotalOutputTokens,
} from '../../cost-tracker.js'
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

/** 会话 assistant 轮次（turns 计数器组装——面板三要素之一）。 */
function countAssistantTurns(messages: readonly Message[]): number {
  let n = 0
  for (const m of messages) {
    if (m.type === 'assistant') n++
  }
  return n
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const raw = (args ?? '').trim()
  const parts = raw.split(/\s+/)
  const sub = parts[0]?.toLowerCase()
  let confirm: string | null = null

  if (sub === 'set') {
    const condition = raw.slice(parts[0].length).trim()
    if (condition === '') {
      onDone(`Missing goal condition.\n${USAGE}`)
      return null
    }
    const r = armGoal(condition)
    // strict:false 项目：`!r.ok` 不收窄判别联合，须 `=== false` 字面量收窄
    if (r.ok === false) {
      onDone(r.reason)
      return null
    }
    // C0-1 持久化：armed goal 写入 session metadata 缓存（首条 user/assistant
    // 消息经 materializeSessionFile 落盘 + reAppendSessionMetadata 尾部窗；
    // --resume/compact 恢复经 restoreGoalState）。
    saveGoalState(getGoalStateForPersistence())
    confirm = 'Goal armed — the agent will keep working until the condition is met.'
  } else if (sub === 'clear') {
    if (!isGoalArmed()) {
      onDone('No goal is currently armed.')
      return null
    }
    clearGoal()
    // C0-1 持久化：cleared 快照写盘（armed=false → 恢复时 no-op 防旧态泄漏）。
    saveGoalState(getGoalStateForPersistence())
    confirm = goalClearedNotification()
  }

  // C0-3 overlay 面板：三要素（elapsed/turns/tokens）+ armed 条件。
  const messages = (context.messages ?? []) as Message[]
  const panel = (
    <GoalOverlay
      armed={isGoalArmed()}
      condition={getGoalCondition()}
      turns={countAssistantTurns(messages)}
      elapsedMs={getTotalDuration()}
      apiMs={getTotalAPIDuration()}
      inTokens={getTotalInputTokens()}
      outTokens={getTotalOutputTokens()}
    />
  )
  const output = await renderToAnsiString(panel)
  onDone(confirm ? `${confirm}\n${output}` : output)
  return null
}
