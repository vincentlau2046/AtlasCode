/**
 * #250 concern 2（/autocompact 命令）：engine autoCompact 窗口档位纯面判别单测
 *
 * 被测能力：
 *   - resolveAutoCompactWindow 四档解析（auto/off/window/pct）+ 越界 guard
 *     （window <1k / pct 越出 (0,100] → 忽略不生效，raw 注入安全）
 *   - parseAutoCompactTierInput 自定义档解析（"150k" → window 150000 /
 *     "75%" / "75" → pct 75 裸数=百分比 / 非法 null）
 *   - setAutoCompactWindowSettingsSource 接缝合并纪律（model-string / 0 参
 *     便捷形消费）：**env 胜 settings**（ATLAS_AUTO_COMPACT_WINDOW /
 *     ATLAS_AUTOCOMPACT_PCT_OVERRIDE 覆盖同名 settings 档位）+ off 档
 *     isAutoCompactEnabled() 0 参形禁用（手动 /compact 保留语义在调用方）。
 * 纯内存态（process.env 存还 + 源接缝存还，unit 层无磁盘/网络/PTY）。
 *
 * 阈值算例基准（provider 注册表未声明窗口的模型回落 150_000；
 * COMPACT_MAX_OUTPUT_TOKENS = 20_000；AUTOCOMPACT_BUFFER_TOKENS = 13_000）：
 *   缺省 = 150_000 − 20_000 − 13_000 = 117_000。
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from 'bun:test'
import {
  resolveAutoCompactWindow,
  parseAutoCompactTierInput,
  setAutoCompactWindowSettingsSource,
  setAutoCompactSettingsSource,
  getAutoCompactThreshold,
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
  mergeAutoCompactOverrides,
  AUTOCOMPACT_PRESET_WINDOW_TIERS,
  type AutoCompactWindowSetting,
} from '../../src/engine'

/** 纯合并测试用 env 覆写形（getAutoCompactEnvOverrides 同形，零 env I/O）。 */
const EMPTY_ENV = {
  pctOverride: undefined,
  windowOverride: undefined,
  disabled: undefined,
  autoCompactDisabled: undefined,
  blockingLimitOverride: undefined,
} as const

const TRACKED_ENV_KEYS = [
  'ATLAS_AUTOCOMPACT_PCT_OVERRIDE',
  'ATLAS_AUTO_COMPACT_WINDOW',
  'DISABLE_COMPACT',
  'DISABLE_AUTO_COMPACT',
]

let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv = {}
  for (const k of TRACKED_ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of TRACKED_ENV_KEYS) {
    if (savedEnv[k] === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = savedEnv[k]
    }
  }
  setAutoCompactWindowSettingsSource(null)
  setAutoCompactSettingsSource(null)
})

describe('resolveAutoCompactWindow 四档解析', () => {
  test('undefined / auto 档 = 无覆写', () => {
    expect(resolveAutoCompactWindow(undefined)).toEqual({})
    expect(resolveAutoCompactWindow(null)).toEqual({})
    expect(resolveAutoCompactWindow({ kind: 'auto' })).toEqual({})
  })

  test('off 档 = autoCompactDisabled', () => {
    expect(resolveAutoCompactWindow({ kind: 'off' })).toEqual({
      autoCompactDisabled: true,
    })
  })

  test('window 档 = 窗口 cap（floor）', () => {
    expect(resolveAutoCompactWindow({ kind: 'window', tokens: 128_000 })).toEqual(
      { windowOverride: 128_000 },
    )
    expect(
      resolveAutoCompactWindow({ kind: 'window', tokens: 128_001.9 }),
    ).toEqual({ windowOverride: 128_001 })
  })

  test('window 越界（<1000）忽略不生效', () => {
    expect(resolveAutoCompactWindow({ kind: 'window', tokens: 500 })).toEqual({})
    expect(resolveAutoCompactWindow({ kind: 'window', tokens: 0 })).toEqual({})
    expect(
      resolveAutoCompactWindow({ kind: 'window', tokens: Number.NaN }),
    ).toEqual({})
  })

  test('pct 档 = 阈值百分比（(0,100] 有效）', () => {
    expect(resolveAutoCompactWindow({ kind: 'pct', pct: 75 })).toEqual({
      pctOverride: 75,
    })
    expect(resolveAutoCompactWindow({ kind: 'pct', pct: 100 })).toEqual({
      pctOverride: 100,
    })
  })

  test('pct 越界（0 / 101 / NaN）忽略不生效', () => {
    expect(resolveAutoCompactWindow({ kind: 'pct', pct: 0 })).toEqual({})
    expect(resolveAutoCompactWindow({ kind: 'pct', pct: 101 })).toEqual({})
    expect(resolveAutoCompactWindow({ kind: 'pct', pct: Number.NaN })).toEqual({})
  })
})

