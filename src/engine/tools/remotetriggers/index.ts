/**
 * engine/tools/remotetriggers — RemoteTriggerTool 子域门面（§8.68 remote
 * 波 S-E2c；STR-1 显式命名 re-export，零 `export *`；49 本体 ③ 槽
 * AGENT_TRIGGERS_REMOTE materialize 落面）。
 *
 * 消费方：`tools/` 门面 re-export（remotetriggers 子域块）+ `engine/`
 * 根门面按消费面收窄（RemoteTriggerTool + REMOTE_TRIGGER_TOOL_NAME 由
 * toolNames 块出）+ 组合根 baseTools 注入位（S-E2d 回填）。
 */
export {
  RemoteTriggerTool,
  REMOTE_TRIGGER_TOOL_INPUT_SCHEMA,
  isRemoteTriggersEnabled,
  type RemoteTriggerToolInput,
  type RemoteTriggerToolOutput,
} from './remoteTriggerTool'
export {
  REMOTE_TRIGGER_DESCRIPTION,
  REMOTE_TRIGGER_PROMPT,
} from './remoteTriggerPrompt'
export {
  getRemoteTriggersPort,
  setRemoteTriggersPort,
  clearRemoteTriggersPort,
  REMOTE_TRIGGERS_HOLD_MESSAGE,
  type RemoteTriggersPort,
  type RemoteTriggerResponse,
} from './remoteTriggersPort'
