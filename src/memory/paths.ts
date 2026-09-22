/**
 * memory 路径解析 — 从旧仓 memdir/paths.ts 收进域内
 *
 * charter L3 memory 自治 + DEP-3：以下外部依赖全部断开——
 *   • growthbook（getFeatureValue_CACHED_MAY_BE_STALE）→ Port 8 FeatureConfigPort，
 *     B 波未接线：isExtractModeActive() 桩返 false（TODO: Port 8 注入后接真实实验门控）。
 *   • settings（getInitialSettings/getSettingsForSource）→ settings port，
 *     B 波未接线：getAutoMemPathSetting() 桩返 undefined，isAutoMemoryEnabled() 的
 *     settings.autoMemoryEnabled 分支跳过（TODO: settings port 接线后恢复）。
 *   • bootstrap/state（getProjectRoot/getIsNonInteractiveSession）→ 改为 projectRoot
 *     参数（默认 process.cwd()），无隐藏 bootstrap 依赖。
 *   • utils/git（findCanonicalGitRoot）→ worktree 共享记忆目录逻辑暂缺，
 *     getAutoMemBase() 直接返回 projectRoot（TODO: git 域迁移后恢复 canonical root）。
 *   • lodash-es/memoize → 域本地 memoize（键 projectRoot）。
 *
 * env 优先级链（isAutoMemoryEnabled）：
 *   1. ATLAS_DISABLE_AUTO_MEMORY（1/true→OFF，0/false→ON）
 *   2. ATLAS_SIMPLE（--bare）→ OFF
 *   3. ATLAS_REMOTE 且无 ATLAS_REMOTE_MEMORY_DIR → OFF
 *   4. settings.autoMemoryEnabled（B 波未接线，跳过）
 *   5. 默认 ON
 */
import { homedir } from 'os'
import { isAbsolute, join, normalize, sep } from 'path'

import { isEnvDefinedFalsy, isEnvTruthy } from '../shared'
import { getAtlasConfigHomeDir } from './envUtils'
import { sanitizePath } from './pathUtils'

const AUTO_MEM_DIRNAME = 'memory'
const AUTO_MEM_ENTRYPOINT_NAME = 'MEMORY.md'

// ---------------------------------------------------------------------------
// 域本地 memoize（替代 lodash-es/memoize，键 projectRoot）
// ---------------------------------------------------------------------------

function memoizeOnProjectRoot<T>(fn: (projectRoot: string) => T): (projectRoot?: string) => T {
  let cachedKey: string | undefined
  let cachedVal: T | undefined
  return (projectRoot?: string) => {
    const key = projectRoot ?? process.cwd()
    if (key === cachedKey && cachedVal !== undefined) {
      return cachedVal
    }
    cachedKey = key
    cachedVal = fn(key)
    return cachedVal
  }
}

// ---------------------------------------------------------------------------
// 启用门控
// ---------------------------------------------------------------------------

/**
 * auto-memory 是否启用（memdir / agent memory / past session search）。
 * 默认启用。优先级链见模块头注。
 */
export function isAutoMemoryEnabled(): boolean {
  const envVal = process.env.ATLAS_DISABLE_AUTO_MEMORY
  if (isEnvTruthy(envVal)) {
    return false
  }
  if (isEnvDefinedFalsy(envVal)) {
    return true
  }
  // --bare / SIMPLE：关掉 extractMemories / autoDream / /remember / team sync
  if (isEnvTruthy(process.env.ATLAS_SIMPLE)) {
    return false
  }
  if (
    isEnvTruthy(process.env.ATLAS_REMOTE) &&
    !process.env.ATLAS_REMOTE_MEMORY_DIR
  ) {
    return false
  }
  // TODO: settings port 接线后恢复 settings.autoMemoryEnabled 分支
  return true
}

/**
 * extract-memories 后台代理是否本会话运行。
 *
 * B 波：growthbook 未接线（Port 8 FeatureConfigPort），桩返 false。
 * TODO: Port 8 注入后接 atlas_passport_quail / atlas_slate_thimble 实验门控。
 */
export function isExtractModeActive(): boolean {
  return false
}

// ---------------------------------------------------------------------------
// 基础目录
// ---------------------------------------------------------------------------

/**
 * 持久记忆存储基目录。
 *   1. ATLAS_REMOTE_MEMORY_DIR env（CCR 显式覆盖）
 *   2. ~/.atlas（默认配置主目录）
 */
export function getMemoryBaseDir(): string {
  if (process.env.ATLAS_REMOTE_MEMORY_DIR) {
    return process.env.ATLAS_REMOTE_MEMORY_DIR
  }
  return getAtlasConfigHomeDir()
}

// ---------------------------------------------------------------------------
// 路径安全校验
// ---------------------------------------------------------------------------

