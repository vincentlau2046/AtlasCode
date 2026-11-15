import { afterEach, describe, expect, test } from 'bun:test'
import { dirname, join } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { scanAtlasHostStateAccess } from '../../scripts/atlas-host-state-access-scan'

const sandboxes: string[] = []

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) rmSync(sandbox, { recursive: true, force: true })
})

function fixture(source: string): string {
  const root = mkdtempSync(join(tmpdir(), 'atlas-host-state-'))
  sandboxes.push(root)
  const file = join(root, 'host.ts')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, source)
  return root
}

describe('Atlas host state source guard', () => {
  test('rejects direct Atlas product directory access', () => {
    const root = fixture("readFileSync(`${process.env.HOME}/.atlas-office/session.json`)\n")
    const result = scanAtlasHostStateAccess({ candidateRoots: [root] })

    expect(result.allowed).toBe(false)
    expect(result.violations[0]?.reason).toBe('direct-product-state-access')
  })

  test('rejects direct tilde product directory access', () => {
    const root = fixture("const path = '~/.atlas-comic/settings.json'\n")
    const result = scanAtlasHostStateAccess({ candidateRoots: [root] })

    expect(result.allowed).toBe(false)
    expect(result.violations[0]?.reason).toBe('direct-product-state-access')
  })

  test('allows kernel contract access without a product path', () => {
    const root = fixture("return kernelContract.session.follow(sessionId)\n")
    const result = scanAtlasHostStateAccess({ candidateRoots: [root] })

    expect(result).toEqual({ allowed: true, violations: [] })
  })

  test('fails closed when a candidate root is missing (no silent skip)', () => {
    const root = fixture("return kernelContract.session.follow(sessionId)\n")
    const missing = `${root}/does-not-exist`

    const result = scanAtlasHostStateAccess({ candidateRoots: [root, missing] })

    expect(result.allowed).toBe(false)
    expect(result.violations).toContainEqual({
      file: missing,
      match: '',
      reason: 'candidate-root-missing',
    })
  })

  test('fails closed when a candidate root is a file, not a directory', () => {
    const root = fixture("return kernelContract.session.follow(sessionId)\n")
    const filePath = `${root}/host.ts`

    const result = scanAtlasHostStateAccess({ candidateRoots: [filePath] })

    expect(result.allowed).toBe(false)
    expect(result.violations).toContainEqual({
      file: filePath,
      match: '',
      reason: 'candidate-root-missing',
    })
  })
})
