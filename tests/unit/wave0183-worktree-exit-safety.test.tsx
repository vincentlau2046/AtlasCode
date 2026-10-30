/**
 * wave0183 K4-2（0.1.83 V3-4）— WorktreeExitDialog 退出检查 fail-closed 判别
 * （f4 工单 §1.B，上游 300）
 *
 * 红根因（c105e1d 活码链，WorktreeExitDialog.tsx:35-75）：
 *   - `git status --porcelain` 不核 exit code（失败 → stdout '' → 误判干净）；
 *   - hook session 无 originalHeadCommit 时拼出 `rev-list --count undefined..HEAD`
 *     → 命令必败，`parseInt('')||0` 折成 0 commits；
 *   - 两误判相与 → `0 文件 && 0 commits` → **静默 cleanupWorktree()**，含未推
 *     提交的 worktree 被无声删除（数据丢失）。且 git 调用不带 `-C`，检查结果
 *     绑定进程 cwd 而非 worktreePath。
 *
 * 修后契约（工单 §1.B Interfaces）：
 *   - helper `inspectWorktreeChanges(worktreePath, originalHeadCommit)`：
 *     status/rev-list 非零、无基线、非数字输出、exec 抛错 → **null（unknown，
 *     绝非 0/0）**；只有可信基线 + 双检查成功才返回计数。
 *   - dialog：null → 进询问、默认 keep、remove hook（cleanupWorktree）调用数 0；
 *     有可信基线且 checks 成功的 0/0 保留原 clean 自动清理；dirty/commits>0
 *     保持询问；未知文案不得声称 "no changes" / "0 commits"。
 *   - 所有检查经 `git -C <worktreePath>` 绑定 worktreePath，不依赖进程 cwd。
 *
 * 接缝：mock.module 覆写 execFileNoThrow（git 结果注入）+ worktree.ts
 * （cleanupWorktree/keepWorktree 计数，其余导出面真实 spread =
 * mock-module-export-surface 标准对策；getCurrentWorktreeSession/
 * restoreWorktreeSession 走真实模块态）+ sessionStorage（done 路径零磁盘）。
 * Ink render 走 Writable 捕获流 + 伪 stdin（同 file-permission-dialog-verdict /
 * sessionlist-p1-render 模式）。bun test --isolate 每文件独立进程，mock 不跨文件泄漏。
 *
 * RED 说明：dialog 渲染面测试为**行为红**（修前 cleanupWorktree 被静默调用 /
 * 自动 remove 文案现形）；helper 契约族在新模块落盘前为 import 红（动态 import
 * 容错降级，不拖垮 dialog 行为红判读）。
 */
import { PassThrough, Writable } from 'stream'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'

const EXEC_PATH = '../../src/tui/utils/execFileNoThrow.js'
const WORKTREE_PATH = '../../src/tui/utils/worktree.js'
const SESSION_STORAGE_PATH = '../../src/tui/utils/sessionStorage.js'
const HELPER_PATH = '../../src/tui/utils/worktreeChangeSummary.js'
const DIALOG_PATH = '../../src/tui/components/WorktreeExitDialog.js'

type WorktreeSession = typeof import('../../src/tui/utils/worktree.js').WorktreeSession

// ── mock：execFileNoThrow（git 结果注入，双形参兼容修前裸调用/修后 -C 调用）──
type GitOutcome = { stdout: string; code: number }
const CLEAN: GitOutcome = { stdout: '', code: 0 }
const FAIL: GitOutcome = { stdout: '', code: 1 }

const realExec = await import(EXEC_PATH)
let statusResult: GitOutcome | 'reject' = CLEAN
let revListResult: GitOutcome | 'reject' = FAIL
/** cwd 绑定判别态：不带 `-C <wt>` 的调用（修前形态）返回假干净。 */
let bareCallLooksClean = false
const gitCalls: Array<{ file: string; args: string[] }> = []

