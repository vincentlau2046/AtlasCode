/**
 * 0.1.37 ② P11 plan×auto 状态机自洽（engine 本体面；R1 裁定 = 处置①）。
 *
 * 背景（2026-10-06-permission-harness-trace-analysis P11 [MED]）：
 * EnterPlanModeTool（engine 本体 delta ④）裁掉 plan×auto 语义支，但
 * ExitPlanModePermissionRequest 弹框 exit 侧仍消费 autoModeState →
 * 半落地：plan 入口不设 auto active，plan 出口却能恢复 auto。
 * 本波（C 桶 ② 的 plan×auto 子集）= 状态机自洽所需面：
 *   - prepareContextForPlanMode 补 auto 语义支（逐行对照 CC
 *     permissionSetup.ts:1462-1495：shouldPlanUseAutoMode / setAutoModeActive /
 *     strip·restoreDangerousPermissions / prePlanMode 暂存）
 *   - ExitPlanModeV2Tool plan 退出 kick-out（逐行对照 TUI exit 303-383 +
 *     CC :1233-1248：gate-off fallback / finalRestoringAuto /
 *     autoWasUsedDuringPlan kick-out / strip·restore 对）
 * 弹框 exit 侧消费支（TUI ExitPlanModePermissionRequest.tsx:339-342/:383-404）
 * 保留不动（补支后消费方与入口对齐，半落地消除）。
 *
 * 登记面（复审勿当遗漏重提）：
 *   - 危险规则检测族（findDangerousClassifierPermissions / isDangerous* ~400L）
 *     归 C 桶 ② → 本波 strip = 空集支（契约字段保留，stash 形状锁定）
 *   - isAutoModeGateEnabled 模型能力支（modelSupportsAutoMode）归 C 桶 ②
 *     → 本波 gate = circuit + settings 双源
 *   - bootstrap 旗标族（setNeedsAutoModeExitAttachment 等 4 件）= 旧仓
 *     any-stub no-op（H6 纪律）→ 本波 kick-out 通知 = debug 日志面，
 *     用户可见通知面归 TUI/attachment 波
 *
 * 测面（真行为，零网络/PTY）：
 *   - shouldPlanUseAutoMode 门链（feature / opt-in / circuit / settings /
 *     useAutoModeDuringPlan 五支）
 *   - isAutoModeGateEnabled / getAutoModeUnavailableReason（engine 双源）
 *   - prepareContextForPlanMode auto 分支 6 态 + P11 验收锚点①
 *     （opt-in auto 用户 EnterPlanMode 后 isAutoModeActive()==true）
 *   - strip·restoreDangerousPermissions 契约形（空集支 + stash 恢复）
 *   - ExitPlanModeV2Tool plan 退出 kick-out 5 态
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import {
  type ToolPermissionContext,
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
} from '../../src/shared'
import {
  ExitPlanModeV2Tool,
  getAutoModeUnavailableReason,
  getUseAutoModeDuringPlan,
  hasAutoModeOptIn,
  isAutoModeGateEnabled,
  prepareContextForPlanMode,
  resetSettingsCache,
  restoreDangerousPermissions,
  shouldPlanUseAutoMode,
  stripDangerousPermissionsForAutoMode,
} from '../../src/engine'
// autoMode state 族 = src/permissions 域根直 import（STR-1：测试 import
// 域根 / engine 根门面；engine 门面零父域 re-export 纪律不变）
import {
  isAutoModeActive,
  resetAutoModeStateForTesting,
  setAutoModeActive,
  setAutoModeCircuitBroken,
} from '../../src/permissions'

const MOCK_HOME = '/mock-home'
const USER_SETTINGS = join(MOCK_HOME, 'settings.json')
const FEATURE_KEY = 'FEATURE_TRANSCRIPT_CLASSIFIER'

// ── 最小 FsOperations mock（engine-config-settings.test.ts 先例）─────────

function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${path}'`)
  err.code = 'ENOENT'
  return err
}

function makeMockFs(files: Record<string, string>): FsOperations {
  const fileMap = new Map(Object.entries(files))
  return {
    cwd: () => '/mock-cwd',
    existsSync: () => false,
    stat: async () => ({} as never),
    readdir: async () => [],
    mkdir: async () => {},
    readFile: async () => '',
    readFileSync: p => {
      const content = fileMap.get(p)
      if (content === undefined) throw enoent(p)
      return content
    },
    statSync: () => ({} as never),
    realpathSync: p => p,
    open: async () => ({} as never),
    unlinkSync: () => {},
    readdirSync: () => {
      throw enoent('/etc/atlas/managed-settings.d')
    },
    writeFileSync: (p, data) => {
      fileMap.set(p, data)
    },
    mkdirSync: () => {},
  }
}

/** 用户 settings.json 注入（opt-in / 禁用 / useAutoModeDuringPlan 面）。 */
function seedUserSettings(obj: Record<string, unknown> | null): void {
  setFsImplementation(
    makeMockFs(
      obj === null ? {} : { [USER_SETTINGS]: JSON.stringify(obj) },
    ),
  )
}

