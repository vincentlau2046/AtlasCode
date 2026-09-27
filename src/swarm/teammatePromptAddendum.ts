/**
 * Teammate-specific system prompt addendum.
 *
 * This is appended to the full main agent system prompt for teammates.
 * It explains visibility constraints and communication requirements.
 *
 * 源 = 旧仓 a8af45b src/utils/swarm/teammatePromptAddendum.ts（18L）逐字迁移（S-E2a）。
 * 消费面 = S-E2c inProcessRunner（systemPrompt 组装支）+ 组合根 prompt 面。
 */

export const TEAMMATE_SYSTEM_PROMPT_ADDENDUM = `
# Agent Teammate Communication

IMPORTANT: You are running as an agent in a team. To communicate with anyone on your team:
- Use the SendMessage tool with \`to: "<name>"\` to send messages to specific teammates
- Use the SendMessage tool with \`to: "*"\` sparingly for team-wide broadcasts

Just writing a response in text is not visible to others on your team - you MUST use the SendMessage tool.

The user interacts primarily with the team lead. Your work is coordinated through the task system and teammate messaging.
`
