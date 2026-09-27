/**
 * engine/tools/notebook — NotebookEditTool 本体（S-E2 §8.61 notebook 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/NotebookEditTool/NotebookEditTool.ts 490L 裁
 * 剪随迁（tool 对象旧 buildTool 成员面 → 新 shared Tool 契约对象化，
 * readTool/writeTool face 先例）：inputSchema 纯 JSON 化（旧 z.strictObject
 * 5 字段 2 必填）/ validateInput 9 码面逐字（UNC skip 安全支 / ec2 扩展名 /
 * ec4 mode 三值集 / ec5 insert-requires-cell_type / ec9 read-before-edit /
 * ec10 stale / ec1 ENOENT / ec6 invalid JSON / ec7 index 越界或缺 cell_id /
 * ec8 cell_id 未找到）/ call replace/insert/delete 三支 + replace→insert 转换
 * + nbformat 4.5+ id 生成 + 写回（IPYNB_INDENT=1）+ readFileState 状态面 /
 * mapToolResult 4 模板 / checkPermissions 写面接线（writeTool 先例）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema + zod outputSchema z.infer) → 新 shared Tool
 *    契约：inputSchema = 纯 JSON schema 对象（NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA，
 *    旧 z.strictObject 面 → strict: true + additionalProperties false 双字段：
 *    纯 JSON 化 = readTool delta ① 先例，双字段面 = §8.60 config/askUser 波
 *    先例（S-E3 B 路 F2 订正：readTool/webFetch schema 无 additionalProperties
 *    字段，双字段真先例 = configTool L113 / askUserQuestionTool L197））；
 *    output → TS 型 NotebookEditOutput 承载（9 字段 duck，delta ① web 族先例）。
 *  ② 旧 call 的 fileHistory 支（fileHistoryEnabled() +
 *    fileHistoryTrackEdit(updateFileHistoryState, fullPath, parentMessage.
 *    uuid)）裁：fileHistory 域新仓未落（fileWriteTool delta ⑦ 裁面先例，
 *    归属波 = fileHistory 域同归属）；旧 call 4 参（args/context/_/
 *    parentMessage）→ 新 2 参（S-C5 delta ⑧ 先例，parentMessage = fileHistory
 *    支唯一消费）；context 解构的 updateFileHistoryState 成员同裁
 *    （fileWriteTool S-C6 扩面先例：userModified/updateFileHistoryState 成员
 *    随 fileHistory 域裁）。
 *  ③ 旧 safeParseJSON（LRU 50 条 memo + shouldLogError，旧 utils/json.ts:44-75）
 *    → jsonParse（engine/session/json 单一事实源）双站点：validateInput 站
 *    try/catch → null（失败面语义逐字：LRU 缓存 + 错误日志面裁）/ call 站
 *    非 memo jsonParse 逐字（旧注释 = 缓存投毒理由——validate/call 双站共享
 *    content 串且 in-place mutate；新仓 jsonParse 非 memo 双站独立，问题结构性
 *    不存在，注释面随迁保因果链可读）；同批 jsonStringify 签名裁 replacer
 *    参位（新 (data, space) 两参，旧调用点 (notebook, null, 1) → 新
 *    (notebook, 1)：null ≡ 新实现硬编码 undefined，零行为差）；validate
 *    站 BOM 面裁（S-E3 双路独立汇合 F1 补登）：旧 safeParseJSON 内部
 *    JSON.parse(stripBOM(json))（旧 utils/json.ts L33/L71）剥 UTF-8 BOM，
 *    新 jsonParse = 裸 JSON.parse 不剥 BOM——BOM 头 .ipynb 旧 validate 站
 *    ec6 放行 / 新 ec6 拒绝；旧代码自不一致（旧 call 站 L333 非 memo
 *    jsonParse 本不剥 BOM，BOM 头文件 call 侧旧即拒绝），新 = validate/call
 *    双站统一拒绝 BOM 头（消解旧不一致，corner 面 Jupyter 不产 BOM，登记不
 *    恢复）。
 *  ④ 旧 def 无 isConcurrencySafe/isReadOnly/isDestructive/isEnabled 覆写 →
 *    新契约缺省值对象化（writeTool delta ④ 先例逐值）：全 false + isEnabled
 *    () => true。
 *  ⑤ 旧 toAutoClassifierInput feature('TRANSCRIPT_CLASSIFIER') 门分支裁 → 本体
 *    无条件随迁（纯字符串构造零副作用；C 桶 ② auto-mode 波 = 真消费面，门
 *    恢复登记）。
 *  ⑥ 旧 UI 面裁（旧 UI.tsx 92L 全 5 函数核过，A-N3 复审注）：getToolUseSummary
 *    （+ getActivityDescription 派生支）/ renderToolUseRejectedMessage
 *    （NotebookEditToolUseRejectedMessage JSX）/ renderToolUseErrorMessage
 *    （extractTag tool_use_error + FallbackToolUseErrorMessage JSX）/
 *    renderToolResultMessage（错误色 + bold cell_id + HighlightedCode JSX）=
 *    TUI 波裁面（config delta ⑨ 先例）；新契约 renderToolUseMessage 槽 = 旧
 *    非 verbose 面字符串逻辑逐字（3 条件 null 守卫 +
 *    `${getDisplayPath(notebook_path)}@${cell_id}`；verbose FilePathLink 双支
 *    裁）。
 *  ⑦ 旧 call 解构 const cell_type 后原地重赋值（replace→insert 转换支）→
 *    本地 let 化（TS const 重赋值错；语义逐字，类型层适配）。
 *  ⑧ 旧 def description()/prompt() 双面 → 新 description() 单面 = PROMPT
 *    （web 族口径：本体不 import DESCRIPTION，短描述面经 notebook/ 子门面 +
 *    tools/ 门面 NOTEBOOK_EDIT_DESCRIPTION 别名 re-export）；mapToolResult 4 支
 *    逐字（Updated/Inserted/Deleted cell 模板 + Unknown edit mode + error
 *    is_error）。
 *  ⑨ validateInput/call 双站点 context duck = FilesToolUseContext
 *    （filesToolInput S-C5/S-C6 扩面）：readFileState? 可选链降级（validate 缺
 *    = 恒「未读」支 ec9 / call ?.set 缺 = no-op，S-C5 delta ⑭ 缺省零崩溃
 *    先例）；getAppState（仅 checkPermissions 消费）/ abortController = duck
 *    面。
 *
 * 消费方 = `notebook/` 子门面 + `tools/` 门面 re-export + 注册表 49 口径无条件
 * 注册位（§8.61.1.3；notebook 族无专属门控槽 = 无条件注册面，同 web/config
 * 族；LSP 860L 重分类 D 波 LSP 域（§8.61.1.1），本子波落盘面 = NotebookEdit
 * 单本体）。
 */
