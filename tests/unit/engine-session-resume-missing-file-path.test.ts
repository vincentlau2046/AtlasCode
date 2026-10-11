/**
 * FX-35（0.1.50，CC 2.1.97）resume-load 缺 file_path 容错回归守卫：
 * 持久化 Edit/Write tool result 缺 `file_path`（三形态）经 resume-load 全链
 * 不崩（降级/跳过）——ticket 判「修前红（现崩）→ 修后绿」，实核定因：
 * 当前树 resume-load 各面全容错（duck-type / 守卫），**0 产品码**。
 * 本测试 = 回归守卫：钉住容错行为，防后续波在 resume 链重新引入对
 * file_path 的无守卫访问。
 *
 * 定因证据面（全核，均不崩）：
 *  - engine convertToLogOption（load.ts）：纯字段/Map 访问，不触 input.file_path
 *  - engine buildConversationChain：parentUuid 链走 Map，不读 tool input
 *  - engine search 面（search.ts toolUseSearchText）：duck-type 白名单
 *    （`typeof v === 'string'` 才取值），缺键 = 静默跳过
 *  - engine processResumedConversation：消息回放 + 会话切换，不反序列化
 *    tool result 的 file_path
 *  - TUI twin（sessionStorage convertToLogOption / loadFullLog /
 *    buildAttributionSnapshotChain / sessionRestore computeRestoredAttribution
 *    State / queryHelpers extractReadFilesFromMessages / collapseReadSearch
 *    getFilePathsFromReadMessage / contextAnalysis tool_use 支）：全
 *    `input?.file_path` 守卫或 Map 查键，同形安全（面核记录）
 *  - headless --resume（print.ts）= engine processResumedConversation 同链
 *
 * 分层纪律：unit 层——mkdtemp 假 JSONL（repo 先例：engine-tasks /
 * engine-taskstore 等）；零网络 / 零真盘（tmpdir 即弃）。
 */
import { afterAll, test, expect } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  loadTranscriptFile,
  buildConversationChain,
  setSessionEnv,
  getSessionEnv,
  processResumedConversation,
} from '../../src/engine'
import {
  toolUseSearchText,
  toolResultSearchText,
} from '../../src/engine/session/search'

const tmp = mkdtempSync(join(tmpdir(), 'atlas-fx35-guard-'))
setSessionEnv({ getProjectsDir: () => tmp })
process.env.TEST_ENABLE_SESSION_PERSISTENCE = '1'
getSessionEnv().switchSession('fx35-guard')

// 持久化 Edit/Write 交换三形态（缺 file_path 变体）：
//  (a) tool_use input 缺 file_path 键（input 对象在）
//  (b) tool_use input = null
//  (c) tool_result user 消息（Edit 的 result 面本身无 file_path 字段）
const lines: string[] = []
function stamp(extra: Record<string, unknown>): string {
  const l = {
    type: 'user',
    userType: 'atlas',
    sessionId: 'fx35-guard',
    timestamp: '2026-01-01T00:00:00Z',
    version: '0.1.50',
    cwd: '/tmp',
    isSidechain: false,
    parentUuid: null,
    ...extra,
  }
  lines.push(JSON.stringify(l))
  return l.uuid as string
}

stamp({
  uuid: 'u1',
  message: { role: 'user', content: [{ type: 'text', text: 'edit it' }] },
})
stamp({
  parentUuid: 'u1',
  uuid: 'a1',
  type: 'assistant',
  message: {
    role: 'assistant',
    id: 'm1',
    model: 'guard',
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: 'editing' },
      // 形态 (a)：input 缺 file_path
      {
        type: 'tool_use',
        id: 'tu1',
        name: 'Edit',
        input: { old_string: 'x', new_string: 'y' },
      },
    ],
  },
})
stamp({
  parentUuid: 'a1',
  uuid: 'u2',
  message: {
    role: 'user',
    content: [
      // 形态 (c)：tool_result 面（EditOutput 形 filePath，非 file_path）
      {
        type: 'tool_result',
        tool_use_id: 'tu1',
        content: 'The file has been updated.',
      },
    ],
  },
  sourceToolAssistantUUID: 'a1',
})
stamp({
  parentUuid: 'u2',
  uuid: 'a2',
  type: 'assistant',
  message: {
    role: 'assistant',
    id: 'm2',
    model: 'guard',
    stop_reason: 'tool_use',
    content: [
      // 形态 (b)：input = null
      { type: 'tool_use', id: 'tu2', name: 'Write', input: null },
    ],
  },
})
stamp({
  parentUuid: 'a2',
  uuid: 'u3',
  message: {
    role: 'user',
    content: [
      { type: 'tool_result', tool_use_id: 'tu2', content: 'Wrote file.' },
    ],
  },
  sourceToolAssistantUUID: 'a2',
})

const file = join(tmp, 'fx35-guard.jsonl')
writeFileSync(file, lines.join('\n') + '\n')

test('缺 file_path 持久化 Edit/Write 面：resume-load 全链不崩（链完整 + 搜索面降级 + 会话回放）', async () => {
  // ① 加载 + 链重建：5 消息全链不丢（链走 parentUuid，不读 tool input）
  const loaded = await loadTranscriptFile(file)
  const leaf = loaded.messages.get('u3')!
  const chain = buildConversationChain(loaded.messages, leaf)
  expect(chain.map(m => m.uuid)).toEqual(['u1', 'a1', 'u2', 'a2', 'u3'])

  // ② 搜索展示面：duck-type 容错（不崩；缺 file_path = 该面静默跳过取值）
  const tuA = (
    chain.find(m => m.uuid === 'a1')!.message as { content?: unknown[] }
  ).content
  const editUse = tuA!.find(
    (b: { type?: string }) => b.type === 'tool_use',
  ) as { input?: unknown }
  expect(() => toolUseSearchText(editUse.input)).not.toThrow()
  expect(toolResultSearchText('The file has been updated.')).toBe(
    'The file has been updated.',
  )

  // ③ 会话回放（headless --resume 同链，非 fork）：不崩、消息数不丢
  const out = await processResumedConversation(
    {
      messages: chain as never,
      sessionId: 'fx35-guard',
    },
    { forkSession: false },
  )
  expect(out.messages).toHaveLength(5)
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})
