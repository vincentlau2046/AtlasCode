/**
 * D-2a S5（重裁范围 = 原 S7，M5 切端）判别单测：autoCompact 4 活消费名
 * model-string 便捷形重载（TUI 调用点零改动切端）+ isAutoCompactEnabled()
 * 0 参形 + settings 读侧注入。
 *
 * 范围裁定登记：shouldAutoCompact / autoCompactIfNeeded 富 model-string 形
 * TUI 零活消费（engineCompat 冲突块陈旧条目）→ 富体不迁（H6 防空洞），
 * 本测仅钉 4 个活消费便捷形 + DI 核回归。
 */
import {
  calculateTokenWarningState,
  getAutoCompactThreshold,
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
  setAutoCompactSettingsSource,
} from '../../src/engine'

/** provider 注册表未声明 contextWindow 的测试模型 → 150k 回落（delta ①）。 */
const UNKNOWN = 'atlas-test-unknown-model'

describe('D-2a S5 model-string 便捷形（TUI 调用点零改动）', () => {
  afterEach(() => {
    setAutoCompactSettingsSource(null)
    delete process.env.ATLAS_AUTO_COMPACT_WINDOW
    delete process.env.ATLAS_AUTOCOMPACT_PCT_OVERRIDE
    delete process.env.DISABLE_COMPACT
    delete process.env.DISABLE_AUTO_COMPACT
  })

  test('getEffectiveContextWindowSize(model) = 回落窗口 150k − 20k 预留 = 130k', () => {
    expect(getEffectiveContextWindowSize(UNKNOWN)).toBe(130_000)
  })

  test('env ATLAS_AUTO_COMPACT_WINDOW 窗口 cap', () => {
    process.env.ATLAS_AUTO_COMPACT_WINDOW = '100000'
    expect(getEffectiveContextWindowSize(UNKNOWN)).toBe(80_000)
  })

  test('getAutoCompactThreshold(model) = 有效窗口 − 13k（+pct env 覆写）', () => {
    expect(getAutoCompactThreshold(UNKNOWN)).toBe(117_000)
    process.env.ATLAS_AUTOCOMPACT_PCT_OVERRIDE = '50'
    expect(getAutoCompactThreshold(UNKNOWN)).toBe(65_000)
  })

  test('calculateTokenWarningState(n, model) 面 + 阈值一致性', () => {
    const s = calculateTokenWarningState(118_000, UNKNOWN)
    // 阈值 117k / 警告线 97k / 错误线 97k / blocking 线 127k
    expect(s.isAboveAutoCompactThreshold).toBe(true)
    expect(s.isAboveWarningThreshold).toBe(true)
    expect(s.isAboveErrorThreshold).toBe(true)
    expect(s.isAtBlockingLimit).toBe(false)
    expect(s.percentLeft).toBe(0)
  })

  test('isAutoCompactEnabled() 0 参形：缺省 true / env kill / settings 源注入', () => {
    expect(isAutoCompactEnabled()).toBe(true)
    process.env.DISABLE_COMPACT = 'true'
    expect(isAutoCompactEnabled()).toBe(false)
    delete process.env.DISABLE_COMPACT
    process.env.DISABLE_AUTO_COMPACT = '1'
    expect(isAutoCompactEnabled()).toBe(false)
    delete process.env.DISABLE_AUTO_COMPACT
    setAutoCompactSettingsSource(() => false)
    expect(isAutoCompactEnabled()).toBe(false)
    setAutoCompactSettingsSource(() => true)
    expect(isAutoCompactEnabled()).toBe(true)
  })

  test('DI 形回归（数字形 = 裁剪核，行为零变更）', () => {
    expect(getEffectiveContextWindowSize(200_000)).toBe(180_000)
    // maxOut 4096 < 20k 预留 → 按模型原生 maxOut 扣减
    expect(getEffectiveContextWindowSize(200_000, 4_096)).toBe(195_904)
    expect(getAutoCompactThreshold(200_000)).toBe(167_000)
    const s = calculateTokenWarningState(100, { contextWindow: 200_000 })
    expect(s.isAtBlockingLimit).toBe(false)
    expect(isAutoCompactEnabled({ settingsEnabled: false })).toBe(false)
    expect(isAutoCompactEnabled({ autoCompactDisabled: true })).toBe(false)
  })
})
