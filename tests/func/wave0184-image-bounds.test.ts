/**
 * 0.1.84 V3-5 K5-1 — Read 图片支有界读（func 层真盘）。
 *
 * 上游 302：任意大小图片/伪图片管道设备全读——旧 readImageWithTokenBudget
 * 无界 readFileBytes：>128MiB 全量驻内存；任意名字 FIFO（带 image 扩展名，
 * BLOCKED_DEVICE_PATHS 路径名单不覆盖）无 writer 时 open 阻塞；字符设备
 * 别名（symlink）无穷读或读空。阈值 128×1024×1024=134217728B，超过拒、
 * 等于不因 size 单独拒。
 *
 * 产品面（ReadTool.call image 支，engine）：
 *  - regular 小图成功（控制组，双态恒绿）；
 *  - symlink→regular 放行（类型判别跟目标不跟链接名）；
 *  - sparse 超限（stat 134217729B，磁盘零实占）读前拒，不整图驻留；
 *  - 伪 jpg FIFO（无 writer）拒绝且不等 producer（race 守卫）；
 *  - 字符设备别名（symlink→/dev/null）类型拒绝。
 * helper 面（src/shared/boundedImageRead 动态 import——基线模块不存在时
 * import-error 非行为红，工单 §0 规则）：
 *  - 边界 seam：maxBytes=1024 时 1024B 放行 / 1025B 拒（不解码假 128MiB 图）；
 *  - 读循环 duck 句柄：EOF 恰内容 / 无穷流累计帽拒（stat 后增长守卫）/ abort；
 *  - FIFO 无 writer 快拒 + symlink→FIFO 拒。
 *
 * RED 基线（05ec0bc）：超限 sparse 全读成功（~128MiB 驻内存后 base64 成像
 * 果返回）、FIFO race 超时（open 阻塞待 producer，进程退出可能滞留挂起
 * 句柄——runner 外层 timeout 兜底）、chardev 读空报 'Image file is empty'
 * （非类型拒绝）。
 */
import { execFileSync } from 'child_process'
import {
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { ToolPermissionContext } from '../../src/shared'
import { ReadTool } from '../../src/engine/tools'

// 1×1 PNG（最小合法；files-read-real 同源 fixture——源文件注释称 68 字节，
// 实际 base64 解码 70 字节，断言一律以解码长度为准不落魔数）
const PNG_1X1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const PNG_1X1_BYTES = Buffer.from(PNG_1X1_B64, 'base64')

const MAX_IMAGE_BYTES = 128 * 1024 * 1024 // 134217728

function makePermsCtx(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  } as unknown as ToolPermissionContext
}

function makeCtx(): {
  getAppState(): { toolPermissionContext: ToolPermissionContext }
  abortController: AbortController
} {
  return {
    getAppState: () => ({ toolPermissionContext: makePermsCtx() }),
    abortController: new AbortController(),
  }
}

/** race 守卫：拒绝前不得阻塞（FIFO 无 writer open / 无穷设备读）。 */
async function settling<T>(
  p: Promise<T>,
  ms: number,
  what: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`TIMEOUT[${what}]: no settle within ${ms}ms`)),
          ms,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

