/**
 * engine/permissions CLI 初始权限上下文装配 契约测试（E-4 S-4c1，§8.34 门）
 *
 * 被测面（permissionSetup 9 函数保留面，② GB 裁 / ③ auto 支裁 / ④ validate 支裁）：
 *   - parseToolListFromCLI 括号状态机：逗号/空格三分隔（仅限括号外）+
 *     括号内逗号空格保留（判别信号：`Bash(npm install)` 不拆两段）
 *   - parseBaseToolsFromCLI：preset → deps 工具名池（isEnabled 过滤）/
 *     自定义列表透传解析
 *   - initialPermissionModeFromCLI 优先级序（bypass > CLI > settings defaultMode）
 *     + settings 禁 bypass 跳支（notification）+ defaultMode auto 降级红线
 *   - isBypassPermissionsModeDisabled / shouldDisableBypassPermissions（settings 单源）
 *   - createDisabledBypassPermissionsContext（bypass → default + available=false）
 *   - prepareContextForPlanMode（plan 入口 prePlanMode 暂存 + 幂等）
 *   - initializeToolPermissionContext：cliArg 规则装载 + legacy 归一 +
 *     baseTools 补拒（fake tools deps）+ addDirs/settings 目录直 apply cliArg +
 *     PWD 非 symlink 不加 session 目录 + ③④ 空面契约（warnings/dangerous ≡ []）
 * I/O-free（mock FsOperations + ATLAS_CONFIG_DIR → /mock-home，unit 零磁盘层）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import {
  parseBaseToolsFromCLI,
  parseToolListFromCLI,
  initialPermissionModeFromCLI,
  initializeToolPermissionContext,
  shouldDisableBypassPermissions,
  isBypassPermissionsModeDisabled,
  createDisabledBypassPermissionsContext,
  prepareContextForPlanMode,
  resetSettingsCache,
  AGENT_TOOL_NAME,
  type ToolRegistryDeps,
} from '../../src/engine'
import {
  setLegacyToolNameAliases,
  resetLegacyToolNameAliases,
} from '../../src/permissions'
import {
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
  type Tool,
  type ToolPermissionContext,
} from '../../src/shared'

// ── mock FsOperations：文件 map，I/O-free（同 permission-rules-loader 口径）─
function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${path}'`)
  err.code = 'ENOENT'
  return err
}

const MOCK_HOME = '/mock-home'
const USER_SETTINGS = join(MOCK_HOME, 'settings.json')

let files: Map<string, string>

function makeMockFs(): FsOperations {
  return {
    cwd: () => '/mock-cwd',
    existsSync: () => false,
    stat: async () => ({} as never),
    readdir: async () => [],
    mkdir: async () => {},
    readFile: async () => '',
    readFileSync: p => {
      const content = files.get(p)
      if (content === undefined) throw enoent(p)
      return content
    },
    statSync: () => ({} as never),
    realpathSync: p => p,
    open: async () => ({} as never),
    unlinkSync: () => {},
    readdirSync: p => {
      throw enoent(p)
    },
    writeFileSync: (p, data) => {
      files.set(p, data)
    },
    mkdirSync: () => {},
    lstatSync: () => {
      throw enoent('lstat')
    },
  }
}

/** 最小 fake Tool（getToolsForDefaultPreset 仅消费 name + isEnabled）。 */
function mkTool(name: string, enabled: boolean): Tool {
  return {
    name,
    inputSchema: { type: 'object' },
    maxResultSizeChars: 10000,
    isEnabled: () => enabled,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    userFacingName: () => name,
    toAutoClassifierInput: () => null,
    mapToolResultToToolResultBlockParam: () => null,
    renderToolUseMessage: () => null,
    call: async () => ({ data: null }),
    description: async () => name,
    checkPermissions: async () => null,
  } as unknown as Tool
}

function makeContext(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}

let savedConfigDir: string | undefined
let savedPwd: string | undefined

beforeEach(() => {
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = MOCK_HOME
  savedPwd = process.env.PWD
  delete process.env.PWD
  files = new Map()
  setFsImplementation(makeMockFs())
  resetSettingsCache()
})

afterEach(() => {
  setOriginalFsImplementation()
  resetSettingsCache()
  resetLegacyToolNameAliases()
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
  if (savedPwd === undefined) delete process.env.PWD
  else process.env.PWD = savedPwd
})

describe('parseToolListFromCLI 括号状态机', () => {
  test('空输入 → []', () => {
    expect(parseToolListFromCLI([])).toEqual([])
  })

  test('括号内空格保留（判别信号：Bash(npm install) 不拆两段）', () => {
    expect(parseToolListFromCLI(['Bash(npm install)'])).toEqual(['Bash(npm install)'])
  })

  test('括号外逗号分隔', () => {
    expect(parseToolListFromCLI(['Bash,Grep'])).toEqual(['Bash', 'Grep'])
  })

  test('括号外空格分隔', () => {
    expect(parseToolListFromCLI(['Bash Grep'])).toEqual(['Bash', 'Grep'])
  })

  test('括号内逗号/空格均保留 + 混合格式', () => {
    expect(parseToolListFromCLI(['Bash(a, b), Grep'])).toEqual([
      'Bash(a, b)',
      'Grep',
    ])
    expect(parseToolListFromCLI([' Read ', ''])).toEqual(['Read'])
  })
})

