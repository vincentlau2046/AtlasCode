/**
 * §8.55 S-C2（C 桶 ① 子波 3 高频族纵切 · 依赖闭包层 2）纯叶子批单测。
 *
 * 覆盖（零磁盘零网络；env 卫生保存/恢复）：
 *  - shared/windowsPaths 双纯函数（§8.55 S-C2 自 bash 域提升；探针锚
 *    P-C2：突变盘符/UNC 支 → 下列断言恰 1 红）
 *  - files/globUtils extractGlobBaseDirectory（旧仓 glob.ts 纯函数面；
 *    Windows 盘根支 linux 机不可测 = getPlatform 进程定形先例）
 *  - files/globIgnorePatterns（旧仓 permissions/filesystem.ts 闭包裁面：
 *    normalizePatternsToPath 5 支 + getFileReadIgnorePatterns 三源路由）
 *  - memory/memoryFileDetection（检测族 env 门控 + 纯字符串面）
 *  - memory/validateMemoryFrontmatter + frontmatterParser（校验族 +
 *    YAML 引号重试面）
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { resolve } from 'path'
import {
  posixPathToWindowsPath,
  windowsPathToPosixPath,
  type ToolPermissionContext,
} from '../../src/shared'
import { extractGlobBaseDirectory } from '../../src/engine/tools/files/globUtils'
import {
  getFileReadIgnorePatterns,
  normalizePatternsToPath,
} from '../../src/engine/tools/files/globIgnorePatterns'
import {
  detectSessionFileType,
  detectSessionPatternType,
  isAutoManagedMemoryPattern,
  isAutoManagedMemoryFile,
  isAutoMemFile,
  isMemoryDirectory,
  isShellCommandTargetingMemory,
  memoryScopeForPath,
} from '../../src/memory'
import {
  isUnderMemoryDir,
  validateMemoryFrontmatter,
  parseFrontmatter,
} from '../../src/memory'
import { getAutoMemPath } from '../../src/memory'

/** 本批消费的 env 键（卫生保存/恢复） */
const ENV_KEYS = [
  'ATLAS_CONFIG_DIR',
  'ATLAS_DISABLE_AUTO_MEMORY',
  'ATLAS_SIMPLE',
  'ATLAS_REMOTE',
  'ATLAS_REMOTE_MEMORY_DIR',
  'ATLAS_COWORK_MEMORY_PATH_OVERRIDE',
] as const
let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv = {}
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

const FAKE_CFG = '/tmp/atlas-sc2-fakecfg'

describe('shared/windowsPaths（§8.55 S-C2 提升；探针 P-C2 锚）', () => {
  test('windowsPathToPosixPath：UNC 支', () => {
    expect(windowsPathToPosixPath('\\\\server\\share\\x')).toBe(
      '//server/share/x',
    )
  })
  test('windowsPathToPosixPath：盘符支（C:\\Users\\foo → /c/Users/foo）', () => {
    expect(windowsPathToPosixPath('C:\\Users\\foo')).toBe('/c/Users/foo')
    expect(windowsPathToPosixPath('D:/x')).toBe('/d/x')
  })
  test('windowsPathToPosixPath：已是 POSIX / 相对 → 翻转', () => {
    expect(windowsPathToPosixPath('/a/b')).toBe('/a/b')
    expect(windowsPathToPosixPath('a\\b')).toBe('a/b')
  })
  test('posixPathToWindowsPath：UNC 支', () => {
    expect(posixPathToWindowsPath('//server/share/x')).toBe(
      '\\\\server\\share\\x',
    )
  })
  test('posixPathToWindowsPath：cygdrive 支', () => {
    expect(posixPathToWindowsPath('/cygdrive/c/x')).toBe('C:\\x')
  })
  test('posixPathToWindowsPath：MinGW /c/ 支（MSYS2/Git Bash）', () => {
    expect(posixPathToWindowsPath('/c/Users/x')).toBe('C:\\Users\\x')
    expect(posixPathToWindowsPath('/c/')).toBe('C:\\')
  })
  test('posixPathToWindowsPath：已是 Windows / 相对 → 翻转', () => {
    expect(posixPathToWindowsPath('C:\\x')).toBe('C:\\x')
    expect(posixPathToWindowsPath('a/b')).toBe('a\\b')
  })
})

