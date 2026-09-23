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
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  setPermissionsBootstrapEnv,
  resetPermissionsBootstrapEnv,
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

beforeEach(() => {
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => '/tmp/proj',
    getCwd: () => '/tmp/proj',
  })
})
afterEach(() => {
  resetPermissionsBootstrapEnv()
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
    // 其他 server 不受该前缀规则影响
    const otherServer = await hasPermissionsToUseTool(
      {
        name: 'mcp__other__tool1',
        mcpInfo: { serverName: 'other', toolName: 'tool1' },
      },
      {},
      { getToolPermissionContext: () => ruleContext(['mcp__myserver']) },
    )
    expect(otherServer.behavior).toBe('allow')
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
