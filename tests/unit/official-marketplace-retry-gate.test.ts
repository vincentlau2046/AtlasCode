/**
 * 2026-10-08 多 OS 优化 · 官方源自动安装重试门判别单测（C 面：
 * officialMarketplaceStartupCheck.shouldRetryInstallation）。
 *
 * 判据（用户裁定「默认门 off」）：
 *   - 门默认 OFF：每次启动都重试（无 backoff 跳过 / 无 attempts 上限 / 无 nextRetryTime 窗）；
 *     短路面不变（已装 → 不重试；policy_blocked 永久 → 不重试；未尝试 → 试）；
 *   - 门 opt-in（ATLAS_ENABLE_OFFICIAL_MKT_RETRY_BACKOFF=1）= 旧 backoff 语义
 *     （MAX_ATTEMPTS / nextRetryTime 窗 / failReason 白名单）。
 * 分层纪律：纯函数断言（无网络 / 无 settings 落盘）；env 操纵 try/finally 还原。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  isRetryBackoffGateEnabled,
  RETRY_CONFIG,
  shouldRetryInstallation,
} from '../../src/tui/utils/plugins/officialMarketplaceStartupCheck.js'

type Cfg = Parameters<typeof shouldRetryInstallation>[0]

/** 最小 config：attempted=true + 未装；over 覆写判据字段。 */
function cfg(over: Record<string, unknown>): Cfg {
  return {
    officialMarketplaceAutoInstallAttempted: true,
    officialMarketplaceAutoInstalled: false,
    ...over,
  } as unknown as Cfg
}

const BACKOFF_ENV = 'ATLAS_ENABLE_OFFICIAL_MKT_RETRY_BACKOFF'
let prevBackoffEnv: string | undefined

beforeEach(() => {
  prevBackoffEnv = process.env[BACKOFF_ENV]
  delete process.env[BACKOFF_ENV]
})

afterEach(() => {
  if (prevBackoffEnv === undefined) delete process.env[BACKOFF_ENV]
  else process.env[BACKOFF_ENV] = prevBackoffEnv
})

describe('重试门默认 OFF（每次启动重试，无 backoff 跳过）', () => {
  test('门默认关（env 未设 → isRetryBackoffGateEnabled=false）', () => {
    expect(isRetryBackoffGateEnabled()).toBe(false)
  })

  test('从未尝试 → 试', () => {
    expect(
      shouldRetryInstallation(
        cfg({ officialMarketplaceAutoInstallAttempted: false }),
      ),
    ).toBe(true)
  })

  test('已装成功 → 不重试（门无关短路）', () => {
    expect(
      shouldRetryInstallation(cfg({ officialMarketplaceAutoInstalled: true })),
    ).toBe(false)
  })

  test('policy_blocked 永久 → 不重试（门无关短路，企业策略不会自行翻转）', () => {
    expect(
      shouldRetryInstallation(cfg({ officialMarketplaceAutoInstallFailReason: 'policy_blocked' })),
    ).toBe(false)
  })

  test('git_unavailable + backoff 窗未到期 + 超 attempts 上限 → 仍重试（门 off）', () => {
    expect(
      shouldRetryInstallation(
        cfg({
          officialMarketplaceAutoInstallFailReason: 'git_unavailable',
          officialMarketplaceAutoInstallNextRetryTime: Date.now() + 3_600_000,
          officialMarketplaceAutoInstallRetryCount: 999,
        }),
      ),
    ).toBe(true)
  })

  test('gcs_unavailable → 重试', () => {
    expect(
      shouldRetryInstallation(
        cfg({
          officialMarketplaceAutoInstallFailReason: 'gcs_unavailable',
          officialMarketplaceAutoInstallNextRetryTime: Date.now() + 3_600_000,
        }),
      ),
    ).toBe(true)
  })

  test('unknown → 重试', () => {
    expect(
      shouldRetryInstallation(
        cfg({ officialMarketplaceAutoInstallFailReason: 'unknown' }),
      ),
    ).toBe(true)
  })

  test('legacy 状态（failReason 未定义）→ 重试', () => {
    expect(shouldRetryInstallation(cfg({}))).toBe(true)
  })
})

describe('重试门 opt-in（ATLAS_ENABLE_OFFICIAL_MKT_RETRY_BACKOFF）= 旧 backoff 语义', () => {
  test('env=1 → 门开；env=0/未设 → 门关（isEnvTruthy 语义）', () => {
    expect(isRetryBackoffGateEnabled()).toBe(false)
    process.env[BACKOFF_ENV] = '1'
    expect(isRetryBackoffGateEnabled()).toBe(true)
    process.env[BACKOFF_ENV] = '0'
    expect(isRetryBackoffGateEnabled()).toBe(false)
  })

  test('门开 + 超 attempts 上限（>= MAX_ATTEMPTS）→ 跳过', () => {
    process.env[BACKOFF_ENV] = '1'
    expect(
      shouldRetryInstallation(
        cfg({
          officialMarketplaceAutoInstallFailReason: 'unknown',
          officialMarketplaceAutoInstallRetryCount: RETRY_CONFIG.MAX_ATTEMPTS,
        }),
      ),
    ).toBe(false)
  })

  test('门开 + backoff 窗未到期 → 跳过', () => {
    process.env[BACKOFF_ENV] = '1'
    expect(
      shouldRetryInstallation(
        cfg({
          officialMarketplaceAutoInstallFailReason: 'unknown',
          officialMarketplaceAutoInstallNextRetryTime: Date.now() + 3_600_000,
        }),
      ),
    ).toBe(false)
  })

  test('门开 + 窗已过 + failReason 白名单（unknown / git_unavailable / gcs_unavailable）→ 重试', () => {
    process.env[BACKOFF_ENV] = '1'
    const past = Date.now() - 1000
    for (const reason of [
      'unknown',
      'git_unavailable',
      'gcs_unavailable',
    ] as const) {
      expect(
        shouldRetryInstallation(
          cfg({
            officialMarketplaceAutoInstallFailReason: reason,
            officialMarketplaceAutoInstallNextRetryTime: past,
          }),
        ),
      ).toBe(true)
    }
  })
})
