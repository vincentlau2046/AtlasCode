/**
 * 0.1.93b 段 R-③ — store/port 单实例 bundle 结构断言（Q1 手法；工单
 * @c22716f6 §3）。RED-F 候选 RF-1（模块双实例族）的判别格：若
 * sessionContextPort 或 EngineState 模块在 bundle 成双实例，成员工具
 * （SendMessageTool 触发段）读的 port 单例与 runner 侧 store 分裂。
 *
 * 本格 = 源面结构断言（file 数 + import 车道收敛）+ 探针 stamp/read 单源
 * 断言；运行时真双实例（bundle 期）func 层不可复现（0.1.93 方法论勘误：
 * 单副本测试环境无法暴露多实例分裂）——e2e 腿由 probe-R1 标识
 * 'untagged' 信号兜底（WeakMap 跨实例 read 落 untagged）。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const SRC_ROOT = join(import.meta.dir, '..', '..', 'src')

/** 递归收集 src/ 下指定文件名（精确名或 `.ts`/`.tsx` 扩展名形态；跳过 node_modules/dist/worktrees）。 */
function findFiles(
  dir: string,
  name: string,
  out: string[] = [],
): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'worktrees'
      ) {
        continue
      }
      findFiles(p, name, out)
    } else if (entry.name === name || (name === '.ts' && entry.name.endsWith('.ts')) || (name === '.tsx' && entry.name.endsWith('.tsx'))) {
      out.push(p)
    }
  }
  return out
}

function readSrc(rel: string): string {
  return readFileSync(join(SRC_ROOT, rel), 'utf8')
}

describe('0.1.93b R-③ store/port 单实例结构断言', () => {
  test('R3-1 sessionContextPort.ts 全仓恰 1 份', () => {
    const files = findFiles(SRC_ROOT, 'sessionContextPort.ts')
    expect(files).toHaveLength(1)
    expect(files[0]!.endsWith(join('src', 'engine', 'session', 'sessionContextPort.ts'))).toBe(
      true,
    )
  })

  test('R3-2 EngineState.ts 全仓恰 1 份', () => {
    const files = findFiles(SRC_ROOT, 'EngineState.ts')
    expect(files).toHaveLength(1)
  })

  test('R3-3 触发段/waitForTeammates 消费车道 import 收敛同一 port 模块', () => {
    // 成员工具读 port 的全部车道须指向同一文件（双 specifier = 潜在双实例面）
    const sendMessage = readSrc(join('engine', 'tools', 'team', 'sendMessageTool.ts'))
    const waitTeammates = readSrc(join('engine', 'tools', 'team', 'waitForTeammatesTool.ts'))
    expect(sendMessage).toContain("from '../../session/sessionContextPort'")
    expect(waitTeammates).toContain("from '../../session/sessionContextPort'")
  })

  test('R3-4 port 模块单 set/get 窗（setSessionContextPort 全仓唯一声明）', () => {
    const port = readSrc(join('engine', 'session', 'sessionContextPort.ts'))
    expect(port.match(/export function setSessionContextPort/g)?.length).toBe(1)
    expect(port.match(/export function getSessionContextPort/g)?.length).toBe(1)
  })

  test('R3-5 probe stamp/read 单源（探针 helpers 恰在 task/inProcessTeammate.ts 一处声明）', () => {
    // 探针自身依赖 WeakMap 模块单例——声明面多份 = 探针失效
    const stampers = findFiles(SRC_ROOT, 'inProcessTeammate.ts')
    expect(stampers).toHaveLength(1)
    const src = readFileSync(stampers[0]!, 'utf8')
    expect(src).toContain('export function probeStampAbortController')
    expect(src).toContain('export function probeReadAbortControllerId')
    // 全仓 stamp/read 调用点（src 下）只经 '../task' barrel 或相对路径引用
    // 该单文件导出（grep 面：无第二处 `function probeStampAbortController`）
    let declCount = 0
    for (const f of findFiles(SRC_ROOT, '.ts').concat(findFiles(SRC_ROOT, '.tsx'))) {
      const c = readFileSync(f, 'utf8')
      declCount += (c.match(/function probe(Stamp|Read)AbortController/g) ?? []).length
    }
    expect(declCount).toBe(2)
  })

  test('R3-6 探针 stamp 幂等 + read 跨空值面语义（运行时面抽验）', async () => {
    const { probeStampAbortController, probeReadAbortControllerId } = await import(
      '../../src/task/inProcessTeammate'
    )
    const ac = new AbortController()
    expect(probeStampAbortController(ac)).toMatch(/^ac-\d+$/)
    const id1 = probeStampAbortController(ac)
    const id2 = probeStampAbortController(ac)
    expect(id1).toBe(id2) // 幂等重入同标识
    expect(probeReadAbortControllerId(ac)).toBe(id1)
    expect(probeReadAbortControllerId(undefined)).toBe('none')
    expect(probeReadAbortControllerId(new AbortController())).toBe('untagged')
  })
})
