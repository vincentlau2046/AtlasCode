/**
 * 0.1.88 gate ⑤ FAMILY-2 cli-highlight 渲染常径活轮探针（Review Focus 4）。
 *
 * 单轮 TUI：让模型输出 python 代码块 → 断言渲染面出现 truecolor 高亮序列
 * （cli-highlight 经 highlight.js 产出 \x1b[38;2;R;G;B）→ ctrl+o 展开
 * transcript 再断言高亮面仍在（展开渲染路径）。
 * 高亮缺失（catch→null 降级）= RED：FAMILY-2 闭包直证面。
 *
 *   ATLAS_E2E_CLIHL_CMD="node <cli.js> --dangerously-skip-permissions" \
 *     ATLAS_E2E_CLIHL_OUT=<dir> bun run user-e2e/tui-clihl-live-0188.ts
 */
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const CLI_CMD = process.env.ATLAS_E2E_CLIHL_CMD!
const OUT = process.env.ATLAS_E2E_CLIHL_OUT!
const MODEL = process.env.CLIHL_MODEL ?? 'glm-5'
const PROMPT =
  'Reply with a single markdown code block (language python) containing exactly this code and nothing else:\n\n```python\ndef add(a, b):\n    return a + b\n```\n\nFinish your reply with the token CLIHL-DONE on its own line.'

const COLS = 200
const ROWS = 50
const REPLAY = '/home/vince/.claude/jobs/09264df0/tmp/supplement-086/replay-wx.py'

type Probe = { id: string, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string) => probes.push({ id, ok, detail })

function seedHome(home: string): void {
  mkdirSync(join(home, '.atlas'), { recursive: true })
  writeFileSync(
    join(home, '.atlas', 'settings.json'),
    JSON.stringify(
      {
        model: MODEL,
        modelRoles: {
          small: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
          fast: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
          premium: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
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
  writeFileSync(join(home, '.atlas.json'), JSON.stringify({ preferredNotifChannel: 'notifications_disabled' }))
}

function replay(file: string, mode: string): string {
  const p = Bun.spawnSync(['python3', '-I', REPLAY, file, String(COLS), String(ROWS), mode], {
    stdout: 'pipe', stderr: 'pipe',
  })
  return new TextDecoder().decode(p.stdout)
}

async function main(): Promise<void> {
  if (!CLI_CMD || !OUT) throw new Error('need ATLAS_E2E_CLIHL_CMD + ATLAS_E2E_CLIHL_OUT')
  rmSync(join(OUT, 'probes.json'), { force: true })
  const logPath = join(OUT, 'pty.log')
  mkdirSync(OUT, { recursive: true })
  const home = join(OUT, 'home')
  seedHome(home)

  let pty: InstanceType<typeof GenericPty> | null = null
  try {
    mkdirSync(join(OUT, 'ws'), { recursive: true })
    pty = await GenericPty.start({
      logPath,
      workspace: join(OUT, 'ws'),
      cmd: CLI_CMD,
      home,
      unset: ['CLAUDECODE'],
      extraEnv: { COLORTERM: 'truecolor', FORCE_COLOR: '3' },
    })
    let ready = false
    let styleDone = false, enterDone = false, yoloDone = false
    for (let round = 0; round < 30; round++) {
      const t = pty.sinceText()
      if (t.includes('/help 查看全部命令') || t.includes('/sessionlist 会话列表')) { ready = true; break }
      if (!styleDone && (t.includes('Choose the text style') || t.includes('text style that looks best'))) {
        styleDone = true; await sleep(400); pty.sendRaw('1'); await sleep(300); pty.sendRaw('\r'); await sleep(1500); continue
      }
      if (!enterDone && t.includes('Press') && t.includes('to continue')) {
        enterDone = true; await sleep(400); pty.sendRaw('\r'); await sleep(1500); continue
      }
      if (!yoloDone && t.includes('Yes, I accept')) {
        yoloDone = true; await sleep(400); pty.sendRaw('\x1b[B'); await sleep(400); pty.sendRaw('\r'); await sleep(1500); continue
      }
      await sleep(2500)
    }
    push('HL0-tui', ready, ready ? 'TUI REPL 就绪（truecolor env）' : 'TUI 未就绪')
    if (!ready) throw new Error('TUI not ready')
    await sleep(1000)

    pty.send(PROMPT)
    await sleep(1500)
    pty.sendRaw('\r') // 多行 prompt 在 bracketed paste 下内嵌 \n 不提交，补显式 Enter
    await sleep(1500)
    const baseline = readFileSync(logPath, 'utf8').length
    let done = false
    const t0 = Date.now()
    while (Date.now() - t0 < 600000) {
      await sleep(3000)
      const raw = readFileSync(logPath, 'utf8')
      if (raw.indexOf('CLIHL-DONE', baseline) >= 0) {
        await sleep(5000)
        if (readFileSync(logPath, 'utf8').indexOf('CLIHL-DONE', baseline) >= 0) { done = true; break }
      }
    }
    const raw1 = readFileSync(logPath, 'utf8')
    push('HL1-turn-complete', done, `回合完成（marker 'CLIHL-DONE'）=${done}`)

    // 代码块在场（final 屏面）
    const finalScreen = replay(logPath, 'final')
    const codeOnScreen = finalScreen.includes('def add') && finalScreen.includes('return a + b')
    push('HL2-codeblock-rendered', codeOnScreen, `代码块渲染在场（def add + return）=${codeOnScreen}`)

    // truecolor 高亮序列（cli-highlight 活面；blank-face 段 = 回合输出窗）
    const turnWin = raw1.slice(baseline)
    const tcCount = (turnWin.match(/\x1b\[38;2;\d+;\d+;\d+m/g) ?? []).length
    push('HL3-truecolor-highlight', tcCount >= 20,
      `回合窗 truecolor 序列数=${tcCount}（阈值≥20；cli-highlight 闭包活面；降级 null 面=0）`)

    // ctrl+o 展开 transcript → 展开面仍含代码 + 高亮
    pty.sendRaw('\x0f')
    await sleep(3000)
    const raw2 = readFileSync(logPath, 'utf8')
    const expWin = raw2.slice(baseline)
    const expScreen = replay(logPath, 'final')
    const expCode = expScreen.includes('def add')
    const expTc = (expWin.slice(turnWin.length).match(/\x1b\[38;2;\d+;\d+;\d+m/g) ?? []).length
    push('HL4-ctrlo-expand', expCode, `ctrl+o 展开面代码在场=${expCode}（展开窗新增 truecolor=${expTc}）`)

    writeFileSync(join(OUT, 'probes.json'), JSON.stringify({ probe: 'tui-clihl-live-0188', probes }, null, 2))
    const fails = probes.filter((p) => p.ok === false).length
    console.log(JSON.stringify({ probe: 'tui-clihl-live-0188', fails, total: probes.length, probes }))
    process.exit(fails === 0 ? 0 : 1)
  } finally {
    pty?.kill()
  }
}

void main().catch((e) => { console.error('fatal:', (e as Error).message); process.exit(2) })
