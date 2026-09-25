/**
 * engine/tools/bash checkPermissions 面（§8.53 S-T2a，工具本体波 C 桶 ①）
 * unit 测试
 *
 * 被测 = src/engine/tools/bash/ S-T2a 4 文件（旧仓 src/tools/BashTool/
 * bashSecurity / sedValidation / modeValidation / bashCommandHelpers 逐字随迁）
 * + shared types-session 恢复面（subcommandResults 变体 + isBashSecurityCheckForMisparsing
 * 字段）+ permissions ruleMatching 恢复支（createPermissionRequestMessage
 * subcommandResults 支）。经 tools 域门面 / permissions 门面 / shared 门面消费。
 *
 * 攻击例聚焦（R5 红分支）：
 *  - bashSecurity fail-closed 支（控制字符 / shell-quote 单引号反斜杠差分站，
 *    8 生产点 isBashSecurityCheckForMisparsing 字段面）+ heredoc-substitution
 *    strip/has 双面 + 安全命令 passthrough 终态
 *  - sedValidation 白名单双 Pattern（行打印 / 替换）+ 文件写面分叉（read-only
 *    vs acceptEdits allowFileWrites）+ 危险 flag 组合 throw + checkSedConstraints
 *    三段（dangerous ask / safe passthrough / 非 sed 跳过）
 *  - modeValidation 模式门（bypass/dontAsk 主流程 passthrough / acceptEdits
 *    fs 命令族 allow + decisionReason {type:'mode'} / 复合命令首非 passthrough 胜）
 *  - bashCommandHelpers 分段面（无管道 passthrough / 全 allow 聚合 / 混合 ask +
 *    suggestions 收集 / 分段 deny 短路 / 多 cd 短路 / cd+git 跨段短路 / 不安全
 *    复合命令 ask / parse-fail passthrough + PARSE_ABORTED 守卫路由）
 *  - createPermissionRequestMessage subcommandResults 支（单/复数 part 消息 +
 *    全 allow 回落文案）
 *
 * 零磁盘零网络。feature('TREE_SITTER_BASH') 关（默认）→ ParsedCommand 走
 * RegexParsedCommand_DEPRECATED 回退（非空命令 parse 恒非 null，仅空命令 null）；
 * PARSE_ABORTED → parse 失配的独立红支仅 feature-on 路径存在（bun:bundle 不可测，
 * 本套仅钉 PARSE_ABORTED 守卫路由支，登记）。
 */
import { describe, expect, test } from 'bun:test'
import {
  type BashToolInput,
  type CommandIdentityCheckers,
  PARSE_ABORTED,
  stripSafeHeredocSubstitutions,
  hasSafeHeredocSubstitution,
  bashCommandIsSafe_DEPRECATED,
  bashCommandIsSafeAsync_DEPRECATED,
  isLinePrintingCommand,
  isPrintCommand,
  sedCommandIsAllowedByAllowlist,
  hasFileArgs,
  extractSedExpressions,
  checkSedConstraints,
  checkPermissionMode,
  getAutoAllowedCommands,
  checkCommandOperatorPermissions,
} from '../../src/engine/tools'
import { createPermissionRequestMessage } from '../../src/permissions'
import type {
  PermissionMode,
  PermissionResult,
  ToolPermissionContext,
} from '../../src/shared'

// ── 公共夹具 ──────────────────────────────────────────────────────────────

function makeCtx(mode: PermissionMode = 'default'): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
  }
}

const CHECKERS: CommandIdentityCheckers = {
  isNormalizedCdCommand: c => /^cd(\s|$)/.test(c),
  isNormalizedGitCommand: c => /^git(\s|$)/.test(c),
}

const allowAllFn = async (input: BashToolInput): Promise<PermissionResult> => ({
  behavior: 'allow',
  updatedInput: input,
})

// 首段 allow，其余段 ask + suggestions（分段建议收集面）
const mixedAskFn = async (
  input: BashToolInput,
): Promise<PermissionResult> =>
  input.command.startsWith('ls')
    ? { behavior: 'allow', updatedInput: input }
    : {
        behavior: 'ask',
        message: `Approval needed for ${input.command}`,
        decisionReason: { type: 'other', reason: 'unverified command' },
        suggestions: [
          {
            type: 'addRules',
            destination: 'session',
            rules: [{ toolName: 'Bash', ruleContent: input.command }],
            behavior: 'ask',
          },
        ],
      }

