/**
 * engine/tools/files — WriteTool 本体（§8.55 S-C6，Write+Edit 本体）。
 *
 * 旧仓来源（a8af45b）：src/tools/FileWriteTool/FileWriteTool.ts 426L 逐字
 * 随迁（本体面）。import 重指：buildTool/ToolDef → 新 shared Tool 契约 +
 * face 扩型（S-C5 ReadToolFace 先例）；工具名 ../toolNames；
 * countLinesChanged/getPatchForDisplay → ./diffUtils（S-C1）；
 * getFileModificationTime/writeTextContent/getDisplayPath → ./fileUtils；
 * readFileSyncWithMetadata → ./fileRead；isUnderMemoryDir/
 * validateMemoryFrontmatter → memory 门面（S-C2）；
 * checkWritePermissionForTool/matchingRuleForInput → permissions 门面；
 * expandPath/getFsImplementation/isENOENT → shared 门面。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① 旧 zod inputSchema（strictObject 2 字段）→ 纯 JSON schema（S-C1 先例；
 *    strictObject → 无 additionalProperties 槽位，S-C5 Read ① 同面）。
 *  ② 旧 zod outputSchema（z.infer Output）→ 新契约无 outputSchema 槽位 →
 *    TS 接口 WriteOutput 承载（S-C5 ReadOutput 先例）。
 *  ③ 旧双 prompt 面（description() 单行 'Write a file...' + prompt()
 *    getWriteToolDescription）→ 新契约唯一 prompt 面 = 旧 prompt() 体
 *    （S-C5 delta ③ 先例；单行体裁与 DESCRIPTION 常量面随之登记）。
 *  ④ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isEnabled true /
 *    isConcurrencySafe false / isReadOnly false / isDestructive false
 *    （旧 FileWriteTool def 无覆写，取值 = 默认值逐字，S-C5 delta ④
 *    先例）。
 *  ⑤ checkPermissions = 一线接线 checkWritePermissionForTool（S-C4
 *    Glob/Grep 先例同语义固化；P-C4 族写侧探针：matchingRuleForInput =
 *    桩 ① → deny/allow 规则面不可观察，可观察判别 = 工作目录边界，规则
 *    求值波前向接缝）。
 *  ⑥ validateInput 第二参双站点兼容（S-C5 delta ⑥ 先例逐字）：context
 *    有 getAppState → matchingRuleForInput 走 deny 检查（桩 ① 恒 null）；
 *    无（引擎 dispatch { signal } 站点）→ 跳过（零可观察 delta）。
 *  ⑦ 裁面（旧仓 service/域面新仓无，H6 前向接缝登记）：growthbook 遥测 /
 *    diagnosticTracker / LSP manager didChange·didSave / vscode mcp
 *    notifyVscodeFileUpdated / skills discover·activate·addSkillDirectories /
 *    fileHistory backup（fileHistoryEnabled/fileHistoryTrackEdit）/ gitDiff
 *    （fetchSingleFileGitDiff + ATLAS_REMOTE 支）/ ATLAS.md 空遥测块 /
 *    backfillObservableInput（hooks 面，S-C5 ⑰ 先例）/ preparePermission
 *    Matcher（gate 侧，S-C4 ⑧ 先例）。
 *  ⑧ call 5 参 → 2 参声明（S-C5 delta ⑧ 先例）；旧 context 3 成员
 *    readFileState/updateFileHistoryState/dynamicSkillDirTriggers（旧仓
 *    L237 解构逐字；userModified 非 Write 侧成员，属 Edit 侧）：readFile-
 *    State 保留（duck 可选成员）+ 后 2 成员随 ⑦ 裁（fileHistory/skills
 *    域）→ 新 duck = FilesToolUseContext（getAppState + readFileState?
 *    既有成员，filesToolInput S-C6 扩面）；call 入口 `(args ?? {})` 守卫
 *    = 新 2 参契约 args: unknown 下防御性加固（旧仓 call 直接解构必填
 *    已校验参，无此支；引擎恒传对象 → 零活行为差，S-C7 A 路 NOTE-2
 *    登记）。
 *  ⑨ readFileState 可选链降级（S-C5 delta ⑭ 缺省零崩溃先例）：引擎侧注入
 *    位未落 → 缺省 = validate 恒「未读」支（errorCode 2）+ call 既有文件
 *    恒 stale 支（throw FILE_UNEXPECTEDLY_MODIFIED_ERROR）；注入后 = 旧
 *    行为逐字。
 *  ⑩ userFacingName = 最小 'Write'（旧 UI 2 支：plans 目录 → 'Updated
 *    plan' / 其余 'Write'；plans 目录面裁 = TUI 波残留守，S-C5 delta ④
 *    先例）。
 *  ⑪ 旧 UI React 渲染面（renderToolUseMessage React / renderToolUse
 *    RejectedMessage / renderToolUseErrorMessage / renderToolResultMessage /
 *    getToolUseSummary / isResultTruncated / getActivityDescription）裁 →
 *    新契约 renderToolUseMessage = displayPath 文本最小形（S-C5 delta ⑯
 *    先例）；extractSearchText 逐字随迁（旧注释 = phantom 索引理由，保留
 *    逐字）。
 *  ⑫ WriteOutput 裁 gitDiff 字段（旧 gitDiff 支随 ⑦ 裁）。
 *
 * 残留守（防「以为已全」）：真 ToolUseContext 全字段面 / UI React 渲染面 /
 * skills 域面 / fileHistory 域面 / gitDiff 服务面 / updateFileHistoryState
 * 注入位 = 残留守（D 波/TUI 波/skills 波/gate 波）。
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
  getFsImplementation,
  isENOENT,
} from '../../../shared'
import {
  checkWritePermissionForTool,
  matchingRuleForInput,
} from '../../../permissions'
import { getCwd } from '../../../bootstrap'
import { isUnderMemoryDir, validateMemoryFrontmatter } from '../../../memory'
import { FILE_WRITE_TOOL_NAME } from '../toolNames'
import { countLinesChanged, getPatchForDisplay } from './diffUtils'
import { FILE_UNEXPECTEDLY_MODIFIED_ERROR } from './fileEditConstants'
import {
  getDisplayPath,
  getFileModificationTime,
  writeTextContent,
} from './fileUtils'
import { readFileSyncWithMetadata } from './fileRead'
import type {
  FilesToolUseContext,
  WriteToolInput,
} from './filesToolInput'
import { getWriteToolDescription } from './fileWritePrompt'

/** 输入 JSON schema（旧仓 zod inputSchema 逐字段转写，delta ①）。 */
export const WRITE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description:
        'The absolute path to the file to write (must be absolute, not relative)',
    },
    content: {
      type: 'string',
      description: 'The content to write to the file',
    },
  },
  required: ['file_path', 'content'],
}

