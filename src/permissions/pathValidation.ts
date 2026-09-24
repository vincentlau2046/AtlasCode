/**
 * permissions 域 — 路径校验核心（E-6 S-6a，§8.43；旧仓
 * src/utils/permissions/pathValidation.ts 487L 逐字移植，import 替换 +
 * 五处裁定见下）。
 *
 * 8 函数 + 3 类型。纯叶：本仓唯一活消费者 = BashTool/pathValidation.ts
 * 1303L 工具本体（工具本体波残留守，§8.33 裁定——487L 是 E-4 规则求值
 * 输入面，工具本体 checkPermissions 实现随 47 本体残留守）；另
 * createReadRuleSuggestion suggestion 面（S-4c2 残留守）与 PowerShell
 * 2049L（域外，bash-only 纵切不随迁）。消费面前向登记。
 *
 * 裁定（复审勿当遗漏重提）：
 *   - getFsImplementation / containsPathTraversal / containsVulnerableUncPath /
 *     getPlatform = shared 单一事实源（旧仓 fsOperations / path /
 *     readOnlyCommandValidation 三面收敛）。
 *   - matchingRuleForInput / checkReadableInternalPath / checkEditableInternalPath /
 *     getPathsForPermissionCheck = filesystem.ts ①② 残留守桩（规则求值树归
 *     engine 波 / 内部路径族归 E-7 leaves / 轻量版 ④）——isPathAllowed 的
 *     规则命中步 / 内部路径步降级直通（桩恒 null / passthrough）；判别信号
 *     边界限落地分支（tests/unit/path-validation.test.ts 头注），不断言
 *     规则命中 / 内部路径命中（桩态 = 假信号，H6 防空洞）。
 *   - safeResolvePath = 本文件轻量版（旧仓 fsOperations L138 的 lstatSync
 *     特殊文件支裁：FsOperations 面不扩，filesystem ④ 裁定口径一致；
 *     悬空链接 / 40 层符号链接链遍历归 engine 波）。
 *   - lodash memoize → 本地 Map 缓存（新仓模式，filesystem
 *     getResolvedWorkingDirPaths 先例）。
 *   - sandbox 状态 = ./sandboxAccess 注入窗口（L3 自治：permissions 域
 *     不 import sandbox 域）；placeholder 禁用态 = 零行为变化。
 */
import { homedir } from 'os'
import { dirname, isAbsolute, resolve } from 'path'
import {
  containsPathTraversal,
  containsVulnerableUncPath,
  getFsImplementation,
  getPlatform,
  type PermissionDecisionReason,
  type ToolPermissionContext,
} from '../shared'
import {
  checkEditableInternalPath,
  checkPathSafetyForAutoEdit,
  checkReadableInternalPath,
  getPathsForPermissionCheck,
  matchingRuleForInput,
  pathInAllowedWorkingPath,
  pathInWorkingPath,
} from './filesystem'
import { getSandboxAccess } from './sandboxAccess'

const MAX_DIRS_TO_LIST = 5
const GLOB_PATTERN_REGEX = /[*?[\]{}]/

export type FileOperationType = 'read' | 'write' | 'create'

export type PathCheckResult = {
  allowed: boolean
  decisionReason?: PermissionDecisionReason
}

export type ResolvedPathCheckResult = PathCheckResult & {
  resolvedPath: string
}

export function formatDirectoryList(directories: string[]): string {
  const dirCount = directories.length

  if (dirCount <= MAX_DIRS_TO_LIST) {
    return directories.map(dir => `'${dir}'`).join(', ')
  }

  const firstDirs = directories
    .slice(0, MAX_DIRS_TO_LIST)
    .map(dir => `'${dir}'`)
    .join(', ')

  return `${firstDirs}, and ${dirCount - MAX_DIRS_TO_LIST} more`
}

/**
 * Extracts the base directory from a glob pattern for validation.
 * For example: "/path/to/*.txt" returns "/path/to"
 */
