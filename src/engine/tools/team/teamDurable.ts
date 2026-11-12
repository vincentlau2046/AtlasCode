/**
 * engine/tools/team — team durable 持久化档门 + 支路原语（0.1.100 W-D-B-1
 * 段 D lock-face 批复形 @bbe99518；工单
 * docs/2026-11-12-p0-wave-01100-wdb1-persistence-ticket.md §6 必改 1）。
 *
 * F1 分档形：Form A 门 ON/OFF 语义与「A 全程零写盘」standing 判据全不变；
 * durable 面挂独立档——settings teams.persistence（'memory' 缺省 | 'durable'），
 * ProductDefinition.teamPersistenceDefault 仅作缺省回落（禁 product id
 * 旁路，工单 §6 吸收①）。本模块全部写原语仅供 durable 支消费，OFF 支
 * 不可达（writeTeamFileDurable 内部门判 = 二次防线）。
 *
 * 判别源纪律（工单 §2.4）：门读点经 engine config settings 注入面
 * （getInitialSettings），禁裸 env 直查 lane 判据。
 */
import { getInitialSettings } from '../../config'
import {
  getActiveProductDefinition,
  getLeadInstanceId,
  getTeamFilePathShared,
  logForDebugging,
  readTeamFileV2,
  sweepTmpOrphans,
  writeTeamFileV2Atomic,
  type TeamPersistenceMode,
  type TeamFileV2,
  type TeamMemberV2,
} from '../../../shared'
import {
  requireTeamServices,
  type TeamMemberStateShape,
} from './teamServices'

/** 门 resolver：settings teams.persistence > ProductDefinition 缺省回落 >
 * 'memory'（F1 分档形缺省 = 现网零持久逐字不变）。 */
export function resolveTeamPersistenceMode(): TeamPersistenceMode {
  const fromSettings = getInitialSettings().teams?.persistence
  if (fromSettings) return fromSettings
  const productDefault = getActiveProductDefinition().teamPersistenceDefault
  if (productDefault) return productDefault
  return 'memory'
}

/** durable 支写原语（门判二次防线：'memory' 门下调用 = 编程错误早暴露）。 */
export async function writeTeamFileDurable(input: {
  teamName: string
  file: Omit<TeamFileV2, 'schemaVersion' | 'persistence' | 'leadInstanceId'>
}): Promise<void> {
  if (resolveTeamPersistenceMode() !== 'durable') {
    throw new Error(
      'writeTeamFileDurable called with persistence mode "memory" — durable write path must be gated by teams.persistence',
    )
  }
  const file: TeamFileV2 = {
    ...input.file,
    schemaVersion: 2,
    persistence: 'durable',
    leadInstanceId: getLeadInstanceId(),
  }
  await writeTeamFileV2Atomic(input.teamName, file)
  await sweepTmpOrphans(input.teamName)
}

/** 门 OFF 残留态检测（七条(f)：durable 门 OFF 但 team file 在场 = fail-visible
 * 提示面；只读不写——OFF 支零写盘 standing 判据不破）。 */
export async function checkDurableResidual(
  teamName: string,
): Promise<string | undefined> {
  const path = getTeamFilePathShared(teamName)
  let content: string | undefined
  try {
    const { readFile } = await import('fs/promises')
    content = await readFile(path, 'utf-8')
  } catch {
    return undefined // 无文件 = 无残留
  }
  const parsed = readTeamFileV2ShapeOnly(content)
  return (
    `durable persistence is OFF (teams.persistence != 'durable') but a team ` +
    `file exists at ${path} (${parsed}). It will not be updated or removed ` +
    `by this session; delete the team directory or re-enable durable mode.`
  )
}

/** 残留形态判定（只读；不抛——残留检测自身 fail-soft，形态描述进提示面）。 */
function readTeamFileV2ShapeOnly(content: string): string {
  try {
    const raw = JSON.parse(content) as { schemaVersion?: unknown }
    if (raw?.schemaVersion === 2) return 'schemaVersion 2 (durable)'
    if (raw?.schemaVersion !== undefined)
      return `schemaVersion ${String(raw.schemaVersion)} (unsupported)`
    return 'legacy file without schemaVersion (0.1.36 shape, 弃置定谳)'
  } catch {
    return 'unparseable JSON'
  }
}

/** debug 日志（durable 支写点观测面；OFF 支不达）。 */
export function logDurableWrite(teamName: string, members: number): void {
  logForDebugging(
    `[teamDurable] wrote v2 team file for "${teamName}" (${members} member entries)`,
  )
}

/** durable 支成员 upsert（registerSpawnedTeammate durable 面：spawn 成功后
 * 把成员补入 v2 team file。OFF 支 no-op（零写盘 standing 判据）；durable
 * 支无 team file = 编程错误早暴露（TeamCreate durable 支先行写面）。 */
