/**
 * BR-7 多终端 CJK 宽度矩阵 · mark 3 档降级（0.1.34-1，spec §3.5 b/c，brand 侧对确 2026-10-06）。
 *
 * 背景（spec §3.2 前提订正，Main 2026-10-06 运行时 EAW 实测）：
 *   Block Elements（█▓▒▄▀ U+2580-259F + 边框 ╱ U+2571）在 Unicode EAW 表里
 *   **多为 Ambiguous（非 spec §3.2 原断言的 Neutral）**——仓 `stringWidth.ts` 用
 *   `eastAsianWidth({ambiguousAsWide:false})` 西方标准测宽=1，Ink 按 1 cell 布局；但
 *   **CJK 终端按 Ambiguous→wide 上下文可画 2 cell = 字体 metrics/上下文问题，非 property 问题**
 *   （spec §3.5 a「渲染格占」实测项）。footer 4 glyph（⚡🧠▶⌂，O-10）实测 EAW 初判订正：
 *   ⚡U+26A1/🧠U+1F9E0 = Wide（非 Ambiguous）· ▶U+25B6 = Ambiguous · ⌂U+2302 = Neutral。
 *   → 降级 = property 保证 + 字体实测兜底：测宽正常信任 property（T0）；实测错位降 T1/T2。
 *
 * 3 档（spec §3.5 b，形状不变只减"切割感"/色彩，单点降级不整版回退）：
 *   T0（默认）全形态 + 4 色渐变 · T1 半块 ▄▀→实心 █（空腔保留，仅 cap 切割感消失）·
 *   T2 ASCII 骨架（A 形剪影，宽度风险=0）。
 * 触发（任一即降级，优先级 ③>①>②，默认恒 T0）：
 *   ③ 手动 `ATLAS_MARK_DEGRADE=1|2`（用户长尾自助，最高优先）
 *   ① BR-7 矩阵 blocklist 命中的 terminal(+font) 组合（静态，随矩阵结论滚动加项）
 *   ② 运行时探针 DSR-6 读回列 advance（`ATLAS_MARK_PROBE` opt-in，I/O 为前向缝，见版本规划登记）
 */
import { env } from '../../utils/env.js'

export type MarkTier = 0 | 1 | 2

/** 手动降级 env（用户长尾自助）：ATLAS_MARK_DEGRADE=1→T1 / =2→T2。 */
export const MARK_DEGRADE_ENV = 'ATLAS_MARK_DEGRADE'
/** DSR-6 探针 opt-in env（前向缝：本波降级触发 = env ③ + blocklist ①；探针 I/O ② 延后，见登记）。 */
export const MARK_PROBE_ENV = 'ATLAS_MARK_PROBE'

type BeamRow = Readonly<{ chars: string; color: string }>

// T0 = 定稿全形态（= 原 Beam.tsx BEAM_ART，BR-3 棱镜光锥 spec §3.1/§8.4 方案 A）。
export const BEAM_ART_T0: ReadonlyArray<BeamRow> = [
  { chars: '   ▄█▄   ', color: 'ascendAmber' }, // 顶点 spark（最亮，脉冲目标）
  { chars: '  ▓███▓  ', color: 'ascendAmber' }, // 上斜面（▓ 晶面 = 上行色降亮）
  { chars: ' █▓▓▓▓▓█ ', color: 'ascendFlame' }, // beam 光带（最亮行 = 光本尊）
  { chars: ' ▓█   █▓ ', color: 'ascendViolet' }, // 腿 + 负空间空腔（中部 3 空格）
  { chars: '█▓█   █▓█', color: 'ascendBlue' }, // 底（冷蓝算力冷源/承重）
]

// T1 = 半块 ▄→实心 █（spec §3.5 b：形状/空腔保留，仅 cap 切割感消失）。BEAM_ART 仅行 0 含半块 ▄。
export const BEAM_ART_T1: ReadonlyArray<BeamRow> = [
  { chars: '   ███   ', color: 'ascendAmber' }, // ▄→█（半块错位兜底）
  { chars: '  ▓███▓  ', color: 'ascendAmber' },
  { chars: ' █▓▓▓▓▓█ ', color: 'ascendFlame' },
  { chars: ' ▓█   █▓ ', color: 'ascendViolet' },
  { chars: '█▓█   █▓█', color: 'ascendBlue' },
]

