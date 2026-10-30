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

// ── L21 (upstream 299, 0.1.82 K3-C): non-literal rm warning face (strict
// env gate) ──
//
// The default rm patterns only judge *literally judgeable* rm: the
// command-position anchor `(^|[;&|\n]\s*)` structurally excludes
// concatenated / variable / in-script rm. When the strict env is enabled,
// the consumer additionally consults two families:
//   ① Concatenation family: rm + recursive/force flags appearing ANYWHERE
//      on the command line (echo / bash -c / variable concatenation; long
//      flags --recursive/--force match too — the default face's short-flag
//      character class has no long-flag shapes);
//   ② Script-invocation family: command-position shell invocation
//      (bash/sh/zsh/dash/ksh, absolute /bin/… paths included) / source /
//      `.` dot command / command-position *.sh. This repo never inspects
//      script contents (the upstream "prompt when the script is unreadable"
//      variant doesn't apply) — under strict, script invocations get a
//      conservative prompt unconditionally.
// Consumer contract: `getDestructiveCommandWarning(command) ??
// strict(...)` — `??` keeps the literal face's wording first. Purely
// informational — no effect on permission logic or auto-approval.
// Sync twin: engine domain src/engine/tools/bash/destructiveCommandWarning.ts
// (discrimination = wave0182-l21-strict-rm-warning.test.ts runs both
// copies with the same cases).

const STRICT_INLINE_SHELL_RM_PROMPT_ENV = 'ATLAS_STRICT_INLINE_SHELL_RM_PROMPT'

// ① Concatenation family: rm + flags, anywhere (no command-position anchor
// — exactly the delta over the default face)
const STRICT_CONCAT_RM_RE =
  /\brm\s+(?:-[a-zA-Z]*[rRf]|--recursive|--force)/

// ② Script-invocation family: command-position (incl. after ;/&|/newline)
// script execution shapes
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
 * Strict gate (L21): only `ATLAS_STRICT_INLINE_SHELL_RM_PROMPT=1` counts as
 * enabled (explicit two-state, not a boolean-ish multi-form parse).
 */
export function isStrictInlineShellRmPromptEnabled(
  env: { [key: string]: string | undefined } = process.env,
): boolean {
  return env[STRICT_INLINE_SHELL_RM_PROMPT_ENV] === '1'
}

/**
 * Strict face (L21): conservative warning for non-literal rm. Only consulted
 * by the consumer when the strict env is enabled (chained after the default
 * face via `??`, literal-face wording first). Purely informational.
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