export async function persistSpawnedTeammateDurable(input: {
  teamName: string
  member: { agentId: string; name: string; agentType?: string; cwd: string }
}): Promise<void> {
  if (resolveTeamPersistenceMode() !== 'durable') return
  const existing = await readTeamFileV2(input.teamName)
  if (!existing) {
    throw new Error(
      `persistSpawnedTeammateDurable: no durable team file for "${input.teamName}" — TeamCreate must run in durable mode before spawning teammates`,
    )
  }
  const member: TeamMemberV2 = {
    agentId: input.member.agentId,
    name: input.member.name,
    ...(input.member.agentType ? { agentType: input.member.agentType } : {}),
    joinedAt: Date.now(),
    tmuxPaneId: '',
    cwd: input.member.cwd,
    subscriptions: [],
  }
  const idx = existing.members.findIndex(
    m => m.agentId === member.agentId || m.name === member.name,
  )
  if (idx >= 0) {
    existing.members[idx] = { ...existing.members[idx], ...member }
  } else {
    existing.members.push(member)
  }
  await writeTeamFileV2Atomic(input.teamName, existing)
  logDurableWrite(input.teamName, existing.members.length)
}

// ── 0.1.100 S3：member registry relink（D-③ 三判据，lock-face §3）──────

/** relink 结果（fail-visible 文案随行；调用方负责输出面呈现）。 */
export type RelinkResult = {
  teamName: string
  /** 判据②：文件 leadInstanceId ≠ 本进程 instance（kill→resume 恒真）。 */
  instanceMismatch: boolean
  /** 判据①：半挂接成员名清单（内存态标记已随 teamContext 回填）。 */
  halfAttachedNames: string[]
  /** fail-visible 提示文案（可判读，禁 log-only 静默形——f4 硬要求②）。 */
  note: string
}

/** relink 探测 + teamContext 回填（回读点 = lead 启动 + resume；预注册形
 * 「teamName 来自 lead 会话态，无会话态不探测」——本原语要求显式 teamName
 * 参数，调用方无会话态不调用，禁目录扫描兜底）。
 *
 * 三判据落码：
 *  ① 半挂接标记 fail-visible：文件成员条目 → `halfAttached: true` 内存态
 *     标记（禁静默重建、禁静默当作活着；TeamDelete 守卫跳过 + 输出面列出）；
 *  ② instance 二次验证前置：readTeamFileV2 白名单回读 + leadInstanceId
 *     比对（mismatch → 全员 halfAttached，含 lead 自身条目重挂接）；
 *  ③ kill→resume→标记可见格：判据格 = S5（写文件 → 新进程 relink →
 *     断言标记可达且输出面可见）。
 * Form A in-process 成员无独立 PID：halfAttached 判据 = task registry
 * 查表——文件成员无 taskId 面（D-⑤ task store 不 durable），不在本进程
 * taskState = 半挂接，不引入伪 PID。
 *
 * 幂等门：本进程已有活跃组态 = 不重复回填（relink 只服务回读点；TeamCreate
 * 正常建组路径不经此函数）。OFF 支 / 无文件 = null（不探测不写盘）。 */
export async function relinkTeamFromDurable(
  teamName: string,
): Promise<RelinkResult | null> {
  if (resolveTeamPersistenceMode() !== 'durable') return null
  const services = requireTeamServices()
  if (services.getTeamContext()) return null
  const file = await readTeamFileV2(teamName)
  if (!file) return null
  const instanceMismatch = file.leadInstanceId !== getLeadInstanceId()
  const halfAttachedNames = file.members.map(m => m.name)
  // teamContext 回填（roster + members 全量；成员条目全量带 halfAttached
  // 内存态标记——禁静默当作活着，消费面 = TeamDelete 守卫跳过 + 列出）。
  const teammates: Record<string, TeamMemberStateShape> = {}
  for (const m of file.members) {
    teammates[m.agentId] = {
      name: m.name,
      ...(m.agentType ? { agentType: m.agentType } : {}),
      ...(m.color ? { color: m.color } : {}),
      tmuxSessionName: '',
      tmuxPaneId: m.tmuxPaneId,
      cwd: m.cwd,
      spawnedAt: m.joinedAt,
      halfAttached: true,
    }
  }
  services.setTeamContext({
    teamName: file.name,
    teamFilePath: getTeamFilePathShared(teamName),
    leadAgentId: file.leadAgentId,
    roster: file.roster,
    teammates,
  })
  const note =
    `Relinked team "${file.name}" from durable file ` +
    `(${getTeamFilePathShared(teamName)}): ${halfAttachedNames.length} ` +
    `member entr${halfAttachedNames.length === 1 ? 'y' : 'ies'} marked ` +
    `half-attached (previous lead instance ${file.leadInstanceId}${instanceMismatch ? '' : ', same instance'}). ` +
    `They are NOT treated as active; TeamDelete will skip them and list ` +
    `them in its output.`
  logForDebugging(`[teamDurable] ${note}`, { level: 'warn' })
  return { teamName: file.name, instanceMismatch, halfAttachedNames, note }
}
