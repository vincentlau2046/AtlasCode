/**
 * 0.1.86 K6-A vim 键序 hard 活探针 v2（gate 判据⑤ 活探针；零模型轮）。
 * v2 定因重设计（k6dbg3 分步屏面直证）：
 *   - 断言层：GenericPty text() 尾部 ≠ 实时屏面（TUI 增量游标重绘）→
 *     每阶段快照 pty.log → pyte 200x50 屏面重建 → 取最末 ❯ 行断言。
 *   - K6-1 激励：Esc 后游标已在末字符 ')' 上（NORMAL），直接 d%（含两端括号）
 *     → face 删 (bar) 留 foo；A+TAIL → fooTAIL-6k6。基线（无 % motion）
 *     d% 无效 → foo(bar)TAIL-6k6。不做 f(（'f' motion 实现面未含，'0' 后
 *     d% 从行首起算删整段——k6dbg3 [pct] 直证，非波判别面）。
 *   - K6-2 激励：慢机缺陷 = ESC+letter 合并分片（单 chunk \x1b+i）；裸 Esc
 *     +延时是未修路径（escResolve.ts 头注）。face：退 NORMAL + 以 NORMAL
 *     语义重放 'i'（游标在末字符 D 上重进 INSERT）→ Q → ABCQD；基线：
 *     meta+i 滞留 INSERT 'i' 泄字 → ABCDiQ。
 *   - 裸 Esc 快慢两档 = 无回归面（双面都应绿；基线亦绿）。
 *
 *   ATLAS_E2E_K6VIM_REPO=<worktree> ATLAS_E2E_K6VIM_OUT=<dir> \
 *     bun run user-e2e/tui-k6-vim-0186.ts
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const REPO =
  process.env.ATLAS_E2E_K6VIM_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-086-face'
const CLI_CMD =
  process.env.ATLAS_E2E_K6VIM_CMD ??
  `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`
const OUT =
  process.env.ATLAS_E2E_K6VIM_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-086/k6vim'
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

/** 阶段快照：拷贝 pty.log 当前前缀，稍后 pyte 重建 */
const stage = (logPath: string, tag: string): string => {
  const f = join(OUT, `${tag}.ptylog`)
  copyFileSync(logPath, f)
  return f
}

/** pyte 重建阶段屏面 → 最末 ❯ 行文本 */
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
    push('P-V0-tui', ready, ready ? 'TUI REPL 就绪' : 'TUI 未就绪（见 pty.log）')
    if (!ready) throw new Error('TUI not ready')
    await sleep(1_000)

    // ── P-V1 /vim 激活 ────────────────────────────────────────────────
    pty.send('/vim')
    await pty.settleBytes(4_000, 60_000)
    const snap1 = pty.text()
    const vimOn = snap1.includes('Editor mode set to vim')
    push('P-V1-vim-mode', vimOn, `/vim → 「Editor mode set to vim」=${vimOn}`)
    await sleep(1_000)

    // ── P-V2 K6-1 d%：初始 INSERT 空 input → foo(bar) → Esc（游标在 ')')→
    // d / % 单键单写（多键单 chunk 在 NORMAL 不逐键分派——k6dbg3 直证）
    pty.sendRaw('foo(bar)')
    await sleep(700)
    pty.sendRaw('\x1b') // Esc → NORMAL，游标落末字符 ')'
    await sleep(900)
    pty.sendRaw('d') // operator pending
    await sleep(500)
    pty.sendRaw('%') // face：删 (bar) 含两端 → foo；基线：无效
    await sleep(900)
    const fDpct = stage(logPath, 'v2-dpct')
    const inDpct = replayInputLine(fDpct)
    pty.sendRaw('A') // append at end → INSERT
    await sleep(500)
    pty.sendRaw('TAIL-6k6')
    await sleep(800)
    pty.sendRaw('\x1b')
    await sleep(1_000)
    const fV2 = stage(logPath, 'v2-final')
    const inV2 = replayInputLine(fV2)
    const v2Green = inV2.trim() === 'fooTAIL-6k6'
    const v2RedShape = inV2.includes('foo(bar)')
    push('P-V2-percent-motion', v2Green,
      `K6-1 d% 删配对段：GREEN=fooTAIL-6k6=${v2Green}（实测屏面 in='${inV2.trim()}'，d% 后='${inDpct.trim()}'；基线 RED 形态 foo(bar)TAIL-6k6=${v2RedShape}）`)

    // ── P-V3a K6-2 合并分片 \x1b+i 单 chunk（真修面；状态无关设计）────
    // 承接 v2 终态（NORMAL 游标在末字符）：A 追加 ABCD（INSERT 游标在行尾）
    // → 单 chunk ESC+i → face: 退 NORMAL（游标落 D）+ 重放 i（D 前重进
    // INSERT）→ Q → 尾 ABCQD；基线: meta+i 滞留 INSERT 'i' 泄字 → 尾 ABCDiQ
    pty.sendRaw('A')
    await sleep(500)
    pty.sendRaw('ABCD')
    await sleep(700)
    pty.sendRaw('\x1bi') // 单 chunk 合并分片（被测）
    await sleep(900)
    pty.sendRaw('Q')
    await sleep(700)
    pty.sendRaw('\x1b')
    await sleep(1_000)
    const fV3a = stage(logPath, 'v3a-final')
    const inV3a = replayInputLine(fV3a).trim()
    const v3aGreen = inV3a.endsWith('ABCQD')
    const v3aRed = inV3a.includes('ABCDiQ') || inV3a.includes('ABCDi')
    push('P-V3-esc-coalesced', v3aGreen,
      `K6-2 合并分片 \\x1b+i 单 chunk：GREEN=尾 ABCQD（退 NORMAL 重放 i）=${v3aGreen}（实测 in='${inV3a}'）；基线 RED=ABCDiQ 泄字=${v3aRed}`)

    // ── P-V3b 裸 Esc 快/慢两档 = 无回归面（双面预期绿）────────────────
    const escRound = async (gapMs: number, tag: string): Promise<void> => {
      pty.sendRaw('i') // NORMAL → INSERT
      await sleep(600)
      pty.sendRaw('\x15')
      await sleep(700)
      pty.sendRaw('EFGH')
      await sleep(700)
      pty.sendRaw('\x1b') // 裸 Esc（独立 chunk）
      await sleep(gapMs)
      pty.sendRaw('i') // 重进 INSERT（游标前）→ 'R' 插在 H 前
      await sleep(500)
      pty.sendRaw('R')
      await sleep(600)
      pty.sendRaw('\x1b')
      await sleep(1_000)
      const f = stage(logPath, `v3b-${tag}`)
      const input = replayInputLine(f).trim()
      // 无回归形态（k6dbg3 [Q] 直证同构）：NORMAL 游标在 H 上，i 重进
      // INSERT（H 前）→ R → 尾 EFGRH（承接态残字前置不影响 endsWith）。
      // 泄字红形态 = 尾 EFGHiR。
      const okNoLeak = input.includes('EFGRH') && !input.includes('EFGHi')
      push(`P-V3b-esc-lone-${tag}`, okNoLeak,
        `K6-2 裸 Esc+${gapMs}ms 无回归面：GREEN=EFGRH 在场且无 EFGHi=${okNoLeak}（实测 in='${input}'；泄字红=EFGHiR 族）`)
    }
    await escRound(25, 'fast25')
    await escRound(120, 'slow120')
  } catch (e) {
    push('P-V0-fatal', false, `fatal: ${(e as Error).message}`)
  } finally {
    pty?.kill()
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const result = {
    probe: 'tui-k6-vim-0186',
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
