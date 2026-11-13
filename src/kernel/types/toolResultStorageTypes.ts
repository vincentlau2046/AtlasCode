/**
 * 0.1.106 S3b 切片 2 —— toolResultStorage 型自包含提取（f4 批复「剩余 4 条
 * type 边机械闭合」单元 ③）。原 tui/utils/toolResultStorage.ts 的
 * ContentReplacementRecord（4 行字面量字段），因首车随迁文件
 * （kernel/types/logs.ts）存在 type 边而提取至 kernel/types；源侧
 * tui/utils/toolResultStorage.ts re-export 兜底，既有消费方零改动。
 * 行为零改动。
 */

/**
 * Serializable record of one content-replacement decision. Written to the
 * transcript as a ContentReplacementEntry so decisions survive resume.
 * Discriminated by `kind` so future replacement mechanisms (user text,
 * offloaded images) can share the same transcript entry type.
 *
 * `replacement` is the exact string the model saw — stored rather than
 * derived on resume so code changes to the preview template, size formatting,
 * or path layout can't silently break prompt cache.
 */
export type ContentReplacementRecord = {
  kind: 'tool-result'
  toolUseId: string
  replacement: string
}
