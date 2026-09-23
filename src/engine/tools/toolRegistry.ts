/**
 * engine/tools — 工具注册表机制（§8.25 E-2 T-5e，旧仓 tools.ts getAllBaseTools 裁剪版真核心）
 *
 * 旧仓 tools.ts `getAllBaseTools()` 是 47 工具本体的模块级 import + feature()/env 门控装配。
 * 新仓裁剪为 **deps 注入的注册表机制**：工具本体未落（47 个残留守，随后续纵切逐个落），
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
 *   - 47 工具本体（Read/Edit/Bash/Glob/Grep/… + Ascend 16）→ 残留守（deps 注入位已铺；
 *     各本体纵切落地时填 deps，本机制不改）。
 *   - getToolsForDefaultPreset **E-4 S-4c1 已落**（机制面 deps 版，§8.34 裁定 ⑤；
 *     47 本体残留守不变，名单随 deps 注入增长）；余 getTools 模式过滤
 *     （ATLAS_SIMPLE 三分支 + REPL 分支 + 权限 deny 规则 filterToolsByDenyRules → S-4d）/
 *     getMergedTools（无去重 concat，getAllBaseTools(deps.mcpTools) 已覆盖去重合并语义）
 *     → 残留守（S-4d ② 补 getTools / filterToolsByDenyRules）。
 *   - 旧仓 assembleToolPool 的分区按名排序（1P-REST claude_code_system_cache_policy 缓存断点
 *     稳定性）→ 残留守（新仓 auth 车道 = OpenAI 协议静态键，无服务端工具级缓存断点；
 *     去重仅按名先入为主，不排序）。
 *   - 旧仓 getAllBaseTools 的 20 个条件门控槽**全部**残留守（各槽本体未落，门随本体纵切落；
 *     本机制只保留已落面的 ASCEND 门 + deps 注入，其余槽不声明防死接缝）：
 *     ① IS_ATLAS_DEV（REPL + SuggestBackgroundPR）② AGENT_TRIGGERS（cron 三件套）
 *     ③ AGENT_TRIGGERS_REMOTE（RemoteTrigger）④ MONITOR_TOOL（Monitor）
 *     ⑤ OVERFLOW_TEST_TOOL（OverflowTest）⑥ CONTEXT_COLLAPSE（CtxInspect）
 *     ⑦ TERMINAL_PANEL（TerminalCapture）⑧ WEB_BROWSER_TOOL（WebBrowser）
 *     ⑨ HISTORY_SNIP（Snip）⑩ UDS_INBOX（ListPeers）⑪ WORKFLOW_SCRIPTS（Workflow）
 *     ⑫ ATLAS_VERIFY_PLAN（VerifyPlanExecution）⑬ ENABLE_LSP_TOOL（LSP）
 *     ⑭ worktree mode（Enter/ExitWorktree）⑮ agentSwarms（TeamCreate/TeamDelete）
 *     ⑯ isTodoV2（Task 四件套）⑰ hasEmbeddedSearchTools（Glob/Grep 抑制）
 *     ⑱ NODE_ENV=test（TestingPermission）⑲ ToolSearch optimistic（ToolSearch）
 *     ⑳ PowerShell enabled（PowerShell）。
 *   - 新仓无 lodash（memory/paths、sandbox 同例本地实现）→ 去重为本地 uniqByName。
 */
import type { Tool, Tools } from '../../shared'
import { AgentTool } from './agent/AgentTool'

/** 注册表注入面（H6：每个字段均有消费点，无死接缝）。 */
export interface ToolRegistryDeps {
  /** 已落基础工具本体（47 本体残留守；各本体纵切落地时注入，注册表机制不变）。 */
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
 * 47 工具本体残留守不变（机制面：本体经 deps 注入时名单随之增长）。
 */
export function getToolsForDefaultPreset(
  deps: ToolRegistryDeps = {},
): string[] {
  return getAllBaseTools(deps)
    .filter(t => t.isEnabled())
    .map(t => t.name)
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
