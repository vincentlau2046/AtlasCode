/**
 * engine/tools — 工具注册表机制（§8.25 E-2 T-5e，旧仓 tools.ts getAllBaseTools 裁剪版真核心）
 *
 * 旧仓 tools.ts `getAllBaseTools()` 是 49 基础工具本体（非 Ascend）的模块级 import +
 * feature()/env 门控装配。口径（§8.53 审计④）：**49 = 朴素口径（每工具计 1，cron 三件套按 3 计）**；
 * 历史「47」= cron 三件套计 1 项（E-2 沿用值），标历史口径。Ascend 16 = 独立门控族（另计）。
 * 新仓裁剪为 **deps 注入的注册表机制**：工具本体未落（49 个残留守，随后续纵切逐个落），
 * 注册表只负责「已落本体 + 门控 + 去重」的装配机制，本体经 deps 增量注入，机制不变。
 *
 * 装配语义（旧仓 getAllBaseTools + assembleToolPool 折叠）：
 *   - AgentTool 内建首位（旧仓列表首项）。
 *   - deps.baseTools（已落基础工具本体）+ deps.ascendTools（ASCEND 域门控）+ deps.mcpTools
 *     （T-5a createMcpTools 预构建）按名去重，先入为主（内建优先于 MCP，旧仓
 *     assembleToolPool「built-in tools take precedence」语义）。
 *
 * 门控（旧仓 feature() → 新仓 env kill-switch，可测，同 T-5d coordinator 约定）：
 *   - ASCEND 域工具门：旧仓 feature('ASCEND_TOOLS')（ON_BY_DEFAULT）→ 新仓
 *     kill-switch `FEATURE_ASCEND_TOOLS=false` 关，否则开（env 可注入，单测不触 process.env）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 49 基础工具本体（Read/Edit/Bash/Glob/Grep/…；非 Ascend 朴素口径，Ascend 16 = 独立门控族另计）
 *     → 残留守（deps 注入位已铺；各本体纵切落地时填 deps，本机制不改）。
 *   - getToolsForDefaultPreset **E-4 S-4c1 已落**（机制面 deps 版，§8.34 裁定 ⑤；
 *     49 本体残留守不变，名单随 deps 注入增长）。
 *   - **E-4 S-4d ② 已落**：filterToolsByDenyRules（旧 tools.ts:271-278 逐字，
 *     域 getDenyRuleForTool 消费——MCP server 级 deny `mcp__server` 剥整 server，
 *     与运行时 1a 同匹配器）+ getTools(context, deps) = deny 过滤 + isEnabled
 *     过滤（旧 getTools 尾行，§8.37 审视 F2 回填）后工具池。
 *     裁出登记（复审勿当遗漏）：ATLAS_SIMPLE 三分支 / REPL 支 / specialTools
 *     剔除（新仓无 REPL/special 工具本体）/ getMergedTools（getAllBaseTools
 *     (deps.mcpTools) 已覆盖去重合并语义）→ 残留守。
 *   - 旧仓 assembleToolPool 的分区按名排序（1P-REST claude_code_system_cache_policy 缓存断点
 *     稳定性）→ 残留守（新仓 auth 车道 = OpenAI 协议静态键，无服务端工具级缓存断点；
 *     去重仅按名先入为主，不排序）。
 *   - 旧仓 getAllBaseTools 的 20 个条件门控槽 **逐槽裁定**（§8.53 S-T3 裁定表，复审勿当遗漏重提）：
 *     **关闭 3**（不迁）：⑤ OVERFLOW_TEST_TOOL（OverflowTest，测试专用无产品价值）
 *       ⑰ hasEmbeddedSearchTools（Glob/Grep 抑制，bun 内嵌 bfs/ugrep = 旧仓构建特例，
 *       新仓条件恒 false → Glob/Grep 恒注册，槽退化为 2 常量注册）
 *       ⑱ NODE_ENV=test（TestingPermission，新仓测试体系不消费该工具）。
 *     **域外改判 1**：⑳ PowerShell enabled（PowerShell，bash-only 纵切域外；
 *       B16 裁定同 = 域外改判登记，非 C 桶项）。
 *     **materialize 4**（本体已落、门已声明、自门控 isEnabled；本机制只保留已落面的
 *       ASCEND 门 + deps 注入，其余槽不声明防死接缝）：
 *       ② AGENT_TRIGGERS（§8.56 S-D4 materialize：cron 三件套自门控 isEnabled =
 *         isCronEnabled（ATLAS_DISABLE_CRON kill-switch），组合根 baseTools 注入位）
 *       ⑭ worktree mode（§8.57 S-D2b materialize：
 *       Enter/ExitWorktree 自门控 isEnabled = isWorktreeModeEnabled（ATLAS_DISABLE_
 *       WORKTREE_MODE kill-switch，GA 缺省开），worktree 域 E-7 S-7c + S-D2a 会话/tmux
 *       族已落，组合根 baseTools 注入位）
 *       ⑯ isTodoV2（§8.56 S-D3 materialize：Task 四件套 + TodoWrite 自门控 isEnabled =
 *         isTodoV2Enabled（+ TodoWrite 反向门控支），tasks 域 E-7 S-7a 已落，与 ② 同子波）
 *       ⑲ ToolSearch optimistic（§8.63 S-E2 materialize：ToolSearch 本体纵切
 *         （toolsearch/ 子域），自门控 isEnabled = isToolSearchEnabledOptimistic
 *         （ATLAS_ENABLE_TOOL_SEARCH env + ATLAS_DISABLE_EXPERIMENTAL_BETAS
 *         kill-switch + OPENAI_BASE_URL proxy 守卫，IFF env 常态 base 设真 →
 *         默认 gate OFF = 旧语义忠实非新增门），toolsearch 域已落，组合根
 *         baseTools 注入位；engine 面 4 函数族〔阈值判定 / modelSupportsTool
 *         Reference / extractDiscoveredToolNames / DeferredToolsDelta〕= 新仓
 *         0-hit 不复活登记，见 toolSearchGate 头注 delta ③）。
 *     **§8.64 登记零本体 8**（B 类 any-stub / C 类仅壳，终局裁定，无本体可落；
 *       本机制不声明防死接缝；§8.57 S-D1 B/C 类裁定 + §8.64 收口批，复审勿当遗漏重提）：
 *       ① IS_ATLAS_DEV（Tungsten [B] + SuggestBackgroundPR [C] + REPL [B]，无归属波，3 工具）
 *       ④ MONITOR_TOOL（Monitor [B]，`({}) as any` 占位）⑥ CONTEXT_COLLAPSE（CtxInspect [C]，目录缺失）
 *       ⑦ TERMINAL_PANEL（TerminalCapture [C]，仅 prompt.ts 2L，TUI 面 → shell 波）⑧ WEB_BROWSER_TOOL（WebBrowser [C]，仅 WebBrowserPanel.tsx 1L）
 *       ⑩ UDS_INBOX（ListPeers [C]，目录缺失；UDS 5 站点族 → remote 波）⑪ WORKFLOW_SCRIPTS（Workflow [B]，stub）
 *       ⑫ ATLAS_VERIFY_PLAN（VerifyPlanExecution [C]，仅 constants.ts 2L）
 *       （⑤ OVERFLOW_TEST_TOOL [B] 已列「关闭 3」，不在此列）
 *     **残留守 4**（各槽本体未落，门随本体纵切落；归属波标注。§8.53 S-T3 原始裁定
 *       残留守 16，②⑯ §8.56 materialize / ⑭ §8.57 S-D2b materialize / ⑲ §8.63 materialize
 *       后余 12，8 槽移「§8.64 登记零本体」后余 4）：
 *       ③ AGENT_TRIGGERS_REMOTE（RemoteTrigger → remote 波，D 波后）
 *       ⑨ HISTORY_SNIP（Snip → shell/REPL 波）⑬ ENABLE_LSP_TOOL（LSP → D 波重分类，LSP 域）
 *       ⑮ agentSwarms（TeamCreate/TeamDelete → shell·swarm 波）
 *   - 新仓无 lodash（memory/paths、sandbox 同例本地实现）→ 去重为本地 uniqByName。
 */
