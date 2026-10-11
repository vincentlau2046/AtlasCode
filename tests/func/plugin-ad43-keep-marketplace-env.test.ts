/**
 * AD-43（0.1.51 C-4，CC 2.1.90）插件源 git pull 失败保留缓存 env——
 * `ATLAS_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE` 2×2 判别 func 测（工单 §1.3/§2）。
 *
 * 缺口（PAC 卡 D2）：marketplaceManager.ts cacheMarketplaceFromGit——
 * git pull 失败 → fs.rm(cachePath) + 整仓 re-clone（失败即丢缓存 = 网络
 * 瞬时抖动 ≠ 缓存损坏，韧性缺口）。改法：env on → pull 失败时跳过
 * rm+clone、保留旧缓存 + 警告返回；off/缺省 = 现行为逐字恒等。
 *
 * 判别面（pull 失败 × env on/off 2×2 + 零回归/守卫支）：
 *   ① env off + pull 失败 → rm + re-clone（现行为零回归，修前绿）
 *   ② env on  + pull 失败 → 旧缓存保留、不 re-clone（**修前红**：env 面
 *      不存在，on 亦丢缓存）
 *   ③ 零回归：env on + pull 成功 → 恒等现成功路径（不 rm 不 clone）
 *   ④ 首装守卫：env on + pull 失败 + 缓存目录不存在（首装）→ 无可保留，
 *      必须仍走 clone（keep 分支以「缓存存在」为门，否则首装永不落地）
 *   ⑤ 支界钉桩：sparse→full 过渡强制 re-clone（reconcile code 1）不受
 *      env 抑制（keep 语义 = 拉取失败面，非配置迁移面）
 *
 * 分层纪律：func 层（真 tmp 目录 registry/缓存 fs + mock.module 截 git
 * 执行面，零网络/零真 git 调用）；mock 面 = 先 import 真实
 * execFileNoThrow 全导出面再 spread 覆写 execFileNoThrowWithCwd（repo
 * 惯例，避 mock 全导出面泄漏坑，同 0.1.46 preset 探针先例）。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const EXEC_PATH = '../../src/tui/utils/execFileNoThrow.js'
const MANAGER_PATH = '../../src/tui/utils/plugins/marketplaceManager.js'
const ENV_KEY = 'ATLAS_PLUGIN_CACHE_DIR'
const KEEP_ENV = 'ATLAS_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE'
const MKT_NAME = 'test-mkt'
const GIT_URL = 'https://gitcode.com/acme/test-mkt.git'

// 先取真实 execFileNoThrow 全导出面（3 名），再 mock.module spread 覆写
// execFileNoThrowWithCwd（其余名原样透传，避同进程消费面 TypeError）。
const realExec = await import(EXEC_PATH)

type GitState = {
  pullFails: boolean
  cloneFails: boolean
  /** reconcile 探针：git config --get core.sparseCheckout 的返回 */
  sparseConfig: { code: number; stdout: string }
  pullCalls: number
  cloneCalls: number
}

const state: GitState = {
  pullFails: false,
  cloneFails: false,
  sparseConfig: { code: 1, stdout: '' },
  pullCalls: 0,
  cloneCalls: 0,
}

function manifestJson(): string {
  return JSON.stringify({
    name: MKT_NAME,
    owner: { name: 'acme' },
    plugins: [],
  })
}

/** 模拟一次真实 git clone 成功：物化缓存目录 + manifest + 重克隆标记。 */
async function materializeCloneAt(target: string): Promise<void> {
  await mkdir(join(target, 'atlas-plugin'), { recursive: true })
  await writeFile(
    join(target, 'atlas-plugin', 'marketplace.json'),
    manifestJson(),
  )
  await writeFile(join(target, '.ad43-marker'), 'recloned')
}

