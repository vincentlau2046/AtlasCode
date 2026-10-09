/**
 * W-opt 可信专项 0.1.46 三源波 S3（#301）：3 市场预集成 manifest 兜底
 *
 * 背景（0.1.43 Windows 新装实测根因，提交 5c9c60f 自证）：3 个 preset 市场的
 * 物化前置条件（GCS 镜像可达 / git 在 PATH）在新装机上双双缺席 → 3 源全空。
 * 本模块 = 零网络兜底：preset 物化失败时，把 bundle 进 npm 包的 manifest
 * 快照（builtinMarketplaceSnapshots.ts）物化为本地 **directory 源**，
 * /plugin 在无 git/无网络环境仍见 3 源 + 插件清单；真实安装插件再走 git/源，
 * 装不上给明示提示。
 *
 * 注册路径裁定（安全面）：不走 addMarketplaceSource —— 保留名校验
 * validateOfficialNameSource 会拒非 GitHub/git 源占用 `claude-plugins-official` /
 * `agent-skills`（防三方 squat 官方名，必须保留）。兜底 = 一方自产目录的
 * 自注册，直接写 known_marketplaces.json（precedent：officialMarketplace
 * GCS 成功支也是直写 registry 而非 addMarketplaceSource）。信任边界：
 * 快照目录只由本模块写入（<cacheDir>/builtin-snapshots/<name>），manifest
 * 内容 = bundle 内快照（构建时冻结）。
 *
 * 幂等与升级语义：每次兜底执行都从 bundle 重写 manifest（内容 = 当前包内
 * 快照，版本升级即内容刷新）；registry 条目按 key 覆盖（无重复条目）。
 * 活克隆成功后应调 removeBuiltinSnapshotDir 清孤儿快照目录（preset/official
 * 成功支接线）。
 */

import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'fs/promises'
import { join, resolve, sep } from 'path'
import { getPluginManifestDirs } from '../configDir.js'
import { logForDebugging } from '../debug.js'
import { toError } from '../errors.js'
import { jsonStringify } from '../slowOperations.js'
import {
  getBuiltinMarketplaceSnapshot,
} from './builtinMarketplaceSnapshots.js'
import { isSourceAllowedByPolicy } from './marketplaceHelpers.js'
import {
  getMarketplacesCacheDir,
  loadKnownMarketplacesConfig,
  saveKnownMarketplacesConfig,
} from './marketplaceManager.js'
import {
  isLocalMarketplaceSource,
  PluginMarketplaceSchema,
  type KnownMarketplace,
} from './schemas.js'

/**
 * Snapshot materialization root: `<pluginsDir>/marketplaces/builtin-snapshots/<name>`
 * (under the marketplaces cache root so cache-wide cleanup/backup treats it
 * like any other marketplace data; the `builtin-snapshots` segment marks it
 * as first-party materialization, not a live clone).
 */
export function getBuiltinSnapshotRoot(): string {
  return join(getMarketplacesCacheDir(), 'builtin-snapshots')
}

/** Snapshot directory for one marketplace. */
export function getBuiltinSnapshotDir(marketplaceName: string): string {
  return join(getBuiltinSnapshotRoot(), marketplaceName)
}

/**
 * Whether a registry entry points at a first-party snapshot materialization
 * (not a live clone / user-owned local source). Used by the preset chains:
 * a snapshot entry must NOT short-circuit the `already_installed` check —
 * the live source still needs to materialize on a later startup once
 * git/network is available.
 */
export function isBuiltinSnapshotEntry(entry: KnownMarketplace): boolean {
  if (!isLocalMarketplaceSource(entry.source)) return false
  if (entry.source.source !== 'directory') return false
  const root = resolve(getBuiltinSnapshotRoot()) + sep
  return entry.installLocation.startsWith(root)
}

/** Result of a snapshot fallback attempt. */
export type SnapshotFallbackResult =
  | { ok: true }
  | { ok: false; reason: 'no_snapshot' | 'policy_blocked' | 'materialize_failed' }

