/**
 * 0.1.76 per-server oauth 块级 scope-gating 波（归整切片②）判别单测。
 *
 * 信任单元 = per-server `oauth` 块整体（clientId / callbackPort /
 * authServerMetadataUrl / clientMetadataUrl / xaa）——单字段门控 = 半门控
 * 假安全（0.1.74 4th-review 裁拒）。scope 裁定（f4 2026-10-18 工单 §0）：
 *   untrusted = project（repo 提交值）+ 插件提供（dynamic + pluginSource
 *   在场）；trusted = user / local / enterprise + 操作者 --mcp-config 面
 *   （dynamic 无 pluginSource）→ 恒通过（零变更恒等锚）。
 * allowlist = 操作者 env ATLAS_MCP_OAUTH_TRUSTED_SERVERS（逗号分隔，trim +
 * case-insensitive，CWE-178）；settings 源不可种（managedEnv.ts
 * withoutMcpOauthTrustedServersVars 剥离，对齐 0.1.74 withoutMcpOauthCimdVars
 * 剥离纪律）——repo 可种的 settings 值不进 allowlist，仅真 env（shell/CI）
 * 计数。
 *
 * 7 族：G-1 untrusted 块门控红→绿 / G-2 allowlist 放行 / G-3 trusted 恒等
 * 锚 / G-4 单字段不劈裂守卫 / G-5 settings 种值不计数 + env
 * case-insensitive / G-6 无 oauth 块 + sse/http/ws 通用面零回归 / G-7
 * 0.1.74 四硬化面零回归（CIMD env getter 优先级链 + https 验真 + 日志
 * 描述子 + case-insensitive 剥离）。
 *
 * 分层纪律：unit 层——oauthScopeGate 纯函数活码（直接 import，类型导入
 * 擦除后运行时零模块图、零网络 / 零盘写 / 零 PTY / 零 spawn）+ 源级
 * 字符串锁（读仓库自身 = 确定性；判据面 = 活码）。基线 RED 面 = 本波前
 * oauthScopeGate.ts 缺席（import 即失败）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  MCP_OAUTH_TRUSTED_SERVERS_ENV,
  applyMcpOauthScopeGate,
  getMcpOauthTrustedServers,
  isMcpOauthBlockGated,
  isMcpOauthDisplayGated,
  isMcpOauthUntrustedScope,
  mcpOauthGatedMessage,
  parseMcpOauthTrustedServersEnv,
} from '../../src/tui/services/mcp/oauthScopeGate.js'
import type { ScopedMcpServerConfig } from '../../src/tui/services/mcp/types.js'

function srcOf(rel: string): string {
  return readFileSync(resolve(import.meta.dir, '../../', rel), 'utf8')
}
function countOf(haystack: string, needle: string): number {
  let n = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    n++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return n
}

const GATE = 'src/tui/services/mcp/oauthScopeGate.ts'
const CONFIG = 'src/tui/services/mcp/config.ts'
const AUTH = 'src/tui/services/mcp/auth.ts'
const MANAGED_ENV = 'src/tui/utils/managedEnv.ts'
const TYPES = 'src/tui/services/mcp/types.ts'
const CLI_HANDLER = 'src/tui/cli/handlers/mcp.tsx'
const AUTH_TOOL = 'src/tui/tools/McpAuthTool/McpAuthTool.ts'
const REMOTE_MENU = 'src/tui/components/mcp/MCPRemoteServerMenu.tsx'
const SETTINGS = 'src/tui/components/mcp/MCPSettings.tsx'
const LIST_PANEL = 'src/tui/components/mcp/MCPListPanel.tsx'

/** oauth 块 5 字段全量（McpOAuthConfigSchema：无 clientSecret 字段）。 */
const OAUTH_BLOCK = {
  clientId: 'cid-123',
  callbackPort: 8765,
  authServerMetadataUrl: 'https://as.example.com/.well-known/oauth-authorization-server',
  clientMetadataUrl: 'https://meta.example.com/cimd.json',
  xaa: true,
} as const

