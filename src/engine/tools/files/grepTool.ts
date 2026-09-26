/**
 * engine/tools/files — GrepTool 本体（§8.55 S-C4，高频族纵切子波 3）。
 *
 * 旧仓来源（a8af45b）：src/tools/GrepTool/GrepTool.ts 577L 逐字随迁
 * （input schema 14 字段 / VCS 6 目录排除 + --max-columns 500 / 3 mode
 * call 逐字（content 逐行 relativize / count lastIndexOf 解析 /
 * files_with_matches allSettled stat + mtime-desc sort（NODE_ENV === 'test'
 * 文件名 localeCompare 支逐字））/ applyHeadLimit + formatLimitInfo 逐字
 * / mapToolResult 3 mode 分支逐字 / checkPermissions 一线接线
 * checkReadPermissionForTool）。消费方 = `files/` 子门面 + `tools/` 门面
 * re-export + 注册表 ⑰ 槽注入位。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema) → 新 shared Tool 契约：inputSchema =
 *    纯 JSON schema 对象（GREP_TOOL_INPUT_SCHEMA，S-B5 BASH 先例；14 字段
 *    与 GrepToolInput duck 型单一事实源逐字段对齐）；旧 zod outputSchema
 *    → TS 型 GrepOutput（wire 面 = D 波前向接缝）。
 *  ② 旧 zod `semanticNumber/semanticBoolean`（z.preprocess，模型面 schema
 *    仍 emit number/boolean，字符串容忍 = 不可见客户端侧 coercion，S-C1
 *    语义 delta）→ **call 入口运行时转换**（semanticToNumber ×6 数值字段
 *    -B/-A/-C/context/head_limit/offset + semanticToBoolean ×3 布尔字段
 *    -n/-i/multiline；defaults 转换后应用 = 旧解构默认值逐字）；z.coerce
 *    族排除理由（掩盖 "" / null 输入 bug）逐字保留 = 不做 coerce。
 *    **P-C1 探针锚点**（func 层）：head_limit "30" 字符串输入 →
 *    appliedLimit toBe(30)（number，strict ===）；突变（删转换）→
 *    appliedLimit "30"（string）→ 恰 1 红。
 *  ③ 旧 prompt() 成员（与 description 重复）不在新 Tool 契约 → 裁
 *    （S-B5 delta ③ 先例）。
 *  ④ 旧 buildTool TOOL_DEFAULTS 成员对象化：isConcurrencySafe true /
 *    isDestructive false / isReadOnly true；userFacingName = 'Search'
 *    （def 体逐字）；toAutoClassifierInput = `path ? \`${pattern} in
 *    ${path}\` : pattern`（逐字）。
 *  ⑤ checkPermissions = 一线接线 checkReadPermissionForTool（同 Glob
 *    delta ⑤；**P-C4 探针 2 红集 {工作目录内 allow, 工作目录外 ask}**，
 *    matchingRuleForInput 桩 ① → deny/allow 规则观察 = 规则求值波前向
 *    接缝，计划原 deny 规则 2 红集登记订正 P-E5 先例）。
 *  ⑥ renderToolUseMessage = 文本面逐字（旧 UI.tsx 非 React parts 模板；
 *    renderToolUseErrorMessage / renderToolResultMessage React 面域外
 *    TUI 波裁；TUI SearchResultSummary 组件不随迁）。
 *  ⑦ getToolUseSummary（truncate + TOOL_SUMMARY_MAX_LENGTH 随之裁）/
 *    getActivityDescription 不在新 Tool 契约 → 裁。
 *  ⑧ preparePermissionMatcher（旧 matchWildcardPattern import 随之裁）/
 *    isSearchOrReadCommand 不在新 Tool 契约 → 裁（auto-mode 波 / gate
 *    侧前向接缝）。
 *  ⑨ getGlobExclusionsForPluginCache 孤儿插件排除循环裁——新仓无 plugins
 *    域（S-C2 globUtils 同裁先例一致，plugin 波物化时恢复）。
 *  ⑩ expandPath 旧 1 参 → 新 shared 2 参 expandPath(path, getCwd())
 *    （S-C1 签名适配先例）；getCwd → bootstrap 门面；isENOENT /
 *    getFsImplementation / plural → shared；FILE_NOT_FOUND_CWD_NOTE /
 *    suggestPathUnderCwd → 同域 fileUtils；getFileReadIgnorePatterns /
 *    normalizePatternsToPath → 同域 globIgnorePatterns（S-C2 随迁）；
 *    ripGrep → sandbox 门面；toRelativePath → 同域 relativePath。
 *  ⑪ call 5 参声明 → 2 参声明（旧 canUseTool/_parentMessage/onProgress
 *    旧体不消费，裁，零行为；S-B5 delta ⑩ 先例）；第二参名 toolContext
 *    （避旧逐字输入字段名 `context` 解构局部同名冲突 TS2300，零行为）；
 *    context duck = FilesToolUseContext（filesToolInput.ts）。
 *  ⑫ applyHeadLimit / formatLimitInfo 旧仓模块内私有 → 本文件同
 *    保持模块内（facade 0 污染）；unit 经 mapToolResult 3 分支 +
 *    func 经 call（P-C1 appliedLimit 锚）覆盖，旧仓同样无导出。
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
  plural,
} from '../../../shared'
import { checkReadPermissionForTool } from '../../../permissions'
import { getCwd } from '../../../bootstrap'
import { ripGrep } from '../../../sandbox'
import { GREP_TOOL_NAME } from '../toolNames'
import { getGrepDescription } from './grepPrompt'
import {
  getFileReadIgnorePatterns,
  normalizePatternsToPath,
} from './globIgnorePatterns'
import {
  semanticToBoolean,
  semanticToNumber,
} from './semantic'
import { toRelativePath } from './relativePath'
import {
  FILE_NOT_FOUND_CWD_NOTE,
  getDisplayPath,
  suggestPathUnderCwd,
} from './fileUtils'
import type { GrepToolInput, FilesToolUseContext } from './filesToolInput'

/**
 * 输入 JSON schema（旧仓 zod 14 字段逐字段转写，delta ①/②；语义容忍
 * 字段类型位 = number/boolean（模型面逐字），运行时字符串字面量容忍由
 * call 入口 semantic 转换承担（delta ②）。与 GrepToolInput duck 型
 * 单一事实源逐字段对齐。
 */
