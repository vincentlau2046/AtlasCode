/**
 * M3-S4（D-3 Ascend 独立实施波）— 5 运行时 skill 内容 + prompt guide 判别单测
 * （零网络 / 零真实 CANN / 零 PTY）。
 *
 * 覆盖从旧仓 src/plugins/ascend/prompt.ts + src/skills/bundled/ascend*.ts
 * 移植到 ascend 域（src/ascend/prompt.ts + src/ascend/skills/）的内容（S5
 * mount 挂载缝；boundaries 约束下 tui 不可 import ascend，故壳侧 tui 保留自
 * 含 base 副本、真去重归 S5 mount 边）：
 *   - guide 内容：16 工具名 + 5 运行时 skill 名 + mock 模式注记
 *   - getAscendSystemPromptSection() = guide（section 门面）
 *   - 5 skill 内容（ASCEND_BUNDLED_SKILLS）：SKILL_MD 三节（Goal/Gates/Tool
 *     catalog）+ 元数据 + 占位符经 AscendExecutor.commands 解析无残留
 */
import { describe, test, expect } from 'bun:test'
import {
  ASCEND_TOOL_USAGE_GUIDE,
  getAscendSystemPromptSection,
  ASCEND_BUNDLED_SKILLS,
  AscendExecutor,
  defaultAscendConfig,
  applyToolchainPlaceholders,
  // 16 工具名常量族（guide 逐一点名）
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

const RUNTIME_SKILLS = [
  'ascend-generate',
  'ascend-validate',
  'ascend-debug',
  'ascend-optimize',
  'ascend-model-adapt',
]

describe('M3-S4 ascend prompt guide', () => {
  test('guide 点名 16 工具 + 5 运行时 skill + mock 注记', () => {
    for (const n of TOOL_NAMES) {
      expect(ASCEND_TOOL_USAGE_GUIDE).toContain(n)
    }
    for (const s of RUNTIME_SKILLS) {
      expect(ASCEND_TOOL_USAGE_GUIDE).toContain(`/${s}`)
    }
    expect(ASCEND_TOOL_USAGE_GUIDE).toContain('mock')
    expect(ASCEND_TOOL_USAGE_GUIDE).toContain('ATLAS_ASCEND_MOCK')
  })

  test('getAscendSystemPromptSection() = guide', () => {
    expect(getAscendSystemPromptSection()).toBe(ASCEND_TOOL_USAGE_GUIDE)
  })
})

describe('M3-S4 ascend 5 运行时 skill 内容', () => {
  test('ASCEND_BUNDLED_SKILLS = 5，名对齐，SKILL_MD 三节齐全 + 元数据', () => {
    expect(ASCEND_BUNDLED_SKILLS).toHaveLength(5)
    expect(ASCEND_BUNDLED_SKILLS.map(s => s.name)).toEqual(RUNTIME_SKILLS)
    for (const s of ASCEND_BUNDLED_SKILLS) {
      expect(s.skillMd).toContain('## Goal')
      expect(s.skillMd).toContain('## Gates')
      expect(s.skillMd).toContain('## Tool catalog')
      expect(s.skillMd).toContain(`name: ${s.name}`)
      expect(s.allowedTools.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(0)
      expect(s.whenToUse.length).toBeGreaterThan(0)
    }
  })

  test('占位符经 AscendExecutor.commands 解析后无残留 {{toolchain.', () => {
    const executor = new AscendExecutor(defaultAscendConfig())
    for (const s of ASCEND_BUNDLED_SKILLS) {
      const resolved = applyToolchainPlaceholders(s.skillMd, executor)
      expect(resolved).not.toContain('{{toolchain.')
      // 每 skill 至少一个占位符被解析（compile→bisheng / profile→msprof …）
      expect(resolved).not.toBe(s.skillMd)
    }
  })
})
