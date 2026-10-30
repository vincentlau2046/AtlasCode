/**
 * wave0183 K4-3（0.1.83 V3-4）— /diff transient 检测故障注入判别
 * （f4 工单 §1.C：失败/超时注入面，上游 300）
 *
 * func 面（wave0183-diff-transient.test.ts）已锁真盘双 storage 识别；本文件
 * 用 mock 注入锁检查通道的失败语义：
 *   - rev-parse exit 0 = 伪 ref 在场（storage-aware 通道，reftable 无文件
 *     形态的正体）；exit 1 = 合法不存在；其余（128/124/抛错）= unknown。
 *   - 「一检查失败/超时、另一检查证实冲突」→ 仍识别冲突（OR 聚合，单通道
 *     失败不得掩盖另一通道的证实）。
 *   - 全 unknown 不伪装「无冲突」（不默认放行展示）。
 *   - 全合法不存在 → 正常 diff 流放行（识别不得误拦）。
 *
 * 接缝：mock.module 覆写 git.js（getIsGit→true / getGitDir→不存在路径，
 * files 通道 access 自然 miss）+ cwd.js（getCwd→fixture）+ execFileNoThrow
 * （rev-parse 结果按 ref 注入 + diff 命令分派 + 调用捕获）。
 * mock-module-export-surface 标准对策：真实 spread 后仅覆写目标函数。
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'

const GIT_PATH = '../../src/tui/utils/git.js'
const CWD_PATH = '../../src/tui/utils/cwd.js'
const EXEC_PATH = '../../src/tui/utils/execFileNoThrow.js'
const DIFF_PATH = '../../src/tui/utils/gitDiff.js'

const GIT_DIR_FIXTURE = '/tmp/atlas-w183-diff/nonexistent-gitdir'
const CWD_FIXTURE = '/tmp/atlas-w183-diff/repo'

// ── mock：git.js（getIsGit/getGitDir 覆写，其余真体 spread）─────────────────
const realGit = await import(GIT_PATH)
const gitMock: Record<string, unknown> = { ...realGit }
gitMock.getIsGit = async (): Promise<boolean> => true
gitMock.getGitDir = async (): Promise<string | null> => GIT_DIR_FIXTURE
mock.module(GIT_PATH, () => gitMock)

// ── mock：cwd.js（shim 3 导出面覆写）───────────────────────────────────────
const cwdMock: Record<string, unknown> = {
  getCwd: (): string => CWD_FIXTURE,
  pwd: (): string => CWD_FIXTURE,
  runWithCwdOverride: <T>(_path: string, fn: () => T): T => fn(),
}
mock.module(CWD_PATH, () => cwdMock)

// ── mock：execFileNoThrow.js（rev-parse 注入 + diff 分派 + 调用捕获）────────
const realExec = await import(EXEC_PATH)

type RevOutcome = { code: number; stdout?: string } | 'reject'
/** 按 ref 名注入；未列出 = exit 1（合法不存在）。 */
let revOutcomes: Record<string, RevOutcome> = {}
const gitCalls: Array<{ args: string[] }> = []

const DIFF_TEXT = [
  'diff --git a/f.txt b/f.txt',
  'index 111..222 100644',
  '--- a/f.txt',
  '+++ b/f.txt',
  '@@ -1 +1 @@',
  '-a',
  '+b',
  '',
].join('\n')

