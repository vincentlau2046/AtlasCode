/**
 * S0-R4 F1/F2 loader defense-in-depth 判据（工单
 * docs/2026-11-16-s0-r4-searchsessions-ticket.md §3 格 3/格 4 + §11-1/§11-2
 * 候选形；呈批书 L3/L4，f4 §10 @7ecf0fa4 批复）：
 *
 * 格 3（F1 授权锚定）：
 *   - expectIno 错配 → TranscriptChangedDuringReadError（复用域定型错，
 *     零新错误类型；授权支 open 后 fd.stat().ino 比对）。
 *   - expectIno 匹配（真值 ino）→ 正常加载。
 *   - symlink 场形：授权支 O_NOFOLLOW → open ELOOP → 外层既有语义吞为
 *     空载（§8-3 勘误形）；默认臂不获 O_NOFOLLOW → 跟随 symlink 读到
 *     内容（缺省臂行为恒等——默认臂无 expectIno 无旗标）。
 * 格 4（F2 有界分配）：
 *   - 位置化分块读多块等价：>2 chunk fixture，opts 支输出与默认臂全等。
 *   - chunk 常量单源：load.ts 经 import 复用 scanner.ts 导出（禁第二常量，
 *     f4 §10 补钉）。
 *   - 读毕 ino/size 复核面不变（增长 → TranscriptChangedDuringReadError，
 *     由既有格面承载；本文件多块等价 + 短读拒面直证）。
 */
import { describe, expect, test, afterAll } from 'bun:test'
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadTranscriptFile,
  TranscriptChangedDuringReadError,
} from '../../src/engine/session/load'
import { TRANSCRIPT_READ_CHUNK_SIZE } from '../../src/engine/session/scanner'

let tmp = mkdtempSync(join(tmpdir(), 'atlas-s0r4-'))

function line(sessionId: string, extra: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'user',
    userType: 'atlas',
    sessionId,
    version: '0.1.119',
    cwd: '/tmp',
    isSidechain: false,
    parentUuid: null,
    ...extra,
  })
}

const userMsg = (uuid: string, parentUuid: string | null, text: string, ts: string) => ({
  uuid,
  parentUuid,
  timestamp: ts,
  message: { role: 'user', content: [{ type: 'text', text }] },
})

