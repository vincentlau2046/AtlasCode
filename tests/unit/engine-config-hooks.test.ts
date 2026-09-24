/**
 * engine/config hooks 字段族 + 配置面 契约测试（§8.27 E-3 S-3c，§8.28）。
 *
 * 被测能力：
 *   - HookCommandSchema 四类判别联合（command/prompt/agent/http + 通配字段
 *     透传 + 缺字段/未知 type 拒识）
 *   - HooksSchema record 面 + SettingsSchema allowManagedHooksOnly 声明
 *   - snapshot 门控链四态（policy disableAllHooks / policy allowManagedHooksOnly /
 *     合并 disableAllHooks / 常规合并）+ should* 两判定
 *   - snapshot 三函数（capture 惰性 / update 先 resetSettingsCache 读盘 / reset）
 *   - createHooksConfigProvider 执行器契约过滤（command 变体保留，
 *     prompt/agent/http 归 E-5 剔除 + 空 matcher 剔除 + 通配字段保留）
 * I/O-free（mock FsOperations 注入，用户路径经 ATLAS_CONFIG_DIR 指向 /mock-home）
 * → unit 层。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import type { Dirent } from 'fs'
import { join } from 'path'
import {
  HookCommandSchema,
  HooksSchema,
  SettingsSchema,
  captureHooksConfigSnapshot,
  updateHooksConfigSnapshot,
  getHooksConfigFromSnapshot,
  resetHooksConfigSnapshot,
  shouldAllowManagedHooksOnly,
  shouldDisableAllHooksIncludingManaged,
  createHooksConfigProvider,
  getSettingsForSource,
  resetSettingsCache,
  type HooksSettings,
} from '../../src/engine'
import {
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
} from '../../src/shared'

// ── mock FsOperations（同 S-3b 模式）────────────────────────────────────

function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${path}'`)
  err.code = 'ENOENT'
  return err
}

function dirent(name: string): Dirent {
  return { name, isFile: () => true, isSymbolicLink: () => false } as Dirent
}

function makeMockFs(
  files: Record<string, string> = {},
  dropIns: Record<string, string> = {},
): { ops: FsOperations; files: Map<string, string> } {
  const fileMap = new Map(Object.entries(files))
  const dropInMap = new Map(Object.entries(dropIns))
  const DROP_IN_DIR = '/etc/atlas/managed-settings.d'
  const ops: FsOperations = {
    cwd: () => '/mock-cwd',
    existsSync: () => false,
    stat: async () => ({} as never),
    readdir: async () => [],
    mkdir: async () => {},
    readFile: async () => '',
    readFileSync: p => {
      if (p.startsWith(DROP_IN_DIR + '/')) {
        const name = p.slice(DROP_IN_DIR.length + 1)
        const content = dropInMap.get(name)
        if (content === undefined) throw enoent(p)
        return content
      }
      const content = fileMap.get(p)
      if (content === undefined) throw enoent(p)
      return content
    },
    statSync: () => ({} as never),
    realpathSync: p => p,
    open: async () => ({} as never),
    unlinkSync: () => {},
    readdirSync: p => {
      if (p === DROP_IN_DIR) {
        if (dropInMap.size === 0) throw enoent(p)
        return [...dropInMap.keys()].sort().map(dirent)
      }
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

let savedConfigDir: string | undefined

beforeEach(() => {
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = MOCK_HOME
  resetSettingsCache()
  resetHooksConfigSnapshot()
})

afterEach(() => {
  setOriginalFsImplementation()
  resetHooksConfigSnapshot()
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
})

// ── HookCommandSchema 四类判别联合 ──────────────────────────────────────

describe('engine/config HookCommandSchema（§8.28 S-3c 四类判别联合）', () => {
  test('command 变体解析 + 通配字段透传', () => {
    const r = HookCommandSchema.safeParse({
      type: 'command',
      command: 'npm test',
      shell: 'bash',
      timeoutMs: 5000,
      if: 'Bash(npm *)',
      extra: 42,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.command).toBe('npm test')
      expect(r.data.shell).toBe('bash')
      expect(r.data.extra).toBe(42)
    }
  })

  test('prompt / agent / http 变体解析', () => {
    expect(
      HookCommandSchema.safeParse({ type: 'prompt', prompt: 'check', if: 'x' }).success,
    ).toBe(true)
    expect(
      HookCommandSchema.safeParse({ type: 'agent', prompt: 'review' }).success,
    ).toBe(true)
    expect(
      HookCommandSchema.safeParse({ type: 'http', url: 'https://x/hook' }).success,
    ).toBe(true)
  })

  test('缺判别必需字段拒识（command 缺 command / http 缺 url）', () => {
    expect(HookCommandSchema.safeParse({ type: 'command' }).success).toBe(false)
    expect(HookCommandSchema.safeParse({ type: 'http' }).success).toBe(false)
  })

  test('未知 type 拒识（function 类不入配置面，§8.27 四类裁定）', () => {
    expect(HookCommandSchema.safeParse({ type: 'function' }).success).toBe(false)
  })
})

// ── HooksSchema + 类型面声明 ────────────────────────────────────────────

describe('engine/config HooksSchema + allowManagedHooksOnly（§8.28）', () => {
  test('record 面解析（事件 → matcher 列表）', () => {
    const r = HooksSchema.safeParse({
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'lint' }],
          source: 'user',
        },
      ],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.PreToolUse?.[0].hooks).toHaveLength(1)
    }
  })

  test('坏条目拒识（hooks 缺 command）', () => {
    const r = HooksSchema.safeParse({
      PreToolUse: [{ hooks: [{ type: 'command' }] }],
    })
    expect(r.success).toBe(false)
  })

  test('SettingsSchema 声明 allowManagedHooksOnly（S-3c 消费数据契约）', () => {
    const r = SettingsSchema().safeParse({
      allowManagedHooksOnly: true,
      disableAllHooks: false,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.allowManagedHooksOnly).toBe(true)
      expect(r.data.disableAllHooks).toBe(false)
    }
  })
})

// ── snapshot 门控链四态 ─────────────────────────────────────────────────

const USER_HOOKS: HooksSettings = {
  PreToolUse: [{ hooks: [{ type: 'command', command: 'user-hook' }] }],
}
const MANAGED_HOOKS: HooksSettings = {
  PreToolUse: [{ hooks: [{ type: 'command', command: 'managed-hook' }] }],
}

function hooksJson(hooks: HooksSettings): string {
  return JSON.stringify({ hooks })
}

describe('engine/config snapshot 门控链（§8.28 四态）', () => {
  test('态①：policy disableAllHooks → 空配置', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: hooksJson(USER_HOOKS),
      [MANAGED_BASE]: JSON.stringify({ disableAllHooks: true, hooks: MANAGED_HOOKS }),
    })
    setFsImplementation(m.ops)
    expect(getHooksConfigFromSnapshot()).toEqual({})
    expect(shouldDisableAllHooksIncludingManaged()).toBe(true)
  })

  test('态①边界：policy + 合并 disableAllHooks 双真 → managed-only false / 禁全 true（§8.30 T-7②）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        disableAllHooks: true,
        hooks: USER_HOOKS,
      }),
      [MANAGED_BASE]: JSON.stringify({ disableAllHooks: true, hooks: MANAGED_HOOKS }),
    })
    setFsImplementation(m.ops)
    // shouldAllowManagedHooksOnly 守卫支 policy.disableAllHooks !== true 在态①
    // 不成立 → false（态① 原测只断言了 disable-all 面，守卫支无覆盖）
    expect(shouldAllowManagedHooksOnly()).toBe(false)
    expect(shouldDisableAllHooksIncludingManaged()).toBe(true)
    expect(getHooksConfigFromSnapshot()).toEqual({})
  })

  test('态②：policy allowManagedHooksOnly → 仅 managed hooks', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: hooksJson(USER_HOOKS),
      [MANAGED_BASE]: JSON.stringify({
        allowManagedHooksOnly: true,
        hooks: MANAGED_HOOKS,
      }),
    })
    setFsImplementation(m.ops)
    const snap = getHooksConfigFromSnapshot()
    expect(snap.PreToolUse?.[0].hooks).toEqual([
      { type: 'command', command: 'managed-hook' },
    ])
    expect(shouldAllowManagedHooksOnly()).toBe(true)
  })

  test('态③：合并（非 managed）disableAllHooks → 仅 managed hooks', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        disableAllHooks: true,
        hooks: USER_HOOKS,
      }),
      [MANAGED_BASE]: JSON.stringify({ hooks: MANAGED_HOOKS }),
    })
    setFsImplementation(m.ops)
    const snap = getHooksConfigFromSnapshot()
    expect(snap.PreToolUse?.[0].hooks).toEqual([
      { type: 'command', command: 'managed-hook' },
    ])
    // 非 managed 源 disableAllHooks 语义 = managed-only（非禁 managed）
    expect(shouldAllowManagedHooksOnly()).toBe(true)
    expect(shouldDisableAllHooksIncludingManaged()).toBe(false)
  })

  test('态④：常规合并（per-event matcher 数组 uniq 拼接，user 序在前）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        hooks: {
          ...USER_HOOKS,
          Stop: [{ hooks: [{ type: 'command', command: 'user-stop' }] }],
        },
      }),
      [MANAGED_BASE]: JSON.stringify({ hooks: MANAGED_HOOKS }),
    })
    setFsImplementation(m.ops)
    const snap = getHooksConfigFromSnapshot()
    // 级联合并 = settingsMergeCustomizer 双数组 uniq 拼接（target=user 序在前，
    // S-3b 语义）——同事件两源 matcher 并存，非逐事件覆盖
    expect(snap.PreToolUse).toHaveLength(2)
    expect(snap.PreToolUse?.[0].hooks).toEqual([{ type: 'command', command: 'user-hook' }])
    expect(snap.PreToolUse?.[1].hooks).toEqual([{ type: 'command', command: 'managed-hook' }])
    // user 独有事件保留
    expect(snap.Stop?.[0].hooks).toEqual([{ type: 'command', command: 'user-stop' }])
    expect(shouldAllowManagedHooksOnly()).toBe(false)
    expect(shouldDisableAllHooksIncludingManaged()).toBe(false)
  })

  test('全源缺失 → 空配置（非 null）', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    expect(getHooksConfigFromSnapshot()).toEqual({})
  })
})

// ── snapshot 三函数 ─────────────────────────────────────────────────────

describe('engine/config snapshot 生命周期（§8.28）', () => {
  test('update 先 resetSettingsCache 读盘（外部改文件后快照刷新）', () => {
    const m = makeMockFs({ [USER_SETTINGS]: hooksJson(USER_HOOKS) })
    setFsImplementation(m.ops)
    captureHooksConfigSnapshot()
    expect(getHooksConfigFromSnapshot().PreToolUse?.[0].hooks).toEqual([
      { type: 'command', command: 'user-hook' },
    ])
    // 外部改文件（mock fs 直接改 map，模拟 settings 编辑）
    m.files.set(
      USER_SETTINGS,
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'new-stop' }] }] },
      }),
    )
    updateHooksConfigSnapshot()
    expect(getHooksConfigFromSnapshot().Stop?.[0].hooks).toEqual([
      { type: 'command', command: 'new-stop' },
    ])
    expect(getHooksConfigFromSnapshot().PreToolUse).toBeUndefined()
  })

  test('reset 后惰性 capture（首读即启动语义）', () => {
    const m = makeMockFs({ [USER_SETTINGS]: hooksJson(USER_HOOKS) })
    setFsImplementation(m.ops)
    resetHooksConfigSnapshot()
    expect(getHooksConfigFromSnapshot().PreToolUse).toHaveLength(1)
  })
})

// ── createHooksConfigProvider（执行器契约过滤）─────────────────────────

describe('engine/config createHooksConfigProvider（§8.28 过滤面）', () => {
  test('保留 command 变体，剔除 prompt/agent/http（执行面归 E-5）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              source: 'user',
              extra: 'keep-me',
              hooks: [
                { type: 'command', command: 'keep-1', if: 'Bash(npm *)' },
                { type: 'prompt', prompt: 'p' },
                { type: 'agent', prompt: 'a' },
                { type: 'http', url: 'https://x' },
                { type: 'command', command: 'keep-2' },
              ],
            },
          ],
        },
      }),
    })
    setFsImplementation(m.ops)
    const provider = createHooksConfigProvider()
    const matchers = provider.getHookMatchersForEvent('PreToolUse')
    expect(matchers).toHaveLength(1)
    expect(matchers[0].hooks).toEqual([
      { type: 'command', command: 'keep-1', if: 'Bash(npm *)' },
      { type: 'command', command: 'keep-2' },
    ])
    // matcher 通配字段 + 具名字段保留
    expect(matchers[0].matcher).toBe('Bash')
    expect(matchers[0].source).toBe('user')
    expect((matchers[0] as Record<string, unknown>).extra).toBe('keep-me')
  })

  test('全非 command 的 matcher 剔除（空 hooks 不进门面）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        hooks: {
          PostToolUse: [
            { hooks: [{ type: 'prompt', prompt: 'only-prompt' }] },
          ],
        },
      }),
    })
    setFsImplementation(m.ops)
    const provider = createHooksConfigProvider()
    expect(provider.getHookMatchersForEvent('PostToolUse')).toEqual([])
  })

  test('未配置事件 → 空数组（非 undefined）', () => {
    const m = makeMockFs({ [USER_SETTINGS]: hooksJson(USER_HOOKS) })
    setFsImplementation(m.ops)
    const provider = createHooksConfigProvider()
    expect(provider.getHookMatchersForEvent('Stop')).toEqual([])
  })

  test('畸形 matcher（缺 hooks 键）→ parse 期拒绝不崩（§8.41 R7，§8.30 T-1 降级双保险）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({
        hooks: { PreToolUse: [{ matcher: 'Bash(npm *)' }] },
      }),
    })
    setFsImplementation(m.ops)
    const provider = createHooksConfigProvider()
    // S-5c 收紧（§8.41 R2/R7）：本配置（matcher 缺必填 hooks 字段）parse 期
    // 整文件拒绝（z.lazy(HooksSchema) + 错误经 getSettingsWithErrors 呈现）
    // → 该源不进合并 → provider 空结果（不崩）。provider Array 守卫 = 快照/
    // cast 面双保险（此路径不经守卫，保留不删）
    expect(provider.getHookMatchersForEvent('PreToolUse')).toEqual([])
  })
})

// ── getSettingsForSource 门控直读面（态②③依赖面）──────────────────────

describe('engine/config 门控链依赖面（§8.28）', () => {
  test('policy 源直读（managed 文件缺失 → null）', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    expect(getSettingsForSource('policySettings')).toBeNull()
  })
})
