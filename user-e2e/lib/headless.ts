/**
 * user-e2e headless 驱动（方案 §4 控制面）：
 * `bun run src/atlascode/cli.ts -p --output-format stream-json --verbose`
 * 管道 stdin 一发 prompt；解析 stream-json 事件；`--resume <session_id>` 做同 session 多轮。
 * 与 PTY 面同 case 双跑 → 结果差异即分层定位信号（方案 §7）。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

export interface HOut {
  ok: boolean
  timedOut: boolean
  exitCode: number | null
  result: any | null
  sessionId: string | null
  assistantText: string
  toolUses: string[]
  events: any[]
  ms: number
  stderrTail: string
  /** 200 但 0 内容（空 chat 响应）信号——IFF 监控 `0/0` 形态的引擎侧对应面 */
  zeroContent: boolean
}

export interface HOpts {
  repoRoot: string
  workspace: string
  sandboxHome: string
  prompt: string
  resume?: string
  timeoutMs?: number
  extraArgs?: string[]
}

export function headlessRound(o: HOpts): Promise<HOut> {
  const timeoutMs = o.timeoutMs ?? 600_000
  // 绝对脚本路径：cwd = case 工作区（项目隔离），相对路径会在非 repo cwd 下
  // 「文件不存在」秒退（2026-10-01 首轮 gate 探针 1ms 0 内容形态的根因）
  const args = [
    'run',
    join(o.repoRoot, 'src/atlascode/cli.ts'),
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    ...(o.resume ? ['--resume', o.resume] : []),
    ...(o.extraArgs ?? []),
  ]
  const child: ChildProcess = spawn('bun', args, {
    cwd: o.workspace,
    env: { ...process.env, HOME: o.sandboxHome },
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let out = ''
  let err = ''
  child.stdout?.on('data', (d: Buffer) => (out += d.toString()))
  child.stderr?.on('data', (d: Buffer) => (err += d.toString()))
  child.stdin?.write(o.prompt)
  child.stdin?.end()

  const t0 = Date.now()
  return new Promise<HOut>(resolve => {
    let settled = false
    const finish = (timedOut: boolean): void => {
      if (settled) return
      settled = true
      if (!timedOut) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          /* already gone */
        }
      }
      const events: any[] = []
      for (const line of out.split('\n')) {
        const s = line.trim()
        if (!s.startsWith('{')) continue
        try {
          events.push(JSON.parse(s))
        } catch {
          /* 非 JSON 行（如 [AtlasCode] main() starting...）跳过 */
        }
      }
      const result = [...events].reverse().find(e => e?.type === 'result') ?? null
      const assistantText = events
        .filter(e => e?.type === 'assistant')
        .map(e =>
          (e.message?.content ?? [])
            .filter((c: any) => c?.type === 'text')
            .map((c: any) => c.text ?? '')
            .join('\n'),
        )
        .join('\n')
      const toolUses = events
        .filter(e => e?.type === 'assistant')
        .flatMap(e =>
          (e.message?.content ?? []).filter((c: any) => c?.type === 'tool_use'),
        )
        .map((c: any) => c.name ?? '?')
      const sessionId =
        result?.session_id ??
        events.find(e => e?.type === 'system')?.session_id ??
        null
      const zeroContent =
        assistantText.trim().length === 0 &&
        (result?.is_error === true || (result?.result ?? '').trim().length === 0)
      resolve({
        ok: Boolean(result && !result.is_error && assistantText.trim().length > 0),
        timedOut,
        exitCode: child.exitCode,
        result,
        sessionId,
        assistantText,
        toolUses,
        events,
        ms: Date.now() - t0,
        stderrTail: err.slice(-2000),
        zeroContent,
      })
    }
    child.on('exit', () => finish(false))
    setTimeout(() => finish(true), timeoutMs)
  })
}
