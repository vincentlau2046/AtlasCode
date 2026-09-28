/**
 * permissions 域 — filesystem 最小面（薄骨架，C-Deep 切片 3 T5）
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/filesystem.ts（1781L 取最小面，§8.14）：
 *   getProjectTempDir（task diskOutput 消费）/ getAtlasTempDirName +
 *   getAtlasTempDir（executor Shell sandboxTmpDir 消费）/
 *   checkRead·WritePermissionForTool / pathInAllowedWorkingPath /
 *   DANGEROUS_FILES·DIRECTORIES，余砍。
 *
 * 跨域边斩断（L3 四域互不 import）：
 *   - getOriginalCwd / getCwd（bootstrap 域）→ ./bootstrap-env 注入窗口
 *     （未注入 fail-fast，H6 斩断）。
 *   - 纯叶子（getConfigDirName / getPlatform / expandPath /
 *     containsPathTraversal / sanitizePath / containsVulnerableUncPath /
 *     getFsImplementation）→ shared 单一事实源。
 *
 * 薄骨架桩（§8.14「规则求值 归 engine」，复审勿当遗漏重提）：
 *   ① matchingRuleForInput —— 规则求值树（ignore 库 + 工具名常量 +
 *      settings roots + pattern 树）归 engine；桩恒返回 null（无匹配规则），
 *      checkRead/checkWrite 的规则命中步降级直通。settings roots 数据面
 *      （getSettingsPaths）S-3c 已经 ./settingsPaths 注入窗口接真，规则树
 *      本体仍归 E-4。
 *   ② checkReadableInternalPath / checkEditableInternalPath —— session-memory /
 *      plans / tool-results / scratchpad 内部路径判定归 engine；桩恒 passthrough 续查。
 *   ③ generateSuggestions —— PermissionUpdate 真生成（createReadRuleSuggestion）
 *      归 engine；桩恒空。
 *   ④ getPathsForPermissionCheck 取轻量版（tilde 展开 + UNC 早退 + 单级
 *      realpath）；旧仓 40 层符号链接链遍历（intermediate targets +
 *      resolveDeepestExistingAncestor 悬空链接）归 engine 波，且不扩
 *      FsOperations lstatSync/readlinkSync 面。
 *   ⑤ checkWrite 1.6 config-folder session allow 规则 + getClaudeSkillScope
 *      收窄建议（工具面 ATLAS_FOLDER_PERMISSION_PATTERN 常量）归 engine；
 *      薄骨架 safety 分支建议退化为 ③ 桩空数组。
 *   ⑥ Windows POSIX→Windows 路径转换（relativePath 的 windows 分支 /
 *      toPosixPath）不随迁——国内目标 POSIX。
 *   ⑦ S-6a（§8.43）导出 ①② 桩 + getPathsForPermissionCheck（消费方 =
 *      pathValidation.ts 8 函数；桩实现归属不变——①engine 波 / ②E-7
 *      leaves / ④轻量版，导出仅开域内消费口，不核销残留守）。
 */
import { tmpdir } from 'os'
import { join, posix, sep } from 'path'
import {
  containsPathTraversal,
  containsVulnerableUncPath,
  expandPath,
  getAtlasTempDirName,
  getFsImplementation,
  getConfigDirName,
  getPlatform,
  sanitizePath,
} from '../shared'
import type {
  PermissionDecision,
  PermissionResult,
  PermissionRule,
  PermissionUpdate,
  ToolPermissionContext,
} from '../shared'
import { getPermissionsBootstrapEnv } from './bootstrap-env'
import { getSettingsPaths } from './settingsPaths'

