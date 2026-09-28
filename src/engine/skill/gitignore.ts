/**
 * engine/skill — git 忽略判定面（§8.67 D 波 S-E2a，
 * 旧仓 src/utils/git/gitignore.ts skill 域消费子集）。
 *
 * 落面 = isPathGitignored（skill 目录动态发现的 gitignore 守卫：
 * discoverSkillDirsForPaths 挡 node_modules/.atlas/skills 类静默泄漏）+
 * getGlobalGitignorePath。exec 经 engine/worktree 门面
 * execFileNoThrowWithCwd（跨子域先例）。
 *
 * 语义（旧仓逐字）：`git check-ignore` 0=忽略 / 1=未忽略 / 128=非 git 仓
 * → false 失败开放（仓外调用方放行，调用时信任对话才是实际安全边界）。
 *
 * 裁面登记（复审勿当遗漏重提）：
 *   ① addFileGlobRuleToGitignore（全局 gitignore 追加 + dirIsInGitRepo 门）
 *      → 旧仓消费面 = localSettings gitignore 联动（新仓 settings.ts 已裁）
 *      → 零消费，不迁。
 */
import { homedir } from 'os'
import { join } from 'path'

import { execFileNoThrowWithCwd } from '../worktree'

/**
 * 判定路径是否被 git 忽略（`git check-ignore`）。
 * 覆盖全部 gitignore 源（嵌套 .gitignore / .git/info/exclude / 全局
 * gitignore）——git 自身解析优先级。非 git 仓（exit 128）返回 false
 * （失败开放）。
 *
 * @param filePath 待查路径（绝对或相对 cwd）
 * @param cwd 运行 git 的目录
 */
export async function isPathGitignored(
  filePath: string,
  cwd: string,
): Promise<boolean> {
  const { code } = await execFileNoThrowWithCwd(
    'git',
    ['check-ignore', filePath],
    {
      preserveOutputOnError: false,
      cwd,
    },
  )

  return code === 0
}

/**
 * 全局 gitignore 文件路径（~/.config/git/ignore）。
 */
export function getGlobalGitignorePath(): string {
  return join(homedir(), '.config', 'git', 'ignore')
}
