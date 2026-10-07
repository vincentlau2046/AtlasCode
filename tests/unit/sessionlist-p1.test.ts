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
  agentColorToThemeColor,
  agentRowColors,
  buildActionRow,
  clampWindowToCursor,
  computeColumnLayout,
  computeRenderWindow,
  filterLogs,
  getSummaryLine,
  makeLru,
  nextSortKey,
  SESSION_SORT_KEYS,
  sortLogsBy,
  slotPrefix,
} from '../../src/tui/screens/SessionTreeScreen.js'
import type { LogOption } from '../../src/tui/types/logs.js'
import type { Theme } from '../../src/tui/utils/theme.js'

/** 伪 theme：8 个代理色板槽位填可判别标记值（精确映射断言不依赖真实 ANSI 值） */
const FAKE_THEME = {
  red_FOR_SUBAGENTS_ONLY: 'RED',
  blue_FOR_SUBAGENTS_ONLY: 'BLUE',
  green_FOR_SUBAGENTS_ONLY: 'GREEN',
  yellow_FOR_SUBAGENTS_ONLY: 'YELLOW',
  purple_FOR_SUBAGENTS_ONLY: 'PURPLE',
  orange_FOR_SUBAGENTS_ONLY: 'ORANGE',
  pink_FOR_SUBAGENTS_ONLY: 'PINK',
  cyan_FOR_SUBAGENTS_ONLY: 'CYAN',
} as unknown as Theme

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
 * gap-B（0.1.39 gate）：行尾 chip 段预算 = round(budget×0.3) 比例预留（随终端宽
 * 缩放：200 列 ≈54 容纳全 chip 行最坏 ≈53 / 100 列 ≈24 名称列不塌缩 / 窄档钳 16），
 * 仅收缩 nameW——砍列阈值不含此槽（showX 布尔零回归）；无预留则 nameW 吃全
 * 预算 → maxFlags≈0 行尾 chip 恒截断。
 */
