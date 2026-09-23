/**
 * engine/config 类型面 + 源层 + 三层缓存 + managedPath + configRoot 契约测试（§8.27 E-3 S-3a）。
 *
 * 被测能力（切片 S-3a 全表面）：
 *   - SettingsSchema（zod v4 全 optional + .passthrough()）：合法解析 / 未知字段
 *     透传 / providers 补声明 / env 值字符串约束 / defaultShell 字面量约束
 *   - 源层常量：SETTING_SOURCES 5 层顺序 + getEnabledSettingSources 三源并集 +
 *     isSettingSourceEnabled
 *   - 三层缓存：perSource miss(undefined) vs 缓存 null 语义 / session 缓存 /
 *     parseFile 缓存 / resetSettingsCache 三缓存同失效 / pluginSettingsBase 接缝
 *   - managedPath：Linux 单支 /etc/atlas + drop-in 目录
 *   - configRoot：ATLAS_CONFIG_DIR 目录级 env 覆盖 + 默认 homedir()/.atlas
 * I/O-free（无盘 / 无网络 / 无 PTY）→ unit 层。env 变更 test 内 save/restore。
 */
import { describe, test, expect } from 'bun:test'
import { homedir } from 'os'
import { join } from 'path'
import {
  SettingsSchema,
  SETTING_SOURCES,
  getEnabledSettingSources,
  isSettingSourceEnabled,
  type EditableSettingSource,
  type SettingsJson,
  getSessionSettingsCache,
  setSessionSettingsCache,
  getCachedSettingsForSource,
  setCachedSettingsForSource,
  getCachedParsedFile,
  setCachedParsedFile,
  resetSettingsCache,
  getPluginSettingsBase,
  setPluginSettingsBase,
  clearPluginSettingsBase,
  getManagedSettingsDir,
  getManagedSettingsDropInDir,
  getAtlasConfigHomeDir,
} from '../../src/engine'
import { getConfigDirName } from '../../src/shared'

describe('engine/config SettingsSchema（§8.27 S-3a）', () => {
  test('合法 settings 全字段族解析，值逐字透传', () => {
    const input = {
      model: 'atlas-small',
      modelRoles: { small: { provider: 'openai', model: 'gpt-x' } },
      effortLevel: 'high',
      effortByModel: { 'atlas-small': 'low' },
      providers: { openai: { baseURL: 'http://localhost:9090', apiKey: 'k' } },
      env: { DEBUG: '1' },
      mcpServers: { fs: { serverCommand: 'node fs-server.js' } },
      enabledMcpjsonServers: ['fs'],
      sandbox: { enabled: true },
      permissions: { defaultMode: 'plan' },
      hooks: { PreToolUse: [] },
      disableAllHooks: false,
      autoMemoryEnabled: true,
      autoMemoryDirectory: '/tmp/mem',
      claudeMdExcludes: ['legacy/'],
      defaultShell: 'bash',
      skipWebFetchPreflight: true,
    }
    const out = SettingsSchema().parse(input)
    expect(out.model).toBe('atlas-small')
    expect(out.modelRoles?.['small']).toEqual({ provider: 'openai', model: 'gpt-x' })
    expect(out.providers?.['openai']).toEqual({ baseURL: 'http://localhost:9090', apiKey: 'k' })
    expect(out.env).toEqual({ DEBUG: '1' })
    expect(out.enabledMcpjsonServers).toEqual(['fs'])
    expect(out.defaultShell).toBe('bash')
  })

  test('未知字段 passthrough 透传不报错（用户文件向前兼容）', () => {
    const out = SettingsSchema().parse({ totallyUnknown: 42, nested: { a: [1, 2] } })
    expect((out as Record<string, unknown>).totallyUnknown).toBe(42)
    expect((out as Record<string, unknown>).nested).toEqual({ a: [1, 2] })
  })

  test('providers 补声明（旧仓靠 passthrough，新仓显式 z.record 声明）', () => {
    const out = SettingsSchema().parse({ providers: { p1: { x: 1 } } })
    // 类型面：providers 是 Record<string, any> | undefined（非 any 兜底）
    const providers: Record<string, unknown> | undefined = out.providers
    expect(providers?.['p1']).toEqual({ x: 1 })
  })

  test('env 值必须为字符串（number 拒收）', () => {
    const res = SettingsSchema().safeParse({ env: { A: 1 } })
    expect(res.success).toBe(false)
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('env.A')
    }
  })

  test('defaultShell 字面量约束（bash/powershell 之外拒收）', () => {
    expect(SettingsSchema().safeParse({ defaultShell: 'zsh' }).success).toBe(false)
    expect(SettingsSchema().parse({ defaultShell: 'powershell' }).defaultShell).toBe('powershell')
  })
})

