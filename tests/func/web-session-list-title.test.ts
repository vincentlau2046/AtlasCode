/**
 * W-UI-V G-D 载体根修判别格（2026-11-20 用户裁「载体根修 0.1.125」）：
 * listSessions 零标题提取（toSummary 硬编码 title:null/messageCount:null，
 * 实机 AtlasWeb 侧栏 49 行全 "(untitled)" 定谳）。判据：
 * 1. custom-title 项 → title = customTitle（最高优先，压 summary/首 user）；
 * 2. summary 项（无 custom-title）→ title = summary；
 * 3. 均无 → 首条 user 消息文本（空白折叠 + 截断省略号）；
 * 4. 零消息/空文件 → title null（诚实空态）；
 * 5. messageCount：文件 ≤ 头读界（全文件已读）→ 精确计数；超界 → null；
 * 6. 头读尾截半行容忍（不完整尾行不解析、不崩）；
 * 7. 单会话头读失败不毒化整列（其余行照常提取）。
 * 全离线，真实 fs + seeded 目录。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createReadonlySessionRuntime } from '../../src/atlascode/web/readonlyRuntime'
import { atlasWebSessionEngine } from '../../src/atlascode/web/runtimeDefault'

let root: string
let dirA: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-list-title-'))
  dirA = join(root, 'scope-a')
  mkdirSync(dirA, { recursive: true })
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const USER_LINE = (uuid: string, text: string, sessionId = 'sess-1') =>
  JSON.stringify({
    type: 'user', uuid, parentUuid: null, sessionId,
    timestamp: '2026-11-15T10:00:00.000Z', cwd: root, userType: 'atlas',
    version: '0.0.0', isSidechain: false, message: { role: 'user', content: text },
  })

const ASSISTANT_LINE = (uuid: string, text: string) =>
  JSON.stringify({
    type: 'assistant', uuid, parentUuid: uuid.replace('u', 'a'), sessionId: 'sess-1',
    timestamp: '2026-11-15T10:00:01.000Z', cwd: root, userType: 'atlas',
    version: '0.0.0', isSidechain: false, message: { role: 'assistant', content: text },
  })

function makeRuntime() {
  return createReadonlySessionRuntime({
    productId: 'atlascode',
    scopes: [{ scopeId: 'proj-a', storageDir: dirA }],
    engine: atlasWebSessionEngine,
  })
}

async function titlesOf(rt: ReturnType<typeof makeRuntime>) {
  const res = await rt.listSessions({ scopeId: 'proj-a' })
  return new Map(res.sessions.map(s => [s.sessionId, s]))
}

describe('listSessions title/messageCount 提取（G-D）', () => {
  test('custom-title 最高优先；messageCount 全文件读尽时精确', async () => {
    writeFileSync(join(dirA, 'sess-1.jsonl'), [
      JSON.stringify({ type: 'custom-title', sessionId: 'sess-1', customTitle: '自定义标题' }),
      USER_LINE('u1', 'first user text'),
      ASSISTANT_LINE('a1', 'reply'),
      USER_LINE('u2', 'second'),
      '',
    ].join('\n'))
    const rt = makeRuntime()
    await rt.start()
    try {
      const row = (await titlesOf(rt)).get('sess-1')!
      expect(row.title).toBe('自定义标题')
      expect(row.messageCount).toBe(3)
    } finally {
      await rt.close()
    }
  })

  test('summary 兜底（无 custom-title）', async () => {
    writeFileSync(join(dirA, 'sess-2.jsonl'), [
      JSON.stringify({ type: 'summary', leafUuid: 'u9', summary: '摘要标题' }),
      USER_LINE('u1', 'first user text'),
      '',
    ].join('\n'))
    const rt = makeRuntime()
    await rt.start()
    try {
      const row = (await titlesOf(rt)).get('sess-2')!
      expect(row.title).toBe('摘要标题')
    } finally {
      await rt.close()
    }
  })

  test('均无 → 首条 user 消息折叠截断（…收尾）', async () => {
    const long = '分析  ' + '很长的需求描述'.repeat(40)
    writeFileSync(join(dirA, 'sess-3.jsonl'), [USER_LINE('u1', long), ''].join('\n'))
    const rt = makeRuntime()
    await rt.start()
    try {
      const row = (await titlesOf(rt)).get('sess-3')!
      expect(row.title).not.toBeNull()
      expect(row.title).not.toContain('  ')
      expect(row.title!.endsWith('…')).toBe(true)
      expect(row.title!.length).toBeLessThanOrEqual(512)
      expect(row.title!.startsWith('分析')).toBe(true)
    } finally {
      await rt.close()
    }
  })

  test('空文件 → title null + messageCount 0（全读尽精确计数）', async () => {
    writeFileSync(join(dirA, 'sess-4.jsonl'), '')
    const rt = makeRuntime()
    await rt.start()
    try {
      const row = (await titlesOf(rt)).get('sess-4')!
      expect(row.title).toBeNull()
      expect(row.messageCount).toBe(0)
    } finally {
      await rt.close()
    }
  })

  test('头读尾截半行容忍：半行不解析、崩不掉；超界文件 messageCount=null', async () => {
    const bigFiller = 'x'.repeat(200_000)
    writeFileSync(
      join(dirA, 'sess-5.jsonl'),
      [JSON.stringify({ type: 'custom-title', sessionId: 'sess-5', customTitle: '大文件标题' }), USER_LINE('u1', bigFiller), ''].join('\n'),
    )
    const rt = makeRuntime()
    await rt.start()
    try {
      const row = (await titlesOf(rt)).get('sess-5')!
      // custom-title 在头读窗内 → 提取；文件超头读界 → messageCount null
      expect(row.title).toBe('大文件标题')
      expect(row.messageCount).toBeNull()
    } finally {
      await rt.close()
    }
  })

  test('坏行跳过不毒化；单会话缺失不毒化整列', async () => {
    writeFileSync(join(dirA, 'sess-6.jsonl'), [
      '{not json',
      USER_LINE('u1', 'good title source'),
      '',
    ].join('\n'))
    writeFileSync(join(dirA, 'sess-7.jsonl'), [USER_LINE('u1', 'another session'), ''].join('\n'))
    const rt = makeRuntime()
    await rt.start()
    try {
      const rows = await titlesOf(rt)
      expect(rows.get('sess-6')!.title).toBe('good title source')
      expect(rows.get('sess-7')!.title).toBe('another session')
    } finally {
      await rt.close()
    }
  })
})
