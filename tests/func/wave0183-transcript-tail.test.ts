/**
 * wave0183 K4-7（0.1.83 V3-4）— transcript 尾行写边界判别测试（func 真盘，
 * f4 工单 §E：crash 截断尾不吞 resume 后首条新 entry）。
 *
 * 缺陷（工单 300）：async appendToFile / sync appendEntryToFile（engine
 * project.ts + tui sessionStorage.ts 双体四入口）直接 append——上一进程
 * crash 留下无 LF 截断尾时，首条新 entry 粘进截断行，原 loader parseJSONL
 * 把粘成的一行整行丢弃：`before\n + 截断JSON + first-after-resume\n` 经原
 * parseJSONL 仅剩 before，首条新 user/assistant/metadata 丢失。
 *
 * 修法边界（工单 Interfaces）：写前有界末字节检查（fstat + 1 字节 read，
 * 构造性 O(1) 读，不整文件读取；行为面以 append-only 前缀字节恒等 + 追加
 * 区精确字节 + 超大文件可用钉住，无 flaky 计时断言——字节级读上界由
 * helper 构造保证，供 f4/e2e 复核），尾非 LF → 同一写序列前补 '\n' 分隔。
 * 不修历史/不截断/不猜末行有效 JSON（有效无LF末行原样保留）；空文件/
 * 不存在正常创建；已LF尾原样追加零多余空行；JSONL schema 与 loader 容错
 * 契约不动；文件 mode 0o600 / 目录 mode 0o700 / 写失败日志语义不动。
 *
 * 矩阵（TUI/engine × async/sync 四入口各覆盖，全部经真实 writer + flush +
 * 原 loader loadTranscriptFile，非纯拼接函数测试）：
 *   - RED 主案×4：截断尾 + 首条新 entry——engine async（恢复新实例
 *     adoptResumedSessionFile 面）/ TUI async / engine sync 退出 metadata
 *     （cacheSessionTitle + reAppendSessionMetadata）/ TUI sync（saveTag）。
 *     修前新 entry 被 loader 整行丢弃（红）；修后在场、追加区恰一 '\n'
 *     分隔、parentUuid 链不中断、不重不丢。
 *   - 边界守卫：有效JSON无LF尾保留（不猜不截）/ 空文件正常创建无前导
 *     分隔 / 已LF尾零多余空行 / UTF-8 多字节截断（末字节=续字节非 0x0A）/
 *     超大文件 8MB（> LITE_READ_BUF_SIZE 64KB）前缀字节恒等 / 同文件连续
 *     两 batch 无双重分隔 / sidechain agent 文件 / async 队列与 sync 退出
 *     metadata 排序（sync 先落、两 entry 各自过写边界）。
 *
 * headless crash→resume 活探针（工单末项）：需活模型网关，归 e2e lane
 * （同既有 live-gateway 门控切分）；本文件 = 写层真值表。既有 session
 * record/project/restore/scanner 族回归由四件套④全量覆盖。
 *
 * 分层纪律：func 真盘（mkdtemp + ATLAS_CONFIG_DIR 重定向 tui 配置目录 +
 * setSessionEnv 重定向 engine projectsDir，同 session-double-write 模板；
 * TEST_ENABLE_SESSION_PERSISTENCE=1 破 shouldSkipPersistence 测试守卫）+
 * 每测独立 sessionId + 双 Project 单例逐测复位（engine/TUI 各自
 * resetProjectForTesting——TUI 单例独立于 engine，双复位缺一不可）+
 * shared 消息缓存逐测清（TUI recordTranscript 的 dedup Set 经 engine 共享
 * 缓存，R7 收敛面）。
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  recordTranscript as engineRecordTranscript,
  recordSidechainTranscript as engineRecordSidechain,
  flushSessionStorage as engineFlush,
  reAppendSessionMetadata,
  adoptResumedSessionFile as engineAdoptResumed,
  cacheSessionTitle,
  loadTranscriptFile,
  getTranscriptPath as engineGetTranscriptPath,
  getAgentTranscriptPath as engineGetAgentTranscriptPath,
  clearSessionMessagesCache,
  clearAgentTranscriptSubdir,
  setSessionEnv,
  getSessionEnv,
  resetProjectForTesting as engineResetProject,
  type Message,
} from '../../src/engine'
import {
  recordTranscript as tuiRecordTranscript,
  flushSessionStorage as tuiFlush,
  resetProjectForTesting as tuiResetProject,
  adoptResumedSessionFile as tuiAdoptResumed,
  getTranscriptPath as tuiGetTranscriptPath,
  getTranscriptPathForSession as tuiGetTranscriptPathForSession,
  saveTag as tuiSaveTag,
} from '../../src/tui/utils/sessionStorage'
import { switchSession } from '../../src/bootstrap'

let tmp: string

function userMsg(uuid: string, content: unknown): Message {
  return {
    uuid,
    type: 'user',
    timestamp: '2026-01-01T00:00:00Z',
    message: { content },
  }
}
function asstMsg(uuid: string, content: unknown, id?: string): Message {
  return {
    uuid,
    type: 'assistant',
    timestamp: '2026-01-01T00:00:01Z',
    message: { content, id },
  }
}

/** crash 截断尾：完整 entry 的前半截，无 LF（fsAppendFile 半写的产物形状）。 */
const TRUNCATED_TAIL =
  '{"parentUuid":"a1","isSidechain":false,"type":"user","uuid":"crash-tail","timestamp":"2026-01-01T00:00:02Z","message":{"content":"partial wr'