export function getGlobBaseDirectory(path: string): string {
  const globMatch = path.match(GLOB_PATTERN_REGEX)
  if (!globMatch || globMatch.index === undefined) {
    return path
  }

  // Get everything before the first glob character
  const beforeGlob = path.substring(0, globMatch.index)

  // Find the last directory separator
  const lastSepIndex =
    getPlatform() === 'windows'
      ? Math.max(beforeGlob.lastIndexOf('/'), beforeGlob.lastIndexOf('\\'))
      : beforeGlob.lastIndexOf('/')
  if (lastSepIndex === -1) return '.'

  return beforeGlob.substring(0, lastSepIndex) || '/'
}

/**
 * Expands tilde (~) at the start of a path to the user's home directory.
 * Note: ~username expansion is not supported for security reasons.
 */
export function expandTilde(path: string): string {
  if (
    path === '~' ||
    path.startsWith('~/') ||
    (process.platform === 'win32' && path.startsWith('~\\'))
  ) {
    return homedir() + path.slice(1)
  }
  return path
}

/**
 * 轻量路径解析（旧仓 fsOperations.safeResolvePath 轻量版，裁定见头注）。
 * UNC 早退（文件系统访问前拦截，防 Windows 校验期 DNS/SMB）+ 单级
 * realpathSync：成功 = canonical（全符号链接已解析，调用方可传
 * [resolvedPath] 作 precomputed 省冗余 syscall）；ENOENT（新文件）/
 * 断链 = 回落逻辑路径，isCanonical=false（调用方走全量
 * getPathsForPermissionCheck）。
 */
function safeResolvePath(
  filePath: string,
): { resolvedPath: string; isCanonical: boolean } {
  if (filePath.startsWith('//') || filePath.startsWith('\\\\')) {
    return { resolvedPath: filePath, isCanonical: false }
  }
  try {
    const resolvedPath = getFsImplementation().realpathSync(filePath)
    return { resolvedPath, isCanonical: true }
  } catch {
    // ENOENT（新文件）/ 断链符号链接 —— 仅逻辑路径入查（允许文件创建）
    return { resolvedPath: filePath, isCanonical: false }
  }
}

/**
 * Checks if a resolved path is writable according to the sandbox write allowlist.
 * When the sandbox is enabled, the user has explicitly configured which directories
 * are writable. We treat these as additional allowed write directories for path
 * validation purposes, so commands like `echo foo > /tmp/atlas/x.txt` don't
 * prompt for permission when /tmp/atlas/ is already in the sandbox allowlist.
 *
 * Respects the deny-within-allow list: paths in denyWithinAllow (like
 * .atlas/settings.json) are still blocked even if their parent is in allowOnly.
 */
export function isPathInSandboxWriteAllowlist(resolvedPath: string): boolean {
  const sandbox = getSandboxAccess()
  if (!sandbox.isSandboxingEnabled()) {
    return false
  }
  const { allowOnly, denyWithinAllow } = sandbox.getFsWriteConfig()
  // Resolve symlinks on both sides so comparisons are symmetric (matching
  // pathInAllowedWorkingPath). Without this, an allowlist entry that is a
  // symlink (e.g. /home/user/proj -> /data/proj) would not match a write to
  // its resolved target, causing an unnecessary prompt. Over-conservative,
  // not a security issue. All resolved input representations must be allowed
  // and none may be denied. Config paths are session-stable, so cache their
  // resolution to avoid N × config.length redundant syscalls per command
  // with N write targets (matching getResolvedWorkingDirPaths).
  const pathsToCheck = getPathsForPermissionCheck(resolvedPath)
  const resolvedAllow = allowOnly.flatMap(getResolvedSandboxConfigPath)
  const resolvedDeny = denyWithinAllow.flatMap(getResolvedSandboxConfigPath)
  return pathsToCheck.every(p => {
    for (const denyPath of resolvedDeny) {
      if (pathInWorkingPath(p, denyPath)) return false
    }
    return resolvedAllow.some(allowPath => pathInWorkingPath(p, allowPath))
  })
}

