/**
 * user-e2e 通用 PTY 驱动（对比用）：可启动任意命令（Atlas TUI / claude CLI）。
 * 与 lib/pty.ts（硬编码 Atlas CLI 的 pty-driver.py）不同，本 wrapper 用
 * pty-generic.py，命令 + 追加/剥离 env 全由调用方注入，便于同一 harness 跑多个 TUI。
 *
 * 隔离：HOME 由调用方注入（沙箱），TERM 固定 xterm-256color。
 */
import { spawn, execSync, type ChildProcess } from 'node:child_process'
import { createWriteStream, statSync } from 'node:fs'
import { join } from 'node:path'
import { sleep, countOcc, readWhole, stripAnsi, tailLines } from './util'

export interface GenericPtyOpts {
  logPath: string
  workspace: string
  /** 完整命令（shell 字符串，shlex 拆分） */
  cmd: string
  /** 子进程 HOME（沙箱隔离）；缺省 = 继承 process.env.HOME */
  home?: string
  /** 追加/覆盖子进程 env */
  extraEnv?: Record<string, string>
  /** 从子进程 env 删除的 key（如 CLAUDECODE 等嵌套会话标记） */
  unset?: string[]
  /** REPL 就绪判据（任一子串出现即就绪） */
  readySubs?: string[]
  readyMs?: number
}

export class GenericPty {
  private child: ChildProcess | null = null
  private stderrStream: NodeJS.WritableStream | null = null
  private spawnOffset = 0

  constructor(private opts: GenericPtyOpts) {}

  static async start(opts: GenericPtyOpts): Promise<GenericPty> {
    const p = new GenericPty(opts)
    const driver = join(__dirname, 'pty-generic.py')
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PTY_CMD: opts.cmd,
      TERM: 'xterm-256color',
    }
    if (opts.home) env.HOME = opts.home
    if (opts.extraEnv) {
      for (const [k, v] of Object.entries(opts.extraEnv)) env[k] = v
    }
    if (opts.unset?.length) env.PTY_UNSET = JSON.stringify(opts.unset)
    if (opts.extraEnv) env.PTY_ENV = JSON.stringify(opts.extraEnv)
    p.child = spawn('python3', [driver, opts.logPath, opts.workspace], {
      env,
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    p.stderrStream = createWriteStream(opts.logPath + '.stderr')
    p.child.stderr?.pipe(p.stderrStream)
    p.child.on('exit', () => {
      /* child died */
    })
    p.spawnOffset = p.text().length
    // 就绪：等任一 readySub 出现；若无 readySubs 则等固定 settle
    const readySubs = opts.readySubs ?? []
    if (readySubs.length) {
      const r = await p.waitAnySince(readySubs, opts.readyMs ?? 90_000)
      if (!r.ok && !p.alive()) {
        p.kill()
        throw new Error(`TUI 未就绪（进程退出），见 ${opts.logPath}`)
      }
    } else {
      await sleep(8000)
    }
    return p
  }

  alive(): boolean {
    return this.child != null && this.child.exitCode == null
  }

  text(): string {
    return stripAnsi(readWhole(this.opts.logPath))
  }

  sinceText(): string {
    return this.text().slice(this.spawnOffset)
  }

  count(sub: string): number {
    return countOcc(this.text(), sub)
  }

  countSince(sub: string): number {
    return countOcc(this.sinceText(), sub)
  }

  send(text: string): void {
    this.child?.stdin?.write(text + '\n')
  }

  sendRaw(text: string): void {
    this.child?.stdin?.write(text)
  }

  /** 等多候选子串（spawn 之后新内容），任一出现即返回 */
  async waitAnySince(
    subs: string[],
    timeoutMs: number,
  ): Promise<{ ok: boolean; found: string | null; ms: number }> {
    const t0 = Date.now()
    for (;;) {
      const t = this.sinceText()
      for (const s of subs) {
        if (countOcc(t, s) > 0) return { ok: true, found: s, ms: Date.now() - t0 }
      }
      if (Date.now() - t0 > timeoutMs) return { ok: false, found: null, ms: Date.now() - t0 }
      if (!this.alive()) return { ok: false, found: null, ms: Date.now() - t0 }
      await sleep(700)
    }
  }

  /** 等日志静默 quietMs（命令面 settle：渲染完成、回到输入态） */
  async settle(
    quietMs: number,
    timeoutMs: number,
  ): Promise<{ ok: boolean; ms: number; tail: string }> {
    const t0 = Date.now()
    let lastGrowth = Date.now()
    let lastLen = -1
    for (;;) {
      const t = this.text()
      if (t.length !== lastLen) {
        lastLen = t.length
        lastGrowth = Date.now()
      }
      if (Date.now() - lastGrowth >= quietMs) {
        return { ok: true, ms: Date.now() - t0, tail: tailLines(t, 25) }
      }
      if (Date.now() - t0 > timeoutMs) {
        return { ok: false, ms: Date.now() - t0, tail: tailLines(t, 25) }
      }
      if (!this.alive()) {
        return { ok: false, ms: Date.now() - t0, tail: tailLines(t, 25) }
      }
      await sleep(800)
    }
  }

  /** 日志文件当前字节数（-1 = 文件不存在） */
  logSize(): number {
    try {
      return statSync(this.opts.logPath).size
    } catch {
      return -1
    }
  }

  /** 按日志字节数 settle（spinner 逐帧重绘会持续写 ANSI 字节，即使可见文本长度不变；
   *  回合结束回到 idle 后字节才稳定 → 用字节面判定回合完成，比剥净文本长度可靠） */
  async settleBytes(
    quietMs: number,
    timeoutMs: number,
  ): Promise<{ ok: boolean; ms: number; bytes: number }> {
    const t0 = Date.now()
    let lastGrowth = Date.now()
    let lastSize = -1
    for (;;) {
      const size = this.logSize()
      if (size !== lastSize) {
        lastSize = size
        lastGrowth = Date.now()
      }
      if (Date.now() - lastGrowth >= quietMs) {
        return { ok: true, ms: Date.now() - t0, bytes: size }
      }
      if (Date.now() - t0 > timeoutMs) {
        return { ok: false, ms: Date.now() - t0, bytes: size }
      }
      if (!this.alive()) {
        return { ok: false, ms: Date.now() - t0, bytes: size }
      }
      await sleep(700)
    }
  }

  kill(): void {
    const c = this.child
    this.child = null
    if (!c || c.exitCode != null) return
    try {
      c.kill('SIGTERM')
    } catch {
      /* already dead */
    }
    setTimeout(() => {
      try {
        if (c.exitCode == null) c.kill('SIGKILL')
      } catch {
        /* already dead */
      }
    }, 1500).unref?.()
  }
}
