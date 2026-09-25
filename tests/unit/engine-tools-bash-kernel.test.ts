/**
 * engine/tools/bash 内核 8 文件 unit 测试（§8.53 S-T1，工具本体波 C 桶 ①）
 *
 * 被测 = src/engine/tools/bash/（旧仓 src/utils/bash/ 闭包子集逐字随迁，经
 * tools 域门面消费，STR-1）。旧仓无本内核专属测试面（tests 仅 sandbox 2 文件）
 * → 全量新写，R5 红分支攻击例聚焦：bashParser fail-closed 预算 / parser
 * PARSE_ABORTED 三态 / ast 预检 too-complex 支 / extractOutputRedirections
 * fail-closed / heredoc 安全 bail 支 / shellQuote 单引号差分站 / prefixStatic
 * 静态语义 + 缓存面。零磁盘零网络；feature('TREE_SITTER_BASH') 经
 * FEATURE_TREE_SITTER_BASH env 门控（新仓 shared/feature call-time，可测）。
 */
import { afterAll, describe, expect, test } from 'bun:test'
import {
  getParserModule,
  SHELL_KEYWORDS,
  type TsNode,
  PARSE_ABORTED,
  parseCommand,
  parseCommandRaw,
  parseForSecurity,
  parseForSecurityFromAst,
  checkSemantics,
  type SimpleCommand,
  splitCommand_DEPRECATED,
  splitCommandWithOperators,
  extractOutputRedirections,
  isHelpCommand,
  isUnsafeCompoundCommand_DEPRECATED,
  getCommandSubcommandPrefix,
  clearCommandPrefixCaches,
  extractHeredocs,
  restoreHeredocs,
  containsHeredoc,
  analyzeCommand,
  ParsedCommand,
  buildParsedCommandFromRoot,
  tryParseShellCommand,
  tryQuoteShellArgs,
  hasShellQuoteSingleQuoteBug,
  quote,
  createCommandPrefixExtractor,
  createSubcommandPrefixExtractor,
} from '../../src/engine/tools'
import { memoize } from '../../src/engine/tools/bash/memoize'
import { jsonStringify } from '../../src/engine/tools/bash/json'
import { logError } from '../../src/engine/tools/bash/log'

// 深层下标对抗输入（超 MAX_NODES=50_000 节点预算 → 解析器 fail-closed bail）
const ADVERSARIAL_DEEP = 'a' + '[0]'.repeat(500_000)
// 失衡左括号 ×9999：错误恢复路径耗尽节点预算（探针实测 parse → null/ABORT，
// 且 ≤ MAX_COMMAND_LENGTH=10000 → 可穿透 parseCommandRaw 长度门到 PARSE_ABORTED）
const ABORT_TRIGGER = '('.repeat(9_999)
// shell-quote 真实失败模式 = bad substitution（探针实测 "Bad substitution: $"；
// 未闭合引号 shell-quote 可正常 parse，非失败模式）
const BAD_SUBSTITUTION = 'echo ${$(true)}'

function setTreeSitter(on: boolean): void {
  if (on) {
    process.env['FEATURE_TREE_SITTER_BASH'] = 'true'
  } else {
    delete process.env['FEATURE_TREE_SITTER_BASH']
  }
}

afterAll(() => {
  setTreeSitter(false)
})

describe('bash 内核 — bashParser（fail-closed 预算）', () => {
  test('parse 常规命令 → TsNode 树（program 根 + 非空 children）', () => {
    const root = getParserModule()!.parse('echo hello')
    expect(root).not.toBeNull()
    expect(root!.children.length).toBeGreaterThan(0)
    expect(root!.text).toContain('echo')
  })

  test('SHELL_KEYWORDS 含核心关键字集', () => {
    for (const kw of ['if', 'for', 'case', 'function', 'while', 'until']) {
      expect(SHELL_KEYWORDS.has(kw)).toBe(true)
    }
  })

  test('对抗输入（50 万层下标）→ null（节点预算 fail-closed）', () => {
    const root = getParserModule()!.parse(ADVERSARIAL_DEEP)
    expect(root).toBeNull()
  })

  test('50ms 超时帽：病态长输入不挂起', () => {
    const pathological =
      'a' + '() { a; }'.repeat(200_000) + ' ; echo done'
    const start = Date.now()
    const root = getParserModule()!.parse(pathological)
    // 结果 = Node 或 null（bail）均可，但必须在墙钟帽内返回
    expect(Date.now() - start).toBeLessThan(5_000)
    void root
  })
})

