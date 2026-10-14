/**
 * 0.1.71 块 B（用户主诉②「自动升级未实现」）——版本检查 / nudge / opt-in 核心。
 *
 * 三件（工单 §2）：
 *  - B-1 版本检查：当前版本 vs npm latest（`npm view` 固定 registry + **24h 磁盘
 *    缓存** + timeout + 检查失败**静默**永不阻塞 session + `ATLAS_UPDATE_CHECK`
 *    env 覆盖 registry〔gate/沙箱可测面〕）；新版 → nudge「新版本 X 可用（当前 Y）」。
 *  - B-2 升级命令行（提示模式，默认）：nudge 携带可复制升级命令
 *    `npm install -g @atlasharness/atlascode --registry https://registry.npmjs.org`
 *    （registry 恒 npmjs = 0.1.43 npmmirror CN 只读坑教训固化）。
 *  - B-3 opt-in 自动升级（零默认行为）：`ATLAS_AUTO_UPDATE=1`（env）或
 *    `settings.autoUpdate` → 才后台自动装；**默认（未设）= 仅提示**（恒等锚）。
 *
 * 判别单测可测性（unit 层纪律：无网络/无真盘/无 PTY）：nudge 文案 / opt-in 门 /
 * semver 比较 / 缓存新鲜度 = 纯函数；缓存与 `npm view` 皆经**可注入 seam**
 * （cache port + fetchLatest）——测试注内存 fake cache + fake fetch，零网络/零真盘。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFileNoThrowWithCwd } from './execFileNoThrow.js'
import { getAtlasConfigHomeDir, isEnvTruthy } from './envUtils.js'
import { gt } from './semver.js'

/** registry 恒 npmjs（0.1.43 npmmirror CN 只读坑教训固化；B-2 命令行 registry 段必在场）。 */
export const UPDATE_NPM_REGISTRY = 'https://registry.npmjs.org'
/** 包 spec（单一事实源 = npm 发布名；与 MACRO.PACKAGE_URL 同源）。 */
export const UPDATE_PKG_SPEC = '@atlasharness/atlascode'
/** 24h 磁盘缓存（低频版本检查，避免每次启动打 registry；B-1 缓存过期语义可测）。 */
export const UPDATE_CHECK_CACHE_TTL_MS = 24 * 60 * 60 * 1000
/** 版本检查超时（ms）——有界，永不阻塞 session（B-1 检查失败静默面）。 */
const UPDATE_CHECK_TIMEOUT_MS = 5_000

/**
 * B-2：可复制升级命令行（提示模式）。registry 段（`--registry https://registry.npmjs.org`）
 * 必在场（字符串级判别锚）。
 */
export function buildUpdateUpgradeCommand(): string {
  return `npm install -g ${UPDATE_PKG_SPEC} --registry ${UPDATE_NPM_REGISTRY}`
}

/**
 * B-1 + B-2：nudge 文案（纯函数）。
 *  - latest 更新于 current（gt）→ 「新版本 ${latest} 可用（当前 ${current}）· <升级命令>」。
 *  - 同版本 / 检查失败（latest=null）/ current 缺失 → null（nudge 缺席，恒等锚）。
 */
export function getUpdateNudgeText(
  current: string,
  latest: string | null,
): string | null {
  if (!latest || !current) return null
  if (!gt(latest, current)) return null
  return `新版本 ${latest} 可用（当前 ${current}）· ${buildUpdateUpgradeCommand()}`
}

/**
 * B-3：opt-in 自动升级门（纯函数，零默认行为）。
 * `ATLAS_AUTO_UPDATE=1`（env，isEnvTruthy 五态：未设/1/true→开，0/false→关）或
 * `settings.autoUpdate === true` → true；**默认（均未设）= false（仅提示模式）**。
 */
export function isAutoUpdateOptedIn(
  env: NodeJS.ProcessEnv = process.env,
  settings?: { autoUpdate?: boolean },
): boolean {
  if (isEnvTruthy(env?.ATLAS_AUTO_UPDATE)) return true
  return settings?.autoUpdate === true
}

// ── 缓存 port（可注入 seam：真盘默认 + 测试注内存 fake，unit 层无真盘纪律）────

/** 缓存条目（磁盘 JSON 形状；latest=null 表检查失败，亦缓存以免失败态反复打网）。 */
export interface UpdateCacheEntry {
  latest: string | null
  checkedAtMs: number
}

