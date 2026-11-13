/**
 * 0.1.106 S3b 切片 2 —— fileHistory 型自包含提取（f4 批复「剩余 4 条 type 边
 * 机械闭合」单元 ②）。原 tui/utils/fileHistory.ts 的 3 型（BackupFileName 局部
 * 型 + FileHistoryBackup + FileHistorySnapshot），因首车随迁文件
 * （kernel/types/logs.ts）存在 type 边而提取至 kernel/types；源侧
 * tui/utils/fileHistory.ts re-export 兜底，既有消费方零改动。纯字面量级，
 * 行为零改动。
 */
import type { UUID } from 'crypto'

export type BackupFileName = string | null // The null value means the file does not exist in this version

export type FileHistoryBackup = {
  backupFileName: BackupFileName
  version: number
  backupTime: Date
}

export type FileHistorySnapshot = {
  messageId: UUID // The associated message ID for this snapshot
  trackedFileBackups: Record<string, FileHistoryBackup> // Map of file paths to backup versions
  timestamp: Date
}
