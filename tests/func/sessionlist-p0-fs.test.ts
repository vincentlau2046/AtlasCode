/**
 * sessionlist P0 正确性波（0.1.38）func 真盘探针（工单 docs/2026-10-06-sessionlist-implement.md §4 回归判别）：
 *
 *   B       : 文件 mtime 旧 / 最后消息时间戳新 → 排序按消息时间戳而非 mtime（P0-B B-lite）
 *   created : created 数据源 = 首条消息时间戳（非 stat birthtime 脏值，P0-C2 残留修）
 *   C2      : 文件中部内嵌 sidechain 内容（非 sidechain session）不再被整 head 扫描误滤
 *             （P0-C2 首行判定）+ 真 sidechain（首行）仍被滤（回归守卫）
 *   count   : 60 个有效 session 目录 → 列出数 == 磁盘有效数（P0-A load-all，无 50 截断）
 *   C1      : 列表加载路径纯读——各 session 文件 mtime 前后不变、目录无新增文件（无回写）
 *
 * 分层纪律：func 层真 fs（mkdtemp + `ATLAS_CONFIG_DIR`→tmp 注 TUI sessionStorage
 * getProjectsDir env 面）+ fixture .jsonl（合法 UUID 文件名 + utimesSync 受控 mtime）。
 * 每测试独立 fake worktree 根（/proj/<probe>）→ sanitizePath 各自独立项目目录，
 * 互不串扰；loadSameRepoAllMessageLogs 传 2 路径走 multi-worktree 分支（readdir
 * projectsDir 按 sanitize 前缀匹配），与测试进程 cwd 解耦。
 *
 * 探针锚点（突变须恰好 1 red）：
 *   P-B   enrichLog 覆写 created/modified（sessionStorage.ts enrichLog）→ 'B 排序'
 *         + 'created 数据源' 双 red
 *   P-C2  readLiteMetadata isSidechain 首行判定 → 'C2 内嵌 sidechain 不误滤'
 *   P-A   loadSameRepoAllMessageLogs while 续读（删 while = 退回 50 截断）→ 'count 60 全列'
 *   P-C1  加载路径任何 append（saveCustomTitle 回写复活）→ 'C1 纯读'（mtime 变化/新文件）
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

type StorageModule = typeof import('../../src/tui/utils/sessionStorage')

let tmp: string
let storage: StorageModule

/** 写一个最小有效 session 文件（首行 user + 可选中部行 + 末行 assistant），受控 mtime。 */
function makeSessionFile(
  dir: string,
  opts: {
    firstTimestamp: string
    lastTimestamp: string
    mtime: number // epoch ms
    content: string
    extraLines?: string[]
  },
): string {
  const sessionId = randomUUID()
  const lines: string[] = [
    JSON.stringify({
      type: 'user',
      uuid: randomUUID(),
      timestamp: opts.firstTimestamp,
      message: { role: 'user', content: opts.content },
    }),
  ]
  for (const l of opts.extraLines ?? []) lines.push(l)
  lines.push(
    JSON.stringify({
      type: 'assistant',
      uuid: randomUUID(),
      timestamp: opts.lastTimestamp,
      message: { role: 'assistant', content: 'world' },
    }),
  )
  const path = join(dir, `${sessionId}.jsonl`)
  writeFileSync(path, lines.join('\n') + '\n')
  utimesSync(path, new Date(opts.mtime), new Date(opts.mtime))
  return path
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-sessionlist-'))
  // TUI getProjectsDir = join(getAtlasConfigHomeDir(), 'projects')，
  // getAtlasConfigHomeDir memoize 键 = ATLAS_CONFIG_DIR → 先注 env 再 import。
  process.env.ATLAS_CONFIG_DIR = tmp
  storage = await import('../../src/tui/utils/sessionStorage')
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
  delete process.env.ATLAS_CONFIG_DIR
})

