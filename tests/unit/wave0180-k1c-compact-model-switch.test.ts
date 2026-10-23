/**
 * 0.1.80 V3-1 K1-C①② 判别锁 — 小窗切换摘要先用旧（大窗）模型 + 摘要调用显式化
 *
 * K1-C① (@299)：大窗 → 小窗模型切换后 auto-compact 摘要仍用小窗模型，
 * 而上下文是按大窗攒的——修法 = onChangeAppState 切换单点记录前模型
 * （recordMainLoopModelSwitch），streamCompactSummary 摘要模型解析链 =
 * modelOverride（D-3 fallback 支）→ resolveSwitchedCompactModel →
 * mainLoopModel。锁面：
 *   a) 前模型窗 > 当前模型窗 → 摘要用前模型（sticky：同压缩 PTL 重试链
 *      多次解析结果稳定——设计裁定见 compactModelSwitch.ts 头注）
 *   b) 前模型窗 ≤ 当前窗 / 无记录 / 同名 → 不替换（零回归锚）
 *   c) 前缀名经 basename 回落取裸名声明窗（K1-B① 联动链）
 *   d) previous 为空（首启/回默认）→ 清记录
 *
 * K1-C② (@301)：摘要调用显式化 = compact_start 事件加性 summaryModel
 * 字段 + spinner 文案显形实际调用模型（不"悄悄"耗额度）。
 *
 * 纯函数 + DI 缝测试：零网络/零磁盘/零 PTY；接缝 = setEndpointConfigSource
 * （modelprovider 窗位注入）。直接 import tui React-free store 模块
 * （compactWarningStore 同款先例——不拉 React 图）。
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  formatCompactStartMessage,
  recordMainLoopModelSwitch,
  resetCompactModelSwitchForTesting,
  resolveSwitchedCompactModel,
} from '../../src/tui/contextBodies/compactModelSwitch'
import {
  resetEndpointConfigSource,
  setEndpointConfigSource,
} from '../../src/modelprovider'

type EndpointConfigSource = Parameters<typeof setEndpointConfigSource>[0]

const BIG = 'qwen3-235b'
const SMALL = 'qwen3-8b'
const PREFIXED_BIG = 'volc/qwen3-235b'

/** BIG 300k 窗 / SMALL 60k 窗（getProviderContextWindow basename 回落链内）。 */
function withWindows(): void {
  setEndpointConfigSource({
    getProviders: () => ({
      testprov: {
        models: [
          { id: BIG, contextWindow: 300_000 },
          { id: SMALL, contextWindow: 60_000 },
        ],
      },
    }),
  } as unknown as EndpointConfigSource)
}

afterEach(() => {
  resetCompactModelSwitchForTesting()
  resetEndpointConfigSource()
})

describe('K1-C① 切换后前模型窗更大 → 压缩摘要先用前模型', () => {
  test('a) 大窗 → 小窗切换：摘要模型 = 前模型（sticky 多次解析稳定）', () => {
    withWindows()
    recordMainLoopModelSwitch(BIG, SMALL)
    // 修前行为（恒用 mainLoopModel）下此处为 undefined —— 判别锚
    expect(resolveSwitchedCompactModel(SMALL)).toBe(BIG)
    // sticky-peek：同压缩 PTL 截头重试链多次进 streamCompactSummary
    // 解析结果不漂移（one-shot 消费会让重试回落小窗模型）
    expect(resolveSwitchedCompactModel(SMALL)).toBe(BIG)
  })

  test('b) 小→大切换 / 无记录 / 同名 → 不替换（零回归锚）', () => {
    withWindows()
    // 前窗 ≤ 当前窗：本就用大模型，不替换
    recordMainLoopModelSwitch(SMALL, BIG)
    expect(resolveSwitchedCompactModel(BIG)).toBeUndefined()
    // 无记录（reset 后未切换）
    resetCompactModelSwitchForTesting()
    expect(resolveSwitchedCompactModel(SMALL)).toBeUndefined()
    // 同名切换（record 即清）
    recordMainLoopModelSwitch(BIG, BIG)
    expect(resolveSwitchedCompactModel(BIG)).toBeUndefined()
  })

  test('c) 前缀名记录 → basename 回落取裸名声明窗（K1-B① 联动）', () => {
    withWindows()
    recordMainLoopModelSwitch(PREFIXED_BIG, SMALL)
    // `volc/qwen3-235b` 精确 miss → basename 回落命中 300k 声明窗 → 换模型
    expect(resolveSwitchedCompactModel(SMALL)).toBe(PREFIXED_BIG)
  })

  test('d) previous 为空（首启/回默认）→ 清记录不误换', () => {
    withWindows()
    recordMainLoopModelSwitch(BIG, SMALL)
    recordMainLoopModelSwitch(null, BIG)
    expect(resolveSwitchedCompactModel(BIG)).toBeUndefined()
  })
})

describe('K1-C② compact_start 摘要模型显形文案', () => {
  test('有模型 → 文案含 summary 标注；无模型 → 既有文案恒等（零回归）', () => {
    expect(formatCompactStartMessage('qwen3-235b')).toBe(
      'Compacting conversation (summary: qwen3-235b)',
    )
    expect(formatCompactStartMessage(undefined)).toBe('Compacting conversation')
  })
})
