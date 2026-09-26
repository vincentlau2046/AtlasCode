/**
 * engine/tasks — 任务列表存储域（§8.56 S-D2 依赖闭包层，旧仓 utils/tasks.ts
 * 848L 逐字随迁；Task 四件套 + TodoWrite 消费面，门控槽 ⑯ isTodoV2）。
 *
 * 旧仓来源（a8af45b）：src/utils/tasks.ts 848L 逐字（任务列表 disk JSON 每任务
 * 一文件 + .highwatermark + proper-lockfile 互斥 + onTasksUpdated 信号 +
 * claimTask/unassignTeammateTasks/getAgentStatuses teammate 协作面）。
 * import 重指：
 *   - bootstrap/state → ../../bootstrap 域根门面（getIsNonInteractiveSession/
 *     getSessionId 既有面；boundaries/entry-point 规则 = engine 域对
 *     bootstrap 依赖只走域根入口，engine/tools 各域同 idiom）
 *   - array.uniq → 域内本地实现（新仓无 lodash 先例，delta ⑤）
 *   - debug.logForDebugging + log.logError + errors（errorMessage/getErrnoCode）
 *     + envUtils.isEnvTruthy → ../../shared 门面（delta ⑥⑧）
 *   - envUtils.getAtlasConfigHomeDir → ../config 门面（E-3 S-3a configRoot）；
 *     getTeamsDir → 域内 3 行本地（delta ④）
 *   - lockfile（namespace import）→ ../messaging 门面 lock（E-7 S-7e proper-
 *     lockfile 惰性访问器，delta ②）
 *   - slowOperations jsonParse/jsonStringify → ../session 门面（delta ③）
 *   - signal.createSignal + teammate.getTeamName + teammateContext.
 *     getTeammateContext → ../messaging 门面（delta ⑦）
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① 旧 zod TaskSchema/TaskStatusSchema（lazySchema 2 导出）→ TS 接口 Task +
 *     TASK_STATUSES 字面量联合 TaskStatus + isTaskStatus 运行时守卫（JSON
 *     schema 化先例 S-C1 delta ①；旧 getTask 内 TaskSchema().safeParse 支 →
 *     本地 validateTask 等价结构校验，失败日志措辞 '[Tasks] Task <id> failed
 *     schema validation' 逐字保留，error 明细 = 字段名列表非 zod message，
 *     delta 登记）；旧 TaskStatusSchema 消费 3 站点（TaskGet/TaskList 输出
 *     型 / TaskUpdate `.or(z.literal('deleted'))` 输入支）= 新契约无
 *     outputSchema 槽（TS 型承载，S-C1 delta ② 先例）+ TaskUpdate 输入支
 *     工具侧本地 4 值联合 + 守卫（S-D3 delta 登记）。
 *  ② 旧 `import * as lockfile from './lockfile.js'` namespace 面 → 新
 *     messaging 门面具名 `lock`（proper-lockfile 依赖 = E-7 S-7e 已落，
 *     createRequire 惰性加载先例；LOCK_OPTIONS 逐字保留）。
 *  ③ 旧 slowOperations jsonStringify(task, null, 2) 3 参调用 → session/json
 *     门面 2 参 jsonStringify(task, 2)（replacer 槽裁，null replacer = 恒等，
 *     语义等价）。
 *  ④ getTeamsDir（旧 envUtils）= 域内 3 行本地逐字（join(
 *     getAtlasConfigHomeDir(), 'teams')）；messaging/mailbox L96 同形本地
 *     先例（不导出跨域私有面，防跨域 churn）。
 *  ⑤ uniq（旧 utils/array）= 域内本地实现（新仓无 lodash 先例，scheduler/
 *     tools 各域本地 uniqByName 同模式）。
 *  ⑥ logForDebugging（旧 utils/debug）+ logError（旧 utils/log）→ shared 门面
 *     （logError = S-C1 提升先例；logForDebugging = E 波已落 shared/log）。
 *  ⑦ 跨域身份面（getTeamName/getTeammateContext/createSignal）→ messaging
 *     门面（E-7 S-7e 已落逐字面）；getIsNonInteractiveSession/getSessionId →
 *     bootstrap 门面。
 *  ⑧ getErrnoCode/errorMessage → shared/errors（既有面）。
 *
 * 残留守（防「以为已全」）：getAgentStatuses/readTeamMembers 消费 teams/
 * config.json（shell·swarm 波 TeamCreate 落盘面，本波 = 存储面真实现 + 读面
 * 容错支逐字）/ unassignTeammateTasks 消费面（shell·swarm 波 TeamDelete）/
 * onTasksUpdated TUI 即时刷新消费（TUI 波）。
 */
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  getIsNonInteractiveSession,
  getSessionId,
} from '../../bootstrap'
import {
  errorMessage,
  getErrnoCode,
  isEnvTruthy,
  logError,
  logForDebugging,
} from '../../shared'
import { getAtlasConfigHomeDir } from '../config'
import {
  createSignal,
  getTeammateContext,
  getTeamName,
  lock,
} from '../messaging'
import { jsonParse, jsonStringify } from '../session'

