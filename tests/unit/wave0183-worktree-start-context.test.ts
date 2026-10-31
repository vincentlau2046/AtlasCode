/**
 * wave0183 K4-5 + K4-6（0.1.83 V3-4）— worktree 起点上下文与建后恒等核验
 * unit 面（f4 工单 §D；上游 300）。真盘判别（真 git DWIM/类 SHA 双碰撞 +
 * bare canonical HEAD=A / linked HEAD=B）= tests/func/wave0183-worktree-base
 * .test.ts；本文件 = mock 注入面（func 真盘不可注入的接缝）：
 *   - K4-6 sourceCheckout 消费面：透传（显式 sourceCheckout.headCommit 成
 *     基点：verify 先行 + add 末参 `<sha>^{commit}`）/ 验证失败非静默
 *     （对象不在仓 → throw，零 add，不静默回落 canonical HEAD）/ 惰性捕获
 *     （无 options 时 getOrCreateWorktree 自捕获调用 checkout HEAD——
 *     engine 体 cwd 源 = process.cwd()，S-D2a 登记 c）。
 *   - K4-5 建后恒等核验：add 后读新 worktree 实际 HEAD ≠ 选定 baseSha →
 *     `worktree remove --force` + throw（不留错基 worktree 给 fast-resume
 *     假恢复；bounded 同 K4-8 tearDown 模式）。
 *   - chdir 前捕获顺序：engine EnterWorktreeTool 真体驱动（linked 内
 *     call()）→ 捕获先于 chdir canonical —— add 末参 = 调用 checkout 的
 *     HEAD（B），非 canonical HEAD（A）。
 *
 * 接缝：mock.module 覆写 src/engine/worktree/git.js 的 execFileNoThrowWithCwd
 * （命令分派 + 调用记录 + `worktree add` 的 fs 注册形状模拟——恒等核验用真
 * readWorktreeHeadSha 读回 mock 写出的形状），其余导出真体 spread
 * （mock-module-export-surface 标准对策，同 wave0183-worktree-teardown）。
 * rev-parse 按 rev 目标分派（fixture 语义：'HEAD'/'HEAD^{commit}' = A =
 * canonical 主 checkout HEAD；`${B}^{commit}` = B），未知目标 code 1 ——
 * 错误实现（捕获错源 / 静默回落）在 mock 下也判红，不靠 echo 放行。
 *
 * fixture：合成 repo（.git 目录：HEAD→main=A，refs/heads/feature=B）+
 * linked worktree 形状（.git 指针 + gitdir 三件 HEAD/gitdir 回指/commondir）；
 * 无 git 二进制（getDefaultBranch/resolveRef/readGitHead 全 fs-only）；settings
 * 经 ATLAS_CONFIG_DIR 注入 user 级空配置（engine 级联排除 projectSettings，
 * S-3a 裁定，同 teardown 测试）。TUI 双体逐字同构 = func 面覆盖，本文件
 * engine 面（TUI 面差异仅惰性捕获 cwd 源 getCwd()，func twin 已判别）。
 *
 * Git 2.56 专项证据缺口（工单 §1.C 硬项）：本文件零真 git 子进程（mock 面），
 * 不产生 2.53/2.56 行为证据；真盘缺口声明见 func 文件头注。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { realpathSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'

const GIT_PATH = '../../src/engine/worktree/git.js'
const SETTINGS_CACHE_PATH = '../../src/engine/config/settingsCache.js'
const WORKTREE_PATH = '../../src/engine/worktree/worktree.js'

// fixture 语义 SHA：A = canonical 主 checkout HEAD（main）；B = linked
// checkout HEAD（feature）；C = mismatch 注入；DEAD = 仓内不存在的对象。
const A_SHA = 'a'.repeat(40)
const B_SHA = 'b'.repeat(40)
const C_SHA = 'c'.repeat(40)
const DEAD_SHA = 'd'.repeat(40)
/** pre-fix 形态（add 末参 = ref 名 'HEAD' 非 SHA）下 mock 写形状用的占位。 */
const SHAPE_FALLBACK = 'e'.repeat(40)

type ExecOutcome = { code: number; stdout?: string; stderr?: string }
/** rev-parse 按 rev 目标（末参）分派；未登记目标 = code 1（未知 revision）。 */
let revParseOutcomes: Map<string, ExecOutcome>
/** worktree add 写形状时的 HEAD 注入（mismatch 判别）；null = 用 add 末参 SHA。 */
let addInjectHead: string | null = null
const execCalls: Array<{ args: string[] }> = []

