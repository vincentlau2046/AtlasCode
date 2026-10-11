/**
 * engine/tools/worktree — 输入 duck 型（S-D2b §8.57 worktree 工具本体子波）。
 *
 * 旧仓 zod InputSchema z.infer 型 → TS duck 型承载（delta ① TS 型承载，
 * 同族 S-D3 taskToolInput / S-D4 scheduleToolInput 先例）。消费方 = 两本体
 * call/validateInput 解构位（自 unknown cast）。
 */

/**
 * EnterWorktree 输入 duck（旧 z.strictObject({ name?: string })）。
 * AD-21（0.1.51 C-1）：`path?` 面新增——现存 worktree 探测进入（不新建，
 * `git worktree list --porcelain` 探针）；双给 = name 优先（零回归语义位）。
 */
export type EnterWorktreeToolInput = {
  name?: string
  /** AD-21：本仓现存 git worktree 路径（进入不新建；不存在/非注册 worktree 可操作报错）。 */
  path?: string
}

/** ExitWorktree 输入 duck（旧 z.strictObject({ action, discard_changes? })）。 */
export type ExitWorktreeToolInput = {
  action: 'keep' | 'remove'
  discard_changes?: boolean
}
