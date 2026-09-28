/**
 * cli 域（CLI 公共域）unit 测试（S-C2 §8.71.1.4 · 零模型 / 零网络 / 零磁盘）
 *
 * 测试面（预声明接缝 = 域外裁/前向接缝头注登记，复审勿当遗漏重提）：
 *  - entryInit 纯函数：parseSettingSourcesFlag / safeParseJSON /
 *    eagerParseCliFlag / generateTempFilePath（内容哈希路径确定性）/
 *    initializeEntrypoint（mcp / ATLAS_ACTION / 非交互-交互 / 预置 5 支）
 *  - dev.hasDevFlag（dev 面嗅探面；`--flag=x` 形态不命中 = 旧 commander
 *    boolean 语义）
 *  - parse.buildProgram 结构面：name / 版本 flag / 入域选项面在场 /
 *    域外裁选项面缺席（advisor / teleport / remote / remote-control）/
 *    UDS env 门两态（ATLAS_EXPERIMENTAL_UDS_INBOX opt-in 默认 OFF）/
 *    TRANSCRIPT_CLASSIFIER 门（ON_BY_DEFAULT → --enable-auto-mode 在场）
 *  - 接缝接线断言（H6 防空洞：断言「显式接缝行为」而非能力假绿）：
 *    主面 seam = S-C3 print / 壳波 #152 前向接缝（process.exit stub 抛验）
 *  - S-C4 commit 4 落盘断言（mcp 族 6 接缝 → 真 handler）：mcp list handler
 *    = 无配置空态输出 + 自然返回（无 process.exit）/ mcpConfigWrite 纯面
 *    （ensureConfigScope / ensureTransport / parseHeaders / parseEnvVars /
 *    expandEnvVarsInString）
 */
import { describe, test, expect } from 'bun:test'
import { tmpdir } from 'node:os'
import {
  buildProgram,
  eagerParseCliFlag,
  ensureConfigScope,
  ensureTransport,
  expandEnvVarsInString,
  generateTempFilePath,
  hasDevFlag,
  initializeEntrypoint,
  parseEnvVars,
  parseHeaders,
  parseSettingSourcesFlag,
  registerInDomainSubcommands,
  safeParseJSON,
} from '../../src/cli'

type CProgram = ReturnType<typeof buildProgram>

// commander v15 无 getOptions() 公共 API — options 是 Option[] 内部数组，
// 每个 Option 的 .flags 形如 '-d, --debug [filter]' / '--bare' / '-p, --print'。
// 解析出 long flag（--xxx）集合供结构面断言。
function optionLongs(program: CProgram): string[] {
  const opts = (program as unknown as { options: Array<{ flags: string }> }).options
  const longs = new Set<string>()
  for (const o of opts) {
    for (const part of o.flags.split(',')) {
      const flag = part.trim().split(/\s+/)[0]
      if (flag?.startsWith('--')) longs.add(flag)
    }
  }
  return [...longs]
}

// process.argv / env 操作用具（initializeEntrypoint / eagerParseCliFlag 读
// process.argv；测试进程 argv = bun test 运行器 args，save/restore 三态）
function withSavedArgv<T>(fn: (argv: string[]) => T): T {
  // 必须拷贝（process.argv 是活数组引用；测试体内 argv.length=0/push 是
  // 原地变异，存引用会在 restore 时把变异带回来污染后续用例）
  const saved = process.argv.slice()
  const savedEntry = process.env.ATLAS_ENTRYPOINT
  const savedAction = process.env.ATLAS_ACTION
  // 注意：process.env.X = undefined 会强转成字符串 "undefined"（truthy），
  // 必须用 delete（initializeEntrypoint 的预置早退支会误命中）
  delete process.env.ATLAS_ENTRYPOINT
  delete process.env.ATLAS_ACTION
  let result: T
  try {
    result = fn(process.argv)
  } finally {
    process.argv = saved
    if (savedEntry === undefined) delete process.env.ATLAS_ENTRYPOINT
    else process.env.ATLAS_ENTRYPOINT = savedEntry
    if (savedAction === undefined) delete process.env.ATLAS_ACTION
    else process.env.ATLAS_ACTION = savedAction
  }
  return result
}

