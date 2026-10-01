/**
 * M3-S5（D-3 Ascend 独立实施波）— gelu S5 活性探针：DomainPackage 实挂载 +
 * engine 注册面注入端到端验真。
 *
 * 零网络 / 零真实 CANN / 零 PTY。验 charter Port 3 四元挂载端到端：
 *   - mountDomains() → registerDomainMount(ascendPackage) → getDomainMount() 取回
 *   - 四元形状：tools(16) + skills(5) + systemPromptSection + executor
 *   - engine 注册面：getAllBaseTools({ ascendTools }) 含 16 工具
 *   - kill-switch FEATURE_ASCEND_TOOLS=false 排除
 *   - skill getPromptForCommand 占位符渲染无残留
 *
 * gelu 探针 Heritage：旧仓 src/tui/plugins/ascend/e2e/gelu.ts L1 liveness
 * 调全 16 工具；新仓 S5 探针验 mount → loopDeps → toolRegistry 注入链（engine
 * 路径），实际 16 工具 mock 调用归 func 层。
 */
import { describe, test, expect, afterEach } from 'bun:test'
import { mountDomains } from '../../src/atlascode/mount'
import {
  getDomainMount,
  resetDomainMountForTests,
  getAllBaseTools,
  isAscendToolsEnabled,
  type ToolRegistryDeps,
} from '../../src/engine'
import {
  ascendPackage,
  resetAscendExecutorForTests,
  // 16 工具名常量
  SPEC_PARSER_TOOL_NAME,
  TILING_PLANNER_TOOL_NAME,
  ASCEND_CODEGEN_TOOL_NAME,
  COMPILER_BRIDGE_TOOL_NAME,
  GOLDEN_TEST_TOOL_NAME,
  REAL_HW_BRIDGE_TOOL_NAME,
  DIAGNOSER_TOOL_NAME,
  FAULT_COLLECTOR_TOOL_NAME,
  ERROR_CLASSIFIER_TOOL_NAME,
  PROFILE_ANALYZER_TOOL_NAME,
  BENCHMARK_RUNNER_TOOL_NAME,
  PROFILE_REPORT_PARSER_TOOL_NAME,
  MODEL_CONVERTER_TOOL_NAME,
  ONNX_OPTIMIZER_TOOL_NAME,
  DATA_PREP_TOOL_NAME,
  INFER_VALIDATOR_TOOL_NAME,
} from '../../src/ascend'

const TOOL_NAMES = [
  SPEC_PARSER_TOOL_NAME,
  TILING_PLANNER_TOOL_NAME,
  ASCEND_CODEGEN_TOOL_NAME,
  COMPILER_BRIDGE_TOOL_NAME,
  GOLDEN_TEST_TOOL_NAME,
  REAL_HW_BRIDGE_TOOL_NAME,
  DIAGNOSER_TOOL_NAME,
  FAULT_COLLECTOR_TOOL_NAME,
  ERROR_CLASSIFIER_TOOL_NAME,
  PROFILE_ANALYZER_TOOL_NAME,
  BENCHMARK_RUNNER_TOOL_NAME,
  PROFILE_REPORT_PARSER_TOOL_NAME,
  MODEL_CONVERTER_TOOL_NAME,
  ONNX_OPTIMIZER_TOOL_NAME,
  DATA_PREP_TOOL_NAME,
  INFER_VALIDATOR_TOOL_NAME,
]

const SKILL_NAMES = [
  'ascend-generate',
  'ascend-validate',
  'ascend-debug',
  'ascend-optimize',
  'ascend-model-adapt',
]

afterEach(() => {
  resetDomainMountForTests()
  resetAscendExecutorForTests()
})

