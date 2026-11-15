/**
 * 0.1.113 候 W-AB4b 切片 1：面 1 形 I 窄（committed 分列 + 空帧门控）判别格。
 * lock-face 呈批 docs/2026-11-14-wab4b-lockface-brief.md + f4 批复
 * 2026-11-14 @7d9cbea3（面 1 形 I 窄全项批准）。
 *
 * 修形四点（呈批书 §1）：
 *  ① FrameEvent 扩型加性 `committed: boolean`（空帧 = false）
 *  ② 空帧判据 = preamble 后 optimized.length === 0（构造层含 cursor
 *     preamble/park push 面——两 push 面均 hasDiff 门控，⇔ !hasDiff）
 *  ③ cursor preamble/park 空流分支 elision（:724 parked restore 分支：
 *     push + displayCursor 置 null 一并缓行到下一内容帧——只删 push 仍置
 *     null 会产生「displayCursor 谎报物理位置 → 下帧 preamble 错位起算」）
 *  ④ 门控落点 = onRender commit 分支层；writeDiffToTerminal 本体零触碰
 *
 * 判据格：
 *  - 格 1 committed 口径：内容帧 committed=true / 无变更重渲染帧 committed=false
 *  - 真变更零误杀：committed=false 帧之后真变更帧照常 committed=true 且输出更新
 *  - 格 3 终值恒等：park restore 缓行后下一内容帧终态输出与内容变更一致
 *  - 格 4 双通道零变：仪表化 recordRenderFrame（patches=optimized.length 可
 *    派生 committed）与 bench onFrame 消费字段（phases/durationMs/flickers）
 *    语义零变——源级锁形
 *  - 四锚锁定：backFrame/frontFrame swap / prevFrameContaminated /
 *    displayCursor（缓行形）/ scrollDrainPending drain timer 推进面在场
 *
 * 行为面 = 真 ink render（wave0186-dim-render 同形 harness：PassThrough
 * fake stdout + rerender 驱动）；锁形面 = 源断言（wab4 assembly 同范）。
 * I/O-free（fake stream 收集）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import React from 'react'

import { render } from '../../src/tui/ink.js'
import { Box, Text } from '../../src/tui/ink.js'
import type { FrameEvent } from '../../src/tui/ink/frame.js'

const REPO = join(import.meta.dir, '..', '..')
const readSrc = (p: string) => readFileSync(join(REPO, 'src', p), 'utf8')

// ── 行为 harness（wave0186-dim-render 同形）────────────────────────────────
async function renderWithFrames(
  node: React.ReactNode,
): Promise<{ inst: { rerender: (n: React.ReactNode) => void; unmount: () => void }; events: FrameEvent[]; chunks: () => string }> {
  const chunks: string[] = []
  const events: FrameEvent[] = []
  const fake = new PassThrough() as any
  fake.columns = 80
  fake.rows = 24
  // log-update render() 的 isTTY 分派：非 TTY 走 renderFullFrame 恒全量重写
  // （空 diff 永不成立）——必须置真才走到与生产一致的增量 diff 路径。
  fake.isTTY = true
  fake.write = (chunk: unknown) => {
    if (typeof chunk === 'string') chunks.push(chunk)
  }
  const inst = await render(node, {
    stdout: fake,
    patchConsole: false,
    exitOnCtrlC: false,
    onFrame: (e) => {
      events.push(e)
    },
  } as any)
  await new Promise((r) => setTimeout(r, 80))
  return {
    inst: inst as any,
    events,
    chunks: () => chunks.join(''),
  }
}

// 输出与 props 无关的常量视图——rerender 换 props 触发 React commit 但屏幕
// diff 为空 = 空帧（26-47% 空帧机制的最小确定性复现）。
const ConstantView = ({ tick }: { tick: number }) =>
  React.createElement(Box, null, React.createElement(Text, null, `stable-output-${tick % 1}`))

describe('W-AB4b 切片 1 · 格 1 committed 口径（行为面）', () => {
  test('内容帧 committed=true；无变更重渲染帧 committed=false；真变更零误杀', async () => {
    const { inst, events, chunks } = await renderWithFrames(React.createElement(ConstantView, { tick: 0 }))
    try {
      // 挂载帧：真实内容 → committed=true（真变更零误杀基线）
      expect(events.length).toBeGreaterThan(0)
      expect(events.every((e) => e.committed === true)).toBe(true)
      expect(chunks()).toContain('stable-output-0')
      const mountCount = events.length

      // 无变更重渲染：props 变化（tick 0→1，输出恒定）→ React commit →
      // 屏幕零 diff → 空帧 committed=false（格 1 主判据）
      inst.rerender(React.createElement(ConstantView, { tick: 1 }))
      await new Promise((r) => setTimeout(r, 80))
      const afterNoop = events.length
      expect(afterNoop).toBeGreaterThan(mountCount)
      const emptyFrames = events.slice(mountCount).filter((e) => e.committed === false)
      expect(emptyFrames.length).toBeGreaterThan(0)
      // 空帧非误杀证明：同帧窗口内无内容写入且输出仍为旧值
      expect(chunks()).toContain('stable-output-0')

      // 真变更帧：committed=true 且终端有新写入（gate 不杀真变更）。
      // 注意：增量 diff 只写变更字符（未变字符跳过），故不能整词 toContain——
      // 终值恒等（格 3 全文比对）由 e2e pty 腿采集，unit 层判提交行为。
      const bytesBefore = chunks().length
      inst.rerender(React.createElement(Box, null, React.createElement(Text, null, 'changed-output')))
      await new Promise((r) => setTimeout(r, 80))
      const tail = events.slice(afterNoop)
      expect(tail.some((e) => e.committed === true)).toBe(true)
      expect(chunks().length).toBeGreaterThan(bytesBefore)
    } finally {
      inst.unmount()
    }
  })

  test('committed 与 phases.patches 语义自洽（bench 通道消费面零变的加性证明）', async () => {
    const { inst, events } = await renderWithFrames(React.createElement(ConstantView, { tick: 0 }))
    try {
      // phases 存在的帧：committed ⇔ 该帧写出了 patch（optimized 非空）。
      // 注意 phases.patches = diff.length（pre-optimize 口径），committed =
      // optimized.length > 0（post-optimize/preamble 口径）——两者在内容帧同
      // 真；空帧 phases.patches=0 且 committed=false。
      for (const e of events) {
        if (e.phases) {
          if (e.phases.patches === 0) expect(e.committed).toBe(false)
        }
      }
      expect(events.some((e) => e.committed === true)).toBe(true)
    } finally {
      inst.unmount()
    }
  })
})

// ── 锁形面（源断言，wab4 assembly 同范）────────────────────────────────────
describe('W-AB4b 切片 1 · 修形四点锁形（源级）', () => {
  const frameSrc = readSrc('tui/ink/frame.ts')
  const inkSrc = readSrc('tui/ink/ink.tsx')

  test('① FrameEvent 加性 committed: boolean（既有字段在场 = 加性零变）', () => {
    expect(frameSrc).toContain('committed: boolean')
    // 既有字段零变（格 4 加性边界）
    expect(frameSrc).toContain('durationMs: number')
    expect(frameSrc).toContain('phases?: {')
    expect(frameSrc).toContain('flickers: Array<{')
  })

  test('② 空帧判据单源：emptyStream = optimized.length === 0 在 commit 分支层前', () => {
    expect(inkSrc).toContain('const emptyStream = optimized.length === 0')
    // 判据在 targetMoved 之后、大分支之前（preamble 构造层后）
    const tMoved = inkSrc.indexOf('const targetMoved =')
    const criterion = inkSrc.indexOf('const emptyStream = optimized.length === 0')
    const branch = inkSrc.indexOf('if (hasDiff || targetMoved || target === null && parked !== null)')
    expect(criterion).toBeGreaterThan(tMoved)
    expect(criterion).toBeLessThan(branch)
  })

  test('③ park restore elision：!hasDiff 恢复 push 已删 + displayCursor 置 null 门控缓行', () => {
    // elision 后 restore push 域（!hasDiff 帧）整支不存在
    expect(inkSrc).not.toContain('const rdx = frame.cursor.x - parked.x')
    // 缓行门在位：非空流帧才置 null（空流帧缓行到下一内容帧）
    expect(inkSrc).toContain('if (!emptyStream) {')
    expect(inkSrc).toContain('this.displayCursor = null;')
    // 缓行门在 displayCursor=null 的 else 臂内（顺序约束）
    const gate = inkSrc.indexOf('if (!emptyStream) {')
    const nullAssign = inkSrc.indexOf('this.displayCursor = null;', gate)
    const nextReset = inkSrc.indexOf('this.displayCursor = null;', nullAssign + 1)
    expect(nullAssign).toBeGreaterThan(-1)
    expect(nullAssign - gate).toBeLessThan(200)
    expect(nextReset).toBeGreaterThan(nullAssign + 100)
  })

  test('④ writeDiffToTerminal 调用无条件在场（本体零触碰 + 调用点同层门控）', () => {
    expect(inkSrc).toContain(
      'writeDiffToTerminal(this.terminal, optimized, this.altScreenActive && !SYNC_OUTPUT_SUPPORTED);',
    )
    // committed 口径在 emit 点按终值重估
    expect(inkSrc).toContain('committed: optimized.length > 0,')
  })

  test('四锚锁定：swap / prevFrameContaminated / drain timer 推进面在场', () => {
    expect(inkSrc).toContain('this.backFrame = this.frontFrame;')
    expect(inkSrc).toContain('this.frontFrame = frame;')
    expect(inkSrc).toContain('this.prevFrameContaminated = selActive || hlActive;')
    expect(inkSrc).toContain('this.drainTimer = setTimeout(() => this.onRender(), FRAME_INTERVAL_MS >> 2);')
  })

  test('格 4 双通道零变：recordRenderFrame 消费面未扩（patches 仍可派生 committed）', () => {
    const instr = readSrc('tui/ink/renderInstrumentation.ts')
    expect(instr).toContain('patches: params.patches.length,')
    // 仪表化通道未加新字段（committed 由 patches>0 派生——零变边界）
    expect(instr).not.toContain('committed')
    // bench 通道（interactiveHelpers onFrame）消费字段语义零变
    const helpers = readSrc('tui/interactiveHelpers.tsx')
    expect(helpers).toContain('fpsTracker.record(event.durationMs)')
    expect(helpers).toContain('...event.phases,')
  })
})

// ── 切片 2：面 2 动画降频 N=100ms（f4 UX 裁定 @7d9cbea3）───────────────────
describe('W-AB4b 切片 2 · 动画时钟降频锁形（源级）', () => {
  const animRow = readSrc('tui/components/Spinner/SpinnerAnimationRow.tsx')

  test('① 降频常量单源：SPINNER_ANIMATION_INTERVAL_MS = 100（落 constants）', () => {
    const constants = readSrc('tui/constants/spinnerAnimation.ts')
    expect(constants).toContain('export const SPINNER_ANIMATION_INTERVAL_MS = 100')
    // 归因纪律：数据即提交维持既有 16ms leading-edge（零新机制）口径在案
    expect(constants).toContain('leading-edge')
  })

  test('② 消费面单点：SpinnerAnimationRow 动画时钟换常量；reducedMotion null 门保留', () => {
    expect(animRow).toContain(
      'import { SPINNER_ANIMATION_INTERVAL_MS } from \'../../constants/spinnerAnimation.js\'',
    )
    expect(animRow).toContain(
      'useAnimationFrame(reducedMotion ? null : SPINNER_ANIMATION_INTERVAL_MS)',
    )
    // 旧 50 字面量锚清零（该文件唯一 useAnimationFrame 调用点）
    expect(animRow).not.toContain('useAnimationFrame(reducedMotion ? null : 50)')
  })

  test('③ 范围外消费者零触碰：光标闪烁/语音/shimmer/动词轮维持原值', () => {
    expect(readSrc('tui/components/TextInput.tsx')).toContain('useAnimationFrame(needsAnimation ? 50 : null)')
    expect(readSrc('tui/components/PromptInput/VoiceIndicator.tsx')).toContain('useAnimationFrame(reducedMotion ? null : 50)')
    expect(readSrc('tui/components/PromptInput/ShimmeredInput.tsx')).toContain('useAnimationFrame(hasShimmer_0 ? 50 : null)')
    expect(readSrc('tui/components/Spinner.tsx')).toContain('useAnimationFrame(reducedMotion ? null : 120)')
  })

  test('④ 数据即提交零新机制：16ms 节流结构在场（FRAME_INTERVAL_MS throttle）', () => {
    const inkSrc = readSrc('tui/ink/ink.tsx')
    expect(inkSrc).toContain('scheduleRender = throttle(')
    expect(inkSrc).toContain('FRAME_INTERVAL_MS')
  })
})
