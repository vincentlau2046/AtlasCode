/**
 * engine/tools/files — ReadTool 本体（§8.55 S-C5，高频族纵切子波 3）。
 *
 * 旧仓来源（a8af45b）：src/tools/FileReadTool/FileReadTool.ts 1063L 逐字随迁
 * （BLOCKED_DEVICE_PATHS/isBlockedDevicePath 13 条 + P-C5 探针锚点 / input
 * 4 字段（file_path/offset/limit/pages，offset/limit semantic 字符串容忍 =
 * call 入口转换）/ output 6 变体（text/image/notebook/pdf/parts/
 * file_unchanged）/ validateInput 5 决策支（pages errorCode 7·8 / deny 规则
 * 桩 ① / UNC skip / binary errorCode 4 / 阻断设备 errorCode 9）/ call
 * （dedup env 门 P-C2 + ENOENT 相似文件建议 + callInner 4 支：notebook/
 * image/PDF/text）/ mapToolResult 6 支 + CYBER_RISK_MITIGATION_REMINDER +
 * memory 新鲜度 WeakMap 侧通道 / MaxFileReadTokenExceededError /
 * registerFileReadListener 监听器面）。消费方 = `files/` 子门面 + `tools/`
 * 门面 re-export + 注册表 ⑰ 槽 Read 注入位（Glob/Grep 同槽恒注册）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，决策支逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema + zod outputSchema z.infer) → 新 shared
 *    Tool 契约：inputSchema = 纯 JSON schema 对象（READ_TOOL_INPUT_SCHEMA，
 *    S-B5/S-C4 先例）；旧 zod 数值约束（.int()/.nonnegative()/.positive()）
 *    不进 JSON schema（ToolInputJSONSchema 宽骨架面）；旧 output
 *    discriminatedUnion → TS 型 ReadOutput 承载文档面（引擎侧无 wire
 *    outputSchema 消费者，wire 面 = D 波前向接缝）。
 *  ② 旧 semanticNumber（zod z.preprocess 字符串数字容忍）→
 *    semanticToNumber call/render 入口运行时转换（S-C1/S-C4 先例，
 *    offset/limit 2 字段；模型面 JSON schema 仍 emit number）。
 *  ③ 新契约 description 面 = 旧 prompt() 体（limits-driven
 *    renderPromptTemplate，S-C4 GLOB_DESCRIPTION 先例：新 description =
 *    旧 prompt 面）；旧 description() 成员（短 DESCRIPTION 常量）无新契约
 *    消费者 → 裁（DESCRIPTION 常量留 readPrompt.ts 单一事实源，TUI 波前向
 *    接缝）。
 *  ④ 旧 buildTool TOOL_DEFAULTS 成员对象化：isConcurrencySafe true /
 *    isReadOnly true / isDestructive false（默认值逐值）/
 *    maxResultSizeChars Infinity（旧注释：output bounded by maxTokens，
 *    持久化再 Read 回读成循环 — never persist）/ strict true / searchHint
 *    'read files, images, PDFs, notebooks' / toAutoClassifierInput =
 *    input.file_path。userFacingName 旧生效值 = UI.tsx 3 支（Reading Plan /
 *    Read agent output / Read）→ 最小 'Read'（特殊支依赖 getPlansDirectory /
 *    agent-output-task 检测 = TUI 波残留守，裁，登记）。
 *  ⑤ checkPermissions = 一线接线 checkReadPermissionForTool（S-C4 Glob/Grep
 *    先例同语义固化；**P-C4/P-C5 族探针锚点**：matchingRuleForInput = 桩 ①
 *    → deny/allow 规则面不可观察，可观察判别 = 工作目录边界，规则求值波
 *    前向接缝）。
 *  ⑥ validateInput 第二参双站点兼容：旧 buildTool 站点传全 ToolUseContext，
 *    新引擎 dispatch 站点（toolExecution.ts:228）传 { signal } 最小面 —
 *    context 有 getAppState → 取 toolPermissionContext 走
 *    matchingRuleForInput（桩 ① 恒 null，规则求值波前向接缝）；无
 *    （引擎 dispatch 站点）→ 跳过 deny 检查（桩 ① 恒 null，零可观察 delta）。
 *  ⑦ 旧遥测空块（L465-468，事件删除后块骨架残留）裁（新仓无遥测基础设施，
 *    旧仓遥测全删 879 点先例一致）。
 *  ⑧ 旧 call 5 参声明 → 2 参声明（canUseTool/parentMessage/onProgress 旧体
 *    不消费，裁；callInner 死参 messageId（声明但体不消费）随之裁，零行为；
 *    S-B5 delta ⑩ 先例）。text 支未消费解构（totalBytes/readBytes）随之裁。
 *  ⑨ 旧 GrowthBook 'atlas_read_dedup_killswitch' → env 门
 *    ATLAS_DISABLE_READ_DEDUP（新仓无 GrowthBook 基础设施，cronJitterConfig
 *    整砍先例 §8.47 + isEnvTruthy 单一事实源）：设真 = dedup 关闭（kill-
 *    switch 语义保留：旧 GB 默认 false = dedup 启用 → env 缺省 = dedup
 *    启用）。**P-C2 探针锚点**：同 range 重读返 file_unchanged 桩 / env
 *    突变后返全量内容 = 恰 1 红。
 *  ⑩ skills discovery 面（discoverSkillDirsForPaths/addSkillDirectories/
 *    activateConditionalSkillsForPaths 3 函数 + ATLAS_SIMPLE 门 +
 *    context.dynamicSkillDirTriggers 消费面）裁（skills 域未随迁，skills
 *    域波/D 波前向接缝）。
 *  ⑪ countTokensWithAPI（API 精确 token 计数，网络面）裁 →
 *    validateContentTokens 保留 estimate-only 支（roughTokenCountEstimation
 *    ForFileType estimate > maxTokens/4 时以 estimate 直接判定；旧 API
 *    精确校正支 = D 波前向接缝，modelprovider 域）。
 *    MaxFileReadTokenExceededError 逐字。
 *  ⑫ D-3 图像面（bashUtils delta ② 先例 §8.54 ⑥ 登记）：imageResizer 族
 *    （maybeResizeAndDownsampleImageBuffer/detectImageFormatFromBuffer/
 *    compressImageBufferWithTokenLimit/ImageResizeError/sharp fallback）不
 *    随迁 → readImageWithTokenBudget 裁为域内最小形（单读 + 原始 base64 +
 *    ext→MIME 映射；无 resize/downsample/压缩，无 dimensions →
 *    createImageMetadataText 面随之裁 → image 支 newMessages 恒不产生；PDF
 *    pages 支 image 块无 downsample（原始 jpg buffer base64，media_type
 *    恒 image/jpeg）；旧 readFileBytes 2 参 maxBytes 调用点实传 undefined →
 *    新 1 参面零行为差）。旧导出 readImageWithTokenBudget（sharp fallback
 *    全量 87L）不随迁（截图粘贴面 = D 波/UI 渲染波残留守）。
 *  ⑬ 旧 memdir/memoryAge.ts mtimeMs 4 函数族 → 域内 ./memoryFreshness
 *    （纯函数逐字随迁，delta 头注见该文件；新仓 src/memory/memoryAge.ts =
 *    filePath 基同名异语义变体，共存无冲突）。
 *  ⑭ readFileState = duck（旧 FileStateCache LRU 100 条/25MB 驱逐不随迁 —
 *    新仓无 lru-cache 依赖；缓存实例创建 = 组合根/D 波责任（旧 per-session
 *    FileStateCache），工具面仅消费 get/set duck，Map 即满足）。duck 成员
 *    可选（引擎侧注入位未落，组合根/D 波接线）：readFileState 缺省时 dedup
 *    面跳过（无状态可比 → 全量读，行为 = dedup 引入前基线）；
 *    nestedMemoryAttachmentTriggers?/fileReadingLimits? 可选成员保留（旧
 *    调用点全 ?. 可选链，零崩溃面）。
 *  ⑮ getAlternateScreenshotPath（macOS thin-space U+202F AM/PM 变体）逐字
 *    保留（平台中立纯函数，无外部依赖）。
 *  ⑯ 旧 UI.tsx 184L（React 渲染族）不随迁 = TUI 波残留守；renderToolUse-
 *    Message 文本面模板逐字随迁（旧 JSX → 字符串拼接，getDisplayPath 消费
 *    同域 ./fileUtils；契约 options {theme,verbose,commands?} 仅消费
 *    verbose；render 入口 offset/limit 同 call 入口需 semantic 转换，delta ②）；
 *    agent-output-task 支（getTaskOutputDir 跨域 task 边）裁（TUI 波残留守）；
 *    renderToolUseTag/renderToolResultMessage/renderToolUseErrorMessage
 *    （React 面）裁。getToolUseSummary/getActivityDescription（UI/进度面）
 *    不在新 Tool 契约 → 裁（S-C4 ⑦ 先例）。
 *  ⑰ 旧 backfillObservableInput（expandPath file_path，hooks.mdx allowlist
 *    绕过守卫 ~ / 相对路径）无新契约消费者 → 裁（hooks 面前向接缝，D 波/
 *    真 ToolUseContext 残留守）；preparePermissionMatcher（matchWildcard-
 *    Pattern）/ isSearchOrReadCommand（gate 侧分类面）裁（S-C4 ⑧ 先例，
 *    auto-mode 波 C 桶 ② / gate 侧前向接缝）。
 *  ⑱ 旧仓 strict tsconfig 下 `if (!x.success)` 负支判别缩窄成立 → 新仓
 *    tsconfig strict:false（S-7d M-1 同源环境）布尔判别位取反**不缩窄**
 *    （TS2339 实测）→ 两处 PDF 错误支改显式 `x.success === false` 比较
 *    （比较式负支缩窄严格/非严格均成立，零行为差；truthy 正支不受影响）。
 *    **仓级坑**：后续纵切遇 tagged-union 判别位负支判定一律用 === 比较
 *    式（S-C6 Write+Edit 及后续波预登记）。
 *
 * 残留守（防「以为已全」）：真 ToolUseContext 全字段面 / UI React 渲染面 /
 * skills 域面 / imageResizer 面 / countTokensWithAPI 面 / readFileState LRU
 * 缓存实例 = 残留守（D 波/TUI 波/skills 域波）。
 */
