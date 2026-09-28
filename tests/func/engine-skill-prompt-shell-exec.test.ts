/**
 * S-E3 修波（审视 A 路 major-3）：promptShellExecution echo 面回填
 * func 探针（真 spawn，零模型）。
 *
 * 旧仓主路径形（旧 utils/promptShellExecution.ts:120-128
 * processToolResultBlock → tool.mapToolResultToToolResultBlockParam，
 * 恒产 [exit code: N] 行）：初版 formatBashOutput 直取全程丢
 * exit code / interrupted 行 + 旧主路径 baseline 错归「formatBashOutput
 * 逐字值」——S-E3 修波经 BashTool.mapToolResultToToolResultBlockParam
 * 回填（持久化子面残留守不变）。
 *
 * 分层纪律：func 层真 spawn（echo 安全命令，同 engine-tools-bash-sb5
 * func 先例）+ 零模型；深度 import src/engine/skill 子门面（测试侧
 * 子门面先例）。
 */
import { describe, expect, test } from 'bun:test'
import { executeShellCommandsInPrompt } from '../../src/engine/skill'

describe('S-E3 修波 promptShellExecution echo 面（mapResult 回填，A 路 major-3）', () => {
  test('内联 !`echo` 回显行 = mapResult 形（[exit code: 0] + stdout）', async () => {
    const out = await executeShellCommandsInPrompt(
      'run: !`echo hi` end',
      {},
      '/probe',
    )
    // mapResult 主路径：[exit code: N] 行恒在场 + stdout（旧仓
    // BashTool.ts:127-132 形；初版朴素面此处恰红 = 修波探针锚点）
    expect(out).toContain('[exit code: 0]')
    expect(out).toContain('hi')
    // 替换位 = 原 match 跨面（函数替换器形，逐字旧仓语义）
    expect(out.startsWith('run: [exit code: 0]')).toBe(true)
    expect(out.endsWith(' end')).toBe(true)
  })

  test('代码块 ```! 语法同面（BLOCK_PATTERN 支 + mapResult 同形）', async () => {
    const out = await executeShellCommandsInPrompt(
      'before\n```!\necho block\n```\nafter',
      {},
      '/probe',
    )
    expect(out).toContain('[exit code: 0]')
    expect(out).toContain('block')
    expect(out).toContain('before')
    expect(out).toContain('after')
  })
})
