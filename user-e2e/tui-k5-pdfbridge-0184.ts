/**
 * 0.1.84 V3-5 K5 @PDF 活桥判别活探针（e2e lane，gate 判据⑦ + K5 新活探针；
 * 工单 docs/2026-11-01-p0-wave-0184-ticket.md §1F「活桥硬判据」：
 * 真实 TUI @file 提交 → 实际 engine/provider 请求可见 path + 必读指令）。
 *
 * 链路：沙箱 HOME（seeded settings → 本地日志代理 8998 → IFF 8999，模型
 * Qwen38-27B-VL 显式）+ PTY 真 TUI（bun run src/atlascode/cli.ts）→
 * 提交 "@marker.pdf ..." → 代理落盘真实 provider 请求体 → 断言：
 *   P-B1 引用化渲染（hard）：TUI 渲染「Referenced PDF marker.pdf
 *        (3 pages)」——K5-7 活面（pdf_reference 记录真生成：path + 页数
 *        在场、零内联）。重锚勘误（2026-11-02 gate 定因）：工单 §1F 原判据
 *        P-B1..B4 锚 provider 请求体的前提不成立——messages.ts L2298
 *        normalizeAttachmentForAPI 非活链路（仅 analyzeContext/microcompact
 *        消费），活请求构造 = modelprovider/params.ts toOpenAIMessages，
 *        其只认 user/assistant/system → attachment 型整体静默丢弃（既有
 *        缺口，git 05ec0bc..9438d91 该文件零触碰；K5SPY 定因证据 =
 *        runs 8/9 debug 日志）。provider 请求面断言降为 P-B3 缺口登记。
 *   P-B2 JSONL 面（hard）：会话 JSONL user @path 文本在场 + 零 %PDF/JVBERi
 *        原始字节 + 零 pdf_reference 落盘（isLoggableMessage 设计过滤 =
 *        2026-10-02 R4 S1 裁定面，仅 skill_listing/hook_additional_context
 *        例外）。walk 范围勘误：原全 HOME 树撞 .bun/install/cache pile 内
 *        第三方 PDF 样本字节（run 9 假阳性）→ 收窄 .atlas 树。
 *   P-B3 provider 请求面缺口（hard=false，恒红登记）：请求体零附件内容
 *        （K5-8 四要素/必读指令/pages 指引均不可达）= 既有 toOpenAIMessages
 *        attachment 丢弃缺口，非本波回归；归 Main/f4 裁定（双面报用户）。
 *   P-B4 零内联 bytes（hard）：请求体不含 JVBERi（%PDF base64 前缀）——
 *        护栏保留：缺口修复后本断言防内联退回。
 *   P-B5 活轮 Read 回读（soft）：VL 活轮实际 Read marker.pdf 页 3 → 模型
 *        回答含已知页 marker ORION-7742（模型采样面，soft；桥断言不依赖它）
 *
 * 既有边界如实登记（工单 §1F）：headless print.ts 无 @ 自动展开——两入口
 * 并非都有自动附件；显式 Read 的 headless 活路径由 k5-headless-rounds 承载。
 *
 * 隔离：沙箱 HOME（job-tmp，零写真实 ~/.atlas/~/.claude）；fixture 全部
 * OUT 自建自清理；PTY 串行（gateway 串行纪律，fam 链后跑）。
 * 用法：
 *   ATLAS_E2E_K5BRIDGE_REPO=<worktree 绝对路径> \
 *   ATLAS_E2E_K5BRIDGE_OUT=<输出目录> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-k5-pdfbridge-0184.ts
 */
import { spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const REPO =
  process.env.ATLAS_E2E_K5BRIDGE_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-084-face'
const OUT =
  process.env.ATLAS_E2E_K5BRIDGE_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-084/k5bridge'
const PROXY_PORT = 8998
const PAGE3_MARKER = 'ORION-7742'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

// ── fixture：3 页文本 PDF（页 3 独占 marker）──────────────────────────

function buildTextPdf(pages: string[]): Buffer {
  // 对象编号：1 Catalog / 2 Pages / 3 Font / 之后每页 2 对象（page + content）
  const objects: string[] = []
  const pageIds = pages.map((_, i) => 4 + i * 2)
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`
  objects[2] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`
  pages.forEach((text, i) => {
    const pid = 4 + i * 2
    const cid = pid + 1
    const stream = `BT /F1 12 Tf 20 110 Td (${text}) Tj ET`
    objects[pid] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 144] /Resources << /Font << /F1 3 0 R >> >> /Contents ${cid} 0 R >>`
    objects[cid] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })
  let body = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = body.length
    body += `${n} 0 obj\n${objects[n]}\nendobj\n`
  }
  const xrefOffset = body.length
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let n = 1; n < objects.length; n++) {
    xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  }
  const trailer = `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body + xref + trailer, 'latin1')
}

function writeFixtures(work: string): void {
  writeFileSync(
    join(work, 'marker.pdf'),
    buildTextPdf([
      'K5PDF page one ALPHA-1131',
      'K5PDF page two BRAVO-2242',
      `K5PDF page three ${PAGE3_MARKER}`,
    ]),
  )
  // UTF-16LE BOM + CRLF（headless 轮共用 fixture；本探针只写不消费）
  const leText = 'K5-UTF16LE 奔腾标记 MARKER-9917\r\nsecond line 中文\r\n'
  const leBytes = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(leText, 'utf16le'),
  ])
  writeFileSync(join(work, 'utf16le.txt'), leBytes)
  // >256KB 且 >25K 估算 tokens 的普通文本（allow_large 双门；末行 marker）
  const lines: string[] = []
  for (let i = 0; i < 6200; i++) {
    lines.push(`line ${i} the quick brown fox jumps over the lazy dog padding ${i}`)
  }
  lines.push('K5-LARGE-END-MARKER-3350')
  writeFileSync(join(work, 'large.txt'), lines.join('\n'))
}

// ── 沙箱 settings（seeded：8998 代理 + Qwen38-27B-VL 显式）────────────

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
        // bypass 警告屏直接 seeded 跳过（tui-deant-final-0178 先例）：该屏
        // Select 输入面在 PTY 下不可靠（三跑勘误：数字键/下箭头均未移动
        // 预选焦点，Enter 落「1. No, exit」→ gracefulShutdown 退出）
        skipDangerousModePermissionPrompt: true,
        env: { DISABLE_AUTOUPDATER: '1' },
        providers: {
          iff: {
            baseURL: `http://127.0.0.1:${PROXY_PORT}/v1`,
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

// ── PTY 过场（onboarding 紧循环逐屏驱动 → REPL 就绪；quota0171 先例 +
// 首跑勘误：K5 沙箱流撞上「Security notes · Press Enter to continue」屏，
// 30s REPL 等待主导的轮式探测总在错屏窗口 → 改紧循环短间隔逐屏作答）──

async function toRepl(pty: InstanceType<typeof GenericPty>): Promise<boolean> {
  // sinceText 追加不清理 → 屏文本命中后常驻，必须 once-flag（二跑勘误：
  // 无 flag 时 style 陈旧命中重发 '1' 落在 YOLO 屏 = 「No, exit」→ TUI 退出）
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
      // Security notes 屏：Enter 直进
      enterDone = true
      await sleep(400)
      pty.sendRaw('\r')
      await sleep(1_500)
      continue
    }
    if (!yoloDone && t.includes('Yes, I accept')) {
      // bypass 警告屏（--dangerously-skip-permissions）：预选 = 「1. No, exit」，
      // 数字键非该 select 组件快捷键（三跑勘误：'2'+Enter 落在预选项 = No, exit
      // → TUI 退出）——下箭头移动选择到「2. Yes, I accept」再 Enter
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

/** 递归收集沙箱 HOME 内全部文件（JSONL 对账用；限 HOME 树内）。 */
function walkFiles(root: string): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length) {
    const d = stack.pop() as string
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(d, e)
      let st
      try {
        st = readdirSync(p)
      } catch {
        out.push(p)
        continue
      }
      stack.push(p)
      void st
    }
  }
  return out
}

