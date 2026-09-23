/**
 * engine/tools/agent — agent 定义解析 + 优先级合并（§8.25 E-2 T-5c，旧仓 loadAgentsDir.ts 裁剪）
 *
 * 裁剪版真核心：
 *   - parseAgentFromMarkdown：frontmatter 纯解析（name/description/tools/disallowedTools/model）
 *   - getActiveAgentsFromList：优先级合并（built-in → plugin → user，后写覆盖）
 *   - loadAgentDefinitions(injectedFiles)：磁盘扫描抽为注入边界（纯函数、无 fs），
 *     合并内建注册表 + 注入的自定义 agent 文件。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 旧仓 getAgentDefinitionsWithOverrides 的 memoize + loadMarkdownFilesForSubdir 磁盘
 *     扫描 + loadPluginAgents + memory snapshot init + color init + ATLAS_SIMPLE 门 +
 *     growthbook/feature 门 → 残留守（磁盘扫描抽为 loadAgentDefinitions 的注入边界；
 *     plugin/memory/color/ATLAS_SIMPLE 面未落）。
 *   - frontmatter 字段 skills/mcpServers/hooks/effort/permissionMode/maxTurns/background/
 *     initialPrompt/memory/isolation/color → 残留守（对应消费面未落，不声明死接缝）。
 *   - model：旧仓自由字符串（'inherit' 或模型名）→ 新仓 ModelRole（'inherit'/空 → undefined
 *     继承父 role；合法 role 名透传；其余 → undefined 继承）。role 取代 model 串语义消失，
 *     alias 匹配残留守（见 runAgent 头注）。
 *   - parseAgentFromJson / parseAgentsFromJson（zod AgentJsonSchema）→ 残留守（新仓工具面
 *     不引 zod；JSON agent 定义面归后续纵切）。
 *   - hasRequiredMcpServers / filterAgentsByMcpRequirements（requiredMcpServers 门）→ 残留守
 *     （MCP 需求面未落）。
 *   - getActiveAgentsFromList 旧仓分 6 组（builtIn→plugin→userSettings→projectSettings→
 *     flagSettings→policySettings，policy 压 flag 压 project 压 user）；本版折叠为 3 组
 *     （built-in→plugin→user），user 组内覆盖序 = 注入序（非 source 细分优先级）→ 残留守
 *     （source 细分门控归 E-4 权限层，见 agentDefinition 头注）。
 *   - parseAgentFromMarkdown 缺 description：旧仓 logForDebugging + 调用方 failedFiles 上报
 *     （含 name 的文件）；本版静默跳过（纯函数无日志/失败面上报）→ 残留守（失败面上报随
 *     磁盘扫描注入边界落时补）。
 */
import { MODEL_ROLES, type ModelRole } from '../../../modelprovider'
import { getBuiltInAgents } from './builtInAgents'
import type { AgentDefinition } from './agentDefinition'

/** 注入的 agent 文件（磁盘扫描结果的注入边界；filePath/baseDir 供后续面消费，本版仅用 frontmatter/content/source）。 */
export interface InjectedAgentFile {
  filePath: string
  baseDir: string
  frontmatter: Record<string, unknown>
  content: string
  source: 'built-in' | 'user' | 'plugin'
}

/** frontmatter model → ModelRole（'inherit'/空 → undefined 继承；合法 role 透传；其余 undefined）。
 * MODEL_ROLES 用 modelprovider 值导出（防 role 集漂移，F-9）。 */
function parseModel(raw: unknown): ModelRole | undefined {
  if (typeof raw !== 'string') return undefined
  const t = raw.trim()
  if (t.length === 0 || t.toLowerCase() === 'inherit') return undefined
  return MODEL_ROLES.find((r) => r === t.toLowerCase())
}

/**
 * frontmatter 工具列表解析（旧仓 parseAgentToolsFromFrontmatter 逐字语义）：
 *   - 缺字段（undefined）→ undefined（全量工具）
 *   - 空/假值（null/''/0/false）→ []（无工具）
 *   - 非串非数组（如数字）→ []（无工具）
 *   - 串/数组 → 逗号拆分 / 字符串过滤；含 '*' → undefined（全量，旧仓 parseToolListString 归一）
 * 残留守：旧仓 parseToolListFromCLI 对权限规则 spec（如 `Bash(a,b)`）括号感知解析 → E-4 面；
 *   本版朴素逗号拆分会误拆带参 spec（登记，非死接缝）。
 */
function parseStringList(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined
  if (!raw) return []
  let arr: string[]
  if (typeof raw === 'string') {
    arr = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  } else if (Array.isArray(raw)) {
    arr = raw.filter((x): x is string => typeof x === 'string')
  } else {
    arr = []
  }
  if (arr.includes('*')) return undefined // 任一通配 → 全量（旧仓同义）
  return arr
}

/**
 * 纯：从 agent markdown 的 frontmatter + 正文解析 agent 定义（旧仓 parseAgentFromMarkdown 裁剪）。
 * 缺 name 或 description → null（跳过非 agent 的共置参考文档）。缺 description 时旧仓会
 * logForDebugging + 经调用方 failedFiles 上报，本版纯解析静默跳过（失败面上报残留守，见头注）。
 */
export function parseAgentFromMarkdown(
  file: InjectedAgentFile,
): AgentDefinition | null {
  const { frontmatter, content, source } = file
  const agentType = frontmatter['name']
  const whenToUseRaw = frontmatter['description']
  if (typeof agentType !== 'string' || agentType.length === 0) return null
  if (typeof whenToUseRaw !== 'string' || whenToUseRaw.length === 0) return null

  const whenToUse = whenToUseRaw.replace(/\\n/g, '\n')
  const tools = parseStringList(frontmatter['tools'])
  const disallowedTools = parseStringList(frontmatter['disallowedTools'])
  const model = parseModel(frontmatter['model'])
  const systemPrompt = content.trim()

  const agent: AgentDefinition = {
    agentType,
    whenToUse,
    source,
    getSystemPrompt: () => systemPrompt,
  }
  if (tools !== undefined) agent.tools = tools
  if (disallowedTools !== undefined) agent.disallowedTools = disallowedTools
  if (model !== undefined) agent.model = model
  return agent
}

/**
 * 优先级合并（旧仓 getActiveAgentsFromList 裁剪）：built-in → plugin → user，
 * 后写组覆盖同 agentType（user 侧最终胜）。
 */
export function getActiveAgentsFromList(
  allAgents: readonly AgentDefinition[],
): AgentDefinition[] {
  const groups = [
    allAgents.filter((a) => a.source === 'built-in'),
    allAgents.filter((a) => a.source === 'plugin'),
    allAgents.filter((a) => a.source === 'user'),
  ]
  const agentMap = new Map<string, AgentDefinition>()
  for (const group of groups) {
    for (const agent of group) agentMap.set(agent.agentType, agent)
  }
  return Array.from(agentMap.values())
}

/**
 * 加载 agent 定义（旧仓 getAgentDefinitionsWithOverrides 的磁盘面抽为注入边界）：
 * 内建注册表 + 注入的自定义 agent 文件 → 优先级合并。纯函数、无 fs（磁盘扫描在调用方）。
 */
export function loadAgentDefinitions(
  injectedFiles: readonly InjectedAgentFile[],
): AgentDefinition[] {
  const custom = injectedFiles
    .map((f) => parseAgentFromMarkdown(f))
    .filter((a): a is AgentDefinition => a !== null)
  return getActiveAgentsFromList([...getBuiltInAgents(), ...custom])
}
