import { join } from 'path'
import { getCwd } from './cwd.js'
import { getAtlasConfigHomeDir } from './envUtils.js'
import { getManagedFilePath } from './settings/managedPath.js'
import { getFsImplementation, type FsOperations } from './fsOperations.js'
import { logForDebugging } from './debug.js'

/**
 * One-shot startup migration (2026-09-18 ruling): instruction file names
 * were renamed from `ATLASHARNESS.md` / `ATLASHARNESS.local.md` to
 * `ATLAS.md` / `ATLAS.local.md` (filename-suffix frozen layer unfrozen;
 * naming spec 16, decision log 2026-09-18). The loader (`findMemoryFile`
 * in configDir.ts) only recognizes the new names — no old-name fallback —
 * so without this, pre-existing files are silently stranded.
 *
 * For each of project root, user config home, and managed config dir:
 * old name present AND new name absent → rename (not copy); both present
 * or neither present → no-op. Non-fatal: errors are logged and swallowed
 * so a broken directory never blocks startup.
 *
 * `dirs` / `fs` are injectable for unit tests (no real disk).
 *
 * @returns the "oldPath -> newPath" pairs actually migrated
 */
export function migrateMemoryFiles(opts?: {
  dirs?: string[]
  fs?: FsOperations
}): string[] {
  const fsImpl = opts?.fs ?? getFsImplementation()
  const dirs =
    opts?.dirs ?? [getCwd(), getAtlasConfigHomeDir(), getManagedFilePath()]
  const migrations: ReadonlyArray<readonly [string, string]> = [
    ['ATLASHARNESS.md', 'ATLAS.md'],
    ['ATLASHARNESS.local.md', 'ATLAS.local.md'],
  ]
  const done: string[] = []
  for (const dir of dirs) {
    for (const [oldName, newName] of migrations) {
      try {
        const oldPath = join(dir, oldName)
        const newPath = join(dir, newName)
        if (fsImpl.existsSync(oldPath) && !fsImpl.existsSync(newPath)) {
          fsImpl.renameSync(oldPath, newPath)
          logForDebugging(`[STARTUP] Migrated memory file ${oldPath} -> ${newPath}`)
          done.push(`${oldPath} -> ${newPath}`)
        }
      } catch (error) {
        logForDebugging(
          `[STARTUP] Memory file migration failed (${dir}/${oldName}): ${error}`,
        )
      }
    }
  }
  return done
}
