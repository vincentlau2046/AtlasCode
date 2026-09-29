/**
 * GELU L1 liveness probe — fixed-chain check that all 16 Ascend tools are
 * callable in-process (S1 compile chain + S2 correctness chain + S3 fault-
 * triage chain + S4 perf chain + S5 deploy chain). This is NOT an end-to-end
 * validation: the call order is
 * hard-coded and tool outputs are canned in mock mode, so it proves infra
 * liveness only, not functional correctness or agent-driven flow. For true
 * e2e validation, drive the operator through the `ascend-validate` skill
 * (goal + gates + tool catalog) and let the agent pick each step from tool
 * evidence.
 *
 * Run: ATLAS_ASCEND_MODE=1 ATLAS_ASCEND_MOCK=1 bun run src/plugins/ascend/e2e/gelu.ts
 */
import { readFileSync } from 'fs'
import { SpecParser } from '../../../tools/ascend/SpecParser.js'
import { TilingPlanner } from '../../../tools/ascend/TilingPlanner.js'
import { AscendCodeGen } from '../../../tools/ascend/AscendCodeGen.js'
import { CompilerBridge } from '../../../tools/ascend/CompilerBridge.js'
import { GoldenTest } from '../../../tools/ascend/GoldenTest.js'
import { Diagnoser } from '../../../tools/ascend/Diagnoser.js'
import { RealHWBridge } from '../../../tools/ascend/RealHWBridge.js'
import { FaultCollector } from '../../../tools/ascend/FaultCollector.js'
import { ErrorClassifier } from '../../../tools/ascend/ErrorClassifier.js'
import { ProfileAnalyzer } from '../../../tools/ascend/ProfileAnalyzer.js'
import { BenchmarkRunner } from '../../../tools/ascend/BenchmarkRunner.js'
import { ProfileReportParser } from '../../../tools/ascend/ProfileReportParser.js'
import { DataPrepTool } from '../../../tools/ascend/DataPrepTool.js'
import { OnnxOptimizer } from '../../../tools/ascend/OnnxOptimizer.js'
import { ModelConverter } from '../../../tools/ascend/ModelConverter.js'
import { InferValidator } from '../../../tools/ascend/InferValidator.js'

