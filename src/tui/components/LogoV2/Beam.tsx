import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { env } from '../../utils/env.js'
import { PRODUCT_FAMILY, PRODUCT_BRAND } from 'src/shared'

// BR-3 棱镜光锥（spec §3.1/§8.4，定稿 2026-10-06 方案 A）：
// 大写字母 A 剪影的收敛光锥——底宽冷蓝（算力冷源）→ 顶点暖金（spark）；
// 中段一道横向 beam 光带（= 光本尊，最亮行）；▓ 晶面高光；腿部留负空间空腔。
// 5 行 × 9 宽，与旧 9×5 mark 槽位 + logoV2Utils MAX_LEFT_WIDTH=50 兼容，零布局改动。
// 字符仅用 Block Elements（█▓▄ U+2580-259F，Neutral 宽度=1，CJK 终端安全 spec §3.2）。
// 3 色板走 theme 键（spec §4.1/§4.2 降级链：truecolor 3 段 / 256 三档 / 16 ANSI 两档 / 单色塌同色）。
export const BEAM_ART: ReadonlyArray<{ chars: string; color: string }> = [
  { chars: '   ▄█▄   ', color: 'ascendAmber' },  // 顶点 spark（最亮，脉冲目标）
  { chars: '  ▓███▓  ', color: 'ascendAmber' },  // 上斜面（▓ 晶面 = 上行色降亮）
  { chars: ' █▓▓▓▓▓█ ', color: 'ascendFlame' },  // beam 光带（最亮行 = 光本尊）
  { chars: ' ▓█   █▓ ', color: 'ascendViolet' }, // 腿 + 负空间空腔（中部 3 空格）
  { chars: '█▓█   █▓█', color: 'ascendBlue' },   // 底（冷蓝算力冷源/承重）
]

// wordmark 双色（spec §3.3）："Atlas" 暖金（brand）+ "Code" 冷蓝（ascendBlue）。
// 不硬编码品牌字面（D-2）：family 段取 PRODUCT_FAMILY，suffix 段 = PRODUCT_BRAND 去 family 前缀。
function wordmarkParts(): { family: string; suffix: string } {
  const family = PRODUCT_FAMILY // "Atlas"
  const suffix = PRODUCT_BRAND.slice(family.length) // "Code"
  return { family, suffix }
}

function WordmarkAndTagline() {
  const { family, suffix } = wordmarkParts()
  return (
    <>
      <Text>
        <Text color="brand">{family}</Text>
        <Text color="ascendBlue">{suffix}</Text>
      </Text>
      <Text dimColor={true}>算力驱动的 Coding Agent</Text>
      <Text dimColor={true}>AI Coding Agent</Text>
    </>
  )
}

export function Beam(): React.ReactNode {
  if (env.terminal === 'Apple_Terminal') {
    return <AppleTerminalBeam />
  }
  return (
    <Box flexDirection="column">
      {BEAM_ART.map((row, i) => (
        <Text key={i} color={row.color}>{row.chars}</Text>
      ))}
      <WordmarkAndTagline />
    </Box>
  )
}

// Apple Terminal 不渲染字符间垂直空隙 → 单色 brand_mark，形状同上（空腔保留，spec §8.2）。
function AppleTerminalBeam() {
  return (
    <Box flexDirection="column" alignItems="center">
      {BEAM_ART.map((row, i) => (
        <Text key={i} color="brand_mark">{row.chars}</Text>
      ))}
      <WordmarkAndTagline />
    </Box>
  )
}
