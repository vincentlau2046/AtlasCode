/**
 * 0.1.87 任务 F — AscendSkillSourceCheck（总纲 Step 0 源新鲜度检查/更新）
 * 判别单测（工单 docs/2026-11-02-p0-wave-0187-ticket.md §1.F）。
 *
 * 修前红（absent-export 模式）：工具模块 / tools.ts 注册 / 三总纲 step0Section
 * 修前不存在 → 动态 import catch → {}，契约断言红于正确判别点；L16/域包/命令面
 * 回归锚修前即绿。
 *
 * 契约面（工单 §1.F + §125 Interfaces + 审计吸收 ②③a③b③c）：
 *  ① 工具契约：名 AscendSkillSourceCheck / shouldDefer true（deferred 池 +
 *     ToolSearch 发现 = 非 always-on 授予路径）/ call 在场
 *  ② tools.ts 注册：import + 无条件数组行（不在 AscendBridge feature 门内、
 *     不进 engine ascendTools 槽——L16 计数 16 与 fam 基线不受扰的结构保证）
 *  ③ check 三支路（DI 假 runGit）：同 sha=fresh（+ session 缓存：同 localSha
 *     不重发 ls-remote）/ 上游前进=drift（不缓存）/ 失败=unreachable
 *  ④ kill-switch（③c）：env 命中 = killed 且零网络（runGit 零调用）
 *  ⑤ 三总纲接线：step0Section 统一在场（check→drift 则 update→才路由；
 *     unreachable/killed fail-visible 不静默旧快照；stale 续行落漂移登记；
 *     路由边界句）+ allowedTools 含 AscendSkillSourceCheck + 渲染正文含 Step 0
 *  ⑥ L16 计数行不受扰（"You have 16 tools"字面量）+ ascendPackage.tools 仍
 *     16 且不含本工具（域包零触碰直证）
 *  ⑦ 非命令面：工具不是 bundled skill（cmd32/help55 零变化锚）
 *  ⑧ ms-agent check：pinned_sha vs upstream（无本地 clone，零 rev-parse）
 *  ⑨ update(ms-agent) = 拒绝 fail-visible（re-pin 归既有 sync/verify 流）
 *  ⑩ update(agent-skills) 拒绝支（DI）：非 FF = 拒绝且本地树未推进（无
 *     reset）；FF 但 integrity 败 = 回退（reset 调用在场）+ updatedTo 缺席；
 *     成功 = updatedTo + rollback 命令 + 缓存更新（后续 check fresh 零网络）
 *
 * 分层纪律：纯逻辑 + 注册面（DI 假 runGit/loadManifest/fileExists，无网络 /
 * 无真实盘 fixture / 无 PTY）→ unit；真 git fixture 三支路 + 负 fixture 见
 * tests/func/wave0187-source-update-fs.test.ts。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// 动态 import（absent-export：修前 = {}，红于判别点）
// ---------------------------------------------------------------------------
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
  AscendSkillSourceCheckTool?: { name: string; shouldDefer?: boolean; call: unknown }
  createAscendSkillSourceCheckTool?: (deps?: SourceCheckDeps) => unknown
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

interface UmbrellaDef {
  name: string
  allowedTools: readonly string[]
  step0Section?: string
}

const ascend = (await import('../../src/ascend/index.js').catch(() => ({}))) as {
  ASCEND_UMBRELLA_SKILLS?: readonly UmbrellaDef[]
  ASCEND_DOCTOR_SKILL_MD?: string
  ASCEND_OPTIMISM_SKILL_MD?: string
  ASCEND_OPDEV_SKILL_MD?: string
  ASCEND_TOOL_USAGE_GUIDE?: string
  ascendPackage?: { tools?: ReadonlyArray<{ name: string }> }
}

// tools.ts 注册面（textual：unit 层禁整树 import tools.ts——拖全 TUI 依赖）
const TOOLS_TS = readFileSync(
  join(import.meta.dir, '../../src/tui/tools.ts'),
  'utf8',
)

const { getBundledSkills, clearBundledSkills } = await import(
  '../../src/tui/skills/bundledSkills.js'
)
const shellDoctor = (await import(
  '../../src/tui/skills/bundled/ascendDoctor.js'
).catch(() => ({}))) as { registerAscendDoctorSkill?: () => void }
const shellOptimism = (await import(
  '../../src/tui/skills/bundled/ascendOptimism.js'
).catch(() => ({}))) as { registerAscendOptimismSkill?: () => void }
const shellOpdev = (await import(
  '../../src/tui/skills/bundled/ascendOpdev.js'
).catch(() => ({}))) as { registerAscendOpdevSkill?: () => void }

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)
const SHA_C = 'c'.repeat(40)
const SHA_S = '1'.repeat(40) // submodule gitlink fixture（须 40-hex：ls-tree 正则按 hex 匹配）

const KILL_SWITCH_ENV = 'ATLAS_DISABLE_ASCEND_MARKETPLACE_AUTOINSTALL'

beforeEach(() => {
  sourceCheck.resetSourceCheckCacheForTests?.()
  clearBundledSkills()
})

afterEach(() => {
  sourceCheck.resetSourceCheckCacheForTests?.()
  clearBundledSkills()
  delete process.env[KILL_SWITCH_ENV]
})

type GitReply = { code: number; stdout: string; stderr: string }
const ok = (stdout = ''): GitReply => ({ code: 0, stdout, stderr: '' })
const fail = (stderr = 'boom'): GitReply => ({ code: 1, stdout: '', stderr })

/**
 * deps.loadManifest 显式提供 = 完全 override（返回 null = manifest 不可读 →
 * url 解析失败 unreachable）。unit fixture 用显式 manifest（不回落真仓 manifest，
 * 隔离 + url 可控）。
 */
