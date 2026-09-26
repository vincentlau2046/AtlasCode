/**
 * engine/tools/files — GlobTool 本体（§8.55 S-C4，高频族纵切子波 3）。
 *
 * 旧仓来源（a8af45b）：src/tools/GlobTool/GlobTool.ts 198L 逐字随迁
 * （input schema 2 字段 / output 型 / call = glob + toRelativePath +
 * globLimits?.maxResults ?? 100 / mapToolResult 空集 + truncated 提示
 * 2 支 / validateInput UNC 跳 + ENOENT errorCode 1 + 非目录 errorCode 2 /
 * checkPermissions 一线接线 checkReadPermissionForTool）。消费方 =
 * `files/` 子门面 + `tools/` 门面 re-export + 注册表 ⑰ 槽（Glob/Grep
 * 恒注册，S-T4 已裁闭）注入位。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema) → 新 shared Tool 契约：inputSchema =
 *    纯 JSON schema 对象（GLOB_TOOL_INPUT_SCHEMA，S-B5 BASH 先例）；旧
 *    zod outputSchema（z.infer 推断 Output 型）→ TS 型 GlobOutput 承载
 *    文档面（引擎侧无 wire outputSchema 消费者，wire 面 = D 波前向接缝）。
 *  ② 旧 zod 类型约束（.string()）不进 JSON schema（ToolInputJSONSchema
 *    宽骨架面，S-B5 delta ② 先例）。
 *  ③ 旧 prompt() 成员（与 description 重复）不在新 Tool 契约 → 裁
 *    （S-B5 delta ③ 先例，description 唯一 prompt 面）。
 *  ④ 旧 buildTool TOOL_DEFAULTS 成员对象化：isConcurrencySafe true /
 *    isDestructive false（默认值逐值）；isReadOnly true（def 体）；
 *    userFacingName 旧生效值 = UI.tsx `return 'Search'`（复用 Grep 的，
 *    两工具同值，逐字保留）；toAutoClassifierInput = input.pattern。
 *  ⑤ checkPermissions = 一线接线 checkReadPermissionForTool（旧 buildTool
 *    默认即委托通用权限系统，本波显式接线 = 同语义固化）；**P-C4 探针
 *    锚点**：matchingRuleForInput = 桩 ①（规则求值归 engine 前向接缝，
 *    §8.14）→ deny/allow 规则面不可观察，可观察判别 = 工作目录边界
 *    2 红集 {工作目录内 allow（mode default），工作目录外无规则 ask}
 *    （计划原「deny 规则 2 红集 {deny,allow}」P-B2 先例族 **登记订正**，
 *    P-E5 先例 ≥1 红下界；deny/allow 规则观察 = 规则求值波前向接缝）。
 *  ⑥ renderToolUseMessage = 文本面逐字随迁（旧 UI.tsx 非 React 模板，
 *    getDisplayPath 消费同域 ./fileUtils；契约 2 参实现 1 参，options.
 *    verbose 消费）；renderToolUseErrorMessage（React 面域外，TUI 波）/
 *    renderToolResultMessage（旧 Glob 复用 Grep 的 React SearchResult-
 *    Summary，域外，TUI 波）裁。
 *  ⑦ getToolUseSummary（truncate + TOOL_SUMMARY_MAX_LENGTH 50 随之裁）/
 *    getActivityDescription（UI/进度面）不在新 Tool 契约 → 裁。
 *  ⑧ preparePermissionMatcher（旧 matchWildcardPattern import 随之裁）/
 *    isSearchOrReadCommand（gate 侧分类面）不在新 Tool 契约 → 裁
 *    （auto-mode 波 C 桶 ② / gate 侧前向接缝）。
 *  ⑨ expandPath 旧 1 参（utils/cwd 模块态）→ 新 shared 2 参
 *    expandPath(path, getCwd())（S-C1 签名适配先例）；getCwd →
 *    bootstrap 门面；isENOENT/getFsImplementation/FILE_NOT_FOUND_CWD_NOTE/
 *    suggestPathUnderCwd → shared + 同域。
 *  ⑩ call 5 参声明 → 2 参声明（旧 canUseTool/_parentMessage/onProgress
 *    旧体不消费，裁，零行为；S-B5 delta ⑩ 先例）；context duck =
 *    FilesToolUseContext（filesToolInput.ts）。
 *
 * 残留守（防「以为已全」）：真 ToolUseContext 全字段面 / UI React 渲染面
 *  = 残留守（D 波/TUI 波）。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
  ValidationResult,
  PermissionDecision,
} from '../../../shared'
import {
  expandPath,
  getFsImplementation,
  isENOENT,
} from '../../../shared'
import { checkReadPermissionForTool } from '../../../permissions'
import { getCwd } from '../../../bootstrap'
import { GLOB_TOOL_NAME } from '../toolNames'
import { GLOB_DESCRIPTION } from './globPrompt'
import { glob } from './globUtils'
import { toRelativePath } from './relativePath'
import {
  FILE_NOT_FOUND_CWD_NOTE,
  getDisplayPath,
  suggestPathUnderCwd,
} from './fileUtils'
import type { GlobToolInput, FilesToolUseContext } from './filesToolInput'

/**
 * 输入 JSON schema（旧仓 zod inputSchema 逐字段转写，delta ①/②；与
 * GlobToolInput duck 型单一事实源逐字段对齐）。
 */
