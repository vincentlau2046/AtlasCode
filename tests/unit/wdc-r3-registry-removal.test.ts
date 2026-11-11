import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 0.1.95 W-D-C 段 R3 判别格（lock-face docs/2026-11-11-wdc-r3-lockface.md
 * §5 预注册，f4 批复 2026-11-11）：
 *
 *   ① 符号零命中：src/ 全仓 `agentNameRegistry` 字面零命中（字面级，含
 *     注释）——registry 是 AppState 字段非模块 specifier，字段符号字面
 *     零命中为准（f4 批复注记：零命中方向 fail-safe，回声假阳只误报红
 *     不假绿）。修前 src 命中面 = AppStateStore 字段+init、main.tsx
 *     init、SendMessageTool resolveAgentId 首查、useTypeahead 迭代、
 *     useSwarmBanner 反查、CoordinatorAgentStatus selector+useMemo、
 *     engine sendMessageTool 5 处注释（红）。
 *   ② resolveAgentId 兜底链形锚：TUI 组合根 resolveAgentId 体 = toAgentId
 *     直查（原 appState 名注册表首查随死态裁除恒 undefined），不触
 *     appState 注册表读面。
 *   ③ 裁除定性登记：4 活读面空态即现行为（零行为变更）——由 ② 形锚 +
 *     wdb-c2 C-2 行为格（⑥⑦ 名路由 running/stopped 支）回归承载。
 */

const SRC_ROOT = join(import.meta.dir, '..', '..', 'src')

function walkTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walkTsFiles(p))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p)
  }
  return out
}

describe('W-D-C 段 R3 agent 名注册表死态裁除判别格', () => {
  test('① src 全仓 agentNameRegistry 字面零命中（含注释）', () => {
    const hits = walkTsFiles(SRC_ROOT).filter((f) =>
      readFileSync(f, 'utf8').includes('agentNameRegistry'),
    )
    expect(hits).toEqual([])
  })

  test('② SendMessageTool resolveAgentId = toAgentId 兜底直查形锚', () => {
    const p = join(
      SRC_ROOT,
      'tui',
      'tools',
      'SendMessageTool',
      'SendMessageTool.ts',
    )
    const src = readFileSync(p, 'utf8')
    // 兜底链在位：toAgentId 直查体（R3 后唯一解析面）
    expect(src).toContain('toAgentId(name)')
    // 原注册表首查读面已裁（appState 名注册表 get 形零在场）
    expect(/appState\.agentName\w*/.test(src)).toBe(false)
    // port 契约面不缩：engine SendMessageNameRouterPort.resolveAgentId 仍在
    const engineSrc = readFileSync(
      join(SRC_ROOT, 'engine', 'tools', 'team', 'sendMessageTool.ts'),
      'utf8',
    )
    expect(engineSrc).toMatch(/resolveAgentId\(name:\s*string,\s*context:\s*unknown\)/)
  })
})
