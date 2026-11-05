/**
 * 0.1.84 V3-5 K5 headless 活轮探针（e2e lane，gate 判据⑦ K5 live rounds；
 * 工单 docs/2026-11-01-p0-wave-0184-ticket.md §1F headless 面：显式 Read 的
 * headless 活路径承载）。
 *
 * 三轮 `node dist/cli.js -p`（生产 artifact = 波面确定性构建，sha256
 * 3f1bcd8c…eaf7 与 token 面银行构建同值）+ 沙箱 HOME（seeded → 8998 日志
 * 代理 → IFF 8999，Qwen38-27B-VL 显式）：
 *   R-H1 UTF-16LE 活读（hard）：K5-3 decodeTextLosslessly —— Read utf16le.txt
 *        → 模型答含 MARKER-9917 + provider 请求体含解码后中文（BOM 剥离
 *        utf16le→utf8 达线直证）
 *   R-H2 allow_large 全量活读（hard）：K5-5 —— Read large.txt allow_large=true
 *        → 模型答含末行 K5-LARGE-END-MARKER-3350 + provider 请求体含该
 *        marker（全量内容达线，非截断）
 *   R-H3 PDF 页读工具面（hard）：K5-6/K5-1 面 —— Read marker.pdf pages 3-3
 *        → 会话 JSONL 含「PDF pages extracted: 1 page(s)」+ 沙箱 HOME
 *        tool-results 根下 pdf-* 叶目录含 .jpg 页图（pdftoppm 实跑 +
 *        mkdtemp 0700 安全根活面）+ 进程零崩。
 *        内容回读 ORION-7742 soft（既有 Gap B：sharp/image-processor-napi
 *        未随包 → 页图→image blocks 构造断链，模型只得 header；登记非
 *        本波回归，见 gate 报告）
 *
 * 隔离：沙箱 HOME（job-tmp，零写真实 ~/.atlas/~/.claude）；fixture OUT 自建；
 * 三轮串行（gateway 串行纪律）。
 * 用法：
 *   ATLAS_E2E_K5HEAD_REPO=<worktree 绝对路径> \
 *   ATLAS_E2E_K5HEAD_OUT=<输出目录> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/k5-headless-rounds-0184.ts
 */
import { spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { sleep } from './lib/util'

const REPO =
  process.env.ATLAS_E2E_K5HEAD_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-084-face'
const OUT =
  process.env.ATLAS_E2E_K5HEAD_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-084/k5head'
const PROXY_PORT = 8997
const UTF16_MARKER = 'MARKER-9917'
const LARGE_MARKER = 'K5-LARGE-END-MARKER-3350'
const PDF_MARKER = 'ORION-7742'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

// ── fixture（与 tui-k5-pdfbridge-0184.ts 同款）────────────────────────

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
      `K5PDF page three ${PDF_MARKER}`,
    ]),
  )
  const leText = 'K5-UTF16LE 奔腾标记 MARKER-9917\r\nsecond line 中文\r\n'
  writeFileSync(
    join(work, 'utf16le.txt'),
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(leText, 'utf16le')]),
  )
  const lines: string[] = []
  for (let i = 0; i < 6200; i++) {
    lines.push(`line ${i} the quick brown fox jumps over the lazy dog padding ${i}`)
  }
  lines.push(LARGE_MARKER)
  writeFileSync(join(work, 'large.txt'), lines.join('\n'))
}

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

/** 收集目录下全部请求体为一个字符串（按序号）。 */
function readBodies(reqdir: string): string {
  const parts: string[] = []
  if (!existsSync(reqdir)) return ''
  for (const m of readdirSync(reqdir).filter((f) => f.endsWith('-meta.json')).sort()) {
    try {
      parts.push(readFileSync(join(reqdir, `${m.split('-')[0]}-body.bin`), 'utf8'))
    } catch {
      /* empty body */
    }
  }
  return parts.join('\n')
}