// 域内本地实现（delta ④/⑤：旧 envUtils getTeamsDir / utils/array uniq）
function getTeamsDir(): string {
  return join(getAtlasConfigHomeDir(), 'teams')
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

// Listeners for task list updates (used for immediate UI refresh in same process)
const tasksUpdated = createSignal()

/**
 * Team name set by the leader when creating a team.
 * Used by getTaskListId() so the leader's tasks are stored under the team name
 * (matching where tmux/iTerm2 teammates look), not under the session ID.
 */
let leaderTeamName: string | undefined

/**
 * Sets the leader's team name for task list resolution.
 * Called by TeamCreateTool when a team is created.
 */
export function setLeaderTeamName(teamName: string): void {
  if (leaderTeamName === teamName) return
  leaderTeamName = teamName
  // Changing the task list ID is a "tasks updated" event for subscribers —
  // they're now looking at a different directory.
  notifyTasksUpdated()
}

/**
 * Clears the leader's team name.
 * Called when a team is deleted.
 */
export function clearLeaderTeamName(): void {
  if (leaderTeamName === undefined) return
  leaderTeamName = undefined
  notifyTasksUpdated()
}

/**
 * Register a listener to be called when tasks are updated in this process.
 * Returns an unsubscribe function.
 */
export const onTasksUpdated = tasksUpdated.subscribe

/**
 * Notify listeners that tasks have been updated.
 * Called internally after createTask, updateTask, etc.
 * Wraps emit in try/catch so listener failures never propagate to callers
 * (task mutations must succeed from the caller's perspective).
 */
export function notifyTasksUpdated(): void {
  try {
    tasksUpdated.emit()
  } catch {
    // Ignore listener errors — task mutations must not fail due to notification issues
  }
}

export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const

// delta ①：旧 zod TaskStatusSchema（lazySchema）→ 字面量联合 + 运行时守卫
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** 旧 TaskStatusSchema().safeParse 等价运行时守卫（delta ①）。 */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === 'string' &&
    (TASK_STATUSES as readonly string[]).includes(value)
  )
}

// delta ①：旧 zod TaskSchema（lazySchema z.object 9 字段）→ TS 接口逐字段
export interface Task {
  id: string
  subject: string
  description: string
  activeForm?: string // present continuous form for spinner (e.g., "Running tests")
  owner?: string // agent ID
  status: TaskStatus
  blocks: string[] // task IDs this task blocks
  blockedBy: string[] // task IDs that block this task
  metadata?: Record<string, unknown> // arbitrary metadata
}

