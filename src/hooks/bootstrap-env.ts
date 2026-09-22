/**
 * hooks 域 — bootstrap 状态跨域注入窗口（C-Deep 切片 3 T6）
 *
 * L3 四域（task/bootstrap/permissions/hooks）互不 import：hooks 域需 bootstrap
 * 域的状态，经本注入窗口斩断（同 permissions bootstrap-env / task diskOutput
 * 的 idiom，§8.14 注入序 permissions→task→hooks 末步）。未注入 fail-fast。
 *
 * 消费方：
 *  - createBaseHookInput → getSessionId / getCwd / getTranscriptPath / getMainThreadAgentType
 *  - shouldSkipHookDueToTrust → isNonInteractive / hasTrustAccepted
 */

export type HooksBootstrapEnv = {
  /** bootstrap 域 getSessionId（主会话或子代理 id）。 */
  getSessionId: () => string
  /** bootstrap 域 getCwd（当前工作目录）。 */
  getCwd: () => string
  /** bootstrap 域 getTranscriptPathForSession（会话转录文件路径）。 */
  getTranscriptPath: (sessionId: string) => string
  /** bootstrap 域 getMainThreadAgentType（--agent 标志的主线程代理类型）。 */
  getMainThreadAgentType: () => string | undefined
  /** bootstrap 域 isNonInteractiveSession（SDK/headless 模式 = true，信任隐式）。 */
  isNonInteractive: () => boolean
  /** bootstrap 域 checkHasTrustDialogAccepted（交互式信任对话框是否已接受）。 */
  hasTrustAccepted: () => boolean
}

let _env: HooksBootstrapEnv | null = null

/** 组合根注入 bootstrap 状态（§8.14 注入序末步）。 */
export function setHooksBootstrapEnv(env: HooksBootstrapEnv): void {
  _env = env
}

/** 读当前注入。未注入 = fail-fast 抛错（防静默空会话，H6 防腐）。 */
export function getHooksBootstrapEnv(): HooksBootstrapEnv {
  if (!_env) {
    throw new Error(
      'hooks bootstrap 未注入 — 组合根须先 setHooksBootstrapEnv({ getSessionId, getCwd, getTranscriptPath, getMainThreadAgentType, isNonInteractive, hasTrustAccepted })（§8.14 注入序 permissions→task→hooks）',
    )
  }
  return _env
}

/** 测试复位（teardown 用）。 */
export function resetHooksBootstrapEnv(): void {
  _env = null
}
