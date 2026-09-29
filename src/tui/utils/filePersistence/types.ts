export * from '../../types/all-local-types.js';
export const DEFAULT_UPLOAD_CONCURRENCY: number = 5;
// 上传失败的文件：记录文件名与错误信息（error 来自 UploadResult 的失败变体）
export type FailedPersistence = { filename: string; error: string };
export const FILE_COUNT_LIMIT: number = 100;
// 一轮持久化的汇总事件数据：成功文件 + 失败文件
export type FilesPersistedEventData = { files: PersistedFile[]; failed: FailedPersistence[] };
export const OUTPUTS_SUBDIR: string = "outputs";
// 成功持久化的文件条目：filename 为上传时的相对路径，file_id 为 Files API 返回的 ID
export type PersistedFile = { filename: string; file_id: string };
// 一轮开始时间戳（epoch 毫秒），用于与文件 mtimeMs 比较以筛选本回合修改的文件
export type TurnStartTime = number;
