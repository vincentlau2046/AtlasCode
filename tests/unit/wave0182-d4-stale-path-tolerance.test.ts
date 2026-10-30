/**
 * 0.1.82 K3-D D4 判别关账单测（上游 296）：跨 OS 陈旧绝对路径容错。
 *
 * 判别结论（2026-10-30，九面逐一核验，工单 0.2 表 D4 行留痕）：上游 296
 * 「macOS 启动挂起：插件路径从 Linux 拷来指向 /home」的挂起前提在本仓
 * 结构性不存在——持久化绝对路径（installed_plugins.json 的 installPath /
 * known_marketplaces.json 的 installLocation）全部消费面 fail-fast 或自愈：
 *  (1) 插件装载 cache-only：pathExists 守卫 → plugin-cache-miss error+skip
 *      （pluginLoader.ts loadPluginFromMarketplaceEntryCacheOnly）
 *  (2) 插件装载 full：从市场 catalog 重拷自愈；catalog null → plugin-not-found
 *  (3) 市场 refresh：remote 源 installLocation 在 cache dir 外 → 抛错带
 *      remove+re-add 指引（gh-32793/gh-32661 守卫，文案显式点名 cross-platform
 *      path writes，先于任何 git/网络面）
 *  (4) 市场 re-add 覆盖：cache dir 外 → 跳过 rm 清理 + 覆盖条目自愈
 *  (5) git pull-first：路径缺失 gitPull 非零 → rm+re-clone（timeout 有界）
 *  (6) 读取面：getMarketplaceCacheOnly try-catch → null；getMarketplace
 *      缓存读败 → re-fetch 自愈 + legacy 相对路径守卫指引先例
 *  (7) seed 面：installLocation 从 runtime seedDir 重算，不信任 seed 存值
 *  (8) watch 面：mtimeAwareMemoize 只 watch 两个 HOME 派生 registry JSON
 *      （statSync try-catch -1 sentinel），不消费 JSON 内路径
 *  (9) startup 批量：per-marketplace catalog null + per-plugin allSettled 隔离
 *
 * 裁定：排除候补登记（无修面——工单行「跨 OS 陈旧绝对路径校验未核」→
 * 已核：在场且显式覆盖 cross-platform 场景）+ 锁最承重可测面 = (3) remote
 * 守卫（安全面：拒绝在 cache dir 外的陈旧路径上跑 git pull / fs.rm——
 * 上游 296 的实际危害面）。行为已在场 → 验收锁固化非 RED 判别（K3-B2/B5-1
 * 与 0.1.77 G-1~G-7 先例）；(1)(2)(4)-(9) 无单测面（模块私有 / 全链 harness
 * 不成比例），以本头注登记。
 *
 * 分层纪律：ATLAS_PLUGIN_CACHE_DIR 指临时沙箱（getKnownMarketplacesFile /
 * getMarketplacesCacheDir 逐次读 env，真 fs 零 mock，marketplace-registry-rmw
 * 先例），无 mock.module，零网络（守卫先于 git/网络面；directory 支只读验证）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const CACHE_DIR_ENV = 'ATLAS_PLUGIN_CACHE_DIR'

const { refreshMarketplace, updateKnownMarketplacesConfig } = await import(
  '../../src/tui/utils/plugins/marketplaceManager.js'
)

/** 跨 OS 陈旧形状：另一 OS 的 /home 绝对路径（本机 cache dir 之外）。 */
const STALE_REMOTE_ENTRY = {
  source: { source: 'github', repo: 'example/example' },
  installLocation: '/home/other-os/.atlas/plugins/marketplaces/stale-remote',
  lastUpdated: '2026-10-30T00:00:00.000Z',
}

/** 本地 directory 源 + 陈旧 installLocation（豁免 remote 守卫的面）。 */
const STALE_LOCAL_ENTRY = {
  source: { source: 'directory', path: '/home/other-os/src/mkt' },
  installLocation: '/home/other-os/.atlas/plugins/marketplaces/stale-local',
  lastUpdated: '2026-10-30T00:00:00.000Z',
}

let sandbox: string
let prevCacheDir: string | undefined

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'atlas-d4-stale-'))
  prevCacheDir = process.env[CACHE_DIR_ENV]
  process.env[CACHE_DIR_ENV] = sandbox
  await updateKnownMarketplacesConfig(async config => {
    config['stale-remote'] = STALE_REMOTE_ENTRY
    config['stale-local'] = STALE_LOCAL_ENTRY
    return config
  })
})

afterEach(async () => {
  if (prevCacheDir === undefined) delete process.env[CACHE_DIR_ENV]
  else process.env[CACHE_DIR_ENV] = prevCacheDir
  await rm(sandbox, { recursive: true, force: true })
})

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}

describe('K3-D D4：跨 OS 陈旧绝对路径容错（refresh 守卫验收锁）', () => {
  test('github 源 + installLocation 指向异 OS /home 路径 → 守卫抛错带指引（先于 git/网络）', async () => {
    let err: Error | undefined
    try {
      await refreshMarketplace('stale-remote')
    } catch (e) {
      err = toError(e)
    }
    expect(err).toBeDefined()
    const msg = err!.message
    // 守卫文案本体（经 refresh 尾 catch 包裹后逐字保留）
    expect(msg).toContain('corrupted installLocation')
    expect(msg).toContain('/home/other-os/.atlas/plugins/marketplaces/stale-remote')
    // 跨 OS 场景显式点名 + remove/re-add 指引
    expect(msg).toContain('cross-platform')
    expect(msg).toContain('marketplace remove "stale-remote"')
  })

  test('恒等锚：directory 本地源豁免 remote 守卫 → 陈旧 installLocation 走读取验证 fail-fast（非 corrupted 文案）', async () => {
    let err: Error | undefined
    try {
      await refreshMarketplace('stale-local')
    } catch (e) {
      err = toError(e)
    }
    expect(err).toBeDefined()
    // 豁免边界：本地源不触发 cache-dir 守卫，但陈旧路径在读取验证面 fail-fast
    expect(err!.message).toContain('Failed to refresh')
    expect(err!.message).not.toContain('corrupted installLocation')
  })

  test('恒等锚：未注册市场名 → not found（守卫上游面）', async () => {
    await expect(refreshMarketplace('no-such-mkt')).rejects.toThrow(/not found/)
  })
})
