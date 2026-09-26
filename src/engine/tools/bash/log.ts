/**
 * engine/tools/bash — logError 域内转出位（§8.53 S-T1 原域内 shim；
 * §8.55 S-C1 提升 shared/log.ts 后此处改 re-export，域内相对导入
 * （shellQuote / platform `./log`）零改动；单一事实源在 shared）。
 *
 * 提升裁定与 shim 语义头注（旧仓 log.ts 遥测面裁剪 / HARD_FAIL 不随迁
 * 登记）随迁至 src/shared/log.ts 头注。
 */
export { logError } from '../../../shared'
