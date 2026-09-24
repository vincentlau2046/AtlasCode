/**
 * engine/worktree 门面（E-7 S-7c，§8.48，STR-1 门面规则）。
 *
 * agent 隔离 worktree 面（createAgentWorktree / removeAgentWorktree /
 * cleanupStaleAgentWorktrees）+ slug 校验 + 本域自含 git 执行层（./git）。
 *
 * 外部消费方（工具本体波 / E-wave-end / AgentTool 门）只许
 * `import { ... } from 'src/engine/worktree'`（或 `../worktree`），
 * 不许 reach 内部文件（git.ts / worktree.ts）。
 *
 * H6 前向接缝登记（复审勿当遗漏）：见 worktree.ts / git.ts 头注
 * （hooks 面 / 交互会话绑定 / tmux 族 / copyWorktreeIncludeFiles /
 * attribution hook 块 / hasWorktreeChanges 全裁）。
 */
// worktree 核心
export {
  createAgentWorktree,
  removeAgentWorktree,
  cleanupStaleAgentWorktrees,
  validateWorktreeSlug,
  worktreeBranchName,
} from './worktree'

// 本域自含 git 执行层（最小真子集；解耦裁定见 git.ts 头注）
export {
  execFileNoThrowWithCwd,
  gitExe,
  findGitRoot,
  findCanonicalGitRoot,
  getDefaultBranch,
  resolveGitDir,
  resolveRef,
  readRawSymref,
  getCommonDir,
  readGitHead,
  readWorktreeHeadSha,
  isSafeRefName,
  isValidGitSha,
  parseGitConfigValue,
  parseConfigString,
  resetWorktreeGitCaches,
} from './git'