const execMock: Record<string, unknown> = { ...realExec }
execMock.execFileNoThrow = async (
  _file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> => {
  gitCalls.push({ args: [...args] })
  if (args.includes('rev-parse') && args.includes('--verify')) {
    const ref = args[args.length - 1] as string
    const outcome: RevOutcome = revOutcomes[ref] ?? { code: 1 }
    if (outcome === 'reject') throw new Error('injected exec failure')
    return { stdout: outcome.stdout ?? '', stderr: '', code: outcome.code }
  }
  if (args.includes('--shortstat')) {
    return {
      stdout: ' 1 file changed, 1 insertion(+), 1 deletion(-)',
      stderr: '',
      code: 0,
    }
  }
  if (args.includes('--numstat')) {
    return { stdout: '1\t1\tf.txt\n', stderr: '', code: 0 }
  }
  if (args.includes('ls-files')) {
    return { stdout: '', stderr: '', code: 0 }
  }
  if (args.includes('diff')) {
    return { stdout: DIFF_TEXT, stderr: '', code: 0 }
  }
  return { stdout: '', stderr: '', code: 0 }
}
mock.module(EXEC_PATH, () => execMock)

// ── 受测体（mock.module 之后导入）──────────────────────────────────────────
const { fetchGitDiff, fetchGitDiffHunks } = await import(DIFF_PATH)

function diffCommandCount(): number {
  return gitCalls.filter(c => c.args.includes('diff')).length
}

beforeEach(() => {
  revOutcomes = {}
  gitCalls.length = 0
})

// ── 通道证实即冲突（OR 聚合）────────────────────────────────────────────────
describe('K4-3 rev-parse 通道证实即冲突', () => {
  test('RED：CHERRY_PICK_HEAD rev-parse exit 0（reftable 无文件形态正体）→ 不放行且零 diff 命令', async () => {
    revOutcomes['CHERRY_PICK_HEAD'] = { code: 0, stdout: 'a'.repeat(40) }
    const result = await fetchGitDiff()
    expect(result).toBeNull()
    expect(diffCommandCount()).toBe(0)
  })

  test('RED：一检查超时形态（exit 124）、另一检查证实冲突 → 仍识别冲突', async () => {
    revOutcomes['CHERRY_PICK_HEAD'] = { code: 124 }
    revOutcomes['REVERT_HEAD'] = { code: 0, stdout: 'b'.repeat(40) }
    expect(await fetchGitDiff()).toBeNull()
    expect(diffCommandCount()).toBe(0)
  })

  test('单 ref 证实即冲突（其余全合法缺失）', async () => {
    revOutcomes['MERGE_HEAD'] = { code: 0, stdout: 'c'.repeat(40) }
    expect(await fetchGitDiff()).toBeNull()
    expect(diffCommandCount()).toBe(0)
  })

  test('RED：exec 抛错全通道 + 一通道先证实 → 冲突不被掩盖', async () => {
    revOutcomes['REBASE_HEAD'] = { code: 0, stdout: 'd'.repeat(40) }
    revOutcomes['CHERRY_PICK_HEAD'] = 'reject'
    revOutcomes['REVERT_HEAD'] = 'reject'
    expect(await fetchGitDiff()).toBeNull()
    expect(diffCommandCount()).toBe(0)
  })
})

// ── unknown 语义（合法缺失与执行失败可区分）────────────────────────────────
describe('K4-3 unknown 语义', () => {
  test('RED：全 unknown（exit 128，非 0/1）→ 不伪装无冲突，不放行', async () => {
    for (const ref of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']) {
      revOutcomes[ref] = { code: 128 }
    }
    expect(await fetchGitDiff()).toBeNull()
    expect(diffCommandCount()).toBe(0)
  })

  test('RED：全通道 exec 抛错 → 不伪装无冲突，不放行', async () => {
    for (const ref of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']) {
      revOutcomes[ref] = 'reject'
    }
    expect(await fetchGitDiff()).toBeNull()
    expect(diffCommandCount()).toBe(0)
  })

  test('unknown 混合法缺失（无任何证实）→ 仍不放行', async () => {
    revOutcomes['CHERRY_PICK_HEAD'] = { code: 124 }
    // 其余 ref 未注入 = exit 1（合法缺失）
    expect(await fetchGitDiff()).toBeNull()
    expect(diffCommandCount()).toBe(0)
  })
})

// ── 正常流放行（识别不得误拦）──────────────────────────────────────────────
describe('K4-3 全合法缺失 → 正常 diff 流', () => {
  test('守卫：全 rev-parse exit 1 → fetchGitDiff 非 null 且 diff 命令在场', async () => {
    const result = await fetchGitDiff()
    expect(result).not.toBeNull()
    expect(result!.stats.filesCount).toBe(1)
    expect(result!.perFileStats.has('f.txt')).toBe(true)
    expect(diffCommandCount()).toBeGreaterThan(0)
  })

  test('守卫：fetchGitDiffHunks 全合法缺失 → 有 hunk 输出', async () => {
    const hunks = await fetchGitDiffHunks()
    expect(hunks.size).toBeGreaterThan(0)
    expect(diffCommandCount()).toBeGreaterThan(0)
  })

  test('hunks 面同 gate：transient（rev-parse 证实）→ 空 Map 且零 diff 命令', async () => {
    revOutcomes['CHERRY_PICK_HEAD'] = { code: 0, stdout: 'e'.repeat(40) }
    const hunks = await fetchGitDiffHunks()
    expect(hunks.size).toBe(0)
    expect(diffCommandCount()).toBe(0)
  })

  test('hunks 面同 gate：全 unknown → 空 Map 且零 diff 命令', async () => {
    for (const ref of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']) {
      revOutcomes[ref] = { code: 128 }
    }
    expect((await fetchGitDiffHunks()).size).toBe(0)
    expect(diffCommandCount()).toBe(0)
  })
})