/** 旧 TaskSchema().safeParse 等价结构校验（delta ①；失败明细 = 字段名列表）。 */
function validateTask(data: unknown): Task | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  const problems: string[] = []
  for (const k of ['id', 'subject', 'description'] as const) {
    if (typeof d[k] !== 'string') problems.push(k)
  }
  if (!isTaskStatus(d.status)) problems.push('status')
  for (const k of ['blocks', 'blockedBy'] as const) {
    if (!Array.isArray(d[k]) || (d[k] as unknown[]).some(x => typeof x !== 'string')) {
      problems.push(k)
    }
  }
  if (
    d.activeForm !== undefined &&
    typeof d.activeForm !== 'string'
  ) {
    problems.push('activeForm')
  }
  if (d.owner !== undefined && typeof d.owner !== 'string') {
    problems.push('owner')
  }
  if (
    d.metadata !== undefined &&
    (typeof d.metadata !== 'object' || d.metadata === null)
  ) {
    problems.push('metadata')
  }
  if (problems.length > 0) return null
  return {
    id: d.id as string,
    subject: d.subject as string,
    description: d.description as string,
    ...(d.activeForm !== undefined
      ? { activeForm: d.activeForm as string }
      : {}),
    ...(d.owner !== undefined ? { owner: d.owner as string } : {}),
    status: d.status as TaskStatus,
    blocks: d.blocks as string[],
    blockedBy: d.blockedBy as string[],
    ...(d.metadata !== undefined
      ? { metadata: d.metadata as Record<string, unknown> }
      : {}),
  }
}

// High water mark file name - stores the maximum task ID ever assigned
const HIGH_WATER_MARK_FILE = '.highwatermark'

// Lock options: retry with backoff so concurrent callers (multiple Claudes
// in a swarm) wait for the lock instead of failing immediately. The sync
// lockSync API blocked the event loop; the async API needs explicit retries
// to achieve the same serialization semantics.
//
// Budget sized for ~10+ concurrent swarm agents: each critical section does
// readdir + N×readFile + writeFile (~50-100ms on slow disks), so the last
// caller in a 10-way race needs ~900ms. retries=30 gives ~2.6s total wait.
const LOCK_OPTIONS = {
  retries: {
    retries: 30,
    minTimeout: 5,
    maxTimeout: 100,
  },
}

function getHighWaterMarkPath(taskListId: string): string {
  return join(getTasksDir(taskListId), HIGH_WATER_MARK_FILE)
}

async function readHighWaterMark(taskListId: string): Promise<number> {
  const path = getHighWaterMarkPath(taskListId)
  try {
    const content = (await readFile(path, 'utf-8')).trim()
    const value = parseInt(content, 10)
    return isNaN(value) ? 0 : value
  } catch {
    return 0
  }
}

async function writeHighWaterMark(
  taskListId: string,
  value: number,
): Promise<void> {
  const path = getHighWaterMarkPath(taskListId)
  await writeFile(path, String(value))
}

export function isTodoV2Enabled(): boolean {
  // Force-enable tasks in non-interactive mode (e.g. SDK users who want Task tools over TodoWrite)
  if (isEnvTruthy(process.env.ATLAS_ENABLE_TASKS)) {
    return true
  }
  return !getIsNonInteractiveSession()
}

/**
 * Resets the task list for a new swarm - clears any existing tasks.
 * Writes a high water mark file to prevent ID reuse after reset.
 * Should be called when a new swarm is created to ensure task numbering starts at 1.
 * Uses file locking to prevent race conditions when multiple Claudes run in parallel.
 */
export async function resetTaskList(taskListId: string): Promise<void> {
  const dir = getTasksDir(taskListId)
  const lockPath = await ensureTaskListLockFile(taskListId)

  let release: (() => Promise<void>) | undefined
  try {
    // Acquire exclusive lock on the task list
    release = await lock(lockPath, LOCK_OPTIONS)

    // Find the current highest ID and save it to the high water mark file
    const currentHighest = await findHighestTaskIdFromFiles(taskListId)
    if (currentHighest > 0) {
      const existingMark = await readHighWaterMark(taskListId)
      if (currentHighest > existingMark) {
        await writeHighWaterMark(taskListId, currentHighest)
      }
    }

    // Delete all task files
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      files = []
    }
    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('.')) {
        const filePath = join(dir, file)
        try {
          await unlink(filePath)
        } catch {
          // Ignore errors, file may already be deleted
        }
      }
    }
    notifyTasksUpdated()
  } finally {
    if (release) {
      await release()
    }
  }
}