// T2 = ASCII 骨架（A 形剪影，全 ASCII EAW=Neutral 宽度风险=0；色键随 T0，色彩降级走 §4.2 独立链）。
export const BEAM_ART_T2: ReadonlyArray<BeamRow> = [
  { chars: '   ***   ', color: 'ascendAmber' },
  { chars: '  *   *  ', color: 'ascendAmber' },
  { chars: ' * *** * ', color: 'ascendFlame' },
  { chars: '*   *   *', color: 'ascendViolet' },
  { chars: '*       *', color: 'ascendBlue' },
]

/** 兼容别名：T0 = 默认全形态（AnimatedBeam 等既有 import 面）。 */
export const BEAM_ART: ReadonlyArray<BeamRow> = BEAM_ART_T0

export function getBeamArt(tier: MarkTier): ReadonlyArray<BeamRow> {
  switch (tier) {
    case 2:
      return BEAM_ART_T2
    case 1:
      return BEAM_ART_T1
    default:
      return BEAM_ART_T0
  }
}

/**
 * BR-7 矩阵 blocklist：实测「Block Elements 错位」的 terminal(+font) 组合，命中即降对应档。
 * 初版为空——多终端矩阵（iTerm2/WezTerm/Windows Terminal/GNOME/kitty/Alacritty × 默认/全角 CJK 字体）
 * 为软面（本机不可全验），由 e2e/Brand 侧按「软面定因登记禁裸记」出登记项后滚动加项于此
 * （每项须附定因：终端 + 字体 + 错位信号 advance≠1 + 复现步骤，非裸记）。
 */
export const MARK_BLOCKLIST: ReadonlyArray<MarkBlocklistEntry> = []

export interface MarkTierInput {
  /** ATLAS_MARK_DEGRADE 原值（'1'/'2' 手动降级，最高优先）。 */
  degradeEnv?: string
  /** 终端标识（env.terminal，如 'kitty'/'gnome-terminal'/'alacritty'）。 */
  terminal?: string
  /** 终端主字体（可选，全角 CJK 字体识别信号之一）。 */
  font?: string
  /** DSR-6 探针读回的列 advance（solid=█ advance / half=▄ advance；null=未探/不支持）。 */
  probeAdvance?: { solid: number | null; half: number | null } | null
}

export type MarkBlocklistEntry = Readonly<{ terminal: string; font?: string; tier: 1 | 2 }>

/**
 * 纯判定（供判别单测）：③ 手动 env > ① blocklist 命中 > ② 探针 advance≠1 > 默认 T0。
 *   ③ ATLAS_MARK_DEGRADE=2→T2 / =1→T1（用户长尾自助，最高优先）
 *   ① blocklist 命中 terminal(+font) → 该 entry 的 tier（blocklist 经第 2 参 DI，默认 MARK_BLOCKLIST）
 *   ② 探针：连 █ 都错位（solid≠1）→T2；仅半块错位（half≠1）→T1
 *   默认 T0（Neutral/Ambiguous 宽度是 property 保证，不过度降级，spec §3.5 b 原则）
 */
export function resolveMarkTier(
  input: MarkTierInput = {},
  blocklist: ReadonlyArray<MarkBlocklistEntry> = MARK_BLOCKLIST,
): MarkTier {
  const envTier = input.degradeEnv?.trim()
  if (envTier === '2') return 2
  if (envTier === '1') return 1

  if (input.terminal) {
    const hit = blocklist.find(
      b =>
        b.terminal === input.terminal &&
        (!b.font || !input.font || b.font === input.font),
    )
    if (hit) return hit.tier
  }

  const probe = input.probeAdvance
  if (probe) {
    if (probe.solid != null && probe.solid !== 1) return 2
    if (probe.half != null && probe.half !== 1) return 1
  }

  return 0
}

/**
 * 渲染路径同步解析（默认车道）：读 ATLAS_MARK_DEGRADE + env.terminal 走 ③+①。
 * DSR-6 探针 ② 为 opt-in 前向缝（ATLAS_MARK_PROBE，I/O 延后，见版本规划登记），
 * 渲染路径不自动跑探针（避免启动期终端 I/O 副作用）→ probeAdvance=null。
 */
export function resolveMarkTierFromEnv(): MarkTier {
  return resolveMarkTier({
    degradeEnv: process.env[MARK_DEGRADE_ENV],
    terminal: env.terminal,
    probeAdvance: null,
  })
}
