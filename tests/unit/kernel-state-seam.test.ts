/**
 * 0.1.106 S3b 切片 1 判别单测 —— bootstrapState 缝化判据格 2 + 4b
 * （工单 docs/2026-11-13-p0-wave-01106-s3b-ticket.md §3；lock-face
 * docs/2026-11-13-01106-s3b-lockface-main.md 必答①②④）。
 *
 * 格 2 三态判形完备：
 *   - 缝接口名集（KernelBootstrapStatePort 28 成员 + NoopSeam 4 成员）
 *     ∩ 分歧名集 = ∅（分歧 3 名禁入缝，负断言）
 *   - kernel/state 零 tui import（含 type 边）
 * 格 4b fail-fast 负断言：
 *   - 真状态未注入 = getKernelBootstrapState() 显式抛错
 *   - no-op 缝未注入 = 缺省空实现合法（调用不抛、无副作用）
 *   - 注入 round-trip + 组合根注入点在场（tui/factory + atlascode/compose）
 * I/O 面：只读 src（同 S3a 判据格范型）→ unit 层。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  getKernelBootstrapState,
  getKernelBootstrapNoopSeam,
  setKernelBootstrapState,
  setKernelBootstrapNoopSeam,
  resetKernelBootstrapStateForTests,
} from '../../src/kernel/state/injection.js'
import type {
  KernelBootstrapStatePort,
  KernelBootstrapNoopSeam,
} from '../../src/kernel/state/ports.js'

const REPO = join(import.meta.dir, '..', '..')
const STATE_DIR = join(REPO, 'src', 'kernel', 'state')

/** 分歧 3 名（S3a 护栏锁定；lock-face 必答① 判形表 no-op(恒定形)·分歧）。 */
const DIVERGENT = new Set([
  'getAllowedSettingSources',
  'getFlagSettingsPath',
  'setAllowedSettingSources',
])

/** 真状态 28 函数名（lock-face 必答①；与 ports.ts 接口成员一一对应）。 */
const REAL_STATE_28 = [
  'addInvokedSkill',
  'clearInvokedSkillsForAgent',
  'getInvokedSkillsForAgent',
  'flushInteractionTime',
  'getLastInteractionTime',
  'updateLastInteractionTime',
  'getActiveTimeCounter',
  'getAgentColorMap',
  'getLocCounter',
  'getInitialMainLoopModel',
  'getMainLoopModelOverride',
  'setMainLoopModelOverride',
  'getIsRemoteMode',
  'setIsRemoteMode',
  'getTurnClassifierCount',
  'getTurnClassifierDurationMs',
  'getTurnHookCount',
  'getTurnHookDurationMs',
  'getTurnToolCount',
  'getTurnToolDurationMs',
  'resetTurnClassifierDuration',
  'resetTurnHookDuration',
  'resetTurnToolDuration',
  'addToTurnHookDuration',
  'addToTurnClassifierDuration',
  'clearSystemPromptSectionState',
  'getSystemPromptSectionCache',
  'setSystemPromptSectionCacheEntry',
] as const

/** 首车缝消费 no-op 4 名（log.ts×2 / slowOperations / gitFilesystem）。 */
const NOOP_SEAM_4 = [
  'addSlowOperation',
  'waitForScrollIdle',
  'setLastAPIRequest',
  'setLastAPIRequestMessages',
] as const

function portSource(): string {
  return readFileSync(join(STATE_DIR, 'ports.ts'), 'utf8')
}

describe('S3b 切片 1 格 2：三态判形完备 + 负断言', () => {
  test('① KernelBootstrapStatePort 成员 = 真状态 28 名恰合', () => {
    const src = portSource()
    const iface = src.slice(
      src.indexOf('export interface KernelBootstrapStatePort'),
      src.indexOf('export interface KernelBootstrapNoopSeam'),
    )
    const members = [...iface.matchAll(/^\s{2}(\w+)\(/gm)].map(m => m[1])
    expect(members.sort()).toEqual([...REAL_STATE_28].sort())
  })

  test('② KernelBootstrapNoopSeam 成员 = 首车缝消费 4 名恰合', () => {
    const src = portSource()
    const iface = src.slice(
      src.indexOf('export interface KernelBootstrapNoopSeam'),
    )
    const members = [...iface.matchAll(/^\s{2}(\w+)\(/gm)].map(m => m[1])
    expect(members.sort()).toEqual([...NOOP_SEAM_4].sort())
  })

  test('③ 缝接口名集 ∩ 分歧名集 = ∅（分歧禁入缝负断言）', () => {
    const seamNames = new Set([...REAL_STATE_28, ...NOOP_SEAM_4])
    for (const d of DIVERGENT) {
      expect(seamNames.has(d)).toBe(false)
    }
  })

  test('④ kernel/state 零 tui import（static/type/export-from 全边）', () => {
    const files: string[] = []
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(p)
      }
    }
    walk(STATE_DIR)
    expect(files.length).toBeGreaterThanOrEqual(2)
    const escapes: string[] = []
    for (const f of files) {
      const txt = readFileSync(f, 'utf8')
      for (const m of txt.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1]
        const resolved = spec.startsWith('.')
          ? spec // 相对边 — kernel/state 内只允许指向 kernel 树
          : spec
        if (/(^|\/)tui\//.test(resolved) || resolved.includes('/tui/')) {
          escapes.push(`${f} → ${spec}`)
        }
      }
    }
    expect(escapes).toEqual([])
  })
})

describe('S3b 切片 1 格 4b：fail-fast / 缺省语义（两态相反）', () => {
  beforeEach(() => {
    resetKernelBootstrapStateForTests()
  })

  test('① 真状态未注入 = 显式抛错', () => {
    expect(() => getKernelBootstrapState()).toThrow(/未注入/)
  })

  test('② no-op 缝未注入 = 缺省空实现合法（不抛、无副作用）', () => {
    const seam = getKernelBootstrapNoopSeam()
    expect(() => {
      seam.addSlowOperation()
      seam.waitForScrollIdle()
      seam.setLastAPIRequest()
      seam.setLastAPIRequestMessages()
    }).not.toThrow()
  })

  test('③ 注入 round-trip：真状态读取门返回同一 port', () => {
    const port = { marker: 'test' } as unknown as KernelBootstrapStatePort
    setKernelBootstrapState(port)
    expect(getKernelBootstrapState()).toBe(port)
    const seam = { marker: 'seam' } as unknown as KernelBootstrapNoopSeam
    setKernelBootstrapNoopSeam(seam)
    expect(getKernelBootstrapNoopSeam()).toBe(seam)
  })

  test('④ 组合根注入点在场（三 lane 拓扑 lane ①②，格 4a 静态面）', () => {
    const factory = readFileSync(join(REPO, 'src/tui/factory.ts'), 'utf8')
    expect(factory).toContain('setKernelBootstrapState(createKernelBootstrapStatePort())')
    const compose = readFileSync(join(REPO, 'src/atlascode/compose.ts'), 'utf8')
    expect(compose).toContain('setKernelBootstrapState(createKernelBootstrapStatePort())')
    // 适配器真实现包装 bootstrapState（零行为变更单源）
    const adapter = readFileSync(
      join(REPO, 'src/tui/bootstrapStatePort.ts'),
      'utf8',
    )
    expect(adapter).toContain("from './bootstrapState.js'")
  })
})