describe('cli 域 S-C2 · entryInit 纯函数面', () => {
  test('parseSettingSourcesFlag: 逗号分列 + trim + 空段过滤', () => {
    expect(parseSettingSourcesFlag('user, project')).toEqual(['user', 'project'])
    expect(parseSettingSourcesFlag('local')).toEqual(['local'])
    expect(parseSettingSourcesFlag('user,,local')).toEqual(['user', 'local'])
  })

  test('parseSettingSourcesFlag: 违界源 throw', () => {
    expect(() => parseSettingSourcesFlag('user,bogus')).toThrow()
  })

  test('safeParseJSON: 合法 → 对象 / 非法 → null', () => {
    expect(safeParseJSON('{"a":1}')).toEqual({ a: 1 })
    expect(safeParseJSON('not json')).toBeNull()
  })

  test('generateTempFilePath: 内容哈希路径确定性（同内容同路径）', () => {
    const p1 = generateTempFilePath('atlas-settings', '.json', {
      contentHash: '{"a":1}',
    })
    const p2 = generateTempFilePath('atlas-settings', '.json', {
      contentHash: '{"a":1}',
    })
    const p3 = generateTempFilePath('atlas-settings', '.json', {
      contentHash: '{"a":2}',
    })
    expect(p1).toBe(p2)
    expect(p1).not.toBe(p3)
    expect(p1.endsWith('.json')).toBe(true)
  })

  test('generateTempFilePath: 无内容哈希 → UUID 路径形态（旧仓 randomUUID 逐字）', () => {
    const p = generateTempFilePath('atlas-x', '.json', {})
    expect(p.slice(p.lastIndexOf('/') + 1)).toMatch(
      /^atlas-x-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/,
    )
  })

  test('initializeEntrypoint: mcp serve argv → "mcp"', () => {
    withSavedArgv(argv => {
      argv.length = 0
      argv.push('node', 'atlascode', 'mcp', 'serve')
      initializeEntrypoint(false)
      expect(process.env.ATLAS_ENTRYPOINT).toBe('mcp')
    })
  })

  test('initializeEntrypoint: ATLAS_ACTION → github-action', () => {
    withSavedArgv(() => {
      process.env.ATLAS_ACTION = '1'
      initializeEntrypoint(false)
      expect(process.env.ATLAS_ENTRYPOINT).toBe('claude-code-github-action')
    })
  })

  test('initializeEntrypoint: 交互/非交互 → cli / sdk-cli', () => {
    // 两分支各起一个隔离块：第一次调用置值后，第二次调用会命中预置早退支
    withSavedArgv(() => {
      initializeEntrypoint(false)
      expect(process.env.ATLAS_ENTRYPOINT).toBe('cli')
    })
    withSavedArgv(() => {
      initializeEntrypoint(true)
      expect(process.env.ATLAS_ENTRYPOINT).toBe('sdk-cli')
    })
  })

  test('initializeEntrypoint: 预置 ATLAS_ENTRYPOINT 不被覆盖', () => {
    withSavedArgv(() => {
      process.env.ATLAS_ENTRYPOINT = 'local-agent'
      initializeEntrypoint(false)
      expect(process.env.ATLAS_ENTRYPOINT).toBe('local-agent')
    })
  })

  test('eagerParseCliFlag: 空格形态 / = 形态 / 缺席', () => {
    withSavedArgv(argv => {
      argv.length = 0
      argv.push('node', 'atlascode', '--settings', 'x.json')
      expect(eagerParseCliFlag('--settings')).toBe('x.json')
    })
    withSavedArgv(argv => {
      argv.length = 0
      argv.push('node', 'atlascode', '--settings=y.json')
      expect(eagerParseCliFlag('--settings')).toBe('y.json')
    })
    withSavedArgv(argv => {
      argv.length = 0
      argv.push('node', 'atlascode')
      expect(eagerParseCliFlag('--settings')).toBeUndefined()
    })
  })
})

describe('cli 域 S-C2 · dev 面嗅探', () => {
  test('hasDevFlag: 命中 / 未命中 / = 形态不命中', () => {
    expect(hasDevFlag(['--tools'])).toBe(true)
    expect(hasDevFlag(['--check', '--e2e'])).toBe(true)
    expect(hasDevFlag(['--tools=x'])).toBe(false)
    expect(hasDevFlag([])).toBe(false)
    expect(hasDevFlag(['--print'])).toBe(false)
  })
})