function makeTpc(
  overrides: Partial<ToolPermissionContext> = {},
): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
    ...overrides,
  } as ToolPermissionContext
}

/** opt-in auto 用户 settings（skipAutoPermissionPrompt = auto 对话框 opt-in）。 */
const OPT_IN = { skipAutoPermissionPrompt: true }

let savedFeature: string | undefined
let savedConfigDir: string | undefined
beforeEach(() => {
  savedFeature = process.env[FEATURE_KEY]
  delete process.env[FEATURE_KEY] // 缺省 ON_BY_DEFAULT = 开
  // settings 装载器命名空间指向 mock home（engine-config-settings.test.ts 先例）
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = MOCK_HOME
  resetAutoModeStateForTesting()
  resetSettingsCache()
})

afterEach(() => {
  if (savedFeature === undefined) delete process.env[FEATURE_KEY]
  else process.env[FEATURE_KEY] = savedFeature
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
  resetAutoModeStateForTesting()
  setOriginalFsImplementation()
  resetSettingsCache()
})

describe('② shouldPlanUseAutoMode 门链（逐行对照 CC 1446-1455，settings 单源）', () => {
  test('feature 关 → false', () => {
    process.env[FEATURE_KEY] = 'false'
    seedUserSettings(OPT_IN)
    expect(shouldPlanUseAutoMode()).toBe(false)
  })

  test('opt-in 缺失（无 skipAutoPermissionPrompt）→ false', () => {
    seedUserSettings({})
    expect(shouldPlanUseAutoMode()).toBe(false)
  })

  test('opt-in + 断路器跳闸（circuitBroken）→ false', () => {
    seedUserSettings(OPT_IN)
    setAutoModeCircuitBroken(true)
    expect(shouldPlanUseAutoMode()).toBe(false)
  })

  test('opt-in + settings 禁用（disableAutoMode）→ false', () => {
    seedUserSettings({ ...OPT_IN, disableAutoMode: 'disable' })
    expect(shouldPlanUseAutoMode()).toBe(false)
  })

  test('opt-in + useAutoModeDuringPlan=false → false', () => {
    seedUserSettings({ ...OPT_IN, useAutoModeDuringPlan: false })
    expect(shouldPlanUseAutoMode()).toBe(false)
  })

  test('全绿（opt-in + gate 开 + 默认 plan×auto）→ true', () => {
    seedUserSettings(OPT_IN)
    expect(shouldPlanUseAutoMode()).toBe(true)
  })
})

describe('② isAutoModeGateEnabled / getAutoModeUnavailableReason（engine 双源）', () => {
  test('断路器跳闸 → gate 关 + reason circuit-breaker', () => {
    seedUserSettings(null)
    setAutoModeCircuitBroken(true)
    expect(isAutoModeGateEnabled()).toBe(false)
    expect(getAutoModeUnavailableReason()).toBe('circuit-breaker')
  })

  test('settings 禁用 → gate 关 + reason settings', () => {
    seedUserSettings({ disableAutoMode: 'disable' })
    expect(isAutoModeGateEnabled()).toBe(false)
    expect(getAutoModeUnavailableReason()).toBe('settings')
  })

  test('双源全清 → gate 开 + reason null', () => {
    seedUserSettings(null)
    expect(isAutoModeGateEnabled()).toBe(true)
    expect(getAutoModeUnavailableReason()).toBeNull()
  })

  test('谓词面在场：hasAutoModeOptIn / getUseAutoModeDuringPlan 直读面', () => {
    seedUserSettings(OPT_IN)
    expect(hasAutoModeOptIn()).toBe(true)
    expect(getUseAutoModeDuringPlan()).toBe(true)
    seedUserSettings({ ...OPT_IN, useAutoModeDuringPlan: false })
    resetSettingsCache() // fs 重 seed 须清缓存（cache 按装载时刻快照）
    expect(getUseAutoModeDuringPlan()).toBe(false)
  })
})

