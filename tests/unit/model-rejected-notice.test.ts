/**
 * 0.1.67 B-3 — 全局 settings.model 池外被 allowlist 静默拒绝修复判别单测。
 *
 * B-3（用户 2026-10-14 报「恢复直接用 default」的直接机制）：/model 所选池外
 * provider 模型写入全局 settings.model 后，恢复时 getUserSpecifiedModelSetting 过
 * isModelAllowed 拒 → 静默落 default（零提示）。修 = 恢复支对池外被拒给显式提示。
 * 本波落码面 = 纯函数 globalModelRejectedNotice（model.ts）：池外被拒 → 提示句；
 * 池内 / 未配置 → undefined（恒等锚，零行为变更）。恢复支消费接线由 e2e 活探针承载。
 *
 * 判别：
 *  - 池外模型写 settings.model → 提示在场（修前无此函数 = 红 → 修后绿）
 *  - 池内模型 → undefined（恒等锚）
 *  - 未配置 model → undefined
 *
 * 接缝：mock.module 覆写 modelAllowlist（控 verdict）+ settings（控 settings.model，
 * 真实全导出面 spread + 覆写 getInitialSettings/getSettings_DEPRECATED 两 getter）。
 * 零磁盘零模型；bun test --isolate 每文件独立进程，mock 不跨文件泄漏。
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test'

const SETTINGS_PATH = '../../src/tui/utils/settings/settings.js'
const ALLOWLIST_PATH = '../../src/tui/utils/model/modelAllowlist.js'
const MODEL_PATH = '../../src/tui/utils/model/model.js'

// settings 真实全导出面（先取，后 spread + 覆写 getter）——mock-module-export-surface
// 标准对策：先真实 import 全导出面再 spread，防缺面静默 undefined。
const realSettings = await import(SETTINGS_PATH)

// 受控 settings（各用例覆写 model / availableModels）
let controlledSettings: Record<string, unknown> = {}

// allowlist verdict（各用例覆写；B-3 测的是 notice 胶水，allowlist 机制 = 既有已测码）
let allowVerdict: (model: string) => boolean = () => true

mock.module(SETTINGS_PATH, () => ({
  ...realSettings,
  getInitialSettings: () => controlledSettings,
  getSettings_DEPRECATED: () => controlledSettings,
}))
mock.module(ALLOWLIST_PATH, () => ({
  isModelAllowed: (m: string) => allowVerdict(m),
  // 本测试图不消费 isModelInLocalModelPools（auto-mode 面）；被消费即响亮失败
  isModelInLocalModelPools: () => {
    throw new Error('mock: isModelInLocalModelPools not stubbed (unexpected consumption)')
  },
}))

const model = await import(MODEL_PATH)

describe('B-3 globalModelRejectedNotice（池外被拒显式提示，修前红→修后绿）', () => {
  beforeEach(() => {
    controlledSettings = {}
    allowVerdict = () => true
  })

  test('池外模型写 settings.model → 提示在场（含模型名 + 回退 default 措辞）', () => {
    controlledSettings = {
      model: 'deepseek-v4-pro',
      availableModels: ['small', 'premium', 'fast'],
    }
    allowVerdict = () => false // 池外：isModelAllowed 拒
    const notice = model.globalModelRejectedNotice()
    expect(notice).toBeDefined()
    expect(notice).toContain('deepseek-v4-pro')
    expect(notice).toContain('default')
  })

  test('池内模型 → undefined（恒等锚，零行为变更）', () => {
    controlledSettings = { model: 'small', availableModels: ['small', 'premium', 'fast'] }
    allowVerdict = () => true // 池内：isModelAllowed 放行
    expect(model.globalModelRejectedNotice()).toBeUndefined()
  })

  test('未配置 settings.model → undefined（恒等锚）', () => {
    controlledSettings = {}
    allowVerdict = () => true
    expect(model.globalModelRejectedNotice()).toBeUndefined()
  })

  test('settings.model 为空串 → undefined（falsy 支）', () => {
    controlledSettings = { model: '' }
    allowVerdict = () => true
    expect(model.globalModelRejectedNotice()).toBeUndefined()
  })
})