describe('engine/config 源层常量（§8.27 S-3a）', () => {
  test('SETTING_SOURCES 5 层，顺序 = 合并优先级（后源压前源）', () => {
    expect(SETTING_SOURCES).toEqual([
      'userSettings',
      'projectSettings',
      'localSettings',
      'flagSettings',
      'policySettings',
    ])
  })

  test('getEnabledSettingSources = allowed(userSettings) ∪ policy ∪ flag（级联遍历序）', () => {
    expect(getEnabledSettingSources()).toEqual([
      'userSettings',
      'policySettings',
      'flagSettings',
    ])
  })

  test('isSettingSourceEnabled：级联三源 true，project/local 非级联 false', () => {
    expect(isSettingSourceEnabled('userSettings')).toBe(true)
    expect(isSettingSourceEnabled('policySettings')).toBe(true)
    expect(isSettingSourceEnabled('flagSettings')).toBe(true)
    expect(isSettingSourceEnabled('projectSettings')).toBe(false)
    expect(isSettingSourceEnabled('localSettings')).toBe(false)
  })

  test('EditableSettingSource 类型面可作写回源约束（user/project/local）', () => {
    // 类型层断言（编译期）：policy/flag 被 Exclude 排除，三可写源可赋值
    const editable: EditableSettingSource[] = ['userSettings', 'projectSettings', 'localSettings']
    expect(editable).toHaveLength(3)
  })
})

describe('engine/config 三层缓存（§8.27 S-3a）', () => {
  // 模块级缓存跨 test 共享 → 按「先 miss 探测、再 set、后 reset 清态」编排
  test('perSource miss = undefined（未缓存），区别于缓存 null（该源无 settings）', () => {
    expect(getCachedSettingsForSource('userSettings')).toBeUndefined()
  })

  test('setCachedSettingsForSource：null 缓存「无 settings 结论」，对象缓存 settings', () => {
    setCachedSettingsForSource('userSettings', null)
    expect(getCachedSettingsForSource('userSettings')).toBeNull()
    const json: SettingsJson = { model: 'm1' }
    setCachedSettingsForSource('policySettings', json)
    expect(getCachedSettingsForSource('policySettings')).toBe(json)
  })

  test('session 缓存 + parseFile 缓存读写', () => {
    expect(getSessionSettingsCache()).toBeNull()
    const merged = { settings: {} as SettingsJson, errors: [] as never[] }
    setSessionSettingsCache(merged)
    expect(getSessionSettingsCache()).toBe(merged)

    expect(getCachedParsedFile('/etc/atlas/managed-settings.json')).toBeUndefined()
    const parsed = { settings: null, errors: [] }
    setCachedParsedFile('/etc/atlas/managed-settings.json', parsed)
    expect(getCachedParsedFile('/etc/atlas/managed-settings.json')).toBe(parsed)
  })

  test('resetSettingsCache 三缓存同失效', () => {
    expect(getSessionSettingsCache()).not.toBeNull()
    expect(getCachedSettingsForSource('userSettings')).toBeNull()
    expect(getCachedParsedFile('/etc/atlas/managed-settings.json')).toBeDefined()
    resetSettingsCache()
    expect(getSessionSettingsCache()).toBeNull()
    expect(getCachedSettingsForSource('userSettings')).toBeUndefined()
    expect(getCachedParsedFile('/etc/atlas/managed-settings.json')).toBeUndefined()
  })

  test('pluginSettingsBase 预声明接缝：get 初值 undefined / set / clear', () => {
    expect(getPluginSettingsBase()).toBeUndefined()
    setPluginSettingsBase({ env: { A: '1' } })
    expect(getPluginSettingsBase()).toEqual({ env: { A: '1' } })
    clearPluginSettingsBase()
    expect(getPluginSettingsBase()).toBeUndefined()
  })
})

describe('engine/config managedPath（§8.27 S-3a，Linux 单支）', () => {
  test('managed 目录 = /etc/atlas，drop-in = 其下 managed-settings.d', () => {
    expect(getManagedSettingsDir()).toBe('/etc/atlas')
    expect(getManagedSettingsDropInDir()).toBe('/etc/atlas/managed-settings.d')
  })
})

describe('engine/config configRoot（§8.27 S-3a）', () => {
  const KEYS = ['ATLAS_CONFIG_DIR', 'ATLAS_CONFIG_DIR_NAME'] as const
  let saved: Record<(typeof KEYS)[number], string | undefined>

  function withEnv(mutate: () => void, fn: () => void) {
    saved = {}
    for (const k of KEYS) saved[k] = process.env[k]
    delete process.env.ATLAS_CONFIG_DIR
    delete process.env.ATLAS_CONFIG_DIR_NAME
    mutate()
    try {
      fn()
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
      }
    }
  }

  test('ATLAS_CONFIG_DIR 目录级 env 显式覆盖整个配置根', () => {
    withEnv(
      () => {
        process.env.ATLAS_CONFIG_DIR = '/tmp/atlas-cfg-test'
      },
      () => {
        expect(getAtlasConfigHomeDir()).toBe('/tmp/atlas-cfg-test')
      },
    )
  })

  test('无 env 时默认 homedir() + getConfigDirName()（.atlas，动态解析不硬编码）', () => {
    withEnv(
      () => {},
      () => {
        expect(getAtlasConfigHomeDir()).toBe(join(homedir(), getConfigDirName()))
      },
    )
  })

  test('ATLAS_CONFIG_DIR_NAME 仅改目录名（ATLAS_CONFIG_DIR 优先于目录名）', () => {
    withEnv(
      () => {
        process.env.ATLAS_CONFIG_DIR_NAME = '.atlas-x'
      },
      () => {
        expect(getAtlasConfigHomeDir()).toBe(join(homedir(), '.atlas-x'))
      },
    )
    withEnv(
      () => {
        process.env.ATLAS_CONFIG_DIR = '/explicit/root'
        process.env.ATLAS_CONFIG_DIR_NAME = '.atlas-x'
      },
      () => {
        expect(getAtlasConfigHomeDir()).toBe('/explicit/root')
      },
    )
  })
})
