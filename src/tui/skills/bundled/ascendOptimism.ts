import { registerBundledSkill } from '../bundledSkills.js'
import { getCoreDependencies } from 'src/tui/factory'
import { applyToolchainPlaceholders } from '../../core/executor/toolchain.js'

// 0.1.87 任务 A：ascend-optimism 总纲（跨层性能路由，薄路由）。域单一事实源 =
// src/ascend/skills/ascendOptimism.ts（路由表经 renderUmbrellaSkillMd 渲染）；
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
  "name: ascend-optimism",
  "description: Cross-layer Ascend NPU performance umbrella — routes an optimization goal to the operator level (benchmark/profile/tiling), the model level (inference, quantization, training, serving), or the implementation level (recipes), then orchestrates across layers.",
  "when_to_use: Use when the optimization goal spans layers or the right level is unclear. Single-operator benchmark/bottleneck work belongs to ascend-optimize — start there instead.",
  "allowed-tools: AscendBenchmarkRunner, AscendProfileReportParser, AscendProfileAnalyzer, AscendTilingPlanner, AscendRealHWBridge, AscendGoldenTest, AscendSkillSourceCheck",
  "---",
  "",
  "# Ascend Cross-Layer Performance Router (Optimism)",
  "",
  "The optimization goal spans layers (model-level, serving, training) or the right level is unclear.",
  "",
  "Route to the operator / model / implementation level, then orchestrate across layers.",
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
  "| ascend-optimize (operator level) | ONE operator or single kernel: benchmark baseline -> profile -> optimize -> re-benchmark. Anti-confusion: single-operator benchmark/bottleneck optimization belongs to ascend-optimize, not this umbrella. | preinstalled |",
  "| ascend-perf-optimize (operator level) | Operator-level methodology depth: three-layer pipeline, msprof collection (7 aic-metrics), 10 bound types, tiling recorrection. | preinstalled |",
  "| ascend-tiling-design (operator level) | The bottleneck is tiling-bound and a tiling plan (re)design is the fix. | preinstalled |",
  "| mindstudio-ascendc-perf-optim-skills (operator level) | Profiling-data-driven Ascend C operator performance optimization (MindStudio flow). | preinstalled |",
  "| cannbot-model-infer-skills (model level) | Whole-model inference speedup: framework adaptation, parallel strategies, KVCache/FA, fused operators, graph mode. | preinstalled |",
  "| cannbot-torch-npugraph-ex-skills (model level) | PyTorch npugraph_ex graph-mode knowledge, templates, and performance diagnosis. | preinstalled |",
  "| mindstudio-msmodelslim-skills (model level) | Quantization/compression path: msModelSlim quick quant, model analysis/adapt, layer-wise quantization. | preinstalled |",
  "| mindspeed-megatron-skills (model level) | Megatron training-side optimization or migration (change analysis, commit tracking, impact mapping). | preinstalled |",
  "| mindspeed-fsdp2-skills (model level) | FSDP2 distributed training migration/optimization (model/data/config migration + verification). | preinstalled |",
  "| ascend-transformer-boost-skills (model level) | ATB (Ascend Transformer Boost) acceleration: op replacement design, test framework builds. | preinstalled |",
  "| vllm-ascend-skills (model level) | Serving performance/deployment on vLLM-Ascend: service deploy, FAQ, test failure analysis. | preinstalled |",
  "| cann-recipes-infer (implementation level) | Inference implementation recipe path (not in the current marketplace — suggest install). | suggest install |",
  "| cann-recipes-train (implementation level) | Training implementation recipe path (not in the current marketplace — suggest install). | suggest install |",
  "",
  "## Rules",
  "",
  "- This umbrella ROUTES only. The routed skill owns its methodology; do not copy or substitute it here.",
  "- If a routed skill is missing (marketplace entry not installed / install failed), follow its \"suggest install\" guidance (install via the plugin marketplace) and never fabricate its content.",
  "- Route targets are a fixed table in code; remote content updates never rewrite this routing logic.",
  "- Tools return evidence, not decisions — classification comes from evidence (logs, error codes, profiling, golden mismatches), not guesses.",
].join('\n')

export const UMBRELLA_OPTIMISM_SKILL_MD = SKILL_MD

export function registerAscendOptimismSkill(): void {
  registerBundledSkill({
    name: "ascend-optimism",
    description: "Cross-layer Ascend NPU performance umbrella — routes an optimization goal to the operator level (benchmark/profile/tiling), the model level (inference, quantization, training, serving), or the implementation level (recipes), then orchestrates across layers.",
    whenToUse: "Use when the optimization goal spans layers or the right level is unclear. Single-operator benchmark/bottleneck work belongs to ascend-optimize — start there instead.",
    allowedTools: [
      "AscendBenchmarkRunner",
      "AscendProfileReportParser",
      "AscendProfileAnalyzer",
      "AscendTilingPlanner",
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