// 首段 allow，其余段 deny（分段 deny 短路面）
const denyOtherFn = async (
  input: BashToolInput,
): Promise<PermissionResult> =>
  input.command.startsWith('ls')
    ? { behavior: 'allow', updatedInput: input }
    : {
        behavior: 'deny',
        message: 'Permission to use rm has been denied.',
        decisionReason: {
          type: 'rule',
          rule: {
            source: 'session',
            ruleBehavior: 'deny',
            ruleValue: { toolName: 'Bash' },
          },
        },
      }

// 短路支断言用：若被调即红（多 cd / cd+git 交叉检查先于分段循环返回）
const neverFn = async (): Promise<PermissionResult> => {
  throw new Error('fn should not be called on short-circuit path')
}

// ── modeValidation ────────────────────────────────────────────────────────

describe('S-T2a modeValidation · checkPermissionMode', () => {
  test('bypassPermissions → 主流程 passthrough', () => {
    const r = checkPermissionMode(
      { command: 'rm -rf /' },
      makeCtx('bypassPermissions'),
    )
    expect(r.behavior).toBe('passthrough')
    if (r.behavior === 'passthrough') {
      expect(r.message).toBe('Bypass mode is handled in main permission flow')
    }
  })

  test('dontAsk → 主流程 passthrough', () => {
    const r = checkPermissionMode({ command: 'ls' }, makeCtx('dontAsk'))
    expect(r.behavior).toBe('passthrough')
    if (r.behavior === 'passthrough') {
      expect(r.message).toBe('DontAsk mode is handled in main permission flow')
    }
  })

  test('acceptEdits + fs 命令族（mkdir）→ allow + decisionReason {type:mode}', () => {
    const r = checkPermissionMode(
      { command: 'mkdir /tmp/x' },
      makeCtx('acceptEdits'),
    )
    expect(r.behavior).toBe('allow')
    if (r.behavior === 'allow') {
      expect(r.updatedInput).toEqual({ command: 'mkdir /tmp/x' })
      expect(r.decisionReason).toEqual({ type: 'mode', mode: 'acceptEdits' })
    }
  })

  // 逐字语义注：validateCommandForMode 的 per-cmd passthrough 文案
  // （"No mode-specific handling for 'X' in Y mode"）仅非 passthrough 时外抛
  // （旧仓 checkPermissionMode 循环 `if (result.behavior !== 'passthrough')`），
  // passthrough 一律收敛为外层兜底文案 → 断言兜底面。
  test('acceptEdits + 非 fs 命令（ls）→ passthrough 兜底文案', () => {
    const r = checkPermissionMode({ command: 'ls -la' }, makeCtx('acceptEdits'))
    expect(r.behavior).toBe('passthrough')
    if (r.behavior === 'passthrough') {
      expect(r.message).toBe('No mode-specific validation required')
    }
  })

  test('default 模式 + fs 命令（rm）→ passthrough（模式不匹配不自动放行）', () => {
    const r = checkPermissionMode({ command: 'rm -rf /tmp/x' }, makeCtx('default'))
    expect(r.behavior).toBe('passthrough')
    if (r.behavior === 'passthrough') {
      expect(r.message).toBe('No mode-specific validation required')
    }
  })

  test('复合命令：acceptEdits + "echo hi && mkdir /tmp/y" → 首非 passthrough 段胜（allow）', () => {
    const r = checkPermissionMode(
      { command: 'echo hi && mkdir /tmp/y' },
      makeCtx('acceptEdits'),
    )
    expect(r.behavior).toBe('allow')
  })

  test('getAutoAllowedCommands：acceptEdits = 7 命令族 / 其余模式 = 空', () => {
    expect(getAutoAllowedCommands('acceptEdits')).toEqual([
      'mkdir',
      'touch',
      'rm',
      'rmdir',
      'mv',
      'cp',
      'sed',
    ])
    expect(getAutoAllowedCommands('default')).toEqual([])
    expect(getAutoAllowedCommands('plan')).toEqual([])
  })
})

// ── sedValidation ─────────────────────────────────────────────────────────

