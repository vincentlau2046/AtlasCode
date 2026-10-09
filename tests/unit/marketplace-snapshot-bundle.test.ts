/**
 * W-opt 可信专项 0.1.46 三源波 S3（#301）· 3 市场 manifest 快照 bundle 钉死单测。
 *
 * 判别面（mutation-red）：
 *   - 快照清单必须恰为 3 个 preset registry key（agent-skills / atlas-plugins /
 *     claude-plugins-official）——多一个（混入非 preset 市场）或少一个（漏源）都红；
 *   - manifest 顶层形状钉死（name=key + owner + plugins 非空 + 条目含 name/source）；
 *   - 计数基线钉死（agent-skills 33 / atlas-plugins 24 / claude-plugins-official 310）：
 *     再生成快照后若上游市场条目变化，本测红 → 强制同步核（数据漂移是显式事件，
 *     不是静默漂移）。
 * 分层纪律：纯数据断言（无网络 / 无落盘）。
 */
import { describe, expect, test } from 'bun:test'
import {
  BUILTIN_MARKETPLACE_SNAPSHOTS,
  getBuiltinMarketplaceSnapshot,
} from '../../src/tui/utils/plugins/builtinMarketplaceSnapshots.js'

const EXPECTED_KEYS = ['agent-skills', 'atlas-plugins', 'claude-plugins-official']

describe('快照清单 = 3 preset registry key（不多不少）', () => {
  test('恰好 3 条且 key 集与 EXPECTED_KEYS 全等', () => {
    expect(BUILTIN_MARKETPLACE_SNAPSHOTS.map(s => s.key).sort()).toEqual(
      [...EXPECTED_KEYS].sort(),
    )
  })

  test('getBuiltinMarketplaceSnapshot 按 key 命中 / 非 3 源 key 未命中', () => {
    for (const key of EXPECTED_KEYS) {
      expect(getBuiltinMarketplaceSnapshot(key)?.key).toBe(key)
    }
    expect(getBuiltinMarketplaceSnapshot('no-such-marketplace')).toBeUndefined()
  })
})

describe('manifest 顶层形状', () => {
  test('每条 manifest.name = registry key（registry 契约 key=manifest 名）', () => {
    for (const s of BUILTIN_MARKETPLACE_SNAPSHOTS) {
      expect(s.manifest.name).toBe(s.key)
    }
  })

  test('每条 manifest 含 owner + 非空 plugins 数组', () => {
    for (const s of BUILTIN_MARKETPLACE_SNAPSHOTS) {
      expect(s.manifest.owner, `${s.key}: owner 缺失`).toBeDefined()
      expect(Array.isArray(s.manifest.plugins)).toBe(true)
      expect((s.manifest.plugins as unknown[]).length).toBeGreaterThan(0)
    }
  })

  test('每个 plugin 条目含 name + source（UI 列表与安装路径的最小形状）', () => {
    for (const s of BUILTIN_MARKETPLACE_SNAPSHOTS) {
      for (const p of s.manifest.plugins as Array<Record<string, unknown>>) {
        expect(typeof p.name, `${s.key}: plugin 缺 name`).toBe('string')
        expect(p.source, `${s.key}/${p.name}: plugin 缺 source`).toBeDefined()
      }
    }
  })
})

describe('计数基线钉死（再生成后须同步核）', () => {
  test('agent-skills = 33', () => {
    expect(
      (getBuiltinMarketplaceSnapshot('agent-skills')!.manifest.plugins as unknown[])
        .length,
    ).toBe(33)
  })

  test('atlas-plugins = 24', () => {
    expect(
      (getBuiltinMarketplaceSnapshot('atlas-plugins')!.manifest.plugins as unknown[])
        .length,
    ).toBe(24)
  })

  test('claude-plugins-official = 310', () => {
    expect(
      (
        getBuiltinMarketplaceSnapshot('claude-plugins-official')!.manifest
          .plugins as unknown[]
      ).length,
    ).toBe(310)
  })
})