import { readdir, readFile as readFileAsync } from 'fs/promises'
import * as path from 'path'
import type {
  Tool,
  ToolInputJSONSchema,
  ToolPermissionContext,
  ToolResult,
  ToolResultBlockParam,
  ValidationResult,
  PermissionDecision,
} from '../../../shared'
import {
  expandPath,
  formatFileSize,
  getErrnoCode,
  getFsImplementation,
  isEnvTruthy,
  isENOENT,
  roughTokenCountEstimationForFileType,
} from '../../../shared'
import {
  checkReadPermissionForTool,
  matchingRuleForInput,
} from '../../../permissions'
import { getCwd } from '../../../bootstrap'
import { jsonStringify } from '../../session/json'
import { isAutoMemFile, readFileInRange } from '../../../memory'
import { BASH_TOOL_NAME, FILE_READ_TOOL_NAME } from '../toolNames'
import {
  PDF_AT_MENTION_INLINE_THRESHOLD,
  PDF_EXTRACT_SIZE_THRESHOLD,
  PDF_MAX_PAGES_PER_READ,
} from './apiLimits'
import { hasBinaryExtension } from './binaryExtensions'
import {
  FILE_UNCHANGED_STUB,
  LINE_FORMAT_INSTRUCTION,
  OFFSET_INSTRUCTION_DEFAULT,
  OFFSET_INSTRUCTION_TARGETED,
  renderPromptTemplate,
} from './readPrompt'
import { getDefaultFileReadingLimits } from './readFileLimits'
import {
  addLineNumbers,
  FILE_NOT_FOUND_CWD_NOTE,
  findSimilarFile,
  getFileModificationTimeAsync,
  getDisplayPath,
  suggestPathUnderCwd,
} from './fileUtils'
import {
  isPDFExtension,
  isPDFSupported,
  parsePDFPageRange,
} from './pdfUtils'
import { extractPDFPages, getPDFPageCount, readPDF } from './pdf'
import {
  mapNotebookCellsToToolResult,
  readNotebook,
} from './notebook'
import { memoryFreshnessNote } from './memoryFreshness'
import { getCanonicalModelName, getMainLoopModelName } from './modelRef'
import { semanticToNumber } from './semantic'
import { createUserMessage } from './userMessage'
import type {
  FilesToolUseContext,
  ReadFileState,
  ReadToolInput,
} from './filesToolInput'