const realGit = await import(GIT_PATH)
const gitMock: Record<string, unknown> = { ...realGit }
gitMock.execFileNoThrowWithCwd = async (
  _file: string,
  args: string[],
  opts?: { cwd?: string },
): Promise<{ stdout: string; stderr: string; code: number }> => {
  execCalls.push({ args: [...args] })
  const out = (o: ExecOutcome) => ({
    stdout: o.stdout ?? '',
    stderr: o.stderr ?? '',
    code: o.code,
  })
  if (args.includes('worktree') && args.includes('add')) {
    // fs 注册形状模拟（faithful：真 `worktree add` 写出 <wt>/.git 指针 +
    // gitdir 三件 + 分支 ref——恒等核验经真 readWorktreeHeadSha 读回）。
    const bi = args.indexOf('-B')
    const branch = args[bi + 1] ?? ''
    const wtPath = args[bi + 2] ?? ''
    const base = args[bi + 3] ?? ''
    const m = /^([0-9a-f]{40})\^\{commit\}$/.exec(base)
    const head = addInjectHead ?? (m ? m[1]! : SHAPE_FALLBACK)
    const repoRoot = opts?.cwd ?? process.cwd()
    const gitdir = join(repoRoot, '.git', 'worktrees', basename(wtPath))
    mkdirSync(wtPath, { recursive: true })
    writeFileSync(join(wtPath, '.git'), `gitdir: ${gitdir}\n`)
    mkdirSync(gitdir, { recursive: true })
    writeFileSync(join(gitdir, 'HEAD'), `ref: refs/heads/${branch}\n`)
    writeFileSync(join(gitdir, 'gitdir'), `${join(wtPath, '.git')}\n`)
    writeFileSync(join(gitdir, 'commondir'), '../..\n')
    writeFileSync(join(repoRoot, '.git', 'refs', 'heads', branch), `${head}\n`)
    return out({ code: 0 })
  }
  if (args.includes('worktree') && args.includes('remove')) {
    return out({ code: 0 })
  }
  if (args.includes('fetch')) return out({ code: 128, stderr: 'no remote' })
  if (args.includes('rev-parse')) {
    const target = args[args.length - 1] ?? ''
    return out(
      revParseOutcomes.get(target) ?? {
        code: 1,
        stderr: `unknown revision: ${target}`,
      },
    )
  }
  return out({ code: 0 })
}
mock.module(GIT_PATH, () => gitMock)

// ── 受测体（mock.module 之后动态导入）──────────────────────────────────────
const { createAgentWorktree, createWorktreeForSession, getCurrentWorktreeSession, restoreWorktreeSession } =
  await import(WORKTREE_PATH)
const { EnterWorktreeTool } = await import('../../src/engine/tools')
const { getCwdState, getOriginalCwd, setCwdState } =
  await import('../../src/bootstrap')
// EnterWorktreeTool 真体经 executor setCwd 落 bootstrap cwdState —— 未注入
// BootstrapStatePort 时 fail-fast（同 worktree-ad21-path.test.ts 先例）
const { resetBootstrapStatePort, setBootstrapStatePort } = await import(
  '../../src/executor'
)
const { resetSettingsCache } = await import(SETTINGS_CACHE_PATH)
const { resetWorktreeGitCaches } = gitMock as unknown as {
  resetWorktreeGitCaches: () => void
}

beforeAll(() => {
  setBootstrapStatePort({
    getCwd: () => getCwdState(),
    getOriginalCwd: () => getOriginalCwd(),
    setCwdState: (p: string) => setCwdState(p),
  })
})
afterAll(() => {
  resetBootstrapStatePort()
})

// ── fixture：合成 repo + linked worktree 形状（无 git 二进制）──────────────
/**
 * 独立合成 repo + 进程 chdir + settings/cache 复位；finally 恢复清理。
 * start='repo'（canonical，复刻 chdir-first 调用方 chdir 后状态）或
 * 'linked'（调用 checkout，惰性捕获/真体工具驱动用）。
 */
