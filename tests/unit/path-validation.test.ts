/**
 * permissions 域路径校验核心 unit 测试（E-6 S-6a，§8.43 判别信号；零磁盘）
 *
 * 被测能力 = src/permissions/pathValidation.ts（旧仓 487L 逐字移植，
 * 8 函数 + 3 类型）：
 *  - 纯函数族（expandTilde / getGlobBaseDirectory / formatDirectoryList /
 *    isDangerousRemovalPath 双斜杠折叠 + Windows 盘根/盘子）
 *  - isPathAllowed 决策序（read 工作目录自动放行 / write 无 acceptEdits 落末
 *    false / sandbox 写 allowlist 3.7 支命中放行 + deny-within-allow 阻断 /
 *    危险文件 safety 支不被 acceptEdits 放行——P-A1 探针锚点）
 *  - validatePath 五安全块（UNC 平台条件 / ~user 变体 / $%= 展开语法 /
 *    write 拒 glob / 引号剥离）+ 合法路径主链
 *  - validateGlobPattern 双支（遍历支走全路径 / 非遍历支走基目录）
 *  - isPathInSandboxWriteAllowlist（假窗口：禁用=false / allowOnly 命中=true /
 *    denyWithinAllow 阻断=false——P-A1b 探针锚点）
 *
 * 桩态边界（H6 防假装通过，§8.43 裁定）：matchingRuleForInput /
 * checkReadableInternalPath / checkEditableInternalPath = filesystem ①②
 * 残留守桩（规则求值树归 engine 波 / 内部路径族归 E-7）——isPathAllowed 的
 * 规则命中步 / 内部路径步降级直通（桩恒 null / passthrough）→ 本文件不断言
 * 「deny 规则命中」/「内部路径命中」（桩态下该类断言 = 假信号，落地由
 * engine 波 / E-7 随桩核销补测）。
 *
 * UNC 块平台条件：containsVulnerableUncPath 为 Windows-only（POSIX 恒
 * false，按设计——国内目标 POSIX）→ Linux 下 UNC 路径走 isPathAllowed
 * 末段（非工作目录 = false），Windows 下走 UNC 早退 other 原因。
 *
 * 分层纪律：零磁盘（§8.16 T7 口径——不存在路径 realpath 失败回落逻辑路径，
 * 无磁盘写；bootstrap env 注入 /tmp/proj + 假 sandbox 窗口纯内存）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { homedir } from 'os'
import {
  setPermissionsBootstrapEnv,
  resetPermissionsBootstrapEnv,
  setSandboxAccess,
  resetSandboxAccess,
  formatDirectoryList,
  getGlobBaseDirectory,
  expandTilde,
  isPathInSandboxWriteAllowlist,
  isPathAllowed,
  validateGlobPattern,
  isDangerousRemovalPath,
  validatePath,
} from '../../src/permissions'
import { getPlatform } from '../../src/shared'
import type { PermissionMode, ToolPermissionContext } from '../../src/shared'

function makeContext(mode: PermissionMode = 'default'): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}

type FakeSandbox = {
  enabled: boolean
  autoAllow?: boolean
  allowOnly: string[]
  denyWithinAllow: string[]
}

/** 假 sandbox 窗口（纯内存；placeholder 态 = resetSandboxAccess）。 */
function injectSandbox(cfg: FakeSandbox): void {
  setSandboxAccess({
    isSandboxingEnabled: () => cfg.enabled,
    isAutoAllowBashIfSandboxedEnabled: () => cfg.autoAllow ?? false,
    getFsWriteConfig: () => ({
      allowOnly: cfg.allowOnly,
      denyWithinAllow: cfg.denyWithinAllow,
    }),
  })
}

beforeEach(() => {
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => '/tmp/proj',
    getCwd: () => '/tmp/proj',
  })
  resetSandboxAccess()
})
afterEach(() => {
  resetPermissionsBootstrapEnv()
  resetSandboxAccess()
})

// ── 纯函数族 ─────────────────────────────────────────────────────────────

describe('expandTilde（~/ 展开，~user 不展开）', () => {
  test('~ 与 ~/ 展开为 homedir，其余不变', () => {
    const home = homedir()
    expect(expandTilde('~')).toBe(home)
    expect(expandTilde('~/x')).toBe(`${home}/x`)
    expect(expandTilde('/abs/path')).toBe('/abs/path')
    expect(expandTilde('rel/path')).toBe('rel/path')
  })
})

describe('getGlobBaseDirectory（基目录提取）', () => {
  test('glob 字符前的最后目录段', () => {
    expect(getGlobBaseDirectory('/path/to/*.txt')).toBe('/path/to')
    expect(getGlobBaseDirectory('src/**/*.ts')).toBe('src')
    expect(getGlobBaseDirectory('/path/to/dir/{a,b}')).toBe('/path/to/dir')
  })

  test('无 glob 字符 → 原样返回；首段 glob → 根/点', () => {
    expect(getGlobBaseDirectory('/path/to/a.txt')).toBe('/path/to/a.txt')
    expect(getGlobBaseDirectory('/*')).toBe('/')
    expect(getGlobBaseDirectory('*.txt')).toBe('.')
  })
})

