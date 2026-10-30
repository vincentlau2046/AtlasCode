/**
 * wave0183 K4-1 + K4-8（0.1.83 V3-4）— worktree 生命周期真盘判别
 * （f4 工单 §1.C；K4-1 上游 302 / K4-8 上游 299）
 *
 * 真盘归因（2026-10-31，git 2.53.0，探针 w183-k4-probe.sh，Main lane）：
 *   - 正常生命周期（创建→重开→remove）：files/reftable 双双零残（list 回
 *     基线 / `.git/worktrees/` 空 / prune 空转）→ **既有满足，留判别**
 *     （工单：不硬造清理逻辑）。
 *   - add 中途失败（target 只读注入，.git pointer 写入 EACCES）：git 2.53
 *     自清本次 admin entry 且自删 target、重试 `-B` 自愈 → 既有满足留判别；
 *     预存无关 admin entry 保全 = 有界性守卫（禁全局 prune 的真盘对应面）。
 *   - dangling `.git` target：`worktree add` fatal「已经存在」exit 128、
 *     target 保全 → **现状永久卡死无自愈路径** → K4-1 安全修复支（RED 主案）：
 *     仅 dangling pointer 且目录内无其他内容 → 删指针照常 add；有用户文件 /
 *     指针指向现存目录（外部·伪 commondir）/ symlink / 损坏 / 权限拒绝 →
 *     明确拒绝且保全（不能证明安全就不动，分开测）。
 *   - resolveGitDir 读层（双体）：`.git` 文件 gitdir 目标不存在时现状直接
 *     缓存并返回 nonexistent 路径 → 修后 null（不把错误缓存成有效仓库）。
 *   - checkout 工作树只写失败 exit=0（git 记 D 软状态，探针 §6）→ checkout
 *     失败 tearDown 分支真盘不可注入，判别在 mock 单测
 *     wave0183-worktree-teardown.test.ts（sparse/checkout 双分支）。
 *   - sparse 失败注入真盘同样不可行（sparse-checkout 写的是 add 流程自建的
 *     per-worktree gitdir info，无法预 chmod；settings 注入须走 user 源——
 *     engine 级联刻意排除 projectSettings，S-3a）→ 失败分支判别同在 mock
 *     单测；本文件以 sparse happy path 判别 settings→--no-checkout→set→
 *     checkout 全链（此前零覆盖），经 ATLAS_CONFIG_DIR 注入 user 级
 *     sparsePaths。
 *
 * Git 2.56 专项证据缺口（工单 §1.C 硬项）：本文件全部证据基于本机
 * git 2.53.0，**只算共享根因证据**；2.56+ 特异行为未覆盖、不冒称已证——
 * 判据处置由 e2e 写明（真 2.56+ fixture 或单列机制证明，不靠版本串 mock）。
 *
 * 双体：engine `src/engine/worktree/worktree.ts`（createAgentWorktree 面）
 * 与 TUI `src/tui/utils/worktree.ts`（轻量 createAgentWorktree 面，无
 * session 态）同构逐字；两面的核心 RED/守卫各测，TUI sparse/checkout
 * tearDown 与 engine 逐字同构由 engine 面 + mock 单测覆盖。
 *
 * 门控：git 不可用 → 整族 skip；reftable 不支持 → reftable 子族 skip
 * （环境记录 ≠ 判据通过，工单 §3）。
 */
import { describe, expect, test } from 'bun:test'
import { execFileSync, spawnSync } from 'child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createAgentWorktree,
  removeAgentWorktree,
  resetSettingsCache,
  resetWorktreeGitCaches,
  resolveGitDir as engineResolveGitDir,
} from '../../src/engine'
import {
  clearResolveGitDirCache,
  resolveGitDir as tuiResolveGitDir,
} from '../../src/tui/utils/git/gitFilesystem.js'
import {
  createAgentWorktree as tuiCreateAgentWorktree,
  removeAgentWorktree as tuiRemoveAgentWorktree,
} from '../../src/tui/utils/worktree.js'
import { runWithCwdOverride } from '../../src/tui/utils/cwd.js'

// ── 门控：git 可用性 + reftable 能力探针 ────────────────────────────────────
let gitAvailable = false
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' })
  gitAvailable = true
} catch {
  gitAvailable = false
}
const it = gitAvailable ? test : test.skip