async function withSyntheticRepo(
  fn: (repo: string, linked: string) => Promise<void>,
  opts: { start?: 'repo' | 'linked' } = {},
): Promise<void> {
  // realpath 化：tmpdir 在部分平台是 symlink，工具链全路径比较须同一物理路径
  //（worktree-ad21-path.test.ts 同例）
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-w183-ctx-')))
  const origCwd = process.cwd()
  const origCwdState = getCwdState()
  const origConfigDir = process.env.ATLAS_CONFIG_DIR
  try {
    const repo = join(root, 'repo')
    const linked = join(root, 'linked')
    mkdirSync(join(repo, '.git', 'refs', 'heads'), { recursive: true })
    mkdirSync(join(repo, '.git', 'worktrees'), { recursive: true })
    writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(repo, '.git', 'refs', 'heads', 'main'), `${A_SHA}\n`)
    writeFileSync(
      join(repo, '.git', 'refs', 'heads', 'feature'),
      `${B_SHA}\n`,
    )
    // linked worktree 注册形状（.git 指针 + gitdir 三件——commondir 使
    // findCanonicalGitRoot/resolveRef 穿透到 repo，同真 git worktree）
    const lkGitdir = join(repo, '.git', 'worktrees', 'lk')
    mkdirSync(lkGitdir, { recursive: true })
    mkdirSync(linked, { recursive: true })
    writeFileSync(join(linked, '.git'), `gitdir: ${lkGitdir}\n`)
    writeFileSync(join(lkGitdir, 'HEAD'), 'ref: refs/heads/feature\n')
    writeFileSync(join(lkGitdir, 'gitdir'), `${join(linked, '.git')}\n`)
    writeFileSync(join(lkGitdir, 'commondir'), '../..\n')
    const configDir = join(root, 'config')
    mkdirSync(configDir)
    writeFileSync(join(configDir, 'settings.json'), '{}')
    process.env.ATLAS_CONFIG_DIR = configDir
    process.chdir(opts.start === 'repo' ? repo : linked)
    resetSettingsCache()
    resetWorktreeGitCaches()
    await fn(repo, linked)
  } finally {
    process.chdir(origCwd)
    setCwdState(origCwdState)
    if (origConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = origConfigDir
    resetSettingsCache()
    rmSync(root, { recursive: true, force: true })
  }
}

function addCall(): { args: string[] } | undefined {
  return execCalls.find(
    c => c.args.includes('worktree') && c.args.includes('add'),
  )
}
function removeCalls(): Array<{ args: string[] }> {
  return execCalls.filter(
    c => c.args.includes('worktree') && c.args.includes('remove'),
  )
}
function verifyCallFor(target: string): { args: string[] } | undefined {
  return execCalls.find(
    c =>
      c.args.includes('rev-parse') &&
      c.args.includes('--verify') &&
      c.args.includes(target),
  )
}

beforeEach(() => {
  execCalls.length = 0
  addInjectHead = null
  revParseOutcomes = new Map<string, ExecOutcome>([
    // fixture 语义：canonical repo 的 HEAD（main）= A
    ['HEAD', { code: 0, stdout: A_SHA }],
    ['HEAD^{commit}', { code: 0, stdout: A_SHA }],
  ])
  restoreWorktreeSession(null)
})

