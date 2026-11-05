/**
 * 0.1.70 块 G/H · PTY 活探针（e2e lane，gate 判据⑤ 行为面收口；工单
 * docs/2026-10-14-p0-wave-0170-ticket.md §2⑤「composing token 计数器显形
 * PTY + autocompact 不发 anthropic 403」；gate 面单跑——修前红形由
 * tui-gh-0170 单元级 G4-beh/H1-beh 定向红承载，不跑基线 PTY〔模型消耗 +
 * 0.1.68 先例同纪律〕）。
 *
 * 断言面（全 hard，活模型 IFF 8999 Qwen38-27B-TXT 慢轮 = token 显形窗口充分）：
 *   P1a token 计数显形 = composing/responding 窗「N tokens」在场（块 G 用户主诉
 *       「composing 只有箭头没有 token」根修面；修前 totalTokens 恒 0 = 仅 ↑
 *       状态指示字形 〔0.1.64 G1〕，无 token 数字）
 *   P1b 回合完成 = PONG-GH0170 marker 在场（活模型往返 + 死代码激活零扰动
 *       既有回合面）
 *   P1c anthropic 403 缺席 = 屏面零「not enough quota」/ 零 api.anthropic.com
 *       （块 H 行为面：HOME 沙箱 = 0.1.69 生产 lane settings〔modelRoles.small
 *       无 per-role apiKey，providers.iff.apiKey 已设 = H-1 403 根因场景〕，
 *       修前此场景回落 keychain OAuth → 403；修后 = providers 表兜底发 IFF）
 *
 * 隔离：HOME = 沙箱（prodlane-069 headless-home，0 写真产品面）；PTY 日志/
 * 产物落 job-tmp（ATLAS_E2E_GH0170PTY_OUT）；活模型 = Qwen38 显式防 429
 * （settings 面 IFF/Qwen38 全配，TUI 默认模型面走 settings 池）。
 * 用法：
 *   cd <被测面 worktree> 无关（REPO 绝对路径驱动）
 *   ATLAS_E2E_GH0170PTY_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-gh-0170-pty.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { sleep } from './lib/util.js'
import { GenericPty } from './lib/pty-generic.js'

const REPO =
  process.env.ATLAS_E2E_GH0170PTY_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-070'

const HOME =
  process.env.ATLAS_E2E_GH0170PTY_HOME ??
  '/home/vince/.claude/jobs/09264df0/tmp/prodlane-069/headless-home'

const OUT =
  process.env.ATLAS_E2E_GH0170PTY_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-070/gh-0170-pty'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  // workspace = job tmp（并行 bg job 共享 /tmp 污染纪律）+ 预创建（pty 驱动
  // exec chdir 不建目录）
  const ws = join(OUT, 'ws')
  mkdirSync(ws, { recursive: true })
  const pty = await GenericPty.start({
    logPath: join(OUT, 'pty.log'),
    workspace: ws,
    cmd: `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`,
    home: HOME,
    unset: ['CLAUDECODE'],
    // 模态过场（onboarding 主题选择器 + YOLO 确认）= 探针侧交互处理，
    // start 不设 readySubs（固定 8s settle 后返回，模态面存活不阻断）
  })

  let ptyText = ''
  try {
    // 模态过场（序不定，循环重试至 REPL 就绪；各 gate 幂等——非当前模态面
    // = 超时跳过）：① 首启 onboarding 主题选择器（沙箱 HOME 无 global config
    // theme 面）→ 选 1（Dark mode）② YOLO 确认模态（--dangerously-skip-
    // permissions，c4-2-backoff 先例 = 选 2 接受）
    let styleGate = { ok: false as boolean }
    let yoloGate = { ok: false as boolean }
    for (let round = 0; round < 3; round++) {
      const repl = await pty.waitAnySince(
        ['/help 查看全部命令', '/sessionlist 会话列表'],
        30_000,
      )
      if (repl.ok) break
      styleGate = await pty.waitAnySince(
        ['Choose the text style', 'text style that looks best'],
        5_000,
      )
      if (styleGate.ok) {
        await sleep(500)
        pty.sendRaw('1')
        await sleep(300)
        pty.sendRaw('\r')
        continue
      }
      yoloGate = await pty.waitAnySince(['Yes, I accept'], 5_000)
      if (yoloGate.ok) {
        await sleep(500)
        pty.sendRaw('2')
        await sleep(300)
        pty.sendRaw('\r')
        continue
      }
      // 未知模态面：短 settle 后再试（防 TUI 启动中屏面未稳定）
      await sleep(3_000)
    }
    const replGate = await pty.waitAnySince(
      ['/help 查看全部命令', '/sessionlist 会话列表'],
      60_000,
    )
    if (!replGate.ok) {
      ptyText = pty.text()
      writeFileSync(join(OUT, 'pty.snapshot.txt'), ptyText)
      throw new Error(`REPL 未就绪（ready=${styleGate.ok}/style 过场），见 pty.log`)
    }
    await sleep(1_000)
    pty.send('Reply with exactly the text: PONG-GH0170. Output nothing else.')
    // 慢模型轮（Qwen38 10–30s+）：轮询至 PONG 或 240s 上限；
    // token 显形窗口 = composing 5s 门后（SHOW_TOKENS_AFTER_MS），全史 pty 日志
    // 保留 = 轮完成后历史行仍可断言。
    const t0 = Date.now()
    let sawTokens = false
    for (;;) {
      ptyText = pty.text()
      if (/\d+ tokens/.test(ptyText)) sawTokens = true
      if (ptyText.includes('PONG-GH0170')) break
      if (Date.now() - t0 > 240_000) break
      await sleep(1_000)
    }
    await sleep(2_000)
    ptyText = pty.text()
    writeFileSync(join(OUT, 'pty.snapshot.txt'), ptyText)

    const okTokens = /\d+ tokens/.test(ptyText)
    push(
      'P1a-token-counter-visible',
      okTokens,
      okTokens
        ? 'P1a token 计数显形（composing/responding 窗「N tokens」在场 = 块 G 主诉根修面；修前 totalTokens 恒 0 = 仅 ↑ 状态指示 〔0.1.64 G1〕 无 token 数字红形）'
        : 'P1a 缺口（pty 史零「N tokens」= 修前 totalTokens 恒 0 红形/活面未达成）',
    )

    const okPong = ptyText.includes('PONG-GH0170')
    push(
      'P1b-round-completes',
      okPong,
      okPong
        ? 'P1b 回合完成（PONG-GH0170 marker 在场 = 活模型往返 + 死代码激活零扰动既有回合面）'
        : 'P1b 缺口（PONG 缺席 = 回合未完成/活面异常）',
    )

    // 判别串 = 403 根因特异文案（泛 403 数字 regex 过宽易假阳，不取）
    const okNoAnthropic =
      !ptyText.includes('not enough quota') &&
      !ptyText.includes('api.anthropic.com')
    push(
      'P1c-no-anthropic-403',
      okNoAnthropic,
      okNoAnthropic
        ? 'P1c anthropic 403 缺席（沙箱 settings = H-1 403 根因场景〔small 无 per-role apiKey + providers.iff.apiKey 已设〕；屏面零「not enough quota」/零 api.anthropic.com/零 403 = 修后 providers 表兜底发 IFF）'
        : 'P1c 缺口（屏面命中 anthropic 错误面 = 回落链未断红形）',
    )
  } finally {
    pty.kill()
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const inc = probes.filter((p) => p.ok === null).length
  const verdict =
    hardFail === 0 && inc === 0
      ? 'PASS'
      : hardFail === 0
        ? `PASS-with-INC（INC=${inc}）`
        : `FAIL（hardFail=${hardFail} INC=${inc}）`
  writeFileSync(
    join(OUT, 'result.json'),
    JSON.stringify({ probe: 'tui-gh-0170-pty', repo: REPO, verdict, probes }, null, 2),
  )
  console.log(
    JSON.stringify(
      {
        verdict,
        probes: probes
          .map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`)
          .join(' '),
      },
      null,
      1,
    ),
  )
  console.log(`TUI-GH-0170-PTY ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('TUI-GH-0170-PTY ERROR', e)
  process.exit(1)
})