let reftableAvailable = false
try {
  const probe = mkdtempSync(join(tmpdir(), 'atlas-w183-wt-rt-'))
  execFileSync(
    'git',
    ['init', '-q', '--ref-format=reftable', '-b', 'main', join(probe, 'r')],
    { cwd: probe, stdio: 'pipe' },
  )
  reftableAvailable = true
  rmSync(probe, { recursive: true, force: true })
} catch {
  reftableAvailable = false
}
const itRt = gitAvailable && reftableAvailable ? test : test.skip

// ── fixture 助手 ───────────────────────────────────────────────────────────
type RefFormat = 'files' | 'reftable'

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function commitFile(repo: string, name: string, content: string, msg: string): void {
  writeFileSync(join(repo, name), `${content}\n`)
  runGit(repo, ['add', name])
  runGit(repo, ['commit', '-q', '-m', msg])
}

/** 独立 fixture repo + 进程 chdir + settings/cache 复位；finally 恢复清理。 */
async function withRepo(
  refFormat: RefFormat,
  fn: (repo: string) => Promise<void>,
  opts: { userWorktreeSettings?: { sparsePaths?: string[] } } = {},
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'atlas-w183-wt-'))
  const origCwd = process.cwd()
  const origConfigDir = process.env.ATLAS_CONFIG_DIR
  try {
    const repo = join(root, 'repo')
    mkdirSync(repo)
    const initArgs = ['init', '-q', '-b', 'main']
    if (refFormat === 'reftable') initArgs.push('--ref-format=reftable')
    execFileSync('git', [...initArgs, repo], { stdio: 'pipe' })
    runGit(repo, ['config', 'user.email', 't@example.com'])
    runGit(repo, ['config', 'user.name', 't'])
    commitFile(repo, 'f.txt', 'hello', 'c1')
    // user 级 settings 注入（ATLAS_CONFIG_DIR → fixture config 目录）：
    // engine 级联刻意排除 projectSettings（S-3a 裁定），项目内
    // .atlas/settings.json 不进 getInitialSettings —— sparsePaths 必须
    // 经 user 源注入才真正进 getWorktreeSettings() 消费面
    if (opts.userWorktreeSettings) {
      const configDir = join(root, 'config')
      mkdirSync(configDir)
      writeFileSync(
        join(configDir, 'settings.json'),
        JSON.stringify({ worktree: opts.userWorktreeSettings }),
      )
      process.env.ATLAS_CONFIG_DIR = configDir
    }
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

function worktreePaths(repo: string): string[] {
  const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repo,
    encoding: 'utf8',
  })
  return out
    .split('\n')
    .filter(l => l.startsWith('worktree '))
    .map(l => l.slice('worktree '.length))
}

/** `.git/worktrees/` admin entry 名单（目录不存在 = []）。 */
function adminEntries(repo: string): string[] {
  try {
    return readdirSync(join(repo, '.git', 'worktrees'))
  } catch {
    return []
  }
}

function agentTarget(repo: string, slug: string): string {
  return join(repo, '.atlas', 'worktrees', slug)
}

/** 预置 dangling `.git` 残骸形态（上次创建中途失败、gitdir 目标已不存在）。 */
function plantDanglingDotGit(target: string, gitdirTarget: string): void {
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, '.git'), `gitdir: ${gitdirTarget}\n`)
}

