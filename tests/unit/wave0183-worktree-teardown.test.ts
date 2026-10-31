/**
 * wave0183 K4-8（0.1.83 V3-4）— sparse/checkout 失败 tearDown 分支判别
 * （f4 工单 §1.C：三失败注入之 sparse/checkout 两支，上游 299）
 *
 * 真盘不可注入（wave0183-worktree-lifecycle.test.ts 头注登记）：sparse-
 * checkout 写的是 add 流程自建的 per-worktree gitdir info（无法预 chmod）；
 * checkout 工作树只写失败 git 2.53 真盘 exit=0 记 D 软状态（探针 §6）。
 * → 本文件经 mock 注入两分支的失败语义，锁定既有 tearDown 契约：
 *   - sparse-checkout set 失败 → `worktree remove --force <path>` + throw
 *     （不留「注册空树」给下次 fast-resume 假恢复）；
 *   - checkout 失败 → 同 tearDown；
 *   - 全成功 → 不 remove；
 *   - 未配 sparsePaths → add 不带 --no-checkout、零 sparse/checkout 命令；
 *   - 失败后重试（注入复位）能创建（失败不留死状态）。
 *
 * 接缝：mock.module 覆写 src/engine/worktree/git.js 的 execFileNoThrowWithCwd
 * （命令分派 + 调用记录），其余导出真体 spread（mock-module-export-surface
 * 标准对策）。fixture = 合成 `.git` 目录（无 git 二进制——getDefaultBranch/
 * resolveRef 全 fs-only）；settings 经 ATLAS_CONFIG_DIR 注入 user 级
 * sparsePaths（engine 级联排除 projectSettings，S-3a 裁定，同 lifecycle
 * 测试）。本文件全部判别为既有满足锁定（工单：不硬造清理逻辑）。
 *
 * K4-5 后置核验适配（0.1.83）：getOrCreateWorktree 建后恒等核验经真
 * readWorktreeHeadSha 读回新 worktree HEAD —— mock `worktree add` 须写 fs
 * 注册形状（<wt>/.git 指针 + gitdir 三件 + 分支 ref，同 start-context 测试），
 * mock `worktree remove` 须真删该形状（faithful：真 remove 清 worktree 目录
 * + admin 条目；否则 retry 测试的第二次调用会假命中 fast-resume 而非真重建，
 * 「失败不留死状态」判别失真）。rev-parse mock arg-agnostic 恒 FAKE_SHA，
 * 兼容 `--verify HEAD^{commit}` / `--verify <sha>^{commit}` 新形态。
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'

const GIT_PATH = '../../src/engine/worktree/git.js'
const SETTINGS_CACHE_PATH = '../../src/engine/config/settingsCache.js'
const WORKTREE_PATH = '../../src/engine/worktree/worktree.js'

const FAKE_SHA = 'a'.repeat(40)

type ExecOutcome = { code: number; stdout?: string; stderr?: string }
/** 按 git 子命令注入；sparse/checkout 可变，其余固定。 */
let sparseOutcome: ExecOutcome = { code: 0 }
let checkoutOutcome: ExecOutcome = { code: 0 }
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
  if (args.includes('sparse-checkout')) return out(sparseOutcome)
  if (args.includes('checkout')) return out(checkoutOutcome)
  if (args.includes('worktree') && args.includes('add')) {
    // fs 注册形状模拟（K4-5 恒等核验经真 readWorktreeHeadSha 读回）：
    // <wt>/.git 指针 + gitdir 三件 + 分支 ref，HEAD 取 add 末参 SHA。
    const bi = args.indexOf('-B')
    const branch = args[bi + 1] ?? ''
    const wtPath = args[bi + 2] ?? ''
    const base = args[bi + 3] ?? ''
    const m = /^([0-9a-f]{40})\^\{commit\}$/.exec(base)
    const head = m ? m[1]! : FAKE_SHA
    const repoRoot = opts?.cwd ?? process.cwd()
    const gitdir = join(repoRoot, '.git', 'worktrees', basename(wtPath))
    mkdirSync(wtPath, { recursive: true })
    writeFileSync(join(wtPath, '.git'), `gitdir: ${gitdir}\n`)
    mkdirSync(gitdir, { recursive: true })
    writeFileSync(join(gitdir, 'HEAD'), `ref: refs/heads/${branch}\n`)
    writeFileSync(join(gitdir, 'gitdir'), `${join(wtPath, '.git')}\n`)
    writeFileSync(join(gitdir, 'commondir'), '../..\n')
    mkdirSync(join(repoRoot, '.git', 'refs', 'heads'), { recursive: true })
    writeFileSync(join(repoRoot, '.git', 'refs', 'heads', branch), `${head}\n`)
    return out({ code: 0 })
  }
  if (args.includes('worktree') && args.includes('remove')) {
    // faithful 清理：真 `worktree remove --force` 删 worktree 目录 + admin
    // 条目（retry 判别须走真重建而非残留形状上的假 fast-resume）
    const wtPath = args[args.length - 1] ?? ''
    const repoRoot = opts?.cwd ?? process.cwd()
    rmSync(wtPath, { recursive: true, force: true })
    rmSync(join(repoRoot, '.git', 'worktrees', basename(wtPath)), {
      recursive: true,
      force: true,
    })
    return out({ code: 0 })
  }
  if (args.includes('fetch')) return out({ code: 128, stderr: 'no remote' })
  if (args.includes('rev-parse')) return out({ code: 0, stdout: FAKE_SHA })
  return out({ code: 0 })
}
mock.module(GIT_PATH, () => gitMock)