/**
 * 权限检查消费的 Tool 窄视图（旧仓全量 Tool 的 name + getPath 子集）。
 * getPath 鸭子类型（可选）——无 getPath 的工具在 check* 顶部短路 ask。
 * 完整 Tool.getPath 契约（含 input JSON schema 泛型）归 engine 波。
 *
 * E-4 S-4b 扩两可选字段（既有消费者零影响——全可选）：
 *   - mcpInfo —— 镜像 shared Tool.mcpInfo（规则匹配按全名 mcp__server__tool，
 *     防 builtin 同名规则误伤 MCP 替代；ruleMatching.toolMatchesRule 消费）。
 *   - checkPermissions —— 鸭子可选分发（残留守① 工具面半：分发机制 E-6
 *     S-6b 落 permissions.ts 1c（存在才调）；Bash / PowerShell 工具本体
 *     实现归工具本体波；shared Tool 方法签名结构兼容）。
 */
export type PermissionTool = {
  name: string
  getPath?(input: Record<string, unknown>): string
  mcpInfo?: { serverName: string; toolName: string }
  checkPermissions?(
    input: Record<string, unknown>,
    context: unknown,
  ): Promise<PermissionResult>
}

/** expandPath 缺省基准 = 注入的 bootstrap cwd（shared 叶子不隐式取 cwd）。 */
function expandPathLocal(path: string): string {
  return expandPath(path, getPermissionsBootstrapEnv().getCwd())
}

// ════════════════════════════════════════════════════════════════
// 危险文件 / 目录常量（旧仓 filesystem.ts L58/L77 照抄）
// ════════════════════════════════════════════════════════════════

/** 自动编辑时应受保护的敏感文件（可致代码执行或数据外泄）。 */
export const DANGEROUS_FILES = [
  '.gitconfig',
  '.gitmodules',
  '.bashrc',
  '.bash_profile',
  '.zshrc',
  '.zprofile',
  '.profile',
  '.ripgreprc',
  '.mcp.json',
  '.claude.json',
  // de-Anthropic: 新全局配置文件名（legacy .claude.json 保留）
  '.atlas.json',
] as const

/** 自动编辑时应受保护的敏感目录（含配置/可执行文件）。 */
export const DANGEROUS_DIRECTORIES = [
  '.git',
  '.vscode',
  '.idea',
  getConfigDirName(),
] as const

// ════════════════════════════════════════════════════════════════
// 域内纯 / 轻量助手
// ════════════════════════════════════════════════════════════════

/**
 * 大小写归一供不敏感文件系统（macOS/Windows）比较，防混合大小写路径
 * 绕过安全检查（如 .cLauDe/Settings.locaL.json）。恒转小写。
 */
export function normalizeCaseForComparison(path: string): string {
  return path.toLowerCase()
}

/**
 * 跨平台相对路径助手（薄骨架 POSIX 版）：返回 POSIX 风格相对路径。
 * 旧仓 windows 分支（windowsPathToPosixPath 转换）归 engine（国内目标 POSIX）。
 */
export function relativePath(from: string, to: string): string {
  return posix.relative(from, to)
}

/**
 * 项目 settings 文件路径列表（E-3 S-3c 接真）。
 * 经 ./settingsPaths 注入窗口读取（L3 斩断：permissions 域不 import
 * engine/config）；组合根注入 engine/config getSettingsPaths 真实现。未注入
 * = 空数组（isAtlasSettingsPath 仍靠 endsWith 捕获全局 {configDir}/settings.json，
 * 项目 settings 匹配降级不命中，见 settingsPaths.ts 头注降级语义）。
 */