const execMock: Record<string, unknown> = { ...realExec }
execMock.execFileNoThrow = async (
  _file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> => {
  gitCalls.push({ file: _file, args: [...args] })
  const pick = (outcome: GitOutcome | 'reject') => {
    if (outcome === 'reject') {
      throw new Error('injected exec failure')
    }
    return { stdout: outcome.stdout, stderr: '', code: outcome.code }
  }
  if (args.includes('rev-list')) {
    return pick(revListResult)
  }
  if (args.includes('status')) {
    if (bareCallLooksClean && !(args[0] === '-C' && args.length > 1)) {
      return { stdout: '', stderr: '', code: 0 }
    }
    return pick(statusResult)
  }
  return { stdout: '', stderr: '', code: 0 }
}
mock.module(EXEC_PATH, () => execMock)

// ── mock：worktree.ts（cleanup/keep/kill 计数；session 模块态走真实体）──
const realWorktree = await import(WORKTREE_PATH)
let cleanupCalls = 0
let keepCalls = 0
const worktreeMock: Record<string, unknown> = { ...realWorktree }
worktreeMock.cleanupWorktree = async (): Promise<void> => {
  cleanupCalls++
}
worktreeMock.keepWorktree = async (): Promise<void> => {
  keepCalls++
}
worktreeMock.killTmuxSession = async (): Promise<boolean> => true
mock.module(WORKTREE_PATH, () => worktreeMock)

// ── mock：sessionStorage（dialog done 路径 recordWorktreeExit 零磁盘）──
const realSessionStorage = await import(SESSION_STORAGE_PATH)
const sessionStorageMock: Record<string, unknown> = {
  ...realSessionStorage,
}
sessionStorageMock.saveWorktreeState = (): void => {}
mock.module(SESSION_STORAGE_PATH, () => sessionStorageMock)

// ── 受测体（mock.module 之后导入）──
const { WorktreeExitDialog } = await import(DIALOG_PATH)
const { restoreWorktreeSession } = realWorktree

// Select 的 Enter 走 useKeybindings → KeybindingContext.resolve 解析（非裸
// useInput）；裸 render 无 KeybindingProvider 时 handleInput 首行
// `if (!keybindingContext) return` 静默丢键。harness 须包最小 provider：
// bindings 用 parseBindings(DEFAULT_BINDINGS)（生产同源 defaults，不读
// ~/.atlas 用户配置，防机器态漂移）。
const { KeybindingProvider } = await import(
  '../../src/tui/keybindings/KeybindingContext.js'
)
const { DEFAULT_BINDINGS } = await import(
  '../../src/tui/keybindings/defaultBindings.js'
)
const { parseBindings } = await import('../../src/tui/keybindings/parser.js')
const defaultParsedBindings = parseBindings(DEFAULT_BINDINGS)
// helper 契约族：新模块落盘前动态 import 容错（每测显式红，不静默 skip）
type HelperModule = typeof import('../../src/tui/utils/worktreeChangeSummary.js')
const helperMod: HelperModule | null = await import(HELPER_PATH).catch(() => null)
async function helper(): Promise<HelperModule> {
  if (!helperMod) {
    throw new Error('K4-2 helper worktreeChangeSummary.ts 未落盘（import 红）')
  }
  return helperMod
}

// ── fixture ────────────────────────────────────────────────────────────────
const WT_PATH = '/tmp/atlas-w183-wt/probe'
const ORIGINAL_SHA = 'a'.repeat(40)
// dialog keep/remove 路径 process.chdir(originalCwd) → 须真实存在；文件级一份
const tmpOriginalCwd = mkdtempSync(join(tmpdir(), 'atlas-w183-orig-'))
let savedCwd: string
const onDoneCalls: string[] = []

afterAll(() => {
  rmSync(tmpOriginalCwd, { recursive: true, force: true })
})

function makeSession(over: Partial<WorktreeSession> = {}): WorktreeSession {
  return {
    originalCwd: tmpOriginalCwd,
    worktreePath: WT_PATH,
    worktreeName: 'probe',
    sessionId: 's-test',
    ...over,
  }
}

/** hook session：WorktreeCreate hook 面，无 originalHeadCommit（工单红场景）。 */
function hookSession(): WorktreeSession {
  return makeSession({ hookBased: true })
}

/** git session：带可信基线。 */
function gitSession(): WorktreeSession {
  return makeSession({
    worktreeBranch: 'feature',
    originalHeadCommit: ORIGINAL_SHA,
  })
}

function makeFakeStdin(): PassThrough & {
  isTTY: boolean
  setRawMode: () => void
  ref: () => void
  unref: () => void
} {
  const stdin = new PassThrough() as PassThrough & {
    isTTY: boolean
    setRawMode: () => void
    ref: () => void
    unref: () => void
  }
  // ink useInput 订阅 stdin data 事件；isRawModeSupported 看 isTTY + setRawMode
  stdin.isTTY = true
  stdin.setRawMode = () => {}
  stdin.ref = () => {}
  stdin.unref = () => {}
  return stdin
}

/** 渲染 dialog 至捕获流；waitFor 命中或超时后 unmount 返全部帧。 */
async function renderDialog(opts: {
  session: WorktreeSession
  keys?: string[]
  waitMs?: number
}): Promise<string> {
  const chunks: string[] = []
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk))
      cb()
    },
  })
  const stdin = makeFakeStdin()
  restoreWorktreeSession(opts.session)
  const dialogTree = React.createElement(WorktreeExitDialog, {
    onDone: (result?: string) => {
      onDoneCalls.push(result ?? '')
    },
    onCancel: () => {},
  })
  // 最小 KeybindingProvider：单键 Enter match 由 per-hook useInput 直接触发
  // （handler 取自 hook 局部 handlers，不经 invokeAction/registry 门控），
  // 故 activeContexts 空 Set 即可、ChordInterceptor 不需要。
  const tree = React.createElement(
    KeybindingProvider,
    {
      bindings: defaultParsedBindings,
      pendingChordRef: { current: null },
      pendingChord: null,
      setPendingChord: () => {},
      activeContexts: new Set(),
      registerActiveContext: () => {},
      unregisterActiveContext: () => {},
      handlerRegistryRef: { current: new Map() },
    },
    dialogTree,
  )
  const { render } = await import('../../src/tui/ink.js')
  const instance = await render(tree, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
  })
  // 等首帧 + effect 异步检查链完成
  await new Promise(r => setTimeout(r, opts.waitMs ?? 250))
  for (const key of opts.keys ?? []) {
    stdin.write(key)
    await new Promise(r => setTimeout(r, 120))
  }
  instance.unmount()
  return chunks.join('')
}