describe('② prepareContextForPlanMode auto 语义支（逐行对照 CC 1462-1495）', () => {
  test('P11 验收锚点①：opt-in auto 用户（mode=default）EnterPlanMode → isAutoModeActive()==true', () => {
    seedUserSettings(OPT_IN)
    expect(isAutoModeActive()).toBe(false)
    const out = prepareContextForPlanMode(makeTpc())
    expect(out.prePlanMode).toBe('default')
    expect(out.mode).toBe('default') // 调用方经 applyPermissionUpdate setMode 'plan'
    expect(isAutoModeActive()).toBe(true) // ① 处置：plan 内分类器活跃
  })

  test('mode=auto + planAutoMode → prePlanMode=auto（auto 语义保留）', () => {
    seedUserSettings(OPT_IN)
    setAutoModeActive(true)
    const out = prepareContextForPlanMode(makeTpc({ mode: 'auto' }))
    expect(out.prePlanMode).toBe('auto')
    expect(isAutoModeActive()).toBe(true)
  })

  test('mode=auto + !planAutoMode（useAutoModeDuringPlan=false）→ 失活 + prePlanMode=auto', () => {
    seedUserSettings({ ...OPT_IN, useAutoModeDuringPlan: false })
    setAutoModeActive(true)
    const out = prepareContextForPlanMode(makeTpc({ mode: 'auto' }))
    expect(out.prePlanMode).toBe('auto')
    expect(isAutoModeActive()).toBe(false)
  })

  test('mode=bypassPermissions + planAutoMode → plain（不激 auto）', () => {
    seedUserSettings(OPT_IN)
    const out = prepareContextForPlanMode(
      makeTpc({ mode: 'bypassPermissions' }),
    )
    expect(out.prePlanMode).toBe('bypassPermissions')
    expect(isAutoModeActive()).toBe(false)
  })

  test('mode=plan（已在 plan）→ 原引用返回', () => {
    seedUserSettings(null)
    const tpc = makeTpc({ mode: 'plan' })
    expect(prepareContextForPlanMode(tpc)).toBe(tpc)
  })

  test('feature 关 → 全分支 plain（零激活）', () => {
    process.env[FEATURE_KEY] = 'false'
    seedUserSettings(OPT_IN)
    const out = prepareContextForPlanMode(makeTpc())
    expect(out.prePlanMode).toBe('default')
    expect(isAutoModeActive()).toBe(false)
  })
})

describe('② strip·restoreDangerousPermissions 契约形（检测族登记 C 桶 ② = 空集支）', () => {
  test('strip 空集支：保留既有 stash（?? {} 形状锁定）', () => {
    const tpc = makeTpc({
      strippedDangerousRules: { userSettings: ['Bash(python:*)'] },
    })
    const out = stripDangerousPermissionsForAutoMode(tpc)
    expect(out.strippedDangerousRules).toEqual({
      userSettings: ['Bash(python:*)'],
    })
    const noStash = stripDangerousPermissionsForAutoMode(makeTpc())
    expect(noStash.strippedDangerousRules).toEqual({})
  })

  test('restore：stash 回添 alwaysAllowRules + 清 stash', () => {
    const tpc = makeTpc({
      alwaysAllowRules: { userSettings: ['Read(//tmp)'] },
      strippedDangerousRules: { userSettings: ['Bash(python:*)'] },
    })
    const out = restoreDangerousPermissions(tpc)
    expect(out.strippedDangerousRules).toBeUndefined()
    expect(out.alwaysAllowRules.userSettings).toEqual([
      'Read(//tmp)',
      'Bash(python:*)',
    ])
  })

  test('restore 无 stash → 原引用返回', () => {
    const tpc = makeTpc()
    expect(restoreDangerousPermissions(tpc)).toBe(tpc)
  })
})

