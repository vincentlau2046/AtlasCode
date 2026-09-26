/**
 * §8.55 S-C1（C 桶 ① 子波 3 高频族纵切 · 依赖闭包层 1）fs 依赖批单测。
 *
 * 覆盖（零真实磁盘：FsOperations 注入 stub；cost state 复位隔离）：
 *  - diffUtils（旧仓 utils/diff.ts 172L 逐字 + delta：diff 依赖真 patch
 *    面 / getLocCounter 两调用点裁 / count 内联 / FileEdit 型域内）
 *    探针锚 P-C3（Edit structuredPatch 输出面）本文件 = 定向红集锚点：
 *    突变 structuredPatch 恒空 patch → 下列 patch 非空断言恰 1 红
 *  - fileRead detectEncodingForResolvedPath（stub fs readSync：UTF-16LE
 *    BOM / UTF-8 BOM / 空文件支）+ readFileSyncWithMetadata（CRLF 归一
 *    + 行尾探测单 pass）
 *  - fileUtils detectFileEncoding / detectLineEndings（包装面：safeResolvePath
 *    失败回落原路径 + 异常面 'utf8'/'LF' 兜底）
 *  - fileReadCache（mtime 失效缓存：命中不重读 / invalidate / getStats /
 *    clear；模块级单例先例）
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  NodeFsOperations,
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
} from '../../src/shared'
import {
  resetCostState,
  getTotalLinesAdded,
  getTotalLinesRemoved,
} from '../../src/bootstrap'
import {
  adjustHunkLineNumbers,
  countLinesChanged,
  getPatchForDisplay,
  getPatchFromContents,
  CONTEXT_LINES,
  DIFF_TIMEOUT_MS,
} from '../../src/engine/tools/files/diffUtils'
import {
  detectEncodingForResolvedPath,
  readFileSyncWithMetadata,
} from '../../src/engine/tools/files/fileRead'
import {
  detectFileEncoding,
  detectLineEndings,
} from '../../src/engine/tools/files/fileUtils'
import { fileReadCache } from '../../src/engine/tools/files/fileReadCache'

beforeEach(() => {
  setOriginalFsImplementation()
  resetCostState()
  fileReadCache.clear()
})

afterEach(() => {
  setOriginalFsImplementation()
  resetCostState()
  fileReadCache.clear()
})

/** 最小 stub：仅覆盖本批消费的成员（tests/ 不在 tsc 域，字面 stub 先例）。 */
function stubFs(overrides: Partial<FsOperations> = {}): FsOperations {
  return {
    ...NodeFsOperations,
    lstatSync: () => {
      throw Object.assign(new Error('enoent'), { code: 'ENOENT' })
    },
    ...overrides,
  }
}

describe('diffUtils 常量面', () => {
  test('CONTEXT_LINES = 3 / DIFF_TIMEOUT_MS = 5000（旧仓逐字）', () => {
    expect(CONTEXT_LINES).toBe(3)
    expect(DIFF_TIMEOUT_MS).toBe(5_000)
  })
})

describe('diffUtils getPatchFromContents（探针 P-C3 锚：真 patch 面）', () => {
  test('单行替换 → 1 hunk，lines 含 -b/+c', () => {
    const hunks = getPatchFromContents({
      filePath: 'a.ts',
      oldContent: 'a\nb\n',
      newContent: 'a\nc\n',
    })
    expect(hunks).toHaveLength(1)
    expect(hunks[0].lines).toContain('-b')
    expect(hunks[0].lines).toContain('+c')
  })

  test('& / $ 转义往返（AMPERSAND/DOLLAR token 不泄漏到输出）', () => {
    const hunks = getPatchFromContents({
      filePath: 'a.sh',
      oldContent: 'x & y\n',
      newContent: 'x $ y\n',
    })
    expect(hunks[0].lines).toContain('-x & y')
    expect(hunks[0].lines).toContain('+x $ y')
    for (const line of hunks[0].lines) {
      expect(line).not.toContain('AMPERSAND_TOKEN')
      expect(line).not.toContain('DOLLAR_TOKEN')
    }
  })

  test('同内容 → 空 hunk 集', () => {
    expect(
      getPatchFromContents({
        filePath: 'a.ts',
        oldContent: 'same\n',
        newContent: 'same\n',
      }),
    ).toEqual([])
  })
})

