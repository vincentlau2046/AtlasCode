import { z } from 'zod/v4'
import { readFile } from 'fs/promises'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { SPEC_PARSER_TOOL_NAME } from './constants.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    spec_source: z.string().describe('Operator spec source: a file path (JSON/text) or an inline spec string.'),
    op_name: z.string().optional().describe('Optional operator name override.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    op_name: z.string().describe('Resolved operator name.'),
    op_type: z.string().optional().describe('Operator type (e.g. gemm, conv, elemwise).'),
    data_types: z.array(z.string()).optional().describe('Supported data types.'),
    shapes: z.string().optional().describe('JSON array of input tensor shapes.'),
    tiling_constraints: z.string().optional().describe('JSON tiling constraints from the spec.'),
    parsed_from_file: z.boolean().describe('True when the spec was read from a file.'),
    raw: z.string().describe('The raw spec text (first 10K chars).'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const SpecParser = buildTool({
  name: SPEC_PARSER_TOOL_NAME,
  searchHint: 'parse and normalize an Ascend operator spec from file or inline text',
  maxResultSizeChars: 50_000,
  async description(input) {
    const name = (input as { op_name?: string }).op_name || 'a spec'
    return 'Parse ' + name + ' operator spec'
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return true },
  async prompt() {
    return 'Parse and normalize an Ascend operator spec from a file path or an inline JSON/text string. Returns the resolved operator name, type, data types, tensor shapes, and tiling constraints. This is the first step in the Ascend operator workflow.'
  },
  async call(
    input,
    { options }: { options?: { isNonInteractiveSession?: boolean } },
  ) {
    const inp: any = input as any
    let raw = inp.spec_source
    let parsedFromFile = false
    try {
      const fileContent = await readFile(inp.spec_source, 'utf-8')
      raw = fileContent
      parsedFromFile = true
    } catch { /* not a file; treat as inline */ }
    let parsed: any = {}
    try { parsed = JSON.parse(raw) } catch { parsed = { __raw: raw } }
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
} as any)