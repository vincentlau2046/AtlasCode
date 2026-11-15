/**
 * session 域 — SessionEnv 注入窗口（E-7 S-7d d1，§8.49 详案 item 2；
 * scheduler cronEnv §8.47 注入口先例：域自包含不跨 import bootstrap）
 *
 * 设计：域缺省全自包含（randomUUID 捕获 + 域内 session id 持有 +
 * process.cwd() + `ATLAS_CONFIG_DIR ?? ~/.atlas/projects`），组合根接线时
 * 经 setSessionEnv 注真 bootstrap 值（新仓 bootstrap/state.ts ②session id /
 * ①originalCwd + 域 projectsDir + ⑨ getCwd 活态面）——前向接缝已核销
 * （E-wave-end S-E2 注真值 + S-E3 A12 活态 cwd 成员，§8.52）。
 *
 * 裁剪登记：旧 bootstrap getSessionProjectDir（CC-34 原子对，`: any` 恒
 * null stub）/ getPromptId / getPlanSlugCache 随注入面一并弃（新仓 bootstrap
 * 无对应真实现，见 §8.49 解耦判据）。
 */
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { join } from 'path'
// S0-R2（lock-face @25cb7454 §3-4）：barrel 值导入窄化——shared 全 barrel
// （含 feature/bun:bundle）不得入 web 只读载体加载图，直连子模块。
import { getConfigDirName } from '../../shared/configDir'

export type SessionEnv = {
  /** 当前 session id（旧 bootstrap getSessionId）。 */
  getSessionId(): string
  /** 切换 session（/resume/--continue；单参——projectDir 原子对随 d1 裁）。 */
  switchSession(id: string): void
  /** 进程启动 cwd（旧 bootstrap getOriginalCwd；不可变语义）。 */
  getOriginalCwd(): string
  /** transcript 项目根目录（`<configHome>/projects`，bootstrap defaultTranscriptDir 先例）。 */
  getProjectsDir(): string
  /** 进程退出清理钩子注册（旧 utils/cleanupRegistry；缺省 no-op 收集，壳侧接线执行面）。 */
  registerCleanup(handler: () => Promise<void>): void
  /**
   * 活态 cwd（S-E3 A12，§8.52）：旧仓 getCwd() 活态语义（ALS 覆盖层 ??
   * cwdState，Bash cd 持久化 / --resume workDir / agent worktree 刷新）。域缺省
   * = process.cwd() 活读（无 bootstrap 约束下旧活态语义最近等价，自包含不破）；
   * 组合根经 bootstrap pwd()（ALS 覆盖 ?? getCwdState）注真值。消费点 =
   * project.ts insertMessageChain cwd 戳（A-1 审视值 delta 可选扩已落）。
   */
  getCwd(): string
}

// ── 缺省实现（域自包含）──────────────────────────────────────────────────────
// S0-R2（lock-face @25cb7454 §3-2，f4 批复工单 §7 @351c74c4）：顶层进程面
// 惰性化（格 2 导入纯度必改级②）——_sessionId/_originalCwd 由模块装载时求值
// 改首访问捕获（`??=` memo，冻结语义不变）。语义披露：捕获点从「模块装载时」
// 后移至「首次调用时」——CLI 车道 import≈startup 等价；web 载体车道首调发生在
// runtime 使用期，进程启动 cwd 面不变式由 R-1 隔离测试复跑守卫。
let _sessionId: string | undefined
let _originalCwd: string | undefined
const _cleanupHandlers: Array<() => Promise<void>> = []

const defaultEnv: SessionEnv = {
  getSessionId: () => (_sessionId ??= randomUUID()),
  switchSession: id => {
    if (id) _sessionId = id
  },
  getOriginalCwd: () => (_originalCwd ??= process.cwd()),
  // 活态 cwd 域缺省（A12）：process.cwd() 活读——同 getOriginalCwd 捕获点
  // 语义（模块加载 = 进程启动 cwd），但每次调用重读（活态面）。
  getCwd: () => process.cwd(),
  getProjectsDir: () =>
    // 审视 A-3 登记（E-7 d1 独立审视 MINOR）：旧 getAtlasConfigHomeDir
    // （envUtils L9）含 `.normalize('NFC')` + memoize(键=env 值)。NFC 逐字
    // 保留（非 ASCII home / env 覆盖时目录名与旧平台工具一致）；memoize →
    // 每调用重读 env（旧 memoize 键=env 值，语义等价，测试更友好）。
    join(
      (process.env.ATLAS_CONFIG_DIR ?? join(homedir(), getConfigDirName())).normalize('NFC'),
      'projects',
    ),
  registerCleanup: handler => {
    _cleanupHandlers.push(handler)
  },
}

let _env: SessionEnv = defaultEnv

/**
 * 组合根注真 bootstrap 值（E-wave-end compose.ts 接线；测试覆写
 * getProjectsDir → tmpdir 真盘面）。Partial 合并：未注成员沿用缺省。
 */
export function setSessionEnv(partial: Partial<SessionEnv>): void {
  _env = { ..._env, ...partial }
}

export function getSessionEnv(): SessionEnv {
  return _env
}

/**
 * 测试复位（恢复域缺省，丢弃组合根/测试注入的 Partial 合并；单进程连跑跨文件
 * 泄漏守卫——setSessionEnv 为 Partial 合并进程内不可逆，本导出 = teardown 出口；
 * 合并走 spread 新对象，defaultEnv 本体不被写，复位安全）。
 */
export function resetSessionEnv(): void {
  // S0-R2 惰性捕获配套：捕获变量一并复位（首调捕获语义 = 复位后下一次访问
  // 重新捕获）。旧形模块装载冻结常量天然跨 reset 存活（import 时已捕获 =
  // 进程启动值）；新形捕获点后移，不复位则先跑文件捕获的脏值（chdir 后的
  // cwd / 旧 session id）会穿越 resetSessionEnv 泄漏给后续测试——单进程连跑
  // 跨文件隔离守卫因此必须清捕获态。
  _sessionId = undefined
  _originalCwd = undefined
  _env = defaultEnv
}
