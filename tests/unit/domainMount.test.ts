/**
 * M3-S1（D-3 Ascend 独立实施波）— DomainPackage 四元挂载 port 判别单测。
 *
 * 零网络 / 零真实 CANN / 零 PTY。验 charter Port 3（PRT-1 承重）：
 *   - DomainPackage 接口形状（id/tools/skills/systemPromptSection/executor 五元）
 *   - holder 三件套：registerDomainMount → getDomainMount → resetDomainMountForTests
 *   - 未挂载 = null（AtlasOffice 形态：四元全缺）
 *   - id 固定 'ascend'（v1 单域包）
 *   - 四元皆可选（部分挂载合法：仅 tools / 仅 prompt / 全缺）
 *
 * engine 注册面（toolRegistry ascendTools slot + isAscendToolsEnabled kill-switch）
 * 已由 T-5e 测试覆盖（toolRegistry.test.ts），此处不重复。
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  type DomainPackage,
  registerDomainMount,
  getDomainMount,
  resetDomainMountForTests,
} from '../../src/engine'

afterEach(() => resetDomainMountForTests())

describe('M3-S1 DomainPackage port (charter Port 3, PRT-1)', () => {
  test('未挂载 → getDomainMount() 返回 null（AtlasOffice 形态）', () => {
    expect(getDomainMount()).toBeNull()
  })

  test('registerDomainMount → getDomainMount 取回同一包', () => {
    const pkg: DomainPackage = { id: 'ascend' }
    registerDomainMount(pkg)
    expect(getDomainMount()).toBe(pkg)
  })

  test('resetDomainMountForTests → 清回 null', () => {
    registerDomainMount({ id: 'ascend' })
    expect(getDomainMount()).not.toBeNull()
    resetDomainMountForTests()
    expect(getDomainMount()).toBeNull()
  })

  test('DomainPackage 五元形状：id 固定 ascend + 四元可选', () => {
    // 全四元（模拟 S5 ascendPackage 形态，用 stub 不引 ascend 域）
    const full: DomainPackage = {
      id: 'ascend',
      tools: [],
      skills: [],
      systemPromptSection: () => '## Ascend NPU Tools',
      executor: { commands: {} } as unknown as DomainPackage['executor'],
    }
    registerDomainMount(full)
    const got = getDomainMount()
    expect(got?.id).toBe('ascend')
    expect(Array.isArray(got?.tools)).toBe(true)
    expect(Array.isArray(got?.skills)).toBe(true)
    expect(typeof got?.systemPromptSection).toBe('function')
    expect(got?.systemPromptSection?.()).toBe('## Ascend NPU Tools')
    expect(got?.executor).toBeDefined()
  })

  test('部分挂载合法（仅 systemPromptSection，无 tools/skills/executor）', () => {
    const partial: DomainPackage = {
      id: 'ascend',
      systemPromptSection: () => null,
    }
    registerDomainMount(partial)
    const got = getDomainMount()
    expect(got?.id).toBe('ascend')
    expect(got?.tools).toBeUndefined()
    expect(got?.skills).toBeUndefined()
    expect(got?.executor).toBeUndefined()
    expect(got?.systemPromptSection?.()).toBeNull()
  })

  test('registerDomainMount 可覆盖（二次注册替换前次）', () => {
    const first: DomainPackage = { id: 'ascend', systemPromptSection: () => 'A' }
    const second: DomainPackage = { id: 'ascend', systemPromptSection: () => 'B' }
    registerDomainMount(first)
    registerDomainMount(second)
    expect(getDomainMount()?.systemPromptSection?.()).toBe('B')
  })
})
