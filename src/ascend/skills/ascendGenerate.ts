/**
 * ascend-generate skill 内容（M3-S4，D-3 Ascend 独立实施波）— 单一事实源。
 *
 * 从旧仓 src/skills/bundled/ascendGenerate.ts 的 SKILL_MD + register 字段逐字
 * 移植。纯数据（无 tui / executor 依赖）：SKILL_MD 保留 {{toolchain.commands.*}}
 * 占位符，由壳侧 src/tui/skills/bundled/ascendGenerate.ts 经
 * applyToolchainPlaceholders 渲染后 registerBundledSkill（壳→域，正确方向）。
 *
 * NOTE: 本 skill 刻意写成 GOAL + GATES + TOOL CATALOG，不规定 `## Steps` 调用
 * 顺序 —— 模型从上一步工具证据选下一个工具（coding-agent contract）。
 */
export const ASCEND_GENERATE_SKILL_MD = [
  "---",
  "name: ascend-generate",
  "description: Generate an Ascend NPU operator end-to-end from a spec — scaffold the four-piece project, fill the compute body, and compile it via bisheng.",
  "when_to_use: Use when the user wants to create or generate an Ascend operator from a spec or description. You decide the step order and react to failures; this skill does not prescribe a fixed sequence.",
  "allowed-tools: AscendSpecParser, AscendTilingPlanner, AscendCodeGen, AscendCompilerBridge, AscendDiagnoser",
  "---",
  "# Ascend Operator Generation",
  "",
  "Turn an operator spec into a compiled NPU operator (.so). You choose which tool to call next based on the previous tool's evidence — there is no fixed step order here.",
  "",
  "## Goal",
  "",
  "Produce a compiled Ascend C operator project that the agent has scaffolded, filled with a real compute body, and compiled via {{toolchain.commands.compile}}:",
  "- A four-piece project on disk (csrc/<op>.asc kernel + csrc/pybind11.asc binding + setup.py + test_<op>.py golden test), produced by AscendCodeGen.",
  "- The kernel compute body and numpy reference formula filled in (via Read/Edit/Write) — AscendCodeGen emits a PLACEHOLDER scaffold, not a correct kernel.",
  "- A successful compile (AscendCompilerBridge exit 0, .so artifact produced).",
  "",
  "## Gates",
  "",
  "- AscendCodeGen's output is a scaffold with a placeholder compute body — do NOT compile until you have filled the Compute() body and the numpy reference via Read/Edit/Write.",
  "- AscendCompilerBridge must return exit 0 (and an artifact path) before the operator is considered generated.",
  "- **On compile failure**: call AscendDiagnoser to collect evidence (error class, extracted snippets, candidate fixes), then YOU decide which step to return to (re-scaffold, fix the compute body, adjust tiling). Do not blindly re-compile.",
  "",
  "## Tool catalog",
  "",
  "Pick from these as the evidence demands — the order is yours to decide:",
  "- AscendSpecParser — normalize an operator spec (file or inline JSON) into name, dtypes, shapes, tiling constraints.",
  "- AscendTilingPlanner — propose tiling configs (block/grid/tile sizes, memory strategy); strategies: throughput / latency / balanced.",
  "- AscendCodeGen — scaffold the four-piece Ascend C project (csrc/*.asc kernel + pybind11.asc + setup.py + test_*.py) from a spec + optional tiling plan; compute body is a placeholder — fill via Read/Edit/Write.",
  "- AscendCompilerBridge — compile the project via bisheng (`python3 setup.py build_ext`, setup.py owns the {{toolchain.commands.compile}} -x asc invocation + arch probe); returns exit code, stdout/stderr, .so artifact path.",
  "- AscendDiagnoser — classify compile/runtime errors from bisheng logs and surface candidate fixes; use to gather evidence after a failure.",
  "",
  "## Rules",
  "",
  "- **The scaffold is a template, not a solution.** AscendCodeGen returns `mocked: true` precisely because the compute body is a placeholder — you must fill it before compiling.",
  "- **Failures are decision points, not retries.** Always collect evidence via AscendDiagnoser before deciding the next move.",
  "- You may interrupt, roll back, and re-run any single step (e.g. swap AscendTilingPlanner strategy, re-scaffold, edit the compute body) without restarting the whole pass.",
  "- When a tool returns `mocked: true`, treat its output as a liveness signal, not as proof of real-HW correctness — say so in your report.",
  "- Report at the end: the project directory, the entry kernel name, the compiled artifact path, and which gates passed.",
].join("\n")

export const ASCEND_GENERATE_NAME = "ascend-generate"
export const ASCEND_GENERATE_DESCRIPTION =
  "Generate an Ascend NPU operator end-to-end from a spec — scaffold the four-piece project, fill the compute body, and compile via bisheng."
export const ASCEND_GENERATE_WHEN_TO_USE =
  "Use when the user wants to create or generate an Ascend operator from a spec or description. The agent decides step order and reacts to failures; no fixed sequence."
export const ASCEND_GENERATE_ALLOWED_TOOLS: readonly string[] = [
  "AscendSpecParser",
  "AscendTilingPlanner",
  "AscendCodeGen",
  "AscendCompilerBridge",
  "AscendDiagnoser",
]
