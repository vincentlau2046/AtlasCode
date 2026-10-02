/**
 * cli/debugLines — headless 基线 lifecycle debug 行构造（#240 cli-debug P3
 * 裁定：实现最小 debug 面）。
 *
 * 背景：debug 机制 0.1.7 已落（cli/debugSink：--debug / --debug-to-stderr /
 * --debug-file 真消费 + runHeadless init/flush 接线，N9-debug 收口），但
 * cli 域 8 个 logForDebugging 消费点全在稀有路径（control_request /
 * permission prompt / MCP 写 / 孤儿响应——与旧仓 print.ts 17 处稀有路径点
 * 同形保真）→ 常路径（`-p "hi"` 简单回合）零输出，--debug 面常路径空心。
 * 本模块 = 基线 lifecycle 面的纯函数行构造（无 fs / 无 React / 无引擎行为，
 * 可单测；调用点在 print.ts runHeadless，经 debugSink logForDebugging
 * 发射，未启用零行为变更——sink no-op 早退）。
 *
 * 裁定登记：
 *  - 本模块是产品级最小面（任务 #240「实现或删 flag」的**实现**选项），
 *    非旧仓保真复原（旧仓自身常路径即零输出，复原无源可保）；
 *  - C-4 logging port 三面统一（engine/shared 域 no-op 占位 → port 注入，
 *    morning-decisions 2026-10-02 项 3）另立 arch 决策，不并入本面；
 *  - 行格式 `[headless] ...` 前缀沿用 cli 域既有 logForDebugging 调用点
 *    约定（print.ts 既有 8 点同前缀）。
 */
import { type AgentLoopResult } from 'src/engine'

/** 从 turn 消息序列抽 assistant 侧 tool_use 块名（有序去重）。 */
export function toolNamesFromMessages(
  messages: AgentLoopResult['messages'],
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of messages) {
    if (m.role !== 'assistant') continue
    const content = (
      m as unknown as { message?: { content?: unknown[] } }
    ).message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      const b = block as { type?: unknown; name?: unknown }
      if (
        b &&
        b.type === 'tool_use' &&
        typeof b.name === 'string' &&
        !seen.has(b.name)
      ) {
        seen.add(b.name)
        out.push(b.name)
      }
    }
  }
  return out
}

/** ① session 启动行（runHeadless sessionId 捕获后发射）。 */
export function headlessStartLine(
  sessionId: string,
  opts: { resume?: string | boolean; continue?: boolean; model?: string },
): string {
  const parts = [`[headless] session start: id=${sessionId}`]
  if (opts.resume) parts.push(`resume=${String(opts.resume)}`)
  if (opts.continue) parts.push('continue=1')
  if (opts.model) parts.push(`model=${opts.model}`)
  return parts.join(' ')
}

/** ② 模型解析行（role/roleModel 单一计算点后发射）。 */
export function modelLine(role: string, model: string | undefined): string {
  return `[headless] model resolved: role=${role} model=${
    model ?? '(pool default)'
  }`
}

/** ③ MCP 连接汇总行（connect allSettled 后发射）。 */
export function mcpConnectLine(ok: number, failed: number): string {
  return `[headless] mcp: connected=${String(ok)} failed=${String(failed)}`
}

/** ④a 回合开始行（runTurn 入口；messageCount = 入参消息序列长）。 */
export function turnStartLine(n: number, messageCount: number): string {
  return `[headless] turn ${String(n)} start (messages=${String(messageCount)})`
}

/**
 * ④b 回合结束行（runTurn 出口；工具面 = 该 turn 内 assistant 消息的
 * tool_use 块名有序去重，前 10 件 + `+N` 尾标防行爆）。
 */
export function turnEndLine(
  n: number,
  r: Pick<
    AgentLoopResult,
    'turns' | 'terminated' | 'emptyTerminated' | 'messages'
  >,
): string {
  const tools = toolNamesFromMessages(r.messages)
  const toolsPart =
    tools.length > 0
      ? ` tools=[${tools
          .slice(0, 10)
          .join(', ')}${tools.length > 10 ? `, +${String(tools.length - 10)}` : ''}]`
      : ''
  const empty = r.emptyTerminated ? ' empty=true' : ''
  return `[headless] turn ${String(n)} end: rounds=${String(
    r.turns,
  )} terminated=${String(r.terminated)}${empty}${toolsPart}`
}

/** ⑤ 运行错误行（runHeadless catch 支；Error 取 stack 留全栈证据）。 */
export function headlessErrorLine(error: unknown): string {
  const msg =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  return `[headless] run error: ${msg}`
}
