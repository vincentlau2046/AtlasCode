/**
 * engine/tools/bash — 破坏性命令警告面（Bash 本体纵切子波 §8.54 S-B2 纯叶子本体）。
 *
 * 旧仓来源（a8af45b）: src/tools/BashTool/destructiveCommandWarning.ts 102L
 * 逐字随迁（DESTRUCTIVE_PATTERNS git/rm/DB/k8s/terraform 表 +
 * getDestructiveCommandWarning 单点）。零 import 纯函数。
 *
 * 残留守登记（H6，复审勿当遗漏重提）：旧仓消费方 = React 层
 * components/permissions/BashPermissionRequest/ + PowerShell 族（展示面，
 * 域外）→ 本波只落函数本体 + unit 钉模式表，展示消费归 TUI 域外（D 波
 * 壳层核查面）。本函数纯信息面——不影响权限逻辑/自动放行（旧仓头注逐字）。
 */

/**
 * Detects potentially destructive bash commands and returns a warning string
 * for display in the permission dialog. This is purely informational — it
 * doesn't affect permission logic or auto-approval.
 */

type DestructivePattern = {
  pattern: RegExp
  warning: string
}

const DESTRUCTIVE_PATTERNS: DestructivePattern[] = [
  // Git — data loss / hard to reverse
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    warning: 'Note: may discard uncommitted changes',
  },
  {
    pattern: /\bgit\s+push\b[^;&|\n]*[ \t](--force|--force-with-lease|-f)\b/,
    warning: 'Note: may overwrite remote history',
  },
  {
    pattern:
      /\bgit\s+clean\b(?![^;&|\n]*(?:-[a-zA-Z]*n|--dry-run))[^;&|\n]*-[a-zA-Z]*f/,
    warning: 'Note: may permanently delete untracked files',
  },
  {
    pattern: /\bgit\s+checkout\s+(--\s+)?\.[ \t]*($|[;&|\n])/,
    warning: 'Note: may discard all working tree changes',
  },
  {
    pattern: /\bgit\s+restore\s+(--\s+)?\.[ \t]*($|[;&|\n])/,
    warning: 'Note: may discard all working tree changes',
  },
  {
    pattern: /\bgit\s+stash[ \t]+(drop|clear)\b/,
    warning: 'Note: may permanently remove stashed changes',
  },
  {
    pattern:
      /\bgit\s+branch\s+(-D[ \t]|--delete\s+--force|--force\s+--delete)\b/,
    warning: 'Note: may force-delete a branch',
  },

  // Git — safety bypass
  {
    pattern: /\bgit\s+(commit|push|merge)\b[^;&|\n]*--no-verify\b/,
    warning: 'Note: may skip safety hooks',
  },
  {
    pattern: /\bgit\s+commit\b[^;&|\n]*--amend\b/,
    warning: 'Note: may rewrite the last commit',
  },

  // File deletion (dangerous paths already handled by checkDangerousRemovalPaths)
  {
    pattern:
      /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*[rR][a-zA-Z]*f|(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*f[a-zA-Z]*[rR]/,
    warning: 'Note: may recursively force-remove files',
  },
  {
    pattern: /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*[rR]/,
    warning: 'Note: may recursively remove files',
  },
  {
    pattern: /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*f/,
    warning: 'Note: may force-remove files',
  },

  // Database
  {
    pattern: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i,
    warning: 'Note: may drop or truncate database objects',
  },
  {
    pattern: /\bDELETE\s+FROM\s+\w+[ \t]*(;|"|'|\n|$)/i,
    warning: 'Note: may delete all rows from a database table',
  },

  // Infrastructure
  {
    pattern: /\bkubectl\s+delete\b/,
    warning: 'Note: may delete Kubernetes resources',
  },
  {
    pattern: /\bterraform\s+destroy\b/,
    warning: 'Note: may destroy Terraform infrastructure',
  },
]

/**
 * Checks if a bash command matches known destructive patterns.
 * Returns a human-readable warning string, or null if no destructive pattern is detected.
 */
export function getDestructiveCommandWarning(command: string): string | null {
  for (const { pattern, warning } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) {
      return warning
    }
  }
  return null
}

// ── L21（上游 299，0.1.82 K3-C）：rm 提示非字面面（strict env 门控）────
//
// 默认面的 rm 模式只判**字面可判 rm**：命令位锚 `(^|[;&|\n]\s*)` 结构性
// 排除拼接/变量/脚本内 rm。strict env 开启时消费面补查两族：
//   ① 拼接族：rm + 递归/强删旗标出现在命令行任意位置（echo / bash -c /
//      变量拼接；长旗标 --recursive/--force 同命中——默认面短旗标字符
//      类不含长旗标）；
//   ② 脚本调用族：命令位 shell 调用（bash/sh/zsh/dash/ksh，含绝对路径
//      /bin/…）/ source / . 点命令 / 命令位 *.sh。本仓不读脚本内省
//      （「读不到脚本才提示」的上游变体不适用），strict 下脚本调用一律
//      保守提示。
// 消费契约：`getDestructiveCommandWarning(command) ?? strict(...)`——
// `??` 保字面面文案优先。纯信息面——不影响权限逻辑/自动放行（同上）。
// 双体同步：TUI 域 src/tui/tools/BashTool/destructiveCommandWarning.ts
// （判别 = wave0182-l21-strict-rm-warning.test.ts 两体同断言）。

const STRICT_INLINE_SHELL_RM_PROMPT_ENV = 'ATLAS_STRICT_INLINE_SHELL_RM_PROMPT'

// ① 拼接族：rm + 旗标，任意位置（无命令位锚——这正是与默认面的差量）
const STRICT_CONCAT_RM_RE =
  /\brm\s+(?:-[a-zA-Z]*[rRf]|--recursive|--force)/

// ② 脚本调用族：命令位（含 ;/&/|/换行 后）脚本执行形态
const STRICT_SCRIPT_INVOCATION_RES: RegExp[] = [
  /(^|[;&|\n]\s*)(?:[^\s;&|]*\/)?(?:bash|zsh|dash|ksh|sh)\b/,
  /(^|[;&|\n]\s*)source\s+\S/,
  /(^|[;&|\n]\s*)\.[ \t]*\S/,
  /(^|[;&|\n]\s*)\S+\.sh\b/,
]

const STRICT_CONCAT_RM_WARNING =
  'Note: may remove files via a non-literal rm invocation'
const STRICT_SCRIPT_WARNING =
  'Note: runs a shell script whose contents are not inspected'

/**
 * strict 门控（L21）：仅 `ATLAS_STRICT_INLINE_SHELL_RM_PROMPT=1` 视为开
 * （显式两态，不收窄为布尔多形态）。
 */
export function isStrictInlineShellRmPromptEnabled(
  env: { [key: string]: string | undefined } = process.env,
): boolean {
  return env[STRICT_INLINE_SHELL_RM_PROMPT_ENV] === '1'
}

/**
 * strict 面（L21）：非字面 rm 保守提示。仅当 strict env 开启时被消费面
 * 取用（`??` 接在默认面之后，字面面文案优先）。纯信息面。
 */
export function getStrictInlineShellRmWarning(command: string): string | null {
  if (STRICT_CONCAT_RM_RE.test(command)) {
    return STRICT_CONCAT_RM_WARNING
  }
  for (const re of STRICT_SCRIPT_INVOCATION_RES) {
    if (re.test(command)) {
      return STRICT_SCRIPT_WARNING
    }
  }
  return null
}
