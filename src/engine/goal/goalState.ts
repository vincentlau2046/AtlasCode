/**
 * 0.1.62 /goal 核心+持久化波（波池次车）— goal 状态机 + 评估器 + 续跑指令
 * 模板（CC 2.1.139 /goal + 2.1.173 stop-hook-active reminder）。
 *
 * 上游语义（2.1.173 system-reminder 原文）：/goal 实现于 Stop hook 机制之上
 * ——「The hook will block stopping until the condition holds. It auto-clears
 * once the condition is met」。AtlasCode 侧 = 条件化 Stop hook 的产品内建面
 * （引擎内建，不经用户 hooks 配置）；消费点 = loop.ts terminal 支
 * （deps.hooks?.stopHooks preventContinuation 消费点邻位）。
 *
 * 三件（本文件单源）：
 *   ① goalState — armed/cleared 状态机 + 条件存储（one goal at a time，
 *      新设替换旧；条件 ≤500 字符单一可测终态）。模块级单例（同 session
 *      metadata 模式——session 域 project 单例先例）。
 *   ② evaluateGoal — small 角色无 tools chat 评估器（上游 ProposeGoal 评估器
 *      语义：仅从对话验证，不跑命令不读文件）。调 modelProvider.chat
 *      role='small'，解析 MET/UNMET 两态。gate 判别力 = mock judge
 *      （c4-mock-server judge 模式 / 单测 fake provider canned 两态）；
 *      活面真 judge 仅生产观察面（风险 #2 残余登记）。
 *   ③ goalContinuationReminder — 2.1.173 stop-hook-active reminder 模板
 *      （goal 续跑支注入 system 消息；模板化，条件 = goal 条件变量；
 *      移植适配 = 1P 引用裁除 + ATLAS_ 前缀）。
 *
 * 零回归：goal 未 armed 时 loop.ts terminal 支字节级恒等（本模块 isGoalArmed()
 * 恒 false → goal 支不触发 → 既有路径零漂移）。
 */
import type { ModelProvider } from '../../modelprovider'
import type { Message } from '../../shared'

// ── ① goalState — armed/cleared 状态机 ──────────────────────────────

/** goal 条件最大字符数（单一可测终态，防超长条件撑爆评估器 prompt）。 */
export const MAX_GOAL_CONDITION_CHARS = 500

/** goal 续跑默认轮次硬上限（防 runaway；同 loop.ts maxTurns 兜底模式）。 */
export const DEFAULT_MAX_GOAL_TURNS = 10

/** goal 持久化快照（session metadata goal-state entry 载荷）。 */
export interface GoalStateSnapshot {
  armed: boolean
  condition: string
}

interface GoalRuntimeState {
  armed: boolean
  condition: string | undefined
  /**
   * 0.1.63 P2：paused 是 armed 的子态（armed=true 且 paused=true）——
   * 可恢复错误（5xx/429 配额耗尽）触发 pauseGoal，配额恢复后 resumeGoal
   * 回到 armed 正常态，条件不丢。paused 标记不跨 session（不持久化，
   * 每 session 重判）——见 getGoalStateForPersistence 注释。
   */
  paused: boolean
  pausedReason: string | undefined
}

let goalState: GoalRuntimeState = { armed: false, condition: undefined, paused: false, pausedReason: undefined }

/**
 * Arm a goal condition（CC 2.1.139：one goal at a time — 新设替换旧）。
 * 条件 ≤500 字符单一可测终态；超长 = 拒绝（fail-closed）。
 */
export function armGoal(condition: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = condition.trim()
  if (trimmed === '') {
    return { ok: false, reason: 'Goal condition cannot be empty.' }
  }
  if (trimmed.length > MAX_GOAL_CONDITION_CHARS) {
    return {
      ok: false,
      reason: `Goal condition exceeds ${MAX_GOAL_CONDITION_CHARS} characters (got ${trimmed.length}).`,
    }
  }
  goalState = { armed: true, condition: trimmed, paused: false, pausedReason: undefined }
  return { ok: true }
}

