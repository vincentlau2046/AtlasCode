/**
 * engine/tools 注册表机制契约测试（§8.25 E-2 T-5e：getAllBaseTools(deps) + 全量常量集）。
 *
 * 被测能力（port 之下全真，非 tautology）：
 *   - getAllBaseTools(deps)：deps 注入装配（AgentTool 内建首位 / baseTools 追加 / mcpTools 合并）
 *     + 按名去重先入为主（内建优先于 MCP，旧仓 assembleToolPool 语义）+ ASCEND 域门控
 *     （kill-switch FEATURE_ASCEND_TOOLS=false，env 可注入不触真实环境）。
 *   - parseToolPreset：预设解析（大小写不敏感 / 未知 → null）。
 *   - 4 工具名集单一事实源（ALL_AGENT_DISALLOWED 6 项 / CUSTOM ≡ ALL / IN_PROCESS_TEAMMATE 5 项
 *     无 crons（feature-gated 残留守）/ COORDINATOR_MODE_ALLOWED 4 项）+ ASYNC 16 项。
 *   - filterToolsForAgent 集合接线判别（T-5b 本地裁剪集 {Agent} → T-5e toolNames 全量 6 项：
 *     TaskStop/AskUserQuestion/EnterPlanMode/TaskOutput/ExitPlanMode 现被剔除——T-5b 行为下
 *     这 5 个会漏过，是本测试的判别信号）。
 * I/O-free（无盘 / 无网络 / 无 PTY，env 注入不 save/restore process.env）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import {
  getAllBaseTools,
  isAscendToolsEnabled,
  parseToolPreset,
  TOOL_PRESETS,
  ALL_AGENT_DISALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  IN_PROCESS_TEAMMATE_ALLOWED_TOOLS,
  COORDINATOR_MODE_ALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  filterToolsForAgent,
  AgentTool,
  AGENT_TOOL_NAME,
  getBaseToolEntities,
} from '../../src/engine'
import type { Tool, Tools } from '../../src/shared'

/** fake tool：只填注册表/过滤链消费字段（name 等），非 tautology（同 engine-pipeline 范型）。 */
function makeTool(name: string, tag?: string): Tool {
  return {
    name,
    ...(tag ? { searchHint: tag } : {}),
  } as unknown as Tool
}

describe('getAllBaseTools(deps)（deps 注入装配 + 去重先入为主 + ASCEND 门控）', () => {
  test('① 空 deps → 仅内建 AgentTool', () => {
    const pool = getAllBaseTools()
    expect(pool).toHaveLength(1)
    expect(pool[0]).toBe(AgentTool)
    expect(pool[0].name).toBe(AGENT_TOOL_NAME)
  })
  test('② + baseTools → 追加（顺序：Agent 首位）', () => {
    const read = makeTool('Read')
    const edit = makeTool('Edit')
    const pool = getAllBaseTools({ baseTools: [read, edit] })
    expect(pool.map((t) => t.name)).toEqual(['Agent', 'Read', 'Edit'])
    expect(pool[1]).toBe(read)
  })
  test('③ 按名去重先入为主：baseTools 的 Read 胜出 mcpTools 的 Read', () => {
    const baseRead = makeTool('Read', 'base')
    const mcpRead = makeTool('Read', 'mcp')
    const pool = getAllBaseTools({ baseTools: [baseRead], mcpTools: [mcpRead] })
    expect(pool.filter((t) => t.name === 'Read')).toHaveLength(1)
    expect(pool.find((t) => t.name === 'Read')).toBe(baseRead) // 内建优先（旧仓 assembleToolPool 语义）
  })
  test('④ 内建 Agent 优先于 MCP 同名（mcp 面伪造 Agent 名不覆盖内建）', () => {
    const pool = getAllBaseTools({ mcpTools: [makeTool('Agent', 'mcp')] })
    expect(pool.filter((t) => t.name === 'Agent')).toHaveLength(1)
    expect(pool.find((t) => t.name === 'Agent')).toBe(AgentTool)
  })
  test('⑤ ascendTools 默认门开（注入即入池）', () => {
    const ascend = makeTool('AscendCompilerBridge')
    const pool = getAllBaseTools({ ascendTools: [ascend], env: {} })
    expect(pool.map((t) => t.name)).toContain('AscendCompilerBridge')
  })
  test('⑥ kill-switch FEATURE_ASCEND_TOOLS=false → ascendTools 剔除（env 注入，不触 process.env）', () => {
    const ascend = makeTool('AscendCompilerBridge')
    const pool = getAllBaseTools({ ascendTools: [ascend], env: { FEATURE_ASCEND_TOOLS: 'false' } })
    expect(pool.map((t) => t.name)).not.toContain('AscendCompilerBridge')
    expect(process.env.FEATURE_ASCEND_TOOLS).toBeUndefined() // 未污染真实环境
  })
  test('⑦ isAscendToolsEnabled 三态（缺省开 / kill-switch 关 / 显式非 false 开）', () => {
    expect(isAscendToolsEnabled({})).toBe(true)
    expect(isAscendToolsEnabled({ FEATURE_ASCEND_TOOLS: 'false' })).toBe(false)
    expect(isAscendToolsEnabled({ FEATURE_ASCEND_TOOLS: 'true' })).toBe(true)
  })
})

