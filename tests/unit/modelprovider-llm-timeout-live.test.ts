import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getCurrentLlmTimeoutMs,
  getModelProvider,
  LLM_TIMEOUT_DEFAULT_MS,
  OpenAIProvider,
  resetModelProviderForTesting,
  setLlmTimeoutSettingsSource,
} from 'src/modelprovider'

// loop-robustness 缺口③（#262，llmTimeoutMs 死键 + headless 设置源缝未接，
// peer live 复现铁证）：provider 超时由构造期一次性快照改为活态读（可选
// timeoutResolver，每请求现读）——settings 源缝注入 / 值变 / env 翻转后即时
// 生效（修 TUI 提示面 getCurrentLlmTimeoutMs 现读 vs provider 快照 两车道分裂
// + headless 未注源缝 llmTimeoutMs 死键）。
//
// 判别单测（mechanism 面；端到端 LT1 探针 = peer 侧 post-fix 判据）：
//   A 活态 resolver：构造快照 600s，resolver 现读 → getTimeoutMs 跟踪当前值。
//     回退构造快照（删 resolver）→ 恒 600s RED。
//   B 直构无 resolver 兼容：new OpenAIProvider(3, N) → getTimeoutMs()=N（零行为变更）。
//   C 源缝读面：setLlmTimeoutSettingsSource → getCurrentLlmTimeoutMs 现读（seam 未注=缺省）。
//   D 单例活读：getModelProvider（reset 后重建）经 settings 源缝现读，源变
//     getTimeoutMs 跟随（pre-fix 构造期一次性快照不跟随 → RED）。

let prevEnv: string | undefined

beforeEach(() => {
  prevEnv = process.env.ATLAS_LLM_TIMEOUT
  delete process.env.ATLAS_LLM_TIMEOUT // 隔离 env 档，验 settings 源缝面
  setLlmTimeoutSettingsSource(null)
})
afterEach(() => {
  if (prevEnv === undefined) delete process.env.ATLAS_LLM_TIMEOUT
  else process.env.ATLAS_LLM_TIMEOUT = prevEnv
  setLlmTimeoutSettingsSource(null)
  resetModelProviderForTesting()
})

describe('缺口③ provider 超时活态读（llmTimeoutMs 死键修）', () => {
  test('A 活态 resolver：构造快照 600s，resolver 现读 → getTimeoutMs 跟踪当前值（非快照）', () => {
    let live = 600_000
    const p = new OpenAIProvider(3, 600_000, () => live)
    expect(p.getTimeoutMs()).toBe(600_000)
    live = 8_000 // settings 源缝 / env 变更 → resolver 现读
    expect(p.getTimeoutMs()).toBe(8_000)
    live = 450_000
    expect(p.getTimeoutMs()).toBe(450_000)
  })

  test('B 直构无 resolver 兼容：getTimeoutMs()=构造快照（零行为变更）', () => {
    const p = new OpenAIProvider(3, 123_456)
    expect(p.getTimeoutMs()).toBe(123_456)
  })

  test('C 源缝读面：setLlmTimeoutSettingsSource → getCurrentLlmTimeoutMs 现读（seam 未注=缺省）', () => {
    expect(getCurrentLlmTimeoutMs()).toBe(LLM_TIMEOUT_DEFAULT_MS)
    setLlmTimeoutSettingsSource(() => 8_000)
    expect(getCurrentLlmTimeoutMs()).toBe(8_000) // 源缝现读
  })

  test('D 单例活读：getModelProvider 经 settings 源缝现读，源变 getTimeoutMs 跟随', () => {
    resetModelProviderForTesting()
    const p = getModelProvider() // 重建（带活态 resolver）
    setLlmTimeoutSettingsSource(() => 8_000)
    expect(p.getTimeoutMs()).toBe(8_000) // 源缝注入 → 现读 8s（pre-fix 构造快照 600s RED）
    setLlmTimeoutSettingsSource(() => 450_000)
    expect(p.getTimeoutMs()).toBe(450_000) // 源变跟随（活态，非一次性快照）
  })
})
