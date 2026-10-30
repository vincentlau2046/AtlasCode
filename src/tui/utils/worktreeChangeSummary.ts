/**
 * worktree 退出检查 helper（wave0183 K4-2，f4 工单 §1.B）
 *
 * WorktreeExitDialog 的退出安全门：统计 worktree 相对基线的未提交文件数与
 * 未推 commit 数。fail-closed 契约：**null = unknown，绝非 0/0** ——
 *   - `git status --porcelain` 非零退出（旧 dialog 不核 code，失败 stdout ''
 *     被误判成干净树）；
 *   - 无可信基线（hook-based session 无 originalHeadCommit，旧 dialog 拼出
 *     `rev-list --count undefined..HEAD` 必败后 `parseInt('')||0` 折成 0 commits）；
 *   - rev-list 非零退出 / 非数字输出（不 `||0` 折叠）；
 *   - exec 抛错。
 * 均返回 null；调用方必须按「未知即不安全」处理（进询问，不得静默清理）。
 * 所有 git 调用经 `-C <worktreePath>` 绑定 worktreePath，不依赖进程 cwd。
 */
import { execFileNoThrow } from './execFileNoThrow.js';
import { gitExe } from './git.js';

export type WorktreeChangeSummary = {
  /** 未提交文件数（`git status --porcelain` 非空行数） */
  changedFiles: number;
  /** 基线之后、worktree HEAD 之上的 commit 数（`rev-list --count <base>..HEAD`） */
  commits: number;
};

/**
 * 检查 worktree 相对基线的变更状态。
 *
 * 只有「status 成功 + 可信基线在场 + rev-list 成功且输出为纯数字」才返回计数；
 * 任一环节失败返回 null（unknown）。把 null 折成 `{0, 0}` 会复活旧 dialog 的
 * 静默删除数据丢失路径 —— 消费方（WorktreeExitDialog）以 null 为「进询问、
 * 默认 keep、remove hook 调用 0」的信号。
 */
export async function inspectWorktreeChanges(
  worktreePath: string,
  originalHeadCommit: string | undefined,
): Promise<WorktreeChangeSummary | null> {
  try {
    const status = await execFileNoThrow(gitExe(), [
      '-C',
      worktreePath,
      'status',
      '--porcelain',
    ]);
    if (status.code !== 0) {
      return null;
    }
    const changedFiles = status.stdout
      .split('\n')
      .filter(line => line.trim() !== '').length;
    if (!originalHeadCommit) {
      // hook-based session 无基线：无法证明「无 commit」→ unknown
      return null;
    }
    const revList = await execFileNoThrow(gitExe(), [
      '-C',
      worktreePath,
      'rev-list',
      '--count',
      `${originalHeadCommit}..HEAD`,
    ]);
    if (revList.code !== 0) {
      return null;
    }
    const commitsStr = revList.stdout.trim();
    if (!/^\d+$/.test(commitsStr)) {
      return null;
    }
    return { changedFiles, commits: parseInt(commitsStr, 10) };
  } catch {
    return null;
  }
}
