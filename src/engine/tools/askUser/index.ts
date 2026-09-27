/**
 * engine/tools/askUser 子门面（S-E2 §8.60 config+ask-user 族子波，STR-1 显式名块纪律）。
 *
 * 覆盖 1 本体对象（AskUserQuestionTool）+ JSON schema 1 常量
 * （ASK_USER_QUESTION_TOOL_INPUT_SCHEMA）+ prompt 面 3（DESCRIPTION /
 * ASK_USER_QUESTION_TOOL_PROMPT / PREVIEW_FEATURE_PROMPT）+ 型面 5
 * （AskUserQuestionOption / AskUserQuestion / QuestionAnnotation /
 * AskUserQuestionToolInput / AskUserQuestionOutput）。
 *
 * 纪律（tools/index.ts plan 块先例）：逐名显式 re-export，无 `export *`；
 * 各文件头注 delta 登记不随门面重复（单一事实源 = 各模块头注）。
 *
 * 重名登记：ASK_USER_QUESTION_TOOL_NAME 由 toolNames 块单一事实源
 * （T-5e seed，不重出）；DESCRIPTION 若与 config 门面 DESCRIPTION 冲突，
 * tools 门面侧别名重出（config 面 CONFIG_DESCRIPTION 别名，重名登记先例）。
 *
 * 消费方：tools/ 门面 S-E2 re-export 块 + 组合根 baseTools 注入位
 * （CLI 波前向接缝，同 plan/web 族；askUser 族无专属门控槽 = 无条件注册面，
 * 49 口径 23/49 → 24/49（+AskUserQuestion 1 槽），§8.60.1.4）。
 */
export {
  AskUserQuestionTool,
  ASK_USER_QUESTION_TOOL_INPUT_SCHEMA,
  type AskUserQuestion,
  type AskUserQuestionOption,
  type AskUserQuestionOutput,
  type AskUserQuestionToolInput,
  type QuestionAnnotation,
} from './askUserQuestionTool'
export {
  ASK_USER_QUESTION_TOOL_CHIP_WIDTH,
  ASK_USER_QUESTION_TOOL_PROMPT,
  DESCRIPTION,
  PREVIEW_FEATURE_PROMPT,
} from './askUserPrompt'
