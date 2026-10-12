/**
 * 0.1.57 C5-1（PAC V2-05 MCP 硬化，工单 2026-10-13-p0-wave-0157-ticket §0）—
 * MCP 工具 `_meta['anthropic/alwaysLoad']` 提取面 判别单测（CC 2.1.121）。
 *
 * 背景：MCP 工具恒 always-deferred（isDeferredTool isMcp 支 → ToolSearch 延迟装载），
 * 上游 CC 2.1.121 起允许 MCP 服务器经工具描述符 `_meta['anthropic/alwaysLoad'] === true`
 * 显式退出延迟（初始 prompt 全 schema 在场）。消费面已在场（isDeferredTool 首查
 * tool.alwaysLoad === true → return false），本波补**提取面**：buildMcpTool 从
 * McpToolDescriptor._meta 严格布尔提取挂 Tool.alwaysLoad（mcp 域 fetchToolsForClient
 * 透传 SDK tools/list 的 _meta 段 → engine port 同构映射）。
 *
 * 判别信号（手建描述符过真实 createMcpTools 构建面，非恒绿假绿）：
 *  - 四值矩阵：_meta['anthropic/alwaysLoad'] = true / false / 缺失 / 非布尔
 *  - 严格布尔裁定：仅 === true 挂字段（宽松真值 "true" 字符串 / 1 不挂）
 *  - 零回归约束：未设（undefined）时 MCP 工具行为恒等现状（always-deferred）
 *
 * 分层纪律：纯构建面（零磁盘 / 零网络，unit 层口径；连接层 _meta 透传的活探针
 * = e2e lane PTY MCP 服务器连/断探针 D4 面）。
 */
import { describe, test, expect } from 'bun:test'
import { createMcpTools } from '../../src/engine/tools/mcp'
import { isDeferredTool } from '../../src/engine/tools/toolsearch/toolSearchPrompt'
import type { MCPServerConnection } from '../../src/engine/ports/mcpClient'
import type { Tool } from '../../src/shared'

function fakeConnection(
  tools: NonNullable<MCPServerConnection['tools']>[number][],
): MCPServerConnection {
  return {
    name: 'srv',
    client: {
      callTool: async () => ({ content: [] }),
    },
    tools,
  }
}

/** 单工具构建 → 取回 Tool 面（name = mcp__srv__<tool>）。 */
function buildSingle(descriptor: NonNullable<MCPServerConnection['tools']>[number]): Tool {
  const tools = createMcpTools([fakeConnection([descriptor])])
  expect(tools).toHaveLength(1)
  return tools[0]!
}

describe('C5-1 alwaysLoad 提取面（四值矩阵，严格布尔）', () => {
  test('_meta["anthropic/alwaysLoad"] = true → 挂 alwaysLoad=true + isDeferredTool=false（跳过 ToolSearch 延迟）', () => {
    const tool = buildSingle({
      name: 't1',
      _meta: { 'anthropic/alwaysLoad': true },
    })
    expect(tool.alwaysLoad).toBe(true)
    expect(tool.isMcp).toBe(true)
    // 关键判别：MCP 工具（isMcp=true 恒延迟支）被 alwaysLoad 首查覆盖 → 不延迟
    expect(isDeferredTool(tool)).toBe(false)
  })

  test('_meta["anthropic/alwaysLoad"] = false → 不挂字段（undefined）+ 维持恒延迟', () => {
    const tool = buildSingle({
      name: 't2',
      _meta: { 'anthropic/alwaysLoad': false },
    })
    expect(tool.alwaysLoad).toBeUndefined()
    expect(isDeferredTool(tool)).toBe(true)
  })

  test('_meta 缺失 → 不挂字段（undefined）+ 维持恒延迟（零回归约束：现状行为恒等）', () => {
    const tool = buildSingle({
      name: 't3',
      description: 'no meta',
    })
    expect(tool.alwaysLoad).toBeUndefined()
    expect(isDeferredTool(tool)).toBe(true)
  })

  test('非布尔真值（"true" 字符串 / 1）→ 不挂字段（严格 === true 语义，宽松真值不挂）', () => {
    const strTool = buildSingle({
      name: 't4',
      _meta: { 'anthropic/alwaysLoad': 'true' },
    })
    expect(strTool.alwaysLoad).toBeUndefined()
    expect(isDeferredTool(strTool)).toBe(true)

    const numTool = buildSingle({
      name: 't5',
      _meta: { 'anthropic/alwaysLoad': 1 },
    })
    expect(numTool.alwaysLoad).toBeUndefined()
    expect(isDeferredTool(numTool)).toBe(true)
  })
})

describe('C5-1 零回归守卫（_meta 其他键 / 多工具面）', () => {
  test('_meta 含无关键（searchHint 等）不影响 alwaysLoad 提取', () => {
    const tool = buildSingle({
      name: 't6',
      _meta: {
        'anthropic/searchHint': 'hint',
        'anthropic/alwaysLoad': true,
      },
    })
    expect(tool.alwaysLoad).toBe(true)
    expect(isDeferredTool(tool)).toBe(false)
  })

  test('多工具连接：仅显式 alwaysLoad=true 的工具退出延迟，其余 MCP 工具维持恒延迟', () => {
    const tools = createMcpTools([
      fakeConnection([
        { name: 'a', _meta: { 'anthropic/alwaysLoad': true } },
        { name: 'b' },
        { name: 'c', _meta: { 'anthropic/alwaysLoad': false } },
      ]),
    ])
    expect(tools).toHaveLength(3)
    expect(tools.map(t => t.alwaysLoad)).toEqual([true, undefined, undefined])
    expect(tools.map(t => isDeferredTool(t))).toEqual([false, true, true])
  })
})
