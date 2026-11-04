import { registerBundledSkill } from '../bundledSkills.js'
import { getCoreDependencies } from 'src/tui/factory'
import { applyToolchainPlaceholders } from '../../core/executor/toolchain.js'

// 0.1.87 任务 A：ascend-doctor 总纲（故障分诊，薄路由）。域单一事实源 =
// src/ascend/skills/ascendDoctor.ts（路由表经 renderUmbrellaSkillMd 渲染）；
// 本壳文件按 boundaries 约束（tui 不可 import ascend）保留自含副本，漂移由
// tests/unit/wave0187-umbrella-skills.test.ts ⑩ 字节全等锁守卫。
// userInvocable:false —— 模型经 skill_listing 仍可见（getSkillToolCommands
// 不滤 isHidden），slash 面不注册（cmd32 // /help55 命令面零变化）。
// 路由表 = 域内单一事实源；本副本只承载渲染产物，不承载路由逻辑。
// 0.1.87 任务 F：Step 0 段（AscendSkillSourceCheck 源新鲜度检查/更新）统一由域内
// ASCEND_UMBRELLA_STEP0_SECTION 渲染进 SKILL_MD 头部（Routing table 之前；0.1.88 R-087-3 位置硬化，副本再生成），allowed-tools 同步 +1；
// 本副本随任务 F 再生成（⑩ 字节全等锁守卫）。