import type { Tool, Tools, ToolPermissionContext } from '../../shared'
import { getDenyRuleForTool } from '../../permissions'
import { AgentTool } from './agent/AgentTool'

/** 注册表注入面（H6：每个字段均有消费点，无死接缝）。 */
export interface ToolRegistryDeps {
  /** 已落基础工具本体（49 本体残留守，非 Ascend 朴素口径；各本体纵切落地时注入，注册表机制不变）。 */
  baseTools?: readonly Tool[]
  /** MCP 工具（T-5a createMcpTools 预构建，isMcp + mcpInfo 一等注册 Tool）。 */
  mcpTools?: readonly Tool[]
  /** Ascend 域 16 工具（域包挂载面注入；ASCEND_TOOLS 域门控，见下）。 */
  ascendTools?: readonly Tool[]
  /** 可注入 env（默认 process.env；单测用 fake env 不触真实环境）。 */
  env?: NodeJS.ProcessEnv
}

/**
 * ASCEND 域工具门（旧仓 feature('ASCEND_TOOLS') ON_BY_DEFAULT 语义等价，可测）。
 * kill-switch `FEATURE_ASCEND_TOOLS=false` 关，否则开（同 T-5d FEATURE_COORDINATOR_MODE 约定）。
 */
export function isAscendToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FEATURE_ASCEND_TOOLS !== 'false'
}

