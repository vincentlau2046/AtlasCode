/**
 * ascend-opdev 总纲内容（0.1.87 任务 A）— 薄路由单一事实源（用户裁定命名
 * ascend-opdev）。
 *
 * 按语言/框架决策树路由新算子开发：AscendC（直调/社区/Catlass/AISS）/
 * TileLang / Triton / CUDA 迁移 / PyTPO / DSL；与 ascend-generate（已知算子的
 * 端到端流水线）写分工句。市场未收录条目（ops-tilelang / cannbot-dsl）= 建议
 * 安装登记（任务 D 判据，不伪 preinstalled）。
 *
 * SKILL_MD 由路由表渲染生成（umbrella.ts renderUmbrellaSkillMd）。
 */
import { renderUmbrellaSkillMd, type AscendUmbrellaDefinition } from './umbrella'

export const ASCEND_OPDEV: AscendUmbrellaDefinition = {
  name: 'ascend-opdev',
  title: 'Ascend Operator Development Router (Opdev)',
  description:
    'Language/framework router for NEW Ascend NPU operator development — picks the toolchain route (Ascend C, TileLang, Triton, CUDA migration, PyTPO, direct invoke, DSL) and hands off to that workflow\'s full development skills.',
  whenToUse:
    'Use when starting a NEW operator and the language/framework matters or is unspecified. End-to-end generation of a known Ascend C operator stays with ascend-generate.',
  allowedTools: [
    'AscendSpecParser',
    'AscendTilingPlanner',
    'AscendCodeGen',
    'AscendCompilerBridge',
    'AscendGoldenTest',
  ],
  enterWhen: 'A NEW operator is requested and the language/framework matters or is unspecified.',
  routesSummary: 'Decide the language/framework route first, then hand off to that workflow\'s skills.',
  routes: [
    {
      skill: 'ascend-generate',
      note: 'known Ascend C, end-to-end',
      trigger:
        'Division of labor: end-to-end generation of a KNOWN Ascend C operator (spec -> parse -> tiling -> codegen -> compile) stays with ascend-generate; this umbrella only decides the route when language/framework is open.',
      status: 'preinstalled',
      source: 'bundled',
    },
    {
      skill: 'cannbot-ops-direct-invoke-skills',
      note: 'Ascend C',
      trigger:
        'Ascend C direct-invoke development: API retrieval (ascendc-docs-search), tiling, precision, perf, UT, env checks (27 skills).',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'community-ascendc-op-skills',
      note: 'Ascend C',
      trigger: 'Community Ascend C full flow: project init -> design -> codegen -> dev -> compile/debug -> review -> doc.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'cannbot-catlass-op-skills',
      note: 'Ascend C / Catlass',
      trigger: 'Catlass operator design, development, and performance tuning.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'community-catlass-op-skills',
      note: 'Ascend C / Catlass',
      trigger: 'Community Catlass flow: design -> codegen -> dev -> performance optimization.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'cannbot-aiss-tiling-solver',
      note: 'Ascend C tiling',
      trigger: 'AISS-TilingSolver: automatic tiling parameter solving (MatMul / Vector) for Ascend C operators.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'cannbot-tilelang-op-orchestrator-skills',
      note: 'TileLang',
      trigger: 'TileLang operator development: env check, submodule pull, design, develop, test, perf, review (9 skills).',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'ops-tilelang',
      note: 'TileLang toolchain pack',
      trigger: 'ops-tilelang toolchain pack (not in the current marketplace — suggest install).',
      status: 'suggest-install',
      source: 'external',
    },
    {
      skill: 'cannbot-triton-op-generator-skills',
      note: 'Triton',
      trigger: 'Triton-Ascend: task extraction, algorithm design, code generation, verification, latency optimization.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'community-triton-op-skills',
      note: 'Triton',
      trigger: 'Community Triton flow: design -> codegen -> dev -> review -> docs -> env config.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'community-triton-tilelang-migration-skills',
      note: 'GPU migration',
      trigger: 'GPU Triton/TileLang vector-op migration to NPU.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'cannbot-cuda2ascend-simt-skills',
      note: 'CUDA migration',
      trigger: 'CUDA -> Ascend C SIMT programming-model code migration.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'cannbot-pypto-op-orchestrator-skills',
      note: 'PyTPO',
      trigger: 'PyTPO orchestration: intent understanding, op design/develop, golden generation, precision compare, perf tune.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'cannbot-dsl',
      note: 'DSL',
      trigger: 'DSL-based operator development (not in the current marketplace — suggest install).',
      status: 'suggest-install',
      source: 'external',
    },
  ],
}

export const ASCEND_OPDEV_SKILL_MD = renderUmbrellaSkillMd(ASCEND_OPDEV)

export const ASCEND_OPDEV_NAME = ASCEND_OPDEV.name
export const ASCEND_OPDEV_DESCRIPTION = ASCEND_OPDEV.description
export const ASCEND_OPDEV_WHEN_TO_USE = ASCEND_OPDEV.whenToUse
export const ASCEND_OPDEV_ALLOWED_TOOLS: readonly string[] = ASCEND_OPDEV.allowedTools
