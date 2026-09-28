/**
 * engine/tools/skill — SkillTool prompt 面转写（§8.67 D 波 S-E2b；
 * 旧仓 src/tools/SkillTool/prompt.ts 213L 落面）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① lodash memoize（lodash-es 不在新仓依赖面）→ 复用 skill 域本地最小
 *    memoize（../../skill 子门面；首参键 + .cache 面同形）；getSkillPrompt
 *    memoize 键 = cwd（旧 getPrompt memoize 同面，模板体不含 cwd）。
 *  ② ink/stringWidth（grapheme / 全角宽度感知）→ 本地最小宽度面（ASCII
 *    字符数，CJK 全角语义差登记：预算计量对全角字符偏窄 → 描述截断
 *    略滞后，非阻塞）；本地 truncate（宽感知 '…' 尾标 → 本地 50 面同型，
 *    webToolInput truncateSummary / cronListTool 本地宽度面先例）。
 *  ③ utils/array count 支 = 截断遥测（旧 de-ANT 注释面）→ 整支裁。
 *  ④ 旧短 description 面（旧 SkillTool description() = `Execute skill:
 *    ${skill}`）→ 不接线：新契约唯一 prompt 面 = Tool.description()
 *    （webFetchTool delta ③ 先例），本文件 getSkillPrompt 为其实现体；
 *    旧短面属 TUI 展示面 → TUI 波。
 *  ⑤ 消费方（analyzeContext / attachments / TUI listing / token 计数）=
 *    消息/REPL/TUI 波前向接缝（新仓当前 0 命中）；getSkillPrompt 已接线
 *    Tool.description()（description 面，skillTool.ts）。
 *  ⑥ COMMAND_NAME_TAG / getCommandName / getSkillToolCommands /
 *    getSlashCommandToolSkills / memoize 经 ../../skill 子门面（engine
 *    域内跨子域相对 import，forkedAgent.ts `../tools/agent` 先例）。
 *  ⑦ 旧 formatCommandDescription 的 cmd.type === 'prompt' 判据（local/
 *    local-jsx 联合面）→ 新 Command prompt 单形（S-E2a 裁面 ①）→ 判据
 *    裁（source === 'bundled' / 'plugin' 字面量面逐字保留）。
 */
import {
  COMMAND_NAME_TAG,
  getCommandName,
  getSkillToolCommands,
  getSlashCommandToolSkills,
  memoize,
  type Command,
} from '../../skill'
import { logError, logForDebugging, toError } from '../../../shared'

// Skill listing gets 1% of the context window (in characters)
export const SKILL_BUDGET_CONTEXT_PERCENT = 0.01
export const CHARS_PER_TOKEN = 4
export const DEFAULT_CHAR_BUDGET = 8_000 // Fallback: 1% of 200k × 4

// Per-entry hard cap. The listing is for discovery only — the Skill tool loads
// full content on invoke, so verbose whenToUse strings waste turn-1
// cache_creation tokens without improving match rate. Applies to all entries,
// including bundled, since the cap is generous enough to preserve the core
// use case.
export const MAX_LISTING_DESC_CHARS = 250

/** 本地最小宽度面（delta ②：旧 ink stringWidth 全角感知 → ASCII 字符数）。 */
export function stringWidth(str: string): number {
  return str.length
}

/** 本地最小 truncate（delta ②：旧 utils/format 宽感知 '…' 尾标 → 本地面）。 */
export function truncate(str: string, maxWidth: number): string {
  if (stringWidth(str) <= maxWidth) return str
  return str.slice(0, Math.max(0, maxWidth - 1)) + '…'
}

export function getCharBudget(contextWindowTokens?: number): number {
  if (Number(process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET)) {
    return Number(process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET)
  }
  if (contextWindowTokens) {
    return Math.floor(
      contextWindowTokens * CHARS_PER_TOKEN * SKILL_BUDGET_CONTEXT_PERCENT,
    )
  }
  return DEFAULT_CHAR_BUDGET
}

function getCommandDescription(cmd: Command): string {
  const desc = cmd.whenToUse
    ? `${cmd.description} - ${cmd.whenToUse}`
    : cmd.description
  return desc.length > MAX_LISTING_DESC_CHARS
    ? desc.slice(0, MAX_LISTING_DESC_CHARS - 1) + '…'
    : desc
}

function formatCommandDescription(cmd: Command): string {
  // Debug: log if userFacingName differs from cmd.name for plugin skills
  const displayName = getCommandName(cmd)
  if (cmd.name !== displayName && cmd.source === 'plugin') {
    logForDebugging(
      `Skill prompt: showing "${cmd.name}" (userFacingName="${displayName}")`,
    )
  }

  return `- ${cmd.name}: ${getCommandDescription(cmd)}`
}

const MIN_DESC_LENGTH = 20