/**
 * Gets the task list ID based on the current context.
 * Priority:
 * 1. ATLAS_TASK_LIST_ID - explicit task list ID
 * 2. In-process teammate: leader's team name (so teammates share the leader's task list)
 * 3. ATLAS_TEAM_NAME - set when running as a process-based teammate
 * 4. Leader team name - set when the leader creates a team via TeamCreate
 * 5. Session ID - fallback for standalone sessions
 */
export function getTaskListId(): string {
  if (process.env.ATLAS_TASK_LIST_ID) {
    return process.env.ATLAS_TASK_LIST_ID
  }
  // In-process teammates use the leader's team name so they share the same
  // task list that tmux/iTerm2 teammates also resolve to.
  const teammateCtx = getTeammateContext()
  if (teammateCtx) {
    return teammateCtx.teamName
  }
  return getTeamName() || leaderTeamName || getSessionId()
}

/**
 * Sanitizes a string for safe use in file paths.
 * Removes path traversal characters and other potentially dangerous characters.
 * Only allows alphanumeric characters, hyphens, and underscores.
 */
export function sanitizePathComponent(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '-')
}

export function getTasksDir(taskListId: string): string {
  return join(
    getAtlasConfigHomeDir(),
    'tasks',
    sanitizePathComponent(taskListId),
  )
}

export function getTaskPath(taskListId: string, taskId: string): string {
  return join(getTasksDir(taskListId), `${sanitizePathComponent(taskId)}.json`)
}

export async function ensureTasksDir(taskListId: string): Promise<void> {
  const dir = getTasksDir(taskListId)
  try {
    await mkdir(dir, { recursive: true })
  } catch {
    // Directory already exists or creation failed; callers will surface
    // errors from subsequent operations.
  }
}

/**
 * Finds the highest task ID from existing task files (not including high water mark).
 */
async function findHighestTaskIdFromFiles(taskListId: string): Promise<number> {
  const dir = getTasksDir(taskListId)
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return 0
  }
  let highest = 0
  for (const file of files) {
    if (!file.endsWith('.json')) {
      continue
    }
    const taskId = parseInt(file.replace('.json', ''), 10)
    if (!isNaN(taskId) && taskId > highest) {
      highest = taskId
    }
  }
  return highest
}

/**
 * Finds the highest task ID ever assigned, considering both existing files
 * and the high water mark (for deleted/reset tasks).
 */
async function findHighestTaskId(taskListId: string): Promise<number> {
  const [fromFiles, fromMark] = await Promise.all([
    findHighestTaskIdFromFiles(taskListId),
    readHighWaterMark(taskListId),
  ])
  return Math.max(fromFiles, fromMark)
}

/**
 * Creates a new task with a unique ID.
 * Uses file locking to prevent race conditions when multiple processes
 * create tasks concurrently.
 */
export async function createTask(
  taskListId: string,
  taskData: Omit<Task, 'id'>,
): Promise<string> {
  const lockPath = await ensureTaskListLockFile(taskListId)

  let release: (() => Promise<void>) | undefined
  try {
    // Acquire exclusive lock on the task list
    release = await lock(lockPath, LOCK_OPTIONS)

    // Read highest ID from disk while holding the lock
    const highestId = await findHighestTaskId(taskListId)
    const id = String(highestId + 1)
    const task: Task = { id, ...taskData }
    const path = getTaskPath(taskListId, id)
    // delta ③：旧 3 参 (task, null, 2) → 新 2 参 (task, 2)
    await writeFile(path, jsonStringify(task, 2))
    notifyTasksUpdated()
    return id
  } finally {
    if (release) {
      await release()
    }
  }
}

