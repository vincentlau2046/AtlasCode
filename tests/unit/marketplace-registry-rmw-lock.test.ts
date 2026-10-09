/**
 * 0.1.46 三源波 gate-046 ① hard-fail 修 · registry RMW in-process 互斥
 * 判别单测（#301）。
 *
 * 背景：3 个启动 preset hook（official/atlas/ascend）fire-and-forget 并发，
 * 各自 load→mutate-own-key→save 整文件 known_marketplaces.json（非原子、
 * 无锁）→ last-writer-wins 冲掉兄弟条目（gate-046 fresh-home 复现 4/5 丢
 * atlas-plugins）。修 = marketplaceManager 模块级 promise 链锁 + 导出
 * updateKnownMarketplacesConfig(mutator)（读-改-写全程持锁）；全部 registry
 * 写点（seed 同步 / addMarketplaceSource 活路径 / fallback 支 / 官方 GCS 直写
 * / adoptOrphan / remove / setAutoUpdate）改走互斥。
 *
 * 判别面（mutation-red）：
 *   - 3 并发 RMW 各设己键（mutator 内留异步窗口）= 3/3 存活；
 *   - gate-046 复现面：3 并发快照兜底注册（agent-skills / atlas-plugins /
 *     claude-plugins-official）= 3/3 快照条目 + 3/3 目录物化；
 *   - 兜底支与用户 RMW 混跑 = 互不冲掉；
 *   - mutator 抛错 = 零写 + 锁不卡死（后续 RMW 仍可达）；
 *   - mutator 返 undefined = 幂等零写（内容不变）。
 * 分层纪律：ATLAS_PLUGIN_CACHE_DIR 指临时目录（getKnownMarketplacesFile /
 * getMarketplacesCacheDir 逐次读 env，真 fs 零 mock），无 mock.module。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const CACHE_DIR_ENV = 'ATLAS_PLUGIN_CACHE_DIR'
const REGISTRY_FILE = 'known_marketplaces.json'

const {
  loadKnownMarketplacesConfig,
  updateKnownMarketplacesConfig,
} = await import('../../src/tui/utils/plugins/marketplaceManager.js')
const {
  installBuiltinSnapshotFallback,
  getBuiltinSnapshotDir,
} = await import('../../src/tui/utils/plugins/marketplaceSnapshotFallback.js')
const { getPluginManifestDirs } = await import(
  '../../src/tui/utils/configDir.js'
)
const MANIFEST_DIR = getPluginManifestDirs()[0]

let sandbox: string
let prevCacheDir: string | undefined

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'atlas-registry-rmw-'))
  prevCacheDir = process.env[CACHE_DIR_ENV]
  process.env[CACHE_DIR_ENV] = sandbox
})

afterEach(async () => {
  if (prevCacheDir === undefined) delete process.env[CACHE_DIR_ENV]
  else process.env[CACHE_DIR_ENV] = prevCacheDir
  await rm(sandbox, { recursive: true, force: true })
})

async function readRegistry(): Promise<
  Record<
    string,
    { source: { source: string; path?: string }; installLocation: string }
  >
> {
  try {
    return JSON.parse(await readFile(join(sandbox, REGISTRY_FILE), 'utf-8'))
  } catch {
    return {}
  }
}

function dirEntry(marketplaceName: string) {
  const dir = join(sandbox, `mkt-${marketplaceName}`)
  return {
    source: { source: 'directory', path: dir },
    installLocation: dir,
    lastUpdated: new Date().toISOString(),
  }
}

describe('registry RMW in-process 互斥（gate-046 ① 核心）', () => {
  test('3 并发 RMW 各设己键（mutator 留异步窗口）= 3/3 存活', async () => {
    const results = await Promise.all(
      ['mkt-a', 'mkt-b', 'mkt-c'].map((name, i) =>
        updateKnownMarketplacesConfig(async config => {
          // 异步窗口：无锁实现下各 RMW 的 load 拿到兄弟写前的旧快照 →
          // last-writer-wins 整文件覆盖 → 仅 1 键存活。
          await new Promise(r => setTimeout(r, 25 + i * 10))
          config[name] = dirEntry(name)
          return config
        }),
      ),
    )
    // 持锁时刻语义：每个 mutator 拿到的是自己 load 时的快照（1/2/3 键递进，
    // 非兄弟写前的共享陈旧拷贝）——最后一个 mutator 必见全量 3 键
    expect(Object.keys(results[results.length - 1] ?? {})).toHaveLength(3)
    const registry = await readRegistry()
    expect(Object.keys(registry).sort()).toEqual(['mkt-a', 'mkt-b', 'mkt-c'])
    for (const name of ['mkt-a', 'mkt-b', 'mkt-c']) {
      expect(registry[name].installLocation).toBe(dirEntry(name).installLocation)
    }
  })

  test('mutator 抛错 = 零写 + 锁不卡死（后续 RMW 仍可达）', async () => {
    await updateKnownMarketplacesConfig(config => {
      config['seed'] = dirEntry('seed')
      return config
    })

    await expect(
      updateKnownMarketplacesConfig(() => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    // 抛错路径零写：registry 仍只有 seed
    expect(Object.keys(await readRegistry())).toEqual(['seed'])

    // 锁未卡死：后续 RMW 正常可达
    await updateKnownMarketplacesConfig(config => {
      config['after'] = dirEntry('after')
      return config
    })
    expect(Object.keys(await readRegistry()).sort()).toEqual(['after', 'seed'])
  })

  test('mutator 返 undefined = 幂等零写（内容不变）', async () => {
    await updateKnownMarketplacesConfig(config => {
      config['seed'] = dirEntry('seed')
      return config
    })
    const before = await readRegistry()

    const result = await updateKnownMarketplacesConfig(() => undefined)
    expect(result).toBeUndefined()
    expect(await readRegistry()).toEqual(before)
  })
})

describe('gate-046 复现面：3 启动 preset hook 并发', () => {
  test('3 并发快照兜底注册（agent-skills/atlas-plugins/claude-plugins-official）= 3/3 条目 + 3/3 物化', async () => {
    const names = ['agent-skills', 'atlas-plugins', 'claude-plugins-official']
    const results = await Promise.all(
      names.map(name => installBuiltinSnapshotFallback(name)),
    )
    // 三个兜底全部成功（互不冲掉）
    for (const r of results) {
      expect(r).toEqual({ ok: true })
    }
    const registry = await readRegistry()
    expect(Object.keys(registry).sort()).toEqual(
      [...names].sort(),
    )
    for (const name of names) {
      const entry = registry[name]
      expect(entry.source.source).toBe('directory')
      // 条目指向快照目录（非活克隆）
      expect(entry.installLocation.startsWith(getBuiltinSnapshotDir(name))).toBe(
        true,
      )
      // 快照 manifest 真物化（manifest 目录 = 探测首位，单源不硬编码）
      const manifest = JSON.parse(
        await readFile(
          join(getBuiltinSnapshotDir(name), MANIFEST_DIR, 'marketplace.json'),
          'utf-8',
        ),
      )
      expect(manifest.name).toBe(name)
    }
  })

  test('快照兜底与用户 RMW 混跑并发 = 互不冲掉', async () => {
    const [fallback, rmw] = await Promise.all([
      installBuiltinSnapshotFallback('atlas-plugins'),
      updateKnownMarketplacesConfig(config => {
        config['user-added'] = dirEntry('user-added')
        return config
      }),
    ])
    expect(fallback).toEqual({ ok: true })
    expect(rmw).toBeDefined()
    const registry = await readRegistry()
    expect(Object.keys(registry).sort()).toEqual([
      'atlas-plugins',
      'user-added',
    ])
  })
})

describe('锁原语既有读面不受影响', () => {
  test('loadKnownMarketplacesConfig 空 registry = 空对象（零文件不抛）', async () => {
    expect(await loadKnownMarketplacesConfig()).toEqual({})
  })

  test('顺序 RMW 幂等：内容不变时不重写（undefined 短路的同形验证）', async () => {
    await updateKnownMarketplacesConfig(config => {
      config['seed'] = dirEntry('seed')
      return config
    })
    // 与现有内容一致的写入 → 调用方惯例返 undefined 短路（零写）
    await updateKnownMarketplacesConfig(config => {
      if (JSON.stringify(config['seed']) === JSON.stringify(dirEntry('seed'))) {
        return undefined
      }
      return config
    })
    expect(Object.keys(await readRegistry())).toEqual(['seed'])
  })
})
