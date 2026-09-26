/**
 * engine/tools/plan — plan 族 prompt 面（S-E2 §8.58 plan 族子波）。
 *
 * 旧仓来源（a8af45b）：
 *  - tools/EnterPlanModeTool/prompt.ts 103L 逐字随迁（WHAT_HAPPENS_SECTION
 *    + getEnterPlanModeToolPromptExternal 模板 + 公开 wrapper；ASK_USER_QUESTION
 *    插值改经新仓 toolNames 单一事实源，delta ①）。
 *  - tools/ExitPlanModeTool/prompt.ts 29L 逐字随迁（EXIT_PLAN_MODE_V2_TOOL_PROMPT
 *    静态模板；旧仓硬编码 'AskUserQuestion'（stub 注释「Hardcoded to avoid
 *    relative import issues in stub」）→ 新仓 toolNames 值同插值，delta ②）。
 *  - isPlanModeInterviewPhaseEnabled（旧 utils/planModeV2.ts，GB 门
 *    atlas_plan_mode_interview_phase 缺省 false 整砍 → env-only 门，delta ③）。
 *  - 短 description() 串 2 件（旧 def description() 体）→ DESCRIPTION 常量
 *    留导出不接线（TUI 波前向接缝，S-D3 DESCRIPTION 族先例）。
 *  - planModeV2.ts 域外未登记面（本波 7 文件不消费，S-E3 A 路 NOTE-4
 *    登记）：旧仓另 3 件 getPlanModeV2AgentCount（planModeV2.ts:4）/
 *    getPlanModeV2ExploreAgentCount（L17）/ getPewterLedgerVariant（L72），
 *    旧消费面 = messages.ts:3195/3225/3226（plan-mode prompt/query/附件
 *    面）→ 裁 + 登记（新仓消息域未落，前向接缝待消息域后续波认领）。
 *
 * 消费方：EnterPlanModeTool.description（= getEnterPlanModeToolPrompt，
 * 唯一 prompt 面）/ ExitPlanModeV2Tool.description（= EXIT_PLAN_MODE_V2_TOOL_PROMPT）
 * + Enter mapResult interview 双变体门（isPlanModeInterviewPhaseEnabled）。
 */
import { isEnvDefinedFalsy, isEnvTruthy } from '../../../shared'
import { ASK_USER_QUESTION_TOOL_NAME } from '../toolNames'

/**
 * Check if plan mode interview phase is enabled.
 *
 * delta ③：旧仓 = env ATLAS_PLAN_MODE_INTERVIEW_PHASE 显式覆写 + GrowthBook 门
 * atlas_plan_mode_interview_phase（缺省 false）；新仓无 GB → env-only 门
 * （true/false 显式覆写逐字，未设 = false ≡ 旧 GB 缺省 false，GA 缺省关）。
 * isCronEnabled 同族 env kill-switch 先例。
 */
export function isPlanModeInterviewPhaseEnabled(): boolean {
  const env = process.env.ATLAS_PLAN_MODE_INTERVIEW_PHASE
  if (isEnvTruthy(env)) return true
  if (isEnvDefinedFalsy(env)) return false
  return false
}

const WHAT_HAPPENS_SECTION = `## What Happens in Plan Mode

In plan mode, you'll:
1. Thoroughly explore the codebase using Glob, Grep, and Read tools
2. Understand existing patterns and architecture
3. Design an implementation approach
4. Present your plan to the user for approval
5. Use ${ASK_USER_QUESTION_TOOL_NAME} if you need to clarify approaches
6. Exit plan mode with ExitPlanMode when ready to implement

`