describe('bash 内核 — parser（三态：Node / null / PARSE_ABORTED）', () => {
  test('feature 关（默认）：parseCommand / parseCommandRaw → null', async () => {
    setTreeSitter(false)
    await expect(parseCommand('echo hi')).resolves.toBeNull()
    await expect(parseCommandRaw('echo hi')).resolves.toBeNull()
  })

  test('空串 / 超长（>10000）→ null（feature 无关短路）', async () => {
    setTreeSitter(true)
    await expect(parseCommand('')).resolves.toBeNull()
    await expect(parseCommandRaw('x'.repeat(10_001))).resolves.toBeNull()
  })

  test('feature 开：parseCommand 返回 ParsedCommandData（envVars 提取）', async () => {
    setTreeSitter(true)
    const data = await parseCommand('FOO=bar echo hi')
    expect(data).not.toBeNull()
    expect(data!.originalCommand).toBe('FOO=bar echo hi')
    // extractEnvVars 逐字旧仓 = push variable_assignment 节点的 child.text（完整赋值串）
    expect(data!.envVars).toEqual(['FOO=bar'])
    expect(data!.commandNode).not.toBeNull()
  })

  test('feature 开 + 对抗输入 → PARSE_ABORTED 哨兵（≠ null，安全面判别）', async () => {
    setTreeSitter(true)
    const result = await parseCommandRaw(ABORT_TRIGGER)
    expect(result).toBe(PARSE_ABORTED)
  })
})

describe('bash 内核 — ast（预检 too-complex 支）', () => {
  const fakeRoot: TsNode = {
    type: 'program',
    text: '',
    startIndex: 0,
    endIndex: 0,
    children: [],
  }

  test("空串 → { kind: 'simple', commands: [] }（不触解析）", async () => {
    await expect(parseForSecurity('')).resolves.toEqual({
      kind: 'simple',
      commands: [],
    })
  })

  test('feature 关 → parse-unavailable（调用方回落保守面）', async () => {
    setTreeSitter(false)
    await expect(parseForSecurity('echo hi')).resolves.toEqual({
      kind: 'parse-unavailable',
    })
  })

  test('feature 开 + 常规命令 → simple + argv 提取', async () => {
    setTreeSitter(true)
    const result = await parseForSecurity('echo hello world')
    expect(result.kind).toBe('simple')
    if (result.kind === 'simple') {
      expect(result.commands.length).toBe(1)
      expect(result.commands[0]!.argv).toEqual(['echo', 'hello', 'world'])
    }
  })

  test('预检：控制字符 / Unicode 空白 / 反斜杠转义空白 → too-complex（P-T1 正向基线）', () => {
    for (const cmd of ['\x01echo', 'a\u00a0b', 'a\\ b']) {
      const result = parseForSecurityFromAst(cmd, fakeRoot)
      expect(result.kind).toBe('too-complex')
    }
  })

  test('checkSemantics：空 → ok；eval 名 → 不 ok', () => {
    expect(checkSemantics([])).toEqual({ ok: true })
    const res = checkSemantics([
      {
        argv: ['nohup', 'eval', 'x'],
        envVars: [],
        redirects: [],
        text: "nohup eval 'x'",
      } satisfies SimpleCommand,
    ])
    expect(res.ok).toBe(false)
  })
})

