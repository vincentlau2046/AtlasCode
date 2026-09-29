/**
 * Marketplace scaffolding (WS5) — client-side toolchain for self-hosted
 * marketplaces (git-hosted, no server): generate a marketplace layout whose
 * `atlas-plugin/marketplace.json` passes PluginMarketplaceSchema and whose
 * plugins/ tree is consumable by the existing install pipeline as-is
 * (directory source or git source — source differences stay in the source
 * schema, the generated layout is source-agnostic).
 */

import { userInfo } from 'os'
import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { getPluginManifestDirs } from '../configDir.js'
import { jsonStringify } from '../slowOperations.js'
import {
  PluginManifestSchema,
  PluginMarketplaceSchema,
} from './schemas.js'

export type ScaffoldMarketplaceOptions = {
  /** Marketplace name (kebab-case; no spaces or path separators) */
  name: string
  /** Directory to scaffold into (created if missing) */
  targetDir: string
  /** Include the example plugin (default true) */
  includeExamplePlugin?: boolean
  /** Add an example skill (SKILL.md) to the example plugin (skill-pack) */
  includeSkillPack?: boolean
  /** Marketplace maintainer (default: OS username) */
  owner?: { name: string; email?: string; url?: string }
}

export type ScaffoldMarketplaceResult = {
  targetDir: string
  marketplaceManifestPath: string
  /** Files written, relative to targetDir */
  files: string[]
}

const EXAMPLE_PLUGIN = 'example-plugin'

const EXAMPLE_COMMAND_MD = `---
description: Example command scaffolded with the marketplace
---

Replace this command with your own. The markdown body becomes the slash
command's prompt (or \`!command\` script when a shell field is added).
`

const EXAMPLE_SKILL_MD = `---
name: example-skill
description: Example skill scaffolded with the marketplace
when_to_use: When the user asks to use the example skill
---

# Example Skill

Replace this body with the actual workflow: goal, gates, tool evidence
references. Skills are loaded from <plugin>/skills/<name>/SKILL.md.
`

/**
 * Scaffold a self-hosted marketplace into `targetDir`:
 *
 * ```
 * <targetDir>/
 *   atlas-plugin/marketplace.json   (name + owner + plugins entries)
 *   plugins/example-plugin/
 *     atlas-plugin/plugin.json
 *     commands/example.md
 *     skills/example-skill/SKILL.md   (only with includeSkillPack)
 * ```
 *
 * The generated marketplace.json is self-checked against
 * PluginMarketplaceSchema before any file is written — a name that would be
 * rejected at load time (spaces, path separators, reserved/blocked names)
 * fails fast here, not at the user's first `plugin install`.
 *
 * Refuses to overwrite an existing marketplace manifest.
 */
export async function scaffoldMarketplace(
  opts: ScaffoldMarketplaceOptions,
): Promise<ScaffoldMarketplaceResult> {
  const targetDir = resolve(opts.targetDir)
  const name = opts.name.trim()
  const manifestDirName = getPluginManifestDirs()[0]!
  const marketplaceManifestPath = join(
    targetDir,
    manifestDirName,
    'marketplace.json',
  )

  if (existsSync(marketplaceManifestPath)) {
    throw new Error(
      `Marketplace manifest already exists at ${marketplaceManifestPath} — refusing to overwrite (delete it and re-run to re-scaffold)`,
    )
  }

  const owner = opts.owner ?? { name: userInfo().username }
  const includeExamplePlugin = opts.includeExamplePlugin ?? true
  const includeSkillPack = opts.includeSkillPack ?? false

  const plugins: Array<Record<string, unknown>> = []
  if (includeExamplePlugin) {
    plugins.push({
      name: EXAMPLE_PLUGIN,
      source: `./plugins/${EXAMPLE_PLUGIN}`,
      description:
        'Example plugin scaffolded by atlas plugin marketplace scaffold',
    })
  }

  const marketplaceDoc = {
    name,
    owner,
    metadata: {
      description: `${name} marketplace (scaffolded)`,
    },
    plugins,
  }
  const marketplaceCheck = PluginMarketplaceSchema().safeParse(marketplaceDoc)
  if (!marketplaceCheck.success) {
    throw new Error(
      `Scaffolded marketplace.json failed schema validation: ` +
        marketplaceCheck.error.issues
          .map(i => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
    )
  }

  let pluginManifestDoc: Record<string, unknown> | null = null
  if (includeExamplePlugin) {
    pluginManifestDoc = {
      name: EXAMPLE_PLUGIN,
      version: '0.1.0',
      description:
        'Example plugin scaffolded by atlas plugin marketplace scaffold',
      author: owner,
    }
    const pluginCheck = PluginManifestSchema().safeParse(pluginManifestDoc)
    if (!pluginCheck.success) {
      throw new Error(
        `Scaffolded plugin.json failed schema validation: ` +
          pluginCheck.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
      )
    }
  }

  const files: string[] = []
  const write = async (relPath: string, content: string): Promise<void> => {
    const abs = join(targetDir, relPath)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf-8')
    files.push(relPath)
  }

  await write(
    join(manifestDirName, 'marketplace.json'),
    jsonStringify(marketplaceDoc, null, 2) + '\n',
  )

  if (includeExamplePlugin && pluginManifestDoc) {
    await write(
      join('plugins', EXAMPLE_PLUGIN, manifestDirName, 'plugin.json'),
      jsonStringify(pluginManifestDoc, null, 2) + '\n',
    )
    await write(
      join('plugins', EXAMPLE_PLUGIN, 'commands', 'example.md'),
      EXAMPLE_COMMAND_MD,
    )
    if (includeSkillPack) {
      await write(
        join('plugins', EXAMPLE_PLUGIN, 'skills', 'example-skill', 'SKILL.md'),
        EXAMPLE_SKILL_MD,
      )
    }
  }

  return { targetDir, marketplaceManifestPath, files }
}
