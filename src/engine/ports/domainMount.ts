/**
 * Port: domain-mount（Port 3，归消费方，经 index re-export）
 *
 * charter Port 3（§L8 PRT-1 承重）：ascend 域包四元挂载收敛口。旧仓 ascend
 * 四个分散插桩点（tools.ts feature flag / bundledSkills registerBundledSkill
 * / plugins/ascend/prompt / factory new AscendExecutor）收敛成**一个挂载单元**，
 * atlascode/mount.ts 一行 `registerDomainMount(ascendPackage)` 整体挂载/卸载。
 *
 * executor 进挂载面是关键决策（charter §Port 3）：旧仓 factory.ts 无条件
 * new AscendExecutor() → 新仓 compose.ts 不再认识 Ascend，executor 由 ascend
 * 包提供、经 mount 注入。"不挂 ascend = AtlasOffice"才真正成立（executor 也不
 * 存在）。
 *
 * skill 注册机制裁定（v0.5 问题3a）：ascend 5 运行时 skill 经
 * DomainPackage.skills（本挂载面）注册，不走 registerBundledSkill()。
 *
 * 消费面（S5 mount 落地后）：
 *   - tools → compose.ts 读 getDomainMount()?.tools 注入 deps.ascendTools
 *     （engine/tools/toolRegistry.ts 已有 ascendTools slot + isAscendToolsEnabled
 *     kill-switch 门控 FEATURE_ASCEND_TOOLS）
 *   - skills → compose.ts 读 getDomainMount()?.skills 注册进 skill 命令面
 *   - systemPromptSection → compose.ts 读 getDomainMount()?.systemPromptSection
 *     注入 systemPrompt 段
 *   - executor → compose.ts 读 getDomainMount()?.executor 注入 ascend 执行器
 *
 * 类型面（全 port 接口，无 ascend 域 import — DEP-4 engine 不依赖 ascend）：
 *   - Tool ← shared（types 契约冻结面）
 *   - Command ← engine/skill（intra-element，门面 re-export）
 *   - NpuToolchain ← executor（DIP 接口；engine allow executor，DEP-4 合法）
 *
 * 状态面（PRT-2：零模块级副作用 — register 经 compose.ts 显式注入，非顶层
 * 自注册语句；lazy `let` holder 同 taskOutput.ts 先例）：
 *   - registerDomainMount(pkg) → mount.ts 调（仅一处）
 *   - getDomainMount() → 消费方读（compose.ts / 测试）
 *   - resetDomainMountForTests() → 单测复位
 */
import type { Tool } from '../../shared'
import type { Command } from '../skill'
import type { NpuToolchain } from '../../executor'

/**
 * 域包四元挂载单元（charter Port 3）。
 *
 * id 固定 'ascend'（v1 单域包；未来 Cambricon 等扩展时扩 union）。
 * 四元皆可选：不挂 ascend = 四元全缺 = AtlasOffice 形态。
 */
export interface DomainPackage {
  id: 'ascend'
  /** 16 工具（算子开发/问题定位/性能测试/推理部署 4 业务面） */
  tools?: readonly Tool[]
  /** 5 运行时 skill（平行业务面，非 foundation 树；不走 registerBundledSkill） */
  skills?: readonly Command[]
  /** prompt guide 段（ASCEND_TOOL_USAGE_GUIDE 单一事实源） */
  systemPromptSection?: () => string | null
  /** AscendExecutor —— 进挂载面（NpuToolchain 非 bare Executor） */
  executor?: NpuToolchain
}

let activeMount: DomainPackage | null = null

/**
 * 注册域包（仅 atlascode/mount.ts 调）。
 * PRT-2：经 compose.ts 显式注入路径调用，非模块加载时顶层自注册。
 */
export function registerDomainMount(pkg: DomainPackage): void {
  activeMount = pkg
}

/**
 * 取已注册域包（消费方读；未挂载返回 null = AtlasOffice 形态）。
 */
export function getDomainMount(): DomainPackage | null {
  return activeMount
}

/**
 * 单测复位（同 taskOutput.ts resetTaskOutputPort 先例）。
 */
export function resetDomainMountForTests(): void {
  activeMount = null
}
