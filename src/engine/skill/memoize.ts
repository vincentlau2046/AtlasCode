/**
 * engine/skill — memoize 本地最小实现（§8.67 D 波 S-E2a；lodash 裁剪先例
 * 同 engine/tools/bash/memoize.ts，STR-1 域自治不复用工具面文件）。
 *
 * 旧仓 `import memoize from 'lodash-es/memoize.js'`（lodash-es 不在新仓依赖面）
 * → 本地最小面：
 *   - 默认 resolver = 首参为键（与 lodash 一致）
 *   - 可选自定义 resolver（第二参；旧仓 loadMarkdownFilesForSubdir 用
 *     `(subdir, cwd) => `${subdir}:${cwd}`` 双参键）
 *   - `.cache` 面（Map）供 clearSkillCaches/clearCommandsCache 清除
 * 本域消费点：getSkillDirCommands(cwd) / loadAllCommands(cwd) /
 * getSkillToolCommands(cwd) / getSlashCommandToolSkills(cwd) /
 * builtInCommandNames()（0 参 = 首参键 undefined）/ loadMarkdownFilesForSubdir
 * （自定义双参键）——首参键 + 自定义键两形态全覆盖。
 */
export function memoize<A extends unknown[], R>(
  fn: (...args: A) => R,
  resolver?: (...args: A) => unknown,
): ((...args: A) => R) & { cache: Map<unknown, R> } {
  const cache = new Map<unknown, R>()
  const memoized = ((...args: A): R => {
    const key = resolver ? resolver(...args) : args[0]
    if (!cache.has(key)) {
      cache.set(key, fn(...args))
    }
    return cache.get(key) as R
  }) as ((...args: A) => R) & { cache: Map<unknown, R> }
  memoized.cache = cache
  return memoized
}