/** 跑一轮 headless -p。返回 { code, stdout }。 */
function runRound(
  cli: string,
  work: string,
  home: string,
  prompt: string,
): Promise<{ code: number | null, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [cli, '-p', prompt, '--dangerously-skip-permissions'], {
      cwd: work,
      env: { ...process.env, HOME: home, DISABLE_AUTOUPDATER: '1' },
    })
    // 勘误（run1）：stdin 管道不关 → CLI 完答后事件循环悬挂 → 本探针 420s
    // SIGKILL 兜底误触 → close(code=null) 假红（成功轮 </dev/null 实证
    // exit=0 + [atlas][exit] code=0；本探针 stdin.end() = 同一 EOF 语义）
    child.stdin?.end()
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }, 420_000).unref()
  })
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  const home = join(OUT, 'home')
  const work = join(OUT, 'work')
  mkdirSync(work, { recursive: true })
  writeFixtures(work)
  seedHome(home)
  const cli = join(REPO, 'dist', 'cli.js')

  const proxy: ChildProcess = spawn('python3', [
    '/home/vince/projects/AtlasCode/user-e2e/k5-bridge-proxy.py',
    '--port', String(PROXY_PORT),
    '--upstream', '127.0.0.1:8999',
    '--logdir', join(OUT, 'req'),
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
  push('P-H0-proxy', proxyReady, proxyReady ? '8997 日志代理就绪' : '代理未就绪')
  if (!proxyReady) {
    finish(proxy)
    return
  }

  // ── R-H1 UTF-16LE ───────────────────────────────────────────────────
  {
    const r = await runRound(
      cli, work, home,
      'Read the file utf16le.txt with the Read tool, then quote the exact marker text on line 1. Reply with just that line verbatim.',
    )
    writeFileSync(join(OUT, 'rh1-stdout.txt'), r.stdout)
    writeFileSync(join(OUT, 'rh1-stderr.txt'), r.stderr)
    const bodies = readBodies(join(OUT, 'req'))
    const answerOk = r.stdout.includes(UTF16_MARKER)
    const wireOk = bodies.includes(UTF16_MARKER) && bodies.includes('奔腾标记')
    push('P-H0-rh1-exit', r.code === 0, `R-H1 退出码 ${r.code}`)
    push('P-H1-utf16le-answer', answerOk,
      `模型答含 ${UTF16_MARKER}（K5-3 decodeTextLosslessly 活读）`)
    push('P-H1-utf16le-wire', wireOk,
      `provider 请求体含解码后文本（MARKER-9917 + 中文达线 = utf16le→utf8 无 BOM 直证）`)
  }

  // ── R-H2 allow_large ────────────────────────────────────────────────
  {
    const r = await runRound(
      cli, work, home,
      'Read the entire file large.txt in one Read tool call with allow_large set to true, then quote its final line exactly. Reply with just that final line.',
    )
    writeFileSync(join(OUT, 'rh2-stdout.txt'), r.stdout)
    writeFileSync(join(OUT, 'rh2-stderr.txt'), r.stderr)
    const bodies = readBodies(join(OUT, 'req'))
    const answerOk = r.stdout.includes(LARGE_MARKER)
    const wireOk = bodies.includes(LARGE_MARKER)
    push('P-H0-rh2-exit', r.code === 0, `R-H2 退出码 ${r.code}`)
    push('P-H2-large-answer', answerOk,
      `模型答含末行 ${LARGE_MARKER}（K5-5 allow_large 全量活读）`)
    push('P-H2-large-wire', wireOk,
      `provider 请求体含 ${LARGE_MARKER}（全量内容达线非截断）`)
  }

  // ── R-H3 PDF 页读工具面 ─────────────────────────────────────────────
  {
    // K5-6 输出根 = os.tmpdir() per-UID（/tmp/.atlas-<uid>/tool-results，设计面
    // 非 HOME 树——run1 勘误：HOME 树断言错位假红）。快照差分定位本轮新叶目录。
    const trRoot = join('/tmp', `.atlas-${process.getuid?.() ?? 0}`, 'tool-results')
    const before = new Set(existsSync(trRoot) ? readdirSync(trRoot) : [])
    const r = await runRound(
      cli, work, home,
      'Read the file marker.pdf with the Read tool using pages "3-3", then report exactly what the tool returned.',
    )
    writeFileSync(join(OUT, 'rh3-stdout.txt'), r.stdout)
    writeFileSync(join(OUT, 'rh3-stderr.txt'), r.stderr)
    // 会话 JSONL：工具面 header 在场
    let jsonlToolFace = false
    const projRoot = join(home, '.atlas', 'projects')
    for (const f of findAllFiles(projRoot, (p) => p.endsWith('.jsonl'))) {
      if (readFileSync(f, 'utf8').includes('PDF pages extracted: 1 page(s)')) {
        jsonlToolFace = true
        break
      }
    }
    // K5-6 安全根活面：本轮新建 pdf-* 叶目录含页图 + mkdtemp 0700
    let newDir: string | null = null
    let jpgOk = false
    let mode0700 = false
    try {
      for (const e of readdirSync(trRoot)) {
        if (!before.has(e) && e.startsWith('pdf-')) {
          const d = join(trRoot, e)
          newDir = d
          jpgOk = readdirSync(d).some((f) => f.endsWith('.jpg'))
          mode0700 = (statSync(d).mode & 0o777) === 0o700
          break
        }
      }
    } catch {
      /* root missing */
    }
    push('P-H0-rh3-exit', r.code === 0, `R-H3 退出码 ${r.code}`)
    push('P-H3-pdf-toolface', jsonlToolFace,
      `会话 JSONL 含「PDF pages extracted: 1 page(s)」（pdftoppm 实跑工具面）`)
    push('P-H3-pdf-secureroot', newDir !== null && jpgOk && mode0700,
      newDir
        ? `本轮新叶目录 ${newDir} 页图在场=${jpgOk} mode0700=${mode0700}（mkdtemp 安全根活面）`
        : 'tool-results 根未见本轮新 pdf-* 叶目录')
    push('P-H3-pdf-content', r.stdout.includes(PDF_MARKER) ? true : null,
      `模型答含 ${PDF_MARKER}（soft：页图→image blocks 既有 Gap B 断链，模型只得 header；${r.stdout.includes(PDF_MARKER) ? '在场' : '未见（登记非本波回归）'}）`, false)
  }

  finish(proxy)
}

function findAllFiles(root: string, pred: (p: string) => boolean): string[] {
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
        if (pred(p)) out.push(p)
      }
    }
  }
  return out
}

function finish(proxy: ChildProcess): void {
  proxy.kill('SIGTERM')
  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const result = {
    probe: 'k5-headless-rounds-0184',
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
