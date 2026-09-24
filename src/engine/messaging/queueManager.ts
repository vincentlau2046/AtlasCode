/**
 * messaging 域 — 入轮命令队列（E-7 S-7e d2，§8.50）。
 *
 * 旧仓来源（a8af45b）：src/utils/messageQueueManager.ts 539L 逐字随迁
 * （纯内存模块级队列 + signal 订阅；React useSyncExternalStore 兼容面；
 * 导出面 30 值 + 2 型）。算法体零 delta，除下列裁面 + 类型面 delta
 * （H6 登记，复审勿当遗漏重提）：
 *
 * 裁面（logOperation 族整体裁，replay 面 = shell 波前向接缝）：
 *   - logOperation 函数 + 8 调用点（enqueue / enqueuePendingNotification /
 *     dequeue / dequeueAll / dequeueAllMatching / remove / removeByFilter /
 *     popAllEditable）整体裁：recordQueueOperation = log 族唯一 sink，
 *     详案已裁 sink（sessionStorage 域 = shell 波）→ log 族死码整体裁
 *     （§8.50 d2 执行前分析 bb570f4 裁定）。dequeueAll / dequeueAllMatching
 *     / remove / removeByFilter 的 log-only 循环随之删除；log 相关 JSDoc 行
 *     随裁（"Logs a … operation" 2 处）。
 *   - import 面：getSessionId（bootstrap/state → session 域；shell 波接
 *     replay 面时经 getSessionEnv().getSessionId() 注真值 = 潜在接回点）/
 *     recordQueueOperation（sessionStorage → shell 波）/ QueueOperation ·
 *     QueueOperationMessage（旧 messageQueueTypes.ts 双 `any` stub → 不
 *     随迁；H6：绝不把 stub 签名当真行为）。
 * 类型面 delta：
 *   - Permutations（旧 types/utils any-stub）链删：旧
 *     `satisfies Permutations<…> as any` 在 stub 下退化（satisfies any 恒
 *     真，穷尽性检查本未生效）→ 新仓 `new Set<PromptInputMode>([
 *     'task-notification'])`（Set 构造语义等价，非行为回归）。
 *   - ContentBlockParam = shared 宽骨架（{ type: string; [key: string]:
 *     unknown }，B 波契约冻结；旧 image-base64 判别联合成员 ∉ shared 面）
 *     → extractImagesFromValue 局部 ImageBlockParam 收窄 cast（cast 仅类型
 *     收窄）。唯一运行时行为差异 = 畸形输入角（image 块缺 source）：旧
 *     `block.source.type` 直访问 → TypeError；新 `b.source?.type` 可选链
 *     守卫 → 静默跳过。良形输入路径逐字恒等（H6 登记，queueTypes 无此
 *     畸形面消费）。
 *   - PastedContent / ImageDimensions / OrphanedPermission / MessageOrigin
 *     / AppState → queueTypes.ts 域内本地（delta 登记见 queueTypes.ts 头注）。
 *
 * 探针锚点（§8.50 d2，突变须恰好 1 红，unit 零磁盘）：
 *   P-M4 getCommandsByMaxPriority 过滤支（删 `PRIORITY_ORDER[cmd.priority
 *     ?? 'next'] <= threshold` 条件 → 退化为全队列拷贝）→ unit 'P-M4
 *     getCommandsByMaxPriority 优先级过滤' 恰 1 红。
 *   P-M5 enqueue 默认优先级支（删 `priority: command.priority ?? 'next'`
 *     spread → 原样 push）→ unit 'P-M5 enqueue 默认优先级 next' 恰 1 红
 *     （执行时按代码面定支：enqueue 无去重支——队列允许重复值、去重 =
 *     remove 引用恒等语义；订正详案原文「幂等/去重支」）。
 */
import type { ContentBlockParam } from '../../shared'
import type {
  AppState,
  EditablePromptInputMode,
  PastedContent,
  PromptInputMode,
  QueuedCommand,
  QueuePriority,
} from './queueTypes'
import { objectGroupBy } from './objectGroupBy'
import { createSignal } from './signal'
import { extractTextContent } from './textContent'

export type SetAppState = (f: (prev: AppState) => AppState) => void

// ============================================================================
// Unified command queue (module-level, independent of React state)
//
// All commands — user input, task notifications, orphaned permissions — go
// through this single queue. React components subscribe via
// useSyncExternalStore (subscribeToCommandQueue / getCommandQueueSnapshot).
// Non-React code (print.ts streaming loop) reads directly via
// getCommandQueue() / getCommandQueueLength().
//
// Priority determines dequeue order: 'now' > 'next' > 'later'.
// Within the same priority, commands are processed FIFO.
// ============================================================================

