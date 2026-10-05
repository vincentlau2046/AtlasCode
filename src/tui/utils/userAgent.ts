/**
 * User-Agent string helpers.
 *
 * Kept dependency-free so SDK-bundled code (bridge, cli/transports) can
 * import without pulling in auth.ts and its transitive dependency tree.
 */

// G-3（§8.74.28 R4）：品牌串 = 品牌 + 版本（repo 链接由各 UA 面自持，
// 避免内嵌串重复；WebFetch 面 = `Atlas-User (AtlasCode/<v>; repo)`，无字面 `+`）。
export function getDefaultUserAgent(): string {
  return `AtlasCode/${MACRO.VERSION}`
}
