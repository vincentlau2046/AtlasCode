/**
 * engine/config managedEnv 应用面 契约测试（§8.27 E-3 S-3c，§8.28）。
 *
 * 被测能力：
 *   - applySafeConfigEnvironmentVariables（信任前）：trusted 源（user/flag/
 *     policy）全量 env + policy 最后压顶 + 合并面 SAFE_ENV_VARS 白名单
 *   - applyConfigEnvironmentVariables（信任后）：合并面全量 env
 *   - SAFE_ENV_VARS 白名单数据契约（危险变量不在列表）
 *   - 无 settings 时双函数 no-op 不炸
 *
 * 语义注（§8.28 残留守登记）：新仓级联 = user+policy+flag，合并面 ⊆
 * trusted 面，SAFE 白名单循环对当前级联是 no-op（旧仓 project/local 源
 * 贡献 merged-only env 时白名单才生效）——本测验证白名单数据契约 +
 * trusted 全量语义，不造 merged-only 源（不存在，造了 = 假装通过）。
 * process.env 经存还助手隔离（unit 层无网络/磁盘/PTY，env 面内存态可测）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import {
  applySafeConfigEnvironmentVariables,
  applyConfigEnvironmentVariables,
  SAFE_ENV_VARS,
  resetSettingsCache,
} from '../../src/engine'
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
const MANAGED_BASE = '/etc/atlas/managed-settings.json'

/** 被测函数会写的 env 键全集（存还隔离，防污染后续用例）。 */
const TRACKED_ENV_KEYS = [
  'OPENAI_BASE_URL',
  'LD_PRELOAD',
  'ATLAS_SMALL_MODEL',
  'ATLAS_MAX_OUTPUT_TOKENS',
  'PATH',
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
})

afterEach(() => {
  for (const k of TRACKED_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  setOriginalFsImplementation()
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
})

// ── applySafeConfigEnvironmentVariables（信任前）──────────────────────

describe('engine/config applySafeConfigEnvironmentVariables（§8.28 信任前）', () => {
  test('trusted 源全量 env + policy 最后压顶', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        env: { OPENAI_BASE_URL: 'http://user', ATLAS_SMALL_MODEL: 'small-user' },
      }),
      [MANAGED_BASE]: JSON.stringify({
        env: { OPENAI_BASE_URL: 'http://policy' },
      }),
    })
    setFsImplementation(m.ops)
    applySafeConfigEnvironmentVariables()
    // policy 压 user（policy 最后应用）
    expect(process.env.OPENAI_BASE_URL).toBe('http://policy')
    // user 独有键生效
    expect(process.env.ATLAS_SMALL_MODEL).toBe('small-user')
  })

  test('trusted 源全量语义：user 源危险键信任前亦生效（user 用户自控）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({ env: { LD_PRELOAD: '/user/lib.so' } }),
    })
    setFsImplementation(m.ops)
    applySafeConfigEnvironmentVariables()
    // 旧仓逐字语义：userSettings = 用户自控（非 project 攻击面），全量应用
    expect(process.env.LD_PRELOAD).toBe('/user/lib.so')
  })

  test('全源缺失 → no-op 不炸（env 不变）', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    process.env.PATH = '/usr/bin'
    applySafeConfigEnvironmentVariables()
    expect(process.env.PATH).toBe('/usr/bin')
  })
})

// ── applyConfigEnvironmentVariables（信任后）──────────────────────────

describe('engine/config applyConfigEnvironmentVariables（§8.28 信任后）', () => {
  test('合并面全量 env 应用（含非 SAFE 变量——信任后语义）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        env: { LD_PRELOAD: '/x.so', ATLAS_MAX_OUTPUT_TOKENS: '999' },
      }),
    })
    setFsImplementation(m.ops)
    applyConfigEnvironmentVariables()
    expect(process.env.LD_PRELOAD).toBe('/x.so')
    expect(process.env.ATLAS_MAX_OUTPUT_TOKENS).toBe('999')
  })

  test('无 settings → no-op 不炸', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    process.env.PATH = '/bin'
    applyConfigEnvironmentVariables()
    expect(process.env.PATH).toBe('/bin')
  })
})

// ── SAFE_ENV_VARS 白名单数据契约 ───────────────────────────────────────

describe('engine/config SAFE_ENV_VARS 白名单（§8.28 数据契约）', () => {
  test('安全变量在列表（模型角色/超时/遥测关闭族）', () => {
    expect(SAFE_ENV_VARS.has('ATLAS_SMALL_MODEL')).toBe(true)
    expect(SAFE_ENV_VARS.has('ATLAS_MAX_OUTPUT_TOKENS')).toBe(true)
    expect(SAFE_ENV_VARS.has('BASH_MAX_OUTPUT_LENGTH')).toBe(true)
    expect(SAFE_ENV_VARS.has('DISABLE_TELEMETRY')).toBe(true)
  })

  test('危险变量不在列表（重定向/信任证书/切项目三类攻击面）', () => {
    expect(SAFE_ENV_VARS.has('OPENAI_BASE_URL')).toBe(false)
    expect(SAFE_ENV_VARS.has('HTTP_PROXY')).toBe(false)
    expect(SAFE_ENV_VARS.has('NODE_TLS_REJECT_UNAUTHORIZED')).toBe(false)
    expect(SAFE_ENV_VARS.has('LD_PRELOAD')).toBe(false)
    expect(SAFE_ENV_VARS.has('OPENAI_API_KEY')).toBe(false)
  })

  test('大小写归一语义（应用面 toUpperCase 查表，白名单全大写）', () => {
    // 白名单存大写；applySafe 应用面 key.toUpperCase() 查表（§8.28 语义）
    const lower = 'atlas_small_model'
    expect(SAFE_ENV_VARS.has(lower)).toBe(false) // 原始小写不命中
    expect(SAFE_ENV_VARS.has(lower.toUpperCase())).toBe(true)
  })
})
