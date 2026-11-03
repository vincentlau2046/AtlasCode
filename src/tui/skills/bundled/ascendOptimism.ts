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

const SKILL_MD = [
  "---",
  "name: ascend-optimism",
  "description: Cross-layer Ascend NPU performance umbrella — routes an optimization goal to the operator level (benchmark/profile/tiling), the model level (inference, quantization, training, serving), or the implementation level (recipes), then orchestrates across layers.",
  "when_to_use: Use when the optimization goal spans layers or the right level is unclear. Single-operator benchmark/bottleneck work belongs to ascend-optimize — start there instead.",
  "allowed-tools: AscendBenchmarkRunner, AscendProfileReportParser, AscendProfileAnalyzer, AscendTilingPlanner, AscendRealHWBridge, AscendGoldenTest",
  "---",
  "",
  "# Ascend Cross-Layer Performance Router (Optimism)",
  "",
  "The optimization goal spans layers (model-level, serving, training) or the right level is unclear.",
  "",
  "Route to the operator / model / implementation level, then orchestrate across layers.",
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
      "AscendGoldenTest"
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
