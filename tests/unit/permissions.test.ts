/**
 * permissions 域 unit 测试（C-Deep 切片 3 T7 起步 · E-4 S-4b 翻新 · 零磁盘）
 *
 * §8.16 T7 口径：checkRead/checkWrite 决策主面单测走注入 bootstrap env
 *（getOriginalCwd + getCwd），零磁盘（假 tool.getPath 返固定串，不触 fs——
 * 轻量 getPathsForPermissionCheck 对不存在路径 realpath 失败回落原路径，不 syscall）。
 * func 真盘面（getProjectTempDir / getAtlasTempDir realpath 链 + 真路径单级
 * realpath）归 tests/func/permissions-real-fs.test.ts。
 *
 * E-4 S-4b 翻新（matrix :95 proof，§8.33）：hasPermissionsToUseTool 薄骨架
 * no-op-allow 断言 → 规则支判别信号（deny 命中拒 / ask 命中返 ask /
 * allow 命中 rule 原因 / mcp__server 前缀拒该 server 全部工具 /
 * 空规则集 = allow 默认兼容回归）。规则匹配核心族细测归
 * tests/unit/permission-rule-matching.test.ts（matrix 新行 proof）。
 *
 * E-6 S-6b 工具面分发扩展（§8.43 判别信号，fake duck 工具 + fake sandbox
 * 窗口，零磁盘）：1c duck deny 透传（1d）/ 1f 内容 ask bypass-immune
 * （P-B1 探针锚点）/ 1g safetyCheck bypass-immune / 2a bypass 采纳 duck
 * updatedInput + 无 updatedInput 回落 input（P-B2 探针锚点）/ 2b 采纳 /
 * ⑥ 三态（启用+auto-allow 1b 跳过落 3 decisionReason 无 rule /
 * dangerouslyDisableSandbox 失活 / placeholder 失活 / bypass 态 delta）/
 * 1c 抛错吞没落 3 / 完整上下文无规则落 3 ask（gate fail-closed）。
 * 薄行为回归（无上下文 + 无 duck = 空规则集 allow）既有测守住。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  setPermissionsBootstrapEnv,
  resetPermissionsBootstrapEnv,
  setSandboxAccess,
  resetSandboxAccess,
  hasPermissionsToUseTool,
  checkReadPermissionForTool,
  checkWritePermissionForTool,
  DANGEROUS_FILES,
  DANGEROUS_DIRECTORIES,
  type PermissionTool,
} from '../../src/permissions'
import type {
  ToolPermissionContext,
  PermissionDecision,
  PermissionResult,
} from '../../src/shared'

function makeContext(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}

const readTool: PermissionTool = {
  name: 'Read',
  getPath: input => input.file_path as string,
}
const writeTool: PermissionTool = {
  name: 'Write',
  getPath: input => input.file_path as string,
}
const noPathTool: PermissionTool = { name: 'NoPath' }

const ruleContext = (
  deny: string[] = [],
  ask: string[] = [],
  allow: string[] = [],
  mode: ToolPermissionContext['mode'] = 'default',
): ToolPermissionContext => ({
  mode,
  additionalWorkingDirectories: new Map(),
  alwaysAllowRules: allow.length ? { session: allow } : {},
  alwaysDenyRules: deny.length ? { session: deny } : {},
  alwaysAskRules: ask.length ? { session: ask } : {},
  isBypassPermissionsModeAvailable: false,
})

/** 假 sandbox 窗口（纯内存；placeholder 禁用态 = resetSandboxAccess）。 */
function injectSandbox(cfg: { enabled: boolean; autoAllow?: boolean }): void {
  setSandboxAccess({
    isSandboxingEnabled: () => cfg.enabled,
    isAutoAllowBashIfSandboxedEnabled: () => cfg.autoAllow ?? false,
    getFsWriteConfig: () => ({ allowOnly: [], denyWithinAllow: [] }),
  })
}

