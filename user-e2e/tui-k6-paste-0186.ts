/**
 * 0.1.86 K6-F 输入行 hard 活探针 v2（gate 判据⑤；零模型轮）。
 * v2 定因重设计：K6-12 真修面 = 无 2004 终端长粘贴裸 DEL 丢字
 * （normalizeCoalescedInput 提取 + DEL 分支顺序回放；'abc'+'de\x7ff'→'abcdf'）
 * ——原 v1 测的 K6-11 三路径系「修前即真」锚件（登记不修，无 red-green
 * 预期），v1 的 P-P1/P-P2 双面绿、P-P3 双面红与此吻合，降为登记面证据。
 *
 * 探针面：
 *   P-DEL1（hard 判别）：单 chunk 发 'PDEL-A-5151' + DEL DEL + 'OK'
 *     → face：DEL 逐个回删 → 'PDEL-A-51OK'；基线 RED：DEL 吞字/丢段
 *     （'PDEL-A-5151OK' 或丢 OK）。
 *   P-DEL2（hard 判别）：'K6W-9191' + DEL×3 + 'TAIL-3131'
 *     → face：'K6W-9TAIL-3131'；基线 RED 同上族。
 *   P-P1（无回归面）：裸流三标记粘贴不丢（双面预期绿）。
 *   P-P2/P-P3（登记面，hard=false）：K6-11 Shift+Enter / 反斜杠+Enter
 *     三路径锚——修前即真面，红绿皆登记，不冒充判别。
 *
 * 断言层 = pyte 屏面重建（同 tui-k6-vim-0186 v2）。
 *   ATLAS_E2E_K6PASTE_REPO=<worktree> ATLAS_E2E_K6PASTE_OUT=<dir> \
 *     bun run user-e2e/tui-k6-paste-0186.ts
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const REPO =
  process.env.ATLAS_E2E_K6PASTE_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-086-face'
const CLI_CMD =
  process.env.ATLAS_E2E_K6PASTE_CMD ??
  `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`
const OUT =
  process.env.ATLAS_E2E_K6PASTE_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-086/k6paste'
const REPLAY = '/home/vince/.claude/jobs/09264df0/tmp/gate-086/replay-at.py'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, ok, detail, hard })

function seedHome(home: string): void {
  mkdirSync(join(home, '.atlas'), { recursive: true })
  const modelRef = { model: 'iff/Qwen38-27B-VL' }
  writeFileSync(
    join(home, '.atlas', 'settings.json'),
    JSON.stringify(
      {
        model: 'Qwen38-27B-VL',
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
            models: [
              {
                id: 'Qwen38-27B-VL',
                name: 'Qwen38-27B-VL',
                contextWindow: 256000,
                maxTokens: 32000,
              },
            ],
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
    if (t.includes('/help 查看全部命令') || t.includes('/sessionlist 会话列表')) {
      return true
    }
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
    await pty.waitAnySince(
      ['/help 查看全部命令', '/sessionlist 会话列表'],
      60_000,
    )
  ).ok
}

const stage = (logPath: string, tag: string): string => {
  const f = join(OUT, `${tag}.ptylog`)
  copyFileSync(logPath, f)
  return f
}

function replayInputLine(file: string): string {
  const p = Bun.spawnSync(['python3', '-I', REPLAY, file, '999999999'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const out = new TextDecoder().decode(p.stdout)
  const lines = out.split('\n').filter((l) => l.includes('❯'))
  if (lines.length === 0) return `<no-prompt:${out.slice(0, 120)}>`
  const last = lines[lines.length - 1]
  return last.slice(last.indexOf('❯') + 1).replace(/\s+$/, '')
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
    push('P-P0-tui', ready, ready ? 'TUI REPL 就绪' : 'TUI 未就绪（见 pty.log）')
    if (!ready) throw new Error('TUI not ready')
    await sleep(1_000)
    pty.sendRaw('\x15') // INSERT ctrl+u 清行
    await sleep(700)

    // ── P-DEL1 K6-12 单 chunk 文本+DEL×2+文本（hard 判别）─────────────
    pty.sendRaw('PDEL-A-5151\x7f\x7fOK')
    await sleep(1_000)
    const f1 = stage(logPath, 'del1')
    const in1 = replayInputLine(f1).trim()
    const del1Green = in1 === 'PDEL-A-51OK'
    const del1Red = in1 === 'PDEL-A-5151OK' || !in1.includes('OK') || in1.includes('PDEL-A-5151')
    push('P-DEL1-del-replay', del1Green,
      `K6-12 裸 DEL 顺序回放：GREEN=PDEL-A-51OK=${del1Green}（实测 in='${in1}'；基线 RED=DEL 吞/丢=${del1Red}）`)
    pty.sendRaw('\x15')
    await sleep(700)

    // ── P-DEL2 K6-12 DEL×3 跨段（hard 判别）───────────────────────────
    pty.sendRaw('K6W-9191\x7f\x7f\x7fTAIL-3131')
    await sleep(1_000)
    const f2 = stage(logPath, 'del2')
    const in2 = replayInputLine(f2).trim()
    const del2Green = in2 === 'K6W-9TAIL-3131'
    push('P-DEL2-del-replay-x3', del2Green,
      `K6-12 DEL×3 跨段回放：GREEN=K6W-9TAIL-3131=${del2Green}（实测 in='${in2}'）`)
    pty.sendRaw('\x15')
    await sleep(700)

    // ── P-P1 裸流三标记粘贴（无回归面，双面预期绿）────────────────────
    pty.sendRaw('PASTE-A-4111\t\tPASTE-B-4222\tPASTE-C-4333')
    await sleep(1_000)
    const f3 = stage(logPath, 'paste1')
    const in3 = replayInputLine(f3)
    const p1Ok = in3.includes('PASTE-A-4111') && in3.includes('PASTE-B-4222') && in3.includes('PASTE-C-4333')
    push('P-P1-paste-no-loss', p1Ok,
      `裸流粘贴三标记全在=${p1Ok}（实测 in='${in3.trim().slice(0, 80)}'；无回归面）`, true)
    pty.sendRaw('\x15')
    await sleep(700)

    // ── P-P2/P-P3 K6-11 锚（登记面，hard=false）───────────────────────
    pty.sendRaw('ROW-L1-5151\x1b\rROW-L2-5252')
    await sleep(1_000)
    const f4 = stage(logPath, 'shiftenter')
    const in4 = replayInputLine(f4)
    const p2Both = in4.includes('ROW-L1-5151') && in4.includes('ROW-L2-5252')
    push('P-P2-shift-enter-newline', p2Both,
      `K6-11 Shift+Enter 两行同在=${p2Both}（登记面：修前即真锚，不冒充判别）`, false)
    pty.sendRaw('\x15')
    await sleep(700)
    pty.sendRaw('BW-L1-6161\\\rBW-L2-6262')
    await sleep(1_000)
    const f5 = stage(logPath, 'backslash')
    const in5 = replayInputLine(f5)
    const p3Both = in5.includes('BW-L1-6161') && in5.includes('BW-L2-6262')
    push('P-P3-backslash-enter-newline', p3Both,
      `K6-11 反斜杠+Enter 两行同在=${p3Both}（登记面：修前即真锚，不冒充判别）`, false)
  } catch (e) {
    push('P-P0-fatal', false, `fatal: ${(e as Error).message}`)
  } finally {
    pty?.kill()
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const result = {
    probe: 'tui-k6-paste-0186',
    hardFail,
    total: probes.length,
    probes,
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'probes.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  process.exit(hardFail > 0 ? 1 : 0)
}

void main()