/** Clear the armed goal（提前清 / 达成自清除 / P3 不可恢复清除三径共用）。 */
export function clearGoal(): void {
  goalState = { armed: false, condition: undefined, paused: false, pausedReason: undefined }
}

// ── 0.1.63 P2：paused 状态机（armed 子态）─────────────────────────────

/**
 * P2：可恢复错误 → 暂停 goal（不丢条件，armed 保持 true，paused=true）。
 * 配额恢复后调 resumeGoal 回到 armed 正常态。reason 入暂停说明行。
 */
export function pauseGoal(reason: string): void {
  if (!goalState.armed) return // 未 armed 无暂停义
  goalState = { ...goalState, paused: true, pausedReason: reason }
}

/**
 * P2：配额恢复后恢复 goal（paused→armed 正常态，条件不丢）。
 * 未 paused 时 no-op（幂等）。
 */
export function resumeGoal(): void {
  if (!goalState.paused) return
  goalState = { ...goalState, paused: false, pausedReason: undefined }
}

/** P2：goal 是否 paused（armed 子态谓词）。 */
export function isGoalPaused(): boolean {
  return goalState.armed && goalState.paused
}

/** P2：暂停原因（未 paused = undefined）。 */
export function getGoalPausedReason(): string | undefined {
  return goalState.armed && goalState.paused ? goalState.pausedReason : undefined
}

/**
 * P2：暂停说明行（REPL/TUI 渲染面消费）——含原因，用户可见。
 * 上游语义（CC 演化）：「暂停并说明（含等配额恢复）」。
 */
export function goalPausedNotification(reason: string): string {
  return `Goal paused: ${reason}\nThe goal will resume when the condition recovers.`
}

/** goal 是否 armed（loop.ts terminal 支消费谓词）。 */
export function isGoalArmed(): boolean {
  return goalState.armed
}

/** 读取 armed goal 条件（未 armed = undefined）。 */
export function getGoalCondition(): string | undefined {
  return goalState.armed ? goalState.condition : undefined
}

/** 持久化快照（session metadata 写面消费）。 */
export function getGoalStateForPersistence(): GoalStateSnapshot {
  return {
    armed: goalState.armed,
    condition: goalState.condition ?? '',
  }
}

/**
 * 从 session metadata 恢复 armed goal（--resume / --continue 恢复支）。
 * 仅恢复 armed=true 且条件非空的快照；cleared 快照 = no-op。
 */
export function restoreGoalState(snapshot: GoalStateSnapshot | undefined): void {
  // paused 不跨 session（不持久化）——恢复后从 armed 正常态起步，每 session 重判
  if (snapshot && snapshot.armed && snapshot.condition.trim() !== '') {
    goalState = { armed: true, condition: snapshot.condition.trim(), paused: false, pausedReason: undefined }
  } else {
    goalState = { armed: false, condition: undefined, paused: false, pausedReason: undefined }
  }
}

/** 测试重置（单测隔离惯例）。 */
export function resetGoalStateForTesting(): void {
  goalState = { armed: false, condition: undefined, paused: false, pausedReason: undefined }
}

// ── 0.1.63 P3：不可恢复自清除（错误分类 + 通知）──────────────────────