describe('parseAutoCompactTierInput 自定义档解析', () => {
  test('"150k" → window 150000（大小写/空白容忍）', () => {
    expect(parseAutoCompactTierInput('150k')).toEqual({
      kind: 'window',
      tokens: 150_000,
    })
    expect(parseAutoCompactTierInput(' 150 K ')).toEqual({
      kind: 'window',
      tokens: 150_000,
    })
    expect(parseAutoCompactTierInput('1.5k')).toEqual({
      kind: 'window',
      tokens: 1_500,
    })
    expect(parseAutoCompactTierInput('2k')).toEqual({
      kind: 'window',
      tokens: 2_000,
    })
  })

  test('"75%" / "75" → pct（裸数 = 百分比）', () => {
    expect(parseAutoCompactTierInput('75%')).toEqual({ kind: 'pct', pct: 75 })
    expect(parseAutoCompactTierInput('75')).toEqual({ kind: 'pct', pct: 75 })
    expect(parseAutoCompactTierInput('100%')).toEqual({ kind: 'pct', pct: 100 })
    expect(parseAutoCompactTierInput('72.5%')).toEqual({ kind: 'pct', pct: 72.5 })
  })

  test('非法输入 → null（越界/非数/空）', () => {
    expect(parseAutoCompactTierInput('')).toBeNull()
    expect(parseAutoCompactTierInput('   ')).toBeNull()
    expect(parseAutoCompactTierInput('abc')).toBeNull()
    expect(parseAutoCompactTierInput('0.5k')).toBeNull() // 500 < 1k
    expect(parseAutoCompactTierInput('150')).toBeNull() // 150% 越界
    expect(parseAutoCompactTierInput('0%')).toBeNull()
    expect(parseAutoCompactTierInput('101%')).toBeNull()
    expect(parseAutoCompactTierInput('k')).toBeNull()
  })
})

describe('预设档位单一事实源', () => {
  test('AUTOCOMPACT_PRESET_WINDOW_TIERS = 100k/128k/200k/256k', () => {
    expect([...AUTOCOMPACT_PRESET_WINDOW_TIERS]).toEqual([
      100_000,
      128_000,
      200_000,
      256_000,
    ])
  })
})

