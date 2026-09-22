/**
 * TaskOutput 端口契约测试（C2）
 *
 * 契约断言：① fake 可结构赋值给端口 + 注入窗口 set/get 往返（契约可实现）
 * ② 未注入 get = fail-fast 抛错（非静默 no-op，H6 防腐）③ reset 复位未注入态。
 * fake 行为断言：④ 确定性路径 ⑤ clear 计数——fake 责任非端口语义，真语义归
 * C-Deep task 域实现。无网络/无真实磁盘/无 PTY。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  type TaskOutputPort,
  setTaskOutputPort,
  getTaskOutputPort,
  resetTaskOutputPort,
} from '../../src/executor'
import { InMemoryTaskOutputFake } from '../fixtures/executor-port-fakes'

beforeEach(() => {
  resetTaskOutputPort()
})

describe('TaskOutputPort 契约', () => {
  test('① fake 结构可赋值给端口（契约可实现，编译期检查 + 注入往返）', () => {
    const fake = new InMemoryTaskOutputFake()
    const port: TaskOutputPort = fake // 结构契约：fake ⊆ 端口面
    setTaskOutputPort(port)
    expect(getTaskOutputPort()).toBe(fake)
  })

  test('② 未注入 getTaskOutputPort = fail-fast 抛错（防静默输出丢失）', () => {
    expect(() => getTaskOutputPort()).toThrow(/TaskOutputPort 未注入/)
  })

  test('③ reset 复位未注入态', () => {
    setTaskOutputPort(new InMemoryTaskOutputFake())
    resetTaskOutputPort()
    expect(() => getTaskOutputPort()).toThrow(/TaskOutputPort 未注入/)
  })

  test('④ createTaskOutput — 确定性路径（taskId 派生）+ 创建顺序记录', () => {
    const fake = new InMemoryTaskOutputFake()
    setTaskOutputPort(fake)
    const h1 = getTaskOutputPort().createTaskOutput('t1', null, true)
    const h2 = getTaskOutputPort().createTaskOutput('t2', null, false)
    expect(h1.path).toBe('/fake/tasks/t1.out')
    expect(h2.path).toBe('/fake/tasks/t2.out')
    expect(fake.createdTaskIds).toEqual(['t1', 't2'])
  })

  test('⑤ clear 幂等可重复调用 + 计数可观测（fake 行为，非端口语义）', () => {
    const fake = new InMemoryTaskOutputFake()
    setTaskOutputPort(fake)
    const handle = getTaskOutputPort().createTaskOutput('t1', null)
    expect(fake.clearCount('t1')).toBe(0)
    handle.clear()
    handle.clear()
    expect(fake.clearCount('t1')).toBe(2)
    // 未创建的 taskId 计数为 0（Map 缺省语义）
    expect(fake.clearCount('t-unknown')).toBe(0)
  })
})
