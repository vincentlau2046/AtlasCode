/**
 * 0.1.84 V3-5 K5-6 — engine PDF 输出根：非特权 cwd 下绝对安全根（func 层真盘）。
 *
 * 工单 §E 判别面：
 *  - 主判别（RED）：UID≠0（真 process.getuid，不 mock 降权）+ cwd chmod 0555
 *    不可建子目录 + 源 PDF 绝对路径可读 + ATLAS_TMPDIR 独立可写输出根 →
 *    旧码 getToolResultsDir() = getAtlasTempDirName()（目录名，非绝对基），
 *    相对 mkdir 挂 process.cwd() → EACCES；修复后 extractPDFPages 成功渲染。
 *  - 成功不变量：outputDir 绝对且在 getAtlasTempDir()（= realpath(ATLAS_TMPDIR)
 *    下）之下；cwd 无 .atlas-* 相对泄漏；JPEG 魔数 FF D8 + 非空；源文件字节
 *    与只读 cwd 目录列表前后不变。
 *  - 页范围：-f/-l 生效（3 页取 2-3 → 2 张）；无效页范围明确失败。
 *  - 错误面（必需覆盖，非 GATE-PASS）：缺 pdftoppm（PATH-strip）→
 *    unavailable；密码保护（gs 生成）→ password_protected；输出目录权限
 *    拒绝（tool-results 0555）→ 明确 EACCES 失败非空成功；空格/Unicode
 *    文件名 → arg-array 无 shell 引用问题。
 *  - TUI 面：getToolResultsDir 锚定 getProjectDir(getOriginalCwd())（启动
 *    冻结值），chdir 只读目录不改变结果（基线已绿，如实登记）。
 *
 * 真实二进制门控：poppler 缺失整文件 skip（同 files-pdf-notebook-real 惯例）；
 * gs 仅密码面需要，缺失时该面单独 skip。fixture 全部 mkdtemp 自清理；仅清理
 * 自己的输出根（不扩大到全用户 tool-results）。
 *
 * 安全硬化族（安全复审 MEDIUM）：/tmp 共享可写区 root 预占面——首建
 * 0700 + mkdtemp 私有叶（不信 umask）；symlink 预占明确拒绝不穿透；
 * 同根因第二站点 webFetchUtils.persistBinaryContent 同判别。
 */
import { spawnSync } from 'child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { isAbsolute, join } from 'path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  extractPDFPages,
  resetPdftoppmCache,
} from '../../src/engine/tools/files/pdf'
import {
  _resetAtlasTempDirForTest,
  getAtlasTempDir,
} from '../../src/permissions/filesystem'
import { getToolResultsDir as getTuiToolResultsDir } from '../../src/tui/utils/toolResultStorage'
import { persistBinaryContent } from '../../src/engine/tools/web/webFetchUtils'

// ── 夹具 ─────────────────────────────────────────────────────────────────

let srcDir: string
let outRoot: string
let roCwd: string
let workCwd: string
let prevCwd: string | undefined
const prevTmpdir = process.env.ATLAS_TMPDIR
const prevPath = process.env.PATH

// 二进制探测必须在模块层（describe 体在收集期求值，早于 beforeAll）；
// 判定逻辑与 isPdftoppmAvailable 一致（exit 0 或 stderr 非空）
const pdftoppmProbe = spawnSync('pdftoppm', ['-v'], { stdio: 'pipe' })
const hasPdftoppm =
  pdftoppmProbe.status === 0 || (pdftoppmProbe.stderr?.length ?? 0) > 0
const hasGs = spawnSync('gs', ['--version'], { stdio: 'ignore' }).status === 0

const t = hasPdftoppm ? test : test.skip
// 只读 cwd 判别仅在真非特权 UID 下成立（root 豁免 0555）
const roT = hasPdftoppm && process.getuid() !== 0 ? test : test.skip

