/**
 * W-opt 可信专项 0.1.46 三源波 S3（#301）· preset 链兜底接线判别单测。
 *
 * 判别面（mutation-red）：
 *   - git 不可用 → preset 链回落快照目录源（installed=true + fallback 标记 +
 *     registry 落 snapshot 条目）——裁掉 trySnapshotFallback 任一挂点即红；
 *   - 快照条目不短路：已落 snapshot registry 条目后再次执行 = 仍尝试活物化
 *     （git 恢复窗口）→ 再次失败再兜底，而非 already_installed 静默短路
 *     （短路 = 活源永不物化，兜底态固化，行为回归）；
 *   - kill-switch → disabled 且不兜底（用户显式 opt-out 优先于兜底）。
 * 分层纪律：gitAvailability mock.module（repo 惯例 = 先真实 import 全导出面
 * 再 spread 覆写，避 mock 全导出面泄漏坑）+ ATLAS_PLUGIN_CACHE_DIR 指临时
 * 目录（真 registry/快照 fs）；git 判定 mock false → 链在 step 4 即止，
 * addMarketplaceSource 不触网。policy 不兜底 = 结构不变量（step 3 短路于
 * 所有兜点之前 + 兜底模块内 isSourceAllowedByPolicy(dirSource) 闸），
 * 活行为归 e2e gate 层。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const GIT_AVAILABILITY_PATH = '../../src/tui/utils/plugins/gitAvailability.js'
const ATLAS_PRESET_PATH = '../../src/tui/utils/plugins/atlasMarketplace.js'
const FALLBACK_PATH =
  '../../src/tui/utils/plugins/marketplaceSnapshotFallback.js'
const MANAGER_PATH = '../../src/tui/utils/plugins/marketplaceManager.js'

// 先取真实 gitAvailability 全导出面（5 名），再 mock.module spread 覆写
// checkGitAvailable（其余名原样透传）。
const realGitAvailability = await import(GIT_AVAILABILITY_PATH)

let gitAvailableMock = false

mock.module(GIT_AVAILABILITY_PATH, () => ({
  ...realGitAvailability,
  checkGitAvailable: async () => gitAvailableMock,
}))

const { checkAndInstallAtlasMarketplace } = await import(ATLAS_PRESET_PATH)
const { loadKnownMarketplacesConfig } = await import(MANAGER_PATH)
const {
  installBuiltinSnapshotFallback,
  isBuiltinSnapshotEntry,
} = await import(FALLBACK_PATH)

const ENV_KEY = 'ATLAS_PLUGIN_CACHE_DIR'
const KILL_SWITCH = 'ATLAS_DISABLE_ATLAS_MARKETPLACE_AUTOINSTALL'
let sandbox: string
let prevEnv: string | undefined
let prevKill: string | undefined

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'atlas-preset-snap-'))
  prevEnv = process.env[ENV_KEY]
  process.env[ENV_KEY] = sandbox
  prevKill = process.env[KILL_SWITCH]
  delete process.env[KILL_SWITCH]
  gitAvailableMock = false
})

afterEach(async () => {
  if (prevEnv === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = prevEnv
  if (prevKill === undefined) delete process.env[KILL_SWITCH]
  else process.env[KILL_SWITCH] = prevKill
  await rm(sandbox, { recursive: true, force: true })
})

describe('preset 链 git 不可用 → 快照兜底', () => {
  test('git 缺失 → installed=true + fallback=builtin-snapshot + registry snapshot 条目', async () => {
    gitAvailableMock = false
    const res = await checkAndInstallAtlasMarketplace()
    expect(res.installed).toBe(true)
    expect(res.skipped).toBe(false)
    expect(res.fallback).toBe('builtin-snapshot')
    expect(res.fallbackReason).toBe('git_unavailable')

    const known = await loadKnownMarketplacesConfig()
    const entry = known['atlas-plugins']
    expect(entry).toBeDefined()
    expect(isBuiltinSnapshotEntry(entry!)).toBe(true)
  })

  test('快照条目不短路：已兜底态再次执行 = 仍尝试活物化（git 恢复窗口）→ 再兜底', async () => {
    // 预置兜底态（上一次启动 git 缺失时落下的 snapshot registry 条目）
    expect((await installBuiltinSnapshotFallback('atlas-plugins')).ok).toBe(true)
    gitAvailableMock = false // 本次启动 git 仍未恢复
    const res = await checkAndInstallAtlasMarketplace()
    // 若（错误地）把 snapshot 条目当 already_installed 短路 → reason 出现；
    // 正确 = 仍走活物化尝试 → git 不可用 → 再兜底
    expect(res.reason, '不得短路为 already_installed').not.toBe(
      'already_installed',
    )
    expect(res.fallback).toBe('builtin-snapshot')
    expect(res.installed).toBe(true)
  })
})

describe('kill-switch 优先于兜底', () => {
  test('kill-switch 设真 → disabled 且无兜底（registry 零条目）', async () => {
    process.env[KILL_SWITCH] = '1'
    gitAvailableMock = false
    const res = await checkAndInstallAtlasMarketplace()
    expect(res).toEqual({ installed: false, skipped: true, reason: 'disabled' })
    expect(res.fallback).toBeUndefined()
    const known = await loadKnownMarketplacesConfig()
    expect(Object.keys(known).length).toBe(0)
  })
})
