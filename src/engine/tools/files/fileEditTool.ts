/**
 * engine/tools/files — EditTool 本体（§8.55 S-C6，Write+Edit 本体）。
 *
 * 旧仓来源（a8af45b）：src/tools/FileEditTool/FileEditTool.ts 601L 逐字
 * 随迁（本体面 + readFileForEdit 局部助手）。import 重指：buildTool/
 * ToolDef → 新 shared Tool 契约 + face 扩型（S-C5 ReadToolFace 先例）；
 * 工具名 ../toolNames；countLinesChanged → ./diffUtils（S-C1）；
 * FILE_UNEXPECTEDLY_MODIFIED_ERROR → ./fileEditConstants；FILE_NOT_FOUND_
 * CWD_NOTE/findSimilarFile/getFileModificationTime/getDisplayPath/
 * suggestPathUnderCwd/writeTextContent → ./fileUtils；readFileSyncWith
 * Metadata/LineEndingType → ./fileRead；FileEditInput → ./fileEditTypes
 * （S-C1）；findActualString/getPatchForEdit/preserveQuoteStyle →
 * ./fileEditUtils（S-C6 本体）；getEditToolDescription → ./fileEditPrompt；
 * semanticToBoolean → ./semantic（S-C1）；formatFileSize/getFsImplementa-
 * tion/isEnvTruthy→（不用，见 ⑦）/isENOENT/expandPath → shared 门面。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① 旧 zod inputSchema（strictObject 4 字段，replace_all semanticBoolean）
 *    → 纯 JSON schema（replace_all 型 = boolean；字符串布尔容忍 =
 *    validate/call 入口 semanticToBoolean 转换，S-C1 语义先例）。
 *  ② 旧 zod outputSchema → 新契约无槽位 → TS 接口 EditOutput 承载
 *    （S-C5 ReadOutput 先例；gitDiff 字段裁随 ⑦）。
 *  ③ 旧双 prompt 面（description() 'A tool for editing files' + prompt()
 *    getEditToolDescription）→ 新契约唯一 prompt 面 = 旧 prompt() 体
 *    （S-C5 delta ③ 先例）。
 *  ④ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isEnabled true /
 *    isConcurrencySafe false / isReadOnly false / isDestructive false
 *    （旧 def 无覆写 = 默认值逐字，S-C5 delta ④ 先例）。
 *  ⑤ checkPermissions = 一线接线 checkWritePermissionForTool（S-C4 先例
 *    同语义固化；P-C4 族写侧探针同 fileWriteTool delta ⑤）。
 *  ⑥ validateInput 第二参双站点兼容（S-C5 delta ⑥ 先例逐字：getAppState
 *    有 → deny 检查走 matchingRuleForInput 桩 ①；无 → 跳过）。
 *  ⑦ 裁面（旧仓 service/域面新仓无，H6 前向接缝登记）：growthbook 遥测 /
 *    diagnosticTracker / LSP didChange·didSave / vscode notify / skills
 *    discover·activate（含 ATLAS_SIMPLE 门控块）/ fileHistory backup /
 *    gitDiff（fetchSingleFileGitDiff + ATLAS_REMOTE 支，isEnvTruthy 随之
 *    无消费）/ ATLAS.md 空遥测块 / backfillObservableInput（hooks 面）/
 *    preparePermissionMatcher（gate 侧）/ validateInputForSettingsFileEdit
 *    （旧 utils/settings/validateEditTool，新仓无 → settings-file 专用
 *    校验面裁，D 波/真 ToolUseContext 残留守）。
 *  ⑧ 旧 validateInput 返回面 behavior: 'ask' 字段 + meta 字段
 *    （isFilePathAbsolute/actualOldString）→ 新 shared ValidationResult
 *    = { result: false; message; errorCode } 无槽位 → 裁（决策面 = gate
 *    波；errorCode 逐值保留）。
 *  ⑨ 旧 inputsEquivalent 成员（areFileEditsInputsEquivalent 接线）→ 新
 *    Tool 契约无槽位 → 成员裁；算法族 areFileEditsInputsEquivalent 保留
 *    ./fileEditUtils 导出（消费面随 gate 波，fileEditUtils delta ③）。
 *  ⑩ call 5 参 → 2 参（S-C5 delta ⑧ 先例）；旧 context 4 成员
 *    readFileState/userModified/updateFileHistoryState/dynamicSkillDirTriggers
 *    （旧仓 L382-387 解构逐字）：readFileState 保留（duck 可选成员）+ 后
 *    3 成员随 ⑦ 裁（fileHistory/skills 域）→ data.userModified 恒 false
 *    （旧 `userModified ?? false`，context 成员缺面 → 常值，mapToolResult
 *    modifiedNote 支恒 '' 面登记）；call 入口 `(args ?? {})` 守卫 = 新
 *    2 参契约 args: unknown 下防御性加固（旧仓 call 直接解构 input:
 *    FileEditInput 已校验参，无此支；引擎恒传对象 → 零活行为差，S-C7
 *    A 路 NOTE-2 登记）。
 *  ⑪ readFileState 可选链降级（S-C5 delta ⑨ 同源）：缺省 = validate 恒
 *    「未读」支（errorCode 6）+ call 既有文件恒 stale 支；注入后 = 旧
 *    行为逐字。
 *  ⑫ userFacingName = 旧 UI 支最小化：old_string === '' → 'Create' /
 *    其余 'Update'（plans 目录支 + edits 成员支 = TUI 波残留守，S-C5
 *    delta ④ 先例）。
 *  ⑬ 旧 UI React 渲染面（renderToolUseMessage React / renderToolUse
 *    RejectedMessage / renderToolUseErrorMessage / renderToolResultMessage /
 *    getToolUseSummary / getActivityDescription）裁 → 新契约
 *    renderToolUseMessage = displayPath 文本最小形（S-C5 delta ⑯ 先例）；
 *    extractSearchText 旧 def 无成员（buildTool 默认面）→ 新契约可选
 *    成员不实现（登记）。
 *
 * 残留守（防「以为已全」）：真 ToolUseContext 全字段面 / UI React 渲染面 /
 * skills 域面 / fileHistory 域面 / gitDiff 服务面 / settings-file 校验面 /
 * inputsEquivalent 消费面 = 残留守（D 波/TUI 波/skills 波/gate 波）。
 */
