import * as React from 'react'
import { useEffect, useState } from 'react'
import { Box, Text } from '../../ink.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import { BEAM_ART } from './Beam.js'

// BR-3 光锥 loading 动效（spec §2.2 / plan §1.1）：
//   - 光扫上爬：loading 时从底向顶逐行点亮（REVEAL_MS × 5 行 ≈ 0.6s），
//     即 Ascend 攀升的微缩表演（光锥是抽象图形无肢体，旧 pose 机制整体废弃）。
//   - 顶点 spark 脉冲呼吸：点亮完成后 apex 行按 PULSE_MS（0.8s）周期脉冲。
// 尊重 prefersReducedMotion（关则渲染静态满亮 mark，与 spec §9.1 差异见 0.1.33 report）。
// 容器高度固定 = 光锥行数，布局不漂移（同旧 mark 组件固定 footprint 语义）。
const ROW_COUNT = BEAM_ART.length
const REVEAL_MS = 120 // 每行 120ms × 5 行 ≈ 0.6s 光扫上爬
const PULSE_MS = 800 // 顶点 spark 脉冲周期 0.8s

// O-9（0.1.34，e2e O-9）：全屏（ATLAS_NO_FLICKER）防闪烁诉求 —— 顶点脉冲限定
// PULSE_MAX_BEATS 拍（4 × 0.8s ≈ 3.2s）后收敛为静态全亮 apex（旧「永久 0.8s 脉冲」
// 与防闪烁相悖，且旧 effect 未把 pulseOn 入依赖，实际只翻拍一次停在暗态 = 潜伏 bug）；
// prefersReducedMotion 仍直接静态全亮。收敛规则抽纯面 nextPulseStep 供判别单测。
export const PULSE_MAX_BEATS = 4

/** O-9 脉冲状态纯面：拍数达限 → 收敛全亮 + done（幂等，不再翻拍/重挂定时器）。 */
export function nextPulseStep(
  beats: number,
  pulseOn: boolean,
): { beats: number; pulseOn: boolean; done: boolean } {
  if (beats >= PULSE_MAX_BEATS) {
    return { beats, pulseOn: true, done: true }
  }
  return { beats: beats + 1, pulseOn: !pulseOn, done: false }
}

export function AnimatedBeam(): React.ReactNode {
  // 读一次 settings（不订阅 useSettings，避免任意 settings 变更触发重渲染，同旧 useClawdAnimation）。
  const [reducedMotion] = useState(() => getInitialSettings().prefersReducedMotion ?? false)
  const [revealed, setRevealed] = useState(reducedMotion ? ROW_COUNT : 1)
  const [pulseOn, setPulseOn] = useState(true)
  const [pulseBeats, setPulseBeats] = useState(0)

  useEffect(() => {
    if (reducedMotion) {
      return
    }
    if (revealed < ROW_COUNT) {
      const t = setTimeout(() => setRevealed((r) => r + 1), REVEAL_MS)
      return () => clearTimeout(t)
    }
    const s = nextPulseStep(pulseBeats, pulseOn)
    if (s.done) {
      // O-9：4 拍（≈3.2s）用尽 → 收敛静态全亮 apex（若末拍停在暗态则补亮），不重挂定时器
      if (pulseOn !== s.pulseOn) {
        setPulseOn(s.pulseOn)
      }
      return
    }
    const t = setTimeout(() => {
      setPulseBeats(s.beats)
      setPulseOn(s.pulseOn)
    }, PULSE_MS)
    return () => clearTimeout(t)
  }, [revealed, reducedMotion, pulseBeats, pulseOn])

  return (
    <Box height={ROW_COUNT} flexDirection="column">
      {BEAM_ART.map((row, i) => {
        // 从底向上逐行点亮：底部行（index ROW_COUNT-1）最先亮，顶点行（index 0）最后亮。
        const depthFromBottom = ROW_COUNT - 1 - i
        if (depthFromBottom >= revealed) {
          return <Text key={i}>{' '.repeat(row.chars.length)}</Text>
        }
        // 顶点 spark 脉冲间歇（!pulseOn）→ 降亮一档（amber→violet 近似"呼吸"），脉冲开时最亮。
        if (i === 0 && !pulseOn) {
          return (
            <Text key={i} color="ascendViolet">
              {row.chars}
            </Text>
          )
        }
        return (
          <Text key={i} color={row.color}>
            {row.chars}
          </Text>
        )
      })}
    </Box>
  )
}
