/**
 * engine/tools/bash — 小 helper 归集（Bash 本体纵切子波 §8.54 S-B1 依赖闭包层）。
 *
 * 旧仓来源（a8af45b，4 个零依赖/单依赖小函数，逐字随迁；消费方 = S-B4
 * bashPrompt.ts + S-B2 bashUtils.ts）：
 *  - hasEmbeddedSearchTools ← src/utils/embeddedTools.ts L15（EMBEDDED_SEARCH_TOOLS
 *    env + ATLAS_ENTRYPOINT sdk 族门，ant-native build-time define；新仓无
 *    embedded build → 恒 false 惰性支，逐字保留不裁）
 *  - shouldMaintainProjectWorkingDir ← src/utils/envUtils.ts L99
 *    （ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR；消费面 = S-B2
 *    resetCwdIfOutsideProject 快支）
 *  - shouldIncludeGitInstructions ← src/utils/gitSettings.ts L13（env 双判 +
 *    settings 缺省面，见下 delta ②）
 *  - prependBullets ← src/constants/prompts.ts L144（6L 纯函数；shared 门面
 *    未收该值 → 域内落点，TODO PR to shared，shared-facade value-gap 先例）
 *
 * delta 登记（import 替换 + 1 读面替换，函数体逐字；复审勿当遗漏重提）：
 *  ① 旧 `isEnvTruthy`/`isEnvDefinedFalsy`（utils/envUtils.js）→ 新仓
 *    `../../../shared`（C1 统一裁定布尔 env 单一事实源）。
 *  ② 旧 `getInitialSettings().includeGitInstructions ?? true`（utils/settings
 *    读面）→ 新仓 `getSettingsWithErrors().settings.includeGitInstructions ??
 *    true`（engine/config 门面，§8.43 E-3 settings 落点；缺省语义不变）。
 */
import { isEnvDefinedFalsy, isEnvTruthy } from '../../../shared'
import { getSettingsWithErrors } from '../../../engine/config'

/**
 * Whether this build has bfs/ugrep embedded in the bun binary (ant-native only).
 *
 * When true:
 * - `find` and `grep` in Claude's Bash shell are shadowed by shell functions
 *   that invoke the bun binary with argv0='bfs' / argv0='ugrep' (same trick
 *   as embedded ripgrep)
 * - The dedicated Glob/Grep tools are removed from the tool registry
 * - Prompt guidance steering Claude away from find/grep is omitted
 *
 * Set as a build-time define in scripts/build-with-plugins.ts for ant-native builds.
 */
export function hasEmbeddedSearchTools(): boolean {
  if (!isEnvTruthy(process.env.EMBEDDED_SEARCH_TOOLS)) return false
  const e = (process.env.ATLAS_ENTRYPOINT)
  return (
    e !== 'sdk-ts' && e !== 'sdk-py' && e !== 'sdk-cli' && e !== 'local-agent'
  )
}

/**
 * Check if bash commands should maintain project working directory (reset to original after each command)
 * @returns true if ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR is set to a truthy value
 */
export function shouldMaintainProjectWorkingDir(): boolean {
  return isEnvTruthy(process.env.ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR)
}

/**
 * Whether the git safety instructions should be included in the Bash prompt.
 * Env 双判（ATLAS_DISABLE_GIT_INSTRUCTIONS 真=不含 / 显式假=含）+ settings
 * 缺省面（includeGitInstructions ?? true）。
 */
export function shouldIncludeGitInstructions(): boolean {
  const envVal = (process.env.ATLAS_DISABLE_GIT_INSTRUCTIONS)
  if (isEnvTruthy(envVal)) return false
  if (isEnvDefinedFalsy(envVal)) return true
  return getSettingsWithErrors().settings.includeGitInstructions ?? true
}

export function prependBullets(items: Array<string | string[]>): string[] {
  return items.flatMap(item =>
    Array.isArray(item)
      ? item.map(subitem => `  - ${subitem}`)
      : [` - ${item}`],
  )
}