export function isAtlasSettingsPath(filePath: string): boolean {
  // SECURITY: 先归一路径结构，防 `./getConfigDirName()/./settings.json` 类冗余
  // ./ 序列绕过 endsWith() 检查
  const expandedPath = expandPathLocal(filePath)

  // 大小写归一防 `.cLauDe/Settings.locaL.json` 类大小写绕过
  const normalizedPath = normalizeCaseForComparison(expandedPath)

  // 用平台分隔符，使 endsWith 在 Unix (/) 与 Windows (\) 均成立。
  // ⚠️ 偏差（§8.16）：旧仓此处为字面串 `getConfigDirName()`（de-Anthropic 全局
  // 替换误伤——把函数调用也替换成了字符串），endsWith 恒不命中；此处改回真调用
  // 插值 getConfigDirName()（= `.atlas` 或 ATLAS_CONFIG_DIR_NAME 覆盖值），语义正确。
  const configDir = getConfigDirName()
  if (
    normalizedPath.endsWith(`${sep}${configDir}${sep}settings.json`) ||
    normalizedPath.endsWith(
      `${sep}${configDir}${sep}settings.local.json`,
    )
  ) {
    // 全局 {configDir}/settings.json 对其余项目亦包含
    return true
  }
  // 当前项目的 settings 文件（含 managed + CLI args）
  return getSettingsPaths().some(
    settingsPath =>
      normalizeCaseForComparison(settingsPath) === normalizedPath,
  )
}

/** Atlas 编辑自身配置文件时恒 ask。 */
function isClaudeConfigFilePath(filePath: string): boolean {
  if (isAtlasSettingsPath(filePath)) {
    return true
  }
  // 检查 {configDir}/commands、/agents、/skills 目录（proper 路径段校验）
  const configDir = getConfigDirName()
  const originalCwd = getPermissionsBootstrapEnv().getOriginalCwd()
  const commandsDir = join(originalCwd, configDir, 'commands')
  const agentsDir = join(originalCwd, configDir, 'agents')
  const skillsDir = join(originalCwd, configDir, 'skills')

  return (
    pathInWorkingPath(filePath, commandsDir) ||
    pathInWorkingPath(filePath, agentsDir) ||
    pathInWorkingPath(filePath, skillsDir)
  )
}

// getAtlasTempDirName 已提升 shared 单一事实源（跨域纯叶子，§8.16 偏差）；
// 此处 re-export 保 §8.14 permissions 最小面消费方旧 import 面，getAtlasTempDir 消费之。
export { getAtlasTempDirName }

/**
 * Atlas 临时目录路径（符号链接已解析）。带尾分隔符。
 * 旧仓 memoize（lodash）→ 本地单值缓存（模块级，输入 ATLAS_TMPDIR + 平台
 * 启动即定形，tmp realpath 会话内不变）。
 */
let _atlasTempDir: string | null = null
export function getAtlasTempDir(): string {
  if (_atlasTempDir === null) {
    const baseTmpDir =
      process.env.ATLAS_TMPDIR ||
      (getPlatform() === 'windows' ? tmpdir() : '/tmp')

    // 解析 base 临时目录符号链接（如 macOS /tmp -> /private/tmp），
    // 保证与权限检查中已解析路径匹配
    const fs = getFsImplementation()
    let resolvedBaseTmpDir = baseTmpDir
    try {
      resolvedBaseTmpDir = fs.realpathSync(baseTmpDir)
    } catch {
      // 解析失败用原路径
    }

    _atlasTempDir = join(resolvedBaseTmpDir, getAtlasTempDirName()) + sep
  }
  return _atlasTempDir
}

/**
 * getAtlasTempDir memo 测试专用复位（单进程连跑跨文件泄漏守卫；先例 = task
 * 域 _resetTaskOutputDirForTest）。--isolate 每文件新进程 memo 天然未定形；
 * 单进程 ad-hoc 连跑时，前序文件设 ATLAS_TMPDIR 并首调 memoize 后 teardown
 * 删 env + tmpdir，后序文件顶层/beforeAll 再设 env 已迟（memo 已钉）→ 由
 * 泄漏方 afterAll / 受害方 beforeAll 调本导出清 memo 使下次调用重派生。
 */
export function _resetAtlasTempDirForTest(): void {
  _atlasTempDir = null
}

/**
 * 项目临时目录路径（带尾分隔符）：{atlasTmpDir}/{sanitized-cwd}/。
 * task diskOutput 消费面（经 setDiskOutputEnv 注入窗口，§8.14 注入序）。
 */
