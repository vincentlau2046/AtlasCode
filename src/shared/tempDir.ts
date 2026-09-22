/**
 * 用户专属 Atlas 临时目录名 —— 跨域纯叶子（C-Deep 切片 3 T5 提升为 shared 单一事实源）。
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/filesystem.ts 的 getAtlasTempDirName。
 * 全输入来自 shared（getPlatform / getConfigDirName）+ process.getuid，无状态、
 * 无注入窗口 → 纯叶子，升 shared 汇（L3 四域互不 import 的跨域叶子唯一出口）。
 *
 * 消费面：
 *  - permissions 域 getAtlasTempDir（有状态 realpath 缓存）→ 消费本叶子
 *  - executor Shell sandboxTmpDir（cwd 文件链）→ 消费本叶子（保 executor 域
 *    零 C-Deep 域 import，§8.16 偏差：getAtlasTempDirName 由 permissions 最小面
 *    提升 shared，避免 executor→permissions 跨域边）
 *
 * Unix: {configDir}-{uid}（防多用户共享 /tmp 时权限冲突）；
 * Windows: {configDir}（tmpdir() 已按用户隔离）。
 */
import { getPlatform } from './platform'
import { getConfigDirName } from './configDir'

export function getAtlasTempDirName(): string {
  if (getPlatform() === 'windows') {
    return getConfigDirName()
  }
  // 用 UID 建 per-user 目录，防多用户共享同一 /tmp 时权限冲突
  const uid = process.getuid?.() ?? 0
  return `${getConfigDirName()}-${uid}`
}
