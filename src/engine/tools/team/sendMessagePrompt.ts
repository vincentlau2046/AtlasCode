/**
 * engine/tools/team — SendMessageTool prompt 面（S-E2 §8.62 team/collab 族子波；
 * §8.68 remote 波 S-E2a UDS 门复活）。
 *
 * 旧仓来源（a8af45b）：src/tools/SendMessageTool/prompt.ts 49L 裁剪随迁：
 * DESCRIPTION 短常量逐字 + PROMPT = 旧 getPrompt() gate-off（.trim() 结果）
 * 逐字锚点。§8.62 时 feature('UDS_INBOX') 2 站点（to 列 UDS/bridge 2 行 +
 * Cross-section 段）裁登记 remote 波 → **§8.68 S-E2a 复活**：门 =
 * isUdsInboxEnabled（env opt-in，默认 OFF = 旧 gate-OFF 保真）；
 * getSendMessagePrompt() 每次访问重读门（env live），gate-off = PROMPT
 * 逐字（单一事实源模板 = buildPrompt，PROMPT = gate-off 形）。
 *
 * 消费方 = 本体 description()（getSendMessagePrompt 面）+ team/ 子门面 +
 * tools/ 门面 SEND_MESSAGE_DESCRIPTION / SEND_MESSAGE_PROMPT 别名 re-export。
 */
import { isUdsInboxEnabled } from '../../../remote'

export const DESCRIPTION = 'Send a message to another agent'

// UDS 门-on 面（旧仓 getPrompt() udsRow/udsSection 2 站点逐字，§8.68 S-E2a）
const UDS_ROW = `
| \`"uds:/path/to.sock"\` | Local Claude session's socket (same machine; use \`ListPeers\`) |
| \`"bridge:session_..."\` | Remote Control peer session (cross-machine; use \`ListPeers\`) |`
const UDS_SECTION = `

## Cross-session

Use \`ListPeers\` to discover targets, then:

\`\`\`json
{"to": "uds:/tmp/cc-socks/1234.sock", "message": "check if tests pass over there"}
{"to": "bridge:session_01AbCd...", "message": "what branch are you on?"}
\`\`\`

A listed peer is alive and will process your message — no "busy" state; messages enqueue and drain at the receiver's next tool round. Your message arrives wrapped as \`<cross-session-message from="...">\`. **To reply to an incoming message, copy its \`from\` attribute as your \`to\`.**`

/** 单一事实源模板（旧仓 getPrompt() 模板逐字：udsRow 在 to 表 "*" 行尾、
 * udsSection 在 Protocol responses 段前；.trim() 旧仓同面）。 */
function buildPrompt(udsRow: string, udsSection: string): string {
  return `
# SendMessage

Send a message to another agent.

\`\`\`json
{"to": "researcher", "summary": "assign task 1", "message": "start on task #1"}
\`\`\`

| \`to\` | |
|---|---|
| \`"researcher"\` | Teammate by name |
| \`"*"\` | Broadcast to all teammates — expensive (linear in team size), use only when everyone genuinely needs it |${udsRow}

Your plain text output is NOT visible to other agents — to communicate, you MUST call this tool. Messages from teammates are delivered automatically; you don't check an inbox. Refer to teammates by name, never by UUID. When relaying, don't quote the original — it's already rendered to the user.${udsSection}

## Protocol responses (legacy)

If you receive a JSON message with \`type: "shutdown_request"\` or \`type: "plan_approval_request"\`, respond with the matching \`_response\` type — echo the \`request_id\`, set \`approve\` true/false:

\`\`\`json
{"to": "team-lead", "message": {"type": "shutdown_response", "request_id": "...", "approve": true}}
{"to": "researcher", "message": {"type": "plan_approval_response", "request_id": "...", "approve": false, "feedback": "add error handling"}}
\`\`\`

Approving shutdown terminates your process. Rejecting plan sends the teammate back to revise. Don't originate \`shutdown_request\` unless asked. Don't send structured JSON status messages — use TaskUpdate.`.trim()
}

// 旧 getPrompt() gate-off 模板 .trim() 结果逐字（S-E2 §8.62 落盘锚点 =
// buildPrompt('', '')，既有导出面不变）
export const PROMPT = buildPrompt('', '')

/**
 * prompt 面（§8.68 S-E2a 门复活）：每次访问重读 isUdsInboxEnabled（env
 * live）；gate-off = PROMPT 逐字，gate-on = 全模板（udsRow/udsSection
 * 旧仓位置逐字）。
 */
export function getSendMessagePrompt(): string {
  const on = isUdsInboxEnabled()
  return buildPrompt(on ? UDS_ROW : '', on ? UDS_SECTION : '')
}