describe('formatDirectoryList（≤5 全列 / >5 截断）', () => {
  test('≤5 全列引号化', () => {
    expect(formatDirectoryList(['/a', '/b', '/c'])).toBe("'/a', '/b', '/c'")
  })

  test('>5 列前 5 + 余量提示', () => {
    const dirs = ['/d1', '/d2', '/d3', '/d4', '/d5', '/d6', '/d7']
    expect(formatDirectoryList(dirs)).toBe(
      "'/d1', '/d2', '/d3', '/d4', '/d5', and 2 more",
    )
  })
})

describe('isDangerousRemovalPath（rm 危险路径判定）', () => {
  test('危险形全命中（* / /* / 根 / home / root 直接子 / 盘根+盘子 / 双斜杠折叠）', () => {
    const home = homedir().replace(/[\\/]+/g, '/')
    for (const p of [
      '*',
      '/tmp/*',
      '/',
      home,
      '/usr', // root 直接子
      'C:\\',
      'C:/',
      'C:\\Windows',
      'C:\\\\Users', // PowerShell 双反斜杠形 → 折叠后盘子命中
    ]) {
      expect(isDangerousRemovalPath(p), p).toBe(true)
    }
  })

  test('非危险形不误伤（深层路径 / 盘深层路径）', () => {
    for (const p of ['/usr/local', '/home/vince/projects', 'C:/Windows/System32']) {
      expect(isDangerousRemovalPath(p), p).toBe(false)
    }
  })
})

// ── isPathAllowed 决策序（桩态边界）────────────────────────────────────

describe('isPathAllowed 决策序（工作目录 / acceptEdits / sandbox 3.7 支 / safety 支）', () => {
  test('read 工作目录内 → allowed（默认模式读放行）', () => {
    const r = isPathAllowed('/tmp/proj/a.txt', makeContext(), 'read')
    expect(r.allowed).toBe(true)
  })

  test('write 工作目录内 + acceptEdits → allowed', () => {
    const r = isPathAllowed('/tmp/proj/b.txt', makeContext('acceptEdits'), 'write')
    expect(r.allowed).toBe(true)
  })

  test('write 工作目录内 + 默认模式（无 acceptEdits）→ 落末 false（allow 规则桩态 null）', () => {
    const r = isPathAllowed('/tmp/proj/b.txt', makeContext(), 'write')
    expect(r.allowed).toBe(false)
  })

  test('write 工作目录外 + 无规则 → false', () => {
    const r = isPathAllowed('/elsewhere/b.txt', makeContext('acceptEdits'), 'write')
    expect(r.allowed).toBe(false)
  })

  test('write 工作目录外 + sandbox 写 allowlist 命中 → allowed（3.7 支 other 原因）', () => {
    injectSandbox({ enabled: true, allowOnly: ['/data/scratch'], denyWithinAllow: [] })
    const r = isPathAllowed('/data/scratch/f.txt', makeContext(), 'write')
    expect(r.allowed).toBe(true)
    expect(r.decisionReason).toEqual({
      type: 'other',
      reason: 'Path is in sandbox write allowlist',
    })
  })

  test('write + sandbox allowlist 命中但 denyWithinAllow 阻断 → false', () => {
    injectSandbox({
      enabled: true,
      allowOnly: ['/data/scratch'],
      denyWithinAllow: ['/data/scratch/protected'],
    })
    const r = isPathAllowed(
      '/data/scratch/protected/f.txt',
      makeContext(),
      'write',
    )
    expect(r.allowed).toBe(false)
  })

  test('write 工作目录外 + sandbox 未启用（placeholder）→ 3.7 支失活 false', () => {
    const r = isPathAllowed('/data/scratch/f.txt', makeContext(), 'write')
    expect(r.allowed).toBe(false)
  })

  test('write 危险文件（.bashrc）+ acceptEdits → safety 支拦截 false（不被 acceptEdits 放行，P-A1 探针锚点）', () => {
    const r = isPathAllowed('/tmp/proj/.bashrc', makeContext('acceptEdits'), 'write')
    expect(r.allowed).toBe(false)
    expect(r.decisionReason?.type).toBe('safetyCheck')
  })
})

// ── isPathInSandboxWriteAllowlist（假窗口四态）──────────────────────────

describe('isPathInSandboxWriteAllowlist（sandbox 窗口消费面）', () => {
  test('placeholder 禁用态 → false（不触 getFsWriteConfig 配置）', () => {
    expect(isPathInSandboxWriteAllowlist('/data/scratch/f.txt')).toBe(false)
  })

  test('启用 + allowOnly 命中 → true', () => {
    injectSandbox({ enabled: true, allowOnly: ['/data/scratch'], denyWithinAllow: [] })
    expect(isPathInSandboxWriteAllowlist('/data/scratch/f.txt')).toBe(true)
  })

  test('启用 + allowOnly 命中但 denyWithinAllow 覆盖 → false（P-A1b 探针锚点）', () => {
    injectSandbox({
      enabled: true,
      allowOnly: ['/data/scratch'],
      denyWithinAllow: ['/data/scratch/protected'],
    })
    expect(
      isPathInSandboxWriteAllowlist('/data/scratch/protected/f.txt'),
    ).toBe(false)
  })

  test('启用 + 空 allowOnly → false', () => {
    injectSandbox({ enabled: true, allowOnly: [], denyWithinAllow: [] })
    expect(isPathInSandboxWriteAllowlist('/data/scratch/f.txt')).toBe(false)
  })
})