mock.module(EXEC_PATH, () => ({
  ...realExec,
  execFileNoThrowWithCwd: async (
    _file: string,
    args: string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> => {
    if (args.includes('pull')) {
      state.pullCalls++
      return state.pullFails
        ? { code: 1, stdout: '', stderr: 'fatal: unable to access (simulated)' }
        : { code: 0, stdout: '', stderr: '' }
    }
    if (args.includes('clone')) {
      state.cloneCalls++
      if (state.cloneFails) {
        return { code: 1, stdout: '', stderr: 'fatal: clone failed (simulated)' }
      }
      // 真实 git clone 会物化 target 目录；末位参数 = targetPath
      await materializeCloneAt(args[args.length - 1])
      return { code: 0, stdout: '', stderr: '' }
    }
    if (args.includes('config')) {
      // reconcileSparseCheckout 的 sparse 探针（默认 code 1 = 非 sparse 仓）
      return state.sparseConfig
    }
    // fetch / checkout / submodule / sparse-checkout —— 全成功
    return { code: 0, stdout: '', stderr: '' }
  },
}))

const {
  clearMarketplacesCache,
  getMarketplacesCacheDir,
  refreshMarketplace,
  saveKnownMarketplacesConfig,
} = await import(MANAGER_PATH)

let sandbox: string
let cachePath: string
let prevEnv: string | undefined
let prevKeep: string | undefined

/** 预置一个「旧缓存」：stale manifest + 标记文件（keep 判别物证）。 */
async function seedStaleCache(): Promise<void> {
  await mkdir(join(cachePath, 'atlas-plugin'), { recursive: true })
  await writeFile(
    join(cachePath, 'atlas-plugin', 'marketplace.json'),
    manifestJson(),
  )
  await writeFile(join(cachePath, '.ad43-marker'), 'stale-cache')
}

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'atlas-ad43-'))
  prevEnv = process.env[ENV_KEY]
  process.env[ENV_KEY] = sandbox
  prevKeep = process.env[KEEP_ENV]
  delete process.env[KEEP_ENV]
  clearMarketplacesCache()
  state.pullFails = false
  state.cloneFails = false
  state.sparseConfig = { code: 1, stdout: '' }
  state.pullCalls = 0
  state.cloneCalls = 0
  cachePath = join(getMarketplacesCacheDir(), MKT_NAME)
  await saveKnownMarketplacesConfig({
    [MKT_NAME]: {
      source: { source: 'git', url: GIT_URL },
      installLocation: cachePath,
      lastUpdated: new Date(0).toISOString(),
    },
  })
})

afterEach(async () => {
  if (prevEnv === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = prevEnv
  if (prevKeep === undefined) delete process.env[KEEP_ENV]
  else process.env[KEEP_ENV] = prevKeep
  await rm(sandbox, { recursive: true, force: true })
})

describe('AD-43 pull 失败 × ATLAS_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE 2×2', () => {
  test('① env off + pull 失败 → rm + re-clone（现行为零回归）', async () => {
    state.pullFails = true
    await seedStaleCache()
    await expect(refreshMarketplace(MKT_NAME)).resolves.toBeUndefined()
    expect(state.pullCalls).toBe(1)
    expect(state.cloneCalls).toBe(1)
    // 旧缓存已被 rm，mock clone 重写标记
    expect(await readFile(join(cachePath, '.ad43-marker'), 'utf8')).toBe(
      'recloned',
    )
  })

  test('② env on + pull 失败 → 旧缓存保留、不 re-clone（修前红）', async () => {
    process.env[KEEP_ENV] = '1'
    state.pullFails = true
    await seedStaleCache()
    await expect(refreshMarketplace(MKT_NAME)).resolves.toBeUndefined()
    expect(state.pullCalls).toBe(1)
    expect(state.cloneCalls).toBe(0)
    // 旧缓存原样在场（stale 标记未被 re-clone 覆写）
    expect(await readFile(join(cachePath, '.ad43-marker'), 'utf8')).toBe(
      'stale-cache',
    )
  })

  test('③ 零回归：env on + pull 成功 → 恒等现成功路径（不 rm 不 clone）', async () => {
    process.env[KEEP_ENV] = '1'
    state.pullFails = false
    await seedStaleCache()
    await expect(refreshMarketplace(MKT_NAME)).resolves.toBeUndefined()
    expect(state.pullCalls).toBe(1)
    expect(state.cloneCalls).toBe(0)
    expect(await readFile(join(cachePath, '.ad43-marker'), 'utf8')).toBe(
      'stale-cache',
    )
  })

  test('④ 首装守卫：env on + pull 失败 + 无缓存目录 → 必须仍 clone', async () => {
    process.env[KEEP_ENV] = '1'
    state.pullFails = true
    // 不 seedStaleCache —— 缓存目录不存在（首装无旧缓存可保留）
    await expect(refreshMarketplace(MKT_NAME)).resolves.toBeUndefined()
    expect(state.pullCalls).toBe(1)
    expect(state.cloneCalls).toBe(1)
    expect(await readFile(join(cachePath, '.ad43-marker'), 'utf8')).toBe(
      'recloned',
    )
  })

  test('⑤ 支界钉桩：sparse→full 强制 re-clone 不受 env 抑制（keep = 拉取失败面）', async () => {
    process.env[KEEP_ENV] = '1'
    // reconcile 探针回报「仓是 sparse 且 sparsePaths 已移除」→ code 1 强制迁移
    state.sparseConfig = { code: 0, stdout: 'true' }
    state.pullFails = true
    await seedStaleCache()
    await expect(refreshMarketplace(MKT_NAME)).resolves.toBeUndefined()
    expect(state.pullCalls).toBe(0)
    expect(state.cloneCalls).toBe(1)
  })
})
