/**
 * AscendSpecParser — parse/normalize an Ascend operator spec（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/SpecParser.ts 移植（函数体逐字）。delta（旧
 * buildTool(zod) → 新 shared Tool 契约，taskCreate/Bash 先例）：
 *  ① zod inputSchema → 纯 JSON schema（SPEC_PARSER_INPUT_SCHEMA）
 *  ② zod outputSchema z.infer → TS 型 SpecParserOutput 承载文档面
 *  ③ 旧 prompt() 体 → 新契约唯一 prompt 面 description()
 *  ④ 旧 buildTool TOOL_DEFAULTS 对象化（isReadOnly true / isDestructive false /
 *    isConcurrencySafe false / maxResultSizeChars 50_000）
 *  ⑤ 旧无 checkPermissions 覆写 → buildTool 默认 allow-passthrough 显式固化
 *  ⑥ renderToolUseMessage → null（TUI 残留守）+ mapToolResult JSON 化
 *  ⑦ call 5 参 → 2 参（args/context；本工具仅消费 args）
 *  ⑧ import 重指 fs/promises → node:fs/promises
 */
import { readFile } from 'node:fs/promises'
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from 'src/shared'
import { SPEC_PARSER_TOOL_NAME } from './constants'

export const SPEC_PARSER_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    spec_source: {
      type: 'string',
      description:
        'Operator spec source: a file path (JSON/text) or an inline spec string.',
    },
    op_name: {
      type: 'string',
      description: 'Optional operator name override.',
    },
  },
  required: ['spec_source'],
}

/** 旧 zod outputSchema z.infer 型（TS 型承载文档面）。 */
export interface SpecParserOutput {
  op_name: string
  op_type?: string
  data_types?: string[]
  shapes?: string
  tiling_constraints?: string
  parsed_from_file: boolean
  raw: string
}

function getPrompt(): string {
  return (
    'Parse and normalize an Ascend operator spec from a file path or an inline ' +
    'JSON/text string. Returns the resolved operator name, type, data types, ' +
    'tensor shapes, and tiling constraints. This is the first step in the ' +
    'Ascend operator workflow.'
  )
}

export const SpecParser: Tool = {
  name: SPEC_PARSER_TOOL_NAME,
  inputSchema: SPEC_PARSER_INPUT_SCHEMA,
  inputJSONSchema: SPEC_PARSER_INPUT_SCHEMA,
  maxResultSizeChars: 50_000,
  searchHint:
    'parse and normalize an Ascend operator spec from file or inline text',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => SPEC_PARSER_TOOL_NAME,
  // delta ⑤：旧无覆写 → buildTool 默认 allow-passthrough
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  description: async () => getPrompt(),
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: JSON.stringify(content, null, 2),
    }
  },
  async call(
    args: unknown,
    _context: unknown,
  ): Promise<ToolResult<SpecParserOutput>> {
    const inp = (args ?? {}) as { spec_source: string; op_name?: string }
    let raw = inp.spec_source
    let parsedFromFile = false
    try {
      const fileContent = await readFile(inp.spec_source, 'utf-8')
      raw = fileContent
      parsedFromFile = true
    } catch {
      /* not a file; treat as inline */
    }
    let parsed: any = {}
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = { __raw: raw }
    }
    const opName = inp.op_name || parsed.op_name || parsed.name || 'unnamed_op'
    const shapes = parsed.shapes || parsed.input_shapes
    const shapesStr = shapes ? JSON.stringify(shapes) : undefined
    const constraints = parsed.tiling || parsed.tiling_constraints
    const constraintsStr = constraints ? JSON.stringify(constraints) : undefined
    return {
      data: {
        op_name: opName,
        op_type: parsed.type || parsed.op_type,
        data_types: parsed.data_types || parsed.dtypes,
        shapes: shapesStr,
        tiling_constraints: constraintsStr,
        parsed_from_file: parsedFromFile,
        raw: raw.slice(0, 10_000),
      },
    }
  },
}