describe('globUtils extractGlobBaseDirectory（旧仓逐字纯函数面）', () => {
  test('字面路径（无 glob 字符）→ dirname / basename 拆分', () => {
    expect(extractGlobBaseDirectory('/a/b/c.txt')).toEqual({
      baseDir: '/a/b',
      relativePattern: 'c.txt',
    })
  })
  test('glob 字符前静态前缀提取（/a/b/*.txt）', () => {
    expect(extractGlobBaseDirectory('/a/b/*.txt')).toEqual({
      baseDir: '/a/b',
      relativePattern: '*.txt',
    })
  })
  test('静态前缀含分隔符 → 拆基目录（src/*.ts → src + *.ts）', () => {
    expect(extractGlobBaseDirectory('src/*.ts')).toEqual({
      baseDir: 'src',
      relativePattern: '*.ts',
    })
  })

  test('glob 字符在 0 位且无分隔符 → 相对 cwd（baseDir 空串）', () => {
    expect(extractGlobBaseDirectory('*.ts')).toEqual({
      baseDir: '',
      relativePattern: '*.ts',
    })
  })
  test('根目录模式（/*.txt → lastSepIndex = 0 → baseDir = /）', () => {
    expect(extractGlobBaseDirectory('/*.txt')).toEqual({
      baseDir: '/',
      relativePattern: '*.txt',
    })
  })
})

describe('globIgnorePatterns normalizePatternsToPath（5 支）', () => {
  test('null root（无根模式）透传', () => {
    const input = new Map<string | null, string[]>([
      [null, ['secrets/**', './.env']],
    ])
    expect(normalizePatternsToPath(input, '/x')).toEqual([
      'secrets/**',
      './.env',
    ])
  })

  test('root 精确匹配 → 模式前置 / 分隔符', () => {
    const input = new Map<string | null, string[]>([
      ['/x', ['a/**']],
    ])
    expect(normalizePatternsToPath(input, '/x')).toEqual(['/a/**'])
  })

  test('root 是参照根子目录 → 相对段拼接', () => {
    const input = new Map<string | null, string[]>([
      ['/x/sub', ['a/**']],
    ])
    expect(normalizePatternsToPath(input, '/x')).toEqual(['/sub/a/**'])
  })

  test('root 在参照根外（.. 支）→ 跳过（返回空集 + null 集合并）', () => {
    const input = new Map<string | null, string[]>([
      ['/other', ['a/**']],
    ])
    expect(normalizePatternsToPath(input, '/x')).toEqual([])
  })

  test('./ 前缀模式归一（./.env → .env）经 patternWithRoot 面', () => {
    // getFileReadIgnorePatterns 面验证：相对模式归一到 null root
    const ctx = makeCtx({ session: ['Read(./.env)'] })
    const map = getFileReadIgnorePatterns(ctx)
    expect(Array.from(map.get(null) ?? [])).toContain('.env')
  })
})

/** 最小 ToolPermissionContext 铸造（单测面；型经 cast 收窄） */
function makeCtx(
  denyRules: Record<string, string[]> = {},
): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: denyRules,
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  } as unknown as ToolPermissionContext
}

describe('globIgnorePatterns getFileReadIgnorePatterns（三源路由）', () => {
  test('相对模式（无根符号）→ null root', () => {
    const map = getFileReadIgnorePatterns(makeCtx({ session: ['Read(a/**)'] }))
    expect(Array.from(map.get(null) ?? [])).toContain('a/**')
  })

  test('~ 模式 → homedir NFC 根', () => {
    process.env.ATLAS_CONFIG_DIR = FAKE_CFG
    const map = getFileReadIgnorePatterns(
      makeCtx({ userSettings: ['Read(~/secrets)'] }),
    )
    // 键含 homedir 根（非 null / 非 settings 根）
    const keys = Array.from(map.keys())
    expect(keys.length).toBe(1)
    const root = keys[0]
    expect(root).not.toBeNull()
    expect(root?.startsWith('/')).toBe(true)
    // 旧仓逐字口径：slice(1) 仅剥 '~'，保留前导 '/'（posix.join 语义）
    expect(Array.from(map.get(root) ?? [])).toContain('/secrets')
  })

  test('绝对模式 + settings 源 → settings 根（ATLAS_CONFIG_DIR 活 env）', () => {
    process.env.ATLAS_CONFIG_DIR = FAKE_CFG
    const map = getFileReadIgnorePatterns(
      makeCtx({ userSettings: ['Read(/etc/passwd)'] }),
    )
    expect(map.get(resolve(FAKE_CFG))?.includes('/etc/passwd')).toBe(true)
  })

  test('session 源 → original cwd 根（expandPath 恒等）', () => {
    const map = getFileReadIgnorePatterns(
      makeCtx({ session: ['Read(/a/**)'] }),
    )
    const cwdRoot = Array.from(map.keys()).find(
      k => k === process.cwd(),
    )
    expect(cwdRoot).toBe(process.cwd())
    expect(Array.from(map.get(process.cwd()) ?? [])).toContain('/a/**')
  })
})

