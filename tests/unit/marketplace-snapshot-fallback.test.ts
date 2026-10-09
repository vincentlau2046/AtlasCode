/**
 * W-opt 可信专项 0.1.46 三源波 S3（#301）· manifest 快照兜底判别单测。
 *
 * 判别面（mutation-red）：
 *   - installBuiltinSnapshotFallback 物化目录 + 写 registry（directory 源，
 *     installLocation 落在 snapshot root 下）——删任一环节即红；
 *   - 幂等：重复兜底 = registry 单一条目（无重复 key）；
 *   - isBuiltinSnapshotEntry 三态：snapshot 条目 true / git 条目 false /
 *     root 外 directory 条目 false（false 漏判 = 活克隆被误判快照态 →
 *     already_installed 短路逻辑错向）；
 *   - 非 3 源 key → no_snapshot（不误兜底）；
 *   - removeBuiltinSnapshotDir 清孤儿目录（活克隆成功支依赖）。
 * 分层纪律：真 fs 但全程沙箱化 —— ATLAS_PLUGIN_CACHE_DIR 指 os.tmpdir()
 * 临时目录（getPluginsDirectory 非 memoize，env 每次调用生效），零网络、
 * 不触碰真实 ~/.atlas；env 操纵 try/finally 还原。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getBuiltinSnapshotDir,
  getBuiltinSnapshotRoot,
  installBuiltinSnapshotFallback,
  isBuiltinSnapshotEntry,
  removeBuiltinSnapshotDir,
} from '../../src/tui/utils/plugins/marketplaceSnapshotFallback.js'
import {
  loadKnownMarketplacesConfig,
} from '../../src/tui/utils/plugins/marketplaceManager.js'
import type { KnownMarketplace } from '../../src/tui/utils/plugins/schemas.js'

const ENV_KEY = 'ATLAS_PLUGIN_CACHE_DIR'
let sandbox: string
let prevEnv: string | undefined

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'atlas-snap-fallback-'))
  prevEnv = process.env[ENV_KEY]
  process.env[ENV_KEY] = sandbox
})

afterEach(async () => {
  if (prevEnv === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = prevEnv
  await rm(sandbox, { recursive: true, force: true })
})

describe('installBuiltinSnapshotFallback 物化 + 注册', () => {
  test('atlas-plugins：目录物化（atlas-plugin/marketplace.json）+ registry 条目（directory 源）', async () => {
    const res = await installBuiltinSnapshotFallback('atlas-plugins')
    expect(res.ok).toBe(true)

    const manifestPath = join(
      getBuiltinSnapshotDir('atlas-plugins'),
      'atlas-plugin',
      'marketplace.json',
    )
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
    expect(manifest.name).toBe('atlas-plugins')
    expect(manifest.plugins.length).toBe(24)

    const known = await loadKnownMarketplacesConfig()
    const entry = known['atlas-plugins']
    expect(entry).toBeDefined()
    expect(entry.source).toEqual({
      source: 'directory',
      path: getBuiltinSnapshotDir('atlas-plugins'),
    })
    expect(entry.installLocation).toBe(getBuiltinSnapshotDir('atlas-plugins'))
  })

  test('3 源全可物化（agent-skills / claude-plugins-official 保留名同样落 directory 源）', async () => {
    for (const key of ['agent-skills', 'claude-plugins-official']) {
      const res = await installBuiltinSnapshotFallback(key)
      expect(res.ok, key).toBe(true)
      const known = await loadKnownMarketplacesConfig()
      expect(known[key]?.source.source).toBe('directory')
    }
  })

  test('幂等：二次兜底不产生重复 registry 条目', async () => {
    await installBuiltinSnapshotFallback('atlas-plugins')
    await installBuiltinSnapshotFallback('atlas-plugins')
    const known = await loadKnownMarketplacesConfig()
    expect(Object.keys(known).filter(k => k === 'atlas-plugins').length).toBe(
      1,
    )
  })
})

describe('兜底失败面', () => {
  test('非 3 源 key → no_snapshot（不误兜底）', async () => {
    const res = await installBuiltinSnapshotFallback('no-such-market')
    expect(res).toEqual({ ok: false, reason: 'no_snapshot' })
  })
})

describe('isBuiltinSnapshotEntry 三态判别', () => {
  test('snapshot 条目 = true（directory 源 + installLocation 在 snapshot root 下）', async () => {
    await installBuiltinSnapshotFallback('atlas-plugins')
    const known = await loadKnownMarketplacesConfig()
    expect(isBuiltinSnapshotEntry(known['atlas-plugins']!)).toBe(true)
  })

  test('git 源条目 = false（活克隆不得误判快照态）', () => {
    const entry: KnownMarketplace = {
      source: { source: 'github', repo: 'anthropics/claude-plugins-official' },
      installLocation: join(getBuiltinSnapshotRoot(), 'claude-plugins-official'),
      lastUpdated: new Date().toISOString(),
    }
    expect(isBuiltinSnapshotEntry(entry)).toBe(false)
  })

  test('root 外 directory 条目 = false（用户自管本地源不属快照）', () => {
    const entry: KnownMarketplace = {
      source: { source: 'directory', path: '/home/u/local-market' },
      installLocation: '/home/u/local-market',
      lastUpdated: new Date().toISOString(),
    }
    expect(isBuiltinSnapshotEntry(entry)).toBe(false)
  })
})

describe('removeBuiltinSnapshotDir 孤儿清理', () => {
  test('物化后可删，删除后目录不复存在', async () => {
    await installBuiltinSnapshotFallback('atlas-plugins')
    const dir = getBuiltinSnapshotDir('atlas-plugins')
    expect((await stat(dir)).isDirectory()).toBe(true)
    await removeBuiltinSnapshotDir('atlas-plugins')
    let missing = false
    try {
      await stat(dir)
    } catch {
      missing = true
    }
    expect(missing).toBe(true)
  })

  test('目录本不存在时静默 no-op（不抛）', async () => {
    await expect(
      removeBuiltinSnapshotDir('never-materialized'),
    ).resolves.toBeUndefined()
  })
})
