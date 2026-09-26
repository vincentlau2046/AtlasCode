/**
 * §8.55 S-C3（C 桶 ① 子波 3 高频族纵切 · pdf/notebook 族）纯叶子批单测。
 *
 * 覆盖（零磁盘零网络零 spawn；env 卫生保存/恢复）：
 *  - pdfUtils parsePDFPageRange 全分支（单页 / 区间 / 开端 / 5 类非法）
 *  - pdfUtils isPDFExtension（点前缀归一）
 *  - pdfUtils isPDFSupported（modelRef getMainLoopModelName 面：
 *    ATLAS_SMALL_MODEL env 注入缝；claude-3-haiku 子串判 false 支）
 *  - notebook parseCellId（cell-N 型 + 非匹配）
 *  - notebook mapNotebookCellsToToolResult（相邻 text 块合并 /
 *    image 块透传 / 宽骨架 cast 面）
 *
 * 真盘/真 spawn 面（readPDF / getPDFPageCount / extractPDFPages /
 * readNotebook / execFileNoThrow 真二进制）→ func 层
 * tests/func/files-pdf-notebook-real.test.ts。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  isPDFExtension,
  isPDFSupported,
  parsePDFPageRange,
} from '../../src/engine/tools/files/pdfUtils'
import {
  mapNotebookCellsToToolResult,
  parseCellId,
} from '../../src/engine/tools/files/notebook'
import type { ContentBlockParam } from '../../src/shared'

const ENV_KEYS = ['ATLAS_SMALL_MODEL'] as const
let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv = {}
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe('pdfUtils parsePDFPageRange（全分支）', () => {
  test('单页 "5"', () => {
    expect(parsePDFPageRange('5')).toEqual({ firstPage: 5, lastPage: 5 })
  })
  test('区间 "1-10"', () => {
    expect(parsePDFPageRange('1-10')).toEqual({ firstPage: 1, lastPage: 10 })
  })
  test('开端 "3-" → lastPage Infinity', () => {
    expect(parsePDFPageRange('3-')).toEqual({ firstPage: 3, lastPage: Infinity })
  })
  test('前后空白归一', () => {
    expect(parsePDFPageRange('  7  ')).toEqual({ firstPage: 7, lastPage: 7 })
  })
  test('空串 → null', () => {
    expect(parsePDFPageRange('')).toBeNull()
  })
  test('非数字 → null', () => {
    expect(parsePDFPageRange('x')).toBeNull()
    expect(parsePDFPageRange('2-x')).toBeNull()
  })
  test('0 页 / 负数 → null（1-indexed 下界）', () => {
    expect(parsePDFPageRange('0')).toBeNull()
    expect(parsePDFPageRange('-5')).toBeNull()
    expect(parsePDFPageRange('0-5')).toBeNull()
  })
  test('倒挂区间 "10-5" → null', () => {
    expect(parsePDFPageRange('10-5')).toBeNull()
  })
  test('开端 0 → null', () => {
    expect(parsePDFPageRange('0-')).toBeNull()
  })
})

describe('pdfUtils isPDFExtension（点前缀归一）', () => {
  test('pdf / .pdf / PDF 全命中', () => {
    expect(isPDFExtension('pdf')).toBe(true)
    expect(isPDFExtension('.pdf')).toBe(true)
    expect(isPDFExtension('PDF')).toBe(true)
  })
  test('非 pdf 扩展名 → false', () => {
    expect(isPDFExtension('txt')).toBe(false)
    expect(isPDFExtension('.ipynb')).toBe(false)
  })
})

describe('pdfUtils isPDFSupported（modelRef 面）', () => {
  test('未配置模型（env 空串 → 确定性空 model 名）→ true（PDF 块面恒支持）', () => {
    process.env.ATLAS_SMALL_MODEL = ''
    expect(isPDFSupported()).toBe(true)
  })
  test('claude-3-haiku 子串命中 → false（页面渲染回退面）', () => {
    process.env.ATLAS_SMALL_MODEL = 'claude-3-haiku-20240307'
    expect(isPDFSupported()).toBe(false)
  })
})

describe('notebook parseCellId', () => {
  test('cell-N 型解析', () => {
    expect(parseCellId('cell-0')).toBe(0)
    expect(parseCellId('cell-42')).toBe(42)
  })
  test('非 cell-N 型 → undefined', () => {
    expect(parseCellId('cell-x')).toBeUndefined()
    expect(parseCellId('my-cell')).toBeUndefined()
  })
})

describe('notebook mapNotebookCellsToToolResult（宽骨架面）', () => {
  test('相邻 text 块合并（\\n 连接，image 打断合并）', () => {
    const data = [
      {
        cellType: 'markdown',
        source: 'md-a',
        cell_id: 'c0',
      },
      {
        cellType: 'markdown',
        source: 'md-b',
        cell_id: 'c1',
      },
      {
        cellType: 'code',
        source: 'print(1)',
        cell_id: 'c2',
        outputs: [
          {
            output_type: 'stream',
            text: '1',
            image: { image_data: 'aGk=', media_type: 'image/png' },
          },
        ],
      },
    ] as never
    const res = mapNotebookCellsToToolResult(data, 'tool-1') as {
      tool_use_id: string
      type: string
      content: ContentBlockParam[]
    }
    expect(res.tool_use_id).toBe('tool-1')
    expect(res.type).toBe('tool_result')
    // c0 + c1 两 text 块合并为 1；c2 = content text + 输出 text + image = 3
    const texts = res.content.filter(b => b.type === 'text')
    const images = res.content.filter(b => b.type === 'image')
    expect(images).toHaveLength(1)
    expect(
      (texts[0] as { text: string }).text.includes('<cell id="c0">'),
    ).toBe(true)
    expect(
      (texts[0] as { text: string }).text.includes('<cell id="c1">'),
    ).toBe(true)
  })

  test('空数据 → 空 content', () => {
    const res = mapNotebookCellsToToolResult([], 'tool-2') as {
      content: ContentBlockParam[]
    }
    expect(res.content).toEqual([])
  })

  test('cell 内容块 + 输出 text 块相邻合并（map 层单块）', () => {
    // 大输出截断支（readNotebook includeLargeOutputs=false）= func 真盘面；
    // 此处 = map 层相邻 text 块 \n 合并行为面
    const data = [
      {
        cellType: 'code',
        source: 'x',
        cell_id: 'c0',
        outputs: [
          {
            output_type: 'stream',
            text: 'big',
            image: undefined,
          },
        ],
      },
    ] as never
    const res = mapNotebookCellsToToolResult(data, 'tool-3') as {
      content: ContentBlockParam[]
    }
    expect(res.content).toHaveLength(1)
    expect((res.content[0] as { text: string }).text).toContain('<cell id="c0">')
    expect((res.content[0] as { text: string }).text).toContain('big')
  })
})
