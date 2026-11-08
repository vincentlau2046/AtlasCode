/**
 * swarm — teammate 终止条件组 + stall 计数（0.1.93 W-D-A 切片 A6；工单
 * docs/2026-11-08-p0-wave-0193-ticket.md 审计 F2/F5）。
 *
 * 终止条件组合词汇（AutoGen 吸收，Form A 单层 OR/AND）：
 *   - max-turns：成员完成的 agent 轮数达上限（防永久挂起）
 *   - text-confirm：成员终轮文本含确认短语（大小写不敏感包含；成员自报
 *     「任务完成」类确认）
 *   - external-kill：lifecycle abort 信号（graceful 退出——不发 kill，
 *     走既有轮末 completed 收尾，F3 态机语义）
 *   - stall：per-member 连击计数达阈（f4 批复 F5 层级定谳 = per-member
 *     落 inProcessRunner 循环态 + 组级打转并入终止条件——组级打转以
 *     stall 条件入词汇表，单一评估点）
 *
 * stall 计数语义（G-1 RepeatToolCallTracker 同族同形，0.1.90 波）：成员
 * 连续两轮产出完全相同的非空终轮文本 = 打转一轮（stallConsecutive+1）；
 * 异文/空/缺文本复位。计数器由 advanceTerminationLoopState 在每轮 runAgent
 * 后推进（inProcessRunner 循环态，跨轮持久），评估由 evaluateTerminationSpec
 * 在轮末统一进行（0.1.93 f4 gate 打回修复① 2026-11-08：absent spec 的旧
 *「零评估恒等」裁定废止 → resolveTerminationSpec 缺省注入有界默认，
 * fail-closed 有界——成员跨轮累计不再无界）。
 *
 * 配置 fail-loud（G-1 090-09 同族）：validateTerminationSpec 构造期抛，
 * 禁静默降级。本模块零 I/O 零依赖（swarm 域内纯函数）。
 */

export type TerminationCondition =
  | { kind: 'max-turns'; maxTurns: number }
  | { kind: 'text-confirm'; phrases: string[] }
  | { kind: 'external-kill' }
  | { kind: 'stall'; maxConsecutive: number }

export type TerminationSpec = {
  op: 'or' | 'and'
  conditions: TerminationCondition[]
}

/** per-member 循环态（inProcessRunner 外层 while 跨轮持久；G-1 tracker
 * 实例即链状态同形）。turns = 已完成 agent 轮数。 */
export type TerminationLoopState = {
  turns: number
  lastFinalText?: string
  stallConsecutive: number
}

/** 轮末评估输入 = 循环态 + lifecycle abort 快照。 */
export type TerminationEvaluationState = TerminationLoopState & {
  aborted: boolean
}

export type TerminationReason =
  | { type: 'max-turns'; turns: number }
  | { type: 'text-confirm'; matched: string }
  | { type: 'external-kill' }
  | { type: 'stall'; consecutive: number }
  | { type: 'or'; satisfied: TerminationReason[] }
  | { type: 'and'; satisfied: TerminationReason[] }

export type TerminationVerdict = {
  terminate: boolean
  reason?: TerminationReason
}

/**
 * 0.1.93 W-D-A f4 gate 打回修复①（2026-11-08 裁定）：缺省有界 fail-closed。
 * TeamCreate/扩参未显式传 termination spec 时注入有界默认——termination
 * 评估器禁消费 undefined（成员跨轮累计无界 = 孤儿循环破口）。
 *
 * 界值锁定（Main 锁面，登记工单）：DEFAULT_TEAMMATE_MAX_TURNS = 200。
 * leader 主 loop 缺省 DEFAULT_AGENT_LOOP_MAX_TURNS = 20 是 per-run 面；
 * teammate 跨轮累计取 10× 宽容界（runaway 守卫非工作预算）。
 */
export const DEFAULT_TEAMMATE_MAX_TURNS = 200

export const DEFAULT_TEAMMATE_TERMINATION_SPEC: TerminationSpec = {
  op: 'or',
  conditions: [{ kind: 'max-turns', maxTurns: DEFAULT_TEAMMATE_MAX_TURNS }],
}

/** 缺省解析单一事实源：显式 spec 原样透传（同一引用）；缺席 → 有界默认。 */
export function resolveTerminationSpec(spec?: TerminationSpec): TerminationSpec {
  return spec ?? DEFAULT_TEAMMATE_TERMINATION_SPEC
}