function sseServer(over: Record<string, unknown>): ScopedMcpServerConfig {
  return {
    type: 'sse',
    url: 'https://mcp.example.com/sse',
    ...over,
  } as unknown as ScopedMcpServerConfig
}

// 环境面 hermetic：allowlist env 每测前清空、测后复原（隔离进程内零泄漏）。
beforeEach(() => {
  delete process.env[MCP_OAUTH_TRUSTED_SERVERS_ENV]
})

describe('G-1：untrusted scope oauth 块门控（红→绿）', () => {
  test('project scope + oauth 块 + 无 allowlist → 合并面整块剥离 + oauthGated 标记在场', () => {
    const out = applyMcpOauthScopeGate(
      'repo-svc',
      sseServer({ scope: 'project', oauth: OAUTH_BLOCK }),
    ) as unknown as {
      oauth?: unknown
      oauthGated?: boolean
      type?: string
      url?: string
      scope?: string
    }
    expect(out).not.toHaveProperty('oauth')
    expect(out.oauthGated).toBe(true)
    // 非 oauth 顶层字段零扰动
    expect(out.type).toBe('sse')
    expect(out.url).toBe('https://mcp.example.com/sse')
    expect(out.scope).toBe('project')
  })
  test('插件提供（dynamic + pluginSource 在场）→ 同门控', () => {
    const out = applyMcpOauthScopeGate(
      'plugin:acme:svc',
      sseServer({
        scope: 'dynamic',
        pluginSource: 'plugin:acme:svc',
        oauth: OAUTH_BLOCK,
      }),
    ) as unknown as { oauth?: unknown; oauthGated?: boolean }
    expect(out).not.toHaveProperty('oauth')
    expect(out.oauthGated).toBe(true)
  })
  test('显示面谓词：原始配置（未经合并面）untrusted + oauth 块在场 → 门控态；合并面剥离后（标记在场）→ 同门控态', () => {
    expect(
      isMcpOauthDisplayGated('repo-svc', {
        scope: 'project',
        oauth: OAUTH_BLOCK,
      }),
    ).toBe(true)
    const gated = applyMcpOauthScopeGate(
      'repo-svc',
      sseServer({ scope: 'project', oauth: OAUTH_BLOCK }),
    )
    expect(isMcpOauthDisplayGated('repo-svc', gated as never)).toBe(true)
  })
  test('可行动错误文案：server 名 + untrusted scope 语义 + 操作者 allowlist 指引（env 名在场）', () => {
    const msg = mcpOauthGatedMessage('repo-svc')
    expect(msg).toContain('repo-svc')
    expect(msg).toContain('untrusted scope')
    expect(msg).toContain(MCP_OAUTH_TRUSTED_SERVERS_ENV)
  })
  test('合并面接线在场（config.ts：addScopeToServers 附着面 + getMcpConfigs 插件面兜底）', () => {
    const src = srcOf(CONFIG)
    expect(src).toContain(
      "import { applyMcpOauthScopeGate } from './oauthScopeGate.js'",
    )
    expect(src).toContain(
      'scopedServers[name] = applyMcpOauthScopeGate(name, { ...config, scope })',
    )
    expect(src).toContain('filtered[name] = applyMcpOauthScopeGate(')
  })
  test('oauth 消费入口门禁在场（auth.ts performMCPOAuthFlow 函数顶 throw 可行动错误）', () => {
    const src = srcOf(AUTH)
    expect(src).toContain('if (isMcpOauthDisplayGated(serverName, serverConfig)) {')
    expect(src).toContain('throw new Error(mcpOauthGatedMessage(serverName))')
  })
})

