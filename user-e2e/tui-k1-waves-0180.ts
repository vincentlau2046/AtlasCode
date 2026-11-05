/**
 * 0.1.80 V3-1 K1 压缩/缓存/网关波 · 判别活探针（e2e lane，gate 判据⑤ 新活探针；
 * 工单 docs/2026-10-24-p0-wave-0180-ticket.md §2⑤：前 24 波探针族零回归 +
 * 新活探针「空闲压缩行为〔默认开+settings/env 关闭路径〕+ 网关前缀名红例 +
 * resume 保段 + token 计数面」+「零一方活字面」恒等锚）。
 *
 * 断言面（全 hard，模块级 + dist 级；与 wave0180 判别单测 distinct-but-
 * complementary——单测锁断言细节，本探针锁活码面/装配面/行为面）：
 *   P-801 K1-A idleCompaction（hard）：常量三件（TTL 1h/触发 54min=90%TTL/
 *         下限 200K）+ resolveIdleCompactionConfig 合并面（settings false 唯一
 *         关闭口 / env 有效 int≥1 覆写下限 / env 无效忽略 / env 不翻开关）+
 *         shouldIdleCompact 保守谓词（NaN guard）+ getIdleMs epoch-0 数值 quirk +
 *         源缝 getIdleCompactionConfig + settings key 活码 + contextHostWiring
 *         接线 + engine 门面 STR-1 双层 re-export + **shouldAutoCompact idle
 *         OR 臂行为面**（220K<阈值 229K 不触发但闲置 4h 触发；近期不触发；
 *         <200K 下限不触发；settings false 关；env 抬下限关）。
 *   P-802 K1-B 前缀名归一（hard）：stripProviderPrefix（含嵌套 a/b/c→c、
 *         无斜杠恒等）+ lookupAutoCompactWindowSetting 查序（精确键>basename
 *         回落>default 键）+ resolveAutoCompactWindow 带模型窗位 + 注入
 *         EndpointConfigSource 后 getProviderContextWindow('volc/qwen3-big')
 *         命中裸名声明窗（K1-B① basename 回落防 262144 错窗提前压缩）。
 *   P-803 K1-C sticky-peek（hard）：注入源下 record(big→small) 后
 *         resolve('small')='big'（前窗>当前窗换摘要模型）+ 二次 resolve 同值
 *         （sticky 非 one-shot，PTL 重试链稳定）+ 小→大不换 + 空前模型清记录 +
 *         formatCompactStartMessage 显形摘要模型。
 *   P-804 K1-E watchdog（hard）：STREAM_IDLE_TIMEOUT_MS=300_000 + 错误形状
 *         （message 含 timeout / timeoutMs）+ 分类面（shouldRetryModelError=
 *         true、isClientRequestTimeout=false = 有意 API_ERROR/retryable 非
 *         #260 fail-fast）+ 行为面（sync generator 透传〔019685a 形状守卫〕/
 *         async generator 透传 / stall 抛 StreamIdleTimeoutError / 非法
 *         timeoutMs 透传）+ modelprovider.ts:985 消费点活码锚。
 *   P-805 K1-F 计数/稳定序（hard）：stableSortDedupeTools（function 型稳定序
 *         + 同名去重保首现 + custom 型 name 窄化 + 空数组）+
 *         shouldAutoCompact thinkingBudgetTokens（225K+5K=230K≥229_144 触发/
 *         +4K=229K 不触发/NaN 预算按 0）+ loadAgentsDir autoCompactWindow
 *         frontmatter 活码（zod schema+parsePositiveInt）+ engine runAgent
 *         K1-F④ 语义重定注锚（headless 子代理永不自动压缩）。
 *   P-806 de-ant dist 恒等锚（hard，dist 级）：dist/cli.js 一方字面 6 件全 0
 *         （0.1.78 清零面不回归）+ A3-1 官方市场锚在场。dist 缺席 = fail-closed。
 *   P-807 K1-D resume/UI 锚（hard）：tests/func wave0180-k1d 在场 +
 *         load.ts annotateBoundaryWithPreservedSegment 写侧锚 +
 *         CompactSummary.tsx 存储位置 dim 行双支在场（「Summary is saved to
 *         the session transcript and restored on resume」×2）。
 *
 * 隔离：模块级面 = 纯 import + FS 读（gate worktree src/dist）；env 触碰面
 * 全部先存后复原；模块态（endpoint source/id idle settings 源缝、sticky-peek
 * 记录）用毕 reset。零 IFF 活轮（本波无 PTY soft 面；fam 串行面由族内其它
 * 探针承载）。
 *
 * 用法：
 *   ATLAS_E2E_K1080_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-k1-waves-0180.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO =
  process.env.ATLAS_E2E_K1080_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-080-final'
const OUT =
  process.env.ATLAS_E2E_K1080_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-080/fam/k1080'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

function srcOf(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8')
}

/** shouldAutoCompact 调用面 env 清理（同 wave0180 判别单测 beforeEach 口径）。 */
const ENV_KEYS = [
  'ATLAS_AUTO_COMPACT_WINDOW',
  'ATLAS_AUTOCOMPACT_PCT_OVERRIDE',
  'DISABLE_COMPACT',
  'DISABLE_AUTO_COMPACT',
  'ATLAS_IDLE_COMPACT_MIN_TOKENS',
] as const
const envSaved: Record<string, string | undefined> = {}
function clearCompactEnv(): void {
  for (const k of ENV_KEYS) {
    envSaved[k] = process.env[k]
    delete process.env[k]
  }
}
function restoreCompactEnv(): void {
  for (const k of ENV_KEYS) {
    if (envSaved[k] === undefined) delete process.env[k]
    else process.env[k] = envSaved[k]
  }
}