describe('M3-S5 gelu 探针：DomainPackage 实挂载 + engine 注入链', () => {
  test('mountDomains() → getDomainMount() 返回四元组', () => {
    expect(getDomainMount()).toBeNull()
    mountDomains()
    const pkg = getDomainMount()
    expect(pkg).not.toBeNull()
    expect(pkg?.id).toBe('ascend')
    expect(pkg).toBe(ascendPackage)
  })

  test('tools 面 = 16 工具，名对齐 16 常量', () => {
    mountDomains()
    const tools = getDomainMount()?.tools ?? []
    expect(tools).toHaveLength(16)
    const names = tools.map(t => t.name)
    for (const n of TOOL_NAMES) {
      expect(names).toContain(n)
    }
  })

  test('skills 面 = 5 skill，名对齐', () => {
    mountDomains()
    const skills = getDomainMount()?.skills ?? []
    expect(skills).toHaveLength(5)
    const names = skills.map(s => s.name)
    for (const s of SKILL_NAMES) {
      expect(names).toContain(s)
    }
  })

  test('systemPromptSection 面 = guide 含 16 工具名 + mock 注记', () => {
    mountDomains()
    const section = getDomainMount()?.systemPromptSection?.() ?? null
    expect(section).not.toBeNull()
    expect(typeof section).toBe('string')
    for (const n of TOOL_NAMES) {
      expect(section).toContain(n)
    }
    expect(section).toContain('ATLAS_ASCEND_MOCK')
  })

  test('executor 面 = NpuToolchain 实例（commands 非空）', () => {
    mountDomains()
    const exec = getDomainMount()?.executor
    expect(exec).toBeDefined()
    expect(exec?.commands).toBeDefined()
    const commandKeys = Object.keys(exec?.commands ?? {})
    expect(commandKeys.length).toBeGreaterThan(0)
  })

  test('skill getPromptForCommand 渲染占位符无 {{toolchain. 残留', async () => {
    mountDomains()
    const skills = getDomainMount()?.skills ?? []
    expect(skills.length).toBeGreaterThan(0)
    for (const s of skills) {
      const blocks = await s.getPromptForCommand('', {})
      const text = blocks
        .map(b => ('text' in b ? (b as { text: string }).text : ''))
        .join('\n')
      expect(text).not.toContain('{{toolchain.')
      expect(text.length).toBeGreaterThan(0)
    }
  })

  test('skill getPromptForCommand 带 args 追加 User Request', async () => {
    mountDomains()
    const skills = getDomainMount()?.skills ?? []
    const first = skills[0]!
    const blocks = await first.getPromptForCommand('test args here', {})
    const text = blocks
      .map(b => ('text' in b ? (b as { text: string }).text : ''))
      .join('\n')
    expect(text).toContain('## User Request')
    expect(text).toContain('test args here')
  })

  test('getAllBaseTools({ ascendTools }) 含 16 ascend 工具', () => {
    mountDomains()
    const deps: ToolRegistryDeps = {
      ascendTools: getDomainMount()?.tools,
    }
    const allTools = getAllBaseTools(deps)
    const names = allTools.map(t => t.name)
    for (const n of TOOL_NAMES) {
      expect(names).toContain(n)
    }
  })

  test('kill-switch FEATURE_ASCEND_TOOLS=false 排除 ascend 工具', () => {
    mountDomains()
    expect(isAscendToolsEnabled({ FEATURE_ASCEND_TOOLS: 'false' } as NodeJS.ProcessEnv)).toBe(false)
    const deps: ToolRegistryDeps = {
      ascendTools: getDomainMount()?.tools,
      env: { FEATURE_ASCEND_TOOLS: 'false' } as NodeJS.ProcessEnv,
    }
    const allTools = getAllBaseTools(deps)
    const names = allTools.map(t => t.name)
    for (const n of TOOL_NAMES) {
      expect(names).not.toContain(n)
    }
  })

  test('未挂载（AtlasOffice 形态）= getAllBaseTools 无 ascend 工具', () => {
    // 不调 mountDomains()
    expect(getDomainMount()).toBeNull()
    const deps: ToolRegistryDeps = {
      ascendTools: getDomainMount()?.tools, // undefined
    }
    const allTools = getAllBaseTools(deps)
    const names = allTools.map(t => t.name)
    for (const n of TOOL_NAMES) {
      expect(names).not.toContain(n)
    }
  })
})
