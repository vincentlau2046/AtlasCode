/**
 * K3-A2（0.1.82）：PreToolUse hook updatedInput 消费面键白名单。
 *
 * 上游对齐：钩子改写工具入参时只允许改写**已知键**的值（键 ∩ 原入参键），
 * 不得注入原入参中不存在的键——修前 `preOutcome?.updatedInput ?? tu.input`
 * 整体替换，钩子可注入任意键直达 tool.call。
 *
 * 语义：
 *  - 双 plain object → 逐原键取值：hook 提及的键取改写值（last-wins），
 *    未提及的键保原值，hook 注入的未知键丢弃。
 *  - 任一侧非 plain object（string/数组/null/Date 等）→ fail-safe 保原入参
 *    （无从安全求交集；整体替换在非对象面只会破坏工具入参形状）。
 *
 * 面边界：本函数只管 hook 改写面（toolExecution :410 effectiveInput）；
 * 权限门 verdict.updatedInput（内部全决策体，0.1.77 I-1c）不经此 sanitize；
 * 钩子 JSON 的 updatedInput 双形**解释**面（hooks 域 interpretHookOutput
 * MAJOR-2）不变。
 */

/** plain object 判定（Object 原型或 null 原型；数组/Date/原始值均非）。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * 键白名单采纳钩子改写入参。
 * @param originalInput 工具原入参（键白名单基准）
 * @param updatedInput 钩子改写入参（只取其已知键的值）
 * @returns 采纳后的入参（双 plain object = 键交集 last-wins；否则原入参透传）
 */
export function sanitizeUpdatedInput<T>(
  originalInput: T,
  updatedInput: unknown,
): T {
  if (!isPlainObject(originalInput) || !isPlainObject(updatedInput)) {
    return originalInput
  }
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(originalInput)) {
    result[key] = key in updatedInput ? updatedInput[key] : originalInput[key]
  }
  return result as T
}