/**
 * 归一化并校验候选 auto-memory 目录路径。
 *
 * SECURITY：拒绝作为读白名单根有危险的路径——
 *   - 相对（!isAbsolute）："../foo" 会按 CWD 解释
 *   - 根/近根（length < 3）：" "/"  /a"
 *   - Windows 盘根（C: 正则）
 *   - UNC（\\server\share）：网络路径，不透明信任边界
 *   - null 字节：syscall 截断
 *
 * 返回带恰好一个尾分隔符的归一化路径，未设/空/拒绝则 undefined。
 */
export function validateMemoryPath(
  raw: string | undefined,
  expandTilde: boolean,
): string | undefined {
  if (!raw) {
    return undefined
  }
  let candidate = raw
  if (
    expandTilde &&
    (candidate.startsWith('~/') || candidate.startsWith('~\\'))
  ) {
    const rest = candidate.slice(2)
    const restNorm = normalize(rest || '.')
    if (restNorm === '.' || restNorm === '..') {
      return undefined
    }
    candidate = join(homedir(), rest)
  }
  const normalized = normalize(candidate).replace(/[/\\]+$/, '')
  if (
    !isAbsolute(normalized) ||
    normalized.length < 3 ||
    /^[A-Za-z]:$/.test(normalized) ||
    normalized.startsWith('\\\\') ||
    normalized.startsWith('//') ||
    normalized.includes('\0')
  ) {
    return undefined
  }
  return (normalized + sep).normalize('NFC')
}

/**
 * ATLAS_COWORK_MEMORY_PATH_OVERRIDE 的直接覆盖（不展开 ~）。
 * Cowork 用它把记忆重定向到空间级挂载。
 */
export function getCoworkMemoryPathOverride(): string | undefined {
  return validateMemoryPath(
    process.env.ATLAS_COWORK_MEMORY_PATH_OVERRIDE,
    false,
  )
}

/** ATLAS_COWORK_MEMORY_PATH_OVERRIDE 是否设了有效覆盖。 */
export function hasAutoMemPathOverride(): boolean {
  return getCoworkMemoryPathOverride() !== undefined
}

/**
 * settings.json 的 autoMemoryDirectory 覆盖。
 *
 * B 波：settings port 未接线，桩返 undefined。
 * TODO: settings port 接线后恢复 policy/local/user 源读取（projectSettings 出于安全排除）。
 */
function getAutoMemPathSetting(): string | undefined {
  return undefined
}

// ---------------------------------------------------------------------------
// auto-memory 目录
// ---------------------------------------------------------------------------

/**
 * 返回 auto-memory 目录基（用于 sanitize 的项目根）。
 *
 * B 波：findCanonicalGitRoot 依赖（utils/git）未收进，直接返回 projectRoot。
 * TODO: git 域迁移后恢复 canonical git root（同仓所有 worktree 共享一个记忆目录，
 * anthropics/claude-code#24382）。
 */
function getAutoMemBase(projectRoot: string): string {
  return projectRoot
}

/**
 * auto-memory 目录路径。优先级：
 *   1. ATLAS_COWORK_MEMORY_PATH_OVERRIDE env（Cowork 全路径覆盖）
 *   2. settings.json autoMemoryDirectory（B 波未接线）
 *   3. <memoryBase>/projects/<sanitized-project-root>/memory/
 *
 * memoizeOnProjectRoot：渲染路径调用者（collapseReadSearchGroups → isAutoManagedMemoryFile）
 * 每个 tool-use 消息触发；miss 成本是 settings × 4。键 projectRoot，测试改 mock 后重算。
 */
export const getAutoMemPath = memoizeOnProjectRoot(
  (projectRoot: string): string => {
    const override = getCoworkMemoryPathOverride() ?? getAutoMemPathSetting()
    if (override) {
      return override
    }
    const projectsDir = join(getMemoryBaseDir(), 'projects')
    return (
      join(projectsDir, sanitizePath(getAutoMemBase(projectRoot)), AUTO_MEM_DIRNAME) + sep
    ).normalize('NFC')
  },
)

/**
 * auto-memory 入口（auto-memory 目录内的 MEMORY.md）。
 */
export function getAutoMemEntrypoint(projectRoot?: string): string {
  return join(getAutoMemPath(projectRoot), AUTO_MEM_ENTRYPOINT_NAME)
}

/**
 * 绝对路径是否在 auto-memory 目录内。
 *
 * 设了 ATLAS_COWORK_MEMORY_PATH_OVERRIDE 时匹配覆盖目录（此时 true 不意味写权限——
 * filesystem 写豁免门控在 !hasAutoMemPathOverride()）。
 */
export function isAutoMemPath(absolutePath: string, projectRoot?: string): boolean {
  // SECURITY: 归一化防 .. 穿透
  const normalizedPath = normalize(absolutePath)
  return normalizedPath.startsWith(getAutoMemPath(projectRoot))
}
