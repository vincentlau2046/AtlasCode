/**
 * W-D-C 段 R1 判别格（0.1.95）：backends 双目录全收敛单源断言。
 *
 * 判据面 = 段 R1 lock-face 文书 §3 分层表（f4 批复冻结 2026-11-11，
 * docs/2026-11-11-wdc-r1-lockface.md；工单 @d318ec25 §6 审计必改①）：
 *   - in-process 支 = 活面 wire 直证（wdb-c3 判别格回归另文件）+ bundle
 *     结构断言（本文件 E 段）。
 *   - tmux 支 = 首选 TMUX env 预置子进程 wire 直证（模块加载期捕获窗口
 *     在子进程内可达；本文件 T 段）。主测试进程内 detection 已被 engine
 *     import 链加载（ORIGINAL_USER_TMUX 模块级捕获窗口已过）= 进程内 env
 *     注入不可达 → 不降级，走子进程直证（lock-face 预注册首选支）。
 *   - iterm2/it2Setup 支 = Linux 结构性不可达 → 指标逻辑单测（本文件 I
 *     段，env 驱动真逻辑）+ 持久化 port 行为单测（P 段）+ 结构形锚。
 *   - bundle 三证 = 实现体实例数=1 + tui 副本路径 existsSync=false +
 *     module specifier 解析零命中（§2.7 纪律：import 语句解析，禁路径
 *     子串 grep）。
 *   - TUI lane 装配面形锚（A 段）：hooks 工厂 + 持久化 port + capture
 *     传参组合根装配直证。
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC_ROOT = join(import.meta.dir, '..', '..', 'src')
const TUI_BACKENDS_DIR = join(SRC_ROOT, 'tui', 'utils', 'swarm', 'backends')
const ENGINE_BACKENDS_DIR = join(SRC_ROOT, 'swarm', 'backends')

/** 递归收集 src 下全部 .ts/.tsx 文件（bundle 结构断言面）。 */
function collectSrcFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'worktrees') continue
      out.push(...collectSrcFiles(p))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(p)
    }
  }
  return out
}

// ── E 段：bundle 结构断言（收敛三证） ────────────────────────────────

