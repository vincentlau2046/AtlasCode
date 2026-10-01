/**
 * ascend 域包四元挂载单元（M3-S5，D-3 Ascend 独立实施波）。
 *
 * charter Port 3（§L8 PRT-1 承重）：把旧仓 ascend 四个分散插桩点（tools.ts
 * feature flag / bundledSkills registerBundledSkill / plugins/ascend/prompt /
 * factory new AscendExecutor）收敛成**一个 DomainPackage 挂载单元**，供
 * atlascode/mount.ts 一行 `registerDomainMount(ascendPackage)` 整体挂载/卸载。
 *
 * 四元（charter §Port 3 接口）：
 *   - tools    = ASCEND_TOOLS（16 工具，4 业务面；src/ascend/tools/）
 *   - skills   = ASCEND_BUNDLED_SKILLS → Command[]（5 平行业务面 skill，经
 *     makeAscendSkillCommand 构造；**不走 registerBundledSkill**——charter
 *     v0.5 问题3a 裁定：域 skill 经 DomainPackage.skills 挂载面注册）
 *   - prompt   = getAscendSystemPromptSection（ASCEND_TOOL_USAGE_GUIDE 单源）
 *   - executor = getAscendExecutor()（AscendExecutor 进挂载面——"不挂 ascend
 *     = AtlasOffice"才真正成立：executor 也不存在）
 *
 * skill Command 构造对齐 engine/skill/bundledSkills.ts registerBundledSkill
 * 的字段集（type/source/loadedFrom/progressMessage 等），但**不 push 进
 * registerBundledSkill 的模块级数组**——由 mount.ts → getDomainMount() →
 * compose.ts/loopDeps 消费注入命令池。
 *
 * getPromptForCommand 闭包在调用时（非创建时）经 getAscendExecutor() 取实例
 * + applyToolchainPlaceholders 渲染 {{toolchain.commands.*}} 占位符——同壳侧
 * tui/skills/bundled/ascend*.ts 逻辑（域内化，DIP）。
 */
import type { ContentBlockParam } from 'src/shared'
import type { Command, DomainPackage, SkillCommandContext } from 'src/engine'
import { ASCEND_TOOLS } from './tools'
import { ASCEND_BUNDLED_SKILLS, type AscendBundledSkillContent } from './skills'
import { getAscendSystemPromptSection } from './prompt'
import { getAscendExecutor } from './executor/instance'
import { applyToolchainPlaceholders } from './executor/toolchain'

/**
 * 把 AscendBundledSkillContent（纯数据）构造为 engine Command。
 *
 * 字段集对齐 registerBundledSkill 的 Command 构造（bundledSkills.ts:86-109），
 * 但不 push 进 registerBundledSkill 数组——DomainPackage.skills 挂载面注册。
 */
function makeAscendSkillCommand(content: AscendBundledSkillContent): Command {
  return {
    type: 'prompt',
    name: content.name,
    description: content.description,
    hasUserSpecifiedDescription: true,
    allowedTools: [...content.allowedTools],
    whenToUse: content.whenToUse,
    disableModelInvocation: false,
    userInvocable: true,
    contentLength: 0, // 内置技能不适用（同 registerBundledSkill）
    source: 'bundled',
    loadedFrom: 'bundled',
    context: 'inline',
    isHidden: false,
    progressMessage: 'running',
    async getPromptForCommand(
      args: string,
      _ctx: SkillCommandContext,
    ): Promise<ContentBlockParam[]> {
      const toolchain = getAscendExecutor()
      const rendered = applyToolchainPlaceholders(content.skillMd, toolchain)
      const parts: string[] = [rendered]
      if (args) parts.push('## User Request\n\n' + args)
      return [{ type: 'text', text: parts.join('\n\n') }]
    },
  }
}

/**
 * ascend 域包（charter Port 3 四元挂载单元）。
 *
 * mount.ts 经 registerDomainMount(ascendPackage) 挂载；compose.ts/loopDeps
 * 经 getDomainMount() 消费四元注入 engine（tools→ascendTools / skills→命令池 /
 * prompt→systemPromptSection / executor→ascend 执行器）。
 *
 * 不挂 ascend = getDomainMount() 返回 null = AtlasOffice 形态（四元全缺）。
 */
export const ascendPackage: DomainPackage = {
  id: 'ascend',
  tools: ASCEND_TOOLS,
  skills: ASCEND_BUNDLED_SKILLS.map(makeAscendSkillCommand),
  systemPromptSection: getAscendSystemPromptSection,
  executor: getAscendExecutor(),
}
