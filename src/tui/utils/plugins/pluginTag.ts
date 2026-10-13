// AD-07 (CC 2.1.118): plugin release tag tooling — create a version-checked
// git release tag on an installed plugin's repository.
//
// The plugin author release loop is: validate → install → self-hosted
// marketplace publish (git repo + commit/push). This is the missing last
// step: stamping the release git tag. The tag must be consistent with the
// version declared in the plugin manifest — a mismatch is rejected
// (fail-closed), surfacing the expected version.

import { join } from 'node:path'
import { getFsImplementation } from '../fsOperations.js'
import { gitExe } from '../git.js'
import { execFileNoThrowWithCwd } from '../execFileNoThrow.js'
import { loadInstalledPluginsV2 } from './installedPluginsManager.js'
import type { PluginInstallationEntry } from './schemas.js'

const GIT_NO_PROMPT_ENV = {
  GIT_TERMINAL_PROMPT: '0', // Prevent terminal credential prompts
  GIT_ASKPASS: '', // Disable askpass GUI programs
}

const GIT_TIMEOUT_MS = 30_000

export type PluginTagErrorCode =
  | 'no-plugin'
  | 'no-install-path'
  | 'no-manifest'
  | 'not-a-git-repo'
  | 'version-mismatch'
  | 'tag-exists'
  | 'git-failed'

export type PluginTagResult =
  | {
      ok: true
      pluginId: string
      tag: string
      version: string
      installPath: string
    }
  | { ok: false; code: PluginTagErrorCode; message: string }

/**
 * Read the version declared in a plugin's manifest (`.atlas-plugin/plugin.json`,
 * with `.claude-plugin/plugin.json` accepted as a legacy fallback). Returns
 * undefined when no manifest exists, is unreadable, or declares no version.
 */
export async function readPluginManifestVersion(
  installPath: string,
): Promise<string | undefined> {
  const fs = getFsImplementation()
  for (const dir of ['.atlas-plugin', '.claude-plugin']) {
    let raw: string
    try {
      raw = await fs.readFile(join(installPath, dir, 'plugin.json'), {
        encoding: 'utf8',
      })
    } catch {
      continue // No manifest in this directory — try the legacy one
    }
    try {
      const parsed = JSON.parse(raw) as { version?: unknown }
      return typeof parsed.version === 'string' && parsed.version.length > 0
        ? parsed.version
        : undefined
    } catch {
      return undefined // Manifest present but not valid JSON
    }
  }
  return undefined
}

/**
 * Resolve the git tag name and enforce version consistency. Without an
 * explicit tag the target is `v<manifest version>` (consistent by
 * construction). With an explicit tag, it must encode exactly the manifest
 * version (bare or with a leading `v`); anything else is a mismatch.
 */
export function resolveTargetTag(
  manifestVersion: string,
  explicitTag?: string,
): { tag: string } | { mismatch: true; expected: string; got: string } {
  if (explicitTag === undefined) {
    return { tag: `v${manifestVersion}` }
  }
  if (explicitTag === manifestVersion || explicitTag === `v${manifestVersion}`) {
    return { tag: explicitTag }
  }
  return { mismatch: true, expected: manifestVersion, got: explicitTag }
}

function findInstallations(
  pluginId: string,
): { matchedId: string; entries: PluginInstallationEntry[] } | null {
  const v2 = loadInstalledPluginsV2()
  const exact = v2.plugins[pluginId]
  if (exact && exact.length > 0) {
    return { matchedId: pluginId, entries: exact }
  }
  // Bare-name match: registry keys are "<name>@<marketplace>", so a bare
  // plugin name (or an unknown full key) matches every marketplace where
  // the plugin is installed. Sorted keys keep the pick deterministic.
  const name = pluginId.split('@')[0]
  const candidates = Object.keys(v2.plugins)
    .filter(key => key.split('@')[0] === name)
    .sort()
  if (candidates.length === 0) {
    return null
  }
  // Prefer a key whose installation is actually materialized; fall back to
  // the first key so the caller can report 'no-install-path' precisely.
  for (const key of candidates) {
    if (v2.plugins[key].some(e => e.installPath)) {
      return { matchedId: key, entries: v2.plugins[key] }
    }
  }
  const first = candidates[0]
  return { matchedId: first, entries: v2.plugins[first] }
}