const commandQueue: QueuedCommand[] = []
/** Frozen snapshot — recreated on every mutation for useSyncExternalStore. */
let snapshot: readonly QueuedCommand[] = Object.freeze([])
const queueChanged = createSignal()

function notifySubscribers(): void {
  snapshot = Object.freeze([...commandQueue])
  queueChanged.emit()
}

// ============================================================================
// useSyncExternalStore interface
// ============================================================================

/**
 * Subscribe to command queue changes.
 * Compatible with React's useSyncExternalStore.
 */
export const subscribeToCommandQueue = queueChanged.subscribe

/**
 * Get current snapshot of the command queue.
 * Compatible with React's useSyncExternalStore.
 * Returns a frozen array that only changes reference on mutation.
 */
export function getCommandQueueSnapshot(): readonly QueuedCommand[] {
  return snapshot
}

// ============================================================================
// Read operations (for non-React code)
// ============================================================================

/**
 * Get a mutable copy of the current queue.
 * Use for one-off reads where you need the actual commands.
 */
export function getCommandQueue(): QueuedCommand[] {
  return [...commandQueue]
}

/**
 * Get the current queue length without copying.
 */
export function getCommandQueueLength(): number {
  return commandQueue.length
}

/**
 * Check if there are commands in the queue.
 */
export function hasCommandsInQueue(): boolean {
  return commandQueue.length > 0
}

/**
 * Trigger a re-check by notifying subscribers.
 * Use after async processing completes to ensure remaining commands
 * are picked up by useSyncExternalStore consumers.
 */
export function recheckCommandQueue(): void {
  if (commandQueue.length > 0) {
    notifySubscribers()
  }
}

// ============================================================================
// Write operations
// ============================================================================

/**
 * Add a command to the queue.
 * Used for user-initiated commands (prompt, bash, orphaned-permission).
 * Defaults priority to 'next' (processed before task notifications).
 */
export function enqueue(command: QueuedCommand): void {
  commandQueue.push({ ...command, priority: command.priority ?? 'next' })
  notifySubscribers()
}

/**
 * Add a task notification to the queue.
 * Convenience wrapper that defaults priority to 'later' so user input
 * is never starved by system messages.
 */
export function enqueuePendingNotification(command: QueuedCommand): void {
  commandQueue.push({ ...command, priority: command.priority ?? 'later' })
  notifySubscribers()
}

const PRIORITY_ORDER: Record<QueuePriority, number> = {
  now: 0,
  next: 1,
  later: 2,
}

/**
 * Remove and return the highest-priority command, or undefined if empty.
 * Within the same priority level, commands are dequeued FIFO.
 *
 * An optional `filter` narrows the candidates: only commands for which the
 * predicate returns `true` are considered. Non-matching commands stay in the
 * queue untouched. This lets between-turn drains (SDK, REPL) restrict to
 * main-thread commands (`cmd.agentId === undefined`) without restructuring
 * the existing while-loop patterns.
 */
export function dequeue(
  filter?: (cmd: QueuedCommand) => boolean,
): QueuedCommand | undefined {
  if (commandQueue.length === 0) {
    return undefined
  }

  // Find the first command with the highest priority (respecting filter)
  let bestIdx = -1
  let bestPriority = Infinity
  for (let i = 0; i < commandQueue.length; i++) {
    const cmd = commandQueue[i]!
    if (filter && !filter(cmd)) continue
    const priority = PRIORITY_ORDER[cmd.priority ?? 'next']
    if (priority < bestPriority) {
      bestIdx = i
      bestPriority = priority
    }
  }

  if (bestIdx === -1) return undefined

  const [dequeued] = commandQueue.splice(bestIdx, 1)
  notifySubscribers()
  return dequeued
}

/**
 * Remove and return all commands from the queue.
 */
export function dequeueAll(): QueuedCommand[] {
  if (commandQueue.length === 0) {
    return []
  }

  const commands = [...commandQueue]
  commandQueue.length = 0
  notifySubscribers()

  return commands
}

/**
 * Return the highest-priority command without removing it, or undefined if empty.
 * Accepts an optional `filter` — only commands passing the predicate are considered.
 */