export async function getTask(
  taskListId: string,
  taskId: string,
): Promise<Task | null> {
  const path = getTaskPath(taskListId, taskId)
  try {
    const content = await readFile(path, 'utf-8')
    const data = jsonParse(content)

    // delta ①：旧 TaskSchema().safeParse → 本地 validateTask 等价结构校验
    const parsed = validateTask(data)
    if (!parsed) {
      logForDebugging(
        `[Tasks] Task ${taskId} failed schema validation: invalid structure`,
      )
      return null
    }
    return parsed
  } catch (e) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return null
    }
    logForDebugging(`[Tasks] Failed to read task ${taskId}: ${errorMessage(e)}`)
    logError(e)
    return null
  }
}

// Internal: no lock. Callers already holding a lock on taskPath must use this
// to avoid deadlock (claimTask, deleteTask cascade, etc.).
async function updateTaskUnsafe(
  taskListId: string,
  taskId: string,
  updates: Partial<Omit<Task, 'id'>>,
): Promise<Task | null> {
  const existing = await getTask(taskListId, taskId)
  if (!existing) {
    return null
  }
  const updated: Task = { ...existing, ...updates, id: taskId }
  const path = getTaskPath(taskListId, taskId)
  await writeFile(path, jsonStringify(updated, 2))
  notifyTasksUpdated()
  return updated
}

export async function updateTask(
  taskListId: string,
  taskId: string,
  updates: Partial<Omit<Task, 'id'>>,
): Promise<Task | null> {
  const path = getTaskPath(taskListId, taskId)

  // Check existence before locking — proper-lockfile throws if the
  // target file doesn't exist, and we want a clean null result.
  const taskBeforeLock = await getTask(taskListId, taskId)
  if (!taskBeforeLock) {
    return null
  }

  let release: (() => Promise<void>) | undefined
  try {
    release = await lock(path, LOCK_OPTIONS)
    return await updateTaskUnsafe(taskListId, taskId, updates)
  } finally {
    await release?.()
  }
}

export async function deleteTask(
  taskListId: string,
  taskId: string,
): Promise<boolean> {
  const path = getTaskPath(taskListId, taskId)

  try {
    // Update high water mark before deleting to prevent ID reuse
    const numericId = parseInt(taskId, 10)
    if (!isNaN(numericId)) {
      const currentMark = await readHighWaterMark(taskListId)
      if (numericId > currentMark) {
        await writeHighWaterMark(taskListId, numericId)
      }
    }

    // Delete the task file
    try {
      await unlink(path)
    } catch (e) {
      const code = getErrnoCode(e)
      if (code === 'ENOENT') {
        return false
      }
      throw e
    }

    // Remove references to this task from other tasks
    const allTasks = await listTasks(taskListId)
    for (const task of allTasks) {
      const newBlocks = task.blocks.filter(id => id !== taskId)
      const newBlockedBy = task.blockedBy.filter(id => id !== taskId)
      if (
        newBlocks.length !== task.blocks.length ||
        newBlockedBy.length !== task.blockedBy.length
      ) {
        await updateTask(taskListId, task.id, {
          blocks: newBlocks,
          blockedBy: newBlockedBy,
        })
      }
    }

    notifyTasksUpdated()
    return true
  } catch {
    return false
  }
}

export async function listTasks(taskListId: string): Promise<Task[]> {
  const dir = getTasksDir(taskListId)
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }
  const taskIds = files
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
  const results = await Promise.all(taskIds.map(id => getTask(taskListId, id)))
  return results.filter((t): t is Task => t !== null)
}

export async function blockTask(
  taskListId: string,
  fromTaskId: string,
  toTaskId: string,
): Promise<boolean> {
  const [fromTask, toTask] = await Promise.all([
    getTask(taskListId, fromTaskId),
    getTask(taskListId, toTaskId),
  ])
  if (!fromTask || !toTask) {
    return false
  }

  // Update source task: A blocks B
  if (!fromTask.blocks.includes(toTaskId)) {
    await updateTask(taskListId, fromTaskId, {
      blocks: [...fromTask.blocks, toTaskId],
    })
  }

  // Update target task: B is blockedBy A
  if (!toTask.blockedBy.includes(fromTaskId)) {
    await updateTask(taskListId, toTaskId, {
      blockedBy: [...toTask.blockedBy, fromTaskId],
    })
  }

  return true
}

