/**
 * §8.55 S-C3 — pdf/notebook 族真盘行为（func 层：真 tmpdir + 真 poppler；
 * unit 层零磁盘零 spawn 纪律）。
 *
 * 旧仓对照（a8af45b）：utils/pdf.ts + utils/notebook.ts +
 * utils/execFileNoThrow.ts 消费面 —— readPDF 魔数校验 / getPDFPageCount
 * pdfinfo 探测 / extractPDFPages pdftoppm 渲染 / readNotebook 单元格
 * 处理 + 大输出截断，真二进制执行证据。
 *
 * 环境门控：poppler-utils（pdfinfo/pdftoppm）缺失时相关族 skip
 * （execFileNoThrow 真 spawn 面用 /bin/true|false，恒可用）。
 *
 * 最小合法 1 页 PDF 由 makeMinPdf() 确定性构造（xref 偏移程序化计算，
 * 本机 pdfinfo/pdftoppm 实测可解析可渲染后固化）。
 */
import {
  closeSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import {
  extractPDFPages,
  getPDFPageCount,
  readPDF,
  resetPdftoppmCache,
} from '../../src/engine/tools/files/pdf'
import { execFileNoThrow } from '../../src/engine/tools/files/execFileNoThrow'
import {
  mapNotebookCellsToToolResult,
  readNotebook,
} from '../../src/engine/tools/files/notebook'
import type { ContentBlockParam } from '../../src/shared'

/**
 * 最小合法 1 页 PDF（~440B；xref 偏移程序化计算 + 10 位零填充规范，
 * 本机 pdfinfo 实测 Pages: 1 / pdftoppm 可渲染后固化）。
 */
function makeMinPdf(): Buffer {
  const objs: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'ascii'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>',
      'ascii',
    ),
    Buffer.from('BT /F1 12 Tf 72 720 Td (hello) Tj ET', 'ascii'),
  ]
  let out = Buffer.from('%PDF-1.4\n', 'ascii')
  const offsets: number[] = []
  for (let i = 0; i < objs.length; i++) {
    offsets.push(out.length)
    out = Buffer.concat([
      out,
      Buffer.from(`${i + 1} 0 obj\n`, 'ascii'),
      objs[i],
      Buffer.from('\nendobj\n', 'ascii'),
    ])
  }
  const xrefPos = out.length
  let xref = Buffer.from('xref\n0 5\n0000000000 65535 f \n', 'ascii')
  for (const off of offsets) {
    const entry = `${String(off).padStart(10, '0')} 00000 n \n`
    xref = Buffer.concat([xref, Buffer.from(entry, 'ascii')])
  }
  return Buffer.concat([
    out,
    xref,
    Buffer.from('trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n', 'ascii'),
    Buffer.from(`${xrefPos}\n%%EOF\n`, 'ascii'),
  ])
}

function probeBin(name: string): boolean {
  try {
    execFileSync(name, ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    try {
      // pdftoppm 无 --version，用 -v（版本信息进 stderr）
      execFileSync(name, ['-v'], { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }
}

const hasPdfinfo = probeBin('pdfinfo')
const hasPdftoppm = probeBin('pdftoppm')
const t: typeof test = (hasPdfinfo && hasPdftoppm) ? test : test.skip

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-sc3-pdf-'))
  const minPdf = makeMinPdf()
  writeFileSync(join(dir, 'doc.pdf'), minPdf)
  writeFileSync(join(dir, 'fake.pdf'), 'hello, not a pdf')
  writeFileSync(join(dir, 'empty.pdf'), Buffer.alloc(0))
  const fd = openSync(join(dir, 'big.pdf'), 'w')
  ftruncateSync(fd, 21 * 1024 * 1024)
  closeSync(fd)
  // notebook fixture：markdown + code(小输出) + code(大输出截断支)
  const nb = {
    cells: [
      { cell_type: 'markdown', source: ['# title'], id: 'm0' },
      {
        cell_type: 'code',
        source: ['print(1)'],
        id: 'c0',
        execution_count: 1,
        outputs: [{ output_type: 'stream', text: ['1\n'] }],
      },
      {
        cell_type: 'code',
        source: ['x = "a" * 20000'],
        id: 'c1',
        execution_count: 1,
        outputs: [{ output_type: 'stream', text: ['a'.repeat(20000)] }],
      },
    ],
    metadata: { language_info: { name: 'python' } },
  }
  writeFileSync(join(dir, 'nb.ipynb'), JSON.stringify(nb))
  resetPdftoppmCache()
})

afterEach(() => {
  resetPdftoppmCache()
})

afterAll(() => {
  // tmpdir 回收 + extract outputDir 落在 getAtlasTempDirName() 用户 temp 基
  // （非本 tmpdir）→ 末位 test 后统一清
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('execFileNoThrow 域内最小形（真 spawn）', () => {
  test('/bin/true → code 0', async () => {
    const r = await execFileNoThrow('/bin/true', [], {
      timeout: 5000,
      useCwd: false,
    })
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('')
  })

  test('/bin/false → code 1 + stderr 保留（preserveOutputOnError 缺省）', async () => {
    const r = await execFileNoThrow('/bin/false', [], {
      timeout: 5000,
      useCwd: false,
    })
    expect(r.code).toBe(1)
  })

  test('不存在二进制 → spawn 失败支（logError + code 1 恒解析不抛）', async () => {
    const r = await execFileNoThrow('/nonexistent-bin-xyz', [], {
      timeout: 5000,
      useCwd: false,
    })
    expect(r.code).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toBe('')
  })

  test('preserveOutputOnError=false → 非零退出不保留输出', async () => {
    const r = await execFileNoThrow('/bin/sh', ['-c', 'echo hi; exit 3'], {
      timeout: 5000,
      useCwd: false,
      preserveOutputOnError: false,
    })
    expect(r.code).toBe(3)
    expect(r.stdout).toBe('')
    expect(r.stderr).toBe('')
  })
})

describe('readPDF 真盘（4 分支）', () => {
  test('合法 PDF → success + base64 + originalSize', async () => {
    const res = await readPDF(join(dir, 'doc.pdf'))
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.type).toBe('pdf')
      expect(res.data.file.originalSize).toBeGreaterThan(400)
      expect(Buffer.from(res.data.file.base64, 'base64').subarray(0, 5).toString('ascii')).toBe('%PDF-')
    }
  })

  test('非 PDF 内容（.pdf 假面）→ corrupted（魔数校验面）', async () => {
    const res = await readPDF(join(dir, 'fake.pdf'))
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.reason).toBe('corrupted')
  })

  test('空文件 → empty', async () => {
    const res = await readPDF(join(dir, 'empty.pdf'))
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.reason).toBe('empty')
  })

  test('21MB（> PDF_TARGET_RAW_SIZE 20MB）→ too_large（稀疏文件）', async () => {
    const res = await readPDF(join(dir, 'big.pdf'))
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.reason).toBe('too_large')
  })
})