export function peek(
  filter?: (cmd: QueuedCommand) => boolean,
): QueuedCommand | undefined {
  if (commandQueue.length === 0) {
    return undefined
  }
  let bestIdx = -1
  let bestPriority = Infinity
  for (let i = 0; i < commandQueue.length; i++) {
    const cmd = commandQueue[i]!
    if (filter && !filter(cmd)) continue
    const priority = PRIORITY_ORDER[cmd.priority ?? 'next']
    if (priority < bestPriority) {
      bestIdx = i
      bestPriority = priority
    }
  }
  if (bestIdx === -1) return undefined
  return commandQueue[bestIdx]
}

/**
 * Remove and return all commands matching a predicate, preserving priority order.
 * Non-matching commands stay in the queue.
 */
export function dequeueAllMatching(
  predicate: (cmd: QueuedCommand) => boolean,
): QueuedCommand[] {
  const matched: QueuedCommand[] = []
  const remaining: QueuedCommand[] = []
  for (const cmd of commandQueue) {
    if (predicate(cmd)) {
      matched.push(cmd)
    } else {
      remaining.push(cmd)
    }
  }
  if (matched.length === 0) {
    return []
  }
  commandQueue.length = 0
  commandQueue.push(...remaining)
  notifySubscribers()
  return matched
}

/**
 * Remove specific commands from the queue by reference identity.
 * Callers must pass the same object references that are in the queue
 * (e.g. from getCommandsByMaxPriority).
 */
export function remove(commandsToRemove: QueuedCommand[]): void {
  if (commandsToRemove.length === 0) {
    return
  }

  const before = commandQueue.length
  for (let i = commandQueue.length - 1; i >= 0; i--) {
    if (commandsToRemove.includes(commandQueue[i]!)) {
      commandQueue.splice(i, 1)
    }
  }

  if (commandQueue.length !== before) {
    notifySubscribers()
  }
}

/**
 * Remove commands matching a predicate.
 * Returns the removed commands.
 */
export function removeByFilter(
  predicate: (cmd: QueuedCommand) => boolean,
): QueuedCommand[] {
  const removed: QueuedCommand[] = []
  for (let i = commandQueue.length - 1; i >= 0; i--) {
    if (predicate(commandQueue[i]!)) {
      removed.unshift(commandQueue.splice(i, 1)[0]!)
    }
  }

  if (removed.length > 0) {
    notifySubscribers()
  }

  return removed
}

/**
 * Clear all commands from the queue.
 * Used by ESC cancellation to discard queued notifications.
 */
export function clearCommandQueue(): void {
  if (commandQueue.length === 0) {
    return
  }
  commandQueue.length = 0
  notifySubscribers()
}

/**
 * Clear all commands and reset snapshot.
 * Used for test cleanup.
 */
export function resetCommandQueue(): void {
  commandQueue.length = 0
  snapshot = Object.freeze([])
}

// ============================================================================
// Editable mode helpers
// ============================================================================

// Permutations（旧 any-stub）链删，Set 构造语义等价（登记见文件头）
const NON_EDITABLE_MODES = new Set<PromptInputMode>(['task-notification'])

export function isPromptInputModeEditable(
  mode: PromptInputMode,
): mode is EditablePromptInputMode {
  return !NON_EDITABLE_MODES.has(mode)
}

/**
 * Whether this queued command can be pulled into the input buffer via UP/ESC.
 * System-generated commands (scheduled tasks, plan verification) contain
 * raw XML and must not leak into the user's input.
 */
export function isQueuedCommandEditable(cmd: QueuedCommand): boolean {
  return isPromptInputModeEditable(cmd.mode) && !cmd.isMeta
}

/**
 * Whether this queued command should render in the queue preview under the
 * prompt.
 */
export function isQueuedCommandVisible(cmd: QueuedCommand): boolean {
  return isQueuedCommandEditable(cmd)
}

/**
 * Extract text from a queued command value.
 * For strings, returns the string.
 * For ContentBlockParam[], extracts text from text blocks.
 */
function extractTextFromValue(value: string | ContentBlockParam[]): string {
  return typeof value === 'string' ? value : extractTextContent(value, '\n')
}

/**
 * Extract images from ContentBlockParam[] and convert to PastedContent format.
 * Returns empty array for string values or if no images found.
 */
function extractImagesFromValue(
  value: string | ContentBlockParam[],
  startId: number,
): PastedContent[] {
  if (typeof value === 'string') {
    return []
  }

  const images: PastedContent[] = []
  let imageIndex = 0
  for (const block of value) {
    // 宽骨架 cast 收窄（登记见文件头）：shared ContentBlockParam =
    // { type: string; [key: string]: unknown }（旧 image-base64 判别联合
    // 成员 ∉ shared 面）；运行时守卫支逐字不变
    const b = block as ContentBlockParam & {
      source?: { type: string; data: string; media_type?: string }
    }
    if (b.type === 'image' && b.source?.type === 'base64') {
      images.push({
        id: startId + imageIndex,
        type: 'image',
        content: b.source.data,
        mediaType: b.source.media_type,
        filename: `image${imageIndex + 1}`,
      })
      imageIndex++
    }
  }
  return images
}

