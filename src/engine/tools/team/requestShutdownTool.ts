/**
 * engine/tools/team — RequestShutdownTool 本体（0.1.96 A1 插入波；
 * f4 lock-face docs/2026-11-11-a1-requestshutdown-lockface.md 批复
 * 2026-11-11，工单 docs/2026-11-11-p0-wave-a1-requestshutdown-ticket.md
 * §7 审计修订后）。
 *
 * 语义：成员**主动**向 lead 提交退出请求。批准权完全在 lead——本工具
 * 仅投递请求（shutdown_request_from_member 写 lead 信箱），不改变本
 * 进程任何生命周期态（副效应白名单见 lock-face §副效应白名单：
 * 仅一次 mailbox 写 + 返回文案；判别格 static 断言钉死）。
 *
 * lead 消费形态（lock-face ③④）：批准 = lead 发既有 shutdown_request
 *（成员既有高优扫描 + handleShutdownApproval 全链复用，零新终态写点）；
 * 拒绝 = lead 发 shutdown_request_denied（本工具模块级 deny 锁存感知，
 * 防环补强 1）。lead 发现面 = WaitForTeammates 输出面 pending_requests
 * 扩格（waitForTeammatesTool.collectPendingMemberRequests，不 mark read
 * ——read 态推进点在 lead 处置动作，f4 硬条件 2）。
 *
 * 防环四补强落形（lock-face ⑤）：
 *  1. deny 锁存 = 模块级态（per-member；解锁枚举 = runner poll 的
 *     new_message / shutdown_request 事件调 clearMemberShutdownRequestState，
 *     deny echo 本身不自解锁——防自指）；锁存期调用 fail-visible 零写。
 *  2. 在途唯一性 = 模块级 pending 标记 ∪ lead inbox 本成员 unread 请求
 *    双查；命中任一 = fail-visible「在途待裁」，不重写。
 *  3. 双向竞态 = lead 直接下发 shutdown_request 时成员高优扫描优先，
 *    自发在途请求自动失效（pending 清理点在 runner 主循环）。
 *  4. deny 两态（显式回执 / 不作为）均 fail-visible（本工具返回文案）。
 */
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
} from '../../../shared'
import {
  TEAM_LEAD_NAME,
  createShutdownRequestFromMemberMessage,
  getAgentName,
  getTeammateColor,
  getTeamName,
  isAgentSwarmsEnabled,
  isShutdownRequestFromMember,
  isTeammate,
  readMailbox,
  writeToMailbox,
} from '../../messaging'
import { jsonStringify } from '../../session/json'
import { REQUEST_SHUTDOWN_TOOL_NAME } from '../toolNames'

/** 输入 JSON schema（reason 单可选参；additionalProperties false 同族）。 */
export const REQUEST_SHUTDOWN_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    reason: {
      type: 'string',
      description:
        'Why you are requesting to shut down (task complete, persistently blocked, etc.)',
    },
  },
  additionalProperties: false,
}

export type RequestShutdownInput = {
  reason?: string
}

export type RequestShutdownOutput = {
  success: boolean
  message: string
}

