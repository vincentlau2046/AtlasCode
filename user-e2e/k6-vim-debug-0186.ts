/**
 * 0.1.86 gate K6 vim 探针 debug（D-8 复核用，零模型轮）：逐键 settle + 剥 ANSI
 * 打印输入区，定位 P-V2/P-V3 失败在哪一步。
 *   ATLAS_E2E_K6VIM_REPO=<worktree> ATLAS_E2E_K6VIM_OUT=<dir> bun run k6-vim-debug-0186.ts
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const REPO = process.env.ATLAS_E2E_K6VIM_REPO ?? '/home/vince/projects/AtlasCode/worktrees/worktree-gate-086-face'
const CLI_CMD = `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`
const OUT = process.env.OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/gate-086/k6dbg2'

const strip = (t: string): string =>
  t.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b[=>]|\x1b\][^\x07]*\x07/g, '').replace(/\x1b./g, '')

function seedHome(home: string): void {
  mkdirSync(join(home, '.atlas'), { recursive: true })
  const modelRef = { model: 'iff/Qwen38-27B-VL' }
  writeFileSync(join(home, '.atlas', 'settings.json'), JSON.stringify({
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
    providers: { iff: { baseURL: 'http://127.0.0.1:8999/v1', apiKey: 'sk-iff-local', api: 'openai-completions', defaultContextWindow: 256000, defaultMaxTokens: 32000, models: [{ id: 'Qwen38-27B-VL', name: 'Qwen38-27B-VL', contextWindow: 256000, maxTokens: 32000 }] } },
  }, null, 2))
}

const frame = (pty: InstanceType<typeof GenericPty>): string => {
  const s = strip(pty.text())
  // 输入区 = 最后一个 ❯ 之后至状态行前
  const i = s.lastIndexOf('❯')
  return i >= 0 ? s.slice(i, i + 200).replace(/\n+/g, ' | ') : s.slice(-200).replace(/\n+/g, ' | ')
}

async function toRepl(pty: InstanceType<typeof GenericPty>): Promise<boolean> {
  let styleDone = false; let enterDone = false; let yoloDone = false
  for (let round = 0; round < 24; round++) {
    const t = pty.sinceText()
    if (t.includes('/help 查看全部命令') || t.includes('/sessionlist 会话列表')) return true
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
  return (await pty.waitAnySince(['/help 查看全部命令', '/sessionlist 会话列表'], 60000)).ok
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  const home = join(OUT, 'home')
  seedHome(home)
  const pty = await GenericPty.start({ logPath: join(OUT, 'pty.log'), workspace: OUT, cmd: CLI_CMD, home, unset: ['CLAUDECODE'] })
  const log: string[] = []
  const step = async (tag: string, keys?: string, waitMs = 700): Promise<void> => {
    if (keys) pty.sendRaw(keys)
    await sleep(waitMs)
    const f = frame(pty)
    log.push(`[${tag}] ${f}`)
    console.log(`[${tag}] ${f}`)
  }
  try {
    const ready = await toRepl(pty)
    console.log('ready=', ready)
    if (!ready) throw new Error('TUI not ready')
    await sleep(1000)
    await step('vim-cmd', undefined, 0)
    pty.send('/vim')
    await sleep(2500)
    console.log('[/vim]', frame(pty))
    // P-V2 分帧
    await step('cc', 'cc')
    await step('ctrlU', '\x15')
    await step('foo', 'foo(bar)')
    await step('esc', '\x1b', 900)
    await step('0f(', '0f(')
    await step('d', 'd')
    await step('pct', '%', 900)
    await step('A', 'A')
    await step('TAIL', 'TAIL-6k6')
    await step('esc2', '\x1b', 900)
    // P-V3 分帧
    await step('ctrlU2', '\x15')
    await step('iABCD', 'iABCD')
    await step('esc3', '\x1b', 900)
    await sleep(25)
    await step('i', 'i')
    await step('Q', 'Q')
    await step('esc4', '\x1b', 900)
  } finally {
    pty.kill()
  }
  writeFileSync(join(OUT, 'steps.log'), log.join('\n'))
}

void main()
