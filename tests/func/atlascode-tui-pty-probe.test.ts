/**
 * W3-3d（§8.74.4/§8.74.20）：TUI PTY 活链路探针（func 层，真 spawn + 真盘 + 真网关）。
 *
 * 探针链（W3 五件套的新 ground truth，§8.74.4 零行为纪律边界裁定——TUI 活链路
 * 从无 e2e ground truth，本探针 = 整回合验真）：
 *   PTY 起 `bun run src/atlascode/launcher.ts`（IS_DEMO=1 跳过 onboarding，
 *   interactiveHelpers 先例）→ 提示词 1 输入（输入框可达）→ 真 LLM 轮
 *   （REPL → agentLoopDeps → loopEvents → engine queryAgentLoop → modelProvider
 *   → IFF 网关，W3 3b/3c 切换后的单 loop 活链）→ assistant 渲染 → 提示词 2
 *   续轮输入（轮后可再输入）。
 *
 * 断言标定（2026-09-30 人工 `script -qec` 校准 + 会话 transcript 诊断）：
 *   - **spec 分裂裁定（§8.74.20 裁定 3d-4）**：§8.74.4 原 spec 的「tool_use
 *     渲染 + 结果消息」面归 **live gelu 探针**（atlascode-tui-live-gelu.test.ts，
 *     工具回合经同一 engine 活链真证，native=true 首跑绿）；本 PTY 探针专证
 *     **TUI 特化面**（PTY 起 / 输入框可达 / 活链端到端渲染 / 轮后续轮），
 *     用 text-only 提示词（确定性：弱模型「Reply with exactly」指令遵循实测
 *     可靠——首跑 transcript 诊断显示工具提示词下模型复述 system prompt
 *     `<system_warning>` 块不发调用，模型能力非 harness 可断言面，H6）。
 *   - marker 词出现 ≥2 次 = 提示词回显（输入框接受）+ assistant 响应渲染
 *     （LLM 轮端到端完成）；提示词 2 同判 = 续轮可输入。
 *   - 时序（TUI 重上下文实测）：系统提示 + 29 工具 schema 全量 → 单 LLM 轮
 *     60-110s → p1@10s / p2@110s / timeout 320s。
 *
 * 门控（双门，任一不满足 = skip-clean 不红）：
 *   - CI / 非 Linux → skip（沿 e2e PTY hang 先例：`script` PTY 在 CI 挂起，
 *     e2e 层同型裁定的 func 层镜像）
 *   - modelProvider.healthCheck('small') 不可达 → skip（无活 LLM 轮可言；
 *     全部角色池同指 IFF 端点，单角色门控覆盖全角色，settings 实测 2026-09-30）
 *
 * 探针突变判别（§8.74.4，ritual 留痕 §8.74.20）：备份 `src/engine/query/loop.ts`
 * → 去 5 处 `deps.emit?.(...)` 调用点 → `bun test --isolate tests/unit/engine-loop-emit.test.ts`
 * 定向红（emit 消费面 = 本探针 assistant 渲染链唯一数据源，去 emit = 流内零消息
 * 重放 → marker 缺失 → 探针红）→ verbatim restore → 复绿。
 *
 * 人工验真（CI 外，人工 `script -qec` 复验，本文件头即操作单）：
 *   cd <repo> && (sleep 10 && printf 'Reply with exactly the word: pty-live-alpha\n' \
 *     && sleep 100 && printf 'Reply with exactly the word: pty-live-beta\n') \
 *     | IS_DEMO=1 timeout 320 script -qec 'bun run src/atlascode/launcher.ts' /tmp/atlascode-pty.log
 *   验收 = /tmp/atlascode-pty.log（ANSI 剥净后）含两 marker 词各 ≥2 次
 *   （回显 + 响应渲染）。
 */
import { test, expect } from 'bun:test'
import { exec } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getModelProvider } from '../../src/modelprovider'
import { getCoreDependencies } from '../../src/atlascode'

const LOG = join(tmpdir(), `atlascode-pty-probe-${process.pid}.log`)
const REPO_ROOT = join(__dirname, '..', '..')
const BUN = process.execPath // bun test 运行态 = bun 解释器自身

