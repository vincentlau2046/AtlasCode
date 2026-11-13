import { logForDebugging } from '../../kernel/utils/debug'

export type ModifierKey = 'shift' | 'command' | 'control' | 'option'

let prewarmed = false

/**
 * Pre-warm the native module by loading it in advance.
 * Call this early to avoid delay on first use.
 */
export function prewarmModifiers(): void {
  if (prewarmed || process.platform !== 'darwin') {
    return
  }
  prewarmed = true
  // Load module in background
  try {
    const { prewarm } = require('modifiers-napi') as { prewarm: () => void }
    prewarm()
  } catch {
    // Ignore errors during prewarm
  }
}

/**
 * Check if a specific modifier key is currently pressed (synchronous).
 */
export function isModifierPressed(modifier: ModifierKey): boolean {
  if (process.platform !== 'darwin') {
    return false
  }
  // 0.1.88 R-087-2-FAMILY：modifiers-napi 为 optionalDependencies（darwin 增强
  // 面）。缺包/ABI load 败时降级为 false（无修饰键）并落 debug log——显式降级
  // 替代 npm 树缺包 crash（登记行为变化），呈现形态 = 最低 log 面（工单审计 2d）。
  try {
    // Dynamic import to avoid loading native module at top level
    const { isModifierPressed: nativeIsModifierPressed } =
      require('modifiers-napi') as { isModifierPressed: (m: string) => boolean }
    return nativeIsModifierPressed(modifier)
  } catch (error) {
    logForDebugging(
      `modifiers-napi unavailable, modifier "${modifier}" query degraded to false: ${String(error)}`,
    )
    return false
  }
}
