/**
 * autoMode 子域 — 分类器提示词数据 + 外部模板解析（§8.65，
 * 旧仓 yoloClassifier.ts:47-133 语义 + yolo-classifier-prompts/*.txt 数据）。
 *
 * 旧仓来源：BASE_PROMPT / EXTERNAL_PERMISSIONS_TEMPLATE（.txt 资产）+
 * extractTaggedBullets / getDefaultExternalAutoModeRules / buildDefaultExternalSystemPrompt。
 *
 * 裁剪 delta（复审勿当遗漏重提）：
 * ① 旧 `feature('TRANSCRIPT_CLASSIFIER') ? txtRequire(require('.../x.txt')) : ''`（外部构建
 *    DCE，.txt 由 bundler 内联）→ 新仓无条件 ES text import（bunfig.toml `".txt" = "text"`，
 *    分类器族恒随 bundle，无外部构建 DCE）。缺省值 '' 支裁（feature 恒 false 态不复活）。
 * ② `isUsingExternalPermissions()`（恒 true，Atlas 恒用外部模板）+ `buildYoloSystemPrompt`
 *    （读 getAutoModeConfig + getCacheControl + getBashPrompt*Descriptions）= LLM 闭包
 *    前向接缝（provider/settings 波）；本文件仅落纯模板解析面（getDefaultExternalAutoModeRules /
 *    buildDefaultExternalSystemPrompt / extractTaggedBullets），其消费点 = autoMode CLI handler
 *    （defaults / config / critique，CLI 波）+ buildYoloSystemPrompt（provider 波）。
 */
import basePrompt from './prompts/auto_mode_system_prompt.txt'
import permissionsExternal from './prompts/permissions_external.txt'
import type { AutoModeRules } from './types'

/** 分类器 base system prompt（旧 auto_mode_system_prompt.txt 逐字，<permissions_template> 占位）。 */
export const BASE_PROMPT: string = basePrompt

/**
 * External permissions template（旧 permissions_external.txt 逐字）。
 * 各节缺省规则包在 <user_*_to_replace> 标签内（用户配置 REPLACE 这些缺省）。
 */
export const EXTERNAL_PERMISSIONS_TEMPLATE: string = permissionsExternal

// AutoModeRules 由 ./types 单一事实源承载（本文件 import type 供缺省值返回型），
// 子域门面（index.ts）从 ./types 显式再导出，此处不重复 export（避免 STR-1 命名冲突）。

/**
 * Parses the external permissions template into the settings.autoMode schema
 * shape. The external template wraps each section's defaults in
 * <user_*_to_replace> tags (user settings REPLACE these defaults), so the
 * captured tag contents ARE the defaults. Bullet items are single-line in the
 * template; each line starting with `- ` becomes one array entry.
 * Used by `claude auto-mode defaults`. Always returns external defaults,
 * never the Anthropic-internal template.
 */
export function getDefaultExternalAutoModeRules(): AutoModeRules {
  return {
    allow: extractTaggedBullets('user_allow_rules_to_replace'),
    soft_deny: extractTaggedBullets('user_deny_rules_to_replace'),
    environment: extractTaggedBullets('user_environment_to_replace'),
  }
}

function extractTaggedBullets(tagName: string): string[] {
  const match = EXTERNAL_PERMISSIONS_TEMPLATE.match(
    new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`),
  )
  if (!match) return []
  return (match[1] ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2))
}

/**
 * Returns the full external classifier system prompt with default rules (no user
 * overrides). Used by `claude auto-mode critique` to show the model how the
 * classifier sees its instructions.
 */
export function buildDefaultExternalSystemPrompt(): string {
  return BASE_PROMPT.replace(
    '<permissions_template>',
    () => EXTERNAL_PERMISSIONS_TEMPLATE,
  )
    .replace(
      /<user_allow_rules_to_replace>([\s\S]*?)<\/user_allow_rules_to_replace>/,
      (_m, defaults: string) => defaults,
    )
    .replace(
      /<user_deny_rules_to_replace>([\s\S]*?)<\/user_deny_rules_to_replace>/,
      (_m, defaults: string) => defaults,
    )
    .replace(
      /<user_environment_to_replace>([\s\S]*?)<\/user_environment_to_replace>/,
      (_m, defaults: string) => defaults,
    )
}