// ── 双门（CI/平台 + 网关可达）──────────────────────────────────────────────
const isCi =
  process.env.CI === 'true' ||
  process.env.CI === '1' ||
  process.platform !== 'linux'

// 门控语义（§8.74.20 裁定）：healthCheck 走 roles lane = 组合根 D18 注册的
// settings-based endpoint source——裸进程（未 compose）池为空恒 false。
// 故 CI/平台门先判（免 compose 成本），过门后再 compose 做 healthCheck 门。
const gatewayUp = isCi
  ? false
  : (async () => {
      getCoreDependencies()
      return await getModelProvider()
        .healthCheck('small')
        .then(h => h.ok)
        .catch(() => false)
    })()

const gate = isCi || !(await gatewayUp)

/** ANSI 剥净（script 捕获含 escape 序列；渲染断言只看可见文本） */
function stripAnsi(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b[=>]/g, '')
    .replace(/\x1b[78]/g, '')
    .replace(/\r/g, '')
}

test(
  `TUI PTY 活链路：输入框可达 + 真 LLM 轮渲染 + 续轮可输入（${
    gate ? (isCi ? 'CI/平台门 skip' : '网关不可达 skip') : 'live'
  }）`,
  async () => {
    if (gate) {
      // skip-clean：门控不满足 = 不跑不红（与 e2e 层 gateway 门控同语义）
      console.log(
        `[pty-probe] skip: ${isCi ? 'CI/平台门' : 'gateway healthCheck fail'}`,
      )
      return
    }
    try {
      rmSync(LOG)
    } catch {
      /* 首跑无文件 */
    }
    // 时序（TUI 重上下文实测）：TUI 启动 ~10s 达 REPL；系统提示 + 29 工具
    // schema 全量 prefill → 单 LLM 轮 60-110s。p1 @10s（启动即输入）→
    // p2 @110s（p1 轮大概率完成后）→ timeout 320s 覆盖双轮 + 余量。
    const cmd =
      `(sleep 10 && printf 'Reply with exactly the word: pty-live-alpha\\n' && ` +
      `sleep 100 && printf 'Reply with exactly the word: pty-live-beta\\n') | ` +
      `IS_DEMO=1 timeout 320 script -qec '${BUN} run src/atlascode/launcher.ts' ${LOG}`
    const { code } = await new Promise<{ code: number }>((resolve) => {
      exec(cmd, { cwd: REPO_ROOT, timeout: 370000, maxBuffer: 8 * 1024 * 1024 }, err => {
        // exit 124 = timeout 杀 TUI（预期，保住日志）；0 = script 自然退出
        resolve({ code: (err && 'code' in err ? (err as { code?: number }).code : 0) ?? 0 })
      })
    })
    expect([0, 124]).toContain(code)
    const log = stripAnsi(readFileSync(LOG, 'utf-8'))

    // ① 输入框可达：提示词 1 被回显（Ink 输入行渲染 = 输入框接受输入的证据）
    const alphaHits = log.match(/pty-live-alpha/g)?.length ?? 0
    expect(alphaHits, '提示词 1 未回显 = 输入框不可达').toBeGreaterThanOrEqual(1)
    // ② 活链端到端：marker ≥2 = 回显 + assistant 响应渲染（LLM 轮完成；
    //    REPL → agentLoopDeps → loopEvents → engine queryAgentLoop →
    //    modelProvider → IFF 网关 → 消息回渲染 全链证毕）
    expect(
      alphaHits,
      `marker 'pty-live-alpha' 应 ≥2（回显+响应），实测 ${alphaHits}`,
    ).toBeGreaterThanOrEqual(2)
    // ③ 续轮可输入：提示词 2 同判（回显 + 响应）
    const betaHits = log.match(/pty-live-beta/g)?.length ?? 0
    expect(
      betaHits,
      `续轮 marker 'pty-live-beta' 应 ≥2（回显+响应），实测 ${betaHits}`,
    ).toBeGreaterThanOrEqual(2)
  },
  400000, // exec 370s + 余量（TUI 重上下文双轮活链，本地跑口径，CI skip）
)
