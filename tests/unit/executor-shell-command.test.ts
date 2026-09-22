/**
 * ShellCommand 契约测试（C-Deep 切片 1 · 裁剪版）
 *
 * 用 fake ChildProcess（EventEmitter + pid 缺省）验 exit 码映射与生命周期，
 * TaskOutput 经 C2 端口注入 FileTaskOutputFake（unit 层零磁盘：
 * file 模式 handle 指向不存在路径，fake 的 existsSync 容错 → 无真 I/O）。
 * 真 spawn 行为（fd 落盘/超时杀组）属 tests/func/ 层。
 *
 * 断言：① aborted 默认 145 / 自定义 126 ② failed 1 + preSpawnError
 * ③ exit 码透传（0/3）④ null 映射（SIGTERM→144 / 无信号→1）
 * ⑤ 超时 → 143 + 超时文案 ⑥ SIGKILL=137 interrupted
 * ⑦ abort reason==='interrupt' 不杀 ⑧ background 状态机 + pipe 缓冲
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import { EventEmitter } from 'events'
import { Readable } from 'stream'
import {
  createAbortedCommand,
  createFailedCommand,
  generateLocalTaskId,
  wrapSpawn,
  type ShellCommand,
} from '../../src/executor/shell/ShellCommand'
import {
  getTaskOutputPort,
  resetTaskOutputPort,
  setTaskOutputPort,
} from '../../src/executor'
import { FileTaskOutputFake } from '../fixtures/executor-port-fakes'

/** fake ChildProcess：file 模式（stdout/stderr 均 null，pid 缺省 → kill 空操作） */
function fakeChildProcess(opts?: {
  stdout?: Readable | null
  stderr?: Readable | null
  pid?: number
}): { cp: Parameters<typeof wrapSpawn>[0]; emit: (ev: string, ...a: unknown[]) => void } {
  const base = new EventEmitter() as EventEmitter & {
    pid?: number
    stdout: Readable | null
    stderr: Readable | null
  }
  base.stdout = opts?.stdout ?? null
  base.stderr = opts?.stderr ?? null
  if (opts?.pid !== undefined) base.pid = opts.pid
  return { cp: base as never, emit: (ev, ...a) => base.emit(ev, ...a) }
}

let fake: FileTaskOutputFake

beforeEach(() => {
  resetTaskOutputPort()
  fake = new FileTaskOutputFake('/fake/out')
  setTaskOutputPort(fake)
})

