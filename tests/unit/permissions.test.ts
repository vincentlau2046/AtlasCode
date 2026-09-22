/**
 * permissions 域薄骨架 unit 测试（C-Deep 切片 3 T7 · 零磁盘）
 *
 * §8.16 T7 口径：checkRead/checkWrite 决策主面单测走注入 bootstrap env
 *（getOriginalCwd + getCwd），零磁盘（假 tool.getPath 返固定串，不触 fs——
 * 轻量 getPathsForPermissionCheck 对不存在路径 realpath 失败回落原路径，不 syscall）。
 * func 真盘面（getProjectTempDir / getAtlasTempDir realpath 链 + 真路径单级
 * realpath）归 tests/func/permissions-real-fs.test.ts。
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

describe('hasPermissionsToUseTool no-op-allow 起步', () => {
  test('默认恒 allow（default 模式）', async () => {
    const decision = await hasPermissionsToUseTool(
      readTool,
      { file_path: '/tmp/proj/a.txt' },
      {},
    )
    expect(decision.behavior).toBe('allow')
    expect(decision.decisionReason).toEqual({ type: 'mode', mode: 'default' })
  })

  test('forceDecision 非空 → 优先透传（薄骨架唯一分支）', async () => {
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
