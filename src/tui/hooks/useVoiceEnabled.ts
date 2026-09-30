import { useMemo } from 'react'
import { useAppState } from '../state/AppState.js'
import {
  hasVoiceAsrConfig,
  isVoiceGrowthBookEnabled,
} from '../voice/voiceModeEnabled.js'

/**
 * Combines user intent (settings.voiceEnabled) with ASR config + GB
 * kill-switch. G-3（§8.74.28 ⑪ voice 换血）: 旧 auth 半（hasVoiceAuth，
 * memoize 在 authVersion 上——P1 Anthropic OAuth 面）已裁。ASR 配置半
 * （env ATLAS_ASR_MODEL / settings.asrModel）会话内不变，空依赖 memo。
 * GB 是廉价的缓存 map 查表，留在 memo 外，kill-switch 中会话翻转
 * 下一次渲染即生效。
 */
export function useVoiceEnabled(): boolean {
  const userIntent = useAppState(s => s.settings.voiceEnabled === true)
  const asrConfigured = useMemo(hasVoiceAsrConfig, [])
  return userIntent && asrConfigured && isVoiceGrowthBookEnabled()
}
