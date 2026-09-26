/**
 * engine/tools/worktree — prompt 面 + 门控（S-D2b §8.57 worktree 工具本体子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/EnterWorktreeTool/prompt.ts 30L +
 * src/tools/ExitWorktreeTool/prompt.ts 32L 逐字随迁（PROMPT 模板体 sha256
 * 字节核）+ 两短 description() 体（TOOL_DEFAULTS 短面，导出不接线 = TUI 波
 * 前向接缝，同 S-D3 DESCRIPTION 族）+ 门控 isWorktreeModeEnabled（旧仓
 * utils/worktreeModeEnabled.ts 语义 + 新仓本地 kill-switch，下注）。
 *
 * 消费方：enterWorktreeTool.ts / exitWorktreeTool.ts description() 面 +
 * tools/ 门面 re-export 块（双门面回归面）。
 */
import { isEnvTruthy } from '../../../shared'

/**
 * 旧仓 EnterWorktreeTool/prompt.ts getEnterWorktreeToolPrompt() 模板体逐字
 * （sha256 字节核；`\`` 转义序列随迁）。
 */
export const ENTER_WORKTREE_PROMPT = `Use this tool ONLY when the user explicitly asks to work in a worktree. This tool creates an isolated git worktree and switches the current session into it.

## When to Use

- The user explicitly says "worktree" (e.g., "start a worktree", "work in a worktree", "create a worktree", "use a worktree")

## When NOT to Use

- The user asks to create a branch, switch branches, or work on a different branch — use git commands instead
- The user asks to fix a bug or work on a feature — use normal git workflow unless they specifically mention worktrees
- Never use this tool unless the user explicitly mentions "worktree"

## Requirements

- Must be in a git repository, OR have WorktreeCreate/WorktreeRemove hooks configured in settings.json
- Must not already be in a worktree

## Behavior

- In a git repository: creates a new git worktree inside \`.atlas/worktrees/\` with a new branch based on HEAD
- Outside a git repository: delegates to WorktreeCreate/WorktreeRemove hooks for VCS-agnostic isolation
- Switches the session's working directory to the new worktree
- Use ExitWorktree to leave the worktree mid-session (keep or remove). On session exit, if still in the worktree, the user will be prompted to keep or remove it

## Parameters

- \`name\` (optional): A name for the worktree. If not provided, a random name is generated.
`

/**
 * 旧仓 ExitWorktreeTool/prompt.ts getExitWorktreeToolPrompt() 模板体逐字
 * （sha256 字节核；`\`` 转义序列随迁）。
 */
export const EXIT_WORKTREE_PROMPT = `Exit a worktree session created by EnterWorktree and return the session to the original working directory.

## Scope

This tool ONLY operates on worktrees created by EnterWorktree in this session. It will NOT touch:
- Worktrees you created manually with \`git worktree add\`
- Worktrees from a previous session (even if created by EnterWorktree then)
- The directory you're in if EnterWorktree was never called

If called outside an EnterWorktree session, the tool is a **no-op**: it reports that no worktree session is active and takes no action. Filesystem state is unchanged.

## When to Use

- The user explicitly asks to "exit the worktree", "leave the worktree", "go back", or otherwise end the worktree session
- Do NOT call this proactively — only when the user asks

## Parameters

- \`action\` (required): \`"keep"\` or \`"remove"\`
  - \`"keep"\` — leave the worktree directory and branch intact on disk. Use this if the user wants to come back to the work later, or if there are changes to preserve.
  - \`"remove"\` — delete the worktree directory and its branch. Use this for a clean exit when the work is done or abandoned.
- \`discard_changes\` (optional, default false): only meaningful with \`action: "remove"\`. If the worktree has uncommitted files or commits not on the original branch, the tool will REFUSE to remove it unless this is set to \`true\`. If the tool returns an error listing changes, confirm with the user before re-invoking with \`discard_changes: true\`.

## Behavior

- Restores the session's working directory to where it was before EnterWorktree
- Clears CWD-dependent caches (system prompt sections, memory files, plans directory) so the session state reflects the original directory
- If a tmux session was attached to the worktree: killed on \`remove\`, left running on \`keep\` (its name is returned so the user can reattach)
- Once exited, EnterWorktree can be called again to create a fresh worktree
`

/** 旧仓 EnterWorktreeTool description() 短体（导出不接线，TUI 波前向接缝）。 */
export const ENTER_WORKTREE_DESCRIPTION =
  'Creates an isolated worktree (via git or configured hooks) and switches the session into it'

/** 旧仓 ExitWorktreeTool description() 短体（导出不接线，TUI 波前向接缝）。 */
export const EXIT_WORKTREE_DESCRIPTION =
  'Exits a worktree session created by EnterWorktree and restores the original working directory'

/**
 * Worktree mode 门控（注册表 ⑭ worktree mode 槽 materialize，S-D2b）。
 *
 * 旧仓 utils/worktreeModeEnabled.ts 语义逐字：GB flag 'atlas_worktree_mode'
 * 已整砍（CACHED_MAY_BE_STALE 模式首启缓存未热返缺省 false，静默吞
 * --worktree，issue #27044），旧体恒 true（GA 全量开）。新仓随 isCronEnabled
 * 先例（S-D4，ported GA-on gate 加本地 kill-switch）：`ATLAS_DISABLE_WORKTREE_MODE`
 * 设真即关（设真静默跳过，不提示），缺省开。
 */
export function isWorktreeModeEnabled(): boolean {
  return !isEnvTruthy(process.env.ATLAS_DISABLE_WORKTREE_MODE)
}
