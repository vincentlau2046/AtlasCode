/**
 * BR-7 多终端 CJK 宽度矩阵 · O-10 EAW 断言 + mark 3 档降级判定单测（0.1.34-1，spec §3.5 / O-10）。
 *
 * O-10（footer 4 glyph EAW 归类，spec「归类以仓 eastAsianWidth 包运行时输出为准，四件套含 EAW 断言单测锁 4 值」）：
 *   锁定 footer 4 状态 glyph ⚡🧠▶⌂（Model/Thinking/PermissionMode/Cwd 段）在仓模型
 *   （ambiguousAsWide:false，= stringWidth.ts 布局模型）与 CJK 上下文（ambiguousAsWide:true）下的
 *   运行时宽度。spec §3.5 O-10 表初判「4 glyph 全 Ambiguous」经运行时订正：
 *   ⚡ U+26A1 / 🧠 U+1F9E0 = Wide（两模型均 2，非 Ambiguous）· ▶ U+25B6 = Ambiguous（仓 1 / CJK 2）·
 *   ⌂ U+2302 = Neutral（两模型均 1，非 Ambiguous）。
 *
 * mark Block Elements（spec §3.2 前提订正）：spec §3.2 原断言「U+2580-259F Neutral 宽度=始终 1」，
 *   运行时 EAW 实测多为 **Ambiguous**（仓模型测宽 1，Ink 按 1 cell 布局；但 CJK 上下文按 wide=2
 *   = 错位风险根源，即 BR-7 降级兜底的依据）。仅 ░ U+2591 为真 Neutral。
 *
 * mark 3 档降级（spec §3.5 b）：resolveMarkTier 纯判定（③ 手动 env > ① blocklist > ② 探针 > 默认 T0）
 *   + getBeamArt 三档形状断言（T1 半块→实心 / T2 ASCII 骨架 / 各档 5 行×9 宽布局不变）。
 *
 * 分层纪律：纯函数断言（EAW 包 + markDegrade 纯面，无网络 / 无真实终端 / 无 settings 读取）。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { eastAsianWidth } from 'get-east-asian-width'
import {
  BEAM_ART_T0,
  BEAM_ART_T1,
  BEAM_ART_T2,
  getBeamArt,
  isRegisteredMarkBlocklistEntry,
  resolveMarkTier,
} from '../../src/tui/components/LogoV2/markDegrade.js'
import type { MarkBlocklistEntry } from '../../src/tui/components/LogoV2/markDegrade.js'

/** 给定 codepoint 在某 EAW 模型（ambiguousAsWide）下的宽度（1|2）。 */
function w(cp: number, ambiguousAsWide: boolean): 1 | 2 {
  return eastAsianWidth(cp, { ambiguousAsWide })
}

function readSrc(rel: string): string {
  return readFileSync(join(import.meta.dir, '../../src', rel), 'utf8')
}

describe('BR-7 O-10 footer 4 glyph EAW 归类（spec §3.5 O-10，运行时真值锁 4 值）', () => {
  test('⚡ U+26A1（Model 段）= Wide：两模型均 2（spec 初判「Ambiguous」订正）', () => {
    expect(w(0x26a1, false)).toBe(2)
    expect(w(0x26a1, true)).toBe(2)
  })
  test('🧠 U+1F9E0（Thinking 段）= Wide：两模型均 2（spec 初判「Ambiguous」订正）', () => {
    expect(w(0x1f9e0, false)).toBe(2)
    expect(w(0x1f9e0, true)).toBe(2)
  })
  test('▶ U+25B6（PermissionMode default）= Ambiguous：仓模型 1 / CJK 上下文 2', () => {
    expect(w(0x25b6, false)).toBe(1)
    expect(w(0x25b6, true)).toBe(2)
  })
  test('⌂ U+2302（Cwd 段）= Neutral：两模型均 1（spec 初判「Ambiguous」订正）', () => {
    expect(w(0x2302, false)).toBe(1)
    expect(w(0x2302, true)).toBe(1)
  })
})

