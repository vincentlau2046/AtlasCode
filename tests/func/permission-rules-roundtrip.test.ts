/**
 * engine/permissions 规则磁盘加载/写回 真盘 round-trip（E-4 S-4c1，§8.34 门）
 *
 * func 层（真盘 I/O 允许）：ATLAS_CONFIG_DIR → mkdtemp tmpdir，
 * addPermissionRulesToSettings 写盘 → resetSettingsCache →
 * getPermissionRulesForSource 重载出现 / delete 消失 完整往返。
 *   - add → 重载出现（user 源 allow 规则入规则集）
 *   - 重复 add 幂等（盘上仅 1 条）
 *   - delete 命中移除（行为数组清空、兄弟键保留）
 *   - 坏文件写路径边界：JSON 语法错 → add false 不覆写（updateSettingsForSource
 *     保护支）/ 合法 JSON schema 校验失败 → lenient 读恢复 + 新规则落盘
 *   - PWD 真 symlink → 附加工作目录 session 源（isSymlinkTo 真盘判定）
 * 零 mock fs（真 NodeFsOperations + 真 tmpdir）。
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  addPermissionRulesToSettings,
  deletePermissionRuleFromSettings,
  getPermissionRulesForSource,
  initializeToolPermissionContext,
  resetSettingsCache,
} from '../../src/engine'
import {
  getOriginalCwd,
  resetStateForTests,
  setOriginalCwd,
} from '../../src/bootstrap'

const USER_SETTINGS = (root: string) => join(root, 'settings.json')

let root: string
let savedConfigDir: string | undefined
let savedPwd: string | undefined
let savedOriginalCwd: string

function readDisk(rootDir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(USER_SETTINGS(rootDir), 'utf-8'))
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-perm-roundtrip-'))
  // bootstrap cwd 面存还对称复位（单进程连跑不跨文件泄漏）
  savedOriginalCwd = getOriginalCwd()
})

afterAll(() => {
  setOriginalCwd(savedOriginalCwd)
  rmSync(root, { recursive: true, force: true })
})

beforeEach(() => {
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = root
  savedPwd = process.env.PWD
  delete process.env.PWD
  resetSettingsCache()
})

afterEach(() => {
  resetSettingsCache()
  resetStateForTests()
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
  if (savedPwd === undefined) delete process.env.PWD
  else process.env.PWD = savedPwd
})

describe('add → 重载出现（真盘 round-trip）', () => {
  test('addPermissionRulesToSettings 写盘 → getPermissionRulesForSource 重载出现', () => {
    expect(
      addPermissionRulesToSettings(
        {
          ruleValues: [{ toolName: 'Bash', ruleContent: 'npm install' }],
          ruleBehavior: 'allow',
        },
        'userSettings',
      ),
    ).toBe(true)

    resetSettingsCache()
    const rules = getPermissionRulesForSource('userSettings')
    expect(rules).toEqual([
      {
        source: 'userSettings',
        ruleBehavior: 'allow',
        ruleValue: { toolName: 'Bash', ruleContent: 'npm install' },
      },
    ])
  })

  test('重复 add 同规则幂等（盘上仅 1 条）', () => {
    expect(
      addPermissionRulesToSettings(
        {
          ruleValues: [{ toolName: 'Bash', ruleContent: 'npm install' }],
          ruleBehavior: 'allow',
        },
        'userSettings',
      ),
    ).toBe(true)
    const onDisk = readDisk(root)
    expect(onDisk.permissions.allow).toEqual(['Bash(npm install)'])
  })
})

describe('delete 命中移除（真盘）', () => {
  test('deletePermissionRuleFromSettings 移除命中规则 + 兄弟键/不识别键保留', () => {
    writeFileSync(
      USER_SETTINGS(root),
      JSON.stringify({
        permissions: { allow: ['Bash(x)', 'Read'], deny: ['WebFetch'] },
        extraKey: 42,
      }),
    )
    resetSettingsCache()

    expect(
      deletePermissionRuleFromSettings({
        source: 'userSettings',
        ruleBehavior: 'allow',
        ruleValue: { toolName: 'Read' },
      }),
    ).toBe(true)

    const onDisk = readDisk(root)
    expect(onDisk.permissions.allow).toEqual(['Bash(x)'])
    expect(onDisk.permissions.deny).toEqual(['WebFetch'])
    expect(onDisk.extraKey).toBe(42)
  })

  test('delete 后重载：规则消失（round-trip 反向）', () => {
    writeFileSync(
      USER_SETTINGS(root),
      JSON.stringify({ permissions: { allow: ['Bash(npm install)'] } }),
    )
    resetSettingsCache()
    expect(
      deletePermissionRuleFromSettings({
        source: 'userSettings',
        ruleBehavior: 'allow',
        ruleValue: { toolName: 'Bash', ruleContent: 'npm install' },
      }),
    ).toBe(true)
    resetSettingsCache()
    expect(getPermissionRulesForSource('userSettings')).toEqual([])
  })
})

describe('坏文件写路径边界（updateSettingsForSource 不覆写损坏文件）', () => {
  test('JSON 语法错误 → add false + 文件不被覆写（保护用户手改的坏文件）', () => {
    writeFileSync(USER_SETTINGS(root), '{ not valid json !!!')

    expect(
      addPermissionRulesToSettings(
        { ruleValues: [{ toolName: 'Grep' }], ruleBehavior: 'deny' },
        'userSettings',
      ),
    ).toBe(false)
    expect(readFileSync(USER_SETTINGS(root), 'utf-8')).toBe(
      '{ not valid json !!!',
    )
  })

  test('合法 JSON 但 schema 校验失败（字段类型错）→ lenient 读恢复 + 新规则落盘', () => {
    writeFileSync(
      USER_SETTINGS(root),
      JSON.stringify({ alwaysThinkingEnabled: 'yes', permissions: {} }),
    )
    resetSettingsCache()

    expect(
      addPermissionRulesToSettings(
        { ruleValues: [{ toolName: 'Grep' }], ruleBehavior: 'deny' },
        'userSettings',
      ),
    ).toBe(true)

    const onDisk = readDisk(root)
    expect(onDisk.permissions.deny).toEqual(['Grep'])
    // 不识别/非法字段经写回保留（spread 原样）
    expect(onDisk.alwaysThinkingEnabled).toBe('yes')
  })
})

describe('PWD 真 symlink → 附加工作目录（isSymlinkTo 真盘判定）', () => {
  test('PWD=symlink 且解析到 originalCwd → session 源附加目录', async () => {
    const realDir = join(root, 'realdir')
    const linkPath = join(root, 'linkdir')
    mkdirSync(realDir)
    symlinkSync(realDir, linkPath)

    setOriginalCwd(realDir)
    process.env.PWD = linkPath

    const { toolPermissionContext: ctx } = await initializeToolPermissionContext({
      allowedToolsCli: [],
      disallowedToolsCli: [],
      permissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      addDirs: [],
    })
    expect(ctx.additionalWorkingDirectories.get(linkPath)).toEqual({
      path: linkPath,
      source: 'session',
    })
  })

  test('PWD=realDir（非 symlink）→ 不加 session 目录', async () => {
    const realDir = join(root, 'realdir')
    mkdirSync(realDir, { recursive: true })
    setOriginalCwd(realDir)
    process.env.PWD = realDir

    const { toolPermissionContext: ctx } = await initializeToolPermissionContext({
      allowedToolsCli: [],
      disallowedToolsCli: [],
      permissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      addDirs: [],
    })
    expect(ctx.additionalWorkingDirectories.get(realDir)).toBeUndefined()
  })
})