/** 旧 zod outputSchema 形（delta ②/⑫：gitDiff 字段裁）。 */
export interface WriteOutput {
  type: 'create' | 'update'
  filePath: string
  content: string
  structuredPatch: StructuredPatchHunk[]
  originalFile: string | null
}

// Tool 契约非参数化（Input 泛参位 = JSON schema 对象型，S-B5/S-C4/S-C5
// 先例）；face 扩型 = getPath（PermissionTool duck 成员）+ checkPermissions
// 返回型收窄（S-C5 ReadToolFace 先例）。
type WriteToolFace = Tool & {
  getPath(input: Record<string, unknown>): string
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision>
}

export const WriteTool: WriteToolFace = {
  name: FILE_WRITE_TOOL_NAME,
  inputSchema: WRITE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: WRITE_TOOL_INPUT_SCHEMA,
  searchHint: 'create or overwrite files',
  maxResultSizeChars: 100_000,
  strict: true,
  isEnabled: () => true,
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ④，逐值）
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) => {
    const { file_path, content } = input as WriteToolInput
    return `${file_path}: ${content}`
  },
  // delta ⑩：最小 'Write'（旧 plans 支 TUI 波残留守）
  userFacingName: () => 'Write',
  getPath(input: Record<string, unknown>): string {
    return (input as unknown as WriteToolInput).file_path
  },
  async description(): Promise<string> {
    // delta ③：新契约唯一 prompt 面 = 旧 prompt() 体
    return getWriteToolDescription()
  },
  // delta ⑪：displayPath 文本最小形（React 面裁）
  renderToolUseMessage(
    input: unknown,
    options: { verbose: boolean },
  ): unknown {
    const { file_path } = (input ?? {}) as WriteToolInput
    if (!file_path) {
      return null
    }
    return options.verbose ? file_path : getDisplayPath(file_path)
  },
  extractSearchText(): string {
    // Transcript render shows either content (create, via HighlightedCode)
    // or a structured diff (update). The heuristic's 'content' allowlist key
    // would index the raw content string even in update mode where it's NOT
    // shown — phantom. Under-count: tool_use already indexes file_path.
    return ''
  },
  async validateInput(
    input: unknown,
    context: unknown,
  ): Promise<ValidationResult> {
    const { file_path, content } = input as WriteToolInput
    const fullFilePath = expandPath(file_path, getCwd())

    // Reject writes to team memory files that contain secrets

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
        errorCode: 1,
      }
    }

    // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
    // On Windows, fs.existsSync() on UNC paths triggers SMB authentication which could
    // leak credentials to malicious servers. Let the permission check handle UNC paths.
    if (fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//')) {
      return { result: true }
    }

    const fs = getFsImplementation()
    let fileMtimeMs: number
    try {
      const fileStat = await fs.stat(fullFilePath)
      fileMtimeMs = fileStat.mtimeMs
    } catch (e) {
      if (isENOENT(e)) {
        return { result: true }
      }
      throw e
    }

    const readTimestamp = (
      (context as FilesToolUseContext).readFileState
    )?.get(fullFilePath)
    if (!readTimestamp || readTimestamp.isPartialView) {
      return {
        result: false,
        message:
          'File has not been read yet. Read it first before writing to it.',
        errorCode: 2,
      }
    }

    // Reuse mtime from the stat above — avoids a redundant statSync via
    // getFileModificationTime. The readTimestamp guard above ensures this
    // block is always reached when the file exists.
    const lastWriteTime = Math.floor(fileMtimeMs)
    if (lastWriteTime > readTimestamp.timestamp) {
      return {
        result: false,
        message:
          'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
        errorCode: 3,
      }
    }

    // Memory-file frontmatter validation: files under a memory/ directory
    // must have valid frontmatter (name, description, type). Fail early with
    // a clear error so the agent can fix the file rather than discovering it
    // silently degraded in the memory manifest.
    if (isUnderMemoryDir(fullFilePath)) {
      const fmError = validateMemoryFrontmatter(content, fullFilePath)
      if (fmError) {
        return {
          result: false,
          message: fmError,
          errorCode: 4,
        }
      }
    }

    return { result: true }
  },
  async checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision> {
    const appState = (context as FilesToolUseContext).getAppState()
    return checkWritePermissionForTool(
      WriteTool,
      input as Record<string, unknown>,
      appState.toolPermissionContext,
    )
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<WriteOutput>> {
    const { file_path, content } = (args ?? {}) as WriteToolInput
    const ctx = context as FilesToolUseContext
    const fullFilePath = expandPath(file_path, getCwd())
    const dir = dirname(fullFilePath)

    // Ensure parent directory exists before the atomic read-modify-write section.
    // Must stay OUTSIDE the critical section below (a yield between the staleness
    // check and writeTextContent lets concurrent edits interleave), and BEFORE the
    // write (lazy-mkdir-on-ENOENT would fire a spurious atlas_atomic_write_error
    // inside writeFileSyncAndFlush_DEPRECATED before ENOENT propagates back).
    await getFsImplementation().mkdir(dir)

    // Load current state and confirm no changes since last read.
    // Please avoid async operations between here and writing to disk to preserve atomicity.
    let meta: ReturnType<typeof readFileSyncWithMetadata> | null
    try {
      meta = readFileSyncWithMetadata(fullFilePath)
    } catch (e) {
      if (isENOENT(e)) {
        meta = null
      } else {
        throw e
      }
    }

    if (meta !== null) {
      const lastWriteTime = getFileModificationTime(fullFilePath)
      // delta ⑨：readFileState 可选链（缺省 → 既有文件恒 stale 支）
      const lastRead = ctx.readFileState?.get(fullFilePath)
      if (!lastRead || lastWriteTime > lastRead.timestamp) {
        // Timestamp indicates modification, but on Windows timestamps can change
        // without content changes (cloud sync, antivirus, etc.). For full reads,
        // compare content as a fallback to avoid false positives.
        const isFullRead =
          lastRead &&
          lastRead.offset === undefined &&
          lastRead.limit === undefined
        // meta.content is CRLF-normalized — matches readFileState's normalized form.
        if (!isFullRead || meta.content !== lastRead.content) {
          throw new Error(FILE_UNEXPECTEDLY_MODIFIED_ERROR)
        }
      }
    }

    const enc = meta?.encoding ?? 'utf8'
    const oldContent = meta?.content ?? null

    // Write is a full content replacement — the model sent explicit line endings
    // in `content` and meant them. Do not rewrite them. Previously we preserved
    // the old file's line endings (or sampled the repo via ripgrep for new
    // files), which silently corrupted e.g. bash scripts with \r on Linux when
    // overwriting a CRLF file or when binaries in cwd poisoned the repo sample.
    writeTextContent(fullFilePath, content, enc, 'LF')

    // Update read timestamp, to invalidate stale writes
    ctx.readFileState?.set(fullFilePath, {
      content,
      timestamp: getFileModificationTime(fullFilePath),
      offset: undefined,
      limit: undefined,
    })

    if (oldContent) {
      const patch = getPatchForDisplay({
        filePath: file_path,
        fileContents: oldContent,
        edits: [
          {
            old_string: oldContent,
            new_string: content,
            replace_all: false,
          },
        ],
      })

      const data: WriteOutput = {
        type: 'update',
        filePath: file_path,
        content,
        structuredPatch: patch,
        originalFile: oldContent,
      }
      // Track lines added and removed for file updates, right before yielding result
      countLinesChanged(patch)

      return {
        data,
      }
    }

    const data: WriteOutput = {
      type: 'create',
      filePath: file_path,
      content,
      structuredPatch: [],
      originalFile: null,
    }

    // For creation of new files, count all lines as additions, right before yielding the result
    countLinesChanged([], content)

    return {
      data,
    }
  },
  mapToolResultToToolResultBlockParam(
    { filePath, type }: WriteOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    switch (type) {
      case 'create':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `File created successfully at: ${filePath}`,
        }
      case 'update':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `The file ${filePath} has been updated successfully.`,
        }
    }
  },
}