/**
 * 装配工具池（旧仓 getAllBaseTools + assembleToolPool 去重语义裁剪）。
 * 顺序：AgentTool（内建）→ baseTools → ascendTools（门控）→ mcpTools；按名去重先入为主。
 */
export function getAllBaseTools(deps: ToolRegistryDeps = {}): Tools {
  const env = deps.env ?? process.env
  const pool: Tool[] = [AgentTool]
  if (deps.baseTools) pool.push(...deps.baseTools)
  if (deps.ascendTools && isAscendToolsEnabled(env)) pool.push(...deps.ascendTools)
  if (deps.mcpTools) pool.push(...deps.mcpTools)
  return uniqByName(pool)
}

/** 按名去重先入为主（旧仓 uniqBy(name) 语义；新仓无 lodash，本地实现）。 */
function uniqByName(tools: readonly Tool[]): Tools {
  const seen = new Set<string>()
  const out: Tool[] = []
  for (const t of tools) {
    if (seen.has(t.name)) continue
    seen.add(t.name)
    out.push(t)
  }
  return out
}

/**
 * 默认预设工具名列表（E-4 S-4c1 自 S-4d ② 提前，§8.34 裁定 ⑤：
 * permissionSetup parseBaseToolsFromCLI / initializeToolPermissionContext
 * baseTools 补拒支消费）：getAllBaseTools(deps) 中 isEnabled() 工具名。
 * 旧仓 getToolsForDefaultPreset 逐字语义（`tool.isEnabled ? tool.isEnabled() : false`
 * → 新 shared Tool.isEnabled 必选方法，等价 `.filter(t => t.isEnabled())`）。
 * 49 工具本体残留守不变（机制面：本体经 deps 注入时名单随之增长；49 = 朴素口径，47 = 历史口径，§8.53 审计④）。
 */
export function getToolsForDefaultPreset(
  deps: ToolRegistryDeps = {},
): string[] {
  return getAllBaseTools(deps)
    .filter(t => t.isEnabled())
    .map(t => t.name)
}

/**
 * 过滤被权限上下文 blanket-deny 的工具（旧仓 tools.ts:271-278 逐字）：
 * 工具名（或 MCP server 前缀 `mcp__server`）命中无 ruleContent 的 deny 规则
 * 即剔除——模型可见池在调用前剥离，与运行时 checkPermission 1a 同一匹配器
 * （域 getDenyRuleForTool，S-4b）。
 */
export function filterToolsByDenyRules<
  T extends {
    name: string
    mcpInfo?: { serverName: string; toolName: string }
  },
>(tools: readonly T[], permissionContext: ToolPermissionContext): T[] {
  return tools.filter(tool => !getDenyRuleForTool(permissionContext, tool))
}

/**
 * 权限上下文下的模型可见工具池（E-4 S-4d ②，旧仓 getTools 裁剪版）：
 * getAllBaseTools(deps) 经 deny 规则过滤，末行 isEnabled 过滤（旧仓
 * getTools 尾 `_.isEnabled ? _.isEnabled() : false` 逐字等价——shared Tool
 * isEnabled 为必选方法，禁用的 feature 门控工具不进模型可见池，与
 * getToolsForDefaultPreset 的 isEnabled 名单同口径，§8.37 审视 F2 回填）。
 * 模式过滤支（ATLAS_SIMPLE/REPL/specialTools）裁出，见头注残留守。
 */
export function getTools(
  permissionContext: ToolPermissionContext,
  deps: ToolRegistryDeps = {},
): Tools {
  return filterToolsByDenyRules(getAllBaseTools(deps), permissionContext).filter(
    t => t.isEnabled(),
  )
}

/** 预定义工具预设（旧仓 tools.ts TOOL_PRESETS 逐字：当前仅 'default'）。 */
export const TOOL_PRESETS = ['default'] as const

export type ToolPreset = (typeof TOOL_PRESETS)[number]

/** 解析 --tools 预设名（大小写不敏感；未知 → null）。旧仓 parseToolPreset 逐字。 */
export function parseToolPreset(preset: string): ToolPreset | null {
  const presetString = preset.toLowerCase()
  if (!TOOL_PRESETS.includes(presetString as ToolPreset)) {
    return null
  }
  return presetString as ToolPreset
}