// Device files that would hang the process: infinite output or blocking input.
// Checked by path only (no I/O). Safe devices like /dev/null are intentionally omitted.
const BLOCKED_DEVICE_PATHS = new Set([
  // Infinite output — never reach EOF
  '/dev/zero',
  '/dev/random',
  '/dev/urandom',
  '/dev/full',
  // Blocks waiting for input
  '/dev/stdin',
  '/dev/tty',
  '/dev/console',
  // Nonsensical to read
  '/dev/stdout',
  '/dev/stderr',
  // fd aliases for stdin/stdout/stderr
  '/dev/fd/0',
  '/dev/fd/1',
  '/dev/fd/2',
])

function isBlockedDevicePath(filePath: string): boolean {
  if (BLOCKED_DEVICE_PATHS.has(filePath)) return true
  // /proc/self/fd/0-2 and /proc/<pid>/fd/0-2 are Linux aliases for stdio
  if (
    filePath.startsWith('/proc/') &&
    (filePath.endsWith('/fd/0') ||
      filePath.endsWith('/fd/1') ||
      filePath.endsWith('/fd/2'))
  )
    return true
  return false
}

// Narrow no-break space (U+202F) used by some macOS versions in screenshot filenames
const THIN_SPACE = String.fromCharCode(8239)

/**
 * For macOS screenshot paths with AM/PM, the space before AM/PM may be a
 * regular space or a thin space depending on the macOS version.  Returns
 * the alternate path to try if the original doesn't exist, or undefined.
 */
function getAlternateScreenshotPath(filePath: string): string | undefined {
  const filename = path.basename(filePath)
  const amPmPattern = /^(.+)([ \u202F])(AM|PM)(\.png)$/
  const match = filename.match(amPmPattern)
  if (!match) return undefined

  const currentSpace = match[2]
  const alternateSpace = currentSpace === ' ' ? THIN_SPACE : ' '
  return filePath.replace(
    `${currentSpace}${match[3]}${match[4]}`,
    `${alternateSpace}${match[3]}${match[4]}`,
  )
}

// File read listeners - allows other services to be notified when files are read
type FileReadListener = (filePath: string, content: string) => void
const fileReadListeners: FileReadListener[] = []

export function registerFileReadListener(
  listener: FileReadListener,
): () => void {
  fileReadListeners.push(listener)
  return () => {
    const i = fileReadListeners.indexOf(listener)
    if (i >= 0) fileReadListeners.splice(i, 1)
  }
}