describe('bash 内核 — commands（分词 / 重定向 / 帮助命令 / 静态前缀）', () => {
  test('splitCommand_DEPRECATED：列表分隔符拆解', () => {
    expect(splitCommand_DEPRECATED('a && b; c')).toEqual(['a', 'b', 'c'])
  })

  test('splitCommandWithOperators：操作符独立成 part', () => {
    const parts = splitCommandWithOperators('echo a | cat')
    expect(parts).toContain('|')
    expect(parts.some(p => p.includes('echo a'))).toBe(true)
  })

  test('extractOutputRedirections：常规 → 目标提取；malformed（bad substitution）→ fail-closed', () => {
    const ok = extractOutputRedirections('echo hi > /tmp/x')
    expect(ok.redirections).toEqual([{ target: '/tmp/x', operator: '>' }])
    expect(ok.hasDangerousRedirection).toBe(false)

    // 解析失败 → fail-closed 三字段形（dangerous=true 强制询问，禁静默放行）
    const bad = extractOutputRedirections(BAD_SUBSTITUTION)
    expect(bad.hasDangerousRedirection).toBe(true)
    expect(bad.redirections).toEqual([])
    expect(bad.commandWithoutRedirections).toBe(BAD_SUBSTITUTION)
  })

  test('isHelpCommand：--help 命中 / 普通参数不命中', () => {
    expect(isHelpCommand('git --help')).toBe(true)
    expect(isHelpCommand('git log')).toBe(false)
  })

  test('isUnsafeCompoundCommand_DEPRECATED：单命令 false；malformed（bad substitution）fail-closed true', () => {
    expect(isUnsafeCompoundCommand_DEPRECATED('echo a')).toBe(false)
    // shell-quote 解析失败 → 恒视为不安全（总弹询问），不依赖 bash 也会拒绝的假设
    expect(isUnsafeCompoundCommand_DEPRECATED(BAD_SUBSTITUTION)).toBe(true)
  })

  test('getCommandSubcommandPrefix（静态裁断面）：preCheck 短路 / 未命中 → 对象形 null 前缀', async () => {
    const signal = new AbortController().signal
    const help = await getCommandSubcommandPrefix('ls --help', signal, false)
    expect(help).not.toBeNull()
    expect(help!.commandPrefix).toBe('ls --help')
    expect(help!.subcommandPrefixes.size).toBe(1)
    const none = await getCommandSubcommandPrefix('echo hi', signal, false)
    // delta 登记：静态提取器永不返回 null（旧 LLM 失败/NODE_ENV=test 早退路径已裁）
    // → 未命中 = 对象形 { commandPrefix: null }（旧 truthy 检 `if (prefix)` 逐字保留）
    expect(none).not.toBeNull()
    expect(none!.commandPrefix).toBeNull()
    expect(none!.subcommandPrefixes.size).toBe(1)
  })

  test('clearCommandPrefixCaches：缓存面清空', async () => {
    const signal = new AbortController().signal
    await getCommandSubcommandPrefix('ls --help', signal, false)
    expect(getCommandSubcommandPrefix.cache.size()).toBeGreaterThan(0)
    clearCommandPrefixCaches()
    expect(getCommandSubcommandPrefix.cache.size()).toBe(0)
  })
})

