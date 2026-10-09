#!/usr/bin/env bun
/**
 * W-opt 可信专项 0.1.46 三源波 S3（#301）：3 市场 manifest 快照生成器
 *
 * 从本机物化的 3 个 preset 市场克隆（~/.atlas/plugins/marketplaces/<key>）
 * 抓取 marketplace.json 顶层内容，生成
 * `src/tui/utils/plugins/builtinMarketplaceSnapshots.ts`（bundle 进 npm 包）。
 *
 * 用途：新装零网络兜底（preset 物化失败 → 本地 directory 源，
 * 见 marketplaceSnapshotFallback.ts）。快照 = 生成时点 manifest 的逐字拷贝，
 * 物化侧经 parseFileWithSchema 全量校验，与活克隆同一校验面。
 *
 * 用法（发布波内跑一次，生成物随提交入库）：
 *   bun run scripts/generate-marketplace-snapshots.ts
 *
 * 数据源覆盖（CI/无本机克隆时）：
 *   ATLAS_MARKETPLACE_SNAPSHOT_DIR=/path/to/marketplaces（含 3 个市场克隆目录）
 *   ATLAS_PLUGIN_CACHE_DIR（与运行时 getPluginsDirectory 同语义）
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = join(
  REPO_ROOT,
  'src/tui/utils/plugins/builtinMarketplaceSnapshots.ts',
)

/** 3 个 preset 市场（registry key = manifest name，单一事实源，勿改）。 */
const MARKETPLACE_DEFS: ReadonlyArray<{ key: string; dir: string }> = [
  { key: 'agent-skills', dir: 'agent-skills' },
  { key: 'atlas-plugins', dir: 'atlas-plugins' },
  { key: 'claude-plugins-official', dir: 'claude-plugins-official' },
]

/** 与运行时 getPluginManifestDirs() 同序：新名优先，legacy .claude-plugin 兜底。 */
const MANIFEST_PROBES: ReadonlyArray<string> = [
  'atlas-plugin',
  '.atlas-plugin',
  '.claude-plugin',
]

function expandTilde(p: string): string {
  return p.startsWith('~/') ? join(homedir(), p.slice(2)) : p
}

function findManifest(root: string): string | null {
  for (const d of MANIFEST_PROBES) {
    const p = join(root, d, 'marketplace.json')
    if (existsSync(p)) return p
  }
  return null
}

function resolveBaseDir(): string {
  if (process.env.ATLAS_MARKETPLACE_SNAPSHOT_DIR) {
    return expandTilde(resolve(process.env.ATLAS_MARKETPLACE_SNAPSHOT_DIR))
  }
  if (process.env.ATLAS_PLUGIN_CACHE_DIR) {
    return join(expandTilde(process.env.ATLAS_PLUGIN_CACHE_DIR), 'marketplaces')
  }
  return join(homedir(), '.atlas', 'plugins', 'marketplaces')
}

function main(): void {
  const baseDir = resolveBaseDir()
  console.log(`snapshot source base: ${baseDir}`)

  const snapshots: Array<{
    key: string
    manifest: Record<string, unknown>
    source: string
  }> = []

  for (const def of MARKETPLACE_DEFS) {
    const root = join(baseDir, def.dir)
    const manifestPath = findManifest(root)
    if (!manifestPath) {
      console.error(
        `✗ ${def.key}: marketplace.json not found under ${root} ` +
          `(probed ${MANIFEST_PROBES.join(' / ')})`,
      )
      process.exit(1)
    }
    let manifest: Record<string, unknown>
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<
        string,
        unknown
      >
    } catch (e) {
      console.error(
        `✗ ${def.key}: failed to parse ${manifestPath}: ${e instanceof Error ? e.message : String(e)}`,
      )
      process.exit(1)
    }
    const pluginCount = Array.isArray(manifest.plugins)
      ? manifest.plugins.length
      : 0
    if (manifest.name !== def.key || pluginCount === 0) {
      console.error(
        `✗ ${def.key}: manifest sanity check failed ` +
          `(name='${String(manifest.name)}', plugins=${pluginCount})`,
      )
      process.exit(1)
    }
    snapshots.push({ key: def.key, manifest, source: manifestPath })
    console.log(
      `✓ ${def.key}: ${pluginCount} plugins ← ${manifestPath}`,
    )
  }

  const generatedAt = new Date().toISOString()
  const lines: string[] = [
    '/**',
    ' * W-opt 可信专项 0.1.46 三源波 S3（#301）：3 市场 manifest 快照（bundle 进 npm 包）。',
    ' *',
    ' * AUTO-GENERATED — 勿手改。重新生成：`bun run scripts/generate-marketplace-snapshots.ts`',
    ` * 生成时间：${generatedAt}`,
    ' *',
    ' * 用途：新装零网络兜底 —— preset 物化失败（git 缺失 / GCS 不可达 / 克隆失败）时，',
    ' * marketplaceSnapshotFallback.ts 把下列 manifest 物化为本地 directory 源，',
    ' * /plugin 在无网络环境仍见 3 源 + 插件清单。快照 = 生成时点 marketplace.json',
    ' * 顶层逐字拷贝；物化侧经 parseFileWithSchema 全量校验（与活克隆同一校验面）。',
    ` * 计数基线：${snapshots
      .map(s => {
        const n = Array.isArray(s.manifest.plugins)
          ? (s.manifest.plugins as unknown[]).length
          : 0
        return `${s.key} ${n}`
      })
      .join(' / ')}`,
    ' * （tests/unit/marketplace-snapshot-bundle.test.ts 钉死，再生成后须同步核）。',
    ' */',
    '',
    'export interface BuiltinMarketplaceSnapshot {',
    '  /** Registry key = 市场 manifest name（单一事实源，与 preset registry key 一致）。 */',
    '  key: string',
    '  /** marketplace.json 顶层逐字快照（name/owner/plugins/…，紧凑 JSON 字面量）。 */',
    '  manifest: Record<string, unknown>',
    '}',
    '',
    'export const BUILTIN_MARKETPLACE_SNAPSHOTS: ReadonlyArray<BuiltinMarketplaceSnapshot> = [',
  ]

  for (const s of snapshots) {
    lines.push(
      `  { key: '${s.key}', manifest: ${JSON.stringify(s.manifest)} },`,
    )
  }

  lines.push(
    ']',
    '',
    '/** 按 registry key 查快照（非 3 源 key 返回 undefined → 该市场无兜底）。 */',
    'export function getBuiltinMarketplaceSnapshot(',
    '  key: string,',
    '): BuiltinMarketplaceSnapshot | undefined {',
    '  return BUILTIN_MARKETPLACE_SNAPSHOTS.find(s => s.key === key)',
    '}',
    '',
  )

  writeFileSync(OUT_PATH, lines.join('\n'), 'utf-8')
  const outBytes = Buffer.byteLength(lines.join('\n'))
  console.log(`✓ wrote ${OUT_PATH} (${outBytes} bytes)`)
}

main()