describe('S-T2a sedValidation · 白名单双 Pattern', () => {
  test('isPrintCommand：p / Np / N,Mp 通过；范围无 p / 写命令 / 空 / e 拒绝', () => {
    expect(isPrintCommand('p')).toBe(true)
    expect(isPrintCommand('1p')).toBe(true)
    expect(isPrintCommand('1,5p')).toBe(true)
    expect(isPrintCommand('1,5')).toBe(false)
    expect(isPrintCommand('w /tmp/x')).toBe(false)
    expect(isPrintCommand('e')).toBe(false)
    expect(isPrintCommand('')).toBe(false)
  })

  test('isLinePrintingCommand：-n 打印族通过（含分号串）；非 sed / 非打印表达式拒绝', () => {
    expect(isLinePrintingCommand("sed -n '1p'", ['1p'])).toBe(true)
    expect(isLinePrintingCommand("sed -n '1p;2p'", ['1p;2p'])).toBe(true)
    expect(isLinePrintingCommand("sed -n '1d'", ['1d'])).toBe(false)
    expect(isLinePrintingCommand('grep "1p" f', [])).toBe(false)
  })

  test('sedCommandIsAllowedByAllowlist：read-only 面', () => {
    // Pattern 1（行打印）允许文件参数
    expect(sedCommandIsAllowedByAllowlist("sed -n '1,5p' file.txt")).toBe(true)
    // Pattern 2（替换）无文件参数 + 仅 g flag → 通过
    expect(sedCommandIsAllowedByAllowlist("sed 's/foo/bar/g'")).toBe(true)
    // Pattern 2 携文件参数（read-only 禁写）→ 拒绝
    expect(sedCommandIsAllowedByAllowlist("sed 's/foo/bar/g' file.txt")).toBe(
      false,
    )
    // 非 sed 命令 → 拒绝
    expect(sedCommandIsAllowedByAllowlist("grep '1p' file")).toBe(false)
  })

  test('sedCommandIsAllowedByAllowlist：allowFileWrites 面（acceptEdits 语义）', () => {
    expect(
      sedCommandIsAllowedByAllowlist("sed -i 's/foo/bar/g' file.txt", {
        allowFileWrites: true,
      }),
    ).toBe(true)
    expect(
      sedCommandIsAllowedByAllowlist("sed 's/foo/bar/g' file.txt", {
        allowFileWrites: true,
      }),
    ).toBe(true)
  })

  test('hasFileArgs：文件参数字面判定（非 sed / stdin 源均 false）', () => {
    expect(hasFileArgs("sed -n '1p' file.txt")).toBe(true)
    expect(hasFileArgs("sed -n '1p'")).toBe(false)
    expect(hasFileArgs('grep x f')).toBe(false)
  })

  test('extractSedExpressions：-e 族 / 裸表达式 / 危险 flag 组合 throw', () => {
    expect(extractSedExpressions("sed -e 's/a/b/' -e 's/c/d/'")).toEqual([
      's/a/b/',
      's/c/d/',
    ])
    expect(extractSedExpressions("sed '1,5p' file")).toEqual(['1,5p'])
    expect(() => extractSedExpressions("sed -ew 'x'")).toThrow(
      'Dangerous flag combination detected',
    )
  })

  test('checkSedConstraints：三段面', () => {
    // 安全行打印（read-only）→ passthrough
    const safe = checkSedConstraints(
      { command: "sed -n '1p' file.txt" },
      makeCtx('default'),
    )
    expect(safe.behavior).toBe('passthrough')
    if (safe.behavior === 'passthrough') {
      expect(safe.message).toBe('No dangerous sed operations detected')
    }
    // 写操作表达式（read-only）→ ask + decisionReason {type:other}
    const dangerous = checkSedConstraints(
      { command: "sed 'w /tmp/x' file.txt" },
      makeCtx('default'),
    )
    expect(dangerous.behavior).toBe('ask')
    if (dangerous.behavior === 'ask') {
      expect(dangerous.message).toBe(
        'sed command requires approval (contains potentially dangerous operations)',
      )
      expect(dangerous.decisionReason?.type).toBe('other')
    }
    // acceptEdits 放行 -i 原地编辑（仍过白名单）→ passthrough
    const inPlace = checkSedConstraints(
      { command: "sed -i 's/a/b/g' file.txt" },
      makeCtx('acceptEdits'),
    )
    expect(inPlace.behavior).toBe('passthrough')
    // 非 sed 命令 → 循环跳过 → passthrough
    const nonSed = checkSedConstraints({ command: 'ls -la' }, makeCtx('default'))
    expect(nonSed.behavior).toBe('passthrough')
  })
})