describe('ShellCommand 裁剪版', () => {
  test('① createAbortedCommand 默认：code 145 + interrupted + 端口创建 taskOutput', () => {
    const cmd = createAbortedCommand()
    expect(cmd.status).toBe('killed')
    expect(cmd.taskOutput.stdoutToFile).toBe(false)
    expect(fake.createdTaskIds).toHaveLength(1)
    const r = cmd.result
    return expect(r).resolves.toMatchObject({
      code: 145,
      interrupted: true,
      stderr: 'Command aborted before execution',
    })
  })

  test('①b createAbortedCommand 自定义 code/stderr（Shell.ts spawn 失败路径）', async () => {
    const cmd = createAbortedCommand('bg1', { stderr: 'spawn failed: ENOENT', code: 126 })
    const r = await cmd.result
    expect(r.code).toBe(126)
    expect(r.stderr).toBe('spawn failed: ENOENT')
    expect(r.backgroundTaskId).toBe('bg1')
  })

  test('② createFailedCommand：code 1 + preSpawnError 双字段', async () => {
    const cmd = createFailedCommand('cwd 不存在: /gone')
    expect(cmd.status).toBe('completed')
    const r = await cmd.result
    expect(r.code).toBe(1)
    expect(r.interrupted).toBe(false)
    expect(r.preSpawnError).toBe('cwd 不存在: /gone')
    expect(r.stderr).toBe('cwd 不存在: /gone')
  })

  test('③ exit 码透传（file 模式，stdout/stderr 无 wrapper）', async () => {
    const { cp, emit } = fakeChildProcess()
    const cmd = wrapSpawn(cp, new AbortController().signal, 60_000, getTaskOutputPort().createTaskOutput('t1', null, true))
    emit('exit', 0, null)
    await expect(cmd.result).resolves.toMatchObject({ code: 0, stdout: '', stderr: '' })
    expect(cmd.status).toBe('completed')
  })

  test('③b pipe 模式：StreamWrapper 缓冲 stdout/stderr → result 读回', async () => {
    const { cp, emit } = fakeChildProcess({
      stdout: Readable.from(['hello ']),
      stderr: Readable.from(['oops']),
    })
    const handle = getTaskOutputPort().createTaskOutput('p1', null, false)
    const cmd = wrapSpawn(cp, new AbortController().signal, 60_000, handle)
    await new Promise(r => setTimeout(r, 20)) // 等流冲刷
    emit('exit', 3, null)
    const r = await cmd.result
    expect(r.code).toBe(3)
    expect(r.stdout).toBe('hello ')
    expect(r.stderr).toBe('oops')
  })

  test('④ exit null 映射：SIGTERM→144 / 无信号→1（旧仓口径）', async () => {
    const a = fakeChildProcess()
    const ca = wrapSpawn(a.cp, new AbortController().signal, 60_000, getTaskOutputPort().createTaskOutput('a', null))
    a.emit('exit', null, 'SIGTERM')
    expect((await ca.result).code).toBe(144)

    const b = fakeChildProcess()
    const cb = wrapSpawn(b.cp, new AbortController().signal, 60_000, getTaskOutputPort().createTaskOutput('b', null))
    b.emit('exit', null, null)
    expect((await cb.result).code).toBe(1)
  })

  test('⑤ 超时 → 143 + "Command timed out after" 文案', async () => {
    const { cp } = fakeChildProcess()
    const cmd = wrapSpawn(cp, new AbortController().signal, 10, getTaskOutputPort().createTaskOutput('tmo', null))
    await new Promise(r => setTimeout(r, 60))
    expect(cmd.status).toBe('killed')
    const r = await cmd.result
    expect(r.code).toBe(143)
    expect(r.stderr).toContain('Command timed out after')
  })

  test('⑥ kill → 137 interrupted=true（pid 缺省不炸）', async () => {
    const { cp } = fakeChildProcess()
    const cmd = wrapSpawn(cp, new AbortController().signal, 60_000, getTaskOutputPort().createTaskOutput('k', null))
    cmd.kill()
    const r = await cmd.result
    expect(r.code).toBe(137)
    expect(r.interrupted).toBe(true)
    expect(cmd.status).toBe('killed')
  })

  test('⑦ abort reason==="interrupt" 不杀（让调用方后台化）；其他 reason 杀', async () => {
    const c1 = new AbortController()
    const { cp: cp1 } = fakeChildProcess()
    const cmd1 = wrapSpawn(cp1, c1.signal, 60_000, getTaskOutputPort().createTaskOutput('i', null))
    c1.abort('interrupt')
    expect(cmd1.status).toBe('running') // 未 kill

    const c2 = new AbortController()
    const { cp: cp2 } = fakeChildProcess()
    const cmd2 = wrapSpawn(cp2, c2.signal, 60_000, getTaskOutputPort().createTaskOutput('i2', null))
    c2.abort('user-stop')
    const r = await cmd2.result
    expect(r.code).toBe(137)
  })

  test('⑧ background 状态机：running→backgrounded 一次生效，pipe 模式 spill 调用', () => {
    const { cp } = fakeChildProcess({ stdout: Readable.from([]) })
    const handle = getTaskOutputPort().createTaskOutput('bg', null, false)
    const cmd: ShellCommand = wrapSpawn(cp, new AbortController().signal, 60_000, handle)
    expect(cmd.background('task-1')).toBe(true)
    expect(cmd.status).toBe('backgrounded')
    expect(cmd.background('task-2')).toBe(false) // 非 running 拒
    expect(cmd.taskOutput.taskId).toBe('bg')
  })

  test('⑨ generateLocalTaskId：b 前缀 + 8 位 base36（旧仓 Task.ts 同算法）', () => {
    const id = generateLocalTaskId()
    expect(id).toMatch(/^b[0-9a-z]{8}$/)
    expect(generateLocalTaskId()).not.toBe(id)
  })
})