/** 完整有效行（无 LF）——有效无LF末行保留案的 before 形状。 */
function validLineNoLF(uuid: string, parentUuid: string | null): string {
  return JSON.stringify({
    parentUuid,
    isSidechain: false,
    userType: 'external',
    cwd: '/tmp',
    sessionId: 'crafted',
    version: '0.1.82',
    type: 'user',
    uuid,
    timestamp: '2026-01-01T00:00:00Z',
    message: { content: 'crafted-before' },
  })
}

function switchBoth(sid: string): void {
  switchSession(sid) // bootstrap 活 session → tui 写面
  getSessionEnv().switchSession(sid) // engine port → engine 写面
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-k47-tail-'))
  // tui 写面 project dir = $ATLAS_CONFIG_DIR/projects（envUtils 环境缝）
  process.env.ATLAS_CONFIG_DIR = join(tmp, 'config')
  process.env.TEST_ENABLE_SESSION_PERSISTENCE = '1'
  // engine 写面 project dir = 同目录（SessionEnv 注入）
  setSessionEnv({ getProjectsDir: () => join(tmp, 'config', 'projects') })
})
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
  delete process.env.ATLAS_CONFIG_DIR
  delete process.env.TEST_ENABLE_SESSION_PERSISTENCE
})
beforeEach(() => {
  engineResetProject()
  tuiResetProject()
  clearSessionMessagesCache()
})
afterEach(() => {
  engineResetProject()
  tuiResetProject()
  clearSessionMessagesCache()
  clearAgentTranscriptSubdir('ag-k47')
})

// ── RED 主案×4：截断尾 + 首条新 entry 经真实 writer/flush/loader ────────────

