/**
 * 0.1.84 V3-5 K5-5 — allow_large 贯通普通文本 Read（契约面，unit 层零盘）。
 *
 * 工单 §D（docs/2026-11-01-p0-wave-0184-ticket.md）：
 *  - ReadToolInput.allow_large?: boolean；engine JSON schema 与 TUI zod 同步
 *    可选 boolean、默认 false（字符串不冒充 true；TUI zod 非法类型拒绝）；
 *  - 模型说明 = 仅当确需整篇且上下文有余量时显式使用；offset/limit 显式
 *    提供仍按请求选择范围；图片 128MiB / PDF / notebook / 设备 / 二进制
 *    保护一律不放宽（行为面锁在 tests/func/wave0184-read-large.test.ts）；
 *  - allow_large:true 走绝对上界 ALLOW_LARGE_MAX_BYTES（128MiB，对齐
 *    MAX_IMAGE_SOURCE_BYTES），非调高 env 全局上限。
 *
 * 契约三面：schema 形状（engine JSON schema + TUI zod 矩阵）/ prompt 文本
 * （双体模板各含 allow_large 段）/ 限额常量（双体 limits 文件同值）。
 */
import { describe, expect, test } from 'bun:test'
import { READ_TOOL_INPUT_SCHEMA } from '../../src/engine/tools/files/readTool'
import {
  ALLOW_LARGE_MAX_BYTES,
  getDefaultFileReadingLimits,
} from '../../src/engine/tools/files/readFileLimits'
import {
  LINE_FORMAT_INSTRUCTION,
  OFFSET_INSTRUCTION_DEFAULT,
  renderPromptTemplate,
} from '../../src/engine/tools/files/readPrompt'
import { MAX_IMAGE_SOURCE_BYTES } from '../../src/shared'
import { FileReadTool } from '../../src/tui/tools/FileReadTool/FileReadTool'
import {
  ALLOW_LARGE_MAX_BYTES as TUI_ALLOW_LARGE_MAX_BYTES,
} from '../../src/tui/tools/FileReadTool/limits'
import {
  LINE_FORMAT_INSTRUCTION as TUI_LINE_FORMAT_INSTRUCTION,
  OFFSET_INSTRUCTION_DEFAULT as TUI_OFFSET_INSTRUCTION_DEFAULT,
  renderPromptTemplate as tuiRenderPromptTemplate,
} from '../../src/tui/tools/FileReadTool/prompt'

// ── engine JSON schema 形状 ──────────────────────────────────────────────

describe('K5-5 engine READ_TOOL_INPUT_SCHEMA：allow_large 字段', () => {
  test('allow_large 声明为可选 boolean，description 含限定语义', () => {
    const prop = READ_TOOL_INPUT_SCHEMA.properties.allow_large as
      | { type?: string; description?: string }
      | undefined
    expect(prop).toBeDefined()
    expect(prop?.type).toBe('boolean')
    // 仅普通文本 + 显式使用 + 上下文余量 —— 三要点都在模型可见面上
    expect(prop?.description).toContain('plain text')
    expect(prop?.description).toContain('context space')
    expect(prop?.description).toContain('offset and limit')
  })

  test('allow_large 不进 required（缺省 = false 默认不变）', () => {
    expect(READ_TOOL_INPUT_SCHEMA.required).toEqual(['file_path'])
  })

  test('既有 4 字段不回归', () => {
    const props = READ_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { type?: string }
    >
    expect(props.file_path?.type).toBe('string')
    expect(props.offset?.type).toBe('number')
    expect(props.limit?.type).toBe('number')
    expect(props.pages?.type).toBe('string')
  })
})

// ── TUI zod 矩阵（省略/false/true 通过；非法类型拒绝）────────────────────

describe('K5-5 TUI zod：allow_large 输入解析矩阵', () => {
  const schema = FileReadTool.inputSchema as {
    safeParse: (v: unknown) => { success: boolean; data?: Record<string, unknown> }
  }

  test('省略 allow_large → 通过（默认 false）', () => {
    const r = schema.safeParse({ file_path: '/tmp/a.txt' })
    expect(r.success).toBe(true)
    expect(r.data?.allow_large).toBeUndefined()
  })

  test('allow_large: false → 通过且为 false', () => {
    const r = schema.safeParse({ file_path: '/tmp/a.txt', allow_large: false })
    expect(r.success).toBe(true)
    expect(r.data?.allow_large).toBe(false)
  })

  test('allow_large: true → 通过且为 true', () => {
    const r = schema.safeParse({ file_path: '/tmp/a.txt', allow_large: true })
    expect(r.success).toBe(true)
    expect(r.data?.allow_large).toBe(true)
  })

  test('字符串 "true" 拒绝（不冒充 true）', () => {
    const r = schema.safeParse({
      file_path: '/tmp/a.txt',
      allow_large: 'true',
    })
    expect(r.success).toBe(false)
  })

  test('数字 1 拒绝', () => {
    const r = schema.safeParse({ file_path: '/tmp/a.txt', allow_large: 1 })
    expect(r.success).toBe(false)
  })

  test('null 拒绝', () => {
    const r = schema.safeParse({ file_path: '/tmp/a.txt', allow_large: null })
    expect(r.success).toBe(false)
  })
})

// ── prompt 双体：模型说明在场 ────────────────────────────────────────────

describe('K5-5 prompt 双体：allow_large 模型说明', () => {
  test('engine 模板含 allow_large 段（显式使用 + plain text + 上下文余量）', () => {
    const text = renderPromptTemplate(
      LINE_FORMAT_INSTRUCTION,
      '',
      OFFSET_INSTRUCTION_DEFAULT,
    )
    expect(text).toContain('allow_large: true')
    expect(text).toContain('plain text')
    expect(text).toContain('context space')
    // offset/limit 显式提供仍选范围
    expect(text).toMatch(/offset and limit still select the range/)
  })

  test('TUI 模板同段在场（双体同文）', () => {
    const text = tuiRenderPromptTemplate(
      TUI_LINE_FORMAT_INSTRUCTION,
      '',
      TUI_OFFSET_INSTRUCTION_DEFAULT,
    )
    expect(text).toContain('allow_large: true')
    expect(text).toContain('plain text')
    expect(text).toContain('context space')
    expect(text).toMatch(/offset and limit still select the range/)
  })
})

// ── 限额常量：绝对上界双体同值 ──────────────────────────────────────────

describe('K5-5 ALLOW_LARGE_MAX_BYTES 绝对上界', () => {
  test('engine：128MiB，对齐 MAX_IMAGE_SOURCE_BYTES，不触碰常规默认', () => {
    expect(ALLOW_LARGE_MAX_BYTES).toBe(MAX_IMAGE_SOURCE_BYTES)
    expect(ALLOW_LARGE_MAX_BYTES).toBe(128 * 1024 * 1024)
    // 常规默认不动（不得借本波调高 env/全局上限）
    const limits = getDefaultFileReadingLimits()
    expect(limits.maxSizeBytes).toBe(0.25 * 1024 * 1024)
    expect(limits.maxTokens).toBe(25000)
  })

  test('TUI twin：同值', () => {
    expect(TUI_ALLOW_LARGE_MAX_BYTES).toBe(MAX_IMAGE_SOURCE_BYTES)
  })
})
