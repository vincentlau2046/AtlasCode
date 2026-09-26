/**
 * engine/tools/bash — bashReadOnly（§8.53 S-T2b，旧仓 src/tools/BashTool/
 * BashTool.ts L84-107 逐字抽离）。
 *
 * 只读命令前缀族（READ_ONLY_PREFIXES 24 项 + 链接/替换操作符守卫）：旧仓
 * 本体文件 BashTool.ts 的 `isReadOnly: (input) => isReadOnlyCommand(...)`
 * 闭包。S-T2b 落本文件时本体未随迁（§8.53 前向登记）→ bashPermissions
 * L1041 `BashTool.isReadOnly(input)` 唯一值位消费点改引本域函数（零行为
 * 变化，纯函数 2 文件零依赖）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - **接缝已消费**（§8.54 S-B5，2026-09-26）：bashTool.ts 本体已落，其
 *    `isReadOnly: (input) => isReadOnlyCommand(...)` 消费本域函数（单一
 *    事实源，本体文件不复制 READ_ONLY_PREFIXES）。
 */

const READ_ONLY_PREFIXES = [
  'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'find', 'wc', 'pwd', 'which',
  'git status', 'git log', 'git diff', 'git branch', 'git show', 'echo',
  'file', 'stat', 'du', 'df', 'whoami', 'env', 'printenv', 'type',
]

// Shell chaining / substitution operators can hide a write command behind a
// read-only prefix (e.g. `ls && rm -rf /`, `find . -exec rm {} ;`,
// `echo $(rm x)`). If any of these appear, treat the command as non-read-only.
export function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim()
  if (
    trimmed.includes('&&') ||
    trimmed.includes('||') ||
    trimmed.includes(';') ||
    trimmed.includes('|') ||
    trimmed.includes('`') ||
    trimmed.includes('$(')
  ) {
    return false
  }
  return READ_ONLY_PREFIXES.some(p => trimmed === p || trimmed.startsWith(p + ' '))
}
