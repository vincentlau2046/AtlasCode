// Gateway ASR speech-to-text client for push-to-talk (P2 lane).
//
// G-3（§8.74.28 ⑪ voice 换血）: P1 Anthropic voice_stream WebSocket 支已整裁
// （原 607L 中的 L181-607：voice_stream 端点 + KeepAlive/CloseStream 协议 +
// 流式 TranscriptText interim + Nova 3 gate + keyterms query-param 面）。
// 语音 STT 现只走网关 OpenAI 协议 /audio/transcriptions
// （modelProvider.transcribeAudio）。
//
// 前向缝登记（H6，不造假绿）:
//   - 无流式 interim：音频本地缓冲，finalize() 时一次性转写；
//     onTranscript 至多触发一次（isFinal=true）。useVoice 的 interim 预览
//     路径自然不触发（不删消费面，行为退化为 final-only）。
//   - options.keyterms 接受但不消费（P1 的 voice_stream 查询参数增强面已裁；
//     voiceKeyterms.ts 文件保留，待网关侧 keyterms 车道回流）。
//   - 回流 = 自建 voice_stream 等价 WS 协议实现（无排期）。
//
// 模型解析: ATLAS_ASR_MODEL > settings.asrModel > 'funasr' 默认
// （utils/model/model.ts getAsrModel）。settings voice 模板项:
// asrModel（活项，本文件消费）/ sttUrl（纯模板项，前向缝）。
// 仅 feature('VOICE_MODE') 构建可达（useVoice.ts import 面门控）。

import { modelProvider } from 'src/modelprovider'
import { logForDebugging } from '../utils/debug.js'
import { getAsrModel } from '../utils/model/model.js'

// ─── Types ──────────────────────────────────────────────────────────

export type VoiceStreamCallbacks = {
  onTranscript: (text: string, isFinal: boolean) => void
  onError: (error: string, opts?: { fatal?: boolean }) => void
  onClose: () => void
  onReady: (connection: VoiceStreamConnection) => void
}

// How finalize() resolved. 网关车道无服务端协议：
// 'post_closestream_endpoint' = 转写成功（名随调用方兼容保留）；
// 'no_data_timeout' = 空录音（无音频数据）；'safety_timeout' = 网关 ASR 失败；
// 'ws_already_closed' = close 后重复 finalize。
export type FinalizeSource =
  | 'post_closestream_endpoint'
  | 'no_data_timeout'
  | 'safety_timeout'
  | 'ws_already_closed'

export type VoiceStreamConnection = {
  send: (audioChunk: Buffer) => void
  finalize: () => Promise<FinalizeSource>
  close: () => void
  isConnected: () => boolean
}

// ─── Availability ──────────────────────────────────────────────────────

export function isVoiceStreamAvailable(): boolean {
  // G-3（§8.74.28 ⑪）: P1 OAuth 门已裁——网关 ASR 为唯一车道，模型恒可解析
  // （env > settings.asrModel > 'funasr' 默认）。可用性 = ASR 配置面存在；
  // 录音侧门控（麦克风/依赖）见 services/voice.ts。
  return Boolean(getAsrModel())
}

// ─── Connection ────────────────────────────────────────────────────────

export async function connectVoiceStream(
  callbacks: VoiceStreamCallbacks,
  options?: { language?: string; keyterms?: string[] },
): Promise<VoiceStreamConnection | null> {
  // P2（gateway ASR）: 音频块本地累积；finalize() 时经网关的
  // OpenAI 兼容 /audio/transcriptions 一次性转写。
  // options.keyterms 前向缝不消费（见文件头登记）。
  if (options?.keyterms?.length) {
    logForDebugging(
      `[voice] keyterms accepted but not consumed in gateway ASR lane (forward seam, §8.74.28 ⑪): ${options.keyterms.length} terms`,
    )
  }
  const asrModel = getAsrModel()
  const audioChunks: Buffer[] = []
  let closed = false
  let finalized = false

  const connection: VoiceStreamConnection = {
    send(audioChunk: Buffer): void {
      if (closed || finalized) return
      audioChunks.push(Buffer.from(audioChunk))
    },
    finalize(): Promise<FinalizeSource> {
      if (finalized) return Promise.resolve('ws_already_closed')
      finalized = true
      return (async (): Promise<FinalizeSource> => {
        const audio = Buffer.concat(audioChunks)
        if (audio.length === 0) {
          callbacks.onTranscript('', true)
          return 'no_data_timeout'
        }
        try {
          const text = await modelProvider.transcribeAudio(
            audio,
            asrModel,
            options?.language ?? 'en',
          )
          callbacks.onTranscript(text, true)
          return 'post_closestream_endpoint'
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err)
          callbacks.onError(`Gateway ASR error: ${msg}`)
          return 'safety_timeout'
        }
      })()
    },
    close(): void {
      closed = true
      callbacks.onClose()
    },
    isConnected(): boolean {
      return !closed
    },
  }

  // 网关模式无 WebSocket 握手——连接立即就绪。
  callbacks.onReady(connection)
  return connection
}
