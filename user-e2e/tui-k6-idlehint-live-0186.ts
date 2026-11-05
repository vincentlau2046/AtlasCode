/**
 * 0.1.86 补环探针 2（Atlas-review F1）：K6-8 中断后 idle-return-hint 不冒出
 * 活探针（工单 §1-G ⑤ / 任务 E 批注「可达面归 e2e PTY gate ⑤」，gate 086
 * 缺席 → 对 npm 发布物 0.1.86 补跑）。
 *
 * 前置（seeded settings + env，均可探针面控制）：
 *   - settings.featureFlags.atlas_willow_mode = 'hint'（growthbook 本地
 *     featureFlags 主配置源）
 *   - ATLAS_IDLE_THRESHOLD_MINUTES=0.05（阈值 3s）、ATLAS_IDLE_TOKEN_THRESHOLD=0
 *   - config.idleReturnDismissed 缺省 false
 *
 * 时序（先负断言后阳性对照，避免残hint污染）：
 *   轮 A：echo 轮正常完成（置 lastQueryCompletionTime）
 *   轮 B：新轮发起（isLoading）→ esc 中断 → 静置 15s（>阈值，零输入）
 *         → 断言屏面无 'new task?'（face GREEN；修前 RED 形态 = 立即冒出，
 *         单元定因同源：elapsed 含被中断回合全程 → remaining≤0 ~0ms 触发）
 *   轮 C（阳性对照）：echo 轮正常完成 → 静置 12s 零输入 → 断言 'new task?'
 *         在场（证 hint 通路/flag/阈值接线活，负断言非「flag 失效假绿」）
 *
 *   ATLAS_E2E_K6HINT_CMD="node <npmcli> --dangerously-skip-permissions" \
 *     ATLAS_E2E_K6HINT_OUT=<dir> bun run user-e2e/tui-k6-idlehint-live-0186.ts
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const CLI_CMD =
  process.env.ATLAS_E2E_K6HINT_CMD ??
  'node /home/vince/.claude/jobs/09264df0/tmp/prodlane-086/dl/package/dist/cli.js --dangerously-skip-permissions'
const OUT =
  process.env.ATLAS_E2E_K6HINT_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/supplement-086/k6hint'
const REPLAY = '/home/vince/.claude/jobs/09264df0/tmp/supplement-086/replay-wx.py'
const COLS = 200
const ROWS = 50
const MODEL = process.env.HINT_MODEL ?? 'Qwen38-27B-VL'
const HINT_TEXT = 'new task?'

type Probe = { id: string, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string) =>
  probes.push({ id, ok, detail })

function seedHome(home: string): void {
  mkdirSync(join(home, '.atlas'), { recursive: true })
  const modelRef = { model: `iff/${MODEL}` }
  // GlobalConfig 真身 = ~/.atlas.json（getGlobalClaudeFile；settings.json 的
  // featureFlags 字段不被 getGlobalConfig 消费）——willow flag 须 seed 此处
  writeFileSync(
    join(home, '.atlas.json'),
    JSON.stringify({ featureFlags: { atlas_willow_mode: 'hint' } }, null, 2),
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
        featureFlags: { atlas_willow_mode: 'hint' },
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

/** echo 轮：发送短 prompt → 等 marker 渲染入屏（真完成 → lastQueryCompletionTime 置位） */
async function echoRound(pty: InstanceType<typeof GenericPty>, logPath: string, marker: string): Promise<boolean> {
  pty.send(`Reply with exactly: ${marker}`)
  for (let i = 0; i < 40; i++) {
    await sleep(2_000)
    const snap = replay(stage(logPath, `echo-${marker}`), `scan:${marker}`)
    if (snap.includes(marker)) {
      await sleep(2_000) // settle 尾帧
      return true
    }
  }
  return false
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  const home = join(OUT, 'home')
  seedHome(home)
  const logPath = join(OUT, 'pty.log')
  // 阈值 env 经 extraEnv 注入子进程（3s 空闲阈值 + token 门 0，探针面旋钮）

  let pty: InstanceType<typeof GenericPty> | null = null
  try {
    // flag 通道：缺省走 settings.featureFlags；ATLAS_E2E_FC_OVERRIDE=1 时走
    // ATLAS_INTERNAL_FC_OVERRIDES（growthbook 优先级-1 env 通道，定因分流用）
    const extraEnv: Record<string, string> = {
      ATLAS_IDLE_THRESHOLD_MINUTES: '0.05',
      ATLAS_IDLE_TOKEN_THRESHOLD: '0',
    }
    if (process.env.ATLAS_E2E_FC_OVERRIDE === '1') {
      extraEnv.ATLAS_INTERNAL_FC_OVERRIDES = JSON.stringify({ atlas_willow_mode: 'hint' })
    }
    pty = await GenericPty.start({
      logPath,
      workspace: OUT,
      cmd: CLI_CMD,
      home,
      unset: ['CLAUDECODE'],
      extraEnv,
    })
    const ready = await toRepl(pty)
    push('P-H0-tui', ready, ready ? 'TUI REPL 就绪（willow=hint + 阈值 3s + token 门 0）' : 'TUI 未就绪')
    if (!ready) throw new Error('TUI not ready')
    await sleep(1_000)

    // 轮 A：echo 完成置 lastQueryCompletionTime
    const a = await echoRound(pty, logPath, 'HINTA-1111')
    push('P-H1-turnA', a, `echo 轮 A 完成（lastQueryCompletionTime 置位前提）=${a}`)
    if (!a) throw new Error('turn A failed')

    // 轮 B：新轮 in-flight → esc 中断（abort 直证 = 助手响应行缺席）→
    // 静置 12s 零输入 → hint 不得冒出。esc 竞速：长输出 prompt 拉长在飞窗，
    // esc 后校验响应行是否已渲染；已完成则重试（更早 esc），≤4 次。
    let aborted = false
    let attemptDetail = ''
    for (let attempt = 1; attempt <= 4 && !aborted; attempt++) {
      const escDelay = 700 - (attempt - 1) * 150
      pty.send('Reply with exactly 50 repetitions of XYZ98765QRS and nothing else')
      await sleep(escDelay)
      pty.sendRaw('\x1b') // esc 中断（App.tsx 中央键处理 bump 交互时间）
      await sleep(2_500)
      const fEsc = stage(logPath, `hint-b-esc-a${attempt}`)
      const full = replay(fEsc, 'full')
      // abort 直证：助手响应行（● 开头含 XYZ98765QRS）缺席 = 回合未正常完成
      const responseRow = full.split('\n').find((l) => l.trim().startsWith('●') && l.includes('XYZ98765QRS'))
      const errorRow = full.split('\n').find((l) => l.includes('本轮执行出错') || l.includes('中断') || l.includes('abort'))
      if (!responseRow) {
        aborted = true
        attemptDetail = `esc@${escDelay}ms 后响应行缺席（abort 直证）${errorRow ? `+错误行'${errorRow.trim().slice(0, 60)}'` : ''}`
      } else {
        attemptDetail += `[a${attempt}:esc@${escDelay}ms 落后于完成] `
        await sleep(1_000)
      }
    }
    if (!aborted) {
      push('P-H2-no-hint-after-interrupt', null,
        `K6-8 判据不可达：4 次竞速均未实现 abort（${attemptDetail}）——env-face，不冒充判定`)
    } else {
      await sleep(12_000) // 静置 > 3s 阈值，零输入
      const fWait = stage(logPath, 'hint-b-wait12s')
      const waitScan = replay(fWait, `scan:${HINT_TEXT}`)
      const hintAfterInterrupt = waitScan.includes(HINT_TEXT)
      push('P-H2-no-hint-after-interrupt', !hintAfterInterrupt,
        `K6-8 中断后 12s hint 不冒出=${!hintAfterInterrupt}（${attemptDetail}；${hintAfterInterrupt ? `RED 形态在场：${waitScan.trim().slice(0, 100)}` : 'face GREEN；修前 RED 形态=remaining≤0 ~0ms 立即冒出'}）`)
    }

    // 轮 C：阳性对照 — echo 完成后真空闲 12s → hint 必须冒出
    const c = await echoRound(pty, logPath, 'HINTC-3333')
    await sleep(12_000)
    const fCtrl = stage(logPath, 'hint-c-idle12s')
    const ctrlScan = replay(fCtrl, `scan:${HINT_TEXT}`)
    const hintIdle = ctrlScan.includes(HINT_TEXT)
    push('P-H3-idle-hint-fires', c && hintIdle,
      `阳性对照：轮 C 完成=${c}，真空闲 12s hint 冒出=${hintIdle}${hintIdle ? '（' + ctrlScan.trim().slice(0, 100) + '）' : ''}——证 hint 通路/flag/阈值接线活，P-H2 非 flag 失效假绿`)
  } catch (e) {
    push('P-H0-fatal', false, `fatal: ${(e as Error).message}`)
  } finally {
    pty?.kill()
  }

  const fails = probes.filter((p) => p.ok === false).length
  const result = { probe: 'tui-k6-idlehint-live-0186', fails, total: probes.length, probes }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'probes.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  process.exit(fails > 0 ? 1 : 0)
}

void main()
