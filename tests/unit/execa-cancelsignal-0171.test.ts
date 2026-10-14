/**
 * 0.1.71 修波 r2（D-1，gate r-20261015-gate-071-r2）execa 10 选项名源级锁单测。
 *
 * 定因：execa 10.0.1（lockfile 钉定）把 `signal` 选项更名 `cancelSignal`
 * （execa 8+ 类型面 `cancelSignal?: AbortSignal`，旧名连 `undefined` 值（键恒
 * 在场）都触发 execa 同步 TypeError（不 spawn）→ wrapper 全调用点静默
 * code=1（AutoUpdater 版本检查 / 块 B 版本检查 nudge / B-3 自动装面潜伏死面）。
 *
 * D-3 盲区（登记，无码修）：tsc 类型面 / 单测 fake 注入 / CI 三重绿 ≠ 运行
 * 安全（execa 10 类型/运行 desync：最小形调用红 TS2769 vs 全属性调用形 rc=0
 * 绿 + 单测全注 fake）→ 真 execa 路径零覆盖，仅活探针可捕获 → 本文件以
 * **源级字符串锁**钉住选项名（零 spawn，unit 层纪律）。
 *
 * 锁面（全仓 3 处 execa 旧名调用点，gate r2 定因清单）：
 *  - src/tui/utils/execFileNoThrow.ts（wrapper 恒传：cancelSignal: abortSignal）
 *  - src/tui/core/executor/AscendExecutor.ts（条件传参：仅 opts.signal 在场）
 *  - src/ascend/executor/AscendExecutor.ts（条件传参，同形）
 *
 * 分层纪律：零网络 / 零 spawn（纯源文本断言；读源文件 = 只读仓库自身，
 * 确定性）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'

function srcOf(rel: string): string {
  return readFileSync(resolve(import.meta.dir, '../../', rel), 'utf8')
}

describe('0.1.71 修波 r2 D-1 execa cancelSignal 选项名源级锁', () => {
  test('execFileNoThrow wrapper：cancelSignal: abortSignal 在场 + 旧名行级缺席', () => {
    const src = srcOf('src/tui/utils/execFileNoThrow.ts')
    expect(src).toContain('cancelSignal: abortSignal')
    // 旧名缺席按行断言（`^\s*signal:` 精确锚定 execa 选项位，避免误伤
    // getErrorMessage 的 result.signal / ExecaResultWithError.signal 合法用法）
    const hasLegacyOptionLine = src
      .split('\n')
      .some(l => /^\s*signal:/.test(l))
    expect(hasLegacyOptionLine).toBe(false)
  })

  test('AscendExecutor×2（条件传参）：execaOpts.cancelSignal = opts.signal + 旧名缺席', () => {
    for (const rel of [
      'src/tui/core/executor/AscendExecutor.ts',
      'src/ascend/executor/AscendExecutor.ts',
    ]) {
      const src = srcOf(rel)
      expect(src).toContain('if (opts?.signal) execaOpts.cancelSignal = opts.signal')
      // 新形 `execaOpts.cancelSignal =` 不含子串 `execaOpts.signal =`（前缀
      // `execaOpts.` 后接 `cancelSignal` 非 `signal`）→ 缺席断言精确
      expect(src).not.toContain('execaOpts.signal = opts.signal')
    }
  })
})
