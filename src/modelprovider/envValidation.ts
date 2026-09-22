/**
 * env 校验工具 — 从旧仓 utils/envValidation.ts 迁入 modelprovider 域
 *
 * C 波再下沉 shared（当前仅 modelprovider 消费）。
 * logForDebugging 旧仓依赖 debug.ts（重图），域内用 no-op（debug 模式外本就是 no-op）。
 */

export type EnvVarValidationResult = {
  effective: number
  status: 'valid' | 'capped' | 'invalid'
  message?: string
}

export function validateBoundedIntEnvVar(
  name: string,
  value: string | undefined,
  defaultValue: number,
  upperLimit: number,
): EnvVarValidationResult {
  if (!value) {
    return { effective: defaultValue, status: 'valid' }
  }
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed <= 0) {
    return {
      effective: defaultValue,
      status: 'invalid',
      message: `Invalid value "${value}" (using default: ${defaultValue})`,
    }
  }
  if (parsed > upperLimit) {
    return {
      effective: upperLimit,
      status: 'capped',
      message: `Capped from ${parsed} to ${upperLimit}`,
    }
  }
  return { effective: parsed, status: 'valid' }
}
