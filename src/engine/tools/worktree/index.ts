/**
 * engine/tools/worktree 子门面（S-D2b §8.57 worktree 工具本体子波，
 * STR-1 显式名块纪律）。
 *
 * 覆盖两本体对象（EnterWorktreeTool / ExitWorktreeTool）+ JSON schema 2
 * 常量（ENTER/EXIT_WORKTREE_TOOL_INPUT_SCHEMA）+ Output 型 2 + prompt 面
 * （2 PROMPT + 2 DESCRIPTION 短常量 + isWorktreeModeEnabled 门控）+ duck
 * 型 2（worktreeToolInput）。
 *
 * 纪律（tools/index.ts tasks/schedule 块先例）：逐名显式 re-export，无
 * `export *`；各文件头注 delta 登记不随门面重复（单一事实源 = 各模块头注）。
 *
 * 重名登记：无（2 PROMPT / 2 DESCRIPTION 常量名互异，消费方 = 各工具
 * description() 同源 + TUI 波前向接缝面）。
 *
 * 消费方：tools/ 门面 S-D2b re-export 块 + 组合根 baseTools 注入位
 * （注册表 ⑭ worktree mode 槽，自门控 isEnabled = isWorktreeModeEnabled
 * （ATLAS_DISABLE_WORKTREE_MODE kill-switch，GA 缺省开））。
 */
export {
  ENTER_WORKTREE_TOOL_INPUT_SCHEMA,
  EnterWorktreeTool,
  type EnterWorktreeOutput,
} from './enterWorktreeTool'
export {
  EXIT_WORKTREE_TOOL_INPUT_SCHEMA,
  ExitWorktreeTool,
  type ExitWorktreeOutput,
} from './exitWorktreeTool'
export {
  ENTER_WORKTREE_PROMPT,
  EXIT_WORKTREE_PROMPT,
  ENTER_WORKTREE_DESCRIPTION,
  EXIT_WORKTREE_DESCRIPTION,
  isWorktreeModeEnabled,
} from './worktreePrompt'
export {
  type EnterWorktreeToolInput,
  type ExitWorktreeToolInput,
} from './worktreeToolInput'