export class MaxFileReadTokenExceededError extends Error {
  constructor(
    public tokenCount: number,
    public maxTokens: number,
  ) {
    super(
      `File content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.`,
    )
    this.name = 'MaxFileReadTokenExceededError'
  }
}

// Common image extensions
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

/**
 * 输入 JSON schema（旧仓 zod inputSchema 逐字段转写，delta ①/②；与
 * ReadToolInput duck 型单一事实源逐字段对齐）。
 */
export const READ_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description: 'The absolute path to the file to read',
    },
    offset: {
      type: 'number',
      description:
        'The line number to start reading from. Only provide if the file is too large to read at once',
    },
    limit: {
      type: 'number',
      description:
        'The number of lines to read. Only provide if the file is too large to read at once.',
    },
    pages: {
      type: 'string',
      description: `Page range for PDF files (e.g., "1-5", "3", "10-20"). Only applicable to PDF files. Maximum ${PDF_MAX_PAGES_PER_READ} pages per request.`,
    },
  },
  required: ['file_path'],
}

/** 旧 zod outputSchema z.infer 6 变体型（delta ① TS 型承载）。 */
export type ReadOutput =
  | {
      type: 'text'
      file: {
        filePath: string
        content: string
        numLines: number
        startLine: number
        totalLines: number
      }
    }
  | {
      type: 'image'
      file: {
        base64: string
        type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
        originalSize: number
        dimensions?: {
          originalWidth?: number
          originalHeight?: number
          displayWidth?: number
          displayHeight?: number
        }
      }
    }
  | {
      type: 'notebook'
      file: {
        filePath: string
        cells: unknown[]
      }
    }
  | {
      type: 'pdf'
      file: {
        filePath: string
        base64: string
        originalSize: number
      }
    }
  | {
      type: 'parts'
      file: {
        filePath: string
        originalSize: number
        count: number
        outputDir: string
      }
    }
  | {
      type: 'file_unchanged'
      file: {
        filePath: string
      }
    }

type ImageResult = Extract<ReadOutput, { type: 'image' }>

// ext→MIME 映射（delta ⑫：旧 detectImageFormatFromBuffer magic-number 面
// 不随迁；IMAGE_EXTENSIONS 门控下 ext 恒 ∈ 5 值，映射无越界）。
const EXT_MEDIA_TYPE: Record<
  string,
  ImageResult['file']['type']
> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/**
 * D-3 裁剪形（delta ⑫）：旧 readImageWithTokenBudget（imageResizer 族
 * resize/downsample/压缩 + sharp fallback 87L）→ 域内最小面：单读（新
 * readFileBytes 1 参面，旧 2 参 maxBytes 调用点实传 undefined → 零行为差）
 * + 原始 base64 + ext→MIME 映射。无 resize/downsample/压缩（token 预算超支
 * 面 = D 波前向接缝），无 dimensions（createImageMetadataText 面随之裁）。
 */
async function readImageWithTokenBudget(
  filePath: string,
): Promise<ImageResult> {
  const imageBuffer = await getFsImplementation().readFileBytes(filePath)
  const originalSize = imageBuffer.length

  if (originalSize === 0) {
    throw new Error(`Image file is empty: ${filePath}`)
  }

  const ext = path.extname(filePath).toLowerCase().slice(1)
  const mediaType = EXT_MEDIA_TYPE[ext] ?? 'image/png'

  return {
    type: 'image',
    file: {
      base64: imageBuffer.toString('base64'),
      type: mediaType,
      originalSize,
    },
  }
}

// Tool 契约非参数化（Input 泛参位 = JSON schema 对象型，非 duck 输入型，
// S-B5/S-C4 先例）；face 扩型 = getPath（PermissionTool duck 成员，
// excess-property 面显式声明）+ checkPermissions 返回型收窄 Promise<
// PermissionDecision>（契约位 Promise<unknown> 不满足 PermissionTool
// 目标型 Promise<PermissionResult>，扩型收窄 = checkReadPermissionForTool
// 直接传值免 cast）。
type ReadToolFace = Tool & {
  getPath(input: Record<string, unknown>): string
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision>
}