// Sandbox config paths are session-stable; cache their resolved forms to
// avoid repeated realpath syscalls on every write-target check.
// 旧仓 lodash memoize(getPathsForPermissionCheck) → 本地 Map 缓存（等效
// per-key，filesystem getResolvedWorkingDirPaths 先例）。
const _resolvedSandboxConfigCache = new Map<string, string[]>()
function getResolvedSandboxConfigPath(inputPath: string): string[] {
  const cached = _resolvedSandboxConfigCache.get(inputPath)
  if (cached) {
    return cached
  }
  const resolved = getPathsForPermissionCheck(inputPath)
  _resolvedSandboxConfigCache.set(inputPath, resolved)
  return resolved
}

/**
 * Checks if a resolved path is allowed for the given operation type.
 *
 * @param precomputedPathsToCheck - Optional cached result of
 *   `getPathsForPermissionCheck(resolvedPath)`. When `resolvedPath` is the
 *   output of `realpathSync` (canonical path, all symlinks resolved), this
 *   is trivially `[resolvedPath]` and passing it here skips 5 redundant
 *   syscalls per inner check. Do NOT pass this for non-canonical paths
 *   (nonexistent files, UNC paths, etc.) — parent-directory symlink
 *   resolution is still required for those.
 */
export function isPathAllowed(
  resolvedPath: string,
  context: ToolPermissionContext,
  operationType: FileOperationType,
  precomputedPathsToCheck?: readonly string[],
): PathCheckResult {
  // Determine which permission type to check based on operation
  const permissionType = operationType === 'read' ? 'read' : 'edit'

  // 1. Check deny rules first (they take precedence)
  const denyRule = matchingRuleForInput(
    resolvedPath,
    context,
    permissionType,
    'deny',
  )
  if (denyRule !== null) {
    return {
      allowed: false,
      decisionReason: { type: 'rule', rule: denyRule },
    }
  }

  // 2. For write/create operations, check internal editable paths (plan files, scratchpad, agent memory, job dirs)
  // This MUST come before checkPathSafetyForAutoEdit since .atlas is a dangerous directory
  // and internal editable paths live under ~/.atlas/ — matching the ordering in
  // checkWritePermissionForTool (filesystem.ts step 1.5)
  if (operationType !== 'read') {
    const internalEditResult = checkEditableInternalPath(resolvedPath, {})
    if (internalEditResult.behavior === 'allow') {
      return {
        allowed: true,
        decisionReason: internalEditResult.decisionReason,
      }
    }
  }

  // 2.5. For write/create operations, check comprehensive safety validations
  // This MUST come before checking working directory to prevent bypass via acceptEdits mode
  // Checks: Windows patterns, Atlas config files, dangerous files (on original + symlink paths)
  if (operationType !== 'read') {
    const safetyCheck = checkPathSafetyForAutoEdit(
      resolvedPath,
      precomputedPathsToCheck,
    )
    // 显式 === false（非 !safe）：本仓 strict 配置下真值否定不收窄（同
    // checkWritePermissionForTool L743 口径）
    if (safetyCheck.safe === false) {
      return {
        allowed: false,
        decisionReason: {
          type: 'safetyCheck',
          reason: safetyCheck.message,
          classifierApprovable: safetyCheck.classifierApprovable,
        },
      }
    }
  }

  // 3. Check if path is in allowed working directory
  // For write/create operations, require acceptEdits mode to auto-allow
  // This is consistent with checkWritePermissionForTool in filesystem.ts
  const isInWorkingDir = pathInAllowedWorkingPath(
    resolvedPath,
    context,
    precomputedPathsToCheck,
  )
  if (isInWorkingDir) {
    if (operationType === 'read' || context.mode === 'acceptEdits') {
      return { allowed: true }
    }
    // Write/create without acceptEdits mode falls through to check allow rules
  }

  // 3.5. For read operations, check internal readable paths (project temp dir, session memory, etc.)
  // This allows reading agent output files without explicit permission
  if (operationType === 'read') {
    const internalReadResult = checkReadableInternalPath(resolvedPath, {})
    if (internalReadResult.behavior === 'allow') {
      return {
        allowed: true,
        decisionReason: internalReadResult.decisionReason,
      }
    }
  }

  // 3.7. For write/create operations to paths OUTSIDE the working directory,
  // check the sandbox write allowlist. When the sandbox is enabled, users
  // have explicitly configured writable directories (e.g. /tmp/atlas/) —
  // treat these as additional allowed write directories so redirects/touch/
  // mkdir don't prompt unnecessarily. Safety checks (step 2) already ran.
  // Paths IN the working directory are intentionally excluded: the sandbox
  // allowlist always seeds '.' (cwd, see sandbox-adapter.ts), which would
  // bypass the acceptEdits gate at step 3. Step 3 handles those.
  if (
    operationType !== 'read' &&
    !isInWorkingDir &&
    isPathInSandboxWriteAllowlist(resolvedPath)
  ) {
    return {
      allowed: true,
      decisionReason: {
        type: 'other',
        reason: 'Path is in sandbox write allowlist',
      },
    }
  }

  // 4. Check allow rules for the operation type
  const allowRule = matchingRuleForInput(
    resolvedPath,
    context,
    permissionType,
    'allow',
  )
  if (allowRule !== null) {
    return {
      allowed: true,
      decisionReason: { type: 'rule', rule: allowRule },
    }
  }

  // 5. Path is not allowed
  return { allowed: false }
}

