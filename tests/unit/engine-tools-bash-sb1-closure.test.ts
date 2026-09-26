/**
 * engine/tools/bash S-B1 依赖闭包层 unit 面（Bash 本体纵切子波 §8.54，
 * C 桶 ① 子波 2）。
 *
 * unit 层（零盘）：
 *  - validateFlags 安全差分支（旧仓 1893L 逐字随迁，§8.54 ⑦）：
 *    xargs 目标 break / `--` respectsDoubleDash 双支 / `-E=` 空内联
 *    EOF 攻击差 / GNU 打包含参 flag 拒 / git -N shorthand /
 *    grep 附着数字 / string 参 `-` 前缀拒 + git --sort 例外
 *  - validateFlagArgument 6 型表 + 未知型
 *  - EXTERNAL_READONLY_COMMANDS 形面
 *  - bashTimeouts env 面 + max≥default 不变式
 *  - bashHelpers 小 helper（env 门 + settings 缺省面 + prependBullets 纯函数）
 *
 * 深度 import（门面归集 = S-B5 双门面任务，本切片不预支）：
 *  ../../src/engine/tools/bash/{readOnlyCommandValidation,bashTimeouts,bashHelpers}
 *
 * 探针锚点登记（§8.54 ⑧ 突变面，S-B6 消费）：
 *  - P-B4（bashTool call timeout clamp 删）= bashTimeouts 消费点，S-B5 落；
 *    本文件 bashTimeouts 面测 = clamp 语义依赖面（max≥default 不变式）。
 *  - gitBareRepo 三 fixture（.git/HEAD file / .git dir 无 HEAD + objects /
 *    无 .git 裸库指示符）= func 层（真盘），归 S-B1 func 文件（本切片）。
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from 'bun:test'
import {
  EXTERNAL_READONLY_COMMANDS,
  FLAG_PATTERN,
  validateFlagArgument,
  validateFlags,
  type ExternalCommandConfig,
} from '../../src/engine/tools/bash/readOnlyCommandValidation'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../src/engine/tools/bash/bashTimeouts'
import {
  hasEmbeddedSearchTools,
  prependBullets,
  shouldIncludeGitInstructions,
  shouldMaintainProjectWorkingDir,
} from '../../src/engine/tools/bash/bashHelpers'
import {
  type SettingsJson,
  resetSettingsCache,
  setSessionSettingsCache,
} from '../../src/engine'

/** env 保存/恢复小工具（零盘测禁泄漏进程 env）。 */
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe('validateFlagArgument 型表', () => {
  test('none = 永不通过（不应被调用）', () => {
    expect(validateFlagArgument('', 'none')).toBe(false)
  })

  test('number = 纯数字', () => {
    expect(validateFlagArgument('3', 'number')).toBe(true)
    expect(validateFlagArgument('3.5', 'number')).toBe(false)
    expect(validateFlagArgument('', 'number')).toBe(false)
  })

  test('string = 任意（含空）', () => {
    expect(validateFlagArgument('x', 'string')).toBe(true)
    expect(validateFlagArgument('', 'string')).toBe(true)
  })

  test('char = 单字符', () => {
    expect(validateFlagArgument(',', 'char')).toBe(true)
    expect(validateFlagArgument(',,', 'char')).toBe(false)
  })

  test('{} = 字面量', () => {
    expect(validateFlagArgument('{}', '{}')).toBe(true)
    expect(validateFlagArgument('{x}', '{}')).toBe(false)
  })

  test('EOF = 字面量', () => {
    expect(validateFlagArgument('EOF', 'EOF')).toBe(true)
    expect(validateFlagArgument('eof', 'EOF')).toBe(false)
  })
})