describe('K4-7 截断尾首条新 entry 存活（修前 RED：loader 整行丢弃）', () => {
  test('engine async：恢复新实例（adoptResumedSessionFile）后续轮 user 不丢 + 前缀恒等 + 补恰一分隔', async () => {
    const sid = 'k47-eng-async'
    switchBoth(sid)
    await engineRecordTranscript([userMsg('u1', 'hello'), asstMsg('a1', 'hi', 'm1')])
    await engineFlush()

    const file = engineGetTranscriptPath()
    expect(existsSync(file)).toBe(true)
    appendFileSync(file, TRUNCATED_TAIL) // crash 模拟：半写截断尾，无 LF

    // crash → 新进程 resume：单例/缓存复位 + adopt（真实 --resume 采纳面）
    engineResetProject()
    clearSessionMessagesCache()
    engineAdoptResumed()

    const pre = readFileSync(file) // adopt 后（空 metadata cache 无写）
    const post = await (async () => {
      await engineRecordTranscript([userMsg('u2', 'after-resume')], undefined, 'a1')
      await engineFlush()
      return readFileSync(file)
    })()

    // append-only：原完整前缀（含截断尾）字节恒等，不重写历史
    expect(post.subarray(0, pre.length).equals(pre)).toBe(true)
    // 追加区：恰一 '\n' 分隔 + 单行新 entry（不重不丢、无多余空行）
    const appended = post.subarray(pre.length).toString('utf8')
    expect(appended.startsWith('\n')).toBe(true)
    expect(appended.startsWith('\n\n')).toBe(false)
    const appendedLines = appended.split('\n').filter(Boolean)
    expect(appendedLines.length).toBe(1)
    expect(JSON.parse(appendedLines[0]!).uuid).toBe('u2')
    expect(JSON.parse(appendedLines[0]!).parentUuid).toBe('a1')

    // 原 loader：新 entry 在场（修前 glued 整行被丢 = RED），链不中断
    const loaded = await loadTranscriptFile(file)
    expect(loaded.messages.has('u2')).toBe(true)
    expect(loaded.messages.get('u2')!.parentUuid).toBe('a1')
    expect(loaded.messages.has('u1')).toBe(true)
    expect(loaded.messages.has('a1')).toBe(true)
  })

  test('TUI async：TUI 写面 recordTranscript 续轮 user 不丢', async () => {
    const sid = 'k47-tui-async'
    switchBoth(sid)
    const before = [
      userMsg('u1', 'hello'),
      asstMsg('a1', 'hi', 'm1'),
    ] as unknown as Parameters<typeof tuiRecordTranscript>[0]
    await tuiRecordTranscript(before)
    await tuiFlush()

    const file = tuiGetTranscriptPath()
    expect(existsSync(file)).toBe(true)
    appendFileSync(file, TRUNCATED_TAIL)

    // TUI 面新实例 resume + dedup Set 重读文件（共享缓存清后重载）
    tuiResetProject()
    clearSessionMessagesCache()
    tuiAdoptResumed()

    const pre = readFileSync(file)
    const after = [
      userMsg('u2', 'after-resume'),
    ] as unknown as Parameters<typeof tuiRecordTranscript>[0]
    await tuiRecordTranscript(after, undefined, 'a1')
    await tuiFlush()
    const post = readFileSync(file)

    expect(post.subarray(0, pre.length).equals(pre)).toBe(true)
    expect(post.subarray(pre.length).toString('utf8').startsWith('\n')).toBe(true)
    expect(post.toString('utf8').split('\n').filter(l => l.includes('"uuid":"u2"')).length).toBe(1)

    // 共享 loader 契约：新 entry 在场 + 链不中断
    const loaded = await loadTranscriptFile(file)
    expect(loaded.messages.has('u2')).toBe(true)
    expect(loaded.messages.get('u2')!.parentUuid).toBe('a1')
    expect(loaded.messages.has('a1')).toBe(true)
  })

  test('engine sync：退出 metadata（cacheSessionTitle + reAppendSessionMetadata）不粘截断尾', async () => {
    const sid = 'k47-eng-sync'
    switchBoth(sid)
    await engineRecordTranscript([userMsg('u1', 'hello'), asstMsg('a1', 'hi', 'm1')])
    await engineFlush()

    const file = engineGetTranscriptPath()
    appendFileSync(file, TRUNCATED_TAIL)

    engineResetProject()
    clearSessionMessagesCache()
    engineAdoptResumed()
    const pre = readFileSync(file)

    cacheSessionTitle('崩溃后标题')
    reAppendSessionMetadata() // sync appendEntryToFile 写面（exit cleanup 同径）

    const post = readFileSync(file)
    expect(post.subarray(0, pre.length).equals(pre)).toBe(true)
    const appended = post.subarray(pre.length).toString('utf8')
    expect(appended.startsWith('\n')).toBe(true)
    // 独立一行可解析 custom-title（修前粘截断尾 = loader 丢 metadata = RED）
    const appendedLines = appended.split('\n').filter(Boolean)
    expect(appendedLines.length).toBe(1)
    expect(JSON.parse(appendedLines[0]!).type).toBe('custom-title')

    const loaded = await loadTranscriptFile(file)
    expect([...loaded.customTitles.values()]).toContain('崩溃后标题')
    expect(loaded.messages.has('a1')).toBe(true)
  })

  test('TUI sync：saveTag 经 TUI appendEntryToFile 不粘截断尾', async () => {
    const sid = 'k47-tui-sync'
    switchBoth(sid)
    // 手工造历史 + 截断尾（sync 写面不依赖 Project 状态，历史即文件形状）
    const file = tuiGetTranscriptPathForSession(sid)
    writeFileSync(file, validLineNoLF('u1', null) + '\n' + TRUNCATED_TAIL)
    const pre = readFileSync(file)

    await tuiSaveTag(sid as unknown as Parameters<typeof tuiSaveTag>[0], '崩溃后tag')

    const post = readFileSync(file)
    expect(post.subarray(0, pre.length).equals(pre)).toBe(true)
    const appended = post.subarray(pre.length).toString('utf8')
    expect(appended.startsWith('\n')).toBe(true)
    const appendedLines = appended.split('\n').filter(Boolean)
    expect(appendedLines.length).toBe(1)
    expect(JSON.parse(appendedLines[0]!).type).toBe('tag')

    // 修前粘截断尾 = loader 丢 tag（RED）；修后独立行可解析
    const loaded = await loadTranscriptFile(file)
    expect([...loaded.tags.values()]).toContain('崩溃后tag')
    expect(loaded.messages.has('u1')).toBe(true)
  })
})

