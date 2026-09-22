/**
 * env 解析纯函数（shared 工具，B 波 S1 加）。
 *
 * 四域 config.ts 共用的 env 读取原语。纯函数无副作用（不依赖 debug/log），
 * 旧仓 validateBoundedIntEnvVar 带 logForDebugging 依赖 → 此处剥离为纯函数，
 * 调用方自行决定是否记录（charter L3 域自治：config 层不拉 cross-domain utils）。
 */

/**
 * 解析有界整数 env：缺失/无效 → defaultValue；parsed > upperLimit → cap 到 upperLimit。
 * 语义对齐旧仓 validateBoundedIntEnvVar（剥掉 logForDebugging 依赖，
 * message 字段随之删除——旧仓 message 仅 logForDebugging 消费）。
 *
 * 下界裁定（C1）：默认 `min = 0`（0 合法，GLOB_TIMEOUT=0 表"不限时"）；
 * timeout 类 env 传 `min = 1` 恢复旧仓"0 无效回落默认"语义。
 *
 * @param name env 变量名（仅用于返回 status，不做日志）
 * @param value env 原始值
 * @param defaultValue 缺失/无效时的回落值
 * @param upperLimit 上限（parsed > upperLimit 时 cap）
 * @param min 下界（默认 0；传 1 拒绝 0/负值）
 */
export function parseBoundedIntEnv(
  name: string,
  value: string | undefined,
  defaultValue: number,
  upperLimit: number,
  min = 0,
): { effective: number; status: "valid" | "capped" | "invalid" } {
  if (value === undefined || value === "") {
    return { effective: defaultValue, status: "valid" }
  }
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < min) {
    return { effective: defaultValue, status: "invalid" }
  }
  if (parsed > upperLimit) {
    return { effective: upperLimit, status: "capped" }
  }
  return { effective: parsed, status: "valid" }
}

/**
 * 判断 env 值是否为「真」：`1` / `true` / `yes` / `on`（trim + 大小写不敏感）→ true。
 * 接受 boolean（透传）。语义 = 旧仓 utils/envUtils.ts isEnvTruthy（T3 布尔 env 约定）。
 *
 * C1 统一裁定：本函数是布尔 env 单一事实源——替代 B 波 parseBoolEnv（窄集合）
 * 与 memory/modelprovider 域内本地副本；C1b 消费方全部切到本函数后其余形态删除。
 */
export function isEnvTruthy(
  envVar: string | boolean | undefined,
): boolean {
  if (!envVar) return false
  if (typeof envVar === "boolean") return envVar
  const normalizedValue = envVar.toLowerCase().trim()
  return ["1", "true", "yes", "on"].includes(normalizedValue)
}

/**
 * 判断 env 值是否显式设为「假」：`0` / `false` / `no` / `off`（trim + 大小写不敏感）。
 * undefined → false（未设不算显式假）。语义 = 旧仓 utils/envUtils.ts isEnvDefinedFalsy。
 */
export function isEnvDefinedFalsy(
  envVar: string | boolean | undefined,
): boolean {
  if (envVar === undefined) return false
  if (typeof envVar === "boolean") return !envVar
  if (!envVar) return false
  const normalizedValue = envVar.toLowerCase().trim()
  return ["0", "false", "no", "off"].includes(normalizedValue)
}
