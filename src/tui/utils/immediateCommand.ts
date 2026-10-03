/**
 * Whether inference-config commands (/model, /fast, /effort) should execute
 * immediately (during a running query) rather than waiting for the current
 * turn to finish.
 *
 * 2026-10-04 issule-analyst 工单 Task B：恒 true（原 growthbook 死 stub
 * `atlas_immediate_model_command` 恒 false——AtlasCode 无 growthbook，gate
 * 是死码；配置命令 busy 态立即生效，显式 opt-out 面 = 各命令
 * immediate: false）。
 */
export function shouldInferenceConfigCommandBeImmediate(): boolean {
  return true
}
