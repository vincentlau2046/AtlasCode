/**
 * session 域 func 真盘测试（E-7 S-7d d1，§8.49）：record→load 真盘往返 /
 * contentReplacement agentId 路由（sidechain 子目录）/ sidechain 写面 /
 * flush 幂等 / 元数据尾部 re-append / legacy progress 链桥 / 大文件
 * pre-compact 两态（>5MB）。
 *
 * 分层纪律：func 层真 fs（mkdtemp + setSessionEnv getProjectsDir→tmpdir
 * 注入，§8.14 注入序；TEST_ENABLE_SESSION_PERSISTENCE=1 破 unit 层
 * shouldSkipPersistence 测试守卫）+ 每测试独立 sessionId（getProjectDir
 * 按 cwd memoize，跨测试共享 projectDir 无碍）。
 *
 * 探针锚点（§8.49 详案，突变须恰好 1 red）：
 *   P-S1 recordTranscript `!seenNewMessage && isChainParticipant(m)` 前缀
 *    守卫 → 'P-S1 前缀守卫：非前缀旧消息不推进 parent'
 *   P-S3 scanner 前界截断支（scanChunkLines/processStraddle 的
 *    `s.out.len = 0`，非 finalizeOutput——它只做 carry 落写 + attr-snap
 *    EOF 重排）→ 'P-S3 大文件两态'（默认截断 / kill-switch 全读）
 *   P-S2 归 unit 层（buildConversationChain 纯内存面，见
 *    tests/unit/engine-session.test.ts 探针锚点登记）。
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  recordTranscript,
  recordSidechainTranscript,
  recordContentReplacement,
  flushSessionStorage,
  reAppendSessionMetadata,
  cacheSessionTitle,
  loadTranscriptFile,
  getTranscriptPath,
  getAgentTranscriptPath,
  setAgentTranscriptSubdir,
  clearAgentTranscriptSubdir,
  resetProjectForTesting,
  clearSessionMessagesCache,
  setSessionEnv,
  getSessionEnv,
  type Message,
  type ContentReplacementRecord,
} from '../../src/engine'

let tmp: string

// 契约（与旧类型面一致）：Message 对象不携带 parentUuid——父链由
// insertMessageChain 链推进统一计算（resume/fork 路径由 removeExtraFields
// 剥离 SerializedMessage 的 parentUuid/isSidechain 后再入域）。若调用方
// 传了携带 parentUuid 的 Message，stamp 的 `...message` spread 会覆写算出
// 的 parent（旧 Message 类型无此字段，不可达；域 Message 索引签名可携带，
// 契约面由调用方保证——H6 登记）。
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

function switchTo(tag: string): string {
  const sid = `func-session-${tag}`
  getSessionEnv().switchSession(sid)
  return sid
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-session-func-'))
  // 必须先于首次 getProjectDir 调用注 env（cwd→projectDir memoize 面）
  setSessionEnv({ getProjectsDir: () => tmp })
  process.env.TEST_ENABLE_SESSION_PERSISTENCE = '1'
})
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
  delete process.env.TEST_ENABLE_SESSION_PERSISTENCE
})
beforeEach(() => {
  resetProjectForTesting()
  clearSessionMessagesCache()
})
afterEach(() => {
  clearAgentTranscriptSubdir('ag1')
  delete process.env.ATLAS_DISABLE_PRECOMPACT_SKIP
  resetProjectForTesting()
  clearSessionMessagesCache()
})

// ── record → load 真盘往返 ───────────────────────────────────────────────────

describe('record → load 真盘往返', () => {
  test('主会话 3 条消息落盘 + 读回链完整 + stamp 字段', async () => {
    const sid = switchTo('roundtrip')
    await recordTranscript([
      userMsg('u1', 'hello'),
      asstMsg('a1', 'hi', 'm1'),
      userMsg('u2', 'again'),
    ])
    await flushSessionStorage()

    const file = getTranscriptPath()
    expect(existsSync(file)).toBe(true)

    const loaded = await loadTranscriptFile(file)
    expect(loaded.messages.size).toBe(3)
    expect(loaded.messages.get('a1')!.parentUuid).toBe('u1')
    expect(loaded.messages.get('u2')!.parentUuid).toBe('a1')
    // session stamp 字段（FROZEN 字段序面）
    const a1 = loaded.messages.get('a1')!
    expect(a1.userType).toBe('atlas')
    expect(a1.sessionId).toBe(sid)
    expect(a1.version).toBeDefined()
    // leaf 计算：u2 为终局消息
    expect(loaded.leafUuids.has('u2')).toBe(true)
  })
})

// ── contentReplacement 路由（agentId → sidechain 文件）─────────────────────

describe('recordContentReplacement 路由', () => {
  const recs: ContentReplacementRecord[] = [
    { kind: 'tool-result', toolUseId: 't1', replacement: 'stub' },
  ]

  test('agentId 支写 sidechain 文件（subdir 分组），主文件无该 entry', async () => {
    switchTo('cr-route')
    setAgentTranscriptSubdir('ag1', 'wf1')
    await recordTranscript([userMsg('u1', 'hello')])
    await recordContentReplacement(recs, 'ag1')
    await flushSessionStorage()

    const agentFile = getAgentTranscriptPath('ag1')
    expect(existsSync(agentFile)).toBe(true)
    expect(agentFile).toContain(join('subagents', 'wf1'))
    const agentLines = readFileSync(agentFile, 'utf-8').trim().split('\n')
    expect(agentLines.some(l => l.includes('"content-replacement"'))).toBe(true)

    const mainLines = readFileSync(getTranscriptPath(), 'utf-8')
      .trim()
      .split('\n')
    expect(mainLines.some(l => l.includes('"content-replacement"'))).toBe(false)
  })

  test('无 agentId 支写主会话文件', async () => {
    switchTo('cr-main')
    await recordTranscript([userMsg('u1', 'hello')])
    await recordContentReplacement(recs)
    await flushSessionStorage()

    const mainLines = readFileSync(getTranscriptPath(), 'utf-8')
      .trim()
      .split('\n')
    const crLine = mainLines.find(l => l.includes('"content-replacement"'))
    expect(crLine).toBeDefined()
    expect(JSON.parse(crLine!)).toMatchObject({
      type: 'content-replacement',
      sessionId: getSessionEnv().getSessionId(),
    })
  })
})

// ── sidechain 写面 ───────────────────────────────────────────────────────────

describe('recordSidechainTranscript', () => {
  test('sidechain 消息落 sidechain 文件 + isSidechain 戳', async () => {
    switchTo('sidechain')
    setAgentTranscriptSubdir('ag1', 'wf1')
    await recordSidechainTranscript(
      [userMsg('su1', 'agent task'), asstMsg('sa1', 'doing')],
      'ag1',
    )
    await flushSessionStorage()

    const agentFile = getAgentTranscriptPath('ag1')
    expect(existsSync(agentFile)).toBe(true)
    const lines = readFileSync(agentFile, 'utf-8').trim().split('\n')
    const su1 = JSON.parse(lines[0])
    expect(su1.isSidechain).toBe(true)
    expect(su1.agentId).toBe('ag1')
    expect(su1.uuid).toBe('su1')
  })
})

// ── flush 幂等 ───────────────────────────────────────────────────────────────

describe('flushSessionStorage 幂等', () => {
  test('重复 flush 不重复写行', async () => {
    switchTo('flush-idem')
    await recordTranscript([userMsg('u1', 'hello'), asstMsg('a1', 'hi')])
    await flushSessionStorage()
    const count1 = readFileSync(getTranscriptPath(), 'utf-8')
      .trim()
      .split('\n').length
    await flushSessionStorage()
    await flushSessionStorage()
    const count2 = readFileSync(getTranscriptPath(), 'utf-8')
      .trim()
      .split('\n').length
    expect(count2).toBe(count1)
    expect(count1).toBeGreaterThanOrEqual(2)
  })
})

// ── 元数据尾部 re-append ────────────────────────────────────────────────────

describe('reAppendSessionMetadata 尾部窗口', () => {
  test('cacheSessionTitle 后 re-append → 文件尾 64KB 窗口含 custom-title 行', async () => {
    switchTo('meta-tail')
    await recordTranscript([userMsg('u1', 'hello')])
    cacheSessionTitle('My Custom Title')
    await flushSessionStorage()
    reAppendSessionMetadata()

    const tail = readFileSync(getTranscriptPath(), 'utf-8').slice(-65536)
    const tailLines = tail.trim().split('\n')
    const titleLine = tailLines.find(l => l.startsWith('{"type":"custom-title"'))
    expect(titleLine).toBeDefined()
    expect(JSON.parse(titleLine!)).toMatchObject({ customTitle: 'My Custom Title' })
  })
})

// ── legacy progress 链桥（旧 JSONL 容错面）──────────────────────────────────

describe('legacy progress 链桥', () => {
  test('progress 行不入 messages + 后续消息 parent 桥回最近非 progress 祖先', async () => {
    switchTo('progress-bridge')
    const file = join(tmp, 'legacy-progress.jsonl')
    const lines = [
      JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, isSidechain: false, timestamp: 't1', cwd: '/tmp', userType: 'atlas', sessionId: 'sp', version: '1', message: { content: 'hi' } }),
      JSON.stringify({ type: 'progress', uuid: 'p1', parentUuid: 'u1', timestamp: 't2' }),
      JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'p1', isSidechain: false, timestamp: 't3', cwd: '/tmp', userType: 'atlas', sessionId: 'sp', version: '1', message: { content: 'hi', id: 'm1' } }),
    ]
    writeFileSync(file, lines.join('\n') + '\n')

    const loaded = await loadTranscriptFile(file)
    expect(loaded.messages.has('p1')).toBe(false)
    expect(loaded.messages.has('u1')).toBe(true)
    expect(loaded.messages.has('a1')).toBe(true)
    // 链桥：a1.parentUuid p1 → u1
    expect(loaded.messages.get('a1')!.parentUuid).toBe('u1')
    // leaf = a1（终局）
    expect(loaded.leafUuids.has('a1')).toBe(true)
  })
})

// ── P-S1 前缀守卫（突变探针锚点）────────────────────────────────────────────

describe('P-S1 前缀守卫：非前缀旧消息不推进 parent', () => {
  test('新消息后出现的旧消息（非前缀）不得覆写 startingParentUuid', async () => {
    switchTo('ps1')
    // 首轮：u1/a1 入 messageSet（落盘）
    await recordTranscript([userMsg('u1', 'one'), asstMsg('a1', 'r1')])
    await flushSessionStorage()
    // 次轮切片：u1（旧前缀）→ u2（新）→ a1（旧，非前缀——compaction 后
    // messagesToKeep 截断形态的旧消息混入）。recordTranscript 循环末尾
    // 批量 insertMessageChain(newMessages, …, startingParentUuid)：
    // 前缀守卫下仅 u1 推进 startingParent → u2.parent='u1'；突变（去
    // !seenNewMessage 守卫）→ a1 亦推进 → u2.parent='a1' → 本测红。
    // hint 'seed' 文档化：无前缀旧消息时才是真正起点。
    const out = await recordTranscript(
      [userMsg('u1', 'one'), userMsg('u2', 'two'), asstMsg('a1', 'r1')],
      undefined,
      'seed',
    )
    await flushSessionStorage()

    expect(out).toBe('u2')
    const loaded = await loadTranscriptFile(getTranscriptPath())
    expect(loaded.messages.get('u2')!.parentUuid).toBe('u1')
    // 全 3 条消息在盘（u1/a1 首轮已录，次轮 dedup 不重写）
    expect(loaded.messages.size).toBe(3)
  })
})

// ── P-S3 大文件 pre-compact 两态（突变探针锚点）────────────────────────────

describe('P-S3 大文件 pre-compact 两态（>5MB）', () => {
  function writeLargeFile(): string {
    const file = join(tmp, 'large.jsonl')
    const preTitle = JSON.stringify({
      type: 'custom-title',
      sessionId: 'largesession',
      customTitle: 'PreTitle',
    })
    const pre1 = JSON.stringify({
      type: 'user',
      uuid: 'pre1',
      parentUuid: null,
      isSidechain: false,
      timestamp: 't0',
      cwd: '/tmp',
      userType: 'atlas',
      sessionId: 'largesession',
      version: '1',
      message: { content: 'before compact' },
    })
    const padding: string[] = []
    let parent = 'pre1'
    for (let i = 0; i < 6; i++) {
      const uuid = `pad${i}`
      padding.push(
        JSON.stringify({
          type: 'assistant',
          uuid,
          parentUuid: parent,
          isSidechain: false,
          timestamp: `tp${i}`,
          cwd: '/tmp',
          userType: 'atlas',
          sessionId: 'largesession',
          version: '1',
          message: {
            content: 'x'.repeat(1_000_000),
            id: `mp${i}`,
          },
        }),
      )
      parent = uuid
    }
    const boundary = JSON.stringify({
      type: 'system',
      subtype: 'compact_boundary',
      uuid: 'cb',
      parentUuid: null,
      logicalParentUuid: parent,
      isSidechain: false,
      timestamp: 'tcb',
      cwd: '/tmp',
      userType: 'atlas',
      sessionId: 'largesession',
      version: '1',
    })
    const post1 = JSON.stringify({
      type: 'user',
      uuid: 'post1',
      parentUuid: 'cb',
      isSidechain: false,
      timestamp: 't1',
      cwd: '/tmp',
      userType: 'atlas',
      sessionId: 'largesession',
      version: '1',
      message: { content: 'after compact' },
    })
    const post2 = JSON.stringify({
      type: 'assistant',
      uuid: 'post2',
      parentUuid: 'post1',
      isSidechain: false,
      timestamp: 't2',
      cwd: '/tmp',
      userType: 'atlas',
      sessionId: 'largesession',
      version: '1',
      message: { content: 'done', id: 'm2' },
    })
    writeFileSync(
      file,
      [preTitle, pre1, ...padding, boundary, post1, post2].join('\n') + '\n',
    )
    return file
  }

  test('默认态：边界前消息截断 + 前界元数据恢复（custom-title 存活）', async () => {
    switchTo('ps3-skip')
    const file = writeLargeFile()
    delete process.env.ATLAS_DISABLE_PRECOMPACT_SKIP
    const loaded = await loadTranscriptFile(file)
    expect(loaded.messages.has('post1')).toBe(true)
    expect(loaded.messages.has('post2')).toBe(true)
    // 截断面：pre1 物理不可见（P-S3 突变锚点——去截断则 pre1 复活 → 红）
    expect(loaded.messages.has('pre1')).toBe(false)
    // 前界元数据字节级前扫恢复
    expect(loaded.customTitles.get('largesession')).toBe('PreTitle')
    expect(loaded.leafUuids.has('post2')).toBe(true)
  })

  test('kill-switch 态：ATLAS_DISABLE_PRECOMPACT_SKIP 全量读（pre1 可见）', async () => {
    switchTo('ps3-full')
    const file = writeLargeFile()
    process.env.ATLAS_DISABLE_PRECOMPACT_SKIP = '1'
    try {
      const loaded = await loadTranscriptFile(file)
      expect(loaded.messages.has('pre1')).toBe(true)
      expect(loaded.messages.has('post2')).toBe(true)
    } finally {
      delete process.env.ATLAS_DISABLE_PRECOMPACT_SKIP
    }
  })
})
