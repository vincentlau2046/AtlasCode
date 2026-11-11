/**
 * in-process spawn 观测钩子工厂（W-D-C 段 R1 R1-D1 落码；lock-face
 * docs/2026-11-11-wdc-r1-lockface.md §2，f4 批复 2026-11-11）。
 *
 * 闭包体 = 0.1.94 C-3 后 TUI InProcessBackend.spawn 体内逐字迁移（tui
 * backends 副本随 R1 收敛删除；消费形 f4 §13①②⑤ 登记不变）。经
 * swarm 域 inProcessSpawnHooksPort 注入窗由 tui/factory
 * 组合根装配（setInProcessSpawnHooksFactory，与 setStartInProcessTeammate
 * 同批）。
 *
 * ctx 窄视图→全量 cast 依据：本工厂仅 TUI lane 接线，运行时 ctx 恒为
 * 全量 ToolUseContext（TUI 消费点 setContext 传入；engine lane 不接线
 * = 工厂不被调用），窄视图 options 扩面（types.ts R1-D1）仅观测所需
 * 最小面，闭包体富消费面（Tools/MCPServerConnection 类型）在此展开。
 */
import type { ToolUseContext } from '../../Tool.js'
// 0.1.94 C-3（f4 §13①）：onMessage 钩子消费面——progress tracker +
// task.messages 逐消息镜像 + inProgressToolUseIDs 维护（旧 TUI 副本
// for-await 体逐字消费形，随换道改由 engine 单源 onMessage 回调驱动）。
import { appendCappedMessage } from '../../tasks/InProcessTeammateTask/types.js'
import type { InProcessTeammateTaskState } from '../../tasks/InProcessTeammateTask/types.js'
import {
  createActivityDescriptionResolver,
  createProgressTracker,
  getProgressUpdate,
  updateProgressFromMessage,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { Message as TuiMessage } from '../../types/message.js'
import { getSystemPrompt } from '../../constants/prompts.js'
import type {
  InProcessSpawnHooks,
  InProcessSpawnHooksFactoryArgs,
} from 'src/swarm'

export async function createInProcessSpawnHooks({
  config,
  ctx,
  taskId,
}: InProcessSpawnHooksFactoryArgs): Promise<InProcessSpawnHooks> {
  const ctxFull = ctx as unknown as ToolUseContext

  // 0.1.94 C-3（f4 §13① C-1#2）：task 态更新（镜像旧 TUI 副本本地
  // updateTaskState 形：in_process_teammate 守卫 + 引用不变短路）。
  const updateTask = (
    updater: (task: InProcessTeammateTaskState) => InProcessTeammateTaskState,
  ): void => {
    ctxFull.setAppState(prev => {
      const task = prev.tasks[taskId]
      if (!task || task.type !== 'in_process_teammate') {
        return prev
      }
      const updated = updater(task)
      if (updated === task) {
        return prev
      }
      return {
        ...prev,
        tasks: {
          ...prev.tasks,
          [taskId]: updated,
        },
      }
    })
  }

  // 0.1.94 C-3（f4 §13⑤）：主系统提示词策略面——TUI 域内显式计算
  //（≡ 旧 TUI 副本 inline L924-929 getSystemPrompt 全量主提示词）；
  // replace 模式不传（单源 runner replace 支直用 systemPrompt）。
  const mainSystemPrompt =
    config.systemPromptMode === 'replace'
      ? undefined
      : (
          await getSystemPrompt(
            ctxFull.options.tools,
            ctxFull.options.mainLoopModel,
            undefined,
            ctxFull.options.mcpClients,
          )
        ).join('\n')

  // 0.1.94 C-3（f4 §13① C-1#1）：progress tracker（单 tracker per
  // spawn——调用点无法感知单源 runner 的 prompt 迭代边界，progress
  // 跨 prompt 累积而非逐 prompt 重置 = 已登记 minor UX 偏差）。
  const tracker = createProgressTracker()
  const resolveActivity = createActivityDescriptionResolver(ctxFull.options.tools)

  return {
    mainSystemPrompt,
    // §13①：逐消息观测（≡ 旧 TUI 副本 for-await 体 L1218-1266 逐字
    // 消费形：tracker 镜像 + inProgressToolUseIDs 维护 + 逐消息
    // appendCappedMessage；engine Message → TUI Message 投影 cast）。
    onMessage: message => {
      const tuiMessage = message as unknown as TuiMessage
      updateProgressFromMessage(
        tracker,
        tuiMessage,
        resolveActivity,
        ctxFull.options.tools,
      )
      const progress = getProgressUpdate(tracker)
      updateTask(task => {
        // Track in-progress tool use IDs for animation in transcript view
        let inProgressToolUseIDs = task.inProgressToolUseIDs
        if (tuiMessage.type === 'assistant') {
          for (const block of tuiMessage.message.content) {
            if (block.type === 'tool_use') {
              inProgressToolUseIDs = new Set([
                ...(inProgressToolUseIDs ?? []),
                block.id,
              ])
            }
          }
        } else if (tuiMessage.type === 'user') {
          const content = tuiMessage.message.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                typeof block === 'object' &&
                'type' in block &&
                block.type === 'tool_result'
              ) {
                if (inProgressToolUseIDs) {
                  inProgressToolUseIDs = new Set(inProgressToolUseIDs)
                  inProgressToolUseIDs.delete(block.tool_use_id)
                }
              }
            }
          }
        }
        return {
          ...task,
          progress,
          messages: appendCappedMessage(task.messages, tuiMessage),
          inProgressToolUseIDs,
        }
      })
    },
    // §13① C-1#3：权限等待记账（gate leader 队列支 settle 点回调）。
    onPermissionWaitMs: waitMs => {
      updateTask(task => ({
        ...task,
        totalPausedMs: (task.totalPausedMs ?? 0) + waitMs,
      }))
    },
    // §13② 案 1：per-iteration permissionMode（leader Shift+Tab cycle
    // 面；TPC 构建点活读 task 态，fresh 读 ≡ 旧每轮读取语义）。
    getPermissionMode: () => {
      const st = ctxFull.getAppState()
      const t = st.tasks[taskId]
      return t && t.type === 'in_process_teammate'
        ? t.permissionMode
        : undefined
    },
  }
}
