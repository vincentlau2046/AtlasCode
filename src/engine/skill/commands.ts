/**
 * engine/skill — 命令模型面（§8.67 D 波 S-E2a，
 * 旧仓 src/commands.ts 模型子集落面：命令池装配 + 可用性门 +
 * 模型可调用视图（SkillTool / SlashCommandTool 过滤）+ 查找/描述面）。
 *
 * 新仓命令池 = prompt 源三族（bundled / skill 目录 / dynamic 动态发现）
 * + 内置 TUI 命令占位（BUILT_IN_COMMANDS，TUI 波前向接缝）。
 *
 * 裁面登记（复审勿当遗漏重提）：
 *   ① 旧 COMMANDS() ≈70 个 TUI 内置命令（plan/privacySettings/hooks/
 *      login/logout/tasks/workflows/…）→ TUI 波；本波 BUILT_IN_COMMANDS
 *      恒空（getCommands 动态插入位 = append 尾，builtInNames 空集）。
 *   ② getPluginSkills / getBuiltinPluginSkillCommands / getPluginCommands /
 *      clearPluginCommandCache / clearPluginSkillsCache（plugin 池面）
 *      → plugin 波前向接缝；池装配点保留占位。
 *   ③ getWorkflowCommands（旧 feature('WORKFLOW_SCRIPTS') 门控 WorkflowTool
 *      命令面）→ 新仓 feature 机制未落 + WorkflowTool 未迁 → 裁。
 *   ④ clearSkillIndexCache（skillSearch/localSearch.ts getSkillIndex 层）
 *      → 新仓 skillSearch 0 命中 → 裁（clearCommandMemoizationCaches 仅清
 *      本域 3 缓存）。
 *   ⑤ REMOTE_SAFE_COMMANDS / BRIDGE_SAFE_COMMANDS / isBridgeSafeCommand /
 *      filterCommandsForRemoteMode（remote 安全过滤面）→ remote 波。
 *   ⑥ getMcpSkillCommands 旧 feature('MCP_SKILLS') 门 → 新仓 feature 机制
 *      未落 → 门裁（过滤面逐字保留，MCP skill 注册窗 = remote 波）。
 *   ⑦ meetsAvailabilityRequirement 'console' 支：旧 isFirstPartyGatewayUrl()
 *      （utils/model/providers.ts，新仓 0 命中）内联 =
 *      !OPENAI_BASE_URL（IFF 语义「OPENAI_BASE_URL 设真即非 first-party
 *      host」，同 engine/tools/toolsearch/toolSearchGate.ts 裁定 ⑬ 先例）。
 *   ⑧ formatDescriptionWithSource 的 getSettingSourceName（settings 显示
 *      名面，新仓 0 命中）→ 裁，回落 source 字串直出。
 */
import { logError, logForDebugging, toError } from '../../shared'
import { getBundledSkills } from './bundledSkills'
import { clearSkillCaches, getDynamicSkills, getSkillDirCommands } from './loadSkillsDir'
import { memoize } from './memoize'
import { type Command, getCommandName, isCommandEnabled } from './types'

/**
 * 内置 TUI 命令池（占位空集，TUI 波回填，头注 ①）。
 * 旧仓 COMMANDS() ≈70 个 TUI 命令不属本域（local/local-jsx 族裁面见
 * types.ts ①）。
 */
const BUILT_IN_COMMANDS: Command[] = []

/** 内置命令名 + 别名集合（memoize 零参）。 */
export const builtInCommandNames = memoize(
  (): Set<string> =>
    new Set(BUILT_IN_COMMANDS.flatMap(_ => [_.name, ...(_.aliases ?? [])])),
)

async function getSkills(cwd: string): Promise<{
  skillDirCommands: Command[]
  bundledSkills: Command[]
}> {
  try {
    const skillDirCommands = await getSkillDirCommands(cwd).catch(err => {
      logError(toError(err))
      logForDebugging(
        'Skill directory commands failed to load, continuing without them',
      )
      return []
    })
    // 内置技能启动期同步注册
    const bundledSkills = getBundledSkills()
    // plugin 池面裁（头注 ②）
    logForDebugging(
      `getSkills returning: ${skillDirCommands.length} skill dir commands, ${bundledSkills.length} bundled skills`,
    )
    return { skillDirCommands, bundledSkills }
  } catch (err) {
    // 防御兜底（内层已 catch，此处不应触达）
    logError(toError(err))
    logForDebugging('Unexpected error in getSkills, returning empty')
    return { skillDirCommands: [], bundledSkills: [] }
  }
}

