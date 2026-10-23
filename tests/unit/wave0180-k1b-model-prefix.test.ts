/**
 * 0.1.80 V3-1 K1-B① 判别单测 — 网关 `prefix/model` 前缀名归一（修前红）
 *
 * 根因（工单 §0 K1-B @44eafbf）：网关/自定义端点的请求模型名常带
 * `provider/model` 前缀形（如 `volc/qwen3-235b`），而用户配置面（settings
 * effortByModel / autoCompactWindow per-model 键 / provider models[].id）
 * 均以裸名（bare id）为键。全链查表面 = case-insensitive/精确匹配 → 前缀名
 * miss → ①/effort 档位失忆 ②/autocompact 档位回落 default ③压缩窗位计算
 * getProviderContextWindow miss → HARD_DEFAULT_CONTEXT_WINDOW 262144 错窗
 * （提前/误判压缩阈值）。
 *
 * 修法（本波）：basename 回落归一——查表面先精确匹配（修前语义恒等，零回归
 * 锚），miss 后剥 `prefix/` 取 basename 再匹配；单一事实源 =
 * modelprovider stripProviderPrefix + engine lookupAutoCompactWindowSetting。
 *
 * 纯函数测试：零网络/零磁盘/零 PTY；接缝 = setEndpointConfigSource
 * （modelprovider 注入窗口）+ setEffortByModelSource（per-model 记忆源）。
 * 修前红锚：每个 describe 的「前缀名」用例在 44eafbf 基线红（basename 回落
 * 缺失）；「裸名/零回归」用例修前修后恒绿。
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  resolveAutoCompactWindow,
  type AutoCompactWindowSettingLike,
} from '../../src/engine/context/autoCompactWindow'
import {
  HARD_DEFAULT_CONTEXT_WINDOW,
  resetEndpointConfigSource,
  setEndpointConfigSource,
  setEffortByModelSource,
  resolveAppliedEffort,
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

afterEach(() => {
  resetEndpointConfigSource()
  setEffortByModelSource(null)
})

describe('K1-B① /autocompact 档位键（resolveAutoCompactWindow）', () => {
  const map: AutoCompactWindowSettingLike = {
    [BARE]: { kind: 'window', tokens: 100_000 },
    [`other/${BARE}`]: { kind: 'off' },
  }

  test('前缀名请求 → 命中裸名键档位（修前红：回落 default/缺省）', () => {
    const res = resolveAutoCompactWindow(map, PREFIXED)
    expect(res.windowOverride).toBe(100_000)
  })

  test('裸名请求 → 修前语义恒等（零回归锚）', () => {
    const res = resolveAutoCompactWindow(map, BARE)
    expect(res.windowOverride).toBe(100_000)
  })

  test('精确前缀键优先于 basename 回落（显式前缀键不被回落遮蔽）', () => {
    // map 含 `other/${BARE}` off 档；请求 `other/qwen3-235b` 精确命中 off，
    // 请求 `volc/...` 走 basename 命中 window 档——两键并存各取己档
    expect(
      resolveAutoCompactWindow(map, `other/${BARE}`).autoCompactDisabled,
    ).toBe(true)
    expect(
      resolveAutoCompactWindow(map, PREFIXED).autoCompactDisabled,
    ).toBeUndefined()
  })

  test('无匹配 → default 键回落语义恒等（零回归锚）', () => {
    const res = resolveAutoCompactWindow(
      { default: { kind: 'pct', pct: 50 } },
      'unrelated/model-x',
    )
    expect(res.pctOverride).toBe(50)
  })
})

describe('K1-B① 压缩窗位计算（getProviderContextWindow basename 回落）', () => {
  test('前缀名请求 → 命中声明窗位（修前红：miss → 262144 错窗）', async () => {
    withDeclaredProvider()
    const { getProviderContextWindow } = await import(
      '../../src/modelprovider/capabilities'
    )
    expect(getProviderContextWindow(PREFIXED)).toBe(DECLARED_WINDOW)
  })

  test('裸名请求 → 修前语义恒等（零回归锚）', async () => {
    withDeclaredProvider()
    const { getProviderContextWindow } = await import(
      '../../src/modelprovider/capabilities'
    )
    expect(getProviderContextWindow(BARE)).toBe(DECLARED_WINDOW)
  })

  test('未声明模型 → HARD_DEFAULT_CONTEXT_WINDOW 回落恒等', async () => {
    withDeclaredProvider()
    const { getProviderContextWindow } = await import(
      '../../src/modelprovider/capabilities'
    )
    expect(getProviderContextWindow('undeclared-y')).toBeUndefined()
    expect(HARD_DEFAULT_CONTEXT_WINDOW).toBe(262_144)
  })
})

describe('K1-B① /effort 档位键（resolveAppliedEffort per-model 记忆）', () => {
  test('前缀名请求 → 命中裸名键档位（修前红：记忆失忆回落 appState/default）', () => {
    setEffortByModelSource(() => ({ [BARE]: 'high' }))
    expect(resolveAppliedEffort(PREFIXED, undefined)).toBe('high')
  })

  test('裸名请求 → 修前语义恒等（零回归锚）', () => {
    setEffortByModelSource(() => ({ [BARE]: 'high' }))
    expect(resolveAppliedEffort(BARE, undefined)).toBe('high')
  })

  test('前缀名大小写不敏感（existing case-insensitive 语义在 basename 面保留）', () => {
    setEffortByModelSource(() => ({ [BARE]: 'high' }))
    expect(resolveAppliedEffort('Volc/Qwen3-235B', undefined)).toBe('high')
  })

  test('无匹配 → 不误取他模型档（basename 回落不引入跨模型泄漏）', () => {
    setEffortByModelSource(() => ({ [BARE]: 'high' }))
    // `volc/other-model` basename = other-model ≠ qwen3-235b → 不命中
    const res = resolveAppliedEffort('volc/other-model', undefined)
    expect(res).not.toBe('high')
  })
})
