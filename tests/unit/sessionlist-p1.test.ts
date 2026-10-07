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
