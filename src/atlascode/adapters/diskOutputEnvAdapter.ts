/**
 * atlascode 组合根适配器 — permissions+bootstrap → task diskOutput env（§8.14 D11）
 *
 * task 域 diskOutput 的 getTaskOutputDir 依赖两条跨域边：
 *   - getProjectTempDir（permissions 域，随迁 filesystem.ts）
 *   - getSessionId（bootstrap 域，随迁 state.ts）
 * task 域 L3 自治不 import 其他域，两函数经 setDiskOutputEnv 注入窗口斩断。
 * 本适配器把两域真函数打包成 DiskOutputEnv，由 compose.ts 调 setDiskOutputEnv 注入。
 *
 * 注入序（§8.14 permissions→task→hooks）：getProjectTempDir 内部读
 * getPermissionsBootstrapEnv().getOriginalCwd()，故 compose.ts 须先
 * setPermissionsBootstrapEnv 再 setDiskOutputEnv（两者都在首条命令前完成）。
 */
import { getProjectTempDir } from '../../permissions'
import { getSessionId } from '../../bootstrap'
import type { DiskOutputEnv } from '../../task'

/** permissions getProjectTempDir + bootstrap getSessionId → task DiskOutputEnv。 */
export function createDiskOutputEnv(): DiskOutputEnv {
  return {
    getProjectTempDir,
    getSessionId,
  }
}
