/**
 * 配置目录名（跨域纯叶子，C-Deep 切片 3 T5 下沉）
 *
 * 旧仓来源（a8af45b）: src/utils/configDir.ts — getConfigDirName 单一事实源。
 * permissions 域（DANGEROUS_DIRECTORIES / getAtlasTempDir* / isClaudeConfigFile）
 * 与 sandbox 域（createSandboxManager 配置目录 denyWrite 族）共线消费，属跨 ≥2 域
 * 纯叶子 → shared 下沉（L3 四域互不 import，shared 为唯一跨域叶子汇）。
 *
 * 纯叶子：只读 env，无域依赖。
 */

const NEW_CONFIG_DIR = '.atlas'

/**
 * 配置目录名。Clean migration：恒 `.atlas`——无 legacy `~/.claude` 回落，
 * 供第二套 agent 平台同机共存而不互相写穿配置目录。
 *
 * 解析序：
 * 1. ATLAS_CONFIG_DIR_NAME env —— 显式覆盖。
 * 2. 默认 `.atlas`（无盘探；陈旧 `~/.claude` 不再把运行时拉回 legacy 目录）。
 */
export function getConfigDirName(): string {
  const override = process.env.ATLAS_CONFIG_DIR_NAME
  if (override) {
    return override
  }
  return NEW_CONFIG_DIR
}
