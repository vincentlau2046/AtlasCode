/**
 * ProductDefinition（0.1.98 S1a 硬化波，工单 docs/2026-11-12-p0-wave-0198-s1a-ticket.md
 * lock-face ①④ 批复形）：per-product 运行时差异的唯一接口面。
 *
 * 与 IDN-1 构建配方归一边界：品牌串走 identity.ts 构建配方（buildUserAgent 等），
 * 本接口只承载**运行时清单参数**（工具子集 / 配置目录维度〔0.1.99 步 2 激活〕）。
 *
 * ★不参数化清单（lock-face §0 冻结，禁顺手漂移——改动 = row F 回 f4）：
 *   1. modelprovider/constants.ts 两 beta 头（SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER /
 *      AFK_MODE_BETA_HEADER）——wire 协议常量（WIRE 冻结族），非产品工具面。
 *   2. coordinator localShellTask `MONITOR_TOOL` 门——coordinator 行为门（env 已可关）。
 *   3. tui 域 FEATURE_* env kill-switch 行为门族——TUI 行为门 ≠ 工具子集。
 *   4. 项目级 `.atlas/skills` 约定目录字面（loadSkillsDir）——项目根约定，非
 *      ~/.atlas 配置目录，product 无关。
 *   5. 工具 prompt 文案中 `~/.atlas` 用户引导字面——用户可见文案，不入本接口。
 *
 * 解析时序（lock-face ④ 判据 (a)）：**解析一次性**——ACTIVE_PRODUCT 模块级冻结，
 * 启动期定谳，消费方（loopDeps/toolRegistry）读引用不重解析；禁 per-call 重解析。
 */

export interface ProductDefinition {
  /** 产品 id（注册清单键；当前唯一 'atlascode'）。 */
  readonly id: string
  /**
   * 运行时工具子集（工具名冻结清单；**undefined = 全量装配，atlascode 零变更**）。
   * 消费点 = toolRegistry getAllBaseTools 装配层过滤（Agent/base/ascend 段，
   * mcpTools 动态面不参 subset）；过滤与 isEnabled 判别同路（lock-face ④ (c)），
   * 禁旁路 env 直查。defer/ToolSearch 面消费 registry 产物，subset 外工具不可见。
   */
  readonly toolSubset?: readonly string[]
  /**
   * 配置目录名维度（0.1.99 步 2 激活）：部署期产品默认层。
   * env 四层次序（0.1.99 lock-face 必改① 钉死）= ATLAS_CONFIG_DIR（全路径
   * 显式）> ATLAS_CONFIG_DIR_NAME（用户显式）> 本值（部署期默认）> '.atlas'
   * ——显式用户意图恒压部署期产品默认。消费经 shared/configDir provider
   * 槽惰性读（倒置 getter 形，shared 零 import 纯度）。
   */
  readonly configDirName?: string
}

/** atlascode 缺省定义：全量装配（toolSubset/configDirName 均缺省 = 行为字节级不变）。 */
const ATLASCODE_PRODUCT: ProductDefinition = Object.freeze({
  id: 'atlascode',
})

/** 活跃产品（0.1.98 = 静态单产品；0.1.99 步 2 起 configDirName 维度消费）。 */
const ACTIVE_PRODUCT: ProductDefinition = ATLASCODE_PRODUCT

/** 活跃产品定义（解析一次性：返回模块级冻结引用，禁调用方重解析/复制）。 */
export function getActiveProductDefinition(): ProductDefinition {
  return ACTIVE_PRODUCT
}
