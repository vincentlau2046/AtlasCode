import type { NonNullableUsage } from '../../entrypoints/sdk/sdkUtilityTypes.js'
import { EMPTY_USAGE } from './emptyUsage.js'

export type { NonNullableUsage }
export { EMPTY_USAGE }

// Strategy used for global prompt caching
export type GlobalCacheStrategy = 'tool_based' | 'system_prompt' | 'none'

// P6：API 遥测函数链（logAPIQuery / logAPIError / logAPISuccessAndDuration /
// logAPISuccess）随 fastMode 遥测数据面清理整体删除——全仓零调用点的孤儿链
// （coverage 0%，atlas_api_* 与 api_request/api_error OTel 事件已无发射方，
// 现存唯一 API 遥测为 sideQuery.ts 内联的 atlas_api_success）。
