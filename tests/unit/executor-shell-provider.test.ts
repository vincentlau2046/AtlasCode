/**
 * shellProvider 契约测试（C-Deep 切片 1 · bash-only 裁剪版）
 *
 * 断言：① 命令串组装 = `${command} && pwd -P >| <cwd>`（cwd 尾句双引号包裹）
 * ② cwd 文件路径分流（sandbox → sandboxTmpDir/cwd-<id>；非沙箱 → tmpdir()/atlas-<id>-cwd）
 * ③ getSpawnArgs = ['-c', commandString]（无 -l，snapshot 归残余）
 * ④ getEnvironmentOverrides 恒空（残余②③⑦）⑤ 特殊字符路径的引号转义
 * 无网络/无真实磁盘（tmpdir() 仅取路径不 I/O）/无 PTY。
 */
import { describe, test, expect } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createBashShellProvider,
  DEFAULT_HOOK_SHELL,
  SHELL_TYPES,
  type ShellProvider,
} from '../../src/executor/shell/shellProvider'

const provider: ShellProvider = createBashShellProvider('/bin/bash')

describe('bash provider（裁剪版）', () => {
  test('① 命令串 = command && pwd -P 尾句（cwd 双引号包裹）', async () => {
    const { commandString } = await provider.buildExecCommand('echo hi', {
      id: 42,
      useSandbox: false,
    })
    expect(commandString.startsWith('echo hi && pwd -P >| "')).toBe(true)
    expect(commandString.endsWith('"')).toBe(true)
  })

  test('② cwd 文件路径分流：sandbox → sandboxTmpDir/cwd-<id>，非沙箱 → tmpdir()/atlas-<id>-cwd', async () => {
    const sandbox = await provider.buildExecCommand('cmd', {
      id: 'x1',
      sandboxTmpDir: '/sbx/tmp',
      useSandbox: true,
    })
    expect(sandbox.cwdFilePath).toBe(join('/sbx/tmp', 'cwd-x1'))

    const plain = await provider.buildExecCommand('cmd', {
      id: 7,
      useSandbox: false,
    })
    expect(plain.cwdFilePath).toBe(join(tmpdir(), 'atlas-7-cwd'))
  })

  test('③ getSpawnArgs = [-c, commandString]（无 -l）', () => {
    expect(provider.getSpawnArgs('echo 1')).toEqual(['-c', 'echo 1'])
  })

  test('④ getEnvironmentOverrides 恒空对象', async () => {
    await expect(provider.getEnvironmentOverrides('any')).resolves.toEqual({})
  })

  test('⑤ 特殊字符路径引号转义（$ " ` \\ 均被转义）', async () => {
    const { commandString } = await provider.buildExecCommand('cmd', {
      id: 'we"ird$`\\path',
      useSandbox: false,
    })
    // 路径中的 " $ ` \ 全部带反斜杠
    expect(commandString).toContain('\\"')
    expect(commandString).toContain('\\$')
    expect(commandString).toContain('\\`')
  })

  test('⑥ 常量面：SHELL_TYPES 含 bash/powershell（后者 provider 未实现归残余）+ DEFAULT_HOOK_SHELL=bash', () => {
    expect(SHELL_TYPES).toEqual(['bash', 'powershell'])
    expect(DEFAULT_HOOK_SHELL).toBe('bash')
    expect(provider.type).toBe('bash')
    expect(provider.shellPath).toBe('/bin/bash')
    expect(provider.detached).toBe(true)
  })
})