export type ClaimTaskResult = {
  success: boolean
  reason?:
    | 'task_not_found'
    | 'already_claimed'
    | 'already_resolved'
    | 'blocked'
    | 'agent_busy'
  task?: Task
  busyWithTasks?: string[] // task IDs the agent is busy with (when reason is 'agent_busy')
  blockedByTasks?: string[] // task IDs blocking this task (when reason is 'blocked')
}

/**
 * Gets the lock file path for a task list (used for list-level locking)
 */
function getTaskListLockPath(taskListId: string): string {
  return join(getTasksDir(taskListId), '.lock')
}

/**
 * Ensures the lock file exists for a task list
 */
async function ensureTaskListLockFile(taskListId: string): Promise<string> {
  await ensureTasksDir(taskListId)
  const lockPath = getTaskListLockPath(taskListId)
  // proper-lockfile requires the target file to exist. Create it with the
  // 'wx' flag (write-exclusive) so concurrent callers don't both create it,
  // and the first one to create wins silently.
  try {
    await writeFile(lockPath, '', { flag: 'wx' })
  } catch {
    // EEXIST or other — file already exists, which is fine.
  }
  return lockPath
}

export type ClaimTaskOptions = {
  /**
   * If true, checks whether the agent is already busy (owns other open tasks)
   * before allowing the claim. This check is performed atomically with the claim
   * using a task-list-level lock to prevent TOCTOU race conditions.
   */
  checkAgentBusy?: boolean
}

/**
 * Attempts to claim a task for an agent with file locking to prevent race conditions.
 * Returns success if the task was claimed, or a reason if it wasn't.
 *
 * When checkAgentBusy is true, uses a task-list-level lock to atomically check
 * if the agent owns any other open tasks before claiming.
 */
export async function claimTask(
  taskListId: string,
  taskId: string,
  claimantAgentId: string,
  options: ClaimTaskOptions = {},
): Promise<ClaimTaskResult> {
  const taskPath = getTaskPath(taskListId, taskId)

  // Check existence before locking — proper-lockfile.lock throws if the
  // target file doesn't exist, and we want a clean task_not_found result.
  const taskBeforeLock = await getTask(taskListId, taskId)
  if (!taskBeforeLock) {
    return { success: false, reason: 'task_not_found' }
  }

  // If we need to check agent busy status, use task-list-level lock
  // to prevent TOCTOU race conditions
  if (options.checkAgentBusy) {
    return claimTaskWithBusyCheck(taskListId, taskId, claimantAgentId)
  }

  // Otherwise, use task-level lock (original behavior)
  let release: (() => Promise<void>) | undefined
  try {
    // Acquire exclusive lock on the task file
    release = await lock(taskPath, LOCK_OPTIONS)

    // Read current task state
    const task = await getTask(taskListId, taskId)
    if (!task) {
      return { success: false, reason: 'task_not_found' }
    }

    // Check if already claimed by another agent
    if (task.owner && task.owner !== claimantAgentId) {
      return { success: false, reason: 'already_claimed', task }
    }

    // Check if already resolved
    if (task.status === 'completed') {
      return { success: false, reason: 'already_resolved', task }
    }

    // Check for unresolved blockers (open or in_progress tasks block)
    const allTasks = await listTasks(taskListId)
    const unresolvedTaskIds = new Set(
      allTasks.filter(t => t.status !== 'completed').map(t => t.id),
    )
    const blockedByTasks = task.blockedBy.filter(id =>
      unresolvedTaskIds.has(id),
    )
    if (blockedByTasks.length > 0) {
      return { success: false, reason: 'blocked', task, blockedByTasks }
    }

    // Claim the task (already holding taskPath lock — use unsafe variant)
    const updated = await updateTaskUnsafe(taskListId, taskId, {
      owner: claimantAgentId,
    })
    return { success: true, task: updated! }
  } catch (error) {
    logForDebugging(
      `[Tasks] Failed to claim task ${taskId}: ${errorMessage(error)}`,
    )
    logError(error)
    return { success: false, reason: 'task_not_found' }
  } finally {
    if (release) {
      await release()
    }
  }
}

