/**
 * 0.1.82 K3-C L20 review 第二轮回归（2026-10-30 security review）：
 * skillSearch 的 resolvedName 取 frontmatter.name —— L20 名字消毒的唯一
 * frontmatter 派生调用方，绕过修复。
 *
 * 现码（修前）：`resolvedName = frontmatter.name ?? d.name`，然后
 * `parseSkillFrontmatterFields` 内部 sanitizeDisplayName 把不安全覆盖弃用
 * → `displayName ?? resolvedName` 回落到**同一个坏名**（frontmatter 派生
 * 的 resolvedName 本身就是坏的）——不安全名直达市场搜索结果面。
 *
 * 修后契约：
 *   - resolvedName 恒取目录名 d.name（fs 派生规范名，与 loadSkillsDir/
 *     skillCommand 两装载器同款）；
 *   - d.name 本身过 isUnsafeCommandName 门，坏目录名整条 entry 跳过
 *     （§101 静默过滤裁定）；
 *   - 良性 frontmatter name 经 displayName 透传，行为不变（零回归锚）。
 *
 * fixture 链（全真 fs、零网络——cache-only 面）：
 *   ATLAS_PLUGIN_CACHE_DIR=<tmp> → known_marketplaces.json（registry key =
 *   manifest 名契约）→ installLocation=<mktRoot> → atlas-plugin/
 *   marketplace.json（findManifestInDir 无点目录探测，func 先例
 *   plugin-ad43）→ plugins/my-plugin/skills/<skillDir>/SKILL.md。
 *   ATLAS_CONFIG_DIR=<tmp> 隔离 isPluginInstalled 面。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

// fs 隔离须在 plugins 模块首次加载前置位（L20 测试同款 --isolate 纪律）
const cfgDir = await mkdtemp(join(tmpdir(), 'atlas-l20r2-cfg-'))
const pluginsDir = await mkdtemp(join(tmpdir(), 'atlas-l20r2-plugins-'))
process.env.ATLAS_CONFIG_DIR = cfgDir
process.env.ATLAS_PLUGIN_CACHE_DIR = pluginsDir

const { searchSkillsAcrossMarketplaces } = await import(
  '../../src/tui/utils/plugins/skillSearch.js'
)
const { clearMarketplacesCache } = await import(
  '../../src/tui/utils/plugins/marketplaceManager.js'
)

const MKT_NAME = 'l20r2-mkt'
const PLUGIN_NAME = 'my-plugin'
// RLO 方向覆写（视觉欺骗面）——fromCodePoint 构造，源文件不落字面不可见字符
const RLO = String.fromCodePoint(0x202e)

let mktRoot: string

async function writeSkill(
  skillDir: string,
  frontmatter: string,
): Promise<void> {
  const dir = join(mktRoot, 'plugins', PLUGIN_NAME, 'skills', skillDir)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\n${frontmatter}---\n\nbody\n`,
    'utf-8',
  )
}

beforeEach(async () => {
  clearMarketplacesCache()
  mktRoot = await mkdtemp(join(tmpdir(), 'atlas-l20r2-mkt-'))
  // marketplace manifest（findManifestInDir 无点目录探测，func 测试先例）
  await mkdir(join(mktRoot, 'atlas-plugin'), { recursive: true })
  await writeFile(
    join(mktRoot, 'atlas-plugin', 'marketplace.json'),
    JSON.stringify({
      name: MKT_NAME,
      owner: { name: 'l20r2' },
      plugins: [{ name: PLUGIN_NAME, source: `./plugins/${PLUGIN_NAME}` }],
    }),
    'utf-8',
  )
  // known_marketplaces.json（registry key = manifest 名）
  await writeFile(
    join(pluginsDir, 'known_marketplaces.json'),
    JSON.stringify({
      [MKT_NAME]: {
        source: { source: 'directory', path: mktRoot },
        installLocation: mktRoot,
        lastUpdated: '2026-10-30T00:00:00.000Z',
      },
    }),
    'utf-8',
  )
})

afterEach(async () => {
  clearMarketplacesCache()
  await rm(mktRoot, { recursive: true, force: true })
})

describe('K3-C L20 review 第二轮：skillSearch resolvedName 不取 frontmatter', () => {
  test('不安全 frontmatter name 回落目录名（修前红：坏名直达搜索结果）', async () => {
    await writeSkill('good-name', `name: bad${RLO}\ndescription: l20r2\n`)
    const results = await searchSkillsAcrossMarketplaces()
    const names = results.map(r => r.skill)
    expect(names).toContain('good-name')
    expect(names).not.toContain(`bad${RLO}`)
    expect(results).toHaveLength(1)
  })

  test('不安全目录名技能整条跳过（修前红：坏目录名出现在结果）', async () => {
    await writeSkill(`bad${RLO}`, 'description: l20r2\n')
    const results = await searchSkillsAcrossMarketplaces()
    expect(results.map(r => r.skill)).not.toContain(`bad${RLO}`)
    expect(results).toHaveLength(0)
  })

  test('零回归锚：无 frontmatter name 用目录名；良性 name 保留', async () => {
    await writeSkill('plain-skill', 'description: l20r2\n')
    await writeSkill('nice-name', 'name: My Nice Skill\ndescription: l20r2\n')
    const results = await searchSkillsAcrossMarketplaces()
    // readdir 目录序不保证（独立进程实测逆序）——断言免序
    const names = results.map(r => r.skill)
    expect(names).toHaveLength(2)
    expect(names).toEqual(
      expect.arrayContaining(['plain-skill', 'My Nice Skill']),
    )
  })
})