/** 缓存 port——抽象磁盘读写，测试注内存 fake（unit 无真盘）。 */
export interface UpdateCachePort {
  read(): Promise<UpdateCacheEntry | null>
  write(entry: UpdateCacheEntry): Promise<void>
}

/** 缓存文件路径（~/.atlas/update-check.json；dir 注入供测试/非常规 home）。 */
export function getUpdateCachePath(dir?: string): string {
  const root = dir ?? getAtlasConfigHomeDir()
  return join(root, 'update-check.json')
}

/** 缓存新鲜判定（纯函数；B-1 缓存过期语义：now- checkedAtMs < TTL 才用缓存）。 */
export function isUpdateCacheFresh(
  checkedAtMs: number,
  nowMs: number,
  ttlMs: number = UPDATE_CHECK_CACHE_TTL_MS,
): boolean {
  return nowMs - checkedAtMs < ttlMs
}

/** 真盘缓存 port（fs/promises 异步，autoUpdater.ts 同源 idiom；读/写失败 = 静默不阻塞）。 */
export function createDiskUpdateCache(dir?: string): UpdateCachePort {
  return {
    async read(): Promise<UpdateCacheEntry | null> {
      try {
        const raw = await readFile(getUpdateCachePath(dir), 'utf8')
        const parsed = JSON.parse(raw) as Partial<UpdateCacheEntry>
        if (
          (parsed.latest === null || typeof parsed.latest === 'string') &&
          typeof parsed.checkedAtMs === 'number'
        ) {
          return { latest: parsed.latest, checkedAtMs: parsed.checkedAtMs }
        }
        return null
      } catch {
        return null
      }
    },
    async write(entry: UpdateCacheEntry): Promise<void> {
      try {
        const root = dir ?? getAtlasConfigHomeDir()
        await mkdir(root, { recursive: true })
        await writeFile(getUpdateCachePath(dir), JSON.stringify(entry), 'utf8')
      } catch {
        // 缓存写失败 = 静默（不阻塞 session）
      }
    },
  }
}

/** 缺省真盘缓存 port（~/.atlas）。 */
export const diskUpdateCache: UpdateCachePort = createDiskUpdateCache()

/**
 * B-1：解析 latest 版本（缓存优先 + 过期重查 + 失败静默）。
 *  - 缓存新鲜（< 24h）→ 直接用缓存（不 fetch，fromCache=true）。
 *  - 缓存过期/缺失 → fetchLatest（可注入；缺省 = 固定 registry `npm view`）→ 写缓存。
 *  - fetch 失败 → latest=null（fromCache=false），静默（nudge 缺席）。
 * 全可注入（fetchLatest/cache/nowMs）→ unit 判别单测零网络/零真盘。
 */
export async function resolveLatestVersion(opts: {
  fetchLatest?: () => Promise<string | null>
  cache?: UpdateCachePort
  nowMs?: number
} = {}): Promise<{ latest: string | null; fromCache: boolean }> {
  const now = opts.nowMs ?? Date.now()
  const cache = opts.cache ?? diskUpdateCache
  const cached = await cache.read()
  if (cached && isUpdateCacheFresh(cached.checkedAtMs, now)) {
    return { latest: cached.latest, fromCache: true }
  }
  const latest = await (opts.fetchLatest ?? defaultFetchLatest)()
  await cache.write({ latest, checkedAtMs: now })
  return { latest, fromCache: false }
}

/**
 * 缺省 fetch：`npm view <pkg> version --registry <registry>`（registry 恒 npmjs，
 * `ATLAS_UPDATE_CHECK` env 覆盖〔gate/沙箱可测面〕；homedir 运行免项目级 .npmrc
 * 恶意重定向，对齐 autoUpdater 安全裁断；5s 有界超时）。失败 = null（静默）。
 */
async function defaultFetchLatest(): Promise<string | null> {
  const registry = process.env.ATLAS_UPDATE_CHECK || UPDATE_NPM_REGISTRY
  const result = await execFileNoThrowWithCwd(
    'npm',
    ['view', UPDATE_PKG_SPEC, 'version', '--registry', registry],
    { abortSignal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS), cwd: homedir() },
  )
  if (result.code !== 0) return null
  const v = result.stdout.trim()
  return v ? v : null
}
