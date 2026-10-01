/**
 * ascend-optimize skill 内容（M3-S4，D-3 Ascend 独立实施波）— 单一事实源。
 *
 * 从旧仓 src/skills/bundled/ascendOptimize.ts 的 SKILL_MD + register 字段逐字
 * 移植。纯数据（无 tui / executor 依赖）：SKILL_MD 保留 {{toolchain.commands.*}}
 * 占位符，由壳侧 src/tui/skills/bundled/ascendOptimize.ts 渲染后注册。
 *
 * NOTE: 旧的 `msoptuner` "CANN tuner" 引用已删 —— msoptuner 在官方 Ascend
 * 仓库零命中（虚构，同早先 msopcom/msdebug）。tiling 搜索 = AscendTilingPlanner；
 * 真机性能 = ais-bench + msprof，两者均为官方验真。
 */
export const ASCEND_OPTIMIZE_SKILL_MD = [
  "---",
  "name: ascend-optimize",
  "description: Optimize Ascend NPU operator/model performance — benchmark throughput, profile, locate the bottleneck op/stage, optimize tiling/kernel, and re-benchmark to prove the gain.",
  "when_to_use: Use when performance is critical or the user asks to optimize/speed up an operator or model on Ascend NPU. You decide the step order and react to evidence; this skill does not prescribe a fixed sequence.",
  "allowed-tools: AscendBenchmarkRunner, AscendRealHWBridge, AscendProfileReportParser, AscendProfileAnalyzer, AscendTilingPlanner, AscendCodeGen, AscendCompilerBridge, AscendGoldenTest",
  "---",
  "# Ascend Performance Optimization",
  "",
  "Improve NPU performance with a measured before/after comparison. You choose which tool to call next based on the previous tool's evidence — there is no fixed step order here.",
  "",
  "## Goal",
  "",
  "Produce a proven performance gain backed by measured evidence:",
  "- **Baseline metric**: a before-optimization throughput/latency number from AscendBenchmarkRunner (or a cycle/profile baseline from msprof).",
  "- **Localized bottleneck**: the op or pipeline stage (compute / copy-in / scalar / mte) that dominates, identified from op_summary_*.csv (msprof) or ada-pa op-stat rankings.",
  "- **Optimization hypothesis**: a concrete change (tiling config, kernel compute rewrite, memory strategy, fusion) tied to the bottleneck evidence.",
  "- **After metric + delta**: a re-measured number showing the gain (or regress) vs the baseline, with the winning config recorded.",
  "",
  "## Gates",
  "",
  "- **Always measure a baseline FIRST** before changing anything — you cannot prove a gain without a before number. Use AscendBenchmarkRunner on a compiled .om (convert via atc/msame first if needed).",
  "- **Profile to locate the bottleneck before optimizing** — do not guess. Capture a msprof dump (AscendRealHWBridge profile) then parse it (AscendProfileReportParser for a msprof binary dump, or AscendProfileAnalyzer for a GE text dump).",
  "- After optimizing, **re-run the SAME benchmark** to get the after metric and compare — a change without a re-measure is not a proven gain.",
  "- If correctness breaks after optimization, AscendGoldenTest is the gate — re-establish correctness before trusting the perf number.",
  "",
  "## Tool catalog",
  "",
  "Pick from these as the evidence demands — the order is yours to decide:",
  "- AscendBenchmarkRunner — benchmark a compiled OM model via ais-bench ({{toolchain.commands.benchmark}}, IEEE 2937): throughput, NPU_compute_time (min/max/mean/median/p99), H2D/D2H latency, *_summary.json. The before/after metric source.",
  "- AscendRealHWBridge — capture a msprof profiling dump (`profile` command, {{toolchain.commands.profile}}) + check device status (`info`). Use to produce the dump that ProfileReportParser parses.",
  "- AscendProfileReportParser — parse a msprof binary dump (PROF_* dir) via `msprof --export=on` ({{toolchain.commands.profile_parse}}) into op_summary_*.csv (per-op time + aiv_vec_ratio/aiv_mte2_ratio pipeline utilization). Use for msprof dumps.",
  "- AscendProfileAnalyzer — parse a GE *text* profiling dump (GE_PROFILING_TO_STD_OUT=1) via ada-pa ({{toolchain.commands.profile_analysis}}) into op-stat rankings. Use for GE text dumps (different input format from msprof). ada-pa ≠ ada.",
  "- AscendTilingPlanner — generate tiling config candidates (throughput/latency/balanced strategies) when the bottleneck is tiling-bound. Returns candidates + rationale, not a single decision.",
  "- AscendCodeGen / AscendCompilerBridge — rewrite the kernel compute body / re-compile via bisheng when the bottleneck is the kernel itself (not tiling).",
  "- AscendGoldenTest — re-verify correctness after an optimization change.",
  "",
  "## Rules",
  "",
  "- **Tools return evidence, not decisions.** AscendTilingPlanner gives candidates; AscendProfileReportParser gives op_summary; YOU decide what to change.",
  "- **Two profiling-dump formats, two parsers**: msprof binary dump → AscendProfileReportParser (`msprof --export`); GE text dump → AscendProfileAnalyzer (ada-pa). Pick by which dump you have.",
  "- The bottleneck-analysis methodology (read op_summary pipeline-utilization ratios → locate the stage) is documented in `triton-ascend/docs/en/debug_guide/profiling.md` \"Locating Bottlenecks\".",
  "- When a tool returns `mocked: true`, treat its output as a liveness signal, not as real throughput/profiling — say so and do not claim a real gain.",
  "- Report at the end: the baseline metric, the bottleneck identified (+ evidence), the optimization made, the after metric, and the delta (gain or regress).",
].join("\n")

export const ASCEND_OPTIMIZE_NAME = "ascend-optimize"
export const ASCEND_OPTIMIZE_DESCRIPTION =
  "Optimize Ascend NPU operator/model performance — benchmark, profile, locate bottleneck, optimize, re-benchmark to prove the gain."
export const ASCEND_OPTIMIZE_WHEN_TO_USE =
  "Use when performance is critical or the user asks to optimize/speed up an operator or model on Ascend NPU. The agent decides step order and reacts to evidence; no fixed sequence."
export const ASCEND_OPTIMIZE_ALLOWED_TOOLS: readonly string[] = [
  "AscendBenchmarkRunner",
  "AscendRealHWBridge",
  "AscendProfileReportParser",
  "AscendProfileAnalyzer",
  "AscendTilingPlanner",
  "AscendCodeGen",
  "AscendCompilerBridge",
  "AscendGoldenTest",
]
