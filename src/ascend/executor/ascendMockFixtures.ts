/**
 * ascendMockFixtures — fixture-replay data for AscendExecutor.mockExec.
 *
 * M3-S2（D-3 Ascend 独立实施波）：从 AtlasHarness src/core/executor/ascendMockFixtures.ts
 * 逐字移植（自包含，零 import）。scenario-aware fixture replay，keyed by
 * command+arg-shape，让 L2 正确性测非重言（mock 可返回非 0 exit + 真实 stderr）。
 *
 * Replaces the tautological "[mock] cmd args → always exit 0" mock with
 * realistic, scenario-aware fixtures so L2 correctness tests are non-tautological
 * (the mock can now return non-zero exit + realistic stderr, exercising the
 * tools' failure handling and Diagnoser classification).
 *
 * Scope: only the python3-execing paths (CompilerBridge build, GoldenTest test)
 * — these were the tautological ones. RealHWBridge injects its own MOCK_DEVICE /
 * MOCK_PROF after exec, so npu-smi / msprof mocks are unchanged.
 *
 * Keying: <argSig>_<scenario>.
 *   - argSig derived from args[0]: 'setup.py' → 'build'; test_*.py → 'test'.
 *   - For the debug CLIs (msaicerr.py / ada-pa / npucollect.sh) the command
 *     itself is the key (args[0] is a flag, not a script) — see argSigFromArgs.
 *   - scenario from AscendMockPort.getMockScenario() (ATLAS_ASCEND_MOCK_SCENARIO).
 *
 * Fixture content is grounded in op-examples (bisheng flags from setup.py,
 * np.allclose assertion from test_gelu.py) and ascend-official/tools (msaicerr
 * AICore-error decode, npucollector scene collection, ada-pa profiling analysis).
 *
 * Lookup in mockExec: <argSig>_<scenario> → fallback <argSig>_happy → fallback
 * to the legacy [mock] placeholder (for unmapped commands).
 */
