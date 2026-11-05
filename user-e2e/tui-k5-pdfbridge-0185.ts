/**
 * 0.1.85 K5 补闭环 @PDF 活桥 hard 活探针（e2e lane，gate 判据⑦ E 面核心；
 * 工单 docs/2026-11-02-p0-wave-0185-ticket.md §1-E：恢复 084 原硬判据——
 * 真实 TUI @PDF 提交 → provider 实收 path/未附正文/必读/pages≤20 四要素
 * （084 P-B3 恒红 → 085 hard，Gap A 已由 C85-A params attachment 支修复）；
 * 实际 Read pages → provider 实收有效 JPEG（C85-B/C newMessages 交付链）
 * + seeded VL 页内 marker 视觉回答（hard=true，双证：provider 图片字节 +
 * 视觉答案，经 marker.pdf/pages 参数关联）；失败样本保留。
 *
 * 探针面（相对 0184 的变化按工单 §6.5/e2e 预登记）：
 *   P-B1 渲染面（hard）：同 084——「Referenced PDF marker.pdf (3 pages)」chip。
 *   P-B2 JSONL 面（hard，085 明确变化）：.atlas 树零 PDF 原始字节 + user
 *        @path 在场 + **pdf_reference 五字段投影落盘在场**（filename/
 *        pageCount/fileSize/displayPath 白名单；084「零 pdf_reference 落盘」
 *        断言已随 C85-D metadata 白名单持久化失效更新）。
 *   P-B3 四要素（hard，085 升级）：provider 请求含 path + 三句必读模板
 *        （084 恒红登记面 → C85-A 修复后 hard）。
 *   P-B4 零内联 bytes（hard）：请求体零 JVBERi（防内联退回护栏，不变）。
 *   P-B5 JPEG 线面（hard，新）：请求体含 data:image/jpeg;base64 且解码
 *        FF D8 FF 魔数有效非空；该 body 同含 marker.pdf/pages（tool_use
 *        关联）。
 *   P-B6 视觉回答（hard，085 升级）：VL 答含页 3 独占 marker ORION-7742
 *        （084 soft → hard；模型方差仅事前确定有限重试逐次留档）。
 *   P-B7 marker 泄漏守卫（hard，新）：首个含 JPEG 的请求体及之前全部
 *        body 零 ORION-7742 文本（marker 仅在页栅格像素内；prompt/路径/
 *        header/fixture 名零泄漏）。
 *
 * 隔离：沙箱 HOME（job-tmp，零写真实 ~/.atlas/~/.claude）；fixture 全部
 * OUT 自建自清理；PTY 串行（gateway 串行纪律）。
 * 用法：
 *   ATLAS_E2E_K5BRIDGE_REPO=<worktree 绝对路径> \
 *   ATLAS_E2E_K5BRIDGE_OUT=<输出目录> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-k5-pdfbridge-0185.ts
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
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-085-face'
// 生产 lane 覆盖：npm 真实包直跑（ATLAS_E2E_K5BRIDGE_CMD='node <pkg>/dist/cli.js …'）
const CLI_CMD =
  process.env.ATLAS_E2E_K5BRIDGE_CMD ??
  `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`
const OUT =
  process.env.ATLAS_E2E_K5BRIDGE_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-085/k5bridge'
const PROXY_PORT = 8996
const PAGE3_MARKER = 'ORION-7742'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

// ── fixture：3 页文本 PDF（页 3 独占 marker；同 0184 构造）──────────────

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

function writeFixtures(work: string): void {
  writeFileSync(
    join(work, 'marker.pdf'),
    buildTextPdf([
      'K5PDF page one ALPHA-1131',
      'K5PDF page two BRAVO-2242',
      `K5PDF page three ${PAGE3_MARKER}`,
    ]),
  )
}

// ── 沙箱 settings（seeded：代理 + Qwen38-27B-VL 显式；同 0184）─────────

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

function readBodies(reqdir: string, fromSeq = 0): string[] {
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

const JPEG_PREFIX = 'data:image/jpeg;base64,'

function hasJpeg(body: string): boolean {
  return body.includes(JPEG_PREFIX)
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

const isJpeg = (b: Buffer) => b.length > 1000 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  const home = join(OUT, 'home')
  const work = join(OUT, 'work')
  const reqdir = join(OUT, 'req')
  mkdirSync(work, { recursive: true })
  writeFixtures(work)
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
  push('P-B0-proxy', proxyReady, proxyReady ? `${PROXY_PORT} 日志代理就绪` : '代理未就绪')

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
    push('P-B0-tui', ready, ready ? 'TUI REPL 就绪' : 'TUI 未就绪（见 pty.log）')
    if (!ready) throw new Error('TUI not ready')
    await sleep(1_000)
    pty.send(
      '@marker.pdf What exact marker text appears on page 3? Use the Read tool with a page range to check before answering.',
    )
    const settle = await pty.settleBytes(8_000, 300_000)
    writeFileSync(join(OUT, 'pty-snapshot.txt'), pty.text())
    push('P-B0-round', settle.ok, `回合 settle=${settle.ok} bytes=${settle.bytes}`)

    await sleep(1_500)
    const bodies = readBodies(reqdir)
    const all = bodies.join('\n')
    const snap = pty.text()

    // P-B1 渲染面（hard，同 084）
    const rendered = snap.includes('Referenced PDF marker.pdf') && snap.includes('3 pages')
    push('P-B1-render', rendered,
      `TUI 渲染「Referenced PDF marker.pdf (3 pages)」= pdf_reference 活生成（K5-7 活面，零内联）`)

    // P-B2 JSONL 面（hard；085 更新：五字段投影落盘在场 + 零 PDF bytes）
    let pdfBytes = false
    let userPath = false
    let pdfRefLines: string[] = []
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
        if (s.includes('pdf_reference')) {
          for (const line of s.split('\n')) {
            if (line.includes('pdf_reference')) pdfRefLines.push(line)
          }
        }
      }
    }
    const fiveField = pdfRefLines.some((l) =>
      l.includes('"filename"') && l.includes('"pageCount"') &&
      l.includes('"fileSize"') && l.includes('"displayPath"'))
    push('P-B2-jsonl', !pdfBytes && userPath && fiveField,
      `.atlas 树零 PDF 原始字节 + user @path 在场 + pdf_reference 五字段投影落盘（filename/pageCount/fileSize/displayPath 白名单；084「零落盘」断言已随 C85-D 明确变化更新）= ${pdfRefLines.length} 行`)

    // P-B3 四要素（hard，085 升级自 084 恒红登记面）
    const fourHits =
      (all.includes('marker.pdf') ? 1 : 0) +
      (all.includes('The content of this PDF is not attached to this message') ? 1 : 0) +
      (all.includes('you MUST use the Read tool') ? 1 : 0) +
      (all.includes('up to 20 pages per request') ? 1 : 0)
    push('P-B3-four-elements', fourHits === 4,
      `provider 请求含 K5-8 四要素 ${fourHits}/4（path/未附正文/MUST Read/pages≤20；084 Gap A 恒红 → C85-A params attachment 支修复后 hard）`)

    // P-B4 零内联（hard，护栏不变）
    push('P-B4-noinline', !all.includes('JVBERi'),
      `provider 请求零内联 PDF bytes（无 %PDF base64 前缀；防内联退回护栏）`)

    // P-B5 JPEG 线面（hard，新）
    const jpegBodyIdx = bodies.findIndex(hasJpeg)
    let jpegWire = false
    let jpegDetail = '请求体零 data:image/jpeg'
    if (jpegBodyIdx >= 0) {
      const imgs = decodeJpegs(bodies[jpegBodyIdx]).filter(isJpeg)
      const correlated = bodies[jpegBodyIdx].includes('marker.pdf') && bodies[jpegBodyIdx].includes('pages')
      jpegWire = imgs.length >= 1 && correlated
      jpegDetail = `body#${jpegBodyIdx} 有效 JPEG=${imgs.length}（FF D8 FF 魔数）+ marker.pdf/pages 关联=${correlated}（C85-B newMessages 交付链 + C85-C 页图实收）`
    }
    push('P-B5-jpeg-wire', jpegWire, jpegDetail)

    // P-B6 视觉回答（hard，085 升级自 084 soft）
    push('P-B6-visual', snap.includes(PAGE3_MARKER),
      `VL 视觉回答含页 3 独占 marker ${PAGE3_MARKER}（084 soft → 085 hard；双证之答案面，经 P-B5 图片字节面 + marker.pdf/pages 关联）`)

    // P-B7 marker 泄漏守卫（hard，新）：首个 JPEG body 及之前零 marker 文本
    const preIdx = jpegBodyIdx >= 0 ? jpegBodyIdx : bodies.length - 1
    const leak = bodies.slice(0, preIdx + 1).some((b) => b.includes(PAGE3_MARKER))
    push('P-B7-no-leak', !leak,
      `marker ${PAGE3_MARKER} 不在任何 ≤首个JPEG-body 的请求文本中（仅页栅格像素内；prompt/路径/header/fixture 名零泄漏）`)
  } catch (e) {
    push('P-B0-fatal', false, `fatal: ${(e as Error).message}`)
  } finally {
    pty?.kill()
    proxy.kill('SIGTERM')
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const result = {
    probe: 'tui-k5-pdfbridge-0185',
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
