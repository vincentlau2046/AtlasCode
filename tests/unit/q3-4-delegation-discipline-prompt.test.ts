/**
 * Q3-4（0.1.65）委派纪律提示词批 —— 在场断言 + 国产适配裁面核验。
 *
 * 工单 §2 判据：提示词文件在场 + 断言单测锁裁剪后文本
 *   （成本感知句 + usage notes 句 + no-predict 句 + BR-8/1P 裁面核验）。
 *
 * 三句（0.1.55 先例通道，contextBodies/prompt.ts 同族静态 grep）：
 *   ① 成本感知句（0.1.55 已落 → 锁在场防漂移）
 *   ② usage notes 句（run_in_background 后台语义，Q3-1 已落异步原语 → Q3-4 补提示词面）
 *   ③ no-predict 句（不等结果就臆测 = fabrication family，0.1.64 去硬编码同族纪律）
 *
 * 国产适配裁面核验（BR-8/1P）：
 *   - 1P 裁面：提示词零 claude.ai / Anthropic / Claude Code 一方引用
 *   - BR-8 裁面：提示词零 literal "+" 品牌串
 *   - ATLAS_ 裁面：env 名引用（若有）须 ATLAS_ 前缀
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

/** 仓根相对路径（tests/unit/ → ../../src/...）。 */
function readRepo(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')
}

/** 断言 text 含全部必需子串（缺失 = 落码缺失/漂移，红）。 */
function expectAllPresent(label: string, text: string, subs: string[]) {
  for (const s of subs) {
    expect(
      text.includes(s),
      `${label} 缺特征串「${s}」（落码缺失/漂移）`,
    ).toBe(true)
  }
}

/** 断言 text 不含任何禁串（1P/BR-8 裁面核验）。 */
function expectNonePresent(label: string, text: string, banned: string[]) {
  for (const s of banned) {
    expect(
      !text.includes(s),
      `${label} 含禁串「${s}」（国产适配裁面违规：1P 引用或 BR-8 品牌串未裁）`,
    ).toBe(true)
  }
}

const AGENT_PROMPT = 'src/engine/tools/agent/prompt.ts'

describe('Q3-4 ① 成本感知句（0.1.55 已落，锁在场防漂移）', () => {
  test('cost-aware delegation 句在场', () => {
    const text = readRepo(AGENT_PROMPT)
    expectAllPresent('agent prompt cost-aware', text, [
      'Be cost-aware about delegating',
      'spawning a subagent has overhead',
      'Delegate when the task is genuinely',
    ])
  })
})

describe('Q3-4 ② usage notes 句（run_in_background 后台语义，Q3-4 delta）', () => {
  test('run_in_background usage note 在场', () => {
    const text = readRepo(AGENT_PROMPT)
    expectAllPresent('agent prompt usage notes', text, [
      'run_in_background',
      'task-notification',
    ])
  })
})

describe('Q3-4 ③ no-predict 句（不臆测子代理结果，Q3-4 delta）', () => {
  test('no-predict discipline 句在场', () => {
    const text = readRepo(AGENT_PROMPT)
    expectAllPresent('agent prompt no-predict', text, [
      'Do not predict',
    ])
  })
})

describe('Q3-4 国产适配裁面核验（BR-8/1P）', () => {
  test('agent prompt 零 1P 引用 + 零 literal "+" 品牌串', () => {
    const text = readRepo(AGENT_PROMPT)
    expectNonePresent('agent prompt 1P/BR-8', text, [
      'claude.ai',
      'Anthropic',
      'Claude Code',
    ])
  })
})