/** 带 checkPermissions 的 duck 工具（工具面分发半的假消费者）。 */
function duckTool(
  name: string,
  checkPermissions?: (
    input: Record<string, unknown>,
  ) => Promise<PermissionResult>,
): PermissionTool {
  return { name, checkPermissions }
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

describe('hasPermissionsToUseTool 规则支决策面（E-4 S-4b 翻新）', () => {
  test('空规则集 = allow（薄骨架默认兼容回归）', async () => {
    // context 无 getToolPermissionContext（未注入）= 空规则集 → 末端 allow
    const decision = await hasPermissionsToUseTool(
      readTool,
      { file_path: '/tmp/proj/a.txt' },
      {},
    )
    expect(decision.behavior).toBe('allow')
    expect(decision.decisionReason).toEqual({ type: 'mode', mode: 'default' })
  })

  test('forceDecision 非空 → 优先透传（规则支第一分支）', async () => {
    const forced: PermissionDecision = {
      behavior: 'deny',
      message: 'forced deny',
      decisionReason: { type: 'other', reason: 'forced' },
    }
    const decision = await hasPermissionsToUseTool(
      readTool,
      { file_path: '/tmp/proj/a.txt' },
      {},
      undefined,
      'tu1',
      forced,
    )
    expect(decision.behavior).toBe('deny')
    expect(decision).toBe(forced)
  })

  test('deny 规则命中 → deny（decisionReason rule + 固定拒绝消息）', async () => {
    const decision = await hasPermissionsToUseTool(
      { name: 'Bash' },
      { command: 'npm install' },
      { getToolPermissionContext: () => ruleContext(['Bash']) },
    )
    expect(decision.behavior).toBe('deny')
    expect((decision as { message: string }).message).toBe(
      'Permission to use Bash has been denied.',
    )
    expect(decision.decisionReason).toEqual({
      type: 'rule',
      rule: {
        source: 'session',
        ruleBehavior: 'deny',
        ruleValue: { toolName: 'Bash' },
      },
    })
  })

  test('ask 规则命中 → ask（默认请求消息 + rule 原因）', async () => {
    const decision = await hasPermissionsToUseTool(
      { name: 'Bash' },
      { command: 'ls' },
      { getToolPermissionContext: () => ruleContext([], ['Bash']) },
    )
    expect(decision.behavior).toBe('ask')
    expect(decision.decisionReason?.type).toBe('rule')
    expect((decision as { message: string }).message).toContain(
      'Atlas requested permissions to use Bash',
    )
  })

  test('allow tool-wide 规则命中 → allow（decisionReason rule 非 mode）', async () => {
    const decision = await hasPermissionsToUseTool(
      readTool,
      { file_path: '/tmp/proj/a.txt' },
      { getToolPermissionContext: () => ruleContext([], [], ['Read']) },
    )
    expect(decision.behavior).toBe('allow')
    expect(decision.decisionReason).toEqual({
      type: 'rule',
      rule: {
        source: 'session',
        ruleBehavior: 'allow',
        ruleValue: { toolName: 'Read' },
      },
    })
  })

  test('mcp__server 前缀规则拒该 server 全部工具（含 __* 通配）', async () => {
    const mcpTool: PermissionTool = {
      name: 'mcp__myserver__tool1',
      mcpInfo: { serverName: 'myserver', toolName: 'tool1' },
    }
    const denied = await hasPermissionsToUseTool(
      mcpTool,
      {},
      { getToolPermissionContext: () => ruleContext(['mcp__myserver']) },
    )
    expect(denied.behavior).toBe('deny')
    const wildcardDenied = await hasPermissionsToUseTool(
      mcpTool,
      {},
      { getToolPermissionContext: () => ruleContext(['mcp__myserver__*']) },
    )
    expect(wildcardDenied.behavior).toBe('deny')
    // 其他 server 不受该前缀规则影响（S-6b 后：无规则反对 → 3 落 ask
    // gate fail-closed，非 deny 即未误伤）
    const otherServer = await hasPermissionsToUseTool(
      {
        name: 'mcp__other__tool1',
        mcpInfo: { serverName: 'other', toolName: 'tool1' },
      },
      {},
      { getToolPermissionContext: () => ruleContext(['mcp__myserver']) },
    )
    expect(otherServer.behavior).toBe('ask')
  })

  test('优先级：deny 规则先于 allow 规则（deny 命中即拒）', async () => {
    const decision = await hasPermissionsToUseTool(
      { name: 'Bash' },
      { command: 'ls' },
      {
        getToolPermissionContext: () => ruleContext(['Bash'], [], ['Bash']),
      },
    )
    expect(decision.behavior).toBe('deny')
  })
})

describe('hasPermissionsToUseTool 工具面分发（E-6 S-6b，§8.43 判别信号）', () => {
  test('1c duck deny 透传（1d：工具自拒原样返回）', async () => {
    const decision = await hasPermissionsToUseTool(
      duckTool('Bash', async () => ({
        behavior: 'deny',
        message: 'tool self-denied',
        decisionReason: { type: 'other', reason: 'tool policy' },
      })),
      { command: 'ls' },
      { getToolPermissionContext: () => ruleContext() },
    )
    expect(decision.behavior).toBe('deny')
    expect((decision as { message: string }).message).toBe('tool self-denied')
  })

  test('1c 抛错吞没（logForDebugging 无副作用）→ 落 3 ask（完整上下文）', async () => {
    const decision = await hasPermissionsToUseTool(
      duckTool('Bash', () => {
        throw new Error('boom')
      }),
      { command: 'ls' },
      { getToolPermissionContext: () => ruleContext() },
    )
    expect(decision.behavior).toBe('ask')
  })

  test('1f 内容 ask（ruleBehavior===ask）bypass-immune（P-B1 探针锚点）', async () => {
    const decision = await hasPermissionsToUseTool(
      duckTool('Bash', async () => ({
        behavior: 'ask',
        message: 'content-specific ask',
        decisionReason: {
          type: 'rule',
          rule: {
            source: 'session',
            ruleBehavior: 'ask',
            ruleValue: { toolName: 'Bash' },
          },
        },
      })),
      { command: 'npm publish' },
      { getToolPermissionContext: () => ruleContext([], [], [], 'bypassPermissions') },
    )
    // bypass 态下仍 ask（1f 先于 2a）
    expect(decision.behavior).toBe('ask')
  })

  test('1g safetyCheck bypass-immune', async () => {
    const decision = await hasPermissionsToUseTool(
      duckTool('Write', async () => ({
        behavior: 'ask',
        message: 'safety',
        decisionReason: {
          type: 'safetyCheck',
          reason: 'dangerous path',
          classifierApprovable: false,
        },
      })),
      { file_path: '/tmp/proj/.gitconfig' },
      { getToolPermissionContext: () => ruleContext([], [], [], 'bypassPermissions') },
    )
    expect(decision.behavior).toBe('ask')
  })

  test('2a bypass 采纳 duck updatedInput（工具改写 input 优先）', async () => {
    const decision = await hasPermissionsToUseTool(
      duckTool('Bash', async () => ({
        behavior: 'allow',
        updatedInput: { command: 'rewritten' },
      })),
      { command: 'original' },
      { getToolPermissionContext: () => ruleContext([], [], [], 'bypassPermissions') },
    )
    expect(decision.behavior).toBe('allow')
    expect((decision as { updatedInput?: unknown }).updatedInput).toEqual({
      command: 'rewritten',
    })
    expect(decision.decisionReason).toEqual({
      type: 'mode',
      mode: 'bypassPermissions',
    })
  })

  test('2a 无 updatedInput 回落原 input（P-B2 探针锚点）', async () => {
    const decision = await hasPermissionsToUseTool(
      duckTool('Bash', async () => ({
        behavior: 'ask',
        message: 'ask other reason',
        decisionReason: { type: 'other', reason: 'x' },
      })),
      { command: 'original' },
      { getToolPermissionContext: () => ruleContext([], [], [], 'bypassPermissions') },
    )
    // ask（other 原因，1f/1g 不截）+ bypass → 2a allow + updatedInput 回落 input
    expect(decision.behavior).toBe('allow')
    expect((decision as { updatedInput?: unknown }).updatedInput).toEqual({
      command: 'original',
    })
  })

  test('2b allow 规则采纳 duck updatedInput', async () => {
    const decision = await hasPermissionsToUseTool(
      duckTool('Read', async () => ({
        behavior: 'allow',
        updatedInput: { file_path: '/rewritten' },
      })),
      { file_path: '/tmp/proj/a.txt' },
      { getToolPermissionContext: () => ruleContext([], [], ['Read']) },
    )
    expect(decision.behavior).toBe('allow')
    expect(decision.decisionReason).toEqual({
      type: 'rule',
      rule: { source: 'session', ruleBehavior: 'allow', ruleValue: { toolName: 'Read' } },
    })
    expect((decision as { updatedInput?: unknown }).updatedInput).toEqual({
      file_path: '/rewritten',
    })
  })

  test('⑥ 有效（sandbox 启用 + auto-allow）→ 1b 跳过落 3（ask 无 rule 原因，区别于 1b）', async () => {
    injectSandbox({ enabled: true, autoAllow: true })
    const decision = await hasPermissionsToUseTool(
      { name: 'Bash' },
      { command: 'ls' },
      { getToolPermissionContext: () => ruleContext([], ['Bash']) },
    )
    // ⑥ 跳过 1b → 1c 无 duck → passthrough → 3 ask（decisionReason 无 rule）
    expect(decision.behavior).toBe('ask')
    expect((decision as { decisionReason?: unknown }).decisionReason).toBeUndefined()
  })

  test('⑥ dangerouslyDisableSandbox=true 失活 → 1b rule ask', async () => {
    injectSandbox({ enabled: true, autoAllow: true })
    const decision = await hasPermissionsToUseTool(
      { name: 'Bash' },
      { command: 'ls', dangerouslyDisableSandbox: true },
      { getToolPermissionContext: () => ruleContext([], ['Bash']) },
    )
    expect(decision.behavior).toBe('ask')
    expect(decision.decisionReason).toEqual({
      type: 'rule',
      rule: { source: 'session', ruleBehavior: 'ask', ruleValue: { toolName: 'Bash' } },
    })
  })

  test('⑥ placeholder（sandbox 禁用）失活 → 1b rule ask', async () => {
    const decision = await hasPermissionsToUseTool(
      { name: 'Bash' },
      { command: 'ls' },
      { getToolPermissionContext: () => ruleContext([], ['Bash']) },
    )
    expect(decision.behavior).toBe('ask')
    expect(decision.decisionReason?.type).toBe('rule')
  })

  test('⑥ 有效 + bypass 态 → 2a allow（⑥ delta：无 ⑥ 则 1b rule ask）', async () => {
    injectSandbox({ enabled: true, autoAllow: true })
    const decision = await hasPermissionsToUseTool(
      { name: 'Bash' },
      { command: 'ls' },
      { getToolPermissionContext: () => ruleContext([], ['Bash'], [], 'bypassPermissions') },
    )
    expect(decision.behavior).toBe('allow')
    expect(decision.decisionReason).toEqual({
      type: 'mode',
      mode: 'bypassPermissions',
    })
  })

  test('完整上下文 + 无规则 + 无 duck → 3 落 ask（gate fail-closed，非薄骨架 allow）', async () => {
    const decision = await hasPermissionsToUseTool(
      { name: 'NoRuleTool' },
      { x: 1 },
      { getToolPermissionContext: () => ruleContext() },
    )
    expect(decision.behavior).toBe('ask')
    expect((decision as { decisionReason?: unknown }).decisionReason).toBeUndefined()
  })
})

describe('DANGEROUS 常量面', () => {
  test('DANGEROUS_FILES 含 .gitconfig / .mcp.json', () => {
    expect(DANGEROUS_FILES).toContain('.gitconfig')
    expect(DANGEROUS_FILES).toContain('.mcp.json')
  })

  test('DANGEROUS_DIRECTORIES 含 .git / .vscode', () => {
    expect(DANGEROUS_DIRECTORIES).toContain('.git')
    expect(DANGEROUS_DIRECTORIES).toContain('.vscode')
  })
})

describe('checkReadPermissionForTool 决策主面', () => {
  test('工具无 getPath → ask（无法定位路径）', () => {
    const decision = checkReadPermissionForTool(noPathTool, {}, makeContext())
    expect(decision.behavior).toBe('ask')
  })

  test('UNC 路径（\\\\server\\share）→ ask（纵深防御）', () => {
    const decision = checkReadPermissionForTool(
      readTool,
      { file_path: '\\\\server\\share\\f.txt' },
      makeContext(),
    )
    expect(decision.behavior).toBe('ask')
  })
})

describe('checkWritePermissionForTool 决策主面', () => {
  test('工具无 getPath → ask', () => {
    const decision = checkWritePermissionForTool(noPathTool, {}, makeContext())
    expect(decision.behavior).toBe('ask')
  })

  test('危险文件（.gitconfig）→ ask（safetyCheck，防误授保护文件）', () => {
    const decision = checkWritePermissionForTool(
      writeTool,
      { file_path: '/tmp/proj/.gitconfig' },
      makeContext(),
    )
    expect(decision.behavior).toBe('ask')
    const reason = (decision as { decisionReason?: { type: string } }).decisionReason
    expect(reason?.type).toBe('safetyCheck')
  })

  test('UNC 路径 → ask（纵深防御）', () => {
    const decision = checkWritePermissionForTool(
      writeTool,
      { file_path: '\\\\server\\share\\f.txt' },
      makeContext(),
    )
    expect(decision.behavior).toBe('ask')
  })
})
