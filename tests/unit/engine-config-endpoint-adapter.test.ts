/**
 * engine/config settings-adapter（EndpointConfigSource settings 面）+ compose
 * 装配 契约测试（§8.29 E-3 S-3d）。
 *
 * 被测能力：
 *   - createEndpointConfigSource 三方法（getRoleSetting = settings.modelRoles[role]
 *     / getProviders = settings.providers / getGlobalApiKey = env OpenAI 静态键
 *     回落，旧仓 keychain 面残留守）
 *   - compose 装配后 settings 生效（createCoreDependencies 注入 settings 面，
 *     替换 B6-func env-only 版）+ applySafe 接线判别（trusted 源 env 入
 *     process.env，roles lane env 读之前生效）
 *   - 池头解析（getRoleModel 池头 = modelRoles.small.models 首 ref 经
 *     resolveModel → modelId；旧仓 e2e banner 动态断言的 modelprovider 侧——
 *     provider 前缀剥离 = TUI 展示面，新仓无 TUI，残留守）
 *
 * 语义注（§8.29 实施期勘误，旧仓 ground truth）：getRoleModels 的池 bare ref
 * 不经 normalizeRef（仅 env/sessionModel 支归一化，旧仓 roles.ts:167-173 逐字
 * 可验真）→ 池头须为全 ref（'provider/model-id'）才经 providers 解析；池 bare
 * id 在旧仓同样不可解析（resolveModel provider 查无 → undefined，不假完成）。
 *   - resetEndpointConfigSource 跨 case 回归（注入 settings 面后 reset →
 *     裸空 stub：池头不可解析 → undefined；无 reset 则模块态泄漏跨 case）
 * mock fs + ATLAS_CONFIG_DIR 指向 /mock-home（unit 层无真实磁盘）。
 *
 * 运行口径注（§8.30 T-6）：compose 装配测试经 createCoreDependencies 注入
 * 7 组模块态窗口（hooks 快照+provider / permissions settingsPaths /
 * executor 三 port / task port / bootstrap env）；本文件 afterEach 仅复位
 * endpoint source + settings cache（其余窗口由各自域测试的 reset 助手负责）。
 * 标准跑法 `bun test --isolate` 每文件独立进程，无跨文件泄漏；单进程 ad-hoc
 * 多文件连跑时本文件注入的窗口可波及后续文件（如 hooks 域 fail-fast 断言
 * 会见到已注入态）——此类跑法须本文件排前或逐文件 isolate。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import {
  createEndpointConfigSource,
  createCoreDependencies,
} from '../../src/atlascode'
import { getRoleModel, resetEndpointConfigSource } from '../../src/modelprovider'
import { resetSettingsCache } from '../../src/engine'
import {
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
} from '../../src/shared'

function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${path}'`)
  err.code = 'ENOENT'
  return err
}

function makeMockFs(
  files: Record<string, string> = {},
): { ops: FsOperations; files: Map<string, string> } {
  const fileMap = new Map(Object.entries(files))
  const ops: FsOperations = {
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
    readdirSync: p => {
      // 本测无 managed drop-in 面（drop-in 目录恒 ENOENT，loadManagedFileSettings 静默）
      throw enoent(p)
    },
    writeFileSync: (p, data) => {
      fileMap.set(p, data)
    },
    mkdirSync: () => {},
  }
  return { ops, files: fileMap }
}

const MOCK_HOME = '/mock-home'
const USER_SETTINGS = join(MOCK_HOME, 'settings.json')

/** settings 面角色池 fixture（池头解析链：全 ref 'iff/gelu' 经 providers
 * resolveModel → modelId 'gelu'；池 bare ref 不归一化，见头注语义注）。 */
const ROLE_POOL_SETTINGS = JSON.stringify({
  modelRoles: { small: { models: ['iff/gelu'] } },
  providers: {
    iff: {
      baseURL: 'http://iff.local',
      apiKey: 'iff-key',
      models: [{ id: 'gelu', contextWindow: 8192 }],
    },
  },
})

/** 被测函数会写/读的 env 键全集（存还隔离，防污染后续用例）。 */
const TRACKED_ENV_KEYS = [
  'ATLAS_SMALL_MODEL',
  'ATLAS_SMALL_PROVIDER',
  'ATLAS_PREMIUM_MODEL',
  'ATLAS_FAST_MODEL',
  'OPENAI_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'DISABLE_COMPACT',
  'ATLAS_AUTOCOMPACT_PCT_OVERRIDE',
  'ATLAS_AUTO_COMPACT_WINDOW',
]

let savedEnv: Record<string, string | undefined> = {}
let savedConfigDir: string | undefined