export function getProjectTempDir(): string {
  return (
    join(getAtlasTempDir(), sanitizePath(getPermissionsBootstrapEnv().getOriginalCwd())) +
    sep
  )
}

/**
 * 判定文件路径自动编辑是否危险。含：.git/.gitconfig、.vscode/.idea、
 * shell 配置文件、UNC 路径（凭据泄露）。
 */
function isDangerousFilePathToAutoEdit(path: string): boolean {
  const absolutePath = expandPathLocal(path)
  const pathSegments = absolutePath.split(sep)
  const fileName = pathSegments.at(-1)

  // UNC 路径（纵深防御，兜 containsVulnerableUncPath 漏网的模式）
  if (path.startsWith('\\\\') || path.startsWith('//')) {
    return true
  }

  // 危险目录（大小写不敏感防绕过）
  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i]!
    const normalizedSegment = normalizeCaseForComparison(segment)

    for (const dir of DANGEROUS_DIRECTORIES) {
      if (normalizedSegment !== normalizeCaseForComparison(dir)) {
        continue
      }

      // 特例：{configDir}/worktrees/ 是结构路径（git worktrees 存放处），
      // 非用户创建的敏感目录；其后跟 'worktrees' 时跳过该 {configDir} 段
      if (dir === getConfigDirName()) {
        const nextSegment = pathSegments[i + 1]
        if (
          nextSegment &&
          normalizeCaseForComparison(nextSegment) === 'worktrees'
        ) {
          break // 跳过该 {configDir}，继续查其余段
        }
      }

      return true
    }
  }

  // 危险配置文件（大小写不敏感）
  if (fileName) {
    const normalizedFileName = normalizeCaseForComparison(fileName)
    if (
      (DANGEROUS_FILES as readonly string[]).some(
        dangerousFile =>
          normalizeCaseForComparison(dangerousFile) === normalizedFileName,
      )
    ) {
      return true
    }
  }

  return false
}

/**
 * 检测可能绕过安全检查的可疑 Windows 路径模式（NTFS ADS / 8.3 短名 /
 * 长路径前缀 / 尾随点空格 / DOS 设备名 / 三连同点 / UNC）。全平台检查
 * （NTFS 可在 Linux/macOS 挂载，同法可绕过）。
 */