const agentManifest = () => ({
  sources: [{ repo: 'agent-skills', url: 'https://gitcode.com/Ascend/agent-skills.git', pinned_sha: null }],
})

/** 假 runGit：按子命令分派（rev-parse/ls-remote/fetch/merge-base/merge/submodule/config/ls-tree/reset）。 */
function fakeRunGit(
  dispatch: (args: readonly string[]) => GitReply,
): { runGit: SourceCheckDeps['runGit']; calls: string[][] } {
  const calls: string[][] = []
  const runGit = async (args: readonly string[]) => {
    calls.push([...args])
    return dispatch(args)
  }
  return { runGit, calls }
}

// ---------------------------------------------------------------------------
// ① 工具契约（修前红）
// ---------------------------------------------------------------------------
describe('① 工具契约（注册红 → shouldDefer 直证）', () => {
  test('AscendSkillSourceCheck 在场：名 + shouldDefer:true + call', () => {
    const tool = sourceCheck.AscendSkillSourceCheckTool
    expect(tool).toBeDefined()
    expect(tool!.name).toBe('AscendSkillSourceCheck')
    expect(tool!.shouldDefer).toBe(true)
    expect(typeof tool!.call).toBe('function')
    expect(typeof sourceCheck.createAscendSkillSourceCheckTool).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// ② tools.ts 注册面（无条件行，非 AscendBridge feature 门内）
// ---------------------------------------------------------------------------
describe('② tools.ts 注册（无条件 + 非 AscendBridge 门）', () => {
  test('import + 裸数组行在场（非条件展开族）', () => {
    const occurrences = TOOLS_TS.match(/AscendSkillSourceCheckTool/g)?.length ?? 0
    expect(occurrences).toBeGreaterThanOrEqual(2)
    const lines = TOOLS_TS.split('\n')
    // 无条件裸行（对齐三总纲注册的无条件语义）
    expect(lines.some(l => /^\s*AscendSkillSourceCheckTool,$/.test(l))).toBe(true)
    // 不进 AscendBridge feature 门条件展开（`...(AscendBridge ? [...] : [])` 族）
    expect(
      lines.some(l => l.includes('AscendSkillSourceCheckTool') && l.includes('AscendBridge ?')),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ③ check 三支路（DI 假 runGit）+ fresh 缓存（审计 ③b）
// ---------------------------------------------------------------------------
describe('③ check 三支路 + fresh 缓存', () => {
  test('fresh：local==upstream → fresh；同 localSha 第二次不重发 ls-remote', async () => {
    const { runGit, calls } = fakeRunGit(args => {
      if (args[0] === 'rev-parse') return ok(SHA_A + '\n')
      if (args[0] === 'ls-remote') return ok(SHA_A + '\tHEAD\n')
      return fail('unexpected ' + args.join(' '))
    })
    const deps: SourceCheckDeps = {
      runGit,
      cloneDir: '/fake/clone',
      loadManifest: agentManifest,
    }
    const r1 = (await sourceCheck.checkSourceFreshness!(deps, 'agent-skills', 30_000))!
    expect(r1.verdict).toBe('fresh')
    expect(r1.localSha).toBe(SHA_A)
    expect(r1.upstreamSha).toBe(SHA_A)
    expect(r1.error).toBeUndefined()
    const r2 = (await sourceCheck.checkSourceFreshness!(deps, 'agent-skills', 30_000))!
    expect(r2.verdict).toBe('fresh')
    expect(calls.filter(c => c[0] === 'ls-remote').length).toBe(1)
  })

  test('drift：上游前进 → drift 且不缓存（两次都重查）', async () => {
    const { runGit, calls } = fakeRunGit(args => {
      if (args[0] === 'rev-parse') return ok(SHA_A + '\n')
      if (args[0] === 'ls-remote') return ok(SHA_B + '\tHEAD\n')
      return fail('unexpected')
    })
    const deps: SourceCheckDeps = { runGit, cloneDir: '/fake/clone', loadManifest: agentManifest }
    const r1 = (await sourceCheck.checkSourceFreshness!(deps, 'agent-skills', 30_000))!
    expect(r1.verdict).toBe('drift')
    expect(r1.upstreamSha).toBe(SHA_B)
    const r2 = (await sourceCheck.checkSourceFreshness!(deps, 'agent-skills', 30_000))!
    expect(r2.verdict).toBe('drift')
    expect(calls.filter(c => c[0] === 'ls-remote').length).toBe(2)
  })

  test('unreachable：ls-remote 失败或抛出 → unreachable + error 在场', async () => {
    const { runGit } = fakeRunGit(args => {
      if (args[0] === 'rev-parse') return ok(SHA_A + '\n')
      if (args[0] === 'ls-remote') return fail('could not resolve host')
      return fail('unexpected')
    })
    const r = (await sourceCheck.checkSourceFreshness!(
      { runGit, cloneDir: '/fake/clone', loadManifest: agentManifest },
      'agent-skills',
      30_000,
    ))!
    expect(r.verdict).toBe('unreachable')
    expect(r.error).toBeTruthy()
    expect(r.upstreamSha).toBeUndefined()

    const throwing = async () => {
      throw new Error('timeout')
    }
    const r2 = (await sourceCheck.checkSourceFreshness!(
      { runGit: throwing as SourceCheckDeps['runGit'], cloneDir: '/fake/clone', loadManifest: agentManifest },
      'agent-skills',
      30_000,
    ))!
    expect(r2.verdict).toBe('unreachable')
    expect(r2.error).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// ④ kill-switch（审计 ③c：killed 支零网络）
// ---------------------------------------------------------------------------
describe('④ kill-switch = killed 且零网络', () => {
  test('env 命中 → killed，runGit 零调用', async () => {
    process.env[KILL_SWITCH_ENV] = '1'
    let calls = 0
    const r = (await sourceCheck.checkSourceFreshness!(
      {
        runGit: (async () => {
          calls++
          return ok('x')
        }) as SourceCheckDeps['runGit'],
        cloneDir: '/fake/clone',
        loadManifest: agentManifest,
      },
      'agent-skills',
      30_000,
    ))!
    expect(r.verdict).toBe('killed')
    expect(calls).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// ⑤ 三总纲接线（step0Section + allowedTools + 渲染正文）
// ---------------------------------------------------------------------------
describe('⑤ 三总纲 Step 0 接线', () => {
  test('step0Section 统一在场 + allowedTools 含 AscendSkillSourceCheck', () => {
    const defs = ascend.ASCEND_UMBRELLA_SKILLS
    expect(defs).toBeDefined()
    expect(defs!.length).toBe(3)
    for (const def of defs!) {
      expect(def.step0Section).toBeTruthy()
      expect(def.step0Section!).toContain('AscendSkillSourceCheck')
      expect(def.step0Section!).toContain('Step 0')
      // fail-visible：unreachable/killed 不静默旧快照
      expect(def.step0Section!).toContain('stale')
      expect(def.step0Section!.toLowerCase()).toContain('defer')
      // 路由边界句（工单 §140）
      expect(def.step0Section!).toContain('never rewrite this routing logic')
      // allowedTools 授予（permission 面）
      expect(def.allowedTools).toContain('AscendSkillSourceCheck')
    }
  })

  test('渲染正文含 Step 0 段（三总纲 SKILL_MD）', () => {
    for (const md of [
      ascend.ASCEND_DOCTOR_SKILL_MD,
      ascend.ASCEND_OPTIMISM_SKILL_MD,
      ascend.ASCEND_OPDEV_SKILL_MD,
    ]) {
      expect(md).toContain('## Step 0 — Skill source freshness check')
      expect(md).toContain('AscendSkillSourceCheck')
    }
  })
})

// ---------------------------------------------------------------------------
// ⑥ L16 + 域包零扰（fam/L16 计数基线不受扰直证）
// ---------------------------------------------------------------------------
describe('⑥ L16 计数行 + ascend 域包零触碰', () => {
  test('L16 仍 "You have 16 tools and 14 skills"；ascendPackage.tools 仍 16 且不含本工具', () => {
    expect(ascend.ASCEND_TOOL_USAGE_GUIDE).toContain('You have 16 tools and 14 skills')
    const tools = ascend.ascendPackage?.tools ?? []
    expect(tools.length).toBe(16)
    expect(tools.map(t => t.name)).not.toContain('AscendSkillSourceCheck')
  })
})

// ---------------------------------------------------------------------------
// ⑦ 非命令面（cmd32/help55 零变化锚）
// ---------------------------------------------------------------------------
describe('⑦ 工具不进命令面', () => {
  test('bundled skill 注册面不含本工具（非 slash 命令）', () => {
    shellDoctor.registerAscendDoctorSkill?.()
    shellOptimism.registerAscendOptimismSkill?.()
    shellOpdev.registerAscendOpdevSkill?.()
    const names = getBundledSkills().map(c => c.name)
    expect(names).not.toContain('ascend-skill-source-check')
    expect(names).not.toContain('AscendSkillSourceCheck')
  })
})

// ---------------------------------------------------------------------------
// ⑧ ms-agent check（pinned_sha 锚，无本地 clone）
// ---------------------------------------------------------------------------
describe('⑧ ms-agent check：pinned_sha vs upstream', () => {
  function msDeps(upstream: string) {
    const { runGit, calls } = fakeRunGit(args => {
      if (args[0] === 'ls-remote') return ok(upstream + '\tHEAD\n')
      return fail('unexpected ' + args.join(' '))
    })
    const deps: SourceCheckDeps = {
      runGit,
      cloneDir: null,
      loadManifest: () => ({
        sources: [
          {
            repo: 'ms-agent',
            url: 'https://github.com/modelscope/ms-agent.git',
            pinned_sha: SHA_C,
          },
        ],
      }),
    }
    return { deps, calls }
  }

  test('fresh：pinned==upstream → fresh（localSha=pinned_sha，零 rev-parse）', async () => {
    const { deps, calls } = msDeps(SHA_C)
    const r = (await sourceCheck.checkSourceFreshness!(deps, 'ms-agent-skills', 30_000))!
    expect(r.verdict).toBe('fresh')
    expect(r.localSha).toBe(SHA_C)
    expect(r.upstreamSha).toBe(SHA_C)
    expect(calls.some(c => c[0] === 'rev-parse')).toBe(false)
  })

  test('drift：upstream 前进 → drift（上游 head 即漂移信号）', async () => {
    const { deps } = msDeps(SHA_B)
    const r = (await sourceCheck.checkSourceFreshness!(deps, 'ms-agent-skills', 30_000))!
    expect(r.verdict).toBe('drift')
    expect(r.localSha).toBe(SHA_C)
    expect(r.upstreamSha).toBe(SHA_B)
  })
})

// ---------------------------------------------------------------------------
// ⑨ update(ms-agent) = 拒绝 fail-visible
// ---------------------------------------------------------------------------
describe('⑨ update ms-agent = 拒绝 fail-visible（re-pin 归既有流）', () => {
  function msDeps(upstream: string) {
    const { runGit, calls } = fakeRunGit(args => {
      if (args[0] === 'ls-remote') return ok(upstream + '\tHEAD\n')
      return fail('unexpected ' + args.join(' '))
    })
    const deps: SourceCheckDeps = {
      runGit,
      cloneDir: null,
      loadManifest: () => ({
        sources: [
          {
            repo: 'ms-agent',
            url: 'https://github.com/modelscope/ms-agent.git',
            pinned_sha: SHA_C,
          },
        ],
      }),
    }
    return { deps, calls }
  }

  test('drift 下 update → 拒绝（error 在场、updatedTo 缺席、无 fetch/merge）', async () => {
    const { deps, calls } = msDeps(SHA_B)
    const r = (await sourceCheck.updateSourceClone!(deps, 'ms-agent-skills', 30_000))!
    expect(r.verdict).toBe('drift')
    expect(r.error).toBeTruthy()
    expect(r.updatedTo).toBeUndefined()
    expect(calls.some(c => c[0] === 'fetch' || c[0] === 'merge')).toBe(false)
  })

  test('fresh 下 update → 无可更新（verdict fresh + 指引在场）', async () => {
    const { deps } = msDeps(SHA_C)
    const r = (await sourceCheck.updateSourceClone!(deps, 'ms-agent-skills', 30_000))!
    expect(r.verdict).toBe('fresh')
    expect(r.error).toBeTruthy()
    expect(r.updatedTo).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// ⑩ update(agent-skills) 拒绝支 + 成功支（DI 全假面）
// ---------------------------------------------------------------------------
describe('⑩ update agent-skills：拒绝支（非 FF / integrity 败）与成功支', () => {
  function updateDeps(opts: {
    localSha: string
    upstreamSha: string
    ffOk: boolean
    marketplaceJsonExists: boolean
    postRevParse?: string
    hasSubmodule?: boolean
  }) {
    const calls: string[][] = []
    const runGit = async (args: readonly string[]) => {
      calls.push([...args])
      if (args[0] === 'rev-parse') {
        // 本地解析（无 cwd 限定）取 localSha；merge 后的 HEAD 复核取 postRevParse
        const post = opts.postRevParse ?? opts.localSha
        const isPost = calls.filter(c => c[0] === 'rev-parse').length > 1
        return ok((isPost ? post : opts.localSha) + '\n')
      }
      if (args[0] === 'ls-remote') return ok(opts.upstreamSha + '\tHEAD\n')
      if (args[0] === 'fetch') return ok()
      if (args[0] === 'merge-base') return opts.ffOk ? ok() : fail('not ancestor')
      if (args[0] === 'merge') return ok()
      if (args[0] === 'submodule') return ok()
      if (args[0] === 'config') return opts.hasSubmodule ? ok('submodule.x.path\nofficial/CANNBot\0') : fail('no gitmodules')
      if (args[0] === 'ls-tree') return ok(`160000 commit ${SHA_S}\tofficial/CANNBot\n`)
      return fail('unexpected ' + args.join(' '))
    }
    const resets: string[] = []
    const deps: SourceCheckDeps = {
      runGit,
      cloneDir: '/fake/clone',
      loadManifest: () => ({
        sources: [
          { repo: 'agent-skills', url: 'https://gitcode.com/Ascend/agent-skills.git', pinned_sha: SHA_A },
        ],
      }),
      fileExists: path => (path.endsWith(join('.claude-plugin', 'marketplace.json')) ? opts.marketplaceJsonExists : false),
      getSubmoduleHead: async () => SHA_S,
      log: msg => resets.push(msg),
    }
    return { deps, calls, resets }
  }

  test('非 FF（历史改写）= 拒绝 + 本地树未推进（无 reset 调用）', async () => {
    const { deps, calls } = updateDeps({
      localSha: SHA_A,
      upstreamSha: SHA_B,
      ffOk: false,
      marketplaceJsonExists: true,
    })
    const r = (await sourceCheck.updateSourceClone!(deps, 'agent-skills', 30_000))!
    expect(r.verdict).toBe('drift')
    expect(r.error).toContain('non-fast-forward')
    expect(r.updatedTo).toBeUndefined()
    expect(calls.some(c => c[0] === 'reset')).toBe(false)
    expect(calls.some(c => c[0] === 'merge')).toBe(false)
  })

  test('FF 但 integrity 败（marketplace.json 缺失）= 回退 + updatedTo 缺席', async () => {
    const { deps, calls } = updateDeps({
      localSha: SHA_A,
      upstreamSha: SHA_B,
      ffOk: true,
      marketplaceJsonExists: false,
      postRevParse: SHA_B,
    })
    const r = (await sourceCheck.updateSourceClone!(deps, 'agent-skills', 30_000))!
    expect(r.error).toContain('integrity')
    expect(r.updatedTo).toBeUndefined()
    expect(calls.some(c => c[0] === 'reset' && c[1] === '--hard' && c[2] === SHA_A)).toBe(true)
  })

  test('成功 = updatedTo + rollback 命令 + 漂移登记 + 缓存更新（后续 check fresh 零 ls-remote）', async () => {
    const { deps, calls } = updateDeps({
      localSha: SHA_A,
      upstreamSha: SHA_B,
      ffOk: true,
      marketplaceJsonExists: true,
      postRevParse: SHA_B,
      hasSubmodule: true,
    })
    const r = (await sourceCheck.updateSourceClone!(deps, 'agent-skills', 30_000))!
    expect(r.verdict).toBe('drift')
    expect(r.updatedTo).toBe(SHA_B)
    expect(r.rollback).toContain(`reset --hard ${SHA_A}`)
    expect(r.localSha).toBe(SHA_A)
    expect(r.upstreamSha).toBe(SHA_B)
    // 漂移登记（日志面）
    expect(calls.some(c => c[0] === 'fetch')).toBe(true)
    expect(calls.some(c => c[0] === 'merge' && c[1] === '--ff-only')).toBe(true)
    // 缓存更新：update 成功后同 localSha 的 check 不再 ls-remote
    const checkCalls: string[][] = []
    const checkRun = async (args: readonly string[]) => {
      checkCalls.push([...args])
      if (args[0] === 'rev-parse') return ok(SHA_B + '\n')
      if (args[0] === 'ls-remote') return ok(SHA_B + '\tHEAD\n')
      return fail('unexpected')
    }
    const r2 = (await sourceCheck.checkSourceFreshness!(
      { runGit: checkRun, cloneDir: '/fake/clone', loadManifest: agentManifest },
      'agent-skills',
      30_000,
    ))!
    expect(r2.verdict).toBe('fresh')
    expect(checkCalls.filter(c => c[0] === 'ls-remote').length).toBe(0)
  })
})
