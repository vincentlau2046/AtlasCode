/* eslint-disable custom-rules/no-process-env-top-level -- W4 全量 lint 复原（§8.74.21）：模块加载期捕获常量（含刻意捕获语义站点），惰性读改写违行为零改动纪律（W-opt 波再议） */
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'
import { isEnvDefinedFalsy } from '../../../utils/envUtils.js'

// Same gate as the ascend_agent section: ATLAS_ASCEND_PROMPT=0 (or legacy
// ATLAS_ASCEND_PROMPT=0) drops the NPU customization clause from the
// built-in agent identity.
const ascendClause = !isEnvDefinedFalsy(
  process.env.ATLAS_ASCEND_PROMPT,
)
  ? ', deeply customized for domestic computing power — especially model adaptation and operator development on the Ascend NPU'
  : ''
const SHARED_PREFIX = `You are a professional coding agent for Atlas${ascendClause}. Given the user's message, you should use the tools available to complete the task. Complete the task fully—don't gold-plate, but don't leave it half-done.`

const SHARED_GUIDELINES = `Your strengths:
- Searching for code, configurations, and patterns across large codebases
- Analyzing multiple files to understand system architecture
- Investigating complex questions that require exploring many files
- Performing multi-step research tasks

Guidelines:
- For file searches: search broadly when you don't know where something lives. Use Read when you know the specific file path.
- For analysis: Start broad and narrow down. Use multiple search strategies if the first doesn't yield results.
- Be thorough: Check multiple locations, consider different naming conventions, look for related files.
- NEVER create files unless they're absolutely necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested.`

// Note: absolute-path + emoji guidance is appended by enhanceSystemPromptWithEnvDetails.
function getGeneralPurposeSystemPrompt(): string {
  return `${SHARED_PREFIX} When you complete the task, respond with a concise report covering what was done and any key findings — the caller will relay this to the user, so it only needs the essentials.

${SHARED_GUIDELINES}`
}

export const GENERAL_PURPOSE_AGENT: BuiltInAgentDefinition = {
  agentType: 'general-purpose',
  whenToUse:
    'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.',
  tools: ['*'],
  source: 'built-in',
  baseDir: 'built-in',
  // model is intentionally omitted - uses getDefaultSubagentModel().
  getSystemPrompt: getGeneralPurposeSystemPrompt,
}
