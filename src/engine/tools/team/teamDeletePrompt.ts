/**
 * engine/tools/team — TeamDeleteTool prompt 伴随件（C 桶 ③ shell·swarm 波
 * S-E2d；§8.66 补差侧，旧仓 tools/TeamDeleteTool/prompt.ts 16L 逐字）。
 *
 * 旧仓来源（a8af45b）：getPrompt() 模板体逐字（.trim() 锚点 = 旧 gate-off
 * 支结果，sendMessageTool delta ⑧ 同款口径）；旧 def description() 短描述
 * 文案 = DESCRIPTION（经 team/ 子门面 TEAM_DELETE_DESCRIPTION 别名 re-export，
 * web 族口径）。
 */

/** 旧 def description() 逐字。 */
export const DESCRIPTION =
  'Clean up team and task directories when the swarm is complete'

/** 旧 getPrompt() 模板体逐字（.trim() 锚点）。 */
export const PROMPT = `
# TeamDelete

Remove team and task directories when the swarm work is complete.

This operation:
- Removes the team directory (\`~/.atlas/teams/{team-name}/\`)
- Removes the task directory (\`~/.atlas/tasks/{team-name}/\`)
- Clears team context from the current session

**IMPORTANT**: TeamDelete will fail if the team still has active members. Gracefully terminate teammates first, then call TeamDelete after all teammates have shut down.

Use this when all teammates have finished their work and you want to clean up the team resources. The team name is automatically determined from the current session's team context.
`.trim()
