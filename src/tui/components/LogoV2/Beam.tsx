import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { env } from '../../utils/env.js'
import { PRODUCT_FAMILY, PRODUCT_BRAND } from 'src/shared'
import { getBeamArt, resolveMarkTierFromEnv } from './markDegrade.js'

// BR-3 棱镜光锥（spec §3.1/§8.4，定稿 2026-10-06 方案 A）：
// 大写字母 A 剪影的收敛光锥——底宽冷蓝（算力冷源）→ 顶点暖金（spark）；
// 中段一道横向 beam 光带（= 光本尊，最亮行）；▓ 晶面高光；腿部留负空间空腔。
// 5 行 × 9 宽，与旧 9×5 mark 槽位 + logoV2Utils MAX_LEFT_WIDTH=50 兼容，零布局改动。
// 字符仅用 Block Elements（█▓▄ U+2580-259F；EAW 实测多为 Ambiguous 非 Neutral，见 markDegrade 头注，
// CJK 终端错位风险由 BR-7 3 档降级兜底 spec §3.5）。
// 3 色板走 theme 键（spec §4.1/§4.2 降级链：truecolor 3 段 / 256 三档 / 16 ANSI 两档 / 单色塌同色）。
//
// BR-7（0.1.34-1）：mark 3 档降级（T0 全形态 / T1 半块→实心 / T2 ASCII 骨架）单一事实源移入
// markDegrade.ts；本文件按 resolveMarkTierFromEnv()（③ ATLAS_MARK_DEGRADE env + ① blocklist）
// 解析档位渲染。BEAM_ART（=T0）re-export 保 AnimatedBeam 等既有 import 面。
export { BEAM_ART } from './markDegrade.js'

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
  // BR-7：按 ③ ATLAS_MARK_DEGRADE env + ① blocklist 解析 3 档（默认 T0）
  const art = getBeamArt(resolveMarkTierFromEnv())
  return (
    <Box flexDirection="column">
      {art.map((row, i) => (
        <Text key={i} color={row.color}>{row.chars}</Text>
      ))}
      <WordmarkAndTagline />
    </Box>
  )
}

// Apple Terminal 不渲染字符间垂直空隙 → 单色 brand_mark，形状同上（空腔保留，spec §8.2）。
// BR-7：形状降级仍随档位解析（色固定 brand_mark 单色，色彩降级走 §4.2 独立链）。
function AppleTerminalBeam() {
  const art = getBeamArt(resolveMarkTierFromEnv())
  return (
    <Box flexDirection="column" alignItems="center">
      {art.map((row, i) => (
        <Text key={i} color="brand_mark">{row.chars}</Text>
      ))}
      <WordmarkAndTagline />
    </Box>
  )
}