export function formatCommandsWithinBudget(
  commands: Command[],
  contextWindowTokens?: number,
): string {
  if (commands.length === 0) return ''

  const budget = getCharBudget(contextWindowTokens)

  // Try full descriptions first
  const fullEntries = commands.map(cmd => ({
    cmd,
    full: formatCommandDescription(cmd),
  }))
  // join('\n') produces N-1 newlines for N entries
  const fullTotal =
    fullEntries.reduce((sum, e) => sum + stringWidth(e.full), 0) +
    (fullEntries.length - 1)

  if (fullTotal <= budget) {
    return fullEntries.map(e => e.full).join('\n')
  }

  // Partition into bundled (never truncated) and rest
  const bundledIndices = new Set<number>()
  const restCommands: Command[] = []
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]!
    if (cmd.source === 'bundled') {
      bundledIndices.add(i)
    } else {
      restCommands.push(cmd)
    }
  }

  // Compute space used by bundled skills (full descriptions, always preserved)
  const bundledChars = fullEntries.reduce(
    (sum, e, i) => (bundledIndices.has(i) ? sum + stringWidth(e.full) + 1 : sum),
    0,
  )
  const remainingBudget = budget - bundledChars

  // Calculate max description length for non-bundled commands
  if (restCommands.length === 0) {
    return fullEntries.map(e => e.full).join('\n')
  }

  const restNameOverhead =
    restCommands.reduce((sum, cmd) => sum + stringWidth(cmd.name) + 4, 0) +
    (restCommands.length - 1)
  const availableForDescs = remainingBudget - restNameOverhead
  const maxDescLen = Math.floor(availableForDescs / restCommands.length)

  if (maxDescLen < MIN_DESC_LENGTH) {
    // Extreme case: non-bundled go names-only, bundled keep descriptions
    // de-ANT: the ant-only truncation telemetry was removed.
    return commands
      .map((cmd, i) =>
        bundledIndices.has(i) ? fullEntries[i]!.full : `- ${cmd.name}`,
      )
      .join('\n')
  }

  // Truncate non-bundled descriptions to fit within budget
  return commands
    .map((cmd, i) => {
      // Bundled skills always get full descriptions
      if (bundledIndices.has(i)) return fullEntries[i]!.full
      const description = getCommandDescription(cmd)
      return `- ${cmd.name}: ${truncate(description, maxDescLen)}`
    })
    .join('\n')
}

/**
 * Skill 工具主 prompt（旧 getPrompt 逐字模板，delta ① 本地 memoize；
 * delta ④ = Tool.description() 唯一 prompt 面实现体）。
 */
export const getSkillPrompt = memoize(async (_cwd: string): Promise<string> => {
  return `Execute a skill within the main conversation

When users ask you to perform tasks, check if any of the available skills match. Skills provide specialized capabilities and domain knowledge.

When users reference a "slash command" or "/<something>" (e.g., "/commit", "/review-pr"), they are referring to a skill. Use this tool to invoke it.

How to invoke:
- Use this tool with the skill name and optional arguments
- Examples:
  - \`skill: "pdf"\` - invoke the pdf skill
  - \`skill: "commit", args: "-m 'Fix bug'"\` - invoke with arguments
  - \`skill: "review-pr", args: "123"\` - invoke with arguments
  - \`skill: "ms-office-suite:pdf"\` - invoke using fully qualified name

Important:
- Available skills are listed in system-reminder messages in the conversation
- When a skill matches the user's request, this is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
- NEVER mention a skill without actually calling this tool
- Do not invoke a skill that is already running
- Do not use this tool for built-in CLI commands (like /help, /clear, etc.)
- If you see a <${COMMAND_NAME_TAG}> tag in the current conversation turn, the skill has ALREADY been loaded - follow the instructions directly instead of calling this tool again
`
})

/**
 * Skill 工具命令计数面（旧 getSkillToolInfo 逐字；消费方 = 消息/REPL 波
 * 前向接缝，delta ⑤）。
 */
export async function getSkillToolInfo(cwd: string): Promise<{
  totalCommands: number
  includedCommands: number
}> {
  const agentCommands = await getSkillToolCommands(cwd)

  return {
    totalCommands: agentCommands.length,
    includedCommands: agentCommands.length,
  }
}

// Returns the commands included in the SkillTool prompt.
// All commands are always included (descriptions may be truncated to fit budget).
// Used by analyzeContext to count skill tokens.（消费方 = 消息/REPL 波，delta ⑤）
export function getLimitedSkillToolCommands(cwd: string): Promise<Command[]> {
  return getSkillToolCommands(cwd)
}

export function clearPromptCache(): void {
  getSkillPrompt.cache?.clear?.()
}

/**
 * 技能计数面（旧 getSkillInfo 逐字：getSlashCommandToolSkills try/catch →
 * zeros + logError；消费方 = 消息/REPL 波，delta ⑤）。
 */
export async function getSkillInfo(cwd: string): Promise<{
  totalSkills: number
  includedSkills: number
}> {
  try {
    const skills = await getSlashCommandToolSkills(cwd)

    return {
      totalSkills: skills.length,
      includedSkills: skills.length,
    }
  } catch (error) {
    logError(toError(error))

    // Return zeros rather than throwing - let caller decide how to handle
    return {
      totalSkills: 0,
      includedSkills: 0,
    }
  }
}
