/**
 * engine/pipeline — repeat-tool 连击建议守（wave0190 任务 B；工单 RR-1/RR-2）。
 *
 * 缺陷：同参同工具连击（弱模型循环重试同一调用）零提醒。语义对齐 DSH
 * repeat-tool-reminder（packages/guard/repeat-tool-reminder，233L）+ 锁面批注
 * §5.2 裁定：
 *  - 计数键 = [toolName, canonicalize(arguments)]；canonicalize = deep key-sort +
 *    stringify（键序差异同链，值差异新链）
 *  - 阈值默认 [3,5,8]（REPEAT_TOOL_REMINDER_THRESHOLDS，token 锚 090-06）：首阈
 *    gentle 文案（090-07），后续阈 detailed 文案含 args 预览（090-08，
 *    argumentsPreviewChars 500 头截断）；阈间调用不提醒
 *  - 配置 fail-loud（090-09 错误串族）：空表 / 非整数 / <2 / 重复 → 构造时抛
 *  - per-agent 隔离 = tracker 实例即链状态（queryAgentLoop run 生命周期创建注入
 *    一次；单轮 queryOneRound 直调无 tracker = 零提醒 fail-safe）
 *  - DSH user-interjection 清零支不迁（进程内生命周期计数，锁面裁定）
 *
 * 注入槽位（executeToolUse 成功支）：in-band user + isMeta 走 C85-B
 * ToolResult.newMessages 既有交付链（零新投递面）；失败支计数推进但不注入
 * （DSH observe post-execute 同口径——无成功块不投递）。
 */

/** 默认阈值表（token 锚 090-06）。 */
export const REPEAT_TOOL_REMINDER_THRESHOLDS: readonly number[] = [3, 5, 8]

/** args 预览默认头截断长度（DSH argumentsPreviewChars 500 同值）。 */
export const REPEAT_TOOL_REMINDER_PREVIEW_CHARS = 500

/** 首阈 gentle 文案（token 锚 090-07）。 */
export const REPEAT_TOOL_REMINDER_GENTLE =
  '[repeat-tool-notice] You have now called {tool} {count} times in a row with identical arguments. ' +
  'If this repetition is intentional (e.g. polling a changing value), continue; ' +
  'otherwise adjust the arguments or try a different approach.'

/** 后续阈 detailed 文案骨架（token 锚 090-08；预览在 {preview} 槽）。 */
export const REPEAT_TOOL_REMINDER_DETAILED =
  '[repeat-tool-notice] You have now called {tool} {count} times in a row with identical arguments ' +
  '(arguments preview: {preview}). Repeating the same call is unlikely to produce a different result — ' +
  'change the arguments, use a different tool, or explain in your reply why another identical call is needed.'

export interface RepeatToolReminderConfig {
  /** 提醒阈值表（默认 [3,5,8]）；fail-loud 校验。 */
  thresholds?: number[]
  /** detailed 文案 args 预览头截断长度（默认 500）。 */
  argumentsPreviewChars?: number
}

/** 配置 fail-loud 校验（token 锚 090-09；构造时抛，禁静默降级）。 */
function validateConfig(config: Required<RepeatToolReminderConfig>): void {
  if (!Array.isArray(config.thresholds) || config.thresholds.length === 0) {
    throw new Error('repeat-tool-reminder config: thresholds must be a non-empty array')
  }
  for (const t of config.thresholds) {
    if (!Number.isInteger(t) || t < 2) {
      throw new Error(
        `repeat-tool-reminder config: thresholds must be integers >= 2 (got ${String(t)})`,
      )
    }
  }
  if (new Set(config.thresholds).size !== config.thresholds.length) {
    throw new Error(
      `repeat-tool-reminder config: thresholds must not contain duplicates (got ${config.thresholds.join(',')})`,
    )
  }
  if (!Number.isInteger(config.argumentsPreviewChars) || config.argumentsPreviewChars <= 0) {
    throw new Error(
      `repeat-tool-reminder config: argumentsPreviewChars must be a positive integer (got ${String(config.argumentsPreviewChars)})`,
    )
  }
}

/** deep key-sort + stringify（键序差异同键；值差异异键）。 */
export function canonicalizeArguments(input: unknown): string {
  const sortValue = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortValue)
    if (typeof v === 'object' && v !== null) {
      const rec = v as Record<string, unknown>
      const keys = Object.keys(rec).sort()
      const out: Record<string, unknown> = {}
      for (const k of keys) out[k] = sortValue(rec[k])
      return out
    }
    return v
  }
  return JSON.stringify(sortValue(input ?? null))
}

export interface RepeatToolCallTracker {
  /**
   * 记录一次调用（toolName + 入参）并在跨阈时返回提醒文案（未跨阈 undefined）。
   * 失败/成功均计数（调用方负责只在成功支投递）。
   */
  observe(toolName: string, input: unknown): string | undefined
}

/** 创建连击守 tracker（per-agent 隔离 = 实例即链状态；配置 fail-loud 构造时抛）。 */
export function createRepeatToolCallTracker(
  config?: RepeatToolReminderConfig,
): RepeatToolCallTracker {
  const resolved: Required<RepeatToolReminderConfig> = {
    thresholds: config?.thresholds ?? [...REPEAT_TOOL_REMINDER_THRESHOLDS],
    argumentsPreviewChars: config?.argumentsPreviewChars ?? REPEAT_TOOL_REMINDER_PREVIEW_CHARS,
  }
  validateConfig(resolved)
  const chains = new Map<string, number>()
  return {
    observe(toolName: string, input: unknown): string | undefined {
      const key = `${toolName}\u0000${canonicalizeArguments(input)}`
      const count = (chains.get(key) ?? 0) + 1
      chains.set(key, count)
      if (!resolved.thresholds.includes(count)) return undefined
      if (count === resolved.thresholds[0]) {
        return REPEAT_TOOL_REMINDER_GENTLE.replaceAll('{tool}', toolName).replaceAll(
          '{count}',
          String(count),
        )
      }
      const preview = canonicalizeArguments(input).slice(0, resolved.argumentsPreviewChars)
      return REPEAT_TOOL_REMINDER_DETAILED.replaceAll('{tool}', toolName)
        .replaceAll('{count}', String(count))
        .replaceAll('{preview}', preview)
    },
  }
}