describe('settings 档位接缝合并纪律（model-string / 0 参形）', () => {
  // 未声明窗口的模型回落 150_000（provider 注册表空 stub）。
  const MODEL = 'unregistered-model-xyz'

  function withWindowSource(setting: AutoCompactWindowSetting | null | undefined) {
    setAutoCompactWindowSettingsSource(() => setting)
  }

  test('无源 = 缺省阈值 117_000（150k − 20k − 13k）', () => {
    expect(getAutoCompactThreshold(MODEL)).toBe(117_000)
  })

  test('settings window 档 128k：阈值 95_000（128k − 20k − 13k）', () => {
    withWindowSource({ kind: 'window', tokens: 128_000 })
    expect(getAutoCompactThreshold(MODEL)).toBe(95_000)
    expect(getEffectiveContextWindowSize(MODEL)).toBe(108_000)
  })

  test('settings pct 档 50：阈值 min(floor(130k×0.5), 117k) = 65_000', () => {
    withWindowSource({ kind: 'pct', pct: 50 })
    expect(getAutoCompactThreshold(MODEL)).toBe(65_000)
  })

  test('env 窗口 cap 胜 settings window 档（100k env 压 128k settings）', () => {
    withWindowSource({ kind: 'window', tokens: 128_000 })
    process.env.ATLAS_AUTO_COMPACT_WINDOW = '100000'
    expect(getAutoCompactThreshold(MODEL)).toBe(67_000) // 100k − 20k − 13k
    expect(getEffectiveContextWindowSize(MODEL)).toBe(80_000)
  })

  test('env pct 覆写胜 settings pct 档（80 env 压 50 settings）', () => {
    withWindowSource({ kind: 'pct', pct: 50 })
    process.env.ATLAS_AUTOCOMPACT_PCT_OVERRIDE = '80'
    expect(getAutoCompactThreshold(MODEL)).toBe(104_000) // min(floor(130k×0.8), 117k)
  })

  test('off 档：isAutoCompactEnabled() 0 参形 = false（无源 = true 回归）', () => {
    expect(isAutoCompactEnabled()).toBe(true)
    withWindowSource({ kind: 'off' })
    expect(isAutoCompactEnabled()).toBe(false)
    withWindowSource({ kind: 'auto' })
    expect(isAutoCompactEnabled()).toBe(true)
  })

  test('env 禁用面回归（DISABLE_COMPACT / DISABLE_AUTO_COMPACT 优先于档位面）', () => {
    withWindowSource({ kind: 'auto' })
    process.env.DISABLE_COMPACT = '1'
    expect(isAutoCompactEnabled()).toBe(false)
    delete process.env.DISABLE_COMPACT
    process.env.DISABLE_AUTO_COMPACT = '1'
    expect(isAutoCompactEnabled()).toBe(false)
  })

  test('settings.autoCompactEnabled=false 源回归（与档位面并存）', () => {
    withWindowSource({ kind: 'auto' })
    setAutoCompactSettingsSource(() => false)
    expect(isAutoCompactEnabled()).toBe(false)
  })
})

describe('mergeAutoCompactOverrides 纯合并（agentLoopDeps DI 注入单点）', () => {
  test('双空 = 全 undefined + 不禁用', () => {
    const m = mergeAutoCompactOverrides(
      { ...EMPTY_ENV },
      undefined,
    )
    expect(m).toEqual({
      pctOverride: undefined,
      windowOverride: undefined,
      autoCompactDisabled: false,
    })
  })

  test('仅 settings 档位：pct / window / off 三形', () => {
    expect(
      mergeAutoCompactOverrides({ ...EMPTY_ENV }, { kind: 'pct', pct: 60 }),
    ).toMatchObject({ pctOverride: 60, autoCompactDisabled: false })
    expect(
      mergeAutoCompactOverrides(
        { ...EMPTY_ENV },
        { kind: 'window', tokens: 128_000 },
      ),
    ).toMatchObject({ windowOverride: 128_000, autoCompactDisabled: false })
    expect(
      mergeAutoCompactOverrides({ ...EMPTY_ENV }, { kind: 'off' })
        .autoCompactDisabled,
    ).toBe(true)
  })

  test('env 胜 settings（同名槽 env 值覆盖）', () => {
    const m = mergeAutoCompactOverrides(
      { ...EMPTY_ENV, pctOverride: 80, windowOverride: 100_000 },
      { kind: 'pct', pct: 50 },
    )
    expect(m.pctOverride).toBe(80)
    expect(m.windowOverride).toBe(100_000)
  })

  test('禁用面三源 OR（env 总开关 / env 细粒度 / settings off 档）', () => {
    expect(
      mergeAutoCompactOverrides(
        { ...EMPTY_ENV, disabled: true },
        { kind: 'auto' },
      ).autoCompactDisabled,
    ).toBe(true)
    expect(
      mergeAutoCompactOverrides(
        { ...EMPTY_ENV, autoCompactDisabled: true },
        { kind: 'auto' },
      ).autoCompactDisabled,
    ).toBe(true)
    expect(
      mergeAutoCompactOverrides({ ...EMPTY_ENV }, { kind: 'off' })
        .autoCompactDisabled,
    ).toBe(true)
    expect(
      mergeAutoCompactOverrides({ ...EMPTY_ENV }, { kind: 'auto' })
        .autoCompactDisabled,
    ).toBe(false)
  })
})
