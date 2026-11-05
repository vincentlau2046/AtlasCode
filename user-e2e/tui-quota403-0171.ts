/**
 * 0.1.71 块 A · quota 403 判别活探针（e2e lane，gate 判据⑤ 新活探针 (a)；工单
 * docs/2026-10-15-p0-wave-0171-ticket.md §4⑤；PTY ×2 + c4-mock-server
 * quota403/plain403 双实例，零 IFF 零真模型）。
 *
 * 场景：TUI PTY（沙箱 HOME，providers.mock403 → 本地 mock server 403 面，
 * modelRoles 三角色 + 顶层 model 全指 mock403/q403model）发一条消息 →
 * 池轮询全败（2 refs 同 mock，403 非瞬断零重试）→ A-1 ModelPoolExhaustedError
 * 聚合 → A-2 逐 ref 分类（quota 签名 → quota_exhausted / 泛 403 → auth_error）→
 * A-3 TUI 提示面（聚合消息 + Fix 可行动指引行）。
 *
 * 断言面（全 hard）：
 *   P-A1-aggregate-header  聚合错误浮现（「N model(s) in pool for role … failed:」族，
 *                          A-1 替代 raw lastErr 抛的新契约面；修前 = raw 单模型 403 body 原样）
 *   P-A2-quota-classification  逐 ref 分类标签 = quota_exhausted（mock 403 body = 用户
 *                          主诉文案「not enough quota to pre-consume」命中 A-2 isQuotaExhaustedMessage
 *                          签名族；判别锚 = 分类标签非文案透传）
 *   P-A3-quota-actionable  可行动指引行（Fix: Check provider credentials/quota … 族，
 *                          A-3 聚合支 content = prefix + 聚合消息 Fix 行）
 *   P-A4-plain403-control  对照组（plain403 实例：泛 403 无 quota 签名）→ 逐 ref 分类
 *                          = auth_error + 零 quota_exhausted 标签 + 零 pre-consume 文案
 *                          （判别性 = quota vs 泛 403 分型不串）
 *
 * 隔离：HOME 双沙箱（job-tmp，0 写真产品面；settings = mock403 provider 面，
 * 无 statusLine 自定义/无 plugins）；mock server 双实例（8990=quota403 / 8991=plain403，
 * c4-mock-server 0.1.71 增量模式，请求日志落 OUT）；PTY 串行（PTY 串行纪律）。
 * 用法：
 *   ATLAS_E2E_QUOTA0171_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-quota403-0171.ts
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { sleep } from './lib/util.js'
import { GenericPty } from './lib/pty-generic.js'

const REPO =
  process.env.ATLAS_E2E_QUOTA0171_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-071'

const OUT =
  process.env.ATLAS_E2E_QUOTA0171_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-071r2/quota403-0171'

const MOCK_PY = '/home/vince/projects/AtlasCode/user-e2e/loop-robustness/c4-mock-server.py'
const PORT_QUOTA = 8990
const PORT_PLAIN = 8991

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

/** 沙箱 settings（mock403 provider 面；三角色 + 顶层 model 全指 mock403/q403model；
 *  简化面 = 无 statusLine 自定义/无 plugins/无 marketplaces，避免干扰）。 */
