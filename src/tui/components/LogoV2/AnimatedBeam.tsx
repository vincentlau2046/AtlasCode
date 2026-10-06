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

export function AnimatedBeam(): React.ReactNode {
  // 读一次 settings（不订阅 useSettings，避免任意 settings 变更触发重渲染，同旧 useClawdAnimation）。
  const [reducedMotion] = useState(() => getInitialSettings().prefersReducedMotion ?? false)
  const [revealed, setRevealed] = useState(reducedMotion ? ROW_COUNT : 1)
  const [pulseOn, setPulseOn] = useState(true)

  useEffect(() => {
    if (reducedMotion) {
      return
    }
    if (revealed < ROW_COUNT) {
      const t = setTimeout(() => setRevealed((r) => r + 1), REVEAL_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setPulseOn((p) => !p), PULSE_MS)
    return () => clearTimeout(t)
  }, [revealed, reducedMotion])

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
