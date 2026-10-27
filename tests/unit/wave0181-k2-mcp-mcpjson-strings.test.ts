/**
 * 0.1.81 V3-2 K2 MCP 面 — #11 判别单测：enabled/disabledMcpjsonServers
 * 纯字符串宽容（工单 `docs/2026-10-25-p0-wave-0181-ticket.md` item 11）。
 *
 * 工单缺口：两 schema（tui/utils/settings/types.ts + engine/config/types.ts
 * 双胞胎，各 2 键）均为 `z.array(z.string())` —— 用户手写 settings.json 把
 * `enabledMcpjsonServers` 写成纯字符串（单 server 常见笔误）时整段解析被拒
 * （连带其余配置全部失效）。改法 = 宽容降级：union string|array + transform
 * string → [string]（归一不拒配置）；非 string 标量（number 等）仍拒
 * （fail-closed 不放宽到 any）。
 *
 * 判别（修前红 → 修后绿）：
 *  - 纯字符串 'srv' → 解析为 ['srv']（修前 z.array 拒 → 红）
 *  - 数组 ['a','b'] 恒等（既有合法面零回归）
 *  - 缺省 undefined 仍 optional
 *  - 非法标量 42 仍拒（宽容仅限 string，不放宽到 any）
 */
import { describe, expect, test } from 'bun:test'

const TUI_SPEC = '../../src/tui/utils/settings/types.js'
const ENGINE_SPEC = '../../src/engine/config/types.js'

describe.each([
  ['tui', TUI_SPEC],
  ['engine', ENGINE_SPEC],
])('K2 #11：enabled/disabledMcpjsonServers 纯字符串宽容（%s 双胞胎）', (_lane, spec) => {
  test("纯字符串 'srv' → 归一 ['srv'] 不拒整段（修前红）", async () => {
    const { SettingsSchema } = (await import(spec)) as {
      SettingsSchema: () => { parse: (v: unknown) => Record<string, unknown> }
    }
    const parsed = SettingsSchema().parse({
      enabledMcpjsonServers: 'srv',
      disabledMcpjsonServers: 'blocked',
    })
    expect(parsed.enabledMcpjsonServers).toEqual(['srv'])
    expect(parsed.disabledMcpjsonServers).toEqual(['blocked'])
  })

  test('数组恒等 + 缺省 optional + 非法标量（42）仍拒', async () => {
    const { SettingsSchema } = (await import(spec)) as {
      SettingsSchema: () => {
        parse: (v: unknown) => Record<string, unknown>
        safeParse: (v: unknown) => { success: boolean }
      }
    }
    expect(
      SettingsSchema().parse({ enabledMcpjsonServers: ['a', 'b'] })
        .enabledMcpjsonServers,
    ).toEqual(['a', 'b'])
    expect(SettingsSchema().parse({}).enabledMcpjsonServers).toBeUndefined()
    // 宽容仅限 string 标量：number 仍拒（不放宽到 any）
    expect(
      SettingsSchema().safeParse({ enabledMcpjsonServers: 42 }).success,
    ).toBe(false)
  })
})
