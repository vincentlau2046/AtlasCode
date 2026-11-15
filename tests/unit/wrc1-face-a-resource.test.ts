/**
 * W-RC1（0.1.112）切片 2：面 A 换源判别格（lock-face 呈批④批准 + 回归格三件）。
 *
 * 面 A 两锚（SpinnerAnimationRow ↓N / Spinner leaderTokenCount）值源从
 * Σtext_chars/4 换 engine usage 终值链（bootstrapState.getTurnOutputTokens）。
 * 源级守卫形（W-AB4 assembly 同款——编译态 .tsx 最小插入，行为面由 e2e 采证）：
 * ① 换源落位（两锚 import/调用在位、/4 估算锚清零）
 * ② 双源分离（stalled 检测仍走 responseLengthRef chars 源）
 * ③ 增量动画参数原样保留（gap<70→3 族）
 * ④ teammateTokens 分账零触碰（合计式 leaderTokens + teammateTokens 不动）
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const srcRoot = join(import.meta.dir, '..', '..', 'src')
const readSrc = (p: string) => readFileSync(join(srcRoot, p), 'utf8')

describe('W-RC1 切片 2 面 A 换源（源级守卫）', () => {
  const animRow = readSrc('tui/components/Spinner/SpinnerAnimationRow.tsx')
  const spinner = readSrc('tui/components/Spinner.tsx')

  test('①a SpinnerAnimationRow 主锚：wire 源在位 + /4 估算锚清零', () => {
    expect(animRow).toContain("import { getTurnOutputTokens } from '../../bootstrapState.js'")
    expect(animRow).toContain('const wireTurnTokens = getTurnOutputTokens()')
    expect(animRow).toContain('const leaderTokens = tokenCounterRef.current')
    // Σchars/4 估算锚清零（链图环 2 面 A 失真源）
    expect(animRow).not.toContain('/ 4')
    expect(animRow).not.toContain('displayedResponseLength')
  })

  test('①b Spinner 次锚：leaderTokenCount 换 wire 源', () => {
    expect(spinner).toContain('const leaderTokenCount = getTurnOutputTokens()')
    expect(spinner).not.toContain('Math.round(responseLengthRef.current / 4)')
  })

  test('② 双源分离：stalled 检测仍走 chars 源（回归格①）', () => {
    expect(animRow).toContain('const currentResponseLength = responseLengthRef.current')
    expect(animRow).toContain('useStalledAnimation(time, currentResponseLength')
  })

  test('③ 增量动画参数原样保留（chars 时代调参不重调）', () => {
    expect(animRow).toContain('if (gap < 70)')
    expect(animRow).toContain('increment = Math.max(8, Math.ceil(gap * 0.15))')
    expect(animRow).toContain('increment = 50')
  })

  test('④ teammateTokens 分账零触碰（回归格②）', () => {
    expect(animRow).toContain('leaderTokens + teammateTokens')
  })
})
