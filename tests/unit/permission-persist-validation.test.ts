/**
 * E-4 S-4c2（§8.35）契约测试：persist 族 + 规则语法校验 + 接缝③回填 + update schema
 *
 * 被测面：
 *   - validatePermissionRule 语法核心 5 检（空 / 括号失衡 / 空括号 /
 *     MCP 禁括号 / 工具名首字母大写 + 合法支）+ 语义支 3 块（E-6 S-6d，
 *     §8.43：customValidation WebSearch/WebFetch / Bash `:*` 两检 /
 *     File `:*` + 通配位启发；examples 字段沿 S-4c2 裁）
 *   - filterInvalidPermissionRules 接缝③ 回填（语法支 `Bash(unbalanced`
 *     滤 + warning 全文 / 合法规则保留 / 非字符串旧支回归）
 *   - persist 族 6 型写回 × supportsPersistence 门（session/cliArg no-op
 *     不写盘；addRules 去重 / addDirectories 去重 / removeRules 归一比较 /
 *     removeDirectories / setMode / replaceRules 全替换）
 *   - createReadRuleSuggestion 3 支（根 '/' → undefined / 绝对 `//p/**` /
 *     相对 `p/**`）
 *   - permissionUpdateSchema 6 变体 + destination 5 值 enum（H6 预声明
 *     接缝形状核验）
 * I/O-free（mock FsOperations + ATLAS_CONFIG_DIR → /mock-home，S-4c1 口径）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import {
  filterInvalidPermissionRules,
  supportsPersistence,
  persistPermissionUpdate,
  persistPermissionUpdates,
  createReadRuleSuggestion,
  getCachedSettingsForSource,
  resetSettingsCache,
} from '../../src/engine'
import {
  validatePermissionRule,
  permissionUpdateSchema,
  permissionUpdateDestinationSchema,
} from '../../src/permissions'
import {
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
  type PermissionUpdate,
} from '../../src/shared'

// ── mock FsOperations：文件 map，I/O-free（同 S-4c1 口径）─────────────
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
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
  if (savedPwd === undefined) delete process.env.PWD
  else process.env.PWD = savedPwd
})

function readUserSettings(): Record<string, unknown> {
  return JSON.parse(files.get(USER_SETTINGS) ?? '{}')
}

describe('validatePermissionRule 语法核心 5 检', () => {
  test('空规则 → invalid', () => {
    expect(validatePermissionRule('')).toEqual({
      valid: false,
      error: 'Permission rule cannot be empty',
    })
    expect(validatePermissionRule('   ')).toEqual({
      valid: false,
      error: 'Permission rule cannot be empty',
    })
  })

  test('括号失衡 → invalid + suggestion', () => {
    const r = validatePermissionRule('Bash(npm install')
    expect(r.valid).toBe(false)
    expect(r.error).toBe('Mismatched parentheses')
    expect(r.suggestion).toBe(
      'Ensure all opening parentheses have matching closing parentheses',
    )
  })

  test('空括号 → invalid + 工具名 suggestion', () => {
    const r = validatePermissionRule('Bash()')
    expect(r.valid).toBe(false)
    expect(r.error).toBe('Empty parentheses')
    expect(r.suggestion).toBe(
      'Either specify a pattern or use just "Bash" without parentheses',
    )
  })

  test('MCP 规则带括号 → invalid', () => {
    const r = validatePermissionRule('mcp__server__tool(x)')
    expect(r.valid).toBe(false)
    expect(r.error).toBe('MCP rules do not support patterns in parentheses')
  })

  test('小写工具名 → invalid + 大写 suggestion', () => {
    const r = validatePermissionRule('bash(npm install)')
    expect(r.valid).toBe(false)
    expect(r.error).toBe('Tool names must start with uppercase')
    // suggestion 仅给工具名（旧仓逐字：capitalize(parsed.toolName)，不含内容）
    expect(r.suggestion).toBe('Use "Bash"')
  })

  test('合法规则 → valid（裸名 / 带内容 / MCP 三形态）', () => {
    expect(validatePermissionRule('Bash(npm install)').valid).toBe(true)
    expect(validatePermissionRule('Grep').valid).toBe(true)
    expect(validatePermissionRule('mcp__server').valid).toBe(true)
    expect(validatePermissionRule('mcp__server__*').valid).toBe(true)
    expect(validatePermissionRule('mcp__server__tool').valid).toBe(true)
  })
})

describe('validatePermissionRule 语义支 3 块（E-6 S-6d，§8.43 判别信号）', () => {
  test('Bash 中置 `:*` 拒（须末尾；末尾 `:*` 前缀形合法）', () => {
    const r = validatePermissionRule('Bash(npm run:* test)')
    expect(r.valid).toBe(false)
    expect(r.error).toBe('The :* pattern must be at the end')
  })

  test('Bash `:*` 空前缀拒', () => {
    const r = validatePermissionRule('Bash(:*)')
    expect(r.valid).toBe(false)
    expect(r.error).toBe('Prefix cannot be empty before :*')
  })

  test('Bash 通配任意位新语义（`npm *` / 末尾 `:*` 前缀形均合法）', () => {
    expect(validatePermissionRule('Bash(npm *)').valid).toBe(true)
    expect(validatePermissionRule('Bash(npm:*)').valid).toBe(true)
    expect(validatePermissionRule('Bash(* install)').valid).toBe(true)
  })

  test('File 工具 `:*` 误用拒（P-D1 探针锚点）', () => {
    const r = validatePermissionRule('Read(x:*)')
    expect(r.valid).toBe(false)
    expect(r.error).toBe('The ":*" syntax is only for Bash prefix rules')
  })

  test('File 中置通配（非 `**` 非边界）拒 / 边界与 `**` 形合法', () => {
    const bad = validatePermissionRule('Read(foo*bar)')
    expect(bad.valid).toBe(false)
    expect(bad.error).toBe('Wildcard placement might be incorrect')
    expect(validatePermissionRule('Read(src/**)').valid).toBe(true)
    expect(validatePermissionRule('Read(*.ts)').valid).toBe(true)
    expect(validatePermissionRule('Read(src/*)').valid).toBe(true)
    expect(validatePermissionRule('Read(**/*.test.ts)').valid).toBe(true)
  })

  test('WebSearch 通配拒（customValidation 块）', () => {
    const r = validatePermissionRule('WebSearch(claude*)')
    expect(r.valid).toBe(false)
    expect(r.error).toBe('WebSearch does not support wildcards')
    expect(validatePermissionRule('WebSearch(claude ai)').valid).toBe(true)
  })

  test('WebFetch URL 拒 + domain: 前缀必填（customValidation 块）', () => {
    const url = validatePermissionRule('WebFetch(https://example.com)')
    expect(url.valid).toBe(false)
    expect(url.error).toBe('WebFetch permissions use domain format, not URLs')
    const noPrefix = validatePermissionRule('WebFetch(example.com)')
    expect(noPrefix.valid).toBe(false)
    expect(noPrefix.error).toBe('WebFetch permissions must use "domain:" prefix')
    expect(validatePermissionRule('WebFetch(domain:example.com)').valid).toBe(
      true,
    )
  })
})

