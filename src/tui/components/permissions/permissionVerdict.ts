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
 *
 * allow 面修（2026-10-04，b8 第 4 轮 cardAllow 根因）：successCardRenderMode——
 * 无结果渲染器工具（TUI-lane Bash 桥接适配器无 renderToolResultMessage）的
 * 用户批准标记行不再被 renderedMessage === null 早退一并跳过。
 *
 * A4 句式定稿（2026-10-05 §4b，f4 批准）：rule/classifier/mode(+other)/bypass
 * 四族全英文 6 句（VERDICT_PREFIX 前缀 + 定稿句体）：
 *   - rule(ask/deny)   → Rule "<ruleValue>" from <source> requires confirmation.
 *   - rule(allow)      → Allowed by rule "<ruleValue>" (<source>).
 *   - classifier 危险  → Auto mode: classifier flagged this as dangerous.
 *   - classifier 自动放行 → Auto-approved by classifier: <reason>.（classifierAutoApproved）
 *   - mode             → <modeLabel> mode requires confirmation for <tool>.
 *   - bypass           → Bypass mode — all commands allowed.
 * 其余 reason 型（hook/safetyCheck/workingDir/subcommandResults/permissionPromptTool/
 * asyncAgent/sandboxOverride）保持既有英文句式。toolName / classifierAutoApproved
 * 为加性可选参（旧 2 参调用点与单测全兼容，缺省 tool 回落 'this command'）。
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
 * A4 加性参：toolName（mode 句 <tool> 槽，缺省 'this command'）+
 * classifierAutoApproved（classifier 句二态选择，Bash 面 classifier 自动放行时传 true）。
 */
export function verdictLine(
  reason: PermissionDecisionReason | undefined,
  mode: PermissionMode,
  toolName?: string,
  classifierAutoApproved = false,
): string | null {
  const modeLabel = permissionModeTitle(mode)
  const tool = toolName ?? 'this command'
  switch (reason?.type) {
    case 'rule': {
      // A4：rule 态两句定稿 —— allow 句 / ask·deny 句（ruleValue + source 直出，
      // 非 r-NN 内部 ID）。
      const ruleValue = permissionRuleValueToString(reason.rule.ruleValue)
      const source = getSettingSourceDisplayNameLowercase(reason.rule.source)
      if (reason.rule.ruleBehavior === 'allow') {
        return `${VERDICT_PREFIX}: Allowed by rule "${ruleValue}" (${source}).`
      }
      return `${VERDICT_PREFIX}: Rule "${ruleValue}" from ${source} requires confirmation.`
    }
    case 'classifier':
      // A4：classifier 态两句定稿 —— 危险 flag（auto-mode 门控方向）/ 自动放行
      // （classifier 先于用户批准，弹框选项禁用态，带 reason 文本；无数值置信度）。
      if (classifierAutoApproved) {
        return `${VERDICT_PREFIX}: Auto-approved by classifier: ${reason.reason}.`
      }
      return `${VERDICT_PREFIX}: Auto mode: classifier flagged this as dangerous.`
    case 'mode':
    case 'other': {
      // A4：mode/other 归一（引擎 pass-through ask {type:'other'} 不回显引擎原始措辞）：
      // bypass 态独立句；其余 mode 用 <modeLabel> 定稿句（plan 标签已含 mode，去重）。
      if (mode === 'bypassPermissions') {
        return `${VERDICT_PREFIX}: Bypass mode — all commands allowed.`
      }
      const label = modeLabel.toLowerCase()
      const modeWord = label.endsWith('mode') ? label : `${label} mode`
      return `${VERDICT_PREFIX}: ${modeWord} requires confirmation for ${tool}.`
    }
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

/**
 * P0a allow 面修（2026-10-04，b8 第 4 轮 cardAllow 根因）：成功卡渲染决策。
 *
 * 原 UserToolSuccessMessage 对 renderedMessage === null（工具无
 * renderToolResultMessage，如 TUI-lane Bash 桥接适配器——W2-2b 结果体走
 * BashToolResultMessage 独立叠加层，适配器对象不挂结果渲染器）早退
 * return null，把已 setUserApproval 的用户批准标记行一并跳过（marker 设了
 * 但不可见）。修：marker 存在时放行 marker-only 渲染形；否则原早退语义
 * 逐字保持（未批准工具零行为变更）。
 *
 *   - 'full'   ：renderedMessage 非 null → 原完整渲染形（含 PostToolUse hook 进度）。
 *   - 'marker' ：renderedMessage null + 用户批准标记 → 仅渲染批准标记行（无 hook 进度，
 *                与 pre-P0a 早退行为对齐，只新增标记行本身）。
 *   - 'skip'   ：renderedMessage null + 无标记 → 早退（原语义）。
 */
export function successCardRenderMode(
  renderedMessage: unknown,
  userApproved: boolean,
): 'full' | 'marker' | 'skip' {
  if (renderedMessage !== null) return 'full'
  return userApproved ? 'marker' : 'skip'
}