describe('getPDFPageCount（poppler 门控）', () => {
  t('1 页 PDF → 1（pdfinfo 真执行）', async () => {
    expect(await getPDFPageCount(join(dir, 'doc.pdf'))).toBe(1)
  })

  test('不存在路径 → null（code != 0 支，恒可用）', async () => {
    expect(await getPDFPageCount(join(dir, 'nope.pdf'))).toBeNull()
  })
})

describe('extractPDFPages（pdftoppm 门控）', () => {
  t('1 页 PDF → 1 jpg + outputDir + count', async () => {
    const res = await extractPDFPages(join(dir, 'doc.pdf'))
    expect(res.success).toBe(true)
    if (res.success) {
      // 旧仓型面：count 在 file 子对象内（PDFExtractPagesResult 逐字）
      expect(res.data.file.count).toBe(1)
      const files = readdirSync(res.data.file.outputDir)
      expect(files.filter(f => f.endsWith('.jpg'))).toHaveLength(1)
      // outputDir 落 getAtlasTempDirName() 用户 temp 基 → 测试内清
      rmSync(res.data.file.outputDir, { recursive: true, force: true })
    }
  })

  t('页范围 { firstPage: 1, lastPage: 1 } → 同 1 页', async () => {
    const res = await extractPDFPages(join(dir, 'doc.pdf'), {
      firstPage: 1,
      lastPage: 1,
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.file.count).toBe(1)
      rmSync(res.data.file.outputDir, { recursive: true, force: true })
    }
  })
})

describe('readNotebook 真盘（单元格处理 + 截断 + cellId）', () => {
  test('全量读 → 3 单元格 + code 支 language/execution_count', async () => {
    const cells = await readNotebook(join(dir, 'nb.ipynb'))
    expect(cells).toHaveLength(3)
    expect(cells[0].cellType).toBe('markdown')
    expect(cells[1].language).toBe('python')
    expect(cells[1].execution_count).toBe(1)
  })

  test('大输出截断支（>10000 字 → stream 提示块，jq 指引含 BASH_TOOL_NAME）', async () => {
    const cells = await readNotebook(join(dir, 'nb.ipynb'))
    const outs = (cells[2] as { outputs?: { output_type: string; text: string }[] })
      .outputs
    expect(outs).toHaveLength(1)
    expect(outs![0].output_type).toBe('stream')
    expect(outs![0].text).toContain('Outputs are too large')
    expect(outs![0].text).toContain('Bash')
  })

  test('cellId 精确读（includeLargeOutputs=true 不截断）', async () => {
    const cells = await readNotebook(join(dir, 'nb.ipynb'), 'c1')
    expect(cells).toHaveLength(1)
    const outs = (cells[0] as { outputs?: { text: string }[] }).outputs
    expect(outs![0].text).toHaveLength(20000)
  })

  test('不存在 cellId → 抛错（Cell with ID … not found）', async () => {
    await expect(readNotebook(join(dir, 'nb.ipynb'), 'zzz')).rejects.toThrow(
      'Cell with ID "zzz" not found',
    )
  })
})

describe('mapNotebookCellsToToolResult 真数据面', () => {
  test('全量 notebook → tool_result 块型 + text 合并', async () => {
    const cells = await readNotebook(join(dir, 'nb.ipynb'))
    const res = mapNotebookCellsToToolResult(cells, 'tu-1') as {
      tool_use_id: string
      type: string
      content: ContentBlockParam[]
    }
    expect(res.tool_use_id).toBe('tu-1')
    expect(res.type).toBe('tool_result')
    // 全 cell 的 text 块相邻 → map 层 \n 合并为单块（merge 行为面）
    expect(res.content).toHaveLength(1)
    const text = (res.content[0] as { text: string }).text
    expect(text).toContain('# title')
    expect(text).toContain('Outputs are too large')
  })
})