/**
 * 按命令声明的 `availability`（auth/provider 要求）过滤。
 * 无 `availability` = 通用可用。
 * 不 memoize —— auth 态会话中可变，每次 getCommands() 重评。
 */
export function meetsAvailabilityRequirement(cmd: Command): boolean {
  if (!cmd.availability) return true
  for (const a of cmd.availability) {
    switch (a) {
      case 'claude-ai':
        // 新仓 auth 车道 = OpenAI 静态键，claude.ai 订阅支不可达（types.ts
        // CommandAvailability 头注：保留字面量 = 穷尽 switch 判别面）
        break
      case 'console':
        // 一方网关直连用户。头注 ⑦：isFirstPartyGatewayUrl 内联 =
        // !OPENAI_BASE_URL（IFF 语义）。
        if (!process.env.OPENAI_BASE_URL) {
          return true
        }
        break
      case 'vendor':
        // 国产 vendor（OpenAI 协议 endpoint/key）。
        if (
          process.env.OPENAI_API_KEY !== undefined ||
          process.env.OPENAI_BASE_URL !== undefined ||
          process.env.ATLAS_MODEL !== undefined
        ) {
          return true
        }
        break
      default: {
        const _exhaustive: never = a
        void _exhaustive
        break
      }
    }
  }
  return false
}

/**
 * 装载全部命令源。memoize by cwd（磁盘 I/O 昂贵）。
 * 装配顺序 = 旧仓逐字（bundled 族 > skill 目录 > 内置 TUI）。
 */
const loadAllCommands = memoize(async (cwd: string): Promise<Command[]> => {
  const { skillDirCommands, bundledSkills } = await getSkills(cwd)

  // plugin/workflow 池面裁（头注 ②③）
  return [
    ...bundledSkills,
    ...skillDirCommands,
    ...BUILT_IN_COMMANDS,
  ]
})

/**
 * 取当前用户可用命令。装载 memoize，availability/isEnabled 每次新鲜评估
 * （auth 变更即时生效）。
 */
export async function getCommands(cwd: string): Promise<Command[]> {
  const allCommands = await loadAllCommands(cwd)

  // 文件操作期动态发现的技能
  const dynamicSkills = getDynamicSkills()

  // 基础命令（不含动态技能）
  const baseCommands = allCommands.filter(
    _ => meetsAvailabilityRequirement(_) && isCommandEnabled(_),
  )

  if (dynamicSkills.length === 0) {
    return baseCommands
  }

  // 动态技能去重 —— 仅并入 base 未含者
  const baseCommandNames = new Set(baseCommands.map(c => c.name))
  const uniqueDynamicSkills = dynamicSkills.filter(
    s =>
      !baseCommandNames.has(s.name) &&
      meetsAvailabilityRequirement(s) &&
      isCommandEnabled(s),
  )

  if (uniqueDynamicSkills.length === 0) {
    return baseCommands
  }

  // 动态技能插入位 = 内置 TUI 命令之前（本波内置池空 → append 尾）
  const builtInNames = new Set(BUILT_IN_COMMANDS.map(c => c.name))
  const insertIndex = baseCommands.findIndex(c => builtInNames.has(c.name))

  if (insertIndex === -1) {
    return [...baseCommands, ...uniqueDynamicSkills]
  }

  return [
    ...baseCommands.slice(0, insertIndex),
    ...uniqueDynamicSkills,
    ...baseCommands.slice(insertIndex),
  ]
}

/**
 * 仅清命令 memoize 缓存（不清 skill 缓存）——动态技能并入后失效
 * 缓存命令列表用。
 */
export function clearCommandMemoizationCaches(): void {
  loadAllCommands.cache?.clear?.()
  getSkillToolCommands.cache?.clear?.()
  getSlashCommandToolSkills.cache?.clear?.()
  // 头注 ④：getSkillIndex 外层 memoize 面未落（skillSearch 波），本域
  // 仅清内层 3 缓存。
}

/** 全清命令缓存（含 skill 缓存；plugin 缓存面裁，头注 ②）。 */
export function clearCommandsCache(): void {
  clearCommandMemoizationCaches()
  clearSkillCaches()
}

