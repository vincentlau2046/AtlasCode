import { registerBundledSkill } from '../bundledSkills.js'
import { getCoreDependencies } from 'src/tui/factory'
import { applyToolchainPlaceholders } from '../../core/executor/toolchain.js'

// 0.1.87 任务 A：ascend-opdev 总纲（新算子开发路由，薄路由）。域单一事实源 =
// src/ascend/skills/ascendOpdev.ts（路由表经 renderUmbrellaSkillMd 渲染）；
// 本壳文件按 boundaries 约束（tui 不可 import ascend）保留自含副本，漂移由
// tests/unit/wave0187-umbrella-skills.test.ts ⑩ 字节全等锁守卫。
// userInvocable:false —— 模型经 skill_listing 仍可见（getSkillToolCommands
// 不滤 isHidden），slash 面不注册（cmd32 // /help55 命令面零变化）。
// 路由表 = 域内单一事实源；本副本只承载渲染产物，不承载路由逻辑。

const SKILL_MD = [
  "---",
  "name: ascend-opdev",
  "description: Language/framework router for NEW Ascend NPU operator development — picks the toolchain route (Ascend C, TileLang, Triton, CUDA migration, PyTPO, direct invoke, DSL) and hands off to that workflow's full development skills.",
  "when_to_use: Use when starting a NEW operator and the language/framework matters or is unspecified. End-to-end generation of a known Ascend C operator stays with ascend-generate.",
  "allowed-tools: AscendSpecParser, AscendTilingPlanner, AscendCodeGen, AscendCompilerBridge, AscendGoldenTest",
  "---",
  "",
  "# Ascend Operator Development Router (Opdev)",
  "",
  "A NEW operator is requested and the language/framework matters or is unspecified.",
  "",
  "Decide the language/framework route first, then hand off to that workflow's skills.",
  "",
  "## Routing table",
  "",
  "Pick the route from the classification below. Route — do not re-derive the routed skill's methodology here.",
  "",
  "| Route to | Route when | Status |",
  "|---|---|---|",
  "| ascend-generate (known Ascend C, end-to-end) | Division of labor: end-to-end generation of a KNOWN Ascend C operator (spec -> parse -> tiling -> codegen -> compile) stays with ascend-generate; this umbrella only decides the route when language/framework is open. | preinstalled |",
  "| cannbot-ops-direct-invoke-skills (Ascend C) | Ascend C direct-invoke development: API retrieval (ascendc-docs-search), tiling, precision, perf, UT, env checks (27 skills). | preinstalled |",
  "| community-ascendc-op-skills (Ascend C) | Community Ascend C full flow: project init -> design -> codegen -> dev -> compile/debug -> review -> doc. | preinstalled |",
  "| cannbot-catlass-op-skills (Ascend C / Catlass) | Catlass operator design, development, and performance tuning. | preinstalled |",
  "| community-catlass-op-skills (Ascend C / Catlass) | Community Catlass flow: design -> codegen -> dev -> performance optimization. | preinstalled |",
  "| cannbot-aiss-tiling-solver (Ascend C tiling) | AISS-TilingSolver: automatic tiling parameter solving (MatMul / Vector) for Ascend C operators. | preinstalled |",
  "| cannbot-tilelang-op-orchestrator-skills (TileLang) | TileLang operator development: env check, submodule pull, design, develop, test, perf, review (9 skills). | preinstalled |",
  "| ops-tilelang (TileLang toolchain pack) | ops-tilelang toolchain pack (not in the current marketplace — suggest install). | suggest install |",
  "| cannbot-triton-op-generator-skills (Triton) | Triton-Ascend: task extraction, algorithm design, code generation, verification, latency optimization. | preinstalled |",
  "| community-triton-op-skills (Triton) | Community Triton flow: design -> codegen -> dev -> review -> docs -> env config. | preinstalled |",
  "| community-triton-tilelang-migration-skills (GPU migration) | GPU Triton/TileLang vector-op migration to NPU. | preinstalled |",
  "| cannbot-cuda2ascend-simt-skills (CUDA migration) | CUDA -> Ascend C SIMT programming-model code migration. | preinstalled |",
  "| cannbot-pypto-op-orchestrator-skills (PyTPO) | PyTPO orchestration: intent understanding, op design/develop, golden generation, precision compare, perf tune. | preinstalled |",
  "| cannbot-dsl (DSL) | DSL-based operator development (not in the current marketplace — suggest install). | suggest install |",
  "",
  "## Rules",
  "",
  "- This umbrella ROUTES only. The routed skill owns its methodology; do not copy or substitute it here.",
  "- If a routed skill is missing (marketplace entry not installed / install failed), follow its \"suggest install\" guidance (install via the plugin marketplace) and never fabricate its content.",
  "- Route targets are a fixed table in code; remote content updates never rewrite this routing logic.",
  "- Tools return evidence, not decisions — classification comes from evidence (logs, error codes, profiling, golden mismatches), not guesses.",
].join('\n')

export const UMBRELLA_OPDEV_SKILL_MD = SKILL_MD

export function registerAscendOpdevSkill(): void {
  registerBundledSkill({
    name: "ascend-opdev",
    description: "Language/framework router for NEW Ascend NPU operator development — picks the toolchain route (Ascend C, TileLang, Triton, CUDA migration, PyTPO, direct invoke, DSL) and hands off to that workflow's full development skills.",
    whenToUse: "Use when starting a NEW operator and the language/framework matters or is unspecified. End-to-end generation of a known Ascend C operator stays with ascend-generate.",
    allowedTools: [
      "AscendSpecParser",
      "AscendTilingPlanner",
      "AscendCodeGen",
      "AscendCompilerBridge",
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