function isDir(p: string): boolean {
  try {
    readdirSync(p)
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  const home = join(OUT, 'home')
  const work = join(OUT, 'work')
  const reqdir = join(OUT, 'req')
  mkdirSync(work, { recursive: true })
  writeFixtures(work)
  seedHome(home)

  // 日志代理
  const proxy: ChildProcess = spawn('python3', [
    '/home/vince/projects/AtlasCode/user-e2e/k5-bridge-proxy.py',
    '--port', String(PROXY_PORT),
    '--upstream', '127.0.0.1:8999',
    '--logdir', reqdir,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  let proxyReady = false
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try {
      const r = await fetch(`http://127.0.0.1:${PROXY_PORT}/v1/models`, { method: 'GET' })
      void r
      proxyReady = true
      break
    } catch {
      /* not up yet */
    }
  }
  push('P-B0-proxy', proxyReady, proxyReady ? '8998 日志代理就绪' : '代理未就绪')

  let pty: InstanceType<typeof GenericPty> | null = null
  try {
    if (!proxyReady) throw new Error('proxy not ready')
    pty = await GenericPty.start({
      logPath: join(OUT, 'pty.log'),
      workspace: work,
      // 净产品跑（gate 判据面）：定因期 --debug + --preload k5spy 已随
      // runs 8/9 银行化（K5SPY 痕迹 + tryGetPDFReference OK pages=3 证据
      // 落 gate 报告），正式断言面回归无插桩产品行为。
      cmd: `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`,
      home,
      unset: ['CLAUDECODE'],
    })
    const ready = await toRepl(pty)
    push('P-B0-tui', ready, ready ? 'TUI REPL 就绪' : 'TUI 未就绪（见 pty.log）')
    if (!ready) throw new Error('TUI not ready')
    await sleep(1_000)
    pty.send(
      '@marker.pdf What exact marker text appears on page 3? Use the Read tool with a page range to check before answering.',
    )
    // 活轮：可能多请求（引用轮 → Read tool_use 轮 → 终答）；字节 settle 判回合完成
    const settle = await pty.settleBytes(8_000, 300_000)
    writeFileSync(join(OUT, 'pty-snapshot.txt'), pty.text())
    push('P-B0-round', settle.ok, `回合 settle=${settle.ok} bytes=${settle.bytes}`)

    // 请求体对账
    await sleep(1_500)
    const bodies: string[] = []
    if (existsSync(reqdir)) {
      const metas = readdirSync(reqdir).filter((f) => f.endsWith('-meta.json')).sort()
      for (const m of metas) {
        const n = m.split('-')[0]
        try {
          bodies.push(readFileSync(join(reqdir, `${n}-body.bin`), 'utf8'))
        } catch {
          /* empty body */
        }
      }
    }
    const all = bodies.join('\n')
    // K5-7 活面重锚：TUI 渲染的 pdf_reference chip（免插桩产品真实观测）
    const snap = pty.text()
    const rendered = snap.includes('Referenced PDF marker.pdf') && snap.includes('3 pages')
    push('P-B1-render', rendered,
      `TUI 渲染「Referenced PDF marker.pdf (3 pages)」= pdf_reference 活生成（K5-7 活面，零内联）`)

    // JSONL 对账（.atlas 树——walk 收窄勘误：全 HOME 树含 .bun/install/cache
    // 第三方 PDF 样本字节 = run 9 假阳性源；工单面 = 会话转录数据）
    let pdfBytes = false
    let userPath = false
    let pdfRefPersisted = false
    for (const f of walkFiles(join(home, '.atlas'))) {
      if (!isDir(f)) {
        let s: string
        try {
          s = readFileSync(f, 'utf8')
        } catch {
          continue
        }
        if (s.includes('%PDF-') || s.includes('JVBERi')) pdfBytes = true
        if (s.includes('marker.pdf')) userPath = true
        if (s.includes('pdf_reference')) pdfRefPersisted = true
      }
    }
    push('P-B2-jsonl', !pdfBytes && userPath && !pdfRefPersisted,
      `.atlas 树零 PDF 原始字节 + user @path 在场 + 零 pdf_reference 落盘（isLoggableMessage 设计过滤边界）`)

    // 既有缺口登记（非 hard）：provider 请求面零附件内容 = toOpenAIMessages
    // attachment 丢弃（预存在，非 K5 波回归；归 Main/f4 裁定）
    const gapHits =
      (all.includes('The content of this PDF is not attached to this message') ? 1 : 0) +
      (all.includes('you MUST use the Read tool') ? 1 : 0) +
      (all.includes('up to 20 pages per request') ? 1 : 0)
    push('P-B3-gap-provider', gapHits === 3,
      `provider 请求含 K5-8 四要素 ${gapHits}/3——恒红登记：toOpenAIMessages 丢弃 attachment（既有缺口，git 05ec0bc..9438d91 零触碰；双面报 Main/用户）`, false)

    push('P-B4-noinline', !all.includes('JVBERi'),
      `provider 请求零内联 PDF bytes（无 %PDF base64 前缀；缺口修复后防内联退回护栏）`)

    // soft：模型活轮 Read 页 3 回读 marker
    push('P-B5-vlread', snap.includes(PAGE3_MARKER) ? true : null,
      `VL 活轮回读页 3 marker（soft：${PAGE3_MARKER} ${snap.includes(PAGE3_MARKER) ? '在场' : '未见（采样面，桥断言不依赖）'}）`, false)
  } catch (e) {
    push('P-B0-fatal', false, `fatal: ${(e as Error).message}`)
  } finally {
    pty?.kill()
    proxy.kill('SIGTERM')
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const result = {
    probe: 'tui-k5-pdfbridge-0184',
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
