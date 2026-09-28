/**
 * scheduler 域 — cron jitter config（旧仓 src/utils/cronJitterConfig.ts 75L）
 *
 * 落位：engine/scheduler（E-7 第 2 leaf，§8.47 详案）。独立成文件是为让
 * scheduler 可进 Agent SDK public build 而不拖 analytics/growthbook 的大
 * 传递依赖（settings/hooks/config cycle）。
 *
 * 依赖映射（新仓）：
 *   - CronJitterConfig 类型 + DEFAULT_CRON_JITTER_CONFIG → 本域 cronTasks（
 *     旧仓同置 cronTasks.js）。
 *   - lazySchema → shared；zod/v4 → zod（新仓主入口 = v4）。
 *   - getFeatureValue_CACHED_WITH_REFRESH（analytics/growthbook）→ **整砍**：
 *     新仓无 GrowthBook（analytics/modelprovider 域，非本 leaf 依赖面）。
 *     改为**注入口**（setCronJitterConfigProvider），缺省返回 DEFAULT；组合根
 *     / 未来 analytics 波可注 GrowthBook-backed 实现整换（前向接缝登记）。
 *   - [§8.69 核销] 保裁确认：新仓无 growthbook 域，jitter 配置经本地注入口
 *     setCronJitterConfigProvider（facade 导出，组合根未接线，缺省 DEFAULT）
 *     注入，growthbook-backed 实现 = 遥测后端未落域外（登记核销，不复活）。
 *
 * 保留语义：schema 校验 + 违界回落（旧仓逐字）。缺省 provider 返回井构的
 * DEFAULT（恒通过 schema → 得 DEFAULT）；注入 provider 返回 raw config 时
 * 仍走 schema 校验，任一字段违界整对象回落 DEFAULT（防 fat-finger push）。
 */
import { lazySchema } from '../../shared'
import { z } from 'zod'
import {
  type CronJitterConfig,
  DEFAULT_CRON_JITTER_CONFIG,
} from './cronTasks'

// Upper bounds here are defense-in-depth against fat-fingered config pushes.
// Like pollConfig.ts, Zod rejects the whole object on any violation rather
// than partially trusting it — a config with one bad field falls back to
// DEFAULT_CRON_JITTER_CONFIG entirely. oneShotFloorMs shares oneShotMaxMs's
// ceiling (floor > max would invert the jitter range) and is cross-checked in
// the refine; the shared ceiling keeps the individual bound explicit in the
// error path. recurringMaxAgeMs uses .default() so a pre-existing config
// without the field doesn't get wholesale-rejected — the other fields were
// added together at config inception and don't need this.
const HALF_HOUR_MS = 30 * 60 * 1000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const cronJitterConfigSchema = lazySchema(() =>
  z
    .object({
      recurringFrac: z.number().min(0).max(1),
      recurringCapMs: z.number().int().min(0).max(HALF_HOUR_MS),
      oneShotMaxMs: z.number().int().min(0).max(HALF_HOUR_MS),
      oneShotFloorMs: z.number().int().min(0).max(HALF_HOUR_MS),
      oneShotMinuteMod: z.number().int().min(1).max(60),
      recurringMaxAgeMs: z
        .number()
        .int()
        .min(0)
        .max(THIRTY_DAYS_MS)
        .default(DEFAULT_CRON_JITTER_CONFIG.recurringMaxAgeMs),
    })
    .refine(c => c.oneShotFloorMs <= c.oneShotMaxMs),
)

/**
 * Jitter config provider injection window（旧仓 getCronJitterConfig 的
 * GrowthBook 读取整砍后的替身，见模块头注）。缺省 = 井构 DEFAULT（恒通过
 * schema）。组合根 / 未来 analytics 波可注 GrowthBook-backed 实现（返回
 * raw config，仍走 schema 校验 + 违界回落 DEFAULT）。
 */
let jitterConfigProvider: () => CronJitterConfig = () => DEFAULT_CRON_JITTER_CONFIG

export function setCronJitterConfigProvider(
  provider: () => CronJitterConfig,
): void {
  jitterConfigProvider = provider
}

/**
 * 返回本 tick 使用的 jitter config，缺省 = DEFAULT_CRON_JITTER_CONFIG。
 * 旧仓从 GrowthBook 读 `atlas_cron_config` 校验回落；新仓经注入口取（缺省
 * DEFAULT），导出此函数让 ops runbook / 测试指向单一入口。
 */
export function getCronJitterConfig(): CronJitterConfig {
  const raw = jitterConfigProvider()
  const parsed = cronJitterConfigSchema().safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_CRON_JITTER_CONFIG
}