/** 程序化构造 N 页确定性 PDF（xref 偏移精确计算，无字体依赖）。 */
function buildPdf(pageCount: number): Buffer {
  const objects: string[] = ['', '']
  const kids: string[] = []
  for (let i = 0; i < pageCount; i++) {
    kids.push(`${3 + i * 2} 0 R`)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>`
  objects[2] = `<< /Type /Catalog /Pages 1 0 R >>`
  for (let i = 0; i < pageCount; i++) {
    const pageNum = 3 + i * 2
    const stream = `q 1 0 0 RG 20 20 160 160 re S Q`
    objects[pageNum] =
      `<< /Type /Page /Parent 1 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents ${pageNum + 1} 0 R >>`
    objects[pageNum + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  }
  let body = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = body.length
    body += `${n} 0 obj\n${objects[n]}\nendobj\n`
  }
  const xrefOffset = body.length
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let n = 1; n < objects.length; n++) {
    xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  }
  const trailer = `trailer\n<< /Size ${objects.length} /Root 2 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body + xref + trailer, 'latin1')
}

function unwrap(
  r: Awaited<ReturnType<typeof extractPDFPages>>,
): { outputDir: string; count: number } {
  if (!r.success) {
    throw new Error(
      `extractPDFPages failed: ${r.error.reason}: ${r.error.message}`,
    )
  }
  return { outputDir: r.data.file.outputDir, count: r.data.file.count }
}

/** 成功路径共用不变量：绝对安全根 + ATLAS_TMPDIR 遵从 + JPEG 有效 + cwd 零泄漏。 */
function expectJpegDir(outputDir: string, expectedCount: number): void {
  expect(isAbsolute(outputDir)).toBe(true)
  expect(outputDir.startsWith(getAtlasTempDir())).toBe(true)
  expect(outputDir.startsWith(realpathSync(outRoot))).toBe(true)
  const files = readdirSync(outputDir)
    .filter(f => f.endsWith('.jpg'))
    .sort()
  expect(files.length).toBe(expectedCount)
  for (const f of files) {
    const buf = readFileSync(join(outputDir, f))
    expect(buf.length).toBeGreaterThan(100)
    expect(buf[0]).toBe(0xff)
    expect(buf[1]).toBe(0xd8)
  }
  // 相对根回归守卫：成功路径不得在 cwd 留下 .atlas-* 泄漏
  expect(
    readdirSync(process.cwd()).filter(e => e.startsWith('.atlas')),
  ).toEqual([])
}

beforeAll(() => {
  if (!hasPdftoppm) return
  srcDir = mkdtempSync(join(tmpdir(), 'wave0184-pdf-src-'))
  outRoot = mkdtempSync(join(tmpdir(), 'wave0184-pdf-out-'))
  roCwd = mkdtempSync(join(tmpdir(), 'wave0184-pdf-ro-'))
  workCwd = mkdtempSync(join(tmpdir(), 'wave0184-pdf-work-'))
  chmodSync(roCwd, 0o555)
  // 独立可写输出根：ATLAS_TMPDIR → getAtlasTempDir()（缓存须复位）
  process.env.ATLAS_TMPDIR = outRoot
  _resetAtlasTempDirForTest()
  // 受控 cwd：旧码相对 mkdir 的泄漏落在本测试自有目录（afterAll 清理）
  prevCwd = process.cwd()
  process.chdir(workCwd)
})

afterAll(() => {
  if (prevCwd !== undefined) {
    process.chdir(prevCwd)
  }
  if (!hasPdftoppm) return
  if (roCwd) chmodSync(roCwd, 0o755)
  rmSync(srcDir, { recursive: true, force: true })
  rmSync(outRoot, { recursive: true, force: true })
  rmSync(roCwd, { recursive: true, force: true })
  rmSync(workCwd, { recursive: true, force: true })
  if (prevTmpdir === undefined) {
    delete process.env.ATLAS_TMPDIR
  } else {
    process.env.ATLAS_TMPDIR = prevTmpdir
  }
  _resetAtlasTempDirForTest()
  if (prevPath === undefined) {
    delete process.env.PATH
  } else {
    process.env.PATH = prevPath
  }
  resetPdftoppmCache()
})

// ── engine 主判别 + 成功/错误矩阵 ────────────────────────────────────────