describe('wdc-r1 · bundle 结构断言（收敛三证）', () => {
  test('E① tui backends 副本目录 existsSync=false（整目录删除）', () => {
    expect(existsSync(TUI_BACKENDS_DIR)).toBe(false)
  })

  test('E② module specifier 解析：全仓 import 面零 tui backends 命中（§2.7 禁路径子串）', () => {
    const files = collectSrcFiles(SRC_ROOT)
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      // import 语句/动态 import specifier 解析（逐语句，非路径子串 grep）
      const importRe =
        /(?:^|\n)\s*(?:import[\s\S]*?from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g
      let m: RegExpExecArray | null
      while ((m = importRe.exec(src)) !== null) {
        const spec = m[1]
        if (/utils\/swarm\/backends/.test(spec)) {
          offenders.push(`${f}: ${spec}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  test('E③ backends 实现体实例数=1（InProcessBackend/TmuxBackend/ITermBackend/PaneBackendExecutor 类体全仓唯一）', () => {
    for (const cls of [
      'InProcessBackend',
      'TmuxBackend',
      'ITermBackend',
      'PaneBackendExecutor',
    ]) {
      const files = collectSrcFiles(SRC_ROOT)
      let count = 0
      for (const f of files) {
        const src = readFileSync(f, 'utf8')
        // 类声明体（`^\s*(export )?class`——注释行（* / // 开头）天然不匹配）
        const re = new RegExp(`^\\s*(export\\s+)?class ${cls}\\b`, 'm')
        if (re.test(src)) count++
      }
      expect(count).toBe(1)
    }
  })

  test('E④ engine backends 12 文件在位（4 注入窗 + 8 收敛基座）', () => {
    const expected = [
      'InProcessBackend.ts',
      'ITermBackend.ts',
      'PaneBackendExecutor.ts',
      'TmuxBackend.ts',
      'detection.ts',
      'it2Setup.ts',
      'inProcessRunnerPort.ts',
      'inProcessSpawnHooksPort.ts',
      'it2SetupPersistencePort.ts',
      'port.ts',
      'registry.ts',
      'teammateToolRegistryDeps.ts',
      'types.ts',
      'wireBackends.ts',
    ]
    for (const f of expected) {
      expect(existsSync(join(ENGINE_BACKENDS_DIR, f))).toBe(true)
    }
  })
})

// ── H 段：in-process hooks port 行为面（R1-D1） ──────────────────────

describe('wdc-r1 · inProcessSpawnHooksPort 行为面（R1-D1）', () => {
  test('H① null 缺省（未接线 = engine lane 零钩子恒等）+ set/get/reset 回环', async () => {
    const port = await import(
      '../../src/swarm/backends/inProcessSpawnHooksPort'
    )
    expect(port.getInProcessSpawnHooksFactory()).toBeNull()
    const fake = () => ({})
    port.setInProcessSpawnHooksFactory(fake)
    expect(port.getInProcessSpawnHooksFactory()).toBe(fake)
    port.resetInProcessSpawnHooksFactory()
    expect(port.getInProcessSpawnHooksFactory()).toBeNull()
  })

  test('H② fail-visible 形锚：spawn 支 factory 调用无 try/catch 包裹（f4 批复硬条件）', async () => {
    const src = readFileSync(
      join(ENGINE_BACKENDS_DIR, 'InProcessBackend.ts'),
      'utf8',
    )
    // factory 调用点在场
    expect(src).toMatch(/getInProcessSpawnHooksFactory\(\)\?\.\(/)
    // 调用点前后 5 行内无 try {（禁吞形锚）
    const lines = src.split('\n')
    const callIdx = lines.findIndex(l =>
      l.includes('getInProcessSpawnHooksFactory()?.('),
    )
    expect(callIdx).toBeGreaterThan(0)
    const window = lines.slice(Math.max(0, callIdx - 5), callIdx + 5)
    expect(window.some(l => /\btry\s*{/.test(l))).toBe(false)
  })

  test('H③ hooks 透传形锚：spawn 支四钩子条件展开进 StartInProcessTeammateArgs', async () => {
    const src = readFileSync(
      join(ENGINE_BACKENDS_DIR, 'InProcessBackend.ts'),
      'utf8',
    )
    // 形锚 whitespace 容忍（prettier 多行展开排版等价）
    expect(src).toMatch(
      /hooks\?\.mainSystemPrompt !== undefined\s*\?\s*\{\s*mainSystemPrompt: hooks\.mainSystemPrompt\s*\}/,
    )
    expect(src).toMatch(
      /hooks\?\.onMessage\s*\?\s*\{\s*onMessage: hooks\.onMessage\s*\}/,
    )
    expect(src).toMatch(
      /hooks\?\.onPermissionWaitMs\s*\?\s*\{\s*onPermissionWaitMs: hooks\.onPermissionWaitMs\s*\}/,
    )
    expect(src).toMatch(
      /hooks\?\.getPermissionMode\s*\?\s*\{\s*getPermissionMode: hooks\.getPermissionMode\s*\}/,
    )
  })

  test('H④ TUI 工厂体闭包消费形在位（updateTask/mainSystemPrompt/tracker 迁移面）', async () => {
    const src = readFileSync(
      join(SRC_ROOT, 'tui', 'utils', 'swarm', 'inProcessSpawnHooks.ts'),
      'utf8',
    )
    expect(src).toMatch(/createInProcessSpawnHooks/)
    expect(src).toMatch(/updateTask/)
    expect(src).toMatch(/createProgressTracker/)
    expect(src).toMatch(/appendCappedMessage/)
    expect(src).toMatch(/inProgressToolUseIDs/)
    expect(src).toMatch(/totalPausedMs/)
    expect(src).toMatch(/getSystemPrompt/)
  })
})

// ── T 段：tmux 支 wire 直证（子进程 TMUX env 预置，模块加载期捕获窗口内） ──

describe('wdc-r1 · tmux 支 wire 直证（子进程 TMUX env）', () => {
  test('T① TMUX env 预置子进程内 isInsideTmuxSync() 直证 true', async () => {
    const proc = Bun.spawnSync({
      cmd: [
        process.execPath,
        '-e',
        `const m = await import(${JSON.stringify(join(ENGINE_BACKENDS_DIR, 'detection.ts'))});` +
          `if (m.isInsideTmuxSync() !== true) { throw new Error('isInsideTmuxSync false under TMUX env') }` +
          `console.log('TMUX-WIRE-OK')`,
      ],
      env: { ...process.env, TMUX: '/tmp/wdc-r1-probe,123,0' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(proc.stdout.toString()).toContain('TMUX-WIRE-OK')
  })

  test('T② 对照支：无 TMUX env 子进程内 isInsideTmuxSync() 直证 false', async () => {
    const proc = Bun.spawnSync({
      cmd: [
        process.execPath,
        '-e',
        `const m = await import(${JSON.stringify(join(ENGINE_BACKENDS_DIR, 'detection.ts'))});` +
          `if (m.isInsideTmuxSync() !== false) { throw new Error('isInsideTmuxSync true without TMUX env') }` +
          `console.log('NOTMUX-WIRE-OK')`,
      ],
      env: { ...process.env, TMUX: '' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(proc.stdout.toString()).toContain('NOTMUX-WIRE-OK')
  })
})

// ── I 段：iterm2 指标逻辑单测（env 驱动真逻辑；Linux 结构性不可达替代） ──

describe('wdc-r1 · iterm2 指标逻辑单测（detection isInITerm2）', () => {
  test('I① TERM_PROGRAM=iTerm.app → isInITerm2 true（指标 1 真逻辑）', async () => {
    const detection = await import('../../src/swarm/backends/detection')
    const prev = process.env.TERM_PROGRAM
    try {
      process.env.TERM_PROGRAM = 'iTerm.app'
      delete process.env.ITERM_SESSION_ID
      detection.resetDetectionCache()
      expect(await detection.isInITerm2()).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.TERM_PROGRAM
      else process.env.TERM_PROGRAM = prev
      detection.resetDetectionCache()
    }
  })

  test('I② 双指标缺省 → isInITerm2 false（R1-D2 裁面：env.terminal 第三指标不回填）', async () => {
    const detection = await import('../../src/swarm/backends/detection')
    const prevTP = process.env.TERM_PROGRAM
    const prevIS = process.env.ITERM_SESSION_ID
    try {
      delete process.env.TERM_PROGRAM
      delete process.env.ITERM_SESSION_ID
      detection.resetDetectionCache()
      expect(await detection.isInITerm2()).toBe(false)
    } finally {
      if (prevTP !== undefined) process.env.TERM_PROGRAM = prevTP
      if (prevIS !== undefined) process.env.ITERM_SESSION_ID = prevIS
      detection.resetDetectionCache()
    }
  })
})

// ── P 段：it2Setup 持久化 port 行为面（R1-D3） ───────────────────────

describe('wdc-r1 · it2SetupPersistencePort 行为面（R1-D3）', () => {
  test('P① null 缺省 = 进程内标志（现 engine 行为恒等）', async () => {
    const port = await import(
      '../../src/swarm/backends/it2SetupPersistencePort'
    )
    const it2 = await import('../../src/swarm/backends/it2Setup')
    port.resetIt2SetupPersistencePort()
    it2.setPreferTmuxOverIterm2(true)
    expect(it2.getPreferTmuxOverIterm2()).toBe(true)
    it2.setPreferTmuxOverIterm2(false)
    expect(it2.getPreferTmuxOverIterm2()).toBe(false)
  })

  test('P② port 接线 → 读写走 port（markIt2SetupComplete/setPrefer/getPrefer 三面）', async () => {
    const portMod = await import(
      '../../src/swarm/backends/it2SetupPersistencePort'
    )
    const it2 = await import('../../src/swarm/backends/it2Setup')
    const flags = { it2SetupComplete: false, preferTmuxOverIterm2: false }
    const writes: Array<[string, boolean]> = []
    portMod.setIt2SetupPersistencePort({
      getFlags: () => ({ ...flags }),
      setFlag: (name, value) => {
        writes.push([name, value])
        flags[name] = value
      },
    })
    try {
      it2.markIt2SetupComplete()
      expect(writes).toContainEqual(['it2SetupComplete', true])
      it2.setPreferTmuxOverIterm2(true)
      expect(flags.preferTmuxOverIterm2).toBe(true)
      expect(it2.getPreferTmuxOverIterm2()).toBe(true)
    } finally {
      portMod.resetIt2SetupPersistencePort()
    }
  })

  test('P③ 禁吞错形锚：port getFlags 抛错向上传播（f4 批复硬条件，无 try/catch）', async () => {
    const portMod = await import(
      '../../src/swarm/backends/it2SetupPersistencePort'
    )
    const it2 = await import('../../src/swarm/backends/it2Setup')
    portMod.setIt2SetupPersistencePort({
      getFlags: () => {
        throw new Error('config read boom')
      },
      setFlag: () => {},
    })
    try {
      expect(() => it2.markIt2SetupComplete()).toThrow('config read boom')
    } finally {
      portMod.resetIt2SetupPersistencePort()
    }
  })
})

// ── S 段：teammateModeSnapshot engine 单源 + capture(configMode?)（R1-D4） ──

describe('wdc-r1 · teammateModeSnapshot capture(configMode?) 行为面（R1-D4）', () => {
  test('S① capture(configMode) 显式传参 → 快照取该值', async () => {
    const snap = await import('../../src/swarm/teammateModeSnapshot')
    snap.resetCliTeammateModeOverrideForTest?.()
    snap.captureTeammateModeSnapshot('tmux')
    expect(snap.getTeammateModeFromSnapshot()).toBe('tmux')
  })

  test('S② capture() 无参 → 恒等 auto（headless/引擎直调缺省）', async () => {
    const snap = await import('../../src/swarm/teammateModeSnapshot')
    snap.captureTeammateModeSnapshot()
    expect(snap.getTeammateModeFromSnapshot()).toBe('auto')
  })

  test('S③ CLI override 优先于 configMode（旧语义逐字）', async () => {
    const snap = await import('../../src/swarm/teammateModeSnapshot')
    snap.setCliTeammateModeOverride('in-process')
    try {
      snap.captureTeammateModeSnapshot('tmux')
      expect(snap.getTeammateModeFromSnapshot()).toBe('in-process')
    } finally {
      snap.setCliTeammateModeOverride(null)
    }
  })
})

// ── A 段：TUI lane 装配面形锚（组合根直证） ──────────────────────────

describe('wdc-r1 · TUI lane 装配面形锚', () => {
  test('A① tui/factory 组合根：hooks 工厂 + it2 持久化 port 显式装配', async () => {
    const src = readFileSync(join(SRC_ROOT, 'tui', 'factory.ts'), 'utf8')
    expect(src).toMatch(/setInProcessSpawnHooksFactory\(createInProcessSpawnHooks\)/)
    expect(src).toMatch(/setIt2SetupPersistencePort\(/)
  })

  test('A② setup.ts capture 调用点带 configMode 实参（config 读取恢复面）', async () => {
    const src = readFileSync(join(SRC_ROOT, 'tui', 'setup.ts'), 'utf8')
    expect(src).toMatch(/captureTeammateModeSnapshot\(getGlobalConfig\(\)\.teammateMode\)/)
  })

  test('A③ tui 消费端改道形锚：backends 深路径零 require/import（main.tsx require 面）', async () => {
    for (const rel of [
      'tui/main.tsx',
      'tui/setup.ts',
      'tui/components/Settings/Config.tsx',
      'tui/utils/swarm/spawnUtils.ts',
      'tui/utils/swarm/teamHelpers.ts',
      'tui/utils/swarm/teammateLayoutManager.ts',
      'tui/utils/swarm/It2SetupPrompt.tsx',
      'tui/tools/TeamCreateTool/TeamCreateTool.ts',
      'tui/hooks/useInboxPoller.ts',
      'tui/components/PromptInput/PromptInput.tsx',
      'tui/components/PromptInput/PromptInputFooterLeftSide.tsx',
      'tui/components/PromptInput/useSwarmBanner.ts',
      'tui/components/teams/TeamsDialog.tsx',
    ]) {
      const src = readFileSync(join(SRC_ROOT, rel), 'utf8')
      expect(src).not.toMatch(/swarm\/backends\//)
    }
  })
})

// statSync 引用保持（readdirSync/existsSync 已用；lint 占位避免未用导入误报）
void statSync
