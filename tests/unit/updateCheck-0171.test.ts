/**
 * 0.1.71 块 B（用户主诉②「自动升级未实现」）判别单测。
 *
 * 三件（工单 §2）：
 *  - B-1 版本检查：getUpdateNudgeText（新版在场→nudge / 同版本·检查失败·旧版→nudge
 *    缺席恒等锚）+ resolveLatestVersion（24h 缓存新鲜=不 fetch / 过期·缺失=重查写缓存 /
 *    失败静默 latest=null）+ isUpdateCacheFresh 过期语义。
 *  - B-2 升级命令行：buildUpdateUpgradeCommand registry 段（--registry npmjs）必在场。
 *  - B-3 opt-in：isAutoUpdateOptedIn env 五态 + settings 覆盖（默认=仅提示恒等锚）。
 *
 * 分层纪律：纯函数 + 可注入 seams（内存 cache port + fake fetchLatest + 固定 nowMs）
 * —— 零网络 / 零真盘 / 零 PTY（unit 层纪律）。
 */
import { describe, test, expect } from 'bun:test'
import {
  buildUpdateUpgradeCommand,
  getUpdateNudgeText,
  isAutoUpdateOptedIn,
  isUpdateCacheFresh,
  resolveLatestVersion,
  UPDATE_NPM_REGISTRY,
  UPDATE_PKG_SPEC,
  UPDATE_CHECK_CACHE_TTL_MS,
  type UpdateCacheEntry,
  type UpdateCachePort,
} from '../../src/tui/utils/updateCheck'

/** 内存 cache port（unit 无真盘）——记录写入 + 回读。 */
function memCache(initial: UpdateCacheEntry | null = null) {
  let entry = initial
  const writes: UpdateCacheEntry[] = []
  const port: UpdateCachePort = {
    async read() {
      return entry
    },
    async write(e) {
      entry = e
      writes.push(e)
    },
  }
  return { port, writes, getEntry: () => entry }
}

// ── B-2 升级命令行（registry 段必在场，字符串级判别）────────────────────
describe('0.1.71 B-2 buildUpdateUpgradeCommand', () => {
  test('npm install -g <pkg> + registry 段恒 npmjs（npmmirror 坑固化）', () => {
    const cmd = buildUpdateUpgradeCommand()
    expect(cmd).toContain('npm install -g')
    expect(cmd).toContain(UPDATE_PKG_SPEC)
    // registry 段必在场（字符串级判别锚）
    expect(cmd).toContain('--registry')
    expect(cmd).toContain(UPDATE_NPM_REGISTRY)
    expect(UPDATE_NPM_REGISTRY).toBe('https://registry.npmjs.org')
    // 完整命令行判别
    expect(cmd).toBe(
      `npm install -g ${UPDATE_PKG_SPEC} --registry ${UPDATE_NPM_REGISTRY}`,
    )
  })
})

// ── B-1 nudge 文案（新版在场→nudge / 同·旧·失败→缺席恒等锚）────────────
describe('0.1.71 B-1 getUpdateNudgeText', () => {
  test('latest 更新于 current → nudge 含「新版本 X 可用（当前 Y）」+ 升级命令', () => {
    const text = getUpdateNudgeText('0.1.70', '0.1.71')
    expect(text).not.toBeNull()
    expect(text as string).toContain('新版本 0.1.71 可用（当前 0.1.70）')
    // B-2 命令行（registry 段）在场
    expect(text as string).toContain('--registry')
    expect(text as string).toContain(UPDATE_NPM_REGISTRY)
  })
  test('跨版本（0.1.x → 0.2.0）→ nudge 在场', () => {
    expect(getUpdateNudgeText('0.1.70', '0.2.0')).toContain('新版本 0.2.0 可用')
  })
  test('同版本 → nudge 缺席（恒等锚）', () => {
    expect(getUpdateNudgeText('0.1.71', '0.1.71')).toBeNull()
  })
  test('latest 旧于 current（降级）→ nudge 缺席', () => {
    expect(getUpdateNudgeText('0.1.71', '0.1.70')).toBeNull()
  })
  test('检查失败（latest=null）→ nudge 缺席（静默恒等锚）', () => {
    expect(getUpdateNudgeText('0.1.71', null)).toBeNull()
  })
  test('current 缺失 → nudge 缺席', () => {
    expect(getUpdateNudgeText('', '0.1.71')).toBeNull()
  })
})

// ── B-1 缓存过期语义（纯函数）────────────────────────────────────────
describe('0.1.71 B-1 isUpdateCacheFresh', () => {
  const now = 1_000_000
  test('now - checkedAtMs < TTL → 新鲜（用缓存）', () => {
    expect(isUpdateCacheFresh(now - 1000, now)).toBe(true)
    expect(isUpdateCacheFresh(now - (UPDATE_CHECK_CACHE_TTL_MS - 1), now)).toBe(true)
  })
  test('now - checkedAtMs >= TTL → 过期（重查）', () => {
    expect(isUpdateCacheFresh(now - UPDATE_CHECK_CACHE_TTL_MS, now)).toBe(false)
    expect(isUpdateCacheFresh(now - (UPDATE_CHECK_CACHE_TTL_MS + 1000), now)).toBe(false)
  })
})