import { dirname } from 'path'
import { type StructuredPatchHunk } from 'diff'
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
  getFsImplementation,
  isENOENT,
} from '../../../shared'
import {
  checkWritePermissionForTool,
  matchingRuleForInput,
} from '../../../permissions'
import { getCwd } from '../../../bootstrap'
import { FILE_EDIT_TOOL_NAME, NOTEBOOK_EDIT_TOOL_NAME } from '../toolNames'
import { countLinesChanged } from './diffUtils'
import { FILE_UNEXPECTEDLY_MODIFIED_ERROR } from './fileEditConstants'
import {
  FILE_NOT_FOUND_CWD_NOTE,
  findSimilarFile,
  getFileModificationTime,
  getDisplayPath,
  suggestPathUnderCwd,
  writeTextContent,
} from './fileUtils'
import {
  type LineEndingType,
  readFileSyncWithMetadata,
} from './fileRead'
import type { FileEditInput } from './fileEditTypes'
import {
  findActualString,
  getPatchForEdit,
  preserveQuoteStyle,
} from './fileEditUtils'
import { getEditToolDescription } from './fileEditPrompt'
import { semanticToBoolean } from './semantic'
import type { FilesToolUseContext } from './filesToolInput'

// V8/Bun string length limit is ~2^30 characters (~1 billion). For typical
// ASCII/Latin-1 files, 1 byte on disk = 1 character, so 1 GiB in stat bytes
// ≈ 1 billion characters ≈ the runtime string limit. Multi-byte UTF-8 files
// can be larger on disk per character, but 1 GiB is a safe byte-level guard
// that prevents OOM without being unnecessarily restrictive.
const MAX_EDIT_FILE_SIZE = 1024 * 1024 * 1024 // 1 GiB (stat bytes)

/** 输入 JSON schema（旧仓 zod inputSchema 逐字段转写，delta ①）。 */
export const EDIT_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description: 'The absolute path to the file to modify',
    },
    old_string: {
      type: 'string',
      description: 'The text to replace',
    },
    new_string: {
      type: 'string',
      description:
        'The text to replace it with (must be different from old_string)',
    },
    replace_all: {
      type: 'boolean',
      description:
        'Replace all occurrences of old_string (default false)',
    },
  },
  required: ['file_path', 'old_string', 'new_string'],
}

