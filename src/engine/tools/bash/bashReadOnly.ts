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
// `>` 重定向守卫（#265 S1，2026-10-05）：输出重定向（`>`/`>>`/`>&`/`&>`）带写
// 副作用——`echo x > f` / `git status > x` 旧匹配 echo/git status 只读前缀被
// bashToolHasPermission step 7 自动放行（写文件零审批）。同族 includes 守卫
// 风格（`<` 输入重定向只读不写，不守卫；引号内 `>` 如 `grep "a > b" f` 判
// 非只读 = fail-safe 方向，多弹框不多放行，与 `;`/`|` 引号假阳性同态）。
/**
 * 匹配命中的只读命令前缀（单一事实源）：返回最长匹配的前缀（如
 * `git status --short` → `git status`），非只读命令返回 null。
 *
 * AD-11（0.1.51，CC 2.1.111）：/less-permission-prompts skill 用命中前缀
 * 构造 `Bash(<prefix>:*)` 前缀规则（legacy :* 语法，shellRuleMatching
 * 兼容面）——前缀取自本表而非调用方复制（零漂移）。
 */
export function matchReadOnlyPrefix(command: string): string | null {
  const trimmed = command.trim()
  if (
    trimmed.includes('&&') ||
    trimmed.includes('||') ||
    trimmed.includes(';') ||
    trimmed.includes('|') ||
    trimmed.includes('`') ||
    trimmed.includes('$(') ||
    trimmed.includes('>')
  ) {
    return null
  }
  let best: string | null = null
  for (const p of READ_ONLY_PREFIXES) {
    if (trimmed === p || trimmed.startsWith(p + ' ')) {
      if (best === null || p.length > best.length) best = p
    }
  }
  return best
}

export function isReadOnlyCommand(command: string): boolean {
  return matchReadOnlyPrefix(command) !== null
}
