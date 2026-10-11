/**
 * AD-21（0.1.51 C-1 首件，CC 2.1.105）EnterWorktree `path` 参数面：
 * 现存 worktree 探测支（进入不新建）+ 纯 porcelain 解析器 + 零回归守卫。
 *
 * 工单 §1.1 规格：入参 schema 加 `path?: string` + 现存 worktree 探测
 * （git worktree list --porcelain）+ 校验（路径存在且为本仓 worktree →
 * 进入不新建；不存在 → 可操作报错；非 worktree → 拒）。
 * 零回归约束：仅 `name` 入参路径与现逐字恒等。
 *
 * 判别口径（修前红 → 修后绿，本文件零盘 unit 面）：
 *   ①  schema `path` 属性在场（修前：面不存在 → 红）
 *   ②  parseWorktreeListPorcelain 纯解析器自 engine 门面导出在场
 *      （块结构/分支剥离/标记行忽略；修前：导出缺席 → 红；动态 import
 *      使缺席只红 ② 族，④ 零回归守卫独立恒绿）
 *   ③  toAutoClassifierInput path 回落 name ?? path ?? ''（修前：只读
 *      name → path-only 返回 '' → 红）
 *   ④  零回归：name-only 逐字面（name 优先 + name 属性描述逐字 + 空
 *      输入 ''）——修前修后恒绿
 *
 * 真盘面（path 现存 worktree 进入不新建 / 不存在可操作报错 / 非 worktree
 * 拒 + name-only 新建不回归）= func 层 tests/func/worktree-ad21-path.
 * test.ts（真 git 仓，工单 §2 判别 ①②③ 对应面）。
 * 分层纪律：本文件 = 纯函数 + schema/分类器面（零子进程 / 零真盘）。
 */
import { describe, test, expect } from 'bun:test'
import {
  ENTER_WORKTREE_TOOL_INPUT_SCHEMA,
  EnterWorktreeTool,
} from '../../src/engine/tools'

async function loadPorcelainParser(): Promise<
  ((out: string) => Array<{ worktreePath: string; branch: string | null }>) | undefined
> {
  const mod = await import('../../src/engine')
  return (mod as Record<string, unknown>).parseWorktreeListPorcelain as
    | ((out: string) => Array<{ worktreePath: string; branch: string | null }>)
    | undefined
}

describe('AD-21 schema 面（path 属性在场）', () => {
  test('① inputSchema.properties.path 在场（string 型 + 描述）', () => {
    const props = (
      ENTER_WORKTREE_TOOL_INPUT_SCHEMA as {
        properties?: Record<string, { type?: string; description?: string }>
      }
    ).properties
    expect(props?.path?.type).toBe('string')
    expect(props?.path?.description?.length ?? 0).toBeGreaterThan(0)
    // 零回归：name 属性逐字保留
    expect(props?.name?.type).toBe('string')
    expect(props?.name?.description).toContain('Optional name for the worktree')
  })
})

describe('AD-21 parseWorktreeListPorcelain 纯解析器（git worktree list --porcelain）', () => {
  test('②a 块结构：worktree 行开块 + branch 行剥 refs/heads/ 前缀', async () => {
    const parse = await loadPorcelainParser()
    expect(typeof parse).toBe('function')
    const out = [
      'worktree /repo',
      'HEAD aaaaaaa',
      'branch refs/heads/master',
      '',
      'worktree /repo/.atlas/worktrees/ad21',
      'HEAD bbbbbbb',
      'branch refs/heads/worktree-ad21',
      '',
    ].join('\n')
    const entries = parse!(out)
    expect(entries).toEqual([
      { worktreePath: '/repo', branch: 'master' },
      { worktreePath: '/repo/.atlas/worktrees/ad21', branch: 'worktree-ad21' },
    ])
  })

  test('②b detached worktree（无 branch 行）→ branch = null（不崩不串块）', async () => {
    const parse = await loadPorcelainParser()
    expect(typeof parse).toBe('function')
    const out = [
      'worktree /repo',
      'HEAD aaaaaaa',
      'branch refs/heads/master',
      '',
      'worktree /repo/wt-detached',
      'HEAD ccccccc',
      'detached',
      '',
    ].join('\n')
    const entries = parse!(out)
    expect(entries).toHaveLength(2)
    expect(entries[1]).toEqual({
      worktreePath: '/repo/wt-detached',
      branch: null,
    })
  })

  test('②c 标记行（bare/prunable/locked）不影响路径与分支提取 + 空输入 → 空数组', async () => {
    const parse = await loadPorcelainParser()
    expect(typeof parse).toBe('function')
    const out = [
      'worktree /repo',
      'HEAD aaaaaaa',
      'branch refs/heads/master',
      'prunable',
      '',
      'worktree /other/wt',
      'bare',
      '',
    ].join('\n')
    const entries = parse!(out)
    expect(entries).toEqual([
      { worktreePath: '/repo', branch: 'master' },
      { worktreePath: '/other/wt', branch: null },
    ])
    expect(parse!('')).toEqual([])
    expect(parse!('worktree /x\n')).toEqual([
      { worktreePath: '/x', branch: null },
    ])
  })
})

describe('AD-21 分类器面 + 零回归', () => {
  test('③ toAutoClassifierInput：path-only → path（修前：只读 name → 返回 ""）', () => {
    expect(
      EnterWorktreeTool.toAutoClassifierInput({ path: '/repo/wt-x' }),
    ).toBe('/repo/wt-x')
    // 双给 = name 优先（零回归语义位）
    expect(
      EnterWorktreeTool.toAutoClassifierInput({
        name: 'n',
        path: '/p',
      }),
    ).toBe('n')
  })

  test('④ 零回归：name-only 逐字面（name ?? path ?? "" 的 name 支）+ 空输入', () => {
    expect(EnterWorktreeTool.toAutoClassifierInput({ name: 'feat/x' })).toBe(
      'feat/x',
    )
    expect(EnterWorktreeTool.toAutoClassifierInput({})).toBe('')
  })
})