/**
 * Create a version-checked release git tag on the installed plugin's git
 * repository. `pluginId` may be a full registry key (`name@marketplace`) or
 * a bare plugin name. `explicitTag` (optional) must match the manifest
 * version; without it the tag defaults to `v<manifest version>`.
 */
export async function createPluginReleaseTag(
  pluginId: string,
  explicitTag?: string,
): Promise<PluginTagResult> {
  const found = findInstallations(pluginId)
  if (!found) {
    return {
      ok: false,
      code: 'no-plugin',
      message: `Plugin '${pluginId}' is not installed. Install it first (plugin install ${pluginId}).`,
    }
  }
  const entry = found.entries.find(
    e => typeof e.installPath === 'string' && e.installPath.length > 0,
  )
  if (!entry) {
    return {
      ok: false,
      code: 'no-install-path',
      message: `Installed plugin '${found.matchedId}' has no materialized install path. Reinstall it (plugin install ${found.matchedId}).`,
    }
  }
  const installPath = entry.installPath
  const version = await readPluginManifestVersion(installPath)
  if (version === undefined) {
    return {
      ok: false,
      code: 'no-manifest',
      message: `No versioned plugin manifest found at ${installPath} (looked for .atlas-plugin/plugin.json, then .claude-plugin/plugin.json).`,
    }
  }
  const resolved = resolveTargetTag(version, explicitTag)
  if ('mismatch' in resolved) {
    return {
      ok: false,
      code: 'version-mismatch',
      message: `Refusing to create tag '${resolved.got}': the plugin manifest declares version '${resolved.expected}'. Use 'plugin tag ${found.matchedId} --tag ${resolved.expected}' (or v${resolved.expected}).`,
    }
  }
  const gitEnv = { ...process.env, ...GIT_NO_PROMPT_ENV }
  const repoCheck = await execFileNoThrowWithCwd(
    gitExe(),
    ['rev-parse', '--git-dir'],
    {
      cwd: installPath,
      timeout: GIT_TIMEOUT_MS,
      stdin: 'ignore',
      env: gitEnv,
    },
  )
  if (repoCheck.code !== 0) {
    return {
      ok: false,
      code: 'not-a-git-repo',
      message: `The plugin's install directory ${installPath} is not a git repository (release tags require a git checkout).`,
    }
  }
  const existing = await execFileNoThrowWithCwd(
    gitExe(),
    ['tag', '--list', resolved.tag],
    {
      cwd: installPath,
      timeout: GIT_TIMEOUT_MS,
      stdin: 'ignore',
      env: gitEnv,
    },
  )
  if (existing.code === 0 && existing.stdout.trim().length > 0) {
    return {
      ok: false,
      code: 'tag-exists',
      message: `Tag '${resolved.tag}' already exists in ${installPath}. Delete it first (git tag -d ${resolved.tag}) or release a new version.`,
    }
  }
  const created = await execFileNoThrowWithCwd(
    gitExe(),
    ['tag', resolved.tag],
    {
      cwd: installPath,
      timeout: GIT_TIMEOUT_MS,
      stdin: 'ignore',
      env: gitEnv,
    },
  )
  if (created.code !== 0) {
    return {
      ok: false,
      code: 'git-failed',
      message: `git tag ${resolved.tag} failed: ${created.error ?? created.stderr.trim()}`,
    }
  }
  return {
    ok: true,
    pluginId: found.matchedId,
    tag: resolved.tag,
    version,
    installPath,
  }
}