beforeEach(() => {
  savedEnv = {}
  for (const k of TRACKED_ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = MOCK_HOME
  resetSettingsCache()
  resetEndpointConfigSource()
})

afterEach(() => {
  for (const k of TRACKED_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  setOriginalFsImplementation()
  resetEndpointConfigSource()
  resetSettingsCache()
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
})

// ── adapter 三方法（settings 面直读）──────────────────────────────────

describe('engine/config createEndpointConfigSource（§8.29 settings 面）', () => {
  test('getRoleSetting = settings.modelRoles[role]（命中/缺省 {}）', () => {
    const m = makeMockFs({ [USER_SETTINGS]: ROLE_POOL_SETTINGS })
    setFsImplementation(m.ops)
    const adapter = createEndpointConfigSource()
    expect(adapter.getRoleSetting('small')).toEqual({ models: ['iff/gelu'] })
    // 未定义角色 → {}（roles.ts 角色解析回落默认 provider，不假完成）
    expect(adapter.getRoleSetting('premium')).toEqual({})
  })

  test('getRoleSetting：settings 无 modelRoles → {}', () => {
    const m = makeMockFs({ [USER_SETTINGS]: '{}' })
    setFsImplementation(m.ops)
    expect(createEndpointConfigSource().getRoleSetting('small')).toEqual({})
  })

  test('getProviders = settings.providers（命中/缺省 {}）', () => {
    const m = makeMockFs({ [USER_SETTINGS]: ROLE_POOL_SETTINGS })
    setFsImplementation(m.ops)
    const adapter = createEndpointConfigSource()
    expect(adapter.getProviders()).toEqual({
      iff: {
        baseURL: 'http://iff.local',
        apiKey: 'iff-key',
        models: [{ id: 'gelu', contextWindow: 8192 }],
      },
    })
    // 切 mock fs 后清 settings 缓存（S-3a 三层缓存：同路径解析结果缓存，
    // 不清则第二次读命中首次的 ROLE_POOL_SETTINGS 缓存）
    const m2 = makeMockFs({ [USER_SETTINGS]: '{}' })
    setFsImplementation(m2.ops)
    resetSettingsCache()
    expect(createEndpointConfigSource().getProviders()).toEqual({})
  })

  test('getGlobalApiKey = env OpenAI 静态键（AUTH_TOKEN 优先 / 双缺 undefined）', () => {
    const m = makeMockFs({ [USER_SETTINGS]: '{}' })
    setFsImplementation(m.ops)
    const adapter = createEndpointConfigSource()
    process.env.OPENAI_AUTH_TOKEN = 'token'
    process.env.OPENAI_API_KEY = 'key'
    expect(adapter.getGlobalApiKey()).toBe('token')
    delete process.env.OPENAI_AUTH_TOKEN
    expect(adapter.getGlobalApiKey()).toBe('key')
    delete process.env.OPENAI_API_KEY
    expect(adapter.getGlobalApiKey()).toBeUndefined()
  })
})

// ── compose 装配后 settings 生效 + 池头解析 ───────────────────────────

describe('compose 装配 settings 面（§8.29 替换 env-only 版）', () => {
  test('createCoreDependencies → 池头解析生效 + applySafe 接线判别', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        modelRoles: { small: { models: ['iff/gelu'] } },
        providers: {
          iff: {
            baseURL: 'http://iff.local',
            apiKey: 'iff-key',
            models: [{ id: 'gelu', contextWindow: 8192 }],
          },
        },
        env: { ATLAS_SMALL_PROVIDER: 'iff' },
      }),
    })
    setFsImplementation(m.ops)
    createCoreDependencies()
    // settings 面生效：池头全 ref 'iff/gelu' 经 providers resolveModel → modelId
    expect(getRoleModel('small')).toBe('gelu')
    // applySafe 接线判别（§8.29 落点 5）：trusted 源（userSettings）env 已入
    // process.env（roles lane env 读之前生效；ATLAS_SMALL_PROVIDER 不改变
    // getRoleModel 解析，纯判别信号）
    expect(process.env.ATLAS_SMALL_PROVIDER).toBe('iff')
  })

  test('池头全 ref 直通（provider/model-id 不经 normalizeRef 二次前缀）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        modelRoles: { small: { models: ['iff/gelu'] } },
        providers: {
          iff: { models: [{ id: 'gelu' }] },
        },
      }),
    })
    setFsImplementation(m.ops)
    createCoreDependencies()
    expect(getRoleModel('small')).toBe('gelu')
  })

  test('roleSetting.model 直读优先于池头（旧仓 getRoleConfig 三源序）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        modelRoles: {
          small: { model: 'direct-small', models: ['iff/gelu'] },
        },
        providers: { iff: { models: [{ id: 'gelu' }] } },
      }),
    })
    setFsImplementation(m.ops)
    createCoreDependencies()
    expect(getRoleModel('small')).toBe('direct-small')
  })

  test('providers 缺失 → 池头不可解析 → undefined（不假完成）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        modelRoles: { small: { models: ['ghost'] } },
      }),
    })
    setFsImplementation(m.ops)
    createCoreDependencies()
    // 池头 'ghost'（bare，池 bare ref 不归一化，见头注语义注）→
    // resolveModel provider 查无 → undefined（不假完成）
    expect(getRoleModel('small')).toBeUndefined()
  })
})

// ── resetEndpointConfigSource 跨 case 回归 ───────────────────────────

describe('resetEndpointConfigSource（§8.29 跨 case 场景）', () => {
  test('注入 settings 面后 reset → 裸空 stub（池头不可解析回归）', () => {
    // 前置：注入 settings 面（跨 case 场景——前序 describe 的 compose 装配已
    // 注入；本 case 重注入确保自足）
    const m = makeMockFs({ [USER_SETTINGS]: ROLE_POOL_SETTINGS })
    setFsImplementation(m.ops)
    createCoreDependencies()
    expect(getRoleModel('small')).toBe('gelu')
    // reset 后 = 未注入空 stub 态（env 车道 + settings 面全失效 → 池头 undefined）
    resetEndpointConfigSource()
    expect(getRoleModel('small')).toBeUndefined()
  })
})
