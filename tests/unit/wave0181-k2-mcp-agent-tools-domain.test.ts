/**
 * 0.1.81 V3-2 K2 MCP 面 — #10 判别单测：agent `tools:` server 级 spec 按
 * server 取域（工单 `docs/2026-10-25-p0-wave-0181-ticket.md` item 10）。
 *
 * 工单缺口：agent frontmatter `tools: ['mcp__server']`（server 级 spec，无工具
 * 段）经 resolveAgentTools 精确查表（byName.get('mcp__server')）查不到真实
 * 工具名（mcp__server__tool）→ 整条落 invalidTools → agent 拿不到该 server
 * 任何 MCP 工具。改法 = 精确匹配未命中时用 mcpInfoFromString 解析 spec：
 * toolName === undefined（server 级）→ getMcpPrefix(serverName) 前缀取该
 * server 全部工具；含工具段（mcp__s__t）缺席仍 invalidTools 不展开。
 *
 * 取域语义裁定：前缀 = getMcpPrefix(解析后 serverName)（归一名 + 尾随 `__`），
 * 非裸 string-prefix——防 `mcp__my` 误命中 server `my_server` 的工具
 * （`mcp__my_server__tool` 不以 `mcp__my__` 开头）。工具池内 server 名经
 * normalizeNameForMCP 折叠连续下划线，不含 `__`，前缀取域无歧义。
 *
 * 判别（修前红 → 修后绿）：
 *  - server 级 spec 取全域（修前落 invalidTools → 红）
 *  - `mcp__my` 不误取 `my_server` 域（裸前缀 naive 实现会红）
 *  - 含工具段缺席仍 invalidTools / 精确全名恒等
 *  - 非 mcp 精确名恒等（零回归）
 *  - 域展开尊重 disallowedTools 剔除
 * engine + tui 双胞胎（双副本同步规则）各测一份。
 */
import { describe, expect, test } from 'bun:test'

const ENGINE_SPEC = '../../src/engine/tools/agent/agentToolUtils.js'
const TUI_SPEC = '../../src/tui/tools/AgentTool/agentToolUtils.js'

/** 极简 fake tool：resolveAgentTools/filterToolsForAgent 只消费 name 面。 */
function mk(name: string) {
  return { name } as never
}

/** 工具池：srv 域 2 工具 + other 域 1 + my_server 域 1（归一名，防裸前缀误取）+ 非 mcp。 */
function pool() {
  return [
    mk('mcp__srv__tool1'),
    mk('mcp__srv__tool2'),
    mk('mcp__other__tool'),
    mk('mcp__my_server__tool'),
    mk('Read'),
  ]
}

type ResolveFn = (def: unknown, tools: unknown[]) => {
  hasWildcard: boolean
  validTools: string[]
  invalidTools: string[]
  resolvedTools: { name: string }[]
}

describe.each([
  ['engine', ENGINE_SPEC],
  ['tui', TUI_SPEC],
])('K2 #10：agent tools server 级 spec 取域（%s 双胞胎）', (_lane, spec) => {
  async function load(): Promise<ResolveFn> {
    // tui twin 直接 import 触发已知 TDZ 环（agentToolUtils → LocalAgentTask →
    // AgentTool.ts 顶层 buildTool 急切读 outputSchema getter → 回指未初始化的
    // agentToolResultSchema）。prime AgentTool.js 先行求值 agentToolUtils 全体
    // 后环解除（实bun验证 PRIME-OK）。
    if (spec === TUI_SPEC) {
      await import('../../src/tui/tools/AgentTool/AgentTool.js')
    }
    const mod = (await import(spec)) as { resolveAgentTools: ResolveFn }
    expect(mod.resolveAgentTools, 'resolveAgentTools 导出缺席').toBeTypeOf('function')
    return mod.resolveAgentTools
  }

  test("server 级 spec 'mcp__srv' → 取该 server 全域 2 工具（修前红）", async () => {
    const resolve = await load()
    const r = resolve({ source: 'built-in', tools: ['mcp__srv'] }, pool())
    expect(r.hasWildcard).toBe(false)
    expect(r.validTools).toEqual(['mcp__srv'])
    expect(r.invalidTools).toEqual([])
    expect(r.resolvedTools.map(t => t.name).sort()).toEqual([
      'mcp__srv__tool1',
      'mcp__srv__tool2',
    ])
  })

  test("'mcp__my' 不误取 my_server 域（裸前缀 naive 实现会红）+ 空域仍 invalidTools", async () => {
    const resolve = await load()
    const r = resolve({ source: 'built-in', tools: ['mcp__my'] }, pool())
    expect(r.resolvedTools).toEqual([])
    expect(r.invalidTools).toEqual(['mcp__my'])
  })

  test('含工具段缺席仍 invalidTools 不展开 + 精确全名恒等', async () => {
    const resolve = await load()
    const r = resolve(
      { source: 'built-in', tools: ['mcp__srv__nope', 'mcp__srv__tool1'] },
      pool(),
    )
    expect(r.invalidTools).toEqual(['mcp__srv__nope'])
    expect(r.resolvedTools.map(t => t.name)).toEqual(['mcp__srv__tool1'])
  })

  test('非 mcp 精确名恒等 + server 级与精确名混排（零回归）', async () => {
    const resolve = await load()
    const r = resolve(
      { source: 'built-in', tools: ['Read', 'mcp__srv'] },
      pool(),
    )
    expect(r.invalidTools).toEqual([])
    expect(r.resolvedTools.map(t => t.name).sort()).toEqual([
      'Read',
      'mcp__srv__tool1',
      'mcp__srv__tool2',
    ])
  })

  test('域展开尊重 disallowedTools 剔除（域内被禁工具不进 resolved）', async () => {
    const resolve = await load()
    const r = resolve(
      {
        source: 'built-in',
        tools: ['mcp__srv'],
        disallowedTools: ['mcp__srv__tool1'],
      },
      pool(),
    )
    expect(r.validTools).toEqual(['mcp__srv'])
    expect(r.resolvedTools.map(t => t.name)).toEqual(['mcp__srv__tool2'])
  })
})