// ── K4-6：sourceCheckout 消费面（修前红：option 不存在/被忽略）────────────
describe('K4-6 sourceCheckout 消费面', () => {
  test('透传：显式 sourceCheckout.headCommit 成基点 —— verify 先行 + add 末参 = `<B>^{commit}`', async () => {
    await withSyntheticRepo(
      async (repo, linked) => {
        revParseOutcomes.set(`${B_SHA}^{commit}`, {
          code: 0,
          stdout: B_SHA,
        })
        const s = await createWorktreeForSession(
          'sess-ctx',
          'xsrc',
          undefined,
          { sourceCheckout: { cwd: linked, headCommit: B_SHA } },
        )
        expect(s.originalHeadCommit).toBe(B_SHA)
        // add 末参 = 钉死的 commit object（`${sha}^{commit}`），非 ref 名
        expect(addCall()?.args.at(-1)).toBe(`${B_SHA}^{commit}`)
        expect(addCall()?.args).toContain('-B')
        expect(addCall()?.args).toContain('worktree-xsrc')
        // verify 先于 add（子命令序：execCalls 中 verify 的下标更小）
        const verifyIdx = execCalls.findIndex(
          c => c.args.includes('rev-parse') && c.args.includes('--verify'),
        )
        const addIdx = execCalls.findIndex(
          c => c.args.includes('worktree') && c.args.includes('add'),
        )
        expect(verifyIdx).toBeGreaterThanOrEqual(0)
        expect(verifyIdx).toBeLessThan(addIdx)
        expect(verifyCallFor(`${B_SHA}^{commit}`)).toBeTruthy()
      },
      { start: 'repo' },
    )
  })

  test('验证失败非静默：headCommit 不在仓内 → throw，零 add 零 remove（不回落 canonical HEAD）', async () => {
    await withSyntheticRepo(
      async (_repo, linked) => {
        // `${DEAD}^{commit}` 未登记 → rev-parse code 1（对象不存在）
        await expect(
          createWorktreeForSession('sess-dead', 'xdead', undefined, {
            sourceCheckout: { cwd: linked, headCommit: DEAD_SHA },
          }),
        ).rejects.toThrow(/source checkout/i)
        expect(addCall()).toBeUndefined()
        expect(removeCalls()).toEqual([])
      },
      { start: 'repo' },
    )
  })

  test('惰性捕获：无 options（createAgentWorktree）从 linked 起 → 捕获 linked HEAD（B）为基点', async () => {
    await withSyntheticRepo(async () => {
      revParseOutcomes.set(`${B_SHA}^{commit}`, { code: 0, stdout: B_SHA })
      const r = await createAgentWorktree('lazy')
      expect(r.headCommit).toBe(B_SHA)
      expect(addCall()?.args.at(-1)).toBe(`${B_SHA}^{commit}`)
    })
  })
})

// ── K4-5：建后恒等核验（修前红：无核验，mismatch 静默成功）─────────────────
describe('K4-5 建后恒等核验', () => {
  test('add 后实际 HEAD ≠ 选定 baseSha → remove --force + throw（不留错基 worktree）', async () => {
    await withSyntheticRepo(async (repo) => {
      revParseOutcomes.set(`${B_SHA}^{commit}`, { code: 0, stdout: B_SHA })
      addInjectHead = C_SHA // add 成功但建在 C（注入背离）
      await expect(createAgentWorktree('mm')).rejects.toThrow(/divergence/i)
      // 有界回收：本 worktree 路径 + --force，非全局 prune
      expect(removeCalls().length).toBe(1)
      expect(removeCalls()[0]!.args).toContain('--force')
      expect(removeCalls()[0]!.args).toContain(
        join(repo, '.atlas', 'worktrees', 'mm'),
      )
    })
  })

  test('恒等通过（正常路径）→ 零 remove（核验不误伤）', async () => {
    await withSyntheticRepo(async () => {
      revParseOutcomes.set(`${B_SHA}^{commit}`, { code: 0, stdout: B_SHA })
      const r = await createAgentWorktree('ok')
      expect(r.headCommit).toBe(B_SHA)
      expect(removeCalls()).toEqual([])
    })
  })
})

// ── chdir 前捕获顺序：engine EnterWorktreeTool 真体驱动 ────────────────────
describe('chdir 前捕获顺序（EnterWorktreeTool 真体）', () => {
  test('linked 内 call() → 捕获先于 chdir：add 末参 = `${B}^{commit}`，session 基点 = B 非 canonical A', async () => {
    await withSyntheticRepo(async (repo, linked) => {
      revParseOutcomes.set(`${B_SHA}^{commit}`, { code: 0, stdout: B_SHA })
      // 错误实现（捕获挪到 chdir 后）会读 canonical HEAD=A 并 verify 通过
      // ——本行保证该错误实现也判红（基点 A ≠ 断言 B）
      revParseOutcomes.set(`${A_SHA}^{commit}`, { code: 0, stdout: A_SHA })
      setCwdState(linked)
      const out = await EnterWorktreeTool.call({ name: 'order' })
      expect(out.data.worktreePath).toBe(
        join(repo, '.atlas', 'worktrees', 'order'),
      )
      // 捕获序判别：基点 = 调用 checkout HEAD（B），非 canonical HEAD（A）
      expect(addCall()?.args.at(-1)).toBe(`${B_SHA}^{commit}`)
      expect(getCurrentWorktreeSession()?.originalHeadCommit).toBe(B_SHA)
    })
  })
})
