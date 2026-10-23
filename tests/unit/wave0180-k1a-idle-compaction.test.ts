/**
 * 0.1.80 V3-1 K1-A 判别锁 — 空闲压缩引擎（@299 idle compaction）
 *
 * 问题面（上游 2.1.299 语义）：200K+ 上下文闲置 ~54min 后，服务端 prompt
 * cache（TTL 1h）大概率已过期——下次请求是 cache-cold 全量重写；此时先
 * 压缩再请求 = 效益等价（cache 已冷，压缩不牺牲任何缓存命中）且省 token。
 *
 * 修法（形态裁定 = 查询期惰性判定，先例 microCompact evaluateTimeBasedTrigger，
 * 非后台 timer——不引入 TUI 后台生命周期；消费点裁定 = shouldAutoCompact
 * OR 臂：token 阈值未达时判定「闲置 ≥54min 且 ≥200K tokens」→ 触发既有
 * autoCompactIfNeeded 全路径（熔断/tracking/transcript/buildPostCompactMessages
 * 全复用，零 loop.ts 改动）。上游门自动抑制空闲臂：deps.enabled false /
 * querySource 递归守卫 / 小窗结构性不可用（F-3a）。
 *
 * 配置面：settings `idleCompaction: false` 关（默认开，对齐上游 299）；
 * env `ATLAS_IDLE_COMPACT_MIN_TOKENS` 覆写 token 下限（有效 int ≥1，
 * 无效值 guard 忽略——autoCompactWindow 同纪律）。
 *
 * 判别锚（修前红）：模块修前不存在（import 失败红）；消费面 a)（闲置
 * 60min + 210K tokens → 触发）修前恒 false。
 *
 * 阈值算术（同 K1-F 头注）：未注册模型回落 262_144；缺省 auto-compact
 * 阈值 = 229_144。idle 用例 countTokens 取 210_000 = 阈值下、200K 上。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { shouldAutoCompact } from '../../src/engine'
import {
  PROMPT_CACHE_TTL_MS,
  IDLE_COMPACT_TRIGGER_MS,
  IDLE_COMPACT_MIN_TOKENS,
  IDLE_COMPACTION_CONFIG_DEFAULTS,
  resolveIdleCompactionConfig,
  shouldIdleCompact,
  getIdleMs,
  setIdleCompactionSettingsSource,
  resetIdleCompactionForTesting,
} from '../../src/engine/context/idleCompaction'

const MIN = 60_000
/** getIdleMs 纯面测试的可注入时间源（消费面走真实 Date.now()）。 */
const NOW = Date.parse('2026-10-24T12:00:00Z')

/** 末条 assistant 消息距真实 now idleMin 分钟的消息面（消费面时间源 = Date.now）。 */
function idleMessages(idleMin: number): never[] {
  const now = Date.now()
  return [
    { type: 'user', content: 'q', timestamp: new Date(now - (idleMin + 30) * MIN).toISOString() },
    { type: 'assistant', content: [{ type: 'text', text: 'a' }], timestamp: new Date(now - idleMin * MIN).toISOString() },
  ] as never[]
}

/** 直调 shouldAutoCompact 的最小 deps（countTokens 恒返回 fixed；K1-F 同款）。 */
function compactDeps(fixedTokenCount: number, extra?: Record<string, unknown>) {
  return {
    contextWindow: 262_144,
    countTokens: () => fixedTokenCount,
    compact: () => Promise.resolve({ messages: [] }) as never,
    ...extra,
  }
}

let envSaved: string | undefined

beforeEach(() => {
  envSaved = process.env.ATLAS_IDLE_COMPACT_MIN_TOKENS
  delete process.env.ATLAS_IDLE_COMPACT_MIN_TOKENS
  resetIdleCompactionForTesting()
})

afterEach(() => {
  if (envSaved === undefined) delete process.env.ATLAS_IDLE_COMPACT_MIN_TOKENS
  else process.env.ATLAS_IDLE_COMPACT_MIN_TOKENS = envSaved
  resetIdleCompactionForTesting()
})

