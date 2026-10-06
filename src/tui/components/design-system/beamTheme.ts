/**
 * 0.1.35 Brand 封口波 · 母题铺开（spec §2.2 视觉母题系统）纯函数面。
 *
 * 母题字符面 = Block Elements / Box Drawing（U+2500-259F + U+2571），无几何歧义字形（▲◆）。
 * EAW 归类：多为 Ambiguous（仓模型 1 cell / 全角 CJK 上下文可 2 cell），错位风险随
 * markDegrade 3 档降级 + MARK_BLOCKLIST 兜底（spec §3.5，EAW 实测锁见
 * tests/unit/mark-cjk-width.test.ts blockChars 表）；仅 `░` U+2591 = 真 Neutral（零风险）。
 * 各触面消费方（Spinner/ProgressBar/Divider/PromptInput/Feed）经本单一事实源取字符，
 * 档位感知（T0 全形态 / T1 实心 / T2 骨架），T1/T2 单点回落旧字符（母题降一档，不整版回退，
 * spec §6 回退）。
 *
 * 光核微符号触面（spec §2.2 最小集）：LIGHT_CORE `▀` = 光心色块单一事实源（0.1.33 tips
 * 光核前缀 D-3 同字），mark 顶点 spark + spinner 光束顶点同族复用；本波不新增触面
 * （watermark/光标无新需求，按需最小集裁定）。
 */
import { getDefaultCharacters } from '../Spinner/utils.js'
import type { MarkTier } from '../LogoV2/markDegrade.js'

/** 光锥角标（边框角标触面；U+2571 Ambiguous，全角 CJK 2-cell 风险随 §3.5 降级兜底）。 */
export const BEAM_CORNER = '╱'

/** 光核微符号（光心色块，全 UI 单一事实源；tips 前缀 / mark 顶点 / spinner 顶点同族）。 */
export const LIGHT_CORE = '▀'

/** 空态短底纹（暗淡 ░ 光锥底纹，4 单元留白排布；对齐仓内 guest-passes 既有先例）。 */
export const EMPTY_TEXTURE = '░ ░ ░ ░'

/**
 * 分隔线触面：`█ █` 光束串（Block Elements + 空格，CJK 1-cell 安全）。
 * width = 目标列宽（截断到整串不超宽；低权重元素配 dimColor 渲染）。
 */
export function beamDividerLine(width: number, pattern = '█ '): string {
  if (width <= 0) return ''
  const reps = Math.ceil(width / pattern.length)
  return pattern.repeat(reps).slice(0, width)
}

/** 空态底纹满宽行（░ 重复；调用方 dimColor 渲染）。 */
export function beamTextureLine(width: number): string {
  return width > 0 ? '░'.repeat(width) : ''
}

// ── spinner 光束串帧（spec §0.1 spinner 触面：点状帧 → 光束串，光扫上爬 底→顶）────────

// T0 光束爬帧：2-cell 双列半块，光自底向上逐帧点亮（Ascend 攀升隐喻），镜面对称 8 帧
// （4 升 + 顶点双帧驻留 + 4 降，f[i]=f[7-i] ping-pong 无跳变）。
// 帧节奏沿用既有 120ms/帧（SpinnerAnimationRow `Math.floor(time/120)`，节奏零行为变化仅换字形），
// 全周期 ≈ 0.96s。半块 ▁▃▅（U+2581-2588 族）Ambiguous，随 §3.5 降级兜底。
export const SPINNER_BEAM_FRAMES_T0: ReadonlyArray<string> = [
  '▁▁',
  '▃▃',
  '▅▅',
  '██',
  '██',
  '▅▅',
  '▃▃',
  '▁▁',
]

/**
 * 档位感知 spinner 帧：T0 = 光束串；T1/T2（Block Elements 错位终端）→ 旧点状帧回落
 * （getDefaultCharacters ping-pong，= 改前行为，零回归）。
 */
export function getSpinnerBeamFrames(tier: MarkTier): ReadonlyArray<string> {
  if (tier === 0) return SPINNER_BEAM_FRAMES_T0
  const dots = getDefaultCharacters()
  return [...dots, ...[...dots].reverse()]
}

/** reduced-motion 静态字形（关动效不留残帧，spec §0.2/§9.1）：T0 静态光束 / T1·T2 静态点。 */
export function getReducedMotionSpinnerGlyph(tier: MarkTier): string {
  return tier === 0 ? '▇▇' : '●'
}

// ── 进度条光束填充（spec §0.1 进度条触面：`███░░░░` 光束填充，光束向前推进）────────

// T0 填充阶（8 分之一块 ▏-▉ 平滑推进 + █ 满）；T1/T2 = 八分之一块降实心 █（半块类错位兜底）。
// 空段 = ░ 光锥底纹（U+2591 Neutral 零宽度风险；改前 = 空格，母题化后为 ░）。
export function getProgressBarBlocks(tier: MarkTier): ReadonlyArray<string> {
  if (tier !== 0) return ['░', '█']
  return ['░', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']
}
