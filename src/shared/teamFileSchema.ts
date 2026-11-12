/**
 * team file schema + durable IO 单源（0.1.100 W-D-B-1 段 D lock-face 批复形
 * @bbe99518，工单 docs/2026-11-12-p0-wave-01100-wdb1-persistence-ticket.md）。
 *
 * 单源纪律（工单 §2.3）：team file schema 单源新文件——swarm/teamHelpers 与
 * tui/utils/swarm/teamHelpers 双副本 + TeamServicesFile 镜像统一 import 本
 * 模块（副本收敛）；durable 写入回读原语（七条(c) lockfile + 原子写 tmp+
 * rename 入 schema 面）同置本文件。
 *
 * F1 分档形（工单 §6 必改 1）：Form A 门 ON/OFF 语义与「A 全程零写盘」
 * standing 判据不变；durable 面挂独立 durable 档（settings teams.persistence，
 * OFF='memory' 缺省）。本模块全部 IO 原语仅供 durable 支消费，OFF 支不可达。
 *
 * 0.1.36 TeamFile 遗产 = 弃置定谳：无 schemaVersion 字段文件 = foreign
 * 拒读（fail-visible 错误面含测得版本/缺失与迁移指引），零迁移、零降级
 * 半解析（演进策略 = 拒读 fail-visible 默认）。
 */
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { join } from 'path'
import { z } from 'zod'
import { errorMessage, getErrnoCode, logForDebugging } from './index'
import { getConfigDirName } from './configDir'
import type { PermissionMode } from './types-session'

/** schema 版本（v2 = 本波定形；v1 = 0.1.36 旧 TeamFile 无版本字段，弃置）。 */
export const TEAM_FILE_SCHEMA_VERSION = 2

/** durable 档取值（settings teams.persistence；缺省 'memory'）。 */
export type TeamPersistenceMode = 'memory' | 'durable'

/** 0.1.36 TeamAllowedPath 收编（tui 副本逐字段）。 */
export type TeamAllowedPath = {
  path: string
  toolName: string
  addedBy: string
  addedAt: number
}

/** Form A 角色化成员名册条目（自 engine/tools/team/teamServices.ts 单源收编；
 * 原地 re-export 保持消费面不变）。 */
export type TeamRosterEntry = {
  name: string
  role?: string
  goal?: string
  backstory?: string
}

/** v2 成员条目 = TeamServicesFile member 面 + 0.1.36 全量字段收编。 */
export type TeamMemberV2 = {
  agentId: string
  name: string
  agentType?: string
  model?: string
  prompt?: string
  color?: string
  planModeRequired?: boolean
  joinedAt: number
  tmuxPaneId: string
  cwd: string
  worktreePath?: string
  sessionId?: string
  subscriptions: string[]
  backendType?: string
  isActive?: boolean // false = idle/finished，undefined/true = active
  mode?: PermissionMode
}

/** 0.1.36 遗产全量字段（hiddenPaneIds/teamAllowedPaths，tmux 车道消费面）
 * 收编为 v2 可选成员——弃置定谳针对无版本文件拒读，不丢在场字段。 */
export type TeamFileLegacyExtras = {
  hiddenPaneIds?: string[]
  teamAllowedPaths?: TeamAllowedPath[]
}

/** v2 team file（durable 支写形）。 */
export type TeamFileV2 = {
  schemaVersion: 2
  name: string
  description?: string
  createdAt: number
  leadAgentId: string
  leadSessionId?: string
  /** 0.1.93 W-D-A 裁除回填位（teamCreateTool Form A 注记 260 行）。 */
  leadModel?: string
  /** v2 恒 'durable'（写入即 durable 支）。 */
  persistence: 'durable'
  /** 七条(b) 二次验证锚：boot 级 lead 进程 instance id（getLeadInstanceId）。 */
  leadInstanceId: string
  roster?: TeamRosterEntry[]
  members: TeamMemberV2[]
} & TeamFileLegacyExtras

