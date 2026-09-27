/**
 * task 域种子 — Task.ts 随迁（C-Deep 切片 3 T1，旧仓 a8af45b src/Task.ts 125L）
 *
 * 真核心 = TaskType/TaskStatus 枚举面 + canonical TaskId（TASK_ID_PREFIXES
 * 前缀族 b/a/r/t/w/m/d，未知回落 x）+ generateTaskId（36^8 ≈ 2.8T 组合，
 * 抗 symlink 暴力）+ createTaskStateBase。
 *
 * 裁剪残余（复审勿当遗漏重提）：
 * ① AppState = 域内最小类型 TaskAppState（engine 波接入全量 AppState 时替换）
 * ② AgentId brand 类型未移植 → agentId 暂用 string（engine 波 types/ids 随迁后收编）
 * ③ Task（kill 派发）/ TaskContext 消费方在 engine（src/tasks/* impls /
 *    swarm/inProcessRunner——C 桶 ③ S-E2d（§8.66）已落 swarm 域
 *    inProcessRunner.ts hub 1536L；spawnMultiAgent = 旧仓零命中陈旧名，
 *    消费面 = coordinator 注册表 TaskState 联合扩（B14 登记，docs L2509）
 *    残留守）——类型面保留
 * ④ src/tasks.ts 注册表（getAllTasks/getTaskByType 按 TaskType 派发 kill）
 *    归 engine 波（消费方同上）
 * ⑤ static 轮询（TaskOutput.startPolling/stopPolling）保留 API 零消费者
 *    （旧仓唯一调用方 PowerShellTool.tsx React 层未移植，归 engine）
 */
import { randomBytes } from "crypto"
import { getTaskOutputPath } from "./diskOutput"

export type TaskType =
  | "local_bash"
  | "local_agent"
  | "remote_agent"
  | "in_process_teammate"
  | "local_workflow"
  | "monitor_mcp"
  | "dream"

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "killed"

/**
 * True when a task is in a terminal state and will not transition further.
 * Used to guard against injecting messages into dead teammates, evicting
 * finished tasks from AppState, and orphan-cleanup paths.
 */
export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === "completed" || status === "failed" || status === "killed"
}

export type TaskHandle = {
  taskId: string
  cleanup?: () => void
}

/**
 * 域内最小 AppState（残余 ①）：task 域只消费 tasks 记录面。
 * engine 波接入全量 AppState 时以真实类型替换本类型。
 */
export type TaskAppState = {
  tasks: Record<string, TaskStateBase>
}

export type SetAppState = (f: (prev: TaskAppState) => TaskAppState) => void

export type TaskContext = {
  abortController: AbortController
  getAppState: () => TaskAppState
  setAppState: SetAppState
}

// Base fields shared by all task states
export type TaskStateBase = {
  id: string
  type: TaskType
  status: TaskStatus
  description: string
  toolUseId?: string
  startTime: number
  endTime?: number
  totalPausedMs?: number
  outputFile: string
  outputOffset: number
  notified: boolean
}

export type LocalShellSpawnInput = {
  command: string
  description: string
  timeout?: number
  toolUseId?: string
  /** 残余 ②：旧仓为 AgentId brand 类型，engine 波 types/ids 随迁后收编 */
  agentId?: string
  /** UI display variant: description-as-label, dialog title, status bar pill. */
  kind?: "bash" | "monitor"
}

// What getTaskByType dispatches for: kill. spawn/render were never
// called polymorphically (removed in #22546). All six kill implementations
// use only setAppState — getAppState/abortController were dead weight.
export type Task = {
  name: string
  type: TaskType
  kill(taskId: string, setAppState: SetAppState): Promise<void>
}

// Task ID prefixes
const TASK_ID_PREFIXES: Record<string, string> = {
  local_bash: "b", // Keep as 'b' for backward compatibility
  local_agent: "a",
  remote_agent: "r",
  in_process_teammate: "t",
  local_workflow: "w",
  monitor_mcp: "m",
  dream: "d",
}

// Get task ID prefix
function getTaskIdPrefix(type: TaskType): string {
  return TASK_ID_PREFIXES[type] ?? "x"
}

// Case-insensitive-safe alphabet (digits + lowercase) for task IDs.
// 36^8 ≈ 2.8 trillion combinations, sufficient to resist brute-force symlink attacks.
const TASK_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"

export function generateTaskId(type: TaskType): string {
  const prefix = getTaskIdPrefix(type)
  const bytes = randomBytes(8)
  let id = prefix
  for (let i = 0; i < 8; i++) {
    id += TASK_ID_ALPHABET[bytes[i]! % TASK_ID_ALPHABET.length]
  }
  return id
}

export function createTaskStateBase(
  id: string,
  type: TaskType,
  description: string,
  toolUseId?: string,
): TaskStateBase {
  return {
    id,
    type,
    status: "pending",
    description,
    toolUseId,
    startTime: Date.now(),
    outputFile: getTaskOutputPath(id),
    outputOffset: 0,
    notified: false,
  }
}