describe('G-2：操作者 allowlist 放行（env 通道）', () => {
  test('解析面：逗号分隔 + trim + 小写归一 + 丢空', () => {
    expect([...parseMcpOauthTrustedServersEnv('a, B ,c,')].sort()).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(parseMcpOauthTrustedServersEnv(undefined).size).toBe(0)
    expect(parseMcpOauthTrustedServersEnv(null).size).toBe(0)
    expect(parseMcpOauthTrustedServersEnv(' , ,').size).toBe(0)
  })
  test('匹配面 case-insensitive：server 名小写归一（CWE-178 对齐）', () => {
    expect(isMcpOauthBlockGated('FOO', 'project', undefined, new Set(['foo']))).toBe(
      false,
    )
    expect(isMcpOauthBlockGated('Foo', 'project', undefined, new Set(['bar']))).toBe(
      true,
    )
  })
  test('allowlist 在场 → 块放行（门控谓词 false + 合并面引用级恒等）；名单外 → 门控', () => {
    process.env[MCP_OAUTH_TRUSTED_SERVERS_ENV] = 'repo-svc, other'
    expect(getMcpOauthTrustedServers().has('repo-svc')).toBe(true)
    const cfg = sseServer({ scope: 'project', oauth: OAUTH_BLOCK })
    expect(applyMcpOauthScopeGate('repo-svc', cfg)).toBe(cfg)
    const out2 = applyMcpOauthScopeGate(
      'baz',
      sseServer({ scope: 'project', oauth: OAUTH_BLOCK }),
    ) as unknown as { oauthGated?: boolean }
    expect(out2.oauthGated).toBe(true)
  })
})

describe('G-3：trusted scope 恒等锚（零变更）', () => {
  test('untrusted 判定表（f4 工单 §0 裁定面）', () => {
    expect(isMcpOauthUntrustedScope('project')).toBe(true)
    expect(isMcpOauthUntrustedScope('dynamic', 'plugin:acme:x')).toBe(true)
    // 操作者 --mcp-config 面（dynamic 无 pluginSource）= trusted
    expect(isMcpOauthUntrustedScope('dynamic')).toBe(false)
    expect(isMcpOauthUntrustedScope('user')).toBe(false)
    expect(isMcpOauthUntrustedScope('local')).toBe(false)
    expect(isMcpOauthUntrustedScope('enterprise')).toBe(false)
    expect(isMcpOauthUntrustedScope(undefined)).toBe(false)
  })
  test('trusted scope + oauth 块 → 引用级恒等（oauth 块原样保留，无标记）', () => {
    for (const scope of ['user', 'local', 'enterprise'] as const) {
      const cfg = sseServer({ scope, oauth: OAUTH_BLOCK })
      expect(applyMcpOauthScopeGate('s', cfg)).toBe(cfg)
    }
    const dyn = sseServer({ scope: 'dynamic', oauth: OAUTH_BLOCK })
    expect(applyMcpOauthScopeGate('s', dyn)).toBe(dyn)
  })
  test('trusted 面显示谓词恒 false（显示零变更恒等锚）', () => {
    expect(isMcpOauthDisplayGated('s', { scope: 'user', oauth: OAUTH_BLOCK })).toBe(
      false,
    )
    expect(isMcpOauthDisplayGated('s', { scope: 'local' })).toBe(false)
  })
})

