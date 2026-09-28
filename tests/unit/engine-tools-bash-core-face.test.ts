/**
 * engine/tools/bash S-T2b 核心 3 文件面（工具本体波 C 桶 ①，§8.53）。
 *
 * unit 层（零磁盘——不建 fixture；realpath/statSync 仅触达不存在路径
 * ENOENT 短路或稳定系统路径元数据读，无状态变更）：
 *  - bashPermissions 决策族：bashToolHasPermission 规则/只读/复合支
 *    + 剥除族（env var / safe wrapper / hijack 守卫）+ 前缀族 + 建议封顶
 *  - pathValidation：checkPathConstraints 安全块族（进程替换/展开/tilde
 *    变体/glob 写/dangerous 删除）+ sandbox 写 allowlist 3.7 支判别
 *    （setSandboxAccess 内存注入，非存在路径零盘）
 *  - shouldUseSandbox：settings 消费面（setSessionSettingsCache 注入
 *    零盘；excludedCommands 不动点剥除匹配）+ 逃生支（areUnsandboxed
 *    真/假判别）
 *  - 6 本地辅助模块：bashReadOnly / arrayUtils / windowsPaths /
 *    abortError / platform（值域断言）/ pathHelpers（UNC + ENOENT 支）
 *  - permissions 域随迁函数：extractRules（S-T2b 首消费者恢复）
 *  - 探针 P-T2（stripSafeWrappers 反转）/ P-T4（3.7 支删）/
 *    P-T5（不动点循环删）归 S-T5 突变面，本文件为正向判别基线。
 */
import {
  describe,
  expect,
  test,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'bun:test'
import {
  type BashToolUseContext,
  MAX_SUGGESTED_RULES_FOR_COMPOUND,
  BINARY_HIJACK_VARS,
  AbortError,
  bashPermissionRule,
  bashToolHasPermission,
  checkPathConstraints,
  commandHasAnyCd,
  count,
  getDirectoryForPath,
  getFirstWordPrefix,
  getPlatform,
  getSimpleCommandPrefix,
  isNormalizedCdCommand,
  isNormalizedGitCommand,
  isReadOnlyCommand,
  matchWildcardPattern,
  shouldUseSandbox,
  stripAllLeadingEnvVars,
  stripSafeWrappers,
  windowsPathToPosixPath,
} from '../../src/engine/tools'
import {
  applyPermissionRulesToPermissionContext,
  extractRules,
  isPathInSandboxWriteAllowlist,
  resetPermissionsBootstrapEnv,
  resetSandboxAccess,
  setPermissionsBootstrapEnv,
  setSandboxAccess,
} from '../../src/permissions'
import {
  type SettingsJson,
  resetSettingsCache,
  setSessionSettingsCache,
} from '../../src/engine'
import {
  getCwdState,
  getOriginalCwd,
  setOriginalCwd,
  setCwdState,
} from '../../src/bootstrap'
import type {
  PermissionResult,
  ToolPermissionContext,
} from '../../src/shared'

// ── 公共夹具 ──────────────────────────────────────────────────────────────

const FAKE_CWD = '/home/atlas-st2b/proj' // 不存在目录：realpath ENOENT 短路零盘

function makeCtx(mode: ToolPermissionContext['mode'] = 'default'): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
  }
}

function withRules(
  behavior: 'allow' | 'deny',
  contents: string[],
): ToolPermissionContext {
  return applyPermissionRulesToPermissionContext(
    makeCtx(),
    contents.map(c => ({
      source: 'session',
      ruleBehavior: behavior,
      ruleValue: { toolName: 'Bash', ruleContent: c },
    })),
  )
}

function bashCtx(ctx: ToolPermissionContext): BashToolUseContext {
  return {
    getAppState: () => ({ toolPermissionContext: ctx }),
    abortController: { signal: new AbortController().signal },
    options: { isNonInteractiveSession: true },
  }
}

