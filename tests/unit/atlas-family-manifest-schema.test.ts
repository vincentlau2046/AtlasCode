import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import Ajv2020 from 'ajv/dist/2020'

const ROOT = join(import.meta.dir, '..', '..')

function loadSchema(relative: string): object {
  return parse(readFileSync(join(ROOT, relative), 'utf8'))
}

function validator(schema: object) {
  const ajv = new Ajv2020({ allErrors: true })
  return ajv.compile(schema)
}

const V1_MANIFEST = {
  schemaVersion: 1,
  kernel: { repo: 'AtlasCode', commit: '0a0f8a67', package: '0.1.106' },
  web: { repo: 'AtlasWeb', commit: 'b1b2c3d4', platform: '0.1.0' },
  products: {
    code: { package: '0.1.106', configDirName: '~/.atlas' },
    office: { package: 'pending', configDirName: '~/.atlas-office' },
    comic: { package: 'pending', configDirName: '~/.atlas-comic' },
  },
  protocol: { name: 'atlas-headless', version: 'v0' },
}

const V2_MANIFEST = {
  ...V1_MANIFEST,
  schemaVersion: 2,
  kernel: { repo: 'AtlasCode', commit: 'a'.repeat(40), package: '0.1.116' },
  web: { repo: 'AtlasWeb', commit: 'b'.repeat(40), platform: '0.1.0' },
  pairingRef: {
    path: 'docs/products/atlas-family-pairing-v1.json',
    sha256: 'c'.repeat(64),
  },
}

const PAIRING = {
  schemaVersion: 1,
  upstream: { repo: 'AtlasCode', commit: 'a'.repeat(40) },
  packageName: '@atlasharness/atlascode',
  version: '0.1.116',
  contractEntry: './web-contract',
  runtimeEntry: './web-session-runtime',
  artifact: { integrity: `sha512-${'A'.repeat(86)}` },
  protocolVersion: 'v0',
  envelopeVersion: 0,
  consumerCommit: null,
  consumerLockDigest: null,
  evidenceDigest: 'd'.repeat(64),
  products: [
    { id: 'code', registered: true, enabled: true, accepted: true },
  ],
  rollback: { kind: 'disabled' },
}

describe('atlas-family-manifest schema (v1 compatibility)', () => {
  const validate = validator(loadSchema('docs/products/atlas-family-manifest.schema.yaml'))

  test('accepts a complete v1 manifest with abbreviated commits', () => {
    expect(validate(V1_MANIFEST)).toBe(true)
  })

  test('rejects unknown fields (no silent additionalProperties drop)', () => {
    expect(validate({ ...V1_MANIFEST, extra: true })).toBe(false)
  })

  test('rejects a v1 manifest with an unknown schemaVersion', () => {
    expect(validate({ ...V1_MANIFEST, schemaVersion: 2 })).toBe(false)
  })
})

describe('atlas-family-manifest v2 schema (immutable pairing binding)', () => {
  const validate = validator(loadSchema('docs/products/atlas-family-manifest.v2.schema.yaml'))

  test('accepts a complete v2 manifest with pairingRef', () => {
    expect(validate(V2_MANIFEST)).toBe(true)
  })

  test('requires pairingRef', () => {
    const { pairingRef: _omitted, ...withoutPairing } = V2_MANIFEST
    expect(validate(withoutPairing)).toBe(false)
  })

  test('pairingRef sha256 must be a full 64-hex digest', () => {
    expect(validate({ ...V2_MANIFEST, pairingRef: { ...V2_MANIFEST.pairingRef, sha256: 'abc123' } })).toBe(false)
  })

  test('v2 provenance commits must be full 40-hex (no abbreviated provenance)', () => {
    expect(validate({
      ...V2_MANIFEST,
      kernel: { ...V2_MANIFEST.kernel, commit: '0a0f8a67' },
    })).toBe(false)
  })

  test('v2 rejects unknown fields', () => {
    expect(validate({ ...V2_MANIFEST, extra: 1 })).toBe(false)
  })

  test('configDirName is narrowed to a single dot-directory under ~', () => {
    const ok = validator(loadSchema('docs/products/atlas-family-manifest.v2.schema.yaml'))
    const doc = structuredClone(V2_MANIFEST) as typeof V2_MANIFEST & {
      products: Record<string, { configDirName: string }>
    }
    doc.products = { ...doc.products, code: { package: '0.1.116', configDirName: '~/.atlas' } }
    expect(ok(doc)).toBe(true)

    const traversal = structuredClone(doc)
    traversal.products = { ...traversal.products, code: { package: '0.1.116', configDirName: '~/.atlas/../../evil' } }
    expect(ok(traversal)).toBe(false)

    const bareHome = structuredClone(doc)
    bareHome.products = { ...bareHome.products, code: { package: '0.1.116', configDirName: '~/etc' } }
    expect(ok(bareHome)).toBe(false)
  })
})

describe('atlas-family-pairing schema (independent pairing evidence)', () => {
  const validate = validator(loadSchema('docs/products/atlas-family-pairing.schema.yaml'))

  test('accepts a complete S0-U pairing document', () => {
    expect(validate(PAIRING)).toBe(true)
  })

  test('upstream commit must be full 40-hex', () => {
    expect(validate({ ...PAIRING, upstream: { repo: 'AtlasCode', commit: 'abc1234' } })).toBe(false)
  })

  test('rejects unknown fields', () => {
    expect(validate({ ...PAIRING, extra: true })).toBe(false)
  })

  test('rollback kind is restricted to disabled | verified-pair', () => {
    expect(validate({ ...PAIRING, rollback: { kind: 'verified-rollback' } })).toBe(false)
    expect(validate({ ...PAIRING, rollback: { kind: 'verified-pair', pairDigest: 'e'.repeat(64) } })).toBe(true)
  })

  test('verified-pair rollback requires pairDigest', () => {
    expect(validate({ ...PAIRING, rollback: { kind: 'verified-pair' } })).toBe(false)
  })

  test('placeholder products must not be accepted', () => {
    const doc = {
      ...PAIRING,
      products: [
        { id: 'office', registered: true, enabled: false, accepted: true, placeholder: true },
      ],
    }
    expect(validate(doc)).toBe(false)

    const notAccepted = {
      ...PAIRING,
      products: [
        { id: 'office', registered: true, enabled: false, accepted: false, placeholder: true },
      ],
    }
    expect(validate(notAccepted)).toBe(true)
  })

  test('runtimeEntry null (S0-U) must not mark the pairing ready', () => {
    const notReady = { ...PAIRING, runtimeEntry: null, ready: false }
    expect(validate(notReady)).toBe(true)

    const invalidReady = { ...PAIRING, runtimeEntry: null, ready: true }
    expect(validate(invalidReady)).toBe(false)

    const readyProvided = { ...PAIRING, ready: true }
    expect(validate(readyProvided)).toBe(true)
  })

  test('artifact integrity must be an sha512 base64 value', () => {
    expect(validate({ ...PAIRING, artifact: { integrity: 'md5:deadbeef' } })).toBe(false)
  })
})
