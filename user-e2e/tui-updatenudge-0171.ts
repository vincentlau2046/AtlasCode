/**
 * 0.1.71 块 B · 版本检查 nudge 活探针（e2e lane，gate 判据⑤ 新活探针 (b)；工单
 * docs/2026-10-15-p0-wave-0171-ticket.md §4⑤；PTY ×2 + fake npm（PATH 前置），
 * 零 IFF 零真 registry 零真模型）。
 *
 * 场景：TUI PTY（沙箱 HOME，最小 settings 面）启动 → UpdateAvailableSegment
 * 首帧 mount → refreshUpdateState → resolveLatestVersion（24h 磁盘缓存 miss →
 * defaultFetchLatest = `npm view` 经 PATH 前置 fake npm 返回固定版本号）→
 * 版本比较（gt）→ nudge「新版本 X 可用（当前 Y）· <升级命令行>」StatusLine 显形。
 *
 * 断言面（全 hard）：
 *   P-B1-nudge-visible  新版在场面（latest 99.9.9 > current〔REPO pkg version〕→
 *                      「新版本 99.9.9 可用（当前 Y）」StatusLine 段显形，B-1 主诉根修面；
 *                      修前 = 全仓无版本检查机制 nudge 恒缺席）
 *   P-B2-registry-segment 升级命令行 registry 段在场（`--registry https://registry.npmjs.org`
 *                      = B-2 0.1.43 npmmirror 坑固化字符串级判别锚）
 *   P-B3-default-no-autoupdate  默认零自动升级（ATLAS_AUTO_UPDATE 未设 = 仅提示模式：
 *                      屏面/日志零自动安装动作，B-3 恒等锚；nudge 在场 = 提示模式证据）
 *   P-B4-same-version-absent  同版本缺席面（第二沙箱 clean cache，fake npm 回当前版本 →
 *                      nudge 缺席恒等锚，B-1「同版本 / 检查失败 → null」）
 *
 * 隔离：HOME 双沙箱（job-tmp；cache 隔离 = 各沙箱 ~/.atlas/update-check.json 独立）；
 * fake npm 双 bin 目录（job-tmp，`view` 子命令固定版本，其余子命令透传真 npm）；
 * PTY 串行（PTY 串行纪律）。
 * 用法：
 *   ATLAS_E2E_NUDGE0171_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-updatenudge-0171.ts
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { sleep } from './lib/util.js'
import { GenericPty } from './lib/pty-generic.js'

const REPO =
  process.env.ATLAS_E2E_NUDGE0171_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-071'

const OUT =
  process.env.ATLAS_E2E_NUDGE0171_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-071r2/updatenudge-0171'

/** 被测面当前版本（MACRO.VERSION = worktree pkg version；TUI 构建注入同源）。 */
const CURRENT_VERSION = JSON.parse(
  readFileSync(join(REPO, 'package.json'), 'utf8'),
).version as string

/** 沙箱 settings（providers 面 = 首启 provider 配置向导避免面〔无 providers →
 * TUI 首启走「配置模型服务商」向导 + 安全须知模态，probe 过场面外红形 2026-10-15
 * 勘误先例〕；nudge 面不发消息 = 零模型消耗，providers 仅避向导；无 statusLine
 * 自定义/无 plugins = nudge 段（DEFAULT line1 尾段）无干扰）。 */
const SANDBOX_SETTINGS = JSON.stringify(
  {
    model: 'Qwen38-27B-TXT',
    modelRoles: {
      small: { models: [{ model: 'iff/Qwen38-27B-TXT' }], provider: 'iff' },
      fast: { models: [{ model: 'iff/Qwen38-27B-TXT' }], provider: 'iff' },
      premium: { models: [{ model: 'iff/Qwen38-27B-TXT' }], provider: 'iff' },
    },
    defaultRole: 'small',
    effortLevel: 'xhigh',
    providers: {
      iff: {
        baseURL: 'http://127.0.0.1:8999/v1',
        apiKey: 'sk-iff-local',
        api: 'openai-completions',
        defaultContextWindow: 256000,
        defaultMaxTokens: 32000,
        models: [
          {
            id: 'Qwen38-27B-TXT',
            name: 'Qwen38-27B-TXT',
            contextWindow: 256000,
            maxTokens: 32000,
          },
        ],
      },
    },
    skipDangerousModePermissionPrompt: true,
    env: { DISABLE_AUTOUPDATER: '1' },
  },
  null,
  2,
)

