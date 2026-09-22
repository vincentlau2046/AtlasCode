/**
 * 自治三柱③: endpoint/role 配置 — 契约冻结（B 波分叉前锁死）
 *
 * charter L3 modelprovider 自治：endpoint/role 配置从寄生 settings + roles.ts 全局
 * → config.ts 自管（ModelProviderConfig）；errorMessaging 走 Port 2；constants 自管。
 * 替换开源模块时只改 config.ts 数据源，状态/配置/类型全在域内不动。
 *
 * env 来源：env-defaults-decision.md（ATLAS_API_BASE_URL / LLM_TIMEOUT / MAX_OUTPUT_TOKENS
 * / EXTRA_BODY / EXTRA_METADATA / CUSTOM_HEADERS / {ROLE}_MODEL / MAX_RETRIES）。
 *
 * EndpointConfigSource（读 settings providers/roles）是已有 port 模式，B 波迁入。
 */

/**
 * modelprovider 域从 env 读取的 LLM 调用配置。
 * settings 部分（providers/roleModels）走 EndpointConfigSource port，不在此。
 */
export interface ModelProviderConfig {
  /** ATLAS_API_BASE_URL（② preset IFF 网关 endpoint，[ATLAS-HOLD] 待定案换值） */
  readonly apiBaseUrl: string | undefined
  /** ATLAS_LLM_TIMEOUT（② preset 沿用代码 fallback） */
  readonly llmTimeoutMs: number
  /** ATLAS_MAX_OUTPUT_TOKENS（② preset 沿用代码 fallback） */
  readonly maxOutputTokens: number
  /** ATLAS_MAX_RETRIES（② preset 沿用代码 fallback） */
  readonly maxRetries: number
  /** ATLAS_EXTRA_BODY（② preset 空，仅国内容器网关覆盖） */
  readonly extraBody: Record<string, unknown> | undefined
  /** ATLAS_EXTRA_METADATA（② preset 空） */
  readonly extraMetadata: Record<string, unknown> | undefined
  /** ATLAS_CUSTOM_HEADERS（② preset 空，静态键走 OPENAI_AUTH_TOKEN/API_KEY） */
  readonly customHeaders: Record<string, string> | undefined
}

/**
 * 读 env 生成 ModelProviderConfig。B 波 S2 实现。
 * settings providers/roleModels 走 EndpointConfigSource port（已有模式）。
 *
 * fallback 值来源（旧仓实证）：
 *  - llmTimeoutMs：modelprovider.ts:183 constructor default = 120_000，cap 1_800_000
 *  - maxOutputTokens：roles.ts:127 HARD_DEFAULT_MAX_TOKENS = 32768
 *  - maxRetries：modelprovider.ts:183 constructor default = 3
 *
 * @returns modelprovider 域 env 配置
 */
export function createModelProviderConfig(): ModelProviderConfig {
  return {
    apiBaseUrl: process.env.ATLAS_API_BASE_URL,
    llmTimeoutMs: resolveBoundedInt('ATLAS_LLM_TIMEOUT', 120_000, 1_800_000),
    maxOutputTokens: resolveBoundedInt('ATLAS_MAX_OUTPUT_TOKENS', 32_768, 2_000_000),
    maxRetries: resolveBoundedInt('ATLAS_MAX_RETRIES', 3, 20),
    extraBody: parseJsonEnv('ATLAS_EXTRA_BODY'),
    extraMetadata: parseJsonEnv('ATLAS_EXTRA_METADATA'),
    customHeaders: parseHeadersEnv('ATLAS_CUSTOM_HEADERS'),
  }
}

/** 有界整数 env 解析（fallback + cap，对齐旧仓 validateBoundedIntEnvVar 语义）。 */
function resolveBoundedInt(
  name: string,
  defaultValue: number,
  upperLimit: number,
): number {
  const value = process.env[name]
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed <= 0) return defaultValue
  if (parsed > upperLimit) return upperLimit
  return parsed
}

/** JSON 对象 env（ATLAS_EXTRA_BODY / ATLAS_EXTRA_METADATA）。 */
function parseJsonEnv(name: string): Record<string, unknown> | undefined {
  const raw = process.env[name]
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

/** Headers env（ATLAS_CUSTOM_HEADERS，"Key: Value\nKey2: Value2" 或 JSON）。 */
function parseHeadersEnv(
  name: string,
): Record<string, string> | undefined {
  const raw = process.env[name]
  if (!raw) return undefined
  // JSON 形式优先
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, string>
      }
    } catch {
      // fall through to line parse
    }
  }
  // "Key: Value" 逐行
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim()
      if (key) out[key] = val
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}
