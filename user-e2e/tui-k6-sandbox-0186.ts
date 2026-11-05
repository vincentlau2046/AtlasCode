/**
 * 0.1.86 K6-F sandbox 写盘失败显式报错 hard 活探针（e2e lane，gate 判据⑤
 * 活探针四面之一；工单 docs/2026-11-03-p0-wave-0186-ticket.md §1-F K6-7）。
 * 零模型轮；seeded 沙箱 HOME，真实 ~/.atlas/~/.claude 零写入。
 *
 * 场景：TUI 就绪后把沙箱 ~/.atlas 目录 chmod 0555（写盘必败）→
 * /sandbox exclude "npm run test:*" →
 *   P-S1（hard，fixed GREEN）：输出含显式错误（write/save/failed/EACCES/
 *        permission/失败/无法 族）且不含成功文案 Added "…" to excluded
 *        commands（基线 RED = sandbox-toggle.tsx L64-69 恒报成功）。
 *   P-S2（soft 前置）：平台/依赖不支持（only supported on / dependencies）
 *        = 环境面 hardInconclusive 另列（D4 型），不冒充行为红。
 * 收尾 chmod 0755 还原。
 *
 * 用法：ATLAS_E2E_K6SBX_REPO=<worktree> ATLAS_E2E_K6SBX_OUT=<dir>
 *   bun run /home/vince/projects/AtlasCode/user-e2e/tui-k6-sandbox-0186.ts
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const REPO =
  process.env.ATLAS_E2E_K6SBX_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-0.1.86-k6-tui'
const CLI_CMD =
  process.env.ATLAS_E2E_K6SBX_CMD ??
  `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`
const OUT =
  process.env.ATLAS_E2E_K6SBX_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-086/k6sbx'

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
    push('P-S0-tui', ready, ready ? 'TUI REPL 就绪' : 'TUI 未就绪（见 pty.log）')
    if (!ready) throw new Error('TUI not ready')
    await sleep(1_000)

    // 沙箱 settings 目录写盘必败
    const { chmodSync } = await import('node:fs')
    chmodSync(join(home, '.atlas'), 0o555)
    pty.send('/sandbox exclude "npm run test:*"')
    const settle = await pty.settleBytes(4_000, 60_000)
    writeFileSync(join(OUT, 's1-snapshot.txt'), pty.text())
    chmodSync(join(home, '.atlas'), 0o755)
    const after = pty.sinceText()
    const successMsg = after.includes('to excluded commands')
    const errMsg =
      /write|save|failed|EACCES|EACCES|permission|read-only|失败|无法|只读/i.test(after)
    const envUnsupported =
      /only supported on|dependencies|WSL/i.test(after) && !errMsg && !successMsg
    push('P-S1-write-fail-explicit', settle.ok && errMsg && !successMsg,
      'K6-7 写盘失败显式报错：错误提及=' + String(errMsg) +
      ' 且无假成功文案=' + String(!successMsg) +
      '（基线 RED = sandbox-toggle L64-69 恒报 Added … to excluded commands）')
    push('P-S2-env-unsupported', envUnsupported ? null : true,
      '平台/依赖不支持 = 环境面另列（D4 型 hardInconclusive，不冒充行为红）=' +
        String(envUnsupported), false)
  } catch (e) {
    push('P-S0-fatal', false, 'fatal: ' + (e as Error).message)
  } finally {
    pty?.kill()
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const result = {
    probe: 'tui-k6-sandbox-0186',
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
