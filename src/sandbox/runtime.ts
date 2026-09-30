/**
 * sandbox runtime 加载器（裁剪版，C-Deep 切片 2）
 *
 * 旧仓来源（a8af45b）: src/vendor/atlas-sandbox-runtime.ts（170L）。
 * 旧仓经 `#atlas-sandbox-runtime` alias 加载外部未发布包（G-3 R5-a：shim + 别名已裁）
 * （@anthropic-ai/sandbox-runtime，仅 CI 安装；本地 fallback = placeholder
 * 禁用态）。**真 bwrap 行为在该外部包内，不在仓内**——新仓 deps 仅
 * openai+zod，不 vendor 该包，裁剪版 = 默认 placeholder（与旧仓 fallback
 * 同语义：isSupportedPlatform=false → 沙箱禁用态，非安全降级）+ 注入窗口
 * （B6-func/D 波定案 bwrap runtime 包后，经 setSandboxRuntimeModule 单点
 * 换入真实现；未注入时调用真行为方法 fail-fast 抛错，防"沙箱以为开着"
 * 的空洞等价，对齐 C2 三 port 的 fail-fast 裁定）。
 *
 * 残余清单（后续波次，复审勿当遗漏重提）：
 * - 真 runtime 包加载（B6-func/D 波：国内 bwrap 工具链或等价 runtime 定案）
 * - SandboxRuntimeConfigSchema（zod 校验，旧仓随 runtime 包提供）
 */
import type { BaseSandboxManagerStatic } from "./runtime-types"

/** 真行为方法无 runtime 时的 fail-fast（返回 never，可赋给任意方法签名）。 */
function throwUnavailable(method: string): never {
  throw new Error(
    `Sandbox runtime 未安装——${method}() 不可用` +
      `（组合根经 setSandboxRuntimeModule() 注入真 runtime 后恢复）`,
  )
}

/**
 * placeholder runtime（= 旧仓 fallback 语义）。
 * 平台检查返回禁用态；真行为方法 fail-fast 抛错（调用点 = 沙箱已启用态，
 * 无 runtime 即环境缺陷，须显式失败而非静默透传命令）。
 */
const PLACEHOLDER: BaseSandboxManagerStatic = {
  // 禁用态（旧仓 fallback 同款 3 方法）
  isSupportedPlatform: () => false,
  isSandboxingEnabled: () => false,
  isSandboxEnabledInSettings: () => false,
  checkDependencies: () => ({
    errors: ["sandbox runtime not installed"],
    warnings: [],
  }),
  // 真行为 fail-fast（无 runtime 包时不应走到这里：manager 禁用态短路）
  initialize: () => throwUnavailable("initialize"),
  updateConfig: () => throwUnavailable("updateConfig"),
  reset: () => throwUnavailable("reset"),
  wrapWithSandbox: () => throwUnavailable("wrapWithSandbox"),
  cleanupAfterCommand: () => throwUnavailable("cleanupAfterCommand"),
  getFsReadConfig: () => throwUnavailable("getFsReadConfig"),
  getFsWriteConfig: () => throwUnavailable("getFsWriteConfig"),
  getNetworkRestrictionConfig: () =>
    throwUnavailable("getNetworkRestrictionConfig"),
  getAllowUnixSockets: () => throwUnavailable("getAllowUnixSockets"),
  getAllowLocalBinding: () => throwUnavailable("getAllowLocalBinding"),
  getIgnoreViolations: () => throwUnavailable("getIgnoreViolations"),
  getEnableWeakerNestedSandbox: () =>
    throwUnavailable("getEnableWeakerNestedSandbox"),
  getProxyPort: () => throwUnavailable("getProxyPort"),
  getSocksProxyPort: () => throwUnavailable("getSocksProxyPort"),
  getLinuxHttpSocketPath: () => throwUnavailable("getLinuxHttpSocketPath"),
  getLinuxSocksSocketPath: () =>
    throwUnavailable("getLinuxSocksSocketPath"),
  waitForNetworkInitialization: () =>
    throwUnavailable("waitForNetworkInitialization"),
  annotateStderrWithSandboxFailures: () =>
    throwUnavailable("annotateStderrWithSandboxFailures"),
}

// ── 注入窗口（组合根注入，modelprovider/roles.ts + executor 三 port 同款）──

let activeRuntime: BaseSandboxManagerStatic = PLACEHOLDER

/** 组合根注入真 runtime（B6-func/D 波 bwrap 工具链定案后）。 */
export function setSandboxRuntimeModule(
  runtime: BaseSandboxManagerStatic,
): void {
  activeRuntime = runtime
}

/** 读当前 runtime（调用时查找，支持构造后换入）。 */
export function getSandboxRuntimeModule(): BaseSandboxManagerStatic {
  return activeRuntime
}

/** 测试复位（回 placeholder 禁用态）。 */
export function resetSandboxRuntimeModule(): void {
  activeRuntime = PLACEHOLDER
}

// re-export 供 domain 内部使用（门面 index.ts 统一对外）
export type {
  BaseSandboxManagerStatic,
  FsReadRestrictionConfig,
  FsWriteRestrictionConfig,
  IgnoreViolationsConfig,
  NetworkRestrictionConfig,
  SandboxRuntimeConfig,
} from "./runtime-types"