function hasSuspiciousWindowsPathPattern(path: string): boolean {
  // NTFS ADS：':' 在位置 2 之后（跳过盘符 C:\）。仅 Windows/WSL 内核解释
  if (getPlatform() === 'windows' || getPlatform() === 'wsl') {
    const colonIndex = path.indexOf(':', 2)
    if (colonIndex !== -1) {
      return true
    }
  }

  // 8.3 短名：'~' 后跟数字（GIT~1、BASHRC~1）
  if (/~\d/.test(path)) {
    return true
  }

  // 长路径前缀：\\?\C:\、\\.\\、//?/C:/、//./C:/
  if (
    path.startsWith('\\\\?\\') ||
    path.startsWith('\\\\.\\') ||
    path.startsWith('//?/') ||
    path.startsWith('//./')
  ) {
    return true
  }

  // 尾随点/空格（Windows 解析时剥离，可绕过字符串匹配）
  if (/[.\s]+$/.test(path)) {
    return true
  }

  // DOS 设备名：CON/PRN/AUX/NUL/COM1-9/LPT1-9
  if (/\.(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(path)) {
    return true
  }

  // 三连同点作路径分量（.../file、path/.../file）
  if (/(^|\/|\\)\.{3,}(\/|\\|$)/.test(path)) {
    return true
  }

  // UNC 路径（全平台纵深防御）
  if (containsVulnerableUncPath(path)) {
    return true
  }

  return false
}

/**
 * 判定路径自动编辑（acceptEdits）是否安全。返回不安全原因或全通过。
 * 对原始路径 + 已解析符号链接路径均做：Windows 可疑模式 / 配置文件 / 危险文件。
 */
export function checkPathSafetyForAutoEdit(
  path: string,
  precomputedPathsToCheck?: readonly string[],
):
  | { safe: true }
  | { safe: false; message: string; classifierApprovable: boolean } {
  const pathsToCheck =
    precomputedPathsToCheck ?? getPathsForPermissionCheck(path)

  for (const pathToCheck of pathsToCheck) {
    if (hasSuspiciousWindowsPathPattern(pathToCheck)) {
      return {
        safe: false,
        message: `AtlasHarness requested permissions to write to ${path}, which contains a suspicious Windows path pattern that requires manual approval.`,
        classifierApprovable: false,
      }
    }
  }

  for (const pathToCheck of pathsToCheck) {
    if (isClaudeConfigFilePath(pathToCheck)) {
      return {
        safe: false,
        message: `AtlasHarness requested permissions to write to ${path}, but you haven't granted it yet.`,
        classifierApprovable: true,
      }
    }
  }

  for (const pathToCheck of pathsToCheck) {
    if (isDangerousFilePathToAutoEdit(pathToCheck)) {
      return {
        safe: false,
        message: `AtlasHarness requested permissions to edit ${path} which is a sensitive file.`,
        classifierApprovable: true,
      }
    }
  }

  return { safe: true }
}

/** 全部工作目录 = originalCwd（注入）+ 上下文附加工作目录。 */
export function allWorkingDirectories(
  context: ToolPermissionContext,
): Set<string> {
  return new Set([
    getPermissionsBootstrapEnv().getOriginalCwd(),
    ...context.additionalWorkingDirectories.keys(),
  ])
}

/**
 * 按路径字符串缓存工作目录的解析形态（会话内工作目录稳定，getPathsForPermissionCheck
 * 对已存在目录确定），避免每次权限检查重复 realpath syscall。
 * 旧仓 lodash memoize(getPathsForPermissionCheck) → 本地 Map 缓存（等效 per-key）。
 */
const _resolvedWorkingDirCache = new Map<string, string[]>()
function getResolvedWorkingDirPaths(workingPath: string): string[] {
  const cached = _resolvedWorkingDirCache.get(workingPath)
  if (cached) {
    return cached
  }
  const resolved = getPathsForPermissionCheck(workingPath)
  _resolvedWorkingDirCache.set(workingPath, resolved)
  return resolved
}

/**
 * 判定路径是否落在允许的（工作）目录内。对原始 + 已解析符号链接路径均
 * 与解析后的工作目录集合比较（防 macOS 已解析路径不匹配未解析工作目录的误拒）。
 */
export function pathInAllowedWorkingPath(
  path: string,
  toolPermissionContext: ToolPermissionContext,
  precomputedPathsToCheck?: readonly string[],
): boolean {
  const pathsToCheck =
    precomputedPathsToCheck ?? getPathsForPermissionCheck(path)

  const workingPaths = Array.from(
    allWorkingDirectories(toolPermissionContext),
  ).flatMap(wp => getResolvedWorkingDirPaths(wp))

  // 全部路径须落在允许工作目录内；任一解析路径在外即拒
  return pathsToCheck.every(pathToCheck =>
    workingPaths.some(workingPath =>
      pathInWorkingPath(pathToCheck, workingPath),
    ),
  )
}

/** 判定 path 是否位于 workingPath 内（不向上越界）。 */
export function pathInWorkingPath(path: string, workingPath: string): boolean {
  const absolutePath = expandPathLocal(path)
  const absoluteWorkingPath = expandPathLocal(workingPath)

  // macOS 常见符号链接归一：/var -> /private/var、/tmp -> /private/tmp
  const normalizedPath = absolutePath
    .replace(/^\/private\/var\//, '/var/')
    .replace(/^\/private\/tmp(\/|$)/, '/tmp$1')
  const normalizedWorkingPath = absoluteWorkingPath
    .replace(/^\/private\/var\//, '/var/')
    .replace(/^\/private\/tmp(\/|$)/, '/tmp$1')

  // 大小写归一防 macOS/Windows 不敏感文件系统绕过
  const caseNormalizedPath = normalizeCaseForComparison(normalizedPath)
  const caseNormalizedWorkingPath = normalizeCaseForComparison(
    normalizedWorkingPath,
  )

  const relative = relativePath(
    caseNormalizedWorkingPath,
    caseNormalizedPath,
  )

  // 同路径
  if (relative === '') {
    return true
  }

  if (containsPathTraversal(relative)) {
    return false
  }

  // 在内（相对路径不向上跳）
  return !posix.isAbsolute(relative)
}

/**
 * 权限检查应覆盖的路径集合（原始 + 已解析符号链接）。薄骨架轻量版：
 * tilde 展开 + UNC 早退 + 单级 realpath（悬空链接/40 层链遍历归 engine）。
 */
export function getPathsForPermissionCheck(inputPath: string): string[] {
  const pathSet = new Set<string>()
  let path = inputPath
  if (path === '~' || path.startsWith('~/')) {
    path = expandPathLocal(path)
  }
  pathSet.add(path)

  // 文件系统访问前拦截 UNC，防 Windows 校验期发起网络请求（DNS/SMB）
  if (path.startsWith('//') || path.startsWith('\\\\')) {
    return Array.from(pathSet)
  }

  try {
    const resolved = getFsImplementation().realpathSync(path)
    if (resolved !== path) {
      pathSet.add(resolved)
    }
  } catch {
    // ENOENT（新文件）/ 断链符号链接 —— 仅逻辑路径入查
  }

  return Array.from(pathSet)
}

// ════════════════════════════════════════════════════════════════
// 薄骨架桩（规则求值 / 内部路径 / 建议生成 → engine 波，见头注 ①②③）
// ════════════════════════════════════════════════════════════════

export function matchingRuleForInput(
  _path: string,
  _toolPermissionContext: ToolPermissionContext,
  _toolType: 'edit' | 'read',
  _behavior: 'allow' | 'deny' | 'ask',
): PermissionRule | null {
  return null
}

export function checkReadableInternalPath(
  _absolutePath: string,
  _input: Record<string, unknown>,
): PermissionResult {
  return { behavior: 'passthrough', message: '' }
}

export function checkEditableInternalPath(
  _absolutePath: string,
  _input: Record<string, unknown>,
): PermissionResult {
  return { behavior: 'passthrough', message: '' }
}

function generateSuggestions(
  _filePath: string,
  _operationType: 'read' | 'write' | 'create',
  _toolPermissionContext: ToolPermissionContext,
  _precomputedPathsToCheck?: readonly string[],
): PermissionUpdate[] {
  return []
}

// ════════════════════════════════════════════════════════════════
// checkRead / checkWrite 决策主面（薄骨架：规则命中步走 ① 桩，内部路径走 ② 桩）
// ════════════════════════════════════════════════════════════════

/** 读权限结果（指定工具与输入）。 */
export function checkReadPermissionForTool(
  tool: PermissionTool,
  input: Record<string, unknown>,
  toolPermissionContext: ToolPermissionContext,
): PermissionDecision {
  const getPath = tool.getPath
  if (typeof getPath !== 'function') {
    return {
      behavior: 'ask',
      message: `AtlasHarness requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }
  const path = getPath(input)

  // 一次算好原始 + 已解析路径，穿给 checkWrite → checkPathSafetyForAutoEdit →
  // pathInAllowedWorkingPath，避免同路径重复 syscall
  const pathsToCheck = getPathsForPermissionCheck(path)

  // 1. 纵深防御：先拦 UNC（\\ 或 // 开头可访问网络资源）
  for (const pathToCheck of pathsToCheck) {
    if (pathToCheck.startsWith('\\\\') || pathToCheck.startsWith('//')) {
      return {
        behavior: 'ask',
        message: `AtlasHarness requested permissions to read from ${path}, which appears to be a UNC path that could access network resources.`,
        decisionReason: {
          type: 'other',
          reason: 'UNC path detected (defense-in-depth check)',
        },
      }
    }
  }

  // 2. 可疑 Windows 路径模式（纵深防御）
  for (const pathToCheck of pathsToCheck) {
    if (hasSuspiciousWindowsPathPattern(pathToCheck)) {
      return {
        behavior: 'ask',
        message: `AtlasHarness requested permissions to read from ${path}, which contains a suspicious Windows path pattern that requires manual approval.`,
        decisionReason: {
          type: 'other',
          reason:
            'Path contains suspicious Windows-specific patterns (alternate data streams, short names, long path prefixes, or three or more consecutive dots) that require manual verification',
        },
      }
    }
  }

  // 3. READ deny 规则（须在任何 allow 检查之前，防绕过显式 read deny）
  for (const pathToCheck of pathsToCheck) {
    const denyRule = matchingRuleForInput(
      pathToCheck,
      toolPermissionContext,
      'read',
      'deny',
    )
    if (denyRule) {
      return {
        behavior: 'deny',
        message: `Permission to read ${path} has been denied.`,
        decisionReason: { type: 'rule', rule: denyRule },
      }
    }
  }

  // 4. READ ask 规则（须在隐式 allow 检查之前）
  for (const pathToCheck of pathsToCheck) {
    const askRule = matchingRuleForInput(
      pathToCheck,
      toolPermissionContext,
      'read',
      'ask',
    )
    if (askRule) {
      return {
        behavior: 'ask',
        message: `AtlasHarness requested permissions to read from ${path}, but you haven't granted it yet.`,
        decisionReason: { type: 'rule', rule: askRule },
      }
    }
  }

  // 5. 编辑访问蕴含读访问（仅在无 read 专属 deny/ask 规则时）
  const editResult = checkWritePermissionForTool(
    tool,
    input,
    toolPermissionContext,
    pathsToCheck,
  )
  if (editResult.behavior === 'allow') {
    return editResult
  }

  // 6. 允许工作目录内的读
  const isInWorkingDir = pathInAllowedWorkingPath(
    path,
    toolPermissionContext,
    pathsToCheck,
  )
  if (isInWorkingDir) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: { type: 'mode', mode: 'default' },
    }
  }

  // 7. 允许从 harness 内部路径读（session-memory/plans/tool-results → ② 桩）
  const absolutePath = expandPathLocal(path)
  const internalReadResult = checkReadableInternalPath(absolutePath, input)
  if (internalReadResult.behavior !== 'passthrough') {
    return internalReadResult
  }

  // 8. allow 规则（① 桩恒 null）
  const allowRule = matchingRuleForInput(
    path,
    toolPermissionContext,
    'read',
    'allow',
  )
  if (allowRule) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: { type: 'rule', rule: allowRule },
    }
  }

  // 12. 默认 ask
  return {
    behavior: 'ask',
    message: `AtlasHarness requested permissions to read from ${path}, but you haven't granted it yet.`,
    suggestions: generateSuggestions(
      path,
      'read',
      toolPermissionContext,
      pathsToCheck,
    ),
    decisionReason: {
      type: 'workingDir',
      reason: 'Path is outside allowed working directories',
    },
  }
}