/** 旧 zod outputSchema 形（delta ②/⑦：gitDiff 字段裁）。 */
export interface EditOutput {
  filePath: string
  oldString: string
  newString: string
  originalFile: string
  structuredPatch: StructuredPatchHunk[]
  userModified: boolean
  replaceAll: boolean
}

// Tool 契约非参数化（Input 泛参位 = JSON schema 对象型，S-B5/S-C4/S-C5
// 先例）；face 扩型 = getPath + checkPermissions 返回型收窄（S-C5
// ReadToolFace 先例）。
type EditToolFace = Tool & {
  getPath(input: Record<string, unknown>): string
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision>
}

export const EditTool: EditToolFace = {
  name: FILE_EDIT_TOOL_NAME,
  inputSchema: EDIT_TOOL_INPUT_SCHEMA,
  inputJSONSchema: EDIT_TOOL_INPUT_SCHEMA,
  searchHint: 'modify file contents in place',
  maxResultSizeChars: 100_000,
  strict: true,
  isEnabled: () => true,
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ④，逐值）
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) => {
    const { file_path, new_string } = input as FileEditInput
    return `${file_path}: ${new_string}`
  },
  // delta ⑫：old_string === '' → 'Create'（旧生效值 2 支，plans 支裁）
  userFacingName: (input: unknown): string => {
    const { old_string } = (input ?? {}) as Partial<FileEditInput>
    if (old_string === '') {
      return 'Create'
    }
    return 'Update'
  },
  getPath(input: Record<string, unknown>): string {
    return (input as unknown as FileEditInput).file_path
  },
  async description(): Promise<string> {
    // delta ③：新契约唯一 prompt 面 = 旧 prompt() 体
    return getEditToolDescription()
  },
  // delta ⑬：displayPath 文本最小形（React 面裁）
  renderToolUseMessage(
    input: unknown,
    options: { verbose: boolean },
  ): unknown {
    const { file_path } = (input ?? {}) as Partial<FileEditInput>
    if (!file_path) {
      return null
    }
    return options.verbose ? file_path : getDisplayPath(file_path)
  },
  async validateInput(
    input: unknown,
    context: unknown,
  ): Promise<ValidationResult> {
    const { file_path, old_string, new_string } = input as FileEditInput
    // delta ①：replace_all 字符串布尔容忍 = 入口运行时转换（S-C1 先例）
    const replaceAll =
      (semanticToBoolean(
        (input as FileEditInput).replace_all,
      ) as boolean | undefined) ?? false
    // Use expandPath for consistent path normalization (especially on Windows
    // where "/" vs "\" can cause readFileState lookup mismatches)
    const fullFilePath = expandPath(file_path, getCwd())

    // Reject edits to team memory files that introduce secrets
    if (old_string === new_string) {
      return {
        result: false,
        message:
          'No changes to make: old_string and new_string are exactly the same.',
        errorCode: 1,
      }
    }

    // Check if path should be ignored based on permission settings
    // delta ⑥：双站点兼容（S-C5 先例逐字）
    const ctx = context as {
      getAppState?: () => { toolPermissionContext: ToolPermissionContext }
    } | undefined
    const appState = ctx?.getAppState?.()
    const denyRule = appState
      ? matchingRuleForInput(
          fullFilePath,
          appState.toolPermissionContext,
          'edit',
          'deny',
        )
      : null
    if (denyRule !== null) {
      return {
        result: false,
        message:
          'File is in a directory that is denied by your permission settings.',
        errorCode: 2,
      }
    }

    // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
    // On Windows, fs.existsSync() on UNC paths triggers SMB authentication which could
    // leak credentials to malicious servers. Let the permission check handle UNC paths.
    if (fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//')) {
      return { result: true }
    }

    const fs = getFsImplementation()

    // Prevent OOM on multi-GB files.
    try {
      const { size } = await fs.stat(fullFilePath)
      if (size > MAX_EDIT_FILE_SIZE) {
        return {
          result: false,
          message: `File is too large to edit (${formatFileSize(size)}). Maximum editable file size is ${formatFileSize(MAX_EDIT_FILE_SIZE)}.`,
          errorCode: 10,
        }
      }
    } catch (e) {
      if (!isENOENT(e)) {
        throw e
      }
    }

    // Read the file as bytes first so we can detect encoding from the buffer
    // instead of calling detectFileEncoding (which does its own sync readSync
    // and would fail with a wasted ENOENT when the file doesn't exist).
    let fileContent: string | null
    try {
      const fileBuffer = await fs.readFileBytes(fullFilePath)
      const encoding: BufferEncoding =
        fileBuffer.length >= 2 &&
        fileBuffer[0] === 0xff &&
        fileBuffer[1] === 0xfe
          ? 'utf16le'
          : 'utf8'
      fileContent = fileBuffer.toString(encoding).replaceAll('\r\n', '\n')
    } catch (e) {
      if (isENOENT(e)) {
        fileContent = null
      } else {
        throw e
      }
    }

    // File doesn't exist
    if (fileContent === null) {
      // Empty old_string on nonexistent file means new file creation — valid
      if (old_string === '') {
        return { result: true }
      }
      // Try to find a similar file with a different extension
      const similarFilename = findSimilarFile(fullFilePath)
      const cwdSuggestion = await suggestPathUnderCwd(fullFilePath)
      let message = `File does not exist. ${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}.`

      if (cwdSuggestion) {
        message += ` Did you mean ${cwdSuggestion}?`
      } else if (similarFilename) {
        message += ` Did you mean ${similarFilename}?`
      }

      return {
        result: false,
        message,
        errorCode: 4,
      }
    }

    // File exists with empty old_string — only valid if file is empty
    if (old_string === '') {
      // Only reject if the file has content (for file creation attempt)
      if (fileContent.trim() !== '') {
        return {
          result: false,
          message: 'Cannot create new file - file already exists.',
          errorCode: 3,
        }
      }

      // Empty file with empty old_string is valid - we're replacing empty with content
      return {
        result: true,
      }
    }

    if (fullFilePath.endsWith('.ipynb')) {
      return {
        result: false,
        message: `File is a Jupyter Notebook. Use the ${NOTEBOOK_EDIT_TOOL_NAME} to edit this file.`,
        errorCode: 5,
      }
    }

    // delta ⑪：readFileState 可选链（缺省 → 恒「未读」支）
    const readTimestamp = (
      (context as FilesToolUseContext).readFileState
    )?.get(fullFilePath)
    if (!readTimestamp || readTimestamp.isPartialView) {
      return {
        result: false,
        message:
          'File has not been read yet. Read it first before writing to it.',
        errorCode: 6,
      }
    }

    // Check if file exists and get its last modified time
    if (readTimestamp) {
      const lastWriteTime = getFileModificationTime(fullFilePath)
      if (lastWriteTime > readTimestamp.timestamp) {
        // Timestamp indicates modification, but on Windows timestamps can change
        // without content changes (cloud sync, antivirus, etc.). For full reads,
        // compare content as a fallback to avoid false positives.
        const isFullRead =
          readTimestamp.offset === undefined &&
          readTimestamp.limit === undefined
        if (isFullRead && fileContent === readTimestamp.content) {
          // Content unchanged, safe to proceed
        } else {
          return {
            result: false,
            message:
              'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
            errorCode: 7,
          }
        }
      }
    }

    const file = fileContent

    // Use findActualString to handle quote normalization
    const actualOldString = findActualString(file, old_string)
    if (!actualOldString) {
      return {
        result: false,
        message: `String to replace not found in file.\nString: ${old_string}`,
        errorCode: 8,
      }
    }

    const matches = file.split(actualOldString).length - 1

    // Check if we have multiple matches but replace_all is false
    if (matches > 1 && !replaceAll) {
      return {
        result: false,
        message: `Found ${matches} matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, please provide more context to uniquely identify the instance.\nString: ${old_string}`,
        errorCode: 9,
      }
    }

    // delta ⑦：validateInputForSettingsFileEdit 支裁（新仓无该模块）

    return { result: true }
  },
  async checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision> {
    const appState = (context as FilesToolUseContext).getAppState()
    return checkWritePermissionForTool(
      EditTool,
      input as Record<string, unknown>,
      appState.toolPermissionContext,
    )
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<EditOutput>> {
    const raw = (args ?? {}) as FileEditInput
    const { file_path, old_string, new_string } = raw
    const ctx = context as FilesToolUseContext
    // delta ①：replace_all 字符串布尔容忍 = 入口运行时转换（S-C1 先例）
    const replaceAll =
      (semanticToBoolean(raw.replace_all) as boolean | undefined) ?? false

    // 1. Get current state
    const fs = getFsImplementation()
    const absoluteFilePath = expandPath(file_path, getCwd())

    // delta ⑦：skills discover/activate（含 ATLAS_SIMPLE 门控块）+
    // diagnosticTracker 裁（域面无）

    // Ensure parent directory exists before the atomic read-modify-write section.
    // These awaits must stay OUTSIDE the critical section below — a yield between
    // the staleness check and writeTextContent lets concurrent edits interleave.
    await fs.mkdir(dirname(absoluteFilePath))
    // delta ⑦：fileHistory backup 裁（域面无）

    // 2. Load current state and confirm no changes since last read
    // Please avoid async operations between here and writing to disk to preserve atomicity
    const {
      content: originalFileContents,
      fileExists,
      encoding,
      lineEndings: endings,
    } = readFileForEdit(absoluteFilePath)

    if (fileExists) {
      const lastWriteTime = getFileModificationTime(absoluteFilePath)
      // delta ⑪：readFileState 可选链（缺省 → 既有文件恒 stale 支）
      const lastRead = ctx.readFileState?.get(absoluteFilePath)
      if (!lastRead || lastWriteTime > lastRead.timestamp) {
        // Timestamp indicates modification, but on Windows timestamps can change
        // without content changes (cloud sync, antivirus, etc.). For full reads,
        // compare content as a fallback to avoid false positives.
        const isFullRead =
          lastRead &&
          lastRead.offset === undefined &&
          lastRead.limit === undefined
        const contentUnchanged =
          isFullRead && originalFileContents === lastRead.content
        if (!contentUnchanged) {
          throw new Error(FILE_UNEXPECTEDLY_MODIFIED_ERROR)
        }
      }
    }

    // 3. Use findActualString to handle quote normalization
    const actualOldString =
      findActualString(originalFileContents, old_string) || old_string

    // Preserve curly quotes in new_string when the file uses them
    const actualNewString = preserveQuoteStyle(
      old_string,
      actualOldString,
      new_string,
    )

    // 4. Generate patch
    const { patch, updatedFile } = getPatchForEdit({
      filePath: absoluteFilePath,
      fileContents: originalFileContents,
      oldString: actualOldString,
      newString: actualNewString,
      replaceAll: replaceAll,
    })

    // 5. Write to disk
    writeTextContent(absoluteFilePath, updatedFile, encoding, endings)

    // delta ⑦：LSP didChange/didSave + vscode diff notify 裁（域面无）

    // 6. Update read timestamp, to invalidate stale writes
    ctx.readFileState?.set(absoluteFilePath, {
      content: updatedFile,
      timestamp: getFileModificationTime(absoluteFilePath),
      offset: undefined,
      limit: undefined,
    })

    // 7. Log events
    // delta ⑦：ATLAS.md 空遥测块裁
    countLinesChanged(patch)

    // delta ⑦：gitDiff（fetchSingleFileGitDiff + ATLAS_REMOTE 支）裁

    // 8. Yield result
    const data: EditOutput = {
      filePath: file_path,
      oldString: actualOldString,
      newString: new_string,
      originalFile: originalFileContents,
      structuredPatch: patch,
      // delta ⑩：旧 context.userModified ?? false → context 成员裁 → 常值
      userModified: false,
      replaceAll,
    }
    return {
      data,
    }
  },
  mapToolResultToToolResultBlockParam(
    data: EditOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    const { filePath, userModified, replaceAll } = data
    const modifiedNote = userModified
      ? '.  The user modified your proposed changes before accepting them. '
      : ''

    if (replaceAll) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: `The file ${filePath} has been updated${modifiedNote}. All occurrences were successfully replaced.`,
      }
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `The file ${filePath} has been updated successfully${modifiedNote}.`,
    }
  },
}

// --

function readFileForEdit(absoluteFilePath: string): {
  content: string
  fileExists: boolean
  encoding: BufferEncoding
  lineEndings: LineEndingType
} {
  try {
    const meta = readFileSyncWithMetadata(absoluteFilePath)
    return {
      content: meta.content,
      fileExists: true,
      encoding: meta.encoding,
      lineEndings: meta.lineEndings,
    }
  } catch (e) {
    if (isENOENT(e)) {
      return {
        content: '',
        fileExists: false,
        encoding: 'utf8',
        lineEndings: 'LF',
      }
    }
    throw e
  }
}