export const GREP_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    pattern: {
      type: 'string',
      description:
        'The regular expression pattern to search for in file contents',
    },
    path: {
      type: 'string',
      description:
        'File or directory to search in (rg PATH). Defaults to current working directory.',
    },
    glob: {
      type: 'string',
      description:
        'Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob',
    },
    output_mode: {
      type: 'string',
      enum: ['content', 'files_with_matches', 'count'],
      description:
        'Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".',
    },
    '-B': {
      type: 'number',
      description:
        'Number of lines to show before each match (rg -B). Requires output_mode: "content", ignored otherwise.',
    },
    '-A': {
      type: 'number',
      description:
        'Number of lines to show after each match (rg -A). Requires output_mode: "content", ignored otherwise.',
    },
    '-C': {
      type: 'number',
      description: 'Alias for context.',
    },
    context: {
      type: 'number',
      description:
        'Number of lines to show before and after each match (rg -C). Requires output_mode: "content", ignored otherwise.',
    },
    '-n': {
      type: 'boolean',
      description:
        'Show line numbers in output (rg -n). Requires output_mode: "content", ignored otherwise. Defaults to true.',
    },
    '-i': {
      type: 'boolean',
      description: 'Case insensitive search (rg -i)',
    },
    type: {
      type: 'string',
      description:
        'File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than include for standard file types.',
    },
    head_limit: {
      type: 'number',
      description:
        'Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). Defaults to 250 when unspecified. Pass 0 for unlimited (use sparingly — large result sets waste context).',
    },
    offset: {
      type: 'number',
      description:
        'Skip first N lines/entries before applying head_limit, equivalent to "| tail -n +N | head -N". Works across all output modes. Defaults to 0.',
    },
    multiline: {
      type: 'boolean',
      description:
        'Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false.',
    },
  },
  required: ['pattern'],
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type GrepOutput = {
  mode?: 'content' | 'files_with_matches' | 'count'
  numFiles: number
  filenames: string[]
  content?: string
  /** For content mode */
  numLines?: number
  /** For count mode */
  numMatches?: number
  /** The limit that was applied (if any) */
  appliedLimit?: number
  /** The offset that was applied */
  appliedOffset?: number
}