describe('validateFlags 安全差分支', () => {
  const XARGS_TARGETS = ['echo', 'printf', 'wc', 'grep', 'head', 'tail']

  test('xargs 目标命中 → break 放行', () => {
    expect(
      validateFlags(
        ['xargs', '-n', '1', 'echo', 'hi'],
        1,
        { safeFlags: { '-n': 'number' } },
        { commandName: 'xargs', xargsTargetCommands: XARGS_TARGETS },
      ),
    ).toBe(true)
  })

  test('xargs `--` 后目标命中 → break 放行', () => {
    expect(
      validateFlags(
        ['xargs', '--', 'echo'],
        1,
        { safeFlags: {} },
        { commandName: 'xargs', xargsTargetCommands: XARGS_TARGETS },
      ),
    ).toBe(true)
  })

  test('xargs 目标未命中（非 - 开头且不在目标表）→ 拒', () => {
    expect(
      validateFlags(
        ['xargs', 'rm'],
        1,
        { safeFlags: {} },
        { commandName: 'xargs', xargsTargetCommands: XARGS_TARGETS },
      ),
    ).toBe(false)
  })

  test('GNU 打包含参 flag 拒（-rI 差分支，xargs RCE 向量）', () => {
    const cfg: ExternalCommandConfig = {
      safeFlags: { '-r': 'none', '-I': '{}' },
    }
    // -I 非 none → 打包整体拒（保守安全向）
    expect(
      validateFlags(
        ['xargs', '-rI', 'echo', 'sh', '-c', 'id'],
        1,
        cfg,
        { commandName: 'xargs', xargsTargetCommands: XARGS_TARGETS },
      ),
    ).toBe(false)
    // 全 none 打包放行
    expect(
      validateFlags(
        ['xargs', '-ra'],
        1,
        { safeFlags: { '-r': 'none', '-a': 'none' } },
        { commandName: 'xargs', xargsTargetCommands: XARGS_TARGETS },
      ),
    ).toBe(true)
  })

  test('-E= 空内联 EOF 攻击差（GNU attached-arg 语义）', () => {
    const cfg: ExternalCommandConfig = { safeFlags: { '-E': 'EOF' } }
    // 攻击形：-E= 空内联 → 不吞下一 token，validateFlagArgument('','EOF') 拒
    expect(
      validateFlags(
        ['xargs', '-E=', 'EOF', 'echo'],
        1,
        cfg,
        { commandName: 'xargs', xargsTargetCommands: XARGS_TARGETS },
      ),
    ).toBe(false)
    // 合法形：-E EOF 分离 → 吞 EOF 通过
    expect(
      validateFlags(
        ['xargs', '-E', 'EOF', 'echo'],
        1,
        cfg,
        { commandName: 'xargs', xargsTargetCommands: XARGS_TARGETS },
      ),
    ).toBe(true)
  })

  test('`--` 默认 respectsDoubleDash = 其后全参不验', () => {
    expect(validateFlags(['--', '--evil'], 0, { safeFlags: {} })).toBe(true)
  })

  test('respectsDoubleDash=false（pyright 型）`--` 后 flag 仍验', () => {
    expect(
      validateFlags(
        ['--', '--createstub', 'os'],
        0,
        { safeFlags: {}, respectsDoubleDash: false },
      ),
    ).toBe(false)
  })

  test('git -N shorthand（-10 ≡ -n 10）', () => {
    expect(validateFlags(['-10'], 0, { safeFlags: {} }, { commandName: 'git' })).toBe(
      true,
    )
    // 非 git 命令 -N 不认
    expect(
      validateFlags(['-10'], 0, { safeFlags: {} }, { commandName: 'other' }),
    ).toBe(false)
  })

  test('grep/rg 附着数字（-A20 ≡ -A 20）', () => {
    const cfg: ExternalCommandConfig = { safeFlags: { '-A': 'number' } }
    expect(
      validateFlags(['-A20'], 0, cfg, { commandName: 'grep' }),
    ).toBe(true)
    expect(
      validateFlags(['-A20'], 0, cfg, { commandName: 'rg' }),
    ).toBe(true)
    // 附着非数字 → 打包支逐字符查表 → 拒
    expect(
      validateFlags(['-A2x'], 0, cfg, { commandName: 'grep' }),
    ).toBe(false)
  })

  test('string 参 `-` 前缀拒 + git --sort 逆序例外', () => {
    const cfg: ExternalCommandConfig = {
      safeFlags: { '--name': 'string', '--sort': 'string' },
    }
    // 分离形 -x 被「下一 token 是 flag = 缺参」支先行拒（false）
    expect(validateFlags(['--name', '-x'], 0, cfg)).toBe(false)
    // 内联形 -x 走 `-` 前缀防混淆支：string 参 `-` 开头值拒
    expect(validateFlags(['--name=-x'], 0, cfg)).toBe(false)
    // git --sort=-refname（逆序内联）= 例外放行
    expect(
      validateFlags(['--sort=-refname'], 0, cfg, { commandName: 'git' }),
    ).toBe(true)
    // 非 git 命令同形不例外
    expect(
      validateFlags(['--sort=-refname'], 0, cfg, { commandName: 'gh' }),
    ).toBe(false)
  })

  test('必参缺失 → 拒', () => {
    expect(validateFlags(['-n'], 0, { safeFlags: { '-n': 'number' } })).toBe(
      false,
    )
  })

  test('FLAG_PATTERN 面', () => {
    expect(FLAG_PATTERN.test('-x')).toBe(true)
    expect(FLAG_PATTERN.test('--all')).toBe(true)
    expect(FLAG_PATTERN.test('-_u')).toBe(true)
    // 类含 `-`：`--` 亦命中（双 dash 由 validateFlags 先行特判，非 pattern 面）
    expect(FLAG_PATTERN.test('--')).toBe(true)
    expect(FLAG_PATTERN.test('a')).toBe(false)
    expect(FLAG_PATTERN.test('')).toBe(false)
  })
})