/** 请求 id 形（lock-face ②：rs-${timestamp} 形）。 */
function generateMemberRequestId(): string {
  return `rs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── 模块级成员态机（防环补强 1/2：deny 锁存 + 在途 pending）──
// 成员进程内 per-member；Map/Set 键 = memberName（成员至多一在途请求，
// lock-face read 态推进点判别域）。
const pendingByMember = new Map<string, string>()
const deniedByMember = new Set<string>()

/** 该成员是否有在途退出请求（防环补强 2 模块级支）。 */
export function isMemberShutdownRequestPending(memberName: string): boolean {
  return pendingByMember.has(memberName)
}

/** 直读在途 request id（测试/runner 关联面）。 */
export function peekPendingMemberShutdownRequest(
  memberName: string,
): string | undefined {
  return pendingByMember.get(memberName)
}

/** deny 锁存登记（runner poll 感知 shutdown_request_denied 回执时调用）。 */
export function recordMemberShutdownRequestDenied(
  memberName: string,
  _requestId: string,
): void {
  deniedByMember.add(memberName)
  pendingByMember.delete(memberName)
}

/** 锁存解锁（runner 在 new_message / shutdown_request 事件时调用——
 * 新输入才允许再次请求；deny echo 路径不得调用本函数）。 */
export function clearMemberShutdownRequestState(memberName: string): void {
  deniedByMember.delete(memberName)
  pendingByMember.delete(memberName)
}

/** pending 清理（lead 直接下发请求覆盖自发在途请求时的失效面）。 */
export function clearMemberPendingShutdownRequest(memberName: string): void {
  pendingByMember.delete(memberName)
}

/** 测试态重置（判别格隔离面；生产路径不调用）。 */
export function resetRequestShutdownStateForTest(): void {
  pendingByMember.clear()
  deniedByMember.clear()
}

// Tool 契约非参数化（WaitForTeammatesToolFace 同族）。
type RequestShutdownToolFace = Tool & {
  call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<RequestShutdownOutput>>
}

export const RequestShutdownTool: RequestShutdownToolFace = {
  name: REQUEST_SHUTDOWN_TOOL_NAME,
  inputSchema: REQUEST_SHUTDOWN_TOOL_INPUT_SCHEMA,
  inputJSONSchema: REQUEST_SHUTDOWN_TOOL_INPUT_SCHEMA,
  strict: true,
  searchHint: 'ask the team lead to approve this teammate shutting down',
  maxResultSizeChars: 10_000,
  shouldDefer: true,
  // 门控槽：swarm 开 + 本会话是 teammate（工单候选：lead 不可见本工具）
  isEnabled: () => isAgentSwarmsEnabled() && isTeammate(),
  // 副效应白名单面：唯一动作 = 一次 mailbox 写（文件写，非只读）
  isReadOnly: () => false,
  isDestructive: () => false,
  isConcurrencySafe: () => true,
  userFacingName: () => 'Request Shutdown',
  toAutoClassifierInput: () => '',
  async checkPermissions(input: unknown) {
    return { behavior: 'allow' as const, updatedInput: input }
  },
  mapToolResultToToolResultBlockParam(
    data: RequestShutdownOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: [
        {
          type: 'text' as const,
          text: data.message,
        },
      ],
    }
  },
  async description(): Promise<string> {
    return (
      'Request permission from the team lead to shut down. Use when your ' +
      'task is complete or you are persistently blocked with no further ' +
      'progress possible. This only submits the request — the lead decides ' +
      'whether to approve it. If a previous request was denied, wait for ' +
      'new input before requesting again.'
    )
  },
  renderToolUseMessage(input: unknown): unknown {
    const { reason } = (input ?? {}) as RequestShutdownInput
    return reason ? `requesting shutdown: ${reason}` : 'requesting shutdown'
  },
  async call(
    args: unknown,
  ): Promise<ToolResult<RequestShutdownOutput>> {
    const { reason } = (args ?? {}) as RequestShutdownInput
    const memberName = getAgentName()
    if (!memberName) {
      return {
        data: {
          success: false,
          message:
            'No teammate identity available; cannot submit a shutdown request.',
        },
      }
    }
    const teamName = getTeamName()

    // 防环补强 1：deny 锁存期 = fail-visible 零写（unlock 枚举 = runner
    // new_message / shutdown_request 事件，见 clearMemberShutdownRequestState
    // 消费点）。
    if (deniedByMember.has(memberName)) {
      return {
        data: {
          success: false,
          message:
            'Your previous shutdown request was denied by the lead. ' +
            'Wait for new input before requesting again.',
        },
      }
    }

    // 防环补强 2：在途唯一性双查（模块级 pending ∪ lead inbox 本成员
    // unread 请求）——命中任一 fail-visible，不重写。
    const existingId = peekPendingMemberShutdownRequest(memberName)
    if (existingId) {
      return {
        data: {
          success: false,
          message: `A shutdown request (${existingId}) is already pending with the lead.`,
        },
      }
    }
    try {
      const leadMessages = await readMailbox(TEAM_LEAD_NAME, teamName)
      // 0.1.96 §9 安全硬化（f4 批复 23588bfc 修③）：身份以 envelope m.from
      // 为准——body req.from 仅展示用途（防伪造他人名占用唯一在途名额）。
      const ownUnread = leadMessages.some(
        m => {
          const req = isShutdownRequestFromMember(m.text)
          return (
            !m.read &&
            !!req &&
            m.from.toLowerCase() === req.from.toLowerCase() &&
            m.from.toLowerCase() === memberName.toLowerCase()
          )
        },
      )
      if (ownUnread) {
        return {
          data: {
            success: false,
            message:
              'A shutdown request from you is already pending with the lead.',
          },
        }
      }
    } catch {
      // lead inbox 读失败不阻断投递（writeToMailbox 自身有锁与目录保证）
    }

    // 副效应白名单：恰一写（shutdown_request_from_member → lead inbox）。
    const requestId = generateMemberRequestId()
    await writeToMailbox(
      TEAM_LEAD_NAME,
      {
        from: memberName,
        text: jsonStringify(
          createShutdownRequestFromMemberMessage({
            requestId,
            from: memberName,
            reason,
          }),
        ),
        timestamp: new Date().toISOString(),
        color: getTeammateColor(),
      },
      teamName,
    )
    pendingByMember.set(memberName, requestId)

    return {
      data: {
        success: true,
        message:
          'Shutdown request submitted to the team lead. Approval is the ' +
          "lead's decision — you will keep working until the lead sends " +
          'a shutdown request back (approve) or a denial receipt.',
      },
    }
  },
}
