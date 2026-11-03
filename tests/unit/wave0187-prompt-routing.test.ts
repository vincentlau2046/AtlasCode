/**
 * 0.1.87 任务 B — 系统提示词分组衔接判别单测（工单
 * docs/2026-11-02-p0-wave-0187-ticket.md §1.B）。
 *
 * 修前红：总纲分组（### Umbrella skills — domain routing）+ L16 计数 11→14
 * 修前缺席 → 契约断言红于正确判别点；既有行逐字节锚（fixture 取自基线
 * 361cc43 的 ASCEND_TOOL_USAGE_GUIDE）修前即绿（回归锚）。
 *
 * 契约面（工单 §1.B 判别 + Review Focus 2）：
 *  ① 分组在场：'### Umbrella skills — domain routing' + 三总纲行
 *     （- /ascend-doctor — / - /ascend-optimism — / - /ascend-opdev —）
 *  ② 既有 16 工具行逐字节零 diff（基线 fixture 锚）
 *  ③ 既有 11 skill 行逐字节零 diff（Global Constraints：逐字不变）
 *  ④ L16 单列例外：仅计数 11→14（= 11 + ASCEND_UMBRELLA_SKILLS.length 推导），
 *     行余逐字节同
 *  ⑤ 分组行由任务 A 路由表渲染生成（renderUmbrellaPromptLine(聚合条目) 直证，
 *     无手抄漂移、顺序 = 聚合序）
 *  ⑥ ≤40 词/行（listing/prompt 双面预算，Review Focus 2）
 *  ⑦ 位置：分组在 11 skill 行之后、mock 模式注记行之前；mock 注记行仍在末位
 *  ⑧ token 面 proxy：全 guide 字符增量 ≤ +620（≈ +150 tokens 上限，e2e gate ④
 *     复测真 token，超帽打回）
 *  ⑨ 壳副本（src/tui/plugins/ascend/prompt.ts，TUI 道）与域 guide 字节全等
 *     （boundaries 约束 tui 不可 import ascend → 自含镜像；锁防漂移）
 *
 * 分层纪律：纯逻辑（无网络 / 无 PTY / 无 LLM / 无真实 HOME）→ unit。
 */
import { describe, expect, test } from 'bun:test'

