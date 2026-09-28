/**
 * engine/skill — 命令消息 XML tag 常量 + 空内容哨兵（§8.67 D 波 S-E2a）。
 *
 * 旧仓 src/constants/xml.ts 中 skill/命令面消费子集（逐字值）：
 *   COMMAND_NAME_TAG / COMMAND_MESSAGE_TAG / COMMAND_ARGS_TAG。
 * 旧仓 src/constants/messages.ts NO_CONTENT_MESSAGE = '(no content)'。
 * 旧仓其余 tag（BASH_* / LOCAL_COMMAND_* / TICK / TASK_NOTIFICATION）=
 * 本域零消费 → 不迁（TUI/消息波按面归属落）。
 */
export const COMMAND_NAME_TAG = 'command-name'
export const COMMAND_MESSAGE_TAG = 'command-message'
export const COMMAND_ARGS_TAG = 'command-args'
export const NO_CONTENT_MESSAGE = '(no content)'