function stubSandbox(
  over: Partial<
    Pick<
      ReturnType<typeof setSandboxAccess extends (a: infer A) => void ? A : never>,
      'isSandboxingEnabled' | 'areUnsandboxedCommandsAllowed' | 'getFsWriteConfig'
    >
  > = {},
): void {
  setSandboxAccess({
    isSandboxingEnabled: () => true,
    isAutoAllowBashIfSandboxedEnabled: () => false,
    areUnsandboxedCommandsAllowed: () => true,
    getFsWriteConfig: () => ({ allowOnly: [], denyWithinAllow: [] }),
    ...over,
  })
}

let savedOriginalCwd: string
let savedCwdState: string

beforeAll(() => {
  // permissions 域工作目录面（allWorkingDirectories 源）
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => FAKE_CWD,
    getCwd: () => FAKE_CWD,
  })
  // bootstrap 域 cwd 面：bashPermissions 路径检查经 getCwd()（bootstrap）解析
  // 相对路径 '.'，须与 permissions 工作目录对齐（否则 ls 的 '.' 落到真
  // process.cwd() → 工作目录外 → 误判 ask）。两域 cwd 同戳 FAKE_CWD 零盘。
  // bootstrap cwd 面存还对称复位（单进程连跑不跨文件泄漏）
  savedOriginalCwd = getOriginalCwd()
  savedCwdState = getCwdState()
  setOriginalCwd(FAKE_CWD)
  setCwdState(FAKE_CWD)
})

afterAll(() => {
  setOriginalCwd(savedOriginalCwd)
  setCwdState(savedCwdState)
  resetPermissionsBootstrapEnv()
  resetSandboxAccess()
  resetSettingsCache()
})

beforeEach(() => {
  resetSandboxAccess()
  resetSettingsCache()
})

afterEach(() => {
  resetSandboxAccess()
  resetSettingsCache()
})

// ── bashReadOnly（旧 BashTool.ts L84-107 逐字抽离）────────────────────────

describe('isReadOnlyCommand', () => {
  test('单/双词前缀命中', () => {
    expect(isReadOnlyCommand('ls -la')).toBe(true)
    expect(isReadOnlyCommand('git status')).toBe(true)
    expect(isReadOnlyCommand('  ls  ')).toBe(true)
    // 20 项前缀表仅双词 git 形（git status/log/diff/branch/show），
    // 裸 'git' 不在表内（旧仓 L84-107 逐字）
    expect(isReadOnlyCommand('git')).toBe(false)
  })

  test('非只读前缀', () => {
    expect(isReadOnlyCommand('rm x')).toBe(false)
    expect(isReadOnlyCommand('node app.js')).toBe(false)
  })

  test('链接/替换操作符守卫', () => {
    expect(isReadOnlyCommand('ls && rm -rf /')).toBe(false)
    expect(isReadOnlyCommand('ls || rm x')).toBe(false)
    expect(isReadOnlyCommand('ls; rm x')).toBe(false)
    expect(isReadOnlyCommand('ls | rm x')).toBe(false)
    expect(isReadOnlyCommand('ls `rm x`')).toBe(false)
    expect(isReadOnlyCommand('echo $(rm x)')).toBe(false)
  })
})

// ── 本地辅助模块 ──────────────────────────────────────────────────────────

describe('count（旧 utils/array.ts 逐字）', () => {
  test('谓词计数 + 空集', () => {
    expect(count(['a', 'b', 'a', 'c'], x => x === 'a')).toBe(2)
    expect(count<string>([], () => true)).toBe(0)
  })
})

describe('windowsPathToPosixPath（旧 utils/windowsPaths 逐字）', () => {
  test('UNC / 盘符 / 相对', () => {
    expect(windowsPathToPosixPath('\\\\server\\share\\dir')).toBe(
      '//server/share/dir',
    )
    expect(windowsPathToPosixPath('C:\\Users\\x')).toBe('/c/Users/x')
    expect(windowsPathToPosixPath('relative/path')).toBe('relative/path')
  })
})

