/**
 * Teammate mode snapshot module.（C 桶 ③ shell·swarm 波 S-E2b，§8.66）
 *
 * 源 = 旧仓 a8af45b src/utils/swarm/backends/teammateModeSnapshot.ts（87L）。
 * 切片偏差登记：原 §8.66.1.5 排 S-E2c backends 族——spawnUtils（S-E2b 中层）
 * 硬依赖 getTeammateModeFromSnapshot（--teammate-mode 继承旗标支），随 S-E2b
 * 提前落位（S-E2c 面收窄为本文件核销）。
 *
 * 捕获面：session 启动时锁定 teammate mode（同 hooksConfigSnapshot 模式），
 * 运行期 config 变更不影响本会话。
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - 旧 getGlobalConfig().teammateMode 支裁除：新仓 globalConfig 面未落
 *     （engine/tools/config/configTool.ts delta ⑥「globalConfig 面未落
 *     → 本支不可达」同型裁定）→ capture 支 = CLI override ?? 'auto'。
 *   - 装配登记：captureTeammateModeSnapshot 调用点 = main.tsx 启动装配
 *     （TUI 波 / 组合根残留守 ⑤）；未 capture 时 getTeammateModeFromSnapshot
 *     走 init-bug 兜底支（logError + 补 capture + 'auto' 回退，旧语义逐字）。
 */
import { logError, logForDebugging } from '../shared'

export type TeammateMode = 'auto' | 'tmux' | 'in-process'

// 启动时捕获的 mode（模块态）
let initialTeammateMode: TeammateMode | null = null

// CLI override（--teammate-mode 提供时先于 capture 设置）
let cliTeammateModeOverride: TeammateMode | null = null

/**
 * 设置 CLI override（captureTeammateModeSnapshot 之前调用）。
 */
export function setCliTeammateModeOverride(mode: TeammateMode): void {
  cliTeammateModeOverride = mode
}

/**
 * 取当前 CLI override（无则 null）。
 */
export function getCliTeammateModeOverride(): TeammateMode | null {
  return cliTeammateModeOverride
}

/**
 * 清除 CLI override 并把快照更新为新 mode（用户 UI 改设置时调用，
 * 直接传值避竞态）。
 */
export function clearCliTeammateModeOverride(newMode: TeammateMode): void {
  cliTeammateModeOverride = null
  initialTeammateMode = newMode
  logForDebugging(
    `[TeammateModeSnapshot] CLI override cleared, new mode: ${newMode}`,
  )
}

/**
 * 捕获 session 启动时的 teammate mode（CLI 解析后早期调用）。
 * CLI override 优先于 config（裁面：globalConfig 支未落 → 缺省 'auto'）。
 */
export function captureTeammateModeSnapshot(): void {
  if (cliTeammateModeOverride) {
    initialTeammateMode = cliTeammateModeOverride
    logForDebugging(
      `[TeammateModeSnapshot] Captured from CLI override: ${initialTeammateMode}`,
    )
  } else {
    // globalConfig 面未落（裁面登记见头注）→ 缺省 'auto'
    initialTeammateMode = 'auto'
    logForDebugging(
      `[TeammateModeSnapshot] Captured default (no CLI override): ${initialTeammateMode}`,
    )
  }
}

/**
 * 取本会话 teammate mode（启动时快照，忽略运行期变更）。
 * capture 前调用 = 初始化 bug：logError + 补 capture（旧语义逐字）。
 */
export function getTeammateModeFromSnapshot(): TeammateMode {
  if (initialTeammateMode === null) {
    // This indicates an initialization bug - capture should happen in setup()
    logError(
      new Error(
        'getTeammateModeFromSnapshot called before capture - this indicates an initialization bug',
      ),
    )
    captureTeammateModeSnapshot()
  }
  // Fallback to 'auto' if somehow still null (shouldn't happen, but safe)
  return initialTeammateMode ?? 'auto'
}
