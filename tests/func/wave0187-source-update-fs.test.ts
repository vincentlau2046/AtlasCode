/**
 * 0.1.87 任务 F — AscendSkillSourceCheck update 支真盘 fixture 测试
 * （工单 docs/2026-11-02-p0-wave-0187-ticket.md §1.F 更新支 + 负 fixture 审计②）。
 *
 * 真实 git 仓 fixture：本地 bare upstream + 本地 clone（含 submodule）+
 * ms-agent manifest fixture。零网络（全部本地路径/127.0.0.1 闭端口）、零写
 * 真实 HOME（fixture 隔离 HOME + GIT_CONFIG_*）。
 *
 * 覆盖面（工单 §136-138）：
 *  - 同 sha=fresh / 上游前进=drift / 127.0.0.1:1=unreachable（真盘三支路）
 *  - drift→update 真盘：HEAD=upstreamSha、submodule 在场、integrity 过、
 *    updatedTo + rollback 命令 + 漂移登记（进程内日志面）
 *  - 负 fixture①（审计②）：非 FF（orphan 历史改写 force-push）→ update 拒绝
 *    + 本地树未被推进
 *  - 负 fixture②（审计②）：FF 但内容损坏（marketplace.json 删除）→
 *    integrity 拒绝 + 回退到 pre-update 树
 *  - update(ms-agent) = 拒绝 fail-visible（local_clone:null 无 clone 可更新；
 *    re-pin 归既有 sync/verify 流程）
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

interface SourceCheckResult {
  verdict: 'fresh' | 'drift' | 'unreachable' | 'killed'
  localSha: string
  upstreamSha?: string
  updatedTo?: string
  rollback?: string
  error?: string
}
interface SourceCheckDeps {
  runGit?: (
    args: readonly string[],
    opts?: { cwd?: string; timeoutMs?: number },
  ) => Promise<{ code: number; stdout: string; stderr: string }>
  loadManifest?: () => unknown | null
  cloneDir?: string | null
  fileExists?: (path: string) => boolean
  getSubmoduleHead?: (dir: string) => Promise<string | null>
  timeoutMs?: number
  log?: (msg: string) => void
}

const sourceCheck = (await import(
  '../../src/tui/tools/AscendSkillSourceCheck/AscendSkillSourceCheckTool.js'
).catch(() => ({}))) as {
  checkSourceFreshness?: (
    deps: SourceCheckDeps,
    source: 'agent-skills' | 'ms-agent-skills',
    timeoutMs?: number,
  ) => Promise<SourceCheckResult>
  updateSourceClone?: (
    deps: SourceCheckDeps,
    source: 'agent-skills' | 'ms-agent-skills',
    timeoutMs?: number,
  ) => Promise<SourceCheckResult>
  resetSourceCheckCacheForTests?: () => void
}

// ---------------------------------------------------------------------------
// git fixture helpers（隔离 HOME/config/身份；全部本地路径 = 零网络）
// ---------------------------------------------------------------------------
let ROOT = ''
let upstream = ''
let local = ''
let logs: string[] = []
let prevGitConfigGlobal: string | undefined
let prevHome: string | undefined

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: ROOT,
      GIT_CONFIG_GLOBAL: join(ROOT, 'gitconfig'),
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_AUTHOR_NAME: 'fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_NAME: 'fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

const head = (dir: string): string => git(dir, 'rev-parse', 'HEAD').trim()

function writeGitconfig(): void {
  writeFileSync(
    join(ROOT, 'gitconfig'),
    [
      '[user]',
      '\tname = fixture',
      '\temail = fixture@example.com',
      '[init]',
      '\tdefaultBranch = main',
      '[protocol "file"]',
      '\tallow = always',
      '',
    ].join('\n'),
  )
}

/**
 * 建 fixture：sub.git（bare）← sub-seed 一提交；seed 仓（.claude-plugin/
 * marketplace.json + README + submodule official/CANNBot）推入 upstream.git
 * （bare）= C2；local = clone upstream（HEAD=C2，submodule 未物化）。
 */