function getEnterPlanModeToolPromptExternal(): string {
  // When interview phase is enabled, omit the "What Happens" section —
  // detailed workflow instructions arrive via the plan_mode attachment (messages.ts).
  const whatHappens = isPlanModeInterviewPhaseEnabled()
    ? ''
    : WHAT_HAPPENS_SECTION

  return `Use this tool proactively when you're about to start a non-trivial implementation task. Getting user sign-off on your approach before writing code prevents wasted effort and ensures alignment. This tool transitions you into plan mode where you can explore the codebase and design an implementation approach for user approval.

## When to Use This Tool

**Prefer using EnterPlanMode** for implementation tasks unless they're simple. Use it when ANY of these conditions apply:

1. **New Feature Implementation**: Adding meaningful new functionality
   - Example: "Add a logout button" - where should it go? What should happen on click?
   - Example: "Add form validation" - what rules? What error messages?

2. **Multiple Valid Approaches**: The task can be solved in several different ways
   - Example: "Add caching to the API" - could use Redis, in-memory, file-based, etc.
   - Example: "Improve performance" - many optimization strategies possible

3. **Code Modifications**: Changes that affect existing behavior or structure
   - Example: "Update the login flow" - what exactly should change?
   - Example: "Refactor this component" - what's the target architecture?

4. **Architectural Decisions**: The task requires choosing between patterns or technologies
   - Example: "Add real-time updates" - WebSockets vs SSE vs polling
   - Example: "Implement state management" - Redux vs Context vs custom solution

5. **Multi-File Changes**: The task will likely touch more than 2-3 files
   - Example: "Refactor the authentication system"
   - Example: "Add a new API endpoint with tests"

6. **Unclear Requirements**: You need to explore before understanding the full scope
   - Example: "Make the app faster" - need to profile and identify bottlenecks
   - Example: "Fix the bug in checkout" - need to investigate root cause

7. **User Preferences Matter**: The implementation could reasonably go multiple ways
   - If you would use ${ASK_USER_QUESTION_TOOL_NAME} to clarify the approach, use EnterPlanMode instead
   - Plan mode lets you explore first, then present options with context

## When NOT to Use This Tool

Only skip EnterPlanMode for simple tasks:
- Single-line or few-line fixes (typos, obvious bugs, small tweaks)
- Adding a single function with clear requirements
- Tasks where the user has given very specific, detailed instructions
- Pure research/exploration tasks (use the Agent tool with explore agent instead)

${whatHappens}## Examples

### GOOD - Use EnterPlanMode:
User: "Add user authentication to the app"
- Requires architectural decisions (session vs JWT, where to store tokens, middleware structure)

User: "Optimize the database queries"
- Multiple approaches possible, need to profile first, significant impact

User: "Implement dark mode"
- Architectural decision on theme system, affects many components

User: "Add a delete button to the user profile"
- Seems simple but involves: where to place it, confirmation dialog, API call, error handling, state updates

User: "Update the error handling in the API"
- Affects multiple files, user should approve the approach

### BAD - Don't use EnterPlanMode:
User: "Fix the typo in the README"
- Straightforward, no planning needed

User: "Add a console.log to debug this function"
- Simple, obvious implementation

User: "What files handle routing?"
- Research task, not implementation planning

## Important Notes

- This tool REQUIRES user approval - they must consent to entering plan mode
- If unsure whether to use it, err on the side of planning - it's better to get alignment upfront than to redo work
- Users appreciate being consulted before significant changes are made to their codebase
`
}

export function getEnterPlanModeToolPrompt(): string {
  return getEnterPlanModeToolPromptExternal()
}

// delta ②：旧仓硬编码 'AskUserQuestion'（stub 注释）→ toolNames 单一事实源
// （值同，行为等价）
export const EXIT_PLAN_MODE_V2_TOOL_PROMPT = `Use this tool when you are in plan mode and have finished writing your plan to the plan file and are ready for user approval.

## How This Tool Works
- You should have already written your plan to the plan file specified in the plan mode system message
- This tool does NOT take the plan content as a parameter - it will read the plan from the file you wrote
- This tool simply signals that you're done planning and ready for the user to review and approve
- The user will see the contents of your plan file when they review it

## When to Use This Tool
IMPORTANT: Only use this tool when the task requires planning the implementation steps of a task that requires writing code. For research tasks where you're gathering information, searching files, reading files or in general trying to understand the codebase - do NOT use this tool.

## Before Using This Tool
Ensure your plan is complete and unambiguous:
- If you have unresolved questions about requirements or approach, use ${ASK_USER_QUESTION_TOOL_NAME} first (in earlier phases)
- Once your plan is finalized, use THIS tool to request approval

**Important:** Do NOT use ${ASK_USER_QUESTION_TOOL_NAME} to ask "Is this plan okay?" or "Should I proceed?" - that's exactly what THIS tool does. ExitPlanMode inherently requests user approval of your plan.

## Examples

1. Initial task: "Search for and understand the implementation of vim mode in the codebase" - Do not use the exit plan mode tool because you are not planning the implementation steps of a task.
2. Initial task: "Help me implement yank mode for vim" - Use the exit plan mode tool after you have finished planning the implementation steps of the task.
3. Initial task: "Add a new feature to handle user authentication" - If unsure about auth method (OAuth, JWT, etc.), use ${ASK_USER_QUESTION_TOOL_NAME} first, then use exit plan mode tool after clarifying the approach.
`

// 旧 def 短 description() 体（留导出不接线 = TUI 波前向接缝，S-D3 族先例）
export const ENTER_PLAN_MODE_DESCRIPTION =
  'Requests permission to enter plan mode for complex tasks requiring exploration and design'
export const EXIT_PLAN_MODE_V2_DESCRIPTION =
  'Prompts the user to exit plan mode and start coding'
