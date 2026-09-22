/**
 * bootstrap 域 unit 测试（C-Deep 切片 3 T7/T8 · 零磁盘）
 *
 * H6⑤ bootstrap cwd 两状态分离（纯状态 + ALS 覆盖层，无 fs → unit 层）：
 *  - originalCwd（进程启动 cwd，不可变语义）vs cwdState（当前 cwd，可变）两状态独立
 *  - cwd.ts ALS 覆盖层 runWithCwdOverride：并发 agent 各见自己 cwd 互不影响
 *
 * 从 tests/func/task-real-fs.test.ts 迁出（该块无真盘 I/O，归 unit 层；
 * T8 能力矩阵 bootstrap 域行需 domain↔proof 对应，故单列本文件）。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  setOriginalCwd,
  getOriginalCwd,
  setCwdState,
  getCwdState,
  runWithCwdOverride,
  pwd,
  resetStateForTests,
} from '../../src/bootstrap'

describe('H6⑤ bootstrap cwd 两状态分离', () => {
  beforeEach(() => {
    resetStateForTests()
  })

  test('originalCwd（不可变语义）与 cwdState（可变）两状态独立', () => {
    setOriginalCwd('/orig')
    setCwdState('/cur')
    expect(getOriginalCwd()).toBe('/orig')
    expect(getCwdState()).toBe('/cur')
    // 变 cwdState 不影响 originalCwd（两状态分离）
    setCwdState('/cur2')
    expect(getOriginalCwd()).toBe('/orig')
    expect(getCwdState()).toBe('/cur2')
  })

  test('ALS 覆盖层：runWithCwdOverride 内 pwd() 见覆盖值，出作用域回落 cwdState', () => {
    setCwdState('/base')
    expect(pwd()).toBe('/base')
    const seen = runWithCwdOverride('/override', () => pwd())
    expect(seen).toBe('/override')
    expect(pwd()).toBe('/base') // 出作用域回落
  })
})