let dir: string
let tinyPng: string // regular 68B 真图
let sparsePng: string // stat 134217729B sparse，磁盘零实占
let fifoJpg: string // mkfifo fake.jpg（无 writer）
let nullPng: string // symlink → /dev/null（字符设备）
let goodLink: string // symlink → tinyPng（regular 目标）

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-w184-img-'))
  tinyPng = join(dir, 'tiny.png')
  writeFileSync(tinyPng, Buffer.from(PNG_1X1_B64, 'base64'))
  sparsePng = join(dir, 'sparse.png')
  writeFileSync(sparsePng, 'x')
  truncateSync(sparsePng, MAX_IMAGE_BYTES + 1)
  fifoJpg = join(dir, 'fake.jpg')
  execFileSync('mkfifo', [fifoJpg])
  nullPng = join(dir, 'nulldev.png')
  symlinkSync('/dev/null', nullPng)
  goodLink = join(dir, 'good.png')
  symlinkSync(tinyPng, goodLink)
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('K5-1 产品面：ReadTool.call image 支（engine）', () => {
  test('regular 小图成功（控制组）', async () => {
    const res = await ReadTool.call({ file_path: tinyPng }, makeCtx())
    expect(res.data.type).toBe('image')
    if (res.data.type === 'image') {
      expect(res.data.file.base64).toBe(PNG_1X1_B64)
      expect(res.data.file.originalSize).toBe(PNG_1X1_BYTES.length)
      expect(res.data.file.type).toBe('image/png')
    }
  })

  test('symlink→regular 放行（类型判别跟目标不跟链接名）', async () => {
    const res = await ReadTool.call({ file_path: goodLink }, makeCtx())
    expect(res.data.type).toBe('image')
    if (res.data.type === 'image') {
      expect(res.data.file.originalSize).toBe(PNG_1X1_BYTES.length)
    }
  })

  test('超限 sparse（134217729B > 134217728B）读前拒，不整图驻留', async () => {
    expect(statSync(sparsePng).size).toBe(MAX_IMAGE_BYTES + 1)
    await expect(
      settling(
        ReadTool.call({ file_path: sparsePng }, makeCtx()),
        30000,
        'sparse',
      ),
    ).rejects.toThrow(/too large|exceeds the maximum/i)
  })

  test('伪图片 FIFO（无 writer）拒绝且不等 producer', async () => {
    await expect(
      settling(
        ReadTool.call({ file_path: fifoJpg }, makeCtx()),
        5000,
        'fifo',
      ),
    ).rejects.toThrow(/not a regular file|FIFO|pipe/i)
  })

  test('字符设备别名（symlink→/dev/null）类型拒绝', async () => {
    await expect(
      settling(
        ReadTool.call({ file_path: nullPng }, makeCtx()),
        5000,
        'chardev',
      ),
    ).rejects.toThrow(/not a regular file|device/i)
  })
})

describe('K5-1 helper 面（src/shared/boundedImageRead）', () => {
  test('边界 seam：maxBytes=1024 → 1024B 放行 / 1025B 拒（零 128MiB 分配）', async () => {
    const { readBoundedFileBytes } = await import(
      '../../src/shared/boundedImageRead'
    )
    const p1024 = join(dir, 'b1024.bin')
    const p1025 = join(dir, 'b1025.bin')
    writeFileSync(p1024, Buffer.alloc(1024, 1))
    writeFileSync(p1025, Buffer.alloc(1025, 1))
    const ok = await readBoundedFileBytes(p1024, 1024)
    expect(ok.length).toBe(1024)
    await expect(readBoundedFileBytes(p1025, 1024)).rejects.toThrow(
      /too large|exceeds the maximum/i,
    )
  })

  test('读循环 duck 句柄：EOF 恰内容 / 无穷流累计帽拒 / abort', async () => {
    const { readBoundedFromHandle } = await import(
      '../../src/shared/boundedImageRead'
    )
    // EOF 恰内容（不丢不重）
    const eofHandle = {
      bytes: Buffer.from('hello bounded'),
      pos: 0,
      async read(
        buffer: Buffer,
        offset: number,
        length: number,
        _position: number | null,
      ) {
        const n = Math.min(length, this.bytes.length - this.pos)
        if (n > 0) {
          this.bytes.copy(buffer, offset, this.pos, this.pos + n)
          this.pos += n
        }
        return { bytesRead: n }
      },
      async close() {},
    }
    const out = await readBoundedFromHandle(eofHandle as never, 1024)
    expect(out.toString()).toBe('hello bounded')

    // 无穷流（模拟 stat 后增长/无穷源）：累计 > maxBytes 拒（增长守卫）
    const endless = {
      async read(
        buffer: Buffer,
        offset: number,
        length: number,
        _position: number | null,
      ) {
        buffer.fill(7, offset, offset + length)
        return { bytesRead: length }
      },
      async close() {},
    }
    await expect(
      readBoundedFromHandle(endless as never, 4096),
    ).rejects.toThrow(/too large|exceeds the maximum/i)

    // abort：chunk 间查 signal
    const ctl = new AbortController()
    ctl.abort()
    await expect(
      readBoundedFromHandle(endless as never, 65536, ctl.signal),
    ).rejects.toThrow(/abort/i)
  })

  test('FIFO 无 writer 快拒 + symlink→FIFO 拒（helper 直面）', async () => {
    const { readBoundedImageBytes } = await import(
      '../../src/shared/boundedImageRead'
    )
    await expect(
      settling(readBoundedImageBytes(fifoJpg), 5000, 'helper-fifo'),
    ).rejects.toThrow(/not a regular file|FIFO|pipe/i)
    const pipeLink = join(dir, 'pipelink.png')
    symlinkSync(fifoJpg, pipeLink)
    await expect(
      settling(readBoundedImageBytes(pipeLink), 5000, 'helper-pipe-link'),
    ).rejects.toThrow(/not a regular file|FIFO|pipe/i)
  })
})
