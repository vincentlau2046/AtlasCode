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
 *  - 0.1.82 K3-B6 round-3 起 import ./shellQuote（同子域，round-3 argv
 *    复核用；「纯函数零依赖」口径更新为「零跨域依赖」）。
 */
import { tryParseShellCommand } from './shellQuote'

const READ_ONLY_PREFIXES = [
  'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'find', 'wc', 'pwd', 'which',
  'git status', 'git log', 'git diff', 'git branch', 'git show', 'echo',
  'file', 'stat', 'du', 'df', 'whoami', 'env', 'printenv', 'type',
]

// 0.1.82 K3-B6 security review round-3：find 写动作 token 集（argv 精确匹配）。
// 文本 includes 守卫可被 quote 拼接/反斜杠转义拆分绕过（find . -"delete" 的
// 源文本不含 '-delete' 字面，shell argv = -delete）→ 前缀命中后追加 argv
// 复核（shell-quote 解析出的 token 与本集精确比对，拼接/转义已由 parser 解析）。
const FIND_WRITE_ACTION_TOKENS = new Set([
  '-delete', '-exec', '-execdir', '-ok', '-okdir',
  '-fprint', '-fprint0', '-fprintf', '-fls',
])

/**
 * glob 模式保守匹配写动作集（round-4）：glob 在 shell 运行时按 cwd 展开，
 * `-del?te` 在 cwd 含名为 -delete 的文件时展开为写动作 token。模式经
 * glob→regex 转换（* → .*、? → .、[...] 字符类保留、! 否定头转 ^）后
 * 与 FIND_WRITE_ACTION_TOKENS 逐一匹配，任一可命中即视为危险。
 * 无法编译/形状异常 = 保守拒绝（fail-safe）。
 */
function globPatternCouldMatchWriteAction(pattern: string): boolean {
  let regex = '^'
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '*') {
      regex += '.*'
      i++
      continue
    }
    if (c === '?') {
      regex += '.'
      i++
      continue
    }
    if (c === '[') {
      const close = pattern.indexOf(']', i + 1)
      if (close > i) {
        // 字符类：glob 否定头 ! 转 regex ^；其余内容直用（类内字面语义
        // 两边一致，范围 a-z 同形）
        let cls = pattern.slice(i + 1, close)
        if (cls.startsWith('!')) cls = `^${cls.slice(1)}`
        regex += `[${cls}]`
        i = close + 1
        continue
      }
      // 不闭合 [ 按字面
    }
    regex += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    i++
  }
  regex += '$'
  let re: RegExp
  try {
    re = new RegExp(regex)
  } catch {
    return true
  }
  for (const action of FIND_WRITE_ACTION_TOKENS) {
    if (re.test(action)) return true
  }
  return false
}

/**
 * argv 复核中允许通过的非字符串 token（shell-quote ParseEntry 对象形）：
 *  - {op:'<'}   输入重定向（只读不写，既有测试恒等锚 cat file < other）
 *  - {op:'glob'} 未引号 glob 展开——仅当模式保守不可命中写动作集
 *    （round-4：find . -del?te 可展开 -delete；引号形 "*.ts" 是字符串
 *    token 不经此门）
 *  - {comment}   注释 token（ls # foo）
 * 其余 op token（&&/||/;/|/>/>& 等）= 组合/重定向/替换语义 → 非只读。
 */
function isAllowedNonStringToken(token: unknown): boolean {
  if (typeof token !== 'object' || token === null) return false
  const t = token as Record<string, unknown>
  if (t.comment !== undefined) return true
  if (t.op === '<') return true
  if (t.op === 'glob') {
    // 形状异常（无 pattern）= 无法静态判读 → 拒
    if (typeof t.pattern !== 'string') return false
    return !globPatternCouldMatchWriteAction(t.pattern)
  }
  return false
}

