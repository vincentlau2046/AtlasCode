/**
 * 执行出口组合根装配 —— B0 执行出口波 S4（f4 五件清单④）。
 * 呈批书 docs/2026-11-21-execution-outlet-wave-lockface-brief.md §2 S4；
 * 合同 §7（组合根恰一次注入、实例隔离）。
 *
 * 双车道（headless compose.ts / TUI tui/factory.ts）经本助手单源接线：
 *  - 能力开关默认 off（fail-closed）：`ATLAS_WEB_EXECUTION_ENABLED=1` 显式开
 *    （env 单一 ATLAS_ 前缀；settings 键面候 f4 裁定，B0 只锁默认拒绝）。
 *  - actorId = 服务端 ambient 身份（§5：客户端自报不得覆盖——wire strictObject
 *    使 decide payload 携 actorId 即 schema 层拒；远端连接身份随 bridge 车道
 *    后续切片）。
 *  - runTurn 真体 = 落地细化附注（f4 S4 预读同意）：引擎深缝候后续切片；
 *    开关 off 时不可达，显式抛错 fail-closed（绝不静默假执行）。
 *  - 本文件是 src 面唯一 createExecutionKernel 消费点（条件① 扩腿机器判）。
 *  - 层位：kernel/execution 域内三件套（kernel + outlet + composition）——
 *    双车道（tui/atlascode 壳）allow 面均含 kernel 而互不依赖，组合根助手
 *    落 kernel 域是唯一零新 DEP 边落点（S4 首形 outlet 在 atlascode/web +
 *    composition 先 kernel 后壳侧两次试位均撞 boundaries lint，终态归位
 *    kernel/execution，装配语义不变）。
 */
import { createExecutionOutlet } from './executionOutlet'
import { createExecutionKernel, type ExecutionTurnRunner } from './executionKernel'

/**
 * B1 前置件形 2（f4 附条件采认 @2026-11-21）：注入形转正。
 *  - 零参默认行为零变更（CLI 双车道回归腿）：runTurn 占位 fail-closed 抛错
 *    + actorId ambient——CLI 车道自身不服务 web 执行，占位语义保留。
 *  - host 侧（AtlasWeb upstream.ts，单接触点）经注入面传 runTurn 真体 +
 *    actorId 真源（已认证连接身份）。
 */
export type ExecutionCompositionOptions = {
  runTurn?: ExecutionTurnRunner
  actorId?: () => string
  now?: () => number
}

export function createExecutionComposition(options: ExecutionCompositionOptions = {}) {
  const kernel = createExecutionKernel({
    runTurn:
      options.runTurn ??
      (async () => {
        throw new Error(
          '执行能力 runTurn 真体未接线（B0 执行出口波 S4 落地细化附注：引擎深缝候后续切片；能力开关 fail-closed off 时不可达）',
        )
      }),
    actorId: options.actorId ?? (() => 'atlas-local-ambient'),
    ...(options.now !== undefined ? { now: options.now } : {}),
  })

  const outlet = createExecutionOutlet({
    isExecutionEnabled: () => process.env.ATLAS_WEB_EXECUTION_ENABLED === '1',
    dispatchCommand: (command) => kernel.handleCommand(command),
    resumeExecution: (bind, cursor) =>
      kernel.replaySince(bind.workspaceId, bind.sessionId, cursor),
  })

  return { kernel, outlet }
}

export type ExecutionComposition = ReturnType<typeof createExecutionComposition>
