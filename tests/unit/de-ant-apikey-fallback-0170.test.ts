/**
 * 0.1.70 块 H（anthropic fallback 根除波，工单 §0 H-1/H-2）：
 * 全局 apiKey 回落链断 anthropic keychain/OAuth + settings 模型池轮询核验判别单测。
 *
 * 被测能力：
 *  - H-1（src/modelprovider/roles.ts getRoleConfig + src/tui/config/settings-adapter.ts）：
 *    per-role apiKey 缺失面 = getGlobalApiKey 全局回落**断链**（修前 = 回落
 *    getApiKeyFromConfigOrMacOSKeychain → macOS keychain anthropic claude.ai
 *    OAuth token → api.anthropic.com → 403 "not enough quota to pre-consume"
 *    根因链；修后 = 零调用 + undefined 显形，由 providers 表 resolveModel(ref).apiKey
 *    兜底 = 纯 settings.json 链，零 anthropic OAuth 回落）。
 *    per-role apiKey 已设面 + env 优先面 = 恒等锚（精确同值，不落 global）。
 *  - H-2（roles.ts getRoleModels/getRoleModel + settings-adapter 面核验）：
 *    settings 模型池水平轮询 = modelRoles.<role>.models 池 + providers 表
 *    normalizeRef（零 anthropic 硬编码 ref 注入）；D-3 摘要 fallback =
 *    getRoleModel('small') 走 settings 池（零 anthropic，Main 定项① = 本波核验
 *    非池轮询行为变更）。
 *
 * 判别信号（修前红→绿）：
 *  - H-1 红 = per-role apiKey 缺失面 getGlobalApiKey 被调用（1 次，OAuth token 泄漏
 *    面）；绿 = 零调用 + apiKey undefined（providers 表兜底显形）。
 *  - H-1 adapter 守卫红 = mock keychain OAuth token 在场 → getGlobalApiKey 返
 *    OAuth token；绿 = 返 undefined（不读 keychain）。
 *
 * 分层纪律：unit 层——roles.ts 经 setEndpointConfigSource 真实注入缝（fake source
 * 带调用计数，非 tautology = 断言回落链行为非 fake 自证）；settings-adapter 守卫面
 * 经 mock.module 最小替身（隔离进程 + 仅 settings-adapter 消费这两个模块，
 * mock-module-export-surface 双身惯例的窄面豁免——auth/settings 重图不入 unit
 * 进程，替身只供 settings-adapter 实际消费的导出面）。零网络 / 零盘 / 零模型。
 */
import { describe, test, expect, mock, afterEach } from 'bun:test'
import {
  getRoleConfig,
  getRoleModels,
  getRoleModel,
  resolveModel,
  setEndpointConfigSource,
  resetEndpointConfigSource,
} from '../../src/modelprovider/roles.js'

/** fake EndpointConfigSource（getGlobalApiKey 调用计数 = 回落链断没断的判别信号）。 */
function makeFakeSource(roleSetting: any, providers: any) {
  const calls = { globalApiKey: 0 }
  const source = {
    getRoleSetting: () => roleSetting,
    getProviders: () => providers,
    getGlobalApiKey: () => {
      calls.globalApiKey++
      return 'oauth-token'
    },
  }
  return { calls, source }
}

const PROVIDERS = {
  iff: {
    baseURL: 'http://iff.local:9090',
    apiKey: 'iff-key',
    models: [{ id: 'Qwen38-27B-TXT' }, { id: 'glm' }],
  },
}

afterEach(() => {
  resetEndpointConfigSource()
  delete process.env.ATLAS_SMALL_API_KEY
})

describe('H-1 全局 apiKey 回落链断 anthropic（getRoleConfig 面）', () => {
  test('① per-role apiKey 缺失面 = getGlobalApiKey 回落断链（修前 1 次调用红 → 修后 0 次绿）+ providers 表兜底面', () => {
    const { calls, source } = makeFakeSource({}, PROVIDERS)
    setEndpointConfigSource(source as never)
    // 修前红：apiKey undefined → L97 回落 getGlobalApiKey（= OAuth token 泄漏面）
    // 修后绿：零调用 + undefined 显形
    expect(getRoleConfig('small').apiKey).toBeUndefined()
    expect(calls.globalApiKey).toBe(0)
    // providers 表 per-provider apiKey 兜底面（chat 面 resolveModel 消费，纯 settings 链）
    const entry = resolveModel('iff/Qwen38-27B-TXT')
    expect(entry?.apiKey).toBe('iff-key')
    expect(entry?.baseURL).toBe('http://iff.local:9090')
  })

  test('② per-role apiKey 已设面恒等锚 = roleSetting.apiKey 精确同值（不落 global）', () => {
    const { calls, source } = makeFakeSource(
      { apiKey: 'role-key', models: ['iff/Qwen38-27B-TXT'] },
      PROVIDERS,
    )
    setEndpointConfigSource(source as never)
    expect(getRoleConfig('small').apiKey).toBe('role-key')
    expect(calls.globalApiKey).toBe(0)
  })

  test('③ env 优先面 = ATLAS_SMALL_API_KEY 胜过 settings（Main 定项③ 保留，零 global）', () => {
    const { calls, source } = makeFakeSource({}, PROVIDERS)
    setEndpointConfigSource(source as never)
    process.env.ATLAS_SMALL_API_KEY = 'env-key'
    try {
      expect(getRoleConfig('small').apiKey).toBe('env-key')
    } finally {
      delete process.env.ATLAS_SMALL_API_KEY
    }
    expect(calls.globalApiKey).toBe(0)
  })
})

