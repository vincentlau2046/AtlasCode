/**
 * messaging 域 — 直接成员消息（@agent 语法旁路模型）（E-7 S-7e d1，§8.50）。
 *
 * 旧仓来源（a8af45b）：src/utils/directMemberMessage.ts 69L 随迁（算法体
 * 逐字）。
 *
 * 类型面 delta 登记（H6，复审勿当遗漏重提）：
 *   - 旧 `teamContext: AppState['teamContext']`（旧 state/AppStateStore.ts:313
 *     全形：teamName/teamFilePath/leadAgentId/selfAgent 族/isLeader/teammates
 *     全字段）→ 域内最小 duck（本文件仅消费 teamName + teammates 按 name
 *     查找两字段面；teammates 值 duck { name: string; [key: string]: unknown }）；
 *     旧体 `as Record<string, any>` cast 随 duck 定型删（语义逐字）。
 *   - writeToMailbox 参数保持注入函数面（旧 WriteToMailboxFn 形逐字；组合根
 *     注入真 mailbox 面 = E-wave-end 前向接缝）。
 */

/** 旧 AppState['teamContext'] 全形 → 域内最小 duck（见文件头登记）。 */
type TeamContext = {
  teamName: string
  teammates?: Record<string, { name: string; [key: string]: unknown }>
}

/**
 * Parse `@agent-name message` syntax for direct team member messaging.
 */
export function parseDirectMemberMessage(input: string): {
  recipientName: string
  message: string
} | null {
  const match = input.match(/^@([\w-]+)\s+(.+)$/s)
  if (!match) return null

  const [, recipientName, message] = match
  if (!recipientName || !message) return null

  const trimmedMessage = message.trim()
  if (!trimmedMessage) return null

  return { recipientName, message: trimmedMessage }
}

export type DirectMessageResult =
  | { success: true; recipientName: string }
  | {
      success: false
      error: 'no_team_context' | 'unknown_recipient'
      recipientName?: string
    }

type WriteToMailboxFn = (
  recipientName: string,
  message: { from: string; text: string; timestamp: string },
  teamName: string,
) => Promise<void>

/**
 * Send a direct message to a team member, bypassing the model.
 */
export async function sendDirectMemberMessage(
  recipientName: string,
  message: string,
  teamContext: TeamContext | undefined,
  writeToMailbox?: WriteToMailboxFn,
): Promise<DirectMessageResult> {
  if (!teamContext || !writeToMailbox) {
    return { success: false, error: 'no_team_context' }
  }

  // Find team member by name
  const member = Object.values(teamContext.teammates ?? {}).find(
    t => t.name === recipientName,
  )

  if (!member) {
    return { success: false, error: 'unknown_recipient', recipientName }
  }

  await writeToMailbox(
    recipientName,
    {
      from: 'user',
      text: message,
      timestamp: new Date().toISOString(),
    },
    teamContext.teamName,
  )

  return { success: true, recipientName }
}
