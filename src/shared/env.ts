/**
 * env 解析纯函数（shared 工具，B 波 S1 加）。
 *
 * 四域 config.ts 共用的 env 读取原语。纯函数无副作用（不依赖 debug/log），
 * 旧仓 validateBoundedIntEnvVar 带 logForDebugging 依赖 → 此处剥离为纯函数，
 * 调用方自行决定是否记录（charter L3 域自治：config 层不拉 cross-domain utils）。
 */

/**
 * 解析布尔 env：`"1"` / `"true"`（大小写不敏感）→ true，其余 → false。
 * 语义对齐旧仓 T3 布尔 env 约定（未设置 / 任意非真值 = 关）。
 */
export function parseBoolEnv(value: string | undefined): boolean {
  if (value === undefined) return false
  return value === "1" || value.toLowerCase() === "true"
}

/**
 * 解析有界整数 env：缺失/无效 → defaultValue；超出 [0, upperLimit] → cap 到 upperLimit。
 * 语义对齐旧仓 validateBoundedIntEnvVar（剥掉 logForDebugging 依赖）。
 *
 * 与旧仓差异：旧仓将 `parsed <= 0` 视为 invalid 回落默认；本函数保留该语义
 * （GLOB_TIMEOUT_SECONDS=0 是合法"不限时"值，调用方传 upperLimit 时若需允许 0
 * 应将 defaultValue 设为 0 并在 upperLimit 范围内）。
 *
 * @param name env 变量名（仅用于返回 status，不做日志）
 * @param value env 原始值
 * @param defaultValue 缺失/无效时的回落值
 * @param upperLimit 上限（parsed > upperLimit 时 cap）
 */
export function parseBoundedIntEnv(
  name: string,
  value: string | undefined,
  defaultValue: number,
  upperLimit: number,
): { effective: number; status: "valid" | "capped" | "invalid" } {
  if (value === undefined || value === "") {
    return { effective: defaultValue, status: "valid" }
  }
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 0) {
    return { effective: defaultValue, status: "invalid" }
  }
  if (parsed > upperLimit) {
    return { effective: upperLimit, status: "capped" }
  }
  return { effective: parsed, status: "valid" }
}