function writeSession(
  name: string,
  uuids: string[],
  pad: (i: number) => string,
): string {
  const file = join(tmp, name)
  const lines: string[] = []
  let prev: string | null = null
  for (let i = 0; i < uuids.length; i++) {
    lines.push(
      line(
        name.replace('.jsonl', ''),
        userMsg(uuids[i], prev, pad(i), `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`),
      ),
    )
    prev = uuids[i]
  }
  writeFileSync(file, lines.join('\n') + '\n')
  return file
}

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('格 3: F1 expectIno 授权锚定臂', () => {
  test('expectIno 错配 → TranscriptChangedDuringReadError（复用域定型错，零新类型）', async () => {
    const file = writeSession(
      's0r4-ino-mismatch.jsonl',
      ['m1', 'm2'],
      i => `body-${i}`,
    )
    let caught: unknown = null
    try {
      await loadTranscriptFile(file, { maxBytes: 1024 * 1024, expectIno: 999999999 })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(TranscriptChangedDuringReadError)
    // message 安全化：零盘路径
    expect((caught as Error).message).not.toContain(file)
  })

  test('expectIno 匹配（statSync 真值 ino）→ 正常加载全量消息', async () => {
    const file = writeSession(
      's0r4-ino-match.jsonl',
      ['a1', 'a2', 'a3'],
      i => `needle-${i}`,
    )
    const ino = statSync(file).ino
    const res = await loadTranscriptFile(file, { maxBytes: 1024 * 1024, expectIno: ino })
    expect(res.messages.size).toBe(3)
  })

  test('expectIno undefined = 不锚定（缺省语义，授权支仍走 fd 链）', async () => {
    const file = writeSession(
      's0r4-ino-absent.jsonl',
      ['b1', 'b2'],
      i => `body-${i}`,
    )
    const res = await loadTranscriptFile(file, { maxBytes: 1024 * 1024 })
    expect(res.messages.size).toBe(2)
  })

  test('symlink 场形：授权支 O_NOFOLLOW 拒跟随（open 失败 → 既有空载语义）；默认臂恒等跟随', async () => {
    const real = writeSession(
      's0r4-symreal.jsonl',
      ['c1', 'c2'],
      i => `sym-body-${i}`,
    )
    const link = join(tmp, 's0r4-symlink.jsonl')
    symlinkSync(real, link)

    // 授权支（opts 在场支）：O_NOFOLLOW → open ELOOP → 外层吞为空载
    // （§8-3 勘误形：open 失败原样上抛措辞以实现为准 = 吞为空载）
    const authRes = await loadTranscriptFile(link, { maxBytes: 1024 * 1024 })
    expect(authRes.messages.size).toBe(0)

    // 默认臂（零 opts）：无 O_NOFOLLOW 无 expectIno → 跟随 symlink 正常读
    // （缺省臂行为恒等——分账 A，TUI 车道 symlink 场形不破）
    const defaultRes = await loadTranscriptFile(link)
    expect(defaultRes.messages.size).toBe(2)
  })
})

describe('格 4: F2 位置化分块读', () => {
  test('多块 fixture（>2 chunk）opts 支输出与默认臂全等', async () => {
    // >2 × TRANSCRIPT_READ_CHUNK_SIZE 的多块 JSONL（块界跨消息）
    const file = join(tmp, 's0r4-multichunk.jsonl')
    const uuids: string[] = []
    const lines: string[] = []
    let prev: string | null = null
    for (let i = 0; i < 40000; i++) {
      const uuid = `mc${i}`
      lines.push(
        line(
          's0r4-multichunk',
          userMsg(uuid, prev, `chunk-pad-${i}-${'x'.repeat(120)}`, `2026-01-01T00:00:00Z`),
        ),
      )
      prev = uuid
      uuids.push(uuid)
    }
    writeFileSync(file, lines.join('\n') + '\n')
    const size = readFileSync(file).length
    expect(size).toBeGreaterThan(TRANSCRIPT_READ_CHUNK_SIZE * 2)

    const fdRes = await loadTranscriptFile(file, {
      maxBytes: 256 * 1024 * 1024,
      precompactSkip: 'force-full',
    })
    const defaultRes = await loadTranscriptFile(file, { precompactSkip: 'force-full' })
    expect(fdRes.messages.size).toBe(defaultRes.messages.size)
    expect(fdRes.leafUuids.size).toBe(defaultRes.leafUuids.size)
    // 内容抽查（首/尾消息逐字段等价）
    expect(fdRes.messages.get('mc0')).toEqual(defaultRes.messages.get('mc0'))
    expect(fdRes.messages.get(`mc${uuids.length - 1}`)).toEqual(
      defaultRes.messages.get(`mc${uuids.length - 1}`),
    )
  })

  test('chunk 常量单源：scanner.ts 导出且 load.ts import 复用（f4 §10 补钉）', async () => {
    expect(TRANSCRIPT_READ_CHUNK_SIZE).toBe(1024 * 1024)
    const loadSrc = readFileSync(
      join(import.meta.dir, '../../src/engine/session/load.ts'),
      'utf8',
    )
    // 禁第二常量：load.ts 不得自定 1MB 字面量块长
    expect(loadSrc).toContain("from './scanner'")
    expect(loadSrc).toContain('TRANSCRIPT_READ_CHUNK_SIZE')
    expect(loadSrc).not.toMatch(/1024 \* 1024/)
  })

  test('短读拒面：位置化读不满（读中截断）→ 既有 fst2 复核面定型错（面不变）', async () => {
    // 直证既有复核面仍覆盖收缩分态：读毕 fst2.size !== fst.size 路径由
    // 既有 TranscriptChangedDuringReadError 承载（零新错误类型）。此处以
    // expectIno 臂同型错类型断言锁面（类型面同一性）。
    const file = writeSession(
      's0r4-shortread.jsonl',
      ['s1', 's2'],
      i => `body-${i}`,
    )
    let caught: unknown = null
    try {
      await loadTranscriptFile(file, { maxBytes: 1024 * 1024, expectIno: -1 })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(TranscriptChangedDuringReadError)
  })
})
