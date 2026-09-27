/**
 * engine/tools/askUser S-E2（§8.60 config+ask-user 族子波）：
 * AskUserQuestionTool 本体 unit 面（纯对象零盘零网）。
 *
 *  - P-A1 对象面：name（toolNames 单一事实源同值 'AskUserQuestion'）/
 *    JSON schema 常量字段转写（questions minItems 1 maxItems 4 / 嵌套
 *    双 required 面 / options 双 min/max + items required label+description /
 *    answers/annotations/metadata 三 object 面）/ TOOL_DEFAULTS 逐值 /
 *    toAutoClassifierInput questions join ' | '。
 *  - P-A2 validateInput 唯一性校验 4 面：全唯一直通 / 问题文本重复 /
 *    单题 label 重复（UNIQUENESS_MESSAGE 逐字 + errorCode 1）/ 跨题 label
 *    重名不误报（唯一性域 = 单题内）。
 *  - P-A3 checkPermissions 恒 ask 面：message 'Answer questions?' 逐字 +
 *    updatedInput 透传。
 *  - P-A4 call passthrough 面：answers 缺省 {} 面 / annotations 缺省不
 *    出键面（spread 空支）/ annotations 有值 spread 面 / questions
 *    透传恒等。
 *  - P-A5 mapToolResult 模板面：单答案 `"q"="a"` / 多答案 join ', ' /
 *    annotation preview 面（`selected preview:\n…`）/ annotation notes 面
 *    （`user notes: …`）/ 尾句逐字。
 *  - P-A6 renderToolUseMessage null 面（旧 UI JSX 面裁登记 delta ⑤）。
 *  - P-A7 prompt 面：description() = PROMPT + PREVIEW markdown 同一性 /
 *    EXIT_PLAN_MODE 替换值 'ExitPlanMode' / PREVIEW_FEATURE_PROMPT 仅
 *    markdown 键（html 段裁面）/ 两短描述值锚点（门面别名重出面）。
 *
 * 深度 import（门面归集）：../../src/engine/tools（本体 + schema + prompt 面
 * + 2 短描述别名）。
 */
import { describe, expect, test } from 'bun:test'
import {
  ASK_USER_QUESTION_DESCRIPTION,
  ASK_USER_QUESTION_TOOL_CHIP_WIDTH,
  ASK_USER_QUESTION_TOOL_INPUT_SCHEMA,
  ASK_USER_QUESTION_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_PROMPT,
  AskUserQuestionTool,
  PREVIEW_FEATURE_PROMPT,
  type AskUserQuestion,
  type QuestionAnnotation,
} from '../../src/engine/tools'

function question(
  over: Partial<AskUserQuestion> = {},
): AskUserQuestion {
  return {
    question: 'Which library should we use?',
    header: 'Library',
    options: [
      { label: 'A', description: 'Option A' },
      { label: 'B', description: 'Option B' },
    ],
    ...over,
  }
}

// ── P-A1 对象面 ─────────────────────────────────────────────────────────

describe('P-A1 对象面（shared Tool 契约纯对象）', () => {
  test('AskUserQuestionTool 对象面逐值', () => {
    expect(AskUserQuestionTool.name).toBe(ASK_USER_QUESTION_TOOL_NAME)
    expect(ASK_USER_QUESTION_TOOL_NAME).toBe('AskUserQuestion')
    expect(AskUserQuestionTool.maxResultSizeChars).toBe(100_000)
    expect(AskUserQuestionTool.shouldDefer).toBe(true)
    expect(AskUserQuestionTool.strict).toBe(true)
    expect(AskUserQuestionTool.isConcurrencySafe(undefined)).toBe(true)
    expect(AskUserQuestionTool.isReadOnly(undefined)).toBe(true)
    expect(AskUserQuestionTool.isDestructive?.(undefined)).toBe(false)
    expect(AskUserQuestionTool.isEnabled()).toBe(true)
    expect(AskUserQuestionTool.userFacingName(undefined)).toBe('')
    expect(AskUserQuestionTool.searchHint).toBe(
      'prompt the user with a multiple-choice question',
    )
  })

  test('toAutoClassifierInput：questions join " | "', () => {
    expect(
      AskUserQuestionTool.toAutoClassifierInput({
        questions: [question({ question: 'Q1?' }), question({ question: 'Q2?' })],
      }),
    ).toBe('Q1? | Q2?')
  })

  test('JSON schema 常量字段转写面（嵌套 min/max + required 双层面）', () => {
    const schema = ASK_USER_QUESTION_TOOL_INPUT_SCHEMA
    expect(schema.type).toBe('object')
    expect(schema.required).toEqual(['questions'])
    expect(schema.additionalProperties).toBe(false)
    const questions = schema.properties?.questions as {
      minItems?: number
      maxItems?: number
      items?: {
        required?: string[]
        properties?: {
          options?: {
            minItems?: number
            maxItems?: number
            items?: { required?: string[] }
          }
        }
      }
    }
    expect(questions.minItems).toBe(1)
    expect(questions.maxItems).toBe(4)
    expect(questions.items?.required).toEqual(['question', 'header', 'options'])
    expect(questions.items?.properties?.options?.minItems).toBe(2)
    expect(questions.items?.properties?.options?.maxItems).toBe(4)
    expect(questions.items?.properties?.options?.items?.required).toEqual([
      'label',
      'description',
    ])
    expect((schema.properties?.answers as { type: string }).type).toBe('object')
    expect(
      (schema.properties?.annotations as { type: string }).type,
    ).toBe('object')
    expect(
      (schema.properties?.metadata as { type: string }).type,
    ).toBe('object')
  })

  test('CHIP_WIDTH 值锚点 + header 描述模板消费面', () => {
    expect(ASK_USER_QUESTION_TOOL_CHIP_WIDTH).toBe(12)
    const header = ASK_USER_QUESTION_TOOL_INPUT_SCHEMA.properties?.questions as {
      items?: { properties?: { header?: { description?: string } } }
    }
    expect(header.items?.properties?.header?.description).toContain(
      'max 12 chars',
    )
  })
})

