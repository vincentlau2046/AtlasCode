import { modelProvider } from 'src/modelprovider'
import { logError } from '../../utils/log.js'

/**
 * P5 降级组 #11：converged onto `modelProvider.verifyKey` (R1/R2).
 *
 * R1 — 调用方只调一次（useApiKeyVerification 的 reverify 是唯一的周期重发源），
 * provider 内部先打零 token 的 `GET /v1/models` liveness，再保留**一次性** 1-token
 * 判据，避免本地网关反复切模型 + 烧 token。
 * R2 — 开放端点 liveness 通过 ≠ key 有效，所以 1-token 补全仍是 key 的最终判据。
 */
export async function verifyApiKey(
  apiKey: string,
  isNonInteractiveSession: boolean,
): Promise<boolean> {
  // Skip API verification if running in print mode (isNonInteractiveSession)
  if (isNonInteractiveSession) {
    return true
  }
  try {
    // Endpoint is derived from the fast role config; OPENAI_API_KEY is the fallback key
    // when the caller's key is empty (handled inside modelProvider.verifyKey).
    return await modelProvider.verifyKey(apiKey)
  } catch (errorFromRetry) {
    // Non-401/403 error — log it (mirrors the pre-P5 auth.ts behavior).
    logError(errorFromRetry)
    throw errorFromRetry
  }
}
