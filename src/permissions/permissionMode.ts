/**
 * permissionMode — PermissionMode 常量 + 字符串解析（E-4 S-4c1，§8.34 矛盾 ⑥）
 *
 * 旧仓来源（a8af45b）: src/types/permissions.ts:16-29 常量族 +
 * src/utils/permissions/PermissionMode.ts:115 permissionModeFromString。
 * 新仓 PermissionMode 类型在 shared/types-session.ts（B 波契约冻结下沉）；
 * 本文件 = 域内常量单一事实源（值旧仓逐字）+ fromString 纯函数。
 *
 * 裁剪登记（复审勿当遗漏重提）：
 * - 旧 INTERNAL_PERMISSION_MODES 的 'auto' 成员 = feature('TRANSCRIPT_CLASSIFIER')
 *   门控；新仓 auto 支裁（auto-mode 纵切波，§8.34 裁定 ③）→ 运行时校验集 =
 *   外部 5 值，fromString('auto') 回落 'default'（auto 未落前不可用户寻址，
 *   语义与 auto-mode 波前旧仓 TRANSCRIPT_CLASSIFIER off 态一致）。
 * - 'bubble' = 仅类型并集成员（旧仓注释「exhaustive for typechecking」，
 *   运行时校验集不含），不随迁常量。
 * - UI 配置面（title/shortTitle/symbol/color 族 + PAUSE_ICON）不随迁：
 *   S-4b ruleMatching.ts PERMISSION_MODE_TITLES 已持 5 外部模式展示标题，
 *   TUI 符号/色面 = 残留守。
 *
 * 消费点（H6 实挂）：engine/permissions/permissionSetup.ts
 * initialPermissionModeFromCLI（CLI 模式串 → PermissionMode 解析）。
 */
import type {
  ExternalPermissionMode,
  InternalPermissionMode,
  PermissionMode,
} from '../shared'

export const EXTERNAL_PERMISSION_MODES = [
  'acceptEdits',
  'bypassPermissions',
  'default',
  'dontAsk',
  'plan',
] as const satisfies readonly ExternalPermissionMode[]

/**
 * 运行时校验集（用户可寻址：settings.json defaultMode / --permission-mode /
 * 会话恢复）。auto 裁出（上裁面登记），= 外部 5 值。
 */
export const INTERNAL_PERMISSION_MODES = [
  ...EXTERNAL_PERMISSION_MODES,
] as const satisfies readonly InternalPermissionMode[]

export const PERMISSION_MODES = INTERNAL_PERMISSION_MODES

/** 字符串 → PermissionMode（旧仓逐字：校验集命中 → 该 mode，否则 'default'）。 */
export function permissionModeFromString(str: string): PermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(str)
    ? (str as PermissionMode)
    : 'default'
}