/**
 * Claims a task with an atomic check for agent busy status.
 * Uses a task-list-level lock to ensure the busy check and claim are atomic.
 */
async function claimTaskWithBusyCheck(
  taskListId: string,
  taskId: string,
  claimantAgentId: string,
): Promise<ClaimTaskResult> {
  const lockPath = await ensureTaskListLockFile(taskListId)

  let release: (() => Promise<void>) | undefined
  try {
    // Acquire exclusive lock on the task list
    release = await lock(lockPath, LOCK_OPTIONS)

    // Read all tasks to check agent status and task state atomically
    const allTasks = await listTasks(taskListId)

    // Find the task we want to claim
    const task = allTasks.find(t => t.id === taskId)
    if (!task) {
      return { success: false, reason: 'task_not_found' }
    }

    // Check if already claimed by another agent
    if (task.owner && task.owner !== claimantAgentId) {
      return { success: false, reason: 'already_claimed', task }
    }

    // Check if already resolved
    if (task.status === 'completed') {
      return { success: false, reason: 'already_resolved', task }
    }

    // Check for unresolved blockers (open or in_progress tasks block)
    const unresolvedTaskIds = new Set(
      allTasks.filter(t => t.status !== 'completed').map(t => t.id),
    )
    const blockedByTasks = task.blockedBy.filter(id =>
      unresolvedTaskIds.has(id),
    )
    if (blockedByTasks.length > 0) {
      return { success: false, reason: 'blocked', task, blockedByTasks }
    }

    // Check if agent is busy with other unresolved tasks
    const agentOpenTasks = allTasks.filter(
      t =>
        t.status !== 'completed' &&
        t.owner === claimantAgentId &&
        t.id !== taskId,
    )
    if (agentOpenTasks.length > 0) {
      return {
        success: false,
        reason: 'agent_busy',
        task,
        busyWithTasks: agentOpenTasks.map(t => t.id),
      }
    }

    // Claim the task
    const updated = await updateTask(taskListId, taskId, {
      owner: claimantAgentId,
    })
    return { success: true, task: updated! }
  } catch (error) {
    logForDebugging(
      `[Tasks] Failed to claim task ${taskId} with busy check: ${errorMessage(error)}`,
    )
    logError(error)
    return { success: false, reason: 'task_not_found' }
  } finally {
    if (release) {
      await release()
    }
  }
}

/**
 * Team member info (subset of TeamFile member structure)
 */
export type TeamMember = {
  agentId: string
  name: string
  agentType?: string
}

/**
 * Agent status based on task ownership
 */
export type AgentStatus = {
  agentId: string
  name: string
  agentType?: string
  status: 'idle' | 'busy'
  currentTasks: string[] // task IDs the agent owns
}

/**
 * Sanitizes a name for use in file paths
 */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
}

/**
 * Reads team members from the team file
 */
async function readTeamMembers(
  teamName: string,
): Promise<{ leadAgentId: string; members: TeamMember[] } | null> {
  const teamsDir = getTeamsDir()
  const teamFilePath = join(teamsDir, sanitizeName(teamName), 'config.json')
  try {
    const content = await readFile(teamFilePath, 'utf-8')
    const teamFile = jsonParse(content) as {
      leadAgentId: string
      members: TeamMember[]
    }
    return {
      leadAgentId: teamFile.leadAgentId,
      members: teamFile.members.map(m => ({
        agentId: m.agentId,
        name: m.name,
        agentType: m.agentType,
      })),
    }
  } catch (e) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return null
    }
    logForDebugging(
      `[Tasks] Failed to read team file for ${teamName}: ${errorMessage(e)}`,
    )
    return null
  }
}

