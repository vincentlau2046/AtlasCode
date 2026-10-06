/**
 * 0.1.35 Brand 封口波 · 母题铺开（spec §0.1 静态字符触面）gate ② 源级在场判别单测。
 *
 * 被测：各静态母题触面组件已接 beamTheme 单一事实源（gate ②「母题字符面在场」判据的
 * 源级镜像，与 gate ① spinner 接线同分层纪律：源级在场断言 + 纯函数面在场）。
 * 触面：进度条光束填充 / 分隔线光束串 / 空态底纹 / 光核微符号（tips 前缀）/ 边框角标（常量在场）。
 * 分层纪律：源级在场（readFileSync 读源码 grep）+ beamTheme 纯函数面（无网络 / 无真实终端）。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BEAM_CORNER,
  LIGHT_CORE,
  getProgressBarBlocks,
} from '../../src/tui/components/design-system/beamTheme.js'

function readSrc(rel: string): string {
  return readFileSync(join(import.meta.dir, '../../src', rel), 'utf8')
}

describe('母题静态字符触面 · 源级在场（gate ② 判据镜像）', () => {
  test('进度条 = 档位感知光束填充阶（beamTheme 单一事实源，旧固定 9 阶零残留）', () => {
    const src = readSrc('tui/components/design-system/ProgressBar.tsx')
    expect(src).toContain('const MARK_TIER = resolveMarkTierFromEnv()')
    expect(src).toContain('getProgressBarBlocks(MARK_TIER)')
    // 改前固定 9 阶 BLOCKS 字面量（含空段 = 空格）零残留
    expect(src).not.toContain("' ', '▏'")
    expect(src).not.toContain("[' ', ")
  })

  test('分隔线 = 光束串（beamTheme.dividerLine，显式 char → legacy 重复；char.repeat 零残留）', () => {
    const src = readSrc('tui/components/design-system/Divider.tsx')
    expect(src).toContain("import { dividerLine } from './beamTheme.js'")
    expect(src).toContain('dividerLine(leftWidth, char)')
    expect(src).toContain('dividerLine(rightWidth, char)')
    expect(src).toContain('dividerLine(effectiveWidth, char)')
    // 改前默认 `─` 单字重复构造零残留
    expect(src).not.toContain('char.repeat')
    expect(src).not.toContain('=== undefined ? "\\u2500"')
  })

  test('空态底纹 = 光锥 ░ 底纹（Feed 空态走 beamTextureLine 单一事实源）', () => {
    const src = readSrc('tui/components/LogoV2/Feed.tsx')
    expect(src).toContain("import { beamTextureLine } from '../design-system/beamTheme.js'")
    expect(src).toContain('beamTextureLine(actualWidth)')
  })

  test('光核微符号 = tips 前缀走 LIGHT_CORE 单一事实源（非硬编码 ▀ 字面量）', () => {
    const src = readSrc('tui/components/StatusLine/useDynamicTips.ts')
    expect(src).toContain("import { LIGHT_CORE } from '../design-system/beamTheme.js'")
    expect(src).toContain('TIP_PREFIX = LIGHT_CORE')
    // 改前硬编码光核字面量零残留（TIP_PREFIX 定义处）
    expect(src).not.toContain("TIP_PREFIX = '▀'")
  })
})

describe('母题静态字符 · beamTheme 纯函数面在场（边框角标 + 档位回落）', () => {
  test('BEAM_CORNER = ╱（U+2571 边框角标，Border 触面单一事实源）', () => {
    expect(BEAM_CORNER).toBe('╱')
    expect(BEAM_CORNER.codePointAt(0)).toBe(0x2571)
  })

  test('LIGHT_CORE = ▀（光核微符号，全 UI 单一事实源）', () => {
    expect(LIGHT_CORE).toBe('▀')
    expect(LIGHT_CORE.codePointAt(0)).toBe(0x2580)
  })

  test('进度条填充阶档位回落：T0 9 阶 / T1·T2 降实心 [░, █]（半块类错位兜底）', () => {
    expect(getProgressBarBlocks(0)).toHaveLength(9)
    expect(getProgressBarBlocks(1)).toEqual(['░', '█'])
    expect(getProgressBarBlocks(2)).toEqual(['░', '█'])
  })
})
