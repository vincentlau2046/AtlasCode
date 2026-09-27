/**
 * engine/tools/askUser — AskUserQuestionTool 本体（S-E2 §8.60 config+ask-user 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx 256L
 * （React-Compiler 编译态，逻辑可读）裁剪随迁：inputSchema 纯 JSON 化（旧
 * z.strictObject + UNIQUENESS_REFINE 面）/ validateInput 唯一性校验 /
 * checkPermissions ask 逐字 / call passthrough 逐字 / mapToolResult 模板逐字。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema + zod outputSchema z.infer) → 新 shared Tool
 *    契约：inputSchema = 纯 JSON schema 对象（ASK_USER_QUESTION_TOOL_INPUT_SCHEMA，
 *    旧 z.strictObject 面 → strict: true + additionalProperties false 双字段，
 *    readTool delta ① 先例）；output → TS 型 AskUserQuestionOutput 承载。
 *  ② 旧 UNIQUENESS_REFINE（zod .refine：问题文本唯一 + 每题选项 label 唯一）
 *    纯 JSON schema 不可表达 → 移入 validateInput（语义逐字，消息
 *    `Question texts must be unique, option labels must be unique within each
 *    question`；旧 refine 失败面无 errorCode → 新 ValidationResult 必填位 =
 *    1（通用输入无效码，web 族 invalid-url 先例同值））。
 *  ③ 旧 validateInput HTML preview 校验支（getQuestionPreviewFormat() !== 'html'
 *    → pass 短路 + validateHtmlPreview 3 正则面）裁：getQuestionPreviewFormat =
 *    旧 bootstrap/state.ts:98 any stub（返回 {} 恒 ≠ 'html' → html 支死码，
 *    H6 不认 stub 真行为）→ 新 validateInput = 唯一性校验单支（TUI 波真
 *    preview-format 态复活时补支，前向接缝登记；validateHtmlPreview 3 正则
 *    模板不随迁，死码登记）。
 *  ④ 旧 prompt() 体 getQuestionPreviewFormat 分支裁（askUserPrompt delta ②）→
 *    description 面 = ASK_USER_QUESTION_TOOL_PROMPT + PREVIEW_FEATURE_PROMPT
 *    .markdown（markdown preview 段随迁，html 段死支裁）。
 *  ⑤ 旧 UI 面裁：renderToolResultMessage React 组件（AskUserQuestionResultMessage
 *    答案列表面）/ renderToolUseRejectedMessage JSX / renderToolUseProgressMessage
 *    null 面 → 裁（TUI 波）；新契约 renderToolUseMessage 位 = 旧同成员 null
 *    面逐字（TUI 前向接缝）。
 *  ⑥ 旧 requiresUserInteraction 成员（interactiveHandler 消费面）新 Tool 契约
 *    无位 → 裁（登记：该语义在新仓 = checkPermissions ask 支承载）。
 *  ⑦ 旧 _sdkInputSchema / _sdkOutputSchema 导出（SDK 消费面）→ D 波（plan 族
 *    先例）；旧 Question / QuestionOption / Output zod z.infer 型 → 新 duck 型
 *    （AskUserQuestionOption / AskUserQuestion / AskUserQuestionOutput）转写。
 *  ⑧ 旧 call 2 参声明（{questions, answers={}, annotations} 解构逐字）；
 *    mapToolResult 模板逐字（per-answer `"q"="a"` + selected preview /
 *    user notes parts join ' '，answers join ', '）。
 */
import {
  type PermissionResult,
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import { ASK_USER_QUESTION_TOOL_NAME } from '../toolNames'
import {
  ASK_USER_QUESTION_TOOL_CHIP_WIDTH,
  ASK_USER_QUESTION_TOOL_PROMPT,
  PREVIEW_FEATURE_PROMPT,
} from './askUserPrompt'

/** 选项 duck 型（旧 z.infer<questionOptionSchema> 转写，delta ⑦）。 */
export type AskUserQuestionOption = {
  label: string
  description: string
  preview?: string
}

/** 单问 duck 型（旧 z.infer<questionSchema> 转写）。 */
export type AskUserQuestion = {
  question: string
  header: string
  options: AskUserQuestionOption[]
  multiSelect?: boolean
}

/** 单题注记 duck 型（旧 z.infer<annotationSchema> 转写）。 */
export type QuestionAnnotation = {
  preview?: string
  notes?: string
}

/** 输入 duck 型（旧 z.infer<InputSchema> 转写）。 */
export type AskUserQuestionToolInput = {
  questions: AskUserQuestion[]
  answers?: Record<string, string>
  annotations?: Record<string, QuestionAnnotation>
  metadata?: { source?: string }
}

/** 输出型（旧 z.infer<OutputSchema> 转写，delta ①）。 */
export type AskUserQuestionOutput = {
  questions: AskUserQuestion[]
  answers: Record<string, string>
  annotations?: Record<string, QuestionAnnotation>
}

/** delta ②：唯一性校验消息（旧 UNIQUENESS_REFINE.message 逐字）。 */
const UNIQUENESS_MESSAGE =
  'Question texts must be unique, option labels must be unique within each question'

/** 输入 JSON schema（旧 z.strictObject 逐字段转写，delta ①；嵌套 min/max = 旧 .min/.max 面）。 */
export const ASK_USER_QUESTION_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      description: 'Questions to ask the user (1-4 questions)',
      items: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description:
              'The complete question to ask the user. Should be clear, specific, and end with a question mark. Example: "Which library should we use for date formatting?" If multiSelect is true, phrase it accordingly, e.g. "Which features do you want to enable?"',
          },
          header: {
            type: 'string',
            description: `Very short label displayed as a chip/tag (max ${ASK_USER_QUESTION_TOOL_CHIP_WIDTH} chars). Examples: "Auth method", "Library", "Approach".`,
          },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            description:
              "The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice (unless multiSelect is enabled). There should be no 'Other' option, that will be provided automatically.",
            items: {
              type: 'object',
              properties: {
                label: {
                  type: 'string',
                  description:
                    'The display text for this option that the user will see and select. Should be concise (1-5 words) and clearly describe the choice.',
                },
                description: {
                  type: 'string',
                  description:
                    'Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications.',
                },
                preview: {
                  type: 'string',
                  description:
                    'Optional preview content rendered when this option is focused. Use for mockups, code snippets, or visual comparisons that help users compare options. See the tool description for the expected content format.',
                },
              },
              required: ['label', 'description'],
            },
          },
          multiSelect: {
            type: 'boolean',
            description:
              'Set to true to allow the user to select multiple options instead of just one. Use when choices are not mutually exclusive.',
          },
        },
        required: ['question', 'header', 'options'],
      },
    },
    answers: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'User answers collected by the permission component',
    },
    annotations: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          preview: {
            type: 'string',
            description:
              'The preview content of the selected option, if the question used previews.',
          },
          notes: {
            type: 'string',
            description: 'Free-text notes the user added to their selection.',
          },
        },
      },
      description:
        'Optional per-question annotations from the user (e.g., notes on preview selections). Keyed by question text.',
    },
    metadata: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description:
            'Optional identifier for the source of this question (e.g., "remember" for /remember command). Used for analytics tracking.',
        },
      },
      description:
        'Optional metadata for tracking and analytics purposes. Not displayed to user.',
    },
  },
  required: ['questions'],
  additionalProperties: false,
}

