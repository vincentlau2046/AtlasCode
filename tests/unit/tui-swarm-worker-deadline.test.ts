/**
 * 0.1.37 ⑧ TUI pane-worker 用户面封口判别单测（unit 层：纯面契约 + 源级在场
 * 断言，零模型 / 零真盘 / 零网络）。
 *
 * 测面 = ⑧ 修复三面（engine 侧 0.1.36 切片① 的同型用户面）：
 *   - deadline 策略纯面（shared 单一事实源，与 engine 侧契约同型）：
 *     resolveMailboxPermissionDeadlineMs 缺省 30_000 / env 覆盖 / 非法与非正值
 *     回落；approvalUnavailableReason Nms 可审计 + fail-closed deny 措辞。
 *   - swarmWorkerHandler：worker 侧 promise 第 4 终态（deadline 首胜 claim +
 *     unref + 注册表释放 + fail-closed buildReject + unavailable 决策审计源）。
 *   - useSwarmPermissionPoller：P6-a 3 支 drop 结构化审计（decided:unavailable）
 *     + 500ms interval unref + 计数缝。
 *   - 决策审计：unavailable reject source（union 成员 + logging 消费）。
 *
 * 真 handler 全路径（杀 leader 等价 → deadline 早于 500ms poll 首拍 fail-closed
 * + 回合继续 + 注册表释放）= func 层 tui-swarm-worker-deadline-fs.test.ts +
 * e2e V3-⑧ 探针（pane-worker 杀 leader 真面）覆盖。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  approvalUnavailableReason,
  resolveMailboxPermissionDeadlineMs,
} from '../../src/shared'

const DEADLINE_ENV = 'ATLAS_PERM_MAILBOX_DEADLINE_MS'

function readSrc(rel: string): string {
  return readFileSync(join(import.meta.dir, '../../src', rel), 'utf8')
}

describe('⑧ deadline 策略纯面契约（shared 单一事实源，与 engine 侧同契约）', () => {
  afterEach(() => {
    delete process.env[DEADLINE_ENV]
  })

  test('缺省（env 未设）→ 30_000', () => {
    delete process.env[DEADLINE_ENV]
    expect(resolveMailboxPermissionDeadlineMs()).toBe(30_000)
  })

  test('env 合法正整数 → 覆盖缺省', () => {
    process.env[DEADLINE_ENV] = '1000'
    expect(resolveMailboxPermissionDeadlineMs()).toBe(1000)
  })

  test('env 非法（非数字）→ 回落缺省 30_000', () => {
    process.env[DEADLINE_ENV] = 'abc'
    expect(resolveMailboxPermissionDeadlineMs()).toBe(30_000)
  })

  test('env 非正值（0 / 负数）→ 回落缺省 30_000', () => {
    process.env[DEADLINE_ENV] = '0'
    expect(resolveMailboxPermissionDeadlineMs()).toBe(30_000)
    process.env[DEADLINE_ENV] = '-5'
    expect(resolveMailboxPermissionDeadlineMs()).toBe(30_000)
  })

  test('approvalUnavailableReason：Nms 可审计 + fail-closed deny 措辞', () => {
    const r = approvalUnavailableReason(30_000)
    expect(r).toContain('30000ms')
    expect(r).toContain('denied')
    expect(r).toContain('fail-closed')
    // 超时场景是「无人可确认」非「需确认」——禁用 ask 支 confirmation required 措辞
    expect(r).not.toContain('confirmation required')
  })
})

describe('⑧ 源级在场断言（锁 TUI 用户面封口接线不回归）', () => {
  test('swarmWorkerHandler：第 4 终态 deadline（首胜 + unref + 注册表释放 + fail-closed）', () => {
    const src = readSrc(
      'tui/hooks/toolPermission/handlers/swarmWorkerHandler.ts',
    )
    // 纯面消费（shared 单一事实源；boundaries tui↛swarm 故不 import src/swarm）
    expect(src).toContain('resolveMailboxPermissionDeadlineMs()')
    expect(src).toContain('approvalUnavailableReason(effDeadlineMs)')
    // 第 4 终态：deadline timer + unref（不阻塞进程干净退出 = P1 验收「进程可退」）
    expect(src).toContain('const deadlineTimer = setTimeout(')
    expect(src).toContain('deadlineTimer.unref()')
    // deadline 到期 → fail-closed deny（buildReject = 回合继续不 abort）+ 决策审计源
    expect(src).toContain("source: { type: 'unavailable' }")
    // 注册表释放（deadline + abort 两支非 poller 驱动终态，挂死不泄漏）
    const unregisterHits = src.match(
      /unregisterPermissionCallback\(request\.id\)/g,
    ) ?? []
    expect(unregisterHits.length).toBe(2)
    // allow/reject 终态清 deadline timer（首胜后不二次 settle）
    expect(src).toContain('clearTimeout(deadlineTimer)')
  })

  test('useSwarmPermissionPoller：P6-a 3 支 drop 审计 + interval unref + 计数缝', () => {
    const src = readSrc('tui/hooks/useSwarmPermissionPoller.ts')
    // P6-a 三支 drop 结构化审计（mailbox / sandbox / 磁盘轮询；精确行断言）
    expect(src).toContain(
      'approval response dropped (no pending callback, decided:unavailable) request_id=${params.requestId} decision=${params.decision}',
    )
    expect(src).toContain(
      'sandbox approval response dropped (no pending callback, decided:unavailable) request_id=${params.requestId} allow=${params.allow}',
    )
    expect(src).toContain(
      'approval response dropped (no pending callback, decided:unavailable) request_id=${response.requestId} decision=${response.decision}',
    )
    // 500ms interval unref（ref'd interval 阻塞进程干净退出）
    expect(src).toContain('setInterval(() => void poll(), POLL_INTERVAL_MS)')
    expect(src).toContain('pollTimer.unref()')
    // usehooks-ts useInterval 撤除（timer 句柄暴露方可 unref）
    expect(src).not.toContain('useInterval(')
    expect(src).not.toContain("from 'usehooks-ts'")
    // 计数缝（func 层泄漏观测面）
    expect(src).toContain('export function pendingPermissionCallbackCount')
  })

  test('决策审计：unavailable reject source（union 成员 + logging 消费）', () => {
    const ctx = readSrc('tui/hooks/toolPermission/PermissionContext.ts')
    expect(ctx).toMatch(/\| \{ type: 'unavailable' \}/)
    const logging = readSrc('tui/hooks/toolPermission/permissionLogging.ts')
    expect(logging).toContain("case 'unavailable':")
    expect(logging).toContain("return 'unavailable'")
  })

  test('shared 单一事实源：定义在 shared，engine 面经 shared 消费（无重复定义）', () => {
    const shared = readSrc('shared/permissionDeadline.ts')
    expect(shared).toContain(
      'export function resolveMailboxPermissionDeadlineMs',
    )
    expect(shared).toContain('export function approvalUnavailableReason')
    // TUI handler 经 shared 门面消费（不 reach src/swarm）
    const handler = readSrc(
      'tui/hooks/toolPermission/handlers/swarmWorkerHandler.ts',
    )
    expect(handler).toContain("from 'src/shared'")
    expect(handler).not.toContain("from 'src/swarm'")
  })
})