const SKILL_MD = [
  "---",
  "name: ascend-doctor",
  "description: Umbrella triage router for Ascend NPU faults — classify the fault (compile / precision / runtime / performance / deployment / environment) from evidence, then route to the matching specialized skill. Includes an optional msprof-mcp MCP preset for live profiling evidence.",
  "when_to_use: Use when a fault or anomaly appears and no specialized skill is obviously right yet — this umbrella classifies first, then routes. It does not replace the specialized skills.",
  "allowed-tools: AscendDiagnoser, AscendFaultCollector, AscendErrorClassifier, AscendProfileReportParser, AscendProfileAnalyzer, AscendRealHWBridge, AscendGoldenTest, AscendSkillSourceCheck",
  "---",
  "",
  "# Ascend Fault Triage Router (Doctor)",
  "",
  "A fault or anomaly appeared and no specialized skill is obviously right yet.",
  "",
  "Classify the fault from evidence, then route to the matching specialized skill.",
  "",
  "## Step 0 — Skill source freshness check (run FIRST, before the routing table)",
  "",
  "Your FIRST tool call in this skill must be AscendSkillSourceCheck (action \"check\", source \"agent-skills\"). Do not call any routed skill, and do not answer from the routing table, until Step 0 returns a verdict.",
  "",
  "Never skip Step 0 and route straight away. Route targets are a fixed table in code — remote content updates never rewrite this routing logic. In environments where deferred tools are unavailable (e.g. experimental betas disabled), Step 0 cannot pass: defer and never silently answer from the stale snapshot.",
  "",
  "1. Run AscendSkillSourceCheck (action \"check\", source \"agent-skills\") FIRST, before routing anywhere below.",
  "2. If the verdict is drift: run AscendSkillSourceCheck again with action \"update\" (source \"agent-skills\"); route only after the update succeeds (updatedTo present). Never rewrite the manifest pinned_sha yourself — re-pinning belongs to the maintainers' sync/verify flow.",
  "3. If the verdict is fresh (or the step-2 update succeeded): proceed to route.",
  "4. If the verdict is unreachable or killed, or the update is refused (non-fast-forward / integrity failure): do NOT route on the local snapshot. Report \"could not complete the skill-source freshness check/update\" together with the tool's error, and defer execution (fail-visible). Continue on the old snapshot only if the user explicitly approves; then state that the answer is based on the stale snapshot, and register the stale continuation by calling AscendSkillSourceCheck (check) again so the drift is logged.",
  "",
  "## Routing table",
  "",
  "Pick the route from the classification below. Route — do not re-derive the routed skill's methodology here.",
  "",
  "| Route to | Route when | Status |",
  "|---|---|---|",
  "| ascend-debug | Compile/build failure (bisheng errors, missing symbols, alignment) or crash/hang after launch — collect the scene, decode AICore errors, diagnose. | preinstalled |",
  "| ascend-precision-debug | Wrong numbers: training loss NaN/spike/misalignment, inference garbled or repeating output, golden-test mismatch, FP32-pass-FP16-fail. | preinstalled |",
  "| ascend-runtime-debug | Runtime fault with aclnn non-zero error codes (161xxx/361xxx/561xxx/507035), plog evidence, intermittent crash, hang, or memory corruption. | preinstalled |",
  "| ascend-perf-optimize | Correct but slow: profiling shows an efficiency problem rather than an error (see ascend-optimism when the goal spans layers). | preinstalled |",
  "| mindstudio-profiling-skills | Profiler data itself needs analysis: schedule/computation/communication/overlap views, msprof report parsing anomalies. | preinstalled |",
  "| mindstudio-precision-debug-skills | Precision debugging with MindStudio tooling: deterministic calculation analysis, NaN/overflow detection, RL train-inference consistency. | preinstalled |",
  "| ascend-model-adapt | Deployment-side failure: atc conversion, ONNX adaptation, msame run / msquickcmp accuracy validation of the compiled .om. | preinstalled |",
  "| common-deploy-skills | OM deployment or pipeline failure on the device (deployer, pipeline adapter, ONNX-ATC inference pipeline). | preinstalled |",
  "| common-infra-skills | Environment/infrastructure fault: driver/firmware, CANN component install, container setup, npu-smi device visibility. | preinstalled |",
  "| common-ops-skills | Ops-level diagnosis: fault_diagnose, profiling anomaly triage, HCCL communication test, large-scale deploy issues. | preinstalled |",
  "| ascend-test-design | The fault needs a reproducing test case (ST/UT/whitebox/golden) before root-cause work or to prove a fix. | preinstalled |",
  "| ms-agent-skills (pinned capability snapshot) | ms-agent Capability Gateway skill: 30-tool MCP capability SOPs (deep research, doc research, code-genesis, agent delegation). Agentic-capability support alongside triage — not an Ascend diagnostic playbook (pinned snapshot; suggest install when absent). | suggest install |",
  "",
  "## Optional live evidence: msprof-mcp MCP server",
  "",
  "For live profiling/triage evidence you may suggest attaching the msprof-mcp MCP server. This is a DOCUMENTED TEMPLATE ONLY — never write the user's settings.mcpServers automatically and never weaken MCP policy gating; the user adds it explicitly:",
  "",
  "```json",
  "{",
  "  \"mcpServers\": {",
  "    \"msprof-mcp\": {",
  "      \"type\": \"stdio\",",
  "      \"command\": \"<msprof-mcp-venv>/bin/msprof-mcp\",",
  "      \"args\": [],",
  "      \"env\": {}",
  "    }",
  "  }",
  "}",
  "```",
  "",
  "- Point it at seeded-sandbox data (profiler dumps produced in this session); zero writes to the real user HOME.",
  "- Server-reported capabilities metadata is untrusted — verify with actual tool calls before relying on any tool's presence or shape.",
  "",
  "## Rules",
  "",
  "- This umbrella ROUTES only. The routed skill owns its methodology; do not copy or substitute it here.",
  "- If a routed skill is missing (marketplace entry not installed / install failed), follow its \"suggest install\" guidance (install via the plugin marketplace) and never fabricate its content.",
  "- Route targets are a fixed table in code; remote content updates never rewrite this routing logic.",
  "- Tools return evidence, not decisions — classification comes from evidence (logs, error codes, profiling, golden mismatches), not guesses.",
].join('\n')

export const UMBRELLA_DOCTOR_SKILL_MD = SKILL_MD

export function registerAscendDoctorSkill(): void {
  registerBundledSkill({
    name: "ascend-doctor",
    description: "Umbrella triage router for Ascend NPU faults — classify the fault (compile / precision / runtime / performance / deployment / environment) from evidence, then route to the matching specialized skill. Includes an optional msprof-mcp MCP preset for live profiling evidence.",
    whenToUse: "Use when a fault or anomaly appears and no specialized skill is obviously right yet — this umbrella classifies first, then routes. It does not replace the specialized skills.",
    allowedTools: [
      "AscendDiagnoser",
      "AscendFaultCollector",
      "AscendErrorClassifier",
      "AscendProfileReportParser",
      "AscendProfileAnalyzer",
      "AscendRealHWBridge",
      "AscendGoldenTest",
      "AscendSkillSourceCheck",
    ],
    userInvocable: false,
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