export type PopAllEditableResult = {
  text: string
  cursorOffset: number
  images: PastedContent[]
}

/**
 * Pop all editable commands and combine them with current input for editing.
 * Notification modes (task-notification) are left in the queue
 * to be auto-processed later.
 * Returns object with combined text, cursor offset, and images to restore.
 * Returns undefined if no editable commands in queue.
 */
export function popAllEditable(
  currentInput: string,
  currentCursorOffset: number,
): PopAllEditableResult | undefined {
  if (commandQueue.length === 0) {
    return undefined
  }

  const { editable = [], nonEditable = [] } = objectGroupBy(
    [...commandQueue],
    cmd => (isQueuedCommandEditable(cmd) ? 'editable' : 'nonEditable'),
  )

  if (editable.length === 0) {
    return undefined
  }

  // Extract text from queued commands (handles both strings and ContentBlockParam[])
  const queuedTexts = editable.map(cmd => extractTextFromValue(cmd.value))
  const newInput = [...queuedTexts, currentInput].filter(Boolean).join('\n')

  // Calculate cursor offset: length of joined queued commands + 1 + current cursor offset
  const cursorOffset = queuedTexts.join('\n').length + 1 + currentCursorOffset

  // Extract images from queued commands
  const images: PastedContent[] = []
  let nextImageId = Date.now() // Use timestamp as base for unique IDs
  for (const cmd of editable) {
    // handlePromptSubmit queues images in pastedContents (value is a string).
    // Preserve the original PastedContent id so imageStore lookups still work.
    if (cmd.pastedContents) {
      for (const content of Object.values(cmd.pastedContents)) {
        if (content.type === 'image') {
          images.push(content)
        }
      }
    }
    // Bridge/remote commands may embed images directly in ContentBlockParam[].
    const cmdImages = extractImagesFromValue(cmd.value, nextImageId)
    images.push(...cmdImages)
    nextImageId += cmdImages.length
  }

  // Replace queue contents with only the non-editable commands
  commandQueue.length = 0
  commandQueue.push(...nonEditable)
  notifySubscribers()

  return { text: newInput, cursorOffset, images }
}

// ============================================================================
// Backward-compatible aliases (deprecated — prefer new names)
// ============================================================================

/** @deprecated Use subscribeToCommandQueue */
export const subscribeToPendingNotifications = subscribeToCommandQueue

/** @deprecated Use getCommandQueueSnapshot */
export function getPendingNotificationsSnapshot(): readonly QueuedCommand[] {
  return snapshot
}

/** @deprecated Use hasCommandsInQueue */
export const hasPendingNotifications = hasCommandsInQueue

/** @deprecated Use getCommandQueueLength */
export const getPendingNotificationsCount = getCommandQueueLength

/** @deprecated Use recheckCommandQueue */
export const recheckPendingNotifications = recheckCommandQueue

/** @deprecated Use dequeue */
export function dequeuePendingNotification(): QueuedCommand | undefined {
  return dequeue()
}

/** @deprecated Use resetCommandQueue */
export const resetPendingNotifications = resetCommandQueue

/** @deprecated Use clearCommandQueue */
export const clearPendingNotifications = clearCommandQueue

/**
 * Get commands at or above a given priority level without removing them.
 * Useful for mid-chain draining where only urgent items should be processed.
 *
 * Priority order: 'now' (0) > 'next' (1) > 'later' (2).
 * Passing 'now' returns only now-priority commands; 'later' returns everything.
 */
export function getCommandsByMaxPriority(
  maxPriority: QueuePriority,
): QueuedCommand[] {
  const threshold = PRIORITY_ORDER[maxPriority]
  return commandQueue.filter(
    cmd => PRIORITY_ORDER[cmd.priority ?? 'next'] <= threshold,
  )
}

/**
 * Returns true if the command is a slash command that should be routed through
 * processSlashCommand rather than sent to the model as text.
 *
 * Commands with `skipSlashCommands` (e.g. bridge/CCR messages) are NOT treated
 * as slash commands — their text is meant for the model.
 */
export function isSlashCommand(cmd: QueuedCommand): boolean {
  return (
    typeof cmd.value === 'string' &&
    cmd.value.trim().startsWith('/') &&
    !cmd.skipSlashCommands
  )
}