describe('memory/memoryFileDetection 检测族（env 门控）', () => {
  test('detectSessionPatternType：session-memory / jsonl 双面', () => {
    expect(detectSessionPatternType('session-memory/a.md')).toBe(
      'session_memory',
    )
    expect(detectSessionPatternType('session-memory/*')).toBe(
      'session_memory',
    )
    expect(detectSessionPatternType('*.jsonl')).toBe('session_transcript')
    expect(detectSessionPatternType('projects/*.jsonl')).toBe(
      'session_transcript',
    )
    expect(detectSessionPatternType('src/a.md')).toBe(null)
  })

  test('detectSessionFileType（ATLAS_CONFIG_DIR 活 env）', () => {
    process.env.ATLAS_CONFIG_DIR = FAKE_CFG
    expect(detectSessionFileType(`${FAKE_CFG}/session-memory/a.md`)).toBe(
      'session_memory',
    )
    expect(detectSessionFileType(`${FAKE_CFG}/projects/x.jsonl`)).toBe(
      'session_transcript',
    )
    expect(detectSessionFileType(`${FAKE_CFG}/other.md`)).toBe(null)
    expect(detectSessionFileType(`/elsewhere/session-memory/a.md`)).toBe(null)
  })

  test('isAutoMemFile：ATLAS_DISABLE_AUTO_MEMORY=1 全假', () => {
    process.env.ATLAS_DISABLE_AUTO_MEMORY = '1'
    expect(isAutoMemFile(`${FAKE_CFG}/memory/a.md`)).toBe(false)
  })

  test('isAutoMemFile：启用面走域缺省 autoMem 路径（自洽断言）', () => {
    // 域缺省 projectRoot = process.cwd()（memory/paths 头注裁定）→
    // 期望值经同一 facade 计算，免硬编码 sanitize 形态
    const base = getAutoMemPath()
    expect(isAutoMemFile(base + 'note.md')).toBe(true)
    expect(isAutoMemFile('/etc/passwd')).toBe(false)
  })

  test('memoryScopeForPath：autoMem 内 = personal / 其余 null（team 支裁面）', () => {
    const base = getAutoMemPath()
    expect(memoryScopeForPath(base + 'note.md')).toBe('personal')
    expect(memoryScopeForPath('/etc/passwd')).toBe(null)
  })

  test('isAutoManagedMemoryFile：session 文件支', () => {
    process.env.ATLAS_CONFIG_DIR = FAKE_CFG
    expect(
      isAutoManagedMemoryFile(`${FAKE_CFG}/session-memory/a.md`),
    ).toBe(true)
    expect(isAutoManagedMemoryFile('/etc/passwd')).toBe(false)
  })

  test('isMemoryDirectory：嵌套段匹配（含尾段，旧仓 includes("/x/") 口径）', () => {
    process.env.ATLAS_CONFIG_DIR = FAKE_CFG
    expect(isMemoryDirectory(`${FAKE_CFG}/session-memory/x.md`)).toBe(true)
    expect(isMemoryDirectory(`${FAKE_CFG}/projects/x`)).toBe(true)
    expect(isMemoryDirectory(`${FAKE_CFG}/memory/x.md`)).toBe(true)
    // agent-memory 纯字符串支（域未物化前向接缝，逐字保留）
    expect(isMemoryDirectory(`${FAKE_CFG}/agent-memory/a-agent`)).toBe(true)
    // 旧仓口径：裸目录（无尾段）不匹配 includes('/x/') → false（逐字保留）
    expect(isMemoryDirectory(`${FAKE_CFG}/session-memory`)).toBe(false)
    expect(isMemoryDirectory('/elsewhere')).toBe(false)
  })

  test('isShellCommandTargetingMemory：命中 config 目录 + 路径 token 提取', () => {
    process.env.ATLAS_CONFIG_DIR = FAKE_CFG
    expect(
      isShellCommandTargetingMemory(`cat ${FAKE_CFG}/session-memory/a.md`),
    ).toBe(true)
    // 提及目录但 token 非记忆面（projects 下 .jsonl = 会话转录，仍命中）
    expect(
      isShellCommandTargetingMemory(`ls ${FAKE_CFG}/projects/x.jsonl`),
    ).toBe(true)
    // 完全不提及 config / memory 目录 → 快检 false
    expect(isShellCommandTargetingMemory('cat /etc/hosts')).toBe(false)
    expect(isShellCommandTargetingMemory('echo hi')).toBe(false)
  })

  test('isAutoManagedMemoryPattern：session / agent-memory 模式支', () => {
    expect(isAutoManagedMemoryPattern('session-memory/*.md')).toBe(true)
    expect(isAutoManagedMemoryPattern('agent-memory/x/*.md')).toBe(true)
    expect(isAutoManagedMemoryPattern('src/*.ts')).toBe(false)
  })
})