// ── K4-1 target 判别（engine 面 createAgentWorktree）───────────────────────
describe('K4-1 target 判别（engine createAgentWorktree）', () => {
  it('RED 主案：target 仅含 dangling .git → 安全修复后创建成功（自愈非卡死）', async () => {
    await withRepo('files', async repo => {
      const target = agentTarget(repo, 'probe')
      plantDanglingDotGit(target, join(repo, 'gone-nonexistent'))
      const r = await createAgentWorktree('probe')
      expect(r.worktreePath).toBe(target)
      // 修复后是真 worktree：.git 为指回本仓 admin entry 的 pointer，HEAD 可解析
      const ptr = readFileSync(join(target, '.git'), 'utf-8').trim()
      expect(ptr.startsWith('gitdir:')).toBe(true)
      expect(ptr).toContain(join('.git', 'worktrees', 'probe'))
      const head = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: target,
        encoding: 'utf8',
      })
      expect(head.status).toBe(0)
      expect(r.headCommit).toBeTruthy()
      expect(await removeAgentWorktree(target, r.worktreeBranch, repo)).toBe(true)
      expect(adminEntries(repo)).toEqual([])
    })
  })

  it('守卫：dangling .git + 用户文件 → 拒绝且双文件保全（修复支不得越界删）', async () => {
    await withRepo('files', async repo => {
      const target = agentTarget(repo, 'probe')
      plantDanglingDotGit(target, join(repo, 'gone'))
      writeFileSync(join(target, 'note.txt'), 'user work\n')
      await expect(createAgentWorktree('probe')).rejects.toThrow()
      expect(readFileSync(join(target, 'note.txt'), 'utf-8')).toBe('user work\n')
      expect(readFileSync(join(target, '.git'), 'utf-8')).toContain('gone')
    })
  })

  it('守卫：.git pointer 指向现存目录（外部形态）→ 拒绝且保全', async () => {
    await withRepo('files', async repo => {
      const target = agentTarget(repo, 'probe')
      // 现存但非有效 gitdir（无 HEAD 可读 → fast-resume miss）→ 修复支 occupied
      const external = join(repo, 'external-existing')
      mkdirSync(external)
      plantDanglingDotGit(target, external)
      await expect(createAgentWorktree('probe')).rejects.toThrow()
      expect(readFileSync(join(target, '.git'), 'utf-8')).toContain('gitdir:')
    })
  })

  it('RED：伪 commondir（.git pointer 指向主仓 .git，HEAD 可读）→ 不得假 fast-resume，拒绝且保全', async () => {
    await withRepo('files', async repo => {
      const target = agentTarget(repo, 'probe')
      // readWorktreeHeadSha 对该形态能读出主仓 HEAD（假命中）；修前被当
      // 「已注册可恢复」静默复用，把非隔离目录当 worktree 返回（隔离破口）：
      // 修后 fast-resume 须过注册判别（admin entry gitdir backlink 指回本路径）
      plantDanglingDotGit(target, join(repo, '.git'))
      await expect(createAgentWorktree('probe')).rejects.toThrow()
      expect(readFileSync(join(target, '.git'), 'utf-8')).toContain('gitdir:')
      // 保全：pointer 原样、主仓 .git 无新增 admin entry
      expect(existsSync(join(repo, '.git', 'worktrees'))).toBe(false)
    })
  })

  it('守卫：损坏 pointer（非 gitdir: 前缀）→ 拒绝且保全', async () => {
    await withRepo('files', async repo => {
      const target = agentTarget(repo, 'probe')
      mkdirSync(target, { recursive: true })
      writeFileSync(join(target, '.git'), 'not a gitdir pointer\n')
      await expect(createAgentWorktree('probe')).rejects.toThrow()
      expect(readFileSync(join(target, '.git'), 'utf-8')).toBe(
        'not a gitdir pointer\n',
      )
    })
  })

  it('守卫：.git 为 symlink → 拒绝且保全（lstat 形态判别，不跟随）', async () => {
    await withRepo('files', async repo => {
      const target = agentTarget(repo, 'probe')
      mkdirSync(target, { recursive: true })
      symlinkSync(join(repo, 'gone-link-target'), join(target, '.git'))
      await expect(createAgentWorktree('probe')).rejects.toThrow()
      expect(lstatSync(join(target, '.git')).isSymbolicLink()).toBe(true)
    })
  })

  it('守卫：权限拒绝 pointer（chmod 000）→ 拒绝且保全', async () => {
    await withRepo('files', async repo => {
      const target = agentTarget(repo, 'probe')
      plantDanglingDotGit(target, join(repo, 'gone'))
      const dotGit = join(target, '.git')
      chmodSync(dotGit, 0o000)
      try {
        await expect(createAgentWorktree('probe')).rejects.toThrow()
        expect(existsSync(dotGit)).toBe(true)
      } finally {
        chmodSync(dotGit, 0o644)
      }
      expect(readFileSync(dotGit, 'utf-8')).toContain('gone')
    })
  })

  it('守卫：已注册可恢复 worktree → fast-resume（同目录，未提交工作保全）', async () => {
    await withRepo('files', async repo => {
      const a = await createAgentWorktree('probe')
      const marker = join(a.worktreePath, 'wip.txt')
      writeFileSync(marker, 'work in progress\n')
      const b = await createAgentWorktree('probe')
      expect(b.worktreePath).toBe(a.worktreePath)
      expect(b.headCommit).toBe(a.headCommit)
      expect(readFileSync(marker, 'utf-8')).toBe('work in progress\n')
      await removeAgentWorktree(a.worktreePath, a.worktreeBranch, repo)
    })
  })
})

