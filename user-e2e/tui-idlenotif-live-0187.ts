/**
 * 0.1.87 gate E′②：idle_notification 交互门活面探针（姊妹门同根因顺修验证）。
 *
 * 门（REPL.tsx ~3694-3725）：轮完成后 isLoading=false 置 timer(messageIdleNotifThresholdMs)，
 * fire 时 `getLastInteractionTime() > lastQueryCompletionTime` → 不通知（用户已交互）。
 * 修前 stub `{} > num` NaN 恒 false → 门恒放行 → 交互后通知照发（RED 形态）。
 *
 * 可观测面：seeded config `preferredNotifChannel: 'iterm2'` → OSC9 序列
 * `\x1b]9;…AtlasCode is waiting for your input…\x07` 落 raw pty.log 字节面。
 *
 * 时序：
 *   轮 A echo 完成 → 1s 后输入 'x'（inputValue 变更 → updateLastInteractionTime(true)）
 *     → 静置 6s（> 阈值 3s）→ 断言 raw log 交互点之后无 'waiting for your input'（face GREEN）
 *   轮 B（阳性对照）echo 完成 → 零交互 → 静置 6s → 断言 'waiting for your input' 在场
 *     （证通知通路活，负断言非 flag 失效假绿）
 *
 *   ATLAS_E2E_NOTIF_CMD="node <cli.js> --dangerously-skip-permissions" \
 *     ATLAS_E2E_NOTIF_OUT=<dir> bun run user-e2e/tui-idlenotif-live-0187.ts
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const CLI_CMD = process.env.ATLAS_E2E_NOTIF_CMD!
const OUT = process.env.ATLAS_E2E_NOTIF_OUT!
const MODEL = process.env.HINT_MODEL ?? 'Qwen38-27B-VL'
const NOTIF_TEXT = 'waiting for your input'
const THRESHOLD_MS = 3_000

type Probe = { id: string, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string) =>
  probes.push({ id, ok, detail })

function seedHome(home: string): void {
  mkdirSync(join(home, '.atlas'), { recursive: true })
  const modelRef = { model: `iff/${MODEL}` }
  writeFileSync(
    join(home, '.atlas.json'),
    JSON.stringify({ messageIdleNotifThresholdMs: THRESHOLD_MS, preferredNotifChannel: 'iterm2' }, null, 2),
  )
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
  return false
}

const stage = (logPath: string, tag: string): string => {
  const f = join(OUT, `${tag}.ptylog`)
  copyFileSync(logPath, f)
  return f
}

/** echo 轮：发送短 prompt → 等 marker 渲染入屏 */
async function echoRound(pty: InstanceType<typeof GenericPty>, logPath: string, marker: string): Promise<boolean> {
  pty.send(`Reply with exactly: ${marker}`)
  for (let i = 0; i < 40; i++) {
    await sleep(2_000)
    const raw = readFileSync(stage(logPath, `echo-${marker}`), 'utf8')
    if (raw.includes(marker)) {
      await sleep(2_000) // settle 尾帧
      return true
    }
  }
  return false
}

async function main(): Promise<void> {
  if (!CLI_CMD || !OUT) throw new Error('need ATLAS_E2E_NOTIF_CMD + ATLAS_E2E_NOTIF_OUT')
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
      extraEnv: {},
    })
    const ready = await toRepl(pty)
    push('P-N0-tui', ready, ready ? 'TUI REPL 就绪（iterm2 通知 + 阈值 3s）' : 'TUI 未就绪')
    if (!ready) throw new Error('TUI not ready')

    // 轮 A：echo 完成 → 交互（输入 x）→ 静置 6s → 通知不得冒出
    const a = await echoRound(pty, logPath, 'NOTA-1111')
    push('P-N1-turnA', a, `echo 轮 A 完成=${a}（lastQueryCompletionTime 置位前提）`)
    if (a) {
      await sleep(1_000)
      pty.sendRaw('x') // inputValue 变更 → updateLastInteractionTime(true)（交互点）
      await sleep(400)
      pty.sendRaw('\x7f') // 清除，恢复空输入
      await sleep(400)
      const interactAt = readFileSync(logPath, 'utf8').length // 交互后字节偏移
      await sleep(6_000)
      const rawAfter = readFileSync(logPath, 'utf8').slice(interactAt)
      const fired = rawAfter.includes(NOTIF_TEXT)
      push('P-N2-no-notif-after-interaction', !fired,
        `交互后 6s idle_notification 不冒出=${!fired}（${fired ? `RED 形态在场：raw log OSC9 'waiting for your input'` : 'face GREEN；修前 RED 形态=stub NaN 门恒放行通知照发'}）`)
    } else {
      push('P-N2-no-notif-after-interaction', null, '判据不可达：轮 A 未完成——env-face')
    }

    // 轮 B：阳性对照 — echo 完成 → 零交互 → 静置 6s → 通知必冒出
    const b = await echoRound(pty, logPath, 'NOTB-2222')
    if (b) {
      await sleep(6_000)
      const raw = readFileSync(logPath, 'utf8')
      const fired = raw.includes(NOTIF_TEXT)
      push('P-N3-idle-notif-fires', fired,
        `阳性对照：轮 B 完成=${b}，零交互 6s idle_notification 冒出=${fired}——证通知通路/阈值接线活，P-N2 非 flag 失效假绿`)
    } else {
      push('P-N3-idle-notif-fires', null, '判据不可达：轮 B 未完成——env-face')
    }
  } catch (e) {
    push('P-N0-fatal', false, `fatal: ${(e as Error).message}`)
  } finally {
    pty?.kill()
  }

  const fails = probes.filter((p) => p.ok === false).length
  const result = { probe: 'tui-idlenotif-live-0187', fails, total: probes.length, probes }
  writeFileSync(join(OUT, 'probes.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  process.exit(fails > 0 ? 1 : 0)
}

void main().catch((e) => { console.error('fatal:', (e as Error).message); process.exit(2) })