/**
 * P3：goal 跑动中错误分类（可恢复/不可恢复二分）。
 *
 *   不可恢复（→ clearGoal + 通知，不再 armed）：
 *     - 401/403 auth 吊销（凭证失效，重试无义）
 *     - 上下文溢出（context length exceeded / prompt too long——窗满，须 compact 非 retry）
 *   可恢复（→ pauseGoal + 通知，配额恢复后 resume）：
 *     - 429 配额耗尽 / 5xx 网关故障 / 连接抖动（ECONNRESET 等）
 *     - 未知错误 = 可恢复（fail-safe pause，不误清 goal——续跑由 maxGoalTurns 兜底）
 *
 * 与 modelprovider shouldRetryModelError（provider 域重试谓词）的关系：
 * shouldRetryModelError 判「是否重试」（429/5xx=retry，400/401/abort=穿透）；
 * classifyGoalError 判「goal 状态去向」（unrecoverable→clear，其余→pause）。
 * 400 bad request = shouldRetryModelError false（不重试穿透）但 classifyGoalError
 * 'recoverable'（不误清 goal——400 是请求级错误非凭证失效，用户可修后续跑）。
 * 消费点 = loop.ts terminal 支 catch（turnRecovery 耗尽后判 goal 去向）。
 */
export type GoalErrorClass = 'recoverable' | 'unrecoverable'

export function classifyGoalError(err: unknown): GoalErrorClass {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase()
  // 不可恢复：auth 吊销 / 上下文溢出
  if (/\b401\b/.test(msg) || /\b403\b/.test(msg) || msg.includes('unauthorized') || msg.includes('forbidden')) {
    return 'unrecoverable'
  }
  if (msg.includes('context length exceeded') || msg.includes('prompt too long') || msg.includes('context window')) {
    return 'unrecoverable'
  }
  // 其余（429/5xx/连接抖动/未知）= 可恢复（fail-safe pause，不误清 goal）
  return 'recoverable'
}

/**
 * P3：不可恢复清除通知行（REPL/TUI 渲染面消费）——含原因，用户可见。
 * 上游语义（CC 演化）：「turn 死于不可恢复错误 → goal 自清除+通知（不再 armed）」。
 */
export function goalUnrecoverableNotification(reason: string): string {
  return `Goal cleared (unrecoverable): ${reason}\nThe goal can no longer be pursued. Set a new goal if needed.`
}

// ── ② evaluateGoal — small 角色无 tools chat 评估器 ──────────────────

/** 评估器判别产物。 */
export interface GoalEvaluationResult {
  met: boolean
  reason: string
}

/**
 * 评估器 system prompt（条件达成判定：仅对话证据，不跑命令不读文件）。
 * 移植适配自 2.1.173 ProposeGoal 评估器语义（1P 引用裁除 + ATLAS_ 前缀）。
 */
const EVALUATOR_SYSTEM_PROMPT = `You are a goal-condition evaluator. You are given a goal condition and the recent conversation. Determine whether the goal condition has been MET based solely on the conversation evidence — do not run commands, do not read files, do not make assumptions beyond what is shown.

Respond on the first line with exactly "MET" or "UNMET". On the following line, give a one-sentence reason citing the conversation evidence.`

/**
 * 从消息序列提取评估器可见的对话文本（最近若干轮，防全量撑爆 small 模型窗）。
 * 仅取 user/assistant text content（tool_use/tool_result 不入评估器视野——
 * 评估器判对话语义达成，非工具执行细节）。
 */
function extractConversationEvidence(messages: Message[], maxMessages = 12): string {
  const recent = messages.slice(-maxMessages)
  const lines: string[] = []
  for (const m of recent) {
    if (m.type === 'user' || m.type === 'assistant') {
      const content = (m as { message?: { content?: unknown } }).message?.content
      if (typeof content === 'string') {
        lines.push(`[${m.type}] ${content}`)
      } else if (Array.isArray(content)) {
        const text = content
          .filter(
            (b): b is { type: string; text?: string } =>
              typeof b === 'object' &&
              b !== null &&
              (b as { type?: string }).type === 'text',
          )
          .map(b => b.text ?? '')
          .join(' ')
        if (text) lines.push(`[${m.type}] ${text}`)
      }
    }
  }
  return lines.join('\n') || '(no conversation evidence)'
}

