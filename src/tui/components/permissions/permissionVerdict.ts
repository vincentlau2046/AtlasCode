/**
 * P0a 可解释审批：审批面「verdict 一行」（spec docs/tui-differentiation-spec.md §4-P0a）。
 *
 * 零新数据、零边界：对 PermissionDecisionReason 判别联合的只读投影（主路径零改动，
 * 本文件仅消费既有纯函数，不写回任何状态）。verdict 三态钉死于 spec §1：
 *   - rule 命中  → ruleValue + source（非内部 ID）
 *   - auto-mode  → classifier + reason
 *   - mode       → 哪个 mode
 * 数值置信度不出现（真实 shape 无此字段，bash classifier 的 high|medium|low 是 ANT-only
 * stub 且 enabled=false，本投影永不引用）。
 *
 * 两个方向：ask 态 =「为何在问你」（弹框默认可见行）；allow 态的「为何自动放行」
 * 走 userApprovals.ts（用户批准标记）+ UserToolSuccessMessage 既有 classifier 行。
 */
import {
  getSettingSourceDisplayNameLowercase,
} from '../../utils/settings/constants.js'
import { permissionRuleValueToString } from '../../utils/permissions/permissionRuleParser.js'
import { permissionModeTitle } from '../../utils/permissions/PermissionMode.js'
import type {
  PermissionDecisionReason,
  PermissionMode,
} from '../../types/permissions.js'

/** verdict 行统一前缀（探针关键词族对齐用，文案原创）。 */
export const VERDICT_PREFIX = 'Verdict'

/**
 * 审批弹框 ask 态的默认可见 verdict 一行：为何在问你。
 * reason 缺省（引擎未附 decisionReason）→ null（不渲染，保持弹框原样）。
 */
export function verdictLine(
  reason: PermissionDecisionReason | undefined,
  mode: PermissionMode,
): string | null {
  const modeLabel = permissionModeTitle(mode)
  switch (reason?.type) {
    case 'rule': {
      // ruleValue + source 直出（非 r-NN 内部 ID）；行为词区分 allow/deny/ask 规则。
      const behavior = reason.rule.ruleBehavior
      return `${VERDICT_PREFIX}: hit ${behavior} rule "${permissionRuleValueToString(reason.rule.ruleValue)}" from ${getSettingSourceDisplayNameLowercase(reason.rule.source)}`
    }
    case 'classifier':
      // auto-mode 方向：分类器 + reason 文本（无数值置信度）。
      return `${VERDICT_PREFIX}: ${reason.classifier} classifier says: ${reason.reason}`
    case 'mode':
      return `${VERDICT_PREFIX}: no rule matched — ${modeLabel} mode asks you`
    case 'other':
      // 引擎 pass-through ask（无规则命中）附 {type:'other'}：归一到 mode 三态
      // （为何在问你 = 无规则命中 + 当前 mode），不回显引擎原始措辞。
      return `${VERDICT_PREFIX}: no rule matched — ${modeLabel} mode asks you`
    case 'hook':
      return `${VERDICT_PREFIX}: hook "${reason.hookName}"${reason.hookSource ? ` (${reason.hookSource})` : ''}${reason.reason ? ` says: ${reason.reason}` : ''}`
    case 'safetyCheck':
      return `${VERDICT_PREFIX}: safety check — ${reason.reason}`
    case 'workingDir':
      return `${VERDICT_PREFIX}: ${reason.reason}`
    case 'subcommandResults': {
      const n = reason.reasons.size
      return `${VERDICT_PREFIX}: ${n} sub-command${n === 1 ? '' : 's'} checked, ${modeLabel} mode asks you`
    }
    case 'permissionPromptTool':
      return `${VERDICT_PREFIX}: ${reason.permissionPromptToolName} handled this request`
    case 'asyncAgent':
      return `${VERDICT_PREFIX}: ${reason.reason}`
    case 'sandboxOverride':
      return `${VERDICT_PREFIX}: sandbox override (${reason.reason})`
    default:
      return null
  }
}