export const ReadTool: ReadToolFace = {
  name: FILE_READ_TOOL_NAME,
  inputSchema: READ_TOOL_INPUT_SCHEMA,
  inputJSONSchema: READ_TOOL_INPUT_SCHEMA,
  searchHint: 'read files, images, PDFs, notebooks',
  // Output is bounded by maxTokens (validateContentTokens). Persisting to a
  // file the model reads back with Read is circular — never persist.
  maxResultSizeChars: Infinity,
  strict: true,
  isEnabled: () => true,
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ④，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) =>
    (input as ReadToolInput).file_path,
  // delta ④：旧生效值 = UI.tsx 3 支（Reading Plan / Read agent output /
  // Read）→ 最小 'Read'（特殊支 TUI 波残留守，登记）
  userFacingName: () => 'Read',
  getPath(input: Record<string, unknown>): string {
    const { file_path } = input as unknown as ReadToolInput
    return file_path || getCwd()
  },
  async description(): Promise<string> {
    // delta ③：新契约唯一 prompt 面 = 旧 prompt() 体（limits-driven）
    const limits = getDefaultFileReadingLimits()
    const maxSizeInstruction = limits.includeMaxSizeInPrompt
      ? `. Files larger than ${formatFileSize(limits.maxSizeBytes)} will return an error; use offset and limit for larger files`
      : ''
    const offsetInstruction = limits.targetedRangeNudge
      ? OFFSET_INSTRUCTION_TARGETED
      : OFFSET_INSTRUCTION_DEFAULT
    return renderPromptTemplate(
      pickLineFormatInstruction(),
      maxSizeInstruction,
      offsetInstruction,
    )
  },
  async validateInput(
    input: unknown,
    context: unknown,
  ): Promise<ValidationResult> {
    const { file_path, pages } = input as ReadToolInput
    // Validate pages parameter (pure string parsing, no I/O)
    if (pages !== undefined) {
      const parsed = parsePDFPageRange(pages)
      if (!parsed) {
        return {
          result: false,
          message: `Invalid pages parameter: "${pages}". Use formats like "1-5", "3", or "10-20". Pages are 1-indexed.`,
          errorCode: 7,
        }
      }
      const rangeSize =
        parsed.lastPage === Infinity
          ? PDF_MAX_PAGES_PER_READ + 1
          : parsed.lastPage - parsed.firstPage + 1
      if (rangeSize > PDF_MAX_PAGES_PER_READ) {
        return {
          result: false,
          message: `Page range "${pages}" exceeds maximum of ${PDF_MAX_PAGES_PER_READ} pages per request. Please use a smaller range.`,
          errorCode: 8,
        }
      }
    }

    // Path expansion + deny rule check (no I/O)
    const fullFilePath = expandPath(file_path, getCwd())

    // delta ⑥：双站点兼容（引擎 dispatch 站点 { signal } 最小面无
    // getAppState → 跳过 deny 检查；matchingRuleForInput 桩 ① 恒 null，
    // 零可观察 delta，规则求值波前向接缝）
    const ctx = context as {
      getAppState?: () => { toolPermissionContext: ToolPermissionContext }
    } | undefined
    const appState = ctx?.getAppState?.()
    const denyRule = appState
      ? matchingRuleForInput(
          fullFilePath,
          appState.toolPermissionContext,
          'read',
          'deny',
        )
      : null
    if (denyRule !== null) {
      return {
        result: false,
        message:
          'File is in a directory that is denied by your permission settings.',
        errorCode: 1,
      }
    }

    // SECURITY: UNC path check (no I/O) — defer filesystem operations
    // until after user grants permission to prevent NTLM credential leaks
    const isUncPath =
      fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//')
    if (isUncPath) {
      return { result: true }
    }

    // Binary extension check (string check on extension only, no I/O).
    // PDF, images, and SVG are excluded - this tool renders them natively.
    const ext = path.extname(fullFilePath).toLowerCase()
    if (
      hasBinaryExtension(fullFilePath) &&
      !isPDFExtension(ext) &&
      !IMAGE_EXTENSIONS.has(ext.slice(1))
    ) {
      return {
        result: false,
        message: `This tool cannot read binary files. The file appears to be a binary ${ext} file. Please use appropriate tools for binary file analysis.`,
        errorCode: 4,
      }
    }

    // Block specific device files that would hang (infinite output or blocking input).
    // This is a path-based check with no I/O — safe special files like /dev/null are allowed.
    if (isBlockedDevicePath(fullFilePath)) {
      return {
        result: false,
        message: `Cannot read '${file_path}': this device file would block or produce infinite output.`,
        errorCode: 9,
      }
    }

    return { result: true }
  },
  async checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision> {
    const appState = (context as FilesToolUseContext).getAppState()
    return checkReadPermissionForTool(
      ReadTool,
      input as Record<string, unknown>,
      appState.toolPermissionContext,
    )
  },
  // delta ⑯：文本面逐字随迁（旧 UI.tsx 非 React 模板；TUI React 面残留守；
  // render 入口 offset/limit semantic 转换，delta ②）
  renderToolUseMessage(input: unknown, options: { verbose: boolean }): unknown {
    const raw = input as ReadToolInput
    const { file_path, pages } = raw
    const offset = semanticToNumber(raw.offset) as number | undefined
    const limit = semanticToNumber(raw.limit) as number | undefined
    if (!file_path) {
      return null
    }
    // delta ⑯：agent-output-task 支（getTaskOutputDir 跨域 task 边）裁（TUI 波）
    const displayPath = options.verbose ? file_path : getDisplayPath(file_path)
    if (pages) {
      return `${displayPath} · pages ${pages}`
    }
    if (options.verbose && (offset || limit)) {
      const startLine = offset ?? 1
      const lineRange = limit
        ? `lines ${startLine}-${startLine + limit - 1}`
        : `from line ${startLine}`
      return `${displayPath} · ${lineRange}`
    }
    return displayPath
  },
  // UI.tsx:140 — ALL types render summary chrome only: "Read N lines",
  // "Read image (42KB)". Never the content itself. The model-facing
  // serialization (below) sends content + CYBER_RISK_MITIGATION_REMINDER
  // + line prefixes; UI shows none of it. Nothing to index. Caught by
  // the render-fidelity test when this initially claimed file.content.
  extractSearchText(): string {
    return ''
  },
  // delta ⑧：call 2 参声明（旧 canUseTool/parentMessage/onProgress 不消费裁）
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<ReadOutput>> {
    const raw = (args ?? {}) as ReadToolInput
    const { file_path, pages } = raw
    // delta ②：semantic 字符串数字容忍 = 入口运行时转换（S-C1/S-C4 先例）
    const offset = (semanticToNumber(raw.offset) as number | undefined) ?? 1
    const limit = semanticToNumber(raw.limit) as number | undefined
    const ctx = (context ?? {}) as FilesToolUseContext
    const { readFileState, fileReadingLimits } = ctx

    const defaults = getDefaultFileReadingLimits()
    const maxSizeBytes =
      fileReadingLimits?.maxSizeBytes ?? defaults.maxSizeBytes
    const maxTokens = fileReadingLimits?.maxTokens ?? defaults.maxTokens

    const ext = path.extname(file_path).toLowerCase().slice(1)
    // Use expandPath for consistent path normalization with FileEditTool/FileWriteTool
    // (especially handles whitespace trimming and Windows path separators)
    const fullFilePath = expandPath(file_path, getCwd())

    // Dedup: if we've already read this exact range and the file hasn't
    // changed on disk, return a stub instead of re-sending the full content.
    // The earlier Read tool_result is still in context — two full copies
    // waste cache_creation tokens on every subsequent turn. BQ proxy shows
    // ~18% of Read calls are same-file collisions (up to 2.64% of fleet
    // cache_creation). Only applies to text/notebook reads — images/PDFs
    // aren't cached in readFileState so won't match here.
    //
    // Ant soak: 1,734 dedup hits in 2h, no Read error regression.
    // Killswitch pattern: env ATLAS_DISABLE_READ_DEDUP (delta ⑨) can disable
    // if the stub message confuses the model externally.
    // Default: killswitch off = dedup enabled. Client-side only — no
    // server support needed.
    // P-C2 探针锚点：dedup 命中返 file_unchanged / env 设真后返全量内容。
    const dedupKillswitch = isEnvTruthy(process.env.ATLAS_DISABLE_READ_DEDUP)
    const existingState =
      dedupKillswitch || !readFileState
        ? undefined
        : readFileState.get(fullFilePath)
    // Only dedup entries that came from a prior Read (offset is always set
    // by Read). Edit/Write store offset=undefined — their readFileState
    // entry reflects post-edit mtime, so deduping against it would wrongly
    // point the model at the pre-edit Read content.
    if (
      existingState &&
      !existingState.isPartialView &&
      existingState.offset !== undefined
    ) {
      const rangeMatch =
        existingState.offset === offset && existingState.limit === limit
      if (rangeMatch) {
        try {
          const mtimeMs = await getFileModificationTimeAsync(fullFilePath)
          if (mtimeMs === existingState.timestamp) {
            return {
              data: {
                type: 'file_unchanged' as const,
                file: { filePath: file_path },
              },
            }
          }
        } catch {
          // stat failed — fall through to full read
        }
      }
    }

    // delta ⑩：skills discovery 面裁（skills 域未随迁，前向接缝登记）

    try {
      return await callInner(
        file_path,
        fullFilePath,
        fullFilePath,
        ext,
        offset,
        limit,
        pages,
        maxSizeBytes,
        maxTokens,
        readFileState,
        ctx,
      )
    } catch (error) {
      // Handle file-not-found: suggest similar files
      const code = getErrnoCode(error)
      if (code === 'ENOENT') {
        // macOS screenshots may use a thin space or regular space before
        // AM/PM — try the alternate before giving up.
        const altPath = getAlternateScreenshotPath(fullFilePath)
        if (altPath) {
          try {
            return await callInner(
              file_path,
              fullFilePath,
              altPath,
              ext,
              offset,
              limit,
              pages,
              maxSizeBytes,
              maxTokens,
              readFileState,
              ctx,
            )
          } catch (altError) {
            if (!isENOENT(altError)) {
              throw altError
            }
            // Alt path also missing — fall through to friendly error
          }
        }

        const similarFilename = findSimilarFile(fullFilePath)
        const cwdSuggestion = await suggestPathUnderCwd(fullFilePath)
        let message = `File does not exist. ${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}.`
        if (cwdSuggestion) {
          message += ` Did you mean ${cwdSuggestion}?`
        } else if (similarFilename) {
          message += ` Did you mean ${similarFilename}?`
        }
        throw new Error(message)
      }
      throw error
    }
  },
  mapToolResultToToolResultBlockParam(
    data: ReadOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    switch (data.type) {
      case 'image': {
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                data: data.file.base64,
                media_type: data.file.type,
              },
            },
          ],
        }
      }
      case 'notebook':
        return mapNotebookCellsToToolResult(data.file.cells, toolUseID)
      case 'pdf':
        // Return PDF metadata only - the actual content is sent as a supplemental DocumentBlockParam
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `PDF file read: ${data.file.filePath} (${formatFileSize(data.file.originalSize)})`,
        }
      case 'parts':
        // Extracted page images are read and sent as image blocks in mapToolResultToAPIMessage
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `PDF pages extracted: ${data.file.count} page(s) from ${data.file.filePath} (${formatFileSize(data.file.originalSize)})`,
        }
      case 'file_unchanged':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: FILE_UNCHANGED_STUB,
        }
      case 'text': {
        let content: string

        if (data.file.content) {
          content =
            memoryFileFreshnessPrefix(data) +
            formatFileLines(data.file) +
            (shouldIncludeFileReadMitigation()
              ? CYBER_RISK_MITIGATION_REMINDER
              : '')
        } else {
          // Determine the appropriate warning message
          content =
            data.file.totalLines === 0
              ? '<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>'
              : `<system-reminder>Warning: the file exists but is shorter than the provided offset (${data.file.startLine}). The file has ${data.file.totalLines} lines.</system-reminder>`
        }

        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content,
        }
      }
    }
  },
}

