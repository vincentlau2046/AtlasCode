/**
 * 执行出口 —— B0 执行出口波 S2（呈批书 §2 S2 + f4 批复条件①②）。
 * 合同 docs/superpowers/specs/2026-11-20-first-wave-execution-contract.md
 * §2（六命令）/ §7（组合根恰一次注入、单接触点）。
 *
 * 设计约束：
 *  - 懒触达（E1 增格，f4 批复条件②）：createExecutionOutlet 构造零副作用、
 *    不 boot kernel；能力开关默认 off（fail-closed），off 下六命令任一 = 拒
 *    （capabilityDisabled）且内核零痕迹（dispatch 零触达）。
 *  - kernel 侧能力开关落点 = options.isExecutionEnabled（组合根注入；
 *    probe 查询经此读门，泄露面仅 on/off + 受支持 v，合同 §2 审计登记 b）。
 *  - 薄适配：enabled 命令经 options.dispatchCommand 原样透传 kernel 命令面，
 *    事件/错误原样上抛——不重写排序（cursor 唯一权威）、不改结算、
 *    §3 幂等与 §4/§5/§8 上限执法全归 kernel 侧（S3）。
 *  - 单接触点（条件①）：本文件是 src 面唯一 createExecutionOutlet 定义点；
 *    消费面仅 entry.ts 扩具名导出（符号级扫描腿机器判）。
 *  - 本文件 import 面 = webExecutionV0 唯一（零 engine/kernel 状态导入，
 *    懒触达由加载图保证，非仅运行时纪律）。
 */
import {
  EXECUTION_CAPABILITY_DISABLED_CODE,
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionReplay,
  type WebExecutionCommand,
  type WebExecutionError,
  type WebExecutionEvent,
} from '../protocol/webExecutionV0'

/** capability.probe 应答：泄露面仅 on/off + 受支持 v（合同 §2 审计登记 b）。 */
export type WebExecutionProbeResult = {
  type: 'capability.probe'
  enabled: boolean
  protocolVersion: typeof EXECUTION_PROTOCOL_VERSION
}

export type ExecutionDispatchResult = WebExecutionEvent | WebExecutionError

export type ExecutionOutletOptions = {
  /** kernel 侧能力开关读门（默认 off = fail-closed；组合根注入，S3 接线）。 */
  isExecutionEnabled?: () => boolean
  /** kernel 命令面薄适配（唯一 kernel 触达缝；事件/错误原样上抛）。 */
  dispatchCommand: (command: WebExecutionCommand) => Promise<ExecutionDispatchResult>
  /**
   * §6 follow 恢复缝（S4）：kernel.replaySince 直通（不经 dispatch）。
   * 缺省 = off 车道恒拒。
   */
  resumeExecution?: (
    bind: { workspaceId: string; sessionId: string },
    cursor?: string,
  ) => ExecutionReplay
}

export type ExecutionHandleResult = ExecutionDispatchResult | WebExecutionProbeResult

export type ExecutionOutlet = {
  /** 能力探针：不经 dispatch（kernel 零痕迹），仅读门求值。 */
  probe: () => WebExecutionProbeResult
  /**
   * 六命令统一入口：probe=off 下 probe 外五命令一律 capabilityDisabled 拒
   * 且 dispatch 零触达；on 下薄适配透传。
   */
  handle: (command: WebExecutionCommand) => Promise<ExecutionHandleResult>
  /**
   * §6 follow 恢复（S4）：off = capabilityDisabled 拒且内核零痕迹；on =
   * kernel.replaySince 透传（baseline/delta/expired 三态，增量恰一次）。
   */
  followResume: (
    bind: { workspaceId: string; sessionId: string },
    cursor?: string,
  ) => ExecutionReplay | WebExecutionError
}

const capabilityDisabledError = (type: string): WebExecutionError => ({
  code: EXECUTION_CAPABILITY_DISABLED_CODE,
  message: `执行能力未开启（默认 fail-closed）：${type} 被拒且内核零痕迹（B0 合同 §2/E1）`,
  retryable: false,
})

export function createExecutionOutlet(options: ExecutionOutletOptions): ExecutionOutlet {
  // 懒触达：构造期零副作用（不读开关、不触 dispatch、不 boot kernel）。
  const isEnabled = options.isExecutionEnabled ?? (() => false)

  return {
    probe: () => ({
      type: 'capability.probe',
      enabled: isEnabled(),
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
    }),

    handle: async (command) => {
      if (command.type === 'capability.probe') {
        // probe 仅需连接级鉴权（ambient）；泄露面 on/off + v，不触工作区数据。
        return {
          type: 'capability.probe',
          enabled: isEnabled(),
          protocolVersion: EXECUTION_PROTOCOL_VERSION,
        } satisfies WebExecutionProbeResult
      }
      if (!isEnabled()) {
        return capabilityDisabledError(command.type)
      }
      if (command.type === 'follow.resume') {
        // §6 wire 面：expired cursor → cursorExpired（基线替换信号）。
        // baseline/delta 增量交付走 followResume 原语 + 事件流（v0 形附注候 f4）。
        const replay = options.resumeExecution?.(
          { workspaceId: command.bind.workspaceId, sessionId: command.bind.sessionId },
          command.payload.cursor,
        )
        if (!replay || replay.kind === 'expired') {
          return { code: 'cursorExpired', message: '游标过期/溢出丢弃：按基线替换恢复（合同 §6）', retryable: false }
        }
        return (
          replay.events[0] ?? {
            code: 'cursorExpired',
            message: '无增量可交付（合同 §6 基线替换）',
            retryable: false,
          }
        )
      }
      return options.dispatchCommand(command)
    },

    followResume: (bind, cursor) => {
      if (!isEnabled() || !options.resumeExecution) {
        return capabilityDisabledError('follow.resume')
      }
      return options.resumeExecution(bind, cursor)
    },
  }
}
