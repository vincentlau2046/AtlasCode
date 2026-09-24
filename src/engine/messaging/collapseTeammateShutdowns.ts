/**
 * messaging 域 — 队友 shutdown 附件折叠（E-7 S-7e d1，§8.50）。
 *
 * 旧仓来源（a8af45b）：src/utils/collapseTeammateShutdowns.ts 55L 随迁
 * （算法体逐字）。
 *
 * 类型面 delta 登记（H6，复审勿当遗漏重提）：
 *   - 旧 `AttachmentMessage` / `RenderableMessage`（types/message.ts 宽接口）
 *     → 本文件域内本地 duck 形（不导出——与 session 域 RenderableMessage
 *     （6 型最小形）命名区分；UI 波消费面需要该 duck 面时再导出更名，
 *     前向接缝）：task_status 判别字段面（taskType/status）+ 折叠输出
 *     count 面 + 宽索引（运行时对象兼容——旧宽接口对象经运行时层可满足
 *     本形）。
 *   - 旧守卫 `msg is AttachmentMessage` → `msg is` 本地 task_status 收窄形
 *     （判定体三字段比较逐字；收窄形补 uuid?/timestamp?/count? 面 =
 *     折叠输出支 `result.push({ uuid: msg.uuid, ... })` 消费面，旧宽接口
 *     恒带这些字段，最小形按消费面补齐）。
 */

/** 域内本地 duck（旧 RenderableMessage 宽接口 → 本文件消费面最小形，见文件头登记）。 */
type RenderableMessage = {
  type: string
  uuid?: string
  timestamp?: string
  attachment?: {
    type: string
    taskType?: string
    status?: string
    count?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

function isTeammateShutdownAttachment(
  msg: RenderableMessage,
): msg is {
  type: 'attachment'
  uuid?: string
  timestamp?: string
  attachment: {
    type: 'task_status'
    taskType: 'in_process_teammate'
    status: 'completed'
    count?: number
    [key: string]: unknown
  }
} {
  return (
    msg.type === 'attachment' &&
    msg.attachment.type === 'task_status' &&
    msg.attachment.taskType === 'in_process_teammate' &&
    msg.attachment.status === 'completed'
  )
}

/**
 * Collapses consecutive in-process teammate shutdown task_status attachments
 * into a single `teammate_shutdown_batch` attachment with a count.
 */
export function collapseTeammateShutdowns(
  messages: RenderableMessage[],
): RenderableMessage[] {
  const result: RenderableMessage[] = []
  let i = 0

  while (i < messages.length) {
    const msg = messages[i]!
    if (isTeammateShutdownAttachment(msg)) {
      let count = 0
      while (
        i < messages.length &&
        isTeammateShutdownAttachment(messages[i]!)
      ) {
        count++
        i++
      }
      if (count === 1) {
        result.push(msg)
      } else {
        result.push({
          type: 'attachment',
          uuid: msg.uuid,
          timestamp: msg.timestamp,
          attachment: {
            type: 'teammate_shutdown_batch',
            count,
          },
        })
      }
    } else {
      result.push(msg)
      i++
    }
  }

  return result
}