describe('filterInvalidPermissionRules 接缝③ 回填', () => {
  test('语法支：括号失衡规则滤除 + warning 全文（error + suggestion 拼接）', () => {
    const data = { permissions: { allow: ['Bash(unbalanced'] } }
    const warnings = filterInvalidPermissionRules(
      data,
      '/mock-home/settings.json',
    )
    expect(data.permissions.allow).toEqual([])
    expect(warnings).toHaveLength(1)
    // rule 原文进 message（旧仓逐字：`"${rule}"`，不补括号）
    expect(warnings[0].message).toBe(
      'Invalid permission rule "Bash(unbalanced" was skipped: Mismatched parentheses. Ensure all opening parentheses have matching closing parentheses',
    )
    expect(warnings[0].path).toBe('permissions.allow')
    expect(warnings[0].invalidValue).toBe('Bash(unbalanced')
  })

  test('合法规则保留（allow/deny/ask 三键并行）', () => {
    const data = {
      permissions: { allow: ['Bash(npm install)'], deny: ['WebFetch'], ask: ['Grep'] },
    }
    const warnings = filterInvalidPermissionRules(data, 'x')
    expect(warnings).toEqual([])
    expect(data.permissions).toEqual({
      allow: ['Bash(npm install)'],
      deny: ['WebFetch'],
      ask: ['Grep'],
    })
  })

  test('非字符串旧支回归（message 逐字）', () => {
    const data = { permissions: { allow: [123] } }
    const warnings = filterInvalidPermissionRules(data, 'x')
    expect(data.permissions.allow).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toBe('Non-string value in allow array was removed')
  })

  test('混合：空括号滤除 + 合法保留 + 非字符串滤除', () => {
    const data = { permissions: { allow: ['Bash()', 'Grep', { x: 1 }] } }
    const warnings = filterInvalidPermissionRules(data, 'x')
    expect(data.permissions.allow).toEqual(['Grep'])
    expect(warnings).toHaveLength(2)
  })
})