// ── bashSecurity ──────────────────────────────────────────────────────────

describe('S-T2a bashSecurity · fail-closed 安全面', () => {
  const HEREDOC_SUB = "out=$(cat <<'EOF'\nhello world\nEOF\n)"

  test('heredoc-substitution 双面：strip 非 null / has true；普通命令 null / false', () => {
    expect(stripSafeHeredocSubstitutions(HEREDOC_SUB)).not.toBeNull()
    expect(hasSafeHeredocSubstitution(HEREDOC_SUB)).toBe(true)
    expect(stripSafeHeredocSubstitutions('echo hi')).toBeNull()
    expect(hasSafeHeredocSubstitution('echo hi')).toBe(false)
  })

  test('控制字符 → ask + isBashSecurityCheckForMisparsing（sync）', () => {
    const r = bashCommandIsSafe_DEPRECATED('ls\x00')
    expect(r.behavior).toBe('ask')
    if (r.behavior === 'ask') {
      expect(r.message).toBe(
        'Command contains non-printable control characters that could be used to bypass security checks',
      )
      expect(r.isBashSecurityCheckForMisparsing).toBe(true)
    }
  })

  test('shell-quote 单引号反斜杠差分站 → ask + 标记（sync）', () => {
    const r = bashCommandIsSafe_DEPRECATED("'\\'' ls")
    expect(r.behavior).toBe('ask')
    if (r.behavior === 'ask') {
      expect(r.message).toBe(
        'Command contains single-quoted backslash pattern that could bypass security checks',
      )
      expect(r.isBashSecurityCheckForMisparsing).toBe(true)
    }
  })

  test('安全命令（ls -la）→ passthrough 终态（sync + async 双面）', async () => {
    const sync = bashCommandIsSafe_DEPRECATED('ls -la')
    expect(sync.behavior).toBe('passthrough')
    if (sync.behavior === 'passthrough') {
      expect(sync.message).toBe('Command passed all security checks')
    }
    const async = await bashCommandIsSafeAsync_DEPRECATED('ls -la')
    expect(async.behavior).toBe('passthrough')
    if (async.behavior === 'passthrough') {
      expect(async.message).toBe('Command passed all security checks')
    }
  })

  test('控制字符 → ask + 标记（async 面，8 生产点之一）', async () => {
    const r = await bashCommandIsSafeAsync_DEPRECATED('ls\x00')
    expect(r.behavior).toBe('ask')
    if (r.behavior === 'ask') {
      expect(r.isBashSecurityCheckForMisparsing).toBe(true)
    }
  })
})

// ── bashCommandHelpers · 分段权限面 ───────────────────────────────────────

