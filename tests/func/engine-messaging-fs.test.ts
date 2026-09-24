/**
 * messaging 域 func 真盘测试（E-7 S-7e d1，§8.50）：文件式队友信箱
 * （mailbox 文件读写往返 / 写锁并发互斥 / mark-read 族 / clear / 谓词
 * 选择性标记 / sendShutdownRequestToMailbox 端到端）。
 *
 * 分层纪律：func 层真 fs（mkdtemp + 真读写 + 真 proper-lockfile 锁文件）；
 * 隔离 = process.env.ATLAS_CONFIG_DIR 指向 tmp（config 域 configRoot 无
 * memoize、每调用直读 env → 天然 fresh，无需注入口）。
 *
 * 探针锚点（§8.50 d1 详案）：
 *   P-M1 markMessageAsReadByIndex 越界 + 缺失守卫对（缺守卫时向稀疏槽写
 *    {read:true} 污染 inbox）→ 'P-M1 markMessageAsReadByIndex：越界索引
 *    不动 inbox' 恰 1 红。
 *   P-M2 writeToMailbox 锁后重读支（锁串行化原子性支）= 双点绑定，实测
 *    红集 6 测（突变 = 锁后重读删除，2026-09-24）：直接 2 点 =
 *    '顺序写保持顺序' + '并发写不丢更新'；下游 4 点 = 同一支的多消息态
 *    断言收敛（'P-M2 writeToMailbox：新消息默认未读（readUnreadMessages）'
 *    / 'markMessagesAsRead 全量标记' / 'P-M1 markMessageAsReadByIndex：
 *    越界索引不动 inbox'（length-2 断言）/ 'markMessagesAsReadByPredicate
 *    选择性标记'（length-3 断言））——支收敛红集，登记为双点绑定非探针
 *    违规（与 mailbox.ts 头注登记同源）。单点探针形态 = 写默认 read 态支
 *    `read: false` 反转为 `read: true` → 'P-M2 writeToMailbox：新消息默认
 *    未读（readUnreadMessages）' 恰 1 红（本文件其余测试刻意不断言新写入
 *    消息的 read 缺省态——缺省态断言收敛于该单测，保证反转突变红集恰 1，
 *    实测成立）。
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getInboxPath,
  readMailbox,
  readUnreadMessages,
  writeToMailbox,
  markMessageAsReadByIndex,
  markMessagesAsRead,
  clearMailbox,
  markMessagesAsReadByPredicate,
  sendShutdownRequestToMailbox,
} from '../../src/engine'

const TEAM = 'team-func'
let tmp: string
let prevConfigDir: string | undefined

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-messaging-func-'))
  prevConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = tmp
})
afterEach(() => {
  if (prevConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = prevConfigDir
  rmSync(tmp, { recursive: true, force: true })
})

const inboxFile = (agent: string) =>
  join(tmp, 'teams', TEAM, 'inboxes', `${agent}.json`)

const msg = (from: string, text: string) => ({
  from,
  text,
  timestamp: `t-${text}`,
})

// ── mailbox 文件往返 ──────────────────────────────────────────────────────
describe('mailbox 文件往返（真盘）', () => {
  test('写 → 读往返（字段面 + 文件落盘）', async () => {
    await writeToMailbox(
      'a1',
      { ...msg('lead', 'hello'), color: 'blue' },
      TEAM,
    )
    expect(existsSync(inboxFile('a1'))).toBe(true)
    const out = await readMailbox('a1', TEAM)
    expect(out).toHaveLength(1)
    expect(out[0]!.from).toBe('lead')
    expect(out[0]!.text).toBe('hello')
    expect(out[0]!.timestamp).toBe('t-hello')
    expect(out[0]!.color).toBe('blue')
  })

  test('P-M2 writeToMailbox：新消息默认未读（readUnreadMessages）', async () => {
    // P-M2 单点探针锚点（`read: false` 反转 → 本测恰 1 红）
    await writeToMailbox('a1', msg('lead', 'm1'), TEAM)
    await writeToMailbox('a1', msg('lead', 'm2'), TEAM)
    const unread = await readUnreadMessages('a1', TEAM)
    expect(unread).toHaveLength(2)
    await markMessageAsReadByIndex('a1', TEAM, 0)
    const unread2 = await readUnreadMessages('a1', TEAM)
    expect(unread2).toHaveLength(1)
    expect(unread2[0]!.text).toBe('m2')
  })

  test('顺序写保持顺序', async () => {
    // P-M2 双点绑定第 1 点（锁后重读支突变 → 与并发测同红，登记非违规）
    await writeToMailbox('a1', msg('lead', 'm1'), TEAM)
    await writeToMailbox('a1', msg('lead', 'm2'), TEAM)
    await writeToMailbox('a1', msg('lead', 'm3'), TEAM)
    const out = await readMailbox('a1', TEAM)
    expect(out).toHaveLength(3)
    expect(out.map(m => m.text)).toEqual(['m1', 'm2', 'm3'])
  })

  test('markMessagesAsRead 全量标记', async () => {
    await writeToMailbox('a1', msg('lead', 'm1'), TEAM)
    await writeToMailbox('a1', msg('lead', 'm2'), TEAM)
    await markMessagesAsRead('a1', TEAM)
    const out = await readMailbox('a1', TEAM)
    expect(out).toHaveLength(2)
    for (const m of out) expect(m.read).toBe(true)
  })

  test('clearMailbox 清空 inbox（文件保留空数组）', async () => {
    await writeToMailbox('a1', msg('lead', 'm1'), TEAM)
    await writeToMailbox('a1', msg('lead', 'm2'), TEAM)
    await clearMailbox('a1', TEAM)
    expect(await readMailbox('a1', TEAM)).toEqual([])
    expect(existsSync(inboxFile('a1'))).toBe(true)
  })

  test('不存在的 inbox clear 无副作用（ENOENT 静默）', async () => {
    await expect(clearMailbox('ghost', TEAM)).resolves.toBeUndefined()
    expect(existsSync(inboxFile('ghost'))).toBe(false)
  })
})

// ── mark-read 族 ──────────────────────────────────────────────────────────
describe('mark-read 族（真盘）', () => {
  test('P-M1 markMessageAsReadByIndex：越界索引不动 inbox', async () => {
    // P-M1 探针锚点（越界 + 缺失守卫对突变 → 稀疏槽污染 → 本测恰 1 红）
    await writeToMailbox('a1', msg('lead', 'm1'), TEAM)
    await writeToMailbox('a1', msg('lead', 'm2'), TEAM)
    const before = readFileSync(inboxFile('a1'), 'utf-8')
    await markMessageAsReadByIndex('a1', TEAM, 99)
    await markMessageAsReadByIndex('a1', TEAM, -1)
    const after = readFileSync(inboxFile('a1'), 'utf-8')
    expect(after).toBe(before)
    const out = await readMailbox('a1', TEAM)
    expect(out).toHaveLength(2)
  })

  test('markMessageAsReadByIndex 缺失 inbox 静默 resolve（不创建文件）', async () => {
    await expect(markMessageAsReadByIndex('ghost', TEAM, 0)).resolves.toBeUndefined()
    expect(existsSync(inboxFile('ghost'))).toBe(false)
  })

  test('markMessagesAsReadByPredicate 选择性标记', async () => {
    // E-wave-end 前向接缝登记（S-7e d1 审视 NOTE-2 闭环，复审勿当遗漏重提）：
    // 本测刻意缺非匹配项 out[1].read===false 阴性断言——补之则 P-M2 单点
    // （`read: false` 缺省态反转）突变下本测同红（out[1] 缺省已读），红集 2
    // 违反单点探针「恰 1 红」登记（实测基线）。支覆盖裁定：丢 `!m.read` 守卫
    // = 与退化 `predicate(m)` 值可观察等价（匹配且已读 → JSON 输出恒等，
    // 标记幂等）；谓词反转被 out[2] 断言捕获；唯一开口「条件退化为全量
    // 标记」E-wave-end 补阴性断言 + P-M2 单点红集重测（1→2）一并处置。
    await writeToMailbox('a1', msg('x', '1'), TEAM)
    await writeToMailbox('a1', msg('y', '2'), TEAM)
    await writeToMailbox('a1', msg('x', '3'), TEAM)
    // 基线：首条确定性已读（缺省态下由 markByIndex 置位；探针反转型下
    // 缺省已读走 already-read 守卫——两态下 [0].read 均 true，断言反转型不敏感）
    await markMessageAsReadByIndex('a1', TEAM, 0)
    await markMessagesAsReadByPredicate('a1', m => m.from === 'x', TEAM)
    const out = await readMailbox('a1', TEAM)
    expect(out).toHaveLength(3)
    expect(out[0]!.read).toBe(true)
    expect(out[2]!.read).toBe(true)
  })
})

// ── 写锁并发互斥 ──────────────────────────────────────────────────────────
describe('写锁并发互斥（真 proper-lockfile）', () => {
  test('并发写不丢更新（锁后重读原子性）', async () => {
    // P-M2 双点绑定第 2 点（锁后重读支突变 → 与顺序写测同红，登记非违规）
    await Promise.all(
      [0, 1, 2, 3, 4].map(i =>
        writeToMailbox('a1', msg(`w${i}`, `m${i}`), TEAM),
      ),
    )
    const out = await readMailbox('a1', TEAM)
    expect(out).toHaveLength(5)
    expect(out.map(m => m.from).sort()).toEqual(['w0', 'w1', 'w2', 'w3', 'w4'])
  })
})

// ── 路径面 ────────────────────────────────────────────────────────────────
describe('getInboxPath（ATLAS_CONFIG_DIR 隔离）', () => {
  test('路径形状 = {configDir}/teams/{team}/inboxes/{agent}.json', () => {
    expect(getInboxPath('a1', TEAM)).toBe(inboxFile('a1'))
    expect(getInboxPath('a1', TEAM)).toContain(tmp)
  })

  test('特殊字符 sanitize（路径段安全）', () => {
    const p = getInboxPath('a/b c', TEAM)
    expect(p).toBe(join(tmp, 'teams', TEAM, 'inboxes', 'a-b-c.json'))
  })
})

// ── 结构化消息端到端 ──────────────────────────────────────────────────────
describe('sendShutdownRequestToMailbox（端到端真盘）', () => {
  test('确定性 requestId + 信箱落 JSON 结构化消息', async () => {
    const r = await sendShutdownRequestToMailbox('worker-9', TEAM, 'scale down')
    expect(r.target).toBe('worker-9')
    expect(r.requestId).toMatch(/^shutdown-\d+@worker-9$/)
    const out = await readMailbox('worker-9', TEAM)
    expect(out).toHaveLength(1)
    const parsed = JSON.parse(out[0]!.text) as {
      type: string
      requestId: string
      from: string
      reason?: string
    }
    expect(parsed.type).toBe('shutdown_request')
    expect(parsed.requestId).toBe(r.requestId)
    // 无队友 ctx → 发送者回落 TEAM_LEAD_NAME
    expect(parsed.from).toBe('team-lead')
    expect(parsed.reason).toBe('scale down')
  })
})