/**
 * Validates a glob pattern by checking its base directory.
 * Returns the validation result for the base path where the glob would expand.
 */
export function validateGlobPattern(
  cleanPath: string,
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  operationType: FileOperationType,
): ResolvedPathCheckResult {
  if (containsPathTraversal(cleanPath)) {
    // For patterns with path traversal, resolve the full path
    const absolutePath = isAbsolute(cleanPath)
      ? cleanPath
      : resolve(cwd, cleanPath)
    const { resolvedPath, isCanonical } = safeResolvePath(absolutePath)
    const result = isPathAllowed(
      resolvedPath,
      toolPermissionContext,
      operationType,
      isCanonical ? [resolvedPath] : undefined,
    )
    return {
      allowed: result.allowed,
      resolvedPath,
      decisionReason: result.decisionReason,
    }
  }

  const basePath = getGlobBaseDirectory(cleanPath)
  const absoluteBasePath = isAbsolute(basePath)
    ? basePath
    : resolve(cwd, basePath)
  const { resolvedPath, isCanonical } = safeResolvePath(absoluteBasePath)
  const result = isPathAllowed(
    resolvedPath,
    toolPermissionContext,
    operationType,
    isCanonical ? [resolvedPath] : undefined,
  )
  return {
    allowed: result.allowed,
    resolvedPath,
    decisionReason: result.decisionReason,
  }
}

const WINDOWS_DRIVE_ROOT_REGEX = /^[A-Za-z]:\/?$/
const WINDOWS_DRIVE_CHILD_REGEX = /^[A-Za-z]:\/[^/]+$/

/**
 * Checks if a resolved path is dangerous for removal operations (rm/rmdir).
 * Dangerous paths are:
 * - Wildcard '*' (removes all files in directory)
 * - Any path ending with '/*' or '\*' (e.g., /path/to/dir/*, C:\foo\*)
 * - Root directory (/)
 * - Home directory (~)
 * - Direct children of root (/usr, /tmp, /etc, etc.)
 * - Windows drive root (C:\, D:\) and direct children (C:\Windows, C:\Users)
 */
export function isDangerousRemovalPath(resolvedPath: string): boolean {
  // Callers pass both slash forms; collapse runs so C:\\Windows (valid in
  // PowerShell) doesn't bypass the drive-child check.
  const forwardSlashed = resolvedPath.replace(/[\\/]+/g, '/')

  if (forwardSlashed === '*' || forwardSlashed.endsWith('/*')) {
    return true
  }

  const normalizedPath =
    forwardSlashed === '/' ? forwardSlashed : forwardSlashed.replace(/\/$/, '')

  if (normalizedPath === '/') {
    return true
  }

  if (WINDOWS_DRIVE_ROOT_REGEX.test(normalizedPath)) {
    return true
  }

  const normalizedHome = homedir().replace(/[\\/]+/g, '/')
  if (normalizedPath === normalizedHome) {
    return true
  }

  // Direct children of root: /usr, /tmp, /etc (but not /usr/local)
  const parentDir = dirname(normalizedPath)
  if (parentDir === '/') {
    return true
  }

  if (WINDOWS_DRIVE_CHILD_REGEX.test(normalizedPath)) {
    return true
  }

  return false
}

