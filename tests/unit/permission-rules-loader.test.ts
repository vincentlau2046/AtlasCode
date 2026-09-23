/**
 * engine/permissions 规则磁盘加载/写回 契约测试（E-4 S-4c1，§8.34 门）
 *
 * 被测面（permissionRulesLoader，旧 permissionsLoader 296L 全迁 +
 * deletePermissionRule ⑩ 签名 + syncPermissionRulesFromDisk 接缝⑤）：
 *   - settings→规则转换（无文件 [] / 按源 / managed-only 单源）
 *   - add 写回短路族（空 ruleValues 不写盘 / 重复规则归一去重 /
 *     不识别键保留）+ delete 短路族（无 settings / 无行为数组 / 未命中）
 *   - deletePermissionRule：只读源 throw / 内存源（cliArg）仅 context 更新 /
 *     写回源（userSettings）规则移除 + context 更新
 *   - syncPermissionRulesFromDisk：盘源清除支（盘上删规则后 sync 清旧规则）
 *     + replace 累积 + managed-only 全清
 * I/O-free（mock FsOperations 注入 + ATLAS_CONFIG_DIR → /mock-home，
 * 同 engine-config-settings.test.ts 口径，unit 零磁盘层）。
 * 真盘 round-trip（add → 重载出现 / delete 消失）归
 * tests/func/permission-rules-roundtrip.test.ts。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import {
  shouldAllowManagedPermissionRulesOnly,
  loadAllPermissionRulesFromDisk,
  getPermissionRulesForSource,
  addPermissionRulesToSettings,
  deletePermissionRuleFromSettings,
  deletePermissionRule,
  syncPermissionRulesFromDisk,
  resetSettingsCache,
  type ToolPermissionContext,
} from '../../src/engine'
import {
  setLegacyToolNameAliases as setAliases,
  resetLegacyToolNameAliases as resetAliases,
} from '../../src/permissions'
import {
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
} from '../../src/shared'

// ── mock FsOperations：文件 map，I/O-free（同 engine-config-settings 口径）─
function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${path}'`)
  err.code = 'ENOENT'
  return err
}

const MOCK_HOME = '/mock-home'
const USER_SETTINGS = join(MOCK_HOME, 'settings.json')
const MANAGED_BASE = '/etc/atlas/managed-settings.json'
const DROP_IN_DIR = '/etc/atlas/managed-settings.d'

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
      if (p === DROP_IN_DIR) {
        throw enoent(p)
      }
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

beforeEach(() => {
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = MOCK_HOME
  files = new Map()
  setFsImplementation(makeMockFs())
  resetSettingsCache()
})

afterEach(() => {
  setOriginalFsImplementation()
  resetSettingsCache()
  resetAliases()
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
})

// ── settings → 规则转换 ─────────────────────────────────────────────────

describe('settings→规则转换（settingsJsonToRules 经 loadAll/getForSource）', () => {
  test('无 settings 文件 → 全源空规则集', () => {
    expect(loadAllPermissionRulesFromDisk()).toEqual([])
    expect(getPermissionRulesForSource('userSettings')).toEqual([])
  })

  test('user 文件三行为规则全装载（parse 经域 parser：Bash(npm install) 拆分）', () => {
    files.set(
      USER_SETTINGS,
      JSON.stringify({
        permissions: {
          allow: ['Bash(npm install)'],
          deny: ['Read'],
          ask: ['WebFetch'],
        },
      }),
    )
    const rules = loadAllPermissionRulesFromDisk()
    expect(rules).toEqual([
      {
        source: 'userSettings',
        ruleBehavior: 'allow',
        ruleValue: { toolName: 'Bash', ruleContent: 'npm install' },
      },
      { source: 'userSettings', ruleBehavior: 'deny', ruleValue: { toolName: 'Read' } },
      { source: 'userSettings', ruleBehavior: 'ask', ruleValue: { toolName: 'WebFetch' } },
    ])
  })
})

// ── managed-only 支（policySettings 缓存注水，零盘）────────────────────

describe('managed-only（allowManagedPermissionRulesOnly）', () => {
  test('policy 文件置位 → 判定 true + 全源加载只取 policy 规则', () => {
    files.set(
      MANAGED_BASE,
      JSON.stringify({
        allowManagedPermissionRulesOnly: true,
        permissions: { deny: ['Bash(curl:*)'] },
      }),
    )
    files.set(USER_SETTINGS, JSON.stringify({ permissions: { allow: ['Bash(x)'] } }))

    expect(shouldAllowManagedPermissionRulesOnly()).toBe(true)
    expect(loadAllPermissionRulesFromDisk()).toEqual([
      {
        source: 'policySettings',
        ruleBehavior: 'deny',
        ruleValue: { toolName: 'Bash', ruleContent: 'curl:*' },
      },
    ])
  })

  test('managed-only → add 写回守卫 false（不落盘）', () => {
    files.set(MANAGED_BASE, JSON.stringify({ allowManagedPermissionRulesOnly: true }))
    expect(
      addPermissionRulesToSettings(
        {
          ruleValues: [{ toolName: 'Bash', ruleContent: 'x' }],
          ruleBehavior: 'allow',
        },
        'userSettings',
      ),
    ).toBe(false)
    expect(files.has(USER_SETTINGS)).toBe(false)
  })

  test('managed-only → sync 清全源（含 cliArg/session 内存源）', () => {
    files.set(MANAGED_BASE, JSON.stringify({ allowManagedPermissionRulesOnly: true }))
    const ctx: ToolPermissionContext = {
      ...makeContext(),
      alwaysAllowRules: { userSettings: ['Bash(a)'], cliArg: ['Grep'] },
    }
    const result = syncPermissionRulesFromDisk(ctx, [])
    expect(result.alwaysAllowRules.userSettings).toEqual([])
    expect(result.alwaysAllowRules.cliArg).toEqual([])
  })
})

// ── add 写回短路族 ──────────────────────────────────────────────────────

describe('addPermissionRulesToSettings', () => {
  test('空 ruleValues → 短路 true 不写盘', () => {
    expect(
      addPermissionRulesToSettings({ ruleValues: [], ruleBehavior: 'allow' }, 'userSettings'),
    ).toBe(true)
    expect(files.has(USER_SETTINGS)).toBe(false)
  })

  test('重复规则归一去重（二次 add 同规则 = 幂等，盘上仅 1 条）', () => {
    expect(
      addPermissionRulesToSettings(
        { ruleValues: [{ toolName: 'Bash', ruleContent: 'npm install' }], ruleBehavior: 'allow' },
        'userSettings',
      ),
    ).toBe(true)
    expect(
      addPermissionRulesToSettings(
        { ruleValues: [{ toolName: 'Bash', ruleContent: 'npm install' }], ruleBehavior: 'allow' },
        'userSettings',
      ),
    ).toBe(true)
    const onDisk = JSON.parse(files.get(USER_SETTINGS)!)
    expect(onDisk.permissions.allow).toEqual(['Bash(npm install)'])
  })

  test('legacy 名与正规名归一同键（alias KillShell→TaskStop 去重）', () => {
    setAliases({ KillShell: 'TaskStop' })
    files.set(USER_SETTINGS, JSON.stringify({ permissions: { deny: ['KillShell'] } }))
    expect(
      addPermissionRulesToSettings(
        { ruleValues: [{ toolName: 'TaskStop' }], ruleBehavior: 'deny' },
        'userSettings',
      ),
    ).toBe(true)
    const onDisk = JSON.parse(files.get(USER_SETTINGS)!)
    expect(onDisk.permissions.deny).toEqual(['KillShell'])
  })

  test('不识别键保留（extra 字段经写回不丢）', () => {
    files.set(
      USER_SETTINGS,
      JSON.stringify({ permissions: { allow: ['Bash(a)'] }, extraKey: 42 }),
    )
    expect(
      addPermissionRulesToSettings(
        { ruleValues: [{ toolName: 'Bash', ruleContent: 'b' }], ruleBehavior: 'allow' },
        'userSettings',
      ),
    ).toBe(true)
    const onDisk = JSON.parse(files.get(USER_SETTINGS)!)
    expect(onDisk.permissions.allow).toEqual(['Bash(a)', 'Bash(b)'])
    expect(onDisk.extraKey).toBe(42)
  })
})

// ── delete 写回短路族 ───────────────────────────────────────────────────

describe('deletePermissionRuleFromSettings', () => {
  test('无 settings 文件 → false（空 settings 短路）', () => {
    expect(
      deletePermissionRuleFromSettings({
        source: 'userSettings',
        ruleBehavior: 'allow',
        ruleValue: { toolName: 'Bash' },
      }),
    ).toBe(false)
  })

  test('有 settings 无该行为数组 → false', () => {
    files.set(USER_SETTINGS, JSON.stringify({ permissions: { allow: ['Bash(x)'] } }))
    expect(
      deletePermissionRuleFromSettings({
        source: 'userSettings',
        ruleBehavior: 'deny',
        ruleValue: { toolName: 'Bash' },
      }),
    ).toBe(false)
  })

  test('数组中未命中 → false（归一后仍不匹配）', () => {
    files.set(USER_SETTINGS, JSON.stringify({ permissions: { allow: ['Bash(x)'] } }))
    expect(
      deletePermissionRuleFromSettings({
        source: 'userSettings',
        ruleBehavior: 'allow',
        ruleValue: { toolName: 'Read' },
      }),
    ).toBe(false)
  })

  test('命中移除 + 兄弟规则保留 + 不识别键保留', () => {
    files.set(
      USER_SETTINGS,
      JSON.stringify({ permissions: { allow: ['Bash(x)', 'Read'] }, extraKey: 7 }),
    )
    expect(
      deletePermissionRuleFromSettings({
        source: 'userSettings',
        ruleBehavior: 'allow',
        ruleValue: { toolName: 'Read' },
      }),
    ).toBe(true)
    const onDisk = JSON.parse(files.get(USER_SETTINGS)!)
    expect(onDisk.permissions.allow).toEqual(['Bash(x)'])
    expect(onDisk.extraKey).toBe(7)
  })

  test('legacy 名命中正规名删除（alias KillShell→TaskStop）', () => {
    setAliases({ KillShell: 'TaskStop' })
    files.set(USER_SETTINGS, JSON.stringify({ permissions: { deny: ['KillShell'] } }))
    expect(
      deletePermissionRuleFromSettings({
        source: 'userSettings',
        ruleBehavior: 'deny',
        ruleValue: { toolName: 'TaskStop' },
      }),
    ).toBe(true)
    const onDisk = JSON.parse(files.get(USER_SETTINGS)!)
    expect(onDisk.permissions.deny).toEqual([])
  })
})

// ── deletePermissionRule（⑩ 签名：setToolPermissionContext 回调）───────

describe('deletePermissionRule', () => {
  test('只读源（policySettings）→ throw 契约', async () => {
    let spy: ToolPermissionContext | undefined
    await expect(
      deletePermissionRule({
        rule: {
          source: 'policySettings',
          ruleBehavior: 'allow',
          ruleValue: { toolName: 'Bash' },
        },
        initialContext: makeContext(),
        setToolPermissionContext: ctx => {
          spy = ctx
        },
      }),
    ).rejects.toThrow('Cannot delete permission rules from read-only settings')
    expect(spy).toBeUndefined()
  })

  test('内存源（cliArg）→ 仅 context 更新，不写盘', async () => {
    const ctx: ToolPermissionContext = {
      ...makeContext(),
      alwaysDenyRules: { cliArg: ['Bash(rm -rf)'] },
    }
    let updated: ToolPermissionContext | undefined
    await deletePermissionRule({
      rule: {
        source: 'cliArg',
        ruleBehavior: 'deny',
        ruleValue: { toolName: 'Bash', ruleContent: 'rm -rf' },
      },
      initialContext: ctx,
      setToolPermissionContext: c => {
        updated = c
      },
    })
    expect(updated!.alwaysDenyRules.cliArg).toEqual([])
    expect(files.size).toBe(0)
  })

  test('写回源（userSettings 无文件）→ 写回 no-op 但 context 已更新', async () => {
    const ctx: ToolPermissionContext = {
      ...makeContext(),
      alwaysAllowRules: { userSettings: ['Bash(x)'] },
    }
    let updated: ToolPermissionContext | undefined
    await deletePermissionRule({
      rule: {
        source: 'userSettings',
        ruleBehavior: 'allow',
        ruleValue: { toolName: 'Bash', ruleContent: 'x' },
      },
      initialContext: ctx,
      setToolPermissionContext: c => {
        updated = c
      },
    })
    // 无盘上文件 → deletePermissionRuleFromSettings false（fire-and-forget），
    // 但内存 context 规则移除 + 回调必发生
    expect(updated!.alwaysAllowRules.userSettings).toEqual([])
  })
})

// ── syncPermissionRulesFromDisk（接缝⑤ 替换面）─────────────────────────

describe('syncPermissionRulesFromDisk', () => {
  test('盘源清除支：盘上无规则时清旧盘源规则（cliArg 内存源不动）', () => {
    const ctx: ToolPermissionContext = {
      ...makeContext(),
      alwaysAllowRules: { userSettings: ['Bash(stale)'], cliArg: ['Grep'] },
    }
    const result = syncPermissionRulesFromDisk(ctx, [])
    expect(result.alwaysAllowRules.userSettings).toEqual([])
    expect(result.alwaysAllowRules.cliArg).toEqual(['Grep'])
  })

  test('replace 累积：盘上规则替换入对应源', () => {
    const ctx = makeContext()
    const result = syncPermissionRulesFromDisk(ctx, [
      {
        source: 'userSettings',
        ruleBehavior: 'allow',
        ruleValue: { toolName: 'Bash', ruleContent: 'npm install' },
      },
      { source: 'localSettings', ruleBehavior: 'deny', ruleValue: { toolName: 'Read' } },
    ])
    expect(result.alwaysAllowRules.userSettings).toEqual(['Bash(npm install)'])
    expect(result.alwaysDenyRules.localSettings).toEqual(['Read'])
  })
})