describe('supportsPersistence 门', () => {
  test('3 可编辑源 → true；session/cliArg → false', () => {
    expect(supportsPersistence('userSettings')).toBe(true)
    expect(supportsPersistence('projectSettings')).toBe(true)
    expect(supportsPersistence('localSettings')).toBe(true)
    expect(supportsPersistence('session')).toBe(false)
    expect(supportsPersistence('cliArg')).toBe(false)
  })
})

describe('persistPermissionUpdate 6 型写回（mock 盘 userSettings）', () => {
  test('addRules → allow 写回 + 重复添加幂等', () => {
    persistPermissionUpdate({
      type: 'addRules',
      destination: 'userSettings',
      rules: [{ toolName: 'Bash', ruleContent: 'npm install' }],
      behavior: 'allow',
    })
    expect(readUserSettings().permissions?.allow).toEqual(['Bash(npm install)'])
    // 重复 → loader 去重支（existingRulesSet 命中）→ 文件不变
    persistPermissionUpdate({
      type: 'addRules',
      destination: 'userSettings',
      rules: [{ toolName: 'Bash', ruleContent: 'npm install' }],
      behavior: 'allow',
    })
    expect(readUserSettings().permissions?.allow).toEqual(['Bash(npm install)'])
  })

  test('addDirectories → 去重合并（既有 /a 不重复）', () => {
    files.set(
      USER_SETTINGS,
      JSON.stringify({ permissions: { additionalDirectories: ['/a'] } }),
    )
    resetSettingsCache()
    persistPermissionUpdate({
      type: 'addDirectories',
      destination: 'userSettings',
      directories: ['/a', '/b'],
    })
    expect(readUserSettings().permissions?.additionalDirectories).toEqual([
      '/a',
      '/b',
    ])
  })

  test('removeRules → 归一比较删除 + 兄弟键保留', () => {
    files.set(
      USER_SETTINGS,
      JSON.stringify({ permissions: { allow: ['Grep'], deny: ['Bash'] } }),
    )
    resetSettingsCache()
    persistPermissionUpdate({
      type: 'removeRules',
      destination: 'userSettings',
      rules: [{ toolName: 'Bash' }],
      behavior: 'deny',
    })
    const perms = readUserSettings().permissions as Record<string, unknown>
    expect(perms.deny).toEqual([])
    expect(perms.allow).toEqual(['Grep'])
  })

  test('removeDirectories → 指定目录移除', () => {
    files.set(
      USER_SETTINGS,
      JSON.stringify({
        permissions: { additionalDirectories: ['/a', '/b', '/c'] },
      }),
    )
    resetSettingsCache()
    persistPermissionUpdate({
      type: 'removeDirectories',
      destination: 'userSettings',
      directories: ['/b'],
    })
    expect(readUserSettings().permissions?.additionalDirectories).toEqual([
      '/a',
      '/c',
    ])
  })

  test('setMode → permissions.defaultMode 写回', () => {
    persistPermissionUpdate({
      type: 'setMode',
      destination: 'userSettings',
      mode: 'plan',
    })
    expect(readUserSettings().permissions?.defaultMode).toBe('plan')
  })

  test('replaceRules → 全量替换（旧规则不保留）', () => {
    files.set(
      USER_SETTINGS,
      JSON.stringify({ permissions: { allow: ['Bash(npm ci)', 'Grep'] } }),
    )
    resetSettingsCache()
    persistPermissionUpdate({
      type: 'replaceRules',
      destination: 'userSettings',
      rules: [{ toolName: 'Read' }],
      behavior: 'allow',
    })
    expect(readUserSettings().permissions?.allow).toEqual(['Read'])
  })
})

