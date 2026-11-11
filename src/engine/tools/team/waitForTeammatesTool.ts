/**
 * engine/tools/team — WaitForTeammatesTool 本体（0.1.93 W-D-A round 5
 * 收敛原语，案 B；f4 锁面批复 = 形态 (i) 新工具 + 四硬约束）。
 *
 * 定因（f4 锁面实核单采纳）：engine 已有事件驱动等待原语
 * waitForTeammatesToBecomeIdle（engine/messaging/teammate.ts L257，S-E2b
 * 尾 3 落——在运行中成员 task 的 onIdleCallbacks 注册回调，idle 转换点
 * inProcessRunner 三处 forEach+清，含「注册前已 idle」race 校验）但
 * **零工具面消费**（仅 barrel re-export）——缺封装非缺实现。本工具 =
 * 该原语的工具面封装：一工具一轮替掉 N 轮轮询（轮经济收窄，⑤ 名义形
 * TEAM-OK→自然退出锚的 lead 侧机制）。
 *
 * 硬约束四条落形（f4 批复逐条）：
 *  a) 有界：input timeout（default 120000ms 对齐 LLM 120s 超时先例 /
 *    max 600000ms 对齐 TaskOutput 上限先例），Promise.race 单 setTimeout
 *    timer；超时返结构化 { status:'timeout', still_working } 非 throw
 *    非 fail-open 无限阻塞。
 *  b) stall 不误触：RepeatToolCallTracker 计数键 [toolName, args]，仅
 *    in-band 提醒无终止面；单次阻塞 wait = 1 工具调用 1 轮（不推进任何
 *    stall 计数），不产生连击链。
 *  c) 零忙等：阻塞在既有 idle 回调事件面（waitForTeammatesToBecomeIdle
 *    本体），超时单 timer race——无 polling 循环（gracefulShutdown 的
 *    250ms poll wait 是退出兜底路径，分工不混）。
 *  d) F3 不破坏：纯等待不 abort 不 kill；graceful 语义全在
 *    TeamDelete/shutdown 流，本工具只提供「等」。
 *
 * appState 缝 = SessionContextPort（engine/session/sessionContextPort.ts，
 * 组合根 compose.ts L311 注入）：headless lead 工具 ctx = TPC 窄视图
 *（RED-B 直证，tasks 不可达），gracefulShutdownInProcessTeammates 同缝
 * 取 appState（print.ts 先例）——不另开缝。端口未注入 = 结构化校验错误
 *（RED-B 同形 fail-closed）。
 *
 * 车道面（f4 回裁）：本波 engine-only，TUI lead 不接线（TUI/engine 双
 * Tool 契约独立、TUI 数组零 engine 成员、直入不可行；TUI 工具池不含
 * 本工具 = 单源裁定预期形态，round 5 e2e TUI 腿负断言锚）；TUI 可达性
 * 归 W-D-B 工具契约统一波统筹。
 *
 * 契约面 = TeamDeleteTool 同族（shared Tool + TeamDeleteToolFace 型收窄
 * 先例）；isEnabled = isAgentSwarmsEnabled 同槽（判据④门 OFF 不可见
 * preserved）；engine 单源不建 TUI 副本（W-D-B 双副本教训）。
 *
 * 已知语义守（非缺陷登记）：timeout 先到时 wait promise 仍挂起，已注册
 * onIdleCallbacks 留在成员 task 态，成员下次 idle 转换时被既有 forEach+清
 * 消费——自清理，无泄漏积累面。
 */
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
} from '../../../shared'
import {
  TEAM_LEAD_NAME,
  isAgentSwarmsEnabled,
  isShutdownRequestFromMember,
  readMailbox,
  waitForTeammatesToBecomeIdle,
} from '../../messaging'
import { getSessionContextPort } from '../../session/sessionContextPort'
import { resolveOutgoingTeamName } from './teamRouting'
import type { SessionSnapshot } from '../../ports/sessionContext'
import type { SetAppState, TaskAppState } from '../../../task'
import { isInProcessTeammateWorking } from '../../../task'

import { jsonStringify } from '../../session/json'
import { WAIT_FOR_TEAMMATES_TOOL_NAME } from '../toolNames'
import {
  DESCRIPTION as WAIT_FOR_TEAMMATES_DESCRIPTION,
  PROMPT,
} from './waitForTeammatesPrompt'

/** 输入 JSON schema（timeout 单参；双字段 strict = TeamDelete delta ① 先例）。 */
export const WAIT_FOR_TEAMMATES_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    timeout: {
      type: 'number',
      minimum: 0,
      maximum: 600000,
      default: 120000,
      description: 'Max time to wait in milliseconds (default 120000)',
    },
  },
  additionalProperties: false,
}

/** 输入 duck（timeout 缺省位 = call 解构，TaskOutput delta ① 先例）。 */
export type WaitForTeammatesInput = {
  timeout?: number
}