// ── 边界守卫矩阵 ─────────────────────────────────────────────────────────────

describe('K4-7 边界守卫（有效无LF保留 / 空文件 / 已LF / UTF-8 / 超大 / 双batch / sidechain / 排序）', () => {
  test('有效JSON无LF尾：末行原样保留（不截断不猜），新 entry 补分隔后两者均可解析', async () => {
    const sid = 'k47-valid-nolf'
    switchBoth(sid)
    const file = engineGetTranscriptPath()
    writeFileSync(file, validLineNoLF('v1', null)) // 有效完整行，无 LF
    engineResetProject()
    clearSessionMessagesCache()
    engineAdoptResumed()
    const pre = readFileSync(file)

    await engineRecordTranscript([userMsg('u3', 'next')], undefined, 'v1')
    await engineFlush()

    const post = readFileSync(file)
    expect(post.subarray(0, pre.length).equals(pre)).toBe(true) // 末行不修不截
    const loaded = await loadTranscriptFile(file)
    expect(loaded.messages.has('v1')).toBe(true) // 有效无LF末行保留可解析
    expect(loaded.messages.has('u3')).toBe(true)
    expect(loaded.messages.get('u3')!.parentUuid).toBe('v1')
  })

  test('空文件（不存在）：正常创建，首行无前导分隔符', async () => {
    const sid = 'k47-fresh'
    switchBoth(sid)
    await engineRecordTranscript([userMsg('u1', 'hello')])
    await engineFlush()

    const file = engineGetTranscriptPath()
    expect(existsSync(file)).toBe(true)
    const content = readFileSync(file, 'utf8')
    expect(content.startsWith('\n')).toBe(false) // 无前导 '\n'
    const loaded = await loadTranscriptFile(file)
    expect(loaded.messages.has('u1')).toBe(true)
  })

  test('已LF尾：原样追加零多余空行（不双重分隔）', async () => {
    const sid = 'k47-lf-tail'
    switchBoth(sid)
    await engineRecordTranscript([userMsg('u1', 'hello'), asstMsg('a1', 'hi', 'm1')])
    await engineFlush()
    const pre = readFileSync(file_of(sid))

    await engineRecordTranscript([userMsg('u2', 'second-batch')], undefined, 'a1')
    await engineFlush()

    const post = readFileSync(file_of(sid))
    expect(post.subarray(0, pre.length).equals(pre)).toBe(true)
    const appended = post.subarray(pre.length).toString('utf8')
    expect(appended.startsWith('\n')).toBe(false) // 已LF → 不再补分隔
    expect(post.toString('utf8').includes('\n\n')).toBe(false) // 零空行
    const loaded = await loadTranscriptFile(file_of(sid))
    expect(loaded.messages.has('u2')).toBe(true)
    expect(loaded.messages.get('u2')!.parentUuid).toBe('a1')
  })

  test('UTF-8 多字节截断：末字节为续字节（非 0x0A）→ 补分隔后新 entry 存活', async () => {
    const sid = 'k47-utf8'
    switchBoth(sid)
    const file = engineGetTranscriptPath()
    // 有效行 + 截断在「中」(E4 B8 AD) 的前两字节：文件末字节 0xB8 ≠ 0x0A
    const head = Buffer.from(validLineNoLF('u1', null) + '\n{"type":"user","message":{"content":"', 'utf8')
    const partial = Buffer.from([0xe4, 0xb8]) // 「中」前 2 字节
    writeFileSync(file, Buffer.concat([head, partial]))

    engineResetProject()
    clearSessionMessagesCache()
    engineAdoptResumed()
    const pre = readFileSync(file)

    await engineRecordTranscript([userMsg('u4', 'after-utf8-crash')], undefined, 'u1')
    await engineFlush()

    const post = readFileSync(file)
    expect(post.subarray(0, pre.length).equals(pre)).toBe(true)
    expect(post.subarray(pre.length).toString('utf8').startsWith('\n')).toBe(true)
    const loaded = await loadTranscriptFile(file)
    expect(loaded.messages.has('u4')).toBe(true)
    expect(loaded.messages.has('u1')).toBe(true)
  })

  test('超大文件 8MB：append-only 前缀字节恒等 + 新 entry 存活（有界检查构造性 O(1) 读）', async () => {
    const sid = 'k47-huge'
    switchBoth(sid)
    const file = engineGetTranscriptPath()
    // ~9MB 有效行 + 截断尾（远超 LITE_READ_BUF_SIZE 64KB 尾窗）。行 id 用
    // 36 字符 UUID 形状：巨文件触发 loadTranscriptFile 的 walkChainBeforeParse
    // 死分支剥离（SKIP_PRECOMPACT_THRESHOLD 门），其链索引 parentUuid 查找按
    // UUID_LEN=36 定长切片键控——短 id 会使查找错键、链在叶处断掉、整片被
    // 误判死分支剥离（真实 session 恒 36 字符，不踩此路径；fixture 须同形状）。
    const uuid36 = (i: number) =>
      `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`
    const lines: string[] = []
    for (let i = 0; i < 40000; i++) {
      lines.push(validLineNoLF(uuid36(i), i === 0 ? null : uuid36(i - 1)))
    }
    writeFileSync(file, lines.join('\n') + '\n' + TRUNCATED_TAIL)
    expect(statSync(file).size).toBeGreaterThan(8 * 1024 * 1024)

    engineResetProject()
    clearSessionMessagesCache()
    engineAdoptResumed()
    const pre = readFileSync(file)
    const sizeBefore = statSync(file).size

    const u5 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb005'
    await engineRecordTranscript([userMsg(u5, 'after-huge-crash')], undefined, uuid36(39999))
    await engineFlush()

    const post = readFileSync(file)
    expect(post.subarray(0, pre.length).equals(pre)).toBe(true) // 8MB 前缀恒等
    const appended = post.subarray(pre.length).toString('utf8')
    expect(appended.startsWith('\n')).toBe(true)
    expect(appended.split('\n').filter(Boolean).length).toBe(1)
    expect(statSync(file).size - sizeBefore).toBe(Buffer.byteLength(appended, 'utf8'))
    const loaded = await loadTranscriptFile(file)
    expect(loaded.messages.has(u5)).toBe(true)
    expect(loaded.messages.get(u5)!.parentUuid).toBe(uuid36(39999))
    expect(loaded.messages.has(uuid36(0))).toBe(true)
    expect(loaded.messages.has(uuid36(39999))).toBe(true)
  })

  test('同文件连续两个 batch：第二批不再补分隔（无空行），三 entry 均可解析', async () => {
    const sid = 'k47-two-batch'
    switchBoth(sid)
    await engineRecordTranscript([userMsg('u1', 'hello'), asstMsg('a1', 'hi', 'm1')])
    await engineFlush()
    const pre = readFileSync(engineGetTranscriptPath())

    await engineRecordTranscript([userMsg('u2', 'batch-2')], undefined, 'a1')
    await engineFlush()

    const post = readFileSync(engineGetTranscriptPath())
    expect(post.subarray(0, pre.length).equals(pre)).toBe(true)
    expect(post.subarray(pre.length).toString('utf8').startsWith('\n')).toBe(false)
    expect(post.toString('utf8').includes('\n\n')).toBe(false)
    const loaded = await loadTranscriptFile(engineGetTranscriptPath())
    expect(loaded.messages.has('u1')).toBe(true)
    expect(loaded.messages.has('a1')).toBe(true)
    expect(loaded.messages.has('u2')).toBe(true)
  })

  test('sidechain agent 文件：截断尾后续轮 sidechain entry 不丢', async () => {
    const sid = 'k47-sidechain'
    switchBoth(sid)
    await engineRecordSidechain([userMsg('s1', 'side-before')], 'ag-k47', null)
    await engineFlush()

    const agentFile = engineGetAgentTranscriptPath('ag-k47')
    expect(existsSync(agentFile)).toBe(true)
    appendFileSync(agentFile, TRUNCATED_TAIL)

    engineResetProject()
    clearSessionMessagesCache()
    const pre = readFileSync(agentFile)

    await engineRecordSidechain([userMsg('s2', 'side-after')], 'ag-k47', 's1')
    await engineFlush()

    const post = readFileSync(agentFile)
    expect(post.subarray(0, pre.length).equals(pre)).toBe(true)
    expect(post.subarray(pre.length).toString('utf8').startsWith('\n')).toBe(true)
    const loaded = await loadTranscriptFile(agentFile)
    expect(loaded.messages.has('s2')).toBe(true)
    expect(loaded.messages.get('s2')!.parentUuid).toBe('s1')
    expect(loaded.messages.has('s1')).toBe(true)
  })

  test('async 队列与 sync 退出 metadata 排序：sync 先落，两 entry 各自过写边界', async () => {
    const sid = 'k47-order'
    switchBoth(sid)
    await engineRecordTranscript([userMsg('u1', 'hello'), asstMsg('a1', 'hi', 'm1')])
    await engineFlush()
    const file = engineGetTranscriptPath()
    appendFileSync(file, TRUNCATED_TAIL)

    engineResetProject()
    clearSessionMessagesCache()
    engineAdoptResumed()
    const pre = readFileSync(file)

    // async 先入队（未 flush）→ sync metadata 立即落盘 → flush 后 async 落
    await engineRecordTranscript([userMsg('u2', 'queued')], undefined, 'a1')
    cacheSessionTitle('排序标题')
    reAppendSessionMetadata()
    await engineFlush()

    const post = readFileSync(file)
    expect(post.subarray(0, pre.length).equals(pre)).toBe(true)
    // 追加区首字节 = 分隔符（sync title 是截断尾后第一条写，同样过写边界）
    expect(post.subarray(pre.length).toString('utf8').startsWith('\n')).toBe(true)
    const text = post.toString('utf8')
    const titleIdx = text.indexOf('"custom-title"')
    const u2Idx = text.indexOf('"uuid":"u2"')
    expect(titleIdx).toBeGreaterThan(-1)
    expect(u2Idx).toBeGreaterThan(titleIdx) // sync metadata 先落、async 随后
    const loaded = await loadTranscriptFile(file)
    expect([...loaded.customTitles.values()]).toContain('排序标题')
    expect(loaded.messages.has('u2')).toBe(true)
  })
})

/** 已LF/双batch 案的路径取数小助手（engine 面，切换后派生当前 sid 文件）。 */
function file_of(_sid: string): string {
  return engineGetTranscriptPath()
}
