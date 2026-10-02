/**
 * R7（jsonl 双写收敛）双写者单行判别测试（func 真盘，
 * docs/r3-jsonl-double-write-root-cause.md 判别单测——mutation-red：
 * 修前双写 2 行 / 修后共享 Set 单写 1 行）。
 *
 * 生产时序复刻：TUI 面（useLogMessages 挂载面）先加载去重 Set（此时文件空
 * = 陈旧快照），随后 engine 写面（loop sink）append 同批消息并写回共享
 * Set，再 TUI 写面回放同批消息——
 *   修前：tui 本地 Set 不见 engine 写回 → 双 append（jsonl 2 行，红）；
 *   修后：共享 Set 已被 engine 写面更新 → tui 预过滤判已录 → jsonl 1 行（绿）。
 *
 * 分层纪律：func 层真 fs（mkdtemp + ATLAS_CONFIG_DIR 环境缝重定向 tui 配置
 * 目录 + setSessionEnv 重定向 engine getProjectsDir + TEST_ENABLE_SESSION_PERSISTENCE=1
 * 破 shouldSkipPersistence 测试守卫，两侧守卫同面）+ 双 session 切换
 * （bootstrap switchSession = tui 写面会话 / engine SessionEnv port = engine
 * 写面会话，同 sid 对齐同文件）。
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
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  recordTranscript as engineRecordTranscript,
  flushSessionStorage as engineFlushSessionStorage,
  getTranscriptPath,
  clearSessionMessagesCache,
  setSessionEnv,
  getSessionEnv,
  resetProjectForTesting,
  type Message,
} from '../../src/engine'
import {
  recordTranscript as tuiRecordTranscript,
  flushSessionStorage as tuiFlushSessionStorage,
  doesMessageExistInSession,
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

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-dw-func-'))
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
  resetProjectForTesting()
  clearSessionMessagesCache()
})
afterEach(() => {
  resetProjectForTesting()
  clearSessionMessagesCache()
})

describe('R7 双写者 jsonl 单行（mutation-red：修前 2 行 / 修后 1 行）', () => {
  test('同批消息经两写者先后 recordTranscript → session 文件单行', async () => {
    const sid = `dw-single-line-${Date.now()}`
    switchSession(sid) // bootstrap 活 session → tui 写面
    getSessionEnv().switchSession(sid) // engine port → engine 写面

    // 生产时序 ①：tui 面（挂载面）先加载去重 Set（此时文件空 = 陈旧快照）
    expect(await doesMessageExistInSession(sid, 'probe')).toBe(false)

    // 生产时序 ②：engine 写面（loop sink）记录同批消息（写回共享 Set）
    await engineRecordTranscript([userMsg('u1', 'hello'), asstMsg('a1', 'hi', 'm1')])
    await engineFlushSessionStorage()

    // 生产时序 ③：tui 写面（useLogMessages）回放同批消息
    const tuiMessages = [
      userMsg('u1', 'hello'),
      asstMsg('a1', 'hi', 'm1'),
    ] as unknown as Parameters<typeof tuiRecordTranscript>[0]
    await tuiRecordTranscript(tuiMessages)
    await tuiFlushSessionStorage()

    // ground truth：uuid=a1 / u1 各仅 1 行（修前双写 = 各 2 行）
    const file = getTranscriptPath()
    expect(existsSync(file)).toBe(true)
    const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
    expect(lines.filter(l => l.includes('"uuid":"a1"')).length).toBe(1)
    expect(lines.filter(l => l.includes('"uuid":"u1"')).length).toBe(1)
  })
})