// ── B-1 resolveLatestVersion（缓存优先 + 过期重查 + 失败静默；注入 seams）─
describe('0.1.71 B-1 resolveLatestVersion', () => {
  const now = 2_000_000
  test('缓存新鲜（< 24h）→ 用缓存不 fetch（fromCache=true）', async () => {
    let fetchCalls = 0
    const cache = memCache({ latest: '9.9.9', checkedAtMs: now - 1000 })
    const res = await resolveLatestVersion({
      fetchLatest: async () => {
        fetchCalls++
        return '9.9.9'
      },
      cache: cache.port,
      nowMs: now,
    })
    expect(res.fromCache).toBe(true)
    expect(res.latest).toBe('9.9.9')
    expect(fetchCalls).toBe(0) // 缓存命中不 fetch
    expect(cache.writes).toHaveLength(0) // 不写缓存
  })
  test('缓存过期（>= 24h）→ 重查 + 写缓存（fromCache=false）', async () => {
    let fetchCalls = 0
    const cache = memCache({ latest: '1.0.0', checkedAtMs: now - (UPDATE_CHECK_CACHE_TTL_MS + 1) })
    const res = await resolveLatestVersion({
      fetchLatest: async () => {
        fetchCalls++
        return '2.0.0'
      },
      cache: cache.port,
      nowMs: now,
    })
    expect(res.fromCache).toBe(false)
    expect(res.latest).toBe('2.0.0')
    expect(fetchCalls).toBe(1)
    expect(cache.writes).toHaveLength(1)
    expect(cache.getEntry()).toEqual({ latest: '2.0.0', checkedAtMs: now })
  })
  test('无缓存（缺失）→ fetch + 写缓存', async () => {
    const cache = memCache(null)
    const res = await resolveLatestVersion({
      fetchLatest: async () => '3.0.0',
      cache: cache.port,
      nowMs: now,
    })
    expect(res.latest).toBe('3.0.0')
    expect(res.fromCache).toBe(false)
    expect(cache.getEntry()?.latest).toBe('3.0.0')
  })
  test('fetch 失败 → latest=null（静默）+ 写缓存（免失败态反复打网）', async () => {
    const cache = memCache(null)
    const res = await resolveLatestVersion({
      fetchLatest: async () => null, // 模拟 npm view 失败
      cache: cache.port,
      nowMs: now,
    })
    expect(res.latest).toBeNull()
    expect(res.fromCache).toBe(false)
    expect(cache.getEntry()).toEqual({ latest: null, checkedAtMs: now })
  })
})

// ── B-3 opt-in 自动升级门（env 五态 + settings 覆盖；默认=仅提示恒等锚）──
describe('0.1.71 B-3 isAutoUpdateOptedIn', () => {
  test('默认（env 未设 + 无 settings）= false（仅提示模式，零自动自更新恒等锚）', () => {
    expect(isAutoUpdateOptedIn({} as unknown as NodeJS.ProcessEnv)).toBe(false)
  })
  test('ATLAS_AUTO_UPDATE=1 → true（opt-in 开）', () => {
    expect(isAutoUpdateOptedIn({ ATLAS_AUTO_UPDATE: '1' } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })
  test('ATLAS_AUTO_UPDATE=true → true', () => {
    expect(isAutoUpdateOptedIn({ ATLAS_AUTO_UPDATE: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })
  test('ATLAS_AUTO_UPDATE=0 → false（opt-in 关）', () => {
    expect(isAutoUpdateOptedIn({ ATLAS_AUTO_UPDATE: '0' } as unknown as NodeJS.ProcessEnv)).toBe(false)
  })
  test('ATLAS_AUTO_UPDATE=false → false', () => {
    expect(isAutoUpdateOptedIn({ ATLAS_AUTO_UPDATE: 'false' } as unknown as NodeJS.ProcessEnv)).toBe(false)
  })
  test('settings.autoUpdate=true（无 env）→ true', () => {
    expect(isAutoUpdateOptedIn({} as unknown as NodeJS.ProcessEnv, { autoUpdate: true })).toBe(true)
  })
  test('settings.autoUpdate=false（无 env）→ false', () => {
    expect(isAutoUpdateOptedIn({} as unknown as NodeJS.ProcessEnv, { autoUpdate: false })).toBe(false)
  })
  test('env 关 + settings 开 → true（settings 覆盖）', () => {
    expect(
      isAutoUpdateOptedIn({ ATLAS_AUTO_UPDATE: '0' } as unknown as NodeJS.ProcessEnv, {
        autoUpdate: true,
      }),
    ).toBe(true)
  })
})
