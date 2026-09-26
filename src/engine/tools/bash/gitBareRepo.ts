/**
 * engine/tools/bash — 裸 git 仓库判定（Bash 本体纵切子波 §8.54 S-B1 依赖闭包层）。
 *
 * 旧仓来源（a8af45b）: src/utils/git.ts L846-933 isCurrentDirectoryBareGitRepo
 * 逐字随迁（docstring SECURITY 攻击场景 + 函数体）。消费方 = 本域
 * readOnlyValidation.ts（S-B3）checkReadOnlyConstraints 决策链
 * 「cwd 为裸 git 仓库 → passthrough」特判支。
 *
 * delta 登记（import 替换 + 1 eslint 指令裁，docstring/函数体逐字；
 * 复审勿当遗漏重提）：
 *  - 旧 `getFsImplementation().statSync`（utils/fsOperations.js 抽象层）→
 *    node:fs statSync 直读（D-6 登记：新仓无 fs 抽象层，permissions 域
 *    pathValidation 同裁定先例）。
 *  - 旧 `getCwd`（utils/cwd.js）→ 新仓 bootstrap 域门面 `../../../bootstrap`
 *    （同一语义源，E 波 bootstrap 落点；域门面 = boundaries 规则唯一合法
 *    深 import 出口，S-T 波 pathHelpers/bashPermissions 先例）。
 *  - eslint 裁指令 1 处（旧 `custom-rules/no-sync-fs` disable = 旧仓自研
 *    rule，新仓无）转纯注——理据「sync permission-eval check」保留：
 *    权限求值路径必须同步（决策发生在 tool dispatch 同步上下文，
 *    async fs 会破坏调用契约），同步 fs 为有意选择非遗漏。
 *
 * 探针 P-B5 锚点（§8.54 ⑧ 突变面）：`.git/HEAD` 的 statSync(gitHeadPath)
 * .isFile() 安全守卫（目录型 HEAD 被 git setup_git_directory 拒绝 →
 * 回落 cwd 裸库探测；删守卫 = 目录型 .git/HEAD 误判为正常仓库）。
 */
import { statSync } from 'fs'
import { join } from 'path'
import { getCwd } from '../../../bootstrap'

/**
 * Checks if the current working directory appears to be a bare git repository
 * or has been manipulated to look like one (sandbox escape attack vector).
 *
 * SECURITY: Git's is_git_directory() function (setup.c:417-455) checks for:
 * 1. HEAD file - Must be a valid ref
 * 2. objects/ directory - Must exist and be accessible
 * 3. refs/ directory - Must exist and be accessible
 *
 * If all three exist in the current directory (not in a .git subdirectory),
 * Git treats the current directory as a bare repository and will execute
 * hooks/pre-commit and other hook scripts from the cwd.
 *
 * Attack scenario:
 * 1. Attacker creates HEAD, objects/, refs/, and hooks/pre-commit in cwd
 * 2. Attacker deletes or corrupts .git/HEAD to invalidate the normal git directory
 * 3. When user runs 'git status', Git treats cwd as the git dir and runs the hook
 *
 * @returns true if the cwd looks like a bare/exploited git directory
 */
// sync fs 有意选择（旧仓 eslint-disable custom-rules/no-sync-fs 理据，见头注）
export function isCurrentDirectoryBareGitRepo(): boolean {
  const cwd = getCwd()

  const gitPath = join(cwd, '.git')
  try {
    const stats = statSync(gitPath)
    if (stats.isFile()) {
      // worktree/submodule — Git follows the gitdir reference
      return false
    }
    if (stats.isDirectory()) {
      const gitHeadPath = join(gitPath, 'HEAD')
      try {
        // SECURITY: check isFile(). An attacker creating .git/HEAD as a
        // DIRECTORY would pass a bare statSync but Git's setup_git_directory
        // rejects it (not a valid HEAD) and falls back to cwd discovery.
        if (statSync(gitHeadPath).isFile()) {
          // normal repo — .git/HEAD valid, Git won't fall back to cwd
          return false
        }
        // .git/HEAD exists but is not a regular file — fall through
      } catch {
        // .git exists but no HEAD — fall through to bare-repo check
      }
    }
  } catch {
    // no .git — fall through to bare-repo indicator check
  }

  // No valid .git/HEAD found. Check if cwd has bare git repo indicators.
  // Be cautious — flag if ANY of these exist without a valid .git reference.
  // Per-indicator try/catch so an error on one doesn't mask another.
  try {
    if (statSync(join(cwd, 'HEAD')).isFile()) return true
  } catch {
    // no HEAD
  }
  try {
    if (statSync(join(cwd, 'objects')).isDirectory()) return true
  } catch {
    // no objects/
  }
  try {
    if (statSync(join(cwd, 'refs')).isDirectory()) return true
  } catch {
    // no refs/
  }
  return false
}
