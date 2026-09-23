/**
 * engine/config settings 加载/合并/写回核心 契约测试（§8.27 E-3 S-3b）。
 *
 * 被测能力（S-3b 全表面）：
 *   - mergeWith（lodash 语义子集）：深合并 / 数组拼接去重 / null 覆盖 /
 *     undefined 源值不写入
 *   - parseSettingsFile：合法/空文件/坏 JSON 三态 + BOM 前缀剥离（§8.30 T-2）
 *     + 非字符串权限规则过滤 + 路径级缓存 + structuredClone 隔离
 *   - loadManagedFileSettings：基座 + drop-in 字母序后文件赢 / 目录缺失 ENOENT 静默
 *   - 级联优先级（user < policy）+ 错误去重 + perSource/session 缓存失效
 *   - updateSettingsForSource：新建 / 合并 / 数组整替 / 删键(undefined) /
 *     坏 JSON 守卫 / 校验失败 raw 合并基座（§8.30 T-3）/ policy 只读 no-op
 * I/O-free（mock FsOperations 注入，无真实磁盘/网络/PTY）→ unit 层。
 * 用户路径经 ATLAS_CONFIG_DIR 指向 mock 命名空间（/mock-home）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import type { Dirent } from 'fs'
import { join } from 'path'
import {
  mergeWith,
  settingsMergeCustomizer,
  parseSettingsFile,
  loadManagedFileSettings,
  getSettingsFilePathForSource,
  getSettingsForSource,
  getPolicySettingsOrigin,
  updateSettingsForSource,
  getInitialSettings,
  getSettingsWithErrors,
  resetSettingsCache,
  type EditableSettingSource,
} from '../../src/engine'
import {
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
} from '../../src/shared'

// ── mock FsOperations：文件 map + drop-in 目录 map，I/O-free ─────────────

function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${path}'`)
  err.code = 'ENOENT'
  return err
}

function dirent(name: string): Dirent {
  return { name, isFile: () => true, isSymbolicLink: () => false } as Dirent
}

interface MockFs {
  ops: FsOperations
  reads: number
  writes: number
  files: Map<string, string>
  dropIns: Map<string, string>
}

function makeMockFs(files: Record<string, string> = {}, dropIns: Record<string, string> = {}): MockFs {
  const fileMap = new Map(Object.entries(files))
  const dropInMap = new Map(Object.entries(dropIns))
  const DROP_IN_DIR = '/etc/atlas/managed-settings.d'
  let reads = 0
  let writes = 0
  const ops: FsOperations = {
    cwd: () => '/mock-cwd',
    existsSync: () => false,
    stat: async () => ({} as never),
    readdir: async () => [],
    mkdir: async () => {},
    readFile: async () => '',
    readFileSync: p => {
      reads++
      // 基座/普通文件在 fileMap；drop-in 文件在 dropInMap（经 drop-in 目录路径读）
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
      writes++
      fileMap.set(p, data)
    },
    mkdirSync: () => {},
  }
  return { ops, files: fileMap, dropIns: dropInMap, get reads() { return reads }, get writes() { return writes } }
}

const MOCK_HOME = '/mock-home'
const USER_SETTINGS = join(MOCK_HOME, 'settings.json')
const MANAGED_BASE = '/etc/atlas/managed-settings.json'

let savedConfigDir: string | undefined

beforeEach(() => {
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = MOCK_HOME
  resetSettingsCache()
})

afterEach(() => {
  setOriginalFsImplementation()
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
})

// ── mergeWith（lodash 语义子集）────────────────────────────────────────

describe('engine/config mergeWith（§8.27 S-3b，lodash 语义子集）', () => {
  test('深合并：嵌套对象递归 / 原始值与 null 覆盖 / undefined 源值不写入', () => {
    const target = { a: { x: 1, y: 2 }, b: 'old' }
    const source = { a: { y: 3 }, b: null, c: undefined, d: 4 }
    const out = mergeWith(target, source, settingsMergeCustomizer)
    expect(out).toEqual({ a: { x: 1, y: 3 }, b: null, d: 4 })
    expect('c' in out).toBe(false)
    // mutate target 并返回（lodash 语义）
    expect(out).toBe(target)
  })

  test('数组 = 拼接 + 去重（target 序在前）', () => {
    const out = mergeWith({ arr: ['a', 'b'] }, { arr: ['b', 'c'] }, settingsMergeCustomizer)
    expect(out.arr).toEqual(['a', 'b', 'c'])
  })

  test('单侧数组走默认覆盖（customizer 仅双数组定制）', () => {
    const out = mergeWith({ arr: ['a'] }, { other: 1 }, settingsMergeCustomizer)
    expect(out.arr).toEqual(['a'])
    expect(out.other).toBe(1)
  })
})

// ── parseSettingsFile ──────────────────────────────────────────────────

describe('engine/config parseSettingsFile（§8.27 S-3b）', () => {
  test('合法 JSON 解析 + 未知字段透传（passthrough）', () => {
    const m = makeMockFs({ '/x.json': JSON.stringify({ model: 'm1', unknown: 42 }) })
    setFsImplementation(m.ops)
    const { settings, errors } = parseSettingsFile('/x.json')
    expect(errors).toEqual([])
    expect(settings?.model).toBe('m1')
    expect((settings as Record<string, unknown>)?.unknown).toBe(42)
  })

  test('空文件 → 空 settings（非 null）', () => {
    const m = makeMockFs({ '/x.json': '   \n' })
    setFsImplementation(m.ops)
    expect(parseSettingsFile('/x.json').settings).toEqual({})
  })

  test('BOM 前缀剥离（PowerShell 5.x 写 UTF-8 带 BOM，§8.30 T-2 回归守卫）', () => {
    // parseJson 的 BOM 剥离是登记过来源的行为契约；删掉该行 replace 后
    // BOM 前缀文件静默变「Invalid or malformed JSON」且本测变红
    const m = makeMockFs({ '/x.json': '\uFEFF' + JSON.stringify({ model: 'bom' }) })
    setFsImplementation(m.ops)
    const { settings, errors } = parseSettingsFile('/x.json')
    expect(errors).toEqual([])
    expect(settings?.model).toBe('bom')
  })

  test('坏 JSON → settings null + "Invalid or malformed JSON" 呈现', () => {
    const m = makeMockFs({ '/x.json': '{ not json' })
    setFsImplementation(m.ops)
    const { settings, errors } = parseSettingsFile('/x.json')
    expect(settings).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Invalid or malformed JSON')
    expect(errors[0].path).toBe('')
  })

  test('类型错误呈现（env 值非字符串 → Expected string, but received number）', () => {
    const m = makeMockFs({ '/x.json': JSON.stringify({ env: { A: 1 } }) })
    setFsImplementation(m.ops)
    const { settings, errors } = parseSettingsFile('/x.json')
    expect(settings).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('env.A')
    expect(errors[0].message).toBe('Expected string, but received number')
  })

  test('非字符串权限规则过滤（单条坏项不毒化整个文件）', () => {
    const m = makeMockFs({
      '/x.json': JSON.stringify({
        permissions: { allow: ['Read', 42, 'Bash(ls)'], deny: [{ bad: true }] },
      }),
    })
    setFsImplementation(m.ops)
    const { settings, errors } = parseSettingsFile('/x.json')
    expect((settings?.permissions as Record<string, unknown>)?.allow).toEqual([
      'Read',
      'Bash(ls)',
    ])
    expect((settings?.permissions as Record<string, unknown>)?.deny).toEqual([])
    expect(errors).toHaveLength(2)
    expect(errors.map(e => e.path)).toEqual(['permissions.allow', 'permissions.deny'])
    expect(errors[0].message).toContain('Non-string value in allow array was removed')
  })

  test('文件缺失 → settings null + 零错误（ENOENT 静默）', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    expect(parseSettingsFile('/missing.json')).toEqual({ settings: null, errors: [] })
  })

  test('路径级缓存 + structuredClone 隔离（mutate 返回物不泄漏缓存条目）', () => {
    const m = makeMockFs({ '/x.json': JSON.stringify({ model: 'm1' }) })
    setFsImplementation(m.ops)
    const first = parseSettingsFile('/x.json')
    expect(m.reads).toBe(1)
    ;(first.settings as { model?: string } | null)!.model = 'mutated'
    const second = parseSettingsFile('/x.json')
    expect(m.reads).toBe(1) // 缓存命中，无二次盘读
    expect(second.settings?.model).toBe('m1') // 缓存条目未被首次返回物污染
    resetSettingsCache()
    parseSettingsFile('/x.json')
    expect(m.reads).toBe(2) // reset 后重读
  })
})

// ── loadManagedFileSettings（基座 + drop-in 字母序）────────────────────

describe('engine/config loadManagedFileSettings（§8.27 S-3b）', () => {
  test('基座 + drop-in 字母序：后文件赢，env 深合并', () => {
    const m = makeMockFs(
      { [MANAGED_BASE]: JSON.stringify({ model: 'base', env: { A: '1' } }) },
      {
        '10-a.json': JSON.stringify({ model: 'a' }),
        '20-b.json': JSON.stringify({ model: 'b', env: { B: '2' } }),
      },
    )
    setFsImplementation(m.ops)
    const { settings, errors } = loadManagedFileSettings()
    expect(errors).toEqual([])
    expect(settings?.model).toBe('b') // 20-b 压 10-a 压 base
    expect(settings?.env).toEqual({ A: '1', B: '2' })
  })

  test('跨源数组拼接去重（基座 + drop-in）', () => {
    const m = makeMockFs(
      { [MANAGED_BASE]: JSON.stringify({ enabledMcpjsonServers: ['x'] }) },
      { '10-a.json': JSON.stringify({ enabledMcpjsonServers: ['x', 'y'] }) },
    )
    setFsImplementation(m.ops)
    expect(loadManagedFileSettings().settings?.enabledMcpjsonServers).toEqual(['x', 'y'])
  })

  test('基座与 drop-in 均缺失 → settings null（目录 ENOENT 静默）', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    expect(loadManagedFileSettings()).toEqual({ settings: null, errors: [] })
  })

  test('drop-in 隐藏文件/非 json 忽略（readdir 过滤语义）', () => {
    const m = makeMockFs({ [MANAGED_BASE]: JSON.stringify({ model: 'base' }) })
    // 直接给 dropInMap 塞隐藏/非 json 名（mock readdirSync 原样返回，
    // 过滤逻辑在 loadManagedFileSettings 内）
    m.dropIns.set('.hidden.json', JSON.stringify({ model: 'hidden' }))
    m.dropIns.set('20-note.txt', JSON.stringify({ model: 'txt' }))
    m.dropIns.set('10-real.json', JSON.stringify({ model: 'real' }))
    setFsImplementation(m.ops)
    expect(loadManagedFileSettings().settings?.model).toBe('real')
  })
})

// ── 源路径面 ────────────────────────────────────────────────────────────

describe('engine/config 源路径面（§8.27 S-3b）', () => {
  test('getSettingsFilePathForSource 五源路径（flag = 死源 undefined）', () => {
    expect(getSettingsFilePathForSource('userSettings')).toBe(
      join(MOCK_HOME, 'settings.json'),
    )
    expect(getSettingsFilePathForSource('policySettings')).toBe(MANAGED_BASE)
    expect(getSettingsFilePathForSource('projectSettings')).toBe(
      join(process.cwd(), '.atlas', 'settings.json'),
    )
    expect(getSettingsFilePathForSource('localSettings')).toBe(
      join(process.cwd(), '.atlas', 'settings.local.json'),
    )
    expect(getSettingsFilePathForSource('flagSettings')).toBeUndefined()
  })
})

// ── 级联 + 缓存 ────────────────────────────────────────────────────────

describe('engine/config 级联与缓存（§8.27 S-3b）', () => {
  test('级联优先级：user < policy（policy 压 user，env 深合并）', () => {
    const m = makeMockFs(
      {
        [USER_SETTINGS]: JSON.stringify({ model: 'user', env: { X: 'u' } }),
        [MANAGED_BASE]: JSON.stringify({ model: 'policy', env: { Y: 'p' } }),
      },
    )
    setFsImplementation(m.ops)
    const merged = getInitialSettings()
    expect(merged.model).toBe('policy')
    expect(merged.env).toEqual({ X: 'u', Y: 'p' })
  })

  test('全源缺失 → 空对象（非 null/undefined）', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    expect(getInitialSettings()).toEqual({})
  })

  test('perSource 缓存：同源自首读，reset 后重读', () => {
    const m = makeMockFs({ [USER_SETTINGS]: JSON.stringify({ model: 'm' }) })
    setFsImplementation(m.ops)
    expect(getSettingsForSource('userSettings')?.model).toBe('m')
    expect(getSettingsForSource('userSettings')).not.toBeNull()
    expect(m.reads).toBe(1)
    resetSettingsCache()
    getSettingsForSource('userSettings')
    expect(m.reads).toBe(2)
  })

  test('flagSettings 死源 → null（路径 undefined 短路）', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    expect(getSettingsForSource('flagSettings')).toBeNull()
  })

  test('getPolicySettingsOrigin：有文件 = "file"，无 = null', () => {
    let m = makeMockFs({ [MANAGED_BASE]: JSON.stringify({ model: 'x' }) })
    setFsImplementation(m.ops)
    expect(getPolicySettingsOrigin()).toBe('file')
    m = makeMockFs({})
    setFsImplementation(m.ops)
    resetSettingsCache()
    expect(getPolicySettingsOrigin()).toBeNull()
  })

  test('getSettingsWithErrors session 缓存：二调不重载，reset 后重载', () => {
    const m = makeMockFs({ [USER_SETTINGS]: JSON.stringify({ model: 'm' }) })
    setFsImplementation(m.ops)
    const first = getSettingsWithErrors()
    const readsAfterFirst = m.reads // 重载 = user 文件 + managed 基座 ENOENT 探
    expect(first.settings.model).toBe('m')
    getSettingsWithErrors()
    expect(m.reads).toBe(readsAfterFirst) // session 缓存命中
    resetSettingsCache()
    getSettingsWithErrors()
    const readsAfterReset = m.reads
    expect(readsAfterReset).toBeGreaterThan(readsAfterFirst) // reset 后重载
    getSettingsWithErrors()
    expect(m.reads).toBe(readsAfterReset) // 新一轮 session 缓存命中
  })

  test('单源坏文件错误只出现一次（seenFiles 去重支为防御性不可达，§8.30 T-5）', () => {
    // 坏 user 文件错误进级联 errors 且仅一次。seenFiles 按 resolvedPath 去重支
    // （settings.ts 级联循环）在新仓布局下防御性不可达：user 路径
    // （{configDir}/settings.json）与 policy 路径（managed 目录）不可能同路径，
    // flag 死源短路 → 无两源同路径场景（原测名「级联错误去重」过 claim，订正）
    const m = makeMockFs({ [USER_SETTINGS]: '{ bad json' })
    setFsImplementation(m.ops)
    const { settings, errors } = getSettingsWithErrors()
    expect(settings).toEqual({})
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Invalid or malformed JSON')
  })
})

// ── updateSettingsForSource（写回面）──────────────────────────────────

describe('engine/config updateSettingsForSource（§8.27 S-3b 写回）', () => {
  test('新文件创建（JSON 缩进 2 + 尾换行）', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    const { error } = updateSettingsForSource('userSettings', { model: 'm1' })
    expect(error).toBeNull()
    expect(m.files.get(USER_SETTINGS)).toBe(JSON.stringify({ model: 'm1' }, null, 2) + '\n')
  })

  test('合并进现有文件（保留未触及键）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({ model: 'old', keep: true }),
    })
    setFsImplementation(m.ops)
    const { error } = updateSettingsForSource('userSettings', { model: 'new' })
    expect(error).toBeNull()
    expect(JSON.parse(m.files.get(USER_SETTINGS)!)).toEqual({
      model: 'new',
      keep: true,
    })
  })

  test('数组 = 整替（非拼接）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({ enabledMcpjsonServers: ['a', 'b', 'c'] }),
    })
    setFsImplementation(m.ops)
    updateSettingsForSource('userSettings', { enabledMcpjsonServers: ['z'] })
    expect(
      (JSON.parse(m.files.get(USER_SETTINGS)!) as Record<string, unknown>).enabledMcpjsonServers,
    ).toEqual(['z'])
  })

  test('删键 = 显式 undefined（lodash mergeWith 删键语义）', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({ model: 'a', env: { DEBUG: '1' } }),
    })
    setFsImplementation(m.ops)
    const { error } = updateSettingsForSource('userSettings', {
      env: undefined as unknown as Record<string, string>,
    })
    expect(error).toBeNull()
    expect(JSON.parse(m.files.get(USER_SETTINGS)!)).toEqual({ model: 'a' })
  })

  test('嵌套删键：record 字段置 undefined 删嵌套键', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({ env: { A: '1', B: '2' } }),
    })
    setFsImplementation(m.ops)
    updateSettingsForSource('userSettings', {
      env: { B: undefined as unknown as string },
    })
    expect((JSON.parse(m.files.get(USER_SETTINGS)!) as Record<string, unknown>).env).toEqual({
      A: '1',
    })
  })

  test('坏 JSON 文件守卫：返错不覆写', () => {
    const m = makeMockFs({ [USER_SETTINGS]: '{ broken' })
    setFsImplementation(m.ops)
    const { error } = updateSettingsForSource('userSettings', { model: 'x' })
    expect(error?.message).toContain('Invalid JSON syntax in settings file')
    expect(m.files.get(USER_SETTINGS)).toBe('{ broken') // 未被覆写
  })

  test('校验失败（合法 JSON 过不了 schema）→ raw 数据为合并基座，坏字段无损保留（§8.30 T-3）', () => {
    // env.A 非字符串 → schema 校验失败 → getSettingsForSourceUncached 返 null
    // → 守卫支读原文 parseJson 成功 → raw 为合并基座。回归改该支为「merge
    // 进 {}」将静默丢用户坏字段数据且全测绿（现有写回测全用良形 JSON）
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({ model: 'a', env: { A: 1 } }),
    })
    setFsImplementation(m.ops)
    const { error } = updateSettingsForSource('userSettings', { model: 'b' })
    expect(error).toBeNull()
    expect(m.files.get(USER_SETTINGS)).toBe(
      JSON.stringify({ model: 'b', env: { A: 1 } }, null, 2) + '\n',
    )
  })

  test('写回后 resetSettingsCache（session 缓存失效重载）', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    updateSettingsForSource('userSettings', { model: 'm1' })
    expect(getInitialSettings().model).toBe('m1') // 写后读必见新值
  })

  test('policySettings 只读：no-op 不写盘（类型外强转验证运行时守卫）', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    const { error } = updateSettingsForSource(
      'policySettings' as unknown as EditableSettingSource,
      { model: 'x' },
    )
    expect(error).toBeNull()
    expect(m.writes).toBe(0)
  })

  test('本地写回文件缺失 + 无现有缓存 → 从空合并（不报 ENOENT）', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    const localPath = join(process.cwd(), '.atlas', 'settings.local.json')
    const { error } = updateSettingsForSource('localSettings', { model: 'local' })
    expect(error).toBeNull()
    expect(JSON.parse(m.files.get(localPath)!)).toEqual({ model: 'local' })
  })
})
