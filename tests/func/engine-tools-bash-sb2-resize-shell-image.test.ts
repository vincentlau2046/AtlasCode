/**
 * engine/tools/bash S-B2 resizeShellImageOutput overflow-file 真盘面
 * （Bash 本体纵切子波 §8.54 S-B2 func 层 1 文件，C 桶 ① 子波 2）。
 *
 * func 层（真盘 I/O 允许）：mkdtemp 输出文件 → resizeShellImageOutput
 * （旧仓 utils.ts 221L 逐字随迁，D-3 resize 调用裁出）：
 *  - overflow-file 重读支：stdout 被截断时从 outputFilePath 重读完整
 *    data-URI（truncated base64 会解码成坏图 → 重读语义逐字保留）
 *  - 20MB cap 支：outputFileSize 显式传入 > 20MB → null（免真写 20MB
 *    大文件；stat 支经 outputFileSize 参数短路，行为等价）
 *  - 文件不存在 + outputFileSize 缺省 → stat 抛 → reject（旧仓同语义）
 */
import { describe, test, expect, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  resizeShellImageOutput,
} from '../../src/engine/tools/bash/bashUtils'

const root = mkdtempSync(join(tmpdir(), 'atlas-bash-sb2-img-'))

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const DATA_URI = 'data:image/png;base64,QQ=='

describe('resizeShellImageOutput overflow-file 重读面', () => {
  test('stdout 截断 + 输出文件存在 → 重读完整 data-URI', async () => {
    const out = join(root, 'out.log')
    writeFileSync(out, DATA_URI)
    // stdout 只留残片（模拟 getMaxOutputLength 截断），完整内容走文件
    const result = await resizeShellImageOutput(
      'data:image/png;base64,QQ', // 截断残片（非合法完整 URI 尾部）
      out,
      undefined,
    )
    expect(result).toBe(DATA_URI)
  })

  test('outputFileSize 显式短路 stat（> 20MB cap → null）', async () => {
    const out = join(root, 'big.log')
    // 文件不写：outputFileSize 显式传入时 stat 支被短路（参数 ?? stat）
    expect(
      await resizeShellImageOutput(DATA_URI, out, 21 * 1024 * 1024),
    ).toBeNull()
  })

  test('20MB 内 outputFileSize → 走文件重读', async () => {
    const out = join(root, 'small.log')
    writeFileSync(out, DATA_URI)
    expect(
      await resizeShellImageOutput('truncated', out, 1024),
    ).toBe(DATA_URI)
  })

  test('文件不存在 + outputFileSize 缺省 → stat 抛 reject（旧仓同语义）', async () => {
    await expect(
      resizeShellImageOutput(DATA_URI, join(root, 'missing.log'), undefined),
    ).rejects.toThrow()
  })
})
