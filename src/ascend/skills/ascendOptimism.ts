/**
 * ascend-optimism 总纲内容（0.1.87 任务 A）— 薄路由单一事实源。
 *
 * 三层性能路由：算子级（既有 ascend-optimize / perf-optimize / tiling）→ 模型级
 * （推理适配 / 量化压缩 / 训练优化 / serving / ATB）→ 实施级（recipes，市场未
 * 收录 = 建议安装登记）。开头显式反混淆句（Review Focus 1：optimism ↔
 * ascend-optimize 仅差 3 字母，模型路由混淆面实在）。
 *
 * SKILL_MD 由路由表渲染生成（umbrella.ts renderUmbrellaSkillMd）。
 */
import { renderUmbrellaSkillMd, type AscendUmbrellaDefinition } from './umbrella'

export const ASCEND_OPTIMISM: AscendUmbrellaDefinition = {
  name: 'ascend-optimism',
  title: 'Ascend Cross-Layer Performance Router (Optimism)',
  description:
    'Cross-layer Ascend NPU performance umbrella — routes an optimization goal to the operator level (benchmark/profile/tiling), the model level (inference, quantization, training, serving), or the implementation level (recipes), then orchestrates across layers.',
  whenToUse:
    'Use when the optimization goal spans layers or the right level is unclear. Single-operator benchmark/bottleneck work belongs to ascend-optimize — start there instead.',
  allowedTools: [
    'AscendBenchmarkRunner',
    'AscendProfileReportParser',
    'AscendProfileAnalyzer',
    'AscendTilingPlanner',
    'AscendRealHWBridge',
    'AscendGoldenTest',
  ],
  enterWhen: 'The optimization goal spans layers (model-level, serving, training) or the right level is unclear.',
  routesSummary: 'Route to the operator / model / implementation level, then orchestrate across layers.',
  routes: [
    {
      skill: 'ascend-optimize',
      note: 'operator level',
      trigger:
        'ONE operator or single kernel: benchmark baseline -> profile -> optimize -> re-benchmark. Anti-confusion: single-operator benchmark/bottleneck optimization belongs to ascend-optimize, not this umbrella.',
      status: 'preinstalled',
      source: 'bundled',
    },
    {
      skill: 'ascend-perf-optimize',
      note: 'operator level',
      trigger:
        'Operator-level methodology depth: three-layer pipeline, msprof collection (7 aic-metrics), 10 bound types, tiling recorrection.',
      status: 'preinstalled',
      source: 'atlas-plugins',
    },
    {
      skill: 'ascend-tiling-design',
      note: 'operator level',
      trigger: 'The bottleneck is tiling-bound and a tiling plan (re)design is the fix.',
      status: 'preinstalled',
      source: 'atlas-plugins',
    },
    {
      skill: 'mindstudio-ascendc-perf-optim-skills',
      note: 'operator level',
      trigger: 'Profiling-data-driven Ascend C operator performance optimization (MindStudio flow).',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'cannbot-model-infer-skills',
      note: 'model level',
      trigger:
        'Whole-model inference speedup: framework adaptation, parallel strategies, KVCache/FA, fused operators, graph mode.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'cannbot-torch-npugraph-ex-skills',
      note: 'model level',
      trigger: 'PyTorch npugraph_ex graph-mode knowledge, templates, and performance diagnosis.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'mindstudio-msmodelslim-skills',
      note: 'model level',
      trigger: 'Quantization/compression path: msModelSlim quick quant, model analysis/adapt, layer-wise quantization.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'mindspeed-megatron-skills',
      note: 'model level',
      trigger: 'Megatron training-side optimization or migration (change analysis, commit tracking, impact mapping).',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'mindspeed-fsdp2-skills',
      note: 'model level',
      trigger: 'FSDP2 distributed training migration/optimization (model/data/config migration + verification).',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'ascend-transformer-boost-skills',
      note: 'model level',
      trigger: 'ATB (Ascend Transformer Boost) acceleration: op replacement design, test framework builds.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'vllm-ascend-skills',
      note: 'model level',
      trigger: 'Serving performance/deployment on vLLM-Ascend: service deploy, FAQ, test failure analysis.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'cann-recipes-infer',
      note: 'implementation level',
      trigger: 'Inference implementation recipe path (not in the current marketplace — suggest install).',
      status: 'suggest-install',
      source: 'external',
    },
    {
      skill: 'cann-recipes-train',
      note: 'implementation level',
      trigger: 'Training implementation recipe path (not in the current marketplace — suggest install).',
      status: 'suggest-install',
      source: 'external',
    },
  ],
}

export const ASCEND_OPTIMISM_SKILL_MD = renderUmbrellaSkillMd(ASCEND_OPTIMISM)

export const ASCEND_OPTIMISM_NAME = ASCEND_OPTIMISM.name
export const ASCEND_OPTIMISM_DESCRIPTION = ASCEND_OPTIMISM.description
export const ASCEND_OPTIMISM_WHEN_TO_USE = ASCEND_OPTIMISM.whenToUse
export const ASCEND_OPTIMISM_ALLOWED_TOOLS: readonly string[] = ASCEND_OPTIMISM.allowedTools