/**
 * Validates a file system path, handling tilde expansion and glob patterns.
 * Returns whether the path is allowed and the resolved path for error messages.
 */
export function validatePath(
  path: string,
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  operationType: FileOperationType,
): ResolvedPathCheckResult {
  // Remove surrounding quotes if present
  const cleanPath = expandTilde(path.replace(/^['"]|['"]$/g, ''))

  // SECURITY: Block UNC paths that could leak credentials
  if (containsVulnerableUncPath(cleanPath)) {
    return {
      allowed: false,
      resolvedPath: cleanPath,
      decisionReason: {
        type: 'other',
        reason: 'UNC network paths require manual approval',
      },
    }
  }

  // SECURITY: Reject tilde variants (~user, ~+, ~-, ~N) that expandTilde doesn't handle.
  // expandTilde resolves ~ and ~/ to $HOME, but ~root, ~+, ~- etc. are left as literal
  // text and resolved as relative paths (e.g., /cwd/~root/.ssh/id_rsa).
  // The shell expands these differently (~root → /var/root, ~+ → $PWD, ~- → $OLDPWD),
  // creating a TOCTOU gap: we validate /cwd/~root/... but bash reads /var/root/...
  // This check is safe from false positives because expandTilde already converted
  // ~ and ~/ to absolute paths starting with /, so only unexpanded variants remain.
  if (cleanPath.startsWith('~')) {
    return {
      allowed: false,
      resolvedPath: cleanPath,
      decisionReason: {
        type: 'other',
        reason:
          'Tilde expansion variants (~user, ~+, ~-) in paths require manual approval',
      },
    }
  }

  // SECURITY: Reject paths containing ANY shell expansion syntax ($ or % characters,
  // or paths starting with = which triggers Zsh equals expansion)
  // - $VAR (Unix/Linux environment variables like $HOME, $PWD)
  // - ${VAR} (brace expansion)
  // - $(cmd) (command substitution)
  // - %VAR% (Windows environment variables like %TEMP%, %USERPROFILE%)
  // - Nested combinations like $(echo $HOME)
  // - =cmd (Zsh equals expansion, e.g. =rg expands to /usr/bin/rg)
  // All of these are preserved as literal strings during validation but expanded
  // by the shell during execution, creating a TOCTOU vulnerability
  if (
    cleanPath.includes('$') ||
    cleanPath.includes('%') ||
    cleanPath.startsWith('=')
  ) {
    return {
      allowed: false,
      resolvedPath: cleanPath,
      decisionReason: {
        type: 'other',
        reason: 'Shell expansion syntax in paths requires manual approval',
      },
    }
  }

  // SECURITY: Block glob patterns in write/create operations
  // Write tools don't expand globs - they use paths literally.
  // Allowing globs in write operations could bypass security checks.
  // Example: /allowed/dir/*.txt would only validate /allowed/dir,
  // but the actual write would use the literal path with the *
  if (GLOB_PATTERN_REGEX.test(cleanPath)) {
    if (operationType === 'write' || operationType === 'create') {
      return {
        allowed: false,
        resolvedPath: cleanPath,
        decisionReason: {
          type: 'other',
          reason:
            'Glob patterns are not allowed in write operations. Please specify an exact file path.',
        },
      }
    }

    // For read operations, validate the base directory where the glob would expand
    return validateGlobPattern(
      cleanPath,
      cwd,
      toolPermissionContext,
      operationType,
    )
  }

  // Resolve path
  const absolutePath = isAbsolute(cleanPath)
    ? cleanPath
    : resolve(cwd, cleanPath)
  const { resolvedPath, isCanonical } = safeResolvePath(absolutePath)

  const result = isPathAllowed(
    resolvedPath,
    toolPermissionContext,
    operationType,
    isCanonical ? [resolvedPath] : undefined,
  )
  return {
    allowed: result.allowed,
    resolvedPath,
    decisionReason: result.decisionReason,
  }
}
