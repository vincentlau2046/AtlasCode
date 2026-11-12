import { existsSync } from 'fs'
import { join } from 'path'

// 0.1.98 S1a 步 1（lock-face ⑤ 批复形）：双 configDir 归一——getConfigDirName
// 单一事实源 = shared/configDir（行为中性：两副本同形，tui 8+ import 文件经本
// 门面 re-export 零 diff 消费）。tui 特有导出（plugin manifest / memory file
// 面）留在本文件（tui 域面，非跨域叶子）。
export {
  getConfigDirName,
  getConfigDirNameForProject,
} from '../../shared/configDir'

export const PLUGIN_MANIFEST_DIR = 'atlas-plugin';

/**
 * Legacy plugin manifest directory used by upstream Claude Code plugin repos
 * (e.g. anthropics/claude-plugins-official ships `.claude-plugin/`).
 *
 * This is a third-party repo layout convention AtlasHarness *reads*, not an
 * AtlasHarness identifier, so it is probed alongside the new `atlas-plugin`
 * name rather than renamed. (Contrast with the env-prefix clean cut, which
 * governs AtlasHarness's own surface and has no compat window — the plugin
 * manifest dir name is a read convention for repos AtlasHarness does not
 * control and cannot unilaterally rename.)
 */
export const LEGACY_PLUGIN_MANIFEST_DIR = '.claude-plugin';

/**
 * Directories to probe for a plugin manifest, in priority order: the new
 * `atlas-plugin` dir (non-dotted and dotted variants) first, then the legacy
 * `.claude-plugin` dir used by upstream Claude Code plugin repos. Returning a
 * single shared list keeps findManifestInDir, resolveMarketplaceManifestPath,
 * and the validate/CLI manifest-type checks in sync.
 */
export function getPluginManifestDirs(): string[] {
  return [PLUGIN_MANIFEST_DIR, '.' + PLUGIN_MANIFEST_DIR, LEGACY_PLUGIN_MANIFEST_DIR]
}

export const MEMORY_FILE_NAME = 'ATLAS.md'
export const LOCAL_MEMORY_FILE_NAME = 'ATLAS.local.md'

/**
 * Locate the memory file in a directory: always `ATLAS.md` /
 * `ATLAS.local.md` (no legacy `CLAUDE.md` fallback). Returns the
 * new-name path (whether it exists or not, so callers get a stable path for
 * error messages / creation).
 */
export function findMemoryFile(dir: string, local = false): string {
  const name = local ? LOCAL_MEMORY_FILE_NAME : MEMORY_FILE_NAME
  return join(dir, name)
}

export function findManifestInDir(dir: string, fileName: string): string {
  for (const d of getPluginManifestDirs()) {
    const p = join(dir, d, fileName);
    if (existsSync(p)) {
      return p;
    }
  }
  return join(dir, PLUGIN_MANIFEST_DIR, fileName);
}
