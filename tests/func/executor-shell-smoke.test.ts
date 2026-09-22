/**
 * executor 纵切功能 smoke（C-Deep 切片 1 · tests/func/ 层）
 *
 * §8.7 port 边界规则验真：**port 之上可 fake**（3 port 注入 C2 fakes），
 * **port 之下全真**——真 spawn /bin/bash、真文件 I/O（tmpdir）。
 * 防"fake 到底"的空洞等价（H6）：本文件绿 = 迁移链真能执行一条命令。
 *
 * 断言：① 真 spawn echo hi（file 模式：输出真落盘 fake 路径再读回）
 * ② pipe 模式 onStdout chunk 回调 ③ 非零退出码 → ExecError(NON_ZERO)
 * ④ cd 命令后 cwd 跟踪真更新 bootstrap cwdState（经 pwd -P 文件链）
 * ⑤ sandbox 禁用态：wrap/cleanup 零调用（fake 可观测，非假绿）
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  execShell,
  ShellExecutor,
  setBootstrapStatePort,
  resetBootstrapStatePort,
  setExecutorSandboxPort,
  resetExecutorSandboxPort,
  setTaskOutputPort,
  resetTaskOutputPort,
} from '../../src/executor'
import {
  createFakeBootstrapState,
  FakeExecutorSandbox,
  FileTaskOutputFake,
} from '../fixtures/executor-port-fakes'

let outDir: string
let sandboxFake: FakeExecutorSandbox
let bootstrap: ReturnType<typeof createFakeBootstrapState>

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'atlascode-func-'))
  const taskFake = new FileTaskOutputFake(outDir)
  setTaskOutputPort(taskFake)
  bootstrap = createFakeBootstrapState(process.cwd())
  setBootstrapStatePort(bootstrap.port)
  sandboxFake = new FakeExecutorSandbox()
  sandboxFake.sandboxingEnabled = false
  setExecutorSandboxPort(sandboxFake)
})

afterEach(() => {
  resetTaskOutputPort()
  resetBootstrapStatePort()
  resetExecutorSandboxPort()
  rmSync(outDir, { recursive: true, force: true })
})

describe('executor 纵切功能 smoke（真 spawn）', () => {
  test('① 真 spawn：exec("echo", ["hi"]) → stdout "hi"（file 模式真落盘读回）', async () => {
    const executor = new ShellExecutor()
    const r = await executor.exec('echo', ['hi'])
    expect(r.ok).toBe(true)
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe('hi')
    expect(r.timedOut).toBe(false)
  })

  test('② pipe 模式：onStdout 逐 chunk 回调 + result.stdout 一致', async () => {
    const chunks: string[] = []
    const cmd = await execShell('echo hi', new AbortController().signal, {
      onStdout: chunk => {
        chunks.push(chunk)
      },
    })
    const r = await cmd.result
    expect(r.code).toBe(0)
    expect(chunks.join('').trim()).toBe('hi')
    expect(r.stdout.trim()).toBe('hi')
  })

  test('③ 非零退出码 → ExecError(NON_ZERO, code 3)', async () => {
    const executor = new ShellExecutor()
    // 注意 argv 拼接：exec('bash', ['-c', 'exit 3']) 会拼成 "bash -c exit 3"
    // （"3" 沦为 $0，实际执行 exit → 码 0）。直接 exec('exit 3') 才命中非零路径。
    let caught: unknown
    try {
      await executor.exec('exit 3', [])
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
    const err = caught as { code: string; message: string }
    expect(err.code).toBe('NON_ZERO')
    expect(err.message).toContain('exit 3')
  })

  test('④ cd 后 cwd 跟踪：bootstrap cwdState 真更新到目标目录物理路径', async () => {
    const target = mkdtempSync(join(tmpdir(), 'atlascode-cwd-'))
    try {
      const cmd = await execShell(`cd ${target}`, new AbortController().signal, {})
      await cmd.result
      // pwd -P 文件链：命令内 cd → pwd -P 落文件 → 读回 → setCwdState（realpath）
      expect(bootstrap.getCwdState()).toBe(target)
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })

  test('⑤ sandbox 禁用态：wrapWithSandbox/cleanupAfterCommand 零调用', async () => {
    const executor = new ShellExecutor()
    await executor.exec('echo', ['no-sandbox'])
    expect(sandboxFake.wrappedCommands).toEqual([])
    expect(sandboxFake.cleanups).toBe(0)
  })
})
