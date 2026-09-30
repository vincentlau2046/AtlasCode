import { feature } from 'src/shared'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { getAsrModel } from '../utils/model/model.js'

/**
 * Kill-switch check for voice mode. Returns true unless the
 * `atlas_amber_quartz_disabled` GrowthBook flag is flipped on (emergency
 * off). Default `false` means a missing/stale disk cache reads as "not
 * killed" — so fresh installs get voice working immediately without
 * waiting for GrowthBook init. Use this for deciding whether voice mode
 * should be *visible* (e.g., command registration, config UI).
 */
export function isVoiceGrowthBookEnabled(): boolean {
  // Positive ternary pattern — see docs/feature-gating.md.
  // Negative pattern (if (!feature(...)) return) does not eliminate
  // inline string literals from external builds.
  return feature('VOICE_MODE')
    ? !getFeatureValue_CACHED_MAY_BE_STALE('atlas_amber_quartz_disabled', false)
    : false
}

/**
 * Voice ASR config check. G-3（§8.74.28 ⑪ voice 换血）: P1 Anthropic
 * OAuth 门（getOAuthTokens / isAnthropicAuthEnabled，旧名 hasVoiceAuth）
 * 已随 voice_stream WS 支整裁——语音 STT 只走网关 ASR 车道（P2），
 * 模型恒可解析（ATLAS_ASR_MODEL > settings.asrModel > 'funasr' 默认，
 * 见 utils/model/model.ts getAsrModel），故此检查为 ASR 配置面存在性
 * 检查而非鉴权检查。
 */
export function hasVoiceAsrConfig(): boolean {
  return Boolean(getAsrModel())
}

/**
 * Full runtime check: ASR config + GrowthBook kill-switch. Callers:
 * `/voice` (voice.ts, voice/index.ts), ConfigTool, VoiceModeNotice —
 * command-time paths where a fresh settings read is acceptable. For
 * React render paths use useVoiceEnabled() instead (memoizes the
 * config half).
 */
export function isVoiceModeEnabled(): boolean {
  return hasVoiceAsrConfig() && isVoiceGrowthBookEnabled()
}