export interface MockFixture {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

export const ASCEND_MOCK_FIXTURES: Record<string, MockFixture> = {
  // ── CompilerBridge: python3 setup.py build_ext (bisheng compile) ──────────

  build_happy: {
    exitCode: 0,
    stdout: [
      'running build_ext',
      "building 'op_extension.custom_ops_lib' extension",
      'bisheng -x asc --npu-arch=dav-2201 -shared -fPIC -std=c++17 -D_GLIBCXX_USE_CXX11_ABI=1 -ltorch_npu -ltorch -lc10 csrc/gelu_custom.asc csrc/pybind11.asc -o build/lib/op_extension/custom_ops_lib.so',
      'build_ext finished',
    ].join('\n'),
    stderr: '',
    durationMs: 1200,
  },

  build_oom: {
    exitCode: 1,
    stdout: 'running build_ext\nbisheng -x asc --npu-arch=dav-2201 ...',
    stderr: 'bisheng: error: out of memory (OOM) during compilation of gelu_custom — L1 buffer overflow at tileLength=2048',
    durationMs: 800,
  },

  build_compile_error: {
    exitCode: 1,
    stdout: 'running build_ext',
    stderr: 'csrc/gelu_custom.asc:42:5: error: undefined reference to `AscendC::Erf` — did you include the right header?',
    durationMs: 400,
  },

  // ── GoldenTest: python3 test_<op>.py (numpy ref vs NPU) ───────────────────

  test_happy: {
    exitCode: 0,
    stdout: 'test_gelu_fp16 ... ok\ntest_gelu: PASS',
    stderr: '',
    durationMs: 350,
  },

  test_mismatch: {
    exitCode: 1,
    stdout: 'test_gelu_fp16 ... FAIL',
    stderr: [
      'AssertionError: np.allclose failed',
      'max abs diff: 0.5 (rtol=1e-2, atol=1e-2)',
      'mismatch at index 42: expected 0.8413 got 0.3413',
    ].join('\n'),
    durationMs: 300,
  },

  // ── FaultCollector: npucollect.sh (one-click fault-scene collection) ────────
  // ascend-official/tools/npucollector: collects Host CANN logs, driver logs
  // (root), coredump, Device black-box/Stackcore (root), GE dump graphs, op .o,
  // machine env. Output tar.gz feeds ErrorClassifier (msaicerr).

  npucollect_happy: {
    exitCode: 0,
    stdout: [
      '[npucollector] collecting Host CANN logs ... done',
      '[npucollector] collecting driver logs (root) ... done',
      '[npucollector] collecting coredump ... done',
      '[npucollector] collecting Device black-box / Stackcore (root) ... done',
      '[npucollector] collecting GE dump graphs ... done',
      '[npucollector] collecting operator .o files ... done',
      '[npucollector] collecting machine env info ... done',
      '[npucollector] archive written',
    ].join('\n'),
    stderr: '',
    durationMs: 1500,
  },

  // ── ErrorClassifier: msaicerr.py (AICore error-code decode) ────────────────
  // ascend-official/tools/msaicerr. Scenario-aware so deriveErrorClass() is
  // exercised across every class. NOTE: fixture text is crafted so the PRIMARY
  // keyword for the intended class appears and no higher-precedence keyword
  // (e.g. "AICore error", checked first) leaks into a non-aicore fixture —
  // otherwise deriveErrorClass precedence would mis-classify.

  msaicerr_happy: {
    exitCode: 0,
    stdout: [
      '[msaicerr] decoding AICore error code 0x40000001',
      'AICore error: Synchronized Error (type 0x4)',
      'PC: 0x2a8, CCE: gelu_custom.__vector__+0x40',
      'input bounds [0x1000,0x2000) OK, output bounds [0x3000,0x4000) OK',
      '[msaicerr] report written: info.txt',
    ].join('\n'),
    stderr: '',
    durationMs: 600,
  },

  msaicerr_oom: {
    exitCode: 0,
    stdout: [
      '[msaicerr] decoding error code 0x80000001',
      'result: out of memory (OOM) on L1 buffer during tiling',
      'tile allocation exceeded L1 capacity at tileLength=2048',
    ].join('\n'),
    stderr: '',
    durationMs: 600,
  },

  msaicerr_alignment: {
    exitCode: 0,
    stdout: [
      '[msaicerr] decoding error code 0x40000010',
      'result: addr alignment check failed',
      'input addr 0x1004 not aligned to 32B boundary',
    ].join('\n'),
    stderr: '',
    durationMs: 600,
  },

  msaicerr_runtime: {
    exitCode: 0,
    stdout: [
      '[msaicerr] decoding error code 0x40000020',
      'result: NaN/INF detected in output dump',
      'overflow in gelu_custom at element 42',
    ].join('\n'),
    stderr: '',
    durationMs: 600,
  },

  msaicerr_compile: {
    exitCode: 0,
    stdout: [
      '[msaicerr] decoding error code 0x40000030',
      'result: undefined symbol reference during compile',
      'symbol: AscendC::Erf not found',
    ].join('\n'),
    stderr: '',
    durationMs: 600,
  },

  msaicerr_clean: {
    // No error keyword → deriveErrorClass returns undefined (no class derivable).
    exitCode: 0,
    stdout: '[msaicerr] scene inspected, no findings',
    stderr: '',
    durationMs: 400,
  },

  // ── ProfileAnalyzer: ada-pa (GE profiling-dump analysis) ──────────────────
  // ascend-official/tools/ada pip package (ada-pa console_script — NOT ada,
  // which downloads CANN packages). Parses GE profiling stdout dump into
  // trace.json + summary CSVs + op-stat rankings.

  adapa_happy: {
    exitCode: 0,
    stdout: [
      '[ada-pa] parsing GE profiling dump',
      '[ada-pa] op-stat summary:',
      '  gelu_custom  compute=128us  stall=40us  ratio=31%',
      '  matmul       compute=512us stall=20us  ratio=4%',
      '  bottleneck stage: compute (gelu_custom dominates)',
      '[ada-pa] trace.json written',
      '[ada-pa] summary.csv written',
    ].join('\n'),
    stderr: '',
    durationMs: 900,
  },

  // ── BenchmarkRunner: python3 -m ais_bench (IEEE 2937 inference benchmark) ──
  // ascend-official/tools/ais-bench_workload (ais_bench Python package — module-
  // only, no console_script). Returns NPU_compute_time + throughput.

  bench_happy: {
    exitCode: 0,
    stdout: [
      '[ais_bench] model loaded: gelu.om (device 0)',
      '[ais_bench] warmup 3 iterations ... done',
      '[ais_bench] inference loop 20 iterations ... done',
      'NPU_compute_time (ms): min=0.78 max=0.85 mean=0.81 median=0.80 percentile(99%)=0.84',
      'H2D_latency (ms): mean=0.12',
      'D2H_latency (ms): mean=0.09',
      'throughput: 1234.5 infs, NPU_compute_time mean: 0.81ms',
      '[ais_bench] summary written: gelu_summary.json',
    ].join('\n'),
    stderr: '',
    durationMs: 3000,
  },

  bench_error: {
    exitCode: 1,
    stdout: '[ais_bench] loading model: /bad/path.om',
    stderr: '[ais_bench] error: failed to load model — ACL error 100013 (model file not found / invalid OM)',
    durationMs: 200,
  },

  // ── ProfileReportParser: msprof --export=on (msprof binary-dump parse) ─────
  // CANN binary ($ASCEND_TOOLKIT_HOME/toolkit/tools/profiler/bin/msprof).
  // Parses a PROF_* dump into op_summary_*.csv + trace.json. NOTE: keyed by the
  // --export/--analyze flag so AscendRealHWBridge's msprof *capture* calls
  // (no --export/--analyze) stay on the legacy [mock] placeholder.

  msprof_analyze_happy: {
    exitCode: 0,
    stdout: [
      '[msprof] export=on, output=/tmp/prof_out',
      '[msprof] parsing PROF_0_1_20260918 dump ...',
      'op_summary: gelu_custom,aiv_vec_ratio=0.31,aiv_mte2_time=40us,aiv_scalar_ratio=0.05',
      'op_summary: matmul,aiv_vec_ratio=0.04,aiv_mte2_time=20us,aiv_scalar_ratio=0.01',
      'op_summary: copy_in,aiv_vec_ratio=0.02,aiv_mte2_time=120us,aiv_scalar_ratio=0.0',
      '[msprof] op_summary.csv written',
      '[msprof] trace.json written',
    ].join('\n'),
    stderr: '',
    durationMs: 800,
  },

  // ── ModelConverter: atc (→om compiler, CANN binary) ────────────────────────
  // graphengine/ge/offline/atc. The single →om chokepoint. Framework codes:
  // 0=Caffe/1=AIR/3=TF/5=ONNX.

  atc_happy: {
    exitCode: 0,
    stdout: [
      '[atc] framework=5 (ONNX), soc_version=Ascend910B',
      '[atc] parsing gelu.onnx ...',
      '[atc] graph optimization pass 1/3 ... done',
      '[atc] graph optimization pass 2/3 ... done',
      '[atc] graph optimization pass 3/3 ... done',
      '[atc] compiling to om ... done',
      '[atc] ATC start success, output: /out/gelu.om',
    ].join('\n'),
    stderr: '',
    durationMs: 5000,
  },

  atc_error: {
    exitCode: 1,
    stdout: '[atc] framework=5 (ONNX), parsing gelu.onnx ...',
    stderr: '[atc] error: op CustomOpGelu is not supported on Ascend910B — consider fusing or rewriting the op before conversion (E10001)',
    durationMs: 2000,
  },

  // ── OnnxOptimizer: auto_optimizer optimize (ONNX graph rewrite) ───────────
  // github.com/Ascend/msadvisor/auto-optimizer. Knowledge bases: fusion/split.

  autoopt_happy: {
    exitCode: 0,
    stdout: [
      '[auto_optimizer] optimize gelu.onnx -> gelu_opt.onnx',
      '[auto_optimizer] evaluating knowledge bases ...',
      'apply knowledge: KnowledgeTypeCast (float64 -> float32 for NPU support)',
      'apply knowledge: KnowledgeMergeConsecutiveSlice',
      '[auto_optimizer] 2 knowledges applied, graph rewritten',
      '[auto_optimizer] output: /out/gelu_opt.onnx',
    ].join('\n'),
    stderr: '',
    durationMs: 1200,
  },

  // ── DataPrepTool: img2bin.py (image → bin) ────────────────────────────────
  // ascend-official/tools/img2bin. Preprocesses images for msame/ais_bench input.

  img2bin_happy: {
    exitCode: 0,
    stdout: [
      '[img2bin] input: ./images (8 files)',
      '[img2bin] resize to 416x416, BGR, NHWC, uint8',
      '[img2bin] mean=[104,117,123], std=[1,1,1]',
      '[img2bin] converting 8/8 ... done',
      '[img2bin] output: /out/*.bin (8 files)',
    ].join('\n'),
    stderr: '',
    durationMs: 400,
  },

  // ── InferValidator mode=run: msame (OM inference execution) ───────────────
  // ascend-official/tools/msame (C++ binary). Runs .om on .bin input.

  msame_happy: {
    exitCode: 0,
    stdout: [
      '[msame] model=/out/gelu.om, input=/data/input.bin, outfmt=TXT, loop=1',
      '[msame] device 0, loading om ... done',
      '[msame] inference 1/1 ... done',
      '[msame] output written to /out/',
    ].join('\n'),
    stderr: '',
    durationMs: 800,
  },

  // ── InferValidator mode=compare: msquickcmp (accuracy comparison) ─────────
  // ascend-official/tools/msquickcmp (python3 main.py). Compares original vs om.

  msquickcmp_happy: {
    exitCode: 0,
    stdout: [
      '[msquickcmp] original=gelu.onnx, om=gelu.om, input=input.bin',
      '[msquickcmp] running original model inference ... done',
      '[msquickcmp] running om model inference ... done',
      '[msquickcmp] comparing outputs ...',
      'accuracy: PASS (all layers within tolerance)',
      'max cosine similarity: 0.9998, min: 0.9991',
      '[msquickcmp] report written to /out/',
    ].join('\n'),
    stderr: '',
    durationMs: 2000,
  },

  msquickcmp_mismatch: {
    exitCode: 0,
    stdout: [
      '[msquickcmp] original=gelu.onnx, om=gelu.om, input=input.bin',
      '[msquickcmp] running original model inference ... done',
      '[msquickcmp] running om model inference ... done',
      '[msquickcmp] comparing outputs ...',
      'accuracy: FAIL (layer 3 exceeds tolerance)',
      'max diff: 0.15 at index 42, cosine similarity: 0.82',
      '[msquickcmp] report written to /out/',
    ].join('\n'),
    stderr: '',
    durationMs: 2000,
  },
}

/**
 * Derive the arg-signature key from exec args (+ command).
 * Debug CLIs (msaicerr.py / ada-pa / npucollect.sh): the command itself is the
 * key (args[0] is a flag, not a script). Deploy CLIs (atc / msame /
 * auto_optimizer): keyed by command. python3 paths: 'setup.py' → 'build';
 * a test_*.py script → 'test'; `-m ais_bench` → 'bench'; 'img2bin.py' →
 * 'img2bin'; msquickcmp `main.py` + `-om` flag → 'msquickcmp'. msprof
 * analyze/export keyed by the --export/--analyze flag so RealHWBridge's msprof
 * *capture* calls stay on the legacy placeholder. Else undefined.
 */
export function argSigFromArgs(args: string[], command?: string): string | undefined {
  if (command === 'msaicerr.py') return 'msaicerr'
  if (command === 'ada-pa') return 'adapa'
  if (command === 'npucollect.sh') return 'npucollect'
  if (command === 'atc') return 'atc'
  if (command === 'msame') return 'msame'
  if (command === 'auto_optimizer') return 'autoopt'
  if (command === 'msprof' && args.some(a => a.startsWith('--export') || a.startsWith('--analyze'))) return 'msprof_analyze'
  if (command === 'python3' && args.some(a => a === 'ais_bench')) return 'bench'
  if (command === 'python3' && args[0] === 'img2bin.py') return 'img2bin'
  if (command === 'python3' && args[0] === 'main.py' && args.some(a => a === '-om' || String(a).startsWith('-om='))) return 'msquickcmp'
  const a0 = args[0] || ''
  if (a0 === 'setup.py') return 'build'
  if (/^test_.*\.py$/.test(a0)) return 'test'
  return undefined
}

/**
 * Resolve a fixture for (argSig, scenario) with graceful fallback:
 *   `<argSig>_<scenario>` → `<argSig>_happy` → undefined (legacy placeholder).
 */
export function resolveFixture(argSig: string | undefined, scenario: string): MockFixture | undefined {
  if (!argSig) return undefined
  return ASCEND_MOCK_FIXTURES[`${argSig}_${scenario}`]
    ?? ASCEND_MOCK_FIXTURES[`${argSig}_happy`]
}
