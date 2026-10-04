/**
 * 2026-10-05 §4b A 波 A1：session 域 always 规则 sidecar。
 *
 * session 域 allow 规则（destination: 'session'）只活在内存
 * （applyPermissionUpdates 改 toolPermissionContext）。为落实 spec §4b-A1
 * 「resume 恢复、新 session 重置」：
 *   - 写入（权限授予，persistPermissions）：把本 session 的 addRules 合并追加
 *     到 session 转录文件旁的 sidecar
 *     `<projectDir>/<sessionId>.session-rules.json`；
 *   - resume（TUI /resume 与 CLI --resume/--continue 两 chokepoint）：读
 *     sidecar 种回初始 toolPermissionContext；
 *   - 新 session：新 sessionId 无 sidecar 文件 → 天然零残留（结构上满足
 *     「新 session 重置」，无需显式清理）。
 *
 * 该文件是**便利持久层**：写失败不影响内存生效（本 session 内同前缀命中
 * 仍然直接 allow），但按 spec 须显式上报（调用方弹 notification），不静默。
 * 分层纪律：纯 fs + JSON，无 React/网络；损坏/超尺寸文件一律降级为 []。
 */
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getTranscriptPath } from '../sessionStorage.js'
import { getSessionId } from 'src/bootstrap'
import { logForDebugging } from '../debug.js'
import type { PermissionUpdate } from './PermissionUpdateSchema.js'

const SESSION_RULES_FILE_SUFFIX = '.session-rules.json'
/** 防御上限：sidecar 是小型便利层，超 1MB 视为损坏（不信任手写/损坏文件） */
const MAX_SESSION_RULES_BYTES = 1024 * 1024

function sessionRulesPath(sessionId: string, projectDir: string): string {
  return join(projectDir, `${sessionId}${SESSION_RULES_FILE_SUFFIX}`)
}

/**
 * 纯解析（判别单测入口）：JSON 文本 → 校验后的 PermissionUpdate[]。
 * 仅接受本模块写出的形状（addRules + allow + session 域）；任何畸形
 * （非法 JSON / 非数组 / 条目字段不符 / 超尺寸）一律返回 []，不抛。
 */
export function parseSessionRulesJson(json: string): PermissionUpdate[] {
  if (json.length > MAX_SESSION_RULES_BYTES) return []
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return []
  }
  const updates =
    typeof raw === 'object' && raw !== null
      ? (raw as { updates?: unknown }).updates
      : undefined
  if (!Array.isArray(updates)) return []
  const out: PermissionUpdate[] = []
  for (const item of updates) {
    if (!isSessionAddRules(item)) continue
    const rules = (item.rules ?? []).filter(
      (r): r is { toolName: string; ruleContent?: string } =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as { toolName?: unknown }).toolName === 'string',
    )
    if (rules.length === 0) continue
    out.push({
      type: 'addRules',
      rules,
      behavior: 'allow',
      destination: 'session',
    })
  }
  return out
}

/**
 * 类型谓词：把 unknown 收窄到 addRules 变体（PermissionUpdate 是
 * 判别联合，setMode 变体无 behavior/rules，须谓词收窄而非 cast）。
 * 同时校验本模块唯一接受的形状（allow + session 域）。
 */
function isSessionAddRules(
  u: unknown,
): u is Extract<PermissionUpdate, { type: 'addRules' }> {
  if (typeof u !== 'object' || u === null) return false
  const cand = u as {
    type?: unknown
    behavior?: unknown
    destination?: unknown
    rules?: unknown
  }
  return (
    cand.type === 'addRules' &&
    cand.behavior === 'allow' &&
    cand.destination === 'session' &&
    Array.isArray(cand.rules)
  )
}

/** 读 session sidecar；不存在/损坏 → []（不抛）。 */
export async function readSessionPermissionRules(
  sessionId: string,
  projectDir: string,
): Promise<PermissionUpdate[]> {
  try {
    const raw = await readFile(
      sessionRulesPath(sessionId, projectDir),
      'utf8',
    )
    return parseSessionRulesJson(raw)
  } catch (e) {
    logForDebugging(
      `readSessionPermissionRules: no/corrupt sidecar for ${sessionId}: ${e}`,
    )
    return []
  }
}

/**
 * 合并追加 session 域规则到 sidecar（原子写：tmp + rename，去重）。
 * 返回是否成功；失败（磁盘错误等）不抛 —— 调用方负责显式上报。
 */
export async function mergeSessionPermissionRules(
  sessionId: string,
  projectDir: string,
  updates: PermissionUpdate[],
): Promise<boolean> {
  try {
    // 仅持久化 session 域 addRules（本模块唯一写出的形状）
    const incoming: PermissionUpdate[] = updates.filter(
      u => u.type === 'addRules' && u.destination === 'session',
    )
    if (incoming.length === 0) return true
    const existing = await readSessionPermissionRules(sessionId, projectDir)
    const key = (u: PermissionUpdate) => JSON.stringify(u)
    const existingKeys = new Set(existing.map(key))
    const merged = [
      ...existing,
      ...incoming.filter(u => !existingKeys.has(key(u))),
    ]
    await mkdir(projectDir, { recursive: true })
    const target = sessionRulesPath(sessionId, projectDir)
    const tmp = `${target}.tmp-${process.pid}`
    await writeFile(tmp, JSON.stringify({ version: 1, updates: merged }, null, 2))
    await rename(tmp, target)
    return true
  } catch (e) {
    logForDebugging(`mergeSessionPermissionRules failed: ${e}`)
    return false
  }
}

/** 当前 session 的 sidecar 读（resume 恢复入口；transcript 目录 = 项目目录）。 */
export async function readCurrentSessionPermissionRules(): Promise<PermissionUpdate[]> {
  return readSessionPermissionRules(
    getSessionId(),
    dirname(getTranscriptPath()),
  )
}

/** 当前 session 的 sidecar 合并写（权限授予入口；失败由调用方上报）。 */
export async function mergeCurrentSessionPermissionRules(
  updates: PermissionUpdate[],
): Promise<boolean> {
  return mergeSessionPermissionRules(
    getSessionId(),
    dirname(getTranscriptPath()),
    updates,
  )
}