// Shell chaining / substitution operators can hide a write command behind a
// read-only prefix (e.g. `ls && rm -rf /`, `find . -exec rm {} ;`,
// `echo $(rm x)`). If any of these appear, treat the command as non-read-only.
// `>` 重定向守卫（#265 S1，2026-10-05）：输出重定向（`>`/`>>`/`>&`/`&>`）带写
// 副作用——`echo x > f` / `git status > x` 旧匹配 echo/git status 只读前缀被
// bashToolHasPermission step 7 自动放行（写文件零审批）。同族 includes 守卫
// 风格（`<` 输入重定向只读不写，不守卫；引号内 `>` 如 `grep "a > b" f` 判
// 非只读 = fail-safe 方向，多弹框不多放行，与 `;`/`|` 引号假阳性同态）。
// 0.1.82 K3-B6 security review round-2 finding #1 补守卫（2026-10-30）：
//  - `\n`/`\r`：newline 分隔命令 = 隐式 `;`（`ls -la\ntouch x` 命中
//    `ls ` 前缀被判只读——plan 写门（K3-B6）以 isReadOnly 为豁免 oracle，
//    误判 = 写命令免拦）；
//  - find 写动作族字面（`-delete`/`-exec`/`-ok`/`-fprint`/`-fls`；
//    `-execdir`/`-okdir`/`-fprint0`/`-fprintf` 经子串覆盖）：`find` 在
//    READ_ONLY_PREFIXES 内但 `-delete` / `-exec rm {} +`（无 `;` 形）带写
//    副作用。同 fail-safe 方向（其他命令含这些字面误判非只读 = 多弹框，
//    不多放行）。
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
    trimmed.includes('>') ||
    trimmed.includes('\n') ||
    trimmed.includes('\r') ||
    trimmed.includes('-delete') ||
    trimmed.includes('-exec') ||
    trimmed.includes('-ok') ||
    trimmed.includes('-fprint') ||
    trimmed.includes('-fls')
  ) {
    return null
  }
  let best: string | null = null
  for (const p of READ_ONLY_PREFIXES) {
    if (trimmed === p || trimmed.startsWith(p + ' ')) {
      if (best === null || p.length > best.length) best = p
    }
  }
  if (best === null) return null

  // 0.1.82 K3-B6 security review round-3：argv 复核（shell-parser 微分收口）。
  // 文本守卫与前缀匹配之后、返回前，用 shell-quote 解析 argv 复核——
  //  - 解析失败 = 无法静态判读 → 非只读（fail-closed，多弹框不多放行）；
  //  - 非字符串 op token（&&/||/;/|/> 等，'<'/glob/comment 例外）→ 非只读；
  //  - 字符串 token 精确命中 find 写动作集（quote 拼接/转义已由 parser
  //    解析，find . -"delete" / -del\ete / -e"xec" 拦下）→ 非只读。
  // 严格收紧不变式：本复核只在前缀已命中（best ≠ null）时做减法，恒等锚
  // （ls -la / cat a< b / ls *.ts / git diff HEAD~1）零变更。
  const parsed = tryParseShellCommand(trimmed, key => `$${key}`)
  if (!parsed.success) {
    return null
  }
  for (const token of parsed.tokens) {
    if (typeof token === 'string') {
      if (FIND_WRITE_ACTION_TOKENS.has(token)) return null
      // round-4 补：class-only glob（find . -[d]elete）在 shell-quote 里是
      // 字符串 token（无 */? 不产 glob op），但 [...] 在 shell 运行时是
      // glob 元字符（cwd 含 -delete 即展开为写动作）→ 含字符类的 token
      // 同过保守匹配
      if (token.includes('[') && globPatternCouldMatchWriteAction(token)) {
        return null
      }
    } else if (!isAllowedNonStringToken(token)) {
      return null
    }
  }
  return best
}

export function isReadOnlyCommand(command: string): boolean {
  return matchReadOnlyPrefix(command) !== null
}