// Version control system directories to exclude from searches
// These are excluded automatically because they create noise in search results
const VCS_DIRECTORIES_TO_EXCLUDE = [
  '.git',
  '.svn',
  '.hg',
  '.bzr',
  '.jj',
  '.sl',
] as const

// Default cap on grep results when head_limit is unspecified. Unbounded content-mode
// greps can fill up to the 20KB persist threshold (~6-24K tokens/grep-heavy session).
// 250 is generous enough for exploratory searches while preventing context bloat.
// Pass head_limit=0 explicitly for unlimited.
const DEFAULT_HEAD_LIMIT = 250

function applyHeadLimit<T>(
  items: T[],
  limit: number | undefined,
  offset: number = 0,
): { items: T[]; appliedLimit: number | undefined } {
  // Explicit 0 = unlimited escape hatch
  if (limit === 0) {
    return { items: items.slice(offset), appliedLimit: undefined }
  }
  const effectiveLimit = limit ?? DEFAULT_HEAD_LIMIT
  const sliced = items.slice(offset, offset + effectiveLimit)
  // Only report appliedLimit when truncation actually occurred, so the model
  // knows there may be more results and can paginate with offset.
  const wasTruncated = items.length - offset > effectiveLimit
  return {
    items: sliced,
    appliedLimit: wasTruncated ? effectiveLimit : undefined,
  }
}

// Format limit/offset information for display in tool results.
// appliedLimit is only set when truncation actually occurred (see applyHeadLimit),
// so it may be undefined even when appliedOffset is set — build parts conditionally
// to avoid "limit: undefined" appearing in user-visible output.
function formatLimitInfo(
  appliedLimit: number | undefined,
  appliedOffset: number | undefined,
): string {
  const parts: string[] = []
  if (appliedLimit !== undefined) parts.push(`limit: ${appliedLimit}`)
  if (appliedOffset) parts.push(`offset: ${appliedOffset}`)
  return parts.join(', ')
}