describe('diffUtils countLinesChanged（bootstrap cost state 累加；getLocCounter 裁面）', () => {
  test('patch 面：增删行数累加进 totalLinesAdded/Removed', () => {
    const hunks = getPatchFromContents({
      filePath: 'a.ts',
      oldContent: 'a\nb\nc\n',
      newContent: 'a\nx\ny\nz\n',
    })
    countLinesChanged(hunks)
    // 增 = x/y/z 3 行；删 = b/c 2 行（'a' 为 context 行不计）
    expect(getTotalLinesAdded()).toBe(3)
    expect(getTotalLinesRemoved()).toBe(2)
  })

  test('新文件面（空 patch + newFileContent）：全行计增', () => {
    countLinesChanged([], 'l1\nl2\nl3')
    expect(getTotalLinesAdded()).toBe(3)
    expect(getTotalLinesRemoved()).toBe(0)
  })
})

describe('diffUtils adjustHunkLineNumbers', () => {
  test('offset = 0 短路：原引用透传', () => {
    const hunks = [
      { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [] },
    ]
    expect(adjustHunkLineNumbers(hunks, 0)).toBe(hunks)
  })

  test('offset = 5：oldStart/newStart 各 +5（其余字段展开保留）', () => {
    const [hunk] = adjustHunkLineNumbers(
      [
        {
          oldStart: 10,
          oldLines: 2,
          newStart: 10,
          newLines: 2,
          lines: ['-a', '+b'],
        },
      ],
      5,
    )
    expect(hunk.oldStart).toBe(15)
    expect(hunk.newStart).toBe(15)
    expect(hunk.lines).toEqual(['-a', '+b'])
  })
})

describe('diffUtils getPatchForDisplay（replace_all / tab 归一）', () => {
  test('replace_all = true：全量替换', () => {
    const hunks = getPatchForDisplay({
      filePath: 'a.txt',
      fileContents: 'foo\nfoo\n',
      edits: [{ old_string: 'foo', new_string: 'bar', replace_all: true }],
    })
    expect(hunks.length).toBeGreaterThan(0)
    const plus = hunks[0].lines.filter(l => l.startsWith('+'))
    expect(plus.filter(l => l.includes('bar')).length).toBe(2)
  })

  test('replace_all 缺省 = false：仅首处替换（duck 型 in 判）', () => {
    const hunks = getPatchForDisplay({
      filePath: 'a.txt',
      fileContents: 'foo\nfoo\n',
      edits: [{ old_string: 'foo', new_string: 'bar' }],
    })
    const plus = hunks[0].lines.filter(l => l.startsWith('+'))
    expect(plus.filter(l => l.includes('bar')).length).toBe(1)
  })

  test('前导 tab 显示归一为空格', () => {
    const hunks = getPatchForDisplay({
      filePath: 'a.py',
      fileContents: '\tdef f():\n',
      edits: [{ old_string: '\tdef f():', new_string: '\tdef g():' }],
    })
    expect(hunks[0].lines).toContain('-  def f():')
    expect(hunks[0].lines).toContain('+  def g():')
  })
})

describe('fileRead detectEncodingForResolvedPath（stub fs readSync 面）', () => {
  test('UTF-16LE BOM（FF FE）→ utf16le', () => {
    setFsImplementation(
      stubFs({
        readSync: () => ({
          buffer: Buffer.from([0xff, 0xfe, 0x00, 0x00]),
          bytesRead: 4,
        }),
      }),
    )
    expect(detectEncodingForResolvedPath('/x.txt')).toBe('utf16le')
  })

  test('UTF-8 BOM（EF BB BF）/ 普通内容 → utf8', () => {
    setFsImplementation(
      stubFs({
        readSync: () => ({
          buffer: Buffer.from([0xef, 0xbb, 0xbf, 0x61]),
          bytesRead: 4,
        }),
      }),
    )
    expect(detectEncodingForResolvedPath('/x.txt')).toBe('utf8')
  })

  test('空文件（bytesRead = 0）→ utf8（旧仓 emoji/CJK 空文件腐坏修复支）', () => {
    setFsImplementation(
      stubFs({
        readSync: () => ({ buffer: Buffer.alloc(4096), bytesRead: 0 }),
      }),
    )
    expect(detectEncodingForResolvedPath('/x.txt')).toBe('utf8')
  })
})