// ── 受测体 + 缓存复位（mock.module 之后导入）──────────────────────────────
const { createAgentWorktree } = await import(WORKTREE_PATH)
const { resetSettingsCache } = await import(SETTINGS_CACHE_PATH)
const { resetWorktreeGitCaches } = gitMock as unknown as {
  resetWorktreeGitCaches: () => void
}

// ── fixture：合成 .git（无 git 二进制）+ user 级 settings 注入 ─────────────
/**
 * 独立合成 repo + 进程 chdir + settings/cache 复位；finally 恢复清理。
 * sparsePaths 缺省 = 注入不含 worktree 键的空 settings（与真机用户
 * ~/.atlas/settings.json 隔离，ATLAS_CONFIG_DIR 恒指 fixture）。
 */
async function withSyntheticRepo(
  fn: (repo: string) => Promise<void>,
  opts: { sparsePaths?: string[] } = {},
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'atlas-w183-td-'))
  const origCwd = process.cwd()
  const origConfigDir = process.env.ATLAS_CONFIG_DIR
  try {
    const repo = join(root, 'repo')
    mkdirSync(join(repo, '.git'), { recursive: true })
    writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    const configDir = join(root, 'config')
    mkdirSync(configDir)
    writeFileSync(
      join(configDir, 'settings.json'),
      opts.sparsePaths
        ? JSON.stringify({ worktree: { sparsePaths: opts.sparsePaths } })
        : '{}',
    )
    process.env.ATLAS_CONFIG_DIR = configDir
    process.chdir(repo)
    resetSettingsCache()
    resetWorktreeGitCaches()
    await fn(repo)
  } finally {
    process.chdir(origCwd)
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

beforeEach(() => {
  sparseOutcome = { code: 0 }
  checkoutOutcome = { code: 0 }
  execCalls.length = 0
})

// ── 失败分支：tearDown 生效（throw + worktree remove --force）─────────────
describe('K4-8 sparse/checkout 失败 tearDown（既有满足判别）', () => {
  test('sparse-checkout set 失败 → throw + `worktree remove --force <path>`（不留注册空树假 resume）', async () => {
    await withSyntheticRepo(
      async repo => {
        sparseOutcome = { code: 1, stderr: 'injected sparse failure' }
        await expect(createAgentWorktree('sp')).rejects.toThrow(
          /Failed to configure sparse-checkout/,
        )
        expect(addCall()?.args).toContain('--no-checkout')
        expect(removeCalls().length).toBe(1)
        expect(removeCalls()[0]!.args).toContain('--force')
        // remove 目标 = 本 worktree 绝对路径（不留注册空树）
        expect(removeCalls()[0]!.args).toContain(
          join(repo, '.atlas', 'worktrees', 'sp'),
        )
      },
      { sparsePaths: ['src'] },
    )
  })

  test('checkout 失败 → 同 tearDown：throw + remove --force', async () => {
    await withSyntheticRepo(
      async () => {
        checkoutOutcome = { code: 1, stderr: 'injected checkout failure' }
        await expect(createAgentWorktree('sp')).rejects.toThrow(
          /Failed to checkout sparse worktree/,
        )
        expect(execCalls.find(c => c.args.includes('sparse-checkout'))).toBeTruthy()
        expect(removeCalls().length).toBe(1)
        expect(removeCalls()[0]!.args).toContain('--force')
      },
      { sparsePaths: ['src'] },
    )
  })

  test('失败后重试（注入复位）能创建 —— 失败不留死状态', async () => {
    await withSyntheticRepo(
      async () => {
        sparseOutcome = { code: 1, stderr: 'injected sparse failure' }
        await expect(createAgentWorktree('sp')).rejects.toThrow(/sparse/i)
        sparseOutcome = { code: 0 }
        const r = await createAgentWorktree('sp')
        expect(r.headCommit).toBe(FAKE_SHA)
      },
      { sparsePaths: ['src'] },
    )
  })
})

// ── 守卫：成功路径与未配面（识别不得误伤）─────────────────────────────────
describe('K4-8 成功路径守卫', () => {
  test('sparse+checkout 全成功 → resolve 且零 remove（正常创建不误拆）', async () => {
    await withSyntheticRepo(
      async () => {
        const r = await createAgentWorktree('sp')
        expect(r.headCommit).toBe(FAKE_SHA)
        expect(addCall()?.args).toContain('--no-checkout')
        expect(execCalls.find(c => c.args.includes('sparse-checkout'))).toBeTruthy()
        expect(removeCalls()).toEqual([])
      },
      { sparsePaths: ['src'] },
    )
  })

  test('未配 sparsePaths → add 不带 --no-checkout、零 sparse/checkout 命令、resolve', async () => {
    await withSyntheticRepo(async () => {
      const r = await createAgentWorktree('probe')
      expect(r.headCommit).toBe(FAKE_SHA)
      expect(addCall()?.args).not.toContain('--no-checkout')
      expect(execCalls.find(c => c.args.includes('sparse-checkout'))).toBeUndefined()
      expect(execCalls.find(c => c.args.includes('checkout'))).toBeUndefined()
      expect(removeCalls()).toEqual([])
    })
  })
})
