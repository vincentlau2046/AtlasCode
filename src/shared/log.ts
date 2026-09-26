/**
 * shared — logError 跨域叶子（§8.55 S-C1 自 engine/tools/bash/log.ts 提升；
 * C-Deep T5 提升先例：shared/configDir、shared/tempDir 同源裁定——shared =
 * 唯一跨域叶子汇，两域消费者（bash §8.53 S-T1 / files §8.55）不各持一份
 * 拷贝）。
 *
 * 原 bash 域内 shim 头注（§8.53 S-T1；遥测裁剪登记）逐字保留：
 *
 * 旧仓 `src/utils/log.ts` logError = 遥测错误上报（1P analytics + 内存日志 +
 * HARD_FAIL 出口）。新仓遥测 sink 2026-09-18 瘦身整删（no-op sink + 879 调用点
 * 全删），无错误上报渠道 → 降级 logForDebugging（shared/debug no-op 占位，
 * charter C-4 logging port 落地后调用点零改动）。行为 delta 登记：旧 HARD_FAIL
 * process.exit(1) 面不随迁（新仓无 HARD_FAIL 模式面，H6 前向接缝）。
 */
import { logForDebugging } from './debug'

export function logError(error: unknown): void {
  logForDebugging(
    `logError: ${
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    }`,
    { level: 'error' },
  )
}
