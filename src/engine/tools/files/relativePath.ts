/**
 * engine/tools/files — toRelativePath（§8.55 S-C4，旧仓
 * src/utils/path.ts L95-99 逐字随迁）。
 *
 * 消费面：Glob/Grep call 面 relativize（省 token，旧仓注释
 * "Relativize paths under cwd to save tokens"）；旧仓 grep 核验消费 =
 * GlobTool + GrepTool 仅两方（files 域）→ 落 files 域（不提升 shared——
 * shared/path.ts = 跨域纯叶子，本函数消费面 files 域内）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - 旧仓 utils/cwd 模块态 getCwd() → 新 = bootstrap 门面 getCwd()
 *    （同 notebook.ts/execFileNoThrow.ts import 行先例），1 参签名逐字
 *    不变，调用点零改动。
 */
import { relative } from 'path'
import { getCwd } from '../../../bootstrap'

export function toRelativePath(absolutePath: string): string {
  const relativePath = relative(getCwd(), absolutePath)
  // If the relative path would go outside cwd (starts with ..), keep absolute
  return relativePath.startsWith('..') ? absolutePath : relativePath
}
