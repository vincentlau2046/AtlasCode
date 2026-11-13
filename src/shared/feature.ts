/**
 * feature(name) — 特性灰度开关（charter d 裁定：普通模块, 非 bun:bundle 内建）
 *
 * 旧仓双形态（127 内建 bun:bundle + 45 F5 shim bunBundle.ts）→ 新仓统一为
 * 本普通模块。解掉旧仓 bun:bundle feature() 测试中恒 false 不可测的坑
 * （charter PRT-1 连带收益）。
 *
 * 机制：
 *  - 读 `FEATURE_<NAME>` env（大写）, call-time 求值（非构建期常量）
 *  - `FEATURE_X=true` → 开; `FEATURE_X=false` → 显式关（压过 ON_BY_DEFAULT）
 *  - ON_BY_DEFAULT 集合中的 flag 未设 env 时默认开（生产 bundle 经本模块生效）
 *
 * 测试：直接 `process.env['FEATURE_X'] = 'true'` / `delete` 控制, 无需 preload。
 *
 * 域级 flag 不在此（扩展点机制 = DomainPackage.featureGate 声明式, charter PRT-1）。
 * 远程实验配置（growthbook）走 Port 8 FeatureConfigPort, 不在此。
 */

// 裁定(2026-09-19): TRANSCRIPT_CLASSIFIER (auto-mode 整链) 翻转为默认开。
// 裁定(2026-09-21): COORDINATOR_MODE 翻转为默认开。
// 生产 bundle 经本模块生效; 运行时仍受 env 门控 (FEATURE_X=false kill-switch)。
const ON_BY_DEFAULT: ReadonlySet<string> = new Set([
  "TRANSCRIPT_CLASSIFIER",
  "COORDINATOR_MODE",
])

/**
 * 特性灰度开关。call-time 读 env, 非构建期常量。
 * @param name flag 名（大写, 如 "ASCEND_TOOLS"）
 * @returns true = 该特性当前开启
 */
export function feature(name: string): boolean {
  const key = "FEATURE_" + name
  // Tests set the flag on the global process.env; the test worker's
  // globalThis.process.env can be a different object, so prefer the global
  // process.env and fall back to the worker's process object.
  const env: Record<string, string | undefined> =
    (typeof process !== "undefined"
      ? (process as { env: Record<string, string | undefined> }).env
      : undefined) ??
    (globalThis as { process?: { env: Record<string, string | undefined> } })
      .process?.env ??
    (global as unknown as {
      process?: { env: Record<string, string | undefined> }
    }).process?.env ??
    {}
  if (env[key] === "true") return true
  // Explicit off wins over on-by-default — lets a default-on gate be force-disabled.
  if (env[key] === "false") return false
  return ON_BY_DEFAULT.has(name)
}

/** 导出 ON_BY_DEFAULT 供测试断言（只读副本, 不导出可变引用） */
export const FEATURE_ON_BY_DEFAULT: readonly string[] = [...ON_BY_DEFAULT]