describe('AbortError（旧 utils/errors.ts 逐字）', () => {
  test('name 恒 AbortError + Error 判别兼容', () => {
    const e = new AbortError('x')
    expect(e.name).toBe('AbortError')
    expect(e instanceof Error).toBe(true)
  })
})

describe('getPlatform（值域断言——机器相关不定值）', () => {
  test('返回受控平台值 + memoize 幂等', () => {
    const p1 = getPlatform()
    expect(['macos', 'windows', 'wsl', 'linux', 'unknown']).toContain(p1)
    expect(getPlatform()).toBe(p1)
  })
})

describe('getDirectoryForPath（最小 POSIX 基线）', () => {
  test('双斜杠 UNC 前缀跳 fs 操作（NTLM 守卫逐字）', () => {
    expect(getDirectoryForPath('//server/share/dir')).toBe('//server/share')
  })

  test('不存在文件 → 父目录（statSync ENOENT 短路，零盘）', () => {
    expect(getDirectoryForPath('/home/atlas-st2b/nx/file.txt')).toBe(
      '/home/atlas-st2b/nx',
    )
  })
})

// ── 剥除族 / 前缀族 / 规则型 ──────────────────────────────────────────────

describe('stripSafeWrappers / stripAllLeadingEnvVars', () => {
  test('wrapper 剥除（timeout/nohup）', () => {
    expect(stripSafeWrappers('timeout 30 ls -la')).toBe('ls -la')
    expect(stripSafeWrappers('nohup -- ls')).toBe('ls')
  })

  test('env var 前缀剥除 + hijack 守卫', () => {
    expect(stripAllLeadingEnvVars('FOO=bar BAZ=1 ls')).toBe('ls')
    // BINARY_HIJACK_VARS 命中 = 不剥（保留原样 → 规则不命中 → 弹框）
    expect(stripAllLeadingEnvVars('LD_PRELOAD=x ls', BINARY_HIJACK_VARS)).toBe(
      'LD_PRELOAD=x ls',
    )
  })
})

describe('getSimpleCommandPrefix / getFirstWordPrefix', () => {
  test('简单命令双词前缀', () => {
    expect(getSimpleCommandPrefix('npm run test')).toBe('npm run')
    expect(getSimpleCommandPrefix('ls -la')).toBeNull()
  })

  test('首词前缀 + 非安全 env 守卫', () => {
    expect(getFirstWordPrefix('GOOS=linux npm run test')).toBe('npm')
    expect(getFirstWordPrefix('LD_PRELOAD=x npm')).toBeNull()
  })
})

describe('bashPermissionRule / matchWildcardPattern', () => {
  test('前缀 / 精确 / 通配规则型', () => {
    expect(bashPermissionRule('ls:*')).toEqual({ type: 'prefix', prefix: 'ls' })
    expect(bashPermissionRule('npm run test')).toEqual({
      type: 'exact',
      command: 'npm run test',
    })
    expect(matchWildcardPattern('foo*bar', 'fooxbar')).toBe(true)
    expect(matchWildcardPattern('foo*bar', 'baz')).toBe(false)
  })
})

describe('git/cd 归一化判别', () => {
  test('git / cd 族', () => {
    expect(isNormalizedGitCommand('git status')).toBe(true)
    expect(isNormalizedGitCommand('gitx status')).toBe(false)
    expect(isNormalizedCdCommand('cd /tmp')).toBe(true)
    expect(isNormalizedCdCommand('cdx /tmp')).toBe(false)
  })

  test('compound cd 检测', () => {
    expect(commandHasAnyCd('cd /a && ls')).toBe(true)
    expect(commandHasAnyCd('ls')).toBe(false)
  })
})

