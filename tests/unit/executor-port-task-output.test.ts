/**
 * TaskOutput 端口契约测试（C2 · 复审后 12 成员面）
 *
 * 契约断言：① fake 可结构赋值给端口 + 注入窗口 set/get 往返（契约可实现）
 * ② 未注入 get = fail-fast 抛错（非静默 no-op，H6 防腐）③ reset 复位未注入态。
 * fake 行为断言（I/O-free，unit 层零磁盘纪律）：④ 确定性路径 ⑤ pipe 模式
 * 缓冲语义（writeStdout/writeStderr/getStdout/getStderr）⑥ file 模式
 * getStderr = ''（stderr 并入输出文件，旧仓语义）。
 * file 模式真 I/O（tmpdir 读/删 + 真 spawn fd）属 tests/func/ 层，不在本文件。
 * 真语义（maxOutputLength 截断 / spill 溢写 / 磁盘落盘）归 C-Deep task 域实现。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  type TaskOutputPort,
  setTaskOutputPort,
  getTaskOutputPort,
  resetTaskOutputPort,
} from '../../src/executor'
import { FileTaskOutputFake } from '../fixtures/executor-port-fakes'

beforeEach(() => {
  resetTaskOutputPort()
})

describe('TaskOutputPort 契约', () => {
  test('① fake 结构可赋值给端口（契约可实现，编译期检查 + 注入往返）', () => {
    const fake = new FileTaskOutputFake('/fake/out')
    const port: TaskOutputPort = fake // 结构契约：fake ⊆ 端口 12 成员面
    setTaskOutputPort(port)
    expect(getTaskOutputPort()).toBe(fake)
  })

  test('② 未注入 getTaskOutputPort = fail-fast 抛错（防静默输出丢失）', () => {
    expect(() => getTaskOutputPort()).toThrow(/TaskOutputPort 未注入/)
  })

  test('③ reset 复位未注入态', () => {
    setTaskOutputPort(new FileTaskOutputFake('/fake/out'))
    resetTaskOutputPort()
    expect(() => getTaskOutputPort()).toThrow(/TaskOutputPort 未注入/)
  })

  test('④ createTaskOutput — 确定性路径（baseDir/taskId.out）+ 创建顺序记录', () => {
    const fake = new FileTaskOutputFake('/fake/out')
    setTaskOutputPort(fake)
    const h1 = getTaskOutputPort().createTaskOutput('t1', null, true)
    const h2 = getTaskOutputPort().createTaskOutput('t2', null, false)
    expect(h1.path).toBe('/fake/out/t1.out')
    expect(h2.path).toBe('/fake/out/t2.out')
    expect(h1.taskId).toBe('t1')
    expect(h1.stdoutToFile).toBe(true)
    expect(h2.stdoutToFile).toBe(false)
    expect(fake.createdTaskIds).toEqual(['t1', 't2'])
  })

  test('⑤ pipe 模式缓冲语义：writeStdout/writeStderr 累积 → getStdout/getStderr 读回', async () => {
    const fake = new FileTaskOutputFake('/fake/out')
    setTaskOutputPort(fake)
    const h = getTaskOutputPort().createTaskOutput('p1', null, false)
    h.writeStdout('hello ')
    h.writeStdout('world')
    h.writeStderr('err-line')
    expect(await h.getStdout()).toBe('hello world')
    expect(h.getStderr()).toBe('err-line')
    // 初始态 getter 缺省（未 getStdout 前）
    const h2 = getTaskOutputPort().createTaskOutput('p2', null, false)
    expect(h2.outputFileRedundant).toBe(false)
    expect(h2.outputFileSize).toBe(0)
  })

  test('⑥ file 模式 getStderr = ""（stderr 并入输出文件，旧仓语义）+ clear 计数', () => {
    const fake = new FileTaskOutputFake('/fake/out')
    setTaskOutputPort(fake)
    const h = getTaskOutputPort().createTaskOutput('f1', null, true)
    // file 模式不喂缓冲，getStderr 恒 ''
    expect(h.getStderr()).toBe('')
    expect(fake.clearCount('f1')).toBe(0)
    h.clear()
    h.clear()
    expect(fake.clearCount('f1')).toBe(2)
  })
})