/** 0.1.36 遗产形（无 schemaVersion）= v2 剥持久面字段（弃置定谳：禁新增
 * 消费点，tmux 车道现网行为维持；本别名 = 双副本收敛单源锚）。 */
export type TeamFile = Omit<
  TeamFileV2,
  'schemaVersion' | 'persistence' | 'leadInstanceId' | 'roster'
>

// ── zod schema（七条(a)：落盘文件 = 不可信输入，白名单剥未知字段）────
// zod object 缺省 strip 未知键 = 字段白名单语义；禁 strict（strict = 未知
// 字段报错，此处语义为剥除非拒读——版本面拒读归 schemaVersion 判据）。

export const teamFileV2Schema = z.object({
  schemaVersion: z.literal(2),
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.number(),
  leadAgentId: z.string().min(1),
  leadSessionId: z.string().optional(),
  leadModel: z.string().optional(),
  persistence: z.literal('durable'),
  leadInstanceId: z.string().min(1),
  roster: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().optional(),
        goal: z.string().optional(),
        backstory: z.string().optional(),
      }),
    )
    .optional(),
  members: z.array(
    z.object({
      agentId: z.string().min(1),
      name: z.string().min(1),
      agentType: z.string().optional(),
      model: z.string().optional(),
      prompt: z.string().optional(),
      color: z.string().optional(),
      planModeRequired: z.boolean().optional(),
      joinedAt: z.number(),
      tmuxPaneId: z.string(),
      cwd: z.string(),
      worktreePath: z.string().optional(),
      sessionId: z.string().optional(),
      subscriptions: z.array(z.string()),
      backendType: z.string().optional(),
      isActive: z.boolean().optional(),
      mode: z.string().optional(),
    }),
  ),
  hiddenPaneIds: z.array(z.string()).optional(),
  teamAllowedPaths: z
    .array(
      z.object({
        path: z.string(),
        toolName: z.string(),
        addedBy: z.string(),
        addedAt: z.number(),
      }),
    )
    .optional(),
})

export type ParsedTeamFileV2 =
  | { ok: true; file: TeamFileV2 }
  | { ok: false; error: string }

/** v2 回读解析（七条(a) 白名单校验 + 演进拒读 fail-visible）。
 * 错误面含测得 schemaVersion（或 'missing'）与迁移指引——禁静默降级半解析。 */