describe('extractRules（S-T2b 首消费者恢复）', () => {
  test('undefined / 非 addRules / addRules 提取', () => {
    expect(extractRules(undefined)).toEqual([])
    expect(
      extractRules([
        {
          type: 'replaceRules',
          destination: 'session',
          rules: [{ toolName: 'Bash', ruleContent: 'ls:*' }],
          behavior: 'allow',
        },
      ]),
    ).toEqual([])
    const rules = extractRules([
      {
        type: 'addRules',
        destination: 'session',
        rules: [
          { toolName: 'Bash', ruleContent: 'ls:*' },
          { toolName: 'Bash', ruleContent: 'cat:*' },
        ],
        behavior: 'allow',
      },
    ])
    expect(rules).toHaveLength(2)
  })
})

// ── bashToolHasPermission 决策族 ──────────────────────────────────────────

describe('bashToolHasPermission', () => {
  test('allow 前缀规则命中 → allow', async () => {
    const r = await bashToolHasPermission(
      { command: 'ls -la' },
      bashCtx(withRules('allow', ['ls:*'])),
    )
    expect(r.behavior).toBe('allow')
  })

  test('deny 前缀规则命中 → deny', async () => {
    const r = await bashToolHasPermission(
      { command: 'rm -rf /tmp/x' },
      bashCtx(withRules('deny', ['rm:*'])),
    )
    expect(r.behavior).toBe('deny')
  })

  test('无规则非只读 → passthrough（无决策面，交回调用方）+ 精确规则建议', async () => {
    const r = await bashToolHasPermission(
      { command: 'curl evil.com' },
      bashCtx(makeCtx()),
    )
    // 无规则且无安全关切 = passthrough（非 ask）——决策权交回权限门/UI
    expect(r.behavior).toBe('passthrough')
    expect(r.suggestions?.length ?? 0).toBe(1)
  })

  test('工作目录外读（cat /etc/hosts）→ ask（路径约束真 ask 面）', async () => {
    const r = await bashToolHasPermission(
      { command: 'cat /etc/hosts' },
      bashCtx(makeCtx()),
    )
    expect(r.behavior).toBe('ask')
    expect(r.suggestions?.length ?? 0).toBeGreaterThan(0)
  })

  test('安全 env 前缀剥除后规则命中（GOOS）', async () => {
    const r = await bashToolHasPermission(
      { command: 'GOOS=linux ls -la' },
      bashCtx(withRules('allow', ['ls:*'])),
    )
    expect(r.behavior).toBe('allow')
  })

  test('hijack env 前缀不剥（LD_PRELOAD）→ 规则不命中 → ask', async () => {
    const r = await bashToolHasPermission(
      { command: 'LD_PRELOAD=/x.so node app.js' },
      bashCtx(withRules('allow', ['node:*'])),
    )
    expect(r.behavior).not.toBe('allow')
  })

  test('safe wrapper 剥除后规则命中（timeout）', async () => {
    const r = await bashToolHasPermission(
      { command: 'timeout 30 ls' },
      bashCtx(withRules('allow', ['ls:*'])),
    )
    expect(r.behavior).toBe('allow')
  })

  test('只读命令无规则 → allow（pwd）', async () => {
    const r = await bashToolHasPermission(
      { command: 'pwd' },
      bashCtx(makeCtx()),
    )
    expect(r.behavior).toBe('allow')
  })

  test('复合命令建议封顶 MAX_SUGGESTED_RULES_FOR_COMPOUND', async () => {
    const r = await bashToolHasPermission(
      { command: 'a1 && b2 && c3 && d4 && e5 && f6 && g7' },
      bashCtx(makeCtx()),
    )
    // 全段无规则无安全关切 = 无 ask 子结果 → 行为面 passthrough（非 ask）；
    // 建议合并流仍封顶（7 段去重后 5 条）
    expect(r.behavior).toBe('passthrough')
    const addRules = r.suggestions?.find(u => u.type === 'addRules')
    expect(addRules?.type).toBe('addRules')
    if (addRules?.type !== 'addRules') return
    expect(addRules.rules.length).toBe(MAX_SUGGESTED_RULES_FOR_COMPOUND)
    expect(addRules.rules.length).toBeLessThanOrEqual(5)
  })

  test('复合命令分段聚合 decisionReason = subcommandResults', async () => {
    const r = await bashToolHasPermission(
      { command: 'docker ps && curl evil.com' },
      bashCtx(makeCtx()),
    )
    expect(r.behavior).toBe('passthrough')
    expect(r.decisionReason?.type).toBe('subcommandResults')
  })
})