describe('sessionlist P0 (0.1.38)', () => {
  test('B: 排序按最后消息时间戳，非文件 mtime（P0-B）', async () => {
    const root = '/proj/b'
    const projDir = storage.getProjectDir(root)
    mkdirSync(projDir, { recursive: true })
    // A：最后消息 10-01 但 mtime 旧（09-01）；B：最后消息 09-15 但 mtime 新（10-07）。
    // mtime 排序会把 B 排前；消息时间戳排序 A 在前 → 判别点。
    const aFile = makeSessionFile(projDir, {
      firstTimestamp: '2026-09-28T09:00:00.000Z',
      lastTimestamp: '2026-10-01T09:30:00.000Z',
      mtime: Date.parse('2026-09-01T00:00:00Z'),
      content: 'session A',
    })
    makeSessionFile(projDir, {
      firstTimestamp: '2026-09-14T08:00:00.000Z',
      lastTimestamp: '2026-09-15T08:00:00.000Z',
      mtime: Date.parse('2026-10-07T00:00:00Z'),
      content: 'session B',
    })
    const logs = await storage.loadSameRepoAllMessageLogs([root, `${root}-wt`])
    expect(logs.length).toBe(2)
    expect(logs[0]!.fullPath).toBe(aFile)
    // modified = 抓取的消息时间戳（非 stat mtime 09-01）
    expect(logs[0]!.modified.getTime()).toBe(
      Date.parse('2026-10-01T09:30:00.000Z'),
    )
  })

  test('created: created 数据源 = 首条消息时间戳（非 stat birthtime）', async () => {
    const root = '/proj/created'
    const projDir = storage.getProjectDir(root)
    mkdirSync(projDir, { recursive: true })
    makeSessionFile(projDir, {
      firstTimestamp: '2026-08-01T09:00:00.000Z',
      lastTimestamp: '2026-10-05T10:00:00.000Z',
      mtime: Date.parse('2026-10-07T00:00:00Z'),
      content: 'session C',
    })
    const logs = await storage.loadSameRepoAllMessageLogs([root, `${root}-wt`])
    expect(logs.length).toBe(1)
    // 覆写缺失时 created 回落 stat birthtime（≈文件刚创建时刻）→ red
    expect(logs[0]!.created.getTime()).toBe(Date.parse('2026-08-01T09:00:00.000Z'))
  })

  test('C2: 内嵌 sidechain 内容的非 sidechain session 不被误滤（P0-C2）', async () => {
    const root = '/proj/c2'
    const projDir = storage.getProjectDir(root)
    mkdirSync(projDir, { recursive: true })
    // 300 条填充行（~33KB，落 64KB head 窗口内）+ 中部一条顶层
    // "isSidechain":true 条目 + 末条消息。旧码扫整 head → 误滤；新码只查首行 → 保留。
    const filler: string[] = []
    for (let i = 0; i < 300; i++) {
      filler.push(
        JSON.stringify({
          type: 'assistant',
          uuid: randomUUID(),
          timestamp: '2026-10-02T00:00:00.000Z',
          message: { role: 'assistant', content: `filler ${i}` },
        }),
      )
    }
    const sidechainLine = JSON.stringify({
      type: 'user',
      uuid: randomUUID(),
      isSidechain: true,
      timestamp: '2026-10-02T01:00:00.000Z',
      message: { role: 'user', content: 'embedded sidechain content' },
    })
    const kept = makeSessionFile(projDir, {
      firstTimestamp: '2026-10-02T00:00:00.000Z',
      lastTimestamp: '2026-10-03T10:00:00.000Z',
      mtime: Date.parse('2026-10-03T12:00:00Z'),
      content: 'normal session with embedded sidechain line',
      extraLines: [
        ...filler.slice(0, 150),
        sidechainLine,
        ...filler.slice(150),
      ],
    })
    // 回归守卫：真 sidechain（首行 isSidechain:true）仍须被滤
    const realScPath = join(projDir, `${randomUUID()}.jsonl`)
    writeFileSync(
      realScPath,
      JSON.stringify({
        type: 'user',
        uuid: randomUUID(),
        isSidechain: true,
        timestamp: '2026-10-02T00:00:00.000Z',
        message: { role: 'user', content: 'real sidechain session' },
      }) + '\n',
    )
    utimesSync(
      realScPath,
      new Date(Date.parse('2026-10-02T00:00:00Z')),
      new Date(Date.parse('2026-10-02T00:00:00Z')),
    )

    const logs = await storage.loadSameRepoAllMessageLogs([root, `${root}-wt`])
    expect(logs.length).toBe(1)
    expect(logs[0]!.fullPath).toBe(kept)
    expect(logs[0]!.isSidechain).toBe(false)
  })

  test('count: 60 个有效 session 全列（P0-A，无 50 截断）', async () => {
    const root = '/proj/count'
    const projDir = storage.getProjectDir(root)
    mkdirSync(projDir, { recursive: true })
    for (let i = 0; i < 60; i++) {
      makeSessionFile(projDir, {
        firstTimestamp: `2026-10-0${(i % 9) + 1}T0${String(i % 24).padStart(2, '0')}:00:00.000Z`,
        lastTimestamp: `2026-10-0${(i % 9) + 1}T0${String(i % 24).padStart(2, '0')}:30:00.000Z`,
        mtime: Date.parse('2026-10-07T00:00:00Z'),
        content: `session ${i}`,
      })
    }
    const logs = await storage.loadSameRepoAllMessageLogs([root, `${root}-wt`])
    // 旧路径（loadSameRepoMessageLogs，INITIAL_ENRICH_COUNT=50）只列 50 → red
    expect(logs.length).toBe(60)
    // 排序键已覆写为消息时间戳：value 索引连续
    logs.forEach((l, i) => expect(l.value).toBe(i))
  })

  test('C1: 列表加载路径纯读（mtime 不变、无新增文件，P0-C1）', async () => {
    const root = '/proj/c1'
    const projDir = storage.getProjectDir(root)
    mkdirSync(projDir, { recursive: true })
    const f1 = makeSessionFile(projDir, {
      firstTimestamp: '2026-10-01T09:00:00.000Z',
      lastTimestamp: '2026-10-01T10:00:00.000Z',
      mtime: Date.parse('2026-10-01T10:00:00Z'),
      content: 'untitled-ish session',
    })
    const f2 = makeSessionFile(projDir, {
      firstTimestamp: '2026-10-02T09:00:00.000Z',
      lastTimestamp: '2026-10-02T10:00:00.000Z',
      mtime: Date.parse('2026-10-02T10:00:00Z'),
      content: 'another session',
    })
    const mtimeOf = (p: string) => statSync(p).mtimeMs
    const before = { f1: mtimeOf(f1), f2: mtimeOf(f2) }
    const dirBefore = readdirSync(projDir).sort()

    await storage.loadSameRepoAllMessageLogs([root, `${root}-wt`])

    // 回写（saveCustomTitle 'auto'）复活 → mtime 被顶 / 新文件 → red
    expect(statSync(f1).mtimeMs).toBe(before.f1)
    expect(statSync(f2).mtimeMs).toBe(before.f2)
    expect(readdirSync(projDir).sort()).toEqual(dirBefore)
  })
})
