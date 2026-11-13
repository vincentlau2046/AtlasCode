/**
 * 发布通道类型（S3a ② type 重定位：原 tui/utils/config.ts 单行 union 机械切出；
 *  config.ts 留壳 re-export，消费方直改 kernel 路径）。
 */
export type ReleaseChannel = 'stable' | 'latest'