describe('EXTERNAL_READONLY_COMMANDS 形面', () => {
  test('跨 shell 只读命令 = docker ps / docker images（Windows 同形）', () => {
    expect(EXTERNAL_READONLY_COMMANDS).toEqual(['docker ps', 'docker images'])
    expect(EXTERNAL_READONLY_COMMANDS).toHaveLength(2)
  })
})

describe('bashTimeouts env 面 + 不变式', () => {
  test('缺省 = 120s / 600s', () => {
    expect(getDefaultBashTimeoutMs({})).toBe(120_000)
    expect(getMaxBashTimeoutMs({})).toBe(600_000)
  })

  test('env 覆盖（正值解析，max 恒受缺省 default 托底）', () => {
    expect(
      getDefaultBashTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: '5000' }),
    ).toBe(5_000)
    // max 显式 9000 < default 120000 → 不变式托底 120000
    expect(getMaxBashTimeoutMs({ BASH_MAX_TIMEOUT_MS: '9000' })).toBe(120_000)
    // 双 env 同降 → max 生效
    expect(
      getMaxBashTimeoutMs({
        BASH_MAX_TIMEOUT_MS: '9000',
        BASH_DEFAULT_TIMEOUT_MS: '5000',
      }),
    ).toBe(9_000)
  })

  test('max≥default 不变式双支', () => {
    // default 抬高 → max 缺省支抬到 default
    expect(
      getMaxBashTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: '999999' }),
    ).toBe(999_999)
    // max 显式低于 default → 抬到 default
    expect(
      getMaxBashTimeoutMs({
        BASH_MAX_TIMEOUT_MS: '1000',
        BASH_DEFAULT_TIMEOUT_MS: '5000',
      }),
    ).toBe(5_000)
  })

  test('非法 env 值（非数字/零/负）→ 缺省', () => {
    expect(
      getDefaultBashTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: 'abc' }),
    ).toBe(120_000)
    expect(
      getDefaultBashTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: '0' }),
    ).toBe(120_000)
    expect(
      getDefaultBashTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: '-5' }),
    ).toBe(120_000)
  })

  test('缺省参 = process.env（真实 env 面）', () => {
    withEnv({ BASH_DEFAULT_TIMEOUT_MS: '7777' }, () => {
      expect(getDefaultBashTimeoutMs()).toBe(7_777)
    })
  })
})

describe('bashHelpers 小 helper 面', () => {
  beforeEach(() => {
    resetSettingsCache()
  })

  afterEach(() => {
    resetSettingsCache()
  })

  test('hasEmbeddedSearchTools：EMBEDDED_SEARCH_TOOLS 门 + sdk 族 entrypoint 门', () => {
    withEnv({ EMBEDDED_SEARCH_TOOLS: undefined }, () => {
      expect(hasEmbeddedSearchTools()).toBe(false)
    })
    withEnv(
      { EMBEDDED_SEARCH_TOOLS: 'true', ATLAS_ENTRYPOINT: 'sdk-ts' },
      () => {
        expect(hasEmbeddedSearchTools()).toBe(false)
      },
    )
    withEnv(
      { EMBEDDED_SEARCH_TOOLS: 'true', ATLAS_ENTRYPOINT: 'cli' },
      () => {
        expect(hasEmbeddedSearchTools()).toBe(true)
      },
    )
  })

  test('shouldMaintainProjectWorkingDir：ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR 门', () => {
    withEnv({ ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR: undefined }, () => {
      expect(shouldMaintainProjectWorkingDir()).toBe(false)
    })
    withEnv({ ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR: 'true' }, () => {
      expect(shouldMaintainProjectWorkingDir()).toBe(true)
    })
  })

  test('shouldIncludeGitInstructions：env 双判 + settings 缺省面', () => {
    withEnv({ ATLAS_DISABLE_GIT_INSTRUCTIONS: 'true' }, () => {
      expect(shouldIncludeGitInstructions()).toBe(false)
    })
    withEnv({ ATLAS_DISABLE_GIT_INSTRUCTIONS: 'false' }, () => {
      expect(shouldIncludeGitInstructions()).toBe(true)
    })
    // env 未定 → settings.includeGitInstructions ?? true（cache 注入零盘）
    withEnv({ ATLAS_DISABLE_GIT_INSTRUCTIONS: undefined }, () => {
      setSessionSettingsCache({
        settings: {} as unknown as SettingsJson,
        errors: [],
      })
      expect(shouldIncludeGitInstructions()).toBe(true)
      setSessionSettingsCache({
        settings: {
          includeGitInstructions: false,
        } as unknown as SettingsJson,
        errors: [],
      })
      expect(shouldIncludeGitInstructions()).toBe(false)
    })
  })

  test('prependBullets：嵌套项双缩进子弹', () => {
    expect(prependBullets(['a', ['b', 'c'], 'd'])).toEqual([
      ' - a',
      '  - b',
      '  - c',
      ' - d',
    ])
    expect(prependBullets([])).toEqual([])
  })
})
