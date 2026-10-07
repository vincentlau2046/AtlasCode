/**
 * sessionlist P1 交互/UI 波（0.1.39）判别单测——纯面层（工单 §0.1.39 预研）。
 *
 * 分层纪律：本文件只测纯面（零 fs / 零 React 渲染）；渲染面走
 * tests/func（Ink render + tmp 配置目录），活链归 e2e tui-diff 走查。
 *
 * 切片锚点（突变须恰好红）：
 *   S1 buildActionRow/SESSION_ROW_HINT → 「S1 fork 状态机移底部操作行」
 */
import { describe, expect, it } from 'bun:test'
import {
  SESSION_ROW_HINT,
  buildActionRow,
  clampWindowToCursor,
  computeColumnLayout,
  computeRenderWindow,
  getSummaryLine,
  slotPrefix,
} from '../../src/tui/screens/SessionTreeScreen.js'
import type { LogOption } from '../../src/tui/types/logs.js'

function makeLog(over: Partial<LogOption> = {}): LogOption {
  return {
    sessionId: 's1',
    firstPrompt: 'base prompt',
    ...over,
  } as unknown as LogOption
}

describe('S1 fork 状态机移底部操作行（buildActionRow 纯面）', () => {
  it('confirm 态：行内不再有状态机，操作行出「再按 f 确认」+ 3s 自动取消（yellow）', () => {
    const r = buildActionRow({ kind: 'confirm' }, 'my session')
    expect(r.text).toContain('my session')
    expect(r.text).toContain('[再按 f 确认 fork')
    expect(r.text).toContain('3s 自动取消')
    expect(r.color).toBe('yellow')
  })

  it('forking 态：操作行出 forking 行（yellow）', () => {
    const r = buildActionRow({ kind: 'forking' }, 'my session')
    expect(r.text).toContain('forking my session')
    expect(r.color).toBe('yellow')
  })

  it('done 态：操作行出成功行（green）', () => {
    const r = buildActionRow({ kind: 'done' }, 'my session')
    expect(r.text).toContain('已创建分支 my session')
    expect(r.color).toBe('green')
  })

  it('error 态：失败信息收敛操作行（red，message 带出）', () => {
    const r = buildActionRow(
      { kind: 'error', message: 'disk full' },
      'my session',
    )
    expect(r.text).toContain('fork 失败')
    expect(r.text).toContain('disk full')
    expect(r.color).toBe('red')
  })

  it('idle 态：回落提示行（单行固定，缺省色 = 无 color 字段）', () => {
    const r = buildActionRow({ kind: 'idle' }, 'my session')
    expect(r.text).toBe(SESSION_ROW_HINT)
    expect(r.color).toBeUndefined()
    // 操作行单行判据：提示行不含换行、含 fork/返回键提示
    expect(r.text).not.toContain('\n')
    expect(SESSION_ROW_HINT).toContain('f fork')
    expect(SESSION_ROW_HINT).toContain('q 返回')
  })
})

/**
 * S2 列宽自适应（computeColumnLayout 纯面）。
 * 预算模型：budget = termCols - 4(paddingX) - 4(光标+图标) - 12(活跃列含 gap)；
 * 可选列槽位 = 列宽+前导 gap：创建 12 / 分支 13 / 消息 6；名称列下限 16。
 * 砍列序 = 信息密度从低到高：消息 → 分支 → 创建。
 */
describe('S2 列宽自适应（computeColumnLayout 纯面）', () => {
  it('宽终端（200 列）：全列 + 名称列吃到剩余（149）', () => {
    const l = computeColumnLayout(200)
    expect(l).toEqual({ nameW: 149, showCreated: true, showBranch: true, showMsg: true })
  })

  it('100 列：全列，名称 49', () => {
    expect(computeColumnLayout(100)).toEqual({
      nameW: 49,
      showCreated: true,
      showBranch: true,
      showMsg: true,
    })
  })

  it('80 列：全列（0.1.38 NARROW 边界 <80 行为兼容），名称 29', () => {
    expect(computeColumnLayout(80)).toEqual({
      nameW: 29,
      showCreated: true,
      showBranch: true,
      showMsg: true,
    })
  })

  it('64 列：砍消息列（最低密度），创建/分支保留，名称 19', () => {
    expect(computeColumnLayout(64)).toEqual({
      nameW: 19,
      showCreated: true,
      showBranch: true,
      showMsg: false,
    })
  })

  it('56 列：砍消息+分支，仅创建保留，名称 24', () => {
    expect(computeColumnLayout(56)).toEqual({
      nameW: 24,
      showCreated: true,
      showBranch: false,
      showMsg: false,
    })
  })

  it('48 列：砍消息+分支，创建贴名称下限（16）', () => {
    expect(computeColumnLayout(48)).toEqual({
      nameW: 16,
      showCreated: true,
      showBranch: false,
      showMsg: false,
    })
  })

  it('极窄（44 列）：全砍可选列，名称吃全预算（24 ≥ 下限 16）', () => {
    expect(computeColumnLayout(44)).toEqual({
      nameW: 24,
      showCreated: false,
      showBranch: false,
      showMsg: false,
    })
  })
})