describe('parseToolPreset（预设解析）', () => {
  test('⑧ 已知预设（大小写不敏感）', () => {
    expect(parseToolPreset('default')).toBe('default')
    expect(parseToolPreset('DEFAULT')).toBe('default')
  })
  test('⑨ 未知预设 → null', () => {
    expect(parseToolPreset('bogus')).toBeNull()
  })
  test('⑩ TOOL_PRESETS 当前仅 default', () => {
    expect(TOOL_PRESETS).toEqual(['default'])
  })
})

describe('工具名集（单一事实源，值逐一验真旧仓）', () => {
  test('⑪ ALL_AGENT_DISALLOWED = 6 项（含 Agent 防递归 + TaskStop + plan 面 + TaskOutput + AskUserQuestion；不含基础工具）', () => {
    expect(ALL_AGENT_DISALLOWED_TOOLS).toHaveLength(6)
    for (const n of ['Agent', 'TaskOutput', 'ExitPlanMode', 'EnterPlanMode', 'AskUserQuestion', 'TaskStop']) {
      expect(ALL_AGENT_DISALLOWED_TOOLS.has(n)).toBe(true)
    }
    for (const n of ['Read', 'Bash', 'Edit']) {
      expect(ALL_AGENT_DISALLOWED_TOOLS.has(n)).toBe(false)
    }
  })
  test('⑫ CUSTOM ≡ ALL（同源，内容一致）', () => {
    expect([...CUSTOM_AGENT_DISALLOWED_TOOLS].sort()).toEqual([...ALL_AGENT_DISALLOWED_TOOLS].sort())
  })
  test('⑬ IN_PROCESS_TEAMMATE = 5 项（crons feature-gated 不入静态集，残留守）', () => {
    expect(IN_PROCESS_TEAMMATE_ALLOWED_TOOLS).toHaveLength(5)
    for (const n of ['TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate', 'SendMessage']) {
      expect(IN_PROCESS_TEAMMATE_ALLOWED_TOOLS.has(n)).toBe(true)
    }
    expect(IN_PROCESS_TEAMMATE_ALLOWED_TOOLS.has('CronCreate')).toBe(false)
  })
  test('⑭ COORDINATOR_MODE_ALLOWED = 4 项（输出 + agent 管理面）', () => {
    expect(COORDINATOR_MODE_ALLOWED_TOOLS).toHaveLength(4)
    for (const n of ['Agent', 'TaskStop', 'SendMessage', 'StructuredOutput']) {
      expect(COORDINATOR_MODE_ALLOWED_TOOLS.has(n)).toBe(true)
    }
  })
  test('⑮ ASYNC = 16 项（T-5d 验真，回归锚）', () => {
    expect(ASYNC_AGENT_ALLOWED_TOOLS).toHaveLength(16)
    expect(ASYNC_AGENT_ALLOWED_TOOLS.has('StructuredOutput')).toBe(true)
  })
})