describe('BR-7 mark Block Elements EAW（spec §3.2 前提订正：多为 Ambiguous 非 Neutral）', () => {
  // 仓模型（ambiguousAsWide:false）测宽=1（Ink 按 1 cell 布局）；CJK 上下文（true）Ambiguous 者=2
  // = 全角 CJK 终端错位风险根源（字体 metrics/上下文问题，非 property 保证）。
  const blockChars: Array<[string, number, 1 | 2, 1 | 2]> = [
    ['█ U+2588', 0x2588, 1, 2],
    ['▓ U+2593', 0x2593, 1, 2],
    ['▒ U+2592', 0x2592, 1, 2],
    ['░ U+2591', 0x2591, 1, 1], // 唯一真 Neutral
    ['▄ U+2584', 0x2584, 1, 2],
    ['▀ U+2580', 0x2580, 1, 2],
    ['╱ U+2571', 0x2571, 1, 2],
    // 0.1.35 母题铺开新增字符（spinner 光束帧半块 ▁▃▅▇ + 进度条八分之一块 ▏-▉，
    // 运行时实测同 Ambiguous 类：仓 1 / CJK 2，随 §3.5 降级 + MARK_BLOCKLIST 兜底）
    ['▁ U+2581', 0x2581, 1, 2],
    ['▃ U+2583', 0x2583, 1, 2],
    ['▅ U+2585', 0x2585, 1, 2],
    ['▇ U+2587', 0x2587, 1, 2],
    ['▏ U+258F', 0x258f, 1, 2],
    ['▎ U+258E', 0x258e, 1, 2],
    ['▍ U+258D', 0x258d, 1, 2],
    ['▌ U+258C', 0x258c, 1, 2],
    ['▋ U+258B', 0x258b, 1, 2],
    ['▊ U+258A', 0x258a, 1, 2],
    ['▉ U+2589', 0x2589, 1, 2],
  ]
  for (const [label, cp, narrow, wide] of blockChars) {
    test(`${label}：仓模型=${narrow} / CJK 上下文=${wide}`, () => {
      expect(w(cp, false)).toBe(narrow)
      expect(w(cp, true)).toBe(wide)
    })
  }
})

describe('BR-7 mark 3 档降级判定（spec §3.5 b，优先级 ③>①>②>默认 T0）', () => {
  test('默认 = T0（无任何信号）', () => {
    expect(resolveMarkTier()).toBe(0)
    expect(resolveMarkTier({})).toBe(0)
    expect(resolveMarkTier({ terminal: 'kitty', probeAdvance: null })).toBe(0)
    expect(resolveMarkTier({ terminal: 'kitty', probeAdvance: { solid: 1, half: 1 } })).toBe(0)
  })
  test('③ 手动 env 最高优先：ATLAS_MARK_DEGRADE=1→T1 / =2→T2（压过 blocklist/探针）', () => {
    expect(resolveMarkTier({ degradeEnv: '1' })).toBe(1)
    expect(resolveMarkTier({ degradeEnv: '2' })).toBe(2)
    expect(resolveMarkTier({ degradeEnv: '1', probeAdvance: { solid: 2, half: 2 } })).toBe(1)
    expect(resolveMarkTier({ degradeEnv: '2', probeAdvance: { solid: 1, half: 1 } })).toBe(2)
    // 容忍首尾空白
    expect(resolveMarkTier({ degradeEnv: ' 2 ' })).toBe(2)
    // 非 '1'/'2' 值不触发（回落后续信号/默认）
    expect(resolveMarkTier({ degradeEnv: '0' })).toBe(0)
    expect(resolveMarkTier({ degradeEnv: 'garbage' })).toBe(0)
  })
  test('① blocklist 命中 terminal(+font) → 该 entry 的 tier（经第 2 参 DI 注入）', () => {
    const list = [
      { terminal: 'kitty', tier: 1 },
      { terminal: 'alacritty', font: 'Sarasa Mono SC', tier: 2 },
    ]
    // terminal 命中（无 font 约束 → 任意字体命中）
    expect(resolveMarkTier({ terminal: 'kitty' }, list)).toBe(1)
    // terminal + font 均命中
    expect(
      resolveMarkTier({ terminal: 'alacritty', font: 'Sarasa Mono SC' }, list),
    ).toBe(2)
    // terminal 命中但 font 不匹配（entry 有 font 约束 + input font 不同）→ 不命中 → 默认 T0
    expect(resolveMarkTier({ terminal: 'alacritty', font: 'Noto Sans CJK' }, list)).toBe(0)
    // terminal 不命中 → 默认 T0
    expect(resolveMarkTier({ terminal: 'wezterm' }, list)).toBe(0)
  })
  test('① blocklist 优先于 ② 探针（blocklist 命中即返回，不看探针）', () => {
    const list = [{ terminal: 'kitty', tier: 1 }]
    // blocklist 命中 T1，即便探针报告 solid 错位（T2 信号）也以 blocklist 为准
    expect(
      resolveMarkTier({ terminal: 'kitty', probeAdvance: { solid: 2, half: 2 } }, list),
    ).toBe(1)
  })
  test('② 探针：连 █ 都错位（solid≠1）→T2；仅半块错位（half≠1）→T1', () => {
    expect(resolveMarkTier({ probeAdvance: { solid: 2, half: 2 } })).toBe(2)
    expect(resolveMarkTier({ probeAdvance: { solid: 1, half: 2 } })).toBe(1)
    expect(resolveMarkTier({ probeAdvance: { solid: 1, half: 1 } })).toBe(0)
  })
})