function pickLineFormatInstruction(): string {
  return LINE_FORMAT_INSTRUCTION
}

/** Format file content with line numbers. */
function formatFileLines(file: { content: string; startLine: number }): string {
  return addLineNumbers(file)
}

export const CYBER_RISK_MITIGATION_REMINDER =
  '\n\n<system-reminder>\nWhenever you read a file, you should consider whether it would be considered malware. You CAN and SHOULD provide analysis of malware, what it is doing. But you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer questions about the code behavior.\n</system-reminder>\n'

// Models where cyber risk mitigation should be skipped
const MITIGATION_EXEMPT_MODELS = new Set(['claude-opus-4-6'])

function shouldIncludeFileReadMitigation(): boolean {
  const shortName = getCanonicalModelName(getMainLoopModelName())
  return !MITIGATION_EXEMPT_MODELS.has(shortName)
}

/**
 * Side-channel from call() to mapToolResultToToolResultBlockParam: mtime
 * of auto-memory files, keyed by the `data` object identity. Avoids
 * adding a presentation-only field to the output schema (which flows
 * into SDK types) and avoids sync fs in the mapper. WeakMap auto-GCs
 * when the data object becomes unreachable after rendering.
 */
const memoryFileMtimes = new WeakMap<object, number>()

function memoryFileFreshnessPrefix(data: object): string {
  const mtimeMs = memoryFileMtimes.get(data)
  if (mtimeMs === undefined) return ''
  return memoryFreshnessNote(mtimeMs)
}

