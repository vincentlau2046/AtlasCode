/**
 * engine/tools/skill 子门面（§8.67 D 波 S-E2b SkillTool 本体子波，STR-1
 * 显式名块纪律）。
 *
 * 域内文件归属：
 *   skillTool.ts      — SkillTool 本体（1 对象 + JSON schema 1 常量
 *                       SKILL_TOOL_INPUT_SCHEMA + checkPermissions 权限面
 *                       + validateInput 4 码 + executeForkedSkill fork 支
 *                       + renderToolUseMessage 字符串面；旧仓 915L R2
 *                       裁面，delta ①-⑰）
 *   skillPrompt.ts    — prompt 面（旧仓 prompt.ts 213L 落面：
 *                       getSkillPrompt 模板 + 命令预算面
 *                       formatCommandsWithinBudget/getCharBudget 族 +
 *                       计数面 getSkillToolInfo/getSkillInfo；delta ①-⑦）
 *   skillToolInput.ts — Input/Output/Context duck 型族 7（delta ①-③）
 *
 * 纪律（tools/index.ts toolsearch 块先例）：逐名显式 re-export，无
 * `export *`；各文件头注 delta 登记不随门面重复（单一事实源 = 各模块
 * 头注）。
 *
 * 重名登记：SKILL_TOOL_NAME 由 toolNames 块单一事实源（T-5d seed，
 * 不重出）；prompt 面 getSkillPrompt = Tool.description() 唯一实现体
 * （web 族 getWebFetchToolPrompt 先例同位）。
 *
 * 裁面前向接缝（各文件头注 delta 登记，复审勿当遗漏重提）：
 *   - executeRemoteSkill / MCP skill 注入窗 / REMOTE_SAFE·BRIDGE_SAFE
 *     → remote 波（task #142）
 *   - COMMANDS ~70 TUI 命令 / skillChangeDetector / UI JSX 面 → TUI 波
 *   - newMessages/contextModifier 消费 = pipeline 0 消费 → 消息/REPL 波
 *
 * 消费方：tools/ 门面 re-export 块（namespaced 导出面）+ 组合根
 * baseTools 注入位（S-E2d 回填）；skill 族无专属门控槽 = 无条件注册面
 * （同 web/config 族，49 口径 29/49 → 30/49）。
 */
export {
  SKILL_TOOL_INPUT_SCHEMA,
  SkillTool,
} from './skillTool'
export {
  SKILL_BUDGET_CONTEXT_PERCENT,
  CHARS_PER_TOKEN,
  DEFAULT_CHAR_BUDGET,
  MAX_LISTING_DESC_CHARS,
  getMaxListingDescChars,
  stringWidth,
  truncate,
  getCharBudget,
  formatCommandsWithinBudget,
  getSkillPrompt,
  getSkillToolInfo,
  getLimitedSkillToolCommands,
  clearPromptCache,
  getSkillInfo,
} from './skillPrompt'
export {
  type SkillToolInput,
  type SkillToolInlineOutput,
  type SkillToolForkedOutput,
  type SkillToolOutput,
  type SkillToolCallContext,
  type SkillToolCheckContext,
  type SkillToolContextModifierCtx,
} from './skillToolInput'
