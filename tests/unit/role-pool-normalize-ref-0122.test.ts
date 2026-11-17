/**
 * 0.1.122 块（issue #3-1 代码修形：modelRoles.<role>.models 池 arm 的
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
 *  - (c) 三个既有归一化 arm（sessionModel / env / fallbackModel）与全部
 *    既有行为不变（恒等锚）。
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

describe('issue #3-1 池 arm normalizeRef 补全（0.1.122）', () => {
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

  test('(c3) sessionModel / env / fallbackModel 三 arm 行为不变（恒等锚）', () => {
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
    // fallbackModel arm：既有归一化 + 池末位追加不变（glm 不在池内 → 追加）
    expect(getRoleModels('small', undefined, 'glm')).toEqual([
      'iff/Qwen38-27B-TXT',
      'iff/glm',
    ])
  })
})