describe('G-4：单字段不劈裂守卫（整块门控，构造性成立）', () => {
  test('门控时 oauth 全 5 字段同缺席（无单字段部分剥离）+ 顶层非 oauth 字段零扰动', () => {
    const out = applyMcpOauthScopeGate(
      's',
      sseServer({
        scope: 'project',
        oauth: OAUTH_BLOCK,
        headers: { Authorization: 'Bearer x' },
      }),
    ) as unknown as {
      oauth?: unknown
      oauthGated?: boolean
      headers?: Record<string, string>
      type?: string
      scope?: string
    }
    expect(out).not.toHaveProperty('oauth')
    expect(out.oauthGated).toBe(true)
    expect(out.headers).toEqual({ Authorization: 'Bearer x' })
    expect(out.type).toBe('sse')
    expect(out.scope).toBe('project')
  })
  test('非门控面 oauth 块整块原样保留（不劈裂的镜像面）', () => {
    const out = applyMcpOauthScopeGate(
      's',
      sseServer({ scope: 'user', oauth: OAUTH_BLOCK }),
    ) as unknown as { oauth?: unknown }
    expect(out.oauth).toEqual(OAUTH_BLOCK)
  })
  test('门控模块构造性整块剥离（无单字段级门控活码）', () => {
    const src = srcOf(GATE)
    expect(src).toContain('const { oauth: _gatedOAuth, ...rest } = remote')
    expect(src).toContain('config.oauth === undefined')
  })
})

describe('G-5：settings 种值不计数 + env case-insensitive', () => {
  test('managedEnv.ts：ATLAS_MCP_OAUTH_TRUSTED_SERVERS 从一切 settings 源 env 剥离（case-insensitive，CWE-178）', () => {
    const src = srcOf(MANAGED_ENV)
    // 剥离函数在场 + case-insensitive 键匹配（Windows process.env 大小写
    // 不敏感语义锁步；repo 种异大小写变体不可存活）+ 已挂进
    // filterSettingsEnv 过滤链（settings.env 任何 scope 均不可种值；
    // 仅真环境 shell/CI 可设）。
    expect(src).toContain('function withoutMcpOauthTrustedServersVars(')
    expect(src).toContain('key.toUpperCase() !== MCP_OAUTH_TRUSTED_SERVERS_ENV')
    expect(src).toContain(
      'withoutMcpOauthTrustedServersVars(\n      withoutMcpOauthCimdVars(',
    )
  })
  test('oauthScopeGate.ts：allowlist 仅读真 env（settings 种值到不了计数面）+ env 名单一事实源常量', () => {
    const src = srcOf(GATE)
    expect(src).toContain('process.env[MCP_OAUTH_TRUSTED_SERVERS_ENV]')
    expect(src).toContain(
      "export const MCP_OAUTH_TRUSTED_SERVERS_ENV = 'ATLAS_MCP_OAUTH_TRUSTED_SERVERS'",
    )
  })
  test('env 值 case-insensitive：种异大小写变体仍计数（Windows env 语义）', () => {
    process.env[MCP_OAUTH_TRUSTED_SERVERS_ENV] = 'Repo-Svc'
    expect(getMcpOauthTrustedServers().has('repo-svc')).toBe(true)
    expect(isMcpOauthBlockGated('REPO-SVC', 'project')).toBe(false)
  })
})

describe('G-6：无 oauth 块 + sse/http/ws 通用面零回归', () => {
  test('无 oauth 块（project scope）→ 引用级恒等（不附标记）', () => {
    const cfg = sseServer({ scope: 'project', headers: { Authorization: 'Bearer x' } })
    const out = applyMcpOauthScopeGate('s', cfg)
    expect(out).toBe(cfg)
    expect(out).not.toHaveProperty('oauthGated')
  })
  test('ws / stdio 型 = 通用面零扰动（oauth 块仅 sse/http 型 schema 在场）', () => {
    const ws = {
      type: 'ws',
      url: 'wss://x.example.com',
      scope: 'project',
    } as unknown as ScopedMcpServerConfig
    expect(applyMcpOauthScopeGate('s', ws)).toBe(ws)
    const stdio = {
      type: 'stdio',
      command: 'node',
      scope: 'project',
    } as unknown as ScopedMcpServerConfig
    expect(applyMcpOauthScopeGate('s', stdio)).toBe(stdio)
  })
  test('http 型同块级门控面', () => {
    const cfg = {
      type: 'http',
      url: 'https://mcp.example.com/mcp',
      scope: 'project',
      oauth: OAUTH_BLOCK,
    } as unknown as ScopedMcpServerConfig
    const out = applyMcpOauthScopeGate('s', cfg) as unknown as {
      oauth?: unknown
      oauthGated?: boolean
    }
    expect(out).not.toHaveProperty('oauth')
    expect(out.oauthGated).toBe(true)
  })
  test('无 oauth 块 + 无标记 → 显示谓词 false（列表面不误显）', () => {
    expect(isMcpOauthDisplayGated('s', { scope: 'project' })).toBe(false)
    expect(isMcpOauthDisplayGated('s', { scope: 'user', oauth: OAUTH_BLOCK })).toBe(
      false,
    )
  })
})

