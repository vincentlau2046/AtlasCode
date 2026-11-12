/**
 * 0.1.98 S1a 硬化波判别格（工单 docs/2026-11-12-p0-wave-0198-s1a-ticket.md，
 * lock-face ①④⑤ 批复形）：
 *
 *   1. ProductDefinition 缺省格 —— id='atlascode' / toolSubset·configDirName 均
 *      undefined（全量装配恒等）/ 解析一次性（getActiveProductDefinition 恒同引用，
 *      模块级冻结）/ Object.isFrozen（消费方不可变改）。
 *   2. toolSubset 过滤格 —— getAllBaseTools 装配层：undefined = 恒等；子集过滤段 =
 *      静态装配面（Agent/base/ascend）；mcpTools 动态面不参 subset（lock-face ④
 *      (c)：defer/ToolSearch 消费 registry 产物，subset 外不可见）。
 *   3. configDir 单源格 —— `function getConfigDirName` 定义点全域恰 1（src/
 *      shared/configDir.ts）；tui 门面 re-export === shared 同一函数引用；步 1
 *      两个 '.atlas' 字面活构造点（cli/debugSink / atlascode/sandboxDeps）自
 *      shared/configDir 消费（grep 面，防字面回归）。
 *
 * I/O 面：3 为只读 src 源码扫描（同 ascend-curation-contract 范型）+ env 注入
 * save/restore；1/2 无盘无网络 → unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getAllBaseTools, AgentTool, AGENT_TOOL_NAME } from '../../src/engine'
import { getActiveProductDefinition } from '../../src/shared/ProductDefinition'
import { getConfigDirName as sharedGetConfigDirName } from '../../src/shared/configDir'
import { getConfigDirName as tuiGetConfigDirName } from '../../src/tui/utils/configDir'
import type { Tool } from '../../src/shared'

const SRC_ROOT = join(import.meta.dir, '..', '..', 'src')

/** fake tool：只填注册表/过滤链消费字段（同 engine-tool-registry 范型）。 */
function makeTool(name: string): Tool {
  return {
    name,
    isEnabled: () => true,
  } as unknown as Tool
}

describe('ProductDefinition 缺省格（lock-face ①）', () => {
  test('① atlascode 缺省：id 固定 + 两维度均 undefined（全量恒等）', () => {
    const def = getActiveProductDefinition()
    expect(def.id).toBe('atlascode')
    expect(def.toolSubset).toBeUndefined()
    expect(def.configDirName).toBeUndefined()
  })
  test('② 解析一次性：恒同引用 + 冻结（消费方读引用不重解析）', () => {
    expect(getActiveProductDefinition()).toBe(getActiveProductDefinition())
    expect(Object.isFrozen(getActiveProductDefinition())).toBe(true)
  })
})

describe('toolSubset 过滤格（lock-face ④：getAllBaseTools 装配层）', () => {
  const baseRead = makeTool('Read')
  const baseEdit = makeTool('Edit')
  const mcpA = makeTool('mcp__srv__a')
  const ascendT = makeTool('AscendSpecParser')

  test('① productToolSubset undefined = 全量装配恒等（atlascode 零变更）', () => {
    const pool = getAllBaseTools({
      baseTools: [baseRead, baseEdit],
      ascendTools: [ascendT],
      mcpTools: [mcpA],
      env: { FEATURE_ASCEND_TOOLS: 'true' } as NodeJS.ProcessEnv,
    })
    expect(pool.map((t) => t.name)).toEqual([
      AGENT_TOOL_NAME,
      'Read',
      'Edit',
      'AscendSpecParser',
      'mcp__srv__a',
    ])
  })
  test('② 子集过滤静态段：Agent 内建 + baseTools 皆参过滤，subset 外剔除', () => {
    const pool = getAllBaseTools({
      baseTools: [baseRead, baseEdit],
      productToolSubset: [AGENT_TOOL_NAME, 'Edit'],
    })
    expect(pool.map((t) => t.name)).toEqual([AGENT_TOOL_NAME, 'Edit'])
  })
  test('③ mcpTools 动态面不参 subset（subset 外 MCP 工具仍装配）', () => {
    const pool = getAllBaseTools({
      baseTools: [baseRead],
      mcpTools: [mcpA],
      productToolSubset: [AGENT_TOOL_NAME],
    })
    expect(pool.map((t) => t.name)).toEqual([AGENT_TOOL_NAME, 'mcp__srv__a'])
  })
  test('④ ascend 段同在过滤段内（门控开后 subset 外仍剔除）', () => {
    const pool = getAllBaseTools({
      baseTools: [baseRead],
      ascendTools: [ascendT],
      mcpTools: [mcpA],
      env: { FEATURE_ASCEND_TOOLS: 'true' } as NodeJS.ProcessEnv,
      productToolSubset: [AGENT_TOOL_NAME, 'mcp__srv__a'],
    })
    expect(pool.map((t) => t.name)).toEqual([AGENT_TOOL_NAME, 'mcp__srv__a'])
  })
})

describe('configDir 单源格（lock-face ⑤ 步 1 归一形）', () => {
  /** src 递归 .ts 文件只读收集（同 ascend-curation-contract 范型）。 */
  function collectSrcTsFiles(): string[] {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.ts')) out.push(p)
      }
    }
    walk(SRC_ROOT)
    return out
  }

  test('① `function getConfigDirName` 定义点全域恰 1（src/shared/configDir.ts）', () => {
    const hits = collectSrcTsFiles()
      .map((f) => ({ f, s: readFileSync(f, 'utf8') }))
      .filter(({ s }) => s.includes('function getConfigDirName'))
    expect(hits).toHaveLength(1)
    expect(hits[0]!.f).toBe(join(SRC_ROOT, 'shared', 'configDir.ts'))
  })
  test('② tui 门面 re-export === shared 同一函数引用（零 diff 消费）', () => {
    expect(tuiGetConfigDirName).toBe(sharedGetConfigDirName)
  })
  test("③ 缺省恒 '.atlas' + ATLAS_CONFIG_DIR_NAME 显式覆盖（env 优先序 knob）", () => {
    const prev = process.env.ATLAS_CONFIG_DIR_NAME
    try {
      delete process.env.ATLAS_CONFIG_DIR_NAME
      expect(sharedGetConfigDirName()).toBe('.atlas')
      process.env.ATLAS_CONFIG_DIR_NAME = 'custom-dir'
      expect(sharedGetConfigDirName()).toBe('custom-dir')
    } finally {
      if (prev === undefined) delete process.env.ATLAS_CONFIG_DIR_NAME
      else process.env.ATLAS_CONFIG_DIR_NAME = prev
    }
  })
  test('④ 步 1 两个字面活构造点自 shared 门面消费（STR-1 entry-point 收口）', () => {
    const debugSink = readFileSync(
      join(SRC_ROOT, 'cli', 'debugSink.ts'),
      'utf8',
    )
    expect(debugSink).toContain(
      "getConfigDirName, isEnvTruthy, setDebugSink } from 'src/shared'",
    )
    const sandboxDeps = readFileSync(
      join(SRC_ROOT, 'atlascode', 'sandboxDeps.ts'),
      'utf8',
    )
    expect(sandboxDeps).toContain("getConfigDirName } from '../shared'")
  })
})
