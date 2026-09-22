/**
 * permissions 域 — bootstrap 状态跨域注入窗口（C-Deep 切片 3 T5）
 *
 * L3 四域（task/bootstrap/permissions/hooks）互不 import：permissions 域
 * 需 bootstrap 域的两个 cwd 状态，经本注入窗口斩断（同 task/diskOutput 的
 * setDiskOutputEnv idiom，§8.14 注入序 permissions→task→hooks）。
 *
 * 未注入 = fail-first 抛错（非静默透传——loud ≠ hollow，H6 斩断 fail-fast）：
 * getProjectTempDir / allWorkingDirectories / isClaudeConfigFilePath 读
 * getOriginalCwd，expandPath 缺省基准读 getCwd，组合根（B6-func/D 波
 * compose.ts）须先注入 bootstrap 真实现。
 *
 * 注入面刻意收窄到两函数：getSessionId 消费方（scratchpad/session-memory）
 * 均已砍（engine 波），故不入窗。
 */

export type PermissionsBootstrapEnv = {
  /** bootstrap 域 getOriginalCwd（进程启动 cwd，不可变语义）。 */
  getOriginalCwd: () => string
  /** bootstrap 域 getCwd（当前工作目录，可变；expandPath 缺省基准）。 */
  getCwd: () => string
}

let _env: PermissionsBootstrapEnv | null = null

/** 组合根注入 bootstrap 状态（§8.14 注入序 permissions→task→hooks 首步）。 */
export function setPermissionsBootstrapEnv(env: PermissionsBootstrapEnv): void {
  _env = env
}

/** 读当前注入。未注入 = fail-fast 抛错（防静默空目录，H6 防腐）。 */
export function getPermissionsBootstrapEnv(): PermissionsBootstrapEnv {
  if (!_env) {
    throw new Error(
      'permissions bootstrap 未注入 — 组合根须先 setPermissionsBootstrapEnv({ getOriginalCwd, getCwd })（§8.14 注入序 permissions→task→hooks）',
    )
  }
  return _env
}

/** 测试复位（teardown 用）。 */
export function resetPermissionsBootstrapEnv(): void {
  _env = null
}