describe('parseBaseToolsFromCLI', () => {
  const deps: ToolRegistryDeps = {
    baseTools: [mkTool('Bash', true), mkTool('Read', false), mkTool('Grep', true)],
  }

  test('preset → 默认预设工具名池（AgentTool 恒在 + isEnabled 过滤）', () => {
    expect(parseBaseToolsFromCLI(['default'], deps)).toEqual([
      AGENT_TOOL_NAME,
      'Bash',
      'Grep',
    ])
  })

  test('自定义列表 → 透传 parseToolListFromCLI（不触注册表）', () => {
    expect(parseBaseToolsFromCLI(['Bash(npm install)'])).toEqual(['Bash(npm install)'])
    expect(parseBaseToolsFromCLI(['Bash', 'Grep'], deps)).toEqual(['Bash', 'Grep'])
  })
})

describe('initialPermissionModeFromCLI 优先级序', () => {
  test('dangerouslySkip → bypassPermissions', () => {
    expect(initialPermissionModeFromCLI({ dangerouslySkipPermissions: true }).mode).toBe(
      'bypassPermissions',
    )
  })

  test('CLI 模式 → 该模式（优先级高于 settings）', () => {
    files.set(USER_SETTINGS, JSON.stringify({ permissions: { defaultMode: 'plan' } }))
    expect(
      initialPermissionModeFromCLI({ permissionModeCli: 'acceptEdits' }).mode,
    ).toBe('acceptEdits')
  })

  test('双源冲突 → 首个有效源赢（bypass 先于 CLI）', () => {
    expect(
      initialPermissionModeFromCLI({
        permissionModeCli: 'plan',
        dangerouslySkipPermissions: true,
      }).mode,
    ).toBe('bypassPermissions')
  })

  test('未知 CLI 模式串 → default（fromString 回落）', () => {
    expect(
      initialPermissionModeFromCLI({ permissionModeCli: 'garbage' }).mode,
    ).toBe('default')
  })

  test('全空 → default', () => {
    expect(initialPermissionModeFromCLI({}).mode).toBe('default')
  })

  test('settings 禁 bypass → 跳支 + notification', () => {
    files.set(
      USER_SETTINGS,
      JSON.stringify({ permissions: { disableBypassPermissionsMode: 'disable' } }),
    )
    const result = initialPermissionModeFromCLI({ dangerouslySkipPermissions: true })
    expect(result.mode).toBe('default')
    expect(result.notification).toBe(
      'Bypass permissions mode was disabled by settings',
    )
  })

  test('settings defaultMode → 无 CLI 时生效', () => {
    files.set(USER_SETTINGS, JSON.stringify({ permissions: { defaultMode: 'plan' } }))
    expect(initialPermissionModeFromCLI({}).mode).toBe('plan')
  })

  test('settings defaultMode auto → 降级 default（2026-09-19 红线：不 session 默认进 auto）', () => {
    files.set(USER_SETTINGS, JSON.stringify({ permissions: { defaultMode: 'auto' } }))
    expect(initialPermissionModeFromCLI({}).mode).toBe('default')
  })
})

describe('bypass 门控（② GB 裁 → settings 单源）', () => {
  test('isBypassPermissionsModeDisabled：无 settings → false', () => {
    expect(isBypassPermissionsModeDisabled()).toBe(false)
  })

  test('settings disableBypassPermissionsMode="disable" → true', async () => {
    files.set(
      USER_SETTINGS,
      JSON.stringify({ permissions: { disableBypassPermissionsMode: 'disable' } }),
    )
    expect(isBypassPermissionsModeDisabled()).toBe(true)
    await expect(shouldDisableBypassPermissions()).resolves.toBe(true)
  })
})

describe('createDisabledBypassPermissionsContext', () => {
  test('bypass 模式 → setMode default + available=false', () => {
    const ctx: ToolPermissionContext = {
      ...makeContext(),
      mode: 'bypassPermissions',
      isBypassPermissionsModeAvailable: true,
    }
    const result = createDisabledBypassPermissionsContext(ctx)
    expect(result.mode).toBe('default')
    expect(result.isBypassPermissionsModeAvailable).toBe(false)
  })

  test('非 bypass 模式 → 模式不动，仅 available=false', () => {
    const ctx: ToolPermissionContext = {
      ...makeContext(),
      mode: 'plan',
      isBypassPermissionsModeAvailable: true,
    }
    const result = createDisabledBypassPermissionsContext(ctx)
    expect(result.mode).toBe('plan')
    expect(result.isBypassPermissionsModeAvailable).toBe(false)
  })
})