/**
 * S3 summary 二级行（变高行模型纯面）。
 * 不变量：渲染段物理行数 = 窗口 slot 总数 ≤ 视口行数；展开行 = 2 slot。
 * 判别锚点：窗口/钳位/前缀和任一 slot 计算突变 → 恰好红。
 */
describe('S3 summary 二级行（变高行模型纯面）', () => {
  describe('getSummaryLine', () => {
    it('压缩摘要优先（log.summary 非空时直接用）', () => {
      expect(getSummaryLine(makeLog({ summary: 'compact summary' }))).toBe('compact summary')
    })
    it('无摘要 → 首个用户输入回落（去展示 tag，与标题链同源）', () => {
      expect(getSummaryLine(makeLog({ firstPrompt: 'fix the bug' }))).toBe('fix the bug')
      expect(
        getSummaryLine(
          makeLog({ firstPrompt: '<ide_opened_file>main.ts</ide_opened_file> do it' }),
        ),
      ).toBe('do it')
    })
    it('摘要与 firstPrompt 皆无 → 占位（恒非空，展开行恒 2 slot）', () => {
      expect(getSummaryLine(makeLog({ firstPrompt: '' }))).toBe('（无摘要）')
    })
  })

  describe('slotPrefix / rowSlotCost', () => {
    it('无展开：前缀和 = 行号', () => {
      expect(slotPrefix(5, null, 10)).toBe(5)
    })
    it('展开行在 idx 前：前缀和 +1；展开行 = idx 或在其后：不加', () => {
      expect(slotPrefix(5, 2, 10)).toBe(6)
      expect(slotPrefix(5, 5, 10)).toBe(5)
      expect(slotPrefix(5, 7, 10)).toBe(5)
    })
  })

  describe('computeRenderWindow', () => {
    it('无展开：窗口 = 预算内连续行', () => {
      expect(computeRenderWindow(10, 0, null, 5)).toEqual({ start: 0, end: 5 })
    })
    it('展开在窗口内：少渲 1 行（物理行数仍 = 预算 5）', () => {
      // 行成本 1,1,2,1,1 → 5 slot 装到行 3（行 4 装不下）
      expect(computeRenderWindow(10, 0, 2, 5)).toEqual({ start: 0, end: 4 })
    })
    it('展开在窗口外：窗口不变', () => {
      expect(computeRenderWindow(10, 0, 7, 5)).toEqual({ start: 0, end: 5 })
    })
    it('预算边缘：剩余 1 slot，下一行是展开行（2 slot）→ 不渲（不截行防跨视口）', () => {
      expect(computeRenderWindow(2, 1, 1, 1)).toEqual({ start: 1, end: 1 })
    })
    it('offset 超界（列表刷新行变少）→ 钳到最后一行', () => {
      expect(computeRenderWindow(3, 10, null, 5)).toEqual({ start: 2, end: 3 })
    })
    it('空列表 → 空窗口', () => {
      expect(computeRenderWindow(0, 0, null, 5)).toEqual({ start: 0, end: 0 })
    })
  })

  describe('clampWindowToCursor', () => {
    it('光标在窗口前 → 窗口起点跳到光标', () => {
      expect(clampWindowToCursor(0, 3, null, 5, 10)).toBe(0)
    })
    it('光标（含二级行成本）在窗口内 → offset 不变', () => {
      // 预算 10：窗口从 0 装 9 行（展开行 2 占 2 slot），slot 端点 10 ≥ 光标端点 4
      expect(clampWindowToCursor(2, 0, 2, 10, 10)).toBe(0)
    })
    it('光标超出窗口尾（无展开）→ 前推窗口至光标落窗', () => {
      // 预算 3：off=0 窗口 [0,3) 不含行 4；off=2 窗口 [2,5) 含行 4 → 2
      expect(clampWindowToCursor(4, 0, null, 3, 10)).toBe(2)
    })
    it('光标超出窗口尾（带展开行成本）→ 按 slot 前推', () => {
      // 行 0 展开（成本 2）：off=0 窗口 slot 端点 3 < 光标 2 的 slot 端点 4
      // → off=1 窗口 [1,4) slot 端点 5 ≥ 4 → 1
      expect(clampWindowToCursor(2, 0, 0, 3, 10)).toBe(1)
    })
    it('极端退化（预算 1 装不下展开光标行）→ 有界收敛不越界', () => {
      expect(clampWindowToCursor(1, 0, 1, 1, 2)).toBe(1)
    })
  })

  it('操作行提示补 x 摘要（S1 提示行扩展，断言不回归既有键提示）', () => {
    expect(SESSION_ROW_HINT).toContain('x 摘要')
    expect(SESSION_ROW_HINT).toContain('f fork')
    expect(SESSION_ROW_HINT).toContain('q 返回')
    expect(SESSION_ROW_HINT).not.toContain('\n')
  })
})
