/**
 * engine/tools/files — Glob/Grep 本体 duck 型（§8.55 S-C4，高频族纵切
 * 子波 3）。
 *
 * 旧仓来源（a8af45b）：zod inputSchema 推断型（GlobTool InputSchema 2 字段
 * / GrepTool InputSchema 14 字段）+ ToolUseContext 消费子集
 * （GlobTool call 解构 { abortController, getAppState, globLimits }，
 * 旧 Tool.ts:268 `globLimits?: { maxResults?: number }`；GrepTool call
 * 解构 { abortController, getAppState }）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - duck 型 = 类型位单一事实源（S-B5 bashToolInput 先例）：新 shared
 *    Tool 契约 call 2 参（args: unknown / context: unknown），工具本体
 *    入口 cast 到本 duck 型；旧 zod 运行时校验层裁（S-C1 semantic delta
 *    同源裁定——纯 JSON schema 无 zod 运行时，字符串数字/布尔容忍 =
 *    GrepTool call 入口 semantic 转换，见 grepTool 头注）。
 *  - GrepToolInput 数值/布尔字段 = **转换后**类型（number/boolean）；
 *    运行时原始输入可能为字符串字面量（"30"/"true"），由 call 入口
 *    semanticToNumber/semanticToBoolean 转换（S-C1 语义 delta 逐字）。
 *  - FilesToolUseContext.getAppState 返回面 = toolPermissionContext 单
 *    成员 duck（Glob/Grep call + checkPermissions 仅消费该成员；全
 *    AppState 面 = 残留守，真 ToolUseContext 全字段面 D 波/TUI 波）。
 *
 * S-C5 扩面（§8.55，Read 本体消费子集）：
 *  - ReadToolInput = 旧 zod 4 字段（file_path/offset/limit/pages）；
 *    offset/limit = **转换后**类型（number），字符串数字容忍 = call/render
 *    入口 semanticToNumber 转换（S-C1/S-C4 先例，readTool delta ②）。
 *  - FileState/ReadFileState = 旧 utils/fileStateCache.ts 值形 + get/set
 *    duck（readTool delta ⑭：LRU 100 条/25MB 驱逐不随迁，新仓无
 *    lru-cache 依赖，缓存实例创建 = 组合根/D 波责任，Map 即满足 duck）。
 *  - FilesToolUseContext 新增 3 可选成员（readFileState?/fileReadingLimits?/
 *    nestedMemoryAttachmentTriggers?）：引擎侧注入位未落（组合根/D 波
 *    接线），旧调用点全 ?. 可选链 → 缺省零崩溃面（dedup 面缺省跳过 =
 *    dedup 引入前基线，readTool delta ⑭/⑨）。
 *
 * S-C6 扩面（§8.55，Write+Edit 本体消费子集）：
 *  - WriteToolInput = 旧 zod strictObject 2 字段（无字符串容忍字段）。
 *  - Edit 输入 duck = fileEditTypes 的 FileEditInput（S-C1 已落，本文件
 *    不重复定义）；replace_all 字符串布尔容忍 = call/validate 入口
 *    semanticToBoolean 转换（fileEditTool delta ②）。
 *  - Write/Edit call/validate 消费 FilesToolUseContext 既有成员
 *    （getAppState + readFileState?）：旧 context 的 userModified /
 *    updateFileHistoryState / dynamicSkillDirTriggers 三成员随 fileHistory /
 *    skills 域裁面而裁（fileWriteTool/fileEditTool 头注登记）→ 无新增
 *    成员；readFileState 缺省降级 = 可选链（validate 恒「未读」支 /
 *    call 既有文件恒 stale 支，S-C5 delta ⑭ 缺省零崩溃先例）。
 */
import type { ToolPermissionContext } from '../../../shared'
import type { FileReadingLimits } from './readFileLimits'

/** Glob 输入（旧 zod 2 字段逐字段对齐）。 */
export interface GlobToolInput {
  pattern: string
  path?: string
}

/** Grep 输入（旧 zod 14 字段逐字段对齐；语义容忍字段 = 转换后类型）。 */
export interface GrepToolInput {
  pattern: string
  path?: string
  glob?: string
  output_mode?: 'content' | 'files_with_matches' | 'count'
  '-B'?: number
  '-A'?: number
  '-C'?: number
  context?: number
  '-n'?: boolean
  '-i'?: boolean
  type?: string
  head_limit?: number
  offset?: number
  multiline?: boolean
}

/** Read 输入（旧 zod 4 字段逐字段对齐；offset/limit = 转换后类型）。 */
export interface ReadToolInput {
  file_path: string
  offset?: number
  limit?: number
  pages?: string
}

/**
 * Write 输入（§8.55 S-C6；旧 zod strictObject 2 字段逐字段对齐，
 * 无字符串容忍字段）。
 */
export interface WriteToolInput {
  file_path: string
  content: string
}

/** 旧 FileState（旧仓 utils/fileStateCache.ts:4-15 形逐字）。 */
export interface FileState {
  content: string
  timestamp: number
  offset: number | undefined
  limit: number | undefined
  // True when this entry was populated by auto-injection (e.g. ATLAS.md) and
  // the injected content did not match disk (stripped HTML comments, stripped
  // frontmatter, truncated MEMORY.md). The model has only seen a partial view;
  // Edit/Write must require an explicit Read first. `content` here holds the
  // RAW disk bytes (for getChangedFiles diffing), not what the model saw.
  isPartialView?: boolean
}

/**
 * readFileState duck（旧 FileStateCache LRU 消费面 get/set，delta ⑭；
 * LRU 100 条/25MB 驱逐不随迁 — 缓存实例创建 = 组合根/D 波责任，
 * Map 即满足本 duck）。
 */
export interface ReadFileState {
  get(key: string): FileState | undefined
  set(key: string, value: FileState): unknown
}

/**
 * Glob/Grep/Read call + checkPermissions 消费 context 子集（旧
 * ToolUseContext 解构面 duck；globLimits 仅 Glob 消费；S-C5 新增 3
 * 可选成员 = Read 消费面，引擎侧注入位未落 → 组合根/D 波接线）。
 */
export interface FilesToolUseContext {
  getAppState(): { toolPermissionContext: ToolPermissionContext }
  abortController: AbortController
  globLimits?: { maxResults?: number }
  /** Read dedup/state 面（delta ⑭：缺省 = dedup 跳过 + 不写状态）。 */
  readFileState?: ReadFileState
  /** Read 输出限额 override（缺省 = getDefaultFileReadingLimits）。 */
  fileReadingLimits?: FileReadingLimits
  /** nested memory attachment 触发面（旧调用点 ?. 可选链，零崩溃面）。 */
  nestedMemoryAttachmentTriggers?: Set<string>
}