describe('cli 域 S-C2 · buildProgram 结构面', () => {
  test('name + 版本 flag', () => {
    const p = buildProgram()
    expect(p.name()).toBe('atlascode')
    expect(optionLongs(p)).toContain('--version')
  })

  test('入域选项面在场（S-C2 随迁段）', () => {
    const longs = optionLongs(buildProgram())
    for (const opt of [
      '--print',
      '--bare',
      '--output-format',
      '--model',
      '--effort',
      '--permission-mode',
      '--mcp-config',
      '--worktree',
      '--tmux',
      '--agent-id',
      '--teammate-mode',
      '--sdk-url',
      '--setting-sources',
    ]) {
      expect(longs, `${opt} 缺席`).toContain(opt)
    }
  })

  test('TRANSCRIPT_CLASSIFIER 门（ON_BY_DEFAULT）→ --enable-auto-mode 在场', () => {
    expect(optionLongs(buildProgram())).toContain('--enable-auto-mode')
  })

  test('域外裁选项面缺席（裁登记见 parse.ts 头注）', () => {
    const longs = optionLongs(buildProgram())
    for (const opt of ['--advisor', '--teleport', '--remote', '--remote-control']) {
      expect(longs, `${opt} 应为域外裁（不注册）`).not.toContain(opt)
    }
  })

  test('UDS env 门两态（ATLAS_EXPERIMENTAL_UDS_INBOX opt-in 默认 OFF）', () => {
    expect(optionLongs(buildProgram())).not.toContain('--messaging-socket-path')
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    try {
      expect(optionLongs(buildProgram())).toContain('--messaging-socket-path')
    } finally {
      delete process.env.ATLAS_EXPERIMENTAL_UDS_INBOX
    }
  })
})

describe('cli 域 S-C4 commit 4 · mcp 族落盘（S-C2 seam 断言更新，H6 防空洞：断言 handler 行为）', () => {
  test('mcp list handler = 无配置空态输出 + 自然返回（无 process.exit）', async () => {
    const program = buildProgram()
    registerInDomainSubcommands(program)
    program.exitOverride()
    const realExit = process.exit
    const realStdoutWrite = process.stdout.write
    const realConfigDir = process.env.ATLAS_CONFIG_DIR
    let stdout = ''
    let exited = false
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += String(chunk)
      return true
    }) as typeof process.stdout.write
    process.exit = (() => {
      exited = true
      throw new Error('__handler_exit')
    }) as typeof process.exit
    // config home = 不存在的 tmp 路径（user/local settings 源空，零磁盘写；
    // 仓根无 .mcp.json → project 源空 = 3 源全空，读面 ENOENT fail-soft）
    process.env.ATLAS_CONFIG_DIR = `${tmpdir()}/atlas-cli-sc4-mcp-nonexistent`
    try {
      await program.parseAsync(['node', 'atlascode', 'mcp', 'list'])
    } finally {
      process.env.ATLAS_CONFIG_DIR = realConfigDir
      process.stdout.write = realStdoutWrite
      process.exit = realExit
    }
    expect(exited).toBe(false)
    expect(stdout).toContain('No MCP servers configured')
  })

  test('mcpConfigWrite 纯面（scope / transport / header / env / env 展开）', () => {
    expect(ensureConfigScope()).toBe('local')
    expect(ensureConfigScope('user')).toBe('user')
    expect(() => ensureConfigScope('bogus')).toThrow(/Invalid scope/)
    expect(ensureTransport()).toBe('stdio')
    expect(ensureTransport('sse')).toBe('sse')
    expect(() => ensureTransport('ws')).toThrow(/Invalid transport/)
    expect(parseHeaders(['X-Api-Key: abc123'])).toEqual({
      'X-Api-Key': 'abc123',
    })
    expect(() => parseHeaders(['no-colon'])).toThrow(/Invalid header/)
    expect(parseEnvVars(['A=1', 'B=x=y'])).toEqual({ A: '1', B: 'x=y' })
    expect(() => parseEnvVars(['NOVALUE'])).toThrow(
      /Invalid environment variable/,
    )
    const r = expandEnvVarsInString(
      '${ATLAS_SC4_TEST_VAR} and ${ATLAS_SC4_TEST_VAR2:-dflt}',
    )
    expect(r.expanded).toBe('${ATLAS_SC4_TEST_VAR} and dflt')
    expect(r.missingVars).toEqual(['ATLAS_SC4_TEST_VAR'])
  })
})