function makeAgentSkillsFixture(): string {
  upstream = join(ROOT, 'upstream.git')
  git(ROOT, 'init', '--bare', '--quiet', upstream)

  const subBare = join(ROOT, 'sub.git')
  git(ROOT, 'init', '--bare', '--quiet', subBare)
  const subSeed = join(ROOT, 'sub-seed')
  git(ROOT, 'init', '--quiet', subSeed)
  writeFileSync(join(subSeed, 'kernel.c'), '// fixture kernel\n')
  git(subSeed, 'add', '.')
  git(subSeed, 'commit', '--quiet', '-m', 'sub c0')
  git(subSeed, 'push', '--quiet', subBare, 'main')

  const seed = join(ROOT, 'seed')
  git(ROOT, 'init', '--quiet', seed)
  mkdirSync(join(seed, '.claude-plugin'), { recursive: true })
  writeFileSync(
    join(seed, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'agent-skills', owner: { name: 'fixture' }, plugins: [] }, null, 2) + '\n',
  )
  writeFileSync(join(seed, 'README.md'), '# agent-skills fixture\n')
  git(seed, 'add', '.')
  git(seed, 'commit', '--quiet', '-m', 'c1 marketplace')
  git(seed, '-c', 'protocol.file.allow=always', 'submodule', 'add', '--quiet', subBare, 'official/CANNBot')
  git(seed, 'commit', '--quiet', '-m', 'c2 with submodule')
  git(seed, 'push', '--quiet', upstream, 'main')

  local = join(ROOT, 'local')
  git(ROOT, 'clone', '--quiet', upstream, local)
  return head(local)
}

/** 上游推进一提交（FF）：改 README 后 push。 */
function pushUpstreamCommit(message: string, removeMarketplaceJson = false): string {
  const scratch = join(ROOT, `scratch-${message.replace(/\W+/g, '-')}`)
  git(ROOT, 'clone', '--quiet', upstream, scratch)
  if (removeMarketplaceJson) {
    git(scratch, 'rm', '--quiet', '.claude-plugin/marketplace.json')
  } else {
    writeFileSync(join(scratch, 'README.md'), `# agent-skills fixture — ${message}\n`)
    git(scratch, 'add', '.')
  }
  git(scratch, 'commit', '--quiet', '-m', message)
  git(scratch, 'push', '--quiet', 'origin', 'main')
  return head(scratch)
}

/** 上游历史改写（非 FF 负 fixture①）：orphan 根提交 force-push。 */
function forcePushOrphanHistory(): string {
  const scratch = join(ROOT, 'scratch-orphan')
  git(ROOT, 'clone', '--quiet', upstream, scratch)
  git(scratch, 'checkout', '--quiet', '--orphan', 'rewrite')
  writeFileSync(join(scratch, 'README.md'), '# rewritten history (orphan root)\n')
  writeFileSync(
    join(scratch, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'agent-skills', owner: { name: 'rewritten' }, plugins: [] }) + '\n',
  )
  git(scratch, 'add', '.')
  git(scratch, 'commit', '--quiet', '-m', 'orphan rewrite c3x')
  git(scratch, 'push', '--quiet', '--force', 'origin', 'rewrite:main')
  return head(scratch)
}

function agentDeps(urlOverride?: string): SourceCheckDeps {
  return {
    cloneDir: local,
    loadManifest: () => ({
      sources: [
        {
          repo: 'agent-skills',
          url: urlOverride ?? upstream,
          pinned_sha: null,
        },
      ],
    }),
    log: (msg: string) => logs.push(msg),
  }
}

beforeEach(() => {
  sourceCheck.resetSourceCheckCacheForTests?.()
  ROOT = mkdtempSync(join(tmpdir(), 'atlas-0187-source-f-'))
  logs = []
  writeGitconfig()
  // 工具的默认 runGit 子进程继承 process.env——本 fixture 期间指向隔离 gitconfig
  // （[protocol "file"] allow=always 让本地路径 submodule clone 可达；HOME 同步隔离，
  // 零写真实 HOME），afterEach 复原。
  prevGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL
  prevHome = process.env.HOME
  process.env.GIT_CONFIG_GLOBAL = join(ROOT, 'gitconfig')
  process.env.HOME = ROOT
})