/**
 * Gets the status of all agents in a team based on task ownership.
 * An agent is considered "idle" if they don't own any open tasks.
 * An agent is considered "busy" if they own at least one open task.
 *
 * @param teamName - The name of the team (also used as taskListId)
 * @returns Array of agent statuses, or null if team not found
 */
export async function getAgentStatuses(
  teamName: string,
): Promise<AgentStatus[] | null> {
  const teamData = await readTeamMembers(teamName)
  if (!teamData) {
    return null
  }

  const taskListId = sanitizeName(teamName)
  const allTasks = await listTasks(taskListId)

  // Get unresolved tasks grouped by owner (open or in_progress)
  const unresolvedTasksByOwner = new Map<string, string[]>()
  for (const task of allTasks) {
    if (task.status !== 'completed' && task.owner) {
      const existing = unresolvedTasksByOwner.get(task.owner) || []
      existing.push(task.id)
      unresolvedTasksByOwner.set(task.owner, existing)
    }
  }

  // Build status for each agent (leader is already in members)
  return teamData.members.map(member => {
    // Check both name (new) and agentId (legacy) for backwards compatibility
    const tasksByName = unresolvedTasksByOwner.get(member.name) || []
    const tasksById = unresolvedTasksByOwner.get(member.agentId) || []
    const currentTasks = uniq([...tasksByName, ...tasksById])
    return {
      agentId: member.agentId,
      name: member.name,
      agentType: member.agentType,
      status: currentTasks.length === 0 ? 'idle' : 'busy',
      currentTasks,
    }
  })
}

/**
 * Result of unassigning tasks from a teammate
 */
export type UnassignTasksResult = {
  unassignedTasks: Array<{ id: string; subject: string }>
  notificationMessage: string
}

/**
 * Unassigns all open tasks from a teammate and builds a notification message.
 * Used when a teammate is killed or gracefully shuts down.
 *
 * @param teamName - The team/task list name
 * @param teammateId - The teammate's agent ID
 * @param teammateName - The teammate's display name
 * @param reason - How the teammate exited ('terminated' | 'shutdown')
 * @returns The unassigned tasks and a formatted notification message
 */
export async function unassignTeammateTasks(
  teamName: string,
  teammateId: string,
  teammateName: string,
  reason: 'terminated' | 'shutdown',
): Promise<UnassignTasksResult> {
  const tasks = await listTasks(teamName)
  const unresolvedAssignedTasks = tasks.filter(
    t =>
      t.status !== 'completed' &&
      (t.owner === teammateId || t.owner === teammateName),
  )

  // Unassign each task and reset status to open
  for (const task of unresolvedAssignedTasks) {
    await updateTask(teamName, task.id, { owner: undefined, status: 'pending' })
  }

  if (unresolvedAssignedTasks.length > 0) {
    logForDebugging(
      `[Tasks] Unassigned ${unresolvedAssignedTasks.length} task(s) from ${teammateName}`,
    )
  }

  // Build notification message
  const actionVerb =
    reason === 'terminated' ? 'was terminated' : 'has shut down'
  let notificationMessage = `${teammateName} ${actionVerb}.`
  if (unresolvedAssignedTasks.length > 0) {
    const taskList = unresolvedAssignedTasks
      .map(t => `#${t.id} "${t.subject}"`)
      .join(', ')
    notificationMessage += ` ${unresolvedAssignedTasks.length} task(s) were unassigned: ${taskList}. Use TaskList to check availability and TaskUpdate with owner to reassign them to idle teammates.`
  }

  return {
    unassignedTasks: unresolvedAssignedTasks.map(t => ({
      id: t.id,
      subject: t.subject,
    })),
    notificationMessage,
  }
}

export const DEFAULT_TASKS_MODE_TASK_LIST_ID = 'tasklist'
