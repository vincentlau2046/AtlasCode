/**
 * engine/config — restricted 模式单一事实源（C9-2，0.1.79 W-C；CC 2.1.248 对齐件）。
 *
 * 语义（工单 docs/2026-10-23-p0-wave-0179-ticket.md §1.10）：
 *   - 真值 = CLI flag fold（setRestrictedMode，不写 process.env）?? env
 *     `ATLAS_RESTRICTED`（卷 3 §5 env 命名单一 ATLAS_ 前缀；不引入
 *     CLAUDE_CODE_RESTRICTED 旧名）。
 *   - 受限可信面：剥离命令运行类工具 + WebFetch + Agent（子代理 = 命令执行
 *     旁路面，Main 裁定剥离）；拒 bypassPermissions；忽略 user/project/local
 *     settings（安全收紧向，无授权扩张）。
 *
 * 裁定登记（Main，随波报面）：
 *   - policySettings 保留：managed-settings.json = 企业管控通道，restricted
 *     模式不剥离企业策略（与上游 restricted 语义一致，收紧向）。
 *   - MCP 工具不剥（残留守）：登记面仍由 --mcp-config 控制。
 *   - Ascend 域工具随 restricted 门控出：exec CANN 工具链 = 命令运行面
 *     （toolRegistry.ts 装配门）。
 *
 * 叶模块约束（TDZ 防环）：本文件只 import shared 门面 + 本域类型
 * （type-only），不 import tools / settings 运行时面——toolRegistry 与
 * settings 单向消费本模块。
 */
import { isEnvTruthy } from '../../shared'
import type { SettingSource } from './constants'

/** CLI flag fold 态（undefined = 未 fold，回落 env）。 */
let restrictedOverride: boolean | undefined

/**
 * restricted 模式真值：flag fold ?? env ATLAS_RESTRICTED。
 */
export function isRestrictedMode(): boolean {
  return restrictedOverride ?? isEnvTruthy(process.env.ATLAS_RESTRICTED)
}

/**
 * CLI flag fold（--restricted → true）。刻意不写 process.env：fold 态归本模块，
 * env 是独立真值源（headless -p / TUI 双面在 setup 前调用）。
 */
export function setRestrictedMode(enabled: boolean): void {
  restrictedOverride = enabled
}

/** 测试态复位（回落 env）。 */
export function resetRestrictedMode(): void {
  restrictedOverride = undefined
}

/**
 * restricted 下需忽略的 settings 源（user/project/local；policy = 企业管控
 * 通道保留，flag = 死源不受影响）。
 * 消费点：getEnabledSettingSources（级联剥 userSettings）+
 * getSettingsForSourceUncached（按源直读 null，覆盖 permissionsLoader/
 * hooksSettings/sandbox 直读面）+ updateSettingsForSource（写回拒）。
 */
export function isSettingsSourceIgnoredInRestricted(source: SettingSource): boolean {
  if (!isRestrictedMode()) return false
  return (
    source === 'userSettings' ||
    source === 'projectSettings' ||
    source === 'localSettings'
  )
}

/**
 * bypass 拒纯决策（restricted + bypassPermissions / --dangerously-skip-permissions
 * 任一面 → 错误文案；否则 null）。接线 = cli/setup.ts + tui/setup.ts 双门
 * （stderr + exit 1，同 root/sudo 门范型）；纯函数化供单测不触 process.exit。
 */
export function restrictedBypassError(opts: {
  permissionMode?: string
  allowDangerouslySkipPermissions?: boolean
  dangerouslySkipPermissions?: boolean
}): string | null {
  if (!isRestrictedMode()) return null
  if (
    opts.permissionMode === 'bypassPermissions' ||
    opts.allowDangerouslySkipPermissions === true ||
    opts.dangerouslySkipPermissions === true
  ) {
    return '--restricted mode does not allow bypassPermissions or --dangerously-skip-permissions for security reasons'
  }
  return null
}
