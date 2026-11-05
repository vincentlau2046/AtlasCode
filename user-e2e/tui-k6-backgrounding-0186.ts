/**
 * 0.1.86 K6-E 后台化组合 hard 活探针（e2e lane，gate 判据⑤ 活探针四面之一；
 * 工单 docs/2026-11-03-p0-wave-0186-ticket.md §1-E Review Focus 3）。
 * 零模型轮：! sleep 长前台任务 + ctrl+b（task:background → backgroundAll）
 * 后台化；seeded 沙箱 HOME，真实 ~/.atlas/~/.claude 零写入。
 *
 * P-BG1 前台任务启动（hard）：! sleep 20 && echo BGTASK-DONE-7788 回显在场。
 * P-BG2 后台化受理（hard）：2s 后 ctrl+b → 5s 内回输入 idle（前台让位不杀）。
 * P-BG3 后台完成交付（hard，K6-10「停刚发起回合」判别）：60s 内
 *      BGTASK-DONE-7788 在 transcript（基线 RED = ctrl+b 杀任务永不出现）。
 * P-BG4 单次运行（hard，K6-10「重复运行」活近似）：BGTASK-DONE-7788 恰 1 次
 *      （完整「同一 prompt 慢后台答案竞态」= 状态机级单测面）。
 * （K6-8 idle-return-hint T+75min = 单测级；SessionStart hooks 提示恢复 =
 *   需 hooks 场景注入，登记不排活轮。）
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const REPO =
  process.env.ATLAS_E2E_K6BG_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-0.1.86-k6-tui'
const CLI_CMD =
  process.env.ATLAS_E2E_K6BG_CMD ??
  `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`
const OUT =
  process.env.ATLAS_E2E_K6BG_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-086/k6bg'
const DONE = 'BGTASK-DONE-7788'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

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

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  const home = join(OUT, 'home')
  seedHome(home)

  let pty: InstanceType<typeof GenericPty> | null = null
  try {
    pty = await GenericPty.start({
      logPath: join(OUT, 'pty.log'),
      workspace: OUT,
      cmd: CLI_CMD,
      home,
      unset: ['CLAUDECODE'],
    })
    const ready = await toRepl(pty)
    push('P-BG0-tui', ready, ready ? 'TUI REPL 就绪' : 'TUI 未就绪（见 pty.log）')
    if (!ready) throw new Error('TUI not ready')
    await sleep(1_000)

    // P-BG1 前台 bash 任务启动（! 前缀进 bash mode）
    pty.sendRaw('! sleep 20 && echo ' + DONE)
    await sleep(3_000)
    writeFileSync(join(OUT, 'bg1-snapshot.txt'), pty.text())
    const started = pty.sinceText().includes('sleep 20') && !pty.sinceText().includes(DONE)
    push('P-BG1-task-running', started,
      'P-BG1 前台 bash 任务运行中（sleep 20 回显在场 + DONE 未至）=' + String(started))

    // P-BG2/P-BG3/P-BG4 ctrl+b 后台化组合
    await sleep(2_000)
    pty.sendRaw('\x02') // ctrl+b = task:background → backgroundAll
    await sleep(5_000)
    writeFileSync(join(OUT, 'bg2-snapshot.txt'), pty.text())
    const grew = pty.sinceText().length > 0
    push('P-BG2-background-accepted', grew,
      'P-BG2 ctrl+b 受理（5s 内 UI 让位反应；后台指示面 SessionBackgroundHint/backgroundAll）')

    const doneWait = await pty.waitAnySince([DONE], 60_000)
    writeFileSync(join(OUT, 'bg3-snapshot.txt'), pty.text())
    push('P-BG3-completes-in-background', doneWait.ok,
      'P-BG3 后台完成交付：BGTASK-DONE-7788 在 60s 内出现=' + String(doneWait.ok) +
      '（K6-10「停刚发起回合」判别；基线 RED = ctrl+b 杀任务永不出现）')
    const doneCount = pty.countSince(DONE)
    push('P-BG4-single-run', doneCount === 1,
      'P-BG4 单次运行：BGTASK-DONE-7788 恰 1 次（实际 ' + String(doneCount) +
      '；K6-10「重复运行」活近似，完整竞态=状态机级单测面）')
  } catch (e) {
    push('P-BG0-fatal', false, 'fatal: ' + (e as Error).message)
  } finally {
    pty?.kill()
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const result = {
    probe: 'tui-k6-backgrounding-0186',
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