/**
 * 写权限结果（指定工具与输入）。
 * @param precomputedPathsToCheck - 可选的 getPathsForPermissionCheck 缓存；
 *   调用方须用同 tool + input 在同一同步帧内推导，内部按 tool/input 重取
 *   path 用于报错与内部路径检查，陈旧值会静默对错误路径查 deny 规则。
 */
export function checkWritePermissionForTool(
  tool: PermissionTool,
  input: Record<string, unknown>,
  toolPermissionContext: ToolPermissionContext,
  precomputedPathsToCheck?: readonly string[],
): PermissionDecision {
  const getPath = tool.getPath
  if (typeof getPath !== 'function') {
    return {
      behavior: 'ask',
      message: `AtlasHarness requested permissions to use ${tool.name}, but you haven't granted it yet.`,
    }
  }
  const path = getPath(input)

  // 1. deny 规则（原始 + 已解析路径，① 桩）
  const pathsToCheck =
    precomputedPathsToCheck ?? getPathsForPermissionCheck(path)
  for (const pathToCheck of pathsToCheck) {
    const denyRule = matchingRuleForInput(
      pathToCheck,
      toolPermissionContext,
      'edit',
      'deny',
    )
    if (denyRule) {
      return {
        behavior: 'deny',
        message: `Permission to edit ${path} has been denied.`,
        decisionReason: { type: 'rule', rule: denyRule },
      }
    }
  }

  // 1.5. 允许写内部可编辑路径（plan 文件/scratchpad → ② 桩恒 passthrough）。
  // 须在 isDangerousFilePathToAutoEdit 之前（{configDir} 是危险目录）
  const absolutePathForEdit = expandPathLocal(path)
  const internalEditResult = checkEditableInternalPath(
    absolutePathForEdit,
    input,
  )
  if (internalEditResult.behavior !== 'passthrough') {
    return internalEditResult
  }

  // 1.7. 综合安全检查（Windows 模式 / 配置文件 / 危险文件），须在任何
  // allow 规则检查之前（防用户误授保护文件权限）
  const safetyCheck = checkPathSafetyForAutoEdit(path, pathsToCheck)
  // 显式 === false（非 !safe）：本仓 strict:false 下，真值否定 !x.literal 不收窄
  // 判别联合，显式比较才收窄到 unsafe 支（旧仓此处 as any 规避，本仓不引 any）
  if (safetyCheck.safe === false) {
    return {
      behavior: 'ask',
      message: safetyCheck.message,
      suggestions: generateSuggestions(
        path,
        'write',
        toolPermissionContext,
        pathsToCheck,
      ),
      decisionReason: {
        type: 'safetyCheck',
        reason: safetyCheck.message,
        classifierApprovable: safetyCheck.classifierApprovable,
      },
    }
  }

  // 2. ask 规则（原始 + 已解析路径，① 桩）
  for (const pathToCheck of pathsToCheck) {
    const askRule = matchingRuleForInput(
      pathToCheck,
      toolPermissionContext,
      'edit',
      'ask',
    )
    if (askRule) {
      return {
        behavior: 'ask',
        message: `AtlasHarness requested permissions to write to ${path}, but you haven't granted it yet.`,
        decisionReason: { type: 'rule', rule: askRule },
      }
    }
  }

  // 3. acceptEdits 模式下允许 original cwd 内全部写
  const isInWorkingDir = pathInAllowedWorkingPath(
    path,
    toolPermissionContext,
    pathsToCheck,
  )
  if (toolPermissionContext.mode === 'acceptEdits' && isInWorkingDir) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: { type: 'mode', mode: toolPermissionContext.mode },
    }
  }

  // 4. allow 规则（① 桩）
  const allowRule = matchingRuleForInput(
    path,
    toolPermissionContext,
    'edit',
    'allow',
  )
  if (allowRule) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: { type: 'rule', rule: allowRule },
    }
  }

  // 5. 默认 ask
  return {
    behavior: 'ask',
    message: `AtlasHarness requested permissions to write to ${path}, but you haven't granted it yet.`,
    suggestions: generateSuggestions(
      path,
      'write',
      toolPermissionContext,
      pathsToCheck,
    ),
    decisionReason: !isInWorkingDir
      ? {
          type: 'workingDir',
          reason: 'Path is outside allowed working directories',
        }
      : undefined,
  }
}
