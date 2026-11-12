/**
 * 配置目录名（跨域纯叶子，C-Deep 切片 3 T5 下沉）
 *
 * 旧仓来源（a8af45b）: src/utils/configDir.ts — getConfigDirName 单一事实源。
 * permissions 域（DANGEROUS_DIRECTORIES / getAtlasTempDir* / isClaudeConfigFile）
 * 与 sandbox 域（createSandboxManager 配置目录 denyWrite 族）共线消费，属跨 ≥2 域
 * 纯叶子 → shared 下沉（L3 四域互不 import，shared 为唯一跨域叶子汇）。
 *
 * 纯叶子：只读 env + provider 槽，无域依赖。
 *
 * 0.1.99 S1a 步 2（工单 docs/2026-11-12-p0-wave-0199-s1a-step2-ticket.md §7
 * lock-face 定谳）：product.configDirName 维度激活——依赖方向 = **倒置惰性
 * getter 形**（本文件持 provider 槽 + 组合根 compose.ts 注入，setSettingsPathsProvider
 * 同款先例）：shared 保零 import 纯度（禁反向 import ProductDefinition），
 * provider 槽天然兼任 product 层判别格测试注入口。
 *
 * env 四层次序（lock-face 必改① 钉死，显式用户意图恒压部署期产品默认）：
 * 1. ATLAS_CONFIG_DIR —— 全路径显式（仅 homedir 锚出口；见下「双出口语义」）。
 * 2. ATLAS_CONFIG_DIR_NAME —— 用户显式目录名。
 * 3. product.configDirName —— 部署期产品默认（provider 槽惰性读，未注入 = 无此层）。
 * 4. '.atlas' —— 缺省（无盘探；陈旧 `~/.claude` 不再把运行时拉回 legacy 目录）。
 *
 * 双出口语义（0.1.99 row F 批复 @f4 §8 b8a55c40，两维不同维禁混用）：
 * - `getConfigDirName()` —— **homedir 锚**（用户配置目录）：四层全序。L1 全路径
 *   经 `join(homedir(), v)` 绝对段重置后解析为显式目录本身，语义正确。
 * - `getConfigDirNameForProject()` —— **项目根锚 / 名字标签**（repo 内 `.atlas`
 *   点目录、managed 目录子路径、tmp 目录名标签、权限 pattern 串）：剥 L1 的三层
 *   （NAME > product 默认 > '.atlas'）。L1 是「用户配置目录全路径」，对项目点
 *   目录=维度错配（join(repoRoot, 全路径) 绝对段重置 → 项目点目录漂移到用户
 *   配置目录，canon 19 fail 单根因实证）；名字标签位进全路径同样破坏匹配。
 * - 恒等判据：ATLAS_CONFIG_DIR 未设时两出口同值（现网行为字节级不变）。
 */

const NEW_CONFIG_DIR = '.atlas'

/** 产品配置目录名提供器（无参惰性 getter：读活跃 ProductDefinition 当前值）。 */
export type ConfigDirNameProvider = () => string | undefined

let _provider: ConfigDirNameProvider | null = null

/** 组合根注入产品配置目录名提供器（读 activeProduct.configDirName）。 */
export function setConfigDirNameProvider(
  provider: ConfigDirNameProvider,
): void {
  _provider = provider
}

/** 测试复位（teardown 用，防跨用例泄漏——mock.module 泄漏同族守）。 */
export function resetConfigDirNameProvider(): void {
  _provider = null
}

/**
 * 配置目录名（homedir 锚出口）。Clean migration：缺省恒 `.atlas`——无 legacy
 * `~/.claude` 回落，供第二套 agent 平台同机共存而不互相写穿配置目录。
 *
 * 解析序见头注（env 四层：ATLAS_CONFIG_DIR > ATLAS_CONFIG_DIR_NAME >
 * product.configDirName > '.atlas'）。消费面 = homedir/XDG 锚（用户配置目录），
 * 逐点分型清册见 docs/2026-11-12-0199-configdir-anchor-enumeration.md。
 */
export function getConfigDirName(): string {
  const fullDir = process.env.ATLAS_CONFIG_DIR
  if (fullDir) {
    return fullDir
  }
  return getConfigDirNameForProject()
}

/**
 * 配置目录名（项目根锚 / 名字标签出口）。剥 L1（ATLAS_CONFIG_DIR 全路径）的
 * 三层解析：ATLAS_CONFIG_DIR_NAME > product.configDirName > '.atlas'。
 *
 * 消费面 = repo 内 `.atlas` 点目录（skills/worktrees/settings/rules/agent-memory
 * 等 join(root, …)）、managed 目录子路径、tmp 目录名标签、权限 pattern 串——
 * 这些位置需要的是「名字」而非「用户配置目录全路径」。恒等判据：L1 未设时
 * 与 getConfigDirName() 同值。
 */
export function getConfigDirNameForProject(): string {
  const override = process.env.ATLAS_CONFIG_DIR_NAME
  if (override) {
    return override
  }
  const productDefault = _provider ? _provider() : undefined
  if (productDefault) {
    return productDefault
  }
  return NEW_CONFIG_DIR
}