/**
 * goal 评估器（CC 2.1.139 核心）：调 modelProvider.chat role='small' 无 tools，
 * 解析 MET/UNMET 两态。gate 判别力 = mock judge（c4-mock-server judge 模式 /
 * 单测 fake provider canned 两态）；活面真 judge 仅生产观察面。
 *
 * 解析容错：首行含 MET（大小写不敏感）= 达成；含 UNMET = 未达成；
 * 无法解析 = 未达成（fail-safe，不误终止——续跑由 maxGoalTurns 兜底）。
 */
export async function evaluateGoal(params: {
  modelProvider: ModelProvider
  signal?: AbortSignal
  messages: Message[]
  condition: string
}): Promise<GoalEvaluationResult> {
  const evidence = extractConversationEvidence(params.messages)
  const userPrompt = `Goal condition:\n${params.condition}\n\nConversation evidence:\n${evidence}\n\nHas the goal condition been met?`
  const resp = await params.modelProvider.chat({
    role: 'small',
    messages: [
      { type: 'user', message: { role: 'user', content: userPrompt } },
    ] as unknown as Message[],
    systemPrompt: { type: 'system', content: EVALUATOR_SYSTEM_PROMPT } as unknown as Parameters<typeof params.modelProvider.chat>[0]['systemPrompt'],
    signal: params.signal,
  })
  const content = (resp as { message?: { content?: unknown } }).message?.content
  const blocks = Array.isArray(content) ? content : [content]
  const text = blocks
    .map(b => {
      if (typeof b === 'string') return b
      if (typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text') {
        return (b as { text?: string }).text ?? ''
      }
      return ''
    })
    .join('\n')
  const firstLine = text.trim().split('\n')[0]?.toUpperCase() ?? ''
  const reasonLine = text.trim().split('\n').slice(1).join('\n').trim() || 'No reason provided.'
  if (firstLine.includes('MET') && !firstLine.includes('UNMET')) {
    return { met: true, reason: reasonLine }
  }
  // UNMET or unparseable → fail-safe 未达成（不误终止）
  return { met: false, reason: reasonLine }
}

// ── ③ goalContinuationReminder — 2.1.173 stop-hook-active reminder 模板 ──

/**
 * goal 续跑指令注入消息（2.1.173 stop-hook-active reminder 语义）。
 * goal 未达成 → terminal 支注入本 system 消息 + 续跑（assistant 看到
 * reminder 继续向 goal 条件工作）。
 *
 * 纪律（2.1.173 原文）：勿提示用户 run /goal clear after success——
 * 达成 = 自清除 + 通知（goalMetNotification），不注入本 reminder。
 */
export function goalContinuationReminder(condition: string): Message {
  const text = `The goal condition has not been met yet. Continue working toward the goal.

Goal condition: ${condition}

Do not stop until the goal condition is met. If the goal is truly unachievable, explain why and what was attempted.`
  return {
    type: 'user',
    message: { role: 'user', content: text },
    uuid: `goal-reminder-${Date.now()}`,
    timestamp: new Date().toISOString(),
  } as unknown as Message
}

/**
 * goal 达成自清除通知行（2.1.173 纪律：无「run /goal clear」提示）。
 * 达成 → clearGoal() + 返回本通知行（REPL/TUI 渲染面消费）。
 */
export function goalMetNotification(condition: string): string {
  return `✓ Goal met: ${condition}\nThe goal has been auto-cleared.`
}

/** goal clear 通知行（/goal clear 提前清面）。 */
export function goalClearedNotification(): string {
  return 'Goal cleared.'
}

/**
 * P6：hook 门控显式报错通知行（disableAllHooks / allowManagedHooksOnly 时
 * goal 静默挂起 → 显式报错面）。上游语义（CC 演化）：hooks 禁用时 goal
 * 续跑机制不可用 → 显式报错（非静默），goal 自清除。
 */
export function goalHookGateNotification(): string {
  return 'Goal cleared: hooks are disabled (disableAllHooks). Goals require hooks to continue.'
}