// ── 常量与纯 resolver ───────────────────────────────────────────────────────

describe('K1-A 常量锁（上游 2.1.299 语义）', () => {
  test('① cache TTL 1h / 触发 54min / token 下限 200K / 默认开', () => {
    expect(PROMPT_CACHE_TTL_MS).toBe(3_600_000)
    expect(IDLE_COMPACT_TRIGGER_MS).toBe(3_240_000)
    expect(IDLE_COMPACT_MIN_TOKENS).toBe(200_000)
    expect(IDLE_COMPACTION_CONFIG_DEFAULTS).toEqual({ enabled: true, minTokens: 200_000 })
  })
})

describe('K1-A resolveIdleCompactionConfig（settings ⊕ env 合并纪律）', () => {
  test('② 缺省 = 开 + 200K（默认开裁定）', () => {
    expect(resolveIdleCompactionConfig(undefined, undefined)).toEqual({ enabled: true, minTokens: 200_000 })
  })

  test('③ settings false → 关（idleCompaction: false 面唯一关闭口）', () => {
    expect(resolveIdleCompactionConfig(false, undefined).enabled).toBe(false)
    expect(resolveIdleCompactionConfig(null, undefined).enabled).toBe(true)
  })

  test('④ env 有效 int ≥1 覆写 minTokens；无效值 guard 忽略', () => {
    expect(resolveIdleCompactionConfig(undefined, '150000').minTokens).toBe(150_000)
    expect(resolveIdleCompactionConfig(undefined, '1').minTokens).toBe(1)
    // 无效：非数字 / 0 / 负 / 小数 → 忽略（raw 注入安全，不生效不炸）
    expect(resolveIdleCompactionConfig(undefined, 'abc').minTokens).toBe(200_000)
    expect(resolveIdleCompactionConfig(undefined, '0').minTokens).toBe(200_000)
    expect(resolveIdleCompactionConfig(undefined, '-5').minTokens).toBe(200_000)
    expect(resolveIdleCompactionConfig(undefined, '1.5').minTokens).toBe(200_000)
    // env 只管下限，不开关 enabled
    expect(resolveIdleCompactionConfig(false, '150000').enabled).toBe(false)
  })
})

describe('K1-A shouldIdleCompact 纯谓词（触发条件矩阵）', () => {
  const CFG = { enabled: true, minTokens: 200_000 }
  test('⑤ enabled × idle × tokens 全达标才触发', () => {
    expect(shouldIdleCompact(CFG, IDLE_COMPACT_TRIGGER_MS, 200_000)).toBe(true)
    expect(shouldIdleCompact(CFG, IDLE_COMPACT_TRIGGER_MS + 1, 250_000)).toBe(true)
    expect(shouldIdleCompact(CFG, IDLE_COMPACT_TRIGGER_MS - 1, 250_000)).toBe(false) // 闲置未达标
    expect(shouldIdleCompact(CFG, IDLE_COMPACT_TRIGGER_MS, 199_999)).toBe(false) // token 未达标
    expect(shouldIdleCompact({ enabled: false, minTokens: 200_000 }, IDLE_COMPACT_TRIGGER_MS, 250_000)).toBe(false)
  })

  test('⑥ idleMs / totalTokens 非 finite → 不触发（保守放行：压缩不可逆，缺判定依据不压）', () => {
    expect(shouldIdleCompact(CFG, Number.NaN, 250_000)).toBe(false)
    expect(shouldIdleCompact(CFG, Number.POSITIVE_INFINITY, 250_000)).toBe(false)
    expect(shouldIdleCompact(CFG, IDLE_COMPACT_TRIGGER_MS, Number.NaN)).toBe(false)
  })
})