// Tool 契约非参数化（Input 泛参位 = JSON schema 对象型，非 duck 输入型，
// S-B5 BashTool 先例）；face 扩型 = getPath（PermissionTool duck 成员，
// excess-property 面显式声明）+ checkPermissions 返回型收窄 Promise<
// PermissionDecision>（契约位 Promise<unknown> 不满足 PermissionTool
// 目标型 Promise<PermissionResult>，扩型收窄 = checkReadPermissionForTool
// 直接传值免 cast）。
type GrepToolFace = Tool & {
  getPath(input: Record<string, unknown>): string
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision>
}
export const GrepTool: GrepToolFace = {
  name: GREP_TOOL_NAME,
  inputSchema: GREP_TOOL_INPUT_SCHEMA,
  inputJSONSchema: GREP_TOOL_INPUT_SCHEMA,
  searchHint: 'search file contents with regex (ripgrep)',
  // 20K chars - tool result persistence threshold
  maxResultSizeChars: 20_000,
  strict: true,
  isEnabled: () => true,
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ④，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) => {
    const c = input as GrepToolInput
    return c.path ? `${c.pattern} in ${c.path}` : c.pattern
  },
  userFacingName: () => 'Search',
  getPath(input: Record<string, unknown>): string {
    const { path } = input as unknown as GrepToolInput
    return path || getCwd()
  },
  async validateInput(input: unknown): Promise<ValidationResult> {
    const { path } = input as GrepToolInput
    // If path is provided, validate that it exists
    if (path) {
      const fs = getFsImplementation()
      const absolutePath = expandPath(path, getCwd())

      // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
      if (absolutePath.startsWith('\\\\') || absolutePath.startsWith('//')) {
        return { result: true }
      }

      try {
        await fs.stat(absolutePath)
      } catch (e: unknown) {
        if (isENOENT(e)) {
          const cwdSuggestion = await suggestPathUnderCwd(absolutePath)
          let message = `Path does not exist: ${path}. ${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}.`
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
      GrepTool,
      input as Record<string, unknown>,
      appState.toolPermissionContext,
    )
  },
  description: async () => getGrepDescription(),
  // delta ⑥：文本面逐字（旧 UI.tsx parts 模板；TUI React 面残留守）
  renderToolUseMessage(input: unknown, options: { verbose: boolean }): unknown {
    const { pattern, path } = input as GrepToolInput
    if (!pattern) {
      return null
    }
    const parts = [`pattern: "${pattern}"`]
    if (path) {
      parts.push(`path: "${options.verbose ? path : getDisplayPath(path)}"`)
    }
    return parts.join(', ')
  },
  // SearchResultSummary shows content (mode=content) or filenames.join.
  // numFiles/numLines/numMatches are chrome ("Found 3 files") — fine to
  // skip (under-count, not phantom). Glob reuses this via UI.tsx:65.
  extractSearchText(output: unknown): string {
    const c = output as GrepOutput
    if (c.mode === 'content' && c.content) return c.content
    return c.filenames.join('\n')
  },
  mapToolResultToToolResultBlockParam(
    output: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const {
      mode = 'files_with_matches',
      numFiles,
      filenames,
      content,
      numLines: _numLines,
      numMatches,
      appliedLimit,
      appliedOffset,
    } = output as GrepOutput
    if (mode === 'content') {
      const limitInfo = formatLimitInfo(appliedLimit, appliedOffset)
      const resultContent = content || 'No matches found'
      const finalContent = limitInfo
        ? `${resultContent}\n\n[Showing results with pagination = ${limitInfo}]`
        : resultContent
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: finalContent,
      }
    }

    if (mode === 'count') {
      const limitInfo = formatLimitInfo(appliedLimit, appliedOffset)
      const rawContent = content || 'No matches found'
      const matches = numMatches ?? 0
      const files = numFiles ?? 0
      const summary = `\n\nFound ${matches} total ${matches === 1 ? 'occurrence' : 'occurrences'} across ${files} ${files === 1 ? 'file' : 'files'}.${limitInfo ? ` with pagination = ${limitInfo}` : ''}`
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: rawContent + summary,
      }
    }

    // files_with_matches mode
    const limitInfo = formatLimitInfo(appliedLimit, appliedOffset)
    if (numFiles === 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: 'No files found',
      }
    }
    // head_limit has already been applied in call() method, so just show all filenames
    const result = `Found ${numFiles} ${plural(numFiles, 'file')}${limitInfo ? ` ${limitInfo}` : ''}\n${filenames.join('\n')}`
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: result,
    }
  },
  // delta ⑩：call 2 参声明（delta ② 入口 semantic 运行时转换，P-C1 探针锚点；
  // 第二参名 toolContext = 避旧逐字输入字段名 `context` 解构局部同名冲突
  // （TS2300，零行为）；旧 call 第二参解构 { abortController, getAppState }
  // → 新 ctx 先绑定；旧局部 args → argsList 改名避遮蔽 call 第一参，零行为）
  async call(
    args: unknown,
    toolContext: unknown,
  ): Promise<ToolResult<GrepOutput>> {
    const ctx = (toolContext ?? {}) as FilesToolUseContext
    const raw = (args ?? {}) as Record<string, unknown>
    // delta ②：旧 zod z.preprocess(semanticNumber/semanticBoolean) → call
    // 入口运行时转换（字符串数字/布尔字面量容忍逐字；defaults 转换后应用
    // = 旧解构默认值逐字）
    const input: GrepToolInput = {
      pattern: raw.pattern as string,
      path: raw.path as string | undefined,
      glob: raw.glob as string | undefined,
      output_mode: (raw.output_mode as
        | 'content'
        | 'files_with_matches'
        | 'count'
        | undefined) ?? 'files_with_matches',
      '-B': semanticToNumber(raw['-B']) as number | undefined,
      '-A': semanticToNumber(raw['-A']) as number | undefined,
      '-C': semanticToNumber(raw['-C']) as number | undefined,
      context: semanticToNumber(raw.context) as number | undefined,
      '-n': semanticToBoolean(raw['-n']) as boolean | undefined,
      '-i': semanticToBoolean(raw['-i']) as boolean | undefined,
      type: raw.type as string | undefined,
      head_limit: semanticToNumber(raw.head_limit) as number | undefined,
      offset: (semanticToNumber(raw.offset) as number | undefined) ?? 0,
      multiline: (semanticToBoolean(raw.multiline) as boolean | undefined) ??
        false,
    }
    const {
      pattern,
      path,
      glob,
      type,
      output_mode,
      '-B': context_before,
      '-A': context_after,
      '-C': context_c,
      context,
      '-n': raw_show_line_numbers,
      '-i': case_insensitive,
      head_limit,
      offset,
      multiline,
    } = input
    // 旧解构默认值 `'-n': show_line_numbers = true`（转换后应用，delta ②）
    const show_line_numbers = raw_show_line_numbers ?? true

    const absolutePath = path ? expandPath(path, getCwd()) : getCwd()
    const argsList = ['--hidden']

    // Exclude VCS directories to avoid noise from version control metadata
    for (const dir of VCS_DIRECTORIES_TO_EXCLUDE) {
      argsList.push('--glob', `!${dir}`)
    }

    // Limit line length to prevent base64/minified content from cluttering output
    argsList.push('--max-columns', '500')

    // Only apply multiline flags when explicitly requested
    if (multiline) {
      argsList.push('-U', '--multiline-dotall')
    }

    // Add optional flags
    if (case_insensitive) {
      argsList.push('-i')
    }

    // Add output mode flags
    if (output_mode === 'files_with_matches') {
      argsList.push('-l')
    } else if (output_mode === 'count') {
      argsList.push('-c')
    }

    // Add line numbers if requested
    if (show_line_numbers && output_mode === 'content') {
      argsList.push('-n')
    }

    // Add context flags (-C/context takes precedence over context_before/context_after)
    if (output_mode === 'content') {
      if (context !== undefined) {
        argsList.push('-C', context.toString())
      } else if (context_c !== undefined) {
        argsList.push('-C', context_c.toString())
      } else {
        if (context_before !== undefined) {
          argsList.push('-B', context_before.toString())
        }
        if (context_after !== undefined) {
          argsList.push('-A', context_after.toString())
        }
      }
    }

    // If pattern starts with dash, use -e flag to specify it as a pattern
    // This prevents ripgrep from interpreting it as a command-line option
    if (pattern.startsWith('-')) {
      argsList.push('-e', pattern)
    } else {
      argsList.push(pattern)
    }

    // Add type filter if specified
    if (type) {
      argsList.push('--type', type)
    }

    if (glob) {
      // Split on commas and spaces, but preserve patterns with braces
      const globPatterns: string[] = []
      const rawPatterns = glob.split(/\s+/)

      for (const rawPattern of rawPatterns) {
        // If pattern contains braces, don't split further
        if (rawPattern.includes('{') && rawPattern.includes('}')) {
          globPatterns.push(rawPattern)
        } else {
          // Split on commas for patterns without braces
          globPatterns.push(...rawPattern.split(',').filter(Boolean))
        }
      }

      for (const globPattern of globPatterns.filter(Boolean)) {
        argsList.push('--glob', globPattern)
      }
    }

    // Add ignore patterns
    const appState = ctx.getAppState()
    const ignorePatterns = normalizePatternsToPath(
      getFileReadIgnorePatterns(appState.toolPermissionContext),
      getCwd(),
    )
    for (const ignorePattern of ignorePatterns) {
      // Note: ripgrep only applies gitignore patterns relative to the working directory
      // So for non-absolute paths, we need to prefix them with '**'
      // See: https://github.com/BurntSushi/ripgrep/discussions/2156#discussioncomment-2316335
      //
      // We also need to negate the pattern with `!` to exclude it
      const rgIgnorePattern = ignorePattern.startsWith('/')
        ? `!${ignorePattern}`
        : `!**/${ignorePattern}`
      argsList.push('--glob', rgIgnorePattern)
    }

    // delta ⑨：getGlobExclusionsForPluginCache 孤儿插件排除循环裁（S-C2
    // globUtils 同裁先例；plugin 波物化时恢复）

    // WSL has severe performance penalty for file reads (3-5x slower on WSL2)
    // The timeout is handled by ripgrep itself via execFile timeout option
    // We don't use AbortController for timeout to avoid interrupting the agent loop
    // If ripgrep times out, it throws RipgrepTimeoutError which propagates up
    // so Claude knows the search didn't complete (rather than thinking there were no matches)
    const results = await ripGrep(argsList, absolutePath, ctx.abortController.signal)

    if (output_mode === 'content') {
      // For content mode, results are the actual content lines
      // Convert absolute paths to relative paths to save tokens

      // Apply head_limit first — relativize is per-line work, so
      // avoid processing lines that will be discarded (broad patterns can
      // return 10k+ lines with head_limit keeping only ~30-100).
      const { items: limitedResults, appliedLimit } = applyHeadLimit(
        results,
        head_limit,
        offset,
      )

      const finalLines = limitedResults.map(line => {
        // Lines have format: /absolute/path:line_content or /absolute/path:num:content
        const colonIndex = line.indexOf(':')
        if (colonIndex > 0) {
          const filePath = line.substring(0, colonIndex)
          const rest = line.substring(colonIndex)
          return toRelativePath(filePath) + rest
        }
        return line
      })
      const output: GrepOutput = {
        mode: 'content',
        numFiles: 0, // Not applicable for content mode
        filenames: [],
        content: finalLines.join('\n'),
        numLines: finalLines.length,
        ...(appliedLimit !== undefined && { appliedLimit }),
        ...(offset > 0 && { appliedOffset: offset }),
      }
      return { data: output }
    }

    if (output_mode === 'count') {
      // For count mode, pass through raw ripgrep output (filename:count format)
      // Apply head_limit first to avoid relativizing entries that will be discarded.
      const { items: limitedResults, appliedLimit } = applyHeadLimit(
        results,
        head_limit,
        offset,
      )

      // Convert absolute paths to relative paths to save tokens
      const finalCountLines = limitedResults.map(line => {
        // Lines have format: /absolute/path:count
        const colonIndex = line.lastIndexOf(':')
        if (colonIndex > 0) {
          const filePath = line.substring(0, colonIndex)
          const count = line.substring(colonIndex)
          return toRelativePath(filePath) + count
        }
        return line
      })

      // Parse count output to extract total matches and file count
      let totalMatches = 0
      let fileCount = 0
      for (const line of finalCountLines) {
        const colonIndex = line.lastIndexOf(':')
        if (colonIndex > 0) {
          const countStr = line.substring(colonIndex + 1)
          const count = parseInt(countStr, 10)
          if (!isNaN(count)) {
            totalMatches += count
            fileCount += 1
          }
        }
      }

      const output: GrepOutput = {
        mode: 'count',
        numFiles: fileCount,
        filenames: [],
        content: finalCountLines.join('\n'),
        numMatches: totalMatches,
        ...(appliedLimit !== undefined && { appliedLimit }),
        ...(offset > 0 && { appliedOffset: offset }),
      }
      return { data: output }
    }

    // For files_with_matches mode (default)
    // Use allSettled so a single ENOENT (file deleted between ripgrep's scan
    // and this stat) does not reject the whole batch. Failed stats sort as mtime 0.
    const stats = await Promise.allSettled(
      results.map(_ => getFsImplementation().stat(_)),
    )
    const sortedMatches = results
      // Sort by modification time
      .map((_, i) => {
        const r = stats[i]!
        return [
          _,
          r.status === 'fulfilled' ? (r.value.mtimeMs ?? 0) : 0,
        ] as const
      })
      .sort((a, b) => {
        if (process.env.NODE_ENV === 'test') {
          // In tests, we always want to sort by filename, so that results are deterministic
          return a[0].localeCompare(b[0])
        }
        const timeComparison = b[1] - a[1]
        if (timeComparison === 0) {
          // Sort by filename as a tiebreaker
          return a[0].localeCompare(b[0])
        }
        return timeComparison
      })
      .map(_ => _[0])

    // Apply head_limit to sorted file list (like "| head -N")
    const { items: finalMatches, appliedLimit } = applyHeadLimit(
      sortedMatches,
      head_limit,
      offset,
    )

    // Convert absolute paths to relative paths to save tokens
    const relativeMatches = finalMatches.map(toRelativePath)

    const output: GrepOutput = {
      mode: 'files_with_matches',
      filenames: relativeMatches,
      numFiles: relativeMatches.length,
      ...(appliedLimit !== undefined && { appliedLimit }),
      ...(offset > 0 && { appliedOffset: offset }),
    }

    return {
      data: output,
    }
  },
}
