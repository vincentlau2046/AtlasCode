/**
 * engine/tools/plan 子门面（S-E2 §8.58 plan 族子波，STR-1 显式名块纪律）。
 *
 * 覆盖两本体对象（EnterPlanModeTool / ExitPlanModeV2Tool）+ JSON schema 2
 * 常量（ENTER/EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA）+ Output 型 2 +
 * AllowedPrompt 型 + prompt 面（getEnterPlanModeToolPrompt /
 * EXIT_PLAN_MODE_V2_TOOL_PROMPT / 2 DESCRIPTION 短常量 +
 * isPlanModeInterviewPhaseEnabled 门控）+ plan 域 7 函数（planDomain）+
 * 词 slug 2 函数（planWords）+ duck 型 8（planToolInput）。
 *
 * 纪律（tools/index.ts tasks/schedule/worktree 块先例）：逐名显式
 * re-export，无 `export *`；各文件头注 delta 登记不随门面重复（单一
 * 事实源 = 各模块头注）。
 *
 * 重名登记：无（2 PROMPT / 2 DESCRIPTION 常量名互异；AllowedPrompt 唯
 * 一定义位 = planToolInput，exitPlanModeV2Tool 重导出口）。
 *
 * 消费方：tools/ 门面 S-E2 re-export 块 + 组合根 baseTools 注入位
 * （CLI 波前向接缝，同 S-D2b worktree 面；plan 族无专属门控槽 = 无条件
 * 注册面，49 口径 18/49 → 20/49）。
 */
export {
  ENTER_PLAN_MODE_TOOL_INPUT_SCHEMA,
  EnterPlanModeTool,
  type EnterPlanModeOutput,
} from './enterPlanModeTool'
export {
  EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA,
  ExitPlanModeV2Tool,
  type AllowedPrompt,
  type ExitPlanModeV2Output,
} from './exitPlanModeV2Tool'
export {
  ENTER_PLAN_MODE_DESCRIPTION,
  EXIT_PLAN_MODE_V2_DESCRIPTION,
  EXIT_PLAN_MODE_V2_TOOL_PROMPT,
  getEnterPlanModeToolPrompt,
  isPlanModeInterviewPhaseEnabled,
} from './planPrompt'
export {
  clearAllPlanSlugs,
  clearPlanSlug,
  getPlan,
  getPlanFilePath,
  getPlanSlug,
  getPlansDirectory,
  setPlanSlug,
} from './planDomain'
export {
  generateShortWordSlug,
  generateWordSlug,
} from './planWords'
export {
  type EnterPlanModeAppState,
  type EnterPlanModeToolContext,
  type EnterPlanModeToolInput,
  type ExitPlanModeV2AppState,
  type ExitPlanModeV2ToolContext,
  type ExitPlanModeV2ToolInput,
  type ExitPlanModeV2ValidateContext,
} from './planToolInput'
