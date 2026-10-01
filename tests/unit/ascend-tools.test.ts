/**
 * M3-S3（D-3 Ascend 独立实施波）— 16 工具 engine Tool 契约 + mock call 判别单测
 * （零网络 / 零真实 CANN / 零 PTY）。
 *
 * 覆盖从 AtlasHarness src/tools/ascend/ 移植到 src/ascend/tools/ 的 16 工具：
 *   - 契约符合性：16 工具全具 engine Tool 契约必选成员（shared/types.ts L178）
 *   - ASCEND_TOOLS 注册数组 = 16 且名与 16 常量族对齐（4 业务面）
 *   - 纯计算工具 call（SpecParser / TilingPlanner / Diagnoser / CodeGen 含
 *     reserved-backend 支）
 *   - CANN exec 工具 call（mock 场景经 mock port force → fixture 非重言）
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import {
  ASCEND_TOOLS,
  SpecParser,
  TilingPlanner,
  AscendCodeGen,
  CompilerBridge,
  GoldenTest,
  RealHWBridge,
  Diagnoser,
  FaultCollector,
  ErrorClassifier,
  ProfileAnalyzer,
  BenchmarkRunner,
  ProfileReportParser,
  ModelConverter,
  OnnxOptimizer,
  DataPrepTool,
  InferValidator,
  AscendExecutor,
  DefaultAscendMockPort,
  setAscendExecutor,
  resetAscendExecutorForTests,
  // 16 工具名常量族
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
  type Tool,
} from '../../src/ascend'

const ALL_TOOLS: readonly Tool[] = [
  SpecParser,
  TilingPlanner,
  AscendCodeGen,
  CompilerBridge,
  GoldenTest,
  RealHWBridge,
  Diagnoser,
  FaultCollector,
  ErrorClassifier,
  ProfileAnalyzer,
  BenchmarkRunner,
  ProfileReportParser,
  ModelConverter,
  OnnxOptimizer,
  DataPrepTool,
  InferValidator,
]

const ALL_NAMES = [
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

// engine Tool 契约必选成员（shared/types.ts L178-237，函数/值成员）
const REQUIRED_FNS = [
  'call',
  'description',
  'isConcurrencySafe',
  'isEnabled',
  'isReadOnly',
  'checkPermissions',
  'userFacingName',
  'toAutoClassifierInput',
  'mapToolResultToToolResultBlockParam',
  'renderToolUseMessage',
] as const

describe('M3-S3 ascend 16 工具', () => {
  beforeAll(() => {
    // force mock（ATLAS_ASCEND_MOCK=1 语义）+ happy 场景；隔离惰性实例
    AscendExecutor.setMockPort({
      getAscendMockFlag: () => '1',
      getMockOnNonInteractiveFlag: () => undefined,
      getMockScenario: () => 'happy',
    })
    setAscendExecutor(new AscendExecutor({
      mock: true,
      cannVersion: '8.0.0',
      templateVersion: '8.0.0',
      deviceId: 0,
      timeoutMs: 120_000,
      promptEnabled: true,
    }))
  })
  afterAll(() => {
    AscendExecutor.setMockPort(new DefaultAscendMockPort())
    resetAscendExecutorForTests()
  })

  describe('注册数组 + 契约符合性', () => {
    test('ASCEND_TOOLS = 16 且名对齐 16 常量族', () => {
      expect(ASCEND_TOOLS).toHaveLength(16)
      const names = ASCEND_TOOLS.map(t => t.name)
      for (const n of ALL_NAMES) {
        expect(names).toContain(n)
      }
      // 无重名
      expect(new Set(names).size).toBe(16)
    })

    test('16 工具全具契约必选成员（函数面）', () => {
      for (const tool of ALL_TOOLS) {
        expect(typeof tool.name).toBe('string')
        expect(tool.inputSchema).toBeTypeOf('object')
        expect(tool.maxResultSizeChars).toBeTypeOf('number')
        for (const fn of REQUIRED_FNS) {
          expect(typeof (tool as any)[fn], `tool ${tool.name}.${fn}`).toBe('function')
        }
      }
    })

    test('isReadOnly 分布（纯只读 4 / 其余可写）', () => {
      const readOnly = ALL_TOOLS.filter(t => t.isReadOnly({})).map(t => t.name)
      expect(readOnly).toContain(SPEC_PARSER_TOOL_NAME)
      expect(readOnly).toContain(TILING_PLANNER_TOOL_NAME)
      expect(readOnly).toContain(DIAGNOSER_TOOL_NAME)
      // 写盘 / shelling-out 工具 = 可写
      expect(CompilerBridge.isReadOnly({})).toBe(false)
      expect(AscendCodeGen.isReadOnly({})).toBe(false)
    })
  })

  describe('纯计算工具 call', () => {
    test('SpecParser 内联 spec 解析', async () => {
      const { data } = await SpecParser.call(
        { spec_source: '{"op_name":"gelu","shapes":[1,2,3],"type":"elemwise"}' },
        {},
      )
      expect(data.op_name).toBe('gelu')
      expect(data.parsed_from_file).toBe(false)
      expect(data.shapes).toBe('[1,2,3]')
      expect(data.op_type).toBe('elemwise')
    })

    test('TilingPlanner 策略 → 预置 plans + mocked', async () => {
      const { data } = await TilingPlanner.call(
        { op_spec: 'gelu', strategy: 'latency' },
        {},
      )
      expect(data.strategy).toBe('latency')
      expect(data.plans.length).toBeGreaterThanOrEqual(1)
      expect(data.mocked).toBe(true)
    })

    test('Diagnoser 分类 oom + 候选修复', async () => {
      const { data } = await Diagnoser.call(
        // 注意：log 不得含 'ice'/'device'/'error' 子串（旧仓 ice 检查先于 oom 分支，
        // 'device' 含 'ice' 子串会先命中 compile 支——此为本体逐字行为，测试输入绕开）
        { error_log: 'CANN: out of memory during kernel launch' },
        {},
      )
      expect(data.error_class).toBe('oom')
      expect(data.candidate_fixes.length).toBeGreaterThanOrEqual(1)
    })

    test('AscendCodeGen reserved 后端 → 诚实 not-implemented（不造脚手架）', async () => {
      const { data } = await AscendCodeGen.call(
        { op_spec: '{"op_name":"gelu"}', target: 'tilelang' },
        {},
      )
      expect(data.files).toHaveLength(0)
      expect(data.hints?.[0]).toContain('ascend-c')
      expect(data.mocked).toBe(true)
    })

    test('AscendCodeGen 缺省 ascend-c 后端 → 四件套 manifest（不落盘）', async () => {
      const { data } = await AscendCodeGen.call(
        { op_spec: '{"op_name":"gelu"}' },
        {},
      )
      expect(data.target).toBe('ascend-c')
      expect(data.files.map(f => f.path)).toEqual(
        expect.arrayContaining([
          'csrc/gelu_custom.asc',
          'csrc/pybind11.asc',
          'setup.py',
          'test_gelu.py',
        ]),
      )
      expect(data.project_dir).toBeNull()
      expect(data.entry_kernel).toBe('gelu_custom')
    })
  })

  describe('CANN exec 工具 call（mock fixture 非重言）', () => {
    test('CompilerBridge build happy → exit 0 + bisheng + mocked', async () => {
      const { data } = await CompilerBridge.call(
        { project_dir: '/tmp/gelu' },
        {},
      )
      expect(data.mocked).toBe(true)
      expect(data.success).toBe(true)
      expect(data.exitCode).toBe(0)
      expect(data.stdout).toContain('bisheng')
      expect(data.artifact).toBe('custom_ops_lib.so')
    })

    test('GoldenTest happy → success + 无 diff', async () => {
      const { data } = await GoldenTest.call(
        { test_file: 'test_gelu.py' },
        {},
      )
      expect(data.success).toBe(true)
      expect(data.diff).toBeUndefined()
    })

    test('RealHWBridge info → mock device_info', async () => {
      const { data } = await RealHWBridge.call({ command: 'info' }, {})
      expect(data.mocked).toBe(true)
      expect(data.device_info?.name).toContain('Ascend')
    })

    test('InferValidator run 模式 → msame mock success', async () => {
      const { data } = await InferValidator.call(
        { mode: 'run', om_path: 'm.om', input_path: 'i.bin', output_dir: 'o' },
        {},
      )
      expect(data.mode).toBe('run')
      expect(data.success).toBe(true)
      expect(data.output_dir).toBe('o')
    })
  })

  describe('fold 摘要面（mapToolResultToToolResultBlockParam）', () => {
    test('CompilerBridge fold 含 header + artifact', async () => {
      const { data } = await CompilerBridge.call({ project_dir: '/tmp/gelu' }, {})
      const block = CompilerBridge.mapToolResultToToolResultBlockParam(
        data,
        'tu_1',
      )
      expect(block.type).toBe('tool_result')
      expect(block.tool_use_id).toBe('tu_1')
      expect(String(block.content)).toContain('bisheng compile')
    })

    test('SpecParser mapToolResult JSON 化', () => {
      const block = SpecParser.mapToolResultToToolResultBlockParam(
        { op_name: 'gelu' },
        'tu_2',
      )
      expect(String(block.content)).toContain('gelu')
    })
  })
})