/** fake npm bin 目录：`view` 子命令回固定版本（版本检查 face），其余透传真 npm。 */
function makeFakeNpmDir(fakeVersion: string): string {
  const realNpm =
    execSync('command -v npm', { encoding: 'utf8' }).trim() || '/usr/local/bin/npm'
  const dir = join(OUT, `bin-fake-npm-${fakeVersion.replace(/\./g, '_')}`)
  mkdirSync(dir, { recursive: true })
  const script = join(dir, 'npm')
  writeFileSync(
    script,
    `#!/bin/sh\n# fake npm（0.1.71 块 B nudge 探针）：view 子命令回固定版本 ${fakeVersion}（\n# 版本检查 face），其余子命令透传真 ${realNpm}\nif [ "$1" = "view" ]; then\n  echo "${fakeVersion}"\n  exit 0\nfi\nexec ${realNpm} "$@"\n`,
    { mode: 0o755 },
  )
  return dir
}

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

/** PTY 过场（onboarding 主题选 1 + 安全须知 Enter + 服务商向导 Enter + YOLO 选 2
 * 幂等循环，tui-gh-0170-pty 先例 + 0.1.71 勘误增安全须知支〔新沙箱首启 = 「Press
 * Enter to continue」安全须知模态面〕+ 服务商向导支〔干净沙箱首启 = 「AtlasCode 模型
 * 配置」向导面：预设选择 Enter to confirm + 端点字段 Enter 下一字段，全预填 → 连发
 * \r 穿越；向导面只发 \r 不发数字键 = 防杂键落 REPL 输入触发真模型轮〔IFF 模型资源
 * 纪律〕；多余 \r 落 REPL 输入 = 空提交零副作用〕）→ REPL 就绪。 */
