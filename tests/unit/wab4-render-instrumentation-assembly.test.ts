/**
 * 0.1.110 W-AB4 件 A 渲染仪表化 unit 判别格（f4 lock-face 批复 工单 §7
 * @273cf8ed；工单 docs/2026-11-14-p0-wave-01110-wab4-render-incremental-ticket.md）。
 * 零盘零网络（literal-inventory 范型源断言）：
 *
 *  - 格 1 四点硬约束锁形：env 模块级布尔缓存（process.env 读恰 1 处模块
 *    顶层）/ 关闭支先门后构造（gate 在对象字面量前）/ 帧级单点钩子
 *    （ink.tsx recordRenderFrame 引用恰 1 + diffEach cell 级零触碰）/
 *    env 名 literal-inventory 预注册。
 *  - 批复注记 1（dmg 镜像漂移防面）：diffRegion 单源提取——diffEach 调用
 *    diffRegion（同源逻辑，非镜像复制）+ 仪表化 import 同源。
 *  - 双通道独立：ATLAS_FRAME_TIMING_LOG bench 通道（interactiveHelpers）
 *    零触碰在场。
 *  - unmount seq:-1：第二 writeDiffToTerminal 调用点旁 recordUnmountFrame
 *    门控在场。
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, test } from 'bun:test'

const REPO = join(import.meta.dir, '..', '..')
const instrSrc = readFileSync(
  join(REPO, 'src/tui/ink/renderInstrumentation.ts'),
  'utf8',
)
const inkSrc = readFileSync(join(REPO, 'src/tui/ink/ink.tsx'), 'utf8')
const screenSrc = readFileSync(join(REPO, 'src/tui/ink/screen.ts'), 'utf8')
const helpersSrc = readFileSync(
  join(REPO, 'src/tui/interactiveHelpers.tsx'),
  'utf8',
)
const inventory = JSON.parse(
  readFileSync(join(REPO, 'docs/literal-inventory.json'), 'utf8'),
) as {
  allowlist: Record<string, Record<string, number>>
}

describe('W-AB4 仪表化格 1 四点硬约束（0.1.110 f4 §7 @273cf8ed）', () => {
  test('env 模块级布尔缓存：env 名预注册 + process.env 读恰 1 处 + 门布尔导出', () => {
    // literal-inventory envPrefixLiteral 预注册（env 名单一事实源）
    const envAllow = inventory.allowlist['envPrefixLiteral'] ?? {}
    expect(envAllow['tui/ink/renderInstrumentation.ts']).toBe(1)
    expect(instrSrc).toContain(
      "export const RENDER_INSTRUMENTATION_ENV = 'ATLAS_RENDER_INSTRUMENTATION_LOG'",
    )
    // process.env 读恰 1 处（模块顶层）
    expect(instrSrc.match(/process\.env\[/g)?.length).toBe(1)
    expect(instrSrc).toContain(
      'export const renderInstrumentationEnabled =',
    )
  })

  test('关闭支先门后构造：两记录函数门在首行', () => {
    for (const fn of ['recordRenderFrame', 'recordUnmountFrame']) {
      const body = instrSrc.slice(instrSrc.indexOf(`function ${fn}`))
      const gate = body.indexOf('if (!renderInstrumentationEnabled) return')
      expect(gate).toBeGreaterThan(-1)
      // 门后才有 JSON.stringify/appendFileSync（关闭支零构造零 IO）
      const firstConstruct = body.indexOf('JSON.stringify')
      expect(firstConstruct).toBeGreaterThan(gate)
    }
  })

  test('帧级单点钩子：ink.tsx 采样恰 1 + unmount seq:-1 + diffEach cell 级零触碰', () => {
    expect(inkSrc.match(/recordRenderFrame\(/g)?.length).toBe(1)
    expect(inkSrc.match(/recordUnmountFrame\(/g)?.length).toBe(1)
    // 先门后构造（关闭支零分配）
    const sample = inkSrc.indexOf('if (renderInstrumentationEnabled)')
    const objLit = inkSrc.indexOf('nextScreen: frame.screen')
    expect(sample).toBeGreaterThan(-1)
    expect(objLit).toBeGreaterThan(sample)
    // diffEach 回调零触碰（screen.ts 不 import/接线仪表化；溯源头注提及不算）
    expect(screenSrc).not.toContain("from './renderInstrumentation")
    expect(screenSrc).not.toContain('renderInstrumentationEnabled')
  })

  test('批复注记 1：diffRegion 单源提取——diffEach 调用同源函数非镜像复制', () => {
    expect(screenSrc).toContain('export function diffRegion(')
    expect(screenSrc).toContain('const region = diffRegion(prev, next)')
    expect(instrSrc).toContain("import { diffRegion, type Screen } from './screen.js'")
  })

  test('双通道独立：ATLAS_FRAME_TIMING_LOG bench 通道零触碰在场', () => {
    expect(helpersSrc).toContain('ATLAS_FRAME_TIMING_LOG')
  })

  test('落盘 sync 先例同构：appendFileSync + no-sync-fs 域（sync 防帧丢）', () => {
    expect(instrSrc).toContain('appendFileSync')
    // 调用点恰 2（recordRenderFrame + recordUnmountFrame；import 与头注提及不计）
    expect(instrSrc.match(/appendFileSync\(/g)?.length).toBe(2)
  })
})