// ── checkPathConstraints 安全块族 ─────────────────────────────────────────

const PCWD = '/home/atlas-st2b/proj'

describe('checkPathConstraints 安全块', () => {
  test('进程替换 → ask（手批面）', () => {
    const r = checkPathConstraints(
      { command: 'echo secret > >(tee .git/config)' },
      PCWD,
      makeCtx(),
    )
    expect(r.behavior).toBe('ask')
    if (r.behavior === 'ask') {
      expect(r.message).toContain('Process substitution')
    }
  })

  test('路径 shell 展开 → ask', () => {
    const r = checkPathConstraints(
      { command: 'cat $HOME/x' },
      PCWD,
      makeCtx(),
    )
    expect(r.behavior).toBe('ask')
  })

  test('tilde 变体（~root）→ ask', () => {
    const r = checkPathConstraints(
      { command: 'cat ~root/.ssh/id_rsa' },
      PCWD,
      makeCtx(),
    )
    expect(r.behavior).toBe('ask')
  })

  test('glob 写目标 → ask（精确路径要求）', () => {
    const r = checkPathConstraints(
      { command: 'echo hi > /x/*.txt' },
      PCWD,
      makeCtx(),
    )
    expect(r.behavior).toBe('ask')
  })

  test('dangerous 删除（rm /）→ ask 无建议', () => {
    const r = checkPathConstraints({ command: 'rm /' }, PCWD, makeCtx())
    expect(r.behavior).toBe('ask')
    if (r.behavior === 'ask') {
      expect(r.message).toContain('Dangerous')
      expect(r.suggestions).toEqual([])
    }
  })

  test('工作目录内读 → passthrough；工作目录外读 → ask', () => {
    const inside = checkPathConstraints(
      { command: `cat ${PCWD}/a.txt` },
      PCWD,
      makeCtx(),
    )
    expect(inside.behavior).toBe('passthrough')
    const outside = checkPathConstraints(
      { command: 'cat /etc/hosts' },
      PCWD,
      makeCtx(),
    )
    expect(outside.behavior).toBe('ask')
  })
})

// ── sandbox 写 allowlist 3.7 支判别（P-T4 正向基线）──────────────────────

const ALLOW = '/tmp/atlas-st2b-nx' // 不存在路径：realpath ENOENT 短路零盘

