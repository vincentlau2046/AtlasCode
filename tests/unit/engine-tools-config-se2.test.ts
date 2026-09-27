/**
 * engine/tools/config S-E2（§8.60 config+ask-user 族子波）：ConfigTool 本体
 * + 注册表 3 键裁剪面 unit 面（零盘——FsOperations mock 注入 +
 * ATLAS_CONFIG_DIR=/mock-home 命名空间，settings 隔离先例）。
 *
 *  - P-C1 对象面：name（toolNames 单一事实源同值 'Config'）/ JSON schema
 *    常量字段转写（required setting + additionalProperties false + value
 *    联合三型）/ TOOL_DEFAULTS 逐值（maxResultSizeChars 100_000 /
 *    shouldDefer / strict / isReadOnly 双态 / isDestructive / isEnabled /
 *    isConcurrencySafe）/ searchHint / userFacingName / toAutoClassifierInput
 *    双态（get 裸 setting / set `setting = value`）。
 *  - P-C2 注册表面：isSupported 3 键 + 未知键反例 / getAllKeys 3 /
 *    getOptionsForSetting（defaultMode 5 值集逐字 / model availableModels
 *    双态：已设透传 / 缺省角色池 3 值）/ getPath（显式 path 优先 /
 *    缺省 split('.')）/ formatOnRead null→'default'。
 *  - P-C3 call GET 面：未知键 error 文案逐字 / get model 缺省 undefined /
 *    get model 类型坏文件级联丢弃 → undefined（formatOnRead null→'default'
 *    契约直查归 P-C2）/ get autoMemoryEnabled 透传。
 *  - P-C4 call SET 面：boolean coercion（'true'/'false' 大小写不敏感 /
 *    非法文案逐字）/ options 校验（model 缺省 3 值 / defaultMode 5 值
 *    逐字）/ 写回 settings.json（嵌套 buildNestedObject 面 + 写后读见新值
 *    + previousValue 双字段）/ 坏 JSON 文件守卫 error 透传。
 *  - P-C5 checkPermissions 双支：GET 自动放行 allow + updatedInput /
 *    SET ask 文案 `Set ${setting} to ${json}` 逐字。
 *  - P-C6 mapToolResult 三支：get `setting = json` / set `Set setting to json`
 *    / error `Error: ${msg}` + is_error。
 *  - P-C7 renderToolUseMessage 字符串面：!setting null / GET / SET 三模板
 *    逐字（UI.tsx 纯逻辑面，delta ⑨）。
 *  - P-C8 prompt 面：generatePrompt 注册表驱动结构（空 Global 段不渲染 /
 *    Project 段 2 键行面 / Model 段动态选项面）+ Examples 段键面 +
 *    description() = generatePrompt() 同一性 + CONFIG_DESCRIPTION 值锚点。
 *  - P-C9 写回面直查：updateSettingsForSource('userSettings') 写后二读面
 *    （跨测缓存面显式 reset，B-N1 复审注）。
 *
 * 深度 import（门面归集）：../../src/engine/tools（本体 + schema + prompt 面
 * + 2 短描述别名）+ ../../src/engine/tools/config 子门面（注册表查询函数）。
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import type { Dirent } from 'node:fs'
import { join } from 'path'
import {
  getInitialSettings,
  resetSettingsCache,
  updateSettingsForSource,
} from '../../src/engine'
import {
  CONFIG_DESCRIPTION,
  ConfigTool,
  CONFIG_TOOL_INPUT_SCHEMA,
  CONFIG_TOOL_NAME,
  generatePrompt,
  type ConfigOutput,
} from '../../src/engine/tools'
import {
  getAllKeys,
  getConfig,
  getOptionsForSetting,
  getPath,
  isSupported,
} from '../../src/engine/tools/config'
import {
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
} from '../../src/shared'

// ── mock FsOperations（engine-config-settings.test.ts 隔离先例逐字复用）──

function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${path}'`)
  err.code = 'ENOENT'
  return err
}

function dirent(name: string): Dirent {
  return { name, isFile: () => true, isSymbolicLink: () => false } as Dirent
}

function makeMockFs(files: Record<string, string> = {}) {
  const fileMap = new Map(Object.entries(files))
  const dropInMap = new Map<string, string>()
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
      fileMap.set(p, data as string)
    },
    mkdirSync: () => {},
  }
  return { ops, files: fileMap }
}

const MOCK_HOME = '/mock-home'
const USER_SETTINGS = join(MOCK_HOME, 'settings.json')

let savedConfigDir: string | undefined
beforeAll(() => {
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = MOCK_HOME
})
beforeEach(() => {
  resetSettingsCache()
})
afterAll(() => {
  setOriginalFsImplementation()
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
})
afterEach(() => {
  setOriginalFsImplementation()
})

// ── P-C1 对象面 ─────────────────────────────────────────────────────────

describe('P-C1 对象面（shared Tool 契约纯对象）', () => {
  test('ConfigTool 对象面逐值', () => {
    expect(ConfigTool.name).toBe(CONFIG_TOOL_NAME)
    expect(CONFIG_TOOL_NAME).toBe('Config')
    expect(ConfigTool.maxResultSizeChars).toBe(100_000)
    expect(ConfigTool.shouldDefer).toBe(true)
    expect(ConfigTool.strict).toBe(true)
    expect(ConfigTool.isConcurrencySafe(undefined)).toBe(true)
    expect(ConfigTool.isReadOnly({ setting: 'model' })).toBe(true)
    expect(ConfigTool.isReadOnly({ setting: 'model', value: 'x' })).toBe(false)
    expect(ConfigTool.isDestructive?.(undefined)).toBe(false)
    expect(ConfigTool.isEnabled()).toBe(true)
    expect(ConfigTool.userFacingName(undefined)).toBe('Config')
    expect(ConfigTool.searchHint).toBe('get or set Atlas settings (model)')
  })

  test('toAutoClassifierInput 双态（get 裸 setting / set 等号拼接）', () => {
    expect(ConfigTool.toAutoClassifierInput({ setting: 'model' })).toBe('model')
    expect(
      ConfigTool.toAutoClassifierInput({ setting: 'model', value: 'premium' }),
    ).toBe('model = premium')
  })

  test('JSON schema 常量字段转写面', () => {
    expect(CONFIG_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(CONFIG_TOOL_INPUT_SCHEMA.required).toEqual(['setting'])
    expect(CONFIG_TOOL_INPUT_SCHEMA.additionalProperties).toBe(false)
    const value = CONFIG_TOOL_INPUT_SCHEMA.properties?.value as {
      type: string | string[]
    }
    expect(value.type).toEqual(['string', 'boolean', 'number'])
  })
})

// ── P-C2 注册表面 ──────────────────────────────────────────────────────

describe('P-C2 注册表 3 键裁剪面（S-E1 §8.60.1.2 存活判据）', () => {
  test('isSupported 3 存活键 + 已裁键反例', () => {
    expect(isSupported('model')).toBe(true)
    expect(isSupported('autoMemoryEnabled')).toBe(true)
    expect(isSupported('permissions.defaultMode')).toBe(true)
    // 旧 12 global 键 + 8 settings 键全裁（global 段 → C 桶 ③）
    expect(isSupported('theme')).toBe(false)
    expect(isSupported('verbose')).toBe(false)
    expect(isSupported('language')).toBe(false)
  })

  test('getAllKeys 恰 3 键', () => {
    expect(getAllKeys()).toEqual([
      'autoMemoryEnabled',
      'model',
      'permissions.defaultMode',
    ])
  })

  test('getOptionsForSetting：defaultMode 5 值集逐字（含 auto 恢复裁定）', () => {
    expect(getOptionsForSetting('permissions.defaultMode')).toEqual([
      'default',
      'plan',
      'acceptEdits',
      'dontAsk',
      'auto',
    ])
    expect(getOptionsForSetting('autoMemoryEnabled')).toBeUndefined()
  })

  test('getOptionsForSetting model：availableModels 已设透传 / 缺省角色池 3 值', () => {
    let m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({ availableModels: ['x', 'y'] }),
    })
    setFsImplementation(m.ops)
    expect(getOptionsForSetting('model')).toEqual(['x', 'y'])
    // session 缓存面：换 mock 前必须 reset（getInitialSettings 缓存命中会
    // 让第二读仍见第一 mock 的 availableModels）
    m = makeMockFs({})
    setFsImplementation(m.ops)
    resetSettingsCache()
    expect(getOptionsForSetting('model')).toEqual(['small', 'premium', 'fast'])
  })

  test('getPath：缺省 split(".") 面', () => {
    expect(getPath('permissions.defaultMode')).toEqual([
      'permissions',
      'defaultMode',
    ])
    expect(getPath('model')).toEqual(['model'])
  })

  test('getConfig 条目面（type/description 字段转写）', () => {
    expect(getConfig('model')).toEqual({
      source: 'settings',
      type: 'string',
      description: 'Override the default model',
      getOptions: expect.any(Function),
      formatOnRead: expect.any(Function),
    })
    expect(getConfig('autoMemoryEnabled')?.type).toBe('boolean')
    expect(getConfig('nope')).toBeUndefined()
  })

  test('model formatOnRead：null → "default" 逐字', () => {
    expect(getConfig('model')!.formatOnRead!(null)).toBe('default')
    expect(getConfig('model')!.formatOnRead!('x')).toBe('x')
  })
})

// ── P-C3 call GET 面 ───────────────────────────────────────────────────

describe('P-C3 call GET 面', () => {
  test('未知键 → error 文案逐字（无 operation 字段）', async () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    const { data } = await ConfigTool.call({ setting: 'theme' }, {})
    expect(data).toEqual({
      success: false,
      error: 'Unknown setting: "theme"',
    })
  })

  test('get model 缺省 → value undefined', async () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    const { data } = await ConfigTool.call({ setting: 'model' }, {})
    expect(data).toEqual({
      success: true,
      operation: 'get',
      setting: 'model',
      value: undefined,
    })
  })

  test('get model：类型坏文件（model: null 过不了 z.string()）级联丢弃 → undefined', async () => {
    // model: z.string().optional() → null 值 schema 校验失败 → 整文件被级联
    // 丢弃（settings.ts 坏文件静默面）→ 读面 undefined。formatOnRead
    // null→'default' 契约直查见 P-C2（getConfig('model').formatOnRead(null)）。
    const m = makeMockFs({ [USER_SETTINGS]: JSON.stringify({ model: null }) })
    setFsImplementation(m.ops)
    const { data } = await ConfigTool.call({ setting: 'model' }, {})
    expect(data).toEqual({
      success: true,
      operation: 'get',
      setting: 'model',
      value: undefined,
    })
  })

  test('get autoMemoryEnabled 透传现有值', async () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({ autoMemoryEnabled: true }),
    })
    setFsImplementation(m.ops)
    const { data } = await ConfigTool.call({ setting: 'autoMemoryEnabled' }, {})
    expect(data).toEqual({
      success: true,
      operation: 'get',
      setting: 'autoMemoryEnabled',
      value: true,
    })
  })
})

// ── P-C4 call SET 面 ───────────────────────────────────────────────────

describe('P-C4 call SET 面', () => {
  test('boolean coercion：字符串 "true"/"FALSE" 大小写不敏感 → 布尔写回', async () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    const r1 = await ConfigTool.call(
      { setting: 'autoMemoryEnabled', value: 'true' },
      {},
    )
    expect(r1.data).toEqual({
      success: true,
      operation: 'set',
      setting: 'autoMemoryEnabled',
      previousValue: undefined,
      newValue: true,
    })
    const file = JSON.parse(m.files.get(USER_SETTINGS)!)
    expect(file.autoMemoryEnabled).toBe(true)
    // 原生 boolean 值直通（非字符串支）
    const r2 = await ConfigTool.call(
      { setting: 'autoMemoryEnabled', value: false },
      {},
    )
    expect(r2.data?.newValue).toBe(false)
    expect(JSON.parse(m.files.get(USER_SETTINGS)!).autoMemoryEnabled).toBe(false)
  })

  test('boolean 非法值 → 文案逐字（不写盘）', async () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    const { data } = await ConfigTool.call(
      { setting: 'autoMemoryEnabled', value: 'banana' },
      {},
    )
    expect(data).toEqual({
      success: false,
      operation: 'set',
      setting: 'autoMemoryEnabled',
      error: 'autoMemoryEnabled requires true or false.',
    })
    expect(m.files.has(USER_SETTINGS)).toBe(false)
  })

  test('model options 校验：缺省角色池 3 值外拒 + 文案逐字', async () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    const { data } = await ConfigTool.call(
      { setting: 'model', value: 'bogus' },
      {},
    )
    expect(data).toEqual({
      success: false,
      operation: 'set',
      setting: 'model',
      error: 'Invalid value "bogus". Options: small, premium, fast',
    })
  })

  test('model 合法值写回：嵌套文件面 + 写后读见新值 + previousValue 双字段', async () => {
    const m = makeMockFs({ [USER_SETTINGS]: JSON.stringify({ model: 'small' }) })
    setFsImplementation(m.ops)
    const { data } = await ConfigTool.call(
      { setting: 'model', value: 'premium' },
      {},
    )
    expect(data).toEqual({
      success: true,
      operation: 'set',
      setting: 'model',
      previousValue: 'small',
      newValue: 'premium',
    })
    expect(JSON.parse(m.files.get(USER_SETTINGS)!).model).toBe('premium')
    // updateSettingsForSource 写后 resetSettingsCache → 读面必见新值
    expect(getInitialSettings().model).toBe('premium')
  })

  test('permissions.defaultMode 5 值集内放行（auto 恢复裁定消费面）', async () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    const { data } = await ConfigTool.call(
      { setting: 'permissions.defaultMode', value: 'auto' },
      {},
    )
    expect(data).toEqual({
      success: true,
      operation: 'set',
      setting: 'permissions.defaultMode',
      previousValue: undefined,
      newValue: 'auto',
    })
    // buildNestedObject 嵌套写回面
    expect(
      JSON.parse(m.files.get(USER_SETTINGS)!).permissions.defaultMode,
    ).toBe('auto')
  })

  test('permissions.defaultMode 值外拒：5 值集文案逐字', async () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    const { data } = await ConfigTool.call(
      { setting: 'permissions.defaultMode', value: 'yolo' },
      {},
    )
    expect(data).toEqual({
      success: false,
      operation: 'set',
      setting: 'permissions.defaultMode',
      error:
        'Invalid value "yolo". Options: default, plan, acceptEdits, dontAsk, auto',
    })
  })

  test('坏 JSON 文件守卫：写回 error 透传（不覆写坏文件）', async () => {
    const m = makeMockFs({ [USER_SETTINGS]: '{ broken' })
    setFsImplementation(m.ops)
    const { data } = await ConfigTool.call(
      { setting: 'model', value: 'premium' },
      {},
    )
    expect(data?.success).toBe(false)
    expect((data as ConfigOutput).error).toContain('Invalid JSON syntax')
    expect(m.files.get(USER_SETTINGS)).toBe('{ broken')
  })
})

// ── P-C5 checkPermissions 双支 ─────────────────────────────────────────

describe('P-C5 checkPermissions 双支', () => {
  test('GET → 自动放行 allow + updatedInput 回传', async () => {
    const input = { setting: 'model' }
    const res = await ConfigTool.checkPermissions(input, {})
    expect(res.behavior).toBe('allow')
    expect((res as { updatedInput?: unknown }).updatedInput).toEqual(input)
  })

  test('SET → ask 文案 `Set ${setting} to ${json}` 逐字', async () => {
    const res = await ConfigTool.checkPermissions(
      { setting: 'model', value: 'premium' },
      {},
    )
    expect(res.behavior).toBe('ask')
    expect((res as { message?: string }).message).toBe('Set model to "premium"')
  })
})

// ── P-C6 mapToolResult 三支 ────────────────────────────────────────────

describe('P-C6 mapToolResult 三支', () => {
  test('get 支：`setting = json`', () => {
    expect(
      ConfigTool.mapToolResultToToolResultBlockParam(
        {
          success: true,
          operation: 'get',
          setting: 'model',
          value: 'premium',
        },
        't1',
      ),
    ).toEqual({
      tool_use_id: 't1',
      type: 'tool_result',
      content: 'model = "premium"',
    })
  })

  test('set 支：`Set setting to json`', () => {
    expect(
      ConfigTool.mapToolResultToToolResultBlockParam(
        {
          success: true,
          operation: 'set',
          setting: 'model',
          newValue: 'premium',
        },
        't2',
      ),
    ).toEqual({
      tool_use_id: 't2',
      type: 'tool_result',
      content: 'Set model to "premium"',
    })
  })

  test('error 支：`Error: ${msg}` + is_error', () => {
    expect(
      ConfigTool.mapToolResultToToolResultBlockParam(
        { success: false, error: 'Unknown setting: "theme"' },
        't3',
      ),
    ).toEqual({
      tool_use_id: 't3',
      type: 'tool_result',
      content: 'Error: Unknown setting: "theme"',
      is_error: true,
    })
  })
})

// ── P-C7 renderToolUseMessage 字符串面（UI.tsx 纯逻辑面 delta ⑨）─────

describe('P-C7 renderToolUseMessage 三模板', () => {
  test('!setting → null / GET / SET 三模板逐字', () => {
    expect(
      ConfigTool.renderToolUseMessage({}, { verbose: false }),
    ).toBe(null)
    expect(
      ConfigTool.renderToolUseMessage({ setting: 'model' }, { verbose: false }),
    ).toBe('Getting model')
    expect(
      ConfigTool.renderToolUseMessage(
        { setting: 'model', value: 'premium' },
        { verbose: false },
      ),
    ).toBe('Setting model to "premium"')
  })
})

// ── P-C8 prompt 面 ─────────────────────────────────────────────────────

describe('P-C8 prompt 面（注册表驱动）', () => {
  test('generatePrompt 结构面：Project 段 2 键行面 + Model 段动态选项', () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    const prompt = generatePrompt()
    expect(prompt.startsWith('Get or set Atlas configuration settings.')).toBe(
      true,
    )
    expect(prompt).toContain(
      '### Project Settings (stored in settings.json)',
    )
    expect(prompt).toContain('- autoMemoryEnabled: true/false - Enable auto-memory')
    expect(prompt).toContain(
      '- permissions.defaultMode: "default", "plan", "acceptEdits", "dontAsk", "auto" - Default permission mode for tool usage',
    )
    expect(prompt).toContain('- model - Override the default model. Available options:')
    expect(prompt).toContain('- "small"')
    expect(prompt).toContain('- "fast"')
    // delta ②：空 Global 段不渲染
    expect(prompt).not.toContain('### Global')
    // delta ④：Examples 段示例键 = 存活键面
    expect(prompt).toContain('- Get model: { "setting": "model" }')
    expect(prompt).toContain(
      '- Change permission mode: { "setting": "permissions.defaultMode", "value": "plan" }',
    )
    expect(prompt).toContain(
      '- Enable auto-memory: { "setting": "autoMemoryEnabled", "value": true }',
    )
  })

  test('generatePrompt model 段随 availableModels 动态面', () => {
    const m = makeMockFs({
      [USER_SETTINGS]: JSON.stringify({ availableModels: ['cann-a', 'cann-b'] }),
    })
    setFsImplementation(m.ops)
    const prompt = generatePrompt()
    expect(prompt).toContain('- "cann-a"')
    expect(prompt).toContain('- "cann-b"')
    expect(prompt).not.toContain('- "small"')
  })

  test('description() = generatePrompt() 同一性（新契约唯一 prompt 面）', async () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    expect(await ConfigTool.description(undefined, {})).toBe(generatePrompt())
  })

  test('CONFIG_DESCRIPTION 值锚点（门面别名重出面）', () => {
    expect(CONFIG_DESCRIPTION).toBe('Get or set Atlas configuration settings.')
  })
})

// ── 写回面直查（updateSettingsForSource 经 config 域透传）────────────

describe('P-C9 写回面直查（组合根前置：注册表 → 写回管线）', () => {
  test('SUPPORTED 键 set 后二读面（跨测缓存面显式 reset）', async () => {
    const m = makeMockFs({})
    setFsImplementation(m.ops)
    updateSettingsForSource('userSettings', { autoMemoryEnabled: true })
    expect(getInitialSettings().autoMemoryEnabled).toBe(true)
    resetSettingsCache()
    expect(getInitialSettings().autoMemoryEnabled).toBe(true)
  })
})
