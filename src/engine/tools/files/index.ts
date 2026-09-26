/**
 * engine/tools/files 子门面（§8.55 S-C5，STR-1 显式名块纪律）。
 *
 * 覆盖 S-C1（依赖闭包层 1：fileUtils/fileRead/fileReadCache/diffUtils/
 * semantic/apiLimits/modelRef/fileEditTypes）+ S-C2（依赖闭包层 2：
 * globIgnorePatterns/globUtils）+ S-C3（pdf/notebook 族：pdf/pdfUtils/
 * notebook/notebookTypes/execFileNoThrow）+ S-C4（Glob/Grep 本体：
 * globTool/grepTool/globPrompt/grepPrompt/relativePath/filesToolInput）+
 * S-C5（Read 本体：readTool/binaryExtensions/readFileLimits/readPrompt/
 * userMessage/memoryFreshness + filesToolInput S-C5 扩面）。
 *
 * 纪律（tools/index.ts bash 块先例）：逐名显式 re-export，无 `export *`；
 * 全 118 名 0 重名核验（S-C5 逐文件 grep 收集：S-C4 90 + S-C5 28）；各
 * 文件头注 delta 登记不随门面重复（单一事实源 = 各模块头注）。
 *
 * 消费方：tools/ 门面 S-C5 re-export 块 + 组合根 baseTools 注入位
 * （ReadTool，注册表 ⑰ 槽 Read 恒注册，Glob/Grep 同槽）+ 后续 S-C6
 * Write+Edit 本体（同域依赖 fileUtils/fileRead/diffUtils 消费面）。
 */
// ── S-C1（§8.55）：依赖闭包层 1 ──
export {
  PDF_TARGET_RAW_SIZE,
  PDF_EXTRACT_SIZE_THRESHOLD,
  PDF_MAX_EXTRACT_SIZE,
  PDF_MAX_PAGES_PER_READ,
  PDF_AT_MENTION_INLINE_THRESHOLD,
} from './apiLimits'
export {
  CONTEXT_LINES,
  DIFF_TIMEOUT_MS,
  adjustHunkLineNumbers,
  countLinesChanged,
  getPatchFromContents,
  getPatchForDisplay,
} from './diffUtils'
export type {
  FileEditInput,
  EditInput,
  FileEdit,
} from './fileEditTypes'
export { fileReadCache } from './fileReadCache'
export type { LineEndingType } from './fileRead'
export {
  detectEncodingForResolvedPath,
  detectLineEndingsForString,
  readFileSyncWithMetadata,
  readFileSync,
} from './fileRead'
export type { File } from './fileUtils'
export {
  pathExists,
  MAX_OUTPUT_SIZE,
  readFileSafe,
  getFileModificationTime,
  getFileModificationTimeAsync,
  writeTextContent,
  detectFileEncoding,
  detectLineEndings,
  convertLeadingTabsToSpaces,
  getAbsoluteAndRelativePaths,
  getDisplayPath,
  findSimilarFile,
  FILE_NOT_FOUND_CWD_NOTE,
  suggestPathUnderCwd,
  isCompactLinePrefixEnabled,
  addLineNumbers,
  stripLineNumberPrefix,
  isDirEmpty,
  readFileSyncCached,
  writeFileSyncAndFlush_DEPRECATED,
  getDesktopPath,
  isFileWithinReadSizeLimit,
  normalizePathForComparison,
  pathsEqual,
} from './fileUtils'
export {
  semanticToNumber,
  semanticToBoolean,
} from './semantic'
export {
  getMainLoopModelName,
  getCanonicalModelName,
} from './modelRef'
// ── S-C2（§8.55）：依赖闭包层 2 ──
export {
  normalizePatternsToPath,
  getFileReadIgnorePatterns,
} from './globIgnorePatterns'
export { extractGlobBaseDirectory, glob } from './globUtils'
// ── S-C3（§8.55）：pdf/notebook 族 ──
export { execFileNoThrow } from './execFileNoThrow'
export type {
  PDFError,
  PDFResult,
  PDFExtractPagesResult,
} from './pdf'
export {
  readPDF,
  getPDFPageCount,
  resetPdftoppmCache,
  isPdftoppmAvailable,
  extractPDFPages,
} from './pdf'
export {
  DOCUMENT_EXTENSIONS,
  parsePDFPageRange,
  isPDFSupported,
  isPDFExtension,
} from './pdfUtils'
export {
  readNotebook,
  mapNotebookCellsToToolResult,
  parseCellId,
} from './notebook'
export type {
  NotebookCellType,
  NotebookCell,
  NotebookDocument,
  NotebookContent,
  NotebookCellSource,
  NotebookCellSourceOutput,
  NotebookOutputImage,
  NotebookCellOutput,
} from './notebookTypes'
export { NotebookCellKind } from './notebookTypes'
// ── S-C4（§8.55）：Glob/Grep 本体 ──
export { GLOB_DESCRIPTION } from './globPrompt'
export { getGrepDescription } from './grepPrompt'
export { toRelativePath } from './relativePath'
export type {
  GlobToolInput,
  GrepToolInput,
  ReadToolInput,
  FileState,
  ReadFileState,
  FilesToolUseContext,
} from './filesToolInput'
export {
  GLOB_TOOL_INPUT_SCHEMA,
  GlobTool,
  type GlobOutput,
} from './globTool'
export {
  GREP_TOOL_INPUT_SCHEMA,
  GrepTool,
  type GrepOutput,
} from './grepTool'
// ── S-C5（§8.55）：Read 本体 ──
export {
  BINARY_EXTENSIONS,
  hasBinaryExtension,
  isBinaryContent,
} from './binaryExtensions'
export {
  DEFAULT_MAX_OUTPUT_TOKENS,
  getDefaultFileReadingLimits,
  type FileReadingLimits,
} from './readFileLimits'
export {
  FILE_UNCHANGED_STUB,
  MAX_LINES_TO_READ,
  DESCRIPTION,
  LINE_FORMAT_INSTRUCTION,
  OFFSET_INSTRUCTION_DEFAULT,
  OFFSET_INSTRUCTION_TARGETED,
  renderPromptTemplate,
} from './readPrompt'
export {
  type InDomainUserMessage,
  createUserMessage,
} from './userMessage'
export {
  memoryAgeDays,
  memoryAge,
  memoryFreshnessText,
  memoryFreshnessNote,
} from './memoryFreshness'
export {
  READ_TOOL_INPUT_SCHEMA,
  ReadTool,
  type ReadOutput,
  MaxFileReadTokenExceededError,
  registerFileReadListener,
  CYBER_RISK_MITIGATION_REMINDER,
} from './readTool'
