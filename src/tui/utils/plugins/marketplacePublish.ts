/**
 * Marketplace publishing (WS5) — the other half of the self-hosted
 * marketplace toolchain: take a local plugin directory, validate it, copy it
 * into a self-hosted marketplace's plugins/ tree, upsert the marketplace.json
 * entry (local relative source), and git commit (optional push).
 *
 * No server: the marketplace is a git repo the user hosts anywhere. Git
 * credentials come from the system (credential helper / SSH key) — no token
 * injection by design (auth is out of scope, plan decision 3).
 */

import { cp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import {
  dirname,
  join,
  relative,
  resolve,
  sep,
} from 'path'
import { findManifestInDir, getPluginManifestDirs } from '../configDir.js'
import { execFileNoThrowWithCwd } from '../execFileNoThrow.js'
import { jsonParse, jsonStringify } from '../slowOperations.js'
import {
  validateMarketplaceManifest,
  validatePluginManifest,
} from './validatePlugin.js'

export type PublishPluginOptions = {
  /** Local plugin directory (must contain a plugin manifest) */
  pluginDir: string
  /** Marketplace root directory (must contain a marketplace manifest) */
  marketplaceDir: string
  /** Version to record in the marketplace entry (default: plugin manifest's) */
  version?: string
  /** git push after commit (uses system credentials / SSH key) */
  push?: boolean
}

export type PublishPluginResult = {
  name: string
  version?: string
  /** Where the plugin was copied (marketplaceDir/plugins/<name>) */
  targetDir: string
  marketplaceManifestPath: string
  /** True when a git commit was made (or nothing needed committing) */
  committed: boolean
  push: 'not-requested' | 'ok' | 'skipped' | 'failed'
  /** Non-fatal notes (non-git dir, skipped push, …) */
  notes: string[]
}

type GitResult = { stdout: string; stderr: string; code: number; error?: string }

function git(
  marketplaceDir: string,
  args: string[],
  timeoutMs = 2 * 60 * 1000,
): Promise<GitResult> {
  return execFileNoThrowWithCwd('git', args, {
    cwd: marketplaceDir,
    timeout: timeoutMs,
  })
}

function gitFailureMessage(res: GitResult): string {
  return (res.stderr || res.error || `exit code ${res.code}`).trim()
}

/**
 * Publish a local plugin into a self-hosted marketplace:
 *
 * 1. validate the plugin manifest (hard error — never copy a broken plugin)
 * 2. clean-replace `marketplaceDir/plugins/<name>/` with the plugin dir
 * 3. upsert the marketplace.json entry (`source: "./plugins/<name>"`,
 *    preserving existing category/tags on re-publish)
 * 4. re-validate the written manifest (an upsert must not break the market)
 * 5. git add + commit (only when the marketplace is a git repo); optional push
 *
 * Steps 1–4 are file operations only; git failure is reported via `notes`,
 * not thrown — the files are already in place and the user can commit later.
 */
export async function publishPluginToMarketplace(
  opts: PublishPluginOptions,
): Promise<PublishPluginResult> {
  const pluginDir = resolve(opts.pluginDir)
  const marketplaceDir = resolve(opts.marketplaceDir)
  const notes: string[] = []

  // Publishing from inside the target marketplace's plugins/ tree would
  // rm() the copy's own source mid-flight — reject up front.
  if (
    pluginDir === marketplaceDir ||
    pluginDir.startsWith(marketplaceDir + sep)
  ) {
    throw new Error(
      `Cannot publish "${pluginDir}": the plugin directory must not live inside the target marketplace (${marketplaceDir})`,
    )
  }

  // 1. Validate the plugin manifest
  const pluginManifestPath = findManifestInDir(pluginDir, 'plugin.json')
  let pluginManifestRaw: string
  try {
    pluginManifestRaw = await readFile(pluginManifestPath, {
      encoding: 'utf-8',
    })
  } catch {
    throw new Error(
      `No plugin manifest found in ${pluginDir} (looked in: ` +
        getPluginManifestDirs()
          .map(d => `${d}/plugin.json`)
          .join(', ') +
        ')',
    )
  }
  const manifestCheck = await validatePluginManifest(pluginManifestPath)
  if (!manifestCheck.success) {
    throw new Error(
      `Plugin manifest validation failed:\n` +
        manifestCheck.errors
          .map(e => `  - ${e.path}: ${e.message}`)
          .join('\n'),
    )
  }
  const manifest = jsonParse(pluginManifestRaw) as {
    name?: unknown
    version?: unknown
    description?: unknown
  }
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    throw new Error(
      `Plugin manifest at ${pluginManifestPath} has no valid "name" field`,
    )
  }
  const name = manifest.name
  const version =
    opts.version ??
    (typeof manifest.version === 'string' ? manifest.version : undefined)

  // 2. Clean-replace the plugin in the marketplace's plugins/ tree
  const targetDir = join(marketplaceDir, 'plugins', name)
  await rm(targetDir, { recursive: true, force: true })
  await mkdir(dirname(targetDir), { recursive: true })
  await cp(pluginDir, targetDir, { recursive: true })

  // 3. Upsert the marketplace.json entry (local relative source)
  const marketplaceManifestPath = findManifestInDir(
    marketplaceDir,
    'marketplace.json',
  )
  let marketplaceRaw: string
  try {
    marketplaceRaw = await readFile(marketplaceManifestPath, {
      encoding: 'utf-8',
    })
  } catch {
    throw new Error(
      `No marketplace manifest found in ${marketplaceDir} (scaffold one first: atlas plugin marketplace scaffold)`,
    )
  }
  const marketplaceDoc = jsonParse(marketplaceRaw) as {
    plugins?: unknown
    [key: string]: unknown
  }
  if (!Array.isArray(marketplaceDoc.plugins)) {
    marketplaceDoc.plugins = []
  }
  const pluginsList = marketplaceDoc.plugins as Array<
    Record<string, unknown>
  >
  const existingIdx = pluginsList.findIndex(p => p.name === name)
  const entry: Record<string, unknown> = {
    ...(existingIdx >= 0 ? pluginsList[existingIdx]! : {}),
    name,
    source: `./plugins/${name}`,
  }
  if (version !== undefined) entry.version = version
  if (typeof manifest.description === 'string') {
    entry.description = manifest.description
  }
  if (existingIdx >= 0) {
    pluginsList[existingIdx] = entry
  } else {
    pluginsList.push(entry)
  }
  await writeFile(
    marketplaceManifestPath,
    jsonStringify(marketplaceDoc, null, 2) + '\n',
    'utf-8',
  )

  // 4. Re-validate — a corrupt upsert would brick the whole marketplace
  const marketplaceCheck = await validateMarketplaceManifest(
    marketplaceManifestPath,
  )
  if (!marketplaceCheck.success) {
    throw new Error(
      `Marketplace manifest failed validation after publish:\n` +
        marketplaceCheck.errors
          .map(e => `  - ${e.path}: ${e.message}`)
          .join('\n'),
    )
  }

  // 5. git commit (optional push) — only inside a git repo
  let committed = false
  let push: PublishPluginResult['push'] = 'not-requested'
  const revParse = await git(marketplaceDir, ['rev-parse', '--git-dir'])
  if (revParse.code !== 0) {
    notes.push(
      `${marketplaceDir} is not a git repository — files updated in place; git init and commit manually`,
    )
  } else {
    const add = await git(marketplaceDir, [
      'add',
      '--',
      `plugins/${name}`,
      relative(marketplaceDir, marketplaceManifestPath),
    ])
    if (add.code !== 0) {
      notes.push(`git add failed: ${gitFailureMessage(add)}`)
    } else {
      const commit = await git(marketplaceDir, [
        'commit',
        '-m',
        `publish: ${name}${version ? `@${version}` : ''}`,
      ])
      if (commit.code === 0) {
        committed = true
      } else if (/nothing to commit/i.test(commit.stderr)) {
        committed = true
        notes.push(
          'no changes to commit (re-published with identical content)',
        )
      } else {
        notes.push(`git commit failed: ${gitFailureMessage(commit)}`)
      }

      if (opts.push) {
        const pushRes = await git(marketplaceDir, ['push'])
        if (pushRes.code === 0) {
          push = 'ok'
        } else if (
          /no (upstream|tracking)/i.test(pushRes.stderr) ||
          /no branch/i.test(pushRes.stderr)
        ) {
          push = 'skipped'
          notes.push(
            'git push skipped: no upstream branch set (git push -u origin <branch>)',
          )
        } else {
          push = 'failed'
          notes.push(`git push failed: ${gitFailureMessage(pushRes)}`)
        }
      }
    }
  }

  return {
    name,
    version,
    targetDir,
    marketplaceManifestPath,
    committed,
    push,
    notes,
  }
}