describe('prepareContextForPlanMode', () => {
  test('非 plan 入口 → prePlanMode 暂存当前模式', () => {
    const result = prepareContextForPlanMode(makeContext())
    expect(result.prePlanMode).toBe('default')
  })

  test('已在 plan → 幂等（原引用返回）', () => {
    const ctx: ToolPermissionContext = { ...makeContext(), mode: 'plan' }
    expect(prepareContextForPlanMode(ctx)).toBe(ctx)
  })
})

describe('initializeToolPermissionContext', () => {
  const baseArgs = {
    allowedToolsCli: [] as string[],
    disallowedToolsCli: [] as string[],
    permissionMode: 'default' as const,
    allowDangerouslySkipPermissions: false,
    addDirs: [] as string[],
  }

  test('cliArg 规则装载（allow/deny 分列）', async () => {
    const { toolPermissionContext: ctx } = await initializeToolPermissionContext({
      ...baseArgs,
      allowedToolsCli: ['Bash(npm install)', 'Grep'],
      disallowedToolsCli: ['WebFetch'],
    })
    expect(ctx.alwaysAllowRules.cliArg).toEqual(['Bash(npm install)', 'Grep'])
    expect(ctx.alwaysDenyRules.cliArg).toEqual(['WebFetch'])
  })

  test('legacy 名归一（alias 注入窗：Task → Agent）', async () => {
    setLegacyToolNameAliases({ Task: 'Agent' })
    const { toolPermissionContext: ctx } = await initializeToolPermissionContext({
      ...baseArgs,
      allowedToolsCli: ['Task'],
    })
    expect(ctx.alwaysAllowRules.cliArg).toEqual(['Agent'])
  })

  test('baseTools 补拒：默认预设池中非 base 工具全部进 deny', async () => {
    const deps: ToolRegistryDeps = {
      baseTools: [mkTool('Bash', true), mkTool('Read', true)],
    }
    const { toolPermissionContext: ctx } = await initializeToolPermissionContext({
      ...baseArgs,
      baseToolsCli: ['Bash'],
      deps,
    })
    // 预设池 = [AgentTool, Bash, Read]；base = {Bash} → 补拒 AgentTool + Read
    expect(ctx.alwaysDenyRules.cliArg).toEqual([AGENT_TOOL_NAME, 'Read'])
  })

  test('addDirs + settings.additionalDirectories → 直 apply cliArg（④ 无校验面）', async () => {
    files.set(
      USER_SETTINGS,
      JSON.stringify({ permissions: { additionalDirectories: ['/srv/data'] } }),
    )
    const { toolPermissionContext: ctx, warnings } =
      await initializeToolPermissionContext({
        ...baseArgs,
        addDirs: ['/tmp/x'],
      })
    expect(ctx.additionalWorkingDirectories.get('/tmp/x')).toEqual({
      path: '/tmp/x',
      source: 'cliArg',
    })
    expect(ctx.additionalWorkingDirectories.get('/srv/data')).toEqual({
      path: '/srv/data',
      source: 'cliArg',
    })
    expect(warnings).toEqual([])
  })

  test('PWD 非 symlink（mock fs lstat 失败回落）→ 不加 session 目录', async () => {
    const { toolPermissionContext: ctx } =
      await initializeToolPermissionContext({ ...baseArgs })
    expect(ctx.additionalWorkingDirectories.size).toBe(0)
  })

  test('bypass 可用性（mode=bypass + 无禁支 → true；settings 禁支 → false）', async () => {
    const available = await initializeToolPermissionContext({
      ...baseArgs,
      permissionMode: 'bypassPermissions',
    })
    expect(available.toolPermissionContext.isBypassPermissionsModeAvailable).toBe(true)

    files.set(
      USER_SETTINGS,
      JSON.stringify({ permissions: { disableBypassPermissionsMode: 'disable' } }),
    )
    resetSettingsCache()
    const disabled = await initializeToolPermissionContext({
      ...baseArgs,
      permissionMode: 'bypassPermissions',
    })
    expect(disabled.toolPermissionContext.isBypassPermissionsModeAvailable).toBe(false)
  })

  test('shouldAvoidPermissionPrompts 透传 + ③④ 空面契约（dangerous/overlyBroad/warnings ≡ []）', async () => {
    const {
      toolPermissionContext: ctx,
      warnings,
      dangerousPermissions,
      overlyBroadBashPermissions,
    } = await initializeToolPermissionContext({
      ...baseArgs,
      shouldAvoidPermissionPrompts: true,
    })
    expect(ctx.shouldAvoidPermissionPrompts).toBe(true)
    expect(warnings).toEqual([])
    expect(dangerousPermissions).toEqual([])
    expect(overlyBroadBashPermissions).toEqual([])
  })

  test('盘上规则装载（user settings allow 规则入 context）', async () => {
    files.set(
      USER_SETTINGS,
      JSON.stringify({ permissions: { allow: ['Bash(npm ci)'] } }),
    )
    const { toolPermissionContext: ctx } =
      await initializeToolPermissionContext({ ...baseArgs })
    expect(ctx.alwaysAllowRules.userSettings).toEqual(['Bash(npm ci)'])
  })
})
