import { ASCEND_TOOL_USAGE_GUIDE } from "./prompt.js"

/**
 * Return the Ascend NPU tool & skill usage guide.
 * Always-on: tells the model WHEN to invoke the 16 tools and 5 skills.
 */
export function getAscendSystemPromptSection(): string {
  return ASCEND_TOOL_USAGE_GUIDE
}