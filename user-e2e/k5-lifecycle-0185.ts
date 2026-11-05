/**
 * 0.1.85 K5 补闭环 恢复/压缩/变更/删除 生命周期 hard 活探针（e2e lane，
 * gate 判据⑦ E 面；工单 docs/2026-11-02-p0-wave-0185-ticket.md §1-E：
 * 「resume/compact 真实生命周期至少覆盖一次重读与变更/deny 确定性用例」，
 * Review Focus 4：不能缓存过期页图替代重新授权）。
 *
 * 五段真实 TUI 生命周期（PTY，seeded 沙箱 → 8995 日志代理 → IFF 8999）：
 *   L1 @PDF 引用落盘（hard）：@marker.pdf round → .atlas 树 pdf_reference
 *        五字段投影 JSONL 在场 + 零 PDF 原始字节（C85-D 双车道放行面）。
 *   L2 /compact 重建（hard）：compact 后 provider 请求含 canonical 投影
 *        消息（'PDF file: ' 开头 text block + 四要素；collectPDFReference
 *        AttachmentsForCompact → formatPDFReferenceForModel）。
 *   L3 变更重读（hard）：覆写页 3 marker → ZULU-9081 → 模型 Read pages 3
 *        → 答含新 marker（过期缓存假答 ORION-7742 = 红）+ JPEG 线面在场。
 *   L4 删除显式失败（hard）：rm marker.pdf → Read 显式失败（无旧页图假
 *        答）+ 该轮零 JPEG 线。
 *   L5 resume 重建（hard）：TUI 退出 → `-c` continue 最近会话 → provider
 *        请求再含 canonical 投影消息（loadTranscriptFile → isTranscript
 *        Message attachment 支 → params attachment 投影）。两模式：
 *        默认全量（L5 = compact+resume 组合）；ATLAS_E2E_K5LIFE_RESUME_ONLY=1
 *        跳过 /compact（L5 = 工单命名 plain-resume 链，transcript 保留
 *        L1 attachment 记录）。断言一律结构判定（摘要逐字引语假绿勘误）。
 *
 * 隔离：沙箱 HOME（job-tmp，零写真实 ~/.atlas/~/.claude）；PTY 串行
 * （gateway 串行纪律）。
 * 用法：
 *   ATLAS_E2E_K5LIFE_REPO=<worktree 绝对路径> \
 *   ATLAS_E2E_K5LIFE_OUT=<输出目录> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/k5-lifecycle-0185.ts
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
  process.env.ATLAS_E2E_K5LIFE_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-085-face'
// 生产 lane 覆盖：npm 真实包直跑（ATLAS_E2E_K5LIFE_CMD='node <pkg>/dist/cli.js …'）
const CLI_CMD =
  process.env.ATLAS_E2E_K5LIFE_CMD ??
  `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`
const OUT =
  process.env.ATLAS_E2E_K5LIFE_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-085/k5life'
const PROXY_PORT = 8995
const PAGE3_MARKER_OLD = 'ORION-7742'
const PAGE3_MARKER_NEW = 'ZULU-9081'
// resume-only 变体（L5 裁定面）：跳过 /compact（L2），transcript 保留 L1
// attachment 记录 → -c resume 直测工单指名链 loadTranscriptFile →
// isTranscriptMessage attachment 支 → params attachment 投影。
const RESUME_ONLY = process.env.ATLAS_E2E_K5LIFE_RESUME_ONLY === '1'
const FOUR_ELEM = [
  'The content of this PDF is not attached to this message',
  'you MUST use the Read tool',
  'up to 20 pages per request',
]

// 结构判定（勘误：R3-full P-L5 摘要逐字引语假绿——compact 摘要可逐字引用
// 投影模板，文本 includes 无法区分；canonical 投影 = user 消息 text block
// 以 'PDF file: ' 开头且含四要素）。
function hasCanonicalProjection(body: string): boolean {
  try {
    const j = JSON.parse(body) as { messages?: unknown[] }
    const msgs = Array.isArray(j.messages) ? j.messages : []
    for (const m of msgs) {
      const mm = m as { role?: string, content?: unknown }
      if (mm.role !== 'user') continue
      const c = mm.content
      const texts: string[] =
        typeof c === 'string'
          ? [c]
          : Array.isArray(c)
            ? (c as Array<{ type?: string, text?: string }>)
                .filter((b) => b?.type === 'text')
                .map((b) => String(b.text ?? ''))
            : []
      for (const t of texts) {
        if (t.startsWith('PDF file: ') && FOUR_ELEM.every((e) => t.includes(e))) return true
      }
    }
  } catch {
    /* not JSON */
  }
  return false
}

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

