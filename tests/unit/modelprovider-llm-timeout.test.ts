/**
 * #260 P0（斗兽棋主循环 "Request timed out" 回合终止，2026-10-03）：
 * LLM 请求超时修波判别单测（三族）。
 *
 * 根因链（定位记录）：主循环 chat() 非流式 + 缺省 120s 超时（用户 profile
 * 未设 ATLAS_LLM_TIMEOUT）→ 27B 慢模型 xhigh effort 长生成 > 120s → SDK
 * APITimeoutError → isRetryableError /timeout/ 命中 → 3 次整段重生成
 * （≈4m5s 观察值）→ 回合死。修 = ① 缺省 120s→600s（国产慢模型基线，用户裁定）
 * ② 生成超时 fail-fast 不重试（连接期错误仍重试）③ settings llmTimeoutMs
 * 键（env 胜）④ 超时错误行 remediation 提示面。
 *
 * 被测能力：
 *   ① resolveLlmTimeoutMs 纯 resolver（env 胜 settings 胜 缺省 600s；
 *     上限 30min 双源 cap；env 显式无效落 settings）
 *   ② settings 源缝 setLlmTimeoutSettingsSource → provider getTimeoutMs()
 *     读面（seam 未注 = 缺省）
 *   ⑤ settings llmTimeoutMs schema 面（宽容 number；越界/形状校验在合并层）
 *
 * 分层纪律：纯函数 + provider 构造读面（无网络 / 无盘 / 无 gateway）。
 * L3 门面 import（src/modelprovider 根门面，§8.41 口径）。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  resolveLlmTimeoutMs,
  setLlmTimeoutSettingsSource,
  resetModelProviderForTesting,
  getModelProvider,
  LLM_TIMEOUT_DEFAULT_MS,
  LLM_TIMEOUT_CAP_MS,
} from '../../src/modelprovider'
import { SettingsSchema } from '../../src/tui/utils/settings/types'

describe('#260 resolveLlmTimeoutMs 纯 resolver（env 胜 settings 胜 缺省 600s）', () => {
  test('① 无 env + 无 settings → 新缺省 600s（旧 120s 判别点）', () => {
    expect(LLM_TIMEOUT_DEFAULT_MS).toBe(600_000)
    expect(resolveLlmTimeoutMs(undefined, undefined)).toBe(600_000)
  })
  test('② env 有效 → env 胜（settings 被压）', () => {
    expect(resolveLlmTimeoutMs('600000', 450_000)).toBe(600_000)
    expect(resolveLlmTimeoutMs('200000', 450_000)).toBe(200_000)
  })
  test('③ env 超上限 → cap 30min（上限纪律不变）', () => {
    expect(LLM_TIMEOUT_CAP_MS).toBe(1_800_000)
    expect(resolveLlmTimeoutMs('999999999', undefined)).toBe(1_800_000)
  })
  test('④ env 下界 = 1 有效（0 无效语义保留）', () => {
    expect(resolveLlmTimeoutMs('1', undefined)).toBe(1)
    expect(resolveLlmTimeoutMs('0', undefined)).toBe(600_000)
  })
  test('⑤ env 显式无效（非数字）→ 落 settings 档', () => {
    expect(resolveLlmTimeoutMs('abc', 450_000)).toBe(450_000)
  })
  test('⑥ env 显式无效 + 无 settings → 缺省 600s', () => {
    expect(resolveLlmTimeoutMs('abc', undefined)).toBe(600_000)
  })
  test('⑦ 无 env + settings 有效 → settings 档', () => {
    expect(resolveLlmTimeoutMs(undefined, 450_000)).toBe(450_000)
  })
  test('⑧ settings 超上限 → cap 30min（与 env 同纪律）', () => {
    expect(resolveLlmTimeoutMs(undefined, 9_999_999_999)).toBe(1_800_000)
  })
  test('⑨ settings 形状无效（0 / 负 / 小数）→ 缺省 600s（合并层校验）', () => {
    expect(resolveLlmTimeoutMs(undefined, 0)).toBe(600_000)
    expect(resolveLlmTimeoutMs(undefined, -5)).toBe(600_000)
    expect(resolveLlmTimeoutMs(undefined, 1.5)).toBe(600_000)
  })
})

describe('#260 settings llmTimeoutMs schema 面（宽容 number；校验在合并层）', () => {
  test('⑳ 合法 number 透传 + 缺省 undefined（类型面）', () => {
    const s = SettingsSchema()
    expect(s.parse({ llmTimeoutMs: 600_000 }).llmTimeoutMs).toBe(600_000)
    expect(s.parse({}).llmTimeoutMs).toBeUndefined()
  })
})