// ---------------------------------------------------------------------------
// 基线 fixture（361cc43 的 ASCEND_TOOL_USAGE_GUIDE 逐行快照——生成器从基线模块
// 提取，提交后即冻结；任何对既有行的意外改动在此变红）
// ---------------------------------------------------------------------------
const BASELINE_GUIDE_LINES = [
  "## Ascend NPU Operator Tools (Huawei CANN 8.x)",
  "",
  "You have 16 tools and 11 skills for Ascend NPU operator development, fault triage, performance optimization, inference deployment, and precision debugging. Use them when the user asks to develop, compile, debug, profile, benchmark, optimize, convert, deploy, or debug the precision of a model/operator on Huawei Ascend hardware.",
  "",
  "### Tools — when to use each",
  "- AscendSpecParser — parse an operator spec (file or inline JSON) to extract name, dtypes, tensor shapes, and tiling constraints. Use when the user provides a spec file or asks you to understand an operator definition.",
  "- AscendTilingPlanner — generate tiling configs (blockDim/gridDim/tile sizes/memory strategy). Strategies: throughput, latency, balanced. Use after parsing a spec when the user asks about tiling or performance planning.",
  "- AscendCodeGen — scaffold a four-piece Ascend C operator project (csrc/*.asc kernel + pybind11.asc binding + setup.py + test_*.py golden test), structurally derived from op-examples. Provide an output_dir to write the project. The kernel compute body and numpy reference are PLACEHOLDERS — fill them via Read/Edit/Write before compiling.",
  "- AscendCompilerBridge — compile an operator project via bisheng. The entrypoint is `python3 setup.py build_ext` (setup.py owns the bisheng -x asc invocation, npu-smi arch probe, torch ABI detection, and include/lib paths — the faithful form per op-examples). Provide the project_dir from AscendCodeGen. Returns exit code, stdout/stderr, and the compiled .so artifact path on success.",
  "- AscendGoldenTest — run a golden-test script (numpy reference implementation vs NPU operator output, asserted via np.allclose). Provide the test script path. Returns pass/fail and mismatch evidence on failure. This is the correctness gate. In mock mode it returns a liveness signal only — do not claim correctness from a mocked result.",
  "- AscendRealHWBridge — interact with real NPU hardware. Commands: info (npu-smi device info), profile (msprof profiling), query (npu-smi query). Use when the user needs NPU device status or performance profiling data.",
  "- AscendDiagnoser — classify compile/runtime errors from bisheng logs or golden-test output (crash, OOM, alignment, missing symbol) and surface candidate fixes. Use after CompilerBridge or GoldenTest returns an error.",
  "- AscendFaultCollector — collect a fault scene in one shot via npucollector (CANN/driver logs, coredump, GE dump graphs, op .o files, machine env). Provide the fault-time task command and an output .tar.gz path. The archive feeds AscendErrorClassifier. Some modules need root. Use when a fault occurred and you need the full scene.",
  "- AscendErrorClassifier — decode AICore error codes from a collected fault scene via msaicerr (consumes the AscendFaultCollector tar.gz). Returns the decoded error code + bits, PC/CCE line, addr bounds, and a coarse error class. Use after AscendFaultCollector when AICore errors are suspected.",
  "- AscendProfileAnalyzer — analyze a GE profiling dump via ada-pa (NOT ada — ada downloads CANN packages). Parses a GE profiling stdout dump (GE_PROFILING_TO_STD_OUT=1) into trace.json + op-stat rankings. Use to locate the bottleneck op/stage from a GE text profiling dump.",
  "- AscendBenchmarkRunner — benchmark a compiled OM model via ais-bench (IEEE 2937 / T/CESA 1169-2021 standardized inference perf test, `python3 -m ais_bench`). Returns NPU_compute_time (min/max/mean/median/p99), H2D/D2H latency, throughput, and a *_summary.json. Use to measure before/after throughput when optimizing. In mock mode returns a liveness signal only.",
  "- AscendProfileReportParser — parse a CANN/msprof binary profiling dump (a PROF_* dir from AscendRealHWBridge profile) via `msprof --export=on` into op_summary_*.csv (per-op time + pipeline-utilization ratios). Use to locate the bottleneck op from a msprof dump — distinct from AscendProfileAnalyzer (which handles GE text dumps).",
  "- AscendModelConverter — convert a model (ONNX / TensorFlow pb / Caffe / MindSpore AIR) → Ascend offline .om via `atc` (the CANN compiler chokepoint). Provide model path, framework code (0=Caffe/1=AIR/3=TF/5=ONNX), output path, soc_version, input_shape. atc does NOT do pytorch→onnx — convert via torch.onnx.export first. Use when deploying a model to NPU.",
  "- AscendOnnxOptimizer — optimize an ONNX graph for the NPU support set via `auto_optimizer optimize` (op fusion/split/rewrite knowledge bases). Run BEFORE AscendModelConverter (atc) to adapt the ONNX, then compile →om. Use when a model has ops unsupported on NPU.",
  "- AscendDataPrepTool — prepare inference input data (images → .bin) via `img2bin.py` (resize, mean subtraction, color/format conversion). Produces .bin files that AscendInferValidator / AscendBenchmarkRunner consume. Use before running inference.",
  "- AscendInferValidator — validate a compiled .om model: mode 'run' executes the om on .bin input via `msame` (proves it runs + produces output); mode 'compare' compares original-model vs om accuracy via `msquickcmp` (proves accuracy after atc conversion). Use to validate a deployed model.",
  "",
  "### Skills — invoke via /skill-name",
  "- /ascend-generate — end-to-end operator generation: spec -> parse -> tiling -> codegen -> compile. Use when the user asks to create or generate a new Ascend operator.",
  "- /ascend-debug — triage a fault: collect the scene -> decode AICore errors -> diagnose -> locate the root-cause evidence. Goal + gates + tool catalog; YOU decide the step order. Use when a fault/crash/hang occurs or compile/golden-test fails and the user needs help locating the cause.",
  "- /ascend-optimize — optimize operator/model performance: benchmark baseline -> profile (msprof) -> locate bottleneck (op_summary / ada-pa) -> optimize tiling/kernel -> re-benchmark compare. Goal + gates + tool catalog; YOU decide the step order. Use when performance is critical or the user asks for optimization.",
  "- /ascend-model-adapt — deploy a model to NPU: prepare data -> optimize ONNX -> convert via atc -> validate (run + accuracy compare). Goal + gates + tool catalog; YOU decide the step order. Use when the user wants to deploy/port a model to Ascend for inference.",
  "- /ascend-validate — validate an operator through the gate (compile -> golden-test -> real-HW). Goal + gates + tool catalog only; YOU decide the step order from each tool's evidence and route failures through AscendDiagnoser. Use when the user wants to validate or verify an operator.",
  "- /ascend-tiling-design — design a tiling plan for an Ascend C operator (multi-core split / UB tiling / buffer planning / branch coverage four-element methodology + 9 algorithm categories + AISS solver pointer). Reads verified methodology references on demand (progressive disclosure). Goal + gates + tool catalog; YOU decide the step order. Use when the user asks to design or plan tiling for an operator.",
  "- /ascend-precision-debug — locate a precision root cause: model-level (msprobe PrecisionDebugger / L0-L1 dump / ATB dump / compare) vs operator-level (DumpTensor 7-step / PyPTO binary search / golden) two-level methodology + precision standard (MERE/MARE thresholds) + decision tree. Reads verified references on demand. Goal + gates + tool catalog; YOU decide the step order. Use when the user reports a precision problem (training loss NaN/spike/misalignment, inference garbled/repeat, single-op golden fail, FP32-pass-FP16-fail).",
  "- /ascend-runtime-debug — locate a runtime fault root cause: error-code taxonomy (aclnn 161xxx/361xxx/561xxx/507035 + 507035 root-cause tiers) + plog parsing + crash/hang/mssanitizer triage (coredump/gdb/Buffer deadlock) + kernel-binary/SEL build debug. Reads verified references on demand. Goal + gates + tool catalog; YOU decide the step order. Use when the user reports a runtime fault (aclnn non-zero error code, program hangs/crashes/times out, intermittent crash/memory corruption, Kernel-lookup/binary-build error).",
  "- /ascend-perf-optimize — optimize operator/model performance: three-layer pipeline (card/inter-core/intra-core) + four-step flow + msprof collection (7 aic-metrics) + 10 bound types (VEC/MTE2/CUBE/SCALAR/inter-core/Bank Conflict/DoubleBuffer/pipeline bubble/L2 Cache/cross-correlation) + tiling recorrection. Reads verified references on demand. Goal + gates + tool catalog; YOU decide the step order. Use when the user asks to optimize performance, locate a bottleneck, or interpret msprof profiling data.",
  "- /ascend-code-review — review/audit Ascend C operator code: hypothesis-testing methodology (5-step evidence scoring + confidence HIGH/MED/LOW) + 5 workflow routing (file/quick/pr/design-consistency/extend) + red-lines (Host 6 + Kernel SIMT 5) + PR cross-validation + fix routing to AscendCodeGen. Reads verified references on demand. Goal + gates + tool catalog; YOU decide the step order. Use when the user asks to review code, audit a PR, or check design-implementation consistency.",
  "- /ascend-test-design — design tests for an Ascend operator: four test types (ST aclnn L0/L1/L2 / UT opapi-ophost-opkernel coverage / whitebox path+TilingKey / golden correctness gate) + ST 9-step + UT Step 1-5 + whitebox 6+TTK + strategy decision tree + AscendGoldenTest correctness gate. Reads verified references on demand. Goal + gates + tool catalog; YOU decide the step order. Use when the user asks to design tests, design test cases, or verify operator correctness.",
  "",
  "Tools run in mock mode when no real NPU is attached (mocked: true in output). Set ATLAS_ASCEND_MOCK=0 to use real hardware.",
] as const