describe('S2 列宽自适应（computeColumnLayout 纯面）', () => {
  it('宽终端（200 列）：全列 + 名称列扣比例 chip 槽（149−54=95）', () => {
    const l = computeColumnLayout(200)
    expect(l).toEqual({ nameW: 95, showCreated: true, showBranch: true, showMsg: true })
  })

  it('100 列：全列（砍列阈值不变），名称 80−31−24=25（chip 槽不塌缩名称列）', () => {
    expect(computeColumnLayout(100)).toEqual({
      nameW: 25,
      showCreated: true,
      showBranch: true,
      showMsg: true,
    })
  })

  it('80 列：全列（0.1.38 NARROW 边界 <80 行为兼容），名称 60−31−18<16 钳下限', () => {
    expect(computeColumnLayout(80)).toEqual({
      nameW: 16,
      showCreated: true,
      showBranch: true,
      showMsg: true,
    })
  })

  it('64 列：砍消息列（最低密度），创建/分支保留，名称 16', () => {
    expect(computeColumnLayout(64)).toEqual({
      nameW: 16,
      showCreated: true,
      showBranch: true,
      showMsg: false,
    })
  })

  it('56 列：砍消息+分支，仅创建保留，名称 16', () => {
    expect(computeColumnLayout(56)).toEqual({
      nameW: 16,
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

  it('极窄（44 列）：全砍可选列，名称 24−7=17（chip 槽仅 7，下限 16 之上）', () => {
    expect(computeColumnLayout(44)).toEqual({
      nameW: 17,
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

/**
 * S4 agentColor theme 精确 8 色映射 + idle 圆点（纯面）。
 * 判别锚点：映射表/优先级/圆点字形任一突变 → 恰好红。
 */
describe('S4 agentColor theme 精确映射 + idle 圆点（纯面）', () => {
  it('8 色精确映射（purple/pink/orange 不再对撞近似）', () => {
    expect(agentColorToThemeColor('purple', FAKE_THEME)).toBe('PURPLE')
    expect(agentColorToThemeColor('pink', FAKE_THEME)).toBe('PINK')
    expect(agentColorToThemeColor('orange', FAKE_THEME)).toBe('ORANGE')
    expect(agentColorToThemeColor('cyan', FAKE_THEME)).toBe('CYAN')
    expect(agentColorToThemeColor('red', FAKE_THEME)).toBe('RED')
  })
  it('缺失/域外 agentColor → undefined（行回落默认色）', () => {
    expect(agentColorToThemeColor(undefined, FAKE_THEME)).toBeUndefined()
    expect(agentColorToThemeColor('magenta', FAKE_THEME)).toBeUndefined()
  })

  it('idle 代理行：行色 = theme 身份色 + 实心圆点（同色，身份一眼辨）', () => {
    const r = agentRowColors(makeLog({ agentColor: 'purple' }), false, false, false, FAKE_THEME)
    expect(r.rowColor).toBe('PURPLE')
    expect(r.dotGlyph).toBe('● ')
    expect(r.dotColor).toBe('PURPLE')
  })
  it('选中态：行色 magentaBright + 圆点同色（优先于身份）', () => {
    const r = agentRowColors(makeLog({ agentColor: 'red' }), true, false, false, FAKE_THEME)
    expect(r.rowColor).toBe('magentaBright')
    expect(r.dotGlyph).toBe('● ')
    expect(r.dotColor).toBe('magentaBright')
  })
  it('焦点态：行色 cyan 优先于身份（圆点仍染身份色）', () => {
    const r = agentRowColors(makeLog({ agentColor: 'red' }), false, true, false, FAKE_THEME)
    expect(r.rowColor).toBe('cyan')
    expect(r.dotGlyph).toBe('● ')
    expect(r.dotColor).toBe('RED')
  })
  it('非代理行 idle：空心 ○ 无色，行色默认', () => {
    const r = agentRowColors(makeLog({}), false, false, false, FAKE_THEME)
    expect(r.rowColor).toBeUndefined()
    expect(r.dotGlyph).toBe('○ ')
    expect(r.dotColor).toBeUndefined()
  })
  it('当前行（非代理）：实心圆点 + cyan（0.1.38 current 点亮效果保留）', () => {
    const r = agentRowColors(makeLog({}), false, false, true, FAKE_THEME)
    expect(r.dotGlyph).toBe('● ')
    expect(r.dotColor).toBe('cyan')
  })
})

/**
 * S5 搜索/过滤/排序 + LRU（纯面）。
 * 判别锚点：过滤字段集/大小写、排序方向与键、四键循环序、LRU 淘汰序
 * 任一突变 → 恰好红。
 */
describe('S5 搜索/过滤/排序 + LRU（纯面）', () => {
  describe('filterLogs', () => {
    it('空/纯空白 query → 恒等（返回入参数组本身，零拷贝）', () => {
      const logs = [makeLog({ firstPrompt: 'anything' })]
      expect(filterLogs(logs, '')).toBe(logs)
      expect(filterLogs(logs, '   ')).toBe(logs)
    })
    it('大小写不敏感子串：命中摘要/首输入/分支/tag/代理/sessionId', () => {
      const a = makeLog({ firstPrompt: 'Fix LOGIN bug', sessionId: 'aaa' })
      const b = makeLog({ gitBranch: 'feature/x', sessionId: 'bbb' })
      const c = makeLog({ tag: 'v2', sessionId: 'ccc' })
      const d = makeLog({ agentSetting: 'reviewer', sessionId: 'ddd' })
      const e = makeLog({ firstPrompt: 'unrelated', sessionId: 'eee' })
      expect(filterLogs([a, b, c, d, e], 'login').map(l => l.sessionId)).toEqual(['aaa'])
      expect(filterLogs([a, b, c, d, e], 'FEATURE').map(l => l.sessionId)).toEqual(['bbb'])
      expect(filterLogs([a, b, c, d, e], 'v2').map(l => l.sessionId)).toEqual(['ccc'])
      expect(filterLogs([a, b, c, d, e], 'reviewer').map(l => l.sessionId)).toEqual(['ddd'])
      expect(filterLogs([a, b, c, d, e], 'eee').map(l => l.sessionId)).toEqual(['eee'])
    })
    it('全字段无命中 → 空数组', () => {
      const logs = [makeLog({ firstPrompt: 'zzz', sessionId: 'zzz' })]
      expect(filterLogs(logs, 'nomatch')).toEqual([])
    })
  })

  describe('sortLogsBy', () => {
    const t = (s: string) => new Date(s)
    const a = makeLog({ sessionId: 'a', modified: t('2026-10-01'), created: t('2026-10-02'), messageCount: 3, firstPrompt: 'beta' })
    const b = makeLog({ sessionId: 'b', modified: t('2026-10-05'), created: t('2026-10-01'), messageCount: 9, firstPrompt: 'alpha' })
    const c = makeLog({ sessionId: 'c', modified: t('2026-10-03'), created: t('2026-10-04'), messageCount: 0, firstPrompt: 'mid' })

    it('modified：最近活跃降序（b,c,a）', () => {
      expect(sortLogsBy([a, b, c], 'modified').map(l => l.sessionId)).toEqual(['b', 'c', 'a'])
    })
    it('created：创建时间降序（c,a,b）', () => {
      expect(sortLogsBy([a, b, c], 'created').map(l => l.sessionId)).toEqual(['c', 'a', 'b'])
    })
    it('messages：消息数降序（b,a,c；缺失计 0）', () => {
      expect(sortLogsBy([a, b, c], 'messages').map(l => l.sessionId)).toEqual(['b', 'a', 'c'])
    })
    it('title：显示标题升序（alpha,beta,mid）', () => {
      expect(sortLogsBy([a, b, c], 'title').map(l => l.sessionId)).toEqual(['b', 'a', 'c'])
    })
    it('不 mutate 入参（返回新数组，原序不变）', () => {
      const input = [a, b, c]
      const out = sortLogsBy(input, 'modified')
      expect(out).not.toBe(input)
      expect(input.map(l => l.sessionId)).toEqual(['a', 'b', 'c'])
    })
  })

  describe('nextSortKey', () => {
    it('四键循环：modified→created→messages→title→回绕 modified', () => {
      expect(nextSortKey('modified')).toBe('created')
      expect(nextSortKey('created')).toBe('messages')
      expect(nextSortKey('messages')).toBe('title')
      expect(nextSortKey('title')).toBe('modified')
      // 循环长度 = 键表长度（防漏键/重复键）
      let k: string = 'modified'
      for (let i = 0; i < SESSION_SORT_KEYS.length; i++) {
        k = nextSortKey(k as 'modified')
      }
      expect(k).toBe('modified')
    })
  })

  describe('makeLru', () => {
    it('容量满后按插入序淘汰最旧键', () => {
      const lru = makeLru<number>(2)
      lru.set('a', 1)
      lru.set('b', 2)
      lru.set('c', 3) // a 被淘汰
      expect(lru.has('a')).toBe(false)
      expect(lru.get('b')).toBe(2)
      expect(lru.get('c')).toBe(3)
    })
    it('重复 set 同一键刷新新近位（不先被淘汰）', () => {
      const lru = makeLru<number>(2)
      lru.set('a', 1)
      lru.set('b', 2)
      lru.set('a', 10) // a 刷新到最新
      lru.set('c', 3) // 淘汰 b（现最旧）
      expect(lru.has('b')).toBe(false)
      expect(lru.get('a')).toBe(10)
      expect(lru.get('c')).toBe(3)
    })
    it('缺失键 get/has → undefined/false', () => {
      const lru = makeLru<number>(2)
      expect(lru.get('x')).toBeUndefined()
      expect(lru.has('x')).toBe(false)
    })
  })
})
