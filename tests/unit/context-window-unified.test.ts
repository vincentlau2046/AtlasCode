/**
 * SL-1c（0.1.49 · F-4 升级入波，用户 2026-10-10 裁定三问题全修）：
 * 窗口兜底常量单一事实源（工单 §1.4/§2）。
 *
 * 修前 3 处分叉（工单 §1.4）：tui context.ts MODEL_CONTEXT_WINDOW_DEFAULT=150_000
 * （带僵尸 FIXME「qwen38-27b-abliterated 163840 临时覆写」，该模型级联 P6-3 已删）
 * + engine autoCompact.ts 本地私有副本 150_000（delta① 注自称「对齐 tui 常量」
 * = 有意拷贝但与 roles 链漂移）+ modelprovider roles.ts HARD_DEFAULT_CONTEXT_WINDOW
 * =262144（canonical，4 消费方）→ 统一 = HARD_DEFAULT_CONTEXT_WINDOW（262144），
 * 不新造值。
 *
 * 判别判据（工单 §2 SL-1c）：
 * ① 未注册模型 `undeclared-x`（provider 注册表无声明）：
 *    getContextWindowForModel === 262144 **且** getEffectiveContextWindowSize
 *    === 242_144（= 262144 − 20k 摘要预留；engine 面预留 = 独立常量
 *    COMPACT_MAX_OUTPUT_TOKENS，非本统一面）—— 修前红（双双 150_000/130_000）→ 修后绿
 * ② provider 声明 contextWindow 的模型（fixture 300_000）→ 两链均返声明值
 *    （声明优先，兜底不干扰；autoCompact 链 = 300_000 − 20k 预留 = 280_000）
 *    —— 零回归（恒绿）
 * ③ 漂移守卫：MODEL_CONTEXT_WINDOW_DEFAULT === HARD_DEFAULT_CONTEXT_WINDOW
 *    （修后 = 别名恒真，断言防再分叉；修前分叉存在 → 红，与 ① 同根因）
 *
 * 接缝：setEndpointConfigSource（modelprovider 注入窗口，最小 fake provider
 * 注册表）+ env/settings 源缝清空（纯内存，unit 层零磁盘零网络零 PTY）。
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  getEffectiveContextWindowSize,
  setAutoCompactSettingsSource,
} from '../../src/engine'
import {
  getContextWindowForModel,
  MODEL_CONTEXT_WINDOW_DEFAULT,
} from '../../src/tui/utils/context'
import {
  HARD_DEFAULT_CONTEXT_WINDOW,
  resetEndpointConfigSource,
  setEndpointConfigSource,
} from '../../src/modelprovider'

type EndpointConfigSource = Parameters<typeof setEndpointConfigSource>[0]

const UNDECLARED = 'undeclared-x'
const DECLARED = 'prov-decl-model'
const DECLARED_WINDOW = 300_000

function withDeclaredProvider(): void {
  setEndpointConfigSource({
    getProviders: () => ({
      testprov: {
        models: [{ id: DECLARED, contextWindow: DECLARED_WINDOW }],
      },
    }),
  } as unknown as EndpointConfigSource)
}

afterEach(() => {
  resetEndpointConfigSource()
  setAutoCompactSettingsSource(null)
  delete process.env.ATLAS_AUTO_COMPACT_WINDOW
  delete process.env.ATLAS_AUTOCOMPACT_PCT_OVERRIDE
  delete process.env.ATLAS_BLOCKING_LIMIT_OVERRIDE
})

describe('SL-1c 窗口兜底常量单一事实源（工单 §2 ①修前红 / ②零回归 / ③守卫）', () => {
  test('① 未声明模型：两链兜底 = HARD_DEFAULT_CONTEXT_WINDOW 262144（修前红：双双 150000/130000）', () => {
    // tui 链无预留扣减 → 262144 逐字
    expect(getContextWindowForModel(UNDECLARED)).toBe(262_144)
    // engine autoCompact 导出面：窗口 − 20k 摘要预留（delta② 预留常量）= 242144
    expect(getEffectiveContextWindowSize(UNDECLARED)).toBe(242_144)
    // 单一事实源本处 = modelprovider roles 层（值断言防三方再漂移）
    expect(HARD_DEFAULT_CONTEXT_WINDOW).toBe(262_144)
  })

  test('② provider 声明优先：两链返声明值（零回归，兜底不干扰）', () => {
    withDeclaredProvider()
    expect(getContextWindowForModel(DECLARED)).toBe(DECLARED_WINDOW)
    // autoCompact 链 = 声明窗口 − 20k 摘要预留（engine 面既有语义，非兜底）
    expect(getEffectiveContextWindowSize(DECLARED)).toBe(
      DECLARED_WINDOW - 20_000,
    )
  })

  test('③ 漂移守卫：MODEL_CONTEXT_WINDOW_DEFAULT === HARD_DEFAULT_CONTEXT_WINDOW（防再分叉）', () => {
    expect(MODEL_CONTEXT_WINDOW_DEFAULT).toBe(HARD_DEFAULT_CONTEXT_WINDOW)
  })
})