export const GLOB_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    pattern: {
      type: 'string',
      description: 'The glob pattern to match files against',
    },
    path: {
      type: 'string',
      description:
        'The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.',
    },
  },
  required: ['pattern'],
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type GlobOutput = {
  /** Time taken to execute the search in milliseconds */
  durationMs: number
  /** Total number of files found */
  numFiles: number
  /** Array of file paths that match the pattern */
  filenames: string[]
  /** Whether results were truncated (limited to 100 files) */
  truncated: boolean
}

// Tool 契约非参数化（Input 泛参位 = JSON schema 对象型，非 duck 输入型，
// S-B5 BashTool 先例）；face 扩型 = getPath（PermissionTool duck 成员，
// excess-property 面显式声明）+ checkPermissions 返回型收窄 Promise<
// PermissionDecision>（契约位 Promise<unknown> 不满足 PermissionTool
// 目标型 Promise<PermissionResult>，扩型收窄 = checkReadPermissionForTool
// 直接传值免 cast）。
type GlobToolFace = Tool & {
  getPath(input: Record<string, unknown>): string
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision>
}
export const GlobTool: GlobToolFace = {
  name: GLOB_TOOL_NAME,
  inputSchema: GLOB_TOOL_INPUT_SCHEMA,
  inputJSONSchema: GLOB_TOOL_INPUT_SCHEMA,
  searchHint: 'find files by name pattern or wildcard',
  maxResultSizeChars: 100_000,
  isEnabled: () => true,
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ④，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) =>
    (input as GlobToolInput).pattern,
  // delta ④：旧生效值 = UI.tsx 'Search'（复用 Grep 的）
  userFacingName: () => 'Search',
  getPath(input: Record<string, unknown>): string {
    const { path } = input as unknown as GlobToolInput
    return path ? expandPath(path, getCwd()) : getCwd()
  },
  async validateInput(input: unknown): Promise<ValidationResult> {
    const { path } = input as GlobToolInput
    // If path is provided, validate that it exists and is a directory
    if (path) {
      const fs = getFsImplementation()
      const absolutePath = expandPath(path, getCwd())

      // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
      if (absolutePath.startsWith('\\\\') || absolutePath.startsWith('//')) {
        return { result: true }
      }

      let stats
      try {
        stats = await fs.stat(absolutePath)
      } catch (e: unknown) {
        if (isENOENT(e)) {
          const cwdSuggestion = await suggestPathUnderCwd(absolutePath)
          let message = `Directory does not exist: ${path}. ${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}.`
          if (cwdSuggestion) {
            message += ` Did you mean ${cwdSuggestion}?`
          }
          return {
            result: false,
            message,
            errorCode: 1,
          }
        }
        throw e
      }

      if (!stats.isDirectory()) {
        return {
          result: false,
          message: `Path is not a directory: ${path}`,
          errorCode: 2,
        }
      }
    }

    return { result: true }
  },
  // delta ⑤：一线接线（P-C4 探针锚点，2 红集 {工作目录内 allow, 工作目录外 ask}）
  async checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision> {
    const appState = (context as FilesToolUseContext).getAppState()
    return checkReadPermissionForTool(
      GlobTool,
      input as Record<string, unknown>,
      appState.toolPermissionContext,
    )
  },
  description: async () => GLOB_DESCRIPTION,
  // delta ⑥：文本面逐字（旧 UI.tsx 非 React 模板；TUI React 面残留守）
  renderToolUseMessage(input: unknown, options: { verbose: boolean }): unknown {
    const { pattern, path } = input as GlobToolInput
    if (!pattern) {
      return null
    }
    if (!path) {
      return `pattern: "${pattern}"`
    }
    return `pattern: "${pattern}", path: "${options.verbose ? path : getDisplayPath(path)}"`
  },
  // Reuses Grep's render (UI.tsx:65) — shows filenames.join. durationMs/
  // numFiles are "Found 3 files in 12ms" chrome (under-count, fine).
  extractSearchText(output: unknown): string {
    return (output as GlobOutput).filenames.join('\n')
  },
  mapToolResultToToolResultBlockParam(
    output: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const c = output as GlobOutput
    if (c.filenames.length === 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: 'No files found',
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: [
        ...c.filenames,
        ...(c.truncated
          ? [
              '(Results are truncated. Consider using a more specific path or pattern.)',
            ]
          : []),
      ].join('\n'),
    }
  },
  // delta ⑩：call 2 参声明（context duck = FilesToolUseContext）
  async call(args: unknown, context: unknown): Promise<ToolResult<GlobOutput>> {
    const input = (args ?? {}) as GlobToolInput
    const ctx = (context ?? {}) as FilesToolUseContext
    const start = Date.now()
    const appState = ctx.getAppState()
    const limit = ctx.globLimits?.maxResults ?? 100
    const { files, truncated } = await glob(
      input.pattern,
      GlobTool.getPath(input as unknown as Record<string, unknown>),
      { limit, offset: 0 },
      ctx.abortController.signal,
      appState.toolPermissionContext,
    )
    // Relativize paths under cwd to save tokens (same as GrepTool)
    const filenames = files.map(toRelativePath)
    const output: GlobOutput = {
      filenames,
      durationMs: Date.now() - start,
      numFiles: filenames.length,
      truncated,
    }
    return {
      data: output,
    }
  },
}