describe('memory/validateMemoryFrontmatter + isUnderMemoryDir', () => {
  const VALID = [
    '---',
    'name: my-memory',
    'description: One-line summary',
    'type: user',
    '---',
    'body',
  ].join('\n')

  test('合法 frontmatter → null', () => {
    expect(validateMemoryFrontmatter(VALID, '/m/a.md')).toBeNull()
  })

  test('MEMORY.md 索引面 → null（无 frontmatter 要求）', () => {
    expect(validateMemoryFrontmatter('plain', '/m/MEMORY.md')).toBeNull()
  })

  test('缺 name → 错误含 name 字段指引', () => {
    const err = validateMemoryFrontmatter(
      ['---', 'description: d', 'type: user', '---'].join('\n'),
      '/m/a.md',
    )
    expect(err).toContain("missing required frontmatter field 'name'")
  })

  test('缺 description → 错误含 description 字段指引', () => {
    const err = validateMemoryFrontmatter(
      ['---', 'name: n', 'type: user', '---'].join('\n'),
      '/m/a.md',
    )
    expect(err).toContain("missing required frontmatter field 'description'")
  })

  test('缺 type → 错误含类型清单', () => {
    const err = validateMemoryFrontmatter(
      ['---', 'name: n', 'description: d', '---'].join('\n'),
      '/m/a.md',
    )
    expect(err).toContain("missing required frontmatter field 'type'")
  })

  test('type 非法（非 MEMORY_TYPES）→ invalid type 错误', () => {
    const err = validateMemoryFrontmatter(
      ['---', 'name: n', 'description: d', 'type: banana', '---'].join('\n'),
      '/m/a.md',
    )
    expect(err).toContain("invalid type 'banana'")
  })

  test('isUnderMemoryDir：/memory/ 段 + .md 后缀（含 Windows 分隔符）', () => {
    expect(isUnderMemoryDir('/x/memory/a.md')).toBe(true)
    expect(isUnderMemoryDir('C:\\x\\memory\\a.md')).toBe(true)
    expect(isUnderMemoryDir('/x/memory/a.txt')).toBe(false)
    expect(isUnderMemoryDir('/x/a.md')).toBe(false)
  })
})

describe('memory/frontmatterParser parseFrontmatter（YAML 引号重试面）', () => {
  test('无 frontmatter → 空对象 + 原文透传', () => {
    const { frontmatter, content } = parseFrontmatter('# title\nbody')
    expect(Object.keys(frontmatter)).toEqual([])
    expect(content).toBe('# title\nbody')
  })

  test('标准 frontmatter → 字段 + 内容切片（闭合 --- 后）', () => {
    const md = ['---', 'name: n', 'description: d', 'type: user', '---', 'body']
      .join('\n')
    const { frontmatter, content } = parseFrontmatter(md)
    expect(frontmatter.name).toBe('n')
    expect(frontmatter.description).toBe('d')
    expect(frontmatter.type).toBe('user')
    expect(content).toBe('body')
  })

  test('含 ": " 的值 → 裸解析失败后引号重试成功（quoteProblematicValues 面）', () => {
    const md = ['---', 'description: a: b', '---', 'body'].join('\n')
    const { frontmatter } = parseFrontmatter(md)
    expect(frontmatter.description).toBe('a: b')
  })

  test('glob 花括号模式值（旧仓注释例 **/*.{ts,tsx}）→ 引号重试', () => {
    const md = ['---', 'paths: **/*.{ts,tsx}', '---'].join('\n')
    const { frontmatter } = parseFrontmatter(md)
    expect(frontmatter.paths).toBe('**/*.{ts,tsx}')
  })

  test('坏 YAML 双失败 → 空对象 + 不抛', () => {
    const md = ['---', ': : : {{{', '---', 'body'].join('\n')
    const { frontmatter } = parseFrontmatter(md, '/x.md')
    expect(frontmatter).toEqual({})
  })
})