describe('persist 门控 + 多更新', () => {
  test('session/cliArg destination → no-op 不写盘 + 写回管路零触达（门控判别信号）', () => {
    persistPermissionUpdate({
      type: 'addRules',
      destination: 'session',
      rules: [{ toolName: 'Bash' }],
      behavior: 'allow',
    })
    persistPermissionUpdate({
      type: 'setMode',
      destination: 'cliArg',
      mode: 'plan',
    })
    expect(files.get(USER_SETTINGS)).toBeUndefined()
    // 门控判别信号（mutation probe ②）：下层管路与门同 no-op（
    // getSettingsFilePathForSource 对非可编辑源 → undefined 短路），
    // 仅 settings 缓存触达可判别——无门时 addRules 支会经
    // addPermissionRulesToSettings → getSettingsForSource('session')
    // 种 null 缓存项；有门时 settings 缓存全不触达
    expect(getCachedSettingsForSource('session')).toBeUndefined()
  })

  test('persistPermissionUpdates → 多更新顺序写回', () => {
    const updates: PermissionUpdate[] = [
      {
        type: 'addRules',
        destination: 'userSettings',
        rules: [{ toolName: 'Grep' }],
        behavior: 'allow',
      },
      { type: 'setMode', destination: 'userSettings', mode: 'acceptEdits' },
    ]
    persistPermissionUpdates(updates)
    const s = readUserSettings()
    expect(s.permissions?.allow).toEqual(['Grep'])
    expect(s.permissions?.defaultMode).toBe('acceptEdits')
  })
})

describe('createReadRuleSuggestion 3 支', () => {
  test("根 '/' → undefined（过宽不成目标）", () => {
    expect(createReadRuleSuggestion('/')).toBeUndefined()
  })

  test('绝对路径 → //path/** 模式 + 默认 destination session', () => {
    const u = createReadRuleSuggestion('/srv/data')
    expect(u?.type).toBe('addRules')
    expect(u?.rules).toEqual([{ toolName: 'Read', ruleContent: '//srv/data/**' }])
    expect(u?.behavior).toBe('allow')
    expect(u?.destination).toBe('session')
  })

  test('相对路径 → path/**（destination 透传）', () => {
    const u = createReadRuleSuggestion('data', 'projectSettings')
    expect(u?.rules).toEqual([{ toolName: 'Read', ruleContent: 'data/**' }])
    expect(u?.destination).toBe('projectSettings')
  })
})

describe('permissionUpdateSchema / destination enum（H6 预声明接缝形状核验）', () => {
  test('destination 5 值 enum（合法 5 值通过 + 非法拒绝）', () => {
    for (const d of [
      'userSettings',
      'projectSettings',
      'localSettings',
      'session',
      'cliArg',
    ]) {
      expect(permissionUpdateDestinationSchema().safeParse(d).success).toBe(true)
    }
    expect(permissionUpdateDestinationSchema().safeParse('garbage').success).toBe(
      false,
    )
  })

  test('6 变体 discriminatedUnion 各型解析', () => {
    expect(
      permissionUpdateSchema().safeParse({
        type: 'addRules',
        destination: 'userSettings',
        rules: [{ toolName: 'Bash', ruleContent: 'npm install' }],
        behavior: 'allow',
      }).success,
    ).toBe(true)
    expect(
      permissionUpdateSchema().safeParse({
        type: 'removeDirectories',
        destination: 'localSettings',
        directories: ['/a'],
      }).success,
    ).toBe(true)
    expect(
      permissionUpdateSchema().safeParse({
        type: 'setMode',
        destination: 'projectSettings',
        mode: 'acceptEdits',
      }).success,
    ).toBe(true)
  })

  test('变体字段缺失 → 拒绝（discriminatedUnion 判别信号）', () => {
    const u = permissionUpdateSchema().safeParse({
      type: 'addRules',
      destination: 'userSettings',
      behavior: 'allow',
      // rules 缺失
    })
    expect(u.success).toBe(false)
    const badMode = permissionUpdateSchema().safeParse({
      type: 'setMode',
      destination: 'userSettings',
      mode: 'garbage',
    })
    expect(badMode.success).toBe(false)
  })
})
