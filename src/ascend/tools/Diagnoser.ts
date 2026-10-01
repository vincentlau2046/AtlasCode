/**
 * AscendDiagnoser — diagnose Ascend operator compile/runtime errors（M3-S3，
 * D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/Diagnoser.ts 移植（函数体逐字，纯计算证据
 * 提取无 CANN exec；工具只返 EVIDENCE 不决策 next-tool）。delta（旧
 * buildTool(zod) → 新 shared Tool 契约，taskCreate/Bash 先例）：① ② ③ ④ ⑤
 * 无 checkPermissions 覆写 → allow-passthrough ⑥ renderToolUseMessage → null +
 * mapToolResult JSON 化 ⑦ call 5 参 → 2 参（仅消费 args）。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from 'src/shared'
import { DIAGNOSER_TOOL_NAME } from './constants'

export const DIAGNOSER_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    error_log: {
      type: 'string',
      description:
        'Error log from bisheng compile or golden-test (stdout + stderr).',
    },
    op_spec: {
      type: 'string',
      description: 'Parsed operator spec (from SpecParser) for context.',
    },
    artifact: {
      type: 'string',
      description:
        'Path to the compiled artifact or source file for context.',
    },
  },
  required: ['error_log'],
}

export interface FixSuggestion {
  field: string
  before?: string
  after: string
  reason: string
  confidence: string
}

export interface DiagnoserOutput {
  error_class: string
  summary: string
  bottleneck_stage?: string
  extracted_snippets: string[]
  candidate_fixes: FixSuggestion[]
}

/**
 * Extract the key error lines from a log as EVIDENCE。
 * Covers both bisheng compile errors (error/fatal/undefined reference/exception)
 * and golden-test assertion failures (assert/allclose/mismatch/max abs)。
 */
function extractSnippets(log: string, max = 5): string[] {
  const patterns =
    /error|fatal|failed|cannot|undefined (reference|symbol)|not found|exception|assert|allclose|mismatch|not close|max abs/i
  return log
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && patterns.test(l))
    .slice(0, max)
}

function getPrompt(): string {
  return (
    'Diagnose an Ascend NPU operator error from an error log (bisheng compile ' +
    'output or golden-test output). Provide the error log text, an optional ' +
    'parsed spec from SpecParser, and an optional artifact path. Returns a ' +
    'classified error type, summary, the bottleneck stage if identifiable, ' +
    'extracted error snippets (evidence), and candidate fix hypotheses with ' +
    'confidence. This tool returns EVIDENCE only — it never prescribes the ' +
    'next tool to call; YOU decide the next action from the evidence. Use this ' +
    'after CompilerBridge or GoldenTest returns an error.'
  )
}

export const Diagnoser: Tool = {
  name: DIAGNOSER_TOOL_NAME,
  inputSchema: DIAGNOSER_INPUT_SCHEMA,
  inputJSONSchema: DIAGNOSER_INPUT_SCHEMA,
  maxResultSizeChars: 30_000,
  searchHint:
    'diagnose Ascend operator compile or runtime errors — returns evidence (class + snippets + hypotheses), not a next-tool decision',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => DIAGNOSER_TOOL_NAME,
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
  ): Promise<ToolResult<DiagnoserOutput>> {
    const inp = (args ?? {}) as { error_log?: string }
    const rawLog = inp.error_log || ''
    const log = rawLog.toLowerCase()
    let klass = 'unknown'
    let summary = 'No actionable pattern detected in the error log.'
    let stage: string | undefined = undefined
    if (
      log.includes('assert') ||
      log.includes('segfault') ||
      log.includes('sigill')
    ) {
      klass = 'runtime'
      summary = 'Runtime crash detected (assert/segfault/SIGILL).'
      stage = 'run'
    } else if (
      log.includes('internal compiler error') ||
      log.includes('ice')
    ) {
      klass = 'compile'
      summary = 'Internal compiler error in bisheng.'
      stage = 'compile'
    } else if (log.includes('out of memory') || log.includes('oom')) {
      klass = 'oom'
      summary = 'Out-of-memory during compile or run.'
      stage = 'compile'
    } else if (log.includes('misaligned') || log.includes('alignment')) {
      klass = 'alignment'
      summary = 'Memory alignment issue.'
      stage = 'tiling'
    } else if (log.includes('undefined symbol') || log.includes('unresolved')) {
      klass = 'compile'
      summary = 'Missing symbol or unresolved reference.'
      stage = 'compile'
    } else if (log.includes('error') || log.includes('fail')) {
      klass = 'compile'
      summary = 'Compile failure detected.'
      stage = 'compile'
    }
    const candidateFixes: FixSuggestion[] = []
    if (klass === 'oom' || klass === 'runtime') {
      candidateFixes.push({
        field: 'tile_size',
        before: 'current',
        after: 'Reduce BM/BN tile sizes by 50%',
        reason: 'Lower memory footprint on NPU L1',
        confidence: 'medium',
      })
      candidateFixes.push({
        field: 'mem_strategy',
        before: 'reuse',
        after: 'double_buffer',
        reason: 'Double buffering may avoid stalls',
        confidence: 'low',
      })
    }
    if (klass === 'compile') {
      candidateFixes.push({
        field: 'op_spec',
        before: 'current',
        after: 'Check operator name and dtype mapping',
        reason: 'Typo or unsupported dtype',
        confidence: 'high',
      })
      candidateFixes.push({
        field: 'CANN_PKG_VER',
        before: '8.0.0',
        after: 'Verify CANN 8.x version is correct',
        reason: 'Version-specific bisheng behavior',
        confidence: 'medium',
      })
    }
    if (klass === 'alignment') {
      candidateFixes.push({
        field: 'tileSizeBK',
        before: 'current',
        after: 'Align BK to 32',
        reason:
          'Ascend NPU prefers 32-byte aligned tile dimensions',
        confidence: 'high',
      })
    }
    if (klass === 'unknown') {
      candidateFixes.push({
        field: 'error_log',
        before: 'current',
        after: 'Rerun with verbose flag (-v)',
        reason: 'Insufficient error detail for diagnosis',
        confidence: 'high',
      })
    }
    return {
      data: {
        error_class: klass,
        summary,
        bottleneck_stage: stage,
        extracted_snippets: extractSnippets(rawLog),
        candidate_fixes: candidateFixes,
      },
    }
  },
}