describe('fileRead readFileSyncWithMetadata（单 pass 编码 + 行尾 + CRLF 归一）', () => {
  test('CRLF 内容 → content LF 归一 + lineEndings CRLF + utf8', () => {
    setFsImplementation(
      stubFs({
        readSync: () => ({
          // 显式字节（a=0x61 CR=0x0d LF=0x0a b=0x62）；不用
          // str.buffer（V8 内部 Latin1/UTF-16 存储实现相关，字节数不定）
          buffer: Buffer.from([0x61, 0x0d, 0x0a, 0x62]),
          bytesRead: 4,
        }),
        readFileSync: () => 'a\r\nb',
      }),
    )
    const meta = readFileSyncWithMetadata('/x.txt')
    expect(meta.content).toBe('a\nb')
    expect(meta.encoding).toBe('utf8')
    expect(meta.lineEndings).toBe('CRLF')
  })
})

describe('fileUtils 包装面（safeResolvePath 失败回落 + 兜底）', () => {
  test('detectFileEncoding：lstat 抛 ENOENT → safeResolvePath 回落原路径 → readSync 面', () => {
    setFsImplementation(
      stubFs({
        readSync: () => ({
          buffer: Buffer.from([0xff, 0xfe]),
          bytesRead: 2,
        }),
      }),
    )
    expect(detectFileEncoding('/x.txt')).toBe('utf16le')
  })

  test('detectLineEndings：readSync 面 CRLF 采样 → CRLF', () => {
    setFsImplementation(
      stubFs({
        readSync: () => ({
          buffer: Buffer.from('a\r\nb\r\n'),
          bytesRead: 6,
        }),
      }),
    )
    expect(detectLineEndings('/x.txt')).toBe('CRLF')
  })

  test('detectLineEndings 异常面 → LF 兜底', () => {
    setFsImplementation(
      stubFs({
        readSync: () => {
          throw new Error('boom')
        },
      }),
    )
    expect(detectLineEndings('/x.txt')).toBe('LF')
  })
})

describe('fileReadCache（mtime 失效缓存）', () => {
  test('命中不重读（readFileSync 调用计数）+ CRLF 归一 + 缓存内容返回', () => {
    let reads = 0
    setFsImplementation(
      stubFs({
        statSync: () => ({ mtimeMs: 100 }) as never,
        readFileSync: () => {
          reads++
          return 'a\r\nb'
        },
      }),
    )
    const first = fileReadCache.readFile('/cached.txt')
    expect(first.content).toBe('a\nb')
    expect(first.encoding).toBe('utf8')
    const second = fileReadCache.readFile('/cached.txt')
    expect(second.content).toBe('a\nb')
    expect(reads).toBe(1)
  })

  test('mtime 变化 → 缓存失效重读', () => {
    let reads = 0
    let mtime = 100
    setFsImplementation(
      stubFs({
        statSync: () => ({ mtimeMs: mtime }) as never,
        readFileSync: () => {
          reads++
          return 'v1'
        },
      }),
    )
    fileReadCache.readFile('/mtime.txt')
    mtime = 200
    fileReadCache.readFile('/mtime.txt')
    expect(reads).toBe(2)
  })

  test('stat 抛错 → 缓存清项 + 重抛', () => {
    setFsImplementation(
      stubFs({
        statSync: () => {
          throw Object.assign(new Error('enoent'), { code: 'ENOENT' })
        },
      }),
    )
    expect(() => fileReadCache.readFile('/gone.txt')).toThrow()
    expect(fileReadCache.getStats().entries).not.toContain('/gone.txt')
  })

  test('invalidate / getStats / clear 面', () => {
    let reads = 0
    setFsImplementation(
      stubFs({
        statSync: () => ({ mtimeMs: 1 }) as never,
        readFileSync: () => {
          reads++
          return 'x'
        },
      }),
    )
    fileReadCache.readFile('/inv.txt')
    fileReadCache.invalidate('/inv.txt')
    fileReadCache.readFile('/inv.txt')
    expect(reads).toBe(2)
    expect(fileReadCache.getStats()).toEqual({
      size: 1,
      entries: ['/inv.txt'],
    })
    fileReadCache.clear()
    expect(fileReadCache.getStats().size).toBe(0)
  })
})
