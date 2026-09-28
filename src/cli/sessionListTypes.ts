/**
 * cli（CLI 公共域）S-C4（§8.71.1.4）— session 列表面类型（sessionList.ts
 * 消费面；独立型文件防循环 import）。
 *
 * 字段面 = 新仓 loader 可读 LogOption 子集（旧 types/logs.ts LogOption 裁至
 * engine resume 消费子集后，CLI list 面再裁至 loadTranscriptFile 可产字段；
 * 裁登记见 sessionList.ts 头注）。
 */
export type SessionLogEntry = {
  /** session id（= .jsonl 文件名 stem）。 */
  sessionId: string
  /** 首条有效用户消息（extractFirstPrompt 截断 200 字符语义）。 */
  firstPrompt: string
  messageCount: number
  /** 文件 mtime（旧 LogOption created/modified 同口径）。 */
  created: Date
  modified: Date
  customTitle?: string
  tag?: string
  summary?: string
  /** 叶消息 git 分支戳（缺省 undefined）。 */
  gitBranch?: string
}