// ── fixture / settings（同 0185 bridge）───────────────────────────────

function buildTextPdf(pages: string[]): Buffer {
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

const page3Old = () => buildTextPdf([
  'K5PDF page one ALPHA-1131',
  'K5PDF page two BRAVO-2242',
  `K5PDF page three ${PAGE3_MARKER_OLD}`,
])
const page3New = () => buildTextPdf([
  'K5PDF page one ALPHA-1131',
  'K5PDF page two BRAVO-2242',
  `K5PDF page three ${PAGE3_MARKER_NEW}`,
])

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
      try {
        readdirSync(p)
        stack.push(p)
      } catch {
        out.push(p)
      }
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

function bodiesHaveJpeg(bodies: string[]): boolean {
  return bodies.some((b) => b.includes('data:image/jpeg;base64,'))
}

function decodeJpegs(body: string): Buffer[] {
  const out: Buffer[] = []
  const re = /data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/g
  for (const m of body.matchAll(re)) {
    try {
      out.push(Buffer.from(m[1], 'base64'))
    } catch {
      out.push(Buffer.alloc(0))
    }
  }
  return out
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  const home = join(OUT, 'home')
  const work = join(OUT, 'work')
  const reqdir = join(OUT, 'req')
  mkdirSync(work, { recursive: true })
  writeFileSync(join(work, 'marker.pdf'), page3Old())
  seedHome(home)

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
  push('P-L0-proxy', proxyReady, proxyReady ? `${PROXY_PORT} 日志代理就绪` : '代理未就绪')

  const seqOf = (): number => {
    if (!existsSync(reqdir)) return 0
    const nums = readdirSync(reqdir)
      .filter((f) => f.endsWith('-meta.json'))
      .map((f) => Number(f.split('-')[0]))
    return nums.length ? Math.max(...nums) + 1 : 0
  }
  const readBodies = (fromSeq: number): string[] => {
    // 勘误（首跑全零假红）：meta 前缀必须用原始字符串（'001-body.bin'），
    // Number 化拼 '1-body.bin' 读空全部 body（084 原版即 raw 前缀）。
    const bodies: string[] = []
    if (!existsSync(reqdir)) return bodies
    const metas = readdirSync(reqdir)
      .filter((f) => f.endsWith('-meta.json'))
      .map((f) => ({ raw: f.split('-')[0], seq: Number(f.split('-')[0]) }))
      .filter(({ seq }) => seq >= fromSeq)
      .sort((a, b) => a.seq - b.seq)
    for (const { raw } of metas) {
      try {
        bodies.push(readFileSync(join(reqdir, `${raw}-body.bin`), 'utf8'))
      } catch {
        /* empty body */
      }
    }
    return bodies
  }

  let pty: InstanceType<typeof GenericPty> | null = null
  try {
    if (!proxyReady) throw new Error('proxy not ready')
    pty = await GenericPty.start({
      logPath: join(OUT, 'pty.log'),
      workspace: work,
      cmd: CLI_CMD,
      home,
      unset: ['CLAUDECODE'],
    })
    const ready = await toRepl(pty)
    push('P-L0-tui', ready, ready ? 'TUI REPL 就绪' : 'TUI 未就绪（见 pty.log）')
    if (!ready) throw new Error('TUI not ready')
    await sleep(1_000)

    // ── L1 @PDF 引用落盘 ──────────────────────────────────────────────
    pty.send('@marker.pdf What marker text appears on page 3? Use the Read tool with a page range to check.')
    const s1 = await pty.settleBytes(8_000, 300_000)
    writeFileSync(join(OUT, 'l1-snapshot.txt'), pty.text())
    push('P-L0-round1', s1.ok, `L1 round settle=${s1.ok} bytes=${s1.bytes}`)
    await sleep(1_500)
    let pdfBytes = false
    let fiveField = false
    for (const f of walkFiles(join(home, '.atlas'))) {
      if (!isDir(f)) {
        let s: string
        try {
          s = readFileSync(f, 'utf8')
        } catch {
          continue
        }
        if (s.includes('%PDF-') || s.includes('JVBERi')) pdfBytes = true
        for (const line of s.split('\n')) {
          if (line.includes('pdf_reference') && line.includes('"filename"') &&
              line.includes('"pageCount"') && line.includes('"fileSize"') &&
              line.includes('"displayPath"')) fiveField = true
        }
      }
    }
    push('P-L1-ref-persist', fiveField && !pdfBytes,
      `L1 @PDF → pdf_reference 五字段投影 JSONL 在场（零 PDF 原始字节；C85-D 双车道放行）`)

    // ── L2 /compact 重建（resume-only 模式跳过；L5 裁定变体）─────────────
    if (RESUME_ONLY) {
      push('P-L2-compact-rebuild', null, 'skipped（ATLAS_E2E_K5LIFE_RESUME_ONLY=1 变体）', false)
    } else {
      const seq2 = seqOf()
      pty.send('/compact')
      const s2 = await pty.settleBytes(8_000, 300_000)
      writeFileSync(join(OUT, 'l2-snapshot.txt'), pty.text())
      push('P-L0-compact', s2.ok, `L2 /compact settle=${s2.ok} bytes=${s2.bytes}`)
      await sleep(1_500)
      const b2 = readBodies(seq2).join('\n')
      const canonCompact = readBodies(seq2).some(hasCanonicalProjection)
      const compactHits = FOUR_ELEM.filter((t) => b2.includes(t)).length
      push('P-L2-compact-rebuild', canonCompact,
        `L2 /compact 后 provider 请求含 canonical 投影消息（'PDF file: ' 开头 + 四要素；文本命中 ${compactHits}/3 仅参考——摘要可逐字引语）= ${canonCompact}（collectPDFReferenceAttachmentsForCompact 重建挂载 → formatPDFReferenceForModel）`)
    }

    // ── L3 变更重读 ───────────────────────────────────────────────────
    const seq3 = seqOf()
    const t3Before = pty.text().length
    writeFileSync(join(work, 'marker.pdf'), page3New())
    await sleep(500)
    pty.send('The file changed on disk. Read marker.pdf again with the Read tool using pages "3-3" and report the exact marker text now on page 3.')
    const s3 = await pty.settleBytes(8_000, 300_000)
    writeFileSync(join(OUT, 'l3-snapshot.txt'), pty.text())
    push('P-L0-round3', s3.ok, `L3 round settle=${s3.ok} bytes=${s3.bytes}`)
    await sleep(1_500)
    const b3 = readBodies(seq3)
    const snap3 = pty.text().slice(t3Before) // round 增量（全量文本含 L1 旧答，勘误面）
    const jpeg3 = bodiesHaveJpeg(b3)
    const answeredNew = snap3.includes(PAGE3_MARKER_NEW)
    const answeredStale = snap3.includes(PAGE3_MARKER_OLD)
    push('P-L3-jpeg-wire', jpeg3,
      `L3 变更重读 JPEG 线面在场（重新授权重读，非缓存页图）`)
    // 勘误（R3）：delta 含屏上历史/摘要区旧 marker 命中（含合法对比提及
    // 「changed from the previous ORION-7742」）→ 过期假答仅当旧 marker
    // 在场且新 marker 缺席（= 以旧充新）。
    push('P-L3-new-marker', answeredNew,
      `L3 答含新 marker ${PAGE3_MARKER_NEW}=${answeredNew}（变更后重读新内容；旧 marker 对比提及=合法，以旧充新才红）`)

    // ── L4 删除显式失败 ───────────────────────────────────────────────
    const seq4 = seqOf()
    const t4Before = pty.text().length
    rmSync(join(work, 'marker.pdf'))
    pty.send('The file was deleted. Try to Read marker.pdf with pages "3-3" anyway and report exactly what happens.')
    const s4 = await pty.settleBytes(8_000, 300_000)
    writeFileSync(join(OUT, 'l4-snapshot.txt'), pty.text())
    push('P-L0-round4', s4.ok, `L4 round settle=${s4.ok} bytes=${s4.bytes}`)
    await sleep(1_500)
    const b4 = readBodies(seq4)
    const snap4 = pty.text().slice(t4Before) // round 增量（全量含早轮错误提及，勘误面）
    const failMentioned = /No such|not exist|does not exist|Error|failed|无法|不存在|失败/i.test(snap4)
    // 勘误（run2 假红）：L4 轮请求体把 L3 的补充图作为会话历史携带（非本轮
    // 新投递），「零 JPEG」过强；正确断言 = 相对 L4 前全部历史无「新增」JPEG。
    const fullBodies = readBodies(0)
    const priorBodies = fullBodies.slice(0, Math.max(0, fullBodies.length - b4.length))
    const priorJpegs = new Set(decodeJpegs(priorBodies.join('\n')).map((b) => b.toString('base64')))
    const newJpeg = decodeJpegs(b4.join('\n')).some((b) => !priorJpegs.has(b.toString('base64')))
    push('P-L4-delete-fail', failMentioned && !newJpeg,
      `L4 删除后 Read 显式失败（错误提及=${failMentioned}）+ 该轮零新增 JPEG（历史携带除外；无旧页图假答）`)

    // ── L5 resume 重建 ────────────────────────────────────────────────
    pty.kill()
    pty = null
    await sleep(2_000)
    const seq5 = seqOf()
    pty = await GenericPty.start({
      logPath: join(OUT, 'pty-resume.log'),
      workspace: work,
      cmd: `${CLI_CMD} --continue`,
      home,
      unset: ['CLAUDECODE'],
    })
    const ready2 = await toRepl(pty)
    push('P-L0-tui-resume', ready2, ready2 ? 'resume TUI 就绪' : 'resume TUI 未就绪（见 pty-resume.log）')
    if (!ready2) throw new Error('resume TUI not ready')
    await sleep(1_000)
    const t5Before = pty.text().length
    pty.send('Earlier in this session I referenced a PDF. Read its page 1 with the Read tool using pages "1-1" and report the exact text line on that page.')
    const s5 = await pty.settleBytes(8_000, 300_000)
    writeFileSync(join(OUT, 'l5-snapshot.txt'), pty.text())
    push('P-L0-round5', s5.ok, `L5 round settle=${s5.ok} bytes=${s5.bytes}`)
    await sleep(1_500)
    const b5 = readBodies(seq5).join('\n')
    const canonResume = readBodies(seq5).some(hasCanonicalProjection)
    const resumeHits = FOUR_ELEM.filter((t) => b5.includes(t)).length
    push('P-L5-resume-rebuild', canonResume,
      `L5 resume 后 provider 请求含 canonical 投影消息（'PDF file: ' 开头 + 四要素）= ${canonResume}（文本命中 ${resumeHits}/3 仅参考——摘要逐字引语假绿 R3 勘误；loadTranscriptFile → attachment 支 → params attachment 投影）`)
    const snap5 = pty.text().slice(t5Before)
    push('P-L5-page1-read', snap5.includes('ALPHA-1131') ? true : null,
      `L5 VL 重读页 1 答 ${'ALPHA-1131'}（soft：采样面；resume 断言不依赖）`, false)
  } catch (e) {
    push('P-L0-fatal', false, `fatal: ${(e as Error).message}`)
  } finally {
    pty?.kill()
    proxy.kill('SIGTERM')
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const result = {
    probe: 'k5-lifecycle-0185',
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