async function validateContentTokens(
  content: string,
  ext: string,
  maxTokens?: number,
): Promise<void> {
  const effectiveMaxTokens =
    maxTokens ?? getDefaultFileReadingLimits().maxTokens

  const tokenEstimate = roughTokenCountEstimationForFileType(content, ext)
  if (!tokenEstimate || tokenEstimate <= effectiveMaxTokens / 4) return

  // delta ⑪：countTokensWithAPI（API 精确计数）裁 → estimate-only
  // （D 波前向接缝，modelprovider 域）
  const effectiveCount = tokenEstimate

  if (effectiveCount > effectiveMaxTokens) {
    throw new MaxFileReadTokenExceededError(effectiveCount, effectiveMaxTokens)
  }
}

/**
 * Inner implementation of call, separated to allow ENOENT handling in the outer call.
 * delta ⑧：旧 messageId 死参（声明但体不消费）裁。
 */
async function callInner(
  file_path: string,
  fullFilePath: string,
  resolvedFilePath: string,
  ext: string,
  offset: number,
  limit: number | undefined,
  pages: string | undefined,
  maxSizeBytes: number,
  maxTokens: number,
  readFileState: ReadFileState | undefined,
  context: FilesToolUseContext,
): Promise<{
  data: ReadOutput
  newMessages?: ReturnType<typeof createUserMessage>[]
}> {
  // --- Notebook ---
  if (ext === 'ipynb') {
    const cells = await readNotebook(resolvedFilePath)
    const cellsJson = jsonStringify(cells)

    const cellsJsonBytes = Buffer.byteLength(cellsJson)
    if (cellsJsonBytes > maxSizeBytes) {
      throw new Error(
        `Notebook content (${formatFileSize(cellsJsonBytes)}) exceeds maximum allowed size (${formatFileSize(maxSizeBytes)}). ` +
          `Use ${BASH_TOOL_NAME} with jq to read specific portions:\n` +
          `  cat "${file_path}" | jq '.cells[:20]' # First 20 cells\n` +
          `  cat "${file_path}" | jq '.cells[100:120]' # Cells 100-120\n` +
          `  cat "${file_path}" | jq '.cells | length' # Count total cells\n` +
          `  cat "${file_path}" | jq '.cells[] | select(.cell_type=="code") | .source' # All code sources`,
      )
    }

    await validateContentTokens(cellsJson, ext, maxTokens)

    // Get mtime via async stat (single call, no prior existence check)
    const stats = await getFsImplementation().stat(resolvedFilePath)
    readFileState?.set(fullFilePath, {
      content: cellsJson,
      timestamp: Math.floor(stats.mtimeMs),
      offset,
      limit,
    })
    context.nestedMemoryAttachmentTriggers?.add(fullFilePath)

    const data = {
      type: 'notebook' as const,
      file: { filePath: file_path, cells },
    }

    return { data }
  }

  // --- Image (single read, no double-read) ---
  if (IMAGE_EXTENSIONS.has(ext)) {
    // Images have their own size limits (token budget + compression) —
    // don't apply the text maxSizeBytes cap.
    // delta ⑫：D-3 裁剪形（无 resize/downsample/压缩/dimensions）
    const data = await readImageWithTokenBudget(resolvedFilePath)
    context.nestedMemoryAttachmentTriggers?.add(fullFilePath)

    // delta ⑫：dimensions/createImageMetadataText 面裁 → newMessages 恒不产生
    return { data }
  }

  // --- PDF ---
  if (isPDFExtension(ext)) {
    if (pages) {
      const parsedRange = parsePDFPageRange(pages)
      const extractResult = await extractPDFPages(
        resolvedFilePath,
        parsedRange ?? undefined,
      )
      // 非严格 tsconfig（strict:false）下布尔判别位取反不缩窄 → 显式
      // === false 比较（truthy 正支 L960 不受影响，负支须比较式）
      if (extractResult.success === false) {
        throw new Error(extractResult.error.message)
      }
      const entries = await readdir(extractResult.data.file.outputDir)
      const imageFiles = entries.filter(f => f.endsWith('.jpg')).sort()
      // delta ⑫：imageResizer 不随迁 → image 块无 downsample（原始
      // jpg buffer base64，media_type 恒 image/jpeg）
      const imageBlocks = await Promise.all(
        imageFiles.map(async f => {
          const imgPath = path.join(extractResult.data.file.outputDir, f)
          const imgBuffer = await readFileAsync(imgPath)
          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: 'image/jpeg' as const,
              data: imgBuffer.toString('base64'),
            },
          }
        }),
      )
      return {
        data: extractResult.data,
        ...(imageBlocks.length > 0 && {
          newMessages: [
            createUserMessage({ content: imageBlocks, isMeta: true }),
          ],
        }),
      }
    }

    const pageCount = await getPDFPageCount(resolvedFilePath)
    if (pageCount !== null && pageCount > PDF_AT_MENTION_INLINE_THRESHOLD) {
      throw new Error(
        `This PDF has ${pageCount} pages, which is too many to read at once. ` +
          `Use the pages parameter to read specific page ranges (e.g., pages: "1-5"). ` +
          `Maximum ${PDF_MAX_PAGES_PER_READ} pages per request.`,
      )
    }

    const fs = getFsImplementation()
    const stats = await fs.stat(resolvedFilePath)
    const shouldExtractPages =
      !isPDFSupported() || stats.size > PDF_EXTRACT_SIZE_THRESHOLD

    if (shouldExtractPages) {
      const extractResult = await extractPDFPages(resolvedFilePath)
      if (extractResult.success) {
        // verbatim no-op（旧仓 L886-887 两支均空，结果丢弃：parts 数据
        // 不在此路径返回，parts 输出仅经 pages 参面）
      } else {
        // verbatim no-op（同上）
      }
    }

    if (!isPDFSupported()) {
      throw new Error(
        'Reading full PDFs is not supported with this model. Use a newer model (Sonnet 3.5 v2 or later), ' +
          `or use the pages parameter to read specific page ranges (e.g., pages: "1-5", maximum ${PDF_MAX_PAGES_PER_READ} pages per request). ` +
          'Page extraction requires poppler-utils: install with `brew install poppler` on macOS or `apt-get install poppler-utils` on Debian/Ubuntu.',
      )
    }

    const readResult = await readPDF(resolvedFilePath)
    // 同 L913 注：非严格 tsconfig 下负支须显式 === false 比较
    if (readResult.success === false) {
      throw new Error(readResult.error.message)
    }
    const pdfData = readResult.data
    return {
      data: pdfData,
      newMessages: [
        createUserMessage({
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfData.file.base64,
              },
            },
          ],
          isMeta: true,
        }),
      ],
    }
  }

  // --- Text file (single async read via readFileInRange) ---
  const lineOffset = offset === 0 ? 0 : offset - 1
  const { content, lineCount, totalLines, mtimeMs } = await readFileInRange(
    resolvedFilePath,
    lineOffset,
    limit,
    limit === undefined ? maxSizeBytes : undefined,
    context.abortController.signal,
  )

  await validateContentTokens(content, ext, maxTokens)

  readFileState?.set(fullFilePath, {
    content,
    timestamp: Math.floor(mtimeMs),
    offset,
    limit,
  })
  context.nestedMemoryAttachmentTriggers?.add(fullFilePath)

  // Snapshot before iterating — a listener that unsubscribes mid-callback
  // would splice the live array and skip the next listener.
  for (const listener of fileReadListeners.slice()) {
    listener(resolvedFilePath, content)
  }

  const data = {
    type: 'text' as const,
    file: {
      filePath: file_path,
      content,
      numLines: lineCount,
      startLine: offset,
      totalLines,
    },
  }
  if (isAutoMemFile(fullFilePath)) {
    memoryFileMtimes.set(data, mtimeMs)
  }

  return { data }
}