describe('bash 内核 — heredoc（提取 / 恢复 / 安全 bail）', () => {
  test('containsHeredoc 快检', () => {
    expect(containsHeredoc('cat <<EOF\nx\nEOF')).toBe(true)
    expect(containsHeredoc('echo hi')).toBe(false)
  })

  test('无 << 直通：processedCommand 原样 + 空 map', () => {
    const result = extractHeredocs('echo hi')
    expect(result.processedCommand).toBe('echo hi')
    expect(result.heredocs.size).toBe(0)
  })

  test('提取 + 恢复 round-trip：占位符回填 = 原文', () => {
    const original = 'cat <<EOF\nhello $world\nEOF'
    const { processedCommand, heredocs } = extractHeredocs(original)
    expect(heredocs.size).toBe(1)
    expect(processedCommand).not.toContain('hello')
    const restored = restoreHeredocs([processedCommand], heredocs)
    expect(restored).toEqual([original])
  })

  test('安全 bail：ANSI-C 引号（$\'...\'）出现 → 不提取（防引号跟踪失步）', () => {
    const cmd = `cat <<EOF\nx\nEOF $'a'`
    const result = extractHeredocs(cmd)
    expect(result.heredocs.size).toBe(0)
    expect(result.processedCommand).toBe(cmd)
  })

  test('安全 bail：<< 前出现反引号 → 不提取', () => {
    const cmd = '`date` cat <<EOF\nx\nEOF'
    const result = extractHeredocs(cmd)
    expect(result.heredocs.size).toBe(0)
  })
})

describe('bash 内核 — treeSitterAnalysis（AST 一次性提取）', () => {
  test('analyzeCommand：管道结构 + 引号上下文 + 危险模式面', () => {
    const root = getParserModule()!.parse('echo "hi" | cat')!
    const analysis = analyzeCommand(root, 'echo "hi" | cat')
    expect(analysis.compoundStructure.hasPipeline).toBe(true)
    expect(typeof analysis.quoteContext.withDoubleQuotes).toBe('string')
    expect(analysis.dangerousPatterns).toBeDefined()
  })

  test('非管道命令 → hasPipeline false', () => {
    const root = getParserModule()!.parse('echo hi')!
    const analysis = analyzeCommand(root, 'echo hi')
    expect(analysis.compoundStructure.hasPipeline).toBe(false)
  })
})

describe('bash 内核 — ParsedCommand（regex 回落面 + 树面）', () => {
  test('feature 关：parse → regex 路径，getPipeSegments 拆管道', async () => {
    setTreeSitter(false)
    const cmd = await ParsedCommand.parse('echo a | cat')
    expect(cmd).not.toBeNull()
    expect(cmd!.getPipeSegments()).toEqual(['echo a', 'cat'])
  })

  test('withoutOutputRedirections / getOutputRedirections', async () => {
    setTreeSitter(false)
    const cmd = await ParsedCommand.parse('echo x > /tmp/f')
    expect(cmd!.withoutOutputRedirections()).toBe('echo x')
    expect(cmd!.getOutputRedirections()).toEqual([
      { target: '/tmp/f', operator: '>' },
    ])
  })

  test('buildParsedCommandFromRoot：树面 getTreeSitterAnalysis 非空', () => {
    const root = getParserModule()!.parse('echo hi')!
    // 签名 = (command, root)（旧仓逐字）
    const cmd = buildParsedCommandFromRoot('echo hi', root)
    expect(cmd.getTreeSitterAnalysis()).not.toBeNull()
  })
})

