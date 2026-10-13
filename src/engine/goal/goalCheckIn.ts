/**
 * 0.1.63 /goal 演化波 P4 — check-in 定时器（CC 演化 2.1.246 Autonomous loop check）。
 *
 * 上游语义（2.1.246）：空闲会话 goal 被长后台工作阻塞 → 30min 后自动 check-in
 * （1h/2h 退避）；每 goal 至多 3 次，用户下一消息 +3；
 * CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0 关；后台任务阻塞 30min+ 自动 check-in。
 *
 * 国产适配裁剪面（工单 §0 细目）：
 *   - env 名 = ATLAS_GOAL_CHECKIN_MINUTES（ATLAS_ 前缀，0.1.46 先例；上游
 *     CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0 关断同构 → 本仓 =0 关断）
 *   - 行动面映射 AtlasCode 本地面（本地分支/提交维护面）；云 PR 维护/分支扫查
 *     语境 1P 裁除（ProposeGoal/Remote Control 等引用不出现）
 *   - BR-8 标准：无字面 + 号
 *
 * 三件（本文件单源）：
 *   ① env 解析 — getGoalCheckInMinutes（缺省 30，0=关断，非法回落缺省）
 *   ② 退避 + 预算 — getCheckInDelayMs（等比 1:2:4 = 30m→1h→2h）+ MAX 3 + 刷新 +3
 *   ③ 提示词 — goalCheckInPrompt（2.1.246 steward-not-initiator + 国产适配）
 *
 * 状态机（模块级单例，同 goalState 模式）：checkInCount 自 arm/clear 起计数，
 * 用户消息 refreshOnUserMessage 重置（+3 刷新语义 = 重置回 MAX，非叠加）。
 *
 * 零回归：goal 未 armed 时 check-in 不触发（调用方门控 isGoalArmed）；
 * env 缺省 = 30min 实时常数（生产面），测试用秒级短常数 override（工单 §2）。
 */

// ── ① env 解析 ────────────────────────────────────────────────────────

/** 缺省 check-in 间隔（分钟）。上游 30min 同构。 */
export const DEFAULT_GOAL_CHECKIN_MINUTES = 30

/**
 * 读取 ATLAS_GOAL_CHECKIN_MINUTES（缺省 30，0=关断）。
 * 非法值（NaN/负数）回落缺省 30（fail-safe，不误关——生产面不因 env 笔误
 * 丧失 check-in 能力）。调用方按 =0 判关断。
 */
export function getGoalCheckInMinutes(): number {
  const raw = process.env.ATLAS_GOAL_CHECKIN_MINUTES
  if (raw === undefined || raw === '') return DEFAULT_GOAL_CHECKIN_MINUTES
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_GOAL_CHECKIN_MINUTES
  return parsed
}

// ── ② 退避 + 预算 ──────────────────────────────────────────────────────

/**
 * 退避乘子（等比 1:2:4 = 30m→1h→2h）。
 * 每槽 = 一次 check-in 的延迟倍率（相对 baseMinutes）。3 槽 = 预算 3。
 */
export const GOAL_CHECKIN_BACKOFF_MULTIPLIERS = [1, 2, 4] as const

/** 每 goal 至多 3 次 check-in（上游预算 3 同构）。 */
export const MAX_GOAL_CHECKINS = GOAL_CHECKIN_BACKOFF_MULTIPLIERS.length

/** 用户消息刷新量（+3 = 重置回 MAX，非叠加）。 */
export const CHECKIN_REFRESH_AMOUNT = MAX_GOAL_CHECKINS

/** 分钟 → 毫秒。 */
const MS_PER_MINUTE = 60_000

/**
 * 第 N 次 check-in 的延迟（ms，相对 baseMinutes × 乘子）。
 *   index 0 → base × 1（30m → 1800000ms）
 *   index 1 → base × 2（1h  → 3600000ms）
 *   index 2 → base × 4（2h  → 7200000ms）
 *   index ≥3 → Infinity（超预算，无退避槽）
 *
 * 短常数等比保持（base=0.1 → [6s, 12s, 24s]，比值 1:2:4 不变）。
 */
export function getCheckInDelayMs(checkInIndex: number, baseMinutes: number): number {
  const multiplier = GOAL_CHECKIN_BACKOFF_MULTIPLIERS[checkInIndex]
  if (multiplier === undefined) return Infinity
  return baseMinutes * MS_PER_MINUTE * multiplier
}

// ── check-in 状态机（模块级单例）────────────────────────────────────────

interface GoalCheckInState {
  /** 自上次用户消息以来的 check-in 次数（0 = 满预算）。 */
  checkInCount: number
}

let checkInState: GoalCheckInState = { checkInCount: 0 }

/** 重置 check-in 状态（arm/clear 时消费——新 goal 从满预算起步）。 */
export function resetCheckInState(): void {
  checkInState = { checkInCount: 0 }
}

/** 记录一次 check-in（递增计数）。 */
export function recordCheckIn(): void {
  checkInState = { checkInCount: checkInState.checkInCount + 1 }
}

/**
 * 用户消息刷新（+3 语义 = 重置回 MAX，非叠加）。
 * 幂等：多次调用不叠加 >MAX（上游「+3」= 重置而非累加）。
 */
export function refreshOnUserMessage(): void {
  checkInState = { checkInCount: 0 }
}

/** 剩余 check-in 次数（MAX - count）。 */
export function getRemainingCheckIns(): number {
  return Math.max(0, MAX_GOAL_CHECKINS - checkInState.checkInCount)
}

/**
 * 是否可以 check-in（预算未耗尽 且 env 未关断）。
 * 消费：baseMinutes=0（env=0 关断）→ 永 false；预算耗尽 → false。
 */
export function canCheckIn(): boolean {
  if (getGoalCheckInMinutes() === 0) return false
  return checkInState.checkInCount < MAX_GOAL_CHECKINS
}

/** 测试读面（单测隔离断言用）。 */
export function getCheckInStateForTesting(): GoalCheckInState {
  return { ...checkInState }
}

// ── ③ 提示词（2.1.246 Autonomous loop check，国产适配）──────────────────

/**
 * check-in 回合注入提示词（2.1.246 Autonomous loop check 全文移植裁剪）。
 *
 * 国产适配裁剪面：
 *   - 行动面 = AtlasCode 本地面（会话内未完工 > 本地分支/提交维护面）；
 *     云 PR 维护/分支扫查语境 1P 裁除
 *   - steward-not-initiator 张力：check-in = 盘点进度非启动新工作
 *   - repeated invocations 收敛：判进度面（无进展 → 考虑 goal 可达性）
 *   - BR-8：无字面 + 号
 *
 * 消费点 = check-in 定时器触发的续跑回合（注入 system 消息，条件 = goal 条件）。
 */
export function goalCheckInPrompt(condition: string): string {
  return `This is an automated goal check-in. A goal is still active and the session appears idle or blocked by background work.

Goal condition: ${condition}

Review the progress toward this goal based on the conversation so far:
- If work toward the goal is unfinished, continue it.
- If background tasks are still running, wait for them and then reassess.
- If the goal appears unachievable, explain why and what was attempted.

Do not start new unrelated work. Focus on the goal condition above. Assess whether meaningful progress has been made since the last check-in.`
}
