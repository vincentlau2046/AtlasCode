/**
 * 域包挂载（DomainPackage 注册到 engine, DEP-5 接线点）。
 *
 * M3-S5（D-3 Ascend 独立实施波）：实挂载落盘。mount = 唯一可 import ascend
 * 域的元素（eslint mount 元素 DEP-5 白名单）。本文件从 ascend 域取 ascendPackage
 * 四元组（tools + skills + prompt + executor），经 registerDomainMount 注册进
 * engine/ports/domainMount holder；compose.ts / loopDeps 经 getDomainMount()
 * 消费四元注入 engine（tools→ascendTools / skills→命令池 / prompt→
 * systemPromptSection / executor→ascend 执行器）。
 *
 * PRT-2（零模块级副作用）：registerDomainMount 经 mountDomains() 显式调用
 * （非顶层自注册语句）；cli.ts 启动期调 mountDomains() 先于 getCoreDependencies()。
 *
 * "不挂 ascend = AtlasOffice"：不调 mountDomains() → getDomainMount() 返回 null
 * → 四元全缺 → engine 无 ascend 工具/skill/prompt/executor。
 */
import { ascendPackage } from '../ascend'
import { registerDomainMount } from '../engine'

/**
 * 挂载 ascend 域包（charter Port 3 四元挂载）。
 *
 * 仅 atlascode/cli.ts 启动期调用（先于 getCoreDependencies / createAgentLoopDeps）。
 * 幂等——重复调用覆写前次注册（registerDomainMount 语义）。
 */
export function mountDomains(): void {
  registerDomainMount(ascendPackage)
}