describe('sandbox 写 allowlist 3.7 支', () => {
  test('isPathInSandboxWriteAllowlist 命中 / 未启用短路', () => {
    expect(isPathInSandboxWriteAllowlist(`${ALLOW}/f.txt`)).toBe(false)
    stubSandbox({
      isSandboxingEnabled: () => true,
      getFsWriteConfig: () => ({ allowOnly: [ALLOW], denyWithinAllow: [] }),
    })
    expect(isPathInSandboxWriteAllowlist(`${ALLOW}/f.txt`)).toBe(true)
    expect(isPathInSandboxWriteAllowlist('/tmp/atlas-st2b-other/g.txt')).toBe(
      false,
    )
  })

  test('denyWithinAllow 反转（allow 内嵌 deny）', () => {
    stubSandbox({
      isSandboxingEnabled: () => true,
      getFsWriteConfig: () => ({
        allowOnly: [ALLOW],
        denyWithinAllow: [`${ALLOW}/sub`],
      }),
    })
    expect(isPathInSandboxWriteAllowlist(`${ALLOW}/sub/g.txt`)).toBe(false)
    expect(isPathInSandboxWriteAllowlist(`${ALLOW}/f.txt`)).toBe(true)
  })

  test('checkPathConstraints 写支：allowlist 命中免弹框 vs 未启用弹框', () => {
    const cmd: Parameters<typeof checkPathConstraints>[0] = {
      command: `echo hi > ${ALLOW}/f.txt`,
    }
    // 未启用（placeholder）= 写工作目录外 → ask
    expect(checkPathConstraints(cmd, PCWD, makeCtx()).behavior).toBe('ask')
    // 启用 + allowlist 命中 → 免弹框（passthrough）
    stubSandbox({
      isSandboxingEnabled: () => true,
      getFsWriteConfig: () => ({ allowOnly: [ALLOW], denyWithinAllow: [] }),
    })
    expect(checkPathConstraints(cmd, PCWD, makeCtx()).behavior).toBe(
      'passthrough',
    )
  })
})

// ── shouldUseSandbox 决策面 ───────────────────────────────────────────────

describe('shouldUseSandbox', () => {
  // unit 零盘：containsExcludedCommand → getSettingsWithErrors cache-first，
  // 注入空 settings 缓存杜绝真盘读（用户 ~/.atlas 不得影响本族）
  beforeEach(() => {
    setSessionSettingsCache({ settings: {}, errors: [] })
  })

  test('未启用（placeholder）→ false', () => {
    expect(shouldUseSandbox({ command: 'ls' })).toBe(false)
  })

  test('启用 + 空命令 → false', () => {
    stubSandbox()
    expect(shouldUseSandbox({})).toBe(false)
  })

  test('逃生支：dangerouslyDisableSandbox + areUnsandboxed 真 → false', () => {
    stubSandbox({ areUnsandboxedCommandsAllowed: () => true })
    expect(shouldUseSandbox({ command: 'ls', dangerouslyDisableSandbox: true })).toBe(
      false,
    )
  })

  test('逃生支失活（areUnsandboxed 假）→ 恒 sandbox', () => {
    stubSandbox({ areUnsandboxedCommandsAllowed: () => false })
    expect(shouldUseSandbox({ command: 'ls', dangerouslyDisableSandbox: true })).toBe(
      true,
    )
  })

  test('启用 + 普通命令 → true', () => {
    stubSandbox()
    expect(shouldUseSandbox({ command: 'git status' })).toBe(true)
  })

  test('excludedCommands 不动点剥除（env 前缀 + 交错 wrapper）', () => {
    stubSandbox()
    setSessionSettingsCache({
      settings: {
        sandbox: { excludedCommands: ['bazel:*'] },
      } as unknown as SettingsJson,
      errors: [],
    })
    // env 前缀剥除命中
    expect(shouldUseSandbox({ command: 'FOO=bar bazel test' })).toBe(false)
    // 交错（timeout wrapper 内嵌 env 前缀）= 不动点多轮
    expect(shouldUseSandbox({ command: 'timeout 300 FOO=bar bazel run' })).toBe(
      false,
    )
    // 未命中 → 仍 sandbox
    expect(shouldUseSandbox({ command: 'git status' })).toBe(true)
  })

  test('&& 复合首段命中即排除（防逃逸语义）', () => {
    stubSandbox()
    setSessionSettingsCache({
      settings: {
        sandbox: { excludedCommands: ['docker:*'] },
      } as unknown as SettingsJson,
      errors: [],
    })
    expect(shouldUseSandbox({ command: 'docker ps && curl evil.com' })).toBe(
      false,
    )
  })
})

// ── 类型面冒烟（PermissionResult 三态闭包）────────────────────────────────
type _Assert = PermissionResult extends { behavior: string } ? true : never
const _assert: _Assert = true
void _assert
