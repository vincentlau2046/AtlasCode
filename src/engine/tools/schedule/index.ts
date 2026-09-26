/**
 * engine/tools/schedule 子门面（§8.56 S-D4，STR-1 显式名块纪律）。
 *
 * 覆盖 cron 三件套本体（cronCreateTool / cronDeleteTool / cronListTool 各
 * 1 对象 + JSON schema 常量 + Output 型）+ prompt/门面（schedulePrompt：
 * isCronEnabled/isDurableCronEnabled 双门 + DEFAULT_MAX_AGE_DAYS + 3 短
 * DESCRIPTION 常量 + 3 长 prompt builder）+ duck 型（scheduleToolInput
 * 3 型，无 context duck——cron 三件套 call 零 context 参）。
 *
 * 纪律（tools/index.ts bash 块先例）：逐名显式 re-export，无 `export *`；
 * 各文件头注 delta 登记不随门面重复（单一事实源 = 各模块头注）。
 *
 * 注册表槽：② AGENT_TRIGGERS 槽 materialize（3 工具 isEnabled =
 * isCronEnabled 自门控，ATLAS_DISABLE_CRON kill-switch）；scheduler 域
 * （E-7 S-7b）消费面 = 本子波（scheduler 门面头注登记的工具本体波）。
 *
 * 消费方：tools/ 门面 S-D4 re-export 块 + 组合根 baseTools 注入位。
 */
export {
  CRON_CREATE_TOOL_INPUT_SCHEMA,
  CronCreateTool,
  type CronCreateOutput,
} from './cronCreateTool'
export {
  CRON_DELETE_TOOL_INPUT_SCHEMA,
  CronDeleteTool,
  type CronDeleteOutput,
} from './cronDeleteTool'
export {
  CRON_LIST_TOOL_INPUT_SCHEMA,
  CronListTool,
  type CronListOutput,
} from './cronListTool'
// ── prompt/门面（schedulePrompt；3 短 DESCRIPTION 常量导出不接线，TUI 波
//    前向接缝，同 S-D3 DESCRIPTION 族）──
export {
  isCronEnabled,
  isDurableCronEnabled,
  DEFAULT_MAX_AGE_DAYS,
  buildCronCreateDescription,
  buildCronCreatePrompt,
  CRON_DELETE_DESCRIPTION,
  buildCronDeletePrompt,
  CRON_LIST_DESCRIPTION,
  buildCronListPrompt,
} from './schedulePrompt'
// ── duck 型（scheduleToolInput.ts）──
export type {
  CronCreateToolInput,
  CronDeleteToolInput,
  CronListToolInput,
} from './scheduleToolInput'
