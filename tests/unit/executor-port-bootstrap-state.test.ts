/**
 * BootstrapState 端口契约测试（C2）
 *
 * 契约断言：① fake 可结构赋值给端口 + 注入窗口 set/get 往返
 * ② 未注入 get = fail-fast 抛错（静默 no-op 的 setCwdState 会让 cwd 追踪无声失效）
 * ③ reset 复位未注入态。
 * fake 行为断言：④ originalCwd 固定 vs cwdState 可变（旧仓两状态分离语义）
 * ⑤ setCwdState 生效 + getCwd 反映当前 cwdState（旧仓 pwd() 无覆盖路径；
 * ALS 并发覆盖层归 engine 域，不进本端口）。
 * 无网络/无真实磁盘/无 PTY。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  type BootstrapStatePort,
  setBootstrapStatePort,
  getBootstrapStatePort,
  resetBootstrapStatePort,
} from '../../src/executor'
import { createFakeBootstrapState } from '../fixtures/executor-port-fakes'

beforeEach(() => {
  resetBootstrapStatePort()
})

describe('BootstrapStatePort 契约', () => {
  test('① fake 结构可赋值给端口（契约可实现，编译期检查 + 注入往返）', () => {
    const { port } = createFakeBootstrapState('/fake/orig')
    const typed: BootstrapStatePort = port // 结构契约
    setBootstrapStatePort(typed)
    expect(getBootstrapStatePort()).toBe(port)
  })

  test('② 未注入 getBootstrapStatePort = fail-fast 抛错', () => {
    expect(() => getBootstrapStatePort()).toThrow(/BootstrapStatePort 未注入/)
  })

  test('③ reset 复位未注入态', () => {
    const { port } = createFakeBootstrapState()
    setBootstrapStatePort(port)
    resetBootstrapStatePort()
    expect(() => getBootstrapStatePort()).toThrow(/BootstrapStatePort 未注入/)
  })

  test('④ originalCwd 固定 vs cwdState 可变（旧仓 _originalCwd/_cwdState 两状态分离）', () => {
    const fake = createFakeBootstrapState('/fake/orig')
    setBootstrapStatePort(fake.port)
    getBootstrapStatePort().setCwdState('/fake/new')
    // setCwdState 只动 _cwdState，不动 _originalCwd（回退目标恒为启动 cwd）
    expect(getBootstrapStatePort().getOriginalCwd()).toBe('/fake/orig')
    expect(fake.getCwdState()).toBe('/fake/new')
  })

  test('⑤ setCwdState 多次调用 = 最后写入生效 + getCwd 反映当前 cwdState', () => {
    const fake = createFakeBootstrapState('/fake/orig')
    setBootstrapStatePort(fake.port)
    // getCwd 初值 = 初始 cwdState（旧仓 pwd() 无覆盖路径）
    expect(getBootstrapStatePort().getCwd()).toBe('/fake/orig')
    getBootstrapStatePort().setCwdState('/a')
    getBootstrapStatePort().setCwdState('/b')
    expect(fake.getCwdState()).toBe('/b')
    expect(getBootstrapStatePort().getCwd()).toBe('/b')
  })
})
