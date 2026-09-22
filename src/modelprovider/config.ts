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
 * @returns modelprovider 域 env 配置
 */
export function createModelProviderConfig(): ModelProviderConfig {
  // B 波 S2 实现：读 process.env + env-defaults-decision fallback
  throw new Error("B 波 S2 实现：createModelProviderConfig()")
}