import { extname, isAbsolute, resolve } from 'path'
import {
  isENOENT,
  type PermissionDecision,
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import { checkWritePermissionForTool } from '../../../permissions'
import { getCwd } from '../../../bootstrap'
import { jsonParse, jsonStringify } from '../../session/json'
import {
  getDisplayPath,
  getFileModificationTime,
  parseCellId,
  readFileSyncWithMetadata,
  writeTextContent,
  type FilesToolUseContext,
  type NotebookCell,
  type NotebookContent,
} from '../files'
import { NOTEBOOK_EDIT_TOOL_NAME } from '../toolNames'
import { PROMPT } from './notebookEditPrompt'

/** 输入 duck 型（旧 zod InputSchema 5 字段 2 必填逐字段对齐，delta ①）。 */
export type NotebookEditInput = {
  notebook_path: string
  cell_id?: string
  new_source: string
  cell_type?: 'code' | 'markdown'
  edit_mode?: 'replace' | 'insert' | 'delete'
}

/** 输出型（旧 zod outputSchema z.infer 9 字段转写，delta ①）。 */
export type NotebookEditOutput = {
  new_source: string
  cell_id?: string
  cell_type: 'code' | 'markdown'
  language: string
  edit_mode: string
  error?: string
  // Fields for attribution tracking
  notebook_path: string
  original_file: string
  updated_file: string
}

/** 输入 JSON schema（旧 z.strictObject 5 字段逐字段转写，delta ①）。 */
export const NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    notebook_path: {
      type: 'string',
      description:
        'The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)',
    },
    cell_id: {
      type: 'string',
      description:
        'The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified.',
    },
    new_source: {
      type: 'string',
      description: 'The new source for the cell',
    },
    cell_type: {
      type: 'string',
      enum: ['code', 'markdown'],
      description:
        'The type of the cell (code or markdown). If not specified, it defaults to the current cell type. If using edit_mode=insert, this is required.',
    },
    edit_mode: {
      type: 'string',
      enum: ['replace', 'insert', 'delete'],
      description:
        'The type of edit to make (replace, insert, delete). Defaults to replace.',
    },
  },
  required: ['notebook_path', 'new_source'],
  additionalProperties: false,
}

