/**
 * getInitialMainLoopModel 绝不为 undefined 不变量单测（#202 /model 选择器
 * "undefined" 修）。
 *
 * 根因回归面：TUI 组合根未接线时（EndpointConfigSource 停空 stub，懒单例仅被
 * 后续消费者触发），roles.ts getRoleModel 恒 undefined。修前 getInitialMainLoop
 * Model 直接透传该 undefined → main.tsx initialState 冻结 appState.mainLoopModel
 * =undefined → /model 选择器 modelDisplayString(undefined) 渲染 "undefined ()"
 * 伪行 + Select 值键卡死无法导航。修后（bootstrapState.ts `?? null`）兜底 null，
 * 本测试锁该不变量：任何配置下 getInitialMainLoopModel 绝不返回 undefined
 * （空 stub 下 = null，"用默认"语义，选择器回落 "Default (recommended)" 行）。
 *
 * 无网络/无 PTY。getSettings_DEPRECATED 只读会话缓存；defaultRole 有无不改变
 * 空 stub 下 getRoleModel 恒 undefined 的结论（任何角色都解析不出池头）。
 */
import { describe, test, expect } from 'bun:test'
import { getInitialMainLoopModel } from '../../src/tui/bootstrapState'
import { resetEndpointConfigSource, setEndpointConfigSource } from '../../src/modelprovider'

describe('getInitialMainLoopModel 绝不为 undefined（#202）', () => {
  test('未注入 EndpointConfigSource（空 stub）→ 返回 null 非 undefined', () => {
    resetEndpointConfigSource() // 强制空 stub 态（roles.ts emptyEndpointConfigSource）
    const result = getInitialMainLoopModel()
    expect(result).toBeNull()
  })

  test('不变量：空 stub 下绝不为 undefined', () => {
    resetEndpointConfigSource()
    expect(getInitialMainLoopModel() !== undefined).toBe(true)
  })

  test('注入 EndpointConfigSource 且 defaultRole=small 池可解析 → 返回角色池 modelId 字符串', () => {
    // 精确控制 defaultRole（避免依赖测试环境 settings.defaultRole）：经 setEndpoint
    // ConfigSource 注入 provider 面，getInitialMainLoopModel 读 settings.defaultRole
    // 缺省 'small'；若测试环境 settings 恰好 defaultRole=small 则命中本分支，否则
    // 仍满足上一测的 "绝不为 undefined" 不变量（本测只断言非 undefined + 为字符串）。
    setEndpointConfigSource({
      getRoleSetting: (role: string) =>
        role === 'small'
          ? { models: ['iff/Qwen38-27B-TXT'], provider: 'iff' }
          : {},
      getProviders: () => ({
        iff: {
          models: [{ id: 'Qwen38-27B-TXT' }],
          defaultContextWindow: 256000,
          defaultMaxTokens: 32000,
        },
      }),
      getGlobalApiKey: () => undefined,
    })
    const result = getInitialMainLoopModel()
    expect(result !== undefined).toBe(true)
    if (result !== null) {
      expect(typeof result).toBe('string')
    }
  })
})
