import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = join(import.meta.dir, '..', '..')
const INVENTORY = join(REPO, 'docs/products/atlasweb/protocol-v0-inventory.md')

function section(text: string, heading: string, nextHeading: string): string {
  const start = text.indexOf(heading)
  const end = text.indexOf(nextHeading, start + heading.length)
  return text.slice(start, end === -1 ? undefined : end)
}

describe('Atlas headless protocol v0 contract split', () => {
  test('inventory names kernel facts and host/renderer interaction separately', () => {
    const text = readFileSync(INVENTORY, 'utf8')
    const kernel = section(text, '## Kernel/shared contract', '## Host / renderer interaction')
    const interaction = section(text, '## Host / renderer interaction', '## Envelope')

    expect(kernel).toContain('approval request event emission')
    expect(kernel).toContain('decision submission')
    expect(kernel).toContain('diff/deliverable data projection')
    expect(kernel).toContain('session facts and commands')
    expect(interaction).toContain('approval UI')
    expect(interaction).toContain('diff review interaction')
    expect(interaction).toContain('terminal display/interaction')
    expect(interaction).toContain('product visuals')
    expect(kernel.toLowerCase()).not.toContain('terminal')
    expect(kernel.toLowerCase()).not.toContain('bash')
  })

  test('inventory pins the Code-neutral and multi-consumer rules', () => {
    const text = readFileSync(INVENTORY, 'utf8')
    expect(text).toContain('Code-neutral')
    expect(text).toContain('TUI/print')
    expect(text).toContain('AtlasWeb Code')
    expect(text).toContain('non-Code consumer')
    expect(text).toContain('schemaVersion')
    expect(text).toContain('generation')
    expect(text).toContain('cross-process')
  })
})