/** 输出面（结构化两态；超时非错误——fail-open 禁令的结构化对偶）。 */
export type WaitForTeammatesOutput = {
  status: 'idle' | 'timeout'
  waited_ms: number
  /** 等待期间转为 idle 的成员名（idle 态非空；timeout 态可为部分收敛）。 */
  idle: string[]
  /** 仍在工作的成员名（仅 timeout 态非空）。 */
  still_working: string[]
  /** 0.1.96 A1（f4 lock-face ③ 候选 B）：待 lead 裁定的成员退出请求
   * （lead inbox unread 的 shutdown_request_from_member；read 态由 lead
   * 处置动作推进——本扫描不 mark read，裁定后 pending 不再现）。 */
  pending_requests?: Array<{
    from: string
    reason?: string
    request_id: string
  }>
}

/** 缺省超时（LLM 120s 超时先例对齐）。 */
export const WAIT_FOR_TEAMMATES_DEFAULT_TIMEOUT_MS = 120_000
/** 超时上限（TaskOutput 600000 上限先例对齐）。 */
export const WAIT_FOR_TEAMMATES_MAX_TIMEOUT_MS = 600_000

/** 端口未注入结构化错误（RED-B 同形 fail-closed：编程错误早暴露不吞）。 */
function sessionStateUnavailableError(): Error {
  return new Error(
    'No session state is available in the current context ' +
      '(SessionContextPort is not injected). WaitForTeammates requires the ' +
      'engine composition root (in-process teammates live in the session ' +
      'task registry). Create a team with TeamCreate and spawn teammates first.',
  )
}

/** 当前仍在工作的成员名（working 谓词单源 = live 且非轮间 idle）。 */
function listWorkingTeammateNames(appState: TaskAppState): string[] {
  const names: string[] = []
  for (const task of Object.values(appState.tasks)) {
    // 0.1.93 W-D-A round 6（f4 修 2）：working 判定谓词单源（src/task/
    // inProcessTeammate，与 TeamDelete 守卫/runner 收尾块同读一状态机）。
    if (isInProcessTeammateWorking(task)) {
      names.push(task.identity.agentName)
    }
  }
  return names
}

/**
 * 0.1.96 A1（f4 lock-face ③ 候选 B）：读 lead inbox 过滤 unread 的
 * 成员退出请求（shutdown_request_from_member），呈 pending_requests。
 * 刻意不 mark read——消息 read 态由 lead 处置动作推进（deny = 发
 * shutdown_request_denied 时核销；approve = 发 shutdown_request 时核销，
 * sendMessageTool 侧），保证「裁定后 pending 不再现」判别格。
 */
export async function collectPendingMemberRequests(
  teamName?: string,
): Promise<
  Array<{ from: string; reason?: string; request_id: string }>
> {
  const messages = await readMailbox(TEAM_LEAD_NAME, teamName)
  const pending: Array<{ from: string; reason?: string; request_id: string }> =
    []
  for (const m of messages) {
    if (m.read) continue
    const req = isShutdownRequestFromMember(m.text)
    // 0.1.96 §9 安全硬化（f4 批复 23588bfc 修③）：身份以 envelope m.from
    // 为准——body req.from ≠ envelope 的消息不呈（防伪造 pending）。
    if (req && m.from.toLowerCase() === req.from.toLowerCase()) {
      pending.push({
        from: m.from,
        reason: req.reason,
        request_id: req.requestId,
      })
    }
  }
  return pending
}

/** pending 扩格填充（call 返回面统一挂载；best-effort——lead 无团队
 * 上下文时 pending_requests 留缺省，零扰既有两态）。 */
async function attachPendingRequests(
  data: WaitForTeammatesOutput,
): Promise<WaitForTeammatesOutput> {
  try {
    // 0.1.96 §14（f4 批复 3c509ebd）：face 3 修形——pending 扫描 team 源
    // 改双源 resolver（getTeamName 三源链 ∪ peekTeamContext 组态 store）。
    // headless 引擎 lane 三源全空时旧码静默落 'default' 假目录 → 死面；
    // 双源皆缺仍为 undefined → readMailbox 兜底行为不变（域级纪律见
    // teamRouting.ts 头注）。
    const pending = await collectPendingMemberRequests(resolveOutgoingTeamName())
    if (pending.length > 0) {
      return { ...data, pending_requests: pending }
    }
  } catch {
    // 无团队上下文 = 非 lead 车道，pending_requests 缺省
  }
  return data
}

// Tool 契约非参数化（TeamDeleteToolFace 先例）；mapToolResult 返回型收窄。
type WaitForTeammatesToolFace = Tool & {
  mapToolResultToToolResultBlockParam(
    data: WaitForTeammatesOutput,
    toolUseID: string,
  ): ToolResultBlockParam
}