describe('G-7：0.1.74 四硬化面零回归', () => {
  test('auth.ts：CIMD env getter 优先级链在场（env 部署控制 → per-server → undefined；顺序锁）', () => {
    const src = srcOf(AUTH)
    expect(src).toContain('get clientMetadataUrl(): string | undefined')
    const getter = src.slice(src.indexOf('get clientMetadataUrl()'))
    const envIdx = getter.indexOf('process.env.MCP_OAUTH_CLIENT_METADATA_URL')
    const perIdx = getter.indexOf('this.serverConfig.oauth?.clientMetadataUrl')
    expect(envIdx).toBeGreaterThan(-1)
    expect(perIdx).toBeGreaterThan(envIdx)
  })
  test('auth.ts：env 值 https-验真 + 日志描述子（4th-review 观测卫生）', () => {
    const src = srcOf(AUTH)
    expect(src).toContain("new URL(override).protocol === 'https:'")
    const getter = src.slice(src.indexOf('get clientMetadataUrl()'))
    expect(getter).toContain('const describe = (raw: string): string =>')
    expect(getter).toContain('`${u.protocol}//${u.host}${u.pathname}`')
    expect(getter).toContain('Using CIMD URL from env: ${describe(override)}')
    expect(getter).toContain(
      'Ignoring invalid MCP_OAUTH_CLIENT_METADATA_URL env value: ${describe(',
    )
  })
  test('managedEnv.ts：MCP_OAUTH_CLIENT_METADATA_URL case-insensitive 剥离恒在场（0.1.74 锚）', () => {
    const src = srcOf(MANAGED_ENV)
    expect(src).toContain('function withoutMcpOauthCimdVars(')
    expect(src).toContain(
      "key.toUpperCase() !== 'MCP_OAUTH_CLIENT_METADATA_URL'",
    )
  })
  test('types.ts：CIMD 字段 https-only 验真锚在场', () => {
    expect(srcOf(TYPES)).toContain('clientMetadataUrl must use https://')
  })
})

describe('S-3 显示面在场（门控态显形文案；trusted 面显示零变更）', () => {
  test('McpAuthTool.ts：oauth 块门控态提前返可行动错误（不发起 oauth 流）', () => {
    const src = srcOf(AUTH_TOOL)
    expect(src).toContain('isMcpOauthDisplayGated(serverName, config)')
    expect(src).toContain('mcpOauthGatedMessage(serverName)')
  })
  test('/mcp CLI 面：oauth 行门控支在场（sse + http 双支）', () => {
    const src = srcOf(CLI_HANDLER)
    expect(countOf(src, 'OAuth: gated (untrusted scope)')).toBe(2)
  })
  test('TUI 状态行：MCPRemoteServerMenu auth 行门控支 + MCPSettings prepareServers 数据面 + MCPListPanel 状态行', () => {
    expect(srcOf(REMOTE_MENU)).toContain('oauth gated (untrusted scope)')
    const settings = srcOf(SETTINGS)
    expect(countOf(settings, 'isMcpOauthDisplayGated(client_0.name, client_0.config)')).toBe(2)
    const panel = srcOf(LIST_PANEL)
    expect(panel).toContain('server_3.oauthGated === true')
    expect(panel).toContain('oauth gated (untrusted scope)')
  })
})