// Tool 契约非参数化（readTool face 先例）；face 扩型 = getPath
// （PermissionTool duck 成员）+ checkPermissions 返回型收窄（writeTool face
// 先例）。
type NotebookEditToolFace = Tool & {
  getPath(input: Record<string, unknown>): string
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision>
}

export const NotebookEditTool: NotebookEditToolFace = {
  name: NOTEBOOK_EDIT_TOOL_NAME,
  inputSchema: NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA,
  inputJSONSchema: NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA,
  searchHint: 'edit Jupyter notebook cells (.ipynb)',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // delta ①：旧 z.strictObject 面
  strict: true,
  // delta ④：旧 def 无覆写 = 缺省值逐字（writeTool delta ④ 先例）
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  userFacingName: () => 'Edit Notebook',
  // delta ⑤：旧 TRANSCRIPT_CLASSIFIER 门分支裁 → 本体无条件随迁
  toAutoClassifierInput(input: unknown) {
    const { notebook_path, new_source, edit_mode } = input as NotebookEditInput
    return `${notebook_path} ${edit_mode ?? 'replace'}: ${new_source}`
  },
  async description() {
    // delta ⑧：新契约唯一 prompt 面 = 旧 prompt() 体
    return PROMPT
  },
  getPath(input: Record<string, unknown>): string {
    return (input as NotebookEditInput).notebook_path
  },
  async checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision> {
    // 逐字（旧 L150-155）：写面接线（writeTool L278-288 先例）
    const appState = (context as FilesToolUseContext).getAppState()
    return checkWritePermissionForTool(
      NotebookEditTool,
      input as Record<string, unknown>,
      appState.toolPermissionContext,
    )
  },
  // delta ⑧：旧 mapToolResult 4 支逐字
  mapToolResultToToolResultBlockParam(
    { cell_id, edit_mode, new_source, error }: NotebookEditOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    if (error) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result' as const,
        content: error,
        is_error: true,
      }
    }
    switch (edit_mode) {
      case 'replace':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result' as const,
          content: `Updated cell ${cell_id} with ${new_source}`,
        }
      case 'insert':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result' as const,
          content: `Inserted cell ${cell_id} with ${new_source}`,
        }
      case 'delete':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result' as const,
          content: `Deleted cell ${cell_id}`,
        }
      default:
        return {
          tool_use_id: toolUseID,
          type: 'tool_result' as const,
          content: 'Unknown edit mode',
        }
    }
  },
  // delta ⑥：旧 UI 非 verbose 面字符串逻辑逐字（JSX/verbose 双支裁 → TUI 波）
  renderToolUseMessage(
    input: unknown,
    _options: { verbose: boolean },
  ): unknown {
    const { notebook_path, cell_id, new_source, cell_type } =
      (input ?? {}) as Partial<NotebookEditInput>
    if (!notebook_path || !new_source || !cell_type) {
      return null
    }
    return `${getDisplayPath(notebook_path)}@${cell_id}`
  },
  // 9 码面逐字（delta ③：safeParseJSON → jsonParse try/catch → null）
  async validateInput(
    input: unknown,
    context: unknown,
  ): Promise<ValidationResult> {
    const {
      notebook_path,
      cell_type,
      cell_id,
      edit_mode = 'replace',
    } = input as NotebookEditInput
    // delta ⑨：context duck = FilesToolUseContext（readFileState? 可选链降级）
    const ctx = context as FilesToolUseContext
    const fullPath = isAbsolute(notebook_path)
      ? notebook_path
      : resolve(getCwd(), notebook_path)

    // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM
    // credential leaks.
    if (fullPath.startsWith('\\\\') || fullPath.startsWith('//')) {
      return { result: true }
    }

    if (extname(fullPath) !== '.ipynb') {
      return {
        result: false,
        message:
          'File must be a Jupyter notebook (.ipynb file). For editing other file types, use the FileEdit tool.',
        errorCode: 2,
      }
    }

    if (
      edit_mode !== 'replace' &&
      edit_mode !== 'insert' &&
      edit_mode !== 'delete'
    ) {
      return {
        result: false,
        message: 'Edit mode must be replace, insert, or delete.',
        errorCode: 4,
      }
    }

    if (edit_mode === 'insert' && !cell_type) {
      return {
        result: false,
        message: 'Cell type is required when using edit_mode=insert.',
        errorCode: 5,
      }
    }

    // Require Read-before-Edit (matches FileEditTool/FileWriteTool). Without
    // this, the model could edit a notebook it never saw, or edit against a
    // stale view after an external change — silent data loss.
    const readTimestamp = ctx.readFileState?.get(fullPath)
    if (!readTimestamp) {
      return {
        result: false,
        message:
          'File has not been read yet. Read it first before writing to it.',
        errorCode: 9,
      }
    }
    if (getFileModificationTime(fullPath) > readTimestamp.timestamp) {
      return {
        result: false,
        message:
          'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
        errorCode: 10,
      }
    }

    let content: string
    try {
      content = readFileSyncWithMetadata(fullPath).content
    } catch (e) {
      if (isENOENT(e)) {
        return {
          result: false,
          message: 'Notebook file does not exist.',
          errorCode: 1,
        }
      }
      throw e
    }
    // delta ③：旧 safeParseJSON（LRU memo → null 失败面）→ jsonParse
    // try/catch → null（失败面语义逐字）
    let notebook: NotebookContent
    try {
      notebook = jsonParse(content) as NotebookContent
    } catch {
      return {
        result: false,
        message: 'Notebook is not valid JSON.',
        errorCode: 6,
      }
    }
    if (!cell_id) {
      if (edit_mode !== 'insert') {
        return {
          result: false,
          message: 'Cell ID must be specified when not inserting a new cell.',
          errorCode: 7,
        }
      }
    } else {
      // First try to find the cell by its actual ID
      const cellIndex = notebook.cells.findIndex(cell => cell.id === cell_id)

      if (cellIndex === -1) {
        // If not found, try to parse as a numeric index (cell-N format)
        const parsedCellIndex = parseCellId(cell_id)
        if (parsedCellIndex !== undefined) {
          if (!notebook.cells[parsedCellIndex]) {
            return {
              result: false,
              message: `Cell with index ${parsedCellIndex} does not exist in notebook.`,
              errorCode: 7,
            }
          }
        } else {
          return {
            result: false,
            message: `Cell with ID "${cell_id}" not found in notebook.`,
            errorCode: 8,
          }
        }
      }
    }

    return { result: true }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<NotebookEditOutput>> {
    // delta ②：旧 4 参（args/context/_/parentMessage）→ 2 参（S-C5 delta ⑧
    // 先例；parentMessage/updateFileHistoryState = fileHistory 支消费面已裁）
    const {
      notebook_path,
      new_source,
      cell_id,
      cell_type: inputCellType,
      edit_mode: originalEditMode,
    } = (args ?? {}) as NotebookEditInput
    // delta ⑦：旧解构 const 重赋值 → 本地 let（语义逐字）
    let cell_type = inputCellType
    // delta ⑨：readFileState? 可选链降级（缺 = no-op 零崩溃面）
    const { readFileState } = context as FilesToolUseContext
    const fullPath = isAbsolute(notebook_path)
      ? notebook_path
      : resolve(getCwd(), notebook_path)

    try {
      // readFileSyncWithMetadata gives content + encoding + line endings in
      // one safeResolvePath + readFileSync pass, replacing the previous
      // detectFileEncoding + readFile + detectLineEndings chain (each of
      // which redid safeResolvePath and/or a 4KB readSync).
      const { content, encoding, lineEndings } =
        readFileSyncWithMetadata(fullPath)
      // Must use non-memoized jsonParse here: safeParseJSON caches by content
      // string and returns a shared object reference, but we mutate the
      // notebook in place below (cells.splice, targetCell.source = ...).
      // Using the memoized version poisons the cache for validateInput() and
      // any subsequent call() with the same file content.
      // （delta ③：新仓 jsonParse 非 memo 双站独立——注释面随迁保因果链。）
      let notebook: NotebookContent
      try {
        notebook = jsonParse(content) as NotebookContent
      } catch {
        return {
          data: {
            new_source,
            cell_type: cell_type ?? 'code',
            language: 'python',
            edit_mode: 'replace',
            error: 'Notebook is not valid JSON.',
            cell_id,
            notebook_path: fullPath,
            original_file: '',
            updated_file: '',
          },
        }
      }

      let cellIndex: number
      if (!cell_id) {
        cellIndex = 0 // Default to inserting at the beginning if no cell_id is provided
      } else {
        // First try to find the cell by its actual ID
        cellIndex = notebook.cells.findIndex(cell => cell.id === cell_id)

        // If not found, try to parse as a numeric index (cell-N format)
        if (cellIndex === -1) {
          const parsedCellIndex = parseCellId(cell_id)
          if (parsedCellIndex !== undefined) {
            cellIndex = parsedCellIndex
          }
        }

        if (originalEditMode === 'insert') {
          cellIndex += 1 // Insert after the cell with this ID
        }
      }

      // Convert replace to insert if trying to replace one past the end
      let edit_mode = originalEditMode
      if (edit_mode === 'replace' && cellIndex === notebook.cells.length) {
        edit_mode = 'insert'
        if (!cell_type) {
          cell_type = 'code' // Default to code if no cell_type specified
        }
      }

      const language = notebook.metadata.language_info?.name ?? 'python'
      let new_cell_id: string | undefined = undefined
      if (
        notebook.nbformat > 4 ||
        (notebook.nbformat === 4 && notebook.nbformat_minor >= 5)
      ) {
        if (edit_mode === 'insert') {
          new_cell_id = Math.random().toString(36).substring(2, 15)
        } else if (cell_id !== null) {
          new_cell_id = cell_id
        }
      }

      if (edit_mode === 'delete') {
        // Delete the specified cell
        notebook.cells.splice(cellIndex, 1)
      } else if (edit_mode === 'insert') {
        let new_cell: NotebookCell
        if (cell_type === 'markdown') {
          new_cell = {
            cell_type: 'markdown',
            id: new_cell_id,
            source: new_source,
            metadata: {},
          }
        } else {
          new_cell = {
            cell_type: 'code',
            id: new_cell_id,
            source: new_source,
            metadata: {},
            execution_count: null,
            outputs: [],
          }
        }
        // Insert the new cell
        notebook.cells.splice(cellIndex, 0, new_cell)
      } else {
        // Find the specified cell
        const targetCell = notebook.cells[cellIndex]! // validateInput ensures cell_number is in bounds
        targetCell.source = new_source
        if (targetCell.cell_type === 'code') {
          // Reset execution count and clear outputs since cell was modified
          targetCell.execution_count = null
          targetCell.outputs = []
        }
        if (cell_type && cell_type !== targetCell.cell_type) {
          targetCell.cell_type = cell_type
        }
      }
      // Write back to file
      const IPYNB_INDENT = 1
      // 新 jsonStringify 签名 (data, space)：replacer 参位裁（旧调用点传 null
      // ≡ 新实现硬编码 undefined，零行为差，delta ③ 登记）
      const updatedContent = jsonStringify(notebook, IPYNB_INDENT)
      writeTextContent(fullPath, updatedContent, encoding, lineEndings)
      // Update readFileState with post-write mtime (matches FileEditTool/
      // FileWriteTool). offset:undefined breaks FileReadTool's dedup match —
      // without this, Read→NotebookEdit→Read in the same millisecond would
      // return the file_unchanged stub against stale in-context content.
      readFileState?.set(fullPath, {
        content: updatedContent,
        timestamp: getFileModificationTime(fullPath),
        offset: undefined,
        limit: undefined,
      })
      const data: NotebookEditOutput = {
        new_source,
        cell_type: cell_type ?? 'code',
        language,
        edit_mode: edit_mode ?? 'replace',
        cell_id: new_cell_id || undefined,
        error: '',
        notebook_path: fullPath,
        original_file: content,
        updated_file: updatedContent,
      }
      return {
        data,
      }
    } catch (error) {
      if (error instanceof Error) {
        const data: NotebookEditOutput = {
          new_source,
          cell_type: cell_type ?? 'code',
          language: 'python',
          edit_mode: 'replace',
          error: error.message,
          cell_id,
          notebook_path: fullPath,
          original_file: '',
          updated_file: '',
        }
        return {
          data,
        }
      }
      const data: NotebookEditOutput = {
        new_source,
        cell_type: cell_type ?? 'code',
        language: 'python',
        edit_mode: 'replace',
        error: 'Unknown error occurred while editing notebook',
        cell_id,
        notebook_path: fullPath,
        original_file: '',
        updated_file: '',
      }
      return {
        data,
      }
    }
  },
}
