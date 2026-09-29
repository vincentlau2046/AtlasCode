import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { DIAGNOSER_TOOL_NAME } from './constants.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    error_log: z.string().describe('Error log from bisheng compile or golden-test (stdout + stderr).'),
    op_spec: z.string().optional().describe('Parsed operator spec (from SpecParser) for context.'),
    artifact: z.string().optional().describe('Path to the compiled artifact or source file for context.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const fixSuggestionSchema = z.object({
  field: z.string().describe('What to change (e.g. tile_size, dtype, mem_strategy).'),
  before: z.string().optional().describe('Current value.'),
  after: z.string().describe('Suggested value — a hypothesis, not an instruction. The agent decides whether to apply it.'),
  reason: z.string().describe('Why this fix might address the error.'),
  confidence: z.string().describe('Confidence level: high / medium / low.'),
})

const outputSchema = lazySchema(() =>
  z.object({
    error_class: z.string().describe('Classified error type: compile / runtime / oom / alignment / unknown.'),
    summary: z.string().describe('One-line summary of the issue.'),
    bottleneck_stage: z.string().optional().describe('The stage where the error occurred (tiling / compile / run).'),
    extracted_snippets: z.array(z.string()).describe('Key error lines extracted from the log — evidence for the agent to reason over, NOT a prescription of what to do next.'),
    candidate_fixes: z.array(fixSuggestionSchema).describe('Ranked hypotheses (field + suggested value + reason + confidence). The agent decides which to apply and which tool to call next — this tool never prescribes the next action.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

/**
 * Extract the key error lines from a log as EVIDENCE.
 * Covers both bisheng compile errors (error/fatal/undefined reference/exception)
 * and golden-test assertion failures (assert/allclose/mismatch/max abs).
 */
function extractSnippets(log: string, max = 5): string[] {
  const patterns = /error|fatal|failed|cannot|undefined (reference|symbol)|not found|exception|assert|allclose|mismatch|not close|max abs/i
  return log
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && patterns.test(l))
    .slice(0, max)
}

export const Diagnoser = buildTool({
  name: DIAGNOSER_TOOL_NAME,
  searchHint: 'diagnose Ascend operator compile or runtime errors — returns evidence (class + snippets + hypotheses), not a next-tool decision',
  maxResultSizeChars: 30_000,
  async description() {
    return 'Diagnose an Ascend operator error'
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return true },
  async prompt() {
    return 'Diagnose an Ascend NPU operator error from an error log (bisheng compile output or golden-test output). Provide the error log text, an optional parsed spec from SpecParser, and an optional artifact path. Returns a classified error type, summary, the bottleneck stage if identifiable, extracted error snippets (evidence), and candidate fix hypotheses with confidence. This tool returns EVIDENCE only — it never prescribes the next tool to call; YOU decide the next action from the evidence. Use this after CompilerBridge or GoldenTest returns an error.'
  },
  async call(
    input,
    { options }: { options?: { isNonInteractiveSession?: boolean } },
  ) {
    const inp: any = input as any
    const rawLog = inp.error_log || ''
    const log = rawLog.toLowerCase()
    let klass = 'unknown'
    let summary = 'No actionable pattern detected in the error log.'
    let stage: string | undefined = undefined
    if (log.includes('assert') || log.includes('segfault') || log.includes('sigill')) {
      klass = 'runtime'; summary = 'Runtime crash detected (assert/segfault/SIGILL).'; stage = 'run'
    } else if (log.includes('internal compiler error') || log.includes('ice')) {
      klass = 'compile'; summary = 'Internal compiler error in bisheng.'; stage = 'compile'
    } else if (log.includes('out of memory') || log.includes('oom')) {
      klass = 'oom'; summary = 'Out-of-memory during compile or run.'; stage = 'compile'
    } else if (log.includes('misaligned') || log.includes('alignment')) {
      klass = 'alignment'; summary = 'Memory alignment issue.'; stage = 'tiling'
    } else if (log.includes('undefined symbol') || log.includes('unresolved')) {
      klass = 'compile'; summary = 'Missing symbol or unresolved reference.'; stage = 'compile'
    } else if (log.includes('error') || log.includes('fail')) {
      klass = 'compile'; summary = 'Compile failure detected.'; stage = 'compile'
    }
    const candidateFixes: any[] = []
    if (klass === 'oom' || klass === 'runtime') {
      candidateFixes.push({ field: 'tile_size', before: 'current', after: 'Reduce BM/BN tile sizes by 50%', reason: 'Lower memory footprint on NPU L1', confidence: 'medium' })
      candidateFixes.push({ field: 'mem_strategy', before: 'reuse', after: 'double_buffer', reason: 'Double buffering may avoid stalls', confidence: 'low' })
    }
    if (klass === 'compile') {
      candidateFixes.push({ field: 'op_spec', before: 'current', after: 'Check operator name and dtype mapping', reason: 'Typo or unsupported dtype', confidence: 'high' })
      candidateFixes.push({ field: 'CANN_PKG_VER', before: '8.0.0', after: 'Verify CANN 8.x version is correct', reason: 'Version-specific bisheng behavior', confidence: 'medium' })
    }
    if (klass === 'alignment') {
      candidateFixes.push({ field: 'tileSizeBK', before: 'current', after: 'Align BK to 32', reason: 'Ascend NPU prefers 32-byte aligned tile dimensions', confidence: 'high' })
    }
    if (klass === 'unknown') {
      candidateFixes.push({ field: 'error_log', before: 'current', after: 'Rerun with verbose flag (-v)', reason: 'Insufficient error detail for diagnosis', confidence: 'high' })
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
} as any)