describe('K1-A getIdleMs（末条 assistant 时间戳 gap；时间源注入）', () => {
  test('⑦ gap = now − 末条 assistant timestamp；无 assistant / 非法时间戳 → NaN（不可判闲置）', () => {
    const fixed = (idleMin: number): never[] =>
      [
        { type: 'user', content: 'q', timestamp: new Date(NOW - (idleMin + 30) * MIN).toISOString() },
        { type: 'assistant', content: 'a', timestamp: new Date(NOW - idleMin * MIN).toISOString() },
      ] as never[]
    expect(getIdleMs(fixed(60), NOW)).toBe(60 * MIN)
    expect(getIdleMs(fixed(10), NOW)).toBe(10 * MIN)
    // 无 assistant（纯 user 面）→ 不可判 → NaN
    expect(getIdleMs([{ type: 'user', content: 'q' }] as never[], NOW)).toBe(Number.NaN)
    // 时间戳缺失/epoch 0（microCompact 同保守语义）→ NaN
    expect(getIdleMs([{ type: 'assistant', content: 'a', timestamp: 0 }] as never[], NOW)).toBe(Number.NaN)
    expect(getIdleMs([{ type: 'assistant', content: 'a' }] as never[], NOW)).toBe(Number.NaN)
  })
})

// ── 消费面：shouldAutoCompact OR 臂（修前红） ──────────────────────────────

describe('K1-A shouldAutoCompact 空闲压缩 OR 臂', () => {
  test('a) 闲置 60min + 210K（阈值 229_144 下、200K 上）→ 触发（修前恒 false）', async () => {
    const hit = await shouldAutoCompact(idleMessages(60), compactDeps(210_000))
    expect(hit).toBe(true)
  })

  test('b) 闲置 10min（cache 大概率未过期）→ 不触发', async () => {
    const miss = await shouldAutoCompact(idleMessages(10), compactDeps(210_000))
    expect(miss).toBe(false)
  })

  test('c) token 100K（下限未达）→ 不触发', async () => {
    const miss = await shouldAutoCompact(idleMessages(60), compactDeps(100_000))
    expect(miss).toBe(false)
  })

  test('d) settings idleCompaction:false（源缝注入）→ 空闲臂关闭', async () => {
    setIdleCompactionSettingsSource(() => false)
    const miss = await shouldAutoCompact(idleMessages(60), compactDeps(210_000))
    expect(miss).toBe(false)
  })

  test('e) env 下限覆写：ATLAS_IDLE_COMPACT_MIN_TOKENS=150000 → 160K 闲置面触发；无效 env 忽略', async () => {
    process.env.ATLAS_IDLE_COMPACT_MIN_TOKENS = '150000'
    const hit = await shouldAutoCompact(idleMessages(60), compactDeps(160_000))
    expect(hit).toBe(true)
    // 无效 env（guard 忽略）→ 下限回落 200K → 160K 不触发
    process.env.ATLAS_IDLE_COMPACT_MIN_TOKENS = 'not-a-number'
    const miss = await shouldAutoCompact(idleMessages(60), compactDeps(160_000))
    expect(miss).toBe(false)
  })

  test('f) 全局 auto-compact 关（deps.enabled false）→ 空闲臂同被抑制（零回归锚）', async () => {
    const miss = await shouldAutoCompact(idleMessages(60), compactDeps(210_000, { enabled: false }))
    expect(miss).toBe(false)
  })

  test('g) 纯 user 面（不可判闲置）→ 不触发', async () => {
    const miss = await shouldAutoCompact(
      [{ type: 'user', content: 'q', timestamp: new Date(NOW - 120 * MIN).toISOString() }] as never[],
      compactDeps(210_000),
    )
    expect(miss).toBe(false)
  })

  test('h) 无 assistant 时间戳的旧消息面 → 不触发（保守）', async () => {
    const miss = await shouldAutoCompact(
      [{ type: 'assistant', content: 'a' }] as never[],
      compactDeps(210_000),
    )
    expect(miss).toBe(false)
  })
})