// ── validatePath 五安全块 + 主链 ────────────────────────────────────────

describe('validatePath 安全块', () => {
  test('UNC 早退（Windows 判定形；POSIX 按设计恒 false → 走末段 false）', () => {
    const r = validatePath('//server/share', '/tmp/proj', makeContext(), 'read')
    if (getPlatform() === 'windows') {
      expect(r.allowed).toBe(false)
      expect(r.decisionReason?.type).toBe('other')
    } else {
      // POSIX：containsVulnerableUncPath 恒 false（Windows-only 判定）→
      // isPathAllowed 链末端（非工作目录）= false；resolvedPath 保持原串
      // （safeResolvePath UNC 早退不触 fs）
      expect(r.allowed).toBe(false)
      expect(r.resolvedPath).toBe('//server/share')
    }
  })

  test('~user 变体拒（~root 不展开 = TOCTOU 缺口，恒拒）', () => {
    const r = validatePath('~root/.ssh/id_rsa', '/tmp/proj', makeContext(), 'read')
    expect(r.allowed).toBe(false)
    expect(r.decisionReason).toEqual({
      type: 'other',
      reason:
        'Tilde expansion variants (~user, ~+, ~-) in paths require manual approval',
    })
  })

  test('shell 展开语法拒（$VAR / %VAR% / =cmd 三形）', () => {
    for (const p of ['/tmp/proj/$HOME/x', '%TEMP%\\x', '=rg']) {
      const r = validatePath(p, '/tmp/proj', makeContext(), 'read')
      expect(r.allowed, p).toBe(false)
      expect(r.decisionReason).toEqual({
        type: 'other',
        reason: 'Shell expansion syntax in paths requires manual approval',
      })
    }
  })

  test('write/create 拒 glob（字面 * 写路径绕过校验缺口）', () => {
    for (const op of ['write', 'create'] as const) {
      const r = validatePath(
        '/tmp/proj/*.txt',
        '/tmp/proj',
        makeContext('acceptEdits'),
        op,
      )
      expect(r.allowed, op).toBe(false)
      expect(r.decisionReason).toEqual({
        type: 'other',
        reason:
          'Glob patterns are not allowed in write operations. Please specify an exact file path.',
      })
    }
  })

  test('引号剥离（带引号路径 = 无引号路径同判）', () => {
    const quoted = validatePath(
      "'/tmp/proj/a.txt'",
      '/tmp/proj',
      makeContext(),
      'read',
    )
    expect(quoted.allowed).toBe(true)
  })
})

describe('validatePath 主链（合法路径）', () => {
  test('read 工作目录内合法 → allowed', () => {
    const r = validatePath('/tmp/proj/a.txt', '/tmp/proj', makeContext(), 'read')
    expect(r.allowed).toBe(true)
    expect(r.resolvedPath).toBe('/tmp/proj/a.txt')
  })

  test('write 合法 + 默认模式 → false / + acceptEdits → true', () => {
    expect(
      validatePath('/tmp/proj/b.txt', '/tmp/proj', makeContext(), 'write').allowed,
    ).toBe(false)
    expect(
      validatePath(
        '/tmp/proj/b.txt',
        '/tmp/proj',
        makeContext('acceptEdits'),
        'write',
      ).allowed,
    ).toBe(true)
  })

  test('相对路径经 cwd resolve 后判定', () => {
    const r = validatePath('a.txt', '/tmp/proj', makeContext(), 'read')
    expect(r.allowed).toBe(true)
    expect(r.resolvedPath).toBe('/tmp/proj/a.txt')
  })
})

// ── validateGlobPattern 双支 ────────────────────────────────────────────

describe('validateGlobPattern（遍历支 / 基目录支）', () => {
  test('非遍历 glob → 基目录判定（工作目录内 read 放行）', () => {
    const r = validateGlobPattern(
      '/tmp/proj/*.txt',
      '/tmp/proj',
      makeContext(),
      'read',
    )
    expect(r.allowed).toBe(true)
    expect(r.resolvedPath).toBe('/tmp/proj')
  })

  test('遍历形（..）→ 全路径支（路径串保持 .. 段，工作目录判定越界 = false）', () => {
    const r = validateGlobPattern(
      '/tmp/proj/../*.txt',
      '/tmp/proj',
      makeContext(),
      'read',
    )
    expect(r.resolvedPath).toBe('/tmp/proj/../*.txt')
    expect(r.allowed).toBe(false)
  })
})