describe('BR-7 getBeamArt 三档形状（布局 footprint 恒定 5 行×9 宽，零漂移）', () => {
  test('三档均 5 行 × 9 宽（与旧 9×5 mark 槽位兼容，布局零改动）', () => {
    for (const art of [BEAM_ART_T0, BEAM_ART_T1, BEAM_ART_T2]) {
      expect(art).toHaveLength(5)
      for (const row of art) {
        expect(row.chars.length).toBe(9)
      }
    }
  })
  test('T1 = T0 半块 ▄→实心 █（仅行 0 变，形状/空腔保留，色键不变）', () => {
    expect(BEAM_ART_T1[0]!.chars).toBe('   ███   ') // ▄→█
    expect(BEAM_ART_T1[0]!.color).toBe(BEAM_ART_T0[0]!.color)
    for (let i = 1; i < 5; i++) {
      expect(BEAM_ART_T1[i]!.chars).toBe(BEAM_ART_T0[i]!.chars)
    }
  })
  test('T2 = ASCII 骨架（A 形剪影，全 ASCII = EAW Neutral 宽度风险 0，无 Block Elements）', () => {
    for (const row of BEAM_ART_T2) {
      // 全可打印 ASCII（U+0020-007E）
      expect(/^[ -~]+$/.test(row.chars)).toBe(true)
    }
    expect(BEAM_ART_T2.some(r => /[█▓▒░▄▀╱]/.test(r.chars))).toBe(false)
  })
  test('getBeamArt 路由：0→T0 / 1→T1 / 2→T2', () => {
    expect(getBeamArt(0)).toBe(BEAM_ART_T0)
    expect(getBeamArt(1)).toBe(BEAM_ART_T1)
    expect(getBeamArt(2)).toBe(BEAM_ART_T2)
  })
})

describe('BR-7 MARK_BLOCKLIST 登记机制（0.1.35，软面定因登记禁裸记，spec §3.5 b）', () => {
  test('源级在场：MARK_BLOCKLIST 初版 = 空模板（未登记）+ 头注登记协议在场', () => {
    const src = readSrc('tui/components/LogoV2/markDegrade.ts')
    expect(src).toContain('export const MARK_BLOCKLIST: ReadonlyArray<MarkBlocklistEntry> = []')
    // 登记协议头注：每项须附定因（终端 + 字体 + 错位信号 advance≠1 + 复现步骤），非裸记
    expect(src).toContain('非裸记')
    expect(src).toContain('advance≠1')
  })

  test('isRegisteredMarkBlocklistEntry：完整定因登记（terminal + tier + advanceSignal 错位信号）→ true', () => {
    const entry: MarkBlocklistEntry = {
      terminal: 'kitty',
      font: 'Sarasa Mono SC',
      tier: 1,
      advanceSignal: { solid: 1, half: 2 }, // 半块 ▄ 错位（≠1 = 错位信号）
      reproSteps: 'kitty + Sarasa Mono SC，半块 ▄ 画 2 cell',
    }
    expect(isRegisteredMarkBlocklistEntry(entry)).toBe(true)
  })

  test('定因字段仅需其一：advanceSignal 或 reproSteps 在场即完整（非裸记）', () => {
    expect(
      isRegisteredMarkBlocklistEntry({ terminal: 'kitty', tier: 2, advanceSignal: { solid: 2, half: 2 } }),
    ).toBe(true)
    expect(
      isRegisteredMarkBlocklistEntry({ terminal: 'alacritty', tier: 1, reproSteps: 'alacritty + 全角 CJK，█ 画 2 cell' }),
    ).toBe(true)
  })

  test('裸记（terminal + tier 无定因字段）→ false（软面定因登记禁裸记）', () => {
    expect(isRegisteredMarkBlocklistEntry({ terminal: 'kitty', tier: 1 })).toBe(false)
  })

  test('空 terminal / 非法 tier（∉{1,2}）→ false（完整登记前置不满足）', () => {
    expect(
      isRegisteredMarkBlocklistEntry({ terminal: '', tier: 1, advanceSignal: { solid: 1, half: 1 } }),
    ).toBe(false)
    expect(isRegisteredMarkBlocklistEntry({ terminal: 'kitty', tier: 0 as 1 | 2, reproSteps: 'x' })).toBe(false)
    expect(
      isRegisteredMarkBlocklistEntry({ terminal: 'kitty', tier: 3 as 1 | 2, advanceSignal: { solid: 2, half: 2 } }),
    ).toBe(false)
  })

  test('reproSteps 空串不算定因（advanceSignal 缺省时须非空 reproSteps）', () => {
    expect(isRegisteredMarkBlocklistEntry({ terminal: 'kitty', tier: 1, reproSteps: '' })).toBe(false)
  })
})
