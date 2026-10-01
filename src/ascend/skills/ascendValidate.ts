/**
 * ascend-validate skill 内容（M3-S4，D-3 Ascend 独立实施波）— 单一事实源。
 *
 * 从旧仓 src/skills/bundled/ascendValidate.ts 的 SKILL_MD + register 字段逐字
 * 移植。纯数据（无 tui / executor 依赖）：SKILL_MD 保留 {{toolchain.commands.*}}
 * 占位符，由壳侧 src/tui/skills/bundled/ascendValidate.ts 渲染后注册。
 *
 * NOTE: GOAL + GATES + TOOL CATALOG，不规定步骤顺序；验证流的固定链对照见
 * 旧仓 e2e/gelu.ts（本 skill 是固定链 liveness probe 的决策式对应面）。
 */
export const ASCEND_VALIDATE_SKILL_MD = [
  "---",
  "name: ascend-validate",
  "description: Validate an Ascend NPU operator through the gate (compile -> golden-test -> real-HW), deciding each step from tool evidence.",
  "when_to_use: Use when the user wants to validate or verify an Ascend operator — compile it, golden-test it, and confirm device/profile readiness. You decide the step order and react to failures; this skill does not prescribe a fixed sequence.",
  "allowed-tools: AscendSpecParser, AscendTilingPlanner, AscendCodeGen, AscendCompilerBridge, AscendGoldenTest, AscendRealHWBridge, AscendDiagnoser",
  "---",
  "# Ascend Operator Validation",
  "",
  "Drive an operator through three validation levels. You choose which tool to call next based on the previous tool's evidence — there is no fixed step order here.",
  "",
  "## Goal",
  "",
  "Complete one full pass of three-level validation for the operator:",
  "- **L1 — Compile**: the operator compiles via {{toolchain.commands.compile}} (exit 0, artifact produced).",
  "- **L2 — Golden test**: run AscendGoldenTest (numpy reference vs NPU output, np.allclose). Returns pass/fail + mismatch evidence on real HW, or a mocked liveness signal.",
  "- **L3 — Device / Profile**: confirm device readiness via {{toolchain.commands.info}} (and {{toolchain.commands.profile}} when real-HW profiling is requested).",
  "",
  "## Gates",
  "",
  "- L1 must pass ({{toolchain.commands.compile}} exit 0) before L2 is attempted.",
  "- L2 must return a result before L3 is attempted.",
  "- **On any failure**: call AscendDiagnoser to collect evidence (error class, extracted snippets, candidate fixes), then YOU decide which step to return to. Do not blindly re-run the failing tool.",
  "",
  "## Tool catalog",
  "",
  "Pick from these as the evidence demands — the order is yours to decide:",
  "- AscendSpecParser — normalize an operator spec (file or inline JSON) into name, dtypes, shapes, tiling constraints.",
  "- AscendTilingPlanner — propose tiling configs (block/grid/tile sizes, memory strategy); strategies: throughput / latency / balanced.",
  "- AscendCodeGen — scaffold the four-piece Ascend C project (csrc/*.asc kernel + pybind11.asc + setup.py + test_*.py) from a spec + optional tiling plan; compute body is a placeholder — fill via Read/Edit/Write.",
  "- AscendCompilerBridge — compile the project via bisheng (`python3 setup.py build_ext`, setup.py owns the {{toolchain.commands.compile}} -x asc invocation + arch probe); returns exit code, stdout/stderr, .so artifact path.",
  "- AscendGoldenTest — run a golden-test script (numpy reference vs NPU output, np.allclose); returns pass/fail + mismatch evidence on failure.",
  "- AscendRealHWBridge — real NPU interaction: {{toolchain.commands.info}} (device info), {{toolchain.commands.profile}} (profiling), query.",
  "- AscendDiagnoser — classify compile/runtime errors from bisheng logs or golden-test output and surface candidate fixes; use to gather evidence after a failure.",
  "",
  "## Rules",
  "",
  "- **Failures are decision points, not retries.** Always collect evidence via AscendDiagnoser before deciding the next move.",
  "- You may interrupt, roll back, and re-run any single step (e.g. swap AscendTilingPlanner strategy, regenerate code, re-compile) without restarting the whole pass.",
  "- When a tool returns `mocked: true`, treat its output as a liveness signal, not as proof of real-HW correctness — say so in your report.",
  "- Report at the end: which levels passed, which failed, the evidence behind each decision, and the final artifact / metrics.",
].join("\n")

export const ASCEND_VALIDATE_NAME = "ascend-validate"
export const ASCEND_VALIDATE_DESCRIPTION =
  "Validate an Ascend NPU operator through the gate (compile -> golden-test -> real-HW), deciding each step from tool evidence."
export const ASCEND_VALIDATE_WHEN_TO_USE =
  "Use when the user wants to validate or verify an Ascend operator — compile, golden-test, and confirm device/profile readiness. The agent decides step order and reacts to failures; no fixed sequence."
export const ASCEND_VALIDATE_ALLOWED_TOOLS: readonly string[] = [
  "AscendSpecParser",
  "AscendTilingPlanner",
  "AscendCodeGen",
  "AscendCompilerBridge",
  "AscendGoldenTest",
  "AscendRealHWBridge",
  "AscendDiagnoser",
]
