/**
 * 0.1.69 D-5（Claude 对齐波）：压缩后当前 git status 重注判别单测
 *
 * 被测能力：
 *  - createCurrentGitStatusAttachment（compact.ts 工厂）三门控：
 *    ① session 起始基线缺（getSessionStartGitStatusBlocks = null：非 git /
 *       测试 env / getSystemContext 从未跑过）→ null 零注入（安全向）
 *    ② fresh 取态不可用（getGitStatusFresh = null）→ null
 *    ③ fresh 块与 session 起始基线块 JSON 同一（git 面无变更）→ null
 *       （session 起始快照压缩后依然准确 = 零 token 浪费恒等锚）
 *    变更面 = git_status_refresh 附件在场（wrapper 形 + fresh 文案）
 *  - normalizeAttachmentForAPI 'git_status_refresh' 支：API 面 =
 *    system-reminder 包裹 isMeta user message（唯一消费面；TUI 渲染面 =
 *    NULL_RENDERING_TYPES 预过滤零渲染）
 *
 * 接缝：mock.module 覆写 tui 顶层 context 的 git status 两取态面
 * （getSessionStartGitStatusBlocks / getGitStatusFresh 假件，其余导出面
 * 真实 spread = mock-module-export-surface 标准对策），compact.js 图内
 * 全部消费方拿到同一 mock（bun test --isolate 每文件独立进程，mock 不
 * 跨文件泄漏）。零磁盘零网络（git 命令面完全不入测试图）。
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test'

const CONTEXT_PATH = '../../src/tui/context.js'
const COMPACT_PATH = '../../src/tui/contextBodies/compact.js'

type Blocks = {
  branch: string
  mainBranch: string
  status: string
  log: string
  userName: string
}

const BASELINE: Blocks = {
  branch: 'main',
  mainBranch: 'master',
  status: ' M src/a.ts',
  log: 'abc1234 feat: a',
  userName: 'dev',
}
const CHANGED: Blocks = {
  ...BASELINE,
  status: ' M src/a.ts\n?? src/b.ts',
}

const FRESH_TEXT =
  'This is the current git status, re-injected after context compaction. It reflects the working tree as of now and supersedes any earlier session-start snapshot.\n\n' +
  'Current branch: main\n\nMain branch (you will usually use this for PRs): master\n\nGit user: dev\n\nStatus:\n M src/a.ts\n?? src/b.ts\n\nRecent commits:\nabc1234 feat: a'

// mock-module-export-surface 标准对策：先真实 import 取全导出面，再 spread
const realContext = await import(CONTEXT_PATH)
const contextMock: Record<string, unknown> = { ...realContext }

let baseline: Blocks | null = null
let fresh: Blocks | null = null

contextMock.getSessionStartGitStatusBlocks = () => baseline
contextMock.getGitStatusFresh = async () =>
  fresh ? { text: FRESH_TEXT, blocks: fresh } : null

mock.module(CONTEXT_PATH, () => contextMock)

const { createCurrentGitStatusAttachment } = await import(COMPACT_PATH)
const { normalizeAttachmentForAPI } = await import(
  '../../src/tui/utils/messages.js'
)

beforeEach(() => {
  baseline = null
  fresh = null
})

describe('createCurrentGitStatusAttachment 三门控', () => {
  test('无 session 起始基线（非 git / 未抓取）→ null 零注入', async () => {
    baseline = null
    fresh = BASELINE
    expect(await createCurrentGitStatusAttachment()).toBeNull()
  })

  test('基线在场 + fresh 取态不可用 → null（安全向，不造假注入）', async () => {
    baseline = BASELINE
    fresh = null
    expect(await createCurrentGitStatusAttachment()).toBeNull()
  })

  test('基线在场 + fresh 与基线块 JSON 同一（git 面无变更）→ null 恒等锚', async () => {
    baseline = BASELINE
    fresh = { ...BASELINE }
    expect(await createCurrentGitStatusAttachment()).toBeNull()
  })

  test('基线在场 + git 面有变更（status 块异值）→ git_status_refresh 附件在场', async () => {
    baseline = BASELINE
    fresh = CHANGED
    const att = await createCurrentGitStatusAttachment()
    expect(att).not.toBeNull()
    expect(att!.type).toBe('attachment')
    expect(att!.attachment.type).toBe('git_status_refresh')
    expect(att!.attachment.status).toBe(FRESH_TEXT)
    // wrapper 形（createAttachmentMessage 面：uuid/timestamp 在场）
    expect(typeof att!.uuid).toBe('string')
    expect(att!.uuid.length).toBeGreaterThan(0)
  })

  test('变更判定逐字段（log 异值亦触发）', async () => {
    baseline = BASELINE
    fresh = { ...BASELINE, log: 'def5678 feat: b' }
    const att = await createCurrentGitStatusAttachment()
    expect(att).not.toBeNull()
    expect(att!.attachment.type).toBe('git_status_refresh')
  })
})

describe('normalizeAttachmentForAPI git_status_refresh 支（API 面消费）', () => {
  test('system-reminder 包裹 isMeta user message，文案 = fresh 全文', () => {
    const out = normalizeAttachmentForAPI({
      type: 'git_status_refresh',
      status: FRESH_TEXT,
    })
    expect(out.length).toBe(1)
    expect(out[0].isMeta).toBe(true)
    const content = out[0].message.content
    const text =
      typeof content === 'string'
        ? content
        : (content as Array<{ type: string; text?: string }>)
            .filter(b => b.type === 'text')
            .map(b => b.text ?? '')
            .join('')
    expect(text).toContain('re-injected after context compaction')
    expect(text).toContain('?? src/b.ts')
    expect(text).toContain('<system-reminder>')
  })
})