export const WaitForTeammatesTool: WaitForTeammatesToolFace = {
  name: WAIT_FOR_TEAMMATES_TOOL_NAME,
  inputSchema: WAIT_FOR_TEAMMATES_TOOL_INPUT_SCHEMA,
  inputJSONSchema: WAIT_FOR_TEAMMATES_TOOL_INPUT_SCHEMA,
  strict: true,
  searchHint: 'wait for teammates to finish or acknowledge',
  maxResultSizeChars: 100_000,
  // TeamCreate/TeamDelete 同族（defer 池描述面；注册表可见性不受扰）
  shouldDefer: true,
  // 门控槽：isAgentSwarmsEnabled 同槽（TeamCreate/TeamDelete 同列）
  isEnabled: () => isAgentSwarmsEnabled(),
  // 纯等待：不写文件不杀成员（idle 回调注册 = task 态协调面，非工具权限语义写面）
  isReadOnly: () => true,
  isDestructive: () => false,
  isConcurrencySafe: () => true,
  userFacingName: () => 'Wait For Teammates',
  toAutoClassifierInput: () => '',
  async checkPermissions(input: unknown) {
    return { behavior: 'allow' as const, updatedInput: input }
  },
  async description(): Promise<string> {
    return PROMPT
  },
  mapToolResultToToolResultBlockParam(
    data: WaitForTeammatesOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: [
        {
          type: 'text' as const,
          text: jsonStringify(data),
        },
      ],
    }
  },
  renderToolUseMessage(input: unknown): unknown {
    const { timeout } = (input ?? {}) as WaitForTeammatesInput
    if (timeout !== undefined) {
      return `waiting for teammates (up to ${timeout}ms)`
    }
    return 'waiting for teammates'
  },
  async call(args: unknown): Promise<ToolResult<WaitForTeammatesOutput>> {
    const { timeout = WAIT_FOR_TEAMMATES_DEFAULT_TIMEOUT_MS } =
      args as WaitForTeammatesInput
    const effectiveTimeout = Math.min(
      Math.max(0, timeout),
      WAIT_FOR_TEAMMATES_MAX_TIMEOUT_MS,
    )

    // appState 缝：SessionContextPort 单源（gracefulShutdown 同缝；ctx
    // getAppState = TPC 窄视图不消费——RED-B 直证其 tasks 不可达）。
    const port = getSessionContextPort()
    if (!port) {
      throw sessionStateUnavailableError()
    }
    const snapshot = port.get()
    // 双 TaskStateBase 镜像 cast 桥（print.ts gracefulShutdown deps 传参
    // cast 先例）：session snapshot tasks（shared/types-session 镜像）↔
    // task 域 TaskAppState（src/task 本体，'killed'/TaskType 富型）——
    // 结构同形镜像，域间无直接 assignability，cast = 域边界登记。
    const appState = {
      tasks: (snapshot.tasks ?? {}) as unknown as TaskAppState['tasks'],
    }

    const startedAt = Date.now()

    // 零运行成员：立即 idle（waitForTeammatesToBecomeIdle 同语义；此处
    // 先判以便 waited_ms=0 与 idle 名单直出，免白建 timer）。
    const workingNames = listWorkingTeammateNames(appState)
    if (workingNames.length === 0) {
      return {
        data: await attachPendingRequests({
          status: 'idle',
          waited_ms: 0,
          idle: [],
          still_working: [],
        }),
      }
    }

    // SetAppState 适配：SessionContextPort.set（snapshot 视图）↔ task 域
    // TaskAppState 更新器（tasks 字段写回，不深拷——port 契约 view 语义）。
    const setAppState: SetAppState = updater => {
      port.set((prev: SessionSnapshot) => {
        const next = updater({
          tasks: (prev.tasks ?? {}) as unknown as TaskAppState['tasks'],
        })
        return {
          ...prev,
          tasks: next.tasks as unknown as SessionSnapshot['tasks'],
        }
      })
    }

    // 有界等待：事件面阻塞（waitForTeammatesToBecomeIdle）∪ 单 timer race。
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const outcome = await Promise.race([
        waitForTeammatesToBecomeIdle(setAppState, appState).then(
          () => 'idle' as const,
        ),
        new Promise<'timeout'>(resolve => {
          timer = setTimeout(() => resolve('timeout'), effectiveTimeout)
        }),
      ])

      const waitedMs = Date.now() - startedAt
      const nowWorking = listWorkingTeammateNames({
        tasks: (port.get().tasks ?? {}) as unknown as TaskAppState['tasks'],
      })
      const idleNames = workingNames.filter(name => !nowWorking.includes(name))

      // race 平沿守：timer 先醒但成员恰已全 idle —— 按 idle 收敛报（免
      // status:'timeout' 配 still_working:[] 的语义矛盾面）。
      if (outcome === 'timeout' && nowWorking.length === 0) {
        return {
          data: await attachPendingRequests({
            status: 'idle',
            waited_ms: waitedMs,
            idle: idleNames,
            still_working: [],
          }),
        }
      }

      if (outcome === 'idle') {
        return {
          data: await attachPendingRequests({
            status: 'idle',
            waited_ms: waitedMs,
            idle: idleNames,
            still_working: [],
          }),
        }
      }
      return {
        data: await attachPendingRequests({
          status: 'timeout',
          waited_ms: waitedMs,
          idle: idleNames,
          still_working: nowWorking,
        }),
      }
    } finally {
      if (timer) clearTimeout(timer)
    }
  },
}

export { WAIT_FOR_TEAMMATES_DESCRIPTION }
