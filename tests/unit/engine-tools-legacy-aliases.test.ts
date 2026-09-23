/**
 * engine/tools LEGACY alias 表 同步钉 + 注册生效 契约测试（E-4 S-4a，§8.32）。
 *
 * 被测能力：
 *   - 同步钉：alias 表 4 项值 === toolNames/agent 单一事实源常量（防漂移：
 *     工具改名扩表须与 toolNames 同步，勿引入字面量——值改错/漂移即红）
 *   - 注册生效：engine 门面 import 触发模块加载注册（side-effect import，
 *     ascendMarketplace 先例）→ permissions 域 parse 归一 legacy 名；
 *     getLegacyToolNames 插入序（旧仓逐字 Object.entries）
 *
 * 运行口径注（同 §8.30 T-6 口径）：标准跑法 bun test --isolate 每文件独立
 * 进程 → 模块加载注册天然生效；本文件 beforeAll 显式重注册
 * （setLegacyToolNameAliases(LEGACY_TOOL_NAME_ALIASES)）防单进程 ad-hoc 连跑
 * 时前序文件（如 permissions parser 测的 beforeEach reset）留下空表态——
 * 显式注册幂等，两口径断言语义一致。
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import {
  LEGACY_TOOL_NAME_ALIASES,
  AGENT_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
  TASK_OUTPUT_TOOL_NAME,
} from '../../src/engine'
import {
  normalizeLegacyToolName,
  getLegacyToolNames,
  permissionRuleValueFromString,
  setLegacyToolNameAliases,
} from '../../src/permissions'

beforeAll(() => {
  // 显式注册（幂等；标准 --isolate 跑法 = 模块加载注册已生效，此行仅
  // 单进程 ad-hoc 连跑防污染，见头注运行口径）
  setLegacyToolNameAliases(LEGACY_TOOL_NAME_ALIASES)
})

describe('同步钉：alias 值 === toolNames 单一事实源（§8.32）', () => {
  test('4 项 legacy → 正规名常量逐一钉（旧仓逐字 4 项）', () => {
    expect(LEGACY_TOOL_NAME_ALIASES.Task).toBe(AGENT_TOOL_NAME)
    expect(LEGACY_TOOL_NAME_ALIASES.KillShell).toBe(TASK_STOP_TOOL_NAME)
    expect(LEGACY_TOOL_NAME_ALIASES.AgentOutputTool).toBe(TASK_OUTPUT_TOOL_NAME)
    expect(LEGACY_TOOL_NAME_ALIASES.BashOutputTool).toBe(TASK_OUTPUT_TOOL_NAME)
    expect(Object.keys(LEGACY_TOOL_NAME_ALIASES)).toHaveLength(4)
  })

  test('正规名值无字面量漂移（全部在 toolNames 常量集）', () => {
    const canonicalSet = new Set([
      AGENT_TOOL_NAME,
      TASK_STOP_TOOL_NAME,
      TASK_OUTPUT_TOOL_NAME,
    ])
    for (const v of Object.values(LEGACY_TOOL_NAME_ALIASES)) {
      expect(canonicalSet.has(v)).toBe(true)
    }
  })
})

describe('注册生效：parse 时归一 legacy 名（§8.32）', () => {
  test('裸 legacy 名归一', () => {
    expect(permissionRuleValueFromString('Task')).toEqual({ toolName: 'Agent' })
    expect(permissionRuleValueFromString('KillShell')).toEqual({
      toolName: 'TaskStop',
    })
  })

  test('legacy 名 + 内容：toolName 归一，内容保留', () => {
    expect(permissionRuleValueFromString('Task(npm i)')).toEqual({
      toolName: 'Agent',
      ruleContent: 'npm i',
    })
  })

  test('getLegacyToolNames 插入序（旧仓逐字 Object.entries）', () => {
    expect(getLegacyToolNames('TaskOutput')).toEqual([
      'AgentOutputTool',
      'BashOutputTool',
    ])
    expect(getLegacyToolNames('TaskStop')).toEqual(['KillShell'])
    expect(getLegacyToolNames('Read')).toEqual([])
  })

  test('非 legacy 名 = identity', () => {
    expect(normalizeLegacyToolName('Bash')).toBe('Bash')
  })
})