// Tool 契约非参数化（readTool face 先例）；face 扩型 = checkPermissions
// 返回型收窄 Promise<PermissionResult<AskUserQuestionToolInput>>（web face 先例）。
type AskUserQuestionToolFace = Tool & {
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionResult<AskUserQuestionToolInput>>
}

export const AskUserQuestionTool: AskUserQuestionToolFace = {
  name: ASK_USER_QUESTION_TOOL_NAME,
  inputSchema: ASK_USER_QUESTION_TOOL_INPUT_SCHEMA,
  inputJSONSchema: ASK_USER_QUESTION_TOOL_INPUT_SCHEMA,
  searchHint: 'prompt the user with a multiple-choice question',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // delta ①：旧 z.strictObject 面
  strict: true,
  isEnabled: () => true,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  userFacingName: () => '',
  toAutoClassifierInput(input: unknown) {
    return (input as AskUserQuestionToolInput).questions
      .map(q => q.question)
      .join(' | ')
  },
  async description() {
    // delta ④：新契约唯一 prompt 面（旧 preview-format 分支裁）
    return (
      ASK_USER_QUESTION_TOOL_PROMPT + PREVIEW_FEATURE_PROMPT.markdown
    )
  },
  async checkPermissions(
    input: unknown,
    _context: unknown,
  ): Promise<PermissionResult<AskUserQuestionToolInput>> {
    return {
      behavior: 'ask',
      message: 'Answer questions?',
      updatedInput: input as AskUserQuestionToolInput,
    }
  },
  // delta ②/③：旧 UNIQUENESS_REFINE 移入（HTML preview 支裁，死码登记）
  async validateInput(input: unknown): Promise<ValidationResult> {
    const { questions } = input as AskUserQuestionToolInput
    const questionTexts = questions.map(q => q.question)
    if (questionTexts.length !== new Set(questionTexts).size) {
      return { result: false, message: UNIQUENESS_MESSAGE, errorCode: 1 }
    }
    for (const question of questions) {
      const labels = question.options.map(opt => opt.label)
      if (labels.length !== new Set(labels).size) {
        return { result: false, message: UNIQUENESS_MESSAGE, errorCode: 1 }
      }
    }
    return { result: true }
  },
  // delta ⑤：旧 UI JSX 面裁（TUI 波）；null 面逐字
  renderToolUseMessage(): unknown {
    return null
  },
  // delta ⑧：旧 call passthrough 逐字
  async call(args: unknown, _context: unknown): Promise<ToolResult<AskUserQuestionOutput>> {
    const { questions, answers = {}, annotations } =
      args as AskUserQuestionToolInput
    return {
      data: {
        questions,
        answers,
        ...(annotations && { annotations }),
      },
    }
  },
  // delta ⑧：旧 mapToolResult 模板逐字
  mapToolResultToToolResultBlockParam(
    content: AskUserQuestionOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    const { answers, annotations } = content
    const answersText = Object.entries(answers)
      .map(([questionText, answer]) => {
        const annotation = annotations?.[questionText]
        const parts = [`"${questionText}"="${answer}"`]
        if (annotation?.preview) {
          parts.push(`selected preview:\n${annotation.preview}`)
        }
        if (annotation?.notes) {
          parts.push(`user notes: ${annotation.notes}`)
        }
        return parts.join(' ')
      })
      .join(', ')
    return {
      type: 'tool_result' as const,
      content: `User has answered your questions: ${answersText}. You can now continue with the user's answers in mind.`,
      tool_use_id: toolUseID,
    }
  },
}