async function toRepl(pty: InstanceType<typeof GenericPty>): Promise<boolean> {
  for (let round = 0; round < 4; round++) {
    const repl = await pty.waitAnySince(
      ['/help 查看全部命令', '/sessionlist 会话列表'],
      30_000,
    )
    if (repl.ok) return true
    const style = await pty.waitAnySince(
      ['Choose the text style', 'text style that looks best'],
      5_000,
    )
    if (style.ok) {
      await sleep(500)
      pty.sendRaw('1')
      await sleep(300)
      pty.sendRaw('\r')
      continue
    }
    const notice = await pty.waitAnySince(['Press Enter to continue'], 5_000)
    if (notice.ok) {
      await sleep(500)
      pty.sendRaw('\r')
      continue
    }
    const wizard = await pty.waitAnySince(
      ['选择模型提供方', '填写端点信息'],
      5_000,
    )
    if (wizard.ok) {
      // 预设选择（1 个 \r 确认）+ 端点 3 字段（\r 下一字段）+ 底部确认（\r）：
      // 4 连发覆盖常见路径；不足 = 下一轮同标记再发（幂等），多余落 REPL = 空提交
      for (let i = 0; i < 4; i++) {
        await sleep(400)
        pty.sendRaw('\r')
      }
      await sleep(500)
      continue
    }
    const yolo = await pty.waitAnySince(['Yes, I accept'], 5_000)
    if (yolo.ok) {
      await sleep(500)
      pty.sendRaw('2')
      await sleep(300)
      pty.sendRaw('\r')
      continue
    }
    await sleep(3_000)
  }
  // 就绪回退（0.1.71 勘误）：杂键已落 REPL 触发真模型轮时（轮末 ~60s+ IFF 模型面），
  // 轮中 footer 提示被 busy 指示器占位 → 标记窗口错过；statusline（⌂ cwd 段）=
  // REPL 已 mount 的可靠就绪信号，先判 statusline 再补一轮标记等待
  if (pty.text().includes('⌂')) return true
  return (
    await pty.waitAnySince(
      ['/help 查看全部命令', '/sessionlist 会话列表'],
      60_000,
    )
  ).ok
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })

  const fake99 = makeFakeNpmDir('99.9.9')
  const fakeSame = makeFakeNpmDir(CURRENT_VERSION)
  const home1 = join(OUT, 'home-nudge-newer')
  const home2 = join(OUT, 'home-nudge-same')
  for (const home of [home1, home2]) {
    mkdirSync(join(home, '.atlas'), { recursive: true })
    writeFileSync(join(home, '.atlas', 'settings.json'), SANDBOX_SETTINGS)
  }

  const nudgeRe = new RegExp(`新版本 99\\.9\\.9 可用（当前 ${CURRENT_VERSION.replace(/\./g, '\\.')}）`)
  // 勘误（探针侧）：PTY 200 列下 statusline 自然换行（ink squashTextNodesToSegments
  // 按容器宽度换行，设计内）——命令体可跨行（「…· npm install」↵「   -g …」），
  // 字面空格 regex 失配 ≠ B-2 registry 段缺席（快照 raw 实锤命令全文完整在场，
  // 产品面正确）→ \s+ 吸收换行+缩进，token 序完整仍为判别锚
  const cmdRe = /npm\s+install\s+-g\s+@atlasharness\/atlascode\s+--registry\s+https:\/\/registry\.npmjs\.org/

  // ── 用例 1：fake latest 99.9.9 > current → nudge 显形 ──
  {
    const wsDir = join(OUT, 'ws-nudge-newer')
    mkdirSync(wsDir, { recursive: true })
    const pty = await GenericPty.start({
      logPath: join(OUT, 'pty-nudge-newer.log'),
      workspace: wsDir,
      cmd: `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`,
      home: home1,
      unset: ['CLAUDECODE'],
      // PATH 前置 fake npm（版本检查 defaultFetchLatest 消费 `npm view`）
      extraEnv: { PATH: `${fake99}:${process.env.PATH ?? ''}` },
    })
    try {
      const ready = await toRepl(pty)
      if (!ready) {
        writeFileSync(join(OUT, 'pty-nudge-newer.snapshot.txt'), pty.text())
        push('P-B1-nudge-visible', false, 'REPL 未就绪（见 pty-nudge-newer.snapshot.txt）')
        push('P-B2-registry-segment', null, 'INC：REPL 未就绪')
        push('P-B3-default-no-autoupdate', null, 'INC：REPL 未就绪')
      } else {
        // 版本检查异步（cache miss → fake npm view 毫秒级 → 写缓存 → store refresh）：
        // 轮询至 nudge 面或 60s（版本检查 timeout 5s 有界，正常 1 轮内显形）
        const t0 = Date.now()
        let t = ''
        for (;;) {
          t = pty.text()
          if (t.includes('新版本')) break
          if (Date.now() - t0 > 60_000) break
          await sleep(1_000)
        }
        await sleep(2_000)
        t = pty.text()
        writeFileSync(join(OUT, 'pty-nudge-newer.snapshot.txt'), t)

        const okNudge = nudgeRe.test(t)
        push(
          'P-B1-nudge-visible',
          okNudge,
          okNudge
            ? `B-1 nudge 显形（「新版本 99.9.9 可用（当前 ${CURRENT_VERSION}）」StatusLine 段 = 用户主诉②「自动升级未实现」根修面；修前全仓无版本检查机制恒缺席）`
            : 'B-1 缺口（nudge 缺席 = 版本检查/显形面未达；fake npm 面核验 pty-nudge-newer.log）',
        )
        const okCmd = cmdRe.test(t)
        push(
          'P-B2-registry-segment',
          okCmd,
          okCmd
            ? 'B-2 升级命令行 registry 段在场（--registry https://registry.npmjs.org = 0.1.43 npmmirror CN 只读坑教训固化，字符串级判别锚）'
            : 'B-2 缺口（registry 段缺席 = B-2 判别锚破坏）',
        )
        const okNoAuto = !/(auto-?install|auto-?updat\w*|正在自动|installing @atlasharness)/i.test(t)
        push(
          'P-B3-default-no-autoupdate',
          okNoAuto,
          okNoAuto
            ? 'B-3 默认零自动升级（ATLAS_AUTO_UPDATE 未设 = 仅提示模式恒等锚：零自动安装动作 + nudge 提示行在场 = 提示模式证据）'
            : 'B-3 缺口（屏面命中自动升级动作面 = opt-in 门破坏，默认行为变更红形）',
        )
      }
    } finally {
      pty.kill()
    }
  }

  // ── 用例 2（对照组）：fake latest = current（同版本，clean cache 沙箱）→ nudge 缺席 ──
  {
    const wsDir = join(OUT, 'ws-nudge-same')
    mkdirSync(wsDir, { recursive: true })
    const pty = await GenericPty.start({
      logPath: join(OUT, 'pty-nudge-same.log'),
      workspace: wsDir,
      cmd: `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`,
      home: home2,
      unset: ['CLAUDECODE'],
      extraEnv: { PATH: `${fakeSame}:${process.env.PATH ?? ''}` },
    })
    try {
      const ready = await toRepl(pty)
      if (!ready) {
        writeFileSync(join(OUT, 'pty-nudge-same.snapshot.txt'), pty.text())
        push('P-B4-same-version-absent', null, 'INC：REPL 未就绪（用例 2 未执行）')
      } else {
        // 同版本 = nudge 恒 null（不显形）：settle 40s（版本检查完成窗口）后断言缺席
        await sleep(40_000)
        const t = pty.text()
        writeFileSync(join(OUT, 'pty-nudge-same.snapshot.txt'), t)
        const okAbsent = !t.includes('新版本')
        push(
          'P-B4-same-version-absent',
          okAbsent,
          okAbsent
            ? 'B-1 同版本缺席面恒等锚（latest == current → nudge null 不显形，无假阳性 nudge；clean cache 沙箱 = 非缓存干扰面）'
            : 'B-1 假阳性（同版本 nudge 显形 = 版本比较面破坏）',
        )
      }
    } finally {
      pty.kill()
    }
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
    JSON.stringify({ probe: 'tui-updatenudge-0171', repo: REPO, verdict, probes }, null, 2),
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
  console.log(`TUI-UPDATENUDGE-0171 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('TUI-UPDATENUDGE-0171 ERROR', e)
  process.exit(1)
})