// ── K4-1 resolveGitDir 读层（dangling gitdir → null，双体）─────────────────
describe('K4-1 resolveGitDir 读层（双体）', () => {
  it('RED：TUI resolveGitDir 对 dangling gitdir → null（不返回 nonexistent 路径）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-w183-rgd-'))
    try {
      const dir = join(root, 'stale')
      plantDanglingDotGit(dir, join(root, 'gone'))
      clearResolveGitDirCache()
      expect(await tuiResolveGitDir(dir)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('RED：engine resolveGitDir 同 → null', async () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-w183-rgd-'))
    try {
      const dir = join(root, 'stale')
      plantDanglingDotGit(dir, join(root, 'gone'))
      resetWorktreeGitCaches()
      expect(await engineResolveGitDir(dir)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('守卫：有效 worktree pointer 双体仍解析（存在性校验不误拒）', async () => {
    await withRepo('files', async repo => {
      const a = await createAgentWorktree('probe')
      const adminDir = join(repo, '.git', 'worktrees', 'probe')
      clearResolveGitDirCache()
      resetWorktreeGitCaches()
      expect(await tuiResolveGitDir(a.worktreePath)).toBe(adminDir)
      expect(await engineResolveGitDir(a.worktreePath)).toBe(adminDir)
      await removeAgentWorktree(a.worktreePath, a.worktreeBranch, repo)
    })
  })
})

// ── K4-8 生命周期有界（engine 面）─────────────────────────────────────────
describe('K4-8 生命周期有界（engine 面）', () => {
  it('判别：files 创建→重开→remove → list/admin 零残（既有满足）', async () => {
    await withRepo('files', async repo => {
      const baseline = worktreePaths(repo).length
      const a = await createAgentWorktree('life')
      expect(worktreePaths(repo)).toContain(a.worktreePath)
      // 重开 = fast-resume（同目录同 head）
      const b = await createAgentWorktree('life')
      expect(b.worktreePath).toBe(a.worktreePath)
      expect(b.headCommit).toBe(a.headCommit)
      expect(await removeAgentWorktree(a.worktreePath, a.worktreeBranch, repo)).toBe(true)
      expect(worktreePaths(repo).length).toBe(baseline)
      expect(adminEntries(repo)).toEqual([])
    })
  })

  itRt('判别：reftable 创建→重开→remove → 零残（上游 299 语境）', async () => {
    await withRepo('reftable', async repo => {
      const baseline = worktreePaths(repo).length
      const a = await createAgentWorktree('life')
      const b = await createAgentWorktree('life')
      expect(b.worktreePath).toBe(a.worktreePath)
      expect(b.headCommit).toBe(a.headCommit)
      expect(await removeAgentWorktree(a.worktreePath, a.worktreeBranch, repo)).toBe(true)
      expect(worktreePaths(repo).length).toBe(baseline)
      expect(adminEntries(repo)).toEqual([])
    })
  })

  it('判别：add 中途失败（只读 target 注入）→ throw 且 admin 零残 + 预存无关 entry 保全 + 重试能创建', async () => {
    await withRepo('files', async repo => {
      // 预存无关 admin entry（backlink/path 均与本次无关）→ 有界性守卫：
      // 失败处理不得动无关条目（禁全局 prune 的真盘对应面）
      const foreignEntry = join(repo, '.git', 'worktrees', 'foreign-wt')
      mkdirSync(foreignEntry, { recursive: true })
      writeFileSync(join(foreignEntry, 'gitdir'), `${join(repo, 'elsewhere')}\n`)
      writeFileSync(join(foreignEntry, 'HEAD'), 'ref: refs/heads/x\n')

      const target = agentTarget(repo, 'probe')
      mkdirSync(target, { recursive: true })
      chmodSync(target, 0o555)
      try {
        await expect(createAgentWorktree('probe')).rejects.toThrow()
        // git 2.53 自清本次 entry（归因判别）；无关预存 entry 必须保全
        expect(adminEntries(repo)).not.toContain('probe')
      } finally {
        if (existsSync(target)) chmodSync(target, 0o755)
      }
      expect(existsSync(foreignEntry)).toBe(true)
      expect(adminEntries(repo)).toContain('foreign-wt')
      // 重试能创建（-B 自愈）
      const r = await createAgentWorktree('probe')
      expect(r.worktreePath).toBe(target)
      await removeAgentWorktree(r.worktreePath, r.worktreeBranch, repo)
    })
  })

  it('判别：sparse happy path（user 级 sparsePaths 注入）→ --no-checkout+sparse+checkout 全链生效 + 零残', async () => {
    await withRepo(
      'files',
      async repo => {
        mkdirSync(join(repo, 'src'))
        commitFile(repo, 'src/inner.txt', 'inner', 'c2')
        mkdirSync(join(repo, 'docs'))
        commitFile(repo, 'docs/other.txt', 'other', 'c3')
        const r = await createAgentWorktree('sp')
        // sparse 全链生效：src/ 物化（--no-checkout + sparse set + checkout），
        // 非 sparsePaths 的 docs/ 不物化（cone 模式根文件恒含，不以此为断言面）
        expect(existsSync(join(r.worktreePath, 'src', 'inner.txt'))).toBe(true)
        expect(existsSync(join(r.worktreePath, 'docs'))).toBe(false)
        expect(
          await removeAgentWorktree(r.worktreePath, r.worktreeBranch, repo),
        ).toBe(true)
        expect(adminEntries(repo)).toEqual([])
      },
      { userWorktreeSettings: { sparsePaths: ['src'] } },
    )
  })
})

// ── K4-1/K4-8 TUI 面（轻量 createAgentWorktree，无 session 态）──────────────
describe('K4-1/K4-8 TUI 面（tui createAgentWorktree）', () => {
  it('RED：dangling .git target → 修复后创建成功（TUI 同构体）', async () => {
    await withRepo('files', async repo => {
      const target = agentTarget(repo, 'probe')
      plantDanglingDotGit(target, join(repo, 'gone-tui'))
      await runWithCwdOverride(repo, async () => {
        const r = await tuiCreateAgentWorktree('probe')
        expect(r.worktreePath).toBe(target)
        expect(r.headCommit).toBeTruthy()
        expect(await tuiRemoveAgentWorktree(target, r.worktreeBranch, repo)).toBe(true)
      })
      expect(adminEntries(repo)).toEqual([])
      expect(worktreePaths(repo).length).toBe(1)
    })
  })

  it('守卫：用户文件 target → 拒绝且保全（TUI 同构体）', async () => {
    await withRepo('files', async repo => {
      const target = agentTarget(repo, 'probe')
      plantDanglingDotGit(target, join(repo, 'gone'))
      writeFileSync(join(target, 'note.txt'), 'user work\n')
      await runWithCwdOverride(repo, async () => {
        await expect(tuiCreateAgentWorktree('probe')).rejects.toThrow()
      })
      expect(readFileSync(join(target, 'note.txt'), 'utf-8')).toBe('user work\n')
      expect(readFileSync(join(target, '.git'), 'utf-8')).toContain('gone')
    })
  })

  it('守卫：fast-resume（TUI 同构体，同目录同 head）', async () => {
    await withRepo('files', async repo => {
      await runWithCwdOverride(repo, async () => {
        const a = await tuiCreateAgentWorktree('probe')
        const b = await tuiCreateAgentWorktree('probe')
        expect(b.worktreePath).toBe(a.worktreePath)
        expect(b.headCommit).toBe(a.headCommit)
        expect(await tuiRemoveAgentWorktree(a.worktreePath, a.worktreeBranch, repo)).toBe(true)
      })
      expect(adminEntries(repo)).toEqual([])
    })
  })

  it('判别：add 中途失败（只读 target 注入）→ throw 零残 + 重试能创建（TUI 同构体）', async () => {
    await withRepo('files', async repo => {
      const target = agentTarget(repo, 'probe')
      mkdirSync(target, { recursive: true })
      chmodSync(target, 0o555)
      await runWithCwdOverride(repo, async () => {
        try {
          await expect(tuiCreateAgentWorktree('probe')).rejects.toThrow()
        } finally {
          if (existsSync(target)) chmodSync(target, 0o755)
        }
        const r = await tuiCreateAgentWorktree('probe')
        expect(r.worktreePath).toBe(target)
        expect(await tuiRemoveAgentWorktree(target, r.worktreeBranch, repo)).toBe(true)
      })
      expect(adminEntries(repo)).toEqual([])
    })
  })
})