// ── P-A2 validateInput 唯一性校验面（delta ② 移入面）──────────────────

describe('P-A2 validateInput 唯一性校验 4 面', () => {
  const UNIQ =
    'Question texts must be unique, option labels must be unique within each question'

  test('全唯一 → 直通', async () => {
    const res = await AskUserQuestionTool.validateInput!({
      questions: [question(), question({ question: 'Other question?' })],
    })
    expect(res).toEqual({ result: true })
  })

  test('问题文本重复 → 文案逐字 + errorCode 1', async () => {
    const res = await AskUserQuestionTool.validateInput!({
      questions: [question(), question()],
    })
    expect(res).toEqual({ result: false, message: UNIQ, errorCode: 1 })
  })

  test('单题内 label 重复 → 文案逐字 + errorCode 1', async () => {
    const res = await AskUserQuestionTool.validateInput!({
      questions: [
        question({
          options: [
            { label: 'X', description: 'd1' },
            { label: 'X', description: 'd2' },
          ],
        }),
      ],
    })
    expect(res).toEqual({ result: false, message: UNIQ, errorCode: 1 })
  })

  test('跨题 label 重名不误报（唯一性域 = 单题内）', async () => {
    const res = await AskUserQuestionTool.validateInput!({
      questions: [
        question({
          options: [
            { label: 'Same', description: 'd1' },
            { label: 'B', description: 'd2' },
          ],
        }),
        question({
          question: 'Different?',
          options: [
            { label: 'Same', description: 'd3' },
            { label: 'C', description: 'd4' },
          ],
        }),
      ],
    })
    expect(res).toEqual({ result: true })
  })
})

// ── P-A3 checkPermissions 恒 ask 面 ─────────────────────────────────────

describe('P-A3 checkPermissions', () => {
  test('恒 ask：message 逐字 + updatedInput 透传', async () => {
    const input = { questions: [question()] }
    const res = await AskUserQuestionTool.checkPermissions(input, {})
    expect(res.behavior).toBe('ask')
    expect((res as { message?: string }).message).toBe('Answer questions?')
    expect((res as { updatedInput?: unknown }).updatedInput).toEqual(input)
  })
})

// ── P-A4 call passthrough 面 ────────────────────────────────────────────

describe('P-A4 call passthrough 面', () => {
  test('answers 缺省 {} 面 + questions 透传恒等', async () => {
    const questions = [question()]
    const { data } = await AskUserQuestionTool.call(
      { questions },
      {},
    )
    expect(data.questions).toBe(questions)
    expect(data.answers).toEqual({})
    expect('annotations' in data).toBe(false)
  })

  test('annotations 有值 spread 面（含 preview/notes 双字段透传）', async () => {
    const questions = [question()]
    const annotations: Record<string, QuestionAnnotation> = {
      'Which library should we use?': { preview: 'mockup', notes: 'pick A' },
    }
    const { data } = await AskUserQuestionTool.call(
      {
        questions,
        answers: { 'Which library should we use?': 'A' },
        annotations,
      },
      {},
    )
    expect(data.answers).toEqual({ 'Which library should we use?': 'A' })
    expect(data.annotations).toBe(annotations)
  })
})