const ctx = { abortController: new AbortController(), options: { isNonInteractiveSession: true } }
const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m', RESET = '\x1b[0m'

async function step(name: string, fn: () => Promise<any>): Promise<any> {
  process.stdout.write(CYAN + '[' + name + ']' + RESET + ' running... ')
  const start = Date.now()
  try {
    const result = await fn()
    const ms = Date.now() - start
    console.log(GREEN + 'OK' + RESET + ' (' + ms + 'ms)')
    return result
  } catch (e: any) {
    console.log(RED + 'FAIL' + RESET + ' ' + (e.message || e))
    throw e
  }
}

export async function main() {
  console.log(CYAN + '=== GELU E2E: S1 (Compile Chain) ===' + RESET)

  // S1.1 — SpecParser
  const specPath = new URL('./gelu-spec.json', import.meta.url).pathname
  const specResult = await step('SpecParser', () =>
    SpecParser.call({ spec_source: specPath }, ctx),
  )
  console.log('  op_name:', (specResult as any).data.op_name)
  console.log('  data_types:', (specResult as any).data.data_types)
  console.log('  parsed_from_file:', (specResult as any).data.parsed_from_file)

  // S1.2 — TilingPlanner
  const tilingResult = await step('TilingPlanner', () =>
    TilingPlanner.call({
      op_spec: (specResult as any).data.op_name,
      shapes: (specResult as any).data.shapes,
      strategy: 'throughput',
    }, ctx),
  )
  const tiling = (tilingResult as any).data
  console.log('  strategy:', tiling.strategy)
  console.log('  plans:', tiling.plans.length, 'configs')
  console.log('  top plan:', tiling.plans[0].blockDim + 'x' + tiling.plans[0].gridDim)

  // S1.3 — AscendCodeGen
  const codegenResult = await step('AscendCodeGen', () =>
    AscendCodeGen.call({
      op_spec: JSON.stringify((specResult as any).data),
      tiling_plan: JSON.stringify(tiling.plans[0]),
      target: 'ascend-c',
    }, ctx),
  )
  const code = (codegenResult as any).data
  console.log('  target:', code.target)
  console.log('  tiling_applied:', code.tiling_applied)
  console.log('  files:', code.files.length, '| entry_kernel:', code.entry_kernel)

  // S1.4 — CompilerBridge (bisheng via setup.py) — mock compile
  const compileResult = await step('CompilerBridge', () =>
    CompilerBridge.call({
      project_dir: code.project_dir || '<in-memory mock>',
      op_name: code.op_name,
    }, ctx),
  )
  const compile = (compileResult as any).data
  console.log('  success:', compile.success)
  console.log('  mocked:', compile.mocked)
  console.log('  artifact:', compile.artifact || '(none)')
  console.log('  durationMs:', compile.durationMs)

  console.log('')
  console.log(CYAN + '=== GELU E2E: S2 (Debug Chain) ===' + RESET)

  // S2.1 — GoldenTest (numpy ref vs NPU) — correctness gate
  const gtResult = await step('GoldenTest', () =>
    GoldenTest.call({
      test_file: `test_${code.op_name}.py`,
      op_name: code.op_name,
    }, ctx),
  )
  const gt = (gtResult as any).data
  console.log('  success:', gt.success)
  console.log('  mocked:', gt.mocked)
  console.log('  durationMs:', gt.durationMs)
  if (gt.diff) console.log('  diff:', gt.diff)

  // S2.2 — Diagnoser (on a simulated error)
  const fakeError = 'Assertion failed: tile_size > 0\n[bisheng] internal compiler error in gemm pass'
  const diagResult = await step('Diagnoser', () =>
    Diagnoser.call({ error_log: fakeError, op_spec: JSON.stringify(specResult) }, ctx),
  )
  const diag = (diagResult as any).data
  console.log('  error_class:', diag.error_class)
  console.log('  summary:', diag.summary)
  console.log('  candidate_fixes:', diag.candidate_fixes.length, 'fixes')
  console.log('  extracted_snippets:', diag.extracted_snippets.length, 'lines')

  // S2.3 — RealHWBridge (npu-smi info) — mock
  const hwResult = await step('RealHWBridge', () =>
    RealHWBridge.call({ command: 'info', device_id: 0 }, ctx),
  )
  const hw = (hwResult as any).data
  console.log('  command:', hw.command)
  console.log('  claimed:', hw.mocked ? '(mock)' : 'REAL HW')
  if (hw.device_info) console.log('  device:', hw.device_info.name, hw.device_info.memory_total_mb + 'MB')

  console.log('')
  console.log(CYAN + '=== GELU E2E: S3 (Fault-Triage Chain) ===' + RESET)

  // S3.1 — FaultCollector (npucollector) — mock collect
  const fcResult = await step('FaultCollector', () =>
    FaultCollector.call({
      task_command: 'sh app_run.sh',
      output_path: '/tmp/mock_fault_scene.tar.gz',
    }, ctx),
  )
  const fc = (fcResult as any).data
  console.log('  success:', fc.success)
  console.log('  mocked:', fc.mocked)
  console.log('  archive:', fc.archive || '(none)')

  // S3.2 — ErrorClassifier (msaicerr) — mock decode
  const ecResult = await step('ErrorClassifier', () =>
    ErrorClassifier.call({
      source: fc.archive || '/tmp/mock_fault_scene.tar.gz',
      mode: 'tar',
    }, ctx),
  )
  const ec = (ecResult as any).data
  console.log('  success:', ec.success)
  console.log('  mocked:', ec.mocked)
  if (ec.error_class) console.log('  error_class:', ec.error_class)

  // S3.3 — ProfileAnalyzer (ada-pa) — mock analyze
  const paResult = await step('ProfileAnalyzer', () =>
    ProfileAnalyzer.call({
      profiling_file: '/tmp/mock_prof_out.txt',
      output_dir: '/tmp/mock_pa_out',
    }, ctx),
  )
  const pa = (paResult as any).data
  console.log('  success:', pa.success)
  console.log('  mocked:', pa.mocked)
  if (pa.trace_path) console.log('  trace:', pa.trace_path)

  console.log('')
  console.log(CYAN + '=== GELU E2E: S4 (Performance Chain) ===' + RESET)

  // S4.1 — BenchmarkRunner (ais-bench, IEEE 2937) — mock benchmark
  const brResult = await step('BenchmarkRunner', () =>
    BenchmarkRunner.call({
      model_path: '/tmp/mock_gelu.om',
      output_dir: '/tmp/mock_bench_out',
      loop: 20,
      warmup_count: 3,
      device_id: 0,
    }, ctx),
  )
  const br = (brResult as any).data
  console.log('  success:', br.success)
  console.log('  mocked:', br.mocked)
  if (br.throughput) console.log('  throughput:', br.throughput.slice(0, 80))
  if (br.summary_path) console.log('  summary:', br.summary_path)

  // S4.2 — ProfileReportParser (msprof --export) — mock parse
  const prpResult = await step('ProfileReportParser', () =>
    ProfileReportParser.call({
      profiling_dir: '/tmp/mock_prof_out',
      mode: 'export',
    }, ctx),
  )
  const prp = (prpResult as any).data
  console.log('  success:', prp.success)
  console.log('  mocked:', prp.mocked)
  if (prp.op_summary_path) console.log('  op_summary:', prp.op_summary_path)
  if (prp.top_ops) console.log('  top_ops:', prp.top_ops.slice(0, 80))

  console.log('')
  console.log(CYAN + '=== GELU E2E: S5 (Deploy Chain) ===' + RESET)

  // S5.1 — DataPrepTool (img2bin) — mock prep images → .bin
  const dpResult = await step('DataPrepTool', () =>
    DataPrepTool.call({
      input_path: '/tmp/mock_images',
      output_dir: '/tmp/mock_bin_out',
      width: 224,
      height: 224,
      color_format: 'BGR',
      layout: 'NCHW',
      data_type: 'float32',
      mean: [104, 117, 123],
      std: [1, 1, 1],
    }, ctx),
  )
  const dp = (dpResult as any).data
  console.log('  success:', dp.success)
  console.log('  mocked:', dp.mocked)
  if (dp.output_dir) console.log('  output_dir:', dp.output_dir)

  // S5.2 — OnnxOptimizer (auto_optimizer) — mock optimize ONNX
  const ooResult = await step('OnnxOptimizer', () =>
    OnnxOptimizer.call({
      input_onnx: '/tmp/mock_model.onnx',
      output_onnx: '/tmp/mock_model_opt.onnx',
      knowledges: ['Conv1d2Conv2d', 'MergeConsecutiveSlice'],
    }, ctx),
  )
  const oo = (ooResult as any).data
  console.log('  success:', oo.success)
  console.log('  mocked:', oo.mocked)
  if (oo.optimized_onnx) console.log('  optimized:', oo.optimized_onnx)

  // S5.3 — ModelConverter (atc) — mock convert ONNX → .om
  const mcResult = await step('ModelConverter', () =>
    ModelConverter.call({
      model_path: '/tmp/mock_model_opt.onnx',
      framework: '5',
      output: '/tmp/mock_model',
      soc_version: 'Ascend910B',
      input_shape: 'actual_input_1:1,3,224,224',
    }, ctx),
  )
  const mc = (mcResult as any).data
  console.log('  success:', mc.success)
  console.log('  mocked:', mc.mocked)
  if (mc.om_path) console.log('  om:', mc.om_path)

  // S5.4 — InferValidator (msame run) — mock run .om on .bin
  const ivRunResult = await step('InferValidator[run]', () =>
    InferValidator.call({
      mode: 'run',
      om_path: mc.om_path || '/tmp/mock_model.om',
      input_path: dp.output_dir || '/tmp/mock_bin_out',
      output_dir: '/tmp/mock_infer_out',
      outfmt: 'TXT',
      loop: 1,
      device: 0,
    }, ctx),
  )
  const ivRun = (ivRunResult as any).data
  console.log('  success:', ivRun.success)
  console.log('  mocked:', ivRun.mocked)
  if (ivRun.output_dir) console.log('  output:', ivRun.output_dir)

  // S5.5 — InferValidator (msquickcmp compare) — mock accuracy compare
  const ivCmpResult = await step('InferValidator[compare]', () =>
    InferValidator.call({
      mode: 'compare',
      original_model: '/tmp/mock_model_opt.onnx',
      om_path: mc.om_path || '/tmp/mock_model.om',
      input_path: dp.output_dir || '/tmp/mock_bin_out',
      output_dir: '/tmp/mock_cmp_out',
    }, ctx),
  )
  const ivCmp = (ivCmpResult as any).data
  console.log('  success:', ivCmp.success)
  console.log('  mocked:', ivCmp.mocked)
  if (ivCmp.accuracy_result) console.log('  accuracy:', ivCmp.accuracy_result.slice(0, 80))

  console.log('')
  console.log(GREEN + '=== GELU E2E: ALL 16 TOOLS PASSED ===' + RESET)
  console.log('S1 pipeline: SpecParser -> TilingPlanner -> AscendCodeGen -> CompilerBridge')
  console.log('S2 pipeline: GoldenTest -> Diagnoser -> RealHWBridge')
  console.log('S3 pipeline: FaultCollector -> ErrorClassifier -> ProfileAnalyzer')
  console.log('S4 pipeline: BenchmarkRunner -> ProfileReportParser')
  console.log('S5 pipeline: DataPrepTool -> OnnxOptimizer -> ModelConverter -> InferValidator[run+compare]')
}

if (import.meta.main) main().catch(e => { console.error(RED + 'E2E FAILED:' + RESET, e); process.exit(1) })