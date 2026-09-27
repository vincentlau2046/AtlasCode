/**
 * engine/tools/mcp S-E2（§8.63）func 层（真盘）：ReadMcpResource blob
 * 拦截面的 persistBinaryContent 成功/错误 2 面（裸 fs 写，unit 不可覆写，
 * plan/web func 先例）。
 *
 * 目录戳策略（§8.63.1.5 登记）：getToolResultsDir 相对名面 =
 * `${ATLAS_CONFIG_DIR_NAME|'.atlas'}-${uid}/tool-results`（cwd 相对，
 * shared/tempDir.ts Unix 面）→ per-file 进程隔离下 chdir(mkdtemp) 安全
 * + ATLAS_CONFIG_DIR_NAME = 唯一名戳（不触真实 .atlas 数据）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ReadMcpResourceTool,
  resetMcpClientRegistry,
  setMcpClientRegistry,
} from '../../src/engine/tools'

const UID = process.getuid?.() ?? 0
const BLOB_BYTES = Buffer.from('hello-binary', 'utf8')
const BLOB_B64 = BLOB_BYTES.toString('base64')

function blobClient(blob: string): void {
  setMcpClientRegistry({
    clients: [
      {
        name: 'alpha',
        type: 'connected',
        capabilities: { resources: true },
        readResource: async () => ({
          contents: [
            {
              uri: 'file:///img.png',
              mimeType: 'image/png',
              blob,
            },
          ],
        }),
      },
    ],
  })
}

async function readBlob(): Promise<{
  blobSavedTo?: string
  text?: string
}> {
  const res = await ReadMcpResourceTool.call(
    { server: 'alpha', uri: 'file:///img.png' },
    {},
  )
  return res.data.contents[0] as { blobSavedTo?: string; text?: string }
}

describe('F-M1 blob 持久化成功面', () => {
  let cwd: string
  let origCwd: string
  let stamp: string
  let origEnv: string | undefined

  beforeAll(() => {
    origCwd = process.cwd()
    cwd = mkdtempSync(join(tmpdir(), 'atlas-mcp-func-'))
    process.chdir(cwd)
    stamp = `atlas-mcp-func-${Date.now()}`
    origEnv = process.env.ATLAS_CONFIG_DIR_NAME
    process.env.ATLAS_CONFIG_DIR_NAME = stamp
    resetMcpClientRegistry()
  })

  afterAll(() => {
    process.env.ATLAS_CONFIG_DIR_NAME = origEnv
    process.chdir(origCwd)
    rmSync(cwd, { recursive: true, force: true })
  })

  test('base64 blob → persistBinaryContent 真写（blobSavedTo 存在 + 字节逐字 + mime ext + size 文案面）', async () => {
    blobClient(BLOB_B64)
    const out = await readBlob()

    expect(out.blobSavedTo).toBeDefined()
    expect(out.blobSavedTo?.endsWith('.png')).toBe(true)
    // 目录戳面：`<cwd>/<stamp>-<uid>/tool-results/`
    expect(out.blobSavedTo).toContain(
      `${stamp}-${UID}/tool-results/mcp-resource-`,
    )
    expect(existsSync(out.blobSavedTo!)).toBe(true)
    expect(readFileSync(out.blobSavedTo!)).toEqual(BLOB_BYTES)
    // getBinaryBlobSavedMessage 文案逐字（size 12 < 1KB → '12 bytes' 面）
    expect(out.text).toBe(
      `[Resource from alpha at file:///img.png] Binary content (image/png, 12 bytes) saved to ${out.blobSavedTo}`,
    )
  })
})

describe('F-M2 blob 错误面（tool-results 预造为文件 → ENOTDIR）', () => {
  let cwd: string
  let origCwd: string
  let stamp: string
  let origEnv: string | undefined

  beforeAll(() => {
    origCwd = process.cwd()
    cwd = mkdtempSync(join(tmpdir(), 'atlas-mcp-func-err-'))
    process.chdir(cwd)
    stamp = `atlas-mcp-func-err-${Date.now()}`
    origEnv = process.env.ATLAS_CONFIG_DIR_NAME
    process.env.ATLAS_CONFIG_DIR_NAME = stamp
    // 预造 `<stamp>-<uid>/tool-results` 为**文件** → mkdir 静默失败 +
    // writeFile ENOTDIR → persistBinaryContent {error} 面
    const parent = join(cwd, `${stamp}-${UID}`)
    mkdirSync(parent)
    writeFileSync(join(parent, 'tool-results'), 'blocker')
    resetMcpClientRegistry()
  })

  afterAll(() => {
    process.env.ATLAS_CONFIG_DIR_NAME = origEnv
    process.chdir(origCwd)
    rmSync(cwd, { recursive: true, force: true })
  })

  test('持久化失败 → text = Binary content could not be saved to disk: ...（逐字面）', async () => {
    blobClient(BLOB_B64)
    const out = await readBlob()

    expect(out.blobSavedTo).toBeUndefined()
    expect(out.text).toBeDefined()
    expect(out.text!.startsWith('Binary content could not be saved to disk: ')).toBe(true)
    // ENOTDIR 面（目录被文件遮蔽）
    expect(out.text).toContain('ENOTDIR')
  })
})
