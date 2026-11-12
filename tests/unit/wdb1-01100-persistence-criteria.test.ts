/**
 * 0.1.100 W-D-B-1 段 G 判据格族（lock-face docs/2026-11-12-01100-wdb1-
 * lockface-main.md §9 十格中 S1-S4 落码面的可离线单测子集；§9-1 Form A
 * 零写盘 standing = wave0193-team-form-a B1 已载，§9-10 前滚/canon 净域
 * = gate 层 canon 运行面，均不在此重复）。
 *
 * 覆盖：
 *   格 2  durable 档 OFF 缺省探针 + settings 缺省回落链（§8 门形）
 *   格 3  durable 往返：writeTeamFileDurable → readTeamFileV2 逐字段回读
 *         → relinkTeamFromDurable teamContext 回填（含 D-⑤ roster 全量）
 *   格 4  tmp 孤儿清扫 fail-visible（sweepTmpOrphans 告警 + 清扫）
 *   格 5  inbox schema 演进格：异版本/非 JSON/非法记录拒读 fail-visible
 *         禁半解析；envelope v1 + legacy 裸数组（显式 legacy 识别）通过
 *   格 6  半挂接标记格：relink → teammates 全量 halfAttached:true + 输出
 *         面 note 可判读；leadInstanceId mismatch → instanceMismatch=true
 *   格 7  崩溃窗口格：writeInboxFileAtomic 原子写（成功后零 tmp 残留 +
 *         落盘内容 = 信封形，写中 reader 恒见旧全量态）
 *   格 8  tmux 双车道同源格：engine/tui 两车道 import 面断言（禁第三副本）
 *   格 9  满载拒收格（七条(e)：MAX_INBOX_MESSAGES fail-visible 拒收，禁
 *         静默丢最旧）+ ack 持久化格（七条(g)：mark-read 写回重读保持）
 *   七条(d) source 白名单前置（isInboxSourceAllowed legacy 缺省放行）
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const SETTINGS_CACHE_PATH = '../../src/engine/config/settingsCache.ts'

let dir = ''
let origConfigDir: string | undefined
let resetSettingsCache: () => void

beforeAll(async () => {
  origConfigDir = process.env.ATLAS_CONFIG_DIR
  dir = mkdtempSync(join(tmpdir(), 'atlas-wdb1-criteria-'))
  process.env.ATLAS_CONFIG_DIR = dir
  ;({ resetSettingsCache } = await import(SETTINGS_CACHE_PATH))
})

afterAll(() => {
  if (origConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = origConfigDir
  rmSync(dir, { recursive: true, force: true })
})

function setSettings(json: unknown): void {
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(json))
  resetSettingsCache()
}

// ── 格 2：durable 档 OFF 缺省探针 + settings 缺省回落链 ──────────────────

describe('格 2：durable 门 OFF 缺省探针 + 回落链（§8 分档形）', () => {
  test('无 settings 无 product default → resolveTeamPersistenceMode = memory（OFF 缺省恒等）', async () => {
    setSettings({})
    const { resolveTeamPersistenceMode } = await import(
      '../../src/engine/tools/team/teamDurable'
    )
    expect(resolveTeamPersistenceMode()).toBe('memory')
  })

  test('settings teams.persistence=durable → durable（门 ON 唯一入口）', async () => {
    setSettings({ teams: { persistence: 'durable' } })
    const { resolveTeamPersistenceMode } = await import(
      '../../src/engine/tools/team/teamDurable'
    )
    expect(resolveTeamPersistenceMode()).toBe('durable')
  })

  test('settings teams.persistence=memory 显式 → memory（缺省值可显式重申）', async () => {
    setSettings({ teams: { persistence: 'memory' } })
    const { resolveTeamPersistenceMode } = await import(
      '../../src/engine/tools/team/teamDurable'
    )
    expect(resolveTeamPersistenceMode()).toBe('memory')
  })
})

// ── 格 3 + 格 6：durable 往返 + 半挂接标记 ───────────────────────────────

describe('格 3+6：durable 往返（写→读→relink 回填）+ 半挂接标记格', () => {
  test('写 → readTeamFileV2 逐字段 → relink 回填 teamContext（halfAttached 全量 + note 可判读）', async () => {
    setSettings({ teams: { persistence: 'durable' } })
    const { writeTeamFileDurable, relinkTeamFromDurable } = await import(
      '../../src/engine/tools/team/teamDurable'
    )
    const teamServicesMod = await import('../../src/engine/tools/team/teamServices')
    const shared = await import('../../src/shared')

    let ctx: unknown = undefined
    teamServicesMod.setTeamServices({
      getTeamContext: () => ctx,
      setTeamContext: (c: unknown) => {
        ctx = c
      },
    } as never)

    mkdirSync(join(dir, 'teams', 'rt-team'), { recursive: true })
    await writeTeamFileDurable({
      teamName: 'rt-team',
      file: {
        name: 'rt-team',
        description: 'roundtrip',
        createdAt: 123,
        leadAgentId: 'lead-1',
        roster: [{ name: 'w1', role: 'dev' }],
        members: [
          {
            agentId: 'lead-1',
            name: 'team-lead',
            joinedAt: 1,
            tmuxPaneId: '',
            cwd: dir,
            subscriptions: [],
          },
          {
            agentId: 'agent-2',
            name: 'w1',
            agentType: 'dev',
            joinedAt: 2,
            tmuxPaneId: '',
            cwd: dir,
            subscriptions: [],
          },
        ],
      },
    })

    // 逐字段回读（§9 格 3）
    const file = await shared.readTeamFileV2('rt-team')
    expect(file).not.toBeNull()
    expect(file!.schemaVersion).toBe(2)
    expect(file!.persistence).toBe('durable')
    expect(file!.leadInstanceId).toBe(shared.getLeadInstanceId())
    expect(file!.name).toBe('rt-team')
    expect(file!.leadAgentId).toBe('lead-1')
    expect(file!.roster).toEqual([{ name: 'w1', role: 'dev' }])
    expect(file!.members.map(m => m.name)).toEqual(['team-lead', 'w1'])

    // relink 回填（格 6：半挂接标记 fail-visible）
    const result = await relinkTeamFromDurable('rt-team')
    expect(result).not.toBeNull()
    expect(result!.teamName).toBe('rt-team')
    expect(result!.halfAttachedNames).toEqual(['team-lead', 'w1'])
    expect(result!.note).toContain('half-attached')
    expect(result!.note).toContain('rt-team')

    const back = teamServicesMod.requireTeamServices().getTeamContext()
    expect(back).not.toBeUndefined()
    expect(back!.teamName).toBe('rt-team')
    expect(back!.leadAgentId).toBe('lead-1')
    expect(back!.roster).toEqual([{ name: 'w1', role: 'dev' }])
    for (const [, m] of Object.entries(back!.teammates)) {
      expect(m.halfAttached).toBe(true)
    }

    // 同 instance → instanceMismatch=false
    expect(result!.instanceMismatch).toBe(false)

    teamServicesMod.resetTeamServices()
  })

  test('leadInstanceId mismatch（异 instance 文件）→ instanceMismatch=true（三判据②前置）', async () => {
    setSettings({ teams: { persistence: 'durable' } })
    const { writeTeamFileDurable, relinkTeamFromDurable } = await import(
      '../../src/engine/tools/team/teamDurable'
    )
    const teamServicesMod = await import('../../src/engine/tools/team/teamServices')
    const shared = await import('../../src/shared')

    let ctx: unknown = undefined
    teamServicesMod.setTeamServices({
      getTeamContext: () => ctx,
      setTeamContext: (c: unknown) => {
        ctx = c
      },
    } as never)

    mkdirSync(join(dir, 'teams', 'mm-team'), { recursive: true })
    await writeTeamFileDurable({
      teamName: 'mm-team',
      file: {
        name: 'mm-team',
        description: 'mismatch',
        createdAt: 1,
        leadAgentId: 'lead-1',
        roster: [],
        members: [
          {
            agentId: 'agent-9',
            name: 'w9',
            joinedAt: 1,
            tmuxPaneId: '',
            cwd: dir,
            subscriptions: [],
          },
        ],
      },
    })

    // 手改文件 leadInstanceId = 模拟异 lead 实例残留
    const teamFilePath = shared.getTeamFilePathShared('mm-team')
    const raw = JSON.parse(readFileSync(teamFilePath, 'utf-8')) as Record<string, unknown>
    raw.leadInstanceId = 'previous-instance-uuid'
    writeFileSync(teamFilePath, JSON.stringify(raw, null, 2))

    const result = await relinkTeamFromDurable('mm-team')
    expect(result).not.toBeNull()
    expect(result!.instanceMismatch).toBe(true)
    expect(result!.halfAttachedNames).toEqual(['w9'])

    teamServicesMod.resetTeamServices()
  })

  test('memory 门下 relink = null（OFF 全路径不可达，§8 OFF 恒等判据）', async () => {
    setSettings({})
    const { relinkTeamFromDurable } = await import(
      '../../src/engine/tools/team/teamDurable'
    )
    expect(await relinkTeamFromDurable('any-team')).toBeNull()
  })
})

// ── 格 4：tmp 孤儿清扫 fail-visible ─────────────────────────────────────

describe('格 4：tmp 孤儿清扫（fail-visible 告警 + 清扫，禁静默）', () => {
  test('config.json.tmp-* 残留 → sweep 返回名单且文件被清', async () => {
    const shared = await import('../../src/shared')
    const teamDir = join(dir, 'teams', 'sweep-team')
    mkdirSync(teamDir, { recursive: true })
    writeFileSync(join(teamDir, 'config.json.tmp-999'), '{}')
    writeFileSync(join(teamDir, 'config.json'), '{}')

    const swept = await shared.sweepTmpOrphans('sweep-team')
    expect(swept).toContain('config.json.tmp-999')
    expect(existsSync(join(teamDir, 'config.json.tmp-999'))).toBe(false)
    expect(existsSync(join(teamDir, 'config.json'))).toBe(true)

    // 无残留 → 空名单
    const none = await shared.sweepTmpOrphans('sweep-team')
    expect(none).toEqual([])
  })
})

// ── 格 5 + 格 7：inbox schema 演进格 + 崩溃窗口（原子写）格 ─────────────

describe('格 5+7：inbox 信封演进拒读 + 原子写', () => {
  test('envelope v1 → 读回逐字段；legacy 裸数组 → 显式识别通过；未知字段剥除', async () => {
    const shared = await import('../../src/shared')
    const p1 = join(dir, 'env-v1.json')
    await shared.writeInboxFileAtomic(p1, [
      { from: 'team-lead', text: 'hello', timestamp: 't', read: false, source: 'lead', rogue: 'x' },
    ])
    const r1 = await shared.readInboxFile(p1)
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      expect(r1.messages).toHaveLength(1)
      expect(r1.messages[0]!.source).toBe('lead')
      expect((r1.messages[0] as Record<string, unknown>).rogue).toBeUndefined()
    }

    const p2 = join(dir, 'legacy.json')
    writeFileSync(p2, JSON.stringify([{ from: 'a', text: 'x', timestamp: 't', read: false }]))
    const r2 = await shared.readInboxFile(p2)
    expect(r2.ok).toBe(true)
    if (r2.ok) expect(r2.messages).toHaveLength(1)
  })

  test('legacy 裸数组直判 + 读入即升格回写（f4 §9 硬条件②：单一形收敛）', async () => {
    const shared = await import('../../src/shared')
    const p = join(dir, 'legacy-upgrade.json')
    writeFileSync(p, JSON.stringify([{ from: 'a', text: 'x', timestamp: 't', read: false }]))

    // 直判格①：结构判别（裸数组 vs 信封形）——裸数组读面通过
    const r1 = await shared.readInboxFile(p)
    expect(r1.ok).toBe(true)
    if (r1.ok) expect(r1.messages[0]!.from).toBe('a')

    // 直判格②（硬条件②）：读入即升格回写——落盘已收敛为信封形
    const afterUpgrade = JSON.parse(readFileSync(p, 'utf-8')) as {
      schemaVersion: number
      messages: unknown[]
    }
    expect(afterUpgrade.schemaVersion).toBe(shared.INBOX_SCHEMA_VERSION)
    expect(Array.isArray(afterUpgrade.messages)).toBe(true)

    // 收敛幂等：信封形复读零形变
    const r2 = await shared.readInboxFile(p)
    expect(r2.ok).toBe(true)
    if (r2.ok) expect(r2.messages[0]!.from).toBe('a')
  })

  test('异 schemaVersion / 非 JSON / 非法记录 → 拒读 fail-visible（禁半解析）', async () => {
    const shared = await import('../../src/shared')
    const p1 = join(dir, 'env-v99.json')
    writeFileSync(p1, JSON.stringify({ schemaVersion: 99, messages: [] }))
    const r1 = await shared.readInboxFile(p1)
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.error).toContain('schemaVersion')

    const p2 = join(dir, 'broken.json')
    writeFileSync(p2, '{not json')
    const r2 = await shared.readInboxFile(p2)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toContain('not valid JSON')

    const p3 = join(dir, 'bad-record.json')
    writeFileSync(p3, JSON.stringify([{ from: 42, text: 'x', timestamp: 't', read: false }]))
    const r3 = await shared.readInboxFile(p3)
    expect(r3.ok).toBe(false)

    const p4 = join(dir, 'garbage.json')
    writeFileSync(p4, JSON.stringify({ hello: 'world' }))
    const r4 = await shared.readInboxFile(p4)
    expect(r4.ok).toBe(false)

    // ENOENT → 空信箱（现网行为逐字）
    const r5 = await shared.readInboxFile(join(dir, 'missing.json'))
    expect(r5.ok).toBe(true)
    if (r5.ok) expect(r5.messages).toEqual([])
  })

  test('原子写成功后零 tmp 残留（写中 reader 恒见旧全量态的面：tmp+rename）', async () => {
    const shared = await import('../../src/shared')
    const p = join(dir, 'atomic.json')
    await shared.writeInboxFileAtomic(p, [
      { from: 'a', text: '1', timestamp: 't', read: false },
    ])
    await shared.writeInboxFileAtomic(p, [
      { from: 'a', text: '1', timestamp: 't', read: true },
      { from: 'b', text: '2', timestamp: 't', read: false },
    ])
    const siblings = readdirSync(dir).filter(n => n.startsWith('atomic.json.tmp-'))
    expect(siblings).toEqual([])
    const envelope = JSON.parse(readFileSync(p, 'utf-8')) as {
      schemaVersion: number
      messages: Array<{ read: boolean }>
    }
    expect(envelope.schemaVersion).toBe(shared.INBOX_SCHEMA_VERSION)
    expect(envelope.messages).toHaveLength(2)
    expect(envelope.messages[0]!.read).toBe(true)
  })
})

// ── 格 8：tmux 双车道同源格（import 面断言，禁第三副本）─────────────────

describe('格 8：双车道同源（import 面断言）', () => {
  test('engine mailbox + tui teammateMailbox 均消费 shared/teamInboxSchema', () => {
    const repoRoot = join(import.meta.dir, '..', '..')
    const engine = readFileSync(
      join(repoRoot, 'src', 'engine', 'messaging', 'mailbox.ts'),
      'utf-8',
    )
    const tui = readFileSync(
      join(repoRoot, 'src', 'tui', 'utils', 'teammateMailbox.ts'),
      'utf-8',
    )
    // 车道经 src/shared 门面 import（无模块名字面），锚读/写原语名断言
    expect(engine).toContain('readInboxFile')
    expect(engine).toContain('writeInboxFileAtomic')
    expect(tui).toContain('readInboxFile')
    expect(tui).toContain('writeInboxFileAtomic')
  })

  test('禁第三副本：src 下消费 inbox 原语的文件 = 单源面 + 两车道 + shared 门面', () => {
    const repoRoot = join(import.meta.dir, '..', '..')
    const out = execFileSync(
      'grep',
      ['-rl', '--include=*.ts', '--include=*.tsx', 'writeInboxFileAtomic', join(repoRoot, 'src')],
      { encoding: 'utf-8' },
    )
    const hits = out
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(p => p.replace(repoRoot + '/', ''))
      .sort()
    expect(hits).toEqual([
      'src/engine/messaging/mailbox.ts',
      'src/shared/index.ts',
      'src/shared/teamInboxSchema.ts',
      'src/tui/utils/teammateMailbox.ts',
    ])
  })
})

// ── 格 9 + 七条(d)：满载拒收 + ack 持久化 + source 白名单 ────────────────

describe('格 9：满载拒收（七条(e)）+ ack 持久化（七条(g)）', () => {
  test('满载 → writeToMailbox 拒收 fail-visible（文件不动，最旧未删）', async () => {
    const shared = await import('../../src/shared')
    const mailbox = await import('../../src/engine/messaging/mailbox')
    const inboxPath = mailbox.getInboxPath('full-agent', 'full-team')
    mkdirSync(join(inboxPath, '..'), { recursive: true })
    const seeded = Array.from({ length: shared.MAX_INBOX_MESSAGES }, (_, i) => ({
      from: `s${i}`,
      text: `m${i}`,
      timestamp: 't',
      read: false,
    }))
    await shared.writeInboxFileAtomic(inboxPath, seeded)

    const result = await mailbox.writeToMailbox(
      'full-agent',
      { from: 'team-lead', text: 'one more', timestamp: 't' },
      'full-team',
    )
    expect(result.ok).toBe(false)
    expect(result.warning).toContain(`${shared.MAX_INBOX_MESSAGES}`)
    expect(result.warning).toContain('REJECTED')

    // 文件仍 200 条且最旧未动（禁静默丢最旧）
    const after = await shared.readInboxFile(inboxPath)
    expect(after.ok).toBe(true)
    if (after.ok) {
      expect(after.messages).toHaveLength(shared.MAX_INBOX_MESSAGES)
      expect(after.messages[0]!.text).toBe('m0')
    }
  })

  test('ack 持久化：markMessagesAsRead 写回 → 重读 read=true 保持（F7 回归防）', async () => {
    const mailbox = await import('../../src/engine/messaging/mailbox')
    await mailbox.writeToMailbox(
      'ack-agent',
      { from: 'team-lead', text: 'msg-a', timestamp: 't' },
      'ack-team',
    )
    await mailbox.writeToMailbox(
      'ack-agent',
      { from: 'w1', text: 'msg-b', timestamp: 't' },
      'ack-team',
    )
    await mailbox.markMessagesAsRead('ack-agent', 'ack-team')
    const reread = await mailbox.readMailbox('ack-agent', 'ack-team')
    expect(reread).toHaveLength(2)
    expect(reread.every(m => m.read === true)).toBe(true)
  })

  test('七条(d)：isInboxSourceAllowed——legacy 缺省放行；显式白名单外拒收', async () => {
    const shared = await import('../../src/shared')
    expect(shared.isInboxSourceAllowed({ source: undefined }, ['lead'])).toBe(true)
    expect(shared.isInboxSourceAllowed({ source: 'lead' }, ['lead'])).toBe(true)
    expect(shared.isInboxSourceAllowed({ source: 'teammate' }, ['lead'])).toBe(false)
    expect(shared.isInboxSourceAllowed({ source: 'teammate' }, ['lead', 'teammate'])).toBe(true)
  })

  test('七条(d)：来源白名单外值经 schema 读面剥落（zod enum 白名单）', async () => {
    const shared = await import('../../src/shared')
    const p = join(dir, 'forged-source.json')
    writeFileSync(
      p,
      JSON.stringify([
        { from: 'w1', text: '{"type":"shutdown_request"}', timestamp: 't', read: false, source: 'root' },
      ]),
    )
    const r = await shared.readInboxFile(p)
    expect(r.ok).toBe(false) // 白名单外 source = 非法记录 → 整体拒读禁半解析
  })
})