const BASELINE_GUIDE_LENGTH = 9504

const BASELINE_COUNT_LINE = BASELINE_GUIDE_LINES[2]
const BASELINE_MOCK_LINE = BASELINE_GUIDE_LINES[BASELINE_GUIDE_LINES.length - 1]

// ---------------------------------------------------------------------------
// 动态 import（absent-export 惯例沿用任务 A）
// ---------------------------------------------------------------------------
const ascend = (await import('../../src/ascend/index.js').catch(() => ({}))) as {
  ASCEND_TOOL_USAGE_GUIDE?: string
  ASCEND_UMBRELLA_SKILLS?: readonly {
    name: string
    enterWhen: string
    routesSummary: string
  }[]
  renderUmbrellaPromptLine?: (def: {
    name: string
    enterWhen: string
    routesSummary: string
  }) => string
}

const shellPrompt = (await import(
  '../../src/tui/plugins/ascend/prompt.js'
).catch(() => ({}))) as {
  ASCEND_TOOL_USAGE_GUIDE?: string
}

const UMBRELLA_HEADER = '### Umbrella skills — domain routing'
const UMBRELLA_NAMES = ['ascend-doctor', 'ascend-optimism', 'ascend-opdev'] as const

function regions(g: string) {
  const lines = g.split('\n')
  const toolsIdx = lines.indexOf('### Tools — when to use each')
  const skillsIdx = lines.indexOf('### Skills — invoke via /skill-name')
  const mockIdx = lines.indexOf(BASELINE_MOCK_LINE)
  return { lines, toolsIdx, skillsIdx, mockIdx }
}