describe('K5-6 engine PDF 输出根（非特权 cwd + 绝对安全根）', () => {
  // gs 仅密码面需要，缺失时该面单独 skip
  const gsT = hasPdftoppm && hasGs ? test : test.skip

  roT('主判别：UID≠0 + cwd 0555 下 extractPDFPages 仍成功（旧码 EACCES）', async () => {
    const srcPath = join(srcDir, 'doc.pdf')
    writeFileSync(srcPath, buildPdf(3))
    const beforeBytes = readFileSync(srcPath)
    const beforeEntries = readdirSync(roCwd)
    const prev = process.cwd()
    process.chdir(roCwd)
    let outputDir = ''
    let count = 0
    try {
      const r = await extractPDFPages(srcPath)
      expect(r.success).toBe(true)
      ;({ outputDir, count } = unwrap(r))
      expect(count).toBe(3)
      expectJpegDir(outputDir, 3)
    } finally {
      process.chdir(prev)
    }
    // 源文件与只读 cwd 前后不变
    expect(readFileSync(srcPath).equals(beforeBytes)).toBe(true)
    expect(readdirSync(roCwd)).toEqual(beforeEntries)
  })

  t('空格 + Unicode 文件名：arg-array 无引用问题，输出在绝对安全根', async () => {
    const p = join(srcDir, '文档 报告 v2.pdf')
    writeFileSync(p, buildPdf(2))
    const r = await extractPDFPages(p)
    expect(r.success).toBe(true)
    const { outputDir, count } = unwrap(r)
    expect(count).toBe(2)
    expectJpegDir(outputDir, 2)
  })

  t('页范围 -f/-l：3 页取 2-3 → 恰 2 张', async () => {
    const p = join(srcDir, 'range.pdf')
    writeFileSync(p, buildPdf(3))
    const r = await extractPDFPages(p, { firstPage: 2, lastPage: 3 })
    expect(r.success).toBe(true)
    const { outputDir, count } = unwrap(r)
    expect(count).toBe(2)
    expectJpegDir(outputDir, 2)
  })

  t('无效页范围（99-100 超 3 页）→ 明确失败非空成功', async () => {
    const p = join(srcDir, 'range-invalid.pdf')
    writeFileSync(p, buildPdf(3))
    const r = await extractPDFPages(p, { firstPage: 99, lastPage: 100 })
    expect(r.success).toBe(false)
  })

  t('缺 pdftoppm（PATH-strip）→ unavailable 明确失败', async () => {
    const p = join(srcDir, 'nobin.pdf')
    writeFileSync(p, buildPdf(1))
    resetPdftoppmCache()
    process.env.PATH = '/nonexistent-wave0184'
    try {
      const r = await extractPDFPages(p)
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.reason).toBe('unavailable')
      }
    } finally {
      if (prevPath === undefined) {
        delete process.env.PATH
      } else {
        process.env.PATH = prevPath
      }
      resetPdftoppmCache()
    }
  })

  t('输出目录权限拒绝（tool-results 0555）→ 明确 EACCES 失败非空成功', async () => {
    const p = join(srcDir, 'perm.pdf')
    writeFileSync(p, buildPdf(1))
    const toolResults = join(getAtlasTempDir(), 'tool-results')
    mkdirSync(toolResults, { recursive: true })
    chmodSync(toolResults, 0o555)
    try {
      const r = await extractPDFPages(p)
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.message).toMatch(/EACCES|permission/i)
      }
    } finally {
      chmodSync(toolResults, 0o755)
    }
  })

  gsT('密码保护 PDF（gs 生成）→ password_protected', async () => {
    const plain = join(srcDir, 'enc-plain.pdf')
    writeFileSync(plain, buildPdf(1))
    const enc = join(srcDir, 'enc.pdf')
    const gsRun = spawnSync(
      'gs',
      [
        '-q',
        '-dNOPAUSE',
        '-dBATCH',
        '-sDEVICE=pdfwrite',
        `-sOutputFile=${enc}`,
        '-dCompatibilityLevel=1.4',
        '-sOwnerPassword=owner-pw-0184',
        '-sUserPassword=user-pw-0184',
        plain,
      ],
      { stdio: 'ignore' },
    )
    expect(gsRun.status).toBe(0)
    const r = await extractPDFPages(enc)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.reason).toBe('password_protected')
    }
  })
})

