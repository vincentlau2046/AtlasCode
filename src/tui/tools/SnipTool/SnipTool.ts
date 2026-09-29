import { z } from 'zod/v4'
import { buildTool, type Tool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const SNIP_TOOL_NAME = 'Snip'

const inputSchema = lazySchema(() =>
  z
    .strictObject({
      summary: z
        .string()
        .optional()
        .describe('Optional pre-written summary to use for the snipped history.'),
      keepLastN: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('How many recent turns to keep verbatim.'),
    })
    .passthrough(),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    snipped: z.boolean().describe('Whether the history was actually snipped.'),
    savedTokens: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Approximate tokens freed.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export const SnipTool = buildTool({
  name: SNIP_TOOL_NAME,
  searchHint: 'summarize and replace old conversation history to free context',
  maxResultSizeChars: 10_000,
  async description() {
    return 'Snips the current conversation history into a compact summary.'
  },
  async prompt() {
    return (
      'You can use this tool to snip (summarize) the conversation history, ' +
      'replacing older turns with a short summary to keep the context window small.'
    )
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return true
  },
  renderToolUseMessage() {
    return null
  },
  async call(input, context, canUseTool, parentMessage, onProgress) {
    return {
      data: {
        snipped: true,
        savedTokens: 0,
      },
    }
  },
})