// ── P-A5 mapToolResult 模板面 ──────────────────────────────────────────

describe('P-A5 mapToolResult 模板面', () => {
  test('单答案面：`"q"="a"` + 尾句逐字', () => {
    expect(
      AskUserQuestionTool.mapToolResultToToolResultBlockParam(
        {
          questions: [question()],
          answers: { 'Which library should we use?': 'A' },
        },
        't1',
      ),
    ).toEqual({
      type: 'tool_result',
      content:
        'User has answered your questions: "Which library should we use?"="A". You can now continue with the user\'s answers in mind.',
      tool_use_id: 't1',
    })
  })

  test('多答案 join ", " 面', () => {
    const out = AskUserQuestionTool.mapToolResultToToolResultBlockParam(
      {
        questions: [question(), question({ question: 'Q2?' })],
        answers: { 'Which library should we use?': 'A', 'Q2?': 'B' },
      },
      't2',
    )
    expect(out.content).toBe(
      'User has answered your questions: "Which library should we use?"="A", "Q2?"="B". You can now continue with the user\'s answers in mind.',
    )
  })

  test('annotation preview + notes 双 parts 面', () => {
    const out = AskUserQuestionTool.mapToolResultToToolResultBlockParam(
      {
        questions: [question()],
        answers: { 'Which library should we use?': 'A' },
        annotations: {
          'Which library should we use?': {
            preview: 'ASCII mockup',
            notes: 'user note',
          },
        },
      },
      't3',
    )
    const content = out.content as string
    expect(content).toContain(
      '"Which library should we use?"="A" selected preview:\nASCII mockup user notes: user note',
    )
    expect(content.startsWith('User has answered your questions:')).toBe(true)
  })

  test('annotations 缺省 → 纯答案模板（无 parts 追加）', () => {
    const out = AskUserQuestionTool.mapToolResultToToolResultBlockParam(
      {
        questions: [question()],
        answers: { 'Which library should we use?': 'A' },
      },
      't4',
    )
    expect(out.content).toBe(
      'User has answered your questions: "Which library should we use?"="A". You can now continue with the user\'s answers in mind.',
    )
  })
})

// ── P-A6 renderToolUseMessage null 面 ──────────────────────────────────

describe('P-A6 renderToolUseMessage null 面（delta ⑤ UI 面裁登记）', () => {
  test('恒 null', () => {
    expect(
      AskUserQuestionTool.renderToolUseMessage(
        { questions: [question()] },
        { verbose: false },
      ),
    ).toBe(null)
  })
})

// ── P-A7 prompt 面 ─────────────────────────────────────────────────────

describe('P-A7 prompt 面', () => {
  test('PREVIEW_FEATURE_PROMPT 仅 markdown 键（html 段裁面）', () => {
    expect(Object.keys(PREVIEW_FEATURE_PROMPT)).toEqual(['markdown'])
    expect(PREVIEW_FEATURE_PROMPT.markdown).toContain(
      'Use the optional `preview` field on options',
    )
    expect(PREVIEW_FEATURE_PROMPT.markdown).toContain(
      'previews are only supported for single-select questions (not multiSelect)',
    )
  })

  test('ASK_USER_QUESTION_TOOL_PROMPT：EXIT_PLAN_MODE 替换值 + 结构面', () => {
    expect(ASK_USER_QUESTION_TOOL_PROMPT).toContain(
      'Use this tool when you need to ask the user questions during execution',
    )
    // delta ④：EXIT_PLAN_MODE_V2_TOOL_NAME 替换（值 'ExitPlanMode'）
    expect(ASK_USER_QUESTION_TOOL_PROMPT).toContain(
      'use ExitPlanMode for plan approval',
    )
    expect(ASK_USER_QUESTION_TOOL_PROMPT).toContain(
      'If you need plan approval, use ExitPlanMode instead.',
    )
  })

  test('description() = PROMPT + markdown preview 段同一性', async () => {
    expect(await AskUserQuestionTool.description(undefined, {})).toBe(
      ASK_USER_QUESTION_TOOL_PROMPT + PREVIEW_FEATURE_PROMPT.markdown,
    )
  })

  test('两短描述值锚点（门面别名重出面）', () => {
    expect(ASK_USER_QUESTION_DESCRIPTION).toBe(
      'Asks the user multiple choice questions to gather information, clarify ambiguity, understand preferences, make decisions or offer them choices.',
    )
  })
})
