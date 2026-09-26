/**
 * engine/tools/files — FileEdit 常量面（§8.55 S-C6，Write+Edit 本体）。
 *
 * 旧仓来源（a8af45b）：src/tools/FileEditTool/constants.ts 12L 逐字随迁。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① 旧 FILE_EDIT_TOOL_NAME = 'Edit' 本文件定义 → 新仓工具名单一事实源
 *    = ../toolNames（FILE_EDIT_TOOL_NAME 已落，S-C1 先例）→ 本文件不重复
 *    定义（防双源）；消费点 import 改指 toolNames。
 *  ② 两权限 pattern 常量（ATLAS_FOLDER/GLOBAL_ATLAS_FOLDER_PERMISSION_
 *    PATTERN）新仓暂无消费面（permissions/filesystem.ts ⑤ 头注「归
 *    engine」未落，gate 波前向接缝）→ 本体保留（纯常量零成本），消费面
 *    随 gate 波落。
 */
import { getConfigDirName } from '../../../shared'

// Permission pattern for granting session-level access to the project's .atlas/ folder
export const ATLAS_FOLDER_PERMISSION_PATTERN = `/${getConfigDirName()}/**`

// Permission pattern for granting session-level access to the global ~/.atlas/ folder
export const GLOBAL_ATLAS_FOLDER_PERMISSION_PATTERN = `~/${getConfigDirName()}/**`

export const FILE_UNEXPECTEDLY_MODIFIED_ERROR =
  'File has been unexpectedly modified. Read it again before attempting to write it.'