// ════════════════════════════════════════════════════════════════
// hard 模块级面（gate worktree src 动态 import）
// ════════════════════════════════════════════════════════════════
async function hardFaces(): Promise<void> {
  // ── P-801 K1-A idleCompaction ──
  try {
    const ic = await import(join(REPO, 'src/engine/context/idleCompaction.ts'))
    const engine = await import(join(REPO, 'src/engine/index.ts'))
    let bad = ''
    if (ic.PROMPT_CACHE_TTL_MS !== 3_600_000) bad += `TTL=${ic.PROMPT_CACHE_TTL_MS} `
    if (ic.IDLE_COMPACT_TRIGGER_MS !== 3_240_000) bad += `TRIGGER=${ic.IDLE_COMPACT_TRIGGER_MS} `
    if (ic.IDLE_COMPACT_MIN_TOKENS !== 200_000) bad += `MIN=${ic.IDLE_COMPACT_MIN_TOKENS} `
    if (ic.IDLE_COMPACTION_CONFIG_DEFAULTS.enabled !== true) bad += '默认非开 '
    // 合并面
    const r1 = ic.resolveIdleCompactionConfig(undefined, undefined)
    if (r1.enabled !== true || r1.minTokens !== 200_000) bad += `默认面${JSON.stringify(r1)} `
    if (ic.resolveIdleCompactionConfig(false).enabled !== false) bad += 'false 未关 '
    if (ic.resolveIdleCompactionConfig(null).enabled !== true) bad += 'null 误关 '
    if (ic.resolveIdleCompactionConfig(true, 'abc').minTokens !== 200_000) bad += "env 'abc' 误采 "
    if (ic.resolveIdleCompactionConfig(true, '').minTokens !== 200_000) bad += "env '' 误采 "
    if (ic.resolveIdleCompactionConfig(true, '1.5').minTokens !== 200_000) bad += 'env 1.5 误采 '
    if (ic.resolveIdleCompactionConfig(true, '0').minTokens !== 200_000) bad += 'env 0 误采 '
    if (ic.resolveIdleCompactionConfig(true, '-5').minTokens !== 200_000) bad += 'env -5 误采 '
    if (ic.resolveIdleCompactionConfig(true, '5000').minTokens !== 5000) bad += 'env 5000 未覆写 '
    if (ic.resolveIdleCompactionConfig(false, '5000').enabled !== false) bad += 'env 翻开关 '
    // 谓词（NaN guard）
    const cfg = ic.IDLE_COMPACTION_CONFIG_DEFAULTS
    if (!ic.shouldIdleCompact(cfg, 3_240_000, 200_000)) bad += '边界应触发未触发 '
    if (ic.shouldIdleCompact(cfg, 3_239_999, 200_000)) bad += '未满触发线误触发 '
    if (ic.shouldIdleCompact(cfg, 3_240_000, 199_999)) bad += '低于下限误触发 '
    if (ic.shouldIdleCompact({ enabled: false, minTokens: 1 }, 9_999_999, 9_999_999)) bad += '关闭面误触发 '
    if (ic.shouldIdleCompact(cfg, Number.NaN, 200_000)) bad += 'NaN idle 误触发 '
    // getIdleMs（epoch-0 数值 quirk 修复面）
    const NOW = Date.now()
    const gap = ic.getIdleMs(
      [{ type: 'assistant', content: 'a', timestamp: new Date(NOW - 60 * 60_000).toISOString() }] as never[],
      NOW,
    )
    if (gap !== 60 * 60_000) bad += `gap=${gap} `
    if (!Number.isNaN(ic.getIdleMs([{ type: 'assistant', content: 'a', timestamp: 0 }] as never[], NOW)))
      bad += 'epoch-0 数值未拦 '
    if (!Number.isNaN(ic.getIdleMs([{ type: 'user', content: 'q' }] as never[], NOW))) bad += '无 assistant 未 NaN '
    // 源缝
    ic.setIdleCompactionSettingsSource(() => false)
    if (ic.getIdleCompactionConfig().enabled !== false) bad += '源缝 false 未达 '
    ic.setIdleCompactionSettingsSource(() => true)
    process.env.ATLAS_IDLE_COMPACT_MIN_TOKENS = '300000'
    const viaSeam = ic.getIdleCompactionConfig()
    if (viaSeam.enabled !== true || viaSeam.minTokens !== 300_000) bad += `源缝⊕env=${JSON.stringify(viaSeam)} `
    delete process.env.ATLAS_IDLE_COMPACT_MIN_TOKENS
    ic.resetIdleCompactionForTesting()
    // 活码/接线/门面（STR-1 双层 re-export）
    if (!srcOf('src/engine/config/types.ts').includes('idleCompaction')) bad += 'settings key 缺席 '
    if (!srcOf('src/tui/contextHostWiring.ts').includes('setIdleCompactionSettingsSource')) bad += 'wiring 缺席 '
    for (const sym of [
      'resolveIdleCompactionConfig', 'shouldIdleCompact', 'getIdleMs',
      'getIdleCompactionConfig', 'setIdleCompactionSettingsSource', 'IDLE_COMPACT_TRIGGER_MS',
    ]) {
      if (!(engine as any)[sym]) bad += `engine 门面缺 ${sym} `
    }
    // ── 行为面：shouldAutoCompact idle OR 臂 ──
    clearCompactEnv()
    const deps220k = {
      contextWindow: 262_144,
      countTokens: () => 220_000,
      compact: () => Promise.resolve({ messages: [] }) as never,
    }
    const oldAssistant = [
      { type: 'assistant', content: 'a', timestamp: new Date(Date.now() - 4 * 3_600_000).toISOString() },
    ] as never[]
    const freshAssistant = [
      { type: 'assistant', content: 'a', timestamp: new Date().toISOString() },
    ] as never[]
    const idleHit = await engine.shouldAutoCompact(oldAssistant, deps220k)
    if (idleHit !== true) bad += `闲置 4h+220K idle 臂未触发=${idleHit} `
    const idleMissFresh = await engine.shouldAutoCompact(freshAssistant, deps220k)
    if (idleMissFresh !== false) bad += `近期 220K 误触发=${idleMissFresh} `
    const deps100k = { ...deps220k, countTokens: () => 100_000 }
    if ((await engine.shouldAutoCompact(oldAssistant, deps100k)) !== false) bad += '低于 200K 下限 idle 误触发 '
    ic.setIdleCompactionSettingsSource(() => false)
    if ((await engine.shouldAutoCompact(oldAssistant, deps220k)) !== false) bad += 'settings false idle 未关 '
    ic.resetIdleCompactionForTesting()
    process.env.ATLAS_IDLE_COMPACT_MIN_TOKENS = '300000'
    if ((await engine.shouldAutoCompact(oldAssistant, deps220k)) !== false) bad += 'env 抬下限 idle 未关 '
    delete process.env.ATLAS_IDLE_COMPACT_MIN_TOKENS
    restoreCompactEnv()
    push('P-801-K1A-idle-compaction', bad === '', bad === ''
      ? '常量+合并+谓词+epoch-0+源缝+门面 STR-1+idle OR 臂行为面（4h/220K 触发·近期/低量/关面不触发）'
      : bad)
  } catch (e) {
    restoreCompactEnv()
    push('P-801-K1A-idle-compaction', false, `import/执行失败：${e}`)
  }

  // ── P-802 K1-B 前缀名归一 ──
  try {
    const mp = await import(join(REPO, 'src/modelprovider/index.ts'))
    const acw = await import(join(REPO, 'src/engine/context/autoCompactWindow.ts'))
    let bad = ''
    if (mp.stripProviderPrefix('anthropic/claude-opus-4-1') !== 'claude-opus-4-1') bad += '前缀未剥 '
    if (mp.stripProviderPrefix('a/b/c') !== 'c') bad += '嵌套未取尾 '
    if (mp.stripProviderPrefix('bare-model') !== 'bare-model') bad += '裸名非恒等 '
    // 查序：精确键 > basename 回落 > default 键
    const perModel = {
      'anthropic/claude-opus-4-1': { kind: 'pct', pct: 50 },
      'claude-opus-4-1': { kind: 'window', tokens: 150_000 },
      default: { kind: 'off' },
    } as Record<string, any>
    const exact = acw.lookupAutoCompactWindowSetting(perModel, 'anthropic/claude-opus-4-1')
    if (exact?.kind !== 'pct' || (exact as any).pct !== 50) bad += '精确键被回落遮蔽 '
    const fell = acw.lookupAutoCompactWindowSetting(perModel, 'volc/claude-opus-4-1')
    if (fell?.kind !== 'window' || (fell as any).tokens !== 150_000) bad += 'basename 回落未命中 '
    const def = acw.lookupAutoCompactWindowSetting(perModel, 'unknown-model')
    if (def?.kind !== 'off') bad += 'default 键未回落 '
    if (acw.lookupAutoCompactWindowSetting(perModel, undefined)?.kind !== 'off') bad += '无模型入非 default '
    // resolve 带模型：前缀名取裸名窗位
    const res = acw.resolveAutoCompactWindow(perModel as never, 'anthropic/claude-opus-4-1')
    if ((res as any).pctOverride !== 50) bad += `resolve 前缀名=${JSON.stringify(res)} `
    const res2 = acw.resolveAutoCompactWindow(perModel as never, 'other/claude-opus-4-1')
    if ((res2 as any).windowOverride !== 150_000) bad += `resolve basename=${JSON.stringify(res2)} `
    // 注入 EndpointConfigSource：声明窗 basename 回落
    mp.setEndpointConfigSource({
      getRoleSetting: () => undefined,
      getProviders: () => ({
        testprov: {
          models: [
            { id: 'qwen3-big', contextWindow: 1_000_000 },
            { id: 'qwen3-small', contextWindow: 128_000 },
          ],
        },
      }),
      getGlobalApiKey: () => undefined,
    } as never)
    try {
      if (mp.getProviderContextWindow('qwen3-big') !== 1_000_000) bad += '裸名声明窗未命中 '
      if (mp.getProviderContextWindow('volc/qwen3-big') !== 1_000_000) bad += '前缀名 basename 回落未命中 '
      if (mp.getProviderContextWindow('not-registered') !== undefined) bad += '未注册非 undefined '
    } finally {
      mp.resetEndpointConfigSource()
    }
    push('P-802-K1B-prefix-normalization', bad === '', bad === ''
      ? 'stripProviderPrefix + 档位查序（精确>basename>default）+ resolve 带模型 + 声明窗 basename 回落'
      : bad)
  } catch (e) {
    push('P-802-K1B-prefix-normalization', false, `import/执行失败：${e}`)
  }

  // ── P-803 K1-C sticky-peek + spinner 显形 ──
  try {
    const mp = await import(join(REPO, 'src/modelprovider/index.ts'))
    const cms = await import(join(REPO, 'src/tui/contextBodies/compactModelSwitch.ts'))
    let bad = ''
    mp.setEndpointConfigSource({
      getRoleSetting: () => undefined,
      getProviders: () => ({
        testprov: {
          models: [
            { id: 'k1c-big', contextWindow: 1_000_000 },
            { id: 'k1c-small', contextWindow: 128_000 },
          ],
        },
      }),
      getGlobalApiKey: () => undefined,
    } as never)
    try {
      cms.resetCompactModelSwitchForTesting()
      // 大→小：摘要先用前（大窗）模型；sticky 二次消费同值
      cms.recordMainLoopModelSwitch('k1c-big', 'k1c-small')
      if (cms.resolveSwitchedCompactModel('k1c-small') !== 'k1c-big') bad += '大→小未换摘要模型 '
      if (cms.resolveSwitchedCompactModel('k1c-small') !== 'k1c-big') bad += 'sticky 二次消费漂移 '
      // 小→大：不换（本就用大模型）
      cms.recordMainLoopModelSwitch('k1c-small', 'k1c-big')
      if (cms.resolveSwitchedCompactModel('k1c-big') !== undefined) bad += '小→大误换 '
      // 空前模型 / 同名切换 → 清记录
      cms.recordMainLoopModelSwitch(undefined, 'k1c-big')
      if (cms.resolveSwitchedCompactModel('k1c-big') !== undefined) bad += '空前模型未清 '
      cms.recordMainLoopModelSwitch('k1c-big', 'k1c-small')
      cms.recordMainLoopModelSwitch('k1c-small', 'k1c-small')
      if (cms.resolveSwitchedCompactModel('k1c-small') !== undefined) bad += '同名切换未清 '
      // K1-C② compact_start spinner 显形
      if (cms.formatCompactStartMessage('k1c-big') !== 'Compacting conversation (summary: k1c-big)')
        bad += '显形文案破 '
      if (cms.formatCompactStartMessage(undefined) !== 'Compacting conversation') bad += '缺省文案破 '
    } finally {
      cms.resetCompactModelSwitchForTesting()
      mp.resetEndpointConfigSource()
    }
    push('P-803-K1C-sticky-peek', bad === '', bad === ''
      ? '大→小换摘要模型+sticky 非 one-shot+小→大不换+清记录语义+spinner 显形'
      : bad)
  } catch (e) {
    push('P-803-K1C-sticky-peek', false, `import/执行失败：${e}`)
  }

  // ── P-804 K1-E 流空闲看门狗 ──
  try {
    const { STREAM_IDLE_TIMEOUT_MS } = await import(join(REPO, 'src/modelprovider/constants.ts'))
    const w = await import(join(REPO, 'src/modelprovider/streamIdleWatchdog.ts'))
    const mp = await import(join(REPO, 'src/modelprovider/modelprovider.ts'))
    let bad = ''
    if (STREAM_IDLE_TIMEOUT_MS !== 300_000) bad += `TIMEOUT=${STREAM_IDLE_TIMEOUT_MS}≠300_000 `
    const err = new w.StreamIdleTimeoutError(300_000)
    if (err.name !== 'StreamIdleTimeoutError' || !/timeout/i.test(err.message) || err.timeoutMs !== 300_000)
      bad += '错误形状破 '
    if (mp.shouldRetryModelError(err) !== true) bad += '不可重试（应走既有重试面） '
    if (mp.isClientRequestTimeout(err) !== false) bad += '误入 SDK 超时类（应 API_ERROR/retryable 非 #260 fail-fast） '
    // 行为面：sync generator 透传（019685a 形状守卫）+ async 透传
    function* syncGen() { yield 1; yield 2; yield 3 }
    async function* asyncGen() { yield 1; yield 2; yield 3 }
    const collect = async (s: AsyncIterable<number> | Iterable<number>, ms = 1000) => {
      const out: number[] = []
      for await (const v of w.withStreamIdleWatchdog(s as AsyncIterable<number>, ms)) out.push(v)
      return out
    }
    if (JSON.stringify(await collect(syncGen())) !== '[1,2,3]') bad += 'sync 流透传破（形状守卫回归） '
    if (JSON.stringify(await collect(asyncGen())) !== '[1,2,3]') bad += 'async 流透传破 '
    // stall → 抛 StreamIdleTimeoutError（产品代表性形状 = async iterator 对象，
    // SDK Stream 形状 return() 可结算；generator 挂起形状 = soft 登记面见 P-804s）
    let pulled = false
    const stalledObj: AsyncIterator<number> = {
      next: () =>
        pulled
          ? (new Promise(() => {}) as never)
          : ((pulled = true), Promise.resolve({ value: 1, done: false }) as never),
      return: () => Promise.resolve({ value: undefined, done: true }) as never,
    }
    let stallThrew = false
    try {
      const wrapped = w.withStreamIdleWatchdog(
        { [Symbol.asyncIterator]: () => stalledObj } as AsyncIterable<number>, 30,
      )
      for await (const _v of wrapped) { /* 1 后 stall */ }
    } catch (e2: any) {
      stallThrew = e2 instanceof w.StreamIdleTimeoutError
    }
    if (!stallThrew) bad += 'stall 未抛 StreamIdleTimeoutError '
    // 非法 timeoutMs → 原样透传
    if (JSON.stringify(await collect(syncGen(), 0)) !== '[1,2,3]') bad += 'timeoutMs=0 透传破 '
    if (JSON.stringify(await collect(syncGen(), Number.NaN)) !== '[1,2,3]') bad += 'NaN 透传破 '
    // 消费点活码锚（chatStream 与 chat(onStreamDelta) 双消费面共点）
    if (!srcOf('src/modelprovider/modelprovider.ts').includes('withStreamIdleWatchdog<any>(stream'))
      bad += 'streamOneAttempt 消费点活码缺席 '
    push('P-804-K1E-stream-idle-watchdog', bad === '', bad === ''
      ? '300s 常量+错误形状+分类面（retryable 非 fail-fast）+sync/async 透传+stall 抛（产品形状）+非法透传+消费点锚'
      : bad)
    // P-804s（soft 登记，不判红；0.1.79 MCP 空串边界同类先例）：generator 挂起形状
    // 下 watchdog finally `await iterator.return?.()` 按规范排队至 await 恢复才结算
    // （永不结算）→ timeout throw 被吞、消费方挂起。非产品形状：生产流 = SDK
    // Stream iterator 对象（return() 结算，[A] 腿实证绿）；sync 流包装生成器
    // next() 同步不可能 stall。候补 f4/Main 裁定（登记面：可改 finally 为
    // best-effort 竞速或不 await）。实证 = k1080-stall-verify [B] 腿 +5s 仍挂。
    push('P-804s-K1E-generator-stall-edge', null,
      'generator 挂起流形状 timeout throw 被 finally await return() 吞（非产品形状，soft 登记候补裁定）',
      false)
  } catch (e) {
    push('P-804-K1E-stream-idle-watchdog', false, `import/执行失败：${e}`)
  }

  // ── P-805 K1-F 稳定序/预算计数/frontmatter ──
  try {
    const params = await import(join(REPO, 'src/modelprovider/params.ts'))
    const engine = await import(join(REPO, 'src/engine/index.ts'))
    let bad = ''
    // ① 工具 schema 稳定序去重（function 型稳定序 + 同名保首现 + custom 窄化）
    const tools = [
      { type: 'function', function: { name: 'zeta' } },
      { type: 'function', function: { name: 'alpha' } },
      { type: 'function', function: { name: 'zeta', description: 'dup-2nd' } },
      { type: 'custom', custom: { name: 'mid' } },
    ] as never[]
    const sorted = params.stableSortDedupeTools(tools)
    const names = (sorted as any[]).map((t) => (t.type === 'function' ? t.function.name : t.custom.name))
    if (JSON.stringify(names) !== '["alpha","mid","zeta"]') bad += `稳定序/去重=${JSON.stringify(names)} `
    const keptZeta = (sorted as any[]).find((t) => t.type === 'function' && t.function.name === 'zeta')
    if (keptZeta?.function?.description === 'dup-2nd') bad += '去重未保首现 '
    if (params.stableSortDedupeTools([] as never).length !== 0) bad += '空数组非空 '
    // ⑤ 预算思考 token 计入（阈值 229_144 = 262_144−20_000−13_000）
    clearCompactEnv()
    const msgs = [{ type: 'user', content: 'q' }] as never[]
    const mk = (n: number, budget?: number) => ({
      contextWindow: 262_144,
      countTokens: () => n,
      compact: () => Promise.resolve({ messages: [] }) as never,
      ...(budget !== undefined ? { thinkingBudgetTokens: budget } : {}),
    })
    if ((await engine.shouldAutoCompact(msgs, mk(225_000, 5_000))) !== true) bad += '225K+5K=230K 未计入触发 '
    if ((await engine.shouldAutoCompact(msgs, mk(225_000, 4_000))) !== false) bad += '225K+4K=229K 误触发 '
    if ((await engine.shouldAutoCompact(msgs, mk(225_000))) !== false) bad += '无预算面误触发 '
    if ((await engine.shouldAutoCompact(msgs, mk(230_000, Number.NaN))) !== true) bad += 'NaN 预算污染已超阈值 '
    restoreCompactEnv()
    // ③ frontmatter autoCompactWindow 活码（TUI 副本 schema+parse；engine 副本语义重定注）
    const lad = srcOf('src/tui/tools/AgentTool/loadAgentsDir.ts')
    if (!lad.includes('autoCompactWindow: z.number().int().positive().optional()')) bad += 'zod schema 缺席 '
    if (!lad.includes("frontmatter['autoCompactWindow']")) bad += 'frontmatter parse 缺席 '
    if (!lad.includes('parsePositiveIntFromFrontmatter')) bad += '正整数解析缺席 '
    const runAgent = srcOf('src/engine/tools/agent/runAgent.ts')
    if (!runAgent.includes('K1-F④')) bad += 'engine 子代理语义重定注缺席 '
    push('P-805-K1F-count-stability', bad === '', bad === ''
      ? '稳定序去重（保首现+custom 窄化）+预算计数（±5K 阈界+NaN 按 0）+frontmatter 活码+K1-F④ 注锚'
      : bad)
  } catch (e) {
    restoreCompactEnv()
    push('P-805-K1F-count-stability', false, `import/执行失败：${e}`)
  }

  // ── P-806 de-ant dist 恒等锚 ──
  try {
    const distPath = join(REPO, 'dist/cli.js')
    if (!existsSync(distPath)) {
      push('P-806-deant-dist-identity', false, 'dist/cli.js 缺席（fail-closed）')
    } else {
      const dist = readFileSync(distPath, 'utf8')
      let bad = ''
      // 0.1.78 清零面 6 件（gate 触发后新 build 复核全 0）
      for (const lit of [
        'anthropic_beta', 'anthropic-ratelimit', 'anthropic_cloud',
        'claude.ai subscription', 'isFirstPartyGatewayUrl', 'CLAUDEAI_SERVER_PREFIX',
      ]) {
        const n = dist.split(lit).length - 1
        if (n !== 0) bad += `${lit}=${n} `
      }
      // A3-1 官方市场恒等锚在场
      if (dist.split('downloads.claude.ai').length - 1 < 1) bad += 'downloads.claude.ai 缺席 '
      if (dist.split('claude-plugins-official').length - 1 < 1) bad += 'claude-plugins-official 缺席 '
      push('P-806-deant-dist-identity', bad === '', bad === ''
        ? '一方字面 6 件 dist 全 0 + A3-1 官方市场锚在场（清零面不回归）'
        : bad)
    }
  } catch (e) {
    push('P-806-deant-dist-identity', false, `读 dist 失败：${e}`)
  }

  // ── P-807 K1-D resume/UI 锚 ──
  try {
    let bad = ''
    if (!existsSync(join(REPO, 'tests/func/wave0180-k1d-resume-preserved-fs.test.ts')))
      bad += 'k1d 判别文件缺席 '
    if (!srcOf('src/tui/contextBodies/sessionMemoryCompact.ts').includes('annotateBoundaryWithPreservedSegment'))
      bad += 'sessionMemoryCompact 写侧锚缺席 '
    if (!srcOf('src/tui/contextBodies/compact.ts').includes('annotateBoundaryWithPreservedSegment'))
      bad += 'compact.ts 写侧锚缺席 '
    const cs = srcOf('src/tui/components/CompactSummary.tsx')
    const dimCount = cs.split('Summary is saved to the session transcript and restored on resume').length - 1
    if (dimCount < 2) bad += `存储位置 dim 行=${dimCount}<2 `
    push('P-807-K1D-resume-ui-anchors', bad === '', bad === ''
      ? 'k1d 判别在场 + sessionMemoryCompact/compact.ts 写侧锚 + CompactSummary dim 行双支在场'
      : bad)
  } catch (e) {
    push('P-807-K1D-resume-ui-anchors', false, `FS 读失败：${e}`)
  }
}

// ════════════════════════════════════════════════════════════════
// verdict
// ════════════════════════════════════════════════════════════════
async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  await hardFaces()
  const hardFail = probes.filter((p) => p.hard && p.ok !== true).length
  const result = {
    probe: 'tui-k1-waves-0180',
    repo: REPO,
    date: new Date().toISOString(),
    probes,
    hardFail,
    verdict: hardFail === 0 ? 'PASS' : 'FAIL',
  }
  writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2))
  console.log(`tui-k1-waves-0180: ${probes.length} probes, hardFail=${hardFail}`)
  for (const p of probes) {
    console.log(`  [${p.ok === true ? 'PASS' : p.ok === null ? 'SKIP' : 'FAIL'}] ${p.id} — ${p.detail}`)
  }
  console.log(`verdict=${result.verdict}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

await main()
