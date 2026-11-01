/**
 * engine/tools/mcp S-E2（§8.63）func 层（真盘）：ReadMcpResource blob
 * 拦截面的 persistBinaryContent 成功/错误 2 面（裸 fs 写，unit 不可覆写，
 * plan/web func 先例）。
 *
 * 目录戳策略（§8.63.1.5 登记；0.1.84 K5-6 安全复审硬化重锚）：
 * 输出根 = getSecureToolResultsDir（engine/tools/toolResultsDir.ts）=
 * `${ATLAS_TMPDIR}/${ATLAS_CONFIG_DIR_NAME|'.atlas'}-${uid}/tool-results`
 * （绝对安全根，0700，symlink/他人属主预占拒绝）→ 本文件 per-file 进程
 * 隔离下 ATLAS_TMPDIR = chdir(mkdtemp) 自有目录 + ATLAS_CONFIG_DIR_NAME
 * = 唯一名戳（不触真实 .atlas 数据，路径形状与旧 cwd 相对面同形）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _resetAtlasTempDirForTest } from '../../src/permissions/filesystem'
import {
  ReadMcpResourceTool,
  resetMcpClientRegistry,
  setMcpClientRegistry,
} from '../../src/engine/tools'

const UID = process.getuid?.() ?? 0
const BLOB_BYTES = Buffer.from('hello-binary', 'utf8')
const BLOB_B64 = BLOB_BYTES.toString('base64')

// S-E3 B 路 F1：Bun 下 `process.env.X = undefined` 写字符串 "undefined" 而非
// 删除（`in` 判真）→ 还原须条件 delete（orig 为 undefined 时）
function restoreConfigDirName(orig: string | undefined): void {
  if (orig === undefined) delete process.env.ATLAS_CONFIG_DIR_NAME
  else process.env.ATLAS_CONFIG_DIR_NAME = orig
}

// ATLAS_TMPDIR 同坑（Bun env 赋 undefined 成 "undefined" 字符串）；
// 恢复后须 _resetAtlasTempDirForTest()（getAtlasTempDir 模块级缓存）
function restoreTmpdir(orig: string | undefined): void {
  if (orig === undefined) delete process.env.ATLAS_TMPDIR
  else process.env.ATLAS_TMPDIR = orig
  _resetAtlasTempDirForTest()
}

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
  let origTmp: string | undefined

  beforeAll(() => {
    origCwd = process.cwd()
    cwd = mkdtempSync(join(tmpdir(), 'atlas-mcp-func-'))
    process.chdir(cwd)
    stamp = `atlas-mcp-func-${Date.now()}`
    origEnv = process.env.ATLAS_CONFIG_DIR_NAME
    process.env.ATLAS_CONFIG_DIR_NAME = stamp
    // 0.1.84 K5-6：输出根改绝对安全根 → ATLAS_TMPDIR 钉到自有 cwd
    origTmp = process.env.ATLAS_TMPDIR
    process.env.ATLAS_TMPDIR = cwd
    _resetAtlasTempDirForTest()
    resetMcpClientRegistry()
  })

  afterAll(() => {
    restoreConfigDirName(origEnv)
    restoreTmpdir(origTmp)
    process.chdir(origCwd)
    rmSync(cwd, { recursive: true, force: true })
  })

  test('base64 blob → persistBinaryContent 真写（blobSavedTo 存在 + 字节逐字 + mime ext + size 文案面）', async () => {
    blobClient(BLOB_B64)
    const out = await readBlob()

    expect(out.blobSavedTo).toBeDefined()
    expect(out.blobSavedTo?.endsWith('.png')).toBe(true)
    // 目录戳面：`<atlas-tmp>/<stamp>-<uid>/tool-results/`（本文件
    // ATLAS_TMPDIR = 自有 cwd，与旧 cwd 相对面同形）
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

describe('F-M2 blob 错误面（tool-results 预造为文件 → 持久化明确失败）', () => {
  let cwd: string
  let origCwd: string
  let stamp: string
  let origEnv: string | undefined
  let origTmp: string | undefined

  beforeAll(() => {
    origCwd = process.cwd()
    cwd = mkdtempSync(join(tmpdir(), 'atlas-mcp-func-err-'))
    process.chdir(cwd)
    stamp = `atlas-mcp-func-err-${Date.now()}`
    origEnv = process.env.ATLAS_CONFIG_DIR_NAME
    process.env.ATLAS_CONFIG_DIR_NAME = stamp
    // 0.1.84 K5-6：输出根改绝对安全根 → ATLAS_TMPDIR 钉到自有 cwd
    origTmp = process.env.ATLAS_TMPDIR
    process.env.ATLAS_TMPDIR = cwd
    _resetAtlasTempDirForTest()
    // 预造 `<stamp>-<uid>/tool-results` 为**文件**：旧码 mkdir 静默失败 +
    // writeFile ENOTDIR；0.1.84 K5-6 硬化 helper mkdir 早失败 EEXIST →
    // persistBinaryContent {error} 面（契约不变：明确失败非静默成功）
    const parent = join(cwd, `${stamp}-${UID}`)
    mkdirSync(parent)
    writeFileSync(join(parent, 'tool-results'), 'blocker')
    resetMcpClientRegistry()
  })

  afterAll(() => {
    restoreConfigDirName(origEnv)
    restoreTmpdir(origTmp)
    process.chdir(origCwd)
    rmSync(cwd, { recursive: true, force: true })
  })

  test('持久化失败 → text = Binary content could not be saved to disk: ...（逐字面）', async () => {
    blobClient(BLOB_B64)
    const out = await readBlob()

    expect(out.blobSavedTo).toBeUndefined()
    expect(out.text).toBeDefined()
    expect(out.text!.startsWith('Binary content could not be saved to disk: ')).toBe(true)
    // 目录被文件遮蔽 → helper 明确失败（0.1.84 K5-6：mkdir EEXIST 早失败；
    // v2 硬化：lstat 验证非目录 → 语义错误串 Unsafe/not a real directory；
    // 旧码静默穿透到 writeFile ENOTDIR——errno 非契约面，语义串是契约）
    expect(out.text).toMatch(/EEXIST|ENOTDIR|Unsafe|not a real directory/i)
  })
})