afterEach(() => {
  sourceCheck.resetSourceCheckCacheForTests?.()
  if (prevGitConfigGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL
  else process.env.GIT_CONFIG_GLOBAL = prevGitConfigGlobal
  if (prevHome === undefined) delete process.env.HOME
  else process.env.HOME = prevHome
  if (ROOT) rmSync(ROOT, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// check 三支路（真盘）
// ---------------------------------------------------------------------------
describe('check 三支路（真 git fixture）', () => {
  test('同 sha = fresh（local HEAD == upstream HEAD）', async () => {
    makeAgentSkillsFixture()
    const r = (await sourceCheck.checkSourceFreshness!(agentDeps(), 'agent-skills', 15_000))!
    expect(r.verdict).toBe('fresh')
    expect(r.localSha).toBe(head(local))
    expect(r.upstreamSha).toBe(head(local))
  })

  test('上游前进 = drift（upstreamSha 在场）', async () => {
    makeAgentSkillsFixture()
    const c3 = pushUpstreamCommit('c3 perf docs')
    const r = (await sourceCheck.checkSourceFreshness!(agentDeps(), 'agent-skills', 15_000))!
    expect(r.verdict).toBe('drift')
    expect(r.localSha).not.toBe(c3)
    expect(r.upstreamSha).toBe(c3)
  })

  test('127.0.0.1:1 闭端口 = unreachable（有界，快速失败）', async () => {
    makeAgentSkillsFixture()
    const r = (await sourceCheck.checkSourceFreshness!(
      agentDeps('http://127.0.0.1:1/repo.git'),
      'agent-skills',
      15_000,
    ))!
    expect(r.verdict).toBe('unreachable')
    expect(r.error).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 更新支真盘（工单 §137）
// ---------------------------------------------------------------------------
describe('drift→update 真盘', () => {
  test('update 后 HEAD=upstreamSha、submodule 在场、integrity 过、updatedTo+rollback+漂移登记', async () => {
    const c2 = makeAgentSkillsFixture()
    const c3 = pushUpstreamCommit('c3 perf docs')
    const r = (await sourceCheck.updateSourceClone!(agentDeps(), 'agent-skills', 30_000))!
    expect(r.verdict).toBe('drift')
    expect(r.localSha).toBe(c2)
    expect(r.upstreamSha).toBe(c3)
    expect(r.updatedTo).toBe(c3)
    expect(r.rollback).toContain(`reset --hard ${c2}`)
    expect(r.error).toBeUndefined()
    // 真盘终态：HEAD 推进 + submodule 物化 + 内容锚在场
    expect(head(local)).toBe(c3)
    expect(existsSync(join(local, 'official', 'CANNBot'))).toBe(true)
    expect(existsSync(join(local, '.claude-plugin', 'marketplace.json'))).toBe(true)
    // 漂移登记（进程内日志面，不写真实 HOME）
    expect(logs.join('\n')).toContain(c2.slice(0, 8))
    expect(logs.join('\n')).toContain(c3.slice(0, 8))
    // 更新后 check = fresh（缓存生效，零网络）
    const r2 = (await sourceCheck.checkSourceFreshness!(agentDeps(), 'agent-skills', 15_000))!
    expect(r2.verdict).toBe('fresh')
  })
})

// ---------------------------------------------------------------------------
// 负 fixture（审计②）
// ---------------------------------------------------------------------------
describe('负 fixture（审计②）', () => {
  test('① 非 FF（orphan 历史改写）= update 拒绝 + 本地树未被推进', async () => {
    const c2 = makeAgentSkillsFixture()
    forcePushOrphanHistory()
    const r = (await sourceCheck.updateSourceClone!(agentDeps(), 'agent-skills', 30_000))!
    expect(r.verdict).toBe('drift')
    expect(r.error).toContain('non-fast-forward')
    expect(r.updatedTo).toBeUndefined()
    // 本地树未被推进
    expect(head(local)).toBe(c2)
  })

  test('② FF 但内容损坏（marketplace.json 删除）= integrity 拒绝 + 回退', async () => {
    const c2 = makeAgentSkillsFixture()
    pushUpstreamCommit('c3 ok')
    const c4 = pushUpstreamCommit('c4 removes marketplace.json', true)
    expect(c4).not.toBe(c2)
    const r = (await sourceCheck.updateSourceClone!(agentDeps(), 'agent-skills', 30_000))!
    expect(r.error).toContain('integrity')
    expect(r.updatedTo).toBeUndefined()
    // 回退生效：本地树回到 pre-update 锚 + 内容锚恢复
    expect(head(local)).toBe(c2)
    expect(existsSync(join(local, '.claude-plugin', 'marketplace.json'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// update(ms-agent) = 拒绝 fail-visible（真 manifest fixture）
// ---------------------------------------------------------------------------
describe('update(ms-agent-skills) = 拒绝 fail-visible', () => {
  test('drift 下 update → 拒绝（re-pin 指引在场，updatedTo 缺席）', async () => {
    makeAgentSkillsFixture()
    const c3 = pushUpstreamCommit('c3 perf docs')
    const deps: SourceCheckDeps = {
      cloneDir: null,
      loadManifest: () => ({
        sources: [
          {
            repo: 'ms-agent',
            url: upstream, // 本地 bare 充当远端（零网络）
            pinned_sha: head(local),
          },
        ],
      }),
      log: (msg: string) => logs.push(msg),
    }
    const r = (await sourceCheck.updateSourceClone!(deps, 'ms-agent-skills', 15_000))!
    expect(r.verdict).toBe('drift')
    expect(r.upstreamSha).toBe(c3)
    expect(r.error).toBeTruthy()
    expect(r.updatedTo).toBeUndefined()
  })
})
