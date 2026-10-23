/**
 * 0.1.80 V3-1 K1-C③ 判别锁 — /autocompact 小窗档位用量百分比分母随窗校准 (@300)
 *
 * 判别先行（零码定性）：calculateTokenWarningState model-string 形经
 * getMergedAutoCompactOverrides 按模型键取 per-model windowOverride →
 * core 的 percentLeft 分母 = tier-calibrated threshold（有效窗 − 摘要预留
 * − 压缩缓冲），warning/error/blocking 三阈值全随有效窗；K1-B① basename
 * 回落使 `prefix/model` 前缀名请求亦取裸名键档位 + 裸名声明窗位。
 * 本测试锁行为（实现在场），防后续重构失守小窗档位语义——上游 300 症状 =
 * 切小窗模型/小档位后用量百分比仍按大窗分母显示（93% vs 真值 26%）。
 *
 * 数值链（单一事实源 = engine 常量）：60k 档 → 有效窗 60k−20k=40k →
 * 阈值 40k−13k=27k；usage 20k → percentLeft = round(7k/27k×100) = 26；
 * 无档回落声明窗 300k → 有效 280k → 阈值 267k → percentLeft 93。
 *
 * 纯函数 + DI 缝测试：零网络/零磁盘/零 PTY；接缝 = setEndpointConfigSource
 * （modelprovider 窗位注入）+ setAutoCompactWindowSettingsSource（档位注入）。
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  calculateTokenWarningState,
  setAutoCompactSettingsSource,
  setAutoCompactWindowSettingsSource,
} from '../../src/engine'
import {
  resetEndpointConfigSource,
  setEndpointConfigSource,
} from '../../src/modelprovider'

type EndpointConfigSource = Parameters<typeof setEndpointConfigSource>[0]

const BARE = 'qwen3-235b'
const PREFIXED = 'volc/qwen3-235b'
const DECLARED_WINDOW = 300_000

function withDeclaredProvider(): void {
  setEndpointConfigSource({
    getProviders: () => ({
      testprov: {
        models: [{ id: BARE, contextWindow: DECLARED_WINDOW }],
      },
    }),
  } as unknown as EndpointConfigSource)
}

const ENV_KEYS = [
  'DISABLE_COMPACT',
  'DISABLE_AUTO_COMPACT',
  'ATLAS_AUTOCOMPACT_PCT_OVERRIDE',
  'ATLAS_AUTO_COMPACT_WINDOW',
  'ATLAS_BLOCKING_LIMIT_OVERRIDE',
] as const
const savedEnv = new Map<string, string | undefined>()

function clearEnvOverrides(): void {
  for (const k of ENV_KEYS) {
    savedEnv.set(k, process.env[k])
    delete process.env[k]
  }
}

afterEach(() => {
  setAutoCompactWindowSettingsSource(null)
  setAutoCompactSettingsSource(null)
  resetEndpointConfigSource()
  for (const k of ENV_KEYS) {
    const v = savedEnv.get(k)
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
    savedEnv.delete(k)
  }
})

describe('K1-C③ 用量百分比分母随窗校准（calculateTokenWarningState model-string 形）', () => {
  test('a) per-model window 档 → percentLeft 分母 = 档位校准阈值（非模型窗）', () => {
    clearEnvOverrides()
    withDeclaredProvider()
    setAutoCompactWindowSettingsSource(() => ({
      [BARE]: { kind: 'window', tokens: 60_000 },
    }))
    const s = calculateTokenWarningState(20_000, BARE)
    // 60k 档 → 有效 40k → 阈值 27k → (27k−20k)/27k = 26%（非模型窗分母的 93%）
    expect(s.percentLeft).toBe(26)
    // warning/error 阈值随档位校准（27k−20k=7k；20k ≥ 7k 置位）
    expect(s.isAboveWarningThreshold).toBe(true)
    expect(s.isAboveErrorThreshold).toBe(true)
    // 阈值本体未越（20k < 27k 不触发 auto-compact 判定）
    expect(s.isAboveAutoCompactThreshold).toBe(false)
    // blocking limit 随有效窗（40k−3k=37k；20k 未达）
    expect(s.isAtBlockingLimit).toBe(false)
  })

  test('b) 前缀名请求 → basename 回落取同档同分母（K1-B① 联动锁）', () => {
    clearEnvOverrides()
    withDeclaredProvider()
    setAutoCompactWindowSettingsSource(() => ({
      [BARE]: { kind: 'window', tokens: 60_000 },
    }))
    const bare = calculateTokenWarningState(20_000, BARE)
    const prefixed = calculateTokenWarningState(20_000, PREFIXED)
    // 前缀名经 basename 命中裸名键档位 + 裸名声明窗位 → 全态同值
    expect(prefixed.percentLeft).toBe(bare.percentLeft)
    expect(prefixed.percentLeft).toBe(26)
    expect(prefixed.isAtBlockingLimit).toBe(false)
  })

  test('c) 无档模型 → 回落 provider 声明窗（分母随模型窗，零回归锚）', () => {
    clearEnvOverrides()
    withDeclaredProvider()
    // 已声明窗 300k：有效 280k → 阈值 267k → (267k−20k)/267k = 93%
    const declared = calculateTokenWarningState(20_000, BARE)
    expect(declared.percentLeft).toBe(93)
    // 未声明模型 → HARD_DEFAULT_CONTEXT_WINDOW 262144：阈值 229144 → 91%
    const undeclared = calculateTokenWarningState(20_000, 'undeclared-model-x')
    expect(undeclared.percentLeft).toBe(91)
  })

  test('d) off 档不改变分母窗面（禁用只关 auto-compact 判定，percentLeft 按有效窗）', () => {
    clearEnvOverrides()
    withDeclaredProvider()
    setAutoCompactWindowSettingsSource(() => ({
      [BARE]: { kind: 'off' },
    }))
    const s = calculateTokenWarningState(260_000, BARE)
    // off 档：effectivelyEnabled=false → threshold = 有效窗 280k →
    // (280k−260k)/280k = 7%（分母仍窗校准，非 27k 档面）
    expect(s.percentLeft).toBe(7)
    // 用户禁用面：不置位 auto-compact 阈值判定 + 不显形「小窗禁用」
    expect(s.isAboveAutoCompactThreshold).toBe(false)
    expect(s.autoCompactDisabledBySmallWindow).toBeUndefined()
  })
})