/**
 * Materialize the bundled manifest snapshot for `marketplaceName` as a local
 * directory source and register it in known_marketplaces.json.
 *
 * Zero-network by construction (reads bundle data, writes under the user's
 * plugins cache dir). Intended to be called from the preset chains only
 * after a live materialization failure (git_unavailable / unknown /
 * gcs_unavailable) — never on the success or policy-blocked paths.
 */
export async function installBuiltinSnapshotFallback(
  marketplaceName: string,
): Promise<SnapshotFallbackResult> {
  const snapshot = getBuiltinMarketplaceSnapshot(marketplaceName)
  if (!snapshot) {
    logForDebugging(
      `Snapshot fallback: no bundled snapshot for '${marketplaceName}'`,
    )
    return { ok: false, reason: 'no_snapshot' }
  }

  const snapshotDir = getBuiltinSnapshotDir(marketplaceName)
  const dirSource = { source: 'directory', path: snapshotDir } as const

  // Enterprise policy still wins: a strict allowlist without a matching
  // filesystem pattern blocks the fallback (the catalog stays hidden rather
  // than bypassing the org lockdown).
  if (!isSourceAllowedByPolicy(dirSource)) {
    logForDebugging(
      `Snapshot fallback: '${marketplaceName}' blocked by enterprise policy`,
    )
    return { ok: false, reason: 'policy_blocked' }
  }

  try {
    await materializeSnapshot(snapshotDir, snapshot.manifest)

    // Register (GCS-path precedent: first-party materialization writes the
    // registry directly, bypassing addMarketplaceSource's reserved-name
    // check which would reject a directory source for the reserved keys).
    const known = await loadKnownMarketplacesConfig()
    known[marketplaceName] = {
      source: { source: 'directory', path: snapshotDir },
      installLocation: snapshotDir,
      lastUpdated: new Date().toISOString(),
    }
    await saveKnownMarketplacesConfig(known)
    logForDebugging(
      `Snapshot fallback: materialized '${marketplaceName}' at ${snapshotDir}`,
    )
    return { ok: true }
  } catch (error) {
    logForDebugging(
      `Snapshot fallback: failed to materialize '${marketplaceName}': ${toError(error).message}`,
      { level: 'error' },
    )
    return { ok: false, reason: 'materialize_failed' }
  }
}

/**
 * Best-effort removal of a snapshot materialization (called from the live-
 * success paths so the orphan snapshot dir doesn't linger after the real
 * clone lands). Never throws.
 */
export async function removeBuiltinSnapshotDir(
  marketplaceName: string,
): Promise<void> {
  try {
    await rm(getBuiltinSnapshotDir(marketplaceName), {
      recursive: true,
      force: true,
    })
  } catch {
    // Orphan cleanup is cosmetic — never fail the caller over it.
  }
}

/**
 * Write the bundled manifest into `<dir>/<primaryManifestDir>/marketplace.json`
 * and validate it against the full PluginMarketplaceSchema before the
 * registry write (a corrupt snapshot must not leave a dangling entry).
 * Rewrites from the bundle on every call (content = current packaged
 * snapshot; version upgrades refresh stale on-disk copies).
 */
async function materializeSnapshot(
  snapshotDir: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  const manifestDirName = getPluginManifestDirs()[0]
  const manifestPath = join(snapshotDir, manifestDirName, 'marketplace.json')
  await mkdir(join(snapshotDir, manifestDirName), { recursive: true })
  const content = jsonStringify(manifest, null, 2)
  await writeFile(manifestPath, content, { encoding: 'utf-8' })

  // Read-back validation through the same schema the UI load path uses
  // (directory case → parseFileWithSchema(PluginMarketplaceSchema())).
  const roundTrip = JSON.parse(await readFile(manifestPath, 'utf-8')) as unknown
  PluginMarketplaceSchema().parse(roundTrip)
}
