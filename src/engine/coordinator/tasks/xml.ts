/**
 * tasks 域 XML 面 — 通知模板 tag 常量 + escapeXml（S-7a）
 *
 * 旧仓来源（a8af45b）:
 *   - src/constants/xml.ts L28-38 task-notification 族 tag 常量
 *     （本层仅消费 10 个：notification 模板 7 + agent 通知 worktree 3）
 *   - src/utils/xml.ts escapeXml（L5-8 逐字；escapeXmlAttr 零消费 → 不迁）
 *
 * 裁剪登记（复审勿当遗漏重提）：
 *   - REASON_TAG 等其余 xml tag 常量（旧仓 87+ 个）零消费 → 不迁。
 *   - escapeXmlAttr：S-7a 全部通知模板只把不可信串放元素文本（tag 之间），
 *     无属性插值消费点 → 不迁（前向：UI 波若需属性插值再补）。
 */

export const TASK_NOTIFICATION_TAG = 'task-notification'
export const TASK_ID_TAG = 'task-id'
export const TOOL_USE_ID_TAG = 'tool-use-id'
export const TASK_TYPE_TAG = 'task-type'
export const OUTPUT_FILE_TAG = 'output-file'
export const STATUS_TAG = 'status'
export const SUMMARY_TAG = 'summary'
export const WORKTREE_TAG = 'worktree'
export const WORKTREE_PATH_TAG = 'worktreePath'
export const WORKTREE_BRANCH_TAG = 'worktreeBranch'

/**
 * 转义 XML/HTML 特殊字符，供不可信串（进程 stdout、用户输入、外部数据）
 * 插进 `<tag>${here}</tag>` 元素文本（旧仓 utils/xml.ts 逐字）。
 */
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
