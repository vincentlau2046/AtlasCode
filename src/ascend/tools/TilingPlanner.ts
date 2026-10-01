/**
 * AscendTilingPlanner — plan tiling config for an Ascend operator（M3-S3，
 * D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/TilingPlanner.ts 移植（函数体逐字，纯计算
 * 无 CANN exec）。delta（旧 buildTool(zod) → 新 shared Tool 契约，taskCreate/
 * Bash 先例）：① zod inputSchema → 纯 JSON schema ② outputSchema z.infer → TS
 * 型 ③ prompt() → description() ④ TOOL_DEFAULTS 对象化 ⑤ 无 checkPermissions
 * 覆写 → allow-passthrough ⑥ renderToolUseMessage → null + mapToolResult
 * JSON 化 ⑦ call 5 参 → 2 参（仅消费 args）。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from 'src/shared'
import { TILING_PLANNER_TOOL_NAME } from './constants'

export const TILING_PLANNER_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    op_spec: {
      type: 'string',
      description: 'Operator spec: name or parsed spec (name or JSON).',
    },
    shapes: {
      type: 'string',
      description: 'JSON array of input tensor shapes.',
    },
    dtype: {
      type: 'string',
      description: 'Target dtype (e.g. float16).',
    },
    strategy: {
      type: 'string',
      description: 'Tiling strategy hint: throughput / latency / balanced.',
    },
  },
  required: ['op_spec'],
}

export interface TilingPlan {
  blockDim: number
  gridDim: number
  tileSizeBM: number
  tileSizeBN: number
  tileSizeBK: number
  memStrategy: string
}

export interface TilingPlannerOutput {
  op_name: string
  strategy: string
  plans: TilingPlan[]
  reasoning: string
  mocked: boolean
}

const PRESET_PLANS: Record<string, TilingPlan[]> = {
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

function getPrompt(): string {
  return (
    'Plan tiling configurations for an Ascend NPU operator. Provide the ' +
    'operator spec (name or parsed spec), optional tensor shapes, dtype, and a ' +
    'strategy hint (throughput / latency / balanced). Returns a ranked list of ' +
    'tiling plans with tile sizes, block/grid dims, and memory strategy — ' +
    'candidate hints, not a single decision. In mock mode it returns ' +
    'precomputed configs.'
  )
}

export const TilingPlanner: Tool = {
  name: TILING_PLANNER_TOOL_NAME,
  inputSchema: TILING_PLANNER_INPUT_SCHEMA,
  inputJSONSchema: TILING_PLANNER_INPUT_SCHEMA,
  maxResultSizeChars: 20_000,
  searchHint: 'plan tiling config for an Ascend operator on the NPU',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => TILING_PLANNER_TOOL_NAME,
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
  ): Promise<ToolResult<TilingPlannerOutput>> {
    const inp = (args ?? {}) as {
      op_spec: string
      strategy?: string
    }
    const strat = (inp.strategy || 'balanced') as keyof typeof PRESET_PLANS
    const plans = PRESET_PLANS[strat] || PRESET_PLANS.balanced
    let opName = inp.op_spec
    try {
      const p = JSON.parse(inp.op_spec)
      if (p.op_name || p.name) opName = p.op_name || p.name
    } catch {
      /* not JSON */
    }
    return {
      data: {
        op_name: opName,
        strategy: strat,
        plans,
        reasoning:
          'Precomputed tiling for "' +
          strat +
          '" strategy. Adjust tile sizes based on the actual tensor shapes in the spec.',
        mocked: true,
      },
    }
  },
}
