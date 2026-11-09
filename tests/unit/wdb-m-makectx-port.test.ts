/**
 * 0.1.94 W-D-B 段 M 判别格（f4 §14 批复判据面冻结 @master 8cc02243）：
 * print.ts makeCtx setAppState 双重 fail-silent 修复（SDK lane TodoWrite
 * todos 域读恒 undefined + 写静默丢弃）。
 *
 * 修形 = 双通道（f4 §14 裁点批准）：port 注入优先 / setAppState 回落。
 *   - TodoWrite 写点 port-first：ctx.todosPort 在场 → 读写全走 port 活
 *     载体；缺席 → 回落支（合法性前提 = 上下文非 makeCtx 窄形，即 TUI
 *     lane 全量 store）。
 *   - 硬条件 1（fail-visible 前移构建期）：makeCtx 组装 todos port，组装
 *     失败 = 构建期显式 throw（错误含落点指引）；SdkToolUseContext 增
 *     required todosPort 字段（类型级 fail-loud：构造点缺字段 = tsc 红）。
 *   - 硬条件 2（结构断言）：makeCtx 产出 ctx 恒含 port——本文件源级结构
 *     断言钉死（SdkToolUseContext required 字段形锚 + makeCtx 组装/守卫
 *     形锚），「回落存在但 SDK lane 永不可达」判别格证明，禁口头保证。
 *
 * 三点必答（工单 §6④）：
 *   1. RED→GREEN：修前 SDK lane TodoWrite 写后读不回（窄 updater 收窄形
 *      模拟 ctx）→ 格 1 port 面修前红（todosPort 被忽略、写进 no-op
 *      updater）修后绿（port 载体可观测 + oldTodos 回读正确）。
 *   2. TPC/TUI 零回归格：格 2 回落支（无 port 的 TUI 全量 store 形 ctx）
 *      修前修后行为恒等（写进 prev.todos 可观测 + oldTodos = 预置）。
 *   3. fail-visible 形锚：格 3 源级断言 makeCtx 构建期守卫 throw 在场
 *      （错误含落点指引）+ 禁写入期静默回落的结构前提（格 4 required
 *      字段形锚）。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { TodoWriteTool } from '../../src/engine/tools/tasks/todoWriteTool'
import type { TodoWriteToolUseContext } from '../../src/engine/tools/tasks/taskToolInput'
import type { TodoList } from '../../src/engine'

const SRC_ROOT = join(import.meta.dir, '..', '..', 'src')

function readSrc(rel: string): string {
  return readFileSync(join(SRC_ROOT, rel), 'utf8')
}

const item = (content: string, status = 'pending') => ({
  content,
  status,
  activeForm: content,
})

// ── 三点必答 1：RED→GREEN（port 支写后读回可观测）──────────────────────

describe('W-D-B 段 M 判别格 1：TodoWrite port 支（RED→GREEN）', () => {
  test('port 注入 ctx：写后 port 载体可读回 + oldTodos = 载体写前值', async () => {
    const store = new Map<string, TodoList>([
      ['a1', [item('seed', 'in_progress')]],
    ])
    const todosPort = {
      readTodos: (key: string) => store.get(key) ?? [],
      writeTodos: (key: string, todos: TodoList) => {
        store.set(key, todos)
      },
    }
    // ctx 双形兼备：duck getAppState/setAppState（修前形态可跑）+
    // todosPort（修后 port-first 消费面）。
    const ctx = {
      agentId: 'a1',
      getAppState: () => ({}),
      setAppState: () => {},
      todosPort,
    } as unknown as TodoWriteToolUseContext

    const res = await TodoWriteTool.call(
      { todos: [item('task-1'), item('task-2')] },
      ctx,
    )
    // oldTodos = port 载体写前值（修前恒 []：窄形读 undefined ?? []）
    expect(res.data.oldTodos).toEqual([item('seed', 'in_progress')])
    // 写后载体可观测（修前写进 no-op updater = 静默丢失，读回恒 []）
    expect(store.get('a1')).toEqual([item('task-1'), item('task-2')])
  })

  test('port 支 allDone 清空支：全 completed → newTodos = [] 写入载体', async () => {
    const store = new Map<string, TodoList>()
    const todosPort = {
      readTodos: (key: string) => store.get(key) ?? [],
      writeTodos: (key: string, todos: TodoList) => {
        store.set(key, todos)
      },
    }
    const ctx = {
      agentId: 'a2',
      getAppState: () => ({}),
      setAppState: () => {},
      todosPort,
    } as unknown as TodoWriteToolUseContext

    const res = await TodoWriteTool.call(
      { todos: [item('done-1', 'completed'), item('done-2', 'completed')] },
      ctx,
    )
    expect(res.data.newTodos).toEqual([
      item('done-1', 'completed'),
      item('done-2', 'completed'),
    ])
    // allDone → 载体写 []（旧体 newTodos 语义逐字）
    expect(store.get('a2')).toEqual([])
  })
})

// ── 三点必答 2：回落支（TUI 全量 store 形）零回归 ───────────────────────

describe('W-D-B 段 M 判别格 2：setAppState 回落支零回归（TUI lane 形）', () => {
  test('无 port ctx（全量 store 形）：写进 prev.todos 可观测 + oldTodos = 预置', async () => {
    let stored: { todos?: Record<string, TodoList> } = {
      todos: { a3: [item('seed-3')] },
    }
    const ctx = {
      agentId: 'a3',
      getAppState: () => stored,
      setAppState: (f: (prev: typeof stored) => typeof stored) => {
        stored = f(stored)
      },
    } as unknown as TodoWriteToolUseContext

    const res = await TodoWriteTool.call(
      { todos: [item('task-3')] },
      ctx,
    )
    expect(res.data.oldTodos).toEqual([item('seed-3')])
    expect(stored.todos?.a3).toEqual([item('task-3')])
  })
})

// ── 三点必答 3 + f4 硬条件 1/2：结构断言（恒含 port）────────────────────

describe('W-D-B 段 M 判别格 3/4：makeCtx 恒含 port 结构断言（硬条件 1+2）', () => {
  test('SdkToolUseContext 含 required todosPort 字段（类型级 fail-loud 形锚）', () => {
    const src = readSrc('cli/sdkTypes.ts')
    // required（非 `todosPort?`）——构造点缺字段 = tsc 红
    expect(src).toMatch(/todosPort:\s*TodoWriteTodosPort\b/)
    expect(src).not.toMatch(/todosPort\?:\s*TodoWriteTodosPort/)
  })

  test('makeCtx 构建期组装 + fail-visible 守卫（错误含落点指引）', () => {
    const src = readSrc('cli/print.ts')
    // port 组装形锚
    expect(src).toMatch(/todosPort/)
    // 构建期守卫 throw 形锚（硬条件 1：组装失败 = 显式 throw，禁静默）
    expect(src).toMatch(
      /todos port assembly failed[\s\S]*?makeCtx/,
    )
  })

  test('makeCtx TPC 面零回归形锚（setAppState 回读 tpcRef 形不变）', () => {
    const src = readSrc('cli/print.ts')
    // TPC 域维持 tpcRef 单源（f4 §14 A 表：TPC 域内零影响）
    expect(src).toMatch(
      /tpcRef\.current\s*=\s*updater\(\{\s*toolPermissionContext:\s*tpcRef\.current\s*\}\)\.toolPermissionContext/,
    )
  })

  test('TodoWrite 双通道形锚（port-first 分支在场）', () => {
    const src = readSrc('engine/tools/tasks/todoWriteTool.ts')
    expect(src).toMatch(/ctx\.todosPort/)
  })
})
