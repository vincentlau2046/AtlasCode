/**
 * engine/tools/askUser — AskUserQuestionTool prompt 面
 * （S-E2 §8.60 config+ask-user 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/AskUserQuestionTool/prompt.ts 44L 裁剪随迁
 * （DESCRIPTION / PREVIEW_FEATURE_PROMPT / ASK_USER_QUESTION_TOOL_PROMPT 逐字）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 ASK_USER_QUESTION_TOOL_NAME 本地定义 → 新 toolNames 单一事实源
 *    （T-5e 全量集已 seed，值 'AskUserQuestion' 逐一验真；web 族 B-N1 先例
 *    域内双源字面风险除）；尾部 `export { ASK_USER_QUESTION_TOOL_NAME }`
 *    名字 re-export = 零消费孤儿面（名字单一事实源 = tools/ 门面 toolNames
 *    块 seed，子门面/工具门面均不重出该名），与 web 族先例同形
 *    （webFetchPrompt / webSearchPrompt 尾部同形 re-export）→ B-N2 预核登记，
 *    复审勿当遗漏重报。
 *  ② 旧 prompt 体 getQuestionPreviewFormat() 分支（undefined → 纯 prompt；
 *    已设 → + PREVIEW_FEATURE_PROMPT[format]）裁：getQuestionPreviewFormat =
 *    旧 bootstrap/state.ts any stub（返回 {} 恒 ≠ 'html'/'markdown'，死支，
 *    H6 不认 stub 真行为）→ 新仓 description 面 = 纯 ASK_USER_QUESTION_TOOL_PROMPT
 *    + markdown preview 段（TUI 波真 preview-format 态复活时恢复分支，前向接缝
 *    登记）。
 *  ③ PREVIEW_FEATURE_PROMPT html 段裁（html preview 校验支随 ② 裁，死 map
 *    条目不随迁）；markdown 段逐字。
 *  ④ 旧 EXIT_PLAN_MODE_TOOL_NAME（'ExitPlanMode'）→ 新仓
 *    EXIT_PLAN_MODE_V2_TOOL_NAME（plan 域 §8.58 单一事实源，值同 'ExitPlanMode'，
 *    toolNames 头注逐字验真）。
 */
import {
  ASK_USER_QUESTION_TOOL_NAME,
  EXIT_PLAN_MODE_V2_TOOL_NAME,
} from '../toolNames'

export const ASK_USER_QUESTION_TOOL_CHIP_WIDTH = 12

export const DESCRIPTION =
  'Asks the user multiple choice questions to gather information, clarify ambiguity, understand preferences, make decisions or offer them choices.'

// delta ③：html 段裁（死支），markdown 段逐字
export const PREVIEW_FEATURE_PROMPT = {
  markdown: `
Preview feature:
Use the optional \`preview\` field on options when presenting concrete artifacts that users need to visually compare:
- ASCII mockups of UI layouts or components
- Code snippets showing different implementations
- Diagram variations
- Configuration examples

Preview content is rendered as markdown in a monospace box. Multi-line text with newlines is supported. When any option has a preview, the UI switches to a side-by-side layout with a vertical option list on the left and preview on the right. Do not use previews for simple preference questions where labels and descriptions suffice. Note: previews are only supported for single-select questions (not multiSelect).
`,
} as const

// delta ④：EXIT_PLAN_MODE_TOOL_NAME → EXIT_PLAN_MODE_V2_TOOL_NAME（值同）
export const ASK_USER_QUESTION_TOOL_PROMPT = `Use this tool when you need to ask the user questions during execution. This allows you to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take.

Usage notes:
- Users will always be able to select "Other" to provide custom text input
- Use multiSelect: true to allow multiple answers to be selected for a question
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label

Plan mode note: In plan mode, use this tool to clarify requirements or choose between approaches BEFORE finalizing your plan. Do NOT use this tool to ask "Is my plan ready?" or "Should I proceed?" - use ${EXIT_PLAN_MODE_V2_TOOL_NAME} for plan approval. IMPORTANT: Do not reference "the plan" in your questions (e.g., "Do you have feedback about the plan?", "Does the plan look good?") because the user cannot see the plan in the UI until you call ${EXIT_PLAN_MODE_V2_TOOL_NAME}. If you need plan approval, use ${EXIT_PLAN_MODE_V2_TOOL_NAME} instead.
`

export { ASK_USER_QUESTION_TOOL_NAME }
