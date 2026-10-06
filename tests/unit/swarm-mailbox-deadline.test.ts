/**
 * swarm 域 P1（0.1.36 切片①）mailbox 兜底协作式 deadline 判别单测
 * （unit 层：纯面 + 源级在场断言，零模型 / 零真盘 / 零网络）。
 *
 * 测面 = P1 修复两纯面（可 import 单测）：
 *   - resolveMailboxPermissionDeadlineMs：缺省 30_000 / env 合法正整数覆盖 /
 *     非法值（非数字）回落 / 非正值（0、负数）回落缺省。
 *   - approvalUnavailableReason(deadlineMs)：超时终态 fail-closed deny 的
 *     模型可见 reason（deny 措辞非 "confirmation required"，带 Nms 可审计）。
 * + 源级在场断言（readSrc 模式，锁 P1 接线不回归）：
 *   - inProcessRunner：settle 首胜闩 / poller + deadline 双 timer unref /
 *     deadline 消费 approvalUnavailableReason / cleanup 双清 + 释放 pendingCallbacks。
 *   - permissionPoller：P6-a drop 支 decided:unavailable 结构化审计行。
 *
 * 真 mailbox 全路径（杀 leader → N 秒 unavailable deny + 回合继续 + 进程可退）
 * = func 层 swarm-mailbox-deadline-fs.test.ts + e2e V3 探针覆盖。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  approvalUnavailableReason,
  resolveMailboxPermissionDeadlineMs,
} from '../../src/swarm'

const DEADLINE_ENV = 'ATLAS_PERM_MAILBOX_DEADLINE_MS'

function readSrc(rel: string): string {
  return readFileSync(join(import.meta.dir, '../../src', rel), 'utf8')
}

describe('P1 resolveMailboxPermissionDeadlineMs（纯面）', () => {
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
})

describe('P1 approvalUnavailableReason（纯面）', () => {
  test('带 deadline Nms（可审计）', () => {
    expect(approvalUnavailableReason(30_000)).toContain('30000ms')
    expect(approvalUnavailableReason(5000)).toContain('5000ms')
  })

  test('deny 语义（fail-closed，非 confirmation required）', () => {
    const r = approvalUnavailableReason(30_000)
    expect(r).toContain('denied')
    expect(r).toContain('fail-closed')
    // 超时场景是「无人可确认」非「需确认」——禁用 ask 支 confirmation required 措辞
    expect(r).not.toContain('confirmation required')
  })
})

describe('P1 源级在场断言（锁接线不回归）', () => {
  test('inProcessRunner：settle 首胜闩 + 双 timer unref + deadline 消费 + cleanup 双清', () => {
    const src = readSrc('swarm/inProcessRunner.ts')
    // settle 首胜闩（第 4 终态与 allow/reject/abort 三支互斥，晚到不二次 resolve）
    expect(src).toContain('let settled = false')
    expect(src).toMatch(/if \(settled\) return/)
    // 双 timer unref（不阻塞进程干净退出 = P1 验收「进程可退」）
    expect(src).toContain('pollInterval.unref()')
    expect(src).toContain('deadlineTimer.unref()')
    // deadline 到期 → fail-closed deny（消费 approvalUnavailableReason，unavailable 语义）
    expect(src).toContain(
      'settle({ allowed: false, reason: approvalUnavailableReason(effDeadlineMs) })',
    )
    // cleanup 双清（poller + deadline）+ 释放 pendingCallbacks（挂死不泄漏）
    const cleanupBody = src.match(/function cleanup\(\)\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(cleanupBody).toContain('clearInterval(pollInterval)')
    expect(cleanupBody).toContain('clearTimeout(deadlineTimer)')
    expect(cleanupBody).toContain('unregisterPermissionCallback(request.id)')
  })

  test('inProcessRunner：deadline 缺省常量 + env 覆盖 + gate 第 6 参在场', () => {
    const src = readSrc('swarm/inProcessRunner.ts')
    expect(src).toContain('PERMISSION_MAILBOX_DEADLINE_MS = 30_000')
    expect(src).toContain('ATLAS_PERM_MAILBOX_DEADLINE_MS')
    // gate 签名第 6 参 deadlineMs（测试注入口，仅 mailbox 回退支消费）
    expect(src).toMatch(/deadlineMs\?:\s*number/)
    // effDeadlineMs = 注入 deadlineMs ?? 缺省解析（协作式 timer 时长源）
    expect(src).toContain('deadlineMs ?? resolveMailboxPermissionDeadlineMs()')
  })

  test('permissionPoller：P6-a drop 支 decided:unavailable 审计行在场', () => {
    const src = readSrc('swarm/permissionPoller.ts')
    expect(src).toContain('decided:unavailable')
    // 结构化字段（request_id + decision，原则 5 asked/decided 配对 decided 侧）
    expect(src).toContain('request_id=${params.requestId}')
    expect(src).toContain('decision=${params.decision}')
  })
})