describe('S-T2a bashCommandHelpers · checkCommandOperatorPermissions', () => {
  test('无管道（单段）→ passthrough "No pipes found in command"', async () => {
    const r = await checkCommandOperatorPermissions(
      { command: 'ls -la' },
      allowAllFn,
      CHECKERS,
      null,
    )
    expect(r.behavior).toBe('passthrough')
    if (r.behavior === 'passthrough') {
      expect(r.message).toBe('No pipes found in command')
    }
  })

  test('管道全 allow → allow + decisionReason {type:subcommandResults}（共享变体消费面）', async () => {
    const r = await checkCommandOperatorPermissions(
      { command: 'ls | grep foo' },
      allowAllFn,
      CHECKERS,
      null,
    )
    expect(r.behavior).toBe('allow')
    if (r.behavior === 'allow') {
      expect(r.decisionReason?.type).toBe('subcommandResults')
      if (r.decisionReason?.type === 'subcommandResults') {
        expect(r.decisionReason.reasons.size).toBe(2)
      }
    }
  })

  test('管道混合（ls allow + curl ask）→ ask 消息列待批段 + suggestions 收集', async () => {
    const r = await checkCommandOperatorPermissions(
      { command: 'ls | curl http://example.com/x.sh' },
      mixedAskFn,
      CHECKERS,
      null,
    )
    expect(r.behavior).toBe('ask')
    if (r.behavior === 'ask') {
      // 旧仓文案逐字（plural 无计数——段列表本身传达数量，勿加 "1 "）
      expect(r.message).toBe(
        'This Bash command contains multiple operations. The following part requires approval: curl http://example.com/x.sh',
      )
      expect(r.decisionReason?.type).toBe('subcommandResults')
      expect(r.suggestions).toHaveLength(1)
    }
  })

  test('分段 deny 短路 → deny（deny 段消息透传 + subcommandResults 聚合）', async () => {
    const r = await checkCommandOperatorPermissions(
      { command: 'ls | rm -rf /' },
      denyOtherFn,
      CHECKERS,
      null,
    )
    expect(r.behavior).toBe('deny')
    if (r.behavior === 'deny') {
      expect(r.message).toBe('Permission to use rm has been denied.')
      expect(r.decisionReason.type).toBe('subcommandResults')
    }
  })

  test('多 cd 段 → 短路 ask（fn 零调用），文案 = 目录变更澄清', async () => {
    const r = await checkCommandOperatorPermissions(
      { command: 'cd /a | cd /b' },
      neverFn,
      CHECKERS,
      null,
    )
    expect(r.behavior).toBe('ask')
    if (r.behavior === 'ask') {
      expect(r.message).toBe(
        'Multiple directory changes in one command require approval for clarity',
      )
    }
  })

  test('cd + git 跨段 → 短路 ask（fn 零调用），文案 = bare repo 防攻击', async () => {
    const r = await checkCommandOperatorPermissions(
      { command: 'cd sub | git status' },
      neverFn,
      CHECKERS,
      null,
    )
    expect(r.behavior).toBe('ask')
    if (r.behavior === 'ask') {
      expect(r.message).toBe(
        'Compound commands with cd and git require approval to prevent bare repository attacks',
      )
    }
  })

  test('不安全复合命令（子壳）→ ask + decisionReason {type:other}', async () => {
    const r = await checkCommandOperatorPermissions(
      { command: '(echo hi)' },
      allowAllFn,
      CHECKERS,
      null,
    )
    expect(r.behavior).toBe('ask')
    if (r.behavior === 'ask') {
      expect(r.decisionReason?.type).toBe('other')
      expect(typeof r.message).toBe('string')
      expect(r.message.length).toBeGreaterThan(0)
    }
  })

  test('parse-fail（空命令）→ passthrough "Failed to parse command"', async () => {
    const r = await checkCommandOperatorPermissions(
      { command: '' },
      allowAllFn,
      CHECKERS,
      null,
    )
    expect(r.behavior).toBe('passthrough')
    if (r.behavior === 'passthrough') {
      expect(r.message).toBe('Failed to parse command')
    }
  })

  test('PARSE_ABORTED 守卫：aborted root 不喂 buildParsedCommandFromRoot，路由 parse 面', async () => {
    const r = await checkCommandOperatorPermissions(
      { command: '' },
      allowAllFn,
      CHECKERS,
      PARSE_ABORTED,
    )
    expect(r.behavior).toBe('passthrough')
    if (r.behavior === 'passthrough') {
      expect(r.message).toBe('Failed to parse command')
    }
  })
})

// ── createPermissionRequestMessage · subcommandResults 支（S-T2a 恢复）────

describe('S-T2a permissions · createPermissionRequestMessage subcommandResults', () => {
  const allow = { behavior: 'allow' as const }
  const ask = { behavior: 'ask' as const, message: 'm' }
  const pass = { behavior: 'passthrough' as const, message: 'm' }

  test('单段待批 → "1 part requires approval" + 段名', () => {
    const msg = createPermissionRequestMessage('Bash', {
      type: 'subcommandResults',
      reasons: new Map([
        ['ls', allow],
        ['curl http://x', ask],
      ]),
    })
    // 旧仓文案逐字（shared plural(n, word) 无计数支，新旧仓同形）
    expect(msg).toBe(
      'This Bash command contains multiple operations. The following part requires approval: curl http://x',
    )
  })

  test('多段待批（ask + passthrough 均计入）→ 复数 "2 parts require"', () => {
    const msg = createPermissionRequestMessage('Bash', {
      type: 'subcommandResults',
      reasons: new Map([
        ['a', ask],
        ['b', pass],
      ]),
    })
    expect(msg).toBe(
      'This Bash command contains multiple operations. The following parts require approval: a, b',
    )
  })

  test('全 allow → 无列名回落文案', () => {
    const msg = createPermissionRequestMessage('Bash', {
      type: 'subcommandResults',
      reasons: new Map([
        ['a', allow],
        ['b', allow],
      ]),
    })
    expect(msg).toBe(
      'This Bash command contains multiple operations that require approval',
    )
  })
})