/**
 * 过滤 MCP 提供的技能（prompt 型、模型可调用、loadedFrom 'mcp'）。
 * 这些命令不走 getCommands() —— 需要 MCP 技能的 skill 索引调用方
 * 单独穿线。头注 ⑥：旧 feature 门裁，MCP skill 注册窗 = remote 波。
 */
export function getMcpSkillCommands(
  mcpCommands: readonly Command[],
): readonly Command[] {
  return mcpCommands.filter(
    cmd =>
      cmd.type === 'prompt' &&
      cmd.loadedFrom === 'mcp' &&
      !cmd.disableModelInvocation,
  )
}

/**
 * SkillTool 展示模型可调用的全部 prompt 型命令（/skills/ 技能 +
 * legacy /commands/ 命令 + 内置技能）。
 */
export const getSkillToolCommands = memoize(
  async (cwd: string): Promise<Command[]> => {
    const allCommands = await getCommands(cwd)
    return allCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        !cmd.disableModelInvocation &&
        cmd.source !== 'builtin' &&
        // 恒含 /skills/ 目录技能、内置技能、legacy /commands/ 条目
        // （frontmatter 缺描述时首行自动派生）。plugin/MCP 命令仍需
        // 显式描述才进列表。
        (cmd.loadedFrom === 'bundled' ||
          cmd.loadedFrom === 'skills' ||
          cmd.loadedFrom === 'commands_DEPRECATED' ||
          cmd.hasUserSpecifiedDescription ||
          cmd.whenToUse),
    )
  },
)

/**
 * SlashCommandTool 视角：仅技能（loadedFrom skills/plugin/bundled 或
 * disableModelInvocation 的显式技能）。
 */
export const getSlashCommandToolSkills = memoize(
  async (cwd: string): Promise<Command[]> => {
    try {
      const allCommands = await getCommands(cwd)
      return allCommands.filter(
        cmd =>
          cmd.type === 'prompt' &&
          cmd.source !== 'builtin' &&
          (cmd.hasUserSpecifiedDescription || cmd.whenToUse) &&
          (cmd.loadedFrom === 'skills' ||
            cmd.loadedFrom === 'plugin' ||
            cmd.loadedFrom === 'bundled' ||
            cmd.disableModelInvocation),
      )
    } catch (error) {
      logError(toError(error))
      // 技能非关键路径 —— 空数组而非抛错（装载失败不炸全系统）
      logForDebugging('Returning empty skills array due to load failure')
      return []
    }
  },
)

/**
 * 按名称 / userFacingName / 别名查命令。
 */
export function findCommand(
  commandName: string,
  commands: Command[],
): Command | undefined {
  return commands.find(
    _ =>
      _.name === commandName ||
      getCommandName(_) === commandName ||
      _.aliases?.includes(commandName),
  )
}

export function hasCommand(commandName: string, commands: Command[]): boolean {
  return findCommand(commandName, commands) !== undefined
}

export function getCommand(commandName: string, commands: Command[]): Command {
  const command = findCommand(commandName, commands)
  if (!command) {
    throw ReferenceError(
      `Command ${commandName} not found. Available commands: ${commands
        .map(_ => {
          const name = getCommandName(_)
          return _.aliases ? `${name} (aliases: ${_.aliases.join(', ')})` : name
        })
        .sort((a, b) => a.localeCompare(b))
        .join(', ')}`,
    )
  }

  return command
}

/**
 * 用户可见描述 + 来源标注（typeahead / help 屏用）。
 * 模型面提示词（SkillTool 等）直接用 cmd.description。
 * 头注 ⑧：getSettingSourceName 面裁，source 字串直出。
 */
export function formatDescriptionWithSource(cmd: Command): string {
  if (cmd.kind === 'workflow') {
    return `${cmd.description} (workflow)`
  }

  if (cmd.source === 'plugin') {
    const pluginName = cmd.pluginInfo?.pluginManifest.name
    if (pluginName) {
      return `(${pluginName}) ${cmd.description}`
    }
    return `${cmd.description} (plugin)`
  }

  if (cmd.source === 'builtin' || cmd.source === 'mcp') {
    return cmd.description
  }

  if (cmd.source === 'bundled') {
    return `${cmd.description} (bundled)`
  }

  return `${cmd.description} (${cmd.source})`
}
