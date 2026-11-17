/**
 * 0.1.123 块（issue #3-1 代码修形：modelRoles.<role>.models 池 arm 的
 * normalizeRef 补全）：
 *
 * 背景（issue #3-1，上游 f4 triage CONFIRMED）：0.1.70 H-2 的 normalizeRef
 * 守卫只应用了 sessionModel / env / fallbackModel 三个 arm，
 * `modelRoles.<role>.models` 池 arm 原样透传 —— 裸 id（如 "Qwen38-27B-TXT"
 * 不带 `provider/` 前缀）进 resolveModel 按 provider 名解析 →
 * unknown_reference。修复 = 池 arm 过 normalizeRef（一行 + 测试）。
 *
 * 判别信号（修前红→绿，triage 判据 a/b/c）：
 *  - (a) 红 = 裸 id 在池内未加前缀（resolveModel 失败）；绿 = 加
 *    `iff/` 前缀（providers 表有该 model id）。
 *  - (b) 未知裸 id 原样透传（resolveModel undefined → chat "unknown
 *    provider" 显形），失败语义不变。
 *  - (c) 三个既有归一化 arm 码面不变：sessionModel / env 恒等（(c1)-(c3)）；
 *    fallbackModel 归一 + 追加/去重码面不变，池 bare 条目场输出随池归一
 *    连带（(c4) 直证：修形前 3 条 → 修形后 2 条，去重命中数可升）。
 *
 * 分层纪律：unit 层——roles.ts 经 setEndpointConfigSource 真实注入缝
 * （fake source，非 tautology）。零网络 / 零盘 / 零模型。
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  getRoleModels,
  resolveModel,
  setEndpointConfigSource,
  resetEndpointConfigSource,
} from '../../src/modelprovider/roles.js'

function makeFakeSource(roleSetting: any, providers: any) {
  return {
    source: {
      getRoleSetting: () => roleSetting,
      getProviders: () => providers,
      getGlobalApiKey: () => undefined,
    },
  }
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
  delete process.env.ATLAS_SMALL_MODEL
})

describe('issue #3-1 池 arm normalizeRef 补全（0.1.123）', () => {
  test('(a) 池内裸 id 命中 providers 表 model → 加前缀（修前红 = 原样透传）', () => {
    const { source } = makeFakeSource(
      { models: ['Qwen38-27B-TXT', 'glm'] },
      PROVIDERS,
    )
    setEndpointConfigSource(source as never)
    expect(getRoleModels('small')).toEqual([
      'iff/Qwen38-27B-TXT',
      'iff/glm',
    ])
  })

  test('(b) 未知裸 id 原样透传（失败语义不变：resolveModel undefined）', () => {
    const { source } = makeFakeSource(
      { models: ['nope'] },
      PROVIDERS,
    )
    setEndpointConfigSource(source as never)
    expect(getRoleModels('small')).toEqual(['nope'])
    expect(resolveModel('nope')).toBeUndefined()
  })

  test('(c1) 全 ref 形池条目恒等（不受修复影响）', () => {
    const { source } = makeFakeSource(
      { models: ['iff/Qwen38-27B-TXT'] },
      PROVIDERS,
    )
    setEndpointConfigSource(source as never)
    expect(getRoleModels('small')).toEqual(['iff/Qwen38-27B-TXT'])
  })

  test('(c2) 混合池（全 ref + 裸 id + 未知裸 id）逐条归一化，序不变', () => {
    const { source } = makeFakeSource(
      { models: ['iff/glm', 'Qwen38-27B-TXT', 'nope'] },
      PROVIDERS,
    )
    setEndpointConfigSource(source as never)
    expect(getRoleModels('small')).toEqual([
      'iff/glm',
      'iff/Qwen38-27B-TXT',
      'nope',
    ])
  })

  test('(c3) sessionModel / env arm 恒等 + fallbackModel arm 码面不变（输出随池归一连带，见 (c4)）', () => {
    const { source } = makeFakeSource(
      { models: ['Qwen38-27B-TXT'] },
      PROVIDERS,
    )
    setEndpointConfigSource(source as never)
    // sessionModel arm：既有归一化行为不变
    expect(getRoleModels('small', 'glm')).toEqual([
      'iff/glm',
      'iff/Qwen38-27B-TXT',
    ])
    // env arm：既有归一化行为不变
    process.env.ATLAS_SMALL_MODEL = 'glm'
    expect(getRoleModels('small')).toEqual(['iff/glm'])
    delete process.env.ATLAS_SMALL_MODEL
    // fallbackModel arm：归一化 + 池末位追加码面不变——fb 归一 'iff/glm' 与
    // 池（归一形）未命中 → 追加；命中场景去重（可观测条数变化）见 (c4)。
    expect(getRoleModels('small', undefined, 'glm')).toEqual([
      'iff/Qwen38-27B-TXT',
      'iff/glm',
    ])
  })

  test('(c4) 去重命中数可升（判据钉直证）：池裸 X + fallback 同名裸 X → 归一单条', () => {
    // A 扩形件（工单 §8 裁定；Main 差分观察 2026-11-17 §7-3 勘误链：池裸 id
    // 场 fallback 命中归一形后去重不追加，可观测输出 修形前 3 条 → 修形后 2 条）。
    const { source } = makeFakeSource(
      { models: ['glm', 'Qwen38-27B-TXT'] },
      PROVIDERS,
    )
    setEndpointConfigSource(source as never)
    expect(getRoleModels('small', undefined, 'glm')).toEqual([
      'iff/glm',
      'iff/Qwen38-27B-TXT',
    ])
  })
})
