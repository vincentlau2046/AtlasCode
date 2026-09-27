/**
 * Teammate 布局管理（配色轮转 + pane 操作委托）（C 桶 ③ shell·swarm 波
 * S-E2b，§8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/swarm/teammateLayoutManager.ts（107L）。
 *
 * import 面重映射：
 *   - AgentColorName/AGENT_COLORS → 域内 backends/types（旧 AgentTool/
 *     agentColorManager 8 值 + 轮转序已 S-E2a 镜像 + S-E2b 补 AGENT_COLORS，
 *     见该文件头注）
 *   - detectAndGetBackend（旧 ./backends/registry）/ 动态 import
 *     ('./backends/detection').isInsideTmux → 域内 backends/port
 *     requireBackendModule()（seam ② 注入窗；4 面本体 = S-E2c backends 族）
 *   - PaneBackend → 域内 backends/types
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - 旧 getBackend() 直调 registry detectAndGetBackend（惰性 + 内部缓存）→
 *     requireBackendModule().detectAndGetBackend()：fail-fast 型（编程性调用
 *     未接线 = 初始化 bug 抛不吞，seam ②）；未接线 null 缺省支仅 teamHelpers
 *     清理支消费（shutdown 路径不抛），本模块全编程性路径。
 *   - de-Claude 注释面：`external claude-swarm session` → `external atlas-swarm
 *     session`（SWARM_SESSION_NAME = 'atlas-swarm' 同族改名，constants 头注）。
 */
import type { AgentColorName, PaneBackend } from './backends/types'
import { AGENT_COLORS } from './backends/types'
import { requireBackendModule } from './backends/port'

// Track color assignments for teammates (persisted per session)
const teammateColorAssignments = new Map<string, AgentColorName>()
let colorIndex = 0

/**
 * Gets the appropriate backend for the current environment.
 * detectAndGetBackend() caches internally — no need for a second cache here.
 */
async function getBackend(): Promise<PaneBackend> {
  return (await requireBackendModule().detectAndGetBackend()).backend
}

/**
 * Assigns a unique color to a teammate from the available palette.
 * Colors are assigned in round-robin order.
 */
export function assignTeammateColor(teammateId: string): AgentColorName {
  const existing = teammateColorAssignments.get(teammateId)
  if (existing) {
    return existing
  }

  const color = AGENT_COLORS[colorIndex % AGENT_COLORS.length]!
  teammateColorAssignments.set(teammateId, color)
  colorIndex++

  return color
}

/**
 * Gets the assigned color for a teammate, if any.
 */
export function getTeammateColor(
  teammateId: string,
): AgentColorName | undefined {
  return teammateColorAssignments.get(teammateId)
}

/**
 * Clears all teammate color assignments.
 * Called during team cleanup to reset state for potential new teams.
 */
export function clearTeammateColors(): void {
  teammateColorAssignments.clear()
  colorIndex = 0
}

/**
 * Checks if we're currently running inside a tmux session.
 * Uses the detection module directly for this check.
 *（seam ②：旧动态 import detection 面 → backends/port 注入窗，登记见头注。）
 */
export async function isInsideTmux(): Promise<boolean> {
  return requireBackendModule().isInsideTmux()
}

/**
 * Creates a new teammate pane in the swarm view.
 * Automatically selects the appropriate backend (tmux or iTerm2) based on environment.
 *
 * When running INSIDE tmux:
 * - Uses TmuxBackend to split the current window
 * - Leader stays on left (30%), teammates on right (70%)
 *
 * When running in iTerm2 (not in tmux) with it2 CLI:
 * - Uses ITermBackend for native iTerm2 split panes
 *
 * When running OUTSIDE tmux/iTerm2:
 * - Falls back to TmuxBackend with external atlas-swarm session
 */
export async function createTeammatePaneInSwarmView(
  teammateName: string,
  teammateColor: AgentColorName,
): Promise<{ paneId: string; isFirstTeammate: boolean }> {
  const backend = await getBackend()
  return backend.createTeammatePaneInSwarmView(teammateName, teammateColor)
}

/**
 * Enables pane border status for a window (shows pane titles).
 * Delegates to the detected backend.
 */
export async function enablePaneBorderStatus(
  windowTarget?: string,
  useSwarmSocket = false,
): Promise<void> {
  const backend = await getBackend()
  return backend.enablePaneBorderStatus(windowTarget, useSwarmSocket)
}

/**
 * Sends a command to a specific pane.
 * Delegates to the detected backend.
 */
export async function sendCommandToPane(
  paneId: string,
  command: string,
  useSwarmSocket = false,
): Promise<void> {
  const backend = await getBackend()
  return backend.sendCommandToPane(paneId, command, useSwarmSocket)
}
