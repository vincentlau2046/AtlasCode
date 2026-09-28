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
import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import {
  setOriginalCwd,
  getOriginalCwd,
  setCwdState,
  getCwdState,
  runWithCwdOverride,
  pwd,
  resetStateForTests,
  setTranscriptDir,
  getTranscriptPathForSession,
  setMainThreadAgentType,
  getMainThreadAgentType,
  setTrustAccepted,
  hasTrustAccepted,
  resetHooksBootstrapMembersForTests,
} from '../../src/bootstrap'

// bootstrap cwd 面存还对称复位（单进程连跑：测试戳 '/orig' 不泄漏后序文件）
const savedOriginalCwd = getOriginalCwd()
const savedCwdState = getCwdState()

afterAll(() => {
  setOriginalCwd(savedOriginalCwd)
  setCwdState(savedCwdState)
})

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

/**
 * ⑤ hooks bootstrap 3 成员（E-5 S-5a，§8.38 C-5 三层断补齐）：
 * transcript path 窄适配（只产路径零 I/O）/ agent type 缺省 undefined /
 * trust 缺省 true（headless 信任隐式）。前向接缝登记见 state.ts 头注 ⑤。
 */
describe('⑤ hooks bootstrap 3 成员（E-5 S-5a）', () => {
  beforeEach(() => {
    resetHooksBootstrapMembersForTests()
  })

  test('getTranscriptPathForSession：setTranscriptDir 覆写 → <dir>/<id>.jsonl', () => {
    setTranscriptDir('/tmp/sessions')
    expect(getTranscriptPathForSession('sess-1')).toBe('/tmp/sessions/sess-1.jsonl')
  })

  test('getTranscriptPathForSession：缺省 = ATLAS_CONFIG_DIR（configRoot 两级序第 1 级）', () => {
    const old = process.env.ATLAS_CONFIG_DIR
    process.env.ATLAS_CONFIG_DIR = '/custom-config-root'
    try {
      expect(getTranscriptPathForSession('sess-2')).toBe('/custom-config-root/sessions/sess-2.jsonl')
    } finally {
      if (old === undefined) delete process.env.ATLAS_CONFIG_DIR
      else process.env.ATLAS_CONFIG_DIR = old
    }
  })

  test('getTranscriptPathForSession：覆写优先于 env（两级序 = 接缝优先）', () => {
    process.env.ATLAS_CONFIG_DIR = '/custom-config-root'
    setTranscriptDir('/override-dir')
    expect(getTranscriptPathForSession('sess-3')).toBe('/override-dir/sess-3.jsonl')
    delete process.env.ATLAS_CONFIG_DIR
  })

  test('getMainThreadAgentType：缺省 undefined（--agent 标志 = CLI 面残留守）', () => {
    expect(getMainThreadAgentType()).toBeUndefined()
    setMainThreadAgentType('ascend-fde')
    expect(getMainThreadAgentType()).toBe('ascend-fde')
    setMainThreadAgentType(undefined)
    expect(getMainThreadAgentType()).toBeUndefined()
  })

  test('hasTrustAccepted：缺省 true（headless 信任隐式）+ setter', () => {
    expect(hasTrustAccepted()).toBe(true)
    setTrustAccepted(false)
    expect(hasTrustAccepted()).toBe(false)
  })
})
