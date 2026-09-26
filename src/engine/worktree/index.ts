/**
 * engine/worktree 门面（E-7 S-7c §8.48 + S-D2a §8.57 回填，STR-1 门面规则）。
 *
 * agent 隔离 worktree 面（createAgentWorktree / removeAgentWorktree /
 * cleanupStaleAgentWorktrees）+ slug 校验 + 交互会话绑定面（S-D2a 回填：
 * WorktreeSession / createWorktreeForSession / keepWorktree /
 * cleanupWorktree / getCurrentWorktreeSession / restoreWorktreeSession /
 * generateTmuxSessionName）+ tmux 族（S-D2a 回填）+ 本域自含 git 执行层
 * （./git）。
 *
 * 外部消费方（Enter/ExitWorktree 工具本体 S-D2b / E-wave-end / AgentTool 门）
 * 只许 `import { ... } from 'src/engine/worktree'`（或 `../worktree`），
 * 不许 reach 内部文件（git.ts / worktree.ts）。
 *
 * H6 前向接缝登记（复审勿当遗漏）：见 worktree.ts / git.ts 头注
 * （hooks 面 / saveCurrentProjectConfig 持久化面 / copyWorktreeIncludeFiles /
 * attribution hook 块 / hasWorktreeChanges / execIntoTmuxWorktree 全裁，
 * 各归属波次逐处登记）。
 */
// worktree 核心（agent 隔离面）
export {
  createAgentWorktree,
  removeAgentWorktree,
  cleanupStaleAgentWorktrees,
  validateWorktreeSlug,
  worktreeBranchName,
} from './worktree'

// 交互会话绑定面（S-D2a §8.57 回填；delta 登记见 worktree.ts 头注）
export {
  type WorktreeSession,
  getCurrentWorktreeSession,
  restoreWorktreeSession,
  generateTmuxSessionName,
  createWorktreeForSession,
  keepWorktree,
  cleanupWorktree,
} from './worktree'

// tmux 族（S-D2a §8.57 回填）
export {
  parsePRReference,
  isTmuxAvailable,
  getTmuxInstallInstructions,
  createTmuxSessionForWorktree,
  killTmuxSession,
} from './worktree'

// 本域自含 git 执行层（最小真子集 + S-D2a getBranch；解耦裁定见 git.ts 头注）
export {
  execFileNoThrowWithCwd,
  gitExe,
  findGitRoot,
  findCanonicalGitRoot,
  getBranch,
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
