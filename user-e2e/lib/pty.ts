/**
 * user-e2e TUI PTY 驱动（方案 §4）：
 * python3 stdlib pty 驱动（lib/pty-driver.py，替代 util-linux `script`——
 * 实测 script 在 stdin 非 TTY 时不写 typescript 文件），expect 式驱动：
 * 保持 stdin pipe 存活、写输入、尾随日志文件做 marker 等待
 * （非固定 sleep；弱模型单轮 60-110s，固定 sleep 太脆）。
 *
 * 隔离：HOME = 沙箱（方案 §3），IS_DEMO=1 跳 onboarding（interactiveHelpers 先例）。
 * TUI 进程 cwd = 该 case 独立工作区（项目面 .atlas 落工作区内，不污染真实 ~/.atlas）。
 */
import { spawn, execSync, type ChildProcess } from 'node:child_process'
import { statSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { sleep, countOcc, readWhole, stripAnsi, tailLines } from './util'

export interface PtyOpts {
  repoRoot: string
  workspace: string
  sandboxHome: string
  logPath: string
}

export class Pty {
  private child: ChildProcess | null = null
  private stderrStream: NodeJS.WritableStream | null = null
  private ready = false
  /** 本 session 写入起点——就绪判定只看新内容（日志文件跨 session 复用时防旧内容误判） */
  private spawnOffset = 0

  constructor(public opts: PtyOpts) {}

  /** 起 TUI 并等 REPL 就绪（banner + 输入提示符） */
  static async start(opts: PtyOpts, readyMs = 150_000): Promise<Pty> {
    const p = new Pty(opts)
    const driver = join(__dirname, 'pty-driver.py')
    p.child = spawn('python3', [driver, opts.logPath, opts.workspace, opts.repoRoot], {
      env: {
        ...process.env,
        HOME: opts.sandboxHome,
        IS_DEMO: '1',
        TERM: 'xterm-256color',
      },
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    p.stderrStream = createWriteStream(opts.logPath + '.stderr')
    p.child.stderr?.pipe(p.stderrStream)
    p.child.on('exit', () => {
      p.ready = false
    })
    // 日志文件可能被复用（append 模式）：就绪判定只看 spawn 之后新写入的内容
    // （剥净后字符长度偏移，避免字节/字符混淆）
    p.spawnOffset = p.text().length
    // REPL 就绪判据：命令提示行「/help 查看全部命令」（REPL 强信号）。
    // 次判据：输入提示符 ❯ 且文本无预设屏字样（预设屏菜单也含 ❯，需排除）。
    // 兜底：若意外停在模型预设屏（IS_DEMO=1 本应跳过），Enter 确认预填 IFF 预设。
    const t0 = Date.now()
    for (let attempt = 0; ; attempt++) {
      const ok = await p.waitAnySince(['查看全部命令', '❯'], Math.max(readyMs - (Date.now() - t0), 5000))
      if (ok.ok) {
        if (ok.found === '查看全部命令') break
        if (ok.found === '❯' && p.countSince('选择模型提供方预设') === 0) break
      }
      // 超时或停在预设屏
      if (p.countSince('选择模型提供方预设') > 0) {
        p.send('\r')
        const o2 = await p.waitAnySince(['查看全部命令', '❯'], 90_000)
        if (o2.ok && (o2.found === '查看全部命令' || p.countSince('选择模型提供方预设') === 0)) break
        if (!o2.ok) {
          p.kill()
          throw new Error(`TUI 预设屏确认后仍未见 REPL，见 ${opts.logPath}`)
        }
        break
      }
      if (!ok.ok || !p.alive()) {
        p.kill()
        throw new Error(`TUI 未在 ${readyMs}ms 内就绪（未见 REPL），见 ${opts.logPath}`)
      }
      if (attempt > 3) {
        p.kill()
        throw new Error(`TUI 就绪判定循环异常，见 ${opts.logPath}`)
      }
    }
    p.ready = true
    return p
  }

  /** 等多个候选文本（只看 spawn 之后新写入内容），任一出现即返回 */
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
      await sleep(800)
    }
  }

  /** spawn 之后的新内容（剥净）——跨 session 日志复用场景的安全判据面 */
  sinceText(): string {
    return this.text().slice(this.spawnOffset)
  }

  countSince(sub: string): number {
    return countOcc(this.sinceText(), sub)
  }

  send(text: string): void {
    this.child?.stdin?.write(text + '\n')
  }

  /** 原始键入（不附换行）：回显探针 / 单键恢复（q、Esc、Ctrl-U） */
  sendRaw(text: string): void {
    this.child?.stdin?.write(text)
  }

  esc(): void {
    this.child?.stdin?.write('\x1b')
  }

  /** 进程是否存活（与 ready 无关——启动等待期也要能判活） */
  alive(): boolean {
    return this.child != null && this.child.exitCode == null
  }

  /** 全量剥净文本 */
  text(): string {
    return stripAnsi(readWhole(this.opts.logPath))
  }

  count(sub: string): number {
    return countOcc(this.text(), sub)
  }

  /** 等子串出现 ≥ n 次（可选：出现后再静默 quietMs，防流式中途误判） */
  async waitCount(
    sub: string,
    n: number,
    timeoutMs: number,
    quietMs = 0,
  ): Promise<{ ok: boolean; count: number; ms: number; tail: string }> {
    const t0 = Date.now()
    let lastGrowth = Date.now()
    let lastLen = -1
    for (;;) {
      const t = this.text()
      const c = countOcc(t, sub)
      if (t.length !== lastLen) {
        lastLen = t.length
        lastGrowth = Date.now()
      }
      if (c >= n) {
        if (quietMs > 0) {
          // 出现后要求日志静默 quietMs（流式完成面）
          if (Date.now() - lastGrowth >= quietMs) {
            return { ok: true, count: c, ms: Date.now() - t0, tail: tailLines(t, 25) }
          }
        } else {
          return { ok: true, count: c, ms: Date.now() - t0, tail: tailLines(t, 25) }
        }
      }
      if (Date.now() - t0 > timeoutMs) {
        return { ok: false, count: c, ms: Date.now() - t0, tail: tailLines(t, 25) }
      }
      if (!this.alive()) {
        return { ok: false, count: c, ms: Date.now() - t0, tail: tailLines(t, 25) }
      }
      await sleep(800)
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

  logSize(): number {
    try {
      return statSync(this.opts.logPath).size
    } catch {
      return -1
    }
  }

  /** 杀驱动 + TUI 进程树：SIGTERM 给 python 驱动（其 finally 清 TUI 组），
   * 超时补 SIGKILL；最后清扫本 harness 专属的 TUI bun 进程（绝对路径模式，
   * 不误伤用户交互 TUI 的相对路径启动）。 */
  kill(): void {
    const c = this.child
    this.child = null
    this.ready = false
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
    try {
      execSync(
        `pkill -f 'bun run ${this.opts.repoRoot}/src/atlascode/cli\\.ts' || true`,
        { stdio: 'ignore' },
      )
    } catch {
      /* best effort */
    }
  }
}