describe('H-1 settings-adapter getGlobalApiKey 不读 keychain 守卫（OAuth token 在场仍返 undefined）', () => {
  // mock.module 最小替身（隔离进程窄面豁免，见头注）：auth 面 mock 出
  // keychain OAuth token 在场（修前 adapter 会把它返给回落链 = 403 根因面）。
  mock.module('../../src/tui/utils/auth.js', () => ({
    getApiKeyFromConfigOrMacOSKeychain: () => ({ key: 'oauth-token', source: 'keychain' }),
    getAuthTokenSource: () => 'keychain',
  }))
  mock.module('../../src/tui/utils/settings/settings.js', () => ({
    getSettings_DEPRECATED: () => ({ modelRoles: {}, providers: {} }),
  }))

  test('④ mock keychain OAuth token 在场 → getGlobalApiKey 返 undefined（不返 OAuth token；修前红 = 返 oauth-token）', async () => {
    const { createSettingsAdapter } = await import('../../src/tui/config/settings-adapter.js')
    expect(createSettingsAdapter().getGlobalApiKey()).toBeUndefined()
  })
})

describe('H-2 settings 模型池轮询核验（零 anthropic 硬编码 ref 注入）', () => {
  test('⑤ getRoleModels = modelRoles.<role>.models 池（零 anthropic/claude ref）+ D-5b fallbackModel 池末位去重不变', () => {
    const { source } = makeFakeSource(
      { models: ['iff/Qwen38-27B-TXT', 'iff/glm'] },
      PROVIDERS,
    )
    setEndpointConfigSource(source as never)
    const refs = getRoleModels('small')
    expect(refs).toEqual(['iff/Qwen38-27B-TXT', 'iff/glm'])
    // 架构一致性面：池内零 anthropic 硬编码 ref（de-ant 核验守卫）
    expect(refs.some(r => /anthropic|claude/i.test(r))).toBe(false)
    // D-5b（0.1.59）fallbackModel 池末位（不在池内 → 追加；在池内 → 去重）行为不变
    expect(getRoleModels('small', undefined, 'iff/extra')).toEqual([
      'iff/Qwen38-27B-TXT',
      'iff/glm',
      'iff/extra',
    ])
    expect(getRoleModels('small', undefined, 'iff/glm')).toEqual(['iff/Qwen38-27B-TXT', 'iff/glm'])
  })

  test('⑥ D-3 面 getRoleModel = roleSetting.model ?? 池头（settings 池，零 anthropic；Main 定项① 本波核验非池轮询变更）', () => {
    const { source } = makeFakeSource({ models: ['iff/Qwen38-27B-TXT'] }, PROVIDERS)
    setEndpointConfigSource(source as never)
    // 池头解析（resolveModel(refs[0]).modelId = providers 表查）
    expect(getRoleModel('small')).toBe('Qwen38-27B-TXT')
    // per-role model 直设优先
    const { source: s2 } = makeFakeSource(
      { model: 'iff/glm', models: ['iff/Qwen38-27B-TXT'] },
      PROVIDERS,
    )
    setEndpointConfigSource(s2 as never)
    // per-role model 直设 = ref 串原样返回（非 modelId 解析面）
    expect(getRoleModel('small')).toBe('iff/glm')
  })

  test('⑦ sessionModel 池头语义不变（会话主模型优先 + 池轮询兜底）', () => {
    const { source } = makeFakeSource(
      { models: ['iff/Qwen38-27B-TXT'] },
      PROVIDERS,
    )
    setEndpointConfigSource(source as never)
    expect(getRoleModels('small', 'iff/glm')).toEqual(['iff/glm', 'iff/Qwen38-27B-TXT'])
  })
})
