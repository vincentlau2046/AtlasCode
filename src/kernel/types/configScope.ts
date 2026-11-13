/**
 * 0.1.106 S3b 切片 2 —— ConfigScope 系自包含提取（f4 批复「剩余 4 条 type 边
 * 机械闭合」单元 ④）。原 tui/services/mcp/types.ts 的 ConfigScopeSchema +
 * ConfigScope（lazySchema + zod 自包含，lazySchema 复用 kernel/utils 单源），
 * 因首车随迁文件（kernel/utils/settings/validation.ts）存在 type 边而提取至
 * kernel/types；源侧 tui/services/mcp/types.ts re-export 兜底，既有消费方
 * 零改动。行为零改动。
 */
import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'

export const ConfigScopeSchema = lazySchema(() =>
  z.enum([
    'local',
    'user',
    'project',
    'dynamic',
    'enterprise',
    'claudeai',
    'managed',
  ]),
)
export type ConfigScope = z.infer<ReturnType<typeof ConfigScopeSchema>>