// ── 判别信号：filterToolsForAgent 集合接线（T-5b 裁剪 {Agent} → T-5e 全量 6 项）──
const DISALLOWED_NAMES = ['TaskStop', 'AskUserQuestion', 'EnterPlanMode', 'TaskOutput', 'ExitPlanMode']
function agentSurfacePool(): Tools {
  return [makeTool('Read'), makeTool('Agent'), ...DISALLOWED_NAMES.map((n) => makeTool(n))]
}
describe('filterToolsForAgent（T-5e 全量禁用集接线判别）', () => {
  test('⑯ 内建 agent（allowFanOut=false）：5 个非 Agent 禁用名全剔除（T-5b 行为下会漏过）', () => {
    const kept = filterToolsForAgent({ tools: agentSurfacePool(), isBuiltIn: true })
    const names = kept.map((t) => t.name)
    expect(names).toEqual(['Read']) // 仅 Read 存活；Agent + 5 禁用名全剔除
  })
  test('⑰ allowFanOut=true → Agent fan-out carve-out 放行（禁用集内唯一例外）', () => {
    const kept = filterToolsForAgent({ tools: agentSurfacePool(), isBuiltIn: true, allowFanOut: true })
    const names = kept.map((t) => t.name)
    expect(names).toContain('Agent')
    for (const n of DISALLOWED_NAMES) expect(names).not.toContain(n)
  })
  test('⑱ mcp__ 前缀恒放行（禁用名加 mcp 前缀亦保留，旧仓 MCP 一等语义）', () => {
    const pool = [makeTool('mcp__srv__TaskStop')]
    const kept = filterToolsForAgent({ tools: pool, isBuiltIn: true })
    expect(kept.map((t) => t.name)).toEqual(['mcp__srv__TaskStop'])
  })
  test('⑲ 自定义 agent（isBuiltIn=false）：CUSTOM 集同全量禁用', () => {
    const kept = filterToolsForAgent({ tools: agentSurfacePool(), isBuiltIn: false })
    const names = kept.map((t) => t.name)
    for (const n of DISALLOWED_NAMES) expect(names).not.toContain(n)
    expect(names).toContain('Read')
  })
})

// ── getBaseToolEntities()（headless 车道基础工具本体全集单一事实源，#187 收口 / P1-C 0405 根因）──
// 惰性 getter：函数体延迟求值（绕开「门面 re-export ← bash 闭包可达门面 → 顶层 const
// 数组 TDZ」环）。判别信号：headless 池 = 调用方 toolRegistryDeps.baseTools 注入位。
// 若本集静默丢工具（重构遗漏 / 误删 import），headless 车道再次退化为「Agent+Snip
// 无文件/Shell 面」，弱模型 0 工具调用 fabrication family 复现（0405 定性证据）。本块锁全集契约。
describe('getBaseToolEntities()（headless 基础工具全集契约）', () => {
  const base = getBaseToolEntities()
  const names = () => base.map((t) => t.name)
  test('⑳ 名称唯一 + 全 34 件（单一事实源，防重构静默丢工具）', () => {
    expect(names()).toHaveLength(34)
    expect(new Set(names()).size).toBe(base.length)
  })
  test('㉑ 覆盖 headless 编码必需面（0405 fabrication 根因：文件/Shell/搜索工具在场）', () => {
    for (const n of ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep']) {
      expect(names()).toContain(n)
    }
  })
  test('㉒ AgentTool 内建不在 baseTools 数组（registry 序位：AgentTool 先于 baseTools）', () => {
    expect(names()).not.toContain(AGENT_TOOL_NAME)
  })
  test('㉓ 注入 getAllBaseTools 后全量在池（Agent 首位 + 无静默丢失 + 无重名）', () => {
    const pool = getAllBaseTools({ baseTools: getBaseToolEntities(), env: {} })
    const poolNames = pool.map((t) => t.name)
    expect(poolNames[0]).toBe(AGENT_TOOL_NAME)
    for (const t of base) expect(poolNames).toContain(t.name)
    expect(new Set(poolNames).size).toBe(poolNames.length)
  })
})
