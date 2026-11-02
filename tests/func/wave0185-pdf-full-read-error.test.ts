/**
 * 0.1.85-B（C85-B）full-PDF native document 支整裁 — 显式可操作错误（func 层真盘）。
 *
 * 工单 §1-B L88/L165：当前 provider（OpenAI 协议）无 document 块映射——
 * 旧路 = newMessages 被 pipeline 零消费 + params 静默丢弃 = tool_result 仅
 * header 文本虚报已读；恢复交付后 document 块也过不了补充合法化门
 * （text/image 允许面）。本波不新增 native document 协议：无 pages 读 PDF
 * 整支改显式可操作错误，指引 pages 参读（Task C 页图媒体路径 = PDF 读取
 * 唯一活车道）。
 *
 * func 层真盘：mkdtemp 自清理（wave0184 read-large 惯例）。无 poppler 依赖
 * ——错误支在 getPDFPageCount（poppler 缺失 → null）/ shouldExtractPages
 * 分流之后无条件到达（poppler 在场/缺席两环境同路径，deterministic）。
 */
import { afterAll, beforeAll, describe, test, expect } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReadTool } from '../../src/engine/tools'

/** 窄 ToolUseContext 切片（wave0184 read-large makeCtx 同形）。 */
function makeCtx(): never {
  return {
    getAppState: () => ({
      toolPermissionContext: {
        mode: 'default',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
        isBypassPermissionsModeAvailable: false,
      },
    }),
    abortController: new AbortController(),
  } as never
}

describe('C85-B full-PDF 显式错误（无 pages 读 PDF）', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wave0185-pdf-full-err-'))
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('F① 无 pages Read PDF → throw 含 pages 指引 + provider 定性（非文件损坏措辞）', async () => {
    const pdfPath = join(dir, 'small.pdf')
    // 最小 PDF 形文件（本测试不依赖其可解析性：页计数失败 → null → 同达错误支）
    writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj\nendobj\ntrailer<<>>\n%%EOF\n', 'utf8')

    let err: unknown
    try {
      await ReadTool.call({ file_path: pdfPath } as never, makeCtx())
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(Error)
    const msg = (err as Error).message
    // 可操作性两面：具体动作（pages 参读）+ 根因定性（provider 限制）
    expect(msg).toContain('pages parameter')
    expect(msg).toContain('current provider')
    // 不误指文件损坏（旧行为措辞族不在场）
    expect(msg).not.toMatch(/corrupt|damaged/i)
  })

  test('F② 空间参数组合：offset/limit 不改变 full-PDF 错误支（PDF 支不吃文本参数）', async () => {
    const pdfPath = join(dir, 'small2.pdf')
    writeFileSync(pdfPath, '%PDF-1.4\n%%EOF\n', 'utf8')
    let err: unknown
    try {
      await ReadTool.call(
        { file_path: pdfPath, offset: 1, limit: 10 } as never,
        makeCtx(),
      )
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('pages parameter')
  })
})
