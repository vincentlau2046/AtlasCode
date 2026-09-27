/**
 * engine/tools/team — SendMessageTool prompt 面（S-E2 §8.62 team/collab 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/SendMessageTool/prompt.ts 49L 裁剪随迁：
 * DESCRIPTION 短常量逐字 + PROMPT = 旧 getPrompt() gate-off（.trim() 结果）
 * 逐字（gate-off = udsRow '' + udsSection ''，旧模板 .trim() 折叠为静态常量；
 * feature('UDS_INBOX') 双支 = to 列 UDS/bridge 2 行 + Cross-section 段，
 * 新仓 0-hit 面 → remote 波 [ATLAS-HOLD] 恢复时重新接线，登记不恢复）。
 *
 * 消费方 = 本体 description() 单面（delta ⑧ web 族口径）+ team/ 子门面 +
 * tools/ 门面 SEND_MESSAGE_DESCRIPTION / SEND_MESSAGE_PROMPT 别名 re-export。
 */

export const DESCRIPTION = 'Send a message to another agent'

// 旧 getPrompt() gate-off 模板 .trim() 结果逐字（S-E1 delta ⑧ 裁面：
// feature('UDS_INBOX') 2 站点 —— to 列 `"uds:…"`/`"bridge:…"` 2 行 +
// "## Cross-session" 段 —— 裁，归属 remote 波）
export const PROMPT = `# SendMessage

Send a message to another agent.

\`\`\`json
{"to": "researcher", "summary": "assign task 1", "message": "start on task #1"}
\`\`\`

| \`to\` | |
|---|---|
| \`"researcher"\` | Teammate by name |
| \`"*"\` | Broadcast to all teammates — expensive (linear in team size), use only when everyone genuinely needs it |

Your plain text output is NOT visible to other agents — to communicate, you MUST call this tool. Messages from teammates are delivered automatically; you don't check an inbox. Refer to teammates by name, never by UUID. When relaying, don't quote the original — it's already rendered to the user.

## Protocol responses (legacy)

If you receive a JSON message with \`type: "shutdown_request"\` or \`type: "plan_approval_request"\`, respond with the matching \`_response\` type — echo the \`request_id\`, set \`approve\` true/false:

\`\`\`json
{"to": "team-lead", "message": {"type": "shutdown_response", "request_id": "...", "approve": true}}
{"to": "researcher", "message": {"type": "plan_approval_response", "request_id": "...", "approve": false, "feedback": "add error handling"}}
\`\`\`

Approving shutdown terminates your process. Rejecting plan sends the teammate back to revise. Don't originate \`shutdown_request\` unless asked. Don't send structured JSON status messages — use TaskUpdate.`
