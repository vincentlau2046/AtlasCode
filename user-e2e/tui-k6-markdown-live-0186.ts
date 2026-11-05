/**
 * 0.1.86 补环探针 1（Atlas-review F1）：Markdown 真渲染活探针（工单 §1-G ⑤
 * 枚举四面之一，gate 086 缺席 → 对 npm 发布物 0.1.86 补跑）。
 *
 * 被测缺陷 = K6-13 bold 续行重发（wrap 层）：长 bold 文本在窄终端换行后，
 * 修前面 = Bun wrap 实现续行只重发 italic 丢 bold（单元 RED 同形
 * wave0186-markdown-render「RED：样式区内每个续行都重发 bold（1m）」）；
 * 修后 = 每个续行都重发 \x1b[1m（pyte bold 属性逐行在场）。
 *
 * 激励：ATLAS_E2E_COLS=40 窄 PTY + IFF 一轮 echo（模型回显带 **bold** 长行，
 * 高顺从 echo 措辞；采样方差面 = 回显缺 ** 标记则该轮判 env-face 可重试一次）。
 * 断言：响应区含 marker 的 bold 文本 ≥2 显示行，且每个含 bold 文本的续行
 * bold 字符数 > 0（续行 bold 重发直证）；对照行（非样式行）不计。
 *
 *   ATLAS_E2E_K6MD_CMD="node <npmcli> --dangerously-skip-permissions" \
 *     ATLAS_E2E_K6MD_OUT=<dir> ATLAS_E2E_COLS=40 \
 *     bun run user-e2e/tui-k6-markdown-live-0186.ts
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const CLI_CMD =
  process.env.ATLAS_E2E_K6MD_CMD ??
  'node /home/vince/.claude/jobs/09264df0/tmp/prodlane-086/dl/package/dist/cli.js --dangerously-skip-permissions'
const OUT = process.env.ATLAS_E2E_K6MD_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/supplement-086/k6md'
const REPLAY = '/home/vince/.claude/jobs/09264df0/tmp/supplement-086/replay-wx.py'
const COLS = Number(process.env.ATLAS_E2E_COLS ?? '40')
const ROWS = Number(process.env.ATLAS_E2E_ROWS ?? '50')
const MODEL = process.env.MD_MODEL ?? 'Qwen38-27B-VL'

// bold CJK 长行：40 列终端必换行（CJK 每字 2 列，全文 ~44 字 = 88 列 → ≥3 行）
const BOLD_TEXT = '粗体开头标记后续填充文字持续延伸跨越终端宽度多行换行续行样式保真直证结尾'
const ECHO_PROMPT = `Reply with exactly one line and nothing else: **${BOLD_TEXT}**`

type Probe = { id: string, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string) =>
  probes.push({ id, ok, detail })

function seedHome(home: string): void {
  mkdirSync(join(home, '.atlas'), { recursive: true })
  const modelRef = { model: `iff/${MODEL}` }
  writeFileSync(
    join(home, '.atlas', 'settings.json'),
    JSON.stringify(
      {
        model: MODEL,
        modelRoles: {
          small: { models: [modelRef], provider: 'iff' },
          fast: { models: [modelRef], provider: 'iff' },
          premium: { models: [modelRef], provider: 'iff' },
        },
        defaultRole: 'small',
        availableModels: ['small', 'premium', 'fast'],
        skipDangerousModePermissionPrompt: true,
        env: { DISABLE_AUTOUPDATER: '1' },
        providers: {
          iff: {
            baseURL: 'http://127.0.0.1:8999/v1',
            apiKey: 'sk-iff-local',
            api: 'openai-completions',
            defaultContextWindow: 256000,
            defaultMaxTokens: 32000,
            models: [{ id: MODEL, name: MODEL, contextWindow: 256000, maxTokens: 32000 }],
          },
        },
      },
      null,
      2,
    ),
  )
}

async function toRepl(pty: InstanceType<typeof GenericPty>): Promise<boolean> {
  let styleDone = false
  let enterDone = false
  let yoloDone = false
  for (let round = 0; round < 24; round++) {
    const t = pty.sinceText()
    if (t.includes('/help 查看全部命令') || t.includes('/sessionlist 会话列表')) return true
    if (!styleDone && (t.includes('Choose the text style') || t.includes('text style that looks best'))) {
      styleDone = true
      await sleep(400)
      pty.sendRaw('1')
      await sleep(300)
      pty.sendRaw('\r')
      await sleep(1_500)
      continue
    }
    if (!enterDone && t.includes('Press') && t.includes('to continue')) {
      enterDone = true
      await sleep(400)
      pty.sendRaw('\r')
      await sleep(1_500)
      continue
    }
    if (!yoloDone && t.includes('Yes, I accept')) {
      yoloDone = true
      await sleep(400)
      pty.sendRaw('\x1b[B')
      await sleep(400)
      pty.sendRaw('\r')
      await sleep(1_500)
      continue
    }
    await sleep(2_500)
  }
  return (
    await pty.waitAnySince(['/help 查看全部命令', '/sessionlist 会话列表'], 60_000)
  ).ok
}

const stage = (logPath: string, tag: string): string => {
  const f = join(OUT, `${tag}.ptylog`)
  copyFileSync(logPath, f)
  return f
}

function replay(file: string, mode: string): string {
  const p = Bun.spawnSync(['python3', '-I', REPLAY, file, String(COLS), String(ROWS), mode], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return new TextDecoder().decode(p.stdout)
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  const home = join(OUT, 'home')
  seedHome(home)
  const logPath = join(OUT, 'pty.log')

  let pty: InstanceType<typeof GenericPty> | null = null
  try {
    pty = await GenericPty.start({
      logPath,
      workspace: OUT,
      cmd: CLI_CMD,
      home,
      unset: ['CLAUDECODE'],
    })
    const ready = await toRepl(pty)
    push('P-M0-tui', ready, ready ? `TUI REPL 就绪（${COLS}×${ROWS}）` : 'TUI 未就绪（见 pty.log）')
    if (!ready) throw new Error('TUI not ready')
    await sleep(1_000)

    // 一轮 echo：模型回显 bold 长行 → transcript Markdown 渲染
    pty.send(ECHO_PROMPT)
    await pty.settleBytes(4_000, 60_000)
    // 等模型轮完成（spinner 面消失 + marker 在屏）
    let responded = false
    for (let i = 0; i < 40; i++) {
      await sleep(2_000)
      const snap = replay(stage(logPath, `md-wait-${i}`), `scan:${BOLD_TEXT.slice(0, 6)}`)
      if (snap.includes(BOLD_TEXT.slice(0, 6))) {
        // 再 settle 一轮防尾帧
        await sleep(3_000)
        responded = true
        break
      }
    }
    const fFinal = stage(logPath, 'md-final')
    const full = replay(fFinal, 'full')
    const echoOk = full.includes(BOLD_TEXT.slice(0, 8))
    push('P-M1-echo', responded && echoOk,
      `echo 轮完成且回显在场=${responded && echoOk}（模型采样方差面：回显缺 ** 标记时判 env-face，可重试）`)
    if (!echoOk) throw new Error('echo round did not render marker')

    // bold 续行重发断言：首行锚（排除含 **/Thinking 的非渲染行）+ 尾锚取续行
    const scanHead = replay(fFinal, `boldscan:${BOLD_TEXT.slice(0, 4)}`)
    const scanTail = replay(fFinal, `boldscan:${BOLD_TEXT.slice(-4)}`)
    writeFileSync(join(OUT, 'boldscan.txt'), `${scanHead}\n---tail---\n${scanTail}`)
    const parse = (s: string) =>
      s.split('\n').filter((l) => l.includes('|bold='))
    // 首行：助手渲染行（用户输入/思考行含裸 ** 或 Thinking，排除）
    const headRows = parse(scanHead).filter((l) => !l.includes('**') && !l.includes('Thinking'))
    // 续行：尾锚（唯一出现于响应区）
    const tailRows = parse(scanTail)
    const rowBold = (l: string): number => Number(l.match(/\|bold=(\d+)\/(\d+)\|/)?.[1] ?? -1)
    const headOk = headRows.length >= 1 && headRows.every((l) => rowBold(l) > 0)
    const tailOk = tailRows.length >= 1 && tailRows.every((l) => rowBold(l) > 0)
    const okBold = headOk && tailOk
    push('P-M2-bold-continuation', okBold,
      `K6-13 bold 续行重发：首行 ${headRows.length} 行 bold 全在场=${headOk}（${headRows[0]?.trim().slice(0, 60)}），续行（尾锚）${tailRows.length} 行 bold 全在场=${tailOk}（${tailRows[0]?.trim().slice(0, 60)}）${okBold ? ' → GREEN（修前 RED 形态=续行只重发 italic 丢 bold）' : ' → RED'}`)
  } catch (e) {
    push('P-M0-fatal', false, `fatal: ${(e as Error).message}`)
  } finally {
    pty?.kill()
  }

  const fails = probes.filter((p) => p.ok === false).length
  const result = { probe: 'tui-k6-markdown-live-0186', fails, total: probes.length, probes }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'probes.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  process.exit(fails > 0 ? 1 : 0)
}

void main()
