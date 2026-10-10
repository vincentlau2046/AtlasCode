/**
 * FX-37（0.1.48 A-① 安全，验证型 / live 已绿 / 回归断言）：
 * `permissions.deny` 不覆写 hook `permissionDecision:"ask"`（不变量：deny 优先）。
 *
 * 双车道不变量（工单 §1.2，均 live 已绿，本项 = 回归断言锁不变量，零落码）：
 *   - engine 车道：`mergeHookPermission('ask', {allowed:false})` 原样返回门 deny
 *     —— **已被 `tests/unit/engine-hooks.test.ts` ⑩（L246 `('ask', denyRule) →
 *     denyRule`）锁定**，本文件不重复。
 *   - TUI 车道：`hasPermissionsToUseToolInner` step 1a（`getDenyRuleForTool` 命中
 *     即拒）**先于** hook/classifier 步（L800/L503）→ 规则序天然保 deny 优先。
 *     本文件锁 TUI 车道的 step 序不变量（step 1a 谓词 + step 1a/1b 顺序）。
 *
 * 分层纪律：`getDenyRuleForTool` = 导出纯函数（无网络/无 LLM/无渲染）→ unit 层。
 * 结构锁读仓内静态源（grep step 序），无副作用。
 * 完整「hook 不可达」端到端路径由 e2e §3 权限 gate 重跑（0.1.36/0.1.42 区）覆盖。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { getDenyRuleForTool } from '../../src/tui/utils/permissions/permissions'

/** 最小 ToolPermissionContext（仅 getDenyRules 消费的 alwaysDenyRules 面）。 */
function tpc(denyRules: Record<string, string[]>): never {
  return { alwaysDenyRules: denyRules } as never
}

describe('FX-37 ② TUI 车道 step 序锁（deny 规则 → step 1a 短路）', () => {
  test('② deny 规则在场 → step 1a 谓词命中（whole-tool deny 短路于 hook/classifier 步前）', () => {
    // whole-tool deny 规则（字符串 = 裸工具名，无 (...) 内容 = 命中整工具）
    const rule = getDenyRuleForTool(tpc({ session: ['Bash'] }), {
      name: 'Bash',
    } as never)
    expect(rule).not.toBeNull()
    expect(rule!.ruleBehavior).toBe('deny')
    expect(rule!.ruleValue.toolName).toBe('Bash')
  })

  test('②b deny 规则缺席 → step 1a 不短路（谓词 null，流转到后续 hook/classifier 步）', () => {
    expect(
      getDenyRuleForTool(tpc({}), { name: 'Bash' } as never),
    ).toBeNull()
  })

  test('②c 结构锁：hasPermissionsToUseToolInner 内 deny(step 1a) 谓词先于 ask(step 1b)', () => {
    const src = readFileSync(
      new URL(
        '../../src/tui/utils/permissions/permissions.ts',
        import.meta.url,
      ),
      'utf8',
    )
    const start = src.indexOf('async function hasPermissionsToUseToolInner(')
    expect(start).toBeGreaterThanOrEqual(0)
    const body = src.slice(start, start + 4000) // step 1a/1b 区段（稳定）
    const denyAt = body.indexOf('getDenyRuleForTool(')
    const askAt = body.indexOf('getAskRuleForTool(')
    expect(denyAt).toBeGreaterThanOrEqual(0)
    expect(askAt).toBeGreaterThanOrEqual(0)
    // 不变量：deny 规则检查（1a）必须先于 ask 规则检查（1b）——规则序保 deny 优先
    expect(denyAt, 'step 1a（deny）须先于 step 1b（ask）').toBeLessThan(askAt)
  })
})
