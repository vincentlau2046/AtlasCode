/**
 * BootstrapState 端口 — 旧仓 bootstrap/state.ts 的 executor 消费面（C2 · C-Deep 前置）
 *
 * 旧仓 Shell.ts（新仓空 stub src/executor/shell/Shell.ts 待 C-Deep 填）消费 2 点：
 *   - `getOriginalCwd()` — 进程启动 cwd；当前 cwd 被命令删除时的回退
 *   - `setCwdState(physicalPath)` — 全局 cwd 状态更新（物理路径解析后 / 回退恢复后）
 *
 * L3 自治：executor 域禁 import bootstrap 域（C-Deep 建的 4 新域之一；
 * 旧仓 bootstrap/state.ts 为模块级可变状态 `_cwdState`/`_originalCwd`）——
 * 域内只面向此端口编程，bootstrap 域提供实现，组合根经 setBootstrapStatePort() 注入。
 *
 * 未注入 = fail-fast 抛错（静默 no-op 的 setCwdState 会让 cwd 追踪无声失效）。
 * fake = createFakeBootstrapState（tests/fixtures/executor-port-fakes.ts）。
 */

/**
 * BootstrapState 端口 — bootstrap 域 cwd 状态在 executor 侧的窄视图
 * （旧仓 getOriginalCwd/setCwdState，_originalCwd 与 _cwdState 是分离状态）。
 */
export interface BootstrapStatePort {
  /** 进程启动 cwd（旧仓 _originalCwd；当前 cwd 被删时的回退目标）。 */
  getOriginalCwd(): string
  /** 更新全局 cwd 状态（旧仓 setCwdState；Shell 物理路径解析 / 回退恢复后调用）。 */
  setCwdState(cwd: string): void
}

// ── 注入窗口（组合根注入，modelprovider/roles.ts 同款 idiom）──────────────
let activePort: BootstrapStatePort | null = null

/** 组合根注入 bootstrap 域真 BootstrapStatePort。 */
export function setBootstrapStatePort(port: BootstrapStatePort): void {
  activePort = port
}

/** 读当前端口。未注入 = fail-fast 抛错（防 cwd 状态无声失效）。 */
export function getBootstrapStatePort(): BootstrapStatePort {
  if (!activePort) {
    throw new Error(
      'BootstrapStatePort 未注入 — 组合根（atlascode/compose.ts）须先 setBootstrapStatePort()',
    )
  }
  return activePort
}

/** 测试复位。 */
export function resetBootstrapStatePort(): void {
  activePort = null
}