// ── ExitPlanModeV2Tool plan 退出 kick-out（TUI exit 303-383 同构）─────────

type ExitCtxDuck = {
  agentId?: string
  setAppState(
    updater: (
      prev: { toolPermissionContext: ToolPermissionContext },
    ) => { toolPermissionContext: ToolPermissionContext },
  ): void
}

/** 驱动 exit 工具 call（args={} → 盘上 plan 缺 = null 面），返回 updater 应用后的状态。 */
async function runExitCall(
  planTpc: ToolPermissionContext,
): Promise<{ toolPermissionContext: ToolPermissionContext }> {
  let updater:
    | ((
        prev: { toolPermissionContext: ToolPermissionContext },
      ) => { toolPermissionContext: ToolPermissionContext })
    | undefined
  const ctx: ExitCtxDuck = {
    setAppState(up) {
      updater = up
    },
  }
  await ExitPlanModeV2Tool.call({}, ctx)
  if (!updater) throw new Error('exit call 未走 setAppState（plan 守卫未命中？）')
  return updater({ toolPermissionContext: planTpc })
}

describe('② ExitPlanModeV2Tool plan 退出 kick-out（CC :1233-1248 模式）', () => {
  test('prePlanMode=auto + gate 开 → 恢复 auto + setAutoModeActive(true)（re-strip 保 stash）', async () => {
    seedUserSettings(OPT_IN)
    setAutoModeActive(false)
    const after = await runExitCall(
      makeTpc({
        mode: 'plan',
        prePlanMode: 'auto',
        strippedDangerousRules: { userSettings: ['Bash(python:*)'] },
      }),
    )
    expect(after.toolPermissionContext.mode).toBe('auto')
    expect(after.toolPermissionContext.prePlanMode).toBeUndefined()
    expect(after.toolPermissionContext.strippedDangerousRules).toEqual({
      userSettings: ['Bash(python:*)'],
    })
    expect(isAutoModeActive()).toBe(true)
  })

  test('prePlanMode=auto + 断路器跳闸 → gate-off fallback default + setAutoModeActive(false)', async () => {
    seedUserSettings(OPT_IN)
    setAutoModeCircuitBroken(true)
    setAutoModeActive(true)
    const after = await runExitCall(
      makeTpc({ mode: 'plan', prePlanMode: 'auto' }),
    )
    expect(after.toolPermissionContext.mode).toBe('default')
    expect(isAutoModeActive()).toBe(false)
  })

  test('prePlanMode=default + plan 内用过 auto → kick-out 失活（autoWasUsedDuringPlan）', async () => {
    seedUserSettings(OPT_IN)
    setAutoModeActive(true)
    const after = await runExitCall(
      makeTpc({ mode: 'plan', prePlanMode: 'default' }),
    )
    expect(after.toolPermissionContext.mode).toBe('default')
    expect(isAutoModeActive()).toBe(false)
  })

  test('非 auto 恢复 + stash 在场 → 规则回添', async () => {
    seedUserSettings(null)
    const after = await runExitCall(
      makeTpc({
        mode: 'plan',
        prePlanMode: 'default',
        alwaysAllowRules: {},
        strippedDangerousRules: { userSettings: ['Bash(python:*)'] },
      }),
    )
    expect(after.toolPermissionContext.mode).toBe('default')
    expect(after.toolPermissionContext.strippedDangerousRules).toBeUndefined()
    expect(after.toolPermissionContext.alwaysAllowRules.userSettings).toEqual([
      'Bash(python:*)',
    ])
  })

  test('mode≠plan → 原态返回（守卫不动状态机）', async () => {
    seedUserSettings(null)
    const tpc = makeTpc({ mode: 'default' })
    const after = await runExitCall(tpc)
    expect(after.toolPermissionContext).toBe(tpc)
    expect(isAutoModeActive()).toBe(false)
  })
})
