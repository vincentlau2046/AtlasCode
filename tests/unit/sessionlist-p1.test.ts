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
  computeColumnLayout,
} from '../../src/tui/screens/SessionTreeScreen.js'

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