describe('bash 内核 — shellQuote（解析 / 引号 / 单引号差分站）', () => {
  test('tryParseShellCommand：常规成功 + malformed（bad substitution）失败', () => {
    const ok = tryParseShellCommand('echo "a b" c')
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(ok.tokens.map(t => (typeof t === 'string' ? t : JSON.stringify(t)))).toEqual(
        ['echo', 'a b', 'c'],
      )
    }
    // shell-quote 真实失败模式 = bad substitution（未闭合引号可正常 parse）
    expect(tryParseShellCommand(BAD_SUBSTITUTION).success).toBe(false)
  })

  test('env 映射器：$VAR 替换', () => {
    const result = tryParseShellCommand('echo $FOO', key =>
      key === 'FOO' ? 'bar' : undefined,
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.tokens.map(t => (typeof t === 'string' ? t : JSON.stringify(t)))).toEqual(
        ['echo', 'bar'],
      )
    }
  })

  test('quote：含空格参数正确转义（parse 回读 round-trip）', () => {
    const quoted = quote(['echo', 'a b'])
    const back = tryParseShellCommand(quoted)
    expect(back.success).toBe(true)
    if (back.success) {
      expect(back.tokens.map(t => (typeof t === 'string' ? t : JSON.stringify(t)))).toEqual(
        ['echo', 'a b'],
      )
    }
  })

  test('tryQuoteShellArgs：非字符串参数归一 + 失败面', () => {
    const ok = tryQuoteShellArgs(['a', 1, true])
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(ok.quoted).toContain('1')
    }
    expect(tryQuoteShellArgs([Symbol('x') as unknown]).success).toBe(false)
  })

  test('hasShellQuoteSingleQuoteBug：单引号尾反斜号差分站', () => {
    // bash：'\'' 中单引号内 \ 为字面量 + 引号已闭（奇数尾反斜杠）；
    // shell-quote 误判 \' 为转义 → token 合并（差分站，H1 报告先例）
    // 源码双反斜杠 → 输入实际含 \（单引号差分站探测串）
    expect(hasShellQuoteSingleQuoteBug("'\\'' ls")).toBe(true)
    expect(hasShellQuoteSingleQuoteBug("echo 'a' b")).toBe(false)
  })
})

describe('bash 内核 — 本地小模块（memoize / json / log / prefixStatic）', () => {
  test('memoize：0 参缓存 + cache.clear 失效', () => {
    let calls = 0
    const fn = memoize(async () => {
      calls++
      return calls
    })
    const first = fn()
    const second = fn()
    expect(second).toBe(first)
    expect(calls).toBe(1)
    fn.cache.clear()
    fn()
    expect(calls).toBe(2)
  })

  test('jsonStringify：space 格式化 + 循环引用抛错', () => {
    expect(jsonStringify({ a: 1 }, 2)).toContain('\n')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => jsonStringify(circular)).toThrow()
  })

  test('logError：no-op 降级不抛错（遥测裁面）', () => {
    expect(() => logError(new Error('boom'))).not.toThrow()
    expect(() => logError('string error')).not.toThrow()
  })

  test('prefixStatic：preCheck 短路 / 无前缀 → null / 子命令聚合', async () => {
    const signal = new AbortController().signal
    const extractor = createCommandPrefixExtractor({
      toolName: 'Bash',
      policySpec: 'spec',
      eventName: 'evt',
      querySource: 'src',
      preCheck: command =>
        command.startsWith('ls --') ? { commandPrefix: command } : null,
    })
    expect(await extractor('ls --help', signal, false)).toEqual({
      commandPrefix: 'ls --help',
    })
    expect(await extractor('rm -rf /', signal, false)).toEqual({
      commandPrefix: null,
    })

    const subExtractor = createSubcommandPrefixExtractor(
      extractor,
      splitCommand_DEPRECATED,
    )
    // preCheck（startsWith 'ls --'）对整命令短路命中 → 整串即前缀；
    // 子命令逐段 preCheck 亦全命中 → Map(2)
    const agg = await subExtractor('ls --help && ls --all', signal, false)
    expect(agg).not.toBeNull()
    expect(agg!.commandPrefix).toBe('ls --help && ls --all')
    expect(agg!.subcommandPrefixes.size).toBe(2)
    expect(agg!.subcommandPrefixes.get('ls --help')).toEqual({
      commandPrefix: 'ls --help',
    })

    // delta 登记：静态提取器永不返回 null（旧 LLM 失败/NODE_ENV=test 早退路径已裁）
    // → 子提取器 null 支（fullCommandPrefix falsy）静态不可达；
    // 未命中 = 对象形（旧 truthy 检逐字），子段各自 { commandPrefix: null }
    const noPrefix = await subExtractor('rm -rf / && ls', signal, false)
    expect(noPrefix).not.toBeNull()
    expect(noPrefix!.commandPrefix).toBeNull()
    expect(noPrefix!.subcommandPrefixes.size).toBe(2)
  })
})