/** 配置 fail-loud 校验（G-1 090-09 同型错误串族；构造期抛，禁静默降级）。 */
export function validateTerminationSpec(spec: TerminationSpec): void {
  if (spec.op !== 'or' && spec.op !== 'and') {
    throw new Error(
      `teammate-termination config: op must be "or" or "and" (got ${String(spec.op)})`,
    )
  }
  if (!Array.isArray(spec.conditions) || spec.conditions.length === 0) {
    throw new Error(
      'teammate-termination config: conditions must be a non-empty array',
    )
  }
  for (const c of spec.conditions) {
    switch (c.kind) {
      case 'max-turns':
        if (!Number.isInteger(c.maxTurns) || c.maxTurns < 1) {
          throw new Error(
            `teammate-termination config: maxTurns must be an integer >= 1 (got ${String(c.maxTurns)})`,
          )
        }
        break
      case 'text-confirm':
        if (
          !Array.isArray(c.phrases) ||
          c.phrases.length === 0 ||
          c.phrases.some(p => typeof p !== 'string' || p.length === 0)
        ) {
          throw new Error(
            'teammate-termination config: text-confirm phrases must be a non-empty array of non-empty strings',
          )
        }
        break
      case 'stall':
        if (!Number.isInteger(c.maxConsecutive) || c.maxConsecutive < 2) {
          throw new Error(
            `teammate-termination config: stall maxConsecutive must be an integer >= 2 (got ${String(c.maxConsecutive)})`,
          )
        }
        break
      case 'external-kill':
        break
      default:
        throw new Error(
          `teammate-termination config: unknown condition kind (got ${JSON.stringify(c)})`,
        )
    }
  }
}

export function createInitialTerminationLoopState(): TerminationLoopState {
  return { turns: 0, stallConsecutive: 0 }
}

/** 轮末推进（inProcessRunner 每轮 runAgent 后调用）：turns+1；stall =
 * 非空终轮文本与上轮逐字相同 → +1，否则复位 0（异文/空/缺文本均复位）。 */
export function advanceTerminationLoopState(
  state: TerminationLoopState,
  outcome: { finalText?: string },
): TerminationLoopState {
  const finalText = outcome.finalText
  const stalled =
    typeof finalText === 'string' &&
    finalText.length > 0 &&
    finalText === state.lastFinalText
  return {
    turns: state.turns + 1,
    lastFinalText: finalText,
    stallConsecutive: stalled ? state.stallConsecutive + 1 : 0,
  }
}

/** 单条件评估（命中 → reason；未命中 → undefined）。 */
function evaluateCondition(
  c: TerminationCondition,
  state: TerminationEvaluationState,
): TerminationReason | undefined {
  switch (c.kind) {
    case 'max-turns':
      return state.turns >= c.maxTurns
        ? { type: 'max-turns', turns: state.turns }
        : undefined
    case 'text-confirm': {
      const text = (state.lastFinalText ?? '').toLowerCase()
      const matched = c.phrases.find(p => text.includes(p.toLowerCase()))
      return matched !== undefined ? { type: 'text-confirm', matched } : undefined
    }
    case 'external-kill':
      return state.aborted ? { type: 'external-kill' } : undefined
    case 'stall':
      return state.stallConsecutive >= c.maxConsecutive
        ? { type: 'stall', consecutive: state.stallConsecutive }
        : undefined
  }
}

/** 轮末统一评估（单一评估点；组合 = 单层 OR/AND，Form A 词汇）。
 * 单条件 spec 命中 = 裸 reason（判别格可读）；多条件 spec 命中 = 复合
 * reason（satisfied = 实际命中子集，审计可溯）——按 spec 条件数判定，
 * 非命中数。 */
export function evaluateTerminationSpec(
  spec: TerminationSpec,
  state: TerminationEvaluationState,
): TerminationVerdict {
  const reasons = spec.conditions
    .map(c => evaluateCondition(c, state))
    .filter((r): r is TerminationReason => r !== undefined)
  if (spec.op === 'or') {
    if (reasons.length === 0) return { terminate: false }
    return {
      terminate: true,
      reason:
        spec.conditions.length === 1
          ? reasons[0]
          : { type: 'or', satisfied: reasons },
    }
  }
  if (reasons.length !== spec.conditions.length) return { terminate: false }
  return {
    terminate: true,
    reason:
      spec.conditions.length === 1
        ? reasons[0]
        : { type: 'and', satisfied: reasons },
  }
}

/** 末位 assistant 文本提取（runner 轮末 finalText 计算面；无 assistant /
 * 空文本 → undefined）。messages = shared Message 宽形 duck（role/content
 * 结构比对，零 import 依赖）。 */
export function extractFinalAssistantText(
  messages: ReadonlyArray<{ role?: unknown; content?: unknown }>,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role !== 'assistant') continue
    const content = m.content
    if (typeof content === 'string') {
      return content.length > 0 ? content : undefined
    }
    if (Array.isArray(content)) {
      const text = content
        .map(b =>
          b && typeof b === 'object' && (b as { type?: unknown }).type === 'text'
            ? (b as { text?: unknown }).text
            : '',
        )
        .filter((t): t is string => typeof t === 'string')
        .join('')
        .trim()
      return text.length > 0 ? text : undefined
    }
    return undefined
  }
  return undefined
}
