/**
 * §8.55 S-C1 — FsOperations §8.55 加法 5 成员（readFileBytes / readSync /
 * isDirEmptySync / readlinkSync / renameSync）NodeFsOperations 真盘行为
 * 证据（func 层：真 tmpdir；unit 层零磁盘纪律）。
 *
 * 旧仓对照（a8af45b）：utils/fsOperations.ts NodeFsOperations 同名原语
 * 逐字（slowLogging 裁）——本文件 = 新加法面默认腿行为证据（同
 * shared-fs-passthrough.test.ts 默认腿证据先例）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  NodeFsOperations,
  getFsImplementation,
  setOriginalFsImplementation,
} from '../../src/shared'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-sc1-fs-'))
})

afterEach(() => {
  setOriginalFsImplementation()
  rmSync(dir, { recursive: true, force: true })
})

describe('FsOperations §8.55 加法面（NodeFsOperations 默认腿真盘）', () => {
  test('默认腿身份（getFsImplementation() === NodeFsOperations）', () => {
    expect(getFsImplementation()).toBe(NodeFsOperations)
  })

  test('readFileBytes → Buffer（无 encoding 语义）', async () => {
    writeFileSync(join(dir, 'bin.txt'), 'hello')
    const buf = await NodeFsOperations.readFileBytes(join(dir, 'bin.txt'))
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.toString('utf8')).toBe('hello')
  })

  test('readSync({length}) → { buffer, bytesRead }（短文件 bytesRead 实读）', () => {
    writeFileSync(join(dir, 'short.txt'), 'abc')
    const { buffer, bytesRead } = NodeFsOperations.readSync(
      join(dir, 'short.txt'),
      { length: 10 },
    )
    expect(bytesRead).toBe(3)
    expect(buffer.toString('utf8', 0, bytesRead)).toBe('abc')
  })

  test('isDirEmptySync：空目录 true / 有文件 false', () => {
    expect(NodeFsOperations.isDirEmptySync(dir)).toBe(true)
    writeFileSync(join(dir, 'x.txt'), 'x')
    expect(NodeFsOperations.isDirEmptySync(dir)).toBe(false)
  })

  test('readlinkSync → 符号链接目标', () => {
    writeFileSync(join(dir, 'target.txt'), 't')
    symlinkSync(join(dir, 'target.txt'), join(dir, 'link.txt'))
    expect(NodeFsOperations.readlinkSync(join(dir, 'link.txt'))).toBe(
      join(dir, 'target.txt'),
    )
  })

  test('renameSync → 原子改名（源消失 / 目标存在）', () => {
    writeFileSync(join(dir, 'a.txt'), 'a')
    NodeFsOperations.renameSync(join(dir, 'a.txt'), join(dir, 'b.txt'))
    expect(NodeFsOperations.existsSync(join(dir, 'a.txt'))).toBe(false)
    expect(NodeFsOperations.existsSync(join(dir, 'b.txt'))).toBe(true)
  })
})
