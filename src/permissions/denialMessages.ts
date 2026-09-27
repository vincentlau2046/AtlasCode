/**
 * permissions 域 — 权限拒绝文案（§8.65 C 桶 ②，旧仓 messages.ts:234-250 逐字）。
 *
 * 旧仓来源（a8af45b）：DENIAL_WORKAROUND_GUIDANCE + DONT_ASK_REJECT_MESSAGE
 * （② dontAsk 模式 ask→deny 转换的拒绝文案，旧 permissions.ts:490-504 消费）。
 *
 * 裁剪 delta（复审勿当遗漏重提）：
 * ① 旧仓 AUTO_REJECT_MESSAGE（auto-reject 通用拒绝文案，同用 DENIAL_WORKAROUND_GUIDANCE）
 *    本波 0 消费者（auto-reject 面归 provider 波），不随迁——前向登记。
 * ② buildYoloRejectionMessage / buildClassifierUnavailableMessage / isClassifierDenial
 *    （分类器拒绝文案族，消费 buildYoloRejectionMessage 需 feature('BASH_CLASSIFIER') 分支）
 *    = LLM 闭包 / TUI 面前向接缝（provider / TUI 波），不随迁——本文件仅落 ② 转换所需的
 *    DENIAL_WORKAROUND_GUIDANCE + DONT_ASK_REJECT_MESSAGE 两常量（逐字）。
 * ③ 本文件 = ② dontAsk 转换（permissions.ts ask→deny）的文案单一事实源；
 *    DENIAL_WORKAROUND_GUIDANCE 供后续分类器拒绝文案族（② 前向接缝）复用。
 */

/**
 * Shared guidance for permission denials, instructing the model on appropriate workarounds.
 */
export const DENIAL_WORKAROUND_GUIDANCE =
  `IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, ` +
  `e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, ` +
  `e.g. do not use your ability to run tests to execute non-test actions. ` +
  `You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. ` +
  `If you believe this capability is essential to complete the user's request, STOP and explain to the user ` +
  `what you were trying to do and why you need this permission. Let the user decide how to proceed.`

/** dontAsk 模式拒绝文案（② 转换 ask→deny 时携带）。 */
export function DONT_ASK_REJECT_MESSAGE(toolName: string): string {
  return `Permission to use ${toolName} has been denied because Atlas is running in don't ask mode. ${DENIAL_WORKAROUND_GUIDANCE}`
}
