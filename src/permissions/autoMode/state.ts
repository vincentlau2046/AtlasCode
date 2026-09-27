/**
 * autoMode 子域 — auto-mode 会话态（§8.65，旧仓 autoModeState.ts 39L 逐字）。
 *
 * 旧仓来源：setAutoModeActive / isAutoModeActive / setAutoModeFlagCli /
 * getAutoModeFlagCli / setAutoModeCircuitBroken / isAutoModeCircuitBroken /
 * _resetForTesting（delta ① 改名 resetAutoModeStateForTesting）。独立模块以便
 * 调用方按需条件 require（旧仓 feature('TRANSCRIPT_CLASSIFIER')）。
 *
 * 裁剪 delta（复审勿当遗漏重提）：
 * ① 旧仓 `_resetForTesting`（与 denials.ts 同名）→ 子域 STR-1 门面要求唯一
 *    命名，本模块改名 resetAutoModeStateForTesting（denials 侧同型改名
 *    resetAutoModeDenialsForTesting）。语义逐字不变。
 *
 * 纯会话态持有器（零 LLM / 零 growthbook 依赖），可全量单测。消费点 = LLM 闭包
 * （③ auto 模式分类器调用点，provider 波）+ CLI 启动旗标；本波冻结面 + 测试。
 *
 * 字段语义（旧仓注释逐字）：
 * - autoModeActive：auto-mode 会话内激活态。
 * - autoModeFlagCli：CLI `--auto` 旗标（启动时置位）。
 * - autoModeCircuitBroken：异步 verifyAutoModeGateAccess 读到
 *   atlas_auto_mode_config.enabled === 'disabled' 时置位，用于 kick-out 后
 *   阻断 SDK/显式再进入（isAutoModeGateEnabled 消费，前向接缝）。
 */

let autoModeActive = false
let autoModeFlagCli = false
// Set by the async verifyAutoModeGateAccess check when it
// reads a fresh atlas_auto_mode_config.enabled === 'disabled' from GrowthBook.
// Used by isAutoModeGateEnabled() to block SDK/explicit re-entry after kick-out.
let autoModeCircuitBroken = false

export function setAutoModeActive(active: boolean): void {
  autoModeActive = active
}

export function isAutoModeActive(): boolean {
  return autoModeActive
}

export function setAutoModeFlagCli(passed: boolean): void {
  autoModeFlagCli = passed
}

export function getAutoModeFlagCli(): boolean {
  return autoModeFlagCli
}

export function setAutoModeCircuitBroken(broken: boolean): void {
  autoModeCircuitBroken = broken
}

export function isAutoModeCircuitBroken(): boolean {
  return autoModeCircuitBroken
}

export function resetAutoModeStateForTesting(): void {
  autoModeActive = false
  autoModeFlagCli = false
  autoModeCircuitBroken = false
}
