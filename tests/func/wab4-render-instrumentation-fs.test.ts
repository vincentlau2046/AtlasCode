/**
 * 0.1.110 W-AB4 件 A 渲染仪表化 func 层判别格（f4 lock-face 批复 工单 §7
 * @273cf8ed）。真盘原因：落盘面（appendFileSync JSONL）+ env 模块级缓存
 * 需隔离进程 spawn 腿（env 读在模块顶层，进程内改 env 不生效）。
 *
 * 判别腿：
 *  - 格 1 落盘腿（env set）：spawn 探针 → JSONL 落盘 + 行 schema 字段面
 *    （seq/bytes/dmg/fullReset/staticRowsTouched 语义直证）+ unmount
 *    seq:-1 单独一行。
 *  - 格 1 关闭腿（env unset）：spawn 探针 → 零落盘（关闭支零 IO 直证）。
 *  - 批复注记 1 drift 守卫（进程内，纯 screen 函数）：diffRegion 与
 *    diffEach 实扫边界同源——单格 damage 直证 + 候选① 机制直证（两不
 *    相邻 damage 并集 = 跨全高单矩形）。
 */
import { spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  CharPool,
  HyperlinkPool,
  StylePool,
  createScreen,
  diffEach,
  diffRegion,
  setCellAt,
} from '../../src/tui/ink/screen'

const REPO = join(import.meta.dir, '..', '..')
const PROBE_TARGET = join(REPO, 'src/tui/ink/renderInstrumentation.ts')

let dir = ''
let logPath = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-wab4-instr-'))
  logPath = join(dir, 'metrics.jsonl')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 生成 spawn 探针（env 由父进程注入；目标模块经绝对路径 import）。 */
function writeProbe(): string {
  const probe = join(dir, 'probe.mjs')
  writeFileSync(
    probe,
    `
const mod = await import(${JSON.stringify(PROBE_TARGET)})
const next = { width: 20, height: 20, damage: { x: 0, y: 0, width: 20, height: 3 } }
const prev = { width: 20, height: 20, damage: undefined }
mod.recordRenderFrame({
  nextScreen: next,
  prevScreen: prev,
  viewportH: 10,
  patches: [
    { type: 'stdout', content: 'hello' },
    { type: 'clearTerminal', reason: 'offscreen' },
  ],
  frameMs: 1.5, diffMs: 0.5, writeMs: 0.2, commitMs: 0.1,
})
mod.recordRenderFrame({
  nextScreen: { width: 20, height: 20, damage: undefined },
  prevScreen: next,
  viewportH: 10,
  patches: [],
  frameMs: 0.4, diffMs: 0.1, writeMs: 0.0, commitMs: 0.0,
})
mod.recordUnmountFrame()
console.log('PROBE_OK')
`,
  )
  return probe
}

describe('W-AB4 仪表化落盘腿（0.1.110 f4 §7 @273cf8ed）', () => {
  test('env set：JSONL 落盘 + 行 schema 语义直证 + unmount seq:-1', () => {
    const probe = writeProbe()
    const r = spawnSync('bun', ['run', probe], {
      env: {
        ...process.env,
        ATLAS_RENDER_INSTRUMENTATION_LOG: logPath,
      },
      encoding: 'utf8',
    })
    expect(r.stdout).toContain('PROBE_OK')
    expect(r.status).toBe(0)
    expect(existsSync(logPath)).toBe(true)
    const lines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map(l => JSON.parse(l))
    expect(lines).toHaveLength(3)
    // 帧 1 schema：bytes 仅 stdout 载荷（'hello'=5）；fullReset 直证
    // clearTerminal 旁路帧；dmg 同源 diffRegion（damage 原样）；候选③
    // staticRowsTouched = scrollback 带（20-10=10）交叠 = 3
    expect(lines[0].seq).toBe(1)
    expect(lines[0].bytes).toBe(5)
    expect(lines[0].patches).toBe(2)
    expect(lines[0].fullReset).toBe(true)
    expect(lines[0].dmg).toEqual({
      x: 0,
      y: 0,
      w: 20,
      h: 3,
      area: 60,
      full: false,
    })
    expect(lines[0].staticRowsTouched).toBe(3)
    expect(lines[0].screenH).toBe(20)
    expect(lines[0].viewportH).toBe(10)
    expect(typeof lines[0].tMs).toBe('number')
    // 帧 2：空 patch（早退帧仍计数——pty 双列口径差异面原料）
    expect(lines[1].seq).toBe(2)
    expect(lines[1].bytes).toBe(0)
    expect(lines[1].patches).toBe(0)
    expect(lines[1].fullReset).toBe(false)
    // unmount 终帧：seq:-1 不入帧率分母
    expect(lines[2].seq).toBe(-1)
  })

  test('env unset：零落盘（关闭支零 IO 直证）', () => {
    const probe = writeProbe()
    const env = { ...process.env }
    delete env.ATLAS_RENDER_INSTRUMENTATION_LOG
    const r = spawnSync('bun', ['run', probe], { env, encoding: 'utf8' })
    expect(r.stdout).toContain('PROBE_OK')
    expect(r.status).toBe(0)
    expect(existsSync(logPath)).toBe(false)
  })
})

describe('W-AB4 drift 守卫（批复注记 1：diffRegion 与 diffEach 同源）', () => {
  test('单格 damage：diffRegion 恰含 diffEach 实扫变更格', () => {
    const pools = [new StylePool(), new CharPool(), new HyperlinkPool()]
    const prev = createScreen(20, 10, ...pools)
    const next = createScreen(20, 10, ...pools)
    setCellAt(next, 5, 3, { char: 'x', styleId: 0, width: 0, hyperlink: undefined })
    next.damage = { x: 5, y: 3, width: 1, height: 1 }
    const region = diffRegion(prev, next)
    expect(region).toEqual({ x: 5, y: 3, width: 1, height: 1 })
    const visited: Array<[number, number]> = []
    diffEach(prev, next, (x, y) => {
      visited.push([x, y])
    })
    expect(visited).toEqual([[5, 3]])
  })

  test('候选① 机制直证：两不相邻 damage 并集 = 跨全高单矩形', () => {
    const pools = [new StylePool(), new CharPool(), new HyperlinkPool()]
    const prev = createScreen(20, 10, ...pools)
    const next = createScreen(20, 10, ...pools)
    // spinner 行（顶）+ 流式尾行（底）——T01/T06 型常态拓扑
    prev.damage = { x: 0, y: 0, width: 20, height: 1 }
    next.damage = { x: 0, y: 9, width: 20, height: 1 }
    const region = diffRegion(prev, next)
    expect(region.y).toBe(0)
    expect(region.height).toBe(10) // 跨全高：扫描面/改写量结构性趋近全屏
  })
})
