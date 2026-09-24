/**
 * scheduler 域 — 环境注入口 + 域内小工具（S-7b，§8.47 详案）
 *
 * 旧仓 scheduler 依赖 bootstrap/state.js 的 getProjectRoot / getSessionId /
 * session-cron store / getScheduledTasksEnabled —— 这些在新仓旧仓里**全是
 * `: any` stub**（旧仓 bootstrap/state.ts 是"重建 stub"，头注明示 "stub
 * exports"，getSessionCronTasks/addSessionCronTask/getProjectRoot 均返回 {}）。
 * 故 scheduler leaf 只取**真契约面**：file-backed（durable）路径（dir 显式、
 * daemon 风格）——旧仓唯一真跑通的路径。bootstrap 依赖改为**域内注入口**
 * （setSchedulerEnv），组合根接线时覆写；缺省值自洽、可零依赖单测（不跨层
 * import bootstrap，保持域自包含）。
 *
 * 裁剪 + 登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - session-cron store（durable:false 路径 / getSessionCronTasks /
 *     removeSessionCronTasks / listAllCronTasks session 合并）旧仓即 `: any`
 *     stub（返回 {}，非迭代 → 若真跑 REPL 路径会抛）→ 砍，归 CLI/teammate 波。
 *   - getProjectRoot 缺省 = `.git` 上探（旧仓真逻辑逐字，worktree 感知）；
 *     组合根可注 getCwdState / 显式根整换。
 *   - registerExitCleanup 缺省 no-op（旧仓走 coordinator/tasks cleanupRegistry，
 *     跨域 import 破坏域自包含）→ 组合根注真清理，登记为前向接缝。
 *   - isProcessRunning / safeParseJSON / jsonStringify = 域内小工具（旧仓
 *     genericProcessUtils / json / slowOperations 语义逐字，不跨域 import）。
 */
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { dirname, join } from 'path'

export type SchedulerEnv = {
  /** 项目根（<root>/.atlas/scheduled_tasks.json 的父目录）。缺省 = `.git` 上探。 */
  getProjectRoot: () => string
  /** 锁 owner key（锁文件 sessionId 字段）。缺省 = 进程启动捕获的 randomUUID。 */
  getOwnerKey: () => string
  /**
   * 进程退出清理钩子注册（锁释放）。返回 unregister 句柄（旧仓
   * registerCleanup 语义）。缺省 no-op：注册成功但清理不接线（组合根注真
   * 清理，登记为前向接缝）。
   */
  registerExitCleanup: (fn: () => Promise<void>) => () => void
}

/**
 * 旧仓 getProjectRoot 真逻辑逐字：自 process.cwd() 上探最近含 `.git` 的目录
 * （worktree 为 .git 文件、普通仓为目录），无则回落 cwd。
 */
function resolveProjectRoot(): string {
  let dir = process.cwd()
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return process.cwd()
    dir = parent
  }
}

// 进程启动捕获的稳定 owner key（旧仓注释："a randomUUID() captured at startup"）。
const _ownerKey = randomUUID()

let env: SchedulerEnv = {
  getProjectRoot: resolveProjectRoot,
  getOwnerKey: () => _ownerKey,
  // 前向接缝 no-op：注册成功但清理不接线（返回 unregister 以匹配签名；
  // 组合根注真 cleanupRegistry 后本缺省被整换）。
  registerExitCleanup: _fn => () => {},
}

/** 组合根 / 测试覆写（部分合并，未给键保留现值）。 */
export function setSchedulerEnv(partial: Partial<SchedulerEnv>): void {
  env = { ...env, ...partial }
}

export function getSchedulerEnv(): SchedulerEnv {
  return env
}

/**
 * PID 存活探针（旧仓 genericProcessUtils.isProcessRunning 逐字）：
 * `process.kill(pid, 0)` 抛 EPERM（存在但属他人）时保守判 NOT running
 * （锁恢复不偷活锁）；pid<=1 恒 false。
 */
export function isProcessRunning(pid: number): boolean {
  if (pid <= 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** 旧仓 json.js safeParseJSON(raw, false)：解析失败 / 非 JSON 返回 null。 */
export function safeParseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** 旧仓 slowOperations.jsonStringify：JSON.stringify 语义（域内不跨域引）。 */
export function jsonStringify(
  value: unknown,
  replacer?: Parameters<typeof JSON.stringify>[1],
  space?: Parameters<typeof JSON.stringify>[2],
): string {
  return JSON.stringify(value, replacer, space)
}
