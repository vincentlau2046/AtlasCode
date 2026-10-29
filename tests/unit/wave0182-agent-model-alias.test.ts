/**
 * 0.1.82 K3-B2 判别固化（test-only 关账）：agent 定义 `model` 面——
 * 上游 300「Agent hook 忽略其 model（别名解析/subagent 不覆盖/不可用
 * 回退调用方）」的本地等价语义已在场，本文件锁 de-ant 判别面。
 *
 * 判别结论（零码关账，行为已在场）：
 *  - **agent 定义 model 已消费**：resolveRole 链 = input.model >
 *    agentDef.model > parentRole（runAgent.ts；engine-agent-tool.test.ts
 *    ③④ 已锁「input override 覆盖定义 / 定义覆盖父 / 无定义回落父」）；
 *  - **别名解析通用化**：parseModel（loadAgentsDir.ts）别名表 =
 *    MODEL_ROLES 单一事实源（premium/fast/small），非字面别名清单；
 *  - **不可用回退调用方**：非法/空/inherit → undefined → 继承 parentRole
 *    （engine-agent-registry.test.ts ⑤⑥⑦ 已锁）。
 *
 * 本文件补锁的 de-ant 面（0.1.78 清零横切）：
 *  ① 通用性——每个 MODEL_ROLES 成员都经 parseAgentFromMarkdown 透传
 *     （别名表跟 role 集走，不随个案硬编码）；
 *  ② 零一方字面——上游别名（haiku/opus/sonnet/claude-*）在本仓**不是**
 *     合法别名（→ undefined 继承调用方），别名表无一方模型字面。
 */
import { describe, test, expect } from 'bun:test'
import { parseAgentFromMarkdown } from '../../src/engine/tools/agent/loadAgentsDir'
import { MODEL_ROLES } from '../../src/modelprovider'
import type { InjectedAgentFile } from '../../src/engine/tools/agent/loadAgentsDir'

function inj(frontmatter: Record<string, unknown>): InjectedAgentFile {
  return {
    frontmatter,
    content: 'system prompt body',
    source: 'user',
  }
}

describe('K3-B2 agent 定义 model 别名解析（de-ant 判别固化）', () => {
  test('① 通用性：全部 MODEL_ROLES 成员透传（别名表 = role 集单一事实源）', () => {
    expect(MODEL_ROLES.length).toBeGreaterThan(0)
    for (const role of MODEL_ROLES) {
      const a = parseAgentFromMarkdown(
        inj({ name: 'a', description: 'd', model: role }),
      )!
      expect(a.model, `model:${role} 应透传`).toBe(role)
    }
  })

  test('② de-ant：一方模型字面不是合法别名（→ undefined 继承调用方）', () => {
    // 上游 300 的「alias haiku 解析」在本仓 = 通用 role 别名表；
    // 一方字面不进别名表（0.1.78 de-ant 清零横切裁定）。
    for (const literal of ['haiku', 'opus', 'sonnet', 'claude-3-5-sonnet']) {
      const a = parseAgentFromMarkdown(
        inj({ name: 'a', description: 'd', model: literal }),
      )!
      expect(a.model, `一方字面 ${literal} 不得被接受为别名`).toBeUndefined()
    }
  })

  test('③ 恒等锚：大小写归一 + inherit/空串 → undefined（既有语义不回归）', () => {
    const upper = parseAgentFromMarkdown(
      inj({ name: 'a', description: 'd', model: 'Premium' }),
    )!
    expect(upper.model).toBe('premium')
    const empty = parseAgentFromMarkdown(
      inj({ name: 'a', description: 'd', model: '' }),
    )!
    expect(empty.model).toBeUndefined()
  })
})