// ── TUI 面：会话输出根锚定（基线登记）───────────────────────────────────

describe('K5-6 TUI 面：getToolResultsDir 锚定启动 cwd（基线登记）', () => {
  test('绝对路径且 chdir 只读目录不改变（不随 process.cwd 漂移）', () => {
    const d1 = getTuiToolResultsDir()
    expect(isAbsolute(d1)).toBe(true)
    const ro = mkdtempSync(join(tmpdir(), 'wave0184-tui-ro-'))
    try {
      chmodSync(ro, 0o555)
      const prev = process.cwd()
      process.chdir(ro)
      try {
        expect(getTuiToolResultsDir()).toBe(d1)
      } finally {
        process.chdir(prev)
      }
    } finally {
      chmodSync(ro, 0o755)
      rmSync(ro, { recursive: true, force: true })
    }
  })
})

// ── K5-6 安全硬化（安全复审 MEDIUM）：验证根 + 私有输出 ──────────────────

describe('K5-6 安全硬化：tool-results 根验证 + 私有输出（安全复审）', () => {
  // POSIX mode/属主语义面（Windows per-user %TEMP% 不适用）
  const pT =
    hasPdftoppm && typeof process.getuid === 'function' ? test : test.skip

  pT('首次创建 root 0700 + PDF 输出叶 mkdtemp 恒 0700（不信环境 umask）', async () => {
    const freshRoot = mkdtempSync(join(tmpdir(), 'wave0184-pdf-secure-'))
    const prevTmp = process.env.ATLAS_TMPDIR
    process.env.ATLAS_TMPDIR = freshRoot
    _resetAtlasTempDirForTest()
    const oldUmask = process.umask(0o000)
    try {
      const p = join(srcDir, 'secure.pdf')
      writeFileSync(p, buildPdf(1))
      const r = await extractPDFPages(p)
      expect(r.success).toBe(true)
      const { outputDir } = unwrap(r)
      const root = getAtlasTempDir().replace(/\/+$/, '')
      expect(statSync(root).mode & 0o777).toBe(0o700)
      expect(statSync(outputDir).mode & 0o777).toBe(0o700)
    } finally {
      process.umask(oldUmask)
      process.env.ATLAS_TMPDIR = prevTmp ?? outRoot
      _resetAtlasTempDirForTest()
      rmSync(freshRoot, { recursive: true, force: true })
    }
  })

  pT('root 被 symlink 预占 → 明确失败，不穿透写入诱饵目录', async () => {
    const root = getAtlasTempDir().replace(/\/+$/, '')
    const decoy = mkdtempSync(join(tmpdir(), 'wave0184-pdf-decoy-'))
    rmSync(root, { recursive: true, force: true })
    symlinkSync(decoy, root)
    try {
      const p = join(srcDir, 'preoccupied.pdf')
      writeFileSync(p, buildPdf(1))
      const r = await extractPDFPages(p)
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.message).toMatch(/unsafe|not a real directory/i)
      }
      expect(readdirSync(decoy)).toEqual([])
    } finally {
      rmSync(root, { force: true })
      rmSync(decoy, { recursive: true, force: true })
    }
  })

  pT('同根因第二站点：webFetchUtils persistBinaryContent 只读 cwd 下成功（旧码 {error}）', async () => {
    const prev = process.cwd()
    process.chdir(roCwd)
    try {
      const r = await persistBinaryContent(
        Buffer.from('wave0184-blob-bytes'),
        'application/pdf',
        'wave0184-secure',
      )
      expect('error' in r && typeof r.error === 'string').toBe(false)
      if (!('error' in r)) {
        expect(isAbsolute(r.filepath)).toBe(true)
        expect(readFileSync(r.filepath).toString()).toBe('wave0184-blob-bytes')
        expect(r.ext).toBe('pdf')
      }
    } finally {
      process.chdir(prev)
    }
  })
})