export function parseTeamFileV2(content: string): ParsedTeamFileV2 {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch (e) {
    return {
      ok: false,
      error: `team file is not valid JSON: ${errorMessage(e)}`,
    }
  }
  const measured =
    raw !== null && typeof raw === 'object' && 'schemaVersion' in raw
      ? String((raw as { schemaVersion: unknown }).schemaVersion)
      : 'missing'
  if (measured !== '2') {
    // 0.1.36 遗产（'missing'）与异版本同面：foreign 拒读 + 指引。
    return {
      ok: false,
      error:
        `team file schemaVersion ${measured} is not supported ` +
        `(expected 2). Legacy 0.1.36 team files are not migrated ` +
        `(弃置定谳); delete the team directory or recreate the team ` +
        `with a 0.1.100+ lead to regenerate a v2 file.`,
    }
  }
  const parsed = teamFileV2Schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: `team file failed v2 schema validation: ${parsed.error.issues
        .slice(0, 3)
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    }
  }
  return { ok: true, file: parsed.data as TeamFileV2 }
}

// ── lead instance id（七条(b) 二次验证锚）────────────────────────────
// boot 级：模块缓存 randomUUID，lead 进程生命周期内恒定；重启即新值 →
// relink 比对不匹配 = 全员 halfAttached（lock-face §3 判据 2）。

let leadInstanceId: string | undefined

/** lead 进程 instance id（boot 级模块缓存；测试可 resetLeadInstanceId 复位）。 */
export function getLeadInstanceId(): string {
  if (!leadInstanceId) {
    leadInstanceId = randomUUID()
  }
  return leadInstanceId
}

/** 测试复位（teardown 用）。 */
export function resetLeadInstanceId(): void {
  leadInstanceId = undefined
}

// ── teams 目录锚（homedir 锚；L1 全路径旁路同 envUtils 语义）────────────
// ATLAS_CONFIG_DIR（全路径显式）? join(L1, 'teams') : join(homedir(),
// getConfigDirName(), 'teams')——与 engine memory/envUtils、tui envUtils
// 两车道 getTeamsDir 同语义（KEEP 行 env 旁路先例，禁 getConfigDirName
// 单值混用 = 0.1.99 row F 双出口纪律）。

export function getTeamsDirShared(): string {
  const l1 = process.env.ATLAS_CONFIG_DIR
  if (l1) return join(l1, 'teams')
  return join(homedir(), getConfigDirName(), 'teams')
}

// ── durable IO 原语（七条(c)：lockfile + 原子写 tmp+rename）─────────────

/** stale lock 夺锁双门参数（lock-face §2 必答定形）：mtime 年龄与 PID 存活
 * 双条件与；有界重试后 fail-visible 不夺锁；夺锁成功记告警禁静默。 */
export const STALE_LOCK_MS = 10_000
export const LOCK_RETRY_MAX = 3
const LOCK_RETRY_DELAY_MS = 100

function teamDir(teamName: string): string {
  return join(getTeamsDirShared(), sanitizeTeamName(teamName))
}

/** team file 路径（与 swarm/tui 两车道 getTeamFilePath 同语义）。 */
export function getTeamFilePathShared(teamName: string): string {
  return join(teamDir(teamName), 'config.json')
}

/** 与 swarm sanitizeName 同语义（单源化就地实现，禁跨域 import 环）。 */
function sanitizeTeamName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
}

function isPidAlive(pid: number): boolean {
  try {
    // signal 0 探测：进程存在即成功（EPERM 也算存活，kill 抛 ESMRCH 才死）。
    process.kill(pid, 0)
    return true
  } catch (e) {
    return getErrnoCode(e) === 'EPERM'
  }
}

type StaleLockDecision =
  | { action: 'acquire' }
  | { action: 'steal'; warning: string }
  | { action: 'fail'; error: string }

/** stale lock 夺锁双门判（lock-face §2）：mtime > STALE_LOCK_MS **且**
 * lock PID 不存活才夺；单条件不满足 = 未 stale。双门全 stale → 夺锁
 * （warning fail-visible 文案可判读，禁 log-only 静默形）。 */
export function decideStaleLock(
  lockMtimeMs: number,
  lockPid: number | undefined,
  nowMs: number = Date.now(),
): StaleLockDecision {
  const ageOk = nowMs - lockMtimeMs > STALE_LOCK_MS
  const pidDead = lockPid === undefined || !isPidAlive(lockPid)
  if (ageOk && pidDead) {
    return {
      action: 'steal',
      warning:
        `stale team file lock stolen: lock older than ` +
        `${STALE_LOCK_MS}ms and holder pid ${lockPid ?? 'unknown'} not alive`,
    }
  }
  if (!ageOk) {
    return {
      action: 'fail',
      error: `team file lock is fresh (age < ${STALE_LOCK_MS}ms) — not stealing`,
    }
  }
  return {
    action: 'fail',
    error: `team file lock holder pid ${lockPid ?? 'unknown'} is still alive — not stealing`,
  }
}

async function withTeamFileLock<T>(
  teamName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const { open, unlink } = await import('fs/promises')
  const lockPath = `${getTeamFilePathShared(teamName)}.lock`
  let acquired = false
  let stolen = false
  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
    try {
      // wx 独占创建 = 无锁竞态面（O_EXCL 原子）。
      const fh = await open(lockPath, 'wx')
      await fh.write(Buffer.from(JSON.stringify({ pid: process.pid })))
      await fh.close()
      acquired = true
      break
    } catch (e) {
      if (getErrnoCode(e) !== 'EEXIST') throw e
      // 锁在：读 lock 内容取 PID + mtime，走双门判。
      try {
        const stat = await (await import('fs/promises')).stat(lockPath)
        let lockPid: number | undefined
        try {
          const raw = await (await import('fs/promises')).readFile(
            lockPath,
            'utf-8',
          )
          const parsed = JSON.parse(raw) as { pid?: unknown }
          if (typeof parsed?.pid === 'number') lockPid = parsed.pid
        } catch {
          // lock 内容不可读/非 JSON = PID 未知（decideStaleLock 按 undefined 处理）。
        }
        const decision = decideStaleLock(stat.mtimeMs, lockPid)
        if (decision.action === 'steal') {
          logForDebugging(`[teamFileSchema] ${decision.warning}`, {
            level: 'warn',
          })
          await unlink(lockPath)
          stolen = true
          continue // 立即重试夺取（不 sleep——锁已清）
        }
        if (decision.action === 'fail' && attempt < LOCK_RETRY_MAX - 1) {
          await new Promise(r => setTimeout(r, LOCK_RETRY_DELAY_MS))
          continue
        }
        throw new Error(
          `team file lock acquisition failed after ${LOCK_RETRY_MAX} attempts: ${decision.action === 'fail' ? decision.error : getErrnoCode(e)}`,
        )
      } catch (inner) {
        if (inner instanceof Error && inner.message.includes('lock acquisition failed')) {
          throw inner
        }
        throw e
      }
    }
  }
  if (!acquired && !stolen) {
    throw new Error(
      `team file lock acquisition failed after ${LOCK_RETRY_MAX} attempts (no lock created)`,
    )
  }
  try {
    return await fn()
  } finally {
    if (acquired || stolen) {
      await unlink(lockPath).catch(() => {})
    }
  }
}

/** durable 原子写（tmp+rename；写中 kill reader 见旧全量态零 partial）。
 * 调用方须已在 durable 支内（OFF 支不可达 = F1 standing 判据）。 */
export async function writeTeamFileV2Atomic(
  teamName: string,
  file: TeamFileV2,
): Promise<void> {
  const { mkdir, rename, writeFile } = await import('fs/promises')
  await withTeamFileLock(teamName, async () => {
    const dir = teamDir(teamName)
    await mkdir(dir, { recursive: true })
    const finalPath = getTeamFilePathShared(teamName)
    const tmpPath = `${finalPath}.tmp-${process.pid}`
    await writeFile(tmpPath, JSON.stringify(file, null, 2), 'utf-8')
    await rename(tmpPath, finalPath)
  })
}

/** durable 回读（七条(a) parseTeamFileV2 白名单校验；foreign = fail-visible
 * 错误面，禁半解析）。文件不存在 = null（调用方回落现网 Form A 行为）。 */
export async function readTeamFileV2(
  teamName: string,
): Promise<TeamFileV2 | null> {
  const { readFile } = await import('fs/promises')
  let content: string
  try {
    content = await readFile(getTeamFilePathShared(teamName), 'utf-8')
  } catch (e) {
    if (getErrnoCode(e) === 'ENOENT') return null
    throw e
  }
  const parsed = parseTeamFileV2(content)
  if (parsed.ok === false) {
    throw new Error(`[teamFileSchema] durable relink read rejected: ${parsed.error}`)
  }
  return parsed.file
}

/** tmp 孤儿清扫（读路径发现 tmp 残留 → fail-visible 告警 + 清扫，禁静默）。 */
export async function sweepTmpOrphans(teamName: string): Promise<string[]> {
  const { readdir, unlink } = await import('fs/promises')
  const dir = teamDir(teamName)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (e) {
    if (getErrnoCode(e) === 'ENOENT') return []
    throw e
  }
  const orphans = names.filter(n => n.startsWith('config.json.tmp-'))
  const swept: string[] = []
  for (const n of orphans) {
    await unlink(join(dir, n)).catch(() => {})
    swept.push(n)
  }
  if (swept.length > 0) {
    logForDebugging(
      `[teamFileSchema] swept ${swept.length} tmp orphan(s) in ${dir}: ${swept.join(', ')}`,
      { level: 'warn' },
    )
  }
  return swept
}