describe('0.1.87 任务 B：系统提示词分组衔接', () => {
  test('① 总纲分组在场 + 三总纲行', () => {
    const g = ascend.ASCEND_TOOL_USAGE_GUIDE
    expect(g).toBeDefined()
    const { lines } = regions(g!)
    expect(lines).toContain(UMBRELLA_HEADER)
    for (const name of UMBRELLA_NAMES) {
      expect(lines.some(l => l.startsWith('- /' + name + ' — '))).toBe(true)
    }
  })

  test('② 既有 16 工具行逐字节零 diff', () => {
    const g = ascend.ASCEND_TOOL_USAGE_GUIDE!
    const { lines, toolsIdx, skillsIdx } = regions(g)
    const baselineTools = BASELINE_GUIDE_LINES.slice(
      BASELINE_GUIDE_LINES.indexOf('### Tools — when to use each') + 1,
      BASELINE_GUIDE_LINES.indexOf('### Skills — invoke via /skill-name') - 1,
    )
    // 现行工具区 = tools 标题后到 skills 标题前（隔一个空行）
    const currentTools = lines.slice(toolsIdx + 1, skillsIdx - 1)
    expect(currentTools).toEqual(baselineTools as unknown as string[])
    expect(currentTools.length).toBe(16)
  })

  test('③ 既有 11 skill 行逐字节零 diff', () => {
    const g = ascend.ASCEND_TOOL_USAGE_GUIDE!
    const { lines, skillsIdx, mockIdx } = regions(g)
    const baselineSkills = BASELINE_GUIDE_LINES.slice(
      BASELINE_GUIDE_LINES.indexOf('### Skills — invoke via /skill-name') + 1,
      BASELINE_GUIDE_LINES.length - 2,
    )
    // 现行 skill 区 = skills 标题后到 mock 注记前（含分组前的空行边界之外）
    const currentSkills = lines.slice(skillsIdx + 1, lines.indexOf('', skillsIdx + 1))
    expect(currentSkills).toEqual(baselineSkills as unknown as string[])
    expect(currentSkills.length).toBe(11)
  })

  test('④ L16 单列例外：仅计数 11→14（11 + 聚合长度推导），行余逐字节同', () => {
    const g = ascend.ASCEND_TOOL_USAGE_GUIDE!
    const { lines } = regions(g)
    const umbrellaCount = ascend.ASCEND_UMBRELLA_SKILLS?.length ?? 3
    const expected = BASELINE_COUNT_LINE.replace(
      '11 skills',
      String(11 + umbrellaCount) + ' skills',
    )
    expect(lines[2]).toBe(expected)
    expect(lines[2]).not.toBe(BASELINE_COUNT_LINE) // 计数确实变了
  })

  test('⑤ 分组行由任务 A 路由表渲染生成（无手抄漂移、顺序 = 聚合序）', () => {
    const g = ascend.ASCEND_TOOL_USAGE_GUIDE!
    const { lines } = regions(g)
    const render = ascend.renderUmbrellaPromptLine
    expect(render).toBeDefined()
    const defs = ascend.ASCEND_UMBRELLA_SKILLS
    expect(defs).toBeDefined()
    expect(defs!.length).toBe(3)
    const headerIdx = lines.indexOf(UMBRELLA_HEADER)
    const rendered = defs!.map(d => render!(d))
    expect(lines.slice(headerIdx + 1, headerIdx + 4)).toEqual(rendered)
    // 行名与聚合序一致（doctor → optimism → opdev）
    rendered.forEach((line, i) => {
      expect(line.startsWith('- /' + UMBRELLA_NAMES[i] + ' — ')).toBe(true)
    })
  })

  test('⑥ 分组行 ≤40 词/行（Review Focus 2 预算）', () => {
    const g = ascend.ASCEND_TOOL_USAGE_GUIDE!
    const { lines } = regions(g)
    const headerIdx = lines.indexOf(UMBRELLA_HEADER)
    for (const line of lines.slice(headerIdx + 1, headerIdx + 4)) {
      const words = line.trim().split(/\s+/).length
      expect(words).toBeLessThanOrEqual(40)
    }
  })

  test('⑦ 位置：分组在 skill 区后、mock 注记前；mock 注记仍在末位', () => {
    const g = ascend.ASCEND_TOOL_USAGE_GUIDE!
    const { lines, skillsIdx, mockIdx } = regions(g)
    const headerIdx = lines.indexOf(UMBRELLA_HEADER)
    expect(headerIdx).toBeGreaterThan(skillsIdx)
    expect(headerIdx).toBeLessThan(mockIdx)
    expect(lines[lines.length - 1]).toBe(BASELINE_MOCK_LINE)
  })

  test('⑧ token 面 proxy：全 guide 字符增量 ≤ +620（≈ +150 tokens）', () => {
    const g = ascend.ASCEND_TOOL_USAGE_GUIDE!
    expect(g.length - BASELINE_GUIDE_LENGTH).toBeLessThanOrEqual(620)
    expect(g.length).toBeGreaterThan(BASELINE_GUIDE_LENGTH) // 确有新增
  })

  test('⑨ 壳副本与域 guide 字节全等（TUI 道镜像锁）', () => {
    expect(shellPrompt.ASCEND_TOOL_USAGE_GUIDE).toBeDefined()
    expect(shellPrompt.ASCEND_TOOL_USAGE_GUIDE).toBe(ascend.ASCEND_TOOL_USAGE_GUIDE)
  })
})