/** 轮询至谓词命中或超时（返回最后值让断言报实际状态）。 */
async function pollUntil<T>(
  fn: () => T,
  pred: (v: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  const start = Date.now()
  for (;;) {
    const v = fn()
    if (pred(v)) return v
    if (Date.now() - start > timeoutMs) return v
    await new Promise(r => setTimeout(r, 15))
  }
}

beforeEach(() => {
  statusResult = CLEAN
  revListResult = FAIL
  bareCallLooksClean = false
  gitCalls.length = 0
  cleanupCalls = 0
  keepCalls = 0
  onDoneCalls.length = 0
  restoreWorktreeSession(null)
  savedCwd = process.cwd()
})

afterEach(() => {
  process.chdir(savedCwd)
  restoreWorktreeSession(null)
})

// ── 1. helper 契约：inspectWorktreeChanges（null=unknown 绝非 0/0）──────────
describe('K4-2 inspectWorktreeChanges 契约', () => {
  test('status 非零 → null', async () => {
    statusResult = FAIL
    expect(await (await helper()).inspectWorktreeChanges(WT_PATH, ORIGINAL_SHA)).toBeNull()
  })

  test(
    '无基线（status 成功且干净）→ null 绝非 0/0（hook 包 git 场景）',
    async () => {
      statusResult = CLEAN
      expect(await (await helper()).inspectWorktreeChanges(WT_PATH, undefined)).toBeNull()
    },
  )

  test('rev-list 非零（有基线）→ null', async () => {
    statusResult = CLEAN
    revListResult = FAIL
    expect(await (await helper()).inspectWorktreeChanges(WT_PATH, ORIGINAL_SHA)).toBeNull()
  })

  test('rev-list 非数字输出 → null（不 ||0 折叠）', async () => {
    statusResult = CLEAN
    revListResult = { stdout: 'garbage', code: 0 }
    expect(await (await helper()).inspectWorktreeChanges(WT_PATH, ORIGINAL_SHA)).toBeNull()
  })

  test('exec 抛错 → null（fail-closed 兜底）', async () => {
    statusResult = 'reject'
    expect(await (await helper()).inspectWorktreeChanges(WT_PATH, ORIGINAL_SHA)).toBeNull()
  })

  test('可信基线 + 双检查成功：真 0/0', async () => {
    statusResult = CLEAN
    revListResult = { stdout: '0', code: 0 }
    expect(await (await helper()).inspectWorktreeChanges(WT_PATH, ORIGINAL_SHA)).toEqual({
      changedFiles: 0,
      commits: 0,
    })
  })

  test('dirty + commits：计数 + trim 容忍', async () => {
    statusResult = { stdout: ' M a.ts\n?? b.ts\n', code: 0 }
    revListResult = { stdout: '  2\n', code: 0 }
    expect(await (await helper()).inspectWorktreeChanges(WT_PATH, ORIGINAL_SHA)).toEqual({
      changedFiles: 2,
      commits: 2,
    })
  })

  test(
    '所有 git 调用 `-C <worktreePath>` 绑定（不依赖进程 cwd）',
    async () => {
      statusResult = CLEAN
      revListResult = { stdout: '0', code: 0 }
      await (await helper()).inspectWorktreeChanges(WT_PATH, ORIGINAL_SHA)
      expect(gitCalls.length).toBeGreaterThanOrEqual(2)
      for (const call of gitCalls) {
        expect(call.args[0]).toBe('-C')
        expect(call.args[1]).toBe(WT_PATH)
      }
    },
  )
})

// ── 2. dialog 渲染面：fail-closed（行为红主面）──────────────────────────────
describe('K4-2 WorktreeExitDialog fail-closed 渲染面', () => {
  test(
    'RED 主案：hook session 无基线 + Git 干净（含本地 commit 语境）→ remove 调用 0、进询问、无自动删除文案',
    async () => {
      // 修前形态佐证：rev-list 拼出 undefined..HEAD 必败 → parseInt('')||0 → 静默 remove
      const frame = await renderDialog({ session: hookSession() })
      expect(cleanupCalls).toBe(0)
      expect(frame).toContain('Exiting worktree session')
      expect(frame).toContain('Keep worktree')
      expect(frame).not.toContain('Worktree removed')
      expect(frame).not.toContain('no changes')
      expect(onDoneCalls.length).toBe(0)
    },
  )

  test('status 非零（有基线）→ unknown：不静默清理，进询问', async () => {
    statusResult = FAIL
    const frame = await renderDialog({ session: gitSession() })
    expect(cleanupCalls).toBe(0)
    expect(frame).toContain('Keep worktree')
    expect(frame).not.toContain('Worktree removed')
    expect(onDoneCalls.length).toBe(0)
  })

  test('rev-list 非零（有基线 + 树干净）→ unknown：不静默清理', async () => {
    statusResult = CLEAN
    revListResult = FAIL
    const frame = await renderDialog({ session: gitSession() })
    expect(cleanupCalls).toBe(0)
    expect(frame).toContain('Keep worktree')
    expect(frame).not.toContain('Worktree removed')
  })

  test('rev-list 非数字输出 → unknown：不静默清理', async () => {
    statusResult = CLEAN
    revListResult = { stdout: 'NaN?', code: 0 }
    const frame = await renderDialog({ session: gitSession() })
    expect(cleanupCalls).toBe(0)
    expect(frame).toContain('Keep worktree')
  })

  test(
    'cwd 绑定：进程 cwd 视角假干净、worktreePath 视角 dirty → 进询问且报 uncommitted',
    async () => {
      // 修前 dialog 不带 -C（吃进程 cwd 假干净 → 静默 remove）；修后 -C 绑定真状态
      bareCallLooksClean = true
      statusResult = { stdout: ' M real.ts\n', code: 0 }
      revListResult = { stdout: '0', code: 0 }
      const frame = await renderDialog({ session: gitSession() })
      expect(cleanupCalls).toBe(0)
      expect(frame).toContain('uncommitted')
      expect(frame).not.toContain('Worktree removed')
    },
  )

  test('守卫：可信基线 + checks 成功的 0/0 → 原 clean 自动清理语义保留', async () => {
    statusResult = CLEAN
    revListResult = { stdout: '0', code: 0 }
    await renderDialog({ session: gitSession() })
    await pollUntil(() => cleanupCalls, v => v === 1, 1000)
    expect(cleanupCalls).toBe(1)
    expect(onDoneCalls).toContain('Worktree removed (no changes)')
  })

  test('守卫：dirty（有基线）→ 保持询问，remove 调用 0', async () => {
    statusResult = { stdout: ' M a.ts\n', code: 0 }
    revListResult = { stdout: '0', code: 0 }
    const frame = await renderDialog({ session: gitSession() })
    expect(cleanupCalls).toBe(0)
    expect(frame).toContain('uncommitted')
  })

  test('守卫：commits>0（有基线）→ 保持询问，remove 调用 0', async () => {
    statusResult = CLEAN
    revListResult = { stdout: '3', code: 0 }
    const frame = await renderDialog({ session: gitSession() })
    expect(cleanupCalls).toBe(0)
    expect(frame).toContain('You have 3 commits')
  })

  test('默认 keep 行为锁：unknown 询问态推 Enter → keep 路径，remove hook 调用 0', async () => {
    // hook session 无基线 → 修后进询问、Select 默认聚焦 keep；Enter = handleSelect('keep')
    await renderDialog({ session: hookSession(), keys: ['\r'] })
    await pollUntil(() => keepCalls, v => v === 1, 1000)
    expect(keepCalls).toBe(1)
    expect(cleanupCalls).toBe(0)
  })
})
