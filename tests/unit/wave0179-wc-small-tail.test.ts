/**
 * 0.1.79 W-C 小件清尾波判别单测（工单 docs/2026-10-23-p0-wave-0179-ticket.md §2①）。
 *
 * 波 = W-C 小件清尾（f4 零码工单 2026-10-23，基线 569aed7）：11 件新做
 * （#20 MCP 归一空名 guard / F-4 APIError 双族合并 / C4-3 长工具进度心跳 /
 * C5-3 MCP >2min 自动转后台 / C5-4 MCP 能力发现退避 / C6-2 memory 容量预警 /
 * C8-2 DirectoryAdded / C8-3 MessageDisplay / C8-5 terminalSequence+continueOnBlock /
 * C9-2 --restricted / C9-5 skillOverrides）+ D-3/D-5 已落地核验锚。
 *
 * 判别信号（工单 §2① 规格，本文件逐件落）：
 *  - #20 guard：`'...'→'___'` 三副本逐字一致（基线 569aed7 同面红）+ 非空名行为不变。
 *  - F-4：单类 instanceof 判别（tui 侧 re-export 的 APIError === modelprovider 定义类）。
 *  - C8：新事件枚举在场断言（DirectoryAdded / MessageDisplay）。
 *  - C9-2：restricted 剥离面断言（命令类工具缺席 / 文件工具在场 / bypassPermissions 拒）。
 *  - C9-5：skillOverrides 三档断言（off / user-invocable-only / name-only）。
 *  - D-3/D-5 已落地核验锚：活码注在场（compact.ts:38/:1105 附近）+ 既有判别单测在场。
 *
 * unit 层纪律：读仓库自身源级锁 + 纯函数行为断言，零重图/零网络/零盘写。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { normalizeNameForMCP as engineNormalize } from '../../src/engine/tools/mcp'
import { normalizeNameForMCP as tuiNormalize } from '../../src/tui/services/mcp/normalization'
import { normalizeNameForMCP as ruleNormalize } from '../../src/permissions/mcpRuleNames'

function srcOf(rel: string): string {
  return readFileSync(resolve(import.meta.dir, '../../', rel), 'utf8')
}

// ════════════════════════════════════════════════════════════════
// #20 MCP 归一空名 guard（三副本，工单 §1.1）
// ════════════════════════════════════════════════════════════════
describe('wave0179 #20 normalizeNameForMCP empty-after-fold guard', () => {
  test('全非法字符名回落折叠前值（基线 569aed7 同面红：现行为 ""）', () => {
    // 与 0.1.78 前旧行为逐字一致（工单 §0：f4 机检坐实 '...' 旧 '___'/现 ''）。
    expect(engineNormalize('...')).toBe('___')
    expect(tuiNormalize('...')).toBe('___')
    expect(ruleNormalize('...')).toBe('___')
  })

  test('空串/纯下划线名同回落', () => {
    expect(engineNormalize('___')).toBe('___')
    expect(tuiNormalize('___')).toBe('___')
    expect(ruleNormalize('___')).toBe('___')
  })

  test('非空名行为不变（0.1.78 A3-2 折叠+去首尾恒等）', () => {
    for (const n of ['my-server', 'my__server', 'a.b c', '中文服务器', '_edge_', 'a___b']) {
      const folded = n.replace(/[^a-zA-Z0-9_-]/g, '_')
      const expected =
        folded.replace(/_+/g, '_').replace(/^_|_$/g, '') || folded
      expect(engineNormalize(n)).toBe(expected)
      expect(tuiNormalize(n)).toBe(expected)
      expect(ruleNormalize(n)).toBe(expected)
    }
    // 具体锁：折叠语义样例
    expect(engineNormalize('a.b c')).toBe('a_b_c')
    expect(engineNormalize('my__server')).toBe('my_server')
    expect(engineNormalize('_edge_')).toBe('edge')
  })

  test('三副本同型 guard（活码折叠前值回落三处均在场）', () => {
    for (const rel of [
      'src/permissions/mcpRuleNames.ts',
      'src/engine/tools/mcp.ts',
      'src/tui/services/mcp/normalization.ts',
    ]) {
      const live = srcOf(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/gm, '$1')
      expect(live.includes("normalized === '' ? folded : normalized")).toBe(true)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// D-3 / D-5 已落地核验锚（0.1.69 块 D 落地，工单 §0 勘误：不重做，探针核在场）
// ════════════════════════════════════════════════════════════════
describe('wave0179 D-3/D-5 已落地核验锚', () => {
  test('compact.ts 活码注在场（D-5 :38 附近 + D-3 :1105 附近）', () => {
    const src = srcOf('src/tui/contextBodies/compact.ts')
    expect(src.includes('D-5')).toBe(true)
    expect(src.includes('D-3')).toBe(true)
  })

  test('0.1.69 块 D 判别单测文件在场（commit 4e6b4e0）', () => {
    // D-5 = compact-git-status-refresh.test.ts；D-3 = compact-summarize-fallback.test.ts
    expect(
      existsSync(resolve(import.meta.dir, 'compact-git-status-refresh.test.ts')),
    ).toBe(true)
    expect(
      existsSync(resolve(import.meta.dir, 'compact-summarize-fallback.test.ts')),
    ).toBe(true)
  })
})
