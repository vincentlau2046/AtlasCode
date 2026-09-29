import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { TILING_PLANNER_TOOL_NAME } from './constants.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    op_spec: z.string().describe('Operator spec: name or parsed spec (name or JSON).'),
    shapes: z.string().optional().describe('JSON array of input tensor shapes.'),
    dtype: z.string().optional().describe('Target dtype (e.g. float16).'),
    strategy: z.string().optional().describe('Tiling strategy hint: throughput / latency / balanced.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const tilingPlanSchema = z.object({
  blockDim: z.number().describe('Block dimensions for the Ascend kernel launch.'),
  gridDim: z.number().describe('Grid dimensions.'),
  tileSizeBM: z.number().describe('Tile size in BM dimension.'),
  tileSizeBN: z.number().describe('Tile size in BN dimension.'),
  tileSizeBK: z.number().describe('Tile size in BK dimension.'),
  memStrategy: z.string().describe('Memory strategy: reuse / double_buffer / triple_buffer.'),
})

const outputSchema = lazySchema(() =>
  z.object({
    op_name: z.string().describe('Operator name.'),
    strategy: z.string().describe('Selected tiling strategy.'),
    plans: z.array(tilingPlanSchema).describe('Suggested tiling plans (ordered by preference).'),
    reasoning: z.string().describe('Why these tiling configs were chosen.'),
    mocked: z.boolean().describe('True when using mock/precomputed plans.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

const PRESET_PLANS = {
  throughput: [
    { blockDim: 256, gridDim: 16, tileSizeBM: 128, tileSizeBN: 128, tileSizeBK: 32, memStrategy: 'reuse' },
    { blockDim: 256, gridDim: 32, tileSizeBM: 256, tileSizeBN: 128, tileSizeBK: 16, memStrategy: 'double_buffer' },
  ],
  latency: [
    { blockDim: 128, gridDim: 8, tileSizeBM: 64, tileSizeBN: 64, tileSizeBK: 32, memStrategy: 'reuse' },
    { blockDim: 128, gridDim: 16, tileSizeBM: 128, tileSizeBN: 64, tileSizeBK: 16, memStrategy: 'reuse' },
  ],
  balanced: [
    { blockDim: 256, gridDim: 16, tileSizeBM: 128, tileSizeBN: 128, tileSizeBK: 32, memStrategy: 'double_buffer' },
    { blockDim: 128, gridDim: 32, tileSizeBM: 256, tileSizeBN: 64, tileSizeBK: 16, memStrategy: 'reuse' },
  ],
}

export const TilingPlanner = buildTool({
  name: TILING_PLANNER_TOOL_NAME,
  searchHint: 'plan tiling config for an Ascend operator on the NPU',
  maxResultSizeChars: 20_000,
  async description(input) {
    const name = (input as { op_spec?: string }).op_spec || 'this operator'
    return 'Plan tiling for ' + name
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return true },
  async prompt() {
    return 'Plan tiling configurations for an Ascend NPU operator. Provide the operator spec (name or parsed spec), optional tensor shapes, dtype, and a strategy hint (throughput / latency / balanced). Returns a ranked list of tiling plans with tile sizes, block/grid dims, and memory strategy — candidate hints, not a single decision. In mock mode it returns precomputed configs.'
  },
  async call(
    input,
    { options }: { options?: { isNonInteractiveSession?: boolean } },
  ) {
    const inp: any = input as any
    const strat = (inp.strategy || 'balanced') as keyof typeof PRESET_PLANS
    const plans = PRESET_PLANS[strat] || PRESET_PLANS.balanced
    let opName = inp.op_spec
    try {
      const p = JSON.parse(inp.op_spec)
      if (p.op_name || p.name) opName = p.op_name || p.name
    } catch { /* not JSON */ }
    return {
      data: {
        op_name: opName,
        strategy: strat,
        plans,
        reasoning: 'Precomputed tiling for "' + strat + '" strategy. Adjust tile sizes based on the actual tensor shapes in the spec.',
        mocked: true,
      },
    }
  },
} as any)