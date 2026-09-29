import { registerBundledSkill } from '../bundledSkills.js'
import { getCoreDependencies } from 'src/tui/factory'
import { applyToolchainPlaceholders } from '../../core/executor/toolchain.js'

// NOTE: this skill is intentionally written as GOAL + GATES + TOOL CATALOG.
// It does NOT prescribe a `## Steps` call order — the agent picks the next
// tool from the previous tool's evidence (coding-agent contract).

const SKILL_MD = [
  "---",
  "name: ascend-debug",
  "description: Triage an Ascend NPU fault — collect the scene, decode AICore errors, diagnose, and locate root-cause evidence. Covers crashes, hangs, OOM, alignment, and correctness failures.",
  "when_to_use: Use when a fault, crash, hang, or failure occurs on Ascend NPU, or when compile/golden-test fails and the user needs help locating the root cause. You decide the step order and react to evidence; this skill does not prescribe a fixed sequence.",
  "allowed-tools: AscendFaultCollector, AscendErrorClassifier, AscendGoldenTest, AscendDiagnoser, AscendProfileAnalyzer, AscendRealHWBridge",
  "---",
  "# Ascend Fault Triage",
  "",
  "Locate the root cause of an Ascend NPU fault from evidence. You choose which tool to call next based on the previous tool's evidence — there is no fixed step order here.",
  "",
  "## Goal",
  "",
  "Produce a root-cause hypothesis backed by concrete evidence for the fault:",
  "- **Collected scene**: the fault scene is captured (CANN/driver logs, coredump, GE dump graphs, op .o) via AscendFaultCollector when the fault is non-trivial.",
  "- **Decoded error**: AICore error codes are decoded (AscendErrorClassifier) when the fault is an AICore/hardware error.",
  "- **Localized stage**: the failing stage/op is identified (compile / run / tiling / a specific op) from logs or profiling.",
  "- **Candidate fixes**: ranked hypotheses (not instructions) for what to change, each tied to the evidence.",
  "",
  "## Gates",
  "",
  "- For a crash/hang with no obvious cause, collect the scene FIRST (AscendFaultCollector) before reasoning — you cannot diagnose what you have not captured.",
  "- AscendErrorClassifier consumes the AscendFaultCollector tar.gz — only call it after collection (or when the user already has a collected archive).",
  "- For a correctness failure (wrong output, not a crash), AscendGoldenTest is the entry point — its mismatch diff is the evidence.",
  "- **Always route through AscendDiagnoser** after a failure to collect evidence (error class + extracted snippets + candidate fixes) before deciding the next move. Do not blindly re-run the failing step.",
  "- For a hang (task never returns), the scene + graph analysis is the path; AscendProfileAnalyzer may reveal a stream-sync stall.",
  "",
  "## Tool catalog",
  "",
  "Pick from these as the evidence demands — the order is yours to decide:",
  "- AscendFaultCollector — collect the fault scene via npucollector ({{toolchain.commands.collect}}): CANN/driver logs, coredump, GE dump graphs, op .o, machine env. Output tar.gz feeds AscendErrorClassifier. Some modules need root.",
  "- AscendErrorClassifier — decode AICore error codes from the collected scene via msaicerr ({{toolchain.commands.decode}}): error code + bits, PC/CCE line, addr bounds, dump NaN/INF, single-op test result. Returns a coarse error class.",
  "- AscendGoldenTest — run a golden-test script (numpy reference vs NPU output, np.allclose); the mismatch diff is correctness-failure evidence.",
  "- AscendDiagnoser — classify compile/runtime errors from bisheng logs or golden-test output; returns extracted snippets + candidate fix hypotheses. Use to gather evidence after any failure.",
  "- AscendProfileAnalyzer — analyze a GE profiling dump via ada-pa ({{toolchain.commands.profile_analysis}}): op-stat rankings, bottleneck stage, stream-sync trace. Use to localize a perf stall or hang.",
  "- AscendRealHWBridge — real NPU interaction: {{toolchain.commands.info}} (device status), {{toolchain.commands.profile}} (msprof profiling). Use to check device health or capture a profiling dump.",
  "",
  "## Rules",
  "",
  "- **Tools return evidence, not decisions.** AscendDiagnoser/AscendErrorClassifier give you error class + hypotheses; YOU decide which to pursue and which tool is next.",
  "- **Failures are decision points, not retries.** Always collect evidence before deciding the next move.",
  "- Some fault-scene modules require root — if AscendFaultCollector warns in stderr, tell the user which modules were skipped and whether to re-run with elevated privileges.",
  "- `ada` (CANN package download) ≠ `ada-pa` (profiling analysis) — AscendProfileAnalyzer uses ada-pa. Do not run `ada` expecting profiling.",
  "- For graph-cycle or hung-exec-block analysis (narrow graph diagnostics), use the coding base to run the official `cycle_search.py` / `exec_block_analyze.py` scripts directly (they need dump graphs + onnx/graphviz) — no dedicated tool wraps them yet.",
  "- When a tool returns `mocked: true`, treat its output as a liveness signal, not as proof of real-HW diagnosis — say so in your report.",
  "- Report at the end: the fault class, the root-cause hypothesis, the evidence behind it, and ranked candidate fixes.",
].join('\n')

export function registerAscendDebugSkill(): void {
  registerBundledSkill({
    name: "ascend-debug",
    description: "Triage an Ascend NPU fault — collect the scene, decode AICore errors, diagnose, and locate root-cause evidence.",
    whenToUse: "Use when a fault, crash, hang, or failure occurs on Ascend NPU, or when compile/golden-test fails and the user needs help locating the root cause. The agent decides step order and reacts to evidence; no fixed sequence.",
    allowedTools: ["AscendFaultCollector", "AscendErrorClassifier", "AscendGoldenTest", "AscendDiagnoser", "AscendProfileAnalyzer", "AscendRealHWBridge"],
    userInvocable: true,
    context: 'inline',
    async getPromptForCommand(args: string) {
      const toolchain = getCoreDependencies().ascendExecutor
      const content = applyToolchainPlaceholders(SKILL_MD, toolchain)
      const parts: string[] = [content]
      if (args) parts.push('## User Request\n\n' + args)
      return [{ type: 'text', text: parts.join('\n\n') }]
    },
  })
}
