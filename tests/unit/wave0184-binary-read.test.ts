/**
 * 0.1.84 V3-5 K5-2 — binary 后缀误读文本判别（unit 层零磁盘）。
 *
 * 上游 301：.xlsm/.parquet/.epub/.heic 曾被当文本读——双扩展表（engine
 * binaryExtensions.ts + TUI constants/files.ts，157L 同源逐字）均缺四项，
 * Read validate extension-only 判别放行 → call 落文本支按 UTF-8 转码。
 *
 * 判别面：
 *  - 双表四后缀命中 + 大小写不敏感（hasBinaryExtension 内部 lowercases）；
 *  - engine ReadTool.validateInput 四后缀 errorCode 4（binary）拒绝；
 *  - engine ReadTool.call 直调（不经 validate）四后缀拒绝、不落文本支
 *    （call 面守卫 = validate 同条件镜像）；
 *  - TUI FileReadTool validate/call 同判别（双体同构）；
 *  - 非回归：既有 binary（.zip/.exe）仍拒；.pdf（native PDF 排除）/
 *    .png（图像排除）/.ipynb（不在表）/.txt 放行。
 *
 * RED 基线（05ec0bc）：四后缀双表全 false（f4 §0.2 探针吻合）、validate
 * 放行、call 落文本支（不存在的路径 → ENOENT 友好错误，非 binary 拒绝）。
 */
import { describe, expect, test } from 'bun:test'
import {
  BINARY_EXTENSIONS as ENGINE_BINARY,
  hasBinaryExtension as engineHasBinaryExtension,
} from '../../src/engine/tools/files/binaryExtensions'
import {
  BINARY_EXTENSIONS as TUI_BINARY,
  hasBinaryExtension as tuiHasBinaryExtension,
} from '../../src/tui/constants/files'
import { ReadTool } from '../../src/engine/tools'
import { FileReadTool } from '../../src/tui/tools/FileReadTool/FileReadTool'

const FOUR = ['.xlsm', '.parquet', '.epub', '.heic'] as const

function makePermsCtx() {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}

describe('K5-2 双表四后缀', () => {
  test('engine + TUI 二进制表均含 .xlsm/.parquet/.epub/.heic', () => {
    for (const ext of FOUR) {
      expect(ENGINE_BINARY.has(ext)).toBe(true)
      expect(TUI_BINARY.has(ext)).toBe(true)
    }
  })

  test('大小写不敏感（.XLSM/.Parquet/.EPUB/.Heic）', () => {
    for (const p of ['a.XLSM', 'b.Parquet', 'c.EPUB', 'd.Heic']) {
      expect(engineHasBinaryExtension(p)).toBe(true)
      expect(tuiHasBinaryExtension(p)).toBe(true)
    }
  })

  test('HEIC 不入 image 可读面：四后缀均非原生渲染扩展', () => {
    // K5-2 边界：HEIC 进 binary 表 = Read 拒绝；不得冒称可视觉读取
    // （不加入 IMAGE_EXTENSIONS——该集合非导出面，以 validate/call 拒绝
    // 行为在下方两 describe 判别）。
    expect(ENGINE_BINARY.has('.heic')).toBe(true)
  })
})

describe('K5-2 engine ReadTool validate/call 判别', () => {
  test('validateInput：四后缀 errorCode 4 拒绝', async () => {
    for (const ext of FOUR) {
      const r = (await ReadTool.validateInput?.(
        { file_path: `/tmp/wave0184/data${ext}` },
        undefined,
      )) as { result: boolean; message?: string; errorCode?: number } | undefined
      expect(r?.result).toBe(false)
      expect(r?.errorCode).toBe(4)
      expect(r?.message).toMatch(/binary/)
    }
  })

  test('call 直调（不经 validate）：四后缀拒绝且不落文本支', async () => {
    for (const ext of FOUR) {
      await expect(
        ReadTool.call({ file_path: `/tmp/wave0184/data${ext}` }, {}),
      ).rejects.toThrow(/binary/)
    }
  })

  test('非回归：既有 binary（.zip/.exe）validate 仍拒', async () => {
    for (const p of ['/tmp/wave0184/a.zip', '/tmp/wave0184/b.exe']) {
      const r = (await ReadTool.validateInput?.(
        { file_path: p },
        undefined,
      )) as { result: boolean; errorCode?: number } | undefined
      expect(r?.result).toBe(false)
      expect(r?.errorCode).toBe(4)
    }
  })

  test('非回归：.pdf/.png/.ipynb/.txt validate 放行（原生渲染排除面）', async () => {
    for (const p of [
      '/tmp/wave0184/a.pdf',
      '/tmp/wave0184/b.png',
      '/tmp/wave0184/c.ipynb',
      '/tmp/wave0184/d.txt',
    ]) {
      const r = (await ReadTool.validateInput?.(
        { file_path: p },
        undefined,
      )) as { result: boolean } | undefined
      expect(r?.result).toBe(true)
    }
  })
})

describe('K5-2 TUI FileReadTool validate/call 判别（双体同构）', () => {
  const tuiCtx = () =>
    ({
      getAppState: () => ({ toolPermissionContext: makePermsCtx() }),
    }) as never

  test('TUI validateInput：四后缀 errorCode 4 拒绝', async () => {
    for (const ext of FOUR) {
      const r = (await FileReadTool.validateInput?.(
        { file_path: `/tmp/wave0184/t${ext}` },
        tuiCtx(),
      )) as { result: boolean; message?: string; errorCode?: number } | undefined
      expect(r?.result).toBe(false)
      expect(r?.errorCode).toBe(4)
      expect(r?.message).toMatch(/binary/)
    }
  })

  test('TUI call 直调：四后缀拒绝且不落文本支', async () => {
    for (const ext of FOUR) {
      await expect(
        FileReadTool.call({ file_path: `/tmp/wave0184/t${ext}` }, {} as never),
      ).rejects.toThrow(/binary/)
    }
  })
})
