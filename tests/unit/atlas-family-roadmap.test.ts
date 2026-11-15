import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = join(import.meta.dir, '..', '..')
const ROADMAP = join(REPO, 'docs/products/atlas-family-roadmap.md')
const LANES = [
  'atlascode',
  'atlasweb',
  'atlasoffice',
  'atlascomic',
] as const

const REQUIRED_ROADMAP_MARKERS = [
  'Current phase',
  'Foundation cut',
  'Repository map',
  'Product lanes',
  'Protocol version',
  'configDirName',
  'Blockers',
  'Evidence',
  'Rollback',
] as const

describe('Atlas family roadmap contract', () => {
  test('roadmap and every lane index exist', () => {
    expect(existsSync(ROADMAP)).toBe(true)
    for (const lane of LANES) {
      expect(existsSync(join(REPO, `docs/products/${lane}/README.md`))).toBe(true)
    }
  })

  test('roadmap records the cross-repository release contract', () => {
    const text = readFileSync(ROADMAP, 'utf8')
    for (const marker of REQUIRED_ROADMAP_MARKERS) {
      expect(text).toContain(marker)
    }
    expect(text).toContain('AtlasCode')
    expect(text).toContain('AtlasWeb')
    expect(text).toContain('0.1.106')
    expect(text).toContain('atlas-headless')
  })
})