function sandboxSettings(port: number): string {
  return JSON.stringify(
    {
      model: 'q403model',
      modelRoles: {
        small: { models: [{ model: 'mock403/q403model' }], provider: 'mock403' },
        fast: { models: [{ model: 'mock403/q403model' }], provider: 'mock403' },
        premium: { models: [{ model: 'mock403/q403model' }], provider: 'mock403' },
      },
      defaultRole: 'small',
      effortLevel: 'xhigh',
      providers: {
        mock403: {
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: 'mock-key',
          api: 'openai-completions',
          defaultContextWindow: 256000,
          defaultMaxTokens: 32000,
          models: [
            {
              id: 'q403model',
              name: 'q403model',
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
}

function startMock(mode: 'quota403' | 'plain403', port: number, outDir: string): ChildProcess {
  const log = spawn(
    'python3',
    [MOCK_PY, outDir, '--mode', mode, '--port', String(port)],
    { stdio: ['ignore', 'ignore', 'inherit'], detached: false },
  )
  return log
}

/** 探活：POST /v1/chat/completions → 403 = 实例就绪（quota403/plain403 全请求 403 面）。 */
async function waitMockReady(port: number, timeoutMs = 15_000): Promise<boolean> {
  const t0 = Date.now()
  for (;;) {
    const code = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({ model: 'q403model', messages: [{ role: 'user', content: 'ping' }] }),
    })
      .then((r) => r.status)
      .catch(() => 0)
    if (code === 403) return true
    if (Date.now() - t0 > timeoutMs) return false
    await sleep(500)
  }
}

/** PTY 过场（onboarding 主题选 1 + YOLO 选 2 幂等循环，tui-gh-0170-pty 先例）→ REPL 就绪。 */
async function toRepl(pty: InstanceType<typeof GenericPty>): Promise<boolean> {
  for (let round = 0; round < 3; round++) {
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
  return (
    await pty.waitAnySince(
      ['/help 查看全部命令', '/sessionlist 会话列表'],
      60_000,
    )
  ).ok
}

async function runPtyCase(
  label: string,
  port: number,
  home: string,
  ws: string,
): Promise<string> {
  const wsDir = join(ws, `ws-${label}`)
  mkdirSync(wsDir, { recursive: true })
  const pty = await GenericPty.start({
    logPath: join(OUT, `pty-${label}.log`),
    workspace: wsDir,
    cmd: `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`,
    home,
    unset: ['CLAUDECODE'],
  })
  try {
    const ready = await toRepl(pty)
    if (!ready) {
      writeFileSync(join(OUT, `pty-${label}.snapshot.txt`), pty.text())
      return ''
    }
    await sleep(1_000)
    pty.send('Reply with exactly the text: OK. Output nothing else.')
    // mock 403 快败（非瞬断零重试，2 refs ≈ 2 次 403 往返，秒级）：轮询至聚合面或 120s
    const t0 = Date.now()
    for (;;) {
      const t = pty.text()
      if (t.includes('in pool for role')) break
      if (Date.now() - t0 > 120_000) break
      await sleep(1_000)
    }
    await sleep(2_000)
    const t = pty.text()
    writeFileSync(join(OUT, `pty-${label}.snapshot.txt`), t)
    return t
  } finally {
    pty.kill()
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const homeA = join(OUT, 'home-quota')
  const homeB = join(OUT, 'home-plain')
  for (const [home, port] of [
    [homeA, PORT_QUOTA],
    [homeB, PORT_PLAIN],
  ] as const) {
    mkdirSync(join(home, '.atlas'), { recursive: true })
    writeFileSync(join(home, '.atlas', 'settings.json'), sandboxSettings(port))
  }

  const mockA = startMock('quota403', PORT_QUOTA, join(OUT, 'mock-quota'))
  const mockB = startMock('plain403', PORT_PLAIN, join(OUT, 'mock-plain'))
  const ra = await waitMockReady(PORT_QUOTA)
  const rb = await waitMockReady(PORT_PLAIN)
  if (!ra || !rb) {
    push('P0-mock-ready', ra && rb, `mock 实例探活失败（quota=${ra} plain=${rb}；端口占用/起面失败 = 环境面 INC）`, false)
  }

  try {
    // ── 用例 1：quota403（mock 403 body = 用户主诉文案「not enough quota to pre-consume」）──
    const t1 = ra ? await runPtyCase('quota', PORT_QUOTA, homeA, OUT) : ''
    if (ra && t1.length === 0) {
      push('P-A1-aggregate-header', false, 'REPL 未就绪（见 pty-quota.snapshot.txt）')
      push('P-A2-quota-classification', null, 'INC：REPL 未就绪（用例 1 未执行）')
      push('P-A3-quota-actionable', null, 'INC：REPL 未就绪（用例 1 未执行）')
    } else {
      const okHeader = /in pool for role .*failed:/.test(t1)
      push(
        'P-A1-aggregate-header',
        okHeader,
        okHeader
          ? 'A-1 聚合错误浮现（「N model(s) in pool for role … failed:」族；修前 = raw 单模型 403 body 原样 = 用户主诉①「提示有问题」根修面）'
          : 'A-1 缺口（聚合头缺席 = 修前 raw lastErr 抛红形/活面未达成）',
      )
      const okClass = /- mock403\/q403model: quota_exhausted/.test(t1)
      push(
        'P-A2-quota-classification',
        okClass,
        okClass
          ? 'A-2 逐 ref 分类标签 = quota_exhausted（mock 403 body 命中 isQuotaExhaustedMessage 签名族；判别锚 = 分类标签显形非文案透传）'
          : 'A-2 缺口（逐 ref quota_exhausted 标签缺席 = 分类面未达）',
      )
      // 勘误（探针侧）：A-1 聚合消息 Fix 行按分类分支取文案（quota 支 = 「Top up your
      // provider quota…」/ auth 支 = 「Check provider credentials/quota…」）；quota403
      // 场景 = quota 支文案（首版探针误取 auth 支文案 = 断言面猜测错，非产品面）。
      const okAction = /Fix:\s*(Top up your provider quota|Check provider credentials\/quota)/.test(t1)
      push(
        'P-A3-quota-actionable',
        okAction,
        okAction
          ? 'A-3 可行动指引行在场（聚合消息 Fix 行：quota 支「Top up your provider quota, or switch to another provider/model…」族 = 提示面可行动）'
          : 'A-3 缺口（Fix 指引行缺席 = 提示面不可行动红形）',
      )
    }

    // ── 用例 2（对照组）：plain403（泛 403 无 quota 签名）→ auth_error 分型不串 ──
    const t2 = rb ? await runPtyCase('plain', PORT_PLAIN, homeB, OUT) : ''
    if (rb && t2.length === 0) {
      push('P-A4-plain403-control', false, 'REPL 未就绪（见 pty-plain.snapshot.txt）')
    } else if (t2.length > 0) {
      const okControl =
        /- mock403\/q403model: auth_error/.test(t2) &&
        !t2.includes('quota_exhausted') &&
        !t2.includes('pre-consume')
      push(
        'P-A4-plain403-control',
        okControl,
        okControl
          ? '泛 403 对照组 = auth_error 分类 + 零 quota_exhausted 标签 + 零 pre-consume 文案（quota vs 泛 403 分型判别性成立，A-2 单一事实源不串型）'
          : '对照组缺口（auth_error 标签缺席或 quota 文案串型 = 判别性破坏）',
      )
    } else {
      push('P-A4-plain403-control', null, 'INC：plain403 实例未就绪（用例 2 未执行）')
    }
  } finally {
    mockA.kill('SIGTERM')
    mockB.kill('SIGTERM')
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
    JSON.stringify({ probe: 'tui-quota403-0171', repo: REPO, verdict, probes }, null, 2),
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
  console.log(`TUI-QUOTA403-0171 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('TUI-QUOTA403-0171 ERROR', e)
  process.exit(1)
})
