/**
 * engine/tools/worktree — 输入 duck 型（S-D2b §8.57 worktree 工具本体子波）。
 *
 * 旧仓 zod InputSchema z.infer 型 → TS duck 型承载（delta ① TS 型承载，
 * 同族 S-D3 taskToolInput / S-D4 scheduleToolInput 先例）。消费方 = 两本体
 * call/validateInput 解构位（自 unknown cast）。
 */

/** EnterWorktree 输入 duck（旧 z.strictObject({ name?: string })）。 */
export type EnterWorktreeToolInput = {
  name?: string
}

/** ExitWorktree 输入 duck（旧 z.strictObject({ action, discard_changes? })）。 */
export type ExitWorktreeToolInput = {
  action: 'keep' | 'remove'
  discard_changes?: boolean
}
